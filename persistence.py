import os
import sqlite3
import threading
import time
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError


def _env(name, default=""):
    # remove espaços, quebras de linha e aspas coladas por engano
    return os.getenv(name, default).strip().strip("\"'").strip()


R2_ACCESS_KEY_ID = _env("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = _env("R2_SECRET_ACCESS_KEY")
R2_ENDPOINT_URL = _env("R2_ENDPOINT_URL")
R2_BUCKET_NAME = _env("R2_BUCKET_NAME")
DB_PATH = _env("LOBBY_DB_PATH", "lobby.db")

KEY_LATEST = "lobby.db"
HISTORY_PREFIX = "history/"
BACKUP_INTERVAL = 300      # backup de segurança a cada 5 min mesmo sem escrita
DEBOUNCE_SECONDS = 8       # espera 8s após a última escrita antes de subir
HISTORY_INTERVAL = 3600    # guarda uma cópia datada por hora
KEEP_HISTORY = 24          # quantas cópias datadas manter
RETRY_DELAY = 30           # espera após falha de upload

_s3_client = None
_upload_lock = threading.Lock()   # só serializa uploads; não bloqueia notify_write
_last_write = 0.0
_sync_ready = False               # só vira True depois de confirmar o estado do R2


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
                s3={"addressing_style": "path"},
                request_checksum_calculation="when_required",
                response_checksum_validation="when_required",
                retries={"max_attempts": 3, "mode": "standard"},
                connect_timeout=10,
                read_timeout=60,
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


def _is_valid_sqlite(path):
    try:
        con = sqlite3.connect(path)
        try:
            return con.execute("PRAGMA quick_check").fetchone()[0] == "ok"
        finally:
            con.close()
    except sqlite3.Error:
        return False


def _snapshot(dest):
    """Cópia consistente do banco, mesmo com o app escrevendo."""
    src = sqlite3.connect(DB_PATH)
    try:
        dst = sqlite3.connect(dest)
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()


def _log_credentials_fingerprint():
    """Loga uma impressão digital (não reversível) para comparar com o valor local."""
    import hashlib
    fp = hashlib.sha256(R2_SECRET_ACCESS_KEY.encode()).hexdigest()[:8]
    print(f"[persistence] R2 key_id={R2_ACCESS_KEY_ID[:4]}...{R2_ACCESS_KEY_ID[-4:]} "
          f"(len {len(R2_ACCESS_KEY_ID)}) secret_sha256={fp} (len {len(R2_SECRET_ACCESS_KEY)}) "
          f"endpoint={R2_ENDPOINT_URL!r} bucket={R2_BUCKET_NAME!r}")


def download_db():
    """Baixa o lobby.db do R2 para um arquivo temporário e só então substitui o local.
    Chame ANTES de abrir o banco no app. Se o estado do R2 não puder ser confirmado,
    uploads ficam bloqueados para não sobrescrever o backup com um banco vazio."""
    global _sync_ready
    if not _configured():
        print("[persistence] R2 não configurado, pulando download")
        return
    _log_credentials_fingerprint()
    tmp = DB_PATH + ".download"
    try:
        s3 = _get_s3_client()
        s3.download_file(R2_BUCKET_NAME, KEY_LATEST, tmp)
        if not _is_valid_sqlite(tmp):
            print("[persistence] Backup baixado é inválido; uploads BLOQUEADOS até reiniciar")
            _cleanup(tmp)
            return
        os.replace(tmp, DB_PATH)
        _sync_ready = True
        print(f"[persistence] Banco baixado do R2 para {DB_PATH}")
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        _cleanup(tmp)
        if code in ("404", "NoSuchKey"):
            _sync_ready = True  # confirmado: ainda não existe backup
            print("[persistence] Nenhum backup no R2 ainda, iniciando banco local")
        else:
            print(f"[persistence] Erro ao baixar do R2 ({code}); mantendo banco local. "
                  f"Uploads BLOQUEADOS até reiniciar: {e}")
    except Exception as e:
        _cleanup(tmp)
        print(f"[persistence] Erro inesperado ao baixar; uploads BLOQUEADOS: {e}")


def _rotate_history(s3):
    resp = s3.list_objects_v2(Bucket=R2_BUCKET_NAME, Prefix=HISTORY_PREFIX)
    keys = sorted(o["Key"] for o in resp.get("Contents", []))
    for key in keys[:-KEEP_HISTORY]:
        s3.delete_object(Bucket=R2_BUCKET_NAME, Key=key)


def upload_db(history=False):
    """Retorna True se o upload deu certo."""
    if not _configured() or not Path(DB_PATH).exists():
        return False
    if not _sync_ready:
        print("[persistence] Upload bloqueado: estado do R2 não confirmado no startup")
        return False
    snap = DB_PATH + ".snapshot"
    try:
        _snapshot(snap)
        s3 = _get_s3_client()
        s3.upload_file(snap, R2_BUCKET_NAME, KEY_LATEST)
        if history:
            s3.upload_file(snap, R2_BUCKET_NAME,
                           f"{HISTORY_PREFIX}lobby-{time.strftime('%Y%m%d-%H%M%S')}.db")
            _rotate_history(s3)
        print(f"[persistence] Banco enviado para o R2 em {time.strftime('%H:%M:%S')}")
        return True
    except Exception as e:
        print(f"[persistence] Erro ao enviar banco: {e}")
        return False
    finally:
        _cleanup(snap)


def start_backup_loop():
    """Loop a cada 2s. Sobe o banco se:
       - houve escrita há pelo menos DEBOUNCE_SECONDS (upload rápido)
       - ou passou BACKUP_INTERVAL desde o último upload (segurança)"""
    if not _configured():
        print("[persistence] R2 não configurado, backup automático desativado")
        return

    def loop():
        global _last_write
        start = time.time()
        last_full = start          # não sobe imediatamente no startup
        last_history = start
        retry_after = 0.0
        while True:
            time.sleep(2)
            now = time.time()
            if now < retry_after:
                continue
            stamp = _last_write
            due_write = bool(stamp) and (now - stamp) >= DEBOUNCE_SECONDS
            due_full = (now - last_full) >= BACKUP_INTERVAL
            if not (due_write or due_full):
                continue
            want_history = (now - last_history) >= HISTORY_INTERVAL
            with _upload_lock:
                ok = upload_db(history=want_history)
            if ok:
                last_full = now
                if want_history:
                    last_history = now
                if _last_write == stamp:   # não apaga escrita feita durante o upload
                    _last_write = 0.0
            else:
                retry_after = now + RETRY_DELAY

    threading.Thread(target=loop, daemon=True).start()
    print(f"[persistence] Backup ativo (debounce {DEBOUNCE_SECONDS}s, full {BACKUP_INTERVAL}s)")


def upload_on_shutdown():
    with _upload_lock:
        upload_db(history=True)