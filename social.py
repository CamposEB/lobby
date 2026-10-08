# social.py — camada de rede social da comunidade
#
# Seguir/seguidores, posts, curtidas, republicações, comentários e feed de
# notificações. Este módulo não importa o server.py (evita import circular):
# o server.py chama `social.init(...)` passando db, send, online e helpers.
#
# Convenções:
#   * Todas as mensagens servidor → cliente têm prefixo "social_".
#   * SQL portável (placeholders "?" como no resto do server.py).
#   * Notificações ficam no banco (chegam mesmo se a pessoa estava offline).
import json
import re
import time

# ───────────────────────── limites ─────────────────────────
POST_MAX_CHARS = 500
COMMENT_MAX_CHARS = 300
POSTS_PAGE = 15
COMMENTS_PAGE = 50
LIST_PAGE = 100
NOTIFS_PAGE = 40
POST_COOLDOWN = 20            # segundos entre posts
POSTS_PER_DAY = 30
COMMENT_COOLDOWN = 3
FANOUT_LIMIT = 500            # máx. de pessoas notificadas por post
NOTIF_KEEP_PER_USER = 200
REPOST_COOLDOWN = 2

POST_IMAGE_RE = re.compile(
    r"^/static/uploads/posts/[0-9a-f]{32}\.(?:jpg|jpeg|png|gif|webp)$")

WS_TYPES = {
    "follow", "unfollow", "social_list",
    "post_create", "post_delete", "post_like", "post_repost",
    "post_comment", "post_comments", "comment_delete", "posts_list",
    "notifs_list", "notifs_read", "notif_prefs",
}

# ───────────────────────── injeção de dependências ─────────────────────────
_db = None
_send = None
_online = None
_get_user = None
_friendship_status = None
_user_card = None
_role_for = None

_last_post = {}
_last_comment = {}
_last_repost = {}


def init(db, send, online, get_user, friendship_status, user_card, role_for=None):
    global _db, _send, _online, _get_user, _friendship_status, _user_card, _role_for
    _db, _send, _online = db, send, online
    _get_user, _friendship_status, _user_card = get_user, friendship_status, user_card
    _role_for = role_for
    ensure_tables()


# ───────────────────────── tabelas ─────────────────────────
def ensure_tables():
    stmts = [
        "CREATE TABLE IF NOT EXISTS follows ("
        "follower TEXT NOT NULL, followee TEXT NOT NULL, "
        "created_at DOUBLE PRECISION NOT NULL, "
        "PRIMARY KEY (follower, followee))",
        "CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee)",
        "CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower)",

        "CREATE TABLE IF NOT EXISTS posts ("
        "id BIGSERIAL PRIMARY KEY, author TEXT NOT NULL, body TEXT NOT NULL, "
        "image TEXT NOT NULL DEFAULT '', "
        "created_at DOUBLE PRECISION NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)",
        "CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author, created_at)",

        "CREATE TABLE IF NOT EXISTS post_likes ("
        "post_id BIGINT NOT NULL, nick TEXT NOT NULL, "
        "created_at DOUBLE PRECISION NOT NULL, PRIMARY KEY (post_id, nick))",
        "CREATE INDEX IF NOT EXISTS idx_post_likes_post ON post_likes(post_id)",

        "CREATE TABLE IF NOT EXISTS reposts ("
        "post_id BIGINT NOT NULL, nick TEXT NOT NULL, "
        "created_at DOUBLE PRECISION NOT NULL, PRIMARY KEY (post_id, nick))",
        "CREATE INDEX IF NOT EXISTS idx_reposts_nick ON reposts(nick, created_at)",
        "CREATE INDEX IF NOT EXISTS idx_reposts_post ON reposts(post_id)",

        "CREATE TABLE IF NOT EXISTS post_comments ("
        "id BIGSERIAL PRIMARY KEY, post_id BIGINT NOT NULL, author TEXT NOT NULL, "
        "body TEXT NOT NULL, created_at DOUBLE PRECISION NOT NULL, "
        "deleted INTEGER NOT NULL DEFAULT 0)",
        "CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id, created_at)",

        "CREATE TABLE IF NOT EXISTS notifications ("
        "id BIGSERIAL PRIMARY KEY, nick TEXT NOT NULL, kind TEXT NOT NULL, "
        "actor TEXT NOT NULL, post_id BIGINT, "
        "created_at DOUBLE PRECISION NOT NULL, is_read INTEGER NOT NULL DEFAULT 0)",
        "CREATE INDEX IF NOT EXISTS idx_notifications_nick ON notifications(nick, created_at)",
    ]
    try:
        for s in stmts:
            _db.execute(s)
        _db.commit()
        print("✅ Tabelas sociais prontas (follows, posts, likes, reposts, comentários, notificações).")
    except Exception as exc:
        print(f"⚠️  Falha ao garantir tabelas sociais: {exc}")


