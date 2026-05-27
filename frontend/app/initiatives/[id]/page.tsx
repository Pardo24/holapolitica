import type { Metadata } from 'next';
import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowRight, ExternalLink, FileText, Route as RouteIcon } from 'lucide-react';

import { AnnotatedText } from '@/components/AnnotatedText';
import { GroupBadge } from '@/components/GroupBadge';
import { LawJourney } from '@/components/LawJourney';
import { ResultPill } from '@/components/ResultPill';
import { StackedBar } from '@/components/StackedBar';
import {
  api,
  ApiError,
  type Initiative,
  type ParliamentaryGroupSummary,
} from '@/lib/api';
import { parseProposer, displayGroupShort } from '@/lib/groups';
import { typeLabelCa, pickPlainSummary } from '@/lib/glossary';
import { pickTopicName } from '@/lib/topics';
import { topicIcon } from '@/lib/topic_icons';

interface Params {
  id: string;
}

const STATUS_COLOR: Record<string, string> = {
  approved: 'var(--aye)',
  rejected: 'var(--no)',
  in_debate: 'var(--accent)',
  submitted: 'var(--accent)',
  withdrawn: 'var(--nv)',
  expired: 'var(--nv)',
};

const STATUS_KEY: Record<string, string> = {
  approved: 'status_singular_approved',
  rejected: 'status_singular_rejected',
  in_debate: 'status_singular_in_debate',
  submitted: 'status_singular_submitted',
  withdrawn: 'status_singular_withdrawn',
  expired: 'status_singular_expired',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const initiativeId = Number(id);
  if (!Number.isFinite(initiativeId)) return {};
  try {
    const ini = await api.initiatives.get(initiativeId);
    const title = ini.title_ca ?? ini.title_original;
    const titleShort = title.length > 120 ? title.slice(0, 117) + '…' : title;
    const description =
      ini.plain_summary_ca ??
      ini.plain_summary_es ??
      `Iniciativa ${ini.official_id} · ${ini.type}`;
    return {
      title: titleShort,
      description: description.slice(0, 220),
      openGraph: { title: titleShort, description: description.slice(0, 220), type: 'article' },
      twitter: { card: 'summary_large_image', title: titleShort, description: description.slice(0, 220) },
    };
  } catch {
    return {};
  }
}

