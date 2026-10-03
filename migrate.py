# migrate.py
# Migra os dados do SQLite (lobby.db) para o PostgreSQL do Supabase.
#
# Uso:
#   1. Configure DATABASE_URL (URL do Session pooler do Supabase)
#   2. python migrate.py
#
# Ordem das tabelas importa: users primeiro, dependentes depois.
# ON CONFLICT DO NOTHING torna o script idempotente.
import sqlite3
import sys

from db import connect

TABLES = [
    "users",
    "activity",
    "blocks",
    "dm",
    "lfg",
    "quiz_done",
    "tournaments",
    "tournament_entries",
    "user_mutes",
    "community_builds",
    "community_build_votes",
    "community_meta",
    "community_meta_votes",
    "community_reports",
]

SKIP_COLUMNS = {}


def main():
    try:
        src = sqlite3.connect("lobby.db")
    except sqlite3.Error as e:
        print(f"Erro ao abrir lobby.db: {e}")
        sys.exit(1)

    src.row_factory = sqlite3.Row
    dst = connect()

    total_geral = 0
    for table in TABLES:
        try:
            rows = src.execute(f"SELECT * FROM {table}").fetchall()
        except sqlite3.Error as e:
            print(f"{table}: tabela não encontrada no SQLite ({e})")
            continue

        if not rows:
            print(f"{table}: 0 linhas")
            continue

        skip = SKIP_COLUMNS.get(table, set())
        cols = [c for c in rows[0].keys() if c not in skip]
        colnames = ",".join(cols)
        placeholders = ",".join(["?"] * len(cols))
        sql = f"INSERT INTO {table}({colnames}) VALUES({placeholders}) ON CONFLICT DO NOTHING"

        inseridas = 0
        erros = 0
        for row in rows:
            try:
                dst.execute(sql, tuple(row[c] for c in cols))
                dst.commit()   # <-- commit por linha, para não perder nada
                inseridas += 1
            except Exception as e:
                dst.rollback()
                erros += 1
                print(f"  ! {table} {dict(row)} falhou: {type(e).__name__}: {e}")

        total_geral += inseridas
        sufixo = f" ({erros} erro(s))" if erros else ""
        print(f"{table}: {inseridas} linhas migradas{sufixo}")

    print(f"\nTotal: {total_geral} linhas migradas")
    src.close()
    dst.close()


if __name__ == "__main__":
    main()