"""Store optional dates for each personal relationship."""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("person_relations", sa.Column("start_year", sa.Integer(), nullable=True))
    op.add_column("person_relations", sa.Column("end_year", sa.Integer(), nullable=True))


def downgrade():
    op.drop_column("person_relations", "end_year")
    op.drop_column("person_relations", "start_year")
