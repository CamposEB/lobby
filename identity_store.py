"""Firebase token verification and Firestore identity/role storage."""

import hashlib
import json
import os
import threading
from datetime import datetime, timezone

from google.api_core.exceptions import AlreadyExists, GoogleAPICallError, NotFound


class IdentityError(Exception):
    """A user-facing identity operation failed safely."""


class IdentityStore:
    def __init__(self):
        self._client = None
        self._firebase_app = None
        self._lock = threading.RLock()

    @property
    def firestore_configured(self):
        return bool(
            os.getenv("FIREBASE_ADMIN_CREDENTIALS_FILE", "").strip()
            or os.getenv("FIREBASE_ADMIN_CREDENTIALS_JSON", "").strip()
            or os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
            or os.getenv("FIREBASE_PROJECT_ID", "").strip()
        )

    def web_config(self):
        raw = os.getenv("FIREBASE_WEB_CONFIG", "").strip()
        if not raw:
            return None
        try:
            config = json.loads(raw)
        except json.JSONDecodeError as error:
            raise IdentityError("A configuração pública do Firebase está inválida.") from error
        required = ("apiKey", "authDomain", "projectId", "appId")
        if not isinstance(config, dict) or any(not config.get(key) for key in required):
            raise IdentityError("A configuração pública do Firebase está incompleta.")
        return {key: str(config[key]) for key in (*required, "measurementId") if config.get(key)}

    def _admin_auth(self):
        if self._firebase_app is not None:
            return self._firebase_app
        with self._lock:
            if self._firebase_app is not None:
                return self._firebase_app
            try:
                import firebase_admin
                from firebase_admin import credentials
            except ImportError as error:
                raise IdentityError("A dependência firebase-admin não está instalada no servidor.") from error

            credential_json = os.getenv("FIREBASE_ADMIN_CREDENTIALS_JSON", "").strip()
            credential_file = os.getenv("FIREBASE_ADMIN_CREDENTIALS_FILE", "").strip()
            project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip() or None
            try:
                if credential_json:
                    credential = credentials.Certificate(json.loads(credential_json))
                elif credential_file:
                    credential = credentials.Certificate(credential_file)
                else:
                    credential = credentials.ApplicationDefault()
                options = {"projectId": project_id} if project_id else None
                self._firebase_app = firebase_admin.initialize_app(
                    credential, options=options, name="society-mlbb-auth"
                )
            except (ValueError, json.JSONDecodeError) as error:
                raise IdentityError("A credencial privada do Firebase Admin está inválida.") from error
            except Exception as error:
                raise IdentityError("Não foi possível inicializar Firebase Admin.") from error
        return self._firebase_app

    def _db(self):
        if self._client is not None:
            return self._client
        with self._lock:
            if self._client is not None:
                return self._client
            try:
                from firebase_admin import firestore
                self._client = firestore.client(self._admin_auth())
            except IdentityError:
                raise
            except Exception as error:
                raise IdentityError("Não foi possível conectar ao Firebase Firestore.") from error
        return self._client

    @staticmethod
    def _account(document):
        if not document or not document.exists:
            return None
        account = document.to_dict()
        account["_id"] = document.id
        return account

    @staticmethod
    def _uid_document_id(uid):
        return hashlib.sha256(uid.encode("utf-8")).hexdigest()

    @staticmethod
    def _account_lookup_error(error):
        if isinstance(error, NotFound):
            return IdentityError(
                "O banco Cloud Firestore ainda não foi criado neste projeto Firebase. "
                "Crie o banco padrão (default) em Firebase Console > Firestore Database."
            )
        return IdentityError("Falha ao consultar conta no Firestore.")

    def verify_google_token(self, token):
        if not isinstance(token, str) or not token.strip() or len(token) > 10000:
            raise IdentityError("Token de autenticação inválido.")
        try:
            import firebase_admin
            from firebase_admin import auth
        except ImportError as error:
            raise IdentityError("A dependência firebase-admin não está instalada no servidor.") from error
        try:
            claims = auth.verify_id_token(token, app=self._admin_auth(), check_revoked=True)
        except auth.InvalidIdTokenError as error:
            raise IdentityError("A sessão do Google expirou ou não é válida. Entre novamente.") from error
        except firebase_admin.exceptions.FirebaseError as error:
            raise IdentityError("Não foi possível verificar sua sessão Google.") from error
        uid = claims.get("uid")
        if not isinstance(uid, str) or not uid or claims.get("email_verified") is False:
            raise IdentityError("Use uma conta Google verificada para entrar.")
        return {"uid": uid}

    def get_by_uid(self, uid):
        try:
            database = self._db()
            claim = database.collection("identity_uid_claims").document(
                self._uid_document_id(uid)
            ).get()
            if claim.exists:
                return self.get_by_nick(claim.to_dict().get("nick", ""))
            query = database.collection("accounts").where("google_uid", "==", uid).limit(1)
            return next((self._account(item) for item in query.stream()), None)
        except IdentityError:
            raise
        except Exception as error:
            raise self._account_lookup_error(error) from error

    def get_by_nick(self, nick):
        try:
            return self._account(self._db().collection("accounts").document(nick).get())
        except IdentityError:
            raise
        except Exception as error:
            raise self._account_lookup_error(error) from error

    def ensure_legacy_account(self, nick, role="user"):
        reference = self._db().collection("accounts").document(nick)
        try:
            reference.create({
                "nick": nick,
                "role": role,
                "created_at": datetime.now(timezone.utc),
                "source": "legacy",
            })
        except AlreadyExists:
            pass
        except GoogleAPICallError as error:
            raise IdentityError("Falha ao preparar a conta no Firestore.") from error
        return self._account(reference.get())

    def link_legacy_account(self, uid, nick):
        from firebase_admin import firestore

        database = self._db()
        account_ref = database.collection("accounts").document(nick)
        claim_ref = database.collection("identity_uid_claims").document(
            self._uid_document_id(uid)
        )
        try:
            transaction = database.transaction()

            @firestore.transactional
            def link(transaction):
                account_snapshot = account_ref.get(transaction=transaction)
                if not account_snapshot.exists:
                    raise IdentityError("A conta antiga não foi encontrada.")
                account = account_snapshot.to_dict()
                if account.get("google_uid") not in (None, "", uid):
                    raise IdentityError("Esta conta já está vinculada a outro Google.")
                claim = claim_ref.get(transaction=transaction)
                if claim.exists and claim.to_dict().get("nick") != nick:
                    raise IdentityError("Este Google já está vinculado a outra conta.")
                transaction.set(claim_ref, {"uid": uid, "nick": nick})
                transaction.update(account_ref, {
                    "google_uid": uid,
                    "linked_at": datetime.now(timezone.utc),
                })
                return {**account, "nick": nick, "google_uid": uid}

            return link(transaction)
        except IdentityError:
            raise
        except GoogleAPICallError as error:
            raise IdentityError("Falha ao vincular a conta ao Google no Firestore.") from error

    def create_google_account(self, uid, nick, role="user"):
        from firebase_admin import firestore

        database = self._db()
        account_ref = database.collection("accounts").document(nick)
        claim_ref = database.collection("identity_uid_claims").document(
            self._uid_document_id(uid)
        )
        now = datetime.now(timezone.utc)
        transaction = database.transaction()

        @firestore.transactional
        def create(transaction):
            if account_ref.get(transaction=transaction).exists:
                raise IdentityError("Este nick já está vinculado a outra conta.")
            if claim_ref.get(transaction=transaction).exists:
                raise IdentityError("Este Google já está vinculado a outra conta.")
            account = {
                "nick": nick,
                "google_uid": uid,
                "role": role,
                "created_at": now,
                "linked_at": now,
                "source": "google",
            }
            transaction.create(account_ref, account)
            transaction.create(claim_ref, {"uid": uid, "nick": nick})
            return {**account, "_id": nick}

        try:
            return create(transaction)
        except IdentityError:
            raise
        except GoogleAPICallError as error:
            raise IdentityError("Falha ao criar a conta no Firestore.") from error

    def delete_unfinished_account(self, uid):
        database = self._db()
        claim_ref = database.collection("identity_uid_claims").document(
            self._uid_document_id(uid)
        )
        claim = claim_ref.get()
        if not claim.exists:
            return
        nick = claim.to_dict().get("nick")
        account_ref = database.collection("accounts").document(nick)
        account = account_ref.get()
        if account.exists and account.to_dict().get("source") == "google":
            account_ref.delete()
            claim_ref.delete()

    def role_for(self, nick, fallback="user"):
        account = self.get_by_nick(nick)
        role = account.get("role") if account else None
        return role if role in ("user", "mod", "admin") else fallback

    def list_accounts(self):
        try:
            rows = self._db().collection("accounts").order_by("nick").limit(500).stream()
            return [{
                "nick": row.get("nick", row.id),
                "role": row.get("role", "user"),
                "google_linked": bool(row.get("google_uid")),
                "source": row.get("source", "legacy"),
            } for row in rows]
        except Exception as error:
            raise IdentityError("Falha ao listar contas no Firestore.") from error

    def set_role(self, nick, role):
        if role not in ("user", "mod", "admin"):
            raise IdentityError("Papel inválido.")
        database = self._db()
        reference = database.collection("accounts").document(nick)
        try:
            account = self._account(reference.get())
            if not account:
                raise IdentityError("Conta não encontrada no Firestore.")
            if account.get("role") == "admin" and role != "admin":
                admins = database.collection("accounts").where("role", "==", "admin").limit(2).stream()
                if len(list(admins)) <= 1:
                    raise IdentityError("Não é possível remover o único administrador.")
            reference.update({"role": role})
            return self._account(reference.get())
        except IdentityError:
            raise
        except Exception as error:
            raise IdentityError("Falha ao atualizar o papel da conta no Firestore.") from error


identity_store = IdentityStore()
