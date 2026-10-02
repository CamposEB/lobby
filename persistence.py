import os
import threading
import time
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "").strip()
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "").strip()
R2_ENDPOINT_URL = os.getenv("R2_ENDPOINT_URL", "").strip()
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME", "").strip()
DB_PATH = os.getenv("LOBBY_DB_PATH", "lobby.db")
BACKUP_INTERVAL = 300  # backup de segurança a cada 5 min mesmo sem escrita
DEBOUNCE_SECONDS = 8   # espera 8s após a última escrita antes de subir

_s3_client = None
_lock = threading.Lock()
_last_write = 0.0


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
            config=Config(
                signature_version="s3v4",
                s3={
                    "addressing_style": "path",
                    "payload_signing_enabled": False,  # ← ESSENCIAL
                },
                request_checksum_calculation="when_required",
                response_checksum_validation="when_required",
            ),
        )
    return _s3_client


def notify_write():
    """Chamado a cada commit do SQLite — agenda um upload após o debounce."""
    global _last_write
    _last_write = time.time()


def _cleanup(path):
    try:
        os.remove(path)
    except OSError:
        pass


def download_db():
    """Sempre baixa o lobby.db do R2, sobrescrevendo o local.
    Baixa para arquivo temporário primeiro, para não corromper o local se falhar."""
    if not _configured():
        print("[persistence] R2 não configurado, pulando download")
        return
    tmp = DB_PATH + ".download"
    try:
        s3 = _get_s3_client()
        s3.download_file(R2_BUCKET_NAME, "lobby.db", tmp)
        os.replace(tmp, DB_PATH)
        print(f"[persistence] Banco baixado do R2 para {DB_PATH}")
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("404", "NoSuchKey"):
            print("[persistence] Nenhum backup no R2 ainda, iniciando banco local")
        else:
            print(f"[persistence] Erro ao baixar do R2, mantendo banco local: {e}")
        _cleanup(tmp)
    except Exception as e:
        print(f"[persistence] Erro inesperado ao baixar: {e}")
        _cleanup(tmp)


def upload_db():
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
    """Loop que roda a cada 2s. Sobe o banco se:
       - Houve alguma escrita nos últimos DEBOUNCE_SECONDS (upload rápido)
       - Ou passou BACKUP_INTERVAL desde o último upload (segurança)"""
    if not _configured():
        print("[persistence] R2 não configurado, backup automático desativado")
        return

    def loop():
        global _last_write
        last_full = 0.0
        while True:
            time.sleep(2)
            now = time.time()
            with _lock:
                if _last_write and (now - _last_write) >= DEBOUNCE_SECONDS:
                    upload_db()
                    _last_write = 0.0
                    last_full = now
                elif (now - last_full) >= BACKUP_INTERVAL:
                    upload_db()
                    last_full = now

    threading.Thread(target=loop, daemon=True).start()
    print(f"[persistence] Backup ativo (debounce {DEBOUNCE_SECONDS}s, full {BACKUP_INTERVAL}s)")


def upload_on_shutdown():
    with _lock:
        upload_db()