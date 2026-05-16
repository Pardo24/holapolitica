import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { ResultPill } from '@/components/ResultPill';
import { StackedBar } from '@/components/StackedBar';
import {
  api,
  type Vote,
} from '@/lib/api';
import { pickPlainSummary } from '@/lib/glossary';

/**
 * Archived /avui snapshot for a specific date — the permalink target
 * a journalist or researcher can cite in a piece without worrying the
 * page will shift under their feet. The eternal-now `/avui` route
 * always tracks the most recent vote; this route is frozen by URL.
 *
 * The snapshot is intentionally narrower than the live page: we only
 * surface the day's votes (lead + list) and a single counter row.
 * Group-level metrics and the coincidence matrix are aggregated across
 * the whole legislature and would say the same thing for any
 * archival date — including them would be visual padding.
 *
 * Cache: ISR with very long revalidate (effectively immutable). Past
 * data doesn't change; the underlying Vote rows are append-only.
 */
// 30 days, in seconds. Next requires this to be a literal number (its
// segment-config parser refuses BinaryExpressions).
export const revalidate = 2592000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface Params {
  date: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { date } = await params;
  if (!DATE_RE.test(date)) return {};
  const t = await getTranslations('avui');
  return {
    title: t('archive_meta_title', { date }),
    description: t('archive_meta_description', { date }),
    alternates: { canonical: `/avui/${date}` },
  };
}

