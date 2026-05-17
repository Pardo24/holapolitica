import type { Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { ResultPill } from '@/components/ResultPill';
import type { Vote } from '@/lib/api';
import { pickPlainSummary } from '@/lib/glossary';

/**
 * Plenary-session summary sheet — the canonical render for one day's
 * worth of votes in the Spanish Congress. Used both by ``/avui``
 * (always the latest session) and ``/avui/[date]`` (any archived
 * session) so the two routes share a single visual language.
 *
 * Section order, from masthead down:
 *
 *   1. Masthead — session number + long date + vote count + prev/next
 *      navigation between adjacent sessions in the loaded window.
 *   2. Stats strip — counts of approved / rejected / tied votes plus
 *      the session's tightest margin. Purely numerical, no editorial
 *      framing.
 *   3. Vote list — every vote of the session in chronological order
 *      (oldest first, since that's how a plenary actually runs). Each
 *      row carries the title, the result pill, the stacked-bar
 *      visual and a per-vote margin caption. The first vote
 *      additionally shows the LLM plain-language summary when one
 *      exists so the page has a "lede" without us picking an
 *      editorial highlight.
 *
 * The caller passes the session date, the votes, optional prev/next
 * dates for navigation, and whether to show the archive banner. The
 * sheet has no opinion about whether it's living on /avui or
 * /avui/<date> — that framing is decided by the parent route.
 */
export async function SessionSheet({
  date,
  votes,
  prevDate,
  nextDate,
  isArchive,
  locale,
}: {
  date: string; // YYYY-MM-DD
  votes: Vote[]; // already filtered to this date, oldest-first preferred
  prevDate: string | null;
  nextDate: string | null;
  isArchive: boolean;
  locale: string;
}) {
  const t = await getTranslations('session_sheet');

  // Order chronologically (oldest first within the session) so the
  // sheet reads top-to-bottom in vote sequence. We re-sort defensively
  // in case the caller hands us newest-first (the /votes API does).
  const ordered = [...votes].sort((a, b) =>
    a.voted_at.localeCompare(b.voted_at) || (a.sequence_in_session ?? 0) - (b.sequence_in_session ?? 0),
  );

  // Aggregated counts. Result is one of approved / rejected / tie.
  const counts = { approved: 0, rejected: 0, tie: 0 };
  let tightestMargin = Number.POSITIVE_INFINITY;
  let tightestVoteId: number | null = null;
  for (const v of ordered) {
    counts[v.result] += 1;
    const margin = Math.abs(v.ayes - v.noes);
    if (v.ayes + v.noes >= 30 && margin < tightestMargin) {
      tightestMargin = margin;
      tightestVoteId = v.id;
    }
  }
  const tightestVote = tightestVoteId
    ? ordered.find((v) => v.id === tightestVoteId) ?? null
    : null;

  // Session number — every vote in the bucket shares the same
  // ``session_id``; we display the smallest sequence's session as the
  // canonical session number (they're identical in practice).
  const sessionId = ordered[0]?.session_id ?? null;

  const anchorDate = new Date(`${date}T12:00:00Z`);
  const dateLong = anchorDate.toLocaleDateString(locale, { dateStyle: 'full' });

  return (
    <article style={{ paddingTop: 18, paddingBottom: 48 }}>
      {/* Optional archive banner — only on /avui/[date]. */}
      {isArchive && (
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
              style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
            >
              {t('archive_back_to_latest')}
            </Link>
          </span>
        </div>
      )}

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
          {t('eyebrow', { sessionNumber: sessionId ?? '—' })}
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
              fontSize: 'clamp(28px, 5vw, 44px)',
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
            }}
          >
            {dateLong}
          </h1>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: 'var(--ink-2)',
              fontFamily: 'var(--font-serif)',
            }}
          >
            <NavButton href={prevDate} dir="prev" label={t('nav_prev')} />
            <span className="tabular" style={{ fontStyle: 'italic' }}>
              {t('vote_count', { count: ordered.length })}
            </span>
            <NavButton href={nextDate} dir="next" label={t('nav_next')} />
          </div>
        </div>
      </header>

      {/* Stats strip — aggregated session metrics. */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 10,
          marginBottom: 28,
        }}
      >
        <StatBox
          label={t('stat_approved')}
          value={counts.approved}
          color="var(--aye, #16A34A)"
        />
        <StatBox
          label={t('stat_rejected')}
          value={counts.rejected}
          color="var(--no, #DC2626)"
        />
        <StatBox
          label={t('stat_tie')}
          value={counts.tie}
          color="var(--abst, #CA8A04)"
        />
        {tightestVote && (
          <Link
            href={`/votes/${tightestVote.id}` as Route}
            style={{
              padding: '12px 14px',
              border: '1px solid var(--rule-strong)',
              borderRadius: 10,
              background: 'var(--paper-2)',
              color: 'inherit',
              textDecoration: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <div
              className="tabular"
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: 'var(--ink)',
                letterSpacing: '-0.02em',
              }}
            >
              {tightestMargin === 0
                ? t('stat_tightest_tie')
                : `±${tightestMargin}`}
            </div>
            <div
              style={{
                fontSize: 10,
                color: 'var(--ink-3)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 600,
              }}
            >
              {t('stat_tightest_label')}
            </div>
          </Link>
        )}
      </section>

      {/* Vote list — every vote of the session, chronological. */}
      <section style={{ marginBottom: 28 }}>
        <div
          className="eyebrow"
          style={{ marginBottom: 12, color: 'var(--ink-3)' }}
        >
          {t('list_eyebrow')}
        </div>
        {ordered.length === 0 ? (
          <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>
            {t('list_empty')}
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {ordered.map((v, i) => (
              <VoteRow
                key={v.id}
                vote={v}
                locale={locale}
                showSummary={i === 0}
                resultLabel={t(`result_${v.result}`)}
                ayesLabel={t('ayes_short')}
                noesLabel={t('noes_short')}
                abstLabel={t('abst_short')}
                marginLabel={(margin) =>
                  margin === 0 ? t('margin_tie') : t('margin_short', { margin })
                }
              />
            ))}
          </ul>
        )}
      </section>

      {/* Citation footer — appears for both archive and live pages so
          the URL is always handy. */}
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
          {t('cite_eyebrow')}
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

