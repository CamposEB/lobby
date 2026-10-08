# server.py — versão migrada para PostgreSQL (Supabase) via db.py
#
# Mudanças em relação ao original:
#   1. removido "sqlite3" dos imports
#   2. removido "import persistence"
#   3. adicionado "from db import connect as _connect_db"
#   4. removido o bloco de setup do SQLite
#   5. adicionado "db = _connect_db()" no lugar
#   6. lifespan não baixa/sobe mais backup
#   7. SESSION_SECRET ganhou fallback persistente
#   8. DM: mensagens retornam id e ts; handler dm_delete
#   9. Upload de anexos da DM + busca de usuários + lista de amigos
#  10. Upload aceita vídeo e limite 25 MB; dm_send 400 chars
#  11. profile() retorna "online"
#  12. Reações em DM
#  13. Proxy /api/img para imagens do CDN da Moonton
#  14. HIERARQUIA DE PAPÉIS: user < beta < streamer < vip < admin < mod < dev
#  15. Papéis no Supabase (fonte de verdade) com Firestore como espelho opcional
#  16. FIX: profile() não sobrescreve mais "role" (papel do sistema) com a função
#      de jogo — esta agora vem em "game_role"
#  17. SISTEMA DE AMIGOS + VISIBILIDADE public/friends/private
#  18. ⭐ FIX: ROLE_LABELS agora inclui beta/streamer/vip — antes esses cargos
#      caíam no "else" e apareciam como "MEMBRO" no perfil.
#  19. ⭐ FIX: _user_public_card e init do WS agora enviam flags is_vip /
#      is_streamer / is_beta para o frontend.
import asyncio, base64, datetime, hashlib, hmac, json, os, re, secrets, time, unicodedata, uuid
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Header, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from identity_store import IdentityError, identity_store
from db import connect as _connect_db

BOT_KEY = os.getenv("BOT_KEY", "").strip()
ALLOW_LEGACY_LOGIN = os.getenv("ALLOW_LEGACY_LOGIN", "true").strip().lower() in ("1", "true", "yes")

# ─── PAPÉIS ───
ADMIN_NICKS = {
    nick.strip().lower()
    for nick in os.getenv("LOBBY_ADMIN_NICKS", "").split(",")
    if nick.strip()
}
DEV_NICKS = {
    nick.strip().lower()
    for nick in os.getenv("LOBBY_DEV_NICKS", "").split(",")
    if nick.strip()
}
if not DEV_NICKS:
    DEV_NICKS = set(ADMIN_NICKS)

VALID_ROLES = ("user", "beta", "streamer", "vip", "admin", "mod", "dev")
VALID_VISIBILITIES = ("public", "friends", "private")

MUTE_ACTIONS = {"mute_10m", "mute_1h", "mute_24h"}
STATUS_BY_ACTION = {"review": "reviewed", "dismiss": "dismissed", "close": "resolved"}
MUTE_DURATIONS = {"mute_10m": 600, "mute_1h": 3600, "mute_24h": 86400}

W, H = 800, 500
COIN_EVERY = 60
DAILY_ONLINE_CAP = 120
BAD = ["palavrao1", "palavrao2"]
LOGIN_FAILURES = {}
LOGIN_WINDOW_SECONDS = 900
LOGIN_MAX_FAILURES = 5


def _load_or_create_session_secret():
    env_secret = os.getenv("SESSION_SECRET", "").strip()
    if env_secret:
        print("🔑 SESSION_SECRET carregado do ambiente.")
        return env_secret
    secret_file = Path(__file__).resolve().parent / "session_secret.txt"
    try:
        if secret_file.exists():
            stored = secret_file.read_text(encoding="utf-8").strip()
            if stored:
                print(f"🔑 SESSION_SECRET carregado de {secret_file.name}.")
                return stored
    except Exception as exc:
        print(f"⚠️  Falha ao ler {secret_file.name}: {exc}")
    generated = secrets.token_hex(48)
    try:
        secret_file.write_text(generated, encoding="utf-8")
        print(f"⚠️  SESSION_SECRET gerado e salvo em {secret_file.name}. "
              f"Defina SESSION_SECRET no ambiente para preservar sessões entre deploys.")
    except Exception as exc:
        print(f"⚠️  Não foi possível salvar {secret_file.name}: {exc}. "
              f"As sessões serão invalidadas ao reiniciar.")
    return generated


SESSION_SECRET = _load_or_create_session_secret()
SESSION_TTL = 30 * 86400


def _sign_session(payload):
    return hmac.new(SESSION_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()


def create_session_token(nick):
    if not SESSION_SECRET:
        return ""
    expires = int(time.time()) + SESSION_TTL
    payload = f"{nick}:{expires}"
    signature = _sign_session(payload)
    raw = f"{payload}:{signature}"
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def validate_session_token(token):
    if not SESSION_SECRET or not token or len(token) > 500:
        return None
    try:
        padded = token + "=" * (-len(token) % 4)
        raw = base64.urlsafe_b64decode(padded).decode()
    except Exception:
        return None
    parts = raw.rsplit(":", 2)
    if len(parts) != 3:
        return None
    nick, expires_str, signature = parts
    try:
        expires = int(expires_str)
    except ValueError:
        return None
    payload = f"{nick}:{expires}"
    if not secrets.compare_digest(_sign_session(payload), signature):
        return None
    if expires < time.time():
        return None
    return nick


SHOP = {
    "c_azul":   {"name": "Azul",      "slot": "color", "value": "#4c8dff", "price": 0},
    "c_verde":  {"name": "Verde",     "slot": "color", "value": "#3ecf8e", "price": 0},
    "c_roxo":   {"name": "Roxo",      "slot": "color", "value": "#9b6bff", "price": 20},
    "c_dourado": {"name": "Dourado",  "slot": "color", "value": "#f2b84b", "price": 80},
    "h_coroa":  {"name": "Coroa",     "slot": "hat", "value": "👑", "price": 100},
    "h_mago":   {"name": "Chapéu de mago", "slot": "hat", "value": "🧙", "price": 60},
    "h_fogo":   {"name": "Chama",     "slot": "hat", "value": "🔥", "price": 40},
    "h_gato":   {"name": "Orelhas de gato", "slot": "hat", "value": "🐱", "price": 30},
    "c_rosa":  {"name": "Rosa", "slot": "color", "value": "#ff7eb6", "price": 20},
    "h_estrela": {"name": "Estrela", "slot": "hat", "value": "⭐", "price": 50},
    "h_oculos": {"name": "Óculos escuros", "slot": "hat", "value": "😎", "price": 70},
    "h_raio":   {"name": "Raio", "slot": "hat", "value": "⚡", "price": 90},
}
ROOMS = {"lobby": "Salão Principal", "praca": "Praça", "arena": "Arena"}

db = _connect_db()


def _ensure_dm_reactions_table():
    try:
        db.execute(
            "CREATE TABLE IF NOT EXISTS dm_reactions ("
            "dm_id INTEGER NOT NULL, "
            "voter TEXT NOT NULL, "
            "emoji TEXT NOT NULL, "
            "created_at DOUBLE PRECISION NOT NULL, "
            "PRIMARY KEY (dm_id, voter))"
        )
        db.execute("CREATE INDEX IF NOT EXISTS idx_dm_reactions_dm ON dm_reactions(dm_id)")
        db.commit()
        print("✅ Tabela dm_reactions pronta.")
    except Exception as exc:
        print(f"⚠️  Falha ao garantir tabela dm_reactions: {exc}")


def _ensure_friendships_table():
    try:
        db.execute(
            "CREATE TABLE IF NOT EXISTS friendships ("
            "requester TEXT NOT NULL, "
            "addressee TEXT NOT NULL, "
            "status TEXT NOT NULL, "
            "created_at DOUBLE PRECISION NOT NULL, "
            "updated_at DOUBLE PRECISION NOT NULL, "
            "PRIMARY KEY (requester, addressee))"
        )
        db.execute("CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee)")
        db.execute("CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester)")
        db.execute("CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status)")
        db.commit()
        print("✅ Tabela friendships pronta.")
    except Exception as exc:
        print(f"⚠️  Falha ao garantir tabela friendships: {exc}")


try:
    _ensure_dm_reactions_table()
except Exception:
    pass

try:
    _ensure_friendships_table()
except Exception:
    pass


# ═══════════════════════════════════════════════════════════
# SISTEMA DE AMIGOS
# ═══════════════════════════════════════════════════════════

def friendship_status(a, b):
    """Retorna: 'self' | 'friends' | 'pending_out' | 'pending_in' | 'none'."""
    if not a or not b:
        return "none"
    if a == b:
        return "self"
    row = db.execute(
        "SELECT requester, status FROM friendships "
        "WHERE (requester=? AND addressee=?) OR (requester=? AND addressee=?)",
        (a, b, b, a)
    ).fetchone()
    if not row:
        return "none"
    if row["status"] == "accepted":
        return "friends"
    return "pending_out" if row["requester"] == a else "pending_in"


def are_friends(a, b):
    return friendship_status(a, b) == "friends"


def _user_public_card(nick):
    """Mini card do usuário para listas de amigos/pedidos."""
    user = get_user(nick)
    if not user:
        return None
    data = json.loads(user["profile_data"] or "{}")
    role = role_for(nick)
    # ⭐ NOVO: vip e streamer também são "verificados" (têm selo)
    return {
        "nick": nick,
        "username": nick,
        "name": data.get("display_name") or user["display"],
        "display_name": data.get("display_name") or user["display"],
        "avatar": data.get("avatar", ""),
        "online": nick in online,
        "role": role,
        "verified": role in ("dev", "admin", "mod", "vip", "streamer"),
    }


def friends_list(nick):
    rows = db.execute(
        "SELECT CASE WHEN requester=? THEN addressee ELSE requester END AS other, updated_at "
        "FROM friendships "
        "WHERE status='accepted' AND (requester=? OR addressee=?) "
        "ORDER BY updated_at DESC",
        (nick, nick, nick)
    ).fetchall()
    result = []
    for row in rows:
        card = _user_public_card(row["other"])
        if card:
            card["since"] = row["updated_at"]
            result.append(card)
    return result


def incoming_requests(nick):
    rows = db.execute(
        "SELECT requester, created_at FROM friendships "
        "WHERE addressee=? AND status='pending' ORDER BY created_at DESC",
        (nick,)
    ).fetchall()
    result = []
    for row in rows:
        card = _user_public_card(row["requester"])
        if card:
            card["ts"] = row["created_at"]
            result.append(card)
    return result


def outgoing_requests(nick):
    rows = db.execute(
        "SELECT addressee, created_at FROM friendships "
        "WHERE requester=? AND status='pending' ORDER BY created_at DESC",
        (nick,)
    ).fetchall()
    result = []
    for row in rows:
        card = _user_public_card(row["addressee"])
        if card:
            card["ts"] = row["created_at"]
            result.append(card)
    return result


def friends_summary(nick):
    return {
        "t": "friends",
        "friends": friends_list(nick),
        "incoming": incoming_requests(nick),
        "outgoing": outgoing_requests(nick),
        "count": len(friends_list(nick)),
        "incoming_count": len(incoming_requests(nick)),
    }


async def notify_friend_change(a, b, status):
    for who, other in ((a, b), (b, a)):
        if who in online:
            await send(who, {"t": "friend_updated", "nick": other, "status": status})
    for who in (a, b):
        if who in online:
            await send(who, friends_summary(who))


# ═══════════════════════════════════════════════════════════
# Upload de anexos da DM
# ═══════════════════════════════════════════════════════════
UPLOAD_DIR = Path(__file__).resolve().parent / "static" / "uploads" / "dm"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

DM_MAX_SIZE = 25 * 1024 * 1024

DM_ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo",
    "application/pdf", "text/plain",
    "application/zip", "application/x-zip-compressed",
}

DM_EXT_TO_MIME = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp",
    ".mp4": "video/mp4", ".webm": "video/webm", ".ogv": "video/ogg",
    ".mov": "video/quicktime", ".avi": "video/x-msvideo",
    ".pdf": "application/pdf", ".txt": "text/plain",
    ".zip": "application/zip",
}

