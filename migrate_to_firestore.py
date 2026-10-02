"""
Migra todas as tabelas de lobby.db (SQLite) para o Firestore.

Uso:
    python migrate_to_firestore.py --dry-run      # simula
    python migrate_to_firestore.py                # executa
    python migrate_to_firestore.py --db outro.db  # banco alternativo
"""
import argparse
import json
import os
import sqlite3
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

import firebase_admin
from firebase_admin import credentials, firestore


# Prefixo "lobby_" evita colisão com coleções do identity_store
def collection_name(table: str) -> str:
    return f"lobby_{table}"


# Campos que guardam JSON serializado em string no SQLite
JSON_FIELDS = {
    "users": ("owned", "equip", "profile_data"),
    "tournament_entries": ("players",),  # tratado à parte (splitlines)
    "community_builds": ("items",),
}


def init_firestore():
    try:
        firebase_admin.get_app()
    except ValueError:
        cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
        if cred_path:
            firebase_admin.initialize_app(credentials.Certificate(cred_path))
        else:
            # Funciona no Render se você setar FIREBASE_CONFIG / GOOGLE_APPLICATION_CREDENTIALS_JSON
            firebase_admin.initialize_app()
    return firestore.client()


def open_sqlite(path: str) -> sqlite3.Connection:
    if not Path(path).exists():
        sys.exit(f"[erro] banco não encontrado: {path}")
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def doc_id_for(table: str, row: sqlite3.Row):
    """Retorna um ID determinístico quando faz sentido, senão None (auto-ID)."""
    r = dict(row)
    if table == "users":
        return r["nick"]
    if table == "quiz_done":
        return f"{r['nick']}__{r['day']}"
    if table == "blocks":
        return f"{r['a']}__{r['b']}"
    if table == "user_mutes":
        return r["nick"]
    if table == "community_meta_votes":
        return f"{r['meta_id']}__{r['voter']}"
    if table == "community_build_votes":
        return f"{r['build_id']}__{r['voter']}"
    if "id" in r and r["id"] is not None:
        return str(r["id"])
    return None


def serialize_row(table: str, row: sqlite3.Row) -> dict:
    out = {}
    json_fields = JSON_FIELDS.get(table, ())
    for key in row.keys():
        value = row[key]

        if key in json_fields and isinstance(value, str):
            try:
                out[key] = json.loads(value)
            except (json.JSONDecodeError, TypeError):
                out[key] = value
        elif table == "tournament_entries" and key == "players":
            out[key] = value.splitlines() if value else []
        elif key in ("created_at", "ts", "reviewed_at", "muted_until",
                     "updated_at", "joined_at"):
            # mantém como está — Firestore aceita float/str
            out[key] = value
        else:
            out[key] = value
    return out


def migrate_table(db, client, table: str, dry_run: bool, batch_size: int = 400) -> int:
    try:
        rows = db.execute(f"SELECT * FROM {table}").fetchall()
    except sqlite3.OperationalError:
        print(f"  · {table}: não existe no SQLite, pulando")
        return 0

    total = len(rows)
    if total == 0:
        print(f"  · {table}: vazia")
        return 0

    if dry_run:
        print(f"  · {table}: {total} linhas (dry-run)")
        return total

    coll = client.collection(collection_name(table))
    batch = client.batch()
    count_in_batch = 0
    written = 0

    for row in rows:
        data = serialize_row(table, row)
        doc_id = doc_id_for(table, row)
        ref = coll.document(doc_id) if doc_id else coll.document()
        batch.set(ref, data, merge=True)
        count_in_batch += 1
        written += 1

        if count_in_batch >= batch_size:
            batch.commit()
            batch = client.batch()
            count_in_batch = 0

    if count_in_batch:
        batch.commit()

    print(f"  ✓ {table}: {written}/{total} → {collection_name(table)}")
    return written


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default=os.getenv("LOBBY_DB_PATH", "lobby.db"))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--only", default="", help="migra só estas tabelas (vírgula)")
    args = parser.parse_args()

    client = init_firestore()
    db = open_sqlite(args.db)

    found = [r[0] for r in db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()]

    if args.only:
        wanted = {t.strip() for t in args.only.split(",") if t.strip()}
        found = [t for t in found if t in wanted]

    print(f"Banco: {args.db}")
    print(f"Tabelas: {', '.join(found)}")
    print(f"Modo: {'DRY-RUN' if args.dry_run else 'ESCRITA REAL'}")
    print()

    total = 0
    for table in found:
        total += migrate_table(db, client, table, args.dry_run)

    print()
    print(f"Total: {total} linha(s) {'simulada(s)' if args.dry_run else 'migrada(s)'}")


if __name__ == "__main__":
    main()