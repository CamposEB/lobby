import contextlib
import io
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path

from migrate_sqlite_to_firestore import main, migrate_documents, read_sqlite_tables


class FakeDocumentSnapshot:
    def __init__(self, document_id, value):
        self.id = document_id
        self._value = value
        self.exists = value is not None

    def to_dict(self):
        return self._value


class FakeDocumentReference:
    def __init__(self, collection, document_id):
        self.collection = collection
        self.id = document_id

    def get(self):
        value = self.collection.documents.get(self.id)
        return FakeDocumentSnapshot(self.id, value)

    def set(self, value, merge=False):
        if merge:
            self.collection.documents[self.id] = {
                **self.collection.documents.get(self.id, {}),
                **value,
            }
        else:
            self.collection.documents[self.id] = value

    def create(self, value):
        if self.id in self.collection.documents:
            raise ValueError("already exists")
        self.collection.documents[self.id] = value

    def delete(self):
        self.collection.documents.pop(self.id, None)


class FakeCollection:
    def __init__(self):
        self.documents = {}

    def document(self, document_id):
        return FakeDocumentReference(self, str(document_id))


class FakeWriteBatch:
    def __init__(self):
        self.operations = []

    def set(self, reference, value):
        self.operations.append((reference, value))

    def commit(self):
        for reference, value in self.operations:
            reference.set(value)


class FakeDatabase:
    def __init__(self):
        self.collections = {}

    def collection(self, name):
        if name not in self.collections:
            self.collections[name] = FakeCollection()
        return self.collections[name]

    def batch(self):
        return FakeWriteBatch()


class SQLiteMigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.sqlite_path = Path(self.temp.name) / "source.sqlite"
        with sqlite3.connect(self.sqlite_path) as connection:
            connection.execute("CREATE TABLE users(nick TEXT PRIMARY KEY, display TEXT)")
            connection.execute("INSERT INTO users VALUES('player_one', 'Player')")
            connection.execute(
                "CREATE TABLE links(left_id TEXT, right_id TEXT, PRIMARY KEY(left_id,right_id))"
            )
            connection.execute("INSERT INTO links VALUES('a','b')")

    def tearDown(self):
        self.temp.cleanup()

    def test_reader_preserves_empty_tables_and_composite_primary_keys(self):
        with sqlite3.connect(self.sqlite_path) as connection:
            connection.execute("CREATE TABLE empty_table(id INTEGER PRIMARY KEY)")
        tables = read_sqlite_tables(self.sqlite_path)
        self.assertEqual(tables["users"][0]["_id"], "player_one")
        self.assertEqual(tables["links"][0]["_id"], "left_id:a|right_id:b")
        self.assertEqual(tables["empty_table"], [])

    def test_default_command_is_read_only_and_reports_counts(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            result = main(["--sqlite-path", str(self.sqlite_path)])
        self.assertEqual(result, 0)
        self.assertIn("DRY RUN (no writes)", output.getvalue())
        self.assertIn("users: 1 document(s)", output.getvalue())
        self.assertIn("configure Firebase Admin", output.getvalue())

    def test_apply_is_idempotent_and_seeds_legacy_role_documents(self):
        database = FakeDatabase()
        tables = read_sqlite_tables(self.sqlite_path)
        os.environ["LOBBY_ADMIN_NICKS"] = "player_one"
        self.addCleanup(os.environ.pop, "LOBBY_ADMIN_NICKS", None)
        first = migrate_documents(tables, database, batch_size=1)
        second = migrate_documents(tables, database, batch_size=1)
        self.assertEqual(first, second)
        self.assertEqual(len(database.collection("users").documents), 1)
        self.assertEqual(len(database.collection("accounts").documents), 1)
        account = database.collection("accounts").documents["player_one"]
        self.assertEqual(account["role"], "admin")
        self.assertNotIn("google_uid", account)

    def test_document_ids_are_firestore_safe(self):
        tables = {"paths": [{"_id": "folder/item", "value": 1}]}
        database = FakeDatabase()
        migrate_documents(tables, database)
        self.assertEqual(len(database.collection("paths").documents), 1)
        self.assertNotIn("/", next(iter(database.collection("paths").documents)))


if __name__ == "__main__":
    unittest.main()
