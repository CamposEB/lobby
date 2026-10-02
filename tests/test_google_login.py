import secrets
import re
import unittest
from unittest import mock
from unittest.mock import PropertyMock

import server
from fastapi.testclient import TestClient
from identity_store import IdentityError
from google.api_core.exceptions import NotFound


class GoogleLoginTests(unittest.TestCase):
    def setUp(self):
        self.nick = "qa" + secrets.token_hex(4)
        self.extra_nicks = []
        self.pin = "2468"
        self.salt = secrets.token_hex(16)
        server.db.execute(
            "INSERT INTO users(nick,display,pin,pin_salt) VALUES(?,?,?,?)",
            (self.nick, self.nick, server.hash_pin(self.pin, self.salt), self.salt),
        )
        server.db.commit()
        self.patches = [
            mock.patch.object(
                type(server.identity_store), "firestore_configured",
                new_callable=PropertyMock, return_value=True,
            ),
            mock.patch.object(
                server.identity_store, "verify_google_token",
                return_value={"uid": "firebase-" + self.nick},
            ),
        ]
        for patcher in self.patches:
            patcher.start()
            self.addCleanup(patcher.stop)

    def tearDown(self):
        server.db.executemany(
            "DELETE FROM users WHERE nick=?",
            [(nick,) for nick in [self.nick, *self.extra_nicks]],
        )
        server.db.commit()

    def test_old_account_requires_one_time_legacy_credential_for_password_migration(self):
        with mock.patch.object(type(server.identity_store), "firestore_configured",
                               new_callable=PropertyMock, return_value=False), \
                mock.patch.object(server, "role_for", return_value="user"):
            with self.assertRaisesRegex(IdentityError, "PIN antigo uma única vez"):
                server.register_password_account({
                    "nick": self.nick, "password": "EscolhaUmaSenha!123",
                    "legacy_credential": "9999",
                })
            result = server.register_password_account({
                "nick": self.nick, "password": "EscolhaUmaSenha!123",
                "legacy_credential": self.pin,
            })
        self.assertEqual(result, (self.nick, "user", False))
        user = server.get_user(self.nick)
        self.assertTrue(server.verify_password(user, "EscolhaUmaSenha!123"))
        self.assertEqual(user["pin"], "")
        self.assertFalse(server.verify_legacy_credential(user, self.pin))

    def test_password_registration_and_login(self):
        store = server.identity_store
        new_nick = "new" + secrets.token_hex(4)
        self.extra_nicks.append(new_nick)
        with (
            mock.patch.object(store, "ensure_legacy_account") as ensure_account,
            mock.patch.object(store, "get_by_nick", return_value=None),
            mock.patch.object(server, "role_for", return_value="user"),
        ):
            result = server.register_password_account({
                "nick": new_nick, "password": "AcessoSeguro#2026",
                "legacy_credential": "",
            })
            self.assertEqual(result, (new_nick, "user", True))
            self.assertEqual(server.password_login_account({
                "nick": new_nick, "password": "AcessoSeguro#2026",
            }), (new_nick, "user", False))
            with self.assertRaisesRegex(IdentityError, "Senha incorreta"):
                server.password_login_account({"nick": new_nick, "password": "SenhaErrada#2026"})
        self.assertEqual(
            ensure_account.call_args_list,
            [mock.call(new_nick, "user"), mock.call(new_nick, "user")],
        )
        user = server.get_user(new_nick)
        self.assertNotEqual(user["password_hash"], "AcessoSeguro#2026")
        self.assertEqual(user["pin"], "")

    def test_new_google_user_needs_only_a_profile_name(self):
        store = server.identity_store
        created_accounts = []

        def create_account(uid, nick, role):
            created_accounts.append((uid, nick, role))
            return {"nick": nick, "role": role, "google_uid": uid}

        with (
            mock.patch.object(store, "get_by_uid", return_value=None),
            mock.patch.object(store, "create_google_account", side_effect=create_account),
        ):
            with self.assertRaises(server.GoogleProfileRequired) as pending:
                server.google_login_account({
                    "id_token": "test",
                    "allow_registration": True,
                    "suggested_profile_name": "Rafa",
                })
            self.assertEqual(pending.exception.suggested_name, "Rafa")
            nick, role, created = server.google_login_account({
                "id_token": "test",
                "allow_registration": True,
                "profile_name": "Rafa do MLBB",
            })

        self.extra_nicks.append(nick)
        self.assertTrue(re.fullmatch(r"[a-z0-9_]{3,14}", nick))
        self.assertEqual(created_accounts, [("firebase-" + self.nick, nick, "user")])
        self.assertEqual((role, created), ("user", True))
        user = server.get_user(nick)
        self.assertEqual(user["display"], "Rafa do MLBB")
        self.assertEqual(user["password_hash"], "")

    def test_password_login_is_available_when_legacy_login_is_disabled(self):
        store = server.identity_store
        new_nick = "new" + secrets.token_hex(4)
        self.extra_nicks.append(new_nick)
        with (
            mock.patch.object(type(store), "firestore_configured", new_callable=PropertyMock, return_value=False),
            mock.patch.object(server, "ALLOW_LEGACY_LOGIN", False),
            mock.patch.object(server, "role_for", return_value="user"),
        ):
            server.register_password_account({
                "nick": new_nick, "password": "AcessoSeguro#2026",
                "legacy_credential": "",
            })
            with TestClient(server.app) as client:
                with client.websocket_connect("/ws") as websocket:
                    websocket.send_json({
                        "t": "password_login",
                        "nick": new_nick,
                        "password": "AcessoSeguro#2026",
                    })
                    self.assertEqual(websocket.receive_json()["t"], "init")

    def test_google_registration_requests_only_the_profile_name(self):
        store = server.identity_store

        def create_account(uid, nick, role):
            return {"nick": nick, "role": role, "google_uid": uid}

        with (
            mock.patch.object(store, "get_by_uid", return_value=None),
            mock.patch.object(store, "create_google_account", side_effect=create_account),
            mock.patch.object(server, "role_for", return_value="user"),
            TestClient(server.app) as client,
        ):
            with client.websocket_connect("/ws") as websocket:
                websocket.send_json({
                    "t": "google_login",
                    "id_token": "test",
                    "allow_registration": True,
                    "suggested_profile_name": "Rafa",
                })
                prompt = websocket.receive_json()
                self.assertEqual(prompt, {
                    "t": "google_profile_required",
                    "suggested_name": "Rafa",
                })
                websocket.send_json({
                    "t": "google_profile_name",
                    "profile_name": "Rafa do MLBB",
                })
                initialized = websocket.receive_json()

        nick = initialized["self"]
        self.extra_nicks.append(nick)
        self.assertEqual(initialized["profile"]["display_name"], "Rafa do MLBB")
        self.assertEqual(server.get_user(nick)["password_hash"], "")

    def test_new_google_user_stores_chosen_password(self):
        store = server.identity_store
        new_nick = "new" + secrets.token_hex(4)
        self.extra_nicks.append(new_nick)
        with (
            mock.patch.object(store, "get_by_uid", return_value=None),
            mock.patch.object(store, "get_by_nick", return_value=None),
            mock.patch.object(
                store, "create_google_account",
                return_value={"nick": new_nick, "role": "user", "google_uid": "firebase-" + self.nick},
            ),
        ):
            nick, role, created = server.google_login_account(
                {"nick": new_nick, "password": "GoogleSenha#2026",
                 "legacy_credential": "", "id_token": "test"}
            )
        self.assertEqual((nick, role, created), (new_nick, "user", True))
        user = server.get_user(new_nick)
        self.assertTrue(server.verify_password(user, "GoogleSenha#2026"))
        self.assertEqual(user["pin"], "")

    def test_google_link_migrates_legacy_credential_once_and_sets_password(self):
        store = server.identity_store
        with (
            mock.patch.object(store, "get_by_uid", return_value=None),
            mock.patch.object(store, "get_by_nick", return_value=None),
            mock.patch.object(store, "ensure_legacy_account"),
            mock.patch.object(
                store, "link_legacy_account",
                return_value={"nick": self.nick, "role": "user", "google_uid": "firebase-" + self.nick},
            ) as link,
        ):
            result = server.google_login_account({
                "nick": self.nick,
                "password": "GoogleLinkPassword#2026",
                "legacy_credential": self.pin,
                "id_token": "test",
            })
        self.assertEqual(result, (self.nick, "user", False))
        self.assertTrue(server.verify_password(server.get_user(self.nick), "GoogleLinkPassword#2026"))
        self.assertEqual(server.get_user(self.nick)["pin"], "")
        link.assert_called_once_with("firebase-" + self.nick, self.nick)

    def test_different_google_uid_cannot_claim_legacy_nick(self):
        store = server.identity_store
        with (
            mock.patch.object(store, "get_by_uid", return_value=None),
            mock.patch.object(
                store, "get_by_nick",
                return_value={"nick": self.nick, "google_uid": "someone-else", "role": "user"},
            ),
        ):
            with self.assertRaisesRegex(IdentityError, "vinculado a outra"):
                server.google_login_account(
                    {"nick": self.nick, "password": "EscolhaUmaSenha!123",
                     "legacy_credential": self.pin, "id_token": "test"}
                )

    def test_linked_google_login_does_not_require_nick(self):
        store = server.identity_store
        with (
            mock.patch.object(
                store, "get_by_uid",
                return_value={"nick": self.nick, "role": "user", "google_uid": "firebase-" + self.nick},
            ),
            mock.patch.object(server, "role_for", return_value="user"),
        ):
            result = server.google_login_account({"nick": "", "password": "", "id_token": "test"})
        self.assertEqual(result, (self.nick, "user", False))

    def test_unregistered_google_login_explains_registration_tab(self):
        with mock.patch.object(server.identity_store, "get_by_uid", return_value=None):
            with self.assertRaisesRegex(IdentityError, "Criar conta"):
                server.google_login_account({"nick": "", "password": "", "id_token": "test"})

    def test_firestore_lookup_failures_are_reported_as_identity_errors(self):
        store = server.identity_store
        with mock.patch.object(store, "_db", side_effect=RuntimeError("connection failed")):
            with self.assertRaisesRegex(IdentityError, "consultar conta"):
                store.get_by_uid("firebase-user")
            with self.assertRaisesRegex(IdentityError, "consultar conta"):
                store.get_by_nick(self.nick)

    def test_missing_firestore_database_has_actionable_message(self):
        store = server.identity_store
        with mock.patch.object(store, "_db", side_effect=NotFound("database does not exist")):
            with self.assertRaisesRegex(IdentityError, "Crie o banco padrão"):
                store.get_by_nick(self.nick)


if __name__ == "__main__":
    unittest.main()
