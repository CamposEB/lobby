import os
import threading
import time
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "").strip()
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "").strip()
R2_ENDPOINT_URL = os.getenv("R2_ENDPOINT_URL", "").strip()
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME", "").strip()
DB_PATH = os.getenv("LOBBY_DB_PATH", "lobby.db")
BACKUP_INTERVAL = 300  # segundos entre uploads (5 min)

_s3_client = None
_lock = threading.Lock()


def _configured():
    return all([R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT_URL, R2_BUCKET_NAME])


def _get_s3_client():
    global _s3_client
    if _s3_client is None:
        if not _configured():
            raise RuntimeError("Credenciais do R2 não configuradas")
        _s3_client = boto3.client(
            service_name="s3",
            endpoint_url=R2_ENDPOINT_URL,
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            region_name="auto",
        )
    return _s3_client


def download_db():
    """Baixa o lobby.db do R2, se existir e ainda não houver local."""
    if not _configured():
        print("[persistence] R2 não configurado, pulando download")
        return
    if Path(DB_PATH).exists() and Path(DB_PATH).stat().st_size > 0:
        print("[persistence] Banco local já existe, mantendo")
        return
    try:
        s3 = _get_s3_client()
        s3.download_file(R2_BUCKET_NAME, "lobby.db", DB_PATH)
        print(f"[persistence] Banco baixado do R2 para {DB_PATH}")
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("404", "NoSuchKey"):
            print("[persistence] Nenhum backup no R2 ainda, iniciando banco vazio")
        else:
            print(f"[persistence] Erro ao baixar banco: {e}")
    except Exception as e:
        print(f"[persistence] Erro inesperado ao baixar banco: {e}")


def upload_db():
    """Faz upload do lobby.db para o R2."""
    if not _configured():
        return
    if not Path(DB_PATH).exists():
        return
    try:
        s3 = _get_s3_client()
        s3.upload_file(DB_PATH, R2_BUCKET_NAME, "lobby.db")
        print(f"[persistence] Banco enviado para o R2 em {time.strftime('%H:%M:%S')}")
    except Exception as e:
        print(f"[persistence] Erro ao enviar banco: {e}")


def start_backup_loop():
    """Thread em background que sobe o banco a cada BACKUP_INTERVAL segundos."""
    if not _configured():
        print("[persistence] R2 não configurado, backup automático desativado")
        return

    def loop():
        while True:
            time.sleep(BACKUP_INTERVAL)
            with _lock:
                upload_db()

    threading.Thread(target=loop, daemon=True).start()
    print(f"[persistence] Backup automático ativo (a cada {BACKUP_INTERVAL}s)")


def upload_on_shutdown():
    """Upload final antes do processo encerrar."""
    with _lock:
        upload_db()