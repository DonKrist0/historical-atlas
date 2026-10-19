from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Editor(Base):
    __tablename__ = "editors"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    failed_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class EditorSession(Base):
    __tablename__ = "editor_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    editor_id: Mapped[int] = mapped_column(ForeignKey("editors.id", ondelete="CASCADE"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class Person(Base):
    __tablename__ = "people"
    __table_args__ = (
        CheckConstraint('"start" >= 1 AND "end" <= 2100 AND "end" >= "start"', name="valid_years"),
        CheckConstraint(
            "\"group\" IN ('rulers', 'family', 'close', 'contemporaries', 'clergy')",
            name="valid_group",
        ),
        CheckConstraint("length(trim(name)) > 0", name="nonempty_name"),
        Index("ix_people_group", "group"),
    )

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(352))
    first_name: Mapped[str | None] = mapped_column(String(150))
    last_name: Mapped[str | None] = mapped_column(String(100))
    patronymic: Mapped[str | None] = mapped_column(String(100))
    gender: Mapped[str] = mapped_column(String(10), default="unknown", server_default="unknown")
    country: Mapped[str | None] = mapped_column(String(150))
    region: Mapped[str | None] = mapped_column(String(150))
    dynasty: Mapped[str | None] = mapped_column(String(150))
    start: Mapped[int] = mapped_column(Integer)
    end: Mapped[int] = mapped_column(Integer)
    group: Mapped[str] = mapped_column(String(30))
    country_roles: Mapped[list[dict]] = mapped_column(JSON, default=list, server_default="[]")
    note: Mapped[str] = mapped_column(String(150), default="")
    biography: Mapped[str] = mapped_column(Text, default="")
    sources: Mapped[str] = mapped_column(Text, default="", server_default="")
    before: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
    relations: Mapped[list["PersonRelation"]] = relationship(
        foreign_keys="PersonRelation.source_id",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
        order_by="PersonRelation.id",
    )


class PersonRelation(Base):
    __tablename__ = "person_relations"
    __table_args__ = (
        CheckConstraint("source_id <> person_id", name="no_self_relation"),
        CheckConstraint("length(trim(role)) > 0", name="nonempty_role"),
        Index("ix_relations_source", "source_id"),
        Index("ix_relations_target", "person_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("people.id", ondelete="CASCADE"))
    person_id: Mapped[str] = mapped_column(ForeignKey("people.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(100))
    family_role: Mapped[str | None] = mapped_column(String(20))
    start_year: Mapped[int | None] = mapped_column(Integer)
    end_year: Mapped[int | None] = mapped_column(Integer)


Index(
    "uq_relation_role",
    PersonRelation.source_id,
    PersonRelation.person_id,
    func.lower(PersonRelation.role),
    unique=True,
)
