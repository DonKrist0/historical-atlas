"""Keep the selected mother, father and spouse role on a relation."""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("person_relations", sa.Column("family_role", sa.String(20), nullable=True))


def downgrade():
    op.drop_column("person_relations", "family_role")
