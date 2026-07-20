/**
 * Hola Política · Redisseny V1 "Editorial v2"
 * Drop-in replacement for `frontend/app/votes/[id]/page.tsx`.
 *
 * Què canvia respecte la versió actual:
 *  · Header tipo capçalera de premsa: meta-strip dot-separated amb
 *    resultat + marge + proposat-per + temes + enllaç BOE en una sola
 *    línia, en comptes de blocs amb borderLeft.
 *  · Tots els eyebrows en blau majúscula fora — els títols de secció
 *    són serif ink (h2 20px), les etiquetes petites de dades són
 *    ink-3 sentence-case sense regla.
 *  · Nou bloc "Recompte" amb els 4 KPIs grans + StackedBar +
 *    explicació de la majoria simple. Espai reservat opcional per a
 *    un mini-hemicicle a la dreta (veure exports/README.md).
 *  · Nou peu de pàgina (Iniciativa · BOE · Documents) en 3 columnes.
 *
 * Cap nova traducció obligatòria: tots els missatges es deriven dels
 * que ja existeixen a frontend/messages/{ca,es,en}.json. Una llista
 * curta de NOVES claus opcionals (per a noms de secció més
 * descriptius) viu a exports/messages-additions.json.
 *
 * Components reutilitzats sense canvi:
 *   AnnotatedText, GroupChip, ResultPill, StackedBar, SplitCohesionRow
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { ExternalLink, FileText, User } from 'lucide-react';

import { AiBadge } from '@/components/AiBadge';
import { AnnotatedText } from '@/components/AnnotatedText';
import { GroupChip } from '@/components/GroupChip';
import { Hemicycle } from '@/components/Hemicycle';
import { LawJourney } from '@/components/LawJourney';
import { LawTypeChip } from '@/components/LawTypeChip';
import {
  GroupStanceBand,
  type PartyStanceWithCount,
} from '@/components/GroupVoteBreakdown';
import { NoBreakdownNotice, noBreakdownReason } from '@/components/NoBreakdownNotice';
import { ResultPill } from '@/components/ResultPill';
import { ShareButton } from '@/components/ShareButton';
import { VoteDonut } from '@/components/VoteDonut';
import {
  api,
  ApiError,
  type CohesionResult,
  type Initiative,
  type Vote,
  type VoteHemicycleLayout,
} from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';
import { pickPlainSummary } from '@/lib/glossary';
import { pickTopicName } from '@/lib/topics';

interface Params {
  id: string;
}

const RESULT_CA: Record<string, string> = {
  approved: 'Aprovada',
  rejected: 'Rebutjada',
  tie: 'Empat',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const voteId = Number(id);
  if (!Number.isFinite(voteId)) return {};
  try {
    const v = await api.votes.get(voteId);
    const subject = v.description?.trim() || v.title;
    const subjectShort =
      subject.length > 140 ? subject.slice(0, 137) + '…' : subject;
    const dateStr = new Date(v.voted_at).toLocaleDateString('ca-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const result = RESULT_CA[v.result] ?? v.result;
    const description = v.approved_by_assent
      ? `Votació al Congrés (${dateStr}): aprovat per assentiment, sense votació nominal.`
      : `Votació al Congrés (${dateStr}): ${result}. ${v.ayes} Sí · ${v.noes} No · ${v.abstentions} Abst.`;
    return {
      title: subjectShort,
      description,
      openGraph: { title: subjectShort, description, type: 'article' },
      twitter: { card: 'summary_large_image', title: subjectShort, description },
    };
  } catch {
    return {};
  }
}

// ─── Local presentational helpers (no styling classes added to globals.css;
//     keep this file self-contained). ───────────────────────────────────

/**
 * Tiny inline meta label. Sentence-case, ink-3, no rule, no caps.
 * Replaces the previous blue uppercase `.eyebrow` for data-row
 * labels like "Proposat per" or "Temes".
 */
