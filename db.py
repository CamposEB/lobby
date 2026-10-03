# db.py
import os
import re
import psycopg2
import psycopg2.extras

DATABASE_URL = os.getenv("DATABASE_URL")


class Row(dict):
    __slots__ = ("_values",)
    def __init__(self, mapping):
        super().__init__(mapping)
        self._values = list(mapping.values())
    def __getitem__(self, key):
        if isinstance(key, int):
            return self._values[key]
        return super().__getitem__(key)


_INSERT_OR_IGNORE = re.compile(r"INSERT\s+OR\s+IGNORE\s+INTO", re.IGNORECASE)


def _translate(sql: str) -> str:
    sql = sql.replace("?", "%s")
    sql = sql.replace(
        "instr(lower(b.hero), lower(%s))>0",
        "position(lower(%s) in lower(b.hero))>0",
    )
    sql = sql.replace("hero=%s COLLATE NOCASE", "lower(hero)=lower(%s)")
    if _INSERT_OR_IGNORE.search(sql):
        sql = _INSERT_OR_IGNORE.sub("INSERT INTO", sql, count=1)
        sql = sql.rstrip().rstrip(";") + " ON CONFLICT DO NOTHING"
    return sql


class Cursor:
    def __init__(self, cur):
        self._cur = cur
    def fetchone(self):
        row = self._cur.fetchone()
        return Row(row) if row is not None else None
    def fetchall(self):
        return [Row(r) for r in self._cur.fetchall()]
    def __iter__(self):
        for r in self._cur:
            yield Row(r)
    @property
    def rowcount(self):
        return self._cur.rowcount


class Connection:
    def __init__(self, dsn: str):
        self._dsn = dsn
        self._conn = psycopg2.connect(dsn)

    def _reconnect(self):
        try:
            self._conn.close()
        except Exception:
            pass
        self._conn = psycopg2.connect(self._dsn)

    def execute(self, sql: str, params=()):
        if self._conn.closed:
            self._reconnect()
        try:
            cur = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(_translate(sql), params)
            return Cursor(cur)
        except psycopg2.OperationalError:
            # Conexão morreu (Render hiberna, pooler fecha idle) — reconecta uma vez e tenta de novo
            self._reconnect()
            cur = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(_translate(sql), params)
            return Cursor(cur)

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        try:
            self._conn.close()
        except Exception:
            pass


def connect() -> Connection:
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL não configurada")
    return Connection(DATABASE_URL)