DM_MIME_TO_EXT = {
    "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif",
    "image/webp": ".webp",
    "video/mp4": ".mp4", "video/webm": ".webm", "video/ogg": ".ogv",
    "video/quicktime": ".mov", "video/x-msvideo": ".avi",
    "application/pdf": ".pdf", "text/plain": ".txt",
    "application/zip": ".zip", "application/x-zip-compressed": ".zip",
}

QUIZ = json.load(open("questions.json", encoding="utf-8"))


def add_activity(nick, kind, detail):
    db.execute("INSERT INTO activity(nick, kind, detail, ts) VALUES(?,?,?,?)",
               (nick, kind, detail[:120], time.time()))
    db.execute("DELETE FROM activity WHERE nick=? AND id NOT IN "
               "(SELECT id FROM activity WHERE nick=? ORDER BY ts DESC LIMIT 20)", (nick, nick))
    db.commit()


def _fold_rank(value):
    nfd = unicodedata.normalize("NFD", str(value or "").casefold())
    return "".join(ch for ch in nfd if unicodedata.category(ch) != "Mn").strip()


_MYTHIC_PLUS_RANKS = {"mitico", "honra mitica", "gloria mitica", "imortal"}


def _is_mythic_plus_rank(rank):
    return _fold_rank(rank) in _MYTHIC_PLUS_RANKS


def _parse_profile_stars(raw):
    if raw is None:
        return None
    text = str(raw).strip()
    if text == "":
        return None
    try:
        n = int(text)
    except (TypeError, ValueError):
        return None
    if n < 0:
        return None
    return min(n, 9999)


def _rank_from_mythic_stars(stars):
    if stars >= 100:
        return "Imortal"
    if stars >= 50:
        return "Glória Mítica"
    if stars >= 25:
        return "Honra Mítica"
    return "Mítico"


def _normalize_visibility(data, fallback_private=None):
    vis = data.get("visibility")
    if vis in VALID_VISIBILITIES:
        return vis
    if isinstance(fallback_private, bool):
        return "private" if fallback_private else "public"
    return "private" if data.get("is_private") else "public"


def profile(nick, viewer=None):
    u = get_user(nick)
    data = json.loads(u["profile_data"] or "{}")
    own = viewer == nick
    role = role_for(nick)

    visibility = _normalize_visibility(data)
    friendship = "self" if own else (friendship_status(viewer, nick) if viewer else "none")

    if own:
        can_see_details = True
    elif visibility == "public":
        can_see_details = True
    elif visibility == "friends":
        can_see_details = (friendship == "friends")
    else:
        can_see_details = False

    # ⭐ FIX: todos os 7 cargos agora aparecem corretamente em community_roles
    ROLE_LABELS = {
        "dev": "DEV",
        "admin": "ADMIN",
        "mod": "MODERADOR",
        "vip": "VIP",
        "streamer": "STREAMER",
        "beta": "BETA",
    }
    if role in ROLE_LABELS:
        community_roles = [ROLE_LABELS[role]]
    else:
        community_roles = ["MEMBRO"]

    # ⭐ staff + vip + streamer têm selo; beta NÃO tem
    verified = role in ("dev", "admin", "mod", "vip", "streamer")

    result = {
        "nick": nick,
        "username": nick,
        "display_name": data.get("display_name") or u["display"],
        "joined_at": u["joined_at"] or "",
        "visibility": visibility,
        "is_private": visibility == "private",
        "is_owner": own,
        "community_roles": community_roles,
        "online": nick in online,
        "role": role,
        "verified": verified,
        "friendship_status": friendship,
        "avatar": data.get("avatar", ""),
        "banner": data.get("banner", ""),
        "accent": data.get("accent", "#8b72ff"),
        "frame": data.get("frame", "default"),
        "theme": data.get("theme", "classic"),
    }

    if not can_see_details:
        result["details_hidden"] = True
        return result

    result.update({k: u[k] or "" for k in ("bio", "rank", "hero", "gid")})
    result["game_role"] = u["role"] or ""
    result.update({
        "title": data.get("title", ""),
        "show_stats": bool(data.get("show_stats", True)),
        "show_activity": bool(data.get("show_activity", True)),
    })
    stars = _parse_profile_stars(data.get("stars"))
    if stars is not None and _is_mythic_plus_rank(result.get("rank")):
        result["stars"] = stars
    if own:
        result["notifications"] = data.get("notifications", {
            "messages": True, "invites": True, "events": True, "activity": True
        })
    if data.get("show_stats", True):
        result["stats"] = {
            "coins": u["coins"],
            "quizzes": db.execute("SELECT COUNT(*) FROM quiz_done WHERE nick=?", (nick,)).fetchone()[0],
        }
        result["achievements"] = [
            {"id": "quiz-first", "icon": "🧠", "name": "Primeiro quiz"}
        ] if result["stats"]["quizzes"] else []
        if result["stats"]["quizzes"] >= 10:
            result["achievements"].append({"id": "quiz-ten", "icon": "🔥", "name": "Quiz dedicado"})
    if data.get("show_activity", True):
        result["activity"] = [
            {"kind": row["kind"], "detail": row["detail"], "ts": row["ts"]}
            for row in db.execute(
                "SELECT kind, detail, ts FROM activity WHERE nick=? ORDER BY ts DESC LIMIT 8", (nick,)
            ).fetchall()
        ]
    return result


def unread(nick):
    return db.execute("SELECT COUNT(*) FROM dm WHERE b=? AND seen=0", (nick,)).fetchone()[0]


def dm_reactions_for(message_ids):
    if not message_ids:
        return {}
    ids = [int(i) for i in message_ids]
    placeholders = ",".join("?" * len(ids))
    try:
        rows = db.execute(
            f"SELECT dm_id, voter, emoji FROM dm_reactions WHERE dm_id IN ({placeholders}) "
            f"ORDER BY created_at ASC",
            tuple(ids),
        ).fetchall()
    except Exception as exc:
        print(f"⚠️  [dm_reactions_for] erro: {exc}")
        return {}
    result = {}
    for row in rows:
        result.setdefault(row["dm_id"], []).append({
            "voter": row["voter"],
            "emoji": row["emoji"],
        })
    return result


def tournament_list(viewer):
    rows = db.execute("SELECT * FROM tournaments ORDER BY start_at, id DESC").fetchall()
    result = []
    for row in rows:
        item = dict(row)
        entries = db.execute(
            "SELECT nick, team, players FROM tournament_entries WHERE tournament_id=? ORDER BY created_at, id",
            (row["id"],)
        ).fetchall()
        item["teams"] = [{"team": entry["team"],
                          "players": entry["players"].splitlines() if entry["players"] else []}
                         for entry in entries]
        item["registered"] = any(entry["nick"] == viewer for entry in entries)
        own_entry = next((entry for entry in entries if entry["nick"] == viewer), None)
        item["my_entry"] = (
            {"team": own_entry["team"], "players": own_entry["players"].splitlines() if own_entry["players"] else []}
            if own_entry else None
        )
        item["team_count"] = len(entries)
        result.append(item)
    return result


COMMUNITY_LANES = {"EXP", "Jungle", "Mid", "Gold", "Roam"}


def community_author_label(author, viewer):
    user = get_user(author)
    data = json.loads(user["profile_data"] or "{}")
    visibility = _normalize_visibility(data)
    if visibility == "private" and author != viewer:
        return "Jogador da comunidade"
    return data.get("display_name") or user["display"]


def community_meta_list(viewer):
    rows = db.execute("""SELECT m.*,
        (SELECT COUNT(*) FROM community_meta_votes v WHERE v.meta_id=m.id AND v.value=1) AS helpful,
        (SELECT COUNT(*) FROM community_meta_votes v WHERE v.meta_id=m.id AND v.value=-1) AS not_helpful,
        (SELECT value FROM community_meta_votes v WHERE v.meta_id=m.id AND v.voter=?) AS my_vote
        FROM community_meta m ORDER BY
        (SELECT COALESCE(SUM(value),0) FROM community_meta_votes v WHERE v.meta_id=m.id) DESC,
        m.created_at DESC LIMIT 150""", (viewer,)).fetchall()
    return [{
        "id": row["id"], "hero": row["hero"], "lane": row["lane"], "tier": row["tier"],
        "patch": row["patch"], "notes": row["notes"], "created_at": row["created_at"],
        "author": community_author_label(row["author"], viewer),
        "own": row["author"] == viewer, "helpful": row["helpful"],
        "not_helpful": row["not_helpful"], "my_vote": row["my_vote"],
    } for row in rows]


def normalize_community_build_filters(message):
    lane = str(message.get("lane", "")).strip()
    period = str(message.get("period", "30d")).strip()
    sort = str(message.get("sort", "popular")).strip()
    return {
        "hero": str(message.get("hero", "")).strip()[:40],
        "lane": lane if lane in COMMUNITY_LANES else "",
        "period": period if period in ("7d", "30d", "all") else "30d",
        "sort": sort if sort in ("popular", "recent") else "popular",
    }


def community_build_list(viewer, filters=None, sort_by=None):
    now = time.time()
    filters = normalize_community_build_filters(filters or {})
    period_days = {"7d": 7, "30d": 30}.get(filters["period"])
    conditions = []
    parameters = [viewer, now - 7 * 86400, now - 7 * 86400,
                  now - 30 * 86400, now - 30 * 86400]
    filter_parameters = []
    if filters["hero"]:
        conditions.append("instr(lower(b.hero), lower(?))>0")
        filter_parameters.append(filters["hero"])
    if filters["lane"]:
        conditions.append("b.lane=?")
        filter_parameters.append(filters["lane"])
    if period_days:
        conditions.append("b.created_at>=?")
        filter_parameters.append(now - period_days * 86400)
    where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""
    if sort_by is None:
        sort_by = filters["sort"]
    sort_expression = {
        "popular": (
            "COALESCE(v.helpful_7d,0)" if filters["period"] == "7d" else
            "COALESCE(v.helpful_30d,0)" if filters["period"] == "30d" else
            "COALESCE(v.helpful,0)"
        ),
        "legacy": "COALESCE(v.helpful,0)-COALESCE(v.not_helpful,0)",
        "recent": "b.created_at",
    }.get(sort_by)
    if sort_expression is None:
        sort_expression = "b.created_at"
    sort_direction = "DESC"
    rows = db.execute(f"""SELECT b.*,
        COALESCE(v.helpful,0) AS helpful,
        COALESCE(v.not_helpful,0) AS not_helpful,
        COALESCE(v.helpful_7d,0) AS helpful_7d,
        COALESCE(v.not_helpful_7d,0) AS not_helpful_7d,
        COALESCE(v.helpful_30d,0) AS helpful_30d,
        COALESCE(v.not_helpful_30d,0) AS not_helpful_30d,
        (SELECT value FROM community_build_votes own
            WHERE own.build_id=b.id AND own.voter=?) AS my_vote
        FROM community_builds b
        LEFT JOIN (
            SELECT build_id,
                SUM(CASE WHEN value=1 THEN 1 ELSE 0 END) AS helpful,
                SUM(CASE WHEN value=-1 THEN 1 ELSE 0 END) AS not_helpful,
                SUM(CASE WHEN value=1 AND created_at>=? THEN 1 ELSE 0 END) AS helpful_7d,
                SUM(CASE WHEN value=-1 AND created_at>=? THEN 1 ELSE 0 END) AS not_helpful_7d,
                SUM(CASE WHEN value=1 AND created_at>=? THEN 1 ELSE 0 END) AS helpful_30d,
                SUM(CASE WHEN value=-1 AND created_at>=? THEN 1 ELSE 0 END) AS not_helpful_30d
            FROM community_build_votes GROUP BY build_id
        ) v ON v.build_id=b.id{where_clause}
        ORDER BY {sort_expression} {sort_direction}, b.created_at DESC LIMIT 150""",
        (*parameters, *filter_parameters)).fetchall()
    return [{
        "id": row["id"], "hero": row["hero"], "lane": row["lane"], "patch": row["patch"],
        "spell": row["spell"], "emblem": row["emblem"], "items": json.loads(row["items"]),
        "notes": row["notes"], "created_at": row["created_at"],
        "author": community_author_label(row["author"], viewer),
        "own": row["author"] == viewer, "helpful": row["helpful"],
        "not_helpful": row["not_helpful"], "helpful_7d": row["helpful_7d"],
        "not_helpful_7d": row["not_helpful_7d"], "helpful_30d": row["helpful_30d"],
        "not_helpful_30d": row["not_helpful_30d"], "my_vote": row["my_vote"],
    } for row in rows]


