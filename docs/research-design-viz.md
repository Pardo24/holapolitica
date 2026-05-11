# Research — Charts, person/group page redesign, perf

Audience: implementing dev. Scope: `/persons/[id]`, `/groups/[slug]`, new `/stats`. Stack already in repo: Next 15 App Router, React 19, Tailwind 3, no chart lib yet (`frontend/package.json`). shadcn/ui dir is empty (`frontend/components/ui/`) — primitives still TBD.

## 1. Charting library — pick: Recharts

| Lib       | Bundle (min+gz)                     | RSC story                                                                      | A11y      | Verdict                                                  |
| --------- | ----------------------------------- | ------------------------------------------------------------------------------ | --------- | -------------------------------------------------------- |
| Recharts  | ~95 KB (tree-shaken bars+pie ~50KB) | Client-only (uses `ResponsiveContainer` w/ ResizeObserver). Wrap in `'use client'` leaf. | Decent, needs aria-labels manually | Pick this.                                               |
| Tremor    | ~140 KB + Recharts inside           | Same as Recharts but more wrappers & opinionated CSS that fights Tailwind tokens. | Same      | Skip — duplicates work and we already have Tailwind tokens dialed in. |
| Visx / D3 | 30–60 KB if you import only what you need | RSC-friendly (pure SVG, no window) but you write axes/legends/tooltips by hand. | You own it. | Overkill for v1; revisit if we need a custom heatmap.    |

**Decision:** Recharts. Reasons: declarative React, tree-shakable (`import { BarChart, Bar } from 'recharts'`), good docs, paints fine in dark mode if we drive colors via CSS vars. Bundle hit acceptable because charts are page-level not in the global shell. Mitigation: lazy-load via `next/dynamic({ ssr: false })` so charts don't ship on `/`, `/votes`, etc.

Pattern:

```tsx
// frontend/components/charts/TopicVoteBarsClient.tsx  ('use client')
// frontend/components/charts/TopicVoteBars.tsx        (RSC wrapper, dynamic import)
const TopicVoteBarsClient = dynamic(() => import('./TopicVoteBarsClient'), { ssr: false, loading: () => <SkeletonBars /> });
```

Render a real, non-interactive SVG fallback in the loading state so first paint shows the data shape.

## 2. Chart designs

### 2.1 Per-topic vote breakdown (deputy or group) — 17 topics

Closed state: highlight 2 most-voted topics + collapsed list. Each row is a single 100%-stacked horizontal bar (aye / no / abst / absent). No labels on bar, label outside.

```
Distribució de vots per tema                                  142 votacions

 Habitatge          39 votacions
 [████████████████████░░░░░░░░░░░] 64% sí · 33% no · 3% abst.

 Drets laborals     27 votacions
 [██████████████████████████░░░░░] 81% sí · 11% no · 8% abst.

 Veure tots els temes (15 més)  ▾
```

Expanded state: same row pattern, dense (32 px tall). On hover, full numbers in tooltip; on focus, same in aria-label. Threshold for "highlight": 2 topics with most votes (descending count) — never "topic where they voted yes the most" (that would be editorial).

Implementation: do **not** use Recharts here — it's literally 4 stacked `<div>`s with widths in %. Cheaper, accessible (`role="img"` + `aria-label="64% a favor, 33% en contra, 3% abstenció en 39 votacions"`), zero JS.

```
[ Bar ─ 4 segments ]
<div role="img" aria-label="…" class="flex h-2 rounded overflow-hidden bg-slate-200">
  <div class="bg-vote-aye"  style="width:64%"></div>
  <div class="bg-vote-no"   style="width:33%"></div>
  <div class="bg-vote-abst" style="width: 3%"></div>
  <div class="bg-slate-300" style="width: 0%"></div> {/* absent */}
</div>
```

### 2.2 Initiatives by topic (`/stats`) — horizontal bars, sorted

Heatmap is too dense for 17 rows; stacked bars hide the absolute count. Pick **horizontal bars**, sorted descending, with a thin secondary bar for "approved" inline.

```
Iniciatives per tema (XV legislatura — 1 423 total)

 Habitatge          ████████████████████████████████  312
                    └──── 198 aprovades

 Drets laborals     █████████████████████████        247
                    └──── 102 aprovades
 …
```

Implementation: Recharts `<BarChart layout="vertical">` with two `<Bar>` (total + approved). Approved bar overlays first half (use `stackId` distinct so they sit alongside; or simpler: render the approved bar as a thinner element inside same row using a custom shape). Alt: keep it as plain divs again — only 17 rows.

