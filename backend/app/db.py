"""Database setup: engine, session lifecycle, and the ORM models.

SQLite by default -- a single file, no server to run, and switching to Postgres
is a change of ``FORMULA_LAB_DATABASE_URL`` rather than a change of code.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    event,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship

BACKEND_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATABASE_URL = f"sqlite:///{BACKEND_ROOT / 'formula_lab.db'}"
DATABASE_URL = os.environ.get("FORMULA_LAB_DATABASE_URL", DEFAULT_DATABASE_URL)

_is_sqlite = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    # SQLite defaults to rejecting connections used across threads, and FastAPI
    # runs sync endpoints in a threadpool. The Session is still per-request, so
    # no connection is genuinely shared.
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    pool_pre_ping=True,
)


if _is_sqlite:

    @event.listens_for(engine, "connect")
    def _configure_sqlite(dbapi_connection, _record) -> None:
        """SQLite needs to be asked for the behaviour other databases assume."""
        cursor = dbapi_connection.cursor()
        # Off by default, so ON DELETE CASCADE would silently do nothing.
        cursor.execute("PRAGMA foreign_keys=ON")
        # Readers stop blocking the writer, which matters as soon as two
        # requests are in flight at once.
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Stored lower-cased so "Sam@x.com" and "sam@x.com" cannot become two
    # accounts; the unique index then actually prevents duplicates.
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    # Null for accounts created through Google, which have no password at all.
    # The password login path must refuse those rather than compare with NULL.
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Google's stable subject id. Preferred over email for matching a returning
    # user, because a Google account's email address can change while `sub`
    # never does.
    google_sub: Mapped[str | None] = mapped_column(
        String(64), unique=True, index=True, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    formulas: Mapped[list["SavedFormula"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan", passive_deletes=True
    )


class SavedFormula(Base):
    __tablename__ = "saved_formulas"
    __table_args__ = (
        # One name per user, not one name globally.
        UniqueConstraint("user_id", "name", name="uq_saved_formula_user_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    expression: Mapped[str] = mapped_column(String(500), nullable=False)
    note: Mapped[str] = mapped_column(Text, default="", nullable=False)
    # Last-used inputs, as JSON text. Stored so reopening a formula lands on a
    # working example rather than an empty form.
    values_json: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    solve_for: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    owner: Mapped[User] = relationship(back_populates="formulas")


def init_db() -> None:
    """Create any missing tables.

    Enough for a project with additive schema changes; a destructive change
    (renaming or dropping a column) would want Alembic.
    """
    Base.metadata.create_all(bind=engine)


def get_session() -> Iterator[Session]:
    """FastAPI dependency yielding a session scoped to one request."""
    session = Session(bind=engine, expire_on_commit=False)
    try:
        yield session
    finally:
        session.close()
