"""seed initial chambers and topics

Revision ID: 0002_seed
Revises: 0001_initial
Create Date: 2026-05-08 00:01:00
"""

from datetime import date
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002_seed"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Chambers we plan to support, in order of priority.
CHAMBERS = [
    {
        "slug": "es-congreso",
        "name_ca": "Congrés dels Diputats",
        "name_es": "Congreso de los Diputados",
        "name_en": "Spanish Congress of Deputies",
        "country": "ES",
        "region": None,
        "level": "national",
        "website": "https://www.congreso.es",
    },
    {
        "slug": "cat-parlament",
        "name_ca": "Parlament de Catalunya",
        "name_es": "Parlamento de Cataluña",
        "name_en": "Parliament of Catalonia",
        "country": "ES",
        "region": "CA",
        "level": "regional",
        "website": "https://www.parlament.cat",
    },
    {
        "slug": "bcn-plenari",
        "name_ca": "Plenari del Consell Municipal de Barcelona",
        "name_es": "Pleno del Consejo Municipal de Barcelona",
        "name_en": "Plenary of the Municipal Council of Barcelona",
        "country": "ES",
        "region": "CA",
        "level": "municipal",
        "website": "https://ajuntament.barcelona.cat",
    },
]


# Initial topic taxonomy. Slugs are stable identifiers we use everywhere in code.
# The classifier reads these and maps initiatives to one or more.
TOPICS = [
    ("habitatge", "Habitatge", "Vivienda", "Housing", "#1E88E5", "home"),
    ("sanitat", "Sanitat pública", "Sanidad pública", "Public health", "#43A047", "heart"),
    ("educacio", "Educació", "Educación", "Education", "#FB8C00", "book"),
    (
        "drets-laborals",
        "Drets laborals i ocupació",
        "Derechos laborales y empleo",
        "Labour rights and employment",
        "#E53935",
        "briefcase",
    ),
    (
        "immigracio",
        "Immigració i asil",
        "Inmigración y asilo",
        "Immigration and asylum",
        "#8E24AA",
        "globe",
    ),
    (
        "igualtat",
        "Igualtat de gènere i LGTBI+",
        "Igualdad de género y LGTBI+",
        "Gender equality and LGBTI+",
        "#D81B60",
        "users",
    ),
    (
        "medi-ambient",
        "Medi ambient i emergència climàtica",
        "Medio ambiente y emergencia climática",
        "Environment and climate emergency",
        "#00897B",
        "leaf",
    ),
    (
        "energia",
        "Energia i recursos",
        "Energía y recursos",
        "Energy and resources",
        "#FDD835",
        "zap",
    ),
    (
        "transport",
        "Transport i mobilitat",
        "Transporte y movilidad",
        "Transport and mobility",
        "#3949AB",
        "truck",
    ),
    (
        "economia",
        "Economia, fiscalitat i pressupostos",
        "Economía, fiscalidad y presupuestos",
        "Economy, taxation and budgets",
        "#6D4C41",
        "chart",
    ),
    (
        "justicia",
        "Justícia i drets fonamentals",
        "Justicia y derechos fundamentales",
        "Justice and fundamental rights",
        "#5E35B1",
        "scale",
    ),
    (
        "seguretat",
        "Seguretat i interior",
        "Seguridad e interior",
        "Security and home affairs",
        "#546E7A",
        "shield",
    ),
    (
        "cultura-llengua",
        "Cultura i llengua",
        "Cultura y lengua",
        "Culture and language",
        "#F4511E",
        "music",
    ),
    (
        "internacional",
        "Política internacional i UE",
        "Política internacional y UE",
        "International policy and EU",
        "#1565C0",
        "globe-2",
    ),
    (
        "institucions",
        "Institucions i règim parlamentari",
        "Instituciones y régimen parlamentario",
        "Institutions and parliamentary rules",
        "#455A64",
        "building",
    ),
    (
        "memoria",
        "Memòria democràtica",
        "Memoria democrática",
        "Democratic memory",
        "#7B1FA2",
        "archive",
    ),
    (
        "tecnologia-drets",
        "Tecnologia i drets digitals",
        "Tecnología y derechos digitales",
        "Technology and digital rights",
        "#0097A7",
        "cpu",
    ),
]


# Spanish XV legislature (current as of May 2026).
# This will be created automatically when the user runs the bootstrap script,
# but we seed a placeholder here so the API has data to show on first boot.
LEGISLATURES = [
    {
        "chamber_slug": "es-congreso",
        "number": "XV",
        "name_ca": "XV legislatura",
        "name_es": "XV legislatura",
        "name_en": "15th legislature",
        "start_date": date(2023, 8, 17),
        "end_date": None,
        "status": "active",
    },
]


def upgrade() -> None:
    chambers_table = sa.table(
        "chambers",
        sa.column("slug", sa.String),
        sa.column("name_ca", sa.String),
        sa.column("name_es", sa.String),
        sa.column("name_en", sa.String),
        sa.column("country", sa.String),
        sa.column("region", sa.String),
        sa.column("level", sa.String),
        sa.column("website", sa.String),
    )
    op.bulk_insert(chambers_table, CHAMBERS)

    topics_table = sa.table(
        "topics",
        sa.column("slug", sa.String),
        sa.column("name_ca", sa.String),
        sa.column("name_es", sa.String),
        sa.column("name_en", sa.String),
        sa.column("color_hex", sa.String),
        sa.column("icon", sa.String),
    )
    op.bulk_insert(
        topics_table,
        [
            {
                "slug": slug,
                "name_ca": ca,
                "name_es": es,
                "name_en": en,
                "color_hex": color,
                "icon": icon,
            }
            for slug, ca, es, en, color, icon in TOPICS
        ],
    )

    # Seed legislatures by joining chamber slug.
    bind = op.get_bind()
    for leg in LEGISLATURES:
        chamber_id = bind.execute(
            sa.text("SELECT id FROM chambers WHERE slug = :slug"),
            {"slug": leg["chamber_slug"]},
        ).scalar_one()
        bind.execute(
            sa.text(
                """INSERT INTO legislatures
                   (chamber_id, number, name_ca, name_es, name_en, start_date, end_date, status)
                   VALUES (:chamber_id, :number, :name_ca, :name_es, :name_en, :start_date, :end_date, :status)"""
            ),
            {
                "chamber_id": chamber_id,
                "number": leg["number"],
                "name_ca": leg["name_ca"],
                "name_es": leg["name_es"],
                "name_en": leg["name_en"],
                "start_date": leg["start_date"],
                "end_date": leg["end_date"],
                "status": leg["status"],
            },
        )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("DELETE FROM legislatures"))
    bind.execute(sa.text("DELETE FROM topics"))
    bind.execute(sa.text("DELETE FROM chambers"))
