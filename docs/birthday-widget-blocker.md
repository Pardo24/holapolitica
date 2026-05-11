# Birthday widget — data blocker

Date: 2026-05-11
Status: **blocked**, widget deferred until full birth date is ingested.

## What was asked

A small "Avui cumpleixen anys" card on the home page listing up to N
deputies whose birthday falls on the current calendar day, with photo,
group color disc, and age. The widget is the only place on the site
that depends on `(month, day)` of birth — every other feature only
needs the year. See `docs/competitor-quehacenlosdiputados.md` for the
reference implementation at QHLD's `/diputados/buscador-cumpleanos`.

## Why we can't ship it today

The current `Person` model only stores `birth_year`:

```python
# backend/app/models/__init__.py (lines 164-186)
class Person(Base, TimestampMixin):
    ...
    gender: Mapped[str | None] = mapped_column(String(1))    # 'F', 'M', 'X' or NULL
    birth_year: Mapped[int | None] = mapped_column(Integer)  # year only
    photo_url: Mapped[str | None] = mapped_column(String(500))
    ...
```

There is no `birth_date`, no `birth_month`, and no `birth_day` column,
and the active-deputies open-data payload that
`app/ingest/congreso/deputies.py` consumes does not surface a full
date of birth either (only the year is exposed, when present at all).
Without month and day we cannot answer "whose birthday is today" — we
cannot fabricate one and we will not approximate it.

## What it would take to unblock

Two changes, in order:

1. **Schema** — add `birth_date: date | None` (or, if we want to be
   conservative, `birth_month: int | None` + `birth_day: int | None`)
   to `Person`. Keep `birth_year` as a denormalised cache for the
   /persons listing where `EXTRACT(year FROM birth_date)` is wasteful.
   New Alembic migration; no destructive change — old rows have
   `birth_date IS NULL` until backfilled.

2. **Ingest backfill** — write `app/ingest/congreso/birth_dates.py`
   modelled after `app/ingest/congreso/photos.py`. The Congreso deputy
   ficha page (path
   `/ca/busqueda-de-diputados?...&_diputadomodule_mostrarFicha=true&codParlamentario={cod}&idLegislatura={leg}`)
   shows a "Fecha de nacimiento" row in the biographical block when
   the deputy has consented. Join back by `cod_parlamentario`, which
   `photos.py` already backfills, so the same scraper run can opportunistically
   grab birth date too. Sequential requests with the same polite
   `CongresoClient` delay; one-shot per legislature, re-run only when
   new mandates land.

Expected coverage after the backfill: ~60–80% of XV deputies (many
opt out of publishing full DoB). The widget must therefore degrade
gracefully — when zero deputies match for the day, render nothing
(silent empty state, per the original spec).

## What ships today instead

- Backend: **no** `/persons/birthdays` endpoint. Adding a stub that
  always returns `[]` would be dishonest and would couple the frontend
  to a contract we cannot keep symmetric across deputies (we'd silently
  hide the ~20–40% with unknown DoB). Better to add the route once the
  data lands.
- Frontend: no birthday card on the home page. The "Composició
  demogràfica" block on `/groups/[slug]` (this same change set) does
  not need DoB — it only uses `birth_year` for bucketing.

Reopen this when `birth_date` ingest is ready.
