import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { ExternalLink } from 'lucide-react';

import { AnnotatedText } from '@/components/AnnotatedText';
import { GroupChip } from '@/components/GroupChip';
import { ResultPill } from '@/components/ResultPill';
import { SplitCohesionRow } from '@/components/SplitCohesionRow';
import { StackedBar } from '@/components/StackedBar';
import {
  api,
  ApiError,
  type CohesionResult,
  type Initiative,
  type Vote,
} from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';
import { pickPlainSummary } from '@/lib/glossary';

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
      openGraph: {
        title: subjectShort,
        description,
        type: 'article',
      },
      twitter: {
        card: 'summary_large_image',
        title: subjectShort,
        description,
      },
    };
  } catch {
    return {};
  }
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

  // When the vote links to an initiative (Proyectos/Proposiciones/etc.),
  // pull its full preamble so we can render the bill author's own
  // explanation alongside the LLM-generated plain summary. Best-effort:
  // a missing initiative or a network error here must not break the
  // page — the rest of the vote data is far more important.
  let initiative: Initiative | null = null;
  if (vote.initiative_id != null) {
    try {
      initiative = await api.initiatives.get(vote.initiative_id);
    } catch {
      initiative = null;
    }
  }
  const objectText = initiative?.object_text ?? initiative?.summary ?? null;

  const subject = vote.description?.trim() || vote.title;
  const dateStr = new Date(vote.voted_at).toLocaleDateString(locale, {
    dateStyle: 'long',
  });
  const totalCast = vote.ayes + vote.noes + vote.abstentions;
  const needed = Math.floor(totalCast / 2) + 1;
  const margin = vote.ayes - vote.noes;
  const summary = pickPlainSummary(vote, locale);

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
      <header style={{ paddingTop: 8, paddingBottom: 24, borderBottom: '1px solid var(--ink)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
          <h1
            className="h-headline"
            style={{
              margin: 0,
              fontSize: 'clamp(24px, 3.4vw, 36px)',
              maxWidth: 980,
              whiteSpace: 'pre-line',
              minWidth: 0,
              flex: '1 1 auto',
            }}
          >
            {/* Wrap parliamentary jargon ("Veto del Senado", "Convalidación", …)
                in a glossary tooltip. The helper preserves the source casing
                from the Congreso feed and falls back to plain text when no
                term matches. */}
            <AnnotatedText text={subject} />
          </h1>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              flex: 'none',
            }}
          >
            <span
              className="eyebrow"
              style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}
            >
              {vote.title}
            </span>
            {vote.expediente_raw && (
              <span
                className="mono"
                style={{ fontSize: 11, color: 'var(--ink-3)' }}
              >
                EXP {vote.expediente_raw}
              </span>
            )}
          </div>
        </div>
        <div
          className="vote-meta-strip"
          style={{
            display: 'flex',
            gap: 18,
            alignItems: 'center',
            marginTop: 18,
            fontSize: 13,
            color: 'var(--ink-2)',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <span className="eyebrow">{t('filters.date_from')}</span>
            <div className="tabular">{dateStr}</div>
          </div>
          {(vote.proposing_group_short || vote.proposed_by_government) && (
            <div style={{ borderLeft: '1px solid var(--rule)', paddingLeft: 18 }}>
              <span className="eyebrow">{t('proposed_by')}</span>
              <div style={{ marginTop: 2 }}>
                {vote.proposed_by_government && !vote.proposing_group_short ? (
                  <span className="badge" style={{ fontWeight: 600 }}>
                    <span className="gdot" style={{ background: 'var(--ink)' }} />
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
              </div>
            </div>
          )}
          <div style={{ borderLeft: '1px solid var(--rule)', paddingLeft: 18 }}>
            <span className="eyebrow">{tCommon('totals')}</span>
            <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ResultPill result={vote.result} label={t(`result.${vote.result}`)} />
              <span className="tabular" style={{ color: 'var(--ink-3)' }}>
                {margin >= 0 ? `+${margin}` : margin}
              </span>
            </div>
          </div>
          {initiative?.boe_url && initiative?.boe_id && (
            <div style={{ borderLeft: '1px solid var(--rule)', paddingLeft: 18 }}>
              <span className="eyebrow">{tInitiative('boe_cta')}</span>
              <div style={{ marginTop: 2 }}>
                <a
                  href={initiative.boe_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={initiative.boe_id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    color: 'var(--ink)',
                    fontSize: 12,
                    fontWeight: 600,
                    textDecoration: 'underline',
                    textUnderlineOffset: 3,
                  }}
                >
                  <span className="mono">{initiative.boe_id}</span>
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* 2-col content: plain language + per-group cohesion */}
      <section
        className="vote-detail-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1.05fr 0.95fr',
          gap: 48,
          paddingTop: 28,
        }}
      >
        <div>
          {summary && (
            <>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                {t('plain_summary_title')}
              </div>
              <p
                className="serif"
                style={{
                  fontSize: 18,
                  lineHeight: 1.55,
                  color: 'var(--ink)',
                  margin: 0,
                  fontWeight: 400,
                  whiteSpace: 'pre-line',
                }}
              >
                {summary}
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--ink-3)',
                  marginTop: 6,
                  fontStyle: 'italic',
                }}
              >
                {t('plain_summary_disclaimer')}{' '}
                <span style={{ color: 'var(--ink-3)' }}>
                  ({tCommon('plain_summary_caveat', { provider: vote.plain_summary_provider ?? 'IA' })})
                </span>
              </p>
            </>
          )}

          {/* The raw "Exposición de motivos" / Objeto from the BOCG PDF
              is intentionally NOT shown to end users — it's dense legal
              prose. It lives in Initiative.object_text on the backend
              and is the preferred input for the plain-summary LLM
              pipeline. Citizens read the plain summary above; the raw
              text stays an internal implementation detail. */}

          <div
            style={{
              marginTop: summary ? 28 : 0,
              padding: '24px 26px',
              border: '1px solid var(--rule)',
              background: 'var(--paper-2)',
            }}
          >
            <div className="eyebrow" style={{ marginBottom: 22 }}>
              {t('totals_label', { total: totalCast + vote.absent })}
            </div>
            <div
              className="vote-totals-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                columnGap: 28,
                rowGap: 22,
                marginBottom: 22,
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
                  style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}
                >
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: 'var(--ink-2)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      marginBottom: 10,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        background: c.color,
                        flex: 'none',
                      }}
                    />
                    {c.label}
                  </div>
                  <div
                    className="tabular"
                    style={{
                      fontSize: 'clamp(30px, 6.4vw, 44px)',
                      fontWeight: 600,
                      color: c.color,
                      letterSpacing: '-0.015em',
                      lineHeight: 1,
                    }}
                  >
                    {c.n}
                  </div>
                </div>
              ))}
            </div>
            <StackedBar
              d={{ aye: vote.ayes, no: vote.noes, abst: vote.abstentions, nv: vote.absent }}
              height={12}
            />
            <p
              style={{
                fontSize: 12.5,
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
          </div>
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            {t('cohesion_title')}
          </div>
          <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 0, marginBottom: 14, lineHeight: 1.5 }}>
            {t('cohesion_help')}
          </p>

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
        </div>
      </section>

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