def community_build_lists(viewer, filters=None):
    filters = normalize_community_build_filters(filters or {})
    trending = community_build_list(viewer, filters, "popular")
    recent = community_build_list(viewer, filters, "recent")
    return {
        "list": trending if filters["sort"] == "popular" else recent,
        "trending": trending,
        "recent": recent,
        "filters": filters,
    }


def parse_tournament_datetime(value):
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    parsed = datetime.datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.astimezone()
    return parsed.astimezone(datetime.timezone.utc).isoformat(timespec="seconds")


def mute_status(nick):
    mute = db.execute("SELECT muted_until, reason FROM user_mutes WHERE nick=?", (nick,)).fetchone()
    if not mute:
        return None
    if mute["muted_until"] <= time.time():
        db.execute("DELETE FROM user_mutes WHERE nick=?", (nick,))
        db.commit()
        return None
    return dict(mute)


def moderation_reports():
    rows = db.execute(
        "SELECT id, reporter, target, category, details, status, action, created_at, reviewed_by, reviewed_at "
        "FROM community_reports ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'reviewed' THEN 1 ELSE 2 END, created_at DESC LIMIT 100"
    ).fetchall()
    return [dict(row) for row in rows]


def active_mutes():
    now = time.time()
    db.execute("DELETE FROM user_mutes WHERE muted_until<=?", (now,))
    db.commit()
    rows = db.execute(
        "SELECT nick, muted_until, reason, by_nick FROM user_mutes ORDER BY muted_until"
    ).fetchall()
    return [dict(row) for row in rows]


def threads(nick):
    rows = db.execute("""SELECT CASE WHEN a=? THEN b ELSE a END AS other, MAX(id) AS last_id,
        SUM(CASE WHEN b=? AND seen=0 THEN 1 ELSE 0 END) AS unread
        FROM dm WHERE a=? OR b=? GROUP BY other ORDER BY last_id DESC LIMIT 30""", (nick,) * 4).fetchall()
    result = []
    for row in rows:
        user = get_user(row["other"])
        data = json.loads(user["profile_data"] or "{}")
        last_row = db.execute("SELECT m, ts FROM dm WHERE id=?", (row["last_id"],)).fetchone()
        result.append({
            "nick": row["other"],
            "name": data.get("display_name") or user["display"],
            "avatar": data.get("avatar", ""),
            "unread": row["unread"],
            "last": last_row["m"] if last_row else "",
            "ts": last_row["ts"] if last_row else 0,
        })
    return result


def quiz_idx(): return datetime.date.today().toordinal() % len(QUIZ)


def quiz_state(nick):
    q = QUIZ[quiz_idx()]
    row = db.execute("SELECT 1 FROM quiz_done WHERE nick=? AND day=?", (nick, str(datetime.date.today()))).fetchone()
    return {"q": q["q"], "o": q["o"], "done": row is not None}


def lfg_list():
    rows = db.execute("SELECT lfg.*, users.bio, users.hero, users.profile_data FROM lfg "
                      "JOIN users ON users.nick=lfg.nick WHERE lfg.ts>? ORDER BY lfg.ts DESC LIMIT 30",
                      (time.time() - 10800,)).fetchall()
    result = []
    for row in rows:
        item = dict(row)
        data = json.loads(item.pop("profile_data") or "{}")
        item["display"] = data.get("display_name") or item["display"]
        item["avatar"] = data.get("avatar", "")
        result.append({**item, "online": item["nick"] in online})
    return result


online = {}


def hash_secret(secret, salt):
    return hashlib.pbkdf2_hmac("sha256", secret.encode(), bytes.fromhex(salt), 310000).hex()


def valid_password(password):
    return isinstance(password, str) and 10 <= len(password) <= 128


def hash_pin(pin, salt=None):
    if salt is None:
        return hashlib.sha256(("lobby" + pin).encode()).hexdigest()
    return hash_secret(pin, salt)


def verify_legacy_credential(user, credential):
    stored_credential = user["pin"] or ""
    if not stored_credential:
        return False
    if user["pin_salt"]:
        return secrets.compare_digest(stored_credential, hash_pin(credential, user["pin_salt"]))
    if secrets.compare_digest(stored_credential, hash_pin(credential)):
        salt = secrets.token_hex(16)
        db.execute("UPDATE users SET pin=?, pin_salt=? WHERE nick=?",
                   (hash_pin(credential, salt), salt, user["nick"]))
        db.commit()
        return True
    return False


def verify_password(user, password):
    stored_hash = user["password_hash"] or ""
    salt = user["password_salt"] or ""
    return bool(stored_hash and salt) and secrets.compare_digest(
        stored_hash, hash_secret(password, salt)
    )


def set_password(nick, password):
    salt = secrets.token_hex(16)
    db.execute(
        "UPDATE users SET password_hash=?,password_salt=?,pin='',pin_salt='' WHERE nick=?",
        (hash_secret(password, salt), salt, nick),
    )
    db.commit()


def validate_registration_payload(message):
    raw_nick = str(message.get("nick", "")).strip()
    password = message.get("password", "")
    if not re.fullmatch(r"[A-Za-z0-9_]{3,14}", raw_nick):
        raise IdentityError("O nick deve ter 3 a 14 letras, números ou underline.")
    if not valid_password(password):
        raise IdentityError("A senha deve ter entre 10 e 128 caracteres.")
    legacy_credential = str(message.get("legacy_credential", ""))
    if legacy_credential and not re.fullmatch(r"\d{4}", legacy_credential):
        raise IdentityError("O código antigo para migrar a conta deve conter quatro dígitos.")
    return raw_nick, raw_nick.lower(), password, legacy_credential


def register_password_account(message):
    raw_nick, nick, password, legacy_credential = validate_registration_payload(message)
    user = get_user(nick)
    if user:
        if user["password_hash"]:
            raise IdentityError("Esse nick já tem uma senha. Entre na aba “Entrar”.")
        if not legacy_credential or not verify_legacy_credential(user, legacy_credential):
            raise IdentityError(
                "Essa conta já existe. Informe o PIN antigo uma única vez para migrá-la à nova senha."
            )
        set_password(nick, password)
        created = False
    else:
        if nick in ADMIN_NICKS:
            raise IdentityError("Esta conta administrativa precisa existir antes de habilitar o acesso.")
        password_salt = secrets.token_hex(16)
        db.execute(
            "INSERT INTO users(nick,display,pin,pin_salt,password_hash,password_salt,joined_at) "
            "VALUES(?,?,?,?,?,?,?)",
            (nick, raw_nick, "", "", hash_secret(password, password_salt), password_salt,
             datetime.datetime.now().astimezone().isoformat(timespec="seconds")),
        )
        db.commit()
        created = True

    try:
        if identity_store.firestore_configured:
            identity_store.ensure_legacy_account(
                nick, "admin" if nick in ADMIN_NICKS else "user"
            )
        return nick, role_for(nick), created
    except IdentityError:
        if created:
            db.execute("DELETE FROM users WHERE nick=?", (nick,))
            db.commit()
        raise


def password_login_account(message):
    raw = str(message.get("nick", "")).strip()
    password = message.get("password", "")
    if (not re.fullmatch(r"[A-Za-z0-9_]{3,14}", raw)
            or not isinstance(password, str) or not 1 <= len(password) <= 128):
        raise IdentityError("Informe seu nick e sua senha.")
    nick = raw.lower()
    user = get_user(nick)
    if not user:
        raise IdentityError("Conta não encontrada. Abra “Criar conta” para se cadastrar.")
    if not user["password_hash"]:
        raise IdentityError(
            "Sua conta antiga ainda não tem senha. Use “Criar conta” e informe o PIN antigo uma única vez."
        )
    if not verify_password(user, password):
        raise IdentityError("Senha incorreta para este nick.")
    if identity_store.firestore_configured:
        account = identity_store.get_by_nick(nick)
        if account and account.get("google_uid"):
            pass
        else:
            identity_store.ensure_legacy_account(
                nick, "admin" if nick in ADMIN_NICKS else "user"
            )
    return nick, role_for(nick), False


def get_user(nick): return db.execute("SELECT * FROM users WHERE nick=?", (nick,)).fetchone()


# ═══════════════════════════════════════════════════════════
# HIERARQUIA DE PAPÉIS: user < beta < streamer < vip < admin < mod < dev
# ═══════════════════════════════════════════════════════════

def _local_role_get(nick):
    if not nick:
        return None
    try:
        u = get_user(nick)
        if not u:
            return None
        data = json.loads(u["profile_data"] or "{}")
        role = data.get("_role")
        if role in VALID_ROLES:
            return role
    except Exception:
        pass
    return None


def _local_role_set(nick, role, by=None):
    if role not in VALID_ROLES:
        raise IdentityError("Papel inválido.")
    u = get_user(nick)
    if not u:
        raise IdentityError("Conta não encontrada.")
    data = json.loads(u["profile_data"] or "{}")
    data["_role"] = role
    data["_role_at"] = int(time.time())
    if by:
        data["_role_by"] = str(by)[:30]
    db.execute("UPDATE users SET profile_data=? WHERE nick=?",
               (json.dumps(data, ensure_ascii=False), nick))
    db.commit()


def _local_list_accounts():
    try:
        rows = db.execute(
            "SELECT nick, display, profile_data, joined_at "
            "FROM users ORDER BY nick"
        ).fetchall()
    except Exception as exc:
        raise IdentityError(f"Erro ao listar contas locais: {exc}")

    result = []
    for row in rows:
        nick = row["nick"]
        data = json.loads(row["profile_data"] or "{}")
        stored_role = data.get("_role")

        if stored_role in VALID_ROLES:
            role = stored_role
            role_source = "explicit"
        elif nick in DEV_NICKS:
            role = "dev"
            role_source = "env"
        elif nick in ADMIN_NICKS:
            role = "admin"
            role_source = "env"
        else:
            role = "user"
            role_source = "default"

        google_linked = bool(data.get("google_uid") or data.get("google_id"))
        entry = {
            "nick": nick,
            "display": data.get("display_name") or row["display"] or nick,
            "role": role,
            "role_source": role_source,
            "role_at": data.get("_role_at"),
            "role_by": data.get("_role_by"),
            "google_linked": google_linked,
            "source": "local",
        }

        try:
            entry["joined_at"] = row["joined_at"]
        except Exception:
            pass

        result.append(entry)

    return result


def role_for(nick):
    if not nick:
        return "user"
    if nick in DEV_NICKS:
        return "dev"
    local = _local_role_get(nick)
    if local:
        return local
    if identity_store.firestore_configured:
        try:
            fallback = "admin" if nick in ADMIN_NICKS else "user"
            return identity_store.role_for(nick, fallback)
        except Exception:
            pass
    if nick in ADMIN_NICKS:
        return "admin"
    return "user"


def is_dev(nick):
    if not nick:
        return False
    return role_for(nick) == "dev"


def is_admin(nick):
    if not nick:
        return False
    return role_for(nick) in ("admin", "mod", "dev")


def can_moderate(nick):
    if not nick:
        return False
    return role_for(nick) in ("mod", "dev")


def public(nick):
    u, p = get_user(nick), online[nick]
    return {"nick": nick, "name": u["display"], "x": p["x"], "y": p["y"],
            "equip": json.loads(u["equip"])}


def me(nick):
    u = get_user(nick)
    return {"coins": u["coins"], "owned": json.loads(u["owned"]), "equip": json.loads(u["equip"])}


async def send(nick, data):
    try: await online[nick]["ws"].send_text(json.dumps(data))
    except Exception: pass


async def broadcast(data, skip=None):
    for n in list(online):
        if n != skip: await send(n, data)


async def broadcast_tournaments():
    for viewer in list(online):
        await send(viewer, {"t": "tournaments", "list": tournament_list(viewer)})


async def broadcast_community():
    for viewer in list(online):
        viewer_state = online.get(viewer)
        if viewer_state is None:
            continue
        await send(viewer, {"t": "community_meta", "list": community_meta_list(viewer)})
        filters = viewer_state.get("community_build_filters")
        if filters is None:
            builds = community_build_list(viewer, {"period": "all"}, "legacy")
            await send(viewer, {"t": "community_builds", "list": builds})
        else:
            await send(viewer, {"t": "community_builds", **community_build_lists(viewer, filters)})


