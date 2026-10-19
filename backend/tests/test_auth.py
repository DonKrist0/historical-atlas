from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import COOKIE, hash_password, verify_password
from app.models import Editor, EditorSession

HEADER = {"X-Requested-With": "Chronicle"}
CREDENTIALS = {"username": "editor", "password": "test-editor-password"}
PERSON = {"name": "Тест", "start": 1380, "end": 1400, "group": "family"}


def test_password_hash():
    first = hash_password("a long password")
    second = hash_password("a long password")
    assert first != second
    assert verify_password("a long password", first)
    assert not verify_password("wrong", first)


def test_public_read_and_write_protection(anonymous_client):
    client = anonymous_client
    assert client.get("/api/auth/me").json() == {"username": None, "canEdit": False}
    assert len(client.get("/api/people").json()) == 9
    assert client.get("/api/people/dmitry").status_code == 200
    for method, path, data in [
        ("POST", "/api/people", PERSON),
        ("PUT", "/api/people/dmitry", PERSON),
        ("DELETE", "/api/people/dmitry", None),
        ("POST", "/api/people/import", {"people": [{"id": "dmitry", **PERSON}]}),
    ]:
        assert client.request(method, path, json=data, headers=HEADER).status_code == 401
    assert len(client.get("/api/people").json()) == 9
    client.cookies.set(COOKIE, "forged")
    assert client.post("/api/people", json=PERSON, headers=HEADER).status_code == 401


def test_login_logout_revokes_cookie(anonymous_client, editor, database):
    client = anonymous_client
    assert client.post("/api/auth/login", json=CREDENTIALS).status_code == 403
    response = client.post("/api/auth/login", json=CREDENTIALS, headers=HEADER)
    assert response.json() == {"username": "editor", "canEdit": True}
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=lax" in response.headers["set-cookie"]
    assert response.headers["cache-control"] == "no-store"
    token = client.cookies.get(COOKIE)
    with Session(database[0]) as session:
        stored = session.scalar(select(EditorSession))
        assert stored.token_hash != token
    assert client.get("/api/auth/me").json()["canEdit"]
    assert client.post("/api/people", json=PERSON).status_code == 403
    assert client.post("/api/people", json=PERSON, headers=HEADER).status_code == 201
    assert client.post("/api/auth/logout", headers=HEADER).status_code == 200
    client.cookies.set(COOKIE, token)
    assert not client.get("/api/auth/me").json()["canEdit"]
    assert client.post("/api/people", json=PERSON, headers=HEADER).status_code == 401


def test_failed_login_and_lockout(anonymous_client, editor, database):
    client = anonymous_client
    for _ in range(5):
        assert client.post("/api/auth/login", headers=HEADER, json={
            **CREDENTIALS, "password": "wrong",
        }).status_code == 401
    assert client.post("/api/auth/login", headers=HEADER, json=CREDENTIALS).status_code == 401
    with Session(database[0]) as session:
        session.get(Editor, editor).locked_until = datetime.now(UTC) - timedelta(seconds=1)
        session.commit()
    assert client.post("/api/auth/login", headers=HEADER, json=CREDENTIALS).status_code == 200


@pytest.mark.parametrize("reason", ["expired", "disabled", "revoked"])
def test_session_rechecked_on_every_write(client, editor, database, reason):
    with Session(database[0]) as session:
        stored = session.scalar(select(EditorSession))
        if reason == "expired":
            stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        elif reason == "disabled":
            session.get(Editor, editor).is_active = False
        else:
            session.delete(stored)
        session.commit()
    assert not client.get("/api/auth/me").json()["canEdit"]
    assert client.post("/api/people", json=PERSON).status_code == 401


def test_login_rotates_session(client):
    old_token = client.cookies.get(COOKIE)
    assert client.post("/api/auth/login", json=CREDENTIALS).status_code == 200
    assert client.cookies.get(COOKIE) != old_token
    client.cookies.set(COOKIE, old_token)
    assert not client.get("/api/auth/me").json()["canEdit"]


def test_unknown_account_and_cors(anonymous_client):
    client = anonymous_client
    assert client.post("/api/auth/login", json=CREDENTIALS, headers=HEADER).status_code == 401
    assert COOKIE not in client.cookies
    for origin, allowed in [("https://evil.example", False), ("http://localhost:3000", True)]:
        response = client.options("/api/auth/login", headers={
            "Origin": origin, "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-requested-with",
        })
        assert (response.status_code == 200) == allowed