function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      style={{
        padding: '12px 14px',
        border: '1px solid var(--rule)',
        borderRadius: 10,
        background: 'var(--paper-2)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <div
        className="tabular"
        style={{
          fontSize: 28,
          fontWeight: 700,
          color,
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 10,
          color: 'var(--ink-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 600,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function NavButton({
  href,
  dir,
  label,
}: {
  href: string | null;
  dir: 'prev' | 'next';
  label: string;
}) {
  const icon = dir === 'prev' ? <ChevronLeft size={14} /> : <ChevronRight size={14} />;
  const sharedStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: 999,
    border: '1px solid var(--rule)',
  };
  if (!href) {
    return (
      <span
        aria-hidden="true"
        style={{ ...sharedStyle, color: 'var(--ink-3)', opacity: 0.4 }}
      >
        {icon}
      </span>
    );
  }
  return (
    <Link
      href={`/avui/${href}` as Route}
      aria-label={label}
      title={label}
      style={{
        ...sharedStyle,
        color: 'var(--ink)',
        background: 'var(--paper)',
        textDecoration: 'none',
      }}
    >
      {icon}
    </Link>
  );
}

function VoteRow({
  vote,
  locale,
  showSummary,
  resultLabel,
  ayesLabel,
  noesLabel,
  abstLabel,
  marginLabel,
}: {
  vote: Vote;
  locale: string;
  showSummary: boolean;
  resultLabel: string;
  ayesLabel: string;
  noesLabel: string;
  abstLabel: string;
  marginLabel: (margin: number) => string;
}) {
  const subject = vote.description?.trim() || vote.title;
  const summary = showSummary ? pickPlainSummary(vote, locale) : null;
  const margin = Math.abs(vote.ayes - vote.noes);
  return (
    <li
      style={{
        padding: '20px 0',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <Link
        href={`/votes/${vote.id}` as Route}
        style={{
          display: 'grid',
          gridTemplateColumns: '32px minmax(0, 1fr) auto',
          columnGap: 16,
          rowGap: 8,
          color: 'inherit',
          textDecoration: 'none',
          alignItems: 'baseline',
        }}
      >
        {/* Sequence number — quiet anchor in the left gutter. */}
        <span
          className="tabular"
          style={{
            fontSize: 11,
            color: 'var(--ink-3)',
            fontWeight: 600,
            letterSpacing: '0.08em',
          }}
        >
          {vote.sequence_in_session != null
            ? String(vote.sequence_in_session).padStart(2, '0')
            : '—'}
        </span>

        {/* Title — the main thing to read. Large, serif, generous
            line-height. Drops the previous 2-3 line clamp to a 3-line
            cap that's only enforced for the densest rows. */}
        <h3
          className="serif"
          style={{
            margin: 0,
            fontSize: 'clamp(17px, 2vw, 19px)',
            fontWeight: 600,
            color: 'var(--ink)',
            lineHeight: 1.35,
            letterSpacing: '-0.005em',
          }}
        >
          {subject}
        </h3>

        {/* Result pill — vertically centered with the title baseline. */}
        <ResultPill result={vote.result} label={resultLabel} />

        {/* Spacer cell (left gutter remains empty on the metadata row). */}
        <span aria-hidden="true" />

        {/* Counts row — Sí / No / Abst. each tinted in its semantic
            colour. Replaces the previous stacked-color bar: the
            colours of the numbers do the visualisation work, the
            text stays the primary signal. */}
        <div
          className="tabular"
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 14,
            fontSize: 13,
            color: 'var(--ink-3)',
            flexWrap: 'wrap',
          }}
        >
          <CountStat label={ayesLabel} value={vote.ayes} color="var(--aye, #16A34A)" />
          <CountStat label={noesLabel} value={vote.noes} color="var(--no, #DC2626)" />
          <CountStat label={abstLabel} value={vote.abstentions} color="var(--abst, #CA8A04)" />
        </div>

        {/* Margin — derived metric, kept muted on the right. */}
        <span
          className="tabular"
          style={{
            fontSize: 11,
            color: 'var(--ink-3)',
            whiteSpace: 'nowrap',
          }}
        >
          {marginLabel(margin)}
        </span>

        {/* Plain summary — only for the first vote, so the page has
            a "lede" without picking an editorial highlight. */}
        {summary && (
          <>
            <span aria-hidden="true" />
            <p
              className="serif"
              style={{
                margin: 0,
                gridColumn: '2 / span 2',
                fontSize: 14,
                color: 'var(--ink-2)',
                lineHeight: 1.55,
              }}
            >
              {summary}
            </p>
          </>
        )}
      </Link>
    </li>
  );
}

/**
 * Inline count chip used inside the vote row's metadata line —
 * "Sí 187", "No 152", "Abst. 11". The value carries the semantic
 * colour (green / red / amber) so the eye can scan results without a
 * graphical bar; the label stays muted so the typography hierarchy
 * is value > label.
 */
function CountStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
      <strong
        style={{
          fontSize: 15,
          fontWeight: 700,
          color,
          letterSpacing: '-0.01em',
        }}
      >
        {value}
      </strong>
      <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{label}</span>
    </span>
  );
}