### 2.3 Approved vs rejected per topic — paired bars (diverging)

Donut hides direction; grouped bars hide proportion. Use a **diverging horizontal bar** centered on zero.

```
Aprovades  ←                                  → Rebutjades
Habitatge       198 ████████████░░░░░░░░░  114
Drets lab.      102 █████████░░░░░░░░░░░░  145
Medi ambient     67 ██████░░░░░░░░░░░░░░░  201
…                              0
```

Recharts: `<BarChart layout="vertical" stackOffset="sign">`, one bar series with positive (approved) and negative (rejected) values, two colors via `<Cell>`. Center axis at 0, hide x-axis ticks, label totals at the ends. Symmetry rule satisfied — both sides get equal visual weight.

## 3. `/persons/[id]` upgrades

Current photo at `frontend/app/persons/[id]/page.tsx:42-55` is `w-28 h-28` (~112 px, not 96 — your message said 96, code says 112). Either way, too small for a hero.

**Suggested:** 192 × 192 px on desktop (`w-48 h-48`), 128 × 128 on mobile, square with `rounded-xl` and `object-cover`, on the left of a two-column header. Source images from Congreso are usually 200 × 250 portrait — display 4:5 not 1:1 to avoid head-cropping: `aspect-[4/5] w-48`.

```
┌───────────────────────────────────────────────────────────────┐
│ ┌──────────┐  Cristina Abades Martínez                         │
│ │          │  ● PSOE · Madrid · electa per PSOE-M (2023)       │
│ │  PHOTO   │                                                   │
│ │ 192×240  │  ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──     │
│ │          │  142 vots emesos · 87% assistència · 3% dissident │
│ │          │  Fitxa oficial ↗   Wikipedia ↗                    │
│ └──────────┘                                                   │
└───────────────────────────────────────────────────────────────┘
```

Reading hierarchy:
1. Name (h1, 2xl bold)
2. Group chip + constituency + electoral list (one line, muted)
3. KPI strip: vote count, attendance %, dissidence % (3 numbers, large, equal weight — symmetric framing, no "good/bad")
4. External links

Below header: tabs or sections — *Mandats*, *Votacions per tema* (the chart from 2.1), *Darreres votacions*, *Grup parlamentari (timeline)* if they switched groups. The group-switch timeline is critical to show, per CLAUDE.md "No descartar l'històric de pertinença a grup". Render as:

```
2023-08 ─●─ GP Socialista
2024-11 ─●─ GP Mixt (no adscrita)
2025-02 ─●─ actual (GP Socialista)
```

Plain `<ol>` with left border + dots, no chart lib needed.

## 4. `/groups/[slug]` upgrades

### Party "infobox-lite"

Hard-code a small static record per the 9 known group slugs in `frontend/lib/groups.ts` (already exists per imports). Keep it minimal and factual:

```ts
// frontend/lib/groups.ts (extend)
export const GROUP_INFO: Record<string, { foundedYear: number; ideologyTags: string[]; website: string; }> = { … };
```

Render to the right of the colored disc in the header (replace current `border-l-4` strip with a proper card):

```
┌────────────────────────────────────────────────────────────────┐
│  ●●●  Grupo Parlamentario Popular                              │
│  PP   137 diputats · Fundat 1989 · Centre-dreta · pp.es ↗      │
└────────────────────────────────────────────────────────────────┘
```

Disc = existing `<GroupBadge size="lg">` (44 px). Bump to a new `xl` size at 64 px for the group page hero. Ideology tags as small neutral chips (`Centre-dreta`, `Liberal-conservador`) — derived from a fixed taxonomy, never auto-generated, always reviewed by Daniel.

### Members (137) ▾ — progressive disclosure

Current `frontend/app/groups/[slug]/page.tsx:62-77` renders all 137 in one grid. Two slow things: (a) 137 server-rendered DOM nodes ship in HTML; (b) every card is a `<Link>` so Next prefetches them on hover/visible, hammering the API with prefetch requests when the list is in viewport.

**Recommended pattern:**

```
Membres (137)                          [ A-Z | Càrrec | Circumscripció ]

  Mesa i portaveus (4)
    [ 4 cards ]
  Tots els membres (137)
    [ 12 cards visibles ]
    [ Mostra'ls tots ▾ ]   ← progressive
```

