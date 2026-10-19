"""Add editor accounts and revocable sessions; existing collection stays public to read."""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "editors",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(100), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(256), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("failed_attempts", sa.Integer(), nullable=False),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "editor_sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("editor_id", sa.Integer(), sa.ForeignKey("editors.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_editor_sessions_expires_at", "editor_sessions", ["expires_at"])


def downgrade():
    op.drop_table("editor_sessions")
    op.drop_table("editors")