function Lbl({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span
      style={{
        fontSize: 11.5,
        color: 'var(--ink-3)',
        fontWeight: 500,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Inline color swatch + label + tabular count. Used by the
 *  vote-coloured hemicycle legend in the totals card. Kept here
 *  (not in components/) because the swatch styling is bound to this
 *  one widget. */
function LegendSwatch({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: color,
          display: 'inline-block',
        }}
      />
      <span>{label}</span>
      <span className="tabular" style={{ color: 'var(--ink-2)', fontWeight: 600 }}>
        {value}
      </span>
    </span>
  );
}

/** Quiet section title. Serif ink, no eyebrow above. Optional dek. */
function SectionTitle({
  children,
  dek,
  right,
}: {
  children: React.ReactNode;
  dek?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
        marginBottom: 12,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h2
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 20,
            fontWeight: 600,
            color: 'var(--ink)',
            letterSpacing: '-0.012em',
            lineHeight: 1.2,
            margin: 0,
          }}
        >
          {children}
        </h2>
        {dek && (
          <p
            style={{
              fontSize: 12,
              color: 'var(--ink-3)',
              margin: '3px 0 0',
              lineHeight: 1.5,
              maxWidth: 520,
            }}
          >
            {dek}
          </p>
        )}
      </div>
      {right && (
        <span
          style={{
            fontSize: 11,
            color: 'var(--ink-3)',
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {right}
        </span>
      )}
    </div>
  );
}

/**
 * Turn the per-group cohesion breakdown into the grouped-stance shape
 * the {@link GroupVoteBreakdown} renders. Each group is placed in the
 * column of its dominant choice (aye / no / abstention / absent), and
 * ``count`` is how many of its deputies cast that choice — so "who
 * backed this, and with how many votes" reads at a glance.
 */
function cohesionToStance(cohesion: CohesionResult[]): PartyStanceWithCount[] {
  return cohesion.map((c) => {
    const options: [string, number][] = [
      ['aye', c.ayes],
      ['no', c.noes],
      ['abstention', c.abstentions],
      ['absent', c.no_vote],
    ];
    let choice = options[0]![0];
    let count = options[0]![1];
    for (const [ch, n] of options) {
      if (n > count) {
        choice = ch;
        count = n;
      }
    }
    return {
      slug: c.group_slug,
      name_short: c.group_name_short,
      color_hex: c.group_color_hex,
      choice,
      count,
    };
  });
}

export default async function VoteDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const voteId = Number(id);
  if (!Number.isFinite(voteId)) notFound();

  const t = await getTranslations('votes');
  const tCommon = await getTranslations('common');
  const tInitiative = await getTranslations('initiative_detail');
  const locale = await getLocale();

  let vote: Vote;
  let cohesion: CohesionResult[] = [];
  try {
    vote = await api.votes.get(voteId);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  // Fetched separately and best-effort. It used to share the try above, so
  // a 404 from /metrics/cohesion — which the API returned for any vote with
  // no per-deputy records — made the whole page render as "vote not found".
  // The vote plainly exists; it just has no breakdown, which the page now
  // states explicitly. Never let a supporting metric 404 the primary record.
  cohesion = await api.metrics.cohesion(voteId).catch(() => [] as CohesionResult[]);
  const dissidents = await api.votes
    .dissidents(voteId)
    .catch(() => ({ blocks: [] as Awaited<ReturnType<typeof api.votes.dissidents>>['blocks'] }));
  // GP Mixt is, by definition, a bag of unaligned deputies — "breaking with
  // the group" there isn't meaningful, so we drop it from the dissidents.
  const dissidentBlocks = dissidents.blocks.filter((b) => b.group_slug !== 'gp-mixto');
  // Drives the body grid: no dissidents means no second column, rather
  // than a reserved-but-empty half page.
  const hasDissidents = !vote.approved_by_assent && dissidentBlocks.length > 0;

  // "How each group voted" — built from the cohesion breakdown, which
  // carries the per-group vote counts. Each group is placed in the
  // column of its dominant choice and shows how many of its deputies
  // cast it. This replaces the old cohesion "voto por grupo" bars.
  const tSession = await getTranslations('session_sheet');
  const voteStance = cohesionToStance(cohesion);
  // Null for the overwhelming majority of votes; otherwise which of the
  // three legitimate reasons applies. Drives both the stance slot and the
  // recount card, so a vote without a breakdown keeps the same page shape
  // instead of collapsing into a different-looking page.
  const noBreakdown = noBreakdownReason({
    approvedByAssent: vote.approved_by_assent,
    hasBreakdown: voteStance.length > 0,
    subject: vote.description ?? vote.title,
  });
  const stanceLabels = {
    aye: tSession('choice_aye'),
    no: tSession('choice_no'),
    abstention: tSession('choice_abstention'),
    absent: tSession('choice_absent'),
  };

  let initiative: Initiative | null = null;
  if (vote.initiative_id != null) {
    try {
      initiative = await api.initiatives.get(vote.initiative_id);
    } catch {
      initiative = null;
    }
  }

  // Per-vote hemicycle — each seat coloured by the choice cast on
  // THIS vote, not by the deputy's group. Failure is best-effort: the
  // chart simply isn't rendered when the layout can't be loaded
  // (rare; the endpoint is cached server-side).
  let voteHemicycleLayout: VoteHemicycleLayout | null = null;
  try {
    voteHemicycleLayout = await api.votes.hemicycle(voteId);
  } catch {
    voteHemicycleLayout = null;
  }

  const subject = vote.description?.trim() || vote.title;
  const dateStr = new Date(vote.voted_at).toLocaleDateString(locale, {
    dateStyle: 'long',
  });
  const totalCast = vote.ayes + vote.noes + vote.abstentions;
  // Whether the chamber published any numbers at all. False only for
  // approval by assent, where no division was held. Secret ballots and
  // ingest gaps DO carry totals — they just lack the per-deputy detail.
  const hasTotals = totalCast + vote.absent > 0;
  const needed = Math.floor(totalCast / 2) + 1;
  const margin = vote.ayes - vote.noes;
  const summary = pickPlainSummary(vote, locale);

  const topics = vote.topics ?? initiative?.topics ?? [];

  return (
    <article>
      {/* Trajectory banner — same dark strip used on /initiatives/[id].
          When the vote has a linked initiative we use the initiative's
          type + status; this lets a PNL vote that ALREADY happened
          still show "Proposició no de Llei → Votació" as the
          terminal step. Skipped when the vote has no initiative (the
          legacy unlinked-vote case) to avoid guessing a journey from
          incomplete data. */}
      {initiative && (
        <LawJourney
          type={initiative.type}
          status={initiative.status}
          hasBoe={!!initiative.boe_url}
          voteResult={vote.result}
        />
      )}

      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: 'var(--ink-3)', paddingTop: 6 }}>
        <Link href="/votes" style={{ color: 'var(--ink-2)' }}>
          {t('header_subject_breadcrumb')}
        </Link>
        {vote.expediente_raw && (
          <>
            {' / '}
            <span className="mono">{vote.expediente_raw}</span>
          </>
        )}
      </div>

      {/* Header */}
      <header style={{ paddingTop: 8, paddingBottom: 22, borderBottom: '1px solid var(--ink)' }}>
        {/* Eyebrow-strip replaced with sentence-case meta line */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 14,
            flexWrap: 'wrap',
            marginBottom: 10,
          }}
        >
          <Lbl style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{vote.title}</Lbl>
          {vote.expediente_raw && (
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
              EXP {vote.expediente_raw}
            </span>
          )}
          <span className="tabular" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            {dateStr}
          </span>
        </div>

        {/* Headline. When an AI plain-language summary exists it LEADS —
            it's what a citizen actually reads — and the official legal
            text drops below it, smaller and muted. Votes without a
            summary keep the original subject as the headline. Sized
            down from the previous clamp(28,3.4vw,40): many subjects run
            3-4 lines and were eating half the viewport. */}
        {summary ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <AiBadge label={t('plain_summary_ai_badge')} />
            </div>
            <h1
              className="serif"
              style={{
                margin: '0 0 12px',
                fontSize: 'clamp(19px, 2.2vw, 26px)',
                lineHeight: 1.35,
                letterSpacing: '-0.012em',
                fontWeight: 500,
                maxWidth: 860,
                textWrap: 'pretty',
                whiteSpace: 'pre-line',
              }}
            >
              {summary}
            </h1>
            <p
              style={{
                margin: '0 0 16px',
                fontSize: 13,
                lineHeight: 1.5,
                color: 'var(--ink-3)',
                maxWidth: 860,
                textWrap: 'pretty',
              }}
            >
              <AnnotatedText text={subject} />
            </p>
          </>
        ) : (
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-serif)',
              fontSize: 'clamp(20px, 2.4vw, 28px)',
              lineHeight: 1.25,
              letterSpacing: '-0.014em',
              fontWeight: 600,
              maxWidth: 920,
              marginBottom: 18,
              textWrap: 'pretty',
            }}
          >
            <AnnotatedText text={subject} />
          </h1>
        )}

        {/* Meta strip — dot-separated, low-chrome */}
        <div
          className="vote-meta-strip"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
            fontSize: 13,
            color: 'var(--ink-2)',
          }}
        >
          {/* Type chip first — same binding (creates-law / non-binding) signal
              as the list rows, so the detail speaks the same language. */}
          {vote.initiative_type && (
            <>
              <LawTypeChip type={vote.initiative_type} size="md" />
              <span style={{ width: 3, height: 3, borderRadius: 999, background: 'var(--ink-3)', opacity: 0.6, display: 'inline-block' }} />
            </>
          )}
          {/* Result + margin. An assent vote says so explicitly — a plain
              green "Aprobada" would hide that no roll call happened. */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <ResultPill
              result={vote.result}
              label={vote.approved_by_assent ? t('assent_title') : t(`result.${vote.result}`)}
            />
            {!vote.approved_by_assent && (
              <span className="tabular" style={{ color: 'var(--ink-3)', fontSize: 12 }}>
                {margin >= 0 ? `+${margin}` : margin}
              </span>
            )}
          </div>
          {(vote.proposing_group_short || vote.proposed_by_government) && (
            <>
              <span style={{ width: 3, height: 3, borderRadius: 999, background: 'var(--ink-3)', opacity: 0.6, display: 'inline-block' }} />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Lbl>{t('proposed_by')}</Lbl>
                {vote.proposed_by_government && !vote.proposing_group_short ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontWeight: 600,
                      color: 'var(--ink)',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--ink)' }}
                    />
                    {t('proposed_by_government')}
                  </span>
                ) : vote.proposing_group_short ? (
                  <GroupChip
                    slug={vote.proposing_group_slug ?? undefined}
                    short={displayGroupShort(vote.proposing_group_short)}
                    color={vote.proposing_group_color}
                    size="sm"
                  />
                ) : null}
              </span>
            </>
          )}
          {topics.length > 0 && (
            <>
              <span style={{ width: 3, height: 3, borderRadius: 999, background: 'var(--ink-3)', opacity: 0.6, display: 'inline-block' }} />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Lbl>Temes</Lbl>
                <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                  {topics.map((topic) => (
                    <Link
                      key={topic.slug}
                      href={`/topics/${topic.slug}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 11.5,
                        padding: '3px 9px',
                        borderRadius: 4,
                        background: 'var(--accent-soft)',
                        color: 'var(--accent-2)',
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      {pickTopicName(topic, locale)}
                    </Link>
                  ))}
                </span>
              </span>
            </>
          )}
          {initiative?.boe_url && initiative?.boe_id && (
            <>
              <span style={{ width: 3, height: 3, borderRadius: 999, background: 'var(--ink-3)', opacity: 0.6, display: 'inline-block' }} />
              <a
                href={initiative.boe_url}
                target="_blank"
                rel="noopener noreferrer"
                title={initiative.boe_id}
                className="mono"
                style={{
                  color: 'var(--ink-2)',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {initiative.boe_id}
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            </>
          )}
          {/* Share — the anti-misinformation loop: the link unfurls as a
              fact card (result + who voted what) wherever it's pasted. */}
          <span style={{ marginLeft: 'auto' }}>
            <ShareButton
              url={`/votes/${vote.id}`}
              title={subject}
              size="sm"
              label={t('share_cta')}
            />
          </span>
        </div>

        {/* How each group voted — INSIDE the header, right under the
            title: one cluster per stance with large party logos and
            each group's deputy count. Title + who-voted + (below) the
            charts read in a single glance, no separate section. */}
        {/* Always rendered. When there IS no per-group data we show the
            reason in this exact slot rather than dropping the section —
            see NoBreakdownNotice for why an explained gap beats a silent
            one. Every vote therefore has the same page shape. */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
            <div className="eyebrow">{t('group_stance_title')}</div>
            <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
              {t('group_stance_help')}
            </span>
          </div>
          {noBreakdown ? (
            <NoBreakdownNotice
              reason={noBreakdown}
              title={
                noBreakdown === 'assent'
                  ? t('assent_title')
                  : noBreakdown === 'secret'
                    ? t('nobreak_secret_title')
                    : t('nobreak_unavailable_title')
              }
              body={
                noBreakdown === 'assent'
                  ? t('assent_body')
                  : noBreakdown === 'secret'
                    ? t('nobreak_secret_body')
                    : t('nobreak_unavailable_body')
              }
            />
          ) : (
            <GroupStanceBand
              parties={voteStance}
              labels={stanceLabels}
              totals={{
                aye: vote.ayes,
                no: vote.noes,
                abstention: vote.abstentions,
                absent: vote.absent,
              }}
            />
          )}
        </div>
      </header>

      {/* Body: recount (left) // dissidents (right). The second column is
          only declared when there is something to put in it — the grid
          used to hold a fixed 0.95fr gutter open, so a unanimous vote (no
          dissidents) or an assent vote left almost half the page blank
          next to the recount card. */}
      <section
        className="vote-detail-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: hasDissidents ? '1.05fr 0.95fr' : 'minmax(0, 1fr)',
          gap: 40,
          paddingTop: 28,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {/* The AI summary now leads the page HEADER (with the original
              legal text beneath it), so the old body section is gone —
              only its honesty caveat remains, as a footnote right under
              the header. */}
          {summary && (
            <p
              style={{
                fontSize: 11,
                color: 'var(--ink-3)',
                margin: 0,
                fontStyle: 'italic',
              }}
            >
              {t('plain_summary_disclaimer')}{' '}
              <span>
                ({tCommon('plain_summary_caveat', {
                  provider: vote.plain_summary_provider ?? 'IA',
                })})
              </span>
            </p>
          )}

          {/* Recompte — KPI grid + StackedBar + caveat */}
          <section
            style={{
              border: '1px solid var(--rule)',
              background: 'var(--paper-2)',
              padding: 22,
            }}
          >
            {/* The card renders for EVERY vote. What varies is only what
                goes inside the chart slot, because the three no-breakdown
                reasons are not equivalent on the numbers:

                  - assent      → no counts at all, so no chart is possible
                  - secret/gap  → the totals ARE published (e.g. 345-0-0),
                                  so the donut is real and stays; only the
                                  hemicycle drops, since that needs the
                                  per-deputy records we don't have.

                Previously assent votes replaced the whole card with two
                lines of prose, which is why those pages looked like a
                different site. */}
            {!hasTotals ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h3
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: 18,
                    fontWeight: 600,
                    color: 'var(--ink)',
                    margin: 0,
                    letterSpacing: '-0.012em',
                  }}
                >
                  {t('assent_title')}
                </h3>
                <p
                  style={{
                    fontSize: 13.5,
                    lineHeight: 1.6,
                    color: 'var(--ink-2)',
                    margin: 0,
                  }}
                >
                  {t('assent_body')}
                </p>
              </div>
            ) : (
              <>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                marginBottom: 14,
              }}
            >
              <h3
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 18,
                  fontWeight: 600,
                  color: 'var(--ink)',
                  margin: 0,
                  letterSpacing: '-0.012em',
                }}
              >
                {t('totals_label', { total: totalCast + vote.absent })}
              </h3>
            </div>
            {/* Visual recount — donut and hemicycle SIDE BY SIDE (the
                stacked layout left a column of white space next to each
                chart). Left: half-donut + the four counts in a 2×2 grid.
                Right: the per-vote hemicycle + its color legend. Stacks
                back to one column under 700px. */}
            <div
              className="vote-recount-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: voteHemicycleLayout
                  ? 'repeat(2, minmax(0, 1fr))'
                  : 'minmax(0, 1fr)',
                gap: 24,
                alignItems: 'center',
              }}
            >
              <div style={{ minWidth: 0, maxWidth: 380, marginInline: 'auto', width: '100%' }}>
                <VoteDonut
                  totals={{
                    aye: vote.ayes,
                    no: vote.noes,
                    abstention: vote.abstentions,
                    absent: vote.absent,
                  }}
                  groups={cohesion}
                  labels={{
                    aye: t('ayes'),
                    no: t('noes'),
                    abstention: t('abstentions'),
                    absent: t('absent'),
                  }}
                  ariaLabel={`${t('ayes')} ${vote.ayes} · ${t('noes')} ${vote.noes} · ${t('abstentions')} ${vote.abstentions} · ${t('absent')} ${vote.absent}`}
                />
                <p
                  style={{
                    fontSize: 10.5,
                    color: 'var(--ink-3)',
                    margin: '8px 0 0',
                    textAlign: 'center',
                    lineHeight: 1.4,
                  }}
                >
                  {t('donut_caption')}
                </p>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: '10px 20px',
                    marginTop: 14,
                  }}
                >
                  {[
                    { label: t('ayes'), n: vote.ayes, color: 'var(--aye)' },
                    { label: t('noes'), n: vote.noes, color: 'var(--no)' },
                    { label: t('abstentions'), n: vote.abstentions, color: 'var(--abst)' },
                    { label: t('absent'), n: vote.absent, color: 'var(--nv)' },
                  ].map((c) => (
                    <div
                      key={c.label}
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        gap: 10,
                        minWidth: 0,
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: 'var(--ink-2)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            background: c.color,
                            flex: 'none',
                          }}
                        />
                        {c.label}
                      </span>
                      <span
                        className="tabular"
                        style={{
                          fontFamily: 'var(--font-serif)',
                          fontSize: 'clamp(20px, 2.2vw, 26px)',
                          fontWeight: 600,
                          color: c.color,
                          letterSpacing: '-0.02em',
                          lineHeight: 1,
                        }}
                      >
                        {c.n}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {voteHemicycleLayout && (
                <div style={{ minWidth: 0, maxWidth: 400, marginInline: 'auto', width: '100%' }}>
                  <Hemicycle layout={voteHemicycleLayout} coloredBy="vote" />
                  {/* Compact legend — pairs each color used by the
                      vote-mode hemicycle with its labelled count so a
                      first-time reader can decode the dots without
                      hovering. */}
                  <div
                    style={{
                      marginTop: 8,
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'center',
                      gap: 12,
                      fontSize: 11,
                      color: 'var(--ink-3)',
                    }}
                  >
                    <LegendSwatch color="var(--aye)" label={t('ayes')} value={vote.ayes} />
                    <LegendSwatch color="var(--no)" label={t('noes')} value={vote.noes} />
                    <LegendSwatch
                      color="var(--abst)"
                      label={t('abstentions')}
                      value={vote.abstentions}
                    />
                    <LegendSwatch
                      color="var(--nv)"
                      label={t('absent')}
                      value={vote.absent}
                    />
                  </div>
                </div>
              )}
            </div>
            <p
              style={{
                fontSize: 12,
                lineHeight: 1.55,
                color: 'var(--ink-2)',
                marginTop: 14,
                marginBottom: 0,
              }}
            >
              {t('majority_caveat', {
                needed,
                ayes: vote.ayes,
                noes: vote.noes,
                margin: margin >= 0 ? `+${margin}` : String(margin),
              })}
            </p>
              </>
            )}
          </section>
        </div>

        {hasDissidents && (
          <div>
            <DissidentsSection
              blocks={dissidentBlocks}
              title={t('dissidents_title')}
              help={t('dissidents_help')}
              majorityLabels={{
                aye: t('dissidents_majority_aye'),
                no: t('dissidents_majority_no'),
                abstention: t('dissidents_majority_abst'),
              }}
              choiceLabels={{
                aye: t('dissidents_choice_aye'),
                no: t('dissidents_choice_no'),
                abstention: t('dissidents_choice_abst'),
              }}
            />
          </div>
        )}
      </section>

      {/* Footer: initiative / BOE / documents */}
      <FooterLinks vote={vote} initiative={initiative} tInitiative={tInitiative} />

      <style>{`
        @media (max-width: 860px) {
          .vote-detail-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
        }
        @media (max-width: 700px) {
          .vote-recount-grid { grid-template-columns: minmax(0, 1fr) !important; }
        }
      `}</style>
    </article>
  );
}

function DissidentsSection({
  blocks,
  title,
  help,
  majorityLabels,
  choiceLabels,
}: {
  blocks: import('@/lib/api').GroupDissidentBlock[];
  title: string;
  help: string;
  majorityLabels: { aye: string; no: string; abstention: string };
  choiceLabels: { aye: string; no: string; abstention: string };
}) {
  const choiceLabelFor = (c: string): string => {
    if (c === 'aye') return choiceLabels.aye;
    if (c === 'no') return choiceLabels.no;
    if (c === 'abstention') return choiceLabels.abstention;
    return c;
  };
  const majorityLabelFor = (c: string): string => {
    if (c === 'aye') return majorityLabels.aye;
    if (c === 'no') return majorityLabels.no;
    if (c === 'abstention') return majorityLabels.abstention;
    return c;
  };
  const choiceColor = (c: string): string => {
    if (c === 'aye') return 'var(--aye)';
    if (c === 'no') return 'var(--no)';
    if (c === 'abstention') return 'var(--abst)';
    return 'var(--ink-3)';
  };
  return (
    <section style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--ink)' }}>
      <SectionTitle dek={help}>{title}</SectionTitle>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 14 }}>
        {blocks.map((block) => (
          <li
            key={block.group_slug}
            style={{
              borderTop: `2px solid ${block.group_color_hex ?? 'var(--ink)'}`,
              paddingTop: 8,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap',
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--ink)',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: block.group_color_hex ?? 'var(--ink)',
                  }}
                />
                {block.group_name_short}
              </span>
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                {majorityLabelFor(block.majority_choice)} ·{' '}
                <span className="tabular">{block.majority_count}</span>
              </span>
            </div>
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexWrap: 'wrap',
                gap: '4px 14px',
              }}
            >
              {block.dissidents.map((d) => (
                <li key={d.person_id}>
                  {/* Face + name + the colour of the vote they actually cast,
                      so a deputy breaking with their group is unmistakable. */}
                  <Link
                    href={`/persons/${d.person_id}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 999,
                        flex: 'none',
                        overflow: 'hidden',
                        background: 'var(--paper-3)',
                        boxShadow: `0 0 0 2px ${choiceColor(d.vote_choice)}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {d.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={d.photo_url}
                          alt=""
                          width={30}
                          height={30}
                          style={{ objectFit: 'cover' }}
                        />
                      ) : (
                        <User size={15} strokeWidth={1.8} color="var(--ink-3)" />
                      )}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: 'var(--ink)',
                          lineHeight: 1.25,
                        }}
                      >
                        {d.full_name}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 10.5,
                          fontWeight: 600,
                          color: choiceColor(d.vote_choice),
                        }}
                      >
                        {choiceLabelFor(d.vote_choice)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FooterLinks({
  vote,
  initiative,
  tInitiative,
}: {
  vote: Vote;
  initiative: Initiative | null;
  tInitiative: Awaited<ReturnType<typeof getTranslations<'initiative_detail'>>>;
}) {
  // Only render the footer if at least one link surface has content,
  // otherwise we'd show three empty columns.
  const hasInitiative = vote.initiative_id != null && initiative != null;
  const hasBoe = !!initiative?.boe_url && !!initiative.boe_id;
  const hasSource = !!initiative?.source_url;
  if (!hasInitiative && !hasBoe && !hasSource) return null;

  return (
    <section
      style={{
        marginTop: 28,
        paddingTop: 20,
        borderTop: '1px solid var(--ink)',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 22,
      }}
      className="vote-footer-links"
    >
      {hasInitiative && initiative && (
        <div>
          <h3
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--ink)',
              margin: '0 0 6px',
            }}
          >
            Iniciativa
          </h3>
          <Link
            href={`/initiatives/${initiative.id}`}
            style={{
              color: 'var(--ink)',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            {initiative.title_ca ?? initiative.title_original}
          </Link>
          <div className="mono" style={{ marginTop: 4, fontSize: 11, color: 'var(--ink-3)' }}>
            EXP {initiative.official_id}
          </div>
        </div>
      )}
      {hasBoe && initiative && (
        <div>
          <h3
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--ink)',
              margin: '0 0 6px',
            }}
          >
            {tInitiative('boe_cta')}
          </h3>
          <a
            href={initiative.boe_url ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="mono"
            style={{
              color: 'var(--ink)',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
              fontWeight: 600,
              fontSize: 13,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {initiative.boe_id}
            <ExternalLink size={12} aria-hidden="true" />
          </a>
          {initiative.boe_entry_in_force && (
            <div className="tabular" style={{ marginTop: 4, fontSize: 11, color: 'var(--ink-3)' }}>
              {tInitiative('entry_in_force')}:{' '}
              {new Date(initiative.boe_entry_in_force).toLocaleDateString('ca-ES', { dateStyle: 'medium' })}
            </div>
          )}
        </div>
      )}
      {hasSource && initiative && (
        <div>
          <h3
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--ink)',
              margin: '0 0 6px',
            }}
          >
            {tInitiative('source_pdf_cta')}
          </h3>
          <a
            href={initiative.source_url ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--ink)',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
              fontWeight: 600,
              fontSize: 13,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <FileText size={12} aria-hidden="true" />
            PDF · BOCG
          </a>
        </div>
      )}
    </section>
  );
}