export default async function AvuiArchivePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { date } = await params;
  if (!DATE_RE.test(date)) notFound();
  // Disallow future dates outright — the eternal /avui already
  // surfaces "today's" data; an archive for tomorrow is nonsense
  // and a tiny attack surface (preserves SSR cache integrity).
  if (date > new Date().toISOString().slice(0, 10)) notFound();

  const t = await getTranslations('avui');
  const locale = await getLocale();

  // Bounded fetch — votes for this exact day. Larger page_size than
  // any realistic plenary day to avoid pagination here.
  const votesPage = await api.votes
    .list({ date_from: date, date_to: date, page: 1, page_size: 50 })
    .catch(() => null);

  const votes: Vote[] = votesPage?.items ?? [];
  if (votes.length === 0) notFound();

  // Votes come ordered newest-first from the API. The "lead" is the
  // last vote of the session — same convention the live page uses.
  const leadVote = votes[0]!;
  const restVotes = votes.slice(1);

  // Date in the page header — long form, local.
  const anchorDate = new Date(`${date}T12:00:00Z`);
  const dateLong = anchorDate.toLocaleDateString(locale, { dateStyle: 'full' });

  return (
    <article style={{ paddingTop: 18, paddingBottom: 48 }}>
      {/* Archive ribbon — visually distinguishes this from the live
          /avui so a reader can tell they're looking at a snapshot. */}
      <div
        style={{
          padding: '8px 12px',
          background: 'var(--paper-3)',
          border: '1px solid var(--rule-strong)',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--ink-2)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: 999,
            background: 'var(--ink-3)',
          }}
        />
        <span>
          <strong style={{ color: 'var(--ink)', fontWeight: 700 }}>
            {t('archive_ribbon')}
          </strong>
          {' · '}
          <Link
            href={'/avui' as Route}
            style={{
              color: 'var(--accent)',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            {t('archive_back_to_today')}
          </Link>
        </span>
      </div>

      {/* Header — same masthead pattern as /avui. */}
      <header
        style={{
          borderTop: '3px solid var(--ink)',
          borderBottom: '1px solid var(--ink)',
          padding: '14px 0 12px',
          marginBottom: 22,
        }}
      >
        <div
          className="eyebrow"
          style={{
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
            fontWeight: 600,
          }}
        >
          {t('archive_eyebrow')}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            marginTop: 4,
          }}
        >
          <h1
            className="h-display"
            style={{
              margin: 0,
              fontSize: 'clamp(30px, 5vw, 48px)',
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
            }}
          >
            {t('archive_title', { count: votes.length })}
          </h1>
          <time
            dateTime={date}
            className="tabular"
            style={{
              fontSize: 14,
              color: 'var(--ink-2)',
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
            }}
          >
            {dateLong}
          </time>
        </div>
      </header>

      {/* Lead vote — same VoteSummary visual as the live page. */}
      <section
        style={{
          paddingBottom: 24,
          borderBottom: '1px solid var(--rule)',
          marginBottom: 24,
        }}
      >
        <div
          className="eyebrow"
          style={{ marginBottom: 6, color: 'var(--ink-3)' }}
        >
          {t('archive_lead_eyebrow')}
        </div>
        <LeadVote vote={leadVote} locale={locale} t={t} />
      </section>

      {/* Day's other votes — compact list. We always show the rest
          here, even when long, because this is the canonical
          archival record of the day. */}
      {restVotes.length > 0 && (
        <section style={{ paddingBottom: 24 }}>
          <div
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              color: 'var(--ink-3)',
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            {t('archive_other_votes', { count: restVotes.length })}
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {restVotes.map((v) => (
              <li
                key={v.id}
                style={{
                  padding: '12px 0',
                  borderTop: '1px solid var(--rule)',
                }}
              >
                <Link
                  href={`/votes/${v.id}` as Route}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                    gap: 16,
                    color: 'inherit',
                    textDecoration: 'none',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--ink)',
                        lineHeight: 1.35,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {v.description?.trim() || v.title}
                    </div>
                    <div
                      className="tabular"
                      style={{
                        marginTop: 4,
                        fontSize: 11,
                        color: 'var(--ink-3)',
                      }}
                    >
                      {v.ayes} {t('ayes_short')} · {v.noes} {t('noes_short')} ·{' '}
                      {v.abstentions} {t('abst_short')}
                    </div>
                  </div>
                  <ResultPill
                    result={v.result}
                    label={t(`result_${v.result}`)}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Footer — citation aid for journalists. */}
      <section
        style={{
          padding: '14px 16px',
          background: 'var(--paper-2)',
          border: '1px solid var(--rule)',
          borderRadius: 12,
          fontSize: 13,
          color: 'var(--ink-2)',
          lineHeight: 1.5,
        }}
      >
        <div className="eyebrow" style={{ fontSize: 10, marginBottom: 4 }}>
          {t('archive_cite_eyebrow')}
        </div>
        <code
          className="mono"
          style={{
            display: 'block',
            padding: 8,
            background: 'var(--paper)',
            border: '1px solid var(--rule)',
            borderRadius: 6,
            fontSize: 12,
            wordBreak: 'break-all',
          }}
        >
          https://www.holapolitica.org/avui/{date}
        </code>
      </section>
    </article>
  );
}

type ArchiveT = Awaited<ReturnType<typeof getTranslations<'avui'>>>;

function LeadVote({
  vote,
  locale,
  t,
}: {
  vote: Vote;
  locale: string;
  t: ArchiveT;
}) {
  const subject = vote.description?.trim() || vote.title;
  const summary = pickPlainSummary(vote, locale);
  return (
    <div>
      <Link
        href={`/votes/${vote.id}` as Route}
        style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}
      >
        <h2
          className="h-headline"
          style={{
            margin: '4px 0 10px',
            fontSize: 'clamp(22px, 3vw, 32px)',
            lineHeight: 1.15,
            letterSpacing: '-0.01em',
          }}
        >
          {subject}
        </h2>
      </Link>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 12,
          color: 'var(--ink-3)',
          marginBottom: 14,
        }}
      >
        <ResultPill result={vote.result} label={t(`result_${vote.result}`)} />
      </div>
      <StackedBar
        d={{
          aye: vote.ayes,
          no: vote.noes,
          abst: vote.abstentions,
          nv: vote.absent,
        }}
        height={14}
      />
      <p
        className="tabular"
        style={{
          margin: '10px 0 0',
          fontSize: 13,
          color: 'var(--ink-2)',
          lineHeight: 1.5,
        }}
      >
        {t('lead_caption', {
          ayes: vote.ayes,
          noes: vote.noes,
          abst: vote.abstentions,
        })}
      </p>
      {summary && (
        <p
          className="serif"
          style={{
            margin: '14px 0 0',
            fontSize: 15,
            color: 'var(--ink-2)',
            lineHeight: 1.55,
          }}
        >
          {summary}
        </p>
      )}
    </div>
  );
}
