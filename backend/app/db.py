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
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    event,
    false,
    inspect,
    text,
)
from sqlalchemy.schema import CreateColumn
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
    constants: Mapped[list["UserConstant"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan", passive_deletes=True
    )
    pinned_library: Mapped[list["PinnedLibraryFormula"]] = relationship(
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
    #: What the formula is for, in the user's words. Named `note` for historical
    #: reasons; it is the description shown throughout the UI.
    note: Mapped[str] = mapped_column(Text, default="", nullable=False)
    #: What each symbol means, as JSON: {"m": "mass (kg)", ...}. Kept as one
    #: column rather than a child table -- these are always read and written
    #: together with the formula, and never queried on their own.
    variable_notes: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="{}",
        # A server default is what makes ALTER TABLE ADD COLUMN legal for a
        # NOT NULL column on a table that already has rows.
        server_default=text("'{}'"),
    )
    # Last-used inputs, as JSON text. Stored so reopening a formula lands on a
    # working example rather than an empty form.
    values_json: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    solve_for: Mapped[str | None] = mapped_column(String(64), nullable=True)
    #: Free text, matched loosely against the built-in library's categories so
    #: a user's formulas can sit in the same rubrics. Empty means uncategorised.
    category: Mapped[str] = mapped_column(
        String(60), nullable=False, default="", server_default=""
    )
    #: Pinned formulas sort to the top of every list. A server default is what
    #: makes ALTER TABLE ADD COLUMN legal for a NOT NULL column on a table that
    #: already has rows, and `false()` renders correctly per dialect where a
    #: literal 0 would not.
    pinned: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    #: Kept out of the sidebar menu but still listed on the formulas page --
    #: hidden means "not in my way", not "deleted".
    hidden: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    owner: Mapped[User] = relationship(back_populates="formulas")


class UserConstant(Base):
    """A value a user wants offered whenever a formula names that symbol.

    The built-in catalogue covers the usual physical constants; this is for the
    ones particular to somebody's work -- a material's density, a rig's lever
    arm, a coefficient they keep reusing.
    """

    __tablename__ = "user_constants"
    __table_args__ = (
        # One meaning per symbol per user; a second `rho` would make the chip
        # ambiguous.
        UniqueConstraint("user_id", "symbol", name="uq_user_constant_symbol"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    symbol: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    owner: Mapped[User] = relationship(back_populates="constants")


class PinnedLibraryFormula(Base):
    """A built-in formula somebody wants to hand.

    The library itself is read-only, so a pin cannot live on the formula. It
    lives here instead, as a reference by id -- which also means a pin survives
    the library's wording changing underneath it.
    """

    __tablename__ = "pinned_library_formulas"
    __table_args__ = (
        UniqueConstraint("user_id", "library_id", name="uq_pinned_library"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    library_id: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    owner: Mapped[User] = relationship(back_populates="pinned_library")


def ensure_columns() -> None:
    """Add model columns that the existing tables are missing.

    ``create_all`` creates missing *tables* and never alters existing ones, so
    a newly added column stays invisible until the database is recreated --
    which would mean discarding real data. This closes that gap for the only
    safe case: adding a column.

    Renames and drops are deliberately not attempted. If one is ever needed,
    that is the point to bring in Alembic.
    """
    inspector = inspect(engine)
    for table in Base.metadata.sorted_tables:
        if not inspector.has_table(table.name):
            continue  # create_all will make it in full
        present = {column["name"] for column in inspector.get_columns(table.name)}
        missing = [column for column in table.columns if column.name not in present]
        for column in missing:
            # CreateColumn renders the type, nullability and server default the
            # way this dialect expects, rather than us assembling DDL by hand.
            definition = CreateColumn(column).compile(dialect=engine.dialect)
            with engine.begin() as connection:
                connection.execute(text(f"ALTER TABLE {table.name} ADD COLUMN {definition}"))


def init_db() -> None:
    """Bring the database up to date with the models."""
    Base.metadata.create_all(bind=engine)
    ensure_columns()


def get_session() -> Iterator[Session]:
    """FastAPI dependency yielding a session scoped to one request."""
    session = Session(bind=engine, expire_on_commit=False)
    try:
        yield session
    finally:
        session.close()