async def broadcast_moderation():
    data = {"t": "moderation_data", "reports": moderation_reports(), "mutes": active_mutes()}
    for admin_nick in list(online):
        if is_admin(admin_nick) or can_moderate(admin_nick):
            await send(admin_nick, data)


async def broadcast_role_list():
    try:
        accounts = _local_list_accounts()
        if identity_store.firestore_configured:
            try:
                firestore_accounts = identity_store.list_accounts()
                by_nick = {a.get("nick"): a for a in firestore_accounts}
                for acc in accounts:
                    if acc["role_source"] != "explicit":
                        fs = by_nick.get(acc["nick"])
                        if fs and fs.get("role") in VALID_ROLES:
                            acc["role"] = fs["role"]
                            acc["role_source"] = "firestore"
            except Exception as exc:
                print(f"⚠️ [broadcast_role_list] Firestore sync falhou: {exc}")
    except IdentityError as err:
        print(f"⚠️ [broadcast_role_list] {err}")
        return
    except Exception as err:
        print(f"⚠️ [broadcast_role_list] erro inesperado: {err}")
        return

    data = {"t": "admin_roles", "list": accounts}
    for admin_nick in list(online):
        if is_dev(admin_nick):
            await send(admin_nick, data)


async def bc_room(nick, data, skip=None):
    room = online[nick]["room"]
    for n in list(online):
        if n != skip and online[n]["room"] == room: await send(n, data)


def add_coins(nick, amount):
    db.execute("UPDATE users SET coins=coins+? WHERE nick=?", (amount, nick))
    db.commit()


async def online_rewards():
    while True:
        await asyncio.sleep(COIN_EVERY)
        today = time.strftime("%Y-%m-%d")
        for nick in list(online):
            u = get_user(nick)
            earned = u["earned"] if u["day"] == today else 0
            if earned < DAILY_ONLINE_CAP:
                db.execute("UPDATE users SET coins=coins+1, earned=?, day=? WHERE nick=?",
                           (earned + 1, today, nick))
                db.commit()
                await send(nick, {"t": "me", **me(nick)})


@asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(online_rewards())
    try:
        yield
    finally:
        task.cancel()
        try:
            db.close()
        except Exception:
            pass

app = FastAPI(lifespan=lifespan)


@app.get("/api/config")
def public_config():
    try:
        config = identity_store.web_config()
    except IdentityError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    return {
        "firebase_web_config": config,
        "google_auth_enabled": config is not None and identity_store.firestore_configured,
        "legacy_login_enabled": ALLOW_LEGACY_LOGIN,
    }


class BotCoins(BaseModel):
    nick: str
    amount: int


@app.post("/api/coins")
async def bot_coins(body: BotCoins, x_bot_key: str = Header("")):
    if not BOT_KEY:
        raise HTTPException(503, "BOT_KEY não foi configurada no servidor")
    if not secrets.compare_digest(x_bot_key, BOT_KEY):
        raise HTTPException(403, "chave inválida")
    nick = body.nick.strip().lower()
    if not get_user(nick): raise HTTPException(404, "jogador não existe")
    add_coins(nick, max(-1000, min(1000, body.amount)))
    if nick in online: await send(nick, {"t": "me", **me(nick)})
    return {"ok": True, "coins": get_user(nick)["coins"]}


@app.get("/api/ranking")
def ranking():
    rows = db.execute("SELECT display, coins FROM users ORDER BY coins DESC LIMIT 10").fetchall()
    return [dict(r) for r in rows]


def login_attempt_key(ws, identity):
    client = ws.client
    address = client.host if client else "unknown"
    return address + ":" + identity


def recent_login_failures(key):
    now = time.monotonic()
    attempts = [attempt for attempt in LOGIN_FAILURES.get(key, []) if now - attempt < LOGIN_WINDOW_SECONDS]
    if attempts:
        LOGIN_FAILURES[key] = attempts
    else:
        LOGIN_FAILURES.pop(key, None)
    return attempts


def record_login_failure(key):
    if len(LOGIN_FAILURES) > 10000:
        now = time.monotonic()
        for address, attempts in list(LOGIN_FAILURES.items()):
            recent = [attempt for attempt in attempts if now - attempt < LOGIN_WINDOW_SECONDS]
            if recent:
                LOGIN_FAILURES[address] = recent
            else:
                LOGIN_FAILURES.pop(address, None)
    LOGIN_FAILURES.setdefault(key, []).append(time.monotonic())


class GoogleProfileRequired(IdentityError):
    def __init__(self, suggested_name):
        super().__init__("Informe um nome para seu perfil.")
        self.suggested_name = suggested_name


def create_google_profile_account(uid, profile_name):
    slug = unicodedata.normalize("NFKD", profile_name).encode("ascii", "ignore").decode("ascii")
    base = re.sub(r"[^A-Za-z0-9]+", "_", slug).strip("_").lower()[:5].rstrip("_")
    if len(base) < 3:
        base = "player"

    for _ in range(10):
        nick = f"{base}_{secrets.token_hex(4)}"
        if not get_user(nick):
            break
    else:
        raise IdentityError("Não foi possível reservar um identificador para sua conta. Tente novamente.")

    db.execute(
        "INSERT INTO users(nick,display,pin,pin_salt,password_hash,password_salt,joined_at) "
        "VALUES(?,?,?,?,?,?,?)",
        (nick, profile_name, "", "", "", "",
         datetime.datetime.now().astimezone().isoformat(timespec="seconds")),
    )
    db.commit()
    try:
        account = identity_store.create_google_account(uid, nick, "user")
    except IdentityError:
        db.execute("DELETE FROM users WHERE nick=?", (nick,))
        db.commit()
        raise
    return nick, account.get("role", "user"), True


