# Recovering the 28 "404" historical vote sessions

During the legislature X-XV vote backfill (run in production 2026-06-18,
see `docs/roadmap.md`), 28 plenary-vote sessions failed to import. Each
was recorded as a `failed_date` in its run's `BackfillStats` and logged as
`congreso.backfill.fetch_failed`. This note explains the root cause, the
fix, and how to re-run the affected dates.

## Symptom

For these 28 dates the votaciones portlet renders normally and exposes a
per-session aggregate ZIP URL, but fetching that ZIP returns **HTTP 404**:

```
/webpublica/opendata/votaciones/Leg12/Sesion026/20170202/VOT_20201204142428.zip  -> 404
```

Because `fetch_session_zip_for_date` downloaded the ZIP eagerly, the 404
bubbled up as a fetch failure and the whole session was skipped.

## Root cause

The `VOT_20201204142428.zip` timestamp (2020-12-04) is from the portal's
2020 platform migration, when every historical dataset was republished
under fresh filenames. For these 28 sessions that republish job
regenerated the **per-vote** files but never (re)built the **aggregate**
session ZIP. The directory is therefore half-populated:

```
.../Leg12/Sesion026/20170202/VOT_<ts>.zip                 -> 404  (aggregate, missing)
.../Leg12/Sesion026/20170202/Votacion001/VOT_<ts>.xml     -> 200  (per-vote, present)
.../Leg12/Sesion026/20170202/Votacion001/VOT_<ts>.json    -> 200
.../Leg12/Sesion026/20170202/Votacion001/VOT_<ts>.png     -> 200
.../Leg12/Sesion026/20170202/Votacion001/VOT_<ts>.pdf     -> 200
```

Directory autoindex is off (Apache `Indexes` disabled), so the missing
aggregate cannot be replaced by listing the folder for a different ZIP
filename — but the portlet HTML already links every per-vote XML, and the
per-vote XML is the importer's source of truth (`parse_session_zip` reads
only the `*.xml` entries).

The votes are **fully recoverable**. Nothing is lost upstream.

## Fix

`CongresoClient.fetch_session_zip_for_date` now falls back to
`_synthesize_session_zip`: when the aggregate ZIP 404s, it fetches every
`/VotacionNNN/VOT_<ts>.xml` linked on the same listing page and packs them
into an in-memory ZIP with the exact structure the importer expects. The
importer is unchanged — it parses the synthesized ZIP byte-for-byte the
same way. (`_get` also no longer retries 4xx responses, so the expected
404 fails fast instead of after three exponential-backoff attempts.)

If a session ever had *neither* an aggregate ZIP *nor* any per-vote XML,
the original 404 is re-raised so it stays a tracked failure rather than a
silent skip. None of the current 28 sessions hit that case.

Verified live against the portal: all 28 sessions recover with complete
per-deputy roll-calls (e.g. legislature X session 146, 2013-11-12: 304
votes / 106,400 vote records).

## Re-running the affected dates

The backfill is idempotent and `skip_already_imported=True`, so re-running
a legislature only re-attempts the dates not already in the DB — i.e.
exactly these 28 sessions, now via the fallback:

```bash
docker compose run --rm backend python -m app.ingest.congreso.bootstrap backfill_x
docker compose run --rm backend python -m app.ingest.congreso.bootstrap backfill_xii
```

Confirm `sessions_failed=0` (and `failed_dates=[]`) in the resulting
`congreso.backfill.done` log line.

## The 28 affected sessions

Legislature XII (7):

| Date       | Session | Votes |
|------------|---------|-------|
| 2017-02-02 | 26      | 22    |
| 2017-02-14 | 27      | 16    |
| 2017-02-16 | 29      | 4     |
| 2017-02-21 | 30      | 7     |
| 2017-10-10 | 76      | 6     |
| 2017-10-19 | 80      | 8     |
| 2018-11-13 | 156     | 6     |

Legislature X (21):

| Date       | Session | Votes |
|------------|---------|-------|
| 2012-05-21 | 31      | 69    |
| 2012-05-22 | 32      | 165   |
| 2012-05-23 | 33      | 245   |
| 2012-10-11 | 61      | 8     |
| 2012-10-24 | 64      | 1     |
| 2012-11-14 | 69      | 188   |
| 2012-12-20 | 80      | 67    |
| 2013-02-14 | 84      | 51    |
| 2013-02-26 | 87      | 104   |
| 2013-05-09 | 105     | 65    |
| 2013-10-10 | 136     | 155   |
| 2013-11-12 | 146     | 304   |
| 2013-11-13 | 147     | 163   |
| 2013-12-12 | 156     | 51    |
| 2013-12-19 | 159     | 89    |
| 2014-02-27 | 171     | 103   |
| 2014-05-29 | 191     | 55    |
| 2014-09-25 | 208     | 8     |
| 2015-07-07 | 277     | 8     |
| 2015-09-29 | 287     | 4     |
| 2015-10-20 | 292     | 45    |