export default async function InitiativeDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const initiativeId = Number(id);
  if (!Number.isFinite(initiativeId)) notFound();

  const t = await getTranslations('initiative_detail');
  const tVotes = await getTranslations('votes');
  const tCommon = await getTranslations('common');
  const tLifecycle = await getTranslations('lifecycle');
  // Status labels live under the ``stats`` namespace; we look them up
  // via a small key map so the fallback to the raw enum string remains
  // graceful when an unexpected backend value lands.
  const tStats = await getTranslations('stats');
  const resolveStatusLabel = (status: string): string => {
    const key = STATUS_KEY[status];
    if (!key) return status;
    try {
      return tStats(key);
    } catch {
      return status;
    }
  };
  const locale = await getLocale();

  let initiative: Initiative;
  let related: Initiative[] = [];
  let groups: ParliamentaryGroupSummary[] = [];
  try {
    initiative = await api.initiatives.get(initiativeId);
    const [rel, grp] = await Promise.all([
      api.initiatives.related(initiativeId, 6).catch(() => [] as Initiative[]),
      api.groups.list(initiative.legislature_id).catch(() => [] as ParliamentaryGroupSummary[]),
    ]);
    related = rel;
    groups = grp;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const title = pickTitle(initiative, locale);
  const summary = pickPlainSummary(initiative, locale);
  const submittedDate = initiative.submitted_at
    ? new Date(initiative.submitted_at).toLocaleDateString(locale, { dateStyle: 'long' })
    : null;
  const typeLabel = typeLabelCa(initiative.type);
  const statusLabel = resolveStatusLabel(initiative.status);
  const statusColor = STATUS_COLOR[initiative.status] ?? 'var(--ink-3)';
  const parsedProposer = parseProposer(initiative.submitted_by, groups);
  const votes = initiative.votes ?? [];
  const primaryVote = votes[0] ?? null;
  const topics = initiative.topics ?? [];

  return (
    <article>
      {/* Trajectory banner — dark, full-bleed strip pinned at the top
          of the page that names the procedural type (Projecte de Llei,
          PNL, Moció, RDL...) and highlights the current step in its
          Reglament-defined journey. Same component is used on
          /votes/[id]; the data shape (type + status + BOE flag) feeds
          both surfaces identically. */}
      <LawJourney
        type={initiative.type}
        status={initiative.status}
        hasBoe={!!initiative.boe_url}
      />

      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: 'var(--ink-3)', paddingTop: 6 }}>
        <Link href="/votes" style={{ color: 'var(--ink-2)' }}>
          {t('breadcrumb_root')}
        </Link>
        {' / '}
        <span className="mono">{initiative.official_id}</span>
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
              minWidth: 0,
              flex: '1 1 auto',
            }}
          >
            <AnnotatedText text={title} />
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
              {typeLabel}
            </span>
            <span
              className="mono"
              style={{ fontSize: 11, color: 'var(--ink-3)' }}
            >
              EXP {initiative.official_id}
            </span>
          </div>
        </div>

        <div
          className="initiative-meta-strip"
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
          {submittedDate && (
            <div>
              <span className="eyebrow">{t('submitted_at')}</span>
              <div className="tabular">{submittedDate}</div>
            </div>
          )}
          {(parsedProposer.isGovernment || parsedProposer.groups.length > 0) && (
            <div style={{ borderLeft: '1px solid var(--rule)', paddingLeft: 18 }}>
              <span className="eyebrow">{tVotes('proposed_by')}</span>
              <div
                style={{
                  marginTop: 2,
                  display: 'flex',
                  gap: 6,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                {parsedProposer.isGovernment ? (
                  <span className="badge" style={{ fontWeight: 600 }}>
                    <span className="gdot" style={{ background: 'var(--ink)' }} />
                    {tVotes('proposed_by_government')}
                  </span>
                ) : (
                  parsedProposer.groups.map((g) => (
                    <Link
                      key={g.slug}
                      href={`/groups/${g.slug}` as Route}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        color: 'inherit',
                        textDecoration: 'none',
                      }}
                    >
                      <GroupBadge slug={g.slug} color={g.color_hex} size="xs" link={false} />
                      <span style={{ fontSize: 12, fontWeight: 600 }}>
                        {displayGroupShort(g.name_short)}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </div>
          )}
          <div style={{ borderLeft: '1px solid var(--rule)', paddingLeft: 18 }}>
            <span className="eyebrow">{t('status_label')}</span>
            <div style={{ marginTop: 2, color: statusColor, fontWeight: 600 }}>
              {statusLabel}
            </div>
          </div>
          <Link
            href={'/recorregut' as Route}
            aria-label={tLifecycle('cta_short')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              border: '1px solid var(--rule-strong)',
              borderRadius: 999,
              background: 'var(--paper-2)',
              color: 'var(--ink)',
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              marginLeft: 'auto',
            }}
          >
            <RouteIcon size={12} aria-hidden="true" />
            {tLifecycle('cta_short')}
          </Link>
        </div>
      </header>

      {/* Two-column layout: plain summary + vote box */}
      <section
        className="initiative-detail-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1.1fr 0.9fr',
          gap: 48,
          paddingTop: 28,
        }}
      >
        <div>
          {summary ? (
            <>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                {tVotes('plain_summary_title')}
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
                {tVotes('plain_summary_disclaimer')}{' '}
                <span style={{ color: 'var(--ink-3)' }}>
                  ({tCommon('plain_summary_caveat', { provider: initiative.plain_summary_provider ?? 'IA' })})
                </span>
              </p>
            </>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              {t('no_summary_yet')}
            </p>
          )}

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              marginTop: 18,
            }}
          >
            {initiative.source_url && (
              <a
                href={initiative.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="initiative-source-link"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  border: '1px solid var(--rule-strong)',
                  borderRadius: 10,
                  background: 'var(--paper-2)',
                  color: 'var(--ink)',
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                <FileText size={14} aria-hidden="true" />
                {t('source_pdf_cta')}
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            )}
            {initiative.boe_url && initiative.boe_id && (
              <a
                href={initiative.boe_url}
                target="_blank"
                rel="noopener noreferrer"
                title={initiative.boe_id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  border: '1px solid var(--ink)',
                  borderRadius: 10,
                  background: 'var(--ink)',
                  color: 'var(--paper)',
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                {t('boe_cta')}
                <span
                  className="mono"
                  style={{ fontSize: 11, opacity: 0.85, fontWeight: 500 }}
                >
                  {initiative.boe_id}
                </span>
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            )}
          </div>
          {initiative.boe_entry_in_force && (
            <div
              style={{
                marginTop: 14,
                display: 'inline-flex',
                alignItems: 'baseline',
                gap: 8,
                fontSize: 13,
                color: 'var(--ink-2)',
              }}
            >
              <span
                className="eyebrow"
                style={{ fontSize: 10, color: 'var(--ink-3)' }}
              >
                {t('entry_in_force')}
              </span>
              <span className="tabular" style={{ color: 'var(--ink)', fontWeight: 600 }}>
                {new Date(initiative.boe_entry_in_force).toLocaleDateString(locale, {
                  dateStyle: 'long',
                })}
              </span>
            </div>
          )}

          {topics.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                {t('topics_label')}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {topics.map((tp) => {
                  const Icon = topicIcon(tp.icon);
                  const c = tp.color_hex ?? 'var(--ink-3)';
                  return (
                    <Link
                      key={tp.slug}
                      href={`/topics/${tp.slug}` as Route}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 10px 4px 6px',
                        borderRadius: 999,
                        border: `1px solid color-mix(in oklch, ${c} 40%, var(--rule))`,
                        background: `color-mix(in oklch, ${c} 10%, var(--paper))`,
                        color: 'var(--ink)',
                        fontSize: 12,
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 999,
                          background: `color-mix(in oklch, ${c} 22%, var(--paper))`,
                          color: c,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon size={12} strokeWidth={2.2} aria-hidden="true" />
                      </span>
                      {pickTopicName(tp, locale)}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            {t('vote_box_title')}
          </div>
          {primaryVote ? (
            <Link
              href={`/votes/${primaryVote.id}` as Route}
              className="initiative-vote-card"
              style={{
                display: 'block',
                padding: '16px 18px',
                borderRadius: 12,
                border: '1px solid var(--rule-strong)',
                background: 'var(--paper-2)',
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <ResultPill
                  result={primaryVote.result}
                  label={tVotes(`result.${primaryVote.result}`)}
                />
                <span className="tabular" style={{ fontSize: 12, color: 'var(--ink-3)', marginLeft: 'auto' }}>
                  {new Date(primaryVote.voted_at).toLocaleDateString(locale, { dateStyle: 'medium' })}
                </span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 0,
                  marginBottom: 10,
                }}
              >
                {[
                  { label: tVotes('ayes'), n: primaryVote.ayes, color: 'var(--aye)' },
                  { label: tVotes('noes'), n: primaryVote.noes, color: 'var(--no)' },
                  { label: tVotes('abstentions'), n: primaryVote.abstentions, color: 'var(--abst)' },
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
                      style={{ fontSize: 24, fontWeight: 600, color: c.color, letterSpacing: '-0.02em' }}
                    >
                      {c.n}
                    </div>
                  </div>
                ))}
              </div>
              <StackedBar
                d={{
                  aye: primaryVote.ayes,
                  no: primaryVote.noes,
                  abst: primaryVote.abstentions,
                  nv: primaryVote.absent,
                }}
                height={10}
              />
              <span
                style={{
                  marginTop: 10,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--ink-2)',
                }}
              >
                {t('view_vote_detail')}
                <ArrowRight size={12} aria-hidden="true" />
              </span>
            </Link>
          ) : (
            <p
              style={{
                padding: '14px 18px',
                borderRadius: 12,
                border: '1px dashed var(--rule)',
                background: 'var(--paper-2)',
                fontSize: 13,
                color: 'var(--ink-3)',
                margin: 0,
              }}
            >
              {t('no_vote_yet')}
            </p>
          )}

          {votes.length > 1 && (
            <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
              {votes.slice(1).map((v) => (
                <li key={v.id} style={{ borderTop: '1px solid var(--rule)', padding: '8px 0' }}>
                  <Link
                    href={`/votes/${v.id}` as Route}
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'baseline',
                      fontSize: 13,
                      color: 'inherit',
                      textDecoration: 'none',
                    }}
                  >
                    <ResultPill result={v.result} label={tVotes(`result.${v.result}`)} />
                    <span style={{ flex: 1 }}>
                      {new Date(v.voted_at).toLocaleDateString(locale, { dateStyle: 'medium' })}
                    </span>
                    <span className="tabular" style={{ color: 'var(--ink-3)' }}>
                      {v.ayes} / {v.noes} / {v.abstentions}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {related.length > 0 && (
        <section style={{ paddingTop: 40, paddingBottom: 32 }}>
          <h2
            className="serif"
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              margin: '0 0 14px',
              color: 'var(--ink)',
            }}
          >
            {t('related_title')}
          </h2>
          <ul
            className="initiative-related-grid"
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))',
              gap: 12,
            }}
          >
            {related.map((r) => {
              const rTitle = pickTitle(r, locale);
              const rStatus = resolveStatusLabel(r.status);
              const rStatusColor = STATUS_COLOR[r.status] ?? 'var(--ink-3)';
              return (
                <li key={r.id}>
                  <Link
                    href={`/initiatives/${r.id}` as Route}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      padding: '14px 16px',
                      borderRadius: 12,
                      background: 'var(--paper-2)',
                      border: '1px solid var(--rule)',
                      color: 'inherit',
                      textDecoration: 'none',
                      height: '100%',
                    }}
                  >
                    <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
                      {r.official_id}
                    </span>
                    <span
                      style={{
                        fontSize: 14,
                        lineHeight: 1.35,
                        fontWeight: 500,
                        color: 'var(--ink)',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {rTitle}
                    </span>
                    <span
                      style={{
                        marginTop: 'auto',
                        fontSize: 11,
                        fontWeight: 600,
                        color: rStatusColor,
                      }}
                    >
                      {rStatus}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <style>{`
        @media (max-width: 860px) {
          .initiative-detail-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
        }
        .initiative-source-link:hover,
        .initiative-source-link:focus-visible {
          background: var(--paper) !important;
          outline: none;
        }
        .initiative-vote-card:hover,
        .initiative-vote-card:focus-visible {
          background: var(--paper) !important;
          outline: none;
        }
      `}</style>
    </article>
  );
}

function pickTitle(ini: Initiative, locale: string): string {
  if (locale === 'es' && ini.title_es) return ini.title_es;
  if (locale === 'en' && ini.title_en) return ini.title_en;
  return ini.title_ca ?? ini.title_original;
}