# ───────────────────────── helpers ─────────────────────────
def _clean_nick(value):
    return str(value or "").strip().lower()


def _user_exists(nick):
    return bool(nick) and _get_user(nick) is not None


def _profile_data(nick):
    u = _get_user(nick)
    if not u:
        return {}
    try:
        return json.loads(u["profile_data"] or "{}")
    except Exception:
        return {}


def _visibility(nick):
    data = _profile_data(nick)
    vis = data.get("visibility")
    if vis in ("public", "friends", "private"):
        return vis
    return "private" if data.get("is_private") else "public"


def can_view_posts(viewer, owner):
    """Posts seguem a visibilidade do perfil: público / amigos / privado."""
    if viewer and viewer == owner:
        return True
    vis = _visibility(owner)
    if vis == "public":
        return True
    if vis == "friends":
        return bool(viewer) and _friendship_status(viewer, owner) == "friends"
    return False


def _scalar(sql, params=()):
    row = _db.execute(sql, params).fetchone()
    return int(row[0]) if row and row[0] is not None else 0


def social_counts(nick, viewer=None):
    """Contadores exibidos no perfil + estado de relação com quem está vendo."""
    friends = _scalar(
        "SELECT COUNT(*) FROM friendships WHERE status='accepted' "
        "AND (requester=? OR addressee=?)", (nick, nick))
    out = {
        "friends": friends,
        "followers": _scalar("SELECT COUNT(*) FROM follows WHERE followee=?", (nick,)),
        "following": _scalar("SELECT COUNT(*) FROM follows WHERE follower=?", (nick,)),
        "posts": _scalar("SELECT COUNT(*) FROM posts WHERE author=? AND deleted=0", (nick,)),
        "reposts": _scalar("SELECT COUNT(*) FROM reposts r JOIN posts p ON p.id=r.post_id "
                           "WHERE r.nick=? AND p.deleted=0", (nick,)),
        "is_following": False,
        "follows_you": False,
    }
    if viewer and viewer != nick:
        out["is_following"] = bool(_db.execute(
            "SELECT 1 FROM follows WHERE follower=? AND followee=?", (viewer, nick)).fetchone())
        out["follows_you"] = bool(_db.execute(
            "SELECT 1 FROM follows WHERE follower=? AND followee=?", (nick, viewer)).fetchone())
    return out


def _card(nick):
    card = _user_card(nick)
    if card:
        return card
    return {"nick": nick, "username": nick, "name": nick, "display_name": nick,
            "avatar": "", "online": False, "role": "user", "verified": False}


def _ref(cards, nick):
    """Registra o card do usuário uma única vez por resposta e devolve só o nick.
    (Avatares são base64 grandes: não devem se repetir em cada post/notificação.)"""
    if nick not in cards:
        cards[nick] = _card(nick)
    return nick


def _friend_nicks(nick):
    rows = _db.execute(
        "SELECT CASE WHEN requester=? THEN addressee ELSE requester END AS other "
        "FROM friendships WHERE status='accepted' AND (requester=? OR addressee=?)",
        (nick, nick, nick)).fetchall()
    return [r["other"] for r in rows]


def _follower_nicks(nick):
    rows = _db.execute("SELECT follower FROM follows WHERE followee=?", (nick,)).fetchall()
    return [r["follower"] for r in rows]


