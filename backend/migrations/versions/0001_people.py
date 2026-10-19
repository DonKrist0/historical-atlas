"""Create people and directed relations; populate the original atlas."""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    people = op.create_table(
        "people",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("name", sa.String(352), nullable=False),
        sa.Column("first_name", sa.String(150)),
        sa.Column("last_name", sa.String(100)),
        sa.Column("patronymic", sa.String(100)),
        sa.Column("country", sa.String(150)),
        sa.Column("region", sa.String(150)),
        sa.Column("dynasty", sa.String(150)),
        sa.Column("start", sa.Integer(), nullable=False),
        sa.Column("end", sa.Integer(), nullable=False),
        sa.Column("group", sa.String(30), nullable=False),
        sa.Column("note", sa.String(150), nullable=False),
        sa.Column("biography", sa.Text(), nullable=False),
        sa.Column("before", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            '"start" >= 1 AND "end" <= 2100 AND "end" >= "start"', name="valid_years"
        ),
        sa.CheckConstraint(
            "\"group\" IN ('rulers', 'family', 'close', 'contemporaries', 'clergy')",
            name="valid_group",
        ),
        sa.CheckConstraint("length(trim(name)) > 0", name="nonempty_name"),
    )
    op.create_index("ix_people_group", "people", ["group"])
    op.create_table(
        "person_relations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "source_id",
            sa.String(100),
            sa.ForeignKey("people.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "person_id",
            sa.String(100),
            sa.ForeignKey("people.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(100), nullable=False),
        sa.CheckConstraint("source_id <> person_id", name="no_self_relation"),
        sa.CheckConstraint("length(trim(role)) > 0", name="nonempty_role"),
    )
    op.create_index("ix_relations_source", "person_relations", ["source_id"])
    op.create_index("ix_relations_target", "person_relations", ["person_id"])
    op.create_index(
        "uq_relation_role",
        "person_relations",
        ["source_id", "person_id", sa.text("lower(role)")],
        unique=True,
    )
    initial = [
        ("dmitry", "Дмитрий Донской", 1350, 1389, "rulers", "Великий князь московский", False),
        ("vasily", "Василий I", 1371, 1425, "rulers", "Великий князь московский", False),
        ("evdokia", "Евдокия", 1353, 1407, "family", "Супруга Дмитрия Донского", False),
        ("vladimir", "Владимир Храбрый", 1353, 1410, "family", "Князь серпуховской", False),
        ("bobrok", "Дмитрий Боброк", 1350, 1390, "close", "Воевода", True),
        ("velyaminov", "Тимофей Вельяминов", 1350, 1390, "close", "Тимофей Васильевич", True),
        ("kvashnya", "Иван Квашня", 1350, 1390, "close", "Иван Родионович", True),
        ("koshka", "Фёдор Кошка", 1350, 1407, "close", "Фёдор Андреевич", True),
        ("sviblo", "Фёдор Свибло", 1350, 1400, "close", "Фёдор Андреевич", True),
    ]
    op.bulk_insert(
        people,
        [
            dict(
                id=id_,
                name=name,
                start=start,
                end=end,
                group=group,
                note=note,
                before=before,
                biography="",
            )
            for id_, name, start, end, group, note, before in initial
        ],
    )


def downgrade():
    op.drop_table("person_relations")
    op.drop_table("people")
