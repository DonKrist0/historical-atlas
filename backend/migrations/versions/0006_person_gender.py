"""Store gender without guessing it for existing records."""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("people", sa.Column("gender", sa.String(10), nullable=False,
                                    server_default="unknown"))


def downgrade():
    op.drop_column("people", "gender")
