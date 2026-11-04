import type { CSSProperties } from 'react';
import { getTranslations } from 'next-intl/server';
import { GroupBadge } from '@/components/GroupBadge';
import { CHOICE_COLOR, type PartyStanceWithCount } from '@/components/GroupVoteBreakdown';
import type { StanceLabels } from '@/components/PartyStanceRow';
import { ChevronDown, ExternalLink } from '@/components/icons';
import type { DebateQuote } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';

/** Quotes shown before the rest fold away: two rows of the two-column grid. */
const SHOWN = 4;

type Row = { slug: string; name: string; color: string | null; choice: string | null };

/**
 * "What the groups said in the debate": one verbatim passage per group from
 * the plenary's Diario de Sesiones, next to how that group voted, with the
 * speaker and a link to the official page. Groups with no passage are listed
 * with their vote under the cards. Renders nothing when the debate has no
 * passages at all.
 *
 * Quotes only, in the language they were spoken in: nothing here is ours but
 * the framing, which says the passage is not the reason for anyone's vote.
 * Server component; styles in app/styles/debate-quotes.css, which the pages
 * import. See backend/app/ingest/congreso/debate_quotes.py.
 */
export async function DebateQuotes({
  quotes,
  parties,
  labels,
  locale,
}: {
  quotes: DebateQuote[] | undefined;
  parties: PartyStanceWithCount[];
  labels: StanceLabels;
  locale: string;
}) {
  const first = quotes?.[0];
  if (!quotes || !first) return null;
  const t = await getTranslations('debate_quotes');

  const bySlug = new Map<string, DebateQuote[]>();
  for (const quote of quotes) {
    bySlug.set(quote.group_slug, [...(bySlug.get(quote.group_slug) ?? []), quote]);
  }
  // Biggest delegation first, as the vote breakdown orders them. A group that
  // spoke but has no recorded stance (a vote by assent) follows.
  const rows: Row[] = [...parties]
    .sort((a, b) => (b.count ?? b.deputies ?? 0) - (a.count ?? a.deputies ?? 0))
    .map((p) => ({ slug: p.slug, name: p.name_short, color: p.color_hex, choice: p.choice }));
  for (const [slug, [quote]] of bySlug) {
    if (quote && !rows.some((row) => row.slug === slug)) {
      rows.push({ slug, name: quote.group_short, color: quote.group_color, choice: null });
    }
  }
  const cards = rows.flatMap((row) => (bySlug.get(row.slug) ?? []).map((quote) => ({ row, quote })));
  const silent = rows.filter((row) => !bySlug.has(row.slug));

  const debateDate = new Date(`${first.debate_date}T12:00:00`).toLocaleDateString(locale, {
    dateStyle: 'long',
  });
  const stanceWord = (choice: string): string =>
    choice === 'aye'
      ? labels.aye
      : choice === 'no'
        ? labels.no
        : choice === 'abstention'
          ? labels.abstention
          : labels.absent;
  const stanceColor = (choice: string): string =>
    CHOICE_COLOR[choice as keyof typeof CHOICE_COLOR] ?? CHOICE_COLOR.absent;

  const card = ({ row, quote }: { row: Row; quote: DebateQuote }) => (
    <li key={`${row.slug}-${quote.speaker_name}`}>
      <figure className="dq__card" style={{ '--dq-color': row.color ?? undefined } as CSSProperties}>
        <div className="dq__head">
          <GroupBadge slug={row.slug} color={row.color} size="sm" link={false} />
          <span className="dq__group">{displayGroupShort(row.name)}</span>
          {row.choice && (
            <span
              className="dq__stance"
              style={{ '--dq-stance': stanceColor(row.choice) } as CSSProperties}
            >
              {stanceWord(row.choice)}
            </span>
          )}
        </div>
        <blockquote className="dq__quote">«{quote.quote}»</blockquote>
        <figcaption className="dq__cite">
          {t('speaker', {
            speaker: quote.speaker_name,
            group: quote.group_short.replace(/^GP /, ''),
          })}
          {' · '}
          <a href={quote.source_url} target="_blank" rel="noopener noreferrer">
            {t('source', { ref: quote.dscd_ref, page: quote.page })}{' '}
            <ExternalLink size={11} aria-hidden="true" />
          </a>
        </figcaption>
      </figure>
    </li>
  );
  const rest = cards.length - SHOWN;

  return (
    <section className="dq" aria-labelledby="debate-quotes-title">
      <h2 id="debate-quotes-title" className="dq__title">
        {t('title')}
      </h2>
      <p className="dq__dek">{t('dek', { date: debateDate })}</p>
      <ul className="dq__grid">{cards.slice(0, SHOWN).map(card)}</ul>
      {rest > 0 && (
        <details className="dq__more">
          <summary>
            <span className="dq__show">{t('more', { count: rest })}</span>
            <span className="dq__less">{t('less')}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <ul className="dq__grid">{cards.slice(SHOWN).map(card)}</ul>
        </details>
      )}
      {silent.length > 0 && (
        <p className="dq__silent">
          <strong>{t('silent')}</strong>{' '}
          {silent.map((row, i) => (
            <span key={row.slug}>
              {i > 0 && ' · '}
              {displayGroupShort(row.name)}
              {row.choice && (
                <span style={{ color: stanceColor(row.choice), fontWeight: 600 }}>
                  {' '}
                  ({stanceWord(row.choice).toLowerCase()})
                </span>
              )}
            </span>
          ))}
        </p>
      )}
      <p className="dq__method">{t('method')}</p>
    </section>
  );
}
