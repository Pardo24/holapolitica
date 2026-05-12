import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { AnnotatedText } from '@/components/AnnotatedText';
import { GroupBadge } from '@/components/GroupBadge';
import { GroupChip } from '@/components/GroupChip';
import { ResultPill } from '@/components/ResultPill';
import { SplitCohesionRow } from '@/components/SplitCohesionRow';
import { StackedBar } from '@/components/StackedBar';
import {
  api,
  ApiError,
  type CohesionResult,
  type Vote,
} from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';

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

  const subject = vote.description?.trim() || vote.title;
  const dateStr = new Date(vote.voted_at).toLocaleDateString(locale, {
    dateStyle: 'long',
  });
  const totalCast = vote.ayes + vote.noes + vote.abstentions;
  const needed = Math.floor(totalCast / 2) + 1;
  const margin = vote.ayes - vote.noes;
  const summary = plainSummary(vote, locale);

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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{vote.title}</span>
          {vote.expediente_raw && (
            <span
              className="mono"
              style={{ fontSize: 11, color: 'var(--ink-3)', marginLeft: 'auto' }}
            >
              EXP {vote.expediente_raw}
            </span>
          )}
        </div>
        <h1
          className="h-headline"
          style={{ margin: 0, fontSize: 'clamp(24px, 3.4vw, 36px)', maxWidth: 980, whiteSpace: 'pre-line' }}
        >
          {/* Wrap parliamentary jargon ("Veto del Senado", "Convalidación", …)
              in a glossary tooltip. The helper preserves the source casing
              from the Congreso feed and falls back to plain text when no
              term matches. */}
          <AnnotatedText text={subject} />
        </h1>
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

          <div
            style={{
              marginTop: summary ? 28 : 0,
              padding: '18px 20px',
              border: '1px solid var(--rule)',
              background: 'var(--paper-2)',
            }}
          >
            <div className="eyebrow">
              {t('totals_label', { total: totalCast + vote.absent })}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                gap: 0,
                marginTop: 8,
                marginBottom: 12,
              }}
            >
              {[
                { label: t('ayes'), n: vote.ayes, color: 'var(--aye)' },
                { label: t('noes'), n: vote.noes, color: 'var(--no)' },
                { label: t('abstentions'), n: vote.abstentions, color: 'var(--abst)' },
                { label: t('absent'), n: vote.absent, color: 'var(--nv)' },
              ].map((c, i) => (
                <div
                  key={c.label}
                  style={{
                    borderLeft: i > 0 ? '1px solid var(--rule)' : 'none',
                    paddingLeft: i > 0 ? 10 : 0,
                    minWidth: 0,
                  }}
                >
                  <div className="eyebrow">{c.label}</div>
                  <div
                    className="tabular"
                    style={{
                      fontSize: 'clamp(20px, 7vw, 32px)',
                      fontWeight: 600,
                      color: c.color,
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {c.n}
                  </div>
                </div>
              ))}
            </div>
            <StackedBar
              d={{ aye: vote.ayes, no: vote.noes, abst: vote.abstentions, nv: vote.absent }}
              height={14}
            />
            <div
              className="tabular"
              style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6 }}
            >
              {t('majority_caveat', {
                needed,
                ayes: vote.ayes,
                noes: vote.noes,
                margin: margin >= 0 ? `+${margin}` : String(margin),
              })}
            </div>
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

      {/* Numerical detail table */}
      <section style={{ paddingTop: 32 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          {t('cohesion_table_title')}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tab">
            <thead>
              <tr>
                <th style={{ width: 200 }}>{t('cohesion_th_group')}</th>
                <th style={{ width: 60, textAlign: 'right' }}>{t('cohesion_th_members')}</th>
                <th style={{ width: 80, textAlign: 'right', color: 'var(--aye)' }}>{t('ayes')}</th>
                <th style={{ width: 80, textAlign: 'right', color: 'var(--no)' }}>{t('noes')}</th>
                <th style={{ width: 80, textAlign: 'right', color: 'var(--abst)' }}>{t('abstentions')}</th>
                <th style={{ width: 80, textAlign: 'right', color: 'var(--nv)' }}>{t('absent')}</th>
                <th>{t('cohesion_th_discipline')}</th>
                <th style={{ width: 80, textAlign: 'right' }}>{t('cohesion_th_cohesion')}</th>
              </tr>
            </thead>
            <tbody>
              {cohesion.map((row) => {
                const members =
                  row.ayes + row.noes + row.abstentions + row.no_vote;
                const cast = row.ayes + row.noes + row.abstentions;
                const dom = Math.max(row.ayes, row.noes, row.abstentions);
                const cohesionPct = cast > 0 ? (dom / cast) * 100 : null;
                return (
                  <tr key={row.group_slug}>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <GroupBadge slug={row.group_slug} color={row.group_color_hex} size="xs" />
                        <b>{displayGroupShort(row.group_name_short)}</b>
                      </span>
                    </td>
                    <td className="tabular" style={{ textAlign: 'right', color: 'var(--ink-3)' }}>
                      {members}
                    </td>
                    <td
                      className="tabular"
                      style={{
                        textAlign: 'right',
                        color: row.ayes > 0 ? 'var(--aye)' : 'var(--ink-3)',
                        fontWeight: row.ayes > 0 ? 600 : 400,
                      }}
                    >
                      {row.ayes || '·'}
                    </td>
                    <td
                      className="tabular"
                      style={{
                        textAlign: 'right',
                        color: row.noes > 0 ? 'var(--no)' : 'var(--ink-3)',
                        fontWeight: row.noes > 0 ? 600 : 400,
                      }}
                    >
                      {row.noes || '·'}
                    </td>
                    <td
                      className="tabular"
                      style={{
                        textAlign: 'right',
                        color: row.abstentions > 0 ? 'var(--abst)' : 'var(--ink-3)',
                      }}
                    >
                      {row.abstentions || '·'}
                    </td>
                    <td className="tabular" style={{ textAlign: 'right', color: 'var(--ink-3)' }}>
                      {row.no_vote || '·'}
                    </td>
                    <td>
                      <StackedBar
                        d={{
                          aye: row.ayes,
                          no: row.noes,
                          abst: row.abstentions,
                          nv: row.no_vote,
                        }}
                        height={6}
                      />
                    </td>
                    <td className="tabular" style={{ textAlign: 'right' }}>
                      {cohesionPct == null ? '—' : `${cohesionPct.toFixed(0)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <style>{`
        @media (max-width: 860px) {
          .vote-detail-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
        }
      `}</style>
    </article>
  );
}

function plainSummary(vote: Vote, locale: string): string | null {
  if (locale === 'es') return vote.plain_summary_es ?? vote.plain_summary_ca ?? null;
  if (locale === 'en') return vote.plain_summary_es ?? vote.plain_summary_ca ?? null;
  return vote.plain_summary_ca ?? vote.plain_summary_es ?? null;
}
