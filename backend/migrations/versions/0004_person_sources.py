"""Store source references separately from a person's biography."""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("people", sa.Column("sources", sa.Text(), nullable=False, server_default=""))


def downgrade():
    op.drop_column("people", "sources")
