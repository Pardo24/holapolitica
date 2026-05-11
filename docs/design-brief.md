# Design brief — Monitor Parlamentari

You are designing the visual identity and UI of an open-source civic
parliamentary tracker. This brief is meant to be read alongside the
codebase. Read `CLAUDE.md` first — the constraints there are not
negotiable.

## What the project does, in one paragraph

Monitor Parlamentari is a public dashboard that lets anyone see what each
representative or parliamentary group voted, on what, classified by topic.
It centralises votes, initiatives and group composition for the Spanish
Congreso (and later the Catalan Parliament and Barcelona City Council). It
is **infrastructure, not opinion**: it presents facts, never frames them.

## Non-negotiable principles

1. **Mirror, not megaphone.** No editorial framing anywhere. Words like
   "polèmica", "destacada", "important", "controversial" are banned in
   user-facing text. We describe ("vote with widest margin"), we never
   evaluate ("most heated debate"). The audit doc and the newsletter
   renderer enforce this with tests; please respect it in any visual
   treatment that adds emphasis.
2. **Symmetry on comparative metrics.** Whenever you display "the X most
   Y" pair, you MUST display its mirror. We never highlight a single end
   of a spectrum. Example: the per-topic chart shows "tema amb més suport"
   AND "tema amb més rebuig" together, never one without the other.
3. **Civic neutral palette.** Brand-strict party colours read partisan and
   we explicitly avoid them: PP red would not pass, PSOE strict-Pantone
   either. The current palette is muted Material 500-ish tones (see
   `backend/alembic/versions/0006_populate_group_colors.py`). You can
   refine but must keep this neutrality intent.
4. **No third-party trackers, no external fonts hosted by Google etc.**
   Self-hosted assets only. Embeds and cards must work without third-party
   beacons. RGPD friendliness is a positioning choice, not just a legal
   one.
5. **Keep the current typography.** We're using the system stack already.
   Don't propose a new typeface — a stronger type system inside it is
   welcome.

## Stack you'll be designing for

- Next.js 15 (App Router), TypeScript strict, Tailwind CSS.
- shadcn/ui directory exists at `frontend/components/ui/` but is currently
  empty — primitives can be added if needed.
- next-intl for i18n; the project ships in **Catalan (default), Spanish,
  English**. Any text you propose should be expressible in all three
  without contortion.
- Custom components today: `GroupChip` (colored dot + name), `GroupBadge`
  (colored circle with party abbreviation, used as a logo stand-in),
  `CohesionRow` (stacked horizontal bar), `TopicBars` (per-topic vote
  breakdown).
- Charts: prefer plain styled divs for cohesion / topic bars (already
  done). For the `/stats` page consider a small chart lib — we evaluated
  Recharts (lazy-loaded, accepted) in `docs/research-design-viz.md`. If
  you want to swap, justify against bundle size and SSR.

## Pages and their purpose

| Path | Purpose | Audience |
|---|---|---|
| `/` | Hero + last 5 votes + CTAs to votes / newsletter | Curious citizen |
| `/votes` | Searchable list of votes with filters (topic, proposing group, result, free text) | Journalist, citizen |
| `/votes/[id]` | One vote: subject, totals, **per-group cohesion bars**, proposing group | Anyone going deep |
| `/persons` | Searchable directory of deputies, with current group badge | Citizen looking up MP |
| `/persons/[id]` | Photo, current group, KPI strip (votes/attendance/dissidence), **per-topic vote breakdown**, mandates timeline | Citizen, journalist |
| `/groups` | All 9 parliamentary groups, sorted by member count, colored cards | Citizen |
| `/groups/[slug]` | Party "infobox lite" (colored badge, founding year, scope, web/wiki), **per-topic group voting**, expandable members list | Citizen, journalist |
| `/topics` | Taxonomy grid (17 themes) | Browser |
| `/topics/[slug]` | Recent votes classified under that theme | Researcher |
| `/stats` | Aggregate site-wide: initiatives by status / type / topic, votes by result / proposing group, topic global breakdown | Researcher, journalist |
| `/about` | Mission, principles, coverage, licence | New visitor |
| `/admin/newsletter/preview` | Preview of weekly digest (HTML + text) | Editor |
| `/embed/*` | Single-vote / single-deputy / single-group widgets for media to embed (designed but not exercised yet) | Press partners |

