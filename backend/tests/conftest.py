import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.auth import hash_password
from app.config import get_settings
from app.database import Base, get_session
from app.main import app
from app.models import Editor


@pytest.fixture
def database(tmp_path, monkeypatch):
    url = os.environ.get("TEST_DATABASE_URL", f"sqlite:///{tmp_path / 'atlas.db'}")
    if not url.startswith("sqlite:") and not (make_url(url).database or "").endswith("_test"):
        raise RuntimeError("TEST_DATABASE_URL must point to a dedicated database ending in _test")
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    engine = create_engine(url)
    if engine.dialect.name == "sqlite":

        @event.listens_for(engine, "connect")
        def enable_foreign_keys(connection, record):
            connection.execute("PRAGMA foreign_keys=ON")

    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    Base.metadata.drop_all(engine)
    with engine.begin() as connection:
        connection.execute(text("DROP TABLE IF EXISTS alembic_version"))
    command.upgrade(config, "head")
    yield engine, config
    Base.metadata.drop_all(engine)
    with engine.begin() as connection:
        connection.execute(text("DROP TABLE IF EXISTS alembic_version"))
    engine.dispose()
    get_settings.cache_clear()


@pytest.fixture
def anonymous_client(database):
    engine, _ = database

    def test_session():
        with Session(engine, expire_on_commit=False) as session:
            try:
                yield session
            except Exception:
                session.rollback()
                raise

    app.dependency_overrides[get_session] = test_session
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture(scope="session")
def editor_password_hash():
    return hash_password("test-editor-password")


@pytest.fixture
def editor(database, editor_password_hash):
    engine, _ = database
    with Session(engine) as session:
        editor = Editor(username="editor", password_hash=editor_password_hash)
        session.add(editor)
        session.commit()
        return editor.id


@pytest.fixture
def client(anonymous_client, editor):
    anonymous_client.headers["X-Requested-With"] = "Chronicle"
    response = anonymous_client.post("/api/auth/login", json={
        "username": "editor", "password": "test-editor-password",
    })
    assert response.status_code == 200
    return anonymous_client
