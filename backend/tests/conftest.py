"""Shared fixtures.

Each test gets its own SQLite file and a session override, so tests never touch
the development database and never see each other's rows.
"""

import os
import tempfile

# Point the app at a throwaway database BEFORE importing it: app.db reads this
# at import time, and the lifespan's init_db() runs against whatever engine was
# built then -- so overriding the session dependency alone would still leave an
# empty schema file in the project directory.
_TEST_DB = os.path.join(tempfile.mkdtemp(prefix="formula-lab-tests-"), "test.db")
os.environ.setdefault("FORMULA_LAB_DATABASE_URL", f"sqlite:///{_TEST_DB}")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from app import auth
from app.db import Base, get_session
from app.main import app


@pytest.fixture
def engine(tmp_path):
    test_engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(test_engine, "connect")
    def _fk_on(dbapi_connection, _record):
        # Without this, ON DELETE CASCADE is silently ignored by SQLite and the
        # cascade test would pass for the wrong reason.
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=test_engine)
    yield test_engine
    test_engine.dispose()


@pytest.fixture
def client(engine):
    def override_session():
        session = Session(bind=engine, expire_on_commit=False)
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_session] = override_session
    # Login throttling lives in module state, so it would otherwise leak
    # between tests and fail whichever one happened to run eleventh.
    auth._failures.clear()

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    auth._failures.clear()


@pytest.fixture
def session_factory(engine):
    def make():
        return Session(bind=engine, expire_on_commit=False)

    return make


def register(client, email="a@example.com", password="correct horse battery"):
    """Register and return a client-bound cookie jar entry."""
    response = client.post("/api/auth/register", json={"email": email, "password": password})
    assert response.status_code == 201, response.text
    return response.json()