## Features in flight (not yet visible)

- **Plain-language explanation**: short LLM-generated 2-3 sentence summary
  of each vote's subject, neutral and descriptive. Will appear under the
  legalese on `/votes/[id]`.
- **Historical backfill of votes** (~177 sessions of XV legislature). When
  it lands, every chart on the site fills out instantly.
- **Cards socials** generated with `@vercel/og`: shareable PNG of one
  vote's outcome with the date, total, group-level outcome — facts only.
- **Newsletter weekly digest**: HTML email; templates exist
  (`backend/app/newsletter/render.py`), Listmonk integration is wired.
- **Embeddable widgets** for press: single vote, single MP, single group.
- **Phase 2/3** chambers: Catalan Parliament, Barcelona City Council. Same
  metaphors apply.

## Visual problems to solve

These are the items where the current design feels under-developed.
Address them with concrete proposals:

### Hero / `/` page
Today it's text-only. Needs a way to communicate "this is what we do" at
a glance — perhaps a sparkline of the current week's votes, or a "right
now in Congreso" widget. Must NOT lead with a featured vote that implies
editorial selection.

### `/votes` list density
Each row carries a lot: date, category chip, expediente number, proposing
group chip, subject text, result badge, totals. It's information-dense
and risks visual chaos. Propose a hierarchy that keeps everything but
breathes.

### `/persons` browsability
350 deputies with photos. Today they're a 3-column grid of small cards.
Could be a richer index — maybe with a colored sidebar per group, or a
visual that gives a sense of the chamber's composition. Don't lose the
search bar.

### `/groups/[slug]` infobox
Currently has a left border in the group's colour and a couple of stats.
Could lean further into the "civic infobox" feel without becoming
partisan. The colored circle stand-in for a logo works; expand around it.

### `/stats` page
Today it's stacked sections with horizontal bars. It works but has the
"FastAPI Swagger UI but pretty" feel. A real dashboard treatment with
clear hierarchy would help. The sections are listed in `app/stats/page.tsx`.

### Empty states
Many sections show "encara no hi ha prou dades..." because of incomplete
ingestion. These messages should reassure (this is normal, here's why)
not feel like errors.

### Group voting bar (CohesionRow) on vote detail
Right now it's a single stacked bar per group with counts on the right.
Functional but not memorable. Open to alternative chart types as long as
they preserve the symmetry rule.

### Weekly newsletter HTML
Currently table-based, mail-safe. Functional but old-fashioned. A more
modern card-based design that still passes Outlook would be welcome.

## Things to NOT change

- The colored circle / abbreviation pattern for parties. We deliberately
  don't ship official party logos for licensing and neutrality reasons.
- The 17-topic taxonomy slugs. Their colors can be retuned.
- Catalan as the default locale.

## How to deliver

A markdown design proposal at `docs/design-proposal.md` with:

1. **Mood & tokens.** Updated palette (vote choice colors, group colors,
   surface tokens). Updated spacing / radius / shadow tokens. Justify
   choices against accessibility (WCAG AA). Output as Tailwind config or
   CSS custom properties — whichever fits cleaner with the current setup.
2. **Per-page mockups.** ASCII or compact diagrams for each problem
   listed above. Show before/after where relevant.
3. **Component-level proposals** for `GroupBadge`, `CohesionRow`,
   `TopicBars`, the new hero widget, the `/persons` index treatment.
4. **Empty-state pattern** that's reusable.
5. **Newsletter HTML refresh** mockup.
6. **Open questions for Daniel** — anything you couldn't decide without
   his judgment (e.g. whether to introduce a small accent color, whether
   to keep dark mode neutral or let group colors drive it, etc.).

Keep the proposal under 1500 words of prose; the bulk should be visual /
schematic. Tight wins.
