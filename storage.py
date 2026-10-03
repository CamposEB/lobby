# storage.py
import os
from supabase import create_client, Client

_client = None
BUCKET = "avatars"

def _sb() -> Client:
    global _client
    if _client is None:
        _client = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_SERVICE_KEY"),
        )
    return _client

def upload_avatar(nick: str, file_bytes: bytes, ext: str = "jpg") -> str:
    path = f"{nick}.{ext}"
    sb = _sb()
    sb.storage.from_(BUCKET).upload(
        path, file_bytes,
        {"content-type": f"image/{ext}", "upsert": "true"},
    )
    return sb.storage.from_(BUCKET).get_public_url(path)

def delete_avatar(nick: str, ext: str = "jpg"):
    _sb().storage.from_(BUCKET).remove([f"{nick}.{ext}"])