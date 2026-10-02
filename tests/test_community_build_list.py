import json
import sqlite3
import time
import unittest

import server


class CommunityBuildListTests(unittest.TestCase):
    def setUp(self):
        self.original_db = server.db
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        server.db = self.db
        self.db.executescript("""
            CREATE TABLE users(
                nick TEXT PRIMARY KEY,
                display TEXT,
                profile_data TEXT DEFAULT '{}',
                joined_at TEXT DEFAULT '',
                coins INTEGER DEFAULT 0
            );
            CREATE TABLE quiz_done(nick TEXT, day TEXT);
            CREATE TABLE activity(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nick TEXT NOT NULL,
                kind TEXT NOT NULL,
                detail TEXT NOT NULL,
                ts REAL NOT NULL
            );
            CREATE TABLE community_builds(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                author TEXT NOT NULL,
                hero TEXT NOT NULL,
                lane TEXT NOT NULL,
                patch TEXT NOT NULL,
                spell TEXT NOT NULL,
                emblem TEXT NOT NULL,
                items TEXT NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                created_at REAL NOT NULL
            );
            CREATE TABLE community_build_votes(
                build_id INTEGER NOT NULL,
                voter TEXT NOT NULL,
                value INTEGER NOT NULL,
                created_at REAL NOT NULL,
                PRIMARY KEY(build_id, voter)
            );
        """)
        for nick in ("builder", "voter_one", "voter_two", "voter_three", "campos"):
            self.db.execute(
                "INSERT INTO users(nick,display,profile_data) VALUES(?,?,?)",
                (nick, nick, "{}"),
            )
        now = time.time()
        self.builds = {}
        for hero, lane, age_days in (
            ("Miya", "Gold", 1),
            ("Layla", "Gold", 2),
            ("Fanny", "Jungle", 45),
        ):
            cursor = self.db.execute(
                "INSERT INTO community_builds(author,hero,lane,patch,spell,emblem,items,notes,created_at) "
                "VALUES(?,?,?,?,?,?,?,?,?)",
                ("builder", hero, lane, "2.1", "Flicker", "Assassino",
                 json.dumps(["Botas", "Lâmina", "Armadura"]), "Contexto da build",
                 now - age_days * 86400),
            )
            self.builds[hero] = cursor.lastrowid
        self.db.executemany(
            "INSERT INTO community_build_votes(build_id,voter,value,created_at) VALUES(?,?,?,?)",
            [
                (self.builds["Miya"], "voter_one", 1, now - 2 * 86400),
                (self.builds["Miya"], "voter_two", 1, now - 8 * 86400),
                (self.builds["Layla"], "voter_one", 1, now - 86400),
                (self.builds["Layla"], "voter_two", -1, now - 86400),
            ],
        )
        self.db.commit()

    def tearDown(self):
        server.db = self.original_db
        self.db.close()

    def test_filters_sorting_and_period_vote_counts(self):
        filters = {"hero": "Mi", "lane": "Gold", "period": "30d", "sort": "popular"}
        result = server.community_build_lists("voter_one", filters)
        self.assertEqual([entry["hero"] for entry in result["trending"]], ["Miya"])
        self.assertEqual(result["trending"][0]["helpful_30d"], 2)
        self.assertEqual(result["trending"][0]["helpful_7d"], 1)
        self.assertEqual(result["trending"][0]["my_vote"], 1)
        self.assertEqual(result["filters"], filters)

        seven_day_builds = server.community_build_list("voter_one", {"period": "7d"})
        self.assertEqual({entry["hero"] for entry in seven_day_builds}, {"Miya", "Layla"})
        recent = server.community_build_list("voter_one", {"period": "all"}, "recent")
        self.assertEqual([entry["hero"] for entry in recent], ["Miya", "Layla", "Fanny"])

    def test_legacy_order_and_response_fields_are_preserved(self):
        builds = server.community_build_list("voter_three", {"period": "all"}, "legacy")
        self.assertEqual([entry["hero"] for entry in builds], ["Miya", "Layla", "Fanny"])
        self.assertEqual(builds[0]["author"], "builder")
        self.assertEqual(builds[0]["items"], ["Botas", "Lâmina", "Armadura"])
        self.assertIn("created_at", builds[0])

    def test_profile_roles_are_assigned_by_server_identity(self):
        developer = server.profile("campos")
        member = server.profile("builder")
        self.assertEqual(developer["community_roles"], ["DEV", "MEMBRO"])
        self.assertEqual(member["community_roles"], ["MEMBRO"])


if __name__ == "__main__":
    unittest.main()