def _notify_posts_enabled(nick):
    return _profile_data(nick).get("notify_posts", True) is not False


# ───────────────────────── notificações ─────────────────────────
def _snippet(text, n=90):
    text = " ".join(str(text or "").split())
    return text if len(text) <= n else text[: n - 1] + "…"


def _notif_item(row, cards):
    post = None
    if row["post_id"] is not None:
        post = _db.execute(
            "SELECT id, author, body, image, deleted FROM posts WHERE id=?",
            (row["post_id"],)).fetchone()
        if not post or post["deleted"]:
            return None
    item = {
        "id": row["id"],
        "kind": row["kind"],
        "actor": _ref(cards, row["actor"]),
        "ts": row["created_at"],
        "read": bool(row["is_read"]),
        "post_id": None,
        "post_owner": None,
        "preview": "",
    }
    if post:
        item["post_id"] = post["id"]
        item["post_owner"] = post["author"]
        item["preview"] = _snippet(post["body"]) or ("📷 Imagem" if post["image"] else "")
    return item


def unread_count(nick):
    return _scalar(
        "SELECT COUNT(*) FROM notifications n LEFT JOIN posts p ON p.id=n.post_id "
        "WHERE n.nick=? AND n.is_read=0 AND (n.post_id IS NULL OR p.deleted=0)", (nick,))


def notifs_payload(nick):
    rows = _db.execute(
        "SELECT * FROM notifications WHERE nick=? ORDER BY created_at DESC LIMIT ?",
        (nick, NOTIFS_PAGE * 2)).fetchall()
    items, cards = [], {}
    for r in rows:
        it = _notif_item(r, cards)
        if it:
            items.append(it)
        if len(items) >= NOTIFS_PAGE:
            break
    return {"t": "social_notifs", "items": items, "cards": cards,
            "unread": unread_count(nick), "notify_posts": _notify_posts_enabled(nick)}


def _store_notification(recipient, kind, actor, post_id=None, dedupe=True):
    """Grava e devolve o id (ou None se ignorada)."""
    if not recipient or recipient == actor:
        return None
    now = time.time()
    if dedupe:
        # evita spam: mesma ação do mesmo ator sobre o mesmo alvo
        # (sem "? IS NULL": o PostgreSQL não consegue inferir o tipo de parâmetro nulo)
        if post_id is None:
            row = _db.execute(
                "SELECT id FROM notifications WHERE nick=? AND kind=? AND actor=? "
                "AND post_id IS NULL AND created_at>?",
                (recipient, kind, actor, now - 3600)).fetchone()
        else:
            row = _db.execute(
                "SELECT id FROM notifications WHERE nick=? AND kind=? AND actor=? "
                "AND post_id=? AND created_at>?",
                (recipient, kind, actor, post_id, now - 3600)).fetchone()
        if row:
            return None
    cur = _db.execute(
        "INSERT INTO notifications(nick, kind, actor, post_id, created_at, is_read) "
        "VALUES(?,?,?,?,?,0) RETURNING id", (recipient, kind, actor, post_id, now))
    new_id = cur.fetchone()[0]
    _db.execute(
        "DELETE FROM notifications WHERE nick=? AND id NOT IN "
        "(SELECT id FROM notifications WHERE nick=? ORDER BY created_at DESC LIMIT ?)",
        (recipient, recipient, NOTIF_KEEP_PER_USER))
    _db.commit()
    return new_id


async def _push_notification(recipient, notif_id):
    if not notif_id or recipient not in _online:
        return
    row = _db.execute("SELECT * FROM notifications WHERE id=?", (notif_id,)).fetchone()
    cards = {}
    item = _notif_item(row, cards) if row else None
    if item:
        await _send(recipient, {"t": "social_notif_new", "n": item, "cards": cards,
                                "unread": unread_count(recipient)})


async def notify(recipient, kind, actor, post_id=None, dedupe=True):
    nid = _store_notification(recipient, kind, actor, post_id, dedupe)
    await _push_notification(recipient, nid)


