"""Store explicit roles from different countries' perspectives."""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("people", sa.Column("country_roles", sa.JSON(), nullable=False,
                                    server_default="[]"))


def downgrade():
    op.drop_column("people", "country_roles")
