"""Camada de dados do lobby sobre Firestore (substitui o SQLite).

- users: cache LRU em memória, gravação imediata (save_user) ou em lote (mark + flush).
- tournaments, community_meta, community_builds, community_reports, user_mutes, lfg:
  carregados na inicialização e mantidos em memória (write-through).
- dm_pairs/{a|b}/msgs e blocks: consultados direto no Firestore.
"""
import asyncio
import datetime
import logging
import re
import time
from collections import OrderedDict

from google.api_core.exceptions import AlreadyExists, NotFound
from google.cloud.firestore_v1 import Increment
from google.cloud.firestore_v1.base_query import FieldFilter

from identity_store import IdentityError, identity_store

log = logging.getLogger("lobby.db")

_fs = None
_last_id = 0
_tasks = set()

USERS = OrderedDict()   # nick -> dict
DIRTY = {}              # nick -> {campos pendentes de gravação}
USER_CACHE_MAX = 400
pinned = lambda nick: False  # main.py substitui: usuários online não saem do cache

TOURNAMENTS = {}        # id -> doc (com "entries": {nick: {team, players, created_at}})
META = {}               # id -> doc (com "votes": {nick: {"v": 1|-1, "ts": float}})
BUILDS = {}
REPORTS = {}
MUTES = {}              # nick -> doc
LFG = {}                # nick -> doc

NICK_RE = re.compile(r"[A-Za-z0-9_]{3,20}")


def init():
    """Chame dentro do event loop (lifespan)."""
    global _fs
    from firebase_admin import firestore_async
    _fs = firestore_async.client(identity_store._admin_auth())


def bg(coro):
    task = asyncio.create_task(coro)
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return task


def new_id():
    """ID numérico crescente (cabe em número JS)."""
    global _last_id
    _last_id = max(_last_id + 1, int(time.time() * 1000))
    return _last_id


def now_iso():
    return datetime.datetime.now().astimezone().isoformat(timespec="seconds")


# ---------- operações básicas ----------
async def put(coll, doc_id, data):
    await _fs.collection(coll).document(str(doc_id)).set(data)


async def patch(coll, doc_id, fields):
    await _fs.collection(coll).document(str(doc_id)).update(fields)


async def remove(coll, doc_id):
    await _fs.collection(coll).document(str(doc_id)).delete()


# ---------- usuários ----------
def _user_defaults(nick):
    return {
        "nick": nick, "display": nick, "pin": "", "pin_salt": "",
        "password_hash": "", "password_salt": "", "coins": 10,
        "owned": ["c_azul", "c_verde"], "equip": {"color": "c_azul"},
        "day": "", "earned": 0, "bio": "", "rank": "", "role": "", "hero": "", "gid": "",
        "profile_data": {}, "joined_at": "", "quizzes": 0, "quiz_last_day": "", "activity": [],
    }


def _evict():
    over = len(USERS) - USER_CACHE_MAX
    for nick in list(USERS):
        if over <= 0:
            break
        if nick in DIRTY or pinned(nick):
            continue
        del USERS[nick]
        over -= 1


async def get_user(nick):
    if not isinstance(nick, str) or not NICK_RE.fullmatch(nick) or nick.startswith("__"):
        return None
    if nick in USERS:
        USERS.move_to_end(nick)
        return USERS[nick]
    snap = await _fs.collection("users").document(nick).get()
    if not snap.exists:
        return None
    if nick in USERS:  # outra corrotina carregou enquanto esperávamos
        return USERS[nick]
    user = _user_defaults(nick)
    user.update(snap.to_dict())
    USERS[nick] = user
    _evict()
    return user


async def create_user(nick, display, **extra):
    user = _user_defaults(nick)
    user.update(display=display, joined_at=now_iso(), **extra)
    try:
        await _fs.collection("users").document(nick).create(user)
    except AlreadyExists as error:
        raise IdentityError("Esse nick já está em uso.") from error
    USERS[nick] = user
    _evict()
    return user


async def delete_user(nick):
    USERS.pop(nick, None)
    DIRTY.pop(nick, None)
    await remove("users", nick)


def mark(nick, *fields):
    DIRTY.setdefault(nick, set()).update(fields)