async def notify_friend_accepted(accepter, requester):
    """Chamado pelo server.py quando um pedido de amizade é aceito."""
    await notify(requester, "friend_accepted", accepter)


async def send_initial(nick):
    await _send(nick, notifs_payload(nick))


# ───────────────────────── seguir ─────────────────────────
async def _do_follow(nick, m):
    target = _clean_nick(m.get("nick"))
    if not target or target == nick or not _user_exists(target):
        await _send(nick, {"t": "social_error", "m": "Jogador inválido."})
        return
    _db.execute(
        "INSERT INTO follows(follower, followee, created_at) VALUES(?,?,?) "
        "ON CONFLICT DO NOTHING", (nick, target, time.time()))
    _db.commit()
    await notify(target, "follow", nick)
    await _after_follow_change(nick, target)


async def _do_unfollow(nick, m):
    target = _clean_nick(m.get("nick"))
    _db.execute("DELETE FROM follows WHERE follower=? AND followee=?", (nick, target))
    _db.commit()
    await _after_follow_change(nick, target)


async def _after_follow_change(actor, target):
    await _send(actor, {"t": "social_state", "nick": target,
                        "social": social_counts(target, actor)})
    await _send(actor, {"t": "social_state", "nick": actor,
                        "social": social_counts(actor, actor)})
    if target in _online:
        await _send(target, {"t": "social_state", "nick": target,
                             "social": social_counts(target, target)})


async def _do_social_list(nick, m):
    owner = _clean_nick(m.get("nick")) or nick
    kind = str(m.get("kind", ""))
    if not _user_exists(owner) or kind not in ("friends", "followers", "following"):
        return
    if kind == "friends":
        if not can_view_posts(nick, owner) and owner != nick:
            nicks = None
        else:
            nicks = _friend_nicks(owner)
    elif kind == "followers":
        nicks = _follower_nicks(owner)
    else:
        nicks = [r["followee"] for r in _db.execute(
            "SELECT followee FROM follows WHERE follower=? ORDER BY created_at DESC",
            (owner,)).fetchall()]
    if nicks is None:
        await _send(nick, {"t": "social_list", "nick": owner, "kind": kind,
                           "items": [], "hidden": True})
        return
    nicks = nicks[:LIST_PAGE]
    mine = {r["followee"] for r in _db.execute(
        "SELECT followee FROM follows WHERE follower=?", (nick,)).fetchall()}
    items = []
    for n in nicks:
        c = _card(n)
        c["is_following"] = n in mine
        c["friendship_status"] = _friendship_status(nick, n)
        c["is_self"] = n == nick
        items.append(c)
    await _send(nick, {"t": "social_list", "nick": owner, "kind": kind,
                       "items": items, "hidden": False})


# ───────────────────────── posts ─────────────────────────
def _post_row(post_id):
    return _db.execute("SELECT * FROM posts WHERE id=? AND deleted=0", (post_id,)).fetchone()


def _post_item(row, viewer, cards, repost_by=None, repost_ts=None):
    pid = row["id"]
    liked = bool(_db.execute(
        "SELECT 1 FROM post_likes WHERE post_id=? AND nick=?", (pid, viewer)).fetchone())
    reposted = bool(_db.execute(
        "SELECT 1 FROM reposts WHERE post_id=? AND nick=?", (pid, viewer)).fetchone())
    item = {
        "id": pid,
        "author": _ref(cards, row["author"]),
        "body": row["body"],
        "image": row["image"] or "",
        "ts": row["created_at"],
        "likes": _scalar("SELECT COUNT(*) FROM post_likes WHERE post_id=?", (pid,)),
        "reposts": _scalar("SELECT COUNT(*) FROM reposts WHERE post_id=?", (pid,)),
        "comments": _scalar(
            "SELECT COUNT(*) FROM post_comments WHERE post_id=? AND deleted=0", (pid,)),
        "liked": liked,
        "reposted": reposted,
        "mine": row["author"] == viewer,
    }
    if repost_by:
        item["repost_by"] = _ref(cards, repost_by)
        item["repost_ts"] = repost_ts
    return item


