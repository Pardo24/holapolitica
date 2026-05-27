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
import { ExternalLink, FileText } from 'lucide-react';

import { AnnotatedText } from '@/components/AnnotatedText';
import { GroupChip } from '@/components/GroupChip';
import { Hemicycle } from '@/components/Hemicycle';
import { ResultPill } from '@/components/ResultPill';
import { SplitCohesionRow } from '@/components/SplitCohesionRow';
import { StackedBar } from '@/components/StackedBar';
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
    const description = `Votació al Congrés (${dateStr}): ${result}. ${v.ayes} Sí · ${v.noes} No · ${v.abstentions} Abst.`;
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
    cohesion = await api.metrics.cohesion(voteId);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const dissidents = await api.votes
    .dissidents(voteId)
    .catch(() => ({ blocks: [] as Awaited<ReturnType<typeof api.votes.dissidents>>['blocks'] }));

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
  const needed = Math.floor(totalCast / 2) + 1;
  const margin = vote.ayes - vote.noes;
  const summary = pickPlainSummary(vote, locale);

  const topics = vote.topics ?? initiative?.topics ?? [];

  return (
    <article>
      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: 'var(--ink-3)', paddingTop: 18 }}>
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

        {/* Headline */}
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-serif)',
            fontSize: 'clamp(28px, 3.4vw, 40px)',
            lineHeight: 1.1,
            letterSpacing: '-0.018em',
            fontWeight: 600,
            maxWidth: 920,
            marginBottom: 18,
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore — text-wrap not yet in TS lib for React.CSS
            textWrap: 'pretty',
          }}
        >
          <AnnotatedText text={subject} />
        </h1>

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
          {/* Result + margin */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <ResultPill result={vote.result} label={t(`result.${vote.result}`)} />
            <span className="tabular" style={{ color: 'var(--ink-3)', fontSize: 12 }}>
              {margin >= 0 ? `+${margin}` : margin}
            </span>
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
        </div>
      </header>

      {/* 2-col body: summary + totals (left) // cohesion + dissidents (right) */}
      <section
        className="vote-detail-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1.05fr 0.95fr',
          gap: 40,
          paddingTop: 28,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {summary && (
            <section>
              <SectionTitle>{t('plain_summary_title')}</SectionTitle>
              <p
                className="serif"
                style={{
                  fontSize: 18,
                  lineHeight: 1.55,
                  color: 'var(--ink)',
                  margin: 0,
                  fontWeight: 400,
                  whiteSpace: 'pre-line',
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore
                  textWrap: 'pretty',
                }}
              >
                {summary}
              </p>
              <p
                style={{
                  fontSize: 11,
                  color: 'var(--ink-3)',
                  marginTop: 6,
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
            </section>
          )}

          {/* Recompte — KPI grid + StackedBar + caveat */}
          <section
            style={{
              border: '1px solid var(--rule)',
              background: 'var(--paper-2)',
              padding: 22,
            }}
          >
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
            <div
              className="vote-totals-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                columnGap: 24,
                rowGap: 18,
              }}
            >
              {[
                { label: t('ayes'), n: vote.ayes, color: 'var(--aye)' },
                { label: t('noes'), n: vote.noes, color: 'var(--no)' },
                { label: t('abstentions'), n: vote.abstentions, color: 'var(--abst)' },
                { label: t('absent'), n: vote.absent, color: 'var(--nv)' },
              ].map((c) => (
                <div key={c.label} style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: 'var(--ink-2)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      marginBottom: 6,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: c.color,
                      }}
                    />
                    {c.label}
                  </div>
                  <div
                    className="tabular"
                    style={{
                      fontFamily: 'var(--font-serif)',
                      fontSize: 'clamp(28px, 4vw, 40px)',
                      fontWeight: 600,
                      color: c.color,
                      letterSpacing: '-0.02em',
                      lineHeight: 1,
                    }}
                  >
                    {c.n}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14 }}>
              <StackedBar
                d={{ aye: vote.ayes, no: vote.noes, abst: vote.abstentions, nv: vote.absent }}
                height={12}
              />
            </div>
            <p
              style={{
                fontSize: 12,
                lineHeight: 1.55,
                color: 'var(--ink-2)',
                marginTop: 12,
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

            {voteHemicycleLayout && (
              <div
                style={{
                  marginTop: 18,
                  paddingTop: 18,
                  borderTop: '1px solid var(--rule)',
                }}
              >
                <Hemicycle layout={voteHemicycleLayout} coloredBy="vote" />
                {/* Compact legend — pairs each color used by the
                    vote-mode hemicycle with its labelled count so a
                    first-time reader can decode the dots without
                    hovering. Sentence-case, no eyebrow, in line with
                    the rest of the redesign. */}
                <div
                  style={{
                    marginTop: 10,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 14,
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
          </section>
        </div>

        <div>
          <section>
            <SectionTitle dek={t('cohesion_help')}>{t('cohesion_title')}</SectionTitle>
            <div style={{ borderTop: '1px solid var(--ink)' }}>
              {cohesion.map((row) => (
                <SplitCohesionRow key={row.group_slug} row={row} />
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 11,
                color: 'var(--ink-3)',
                marginTop: 10,
                fontStyle: 'italic',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <span>{t('cohesion_axis_left')}</span>
              <span style={{ color: 'var(--ink-2)' }}>{t('cohesion_axis_center')}</span>
              <span>{t('cohesion_axis_right')}</span>
            </div>
          </section>

          {dissidents.blocks.length > 0 && (
            <DissidentsSection
              blocks={dissidents.blocks}
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
          )}
        </div>
      </section>

      {/* Footer: initiative / BOE / documents */}
      <FooterLinks vote={vote} initiative={initiative} tInitiative={tInitiative} />

      <style>{`
        @media (max-width: 860px) {
          .vote-detail-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
        }
        @media (max-width: 520px) {
          .vote-totals-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; column-gap: 20px !important; row-gap: 20px !important; }
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
                <li
                  key={d.person_id}
                  style={{
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: 'var(--ink-2)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Link
                    href={`/persons/${d.person_id}`}
                    style={{
                      color: 'var(--ink)',
                      textDecoration: 'underline',
                      textUnderlineOffset: 3,
                      fontWeight: 600,
                    }}
                  >
                    {d.full_name}
                  </Link>
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 11,
                      color: choiceColor(d.vote_choice),
                      fontWeight: 600,
                    }}
                  >
                    {choiceLabelFor(d.vote_choice)}
                  </span>
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