def google_login_account(message):
    if not identity_store.firestore_configured:
        raise IdentityError("O servidor ainda não está configurado para usar Firebase Firestore.")
    claims = identity_store.verify_google_token(message.get("id_token"))
    uid = claims["uid"]
    raw_nick = str(message.get("nick", "")).strip()
    password = message.get("password", "")
    legacy_credential = str(message.get("legacy_credential", ""))
    if raw_nick and not re.fullmatch(r"[A-Za-z0-9_]{3,14}", raw_nick):
        raise IdentityError("Escolha um nick com 3 a 14 letras, números ou underline.")
    if password and not valid_password(password):
        raise IdentityError("A senha deve ter entre 10 e 128 caracteres.")
    if legacy_credential and not re.fullmatch(r"\d{4}", legacy_credential):
        raise IdentityError("O código antigo para migrar a conta deve conter quatro dígitos.")

    account = identity_store.get_by_uid(uid)
    if account:
        nick = account["nick"]
        if raw_nick and raw_nick.lower() != nick:
            raise IdentityError("Esta conta Google já está vinculada a outro nick.")
        user = get_user(nick)
        if not user:
            db.execute(
                "INSERT INTO users(nick,display,pin,pin_salt,password_hash,password_salt,joined_at) "
                "VALUES(?,?,?,?,?,?,?)",
                (nick, account.get("nick") or nick, "", "", "", "",
                 datetime.datetime.now().astimezone().isoformat(timespec="seconds")),
            )
            db.commit()
            user = get_user(nick)
        if password:
            set_password(nick, password)
        if nick in ADMIN_NICKS and account.get("role") != "admin":
            account = identity_store.set_role(nick, "admin")
        return nick, account.get("role") or role_for(nick), False

    if not raw_nick:
        if message.get("allow_registration") is not True:
            raise IdentityError(
                "Esta conta Google ainda não foi cadastrada. Abra “Criar conta” para continuar."
            )
        profile_name = message.get("profile_name")
        if profile_name is None or (isinstance(profile_name, str) and not profile_name.strip()):
            suggested_name = message.get("suggested_profile_name", "")
            if not isinstance(suggested_name, str):
                suggested_name = ""
            raise GoogleProfileRequired(suggested_name[:32])
        if not isinstance(profile_name, str):
            raise IdentityError("Informe um nome válido para o perfil.")
        profile_name = profile_name.strip()
        if (not 1 <= len(profile_name) <= 32
                or any(unicodedata.category(character) == "Cc" for character in profile_name)):
            raise IdentityError("O nome do perfil deve ter de 1 a 32 caracteres.")
        return create_google_profile_account(uid, profile_name)

    nick = raw_nick.lower()
    user = get_user(nick)
    if user:
        account = identity_store.get_by_nick(nick)
        if account and account.get("google_uid") not in (None, "", uid):
            raise IdentityError("Este nick já está vinculado a outra conta Google.")
        if user["password_hash"]:
            if not valid_password(password) or not verify_password(user, password):
                raise IdentityError("Para vincular essa conta, informe a senha atual do nick.")
        else:
            if (not legacy_credential
                    or not verify_legacy_credential(user, legacy_credential)):
                raise IdentityError(
                    "Para proteger sua conta antiga, informe o PIN antigo uma única vez e escolha uma senha."
                )
            if not valid_password(password):
                raise IdentityError("Escolha uma senha com pelo menos 10 caracteres para concluir a migração.")
            set_password(nick, password)
        if not account:
            identity_store.ensure_legacy_account(nick, "admin" if nick in ADMIN_NICKS else "user")
        account = identity_store.link_legacy_account(uid, nick)
        if nick in ADMIN_NICKS and account.get("role") != "admin":
            account = identity_store.set_role(nick, "admin")
        return nick, account.get("role") or role_for(nick), False

    if nick in ADMIN_NICKS:
        raise IdentityError("Esta conta administrativa precisa existir antes de habilitar o acesso.")
    if not valid_password(password):
        raise IdentityError("Escolha uma senha com pelo menos 10 caracteres para criar sua conta.")

    password_salt = secrets.token_hex(16)
    db.execute(
        "INSERT INTO users(nick,display,pin,pin_salt,password_hash,password_salt,joined_at) "
        "VALUES(?,?,?,?,?,?,?)",
        (nick, raw_nick, "", "", hash_secret(password, password_salt), password_salt,
         datetime.datetime.now().astimezone().isoformat(timespec="seconds"))
    )
    db.commit()
    try:
        account = identity_store.create_google_account(uid, nick, "user")
    except IdentityError:
        db.execute("DELETE FROM users WHERE nick=?", (nick,))
        db.commit()
        raise
    return nick, account.get("role", "user"), True


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    nick = None
    try:
        msg = json.loads(await ws.receive_text())
        if msg.get("t") == "session_login":
            token_nick = validate_session_token(str(msg.get("token", "")))
            if not token_nick:
                await ws.send_text(json.dumps({"t": "session_invalid"}))
                return await ws.close()
            user = get_user(token_nick)
            if not user:
                db.execute(
                    "INSERT INTO users(nick,display,pin,pin_salt,password_hash,password_salt,joined_at) "
                    "VALUES(?,?,?,?,?,?,?)",
                    (token_nick, token_nick, "", "", "", "",
                     datetime.datetime.now().astimezone().isoformat(timespec="seconds")),
                )
                db.commit()
            auth_provider = "session"
            key = token_nick
            role = role_for(key)
            created = False
            attempt_key = None
        elif msg.get("t") == "google_login":
            auth_provider = "google"
            try:
                key, role, created = google_login_account(msg)
            except GoogleProfileRequired as pending:
                await ws.send_text(json.dumps({
                    "t": "google_profile_required",
                    "suggested_name": pending.suggested_name,
                }))
                profile_message = json.loads(await ws.receive_text())
                if profile_message.get("t") != "google_profile_name":
                    raise IdentityError("Cadastro Google cancelado.")
                key, role, created = google_login_account({
                    **msg,
                    "profile_name": profile_message.get("profile_name"),
                })
            attempt_key = None
        elif msg.get("t") == "password_register":
            auth_provider = "password"
            key, role, created = register_password_account(msg)
            attempt_key = None
        else:
            auth_provider = "password"
            if msg.get("t") != "password_login" and not ALLOW_LEGACY_LOGIN:
                await ws.send_text(json.dumps({"t": "error",
                                               "m": "O acesso por senha está desativado. Entre com Google."}))
                return await ws.close()
            raw = str(msg.get("nick", "")).strip()
            attempt_key = login_attempt_key(
                ws, raw.lower() if re.fullmatch(r"[A-Za-z0-9_]{3,14}", raw) else "invalid"
            )
            failures = recent_login_failures(attempt_key)
            if len(failures) >= LOGIN_MAX_FAILURES:
                remaining = max(1, int(LOGIN_WINDOW_SECONDS - (time.monotonic() - failures[0])))
                await ws.send_text(json.dumps({"t": "error",
                                               "m": f"Muitas tentativas para esta conta. Aguarde {remaining // 60 + 1} minuto(s) para tentar novamente."}))
                return await ws.close()
            if (not re.fullmatch(r"[A-Za-z0-9_]{3,14}", raw)
                    or not isinstance(msg.get("password"), str)
                    or not 1 <= len(msg["password"]) <= 128):
                record_login_failure(attempt_key)
                await ws.send_text(json.dumps({"t": "error", "m": "Informe um nick válido e sua senha."}))
                return await ws.close()
            try:
                key, role, created = password_login_account(msg)
            except IdentityError:
                record_login_failure(attempt_key)
                raise

        if key in online:
            try:
                await online[key]["ws"].close(code=4001)
            except Exception:
                pass
            online.pop(key, None)

        if attempt_key:
            LOGIN_FAILURES.pop(attempt_key, None)
        nick = key
        if created:
            add_activity(nick, "community", "Entrou na comunidade")
        online[nick] = {"ws": ws, "x": W // 2, "y": H // 2, "last_chat": 0, "last_dm": 0,
                        "room": "lobby", "role": role, "auth_provider": auth_provider,
                        "community_build_filters": None}
        # ⭐ FIX: envia flags para todos os cargos novos (is_vip, is_streamer, is_beta)
        await ws.send_text(json.dumps({
            "t": "init",
            "quiz": quiz_state(nick),
            "profile": profile(nick, nick),
            "unread": unread(nick),
            "shop": SHOP,
            "me": me(nick),
            "self": nick,
            "is_admin": role in ("admin", "mod", "dev"),
            "is_moderator": role in ("mod", "dev"),
            "is_dev": role == "dev",
            "is_vip": role == "vip",
            "is_streamer": role == "streamer",
            "is_beta": role == "beta",
            "role": role,
            "auth_provider": auth_provider,
            "token": create_session_token(nick),
            "players": [public(n) for n in online if online[n]["room"] == "lobby"]
        }))
        await send(nick, {"t": "tournaments", "list": tournament_list(nick)})
        await send(nick, friends_summary(nick))
        current_mute = mute_status(nick)
        if current_mute:
            await send(nick, {"t": "moderation_notice",
                "m": "Sua conta está silenciada temporariamente.",
                "until": current_mute["muted_until"]})
        await bc_room(nick, {"t": "join", "p": public(nick)}, skip=nick)

        while True:
            m = json.loads(await ws.receive_text())
            t, p = m.get("t"), online[nick]
            if t == "move":
                p["x"] = max(0, min(W, int(m.get("x", 0))))
                p["y"] = max(0, min(H, int(m.get("y", 0))))
                await bc_room(nick, {"t": "move", "nick": nick, "x": p["x"], "y": p["y"]})
            elif t == "chat":
                text = str(m.get("m", "")).strip()[:100]
                muted = mute_status(nick)
                if muted:
                    await send(nick, {"t": "moderation_notice", "m": "Sua conta está silenciada até " +
                                     datetime.datetime.fromtimestamp(
                                         muted["muted_until"], datetime.timezone.utc
                                     ).astimezone().strftime("%d/%m às %H:%M") + ".",
                                     "until": muted["muted_until"]})
                    continue
                if not text or time.time() - p["last_chat"] < 1: continue
                p["last_chat"] = time.time()
                low = text.lower()
                if any(b in low for b in BAD): text = "***"
                await bc_room(nick, {"t": "chat", "nick": nick, "name": get_user(nick)["display"], "m": text})
            elif t == "room":
                rid = m.get("id")
                if rid in ROOMS and rid != p["room"]:
                    await bc_room(nick, {"t": "leave", "nick": nick}, skip=nick)
                    p["room"], p["x"], p["y"] = rid, W // 2, H // 2
                    add_activity(nick, "room", "Entrou em " + ROOMS[rid])
                    await send(nick, {"t": "room", "id": rid, "players": [public(n) for n in online if online[n]["room"] == rid]})
                    await bc_room(nick, {"t": "join", "p": public(nick)}, skip=nick)

            # ═══════════════════════════════════════════
            # SISTEMA DE AMIGOS
            # ═══════════════════════════════════════════
            elif t == "friends_list":
                await send(nick, friends_summary(nick))
            elif t == "friend_request":
                target = str(m.get("nick", "")).strip().lower()
                if target == nick or not get_user(target):
                    await send(nick, {"t": "friend_error", "m": "Jogador inválido."})
                    continue
                status = friendship_status(nick, target)
                if status == "friends":
                    await send(nick, {"t": "friend_error", "m": "Você já é amigo deste jogador."})
                    continue
                if status == "pending_out":
                    await send(nick, {"t": "friend_error", "m": "Você já enviou um pedido para este jogador."})
                    continue
                if status == "pending_in":
                    db.execute(
                        "UPDATE friendships SET status='accepted', updated_at=? "
                        "WHERE requester=? AND addressee=?",
                        (time.time(), target, nick)
                    )
                    db.commit()
                    add_activity(nick, "community", f"Ficou amigo de @{target}")
                    add_activity(target, "community", f"Ficou amigo de @{nick}")
                    await notify_friend_change(nick, target, "friends")
                    if target in online:
                        await send(target, {"t": "friend_notice",
                                            "m": f"@{nick} aceitou seu pedido de amizade."})
                    continue
                now = time.time()
                db.execute(
                    "INSERT INTO friendships(requester, addressee, status, created_at, updated_at) "
                    "VALUES(?,?,?,?,?) ON CONFLICT(requester, addressee) DO UPDATE SET "
                    "status=excluded.status, updated_at=excluded.updated_at",
                    (nick, target, "pending", now, now)
                )
                db.commit()
                await notify_friend_change(nick, target, "pending_out")
                if target in online:
                    user = get_user(nick)
                    data = json.loads(user["profile_data"] or "{}")
                    await send(target, {
                        "t": "friend_request_received",
                        "from": nick,
                        "name": data.get("display_name") or user["display"],
                        "avatar": data.get("avatar", ""),
                    })
                    await send(target, {"t": "friend_notice", "m": f"@{nick} quer ser seu amigo."})
            elif t == "friend_accept":
                target = str(m.get("nick", "")).strip().lower()
                row = db.execute(
                    "SELECT 1 FROM friendships WHERE requester=? AND addressee=? AND status='pending'",
                    (target, nick)
                ).fetchone()
                if not row:
                    await send(nick, {"t": "friend_error", "m": "Não há pedido de amizade deste jogador."})
                    continue
                db.execute(
                    "UPDATE friendships SET status='accepted', updated_at=? "
                    "WHERE requester=? AND addressee=?",
                    (time.time(), target, nick)
                )
                db.commit()
                add_activity(nick, "community", f"Ficou amigo de @{target}")
                add_activity(target, "community", f"Ficou amigo de @{nick}")
                await notify_friend_change(nick, target, "friends")
                if target in online:
                    await send(target, {"t": "friend_notice",
                                        "m": f"@{nick} aceitou seu pedido de amizade."})
            elif t == "friend_decline":
                target = str(m.get("nick", "")).strip().lower()
                db.execute(
                    "DELETE FROM friendships "
                    "WHERE requester=? AND addressee=? AND status='pending'",
                    (target, nick)
                )
                db.commit()
                await notify_friend_change(nick, target, "none")
            elif t == "friend_remove":
                target = str(m.get("nick", "")).strip().lower()
                db.execute(
                    "DELETE FROM friendships "
                    "WHERE (requester=? AND addressee=?) OR (requester=? AND addressee=?)",
                    (nick, target, target, nick)
                )
                db.commit()
                await notify_friend_change(nick, target, "none")

            # ═══════════════════════════════════════════
            # RESTO (perfil, DM, torneio, moderação, etc.)
            # ═══════════════════════════════════════════
            elif t == "profile_view":
                other = str(m.get("nick", "")).lower()
                if get_user(other):
                    await send(nick, {"t": "pview", "nick": other, "p": profile(other, nick)})
            elif t == "profile_set":
                f = {k: str(m.get(k, "")).strip()[:(60 if k == "bio" else 20)] for k in ("bio", "rank", "role", "hero", "gid")}
                stars = _parse_profile_stars(m.get("stars"))
                if stars is not None and (_is_mythic_plus_rank(f["rank"]) or f["rank"] == ""):
                    f["rank"] = _rank_from_mythic_stars(stars)
                if not _is_mythic_plus_rank(f["rank"]):
                    stars = None
                current = get_user(nick)
                data = json.loads(current["profile_data"] or "{}")
                display_name = str(m.get("display_name", current["display"])).strip()[:28]
                if not display_name:
                    await send(nick, {"t": "profile_error", "m": "O nome de exibição não pode ficar vazio."})
                    continue
                for field in ("avatar", "banner"):
                    image = str(m.get(field, data.get(field, "")))
                    max_length = 120000 if field == "avatar" else 350000
                    if image and (len(image) > max_length or not re.fullmatch(
                            r"data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}", image)):
                        await send(nick, {"t": "profile_error", "m": "A imagem selecionada não é válida ou ficou grande demais."})
                        break
                    data[field] = image
                else:
                    accent = str(m.get("accent", data.get("accent", "#8b72ff")))
                    if not re.fullmatch(r"#[0-9a-fA-F]{6}", accent):
                        await send(nick, {"t": "profile_error", "m": "Escolha uma cor de destaque válida."})
                        continue

                    raw_vis = str(m.get("visibility", "")).strip()
                    if raw_vis not in VALID_VISIBILITIES:
                        if "is_private" in m:
                            raw_vis = "private" if bool(m.get("is_private")) else "public"
                        else:
                            raw_vis = _normalize_visibility(data)

                    data.update({
                        "display_name": display_name,
                        "accent": accent,
                        "frame": str(m.get("frame", data.get("frame", "default")))
                        if m.get("frame", data.get("frame", "default")) in ("default", "elite") else "default",
                        "theme": str(m.get("theme", data.get("theme", "classic")))
                        if m.get("theme", data.get("theme", "classic")) in ("classic", "arena", "ocean") else "classic",
                        "title": str(m.get("title", data.get("title", ""))).strip()[:30],
                        "visibility": raw_vis,
                        "is_private": raw_vis == "private",
                        "show_stats": bool(m.get("show_stats", data.get("show_stats", True))),
                        "show_activity": bool(m.get("show_activity", data.get("show_activity", True))),
                    })
                    if stars is None:
                        data.pop("stars", None)
                    else:
                        data["stars"] = stars
                    db.execute("UPDATE users SET display=?, bio=?, rank=?, role=?, hero=?, gid=?, profile_data=? WHERE nick=?",
                               (display_name, *f.values(), json.dumps(data, ensure_ascii=False), nick))
                    db.execute("UPDATE lfg SET display=? WHERE nick=?", (display_name, nick))
                    db.commit()
                    add_activity(nick, "profile", "Atualizou o perfil")
                    saved_profile = profile(nick, nick)
                    await send(nick, {"t": "profile", "p": saved_profile})
                    await bc_room(nick, {"t": "player_profile", "nick": nick, "p": saved_profile}, skip=nick)
                    if db.execute("SELECT 1 FROM lfg WHERE nick=?", (nick,)).fetchone():
                        await broadcast({"t": "lfg", "list": lfg_list()})
                    continue
                continue
            elif t == "settings_set":
                user = get_user(nick)
                data = json.loads(user["profile_data"] or "{}")
                notifications = m.get("notifications", {})
                if not isinstance(notifications, dict):
                    await send(nick, {"t": "settings_error", "m": "As preferências de notificação são inválidas."})
                    continue
                data["notifications"] = {
                    key: bool(notifications.get(key, True))
                    for key in ("messages", "invites", "events", "activity")
                }
                for key in ("show_stats", "show_activity"):
                    value = m.get(key)
                    if isinstance(value, bool):
                        data[key] = value
                vis = m.get("visibility")
                if vis in VALID_VISIBILITIES:
                    data["visibility"] = vis
                    data["is_private"] = (vis == "private")
                elif isinstance(m.get("is_private"), bool):
                    data["is_private"] = m["is_private"]
                    data["visibility"] = "private" if m["is_private"] else "public"
                db.execute("UPDATE users SET profile_data=? WHERE nick=?",
                           (json.dumps(data, ensure_ascii=False), nick))
                db.commit()
                await send(nick, {"t": "settings", "notifications": data["notifications"],
                                  "profile": profile(nick, nick)})
                if db.execute("SELECT 1 FROM lfg WHERE nick=?", (nick,)).fetchone():
                    await broadcast({"t": "lfg", "list": lfg_list()})
            elif t == "password_change":
                current_password = m.get("current", "")
                new_password = m.get("new", "")
                user = get_user(nick)
                if not valid_password(new_password):
                    await send(nick, {"t": "password_error",
                                      "m": "A nova senha deve ter entre 10 e 128 caracteres."})
                    continue
                if p.get("auth_provider") not in ("google", "session"):
                    if not isinstance(current_password, str) or not verify_password(user, current_password):
                        await send(nick, {"t": "password_error", "m": "A senha atual está incorreta."})
                        continue
                elif current_password:
                    if (not isinstance(current_password, str)
                            or not verify_password(user, current_password)):
                        await send(nick, {"t": "password_error", "m": "A senha atual está incorreta."})
                        continue
                if user["password_hash"] and isinstance(current_password, str) and secrets.compare_digest(
                        current_password, new_password):
                    await send(nick, {"t": "password_error",
                                      "m": "A nova senha deve ser diferente da atual."})
                    continue
                set_password(nick, new_password)
                await send(nick, {"t": "password_changed", "m": "Senha alterada com sucesso."})
            elif t == "report_submit":
                target = str(m.get("target", "")).strip().lower()
                category = str(m.get("category", "")).strip()
                details = str(m.get("details", "")).strip()[:600]
                categories = {"harassment", "hate", "spam", "cheating", "inappropriate", "other"}
                if target == nick:
                    await send(nick, {"t": "report_error", "m": "Não é possível denunciar a própria conta."})
                    continue
                if not get_user(target):
                    await send(nick, {"t": "report_error", "m": "Este jogador não está mais disponível."})
                    continue
                if category not in categories or len(details) < 8:
                    await send(nick, {"t": "report_error", "m": "Escolha uma categoria e descreva o ocorrido com pelo menos 8 caracteres."})
                    continue
                recent = db.execute(
                    "SELECT COUNT(*) FROM community_reports WHERE reporter=? AND created_at>?",
                    (nick, time.time() - 600)
                ).fetchone()[0]
                if recent >= 3:
                    await send(nick, {"t": "report_error", "m": "Você já enviou várias denúncias. Aguarde alguns minutos antes de enviar outra."})
                    continue
                existing = db.execute(
                    "SELECT 1 FROM community_reports WHERE reporter=? AND target=? AND status='open'",
                    (nick, target)
                ).fetchone()
                if existing:
                    await send(nick, {"t": "report_error", "m": "Você já tem uma denúncia aberta sobre este jogador."})
                    continue
                db.execute(
                    "INSERT INTO community_reports(reporter,target,category,details,created_at) VALUES(?,?,?,?,?)",
                    (nick, target, category, details, time.time())
                )
                db.commit()
                await send(nick, {"t": "report_submitted", "m": "Denúncia enviada à moderação. Obrigado por ajudar a comunidade."})
                await broadcast_moderation()
            elif t == "moderation_list":
                if not (is_admin(nick) or can_moderate(nick)):
                    await send(nick, {"t": "moderation_error", "m": "Você não tem acesso à moderação."})
                    continue
                await send(nick, {"t": "moderation_data", "reports": moderation_reports(),
                                  "mutes": active_mutes()})
            elif t == "moderation_action":
                if not (is_admin(nick) or can_moderate(nick)):
                    await send(nick, {"t": "moderation_error", "m": "Você não tem acesso à moderação."})
                    continue
                try:
                    report_id = int(m.get("id"))
                except (TypeError, ValueError):
                    await send(nick, {"t": "moderation_error", "m": "Denúncia inválida."})
                    continue
                report = db.execute(
                    "SELECT id,target,status FROM community_reports WHERE id=?", (report_id,)
                ).fetchone()
                if not report:
                    await send(nick, {"t": "moderation_error", "m": "Esta denúncia não existe mais."})
                    continue
                action = str(m.get("action", "")).strip()
                if action not in STATUS_BY_ACTION and action not in MUTE_ACTIONS:
                    await send(nick, {"t": "moderation_error", "m": "Ação de moderação inválida."})
                    continue
                if action in MUTE_ACTIONS and not can_moderate(nick):
                    await send(nick, {"t": "moderation_error", "m": "Apenas MOD/DEV podem silenciar."})
                    continue
                if action in MUTE_ACTIONS:
                    muted_until = time.time() + MUTE_DURATIONS[action]
                    reason = str(m.get("reason", "")).strip()[:200] or "Denúncia #" + str(report_id)
                    db.execute(
                        "INSERT INTO user_mutes(nick,muted_until,reason,by_nick,created_at) VALUES(?,?,?,?,?) "
                        "ON CONFLICT(nick) DO UPDATE SET muted_until=excluded.muted_until,reason=excluded.reason,"
                        "by_nick=excluded.by_nick,created_at=excluded.created_at",
                        (report["target"], muted_until, reason, nick, time.time())
                    )
                    status = "resolved"
                    if report["target"] in online:
                        await send(report["target"], {"t": "moderation_notice",
                            "m": "Você foi silenciado temporariamente pela moderação.",
                            "until": muted_until})
                else:
                    status = STATUS_BY_ACTION[action]
                db.execute(
                    "UPDATE community_reports SET status=?,action=?,reviewed_by=?,reviewed_at=? WHERE id=?",
                    (status, action, nick, time.time(), report_id)
                )
                db.commit()
                await send(nick, {"t": "moderation_saved", "m": "Ação de moderação registrada."})
                await broadcast_moderation()
            elif t == "moderation_unmute":
                if not can_moderate(nick):
                    await send(nick, {"t": "moderation_error", "m": "Apenas MOD/DEV podem remover silenciamentos."})
                    continue
                target = str(m.get("target", "")).strip().lower()
                if not db.execute("SELECT 1 FROM user_mutes WHERE nick=?", (target,)).fetchone():
                    await send(nick, {"t": "moderation_error", "m": "Este jogador não está silenciado."})
                    continue
                db.execute("DELETE FROM user_mutes WHERE nick=?", (target,))
                db.commit()
                if target in online:
                    await send(target, {"t": "moderation_notice", "m": "O silenciamento da sua conta foi removido."})
                await send(nick, {"t": "moderation_saved", "m": "Silenciamento removido."})
                await broadcast_moderation()
            elif t == "admin_roles_list":
                if not is_dev(nick):
                    await send(nick, {"t": "admin_roles_error", "m": "Apenas DEV pode gerenciar papéis."})
                    continue
                try:
                    accounts = _local_list_accounts()
                    if identity_store.firestore_configured:
                        try:
                            firestore_accounts = identity_store.list_accounts()
                            by_nick = {a.get("nick"): a for a in firestore_accounts}
                            for acc in accounts:
                                if acc["role_source"] != "explicit":
                                    fs = by_nick.get(acc["nick"])
                                    if fs and fs.get("role") in VALID_ROLES:
                                        acc["role"] = fs["role"]
                                        acc["role_source"] = "firestore"
                        except Exception as exc:
                            print(f"⚠️ [admin_roles_list] Firestore sync falhou (ignorado): {exc}")
                    await send(nick, {"t": "admin_roles", "list": accounts})
                except IdentityError as error:
                    await send(nick, {"t": "admin_roles_error", "m": str(error)})
                except Exception as error:
                    print(f"⚠️ [admin_roles_list] erro: {error}")
                    await send(nick, {"t": "admin_roles_error", "m": f"Erro inesperado: {error}"})
            elif t == "admin_role_set":
                if not is_dev(nick):
                    await send(nick, {"t": "admin_roles_error", "m": "Apenas DEV pode gerenciar papéis."})
                    continue
                target = str(m.get("nick", "")).strip().lower()
                role = str(m.get("role", "")).strip()
                if role not in VALID_ROLES:
                    await send(nick, {"t": "admin_roles_error", "m": "Papel inválido."})
                    continue
                if target not in online and not get_user(target):
                    await send(nick, {"t": "admin_roles_error", "m": "Informe uma conta válida."})
                    continue
                if target == nick:
                    await send(nick, {"t": "admin_roles_error", "m": "Você não pode alterar seu próprio papel."})
                    continue
                if target in DEV_NICKS:
                    await send(nick, {"t": "admin_roles_error", "m": "Este jogador é DEV por variável de ambiente e não pode ser alterado aqui."})
                    continue
                try:
                    _local_role_set(target, role, by=nick)
                    new_role = role
                    if identity_store.firestore_configured:
                        try:
                            identity_store.set_role(target, role)
                        except Exception as exc:
                            print(f"⚠️ [admin_role_set] Firestore sync falhou (ignorado): {exc}")
                    if target in online:
                        online[target]["role"] = new_role
                        await send(target, {
                            "t": "role_updated",
                            "role": new_role,
                            "is_dev": new_role == "dev"
                        })
                        await send(target, {"t": "moderation_notice",
                                            "m": f"Seu papel na comunidade foi atualizado para {new_role.upper()}."})
                    await send(nick, {"t": "admin_roles_saved", "m": f"@{target} agora é {new_role.upper()}."})
                    await broadcast_role_list()
                    await broadcast_moderation()
                except IdentityError as error:
                    await send(nick, {"t": "admin_roles_error", "m": str(error)})
                except Exception as error:
                    print(f"⚠️ [admin_role_set] erro: {error}")
                    await send(nick, {"t": "admin_roles_error", "m": f"Erro inesperado: {error}"})
            elif t == "role_status":
                await send(nick, {"t": "role_status", "role": p.get("role", "user"),
                                  "auth_provider": p.get("auth_provider", "legacy")})
            elif t == "room_list":
                await send(nick, {"t": "rooms", "list": [{"id": k, "name": v, "count": sum(1 for o in online.values() if o["room"] == k)} for k, v in ROOMS.items()]})
            elif t == "community_meta_list":
                await send(nick, {"t": "community_meta", "list": community_meta_list(nick)})
            elif t == "community_meta_submit":
                lane = str(m.get("lane", "")).strip()
                hero = str(m.get("hero", "")).strip()[:40]
                tier = str(m.get("tier", "")).strip()
                patch = str(m.get("patch", "")).strip()[:24]
                notes = str(m.get("notes", "")).strip()[:350]
                if lane not in COMMUNITY_LANES or tier not in ("S", "A", "B") or not hero or not patch:
                    await send(nick, {"t": "community_error", "scope": "meta",
                                      "m": "Preencha herói, rota, nível e patch com valores válidos."})
                    continue
                recent = db.execute(
                    "SELECT COUNT(*) FROM community_meta WHERE author=? AND created_at>?",
                    (nick, time.time() - 600)
                ).fetchone()[0]
                if recent >= 5:
                    await send(nick, {"t": "community_error", "scope": "meta",
                                      "m": "Você já publicou várias indicações. Aguarde alguns minutos."})
                    continue
                duplicate = db.execute(
                    "SELECT 1 FROM community_meta WHERE author=? AND lane=? AND patch=? AND lower(hero)=lower(?)",
                    (nick, lane, patch, hero)
                ).fetchone()
                if duplicate:
                    await send(nick, {"t": "community_error", "scope": "meta",
                                      "m": "Você já publicou uma indicação deste herói, rota e patch."})
                    continue
                db.execute(
                    "INSERT INTO community_meta(author,lane,hero,tier,patch,notes,created_at) VALUES(?,?,?,?,?,?,?)",
                    (nick, lane, hero, tier, patch, notes, time.time())
                )
                db.commit()
                await send(nick, {"t": "community_saved", "scope": "meta",
                                  "m": "Indicação publicada para a comunidade."})
                await broadcast_community()
            elif t == "community_meta_vote":
                try:
                    entry_id = int(m.get("id"))
                except (TypeError, ValueError):
                    await send(nick, {"t": "community_error", "scope": "meta", "m": "Indicação inválida."})
                    continue
                value = m.get("value")
                entry = db.execute("SELECT author FROM community_meta WHERE id=?", (entry_id,)).fetchone()
                if not entry or entry["author"] == nick or type(value) is not int or value not in (-1, 1):
                    await send(nick, {"t": "community_error", "scope": "meta",
                                      "m": "Não é possível avaliar esta indicação."})
                    continue
                existing = db.execute(
                    "SELECT value FROM community_meta_votes WHERE meta_id=? AND voter=?", (entry_id, nick)
                ).fetchone()
                if existing and existing["value"] == value:
                    db.execute("DELETE FROM community_meta_votes WHERE meta_id=? AND voter=?", (entry_id, nick))
                else:
                    db.execute(
                        "INSERT INTO community_meta_votes(meta_id,voter,value,created_at) VALUES(?,?,?,?) "
                        "ON CONFLICT(meta_id,voter) DO UPDATE SET value=excluded.value,created_at=excluded.created_at",
                        (entry_id, nick, value, time.time())
                    )
                db.commit()
                await broadcast_community()
            elif t == "community_build_list":
                if not any(key in m for key in ("hero", "lane", "period", "sort")):
                    legacy_builds = community_build_list(nick, {"period": "all"}, "legacy")
                    await send(nick, {"t": "community_builds", "list": legacy_builds})
                    continue
                filters = normalize_community_build_filters(m)
                p["community_build_filters"] = filters
                payload = {"t": "community_builds", **community_build_lists(nick, filters)}
                if type(m.get("request_id")) is int:
                    payload["request_id"] = m["request_id"]
                await send(nick, payload)
            elif t == "community_build_submit":
                lane = str(m.get("lane", "")).strip()
                hero = str(m.get("hero", "")).strip()[:40]
                patch = str(m.get("patch", "")).strip()[:24]
                spell = str(m.get("spell", "")).strip()[:40]
                emblem = str(m.get("emblem", "")).strip()[:100]
                notes = str(m.get("notes", "")).strip()[:350]
                raw_items = str(m.get("items", ""))
                items = list(dict.fromkeys(item.strip()[:40] for item in raw_items.split(",") if item.strip()))
                if (lane not in COMMUNITY_LANES or not hero or not patch or not spell or not emblem
                        or len(raw_items) > 260 or not 3 <= len(items) <= 6):
                    await send(nick, {"t": "community_error", "scope": "builds",
                                      "m": "Preencha os dados e informe de 3 a 6 itens separados por vírgula."})
                    continue
                recent = db.execute(
                    "SELECT COUNT(*) FROM community_builds WHERE author=? AND created_at>?",
                    (nick, time.time() - 600)
                ).fetchone()[0]
                if recent >= 5:
                    await send(nick, {"t": "community_error", "scope": "builds",
                                      "m": "Você já publicou várias builds. Aguarde alguns minutos."})
                    continue
                db.execute(
                    "INSERT INTO community_builds(author,hero,lane,patch,spell,emblem,items,notes,created_at) "
                    "VALUES(?,?,?,?,?,?,?,?,?)",
                    (nick, hero, lane, patch, spell, emblem, json.dumps(items, ensure_ascii=False), notes, time.time())
                )
                db.commit()
                await send(nick, {"t": "community_saved", "scope": "builds",
                                  "m": "Build publicada para a comunidade."})
                await broadcast_community()
            elif t == "community_build_vote":
                try:
                    entry_id = int(m.get("id"))
                except (TypeError, ValueError):
                    await send(nick, {"t": "community_error", "scope": "builds", "m": "Build inválida."})
                    continue
                value = m.get("value")
                entry = db.execute("SELECT author FROM community_builds WHERE id=?", (entry_id,)).fetchone()
                if not entry or entry["author"] == nick or type(value) is not int or value not in (-1, 1):
                    await send(nick, {"t": "community_error", "scope": "builds",
                                      "m": "Não é possível avaliar esta build."})
                    continue
                existing = db.execute(
                    "SELECT value FROM community_build_votes WHERE build_id=? AND voter=?", (entry_id, nick)
                ).fetchone()
                if existing and existing["value"] == value:
                    db.execute("DELETE FROM community_build_votes WHERE build_id=? AND voter=?", (entry_id, nick))
                else:
                    db.execute(
                        "INSERT INTO community_build_votes(build_id,voter,value,created_at) VALUES(?,?,?,?) "
                        "ON CONFLICT(build_id,voter) DO UPDATE SET value=excluded.value,created_at=excluded.created_at",
                        (entry_id, nick, value, time.time())
                    )
                db.commit()
                await broadcast_community()
            elif t == "tournament_list":
                await send(nick, {"t": "tournaments", "list": tournament_list(nick)})
            elif t in ("tournament_save", "tournament_delete"):
                if not (is_admin(nick) or is_dev(nick)):
                    await send(nick, {"t": "tournament_error", "m": "Você não tem permissão para administrar torneios."})
                    continue
                tournament_id = m.get("id")
                if t == "tournament_delete":
                    try:
                        tournament_id = int(tournament_id)
                    except (TypeError, ValueError):
                        await send(nick, {"t": "tournament_error", "m": "Torneio inválido."})
                        continue
                    if not db.execute("SELECT 1 FROM tournaments WHERE id=?", (tournament_id,)).fetchone():
                        await send(nick, {"t": "tournament_error", "m": "Esse torneio não existe mais."})
                        continue
                    db.execute("DELETE FROM tournament_entries WHERE tournament_id=?", (tournament_id,))
                    db.execute("DELETE FROM tournaments WHERE id=?", (tournament_id,))
                    db.commit()
                    await send(nick, {"t": "tournament_saved", "m": "Torneio removido."})
                    await broadcast_tournaments()
                    continue

                title = str(m.get("title", "")).strip()[:80]
                description = str(m.get("description", "")).strip()[:500]
                game = str(m.get("game", "")).strip()[:60]
                tournament_format = str(m.get("format", "")).strip()[:40]
                prize = str(m.get("prize", "")).strip()[:120]
                winner = str(m.get("winner", "")).strip()[:80]
                status = str(m.get("status", "scheduled")).strip()
                if not title or not game or not tournament_format:
                    await send(nick, {"t": "tournament_error", "m": "Preencha o nome, o jogo e o formato do torneio."})
                    continue
                try:
                    start_at = parse_tournament_datetime(str(m.get("start_at", "")).strip())
                    end_at = parse_tournament_datetime(str(m.get("end_at", "")).strip())
                    start_dt = datetime.datetime.fromisoformat(start_at)
                    end_dt = datetime.datetime.fromisoformat(end_at)
                    max_teams = int(m.get("max_teams", 16))
                except (TypeError, ValueError, OverflowError):
                    await send(nick, {"t": "tournament_error", "m": "Informe datas válidas e um limite de equipes válido."})
                    continue
                if end_dt <= start_dt:
                    await send(nick, {"t": "tournament_error", "m": "O término precisa ser depois do início."})
                    continue
                if not 1 <= max_teams <= 256:
                    await send(nick, {"t": "tournament_error", "m": "O limite deve ser entre 1 e 256 equipes."})
                    continue
                if status not in ("scheduled", "live", "completed", "cancelled"):
                    await send(nick, {"t": "tournament_error", "m": "Selecione um status válido."})
                    continue
                if status == "completed" and not winner:
                    await send(nick, {"t": "tournament_error", "m": "Informe a equipe vencedora para encerrar o torneio."})
                    continue
                fields = (title, description, game, tournament_format, start_at, end_at,
                          prize, max_teams, status, winner)
                if tournament_id in (None, ""):
                    db.execute(
                        "INSERT INTO tournaments(title,description,game,format,start_at,end_at,prize,max_teams,status,winner,created_by,updated_at) "
                        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                        (*fields, nick, time.time())
                    )
                    message = "Torneio cadastrado e publicado."
                else:
                    try:
                        tournament_id = int(tournament_id)
                    except (TypeError, ValueError):
                        await send(nick, {"t": "tournament_error", "m": "Torneio inválido."})
                        continue
                    if not db.execute("SELECT 1 FROM tournaments WHERE id=?", (tournament_id,)).fetchone():
                        await send(nick, {"t": "tournament_error", "m": "Esse torneio não existe mais."})
                        continue
                    db.execute(
                        "UPDATE tournaments SET title=?,description=?,game=?,format=?,start_at=?,end_at=?,prize=?,"
                        "max_teams=?,status=?,winner=?,updated_at=? WHERE id=?",
                        (*fields, time.time(), tournament_id)
                    )
                    message = "Torneio atualizado."
                db.commit()
                await send(nick, {"t": "tournament_saved", "m": message})
                await broadcast_tournaments()
            elif t == "tournament_register":
                try:
                    tournament_id = int(m.get("id"))
                except (TypeError, ValueError):
                    await send(nick, {"t": "tournament_error", "m": "Torneio inválido."})
                    continue
                tournament = db.execute("SELECT * FROM tournaments WHERE id=?", (tournament_id,)).fetchone()
                if not tournament:
                    await send(nick, {"t": "tournament_error", "m": "Esse torneio não está mais disponível."})
                    continue
                if tournament["status"] != "scheduled" or datetime.datetime.fromisoformat(
                        tournament["start_at"]) <= datetime.datetime.now(datetime.timezone.utc):
                    await send(nick, {"t": "tournament_error", "m": "As inscrições para este torneio estão encerradas."})
                    continue
                team = str(m.get("team", "")).strip()[:50]
                raw_players = str(m.get("players", "")).strip()
                team_players = list(dict.fromkeys(
                    player.strip()[:30] for player in raw_players.splitlines() if player.strip()
                ))[:5]
                if not team:
                    await send(nick, {"t": "tournament_error", "m": "Informe o nome da equipe."})
                    continue
                existing_entry = db.execute(
                    "SELECT id FROM tournament_entries WHERE tournament_id=? AND nick=?",
                    (tournament_id, nick)
                ).fetchone()
                duplicate_team = db.execute(
                    "SELECT 1 FROM tournament_entries WHERE tournament_id=? AND LOWER(team)=LOWER(?) AND nick<>?",
                    (tournament_id, team, nick)
                ).fetchone()
                count = db.execute(
                    "SELECT COUNT(*) FROM tournament_entries WHERE tournament_id=?", (tournament_id,)
                ).fetchone()[0]
                if duplicate_team:
                    await send(nick, {"t": "tournament_error", "m": "Esse nome de equipe já está inscrito."})
                    continue
                if not existing_entry and count >= tournament["max_teams"]:
                    await send(nick, {"t": "tournament_error", "m": "As vagas para este torneio já foram preenchidas."})
                    continue
                db.execute(
                    "INSERT INTO tournament_entries(tournament_id,nick,team,players,created_at) VALUES(?,?,?,?,?) "
                    "ON CONFLICT(tournament_id,nick) DO UPDATE SET team=excluded.team,players=excluded.players,created_at=excluded.created_at",
                    (tournament_id, nick, team, "\n".join(team_players), time.time())
                )
                db.commit()
                await send(nick, {"t": "tournament_saved", "m": "Inscrição da equipe salva."})
                await broadcast_tournaments()
            elif t == "dm_threads":
                await send(nick, {"t": "dm_threads", "list": threads(nick), "unread": unread(nick)})
            elif t == "dm_open":
                other = str(m.get("with", "")).lower()
                if get_user(other) and other != nick:
                    msgs = db.execute(
                        "SELECT id, a, m, ts FROM dm WHERE (a=? AND b=?) OR (a=? AND b=?) ORDER BY id DESC LIMIT 50",
                        (nick, other, other, nick)
                    ).fetchall()[::-1]
                    reactions_map = dm_reactions_for([row["id"] for row in msgs])
                    db.execute("UPDATE dm SET seen=1 WHERE a=? AND b=?", (other, nick))
                    db.commit()
                    await send(nick, {
                        "t": "dm_history",
                        "nick": other,
                        "name": get_user(other)["display"],
                        "profile": profile(other, nick),
                        "msgs": [
                            {
                                "id": row["id"],
                                "from": row["a"],
                                "m": row["m"],
                                "ts": row["ts"],
                                "reactions": reactions_map.get(row["id"], []),
                            }
                            for row in msgs
                        ],
                    })
            elif t == "dm_seen":
                db.execute("UPDATE dm SET seen=1 WHERE a=? AND b=?", (str(m.get("nick", "")), nick))
                db.commit()
            elif t == "dm_send":
                other, text = str(m.get("to", "")).lower(), str(m.get("m", "")).strip()[:400]
                muted = mute_status(nick)
                if muted:
                    await send(nick, {"t": "moderation_notice", "m": "Sua conta está silenciada temporariamente.",
                                      "until": muted["muted_until"]})
                    continue
                if (not text or other == nick or not get_user(other) or time.time() - p["last_dm"] < 1
                        or db.execute("SELECT 1 FROM blocks WHERE a=? AND b=?", (other, nick)).fetchone()):
                    continue
                p["last_dm"] = time.time()
                if any(b in text.lower() for b in BAD):
                    text = "***"
                now = time.time()
                row = db.execute(
                    "INSERT INTO dm(a,b,m,ts) VALUES(?,?,?,?) RETURNING id",
                    (nick, other, text, now)
                ).fetchone()
                db.commit()
                new_id = row["id"] if row else None
                pkt = {"t": "dm", "id": new_id, "from": nick, "to": other, "m": text, "ts": now}
                await send(nick, pkt)
                if other in online:
                    await send(other, pkt)
            elif t == "dm_delete":
                try:
                    msg_id = int(m.get("id"))
                except (TypeError, ValueError):
                    continue
                row = db.execute("SELECT a FROM dm WHERE id=?", (msg_id,)).fetchone()
                if not row or row["a"] != nick:
                    continue
                db.execute("DELETE FROM dm WHERE id=?", (msg_id,))
                try:
                    db.execute("DELETE FROM dm_reactions WHERE dm_id=?", (msg_id,))
                except Exception:
                    pass
                db.commit()
                for target in list(online):
                    await send(target, {"t": "dm_deleted", "id": msg_id})
            elif t == "dm_react":
                try:
                    msg_id = int(m.get("id"))
                except (TypeError, ValueError):
                    continue
                emoji = str(m.get("emoji", "")).strip()
                if not emoji or len(emoji) > 8:
                    continue
                row = db.execute("SELECT a, b FROM dm WHERE id=?", (msg_id,)).fetchone()
                if not row or nick not in (row["a"], row["b"]):
                    continue
                existing = db.execute(
                    "SELECT emoji FROM dm_reactions WHERE dm_id=? AND voter=?",
                    (msg_id, nick)
                ).fetchone()
                if existing and existing["emoji"] == emoji:
                    db.execute("DELETE FROM dm_reactions WHERE dm_id=? AND voter=?", (msg_id, nick))
                    outgoing = ""
                else:
                    db.execute(
                        "INSERT INTO dm_reactions(dm_id,voter,emoji,created_at) VALUES(?,?,?,?) "
                        "ON CONFLICT(dm_id,voter) DO UPDATE SET emoji=excluded.emoji,created_at=excluded.created_at",
                        (msg_id, nick, emoji, time.time())
                    )
                    outgoing = emoji
                db.commit()
                payload = {"t": "dm_reacted", "id": msg_id, "voter": nick, "emoji": outgoing}
                await send(nick, payload)
                other = row["b"] if row["a"] == nick else row["a"]
                if other in online:
                    await send(other, payload)
            elif t == "block":
                target = str(m.get("nick", "")).strip().lower()
                if target and target != nick and get_user(target):
                    db.execute("INSERT INTO blocks(a,b) VALUES(?,?) ON CONFLICT DO NOTHING", (nick, target))
                    db.commit()
                    await send(nick, {"t": "block_result", "m": "Jogador bloqueado. Você não receberá mais mensagens dele."})
            elif t == "lfg_list":
                await send(nick, {"t": "lfg", "list": lfg_list()})
            elif t == "lfg_post":
                f = [str(m.get(k, "")).strip()[:20] for k in ("rank", "role", "mode", "hour", "gid")]
                raw_win_rate = str(m.get("win_rate", "")).strip().replace(",", ".")
                raw_matches = str(m.get("matches", "")).strip()
                try:
                    win_rate = float(raw_win_rate) if raw_win_rate else None
                    matches = int(raw_matches) if raw_matches else None
                except ValueError:
                    await send(nick, {"t": "lfg_error", "m": "Confira o Win Rate e a quantidade de partidas."})
                    continue
                if (win_rate is not None and not 0 <= win_rate <= 100) or (
                        matches is not None and not 1 <= matches <= 10000000):
                    await send(nick, {"t": "lfg_error", "m": "O Win Rate deve ser de 0% a 100% e as partidas um número positivo."})
                    continue
                message = str(m.get("message", "")).strip()[:160]
                db.execute("DELETE FROM lfg WHERE nick=?", (nick,))
                db.execute("INSERT INTO lfg(nick,display,rank,role,mode,hour,gid,ts,win_rate,matches,message) "
                           "VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                           (nick, get_user(nick)["display"], *f, time.time(), win_rate, matches, message))
                db.commit()
                await broadcast({"t": "lfg", "list": lfg_list()})
            elif t == "lfg_del":
                db.execute("DELETE FROM lfg WHERE nick=?", (nick,))
                db.commit()
                await broadcast({"t": "lfg", "list": lfg_list()})
            elif t == "quiz_answer":
                if not quiz_state(nick)["done"]:
                    q = QUIZ[quiz_idx()]
                    ok = m.get("i") == q["a"]
                    db.execute("INSERT INTO quiz_done(nick,day) VALUES(?,?) ON CONFLICT DO NOTHING", (nick, str(datetime.date.today())))
                    db.commit()
                    add_activity(nick, "quiz", "Respondeu ao quiz do dia" + (" corretamente" if ok else ""))
                    if ok: add_coins(nick, 10)
                    await send(nick, {"t": "quiz_result", "ok": ok, "correct": q["a"]})
                    await send(nick, {"t": "me", **me(nick)})
            elif t == "buy":
                item, u = SHOP.get(m.get("id")), get_user(nick)
                owned = json.loads(u["owned"])
                if item and m["id"] not in owned and u["coins"] >= item["price"]:
                    owned.append(m["id"])
                    db.execute("UPDATE users SET coins=coins-?, owned=? WHERE nick=?",
                               (item["price"], json.dumps(owned), nick))
                    db.commit()
                await send(nick, {"t": "me", **me(nick)})
            elif t == "equip":
                item, u = SHOP.get(m.get("id")), get_user(nick)
                if item and m["id"] in json.loads(u["owned"]):
                    eq = json.loads(u["equip"])
                    if m.get("off") and item["slot"] == "hat": eq.pop("hat", None)
                    else: eq[item["slot"]] = m["id"]
                    db.execute("UPDATE users SET equip=? WHERE nick=?", (json.dumps(eq), nick))
                    db.commit()
                    await send(nick, {"t": "me", **me(nick)})
                    await bc_room(nick, {"t": "look", "nick": nick, "equip": eq})
    except IdentityError as error:
        await ws.send_text(json.dumps({"t": "error", "m": str(error)}))
        await ws.close(code=1008)
    except (WebSocketDisconnect, json.JSONDecodeError, KeyError, ValueError):
        pass
    finally:
        if nick and nick in online and online[nick].get("ws") is ws:
            await bc_room(nick, {"t": "leave", "nick": nick}, skip=nick)
            del online[nick]


# ═══════════════════════════════════════════════════════════
# REST (upload, busca, friends API, proxy, estáticos)
# ═══════════════════════════════════════════════════════════
@app.post("/api/dm/upload")
async def dm_upload(file: UploadFile = File(...)):
    if not file or not file.filename:
        raise HTTPException(400, "Nenhum arquivo enviado")

    content = await file.read()
    if not content:
        raise HTTPException(400, "Arquivo vazio")
    if len(content) > DM_MAX_SIZE:
        raise HTTPException(413, "Arquivo muito grande (máx 25 MB)")

    mime = (file.content_type or "").lower().strip()
    ext = Path(file.filename).suffix.lower()

    if mime not in DM_ALLOWED_TYPES:
        mime = DM_EXT_TO_MIME.get(ext, "")
        if not mime:
            raise HTTPException(415, "Tipo de arquivo não permitido")

    if not re.fullmatch(r"\.[a-z0-9]{1,6}", ext):
        ext = DM_MIME_TO_EXT.get(mime, ".bin")

    safe_name = f"{uuid.uuid4().hex}{ext}"
    target = UPLOAD_DIR / safe_name
    try:
        target.write_bytes(content)
    except Exception as exc:
        print(f"⚠️ [dm-upload] falha ao salvar: {exc}")
        raise HTTPException(500, "Não foi possível salvar o arquivo")

    display_name = re.sub(r"[^\w\-. ]", "_", file.filename)[:120]
    return {
        "url": f"/static/uploads/dm/{safe_name}",
        "type": mime,
        "name": display_name,
        "size": len(content),
    }


@app.get("/api/users/search")
def users_search(q: str = "", viewer: str = ""):
    q = (q or "").strip()
    viewer = (viewer or "").strip().lower()
    if len(q) < 2:
        return []
    like = f"%{q.lower()}%"
    try:
        rows = db.execute(
            "SELECT nick, display, profile_data FROM users "
            "WHERE LOWER(nick) LIKE ? OR LOWER(display) LIKE ? "
            "ORDER BY LENGTH(display) ASC, display ASC LIMIT 25",
            (like, like),
        ).fetchall()
    except Exception as exc:
        print(f"⚠️ [users-search] erro: {exc}")
        return []

    result = []
    for row in rows:
        other = row["nick"]
        if viewer and other == viewer:
            continue
        data = json.loads(row["profile_data"] or "{}")
        avatar = data.get("avatar", "")
        fs = friendship_status(viewer, other) if viewer else "none"
        result.append({
            "id": other,
            "nick": other,
            "username": other,
            "name": data.get("display_name") or row["display"],
            "avatar": avatar,
            "isFriend": fs == "friends",
            "friendship_status": fs,
        })
    return result


@app.get("/api/friends/list")
def friends_list_api(viewer: str = ""):
    viewer = (viewer or "").strip().lower()
    if not viewer:
        return {"friends": [], "incoming": [], "outgoing": []}
    return {
        "friends": friends_list(viewer),
        "incoming": incoming_requests(viewer),
        "outgoing": outgoing_requests(viewer),
    }


# ═══════════════════════════════════════════════════════════
# Proxy de imagens
# ═══════════════════════════════════════════════════════════
_IMG_HOSTS_PERMITIDOS = {
    "akmweb.youngjoygame.com",
    "esportpedia.b-cdn.net",
    "static.wikia.nocookie.net",
    "cdn.mobilelegends.com",
}

_IMG_HEADERS = {
    "Referer": "https://www.mobilelegends.com/",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "image/avif,image/webp,image/apng,image/png,image/*,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
}

_img_cache: dict[str, tuple[bytes, str]] = {}
_IMG_CACHE_MAX = 2000


@app.get("/api/img")
async def proxy_img(url: str = Query(..., min_length=8)):
    host = (urlparse(url).hostname or "").lower()
    if host not in _IMG_HOSTS_PERMITIDOS:
        raise HTTPException(400, "host não permitido")

    if url in _img_cache:
        data, content_type = _img_cache[url]
        return Response(
            content=data,
            media_type=content_type,
            headers={"Cache-Control": "public, max-age=604800, immutable"},
        )

    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as cli:
            r = await cli.get(url, headers=_IMG_HEADERS)
    except httpx.RequestError as exc:
        print(f"⚠️ [img-proxy] erro upstream: {url} → {exc}")
        raise HTTPException(502, f"upstream error: {exc}")

    if r.status_code != 200:
        print(f"⚠️ [img-proxy] upstream {r.status_code}: {url}")
        raise HTTPException(r.status_code, f"upstream respondeu {r.status_code}")

    content_type = (r.headers.get("content-type") or "image/png").split(";")[0].strip()
    data = r.content

    if len(_img_cache) >= _IMG_CACHE_MAX:
        try:
            _img_cache.pop(next(iter(_img_cache)))
        except StopIteration:
            pass

    _img_cache[url] = (data, content_type)
    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=604800, immutable"},
    )


@app.get("/sw.js")
def sw(): return FileResponse("static/sw.js", media_type="application/javascript")


@app.get("/manifest.json")
def manifest(): return FileResponse("static/manifest.json", media_type="application/manifest+json")


@app.get("/")
def index(): return FileResponse("static/index.html")

app.mount("/static", StaticFiles(directory="static"), name="static")