def _post_msg(msg_type, row, viewer):
    cards = {}
    return {"t": msg_type, "post": _post_item(row, viewer, cards), "cards": cards}


async def _do_post_create(nick, m):
    body = str(m.get("body", "")).replace("\r\n", "\n").strip()
    image = str(m.get("image", "") or "").strip()
    if len(body) > POST_MAX_CHARS:
        body = body[:POST_MAX_CHARS]
    if image and not POST_IMAGE_RE.match(image):
        await _send(nick, {"t": "social_error", "m": "Imagem inválida."})
        return
    if not body and not image:
        await _send(nick, {"t": "social_error", "m": "Escreva algo ou anexe uma imagem."})
        return
    now = time.time()
    if now - _last_post.get(nick, 0) < POST_COOLDOWN:
        wait = int(POST_COOLDOWN - (now - _last_post.get(nick, 0))) + 1
        await _send(nick, {"t": "social_error",
                           "m": f"Aguarde {wait}s para publicar de novo."})
        return
    if _scalar("SELECT COUNT(*) FROM posts WHERE author=? AND created_at>?",
               (nick, now - 86400)) >= POSTS_PER_DAY:
        await _send(nick, {"t": "social_error",
                           "m": "Você atingiu o limite de publicações de hoje."})
        return
    _last_post[nick] = now
    cur = _db.execute(
        "INSERT INTO posts(author, body, image, created_at, deleted) VALUES(?,?,?,?,0) "
        "RETURNING id", (nick, body, image, now))
    pid = cur.fetchone()[0]
    _db.commit()

    row = _post_row(pid)
    await _send(nick, _post_msg("social_post_created", row, nick))
    await _send(nick, {"t": "social_state", "nick": nick,
                       "social": social_counts(nick, nick)})

    # fan-out: amigos (post_friend) e seguidores (post_follow)
    if _visibility(nick) == "private":
        return
    friends = set(_friend_nicks(nick))
    followers = set(_follower_nicks(nick))
    if _visibility(nick) == "friends":
        followers = set()          # só amigos enxergam posts desse perfil
    recipients = [(n, "post_friend") for n in friends]
    recipients += [(n, "post_follow") for n in followers if n not in friends]
    for recipient, kind in recipients[:FANOUT_LIMIT]:
        if not _notify_posts_enabled(recipient):
            continue
        await notify(recipient, kind, nick, pid, dedupe=False)


async def _do_post_delete(nick, m):
    try:
        pid = int(m.get("id"))
    except (TypeError, ValueError):
        return
    row = _post_row(pid)
    if not row:
        return
    is_staff = bool(_role_for) and _role_for(nick) in ("mod", "admin", "dev")
    if row["author"] != nick and not is_staff:
        await _send(nick, {"t": "social_error", "m": "Você não pode excluir esta publicação."})
        return
    _db.execute("UPDATE posts SET deleted=1 WHERE id=?", (pid,))
    _db.commit()
    await _send(nick, {"t": "social_post_deleted", "id": pid})
    await _send(nick, {"t": "social_state", "nick": nick,
                       "social": social_counts(nick, nick)})
    if row["author"] != nick and row["author"] in _online:
        await _send(row["author"], {"t": "social_post_deleted", "id": pid})


async def _do_post_like(nick, m):
    try:
        pid = int(m.get("id"))
    except (TypeError, ValueError):
        return
    row = _post_row(pid)
    if not row or not can_view_posts(nick, row["author"]):
        return
    on = bool(m.get("on", True))
    if on:
        _db.execute("INSERT INTO post_likes(post_id, nick, created_at) VALUES(?,?,?) "
                    "ON CONFLICT DO NOTHING", (pid, nick, time.time()))
    else:
        _db.execute("DELETE FROM post_likes WHERE post_id=? AND nick=?", (pid, nick))
    _db.commit()
    await _send(nick, _post_msg("social_post_update", row, nick))
    if on:
        await notify(row["author"], "like", nick, pid)


