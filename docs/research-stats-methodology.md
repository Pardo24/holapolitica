# Topic-based voting statistics — methodology

Math + framing for the per-deputy, per-group, and global topic charts. Implementation/viz choices deferred.

## 1. Denominator for "% aye / no / abstention"

**Chosen primary denominator: votes cast (aye + no + abstention), excluding absences and "no vote recorded".**

Rationale: aye/no/abstention are the three positions a representative actively takes; absence is a separate behaviour and is already covered by the `attendance` metric. Mixing absence into a topic-position chart conflates "didn't show up" with "took position X", which is editorially loaded ("they're avoiding housing votes").

Document as alternative views (toggle, not default):
- **Of votes attended**: same as primary in our model, since `ABSENT` and `NO_VOTE_RECORDED` collapse to one bucket (see STATUS.md). If we later split them, "attended" = aye+no+abstention+no-vote-while-present.
- **Of all topic votes (incl. absences)**: useful for "engagement on topic X", but must be labelled as such, not as a position metric.

Always show the raw counts next to the percentages (`12 a favor / 3 en contra / 1 abstenció — 4 absències`). Percentages alone hide N.

## 2. Minimum-N rule

- **Hide topic from chart if votes_cast < 5.** Below 5 a single vote moves the percentage by ≥20 points, which is editorial noise.
- **5 ≤ N < 15**: show with a visible "mostra petita (N=7)" badge and no highlighting eligibility (see §3).
- **N ≥ 15**: full display, eligible for highlighting.
- Always expose total N per topic. Never round N away.

These thresholds are conservative defaults; revisit once historical backfill multiplies sample sizes.

## 3. Multi-topic vote assignments

A vote tagged `housing` AND `economy` counts in **both** topic buckets. Document this explicitly in the chart caption ("una votació pot pertànyer a més d'un tema"). The trade-off:

- **Double-counting (chosen)**: topic totals don't sum to total votes; preserves the meaning of each topic's % (it answers "of housing votes, how did they vote").
- **Fractional assignment (rejected)**: 0.5 weight per topic. Sums correctly but invents a precision the LLM classifier doesn't have.
- **Primary-topic-only (rejected)**: forces the classifier to a single label and discards real signal.

Show "N votacions classificades com a [topic]" so users see overlap is possible.

## 4. "Most in favor / most against" highlighting — symmetry gotchas

The user's framing (highlight one favourite + one most-rejected topic) is **symmetric in shape but vulnerable to small-N artifacts**. Rules to keep it honest:

- Eligible for highlighting only if **N ≥ 15** in that topic AND the topic accounts for **≥ 5% of the deputy's total votes cast**. This kills the "100% yes on memoria democràtica with N=2" case.
- Highlight as a **paired badge** ("més vots a favor: habitatge — més vots en contra: defensa"), never one alone. If only one side qualifies, show neither — explain "no hi ha prou mostra per destacar un tema".
- Use **margin over baseline**, not raw %: the highlight is the topic where the entity's aye-rate most exceeds *its own overall aye-rate*, and analogously for no. Otherwise a deputy who votes yes on 80% of everything will have every topic highlighted as "in favour".
- Never use words like "preferred", "favourite", "rejects". Neutral wording: "tema amb major proporció de vots favorables / contraris".

## 5. Per-group fairness

Groups don't see identical samples (Mociones from one group rarely get yes-votes from rival groups; the proposing group is procedurally locked in). To stay neutral:

- Compute group stats over **the same denominator as deputies** (votes cast by the group, weighted by member-votes or by group-line — pick group-line, since cohesion is already a separate metric).
- Add a per-topic flag "X% d'aquestes votacions provenen del propi grup" when ≥30%, since procedural self-voting distorts the aye-rate. Don't hide the topic; annotate it.
- Show all 9 groups on the same axis on /stats — no group-specific page that omits comparators.

## 6. Global /stats page — neutral framing

Avoid: "rejection rates", "controversial topics", "most contested". These all imply a winner.

Suggested neutral axis: **volum, resultat, consens.** Each chart shows the full distribution, not extremes.

### Proposed charts (priority order)

1. **Iniciatives per tema i estat** (stacked bar, 17 topics × {aprovada, rebutjada, en tràmit, retirada, caducada}).
   - Aggregation: `count(initiatives) GROUP BY topic, status`.
   - Title: "Iniciatives presentades per tema i estat de tramitació".
   - Guardrail: hide topics with <5 initiatives total; show "altres temes (N=12)" footer row.

2. **Votacions per tema** (horizontal bar, sorted by N desc).
   - Aggregation: `count(votes) GROUP BY topic` (votes can appear in multiple bars; document).
   - Title: "Volum de votacions per tema".
   - Guardrail: N ≥ 3 to appear; rest collapsed into "altres".

3. **Distribució del resultat per tema** (100% stacked bar, {aprovada, rebutjada, empat}).
   - Aggregation: `vote.outcome GROUP BY topic`, normalised to %.
   - Title: "Resultat de les votacions per tema".
   - Guardrail: only topics with N ≥ 10 votes.

4. **Cohesió mitjana per tema** (bar, one bar per topic, scale 0-1).
   - Aggregation: mean of the existing per-vote cohesion metric, grouped by topic, weighted equally per vote.
   - Title: "Cohesió mitjana dels grups per tema".
   - Guardrail: N ≥ 10 votes per topic.

5. **Matriu coincidència de grups per tema** (heatmap, group × group, one cell = % votes both voted same way; one tab per topic, default = "tots els temes").
   - Aggregation: existing coincidence metric, filtered by topic.
   - Title: "Coincidència entre grups per tema".
   - Guardrail: hide cells with N < 10 votes in that topic; show count on hover.

6. **Iniciatives per proposant i tema** (heatmap, group × topic, cell = count).
   - Aggregation: `count(initiatives) GROUP BY submitting_group, topic`.
   - Title: "Iniciatives presentades per grup i tema".
   - Guardrail: aggregate "individual / multi-grup" submitters into a single row.

7. **Evolució temporal** (small-multiples line, one panel per topic, monthly count of votes).
   - Aggregation: `count(votes) GROUP BY topic, date_trunc('month', vote_date)`.
   - Title: "Activitat parlamentària per tema al llarg del temps".
   - Guardrail: only render once we have ≥6 months of backfilled data; defer to post-backfill.

All seven respect symmetry: full distributions, paired or matrixed where comparative, neutral nouns ("volum", "distribució", "cohesió", "coincidència") rather than evaluative adjectives.

## 7. Caveats to publish alongside the charts

- "La classificació temàtica és automàtica (LLM) i pot contenir errors." Link to the classifier's prompt and accuracy notes once measured.
- "Una votació pot pertànyer a més d'un tema."
- "Les dades cobreixen la legislatura XV des de [data]; abans d'aquesta data hi ha buit per pendent de backfill."
- Sample size always visible.
