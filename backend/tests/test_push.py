"""Tests for the Web Push notification subsystem.

These tests exercise the service layer with mocked ``pywebpush.webpush``
calls; no real push provider is contacted. They cover:

- successful send → ``status="sent"``;
- terminal 410 Gone → row deleted;
- terminal 404 Not Found → row deleted;
- transient 500 with retries up to :data:`MAX_FAILURES` → eventual
  deletion;
- fan-out picks the union of subscriptions whose interests intersect
  with the vote's classified topics, deduping subscriptions interested
  in two of the same vote's topics;
- payload composition is plain-factual (no emojis, no editorial verbs).

A short-lived in-memory SQLite engine is used so the tests run without
Postgres. The models inherit pure SQLAlchemy types we can rely on
across both dialects.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import UTC, date, datetime
from typing import Any
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.db.base import Base
from app.models import (
    Chamber,
    ChamberLevel,
    Initiative,
    InitiativeStatus,
    InitiativeTopic,
    InitiativeType,
    Legislature,
    LegislatureStatus,
    PushSubscription,
    PushTopicInterest,
    Session,
    Topic,
    Vote,
    VoteResult,
)
from app.services.push import (
    MAX_FAILURES,
    compose_payload,
    fan_out_new_vote,
    send_to_subscription,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Async SQLAlchemy session against a per-test in-memory SQLite database."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        yield session
    await engine.dispose()


@pytest.fixture
def patched_vapid() -> Any:
    """Stub the VAPID settings so ``send_to_subscription`` skips the
    'unconfigured' early-return and actually invokes the mocked webpush call."""
    with patch("app.services.push.get_settings") as m:
        m.return_value.vapid_private_key = "test-private-key"
        m.return_value.vapid_subject = "mailto:test@example.org"
        yield m


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _seed_minimal_taxonomy(session: AsyncSession) -> tuple[Topic, Topic]:
    housing = Topic(slug="habitatge", name_ca="Habitatge", name_es="Vivienda", name_en="Housing")
    labor = Topic(
        slug="drets-laborals",
        name_ca="Drets laborals",
        name_es="Derechos laborales",
        name_en="Labour rights",
    )
    session.add_all([housing, labor])
    await session.flush()
    return housing, labor


async def _seed_subscription(
    session: AsyncSession,
    *,
    endpoint: str = "https://fcm.googleapis.com/fcm/send/test-endpoint",
    topics: list[Topic] | None = None,
) -> PushSubscription:
    sub = PushSubscription(
        endpoint=endpoint,
        p256dh="test-p256dh-key",
        auth="test-auth-key",
        user_agent="pytest/1.0",
        failed_send_count=0,
    )
    session.add(sub)
    await session.flush()
    for t in topics or []:
        session.add(PushTopicInterest(subscription_id=sub.id, topic_id=t.id))
    await session.flush()
    return sub


async def _seed_vote_with_topic(
    session: AsyncSession, topic: Topic, title: str = "Sample vote"
) -> Vote:
    chamber = Chamber(
        slug="es-congreso",
        name_ca="Congrés",
        name_es="Congreso",
        name_en="Congress",
        country="ES",
        level=ChamberLevel.NATIONAL,
    )
    session.add(chamber)
    await session.flush()
    leg = Legislature(
        chamber_id=chamber.id,
        number="XV",
        name_ca="XV",
        name_es="XV",
        name_en="XV",
        start_date=date(2023, 8, 17),
        status=LegislatureStatus.ACTIVE,
    )
    session.add(leg)
    await session.flush()
    initiative = Initiative(
        chamber_id=chamber.id,
        legislature_id=leg.id,
        type=InitiativeType.PROYECTO_LEY,
        official_id="121/000001",
        title_original=title,
        status=InitiativeStatus.IN_DEBATE,
    )
    session.add(initiative)
    await session.flush()
    session.add(
        InitiativeTopic(
            initiative_id=initiative.id,
            topic_id=topic.id,
            confidence=0.9,
            classified_by="test",
            classified_at=datetime.now(UTC),
        )
    )
    sess = Session(
        chamber_id=chamber.id,
        legislature_id=leg.id,
        date=date(2026, 5, 1),
        type="plenary",
    )
    session.add(sess)
    await session.flush()
    vote = Vote(
        session_id=sess.id,
        initiative_id=initiative.id,
        sequence_in_session=1,
        title=title,
        voted_at=datetime(2026, 5, 1, 12, 0, tzinfo=UTC),
        result=VoteResult.APPROVED,
        ayes=200,
        noes=100,
        abstentions=10,
        absent=40,
    )
    session.add(vote)
    await session.flush()
    return vote


# A WebPushException stub that mirrors the attributes the service reads.
class _FakeResponse:
    def __init__(self, status_code: int) -> None:
        self.status_code = status_code
        self.text = ""


def _webpush_exc(status_code: int) -> Exception:
    """Construct a WebPushException with a response carrying ``status_code``.

    We avoid actually instantiating ``pywebpush.WebPushException`` (its
    constructor wants a real ``requests.Response``); we use a lookalike
    subclass that ``isinstance(..., WebPushException)`` accepts via the
    ``except`` clause in the service.
    """
    from pywebpush import WebPushException

    err = WebPushException.__new__(WebPushException)
    err.message = f"fake {status_code}"
    err.response = _FakeResponse(status_code)
    err.args = (err.message,)
    return err


# ---------------------------------------------------------------------------
# compose_payload
# ---------------------------------------------------------------------------


def test_compose_payload_is_factual() -> None:
    """The payload must NOT include emojis or editorial verbs."""

    class _V:
        id = 42
        title = "Proyecto de Ley de Vivienda"

    payload = compose_payload(
        vote=_V(),  # type: ignore[arg-type]
        topic_name="Habitatge",
        site_origin="https://monitorparlamentari.cat",
    )
    assert payload["title"] == "Nou vot al Congrés · Habitatge"
    assert payload["body"] == "Proyecto de Ley de Vivienda"
    assert payload["url"] == "https://monitorparlamentari.cat/votes/42"
    assert payload["icon"] == "/icon.svg"
    # Defensive: no emoji-likely codepoints.
    assert all(ord(c) < 0x2000 for c in payload["title"] + payload["body"])


def test_compose_payload_truncates_long_body() -> None:
    long = "x " * 200

    class _V:
        id = 1
        title = long

    payload = compose_payload(vote=_V(), topic_name=None)  # type: ignore[arg-type]
    assert payload["title"] == "Nou vot al Congrés"
    assert len(payload["body"]) <= 91  # 90 chars + ellipsis
    assert payload["body"].endswith("…")


# ---------------------------------------------------------------------------
# send_to_subscription
# ---------------------------------------------------------------------------


async def test_send_to_subscription_success(db_session: AsyncSession, patched_vapid: Any) -> None:
    _ = patched_vapid
    sub = await _seed_subscription(db_session)
    with patch("app.services.push._webpush_blocking", return_value=None):
        result = await send_to_subscription(db_session, sub, {"title": "x"})
    assert result.status == "sent"
    assert sub.failed_send_count == 0


async def test_send_to_subscription_410_deletes(
    db_session: AsyncSession, patched_vapid: Any
) -> None:
    _ = patched_vapid
    sub = await _seed_subscription(db_session)
    sub_id = sub.id
    with patch(
        "app.services.push._webpush_blocking",
        side_effect=_webpush_exc(410),
    ):
        result = await send_to_subscription(db_session, sub, {"title": "x"})
    assert result.status == "deleted"
    assert result.http_status == 410
    await db_session.commit()
    remaining = (
        await db_session.execute(
            __import__("sqlalchemy").select(PushSubscription).where(PushSubscription.id == sub_id)
        )
    ).scalar_one_or_none()
    assert remaining is None


async def test_send_to_subscription_404_deletes(
    db_session: AsyncSession, patched_vapid: Any
) -> None:
    _ = patched_vapid
    sub = await _seed_subscription(db_session)
    sub_id = sub.id
    with patch(
        "app.services.push._webpush_blocking",
        side_effect=_webpush_exc(404),
    ):
        result = await send_to_subscription(db_session, sub, {"title": "x"})
    assert result.status == "deleted"
    await db_session.commit()
    remaining = (
        await db_session.execute(
            __import__("sqlalchemy").select(PushSubscription).where(PushSubscription.id == sub_id)
        )
    ).scalar_one_or_none()
    assert remaining is None


async def test_send_to_subscription_transient_increments_then_deletes(
    db_session: AsyncSession, patched_vapid: Any
) -> None:
    _ = patched_vapid
    sub = await _seed_subscription(db_session)
    sub_id = sub.id
    with patch(
        "app.services.push._webpush_blocking",
        side_effect=lambda **kw: (_ for _ in ()).throw(_webpush_exc(500)),
    ):
        for i in range(MAX_FAILURES - 1):
            r = await send_to_subscription(db_session, sub, {"title": "x"})
            assert r.status == "failed"
            assert sub.failed_send_count == i + 1
        # Final call crosses the threshold and prunes the row.
        r = await send_to_subscription(db_session, sub, {"title": "x"})
        assert r.status == "deleted"
        assert r.reason == "exceeded MAX_FAILURES"
    await db_session.commit()
    remaining = (
        await db_session.execute(
            __import__("sqlalchemy").select(PushSubscription).where(PushSubscription.id == sub_id)
        )
    ).scalar_one_or_none()
    assert remaining is None


# ---------------------------------------------------------------------------
# fan_out_new_vote
# ---------------------------------------------------------------------------


async def test_fan_out_picks_only_interested_subscribers(
    db_session: AsyncSession, patched_vapid: Any
) -> None:
    _ = patched_vapid
    housing, labor = await _seed_minimal_taxonomy(db_session)
    vote = await _seed_vote_with_topic(db_session, housing)

    interested = await _seed_subscription(
        db_session,
        endpoint="https://push.example.org/interested",
        topics=[housing],
    )
    uninterested = await _seed_subscription(
        db_session,
        endpoint="https://push.example.org/uninterested",
        topics=[labor],
    )
    # Subscription interested in BOTH topics; should appear only once.
    overlapping = await _seed_subscription(
        db_session,
        endpoint="https://push.example.org/overlapping",
        topics=[housing, labor],
    )
    await db_session.commit()

    sent_endpoints: list[str] = []

    def _capture(**kwargs: Any) -> None:
        sent_endpoints.append(kwargs["endpoint"])

    with patch("app.services.push._webpush_blocking", side_effect=_capture):
        result = await fan_out_new_vote(db_session, vote.id)

    assert result.sent == 2
    assert result.deleted == 0
    assert result.failed == 0
    assert sorted(sent_endpoints) == sorted([interested.endpoint, overlapping.endpoint])
    assert uninterested.endpoint not in sent_endpoints


async def test_fan_out_skips_orphan_vote(db_session: AsyncSession, patched_vapid: Any) -> None:
    """A vote without a linked Initiative (and thus no topics) should
    short-circuit the fan-out cleanly — no recipients, no errors."""
    _ = patched_vapid
    housing, _ = await _seed_minimal_taxonomy(db_session)
    await _seed_subscription(
        db_session,
        endpoint="https://push.example.org/x",
        topics=[housing],
    )
    chamber = Chamber(
        slug="es-congreso-2",
        name_ca="Congrés",
        name_es="Congreso",
        name_en="Congress",
        country="ES",
        level=ChamberLevel.NATIONAL,
    )
    db_session.add(chamber)
    await db_session.flush()
    leg = Legislature(
        chamber_id=chamber.id,
        number="XV",
        name_ca="XV",
        name_es="XV",
        name_en="XV",
        start_date=date(2023, 8, 17),
        status=LegislatureStatus.ACTIVE,
    )
    db_session.add(leg)
    await db_session.flush()
    sess = Session(
        chamber_id=chamber.id,
        legislature_id=leg.id,
        date=date(2026, 5, 1),
    )
    db_session.add(sess)
    await db_session.flush()
    orphan = Vote(
        session_id=sess.id,
        initiative_id=None,
        sequence_in_session=1,
        title="Orphan vote",
        voted_at=datetime(2026, 5, 1, 12, 0, tzinfo=UTC),
        result=VoteResult.APPROVED,
    )
    db_session.add(orphan)
    await db_session.flush()

    with patch("app.services.push._webpush_blocking") as wp:
        result = await fan_out_new_vote(db_session, orphan.id)
        wp.assert_not_called()
    assert result.sent == 0
    assert result.skipped == 1