async def _do_post_repost(nick, m):
    try:
        pid = int(m.get("id"))
    except (TypeError, ValueError):
        return
    row = _post_row(pid)
    if not row or not can_view_posts(nick, row["author"]):
        return
    on = bool(m.get("on", True))
    now = time.time()
    if on:
        if row["author"] == nick:
            await _send(nick, {"t": "social_error",
                               "m": "Você não pode republicar sua própria publicação."})
            return
        if now - _last_repost.get(nick, 0) < REPOST_COOLDOWN:
            return
        _last_repost[nick] = now
        _db.execute("INSERT INTO reposts(post_id, nick, created_at) VALUES(?,?,?) "
                    "ON CONFLICT DO NOTHING", (pid, nick, now))
    else:
        _db.execute("DELETE FROM reposts WHERE post_id=? AND nick=?", (pid, nick))
    _db.commit()
    await _send(nick, _post_msg("social_post_update", row, nick))
    await _send(nick, {"t": "social_state", "nick": nick,
                       "social": social_counts(nick, nick)})
    if on:
        await notify(row["author"], "repost", nick, pid)


async def _do_posts_list(nick, m):
    owner = _clean_nick(m.get("nick")) or nick
    tab = "reposts" if m.get("tab") == "reposts" else "posts"
    if not _user_exists(owner):
        return
    try:
        before = float(m.get("before")) if m.get("before") else None
    except (TypeError, ValueError):
        before = None
    base = {"t": "social_posts", "nick": owner, "tab": tab, "append": before is not None}
    if not can_view_posts(nick, owner):
        await _send(nick, {**base, "items": [], "more": False, "hidden": True})
        return

    items, more, cards = [], False, {}
    if tab == "posts":
        params = [owner]
        sql = "SELECT * FROM posts WHERE author=? AND deleted=0"
        if before:
            sql += " AND created_at<?"
            params.append(before)
        sql += " ORDER BY created_at DESC LIMIT ?"
        params.append(POSTS_PAGE + 1)
        rows = _db.execute(sql, tuple(params)).fetchall()
        more = len(rows) > POSTS_PAGE
        for r in rows[:POSTS_PAGE]:
            items.append(_post_item(r, nick, cards))
    else:
        params = [owner]
        sql = ("SELECT p.*, r.created_at AS rep_ts FROM reposts r "
               "JOIN posts p ON p.id=r.post_id WHERE r.nick=? AND p.deleted=0")
        if before:
            sql += " AND r.created_at<?"
            params.append(before)
        sql += " ORDER BY r.created_at DESC LIMIT ?"
        params.append(POSTS_PAGE + 1)
        rows = _db.execute(sql, tuple(params)).fetchall()
        more = len(rows) > POSTS_PAGE
        for r in rows[:POSTS_PAGE]:
            # o post original segue a visibilidade do autor original
            if not can_view_posts(nick, r["author"]):
                continue
            items.append(_post_item(r, nick, cards, repost_by=owner, repost_ts=r["rep_ts"]))
    await _send(nick, {**base, "items": items, "cards": cards, "more": more, "hidden": False})


# ───────────────────────── comentários ─────────────────────────
def _comment_item(row, viewer, post_author, cards):
    return {
        "id": row["id"],
        "post_id": row["post_id"],
        "author": _ref(cards, row["author"]),
        "body": row["body"],
        "ts": row["created_at"],
        "can_delete": row["author"] == viewer or post_author == viewer,
    }


async def _do_post_comments(nick, m):
    try:
        pid = int(m.get("id"))
    except (TypeError, ValueError):
        return
    row = _post_row(pid)
    if not row or not can_view_posts(nick, row["author"]):
        return
    rows = _db.execute(
        "SELECT * FROM post_comments WHERE post_id=? AND deleted=0 "
        "ORDER BY created_at ASC LIMIT ?", (pid, COMMENTS_PAGE)).fetchall()
    cards = {}
    await _send(nick, {"t": "social_comments", "post_id": pid, "cards": cards,
                       "items": [_comment_item(r, nick, row["author"], cards) for r in rows]})