1. Server-render the **first 12** alphabetically + the role-holders (portaveu, portaveu adjunt, secretari) always visible. Total ~16 cards on first paint.
2. The remaining 125 go inside a `<details>` element, server-rendered but `display:none` until opened. No JS needed; SEO still gets all 137 in HTML.
3. Disable Next prefetch on member cards: `<Link href={…} prefetch={false}>`. This is the biggest single win. Each card prefetches its target route's RSC payload on hover/visible — with 137 visible at once on a fast scroll, that's a thundering herd to `/persons/[id]`.

Alt: virtualization (react-virtual) is overkill for 137 rows.

### Group page chart

Reuse component from 2.1 (`TopicVoteBars`) plus a "cohesion over time" line — `frontend/components/CohesionRow.tsx` already exists, so wire that into a single line chart rather than introducing a new viz.

## 5. Performance

Why `/groups/gp-popular` is slow today:

1. **Two awaited API calls in series** at `frontend/app/groups/[slug]/page.tsx:28-29` — `await api.groups.get` then `await api.groups.members`. Wrap in `Promise.all`.
2. **137 `<Link>` cards with default prefetch.** As noted, set `prefetch={false}`.
3. **No streaming.** The whole page blocks on the slowest call. Next 15 lets you stream by splitting into Suspense boundaries.

Right Next 15 RSC pattern:

```tsx
// frontend/app/groups/[slug]/page.tsx
export default async function GroupPage({ params }) {
  const { slug } = await params;
  const group = await api.groups.get(slug);          // fast, blocks shell
  return (
    <article>
      <GroupHeader group={group} />                  // renders immediately
      <Suspense fallback={<MembersSkeleton />}>
        <GroupMembers slug={slug} />                 {/* awaits its own fetch */}
      </Suspense>
      <Suspense fallback={<ChartSkeleton />}>
        <GroupTopicChart slug={slug} />
      </Suspense>
    </article>
  );
}
```

Each child server component does its own `await api.groups.X(slug)`. The shell paints in <300 ms; the slow lists stream in. Add `export const revalidate = 300;` at the page top so identical requests share the RSC cache for 5 min.

## 6. Tailwind palette — vote choice colors

Current `#16a34a / #dc2626 / #eab308` (Tailwind `green-600 / red-600 / yellow-500`).

- Green/red contrast vs white BG: 4.54:1 / 5.74:1 — passes AA for normal text but green is borderline. On colored bars (no text on top) it's fine.
- Red `#dc2626` is the same red used by PP brand; can read partisan in vote rows. Shift slightly orange-ish to break that association.
- Yellow `#eab308` against white is too low contrast (1.78:1) and reads partisan (Vox/yellow-vest). Switch to a desaturated amber.
- Add a 4th token for "absent" (slate) — currently unstated.

Proposed (define in `frontend/app/globals.css` and Tailwind theme):

```css
--vote-aye:  142 71% 38%;   /* #1a945e — green, slightly muted, AA on white */
--vote-no:   0   72% 47%;   /* #cc2a2a — clearly red but a hair away from PP red */
--vote-abst: 38  92% 50%;   /* #f59e0b — Tailwind amber-500, more visible than 500 yellow */
--vote-absent: 215 16% 65%; /* slate, for "no consta" */
```

Tailwind config:

```ts
// frontend/tailwind.config.ts
colors: {
  vote: {
    aye:    'hsl(var(--vote-aye))',
    no:     'hsl(var(--vote-no))',
    abst:   'hsl(var(--vote-abst))',
    absent: 'hsl(var(--vote-absent))',
  },
},
```

Use `bg-vote-aye / text-vote-no` etc. throughout. Single source of truth, dark-mode override via CSS vars (lighten ~10% for contrast on dark BG).

---

**Files to touch:**
- `frontend/package.json` — add `recharts`
- `frontend/tailwind.config.ts`, `frontend/app/globals.css` — vote color tokens
- `frontend/app/persons/[id]/page.tsx` — bigger photo, KPI strip, tabs
- `frontend/app/groups/[slug]/page.tsx` — `Promise.all`, Suspense boundaries, infobox-lite
- `frontend/lib/groups.ts` — extend `GROUP_INFO` with founding year + ideology tags
- `frontend/components/charts/TopicVoteBars.tsx` (new — pure CSS/divs, no Recharts)
- `frontend/components/charts/InitiativesByTopic.tsx` (new — Recharts client)
- `frontend/components/charts/ApprovedVsRejected.tsx` (new — Recharts client diverging)
- `frontend/components/MembersList.tsx` (new — first-12 + `<details>` overflow)
- `frontend/app/stats/page.tsx` (new — composes the three charts)
