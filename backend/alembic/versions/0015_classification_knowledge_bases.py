"""add classification knowledge-base kind + seed the 17 UN SDG topics

Introduces a second, parallel classification taxonomy: the 17 UN Sustainable
Development Goals (SDGs / ODS). This mirrors QHLD's multiple-KB layout and
opens AECID and EU SDG-implementation funding lines for the project.

Schema changes:

- ``topics.kind`` (VARCHAR(20), NOT NULL, default ``'theme'``): which
  classification knowledge base the row belongs to. Existing 17 editorial
  rows are backfilled to ``'theme'``; the 17 SDG rows inserted by this
  migration are ``'sdg'``.

Seed data:

- 17 SDG topic rows with slugs ``sdg-01-poverty`` … ``sdg-17-partnerships``,
  CA / ES / EN names (the UN's official short names, translated where the
  UN's own translations cover the language), the UN-official colour hex
  codes from the SDG style guide (https://www.un.org/sustainabledevelopment/news/communications-material/),
  and short neutral descriptions echoing the UN's wording. Lucide icon
  names paired by analogy with the editorial taxonomy.

Editorial discipline (CLAUDE.md "mirall, no megàfon"):

- SDG names and descriptions are descriptive and UN-official. We do not
  introduce ranking, opinion, or framing on top of the UN definitions.
- The classifier service uses the same ``InitiativeTopic`` rows for both
  taxonomies; ``classified_by`` is the only differentiator, so the two
  layers coexist without overwriting each other.

Revision ID: 0015_classification_knowledge_bases
Revises: 0014_push_subscriptions
Create Date: 2026-05-11
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015_classification_kb"
down_revision: Union[str, None] = "0014_push_subscriptions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# UN Sustainable Development Goals — the 17 SDGs adopted in 2015.
# Source: https://sdgs.un.org/goals
# Colour codes from the UN SDG style guide.
# Names: UN's official short titles; CA/ES translations follow the UN's
# Spanish/Catalan publications where available, otherwise rendered from the
# English with the most common public-administration phrasing in ES/CA.
SDG_TOPICS: list[tuple[str, str, str, str, str, str, str, str, str]] = [
    # (slug, name_ca, name_es, name_en, color_hex, icon, description_ca, description_es, description_en)
    (
        "sdg-01-poverty",
        "Fi de la pobresa",
        "Fin de la pobreza",
        "No poverty",
        "#E5243B",
        "wallet",
        "Erradicar la pobresa a tot el món en totes les seves formes.",
        "Erradicar la pobreza en todo el mundo en todas sus formas.",
        "End poverty in all its forms everywhere.",
    ),
    (
        "sdg-02-hunger",
        "Fam zero",
        "Hambre cero",
        "Zero hunger",
        "#DDA63A",
        "wheat",
        "Posar fi a la fam, assolir la seguretat alimentària i promoure l'agricultura sostenible.",
        "Poner fin al hambre, lograr la seguridad alimentaria y promover la agricultura sostenible.",
        "End hunger, achieve food security and improved nutrition, and promote sustainable agriculture.",
    ),
    (
        "sdg-03-health",
        "Salut i benestar",
        "Salud y bienestar",
        "Good health and well-being",
        "#4C9F38",
        "heart-pulse",
        "Garantir vides saludables i promoure el benestar per a totes les edats.",
        "Garantizar vidas saludables y promover el bienestar para todas las edades.",
        "Ensure healthy lives and promote well-being for all at all ages.",
    ),
    (
        "sdg-04-education",
        "Educació de qualitat",
        "Educación de calidad",
        "Quality education",
        "#C5192D",
        "graduation-cap",
        "Garantir una educació inclusiva, equitativa i de qualitat i promoure oportunitats d'aprenentatge per a tothom.",
        "Garantizar una educación inclusiva, equitativa y de calidad y promover oportunidades de aprendizaje para todos.",
        "Ensure inclusive and equitable quality education and promote lifelong learning opportunities for all.",
    ),
    (
        "sdg-05-gender-equality",
        "Igualtat de gènere",
        "Igualdad de género",
        "Gender equality",
        "#FF3A21",
        "venus-mars",
        "Aconseguir la igualtat de gènere i empoderar totes les dones i nenes.",
        "Lograr la igualdad de género y empoderar a todas las mujeres y niñas.",
        "Achieve gender equality and empower all women and girls.",
    ),
    (
        "sdg-06-water",
        "Aigua neta i sanejament",
        "Agua limpia y saneamiento",
        "Clean water and sanitation",
        "#26BDE2",
        "droplet",
        "Garantir la disponibilitat i la gestió sostenible de l'aigua i el sanejament per a tothom.",
        "Garantizar la disponibilidad y la gestión sostenible del agua y el saneamiento para todos.",
        "Ensure availability and sustainable management of water and sanitation for all.",
    ),
    (
        "sdg-07-energy",
        "Energia neta i assequible",
        "Energía asequible y no contaminante",
        "Affordable and clean energy",
        "#FCC30B",
        "zap",
        "Garantir l'accés a una energia assequible, fiable, sostenible i moderna.",
        "Garantizar el acceso a una energía asequible, fiable, sostenible y moderna.",
        "Ensure access to affordable, reliable, sustainable and modern energy for all.",
    ),
    (
        "sdg-08-decent-work",
        "Treball digne i creixement econòmic",
        "Trabajo decente y crecimiento económico",
        "Decent work and economic growth",
        "#A21942",
        "briefcase",
        "Promoure el creixement econòmic sostingut, inclusiu i sostenible, l'ocupació plena i productiva i el treball digne.",
        "Promover el crecimiento económico sostenido, inclusivo y sostenible, el empleo pleno y productivo y el trabajo decente.",
        "Promote sustained, inclusive and sustainable economic growth, full and productive employment, and decent work for all.",
    ),
    (
        "sdg-09-industry-innovation",
        "Indústria, innovació i infraestructura",
        "Industria, innovación e infraestructura",
        "Industry, innovation and infrastructure",
        "#FD6925",
        "factory",
        "Construir infraestructures resilients, promoure la industrialització inclusiva i sostenible i fomentar la innovació.",
        "Construir infraestructuras resilientes, promover la industrialización inclusiva y sostenible y fomentar la innovación.",
        "Build resilient infrastructure, promote inclusive and sustainable industrialization and foster innovation.",
    ),
    (
        "sdg-10-reduced-inequalities",
        "Reducció de les desigualtats",
        "Reducción de las desigualdades",
        "Reduced inequalities",
        "#DD1367",
        "scale",
        "Reduir les desigualtats dins i entre els països.",
        "Reducir las desigualdades dentro y entre los países.",
        "Reduce inequality within and among countries.",
    ),
    (
        "sdg-11-sustainable-cities",
        "Ciutats i comunitats sostenibles",
        "Ciudades y comunidades sostenibles",
        "Sustainable cities and communities",
        "#FD9D24",
        "building-2",
        "Aconseguir que les ciutats i els assentaments humans siguin inclusius, segurs, resilients i sostenibles.",
        "Lograr que las ciudades y los asentamientos humanos sean inclusivos, seguros, resilientes y sostenibles.",
        "Make cities and human settlements inclusive, safe, resilient and sustainable.",
    ),
    (
        "sdg-12-responsible-consumption",
        "Producció i consum responsables",
        "Producción y consumo responsables",
        "Responsible consumption and production",
        "#BF8B2E",
        "recycle",
        "Garantir modalitats de consum i producció sostenibles.",
        "Garantizar modalidades de consumo y producción sostenibles.",
        "Ensure sustainable consumption and production patterns.",
    ),
    (
        "sdg-13-climate",
        "Acció pel clima",
        "Acción por el clima",
        "Climate action",
        "#3F7E44",
        "cloud-sun",
        "Adoptar mesures urgents per combatre el canvi climàtic i els seus efectes.",
        "Adoptar medidas urgentes para combatir el cambio climático y sus efectos.",
        "Take urgent action to combat climate change and its impacts.",
    ),
    (
        "sdg-14-life-below-water",
        "Vida submarina",
        "Vida submarina",
        "Life below water",
        "#0A97D9",
        "fish",
        "Conservar i utilitzar de manera sostenible els oceans, els mars i els recursos marins.",
        "Conservar y utilizar de forma sostenible los océanos, los mares y los recursos marinos.",
        "Conserve and sustainably use the oceans, seas and marine resources for sustainable development.",
    ),
    (
        "sdg-15-life-on-land",
        "Vida d'ecosistemes terrestres",
        "Vida de ecosistemas terrestres",
        "Life on land",
        "#56C02B",
        "trees",
        "Protegir, restablir i promoure l'ús sostenible dels ecosistemes terrestres, gestionar els boscos, lluitar contra la desertificació i frenar la pèrdua de biodiversitat.",
        "Proteger, restablecer y promover el uso sostenible de los ecosistemas terrestres, gestionar los bosques, luchar contra la desertificación y detener la pérdida de biodiversidad.",
        "Protect, restore and promote sustainable use of terrestrial ecosystems, sustainably manage forests, combat desertification, and halt biodiversity loss.",
    ),
    (
        "sdg-16-peace-justice",
        "Pau, justícia i institucions sòlides",
        "Paz, justicia e instituciones sólidas",
        "Peace, justice and strong institutions",
        "#00689D",
        "landmark",
        "Promoure societats pacífiques i inclusives, facilitar l'accés a la justícia i construir institucions eficaces i responsables.",
        "Promover sociedades pacíficas e inclusivas, facilitar el acceso a la justicia y construir instituciones eficaces y responsables.",
        "Promote peaceful and inclusive societies, provide access to justice for all and build effective, accountable institutions.",
    ),
    (
        "sdg-17-partnerships",
        "Aliances per assolir els objectius",
        "Alianzas para lograr los objetivos",
        "Partnerships for the goals",
        "#19486A",
        "handshake",
        "Enfortir els mitjans d'implementació i revitalitzar l'aliança mundial per al desenvolupament sostenible.",
        "Fortalecer los medios de implementación y revitalizar la alianza mundial para el desarrollo sostenible.",
        "Strengthen the means of implementation and revitalize the global partnership for sustainable development.",
    ),
]


def upgrade() -> None:
    # 1) Add the `kind` column with a server default so existing rows are
    #    auto-backfilled to 'theme'. We then drop the server default so the
    #    ORM-supplied Python default is the source of truth going forward.
    op.add_column(
        "topics",
        sa.Column(
            "kind",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'theme'"),
        ),
    )
    op.create_index("ix_topics_kind", "topics", ["kind"], unique=False)
    # Once existing rows have their value, drop the server default. The
    # SQLAlchemy mapper supplies it for new inserts.
    op.alter_column("topics", "kind", server_default=None)

    # 2) Seed the 17 SDG topics.
    topics_table = sa.table(
        "topics",
        sa.column("slug", sa.String),
        sa.column("name_ca", sa.String),
        sa.column("name_es", sa.String),
        sa.column("name_en", sa.String),
        sa.column("color_hex", sa.String),
        sa.column("icon", sa.String),
        sa.column("description_ca", sa.Text),
        sa.column("description_es", sa.Text),
        sa.column("description_en", sa.Text),
        sa.column("kind", sa.String),
    )
    op.bulk_insert(
        topics_table,
        [
            {
                "slug": slug,
                "name_ca": name_ca,
                "name_es": name_es,
                "name_en": name_en,
                "color_hex": color,
                "icon": icon,
                "description_ca": desc_ca,
                "description_es": desc_es,
                "description_en": desc_en,
                "kind": "sdg",
            }
            for slug, name_ca, name_es, name_en, color, icon, desc_ca, desc_es, desc_en in SDG_TOPICS
        ],
    )


def downgrade() -> None:
    # Drop the 17 seeded SDG rows; leave any user-added 'sdg' rows alone.
    bind = op.get_bind()
    bind.execute(
        sa.text("DELETE FROM topics WHERE slug = ANY(:slugs)"),
        {"slugs": [s[0] for s in SDG_TOPICS]},
    )
    op.drop_index("ix_topics_kind", table_name="topics")
    op.drop_column("topics", "kind")
