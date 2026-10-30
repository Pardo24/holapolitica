import { getTranslations } from 'next-intl/server';
import { GroupBadge } from '@/components/GroupBadge';
import { CHOICE_COLOR, type PartyStanceWithCount } from '@/components/GroupVoteBreakdown';
import type { StanceLabels } from '@/components/PartyStanceRow';
import { ExternalLink } from '@/components/icons';
import type { DebateQuote } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';

/**
 * "What the groups said in the debate": one verbatim passage per group from
 * the plenary's Diario de Sesiones, next to how that group voted, with the
 * speaker and a link to the official page. A group with no passage shows only
 * its vote. Renders nothing when the debate has no passages at all.
 *
 * Quotes only, in the language they were spoken in: nothing here is ours but
 * the framing, which says the passage is not the reason for anyone's vote.
 * Server component. See backend/app/ingest/congreso/debate_quotes.py.
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
  const ordered = [...parties].sort(
    (a, b) => (b.count ?? b.deputies ?? 0) - (a.count ?? a.deputies ?? 0),
  );
  const rows: { slug: string; name: string; color: string | null; choice: string | null }[] =
    ordered.map((p) => ({
      slug: p.slug,
      name: p.name_short,
      color: p.color_hex,
      choice: p.choice,
    }));
  for (const [slug, [quote]] of bySlug) {
    if (quote && !rows.some((row) => row.slug === slug)) {
      rows.push({ slug, name: quote.group_short, color: quote.group_color, choice: null });
    }
  }
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

  return (
    <section
      aria-labelledby="debate-quotes-title"
      style={{ margin: '28px 0', display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <div>
        <h2
          id="debate-quotes-title"
          style={{
            margin: 0,
            fontFamily: 'var(--font-serif)',
            fontSize: 20,
            color: 'var(--ink)',
          }}
        >
          {t('title')}
        </h2>
        <p
          style={{
            margin: '4px 0 0',
            maxWidth: 680,
            fontSize: 13.5,
            lineHeight: 1.5,
            color: 'var(--ink-3)',
          }}
        >
          {t('dek', { date: debateDate })}
        </p>
      </div>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {rows.map((row) => (
          <li key={row.slug} style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <GroupBadge slug={row.slug} color={row.color} size="sm" link={false} />
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>
                {displayGroupShort(row.name)}
              </span>
              {row.choice && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color:
                      CHOICE_COLOR[row.choice as keyof typeof CHOICE_COLOR] ?? CHOICE_COLOR.absent,
                  }}
                >
                  {stanceWord(row.choice)}
                </span>
              )}
            </div>
            {(bySlug.get(row.slug) ?? []).map((quote) => (
              <figure
                key={quote.speaker_name}
                style={{
                  margin: '8px 0 0',
                  paddingLeft: 12,
                  borderLeft: `3px solid ${row.color ?? 'var(--line)'}`,
                }}
              >
                <blockquote
                  style={{
                    margin: 0,
                    fontSize: 14.5,
                    lineHeight: 1.55,
                    color: 'var(--ink)',
                    overflowWrap: 'anywhere',
                  }}
                >
                  «{quote.quote}»
                </blockquote>
                <figcaption
                  style={{
                    marginTop: 4,
                    fontSize: 12.5,
                    lineHeight: 1.45,
                    color: 'var(--ink-3)',
                  }}
                >
                  {t('speaker', {
                    speaker: quote.speaker_name,
                    group: quote.group_short.replace(/^GP /, ''),
                  })}
                  {' · '}
                  <a
                    href={quote.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--ink-2)', whiteSpace: 'nowrap' }}
                  >
                    {t('source', { ref: quote.dscd_ref, page: quote.page })}{' '}
                    <ExternalLink
                      size={11}
                      aria-hidden="true"
                      style={{ display: 'inline', verticalAlign: '-1px' }}
                    />
                  </a>
                </figcaption>
              </figure>
            ))}
          </li>
        ))}
      </ul>
      <p
        style={{ margin: 0, maxWidth: 680, fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-3)' }}
      >
        {t('method')}
      </p>
    </section>
  );
}