async def flush(nick=None):
    for n in ([nick] if nick else list(DIRTY)):
        fields = DIRTY.pop(n, None)
        user = USERS.get(n)
        if not fields or user is None:
            continue
        try:
            await patch("users", n, {f: user[f] for f in fields})
        except NotFound:
            log.warning("usuário %s não existe no Firestore; descartando gravação", n)
        except Exception:
            log.exception("falha ao gravar usuário %s; tentará de novo", n)
            DIRTY.setdefault(n, set()).update(fields)


async def save_user(nick, *fields):
    mark(nick, *fields)
    await flush(nick)


async def top_coins(limit=10):
    rows = []
    query = (_fs.collection("users").order_by("coins", direction="DESCENDING")
             .limit(limit).select(["display", "coins"]))
    async for snap in query.stream():
        data, live = snap.to_dict(), USERS.get(snap.id)
        rows.append({"display": (live or data).get("display", ""),
                     "coins": (live or data).get("coins", 0)})
    rows.sort(key=lambda r: r["coins"], reverse=True)
    return rows


# ---------- DMs ----------
def pair_id(a, b):
    return "|".join(sorted((a, b)))


async def dm_add(a, b, text):
    ts = time.time()
    ref = _fs.collection("dm_pairs").document(pair_id(a, b))
    await ref.collection("msgs").add({"from": a, "m": text, "ts": ts})
    await ref.set({"users": sorted([a, b]), "last": text, "last_ts": ts,
                   "unread": {b: Increment(1)}}, merge=True)


async def dm_history(a, b, limit=50):
    ref = _fs.collection("dm_pairs").document(pair_id(a, b))
    query = ref.collection("msgs").order_by("ts", direction="DESCENDING").limit(limit)
    return [snap.to_dict() async for snap in query.stream()][::-1]


async def dm_mark_seen(nick, other):
    ref = _fs.collection("dm_pairs").document(pair_id(nick, other))
    snap = await ref.get()
    if snap.exists and (snap.to_dict().get("unread") or {}).get(nick):
        await ref.set({"unread": {nick: 0}}, merge=True)


async def dm_pairs(nick):
    query = _fs.collection("dm_pairs").where(filter=FieldFilter("users", "array_contains", nick))
    rows = [snap.to_dict() async for snap in query.stream()]
    rows.sort(key=lambda r: r.get("last_ts", 0), reverse=True)
    return rows


async def is_blocked(blocker, target):
    return (await _fs.collection("blocks").document(f"{blocker}|{target}").get()).exists


async def add_block(blocker, target):
    await put("blocks", f"{blocker}|{target}", {"a": blocker, "b": target, "ts": time.time()})


# ---------- carga inicial ----------
async def _load(coll, target, defaults=None, limit=2000):
    query = _fs.collection(coll).order_by("created_at", direction="DESCENDING").limit(limit)
    async for snap in query.stream():
        try:
            doc = {**(defaults or {}), **snap.to_dict(), "id": int(snap.id)}
        except ValueError:
            continue
        target[doc["id"]] = doc


async def load_all():
    async for snap in _fs.collection("tournaments").stream():
        try:
            doc = {"entries": {}, **snap.to_dict(), "id": int(snap.id)}
        except ValueError:
            continue
        TOURNAMENTS[doc["id"]] = doc
    await _load("community_meta", META, {"votes": {}})
    await _load("community_builds", BUILDS, {"votes": {}})
    await _load("community_reports", REPORTS)

    now = time.time()
    async for snap in _fs.collection("user_mutes").stream():
        doc = snap.to_dict()
        if doc.get("muted_until", 0) <= now:
            await remove("user_mutes", snap.id)
        else:
            MUTES[snap.id] = {"nick": snap.id, **doc}

    cutoff = now - 10800
    async for snap in _fs.collection("lfg").where(filter=FieldFilter("ts", ">", cutoff)).stream():
        LFG[snap.id] = snap.to_dict()
    async for snap in _fs.collection("lfg").where(filter=FieldFilter("ts", "<=", cutoff)).stream():
        await remove("lfg", snap.id)
    log.info("Firestore carregado: %d torneios, %d metas, %d builds, %d denúncias",
             len(TOURNAMENTS), len(META), len(BUILDS), len(REPORTS))