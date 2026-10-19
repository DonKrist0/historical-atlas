import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_session
from app.models import Editor, EditorSession

router = APIRouter(prefix="/api/auth", tags=["auth"])
COOKIE = "chronicle_session"


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 600_000).hex()
    return f"pbkdf2_sha256${salt}${digest}"


def verify_password(password: str, encoded: str) -> bool:
    return hmac.compare_digest(hash_password(password, encoded.split("$")[1]), encoded)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


DUMMY_PASSWORD_HASH = hash_password("unused", "0" * 32)


def require_browser_header(request: Request):
    # Cross-origin forms cannot set this header; other origins need CORS approval.
    if request.headers.get("X-Requested-With") != "Chronicle":
        raise HTTPException(403, "Запрос не прошёл проверку безопасности.")


def current_editor(request: Request, session: Session = Depends(get_session)) -> Editor | None:
    token = request.cookies.get(COOKIE)
    if not token:
        return None
    return session.scalar(
        select(Editor).join(EditorSession).where(
            EditorSession.token_hash == token_hash(token),
            EditorSession.expires_at > datetime.now(UTC),
            Editor.is_active.is_(True),
        )
    )


def require_editor(
    editor: Editor | None = Depends(current_editor),
    _: None = Depends(require_browser_header),
) -> Editor:
    if editor is None:
        raise HTTPException(401, "Войдите как редактор, чтобы изменять данные.")
    return editor


def identity(editor: Editor | None):
    return {"username": editor.username if editor else None, "canEdit": editor is not None}


class LoginInput(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=1024)


@router.get("/me")
def me(response: Response, editor: Editor | None = Depends(current_editor)):
    response.headers["Cache-Control"] = "no-store"
    return identity(editor)


@router.post("/login", dependencies=[Depends(require_browser_header)])
def login(data: LoginInput, request: Request, response: Response,
          session: Session = Depends(get_session)):
    now = datetime.now(UTC)
    editor = session.scalar(select(Editor).where(
        Editor.username == data.username.strip().lower()
    ).with_for_update())
    # Use the same password work for unknown users to avoid a fast enumeration path.
    encoded = editor.password_hash if editor else DUMMY_PASSWORD_HASH
    valid = verify_password(data.password, encoded)
    locked = editor and editor.locked_until and editor.locked_until.replace(tzinfo=UTC) > now
    if not editor or not editor.is_active or not valid or locked:
        if editor and not locked:
            editor.failed_attempts += 1
            if editor.failed_attempts >= 5:
                editor.locked_until = now + timedelta(minutes=5)
                editor.failed_attempts = 0
            session.commit()
        raise HTTPException(
            401, "Неверный логин или пароль. После нескольких ошибок подождите 5 минут."
        )
    editor.failed_attempts = 0
    editor.locked_until = None
    session.execute(delete(EditorSession).where(EditorSession.expires_at <= now))
    old_token = request.cookies.get(COOKIE)
    if old_token:
        session.execute(delete(EditorSession).where(
            EditorSession.token_hash == token_hash(old_token)
        ))
    token = secrets.token_urlsafe(32)
    seconds = get_settings().session_hours * 3600
    session.add(EditorSession(token_hash=token_hash(token), editor_id=editor.id,
                              expires_at=now + timedelta(seconds=seconds)))
    session.commit()
    response.set_cookie(COOKIE, token, max_age=seconds, httponly=True,
                        secure=get_settings().cookie_secure, samesite="lax", path="/api")
    response.headers["Cache-Control"] = "no-store"
    return identity(editor)


@router.post("/logout", dependencies=[Depends(require_browser_header)])
def logout(request: Request, response: Response, session: Session = Depends(get_session)):
    token = request.cookies.get(COOKIE)
    if token:
        session.execute(delete(EditorSession).where(EditorSession.token_hash == token_hash(token)))
        session.commit()
    response.delete_cookie(COOKIE, path="/api", httponly=True,
                           secure=get_settings().cookie_secure, samesite="lax")
    response.headers["Cache-Control"] = "no-store"
    return identity(None)