async def _do_post_comment(nick, m):
    try:
        pid = int(m.get("id"))
    except (TypeError, ValueError):
        return
    body = " ".join(str(m.get("body", "")).split())[:COMMENT_MAX_CHARS]
    row = _post_row(pid)
    if not body or not row or not can_view_posts(nick, row["author"]):
        return
    now = time.time()
    if now - _last_comment.get(nick, 0) < COMMENT_COOLDOWN:
        await _send(nick, {"t": "social_error", "m": "Calma! Aguarde um instante para comentar."})
        return
    _last_comment[nick] = now
    _db.execute("INSERT INTO post_comments(post_id, author, body, created_at, deleted) "
                "VALUES(?,?,?,?,0)", (pid, nick, body, now))
    _db.commit()
    await _do_post_comments(nick, {"id": pid})
    await _send(nick, _post_msg("social_post_update", row, nick))
    await notify(row["author"], "comment", nick, pid, dedupe=False)


async def _do_comment_delete(nick, m):
    try:
        cid = int(m.get("id"))
    except (TypeError, ValueError):
        return
    c = _db.execute("SELECT * FROM post_comments WHERE id=? AND deleted=0", (cid,)).fetchone()
    if not c:
        return
    post = _db.execute("SELECT * FROM posts WHERE id=?", (c["post_id"],)).fetchone()
    if c["author"] != nick and (not post or post["author"] != nick):
        return
    _db.execute("UPDATE post_comments SET deleted=1 WHERE id=?", (cid,))
    _db.commit()
    await _do_post_comments(nick, {"id": c["post_id"]})
    row = _post_row(c["post_id"])
    if row:
        await _send(nick, _post_msg("social_post_update", row, nick))


# ───────────────────────── notificações (WS) ─────────────────────────
async def _do_notifs_read(nick, m):
    ids = m.get("ids")
    if isinstance(ids, list) and ids:
        clean = []
        for i in ids[:100]:
            try:
                clean.append(int(i))
            except (TypeError, ValueError):
                pass
        if clean:
            marks = ",".join("?" for _ in clean)
            _db.execute(f"UPDATE notifications SET is_read=1 WHERE nick=? AND id IN ({marks})",
                        (nick, *clean))
    else:
        _db.execute("UPDATE notifications SET is_read=1 WHERE nick=?", (nick,))
    _db.commit()
    await _send(nick, {"t": "social_unread", "unread": unread_count(nick)})


async def _do_notif_prefs(nick, m):
    u = _get_user(nick)
    if not u:
        return
    data = _profile_data(nick)
    data["notify_posts"] = bool(m.get("notify_posts", True))
    _db.execute("UPDATE users SET profile_data=? WHERE nick=?",
                (json.dumps(data, ensure_ascii=False), nick))
    _db.commit()
    await _send(nick, {"t": "social_prefs", "notify_posts": data["notify_posts"]})


# ───────────────────────── roteador ─────────────────────────
_HANDLERS = {
    "follow": _do_follow,
    "unfollow": _do_unfollow,
    "social_list": _do_social_list,
    "post_create": _do_post_create,
    "post_delete": _do_post_delete,
    "post_like": _do_post_like,
    "post_repost": _do_post_repost,
    "post_comment": _do_post_comment,
    "post_comments": _do_post_comments,
    "comment_delete": _do_comment_delete,
    "posts_list": _do_posts_list,
    "notifs_list": lambda nick, m: send_initial(nick),
    "notifs_read": _do_notifs_read,
    "notif_prefs": _do_notif_prefs,
}


async def handle(nick, m):
    """Retorna True se a mensagem era social (e foi tratada)."""
    handler = _HANDLERS.get(m.get("t"))
    if not handler:
        return False
    try:
        await handler(nick, m)
    except Exception as exc:               # nunca derruba o WebSocket
        print(f"⚠️ [social] erro em {m.get('t')}: {exc}")
        try:
            _db.rollback()
        except Exception:
            pass
        await _send(nick, {"t": "social_error", "m": "Não foi possível concluir a ação."})
    return True