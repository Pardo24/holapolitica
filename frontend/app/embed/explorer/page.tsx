import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { api, type Vote, type VoteResult } from '@/lib/api';
import { pickTopicName } from '@/lib/topics';

/**
 * Stateful filter embed — widget #3 from the comparative scan
 * (OWID pattern: URL-encoded view state).
 *
 * The widget reads its filters from the iframe's own URL params:
 *
 *   <iframe src=".../embed/explorer?topic=habitatge&result=approved&limit=8"
 *           width="100%" height="520" frameborder="0"
 *           loading="lazy"></iframe>
 *
 * Every supported param maps 1:1 to a filter on /api/votes:
 *   - topic     (slug)
 *   - result    (approved | rejected | tie)
 *   - group     (proposing group slug)
 *   - from      (YYYY-MM-DD)
 *   - to        (YYYY-MM-DD)
 *   - limit     (1-20, defaults to 8)
 *   - lang_filter not needed; the embed re-renders in the host's
 *     selected site language via the existing locale cookie.
 *
 * What a journalist can do with this: drop a single iframe into an
 * article on housing, set ``?topic=habitatge``, and the embed shows
 * the latest housing votes. Change the filter, change the URL,
 * share that URL — they get exactly the view they saw. Same
 * principle as Our World in Data's chart embeds.
 *
 * Embed contract (CLAUDE.md):
 *   - sub-1s render, inline styles, no JS / third-party assets
 *   - factual only (no editorial framing of which filter to suggest)
 *   - attribution + link back to the canonical /votes page with the
 *     same filters in the URL so the reader can carry over.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const ALLOWED_RESULTS = new Set(['approved', 'rejected', 'tie']);

function clampLimit(raw: string | undefined): number {
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return 8;
  return Math.max(1, Math.min(20, n));
}

function safeDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  return raw;
}

export default async function EmbedExplorerPage({
  searchParams,
}: {
  searchParams: Promise<{
    topic?: string;
    result?: string;
    group?: string;
    from?: string;
    to?: string;
    limit?: string;
  }>;
}) {
  const sp = await searchParams;
  const t = await getTranslations('embed_explorer');
  const locale = await getLocale();
  // Map vote.result -> a label per the embed_explorer namespace.
  // Singular forms here (we're labelling a single vote's result),
  // distinct from the "Aprovades/Aprobadas" plural the filter chips
  // use which lives under the same namespace.
  const singularResultLabels: Record<VoteResult, string> = {
    approved: t('result_singular_approved'),
    rejected: t('result_singular_rejected'),
    tie: t('result_singular_tie'),
  };

  const topicSlug = sp.topic?.trim() || undefined;
  const result =
    sp.result && ALLOWED_RESULTS.has(sp.result) ? sp.result : undefined;
  const groupSlug = sp.group?.trim() || undefined;
  const dateFrom = safeDate(sp.from);
  const dateTo = safeDate(sp.to);
  const limit = clampLimit(sp.limit);

  // Resolve the topic record up-front so the header can show the
  // localised name and the chip colour. Best-effort — if the lookup
  // fails the filter still applies, the header just shows the slug.
  const topic = topicSlug
    ? await api.topics.get(topicSlug).catch(() => null)
    : null;
  const topicName = topic ? pickTopicName(topic, locale) : topicSlug ?? null;
  const topicColor = topic?.color_hex ?? null;

  let page;
  try {
    page = await api.votes.list({
      topic_slug: topicSlug,
      result: result as 'approved' | 'rejected' | 'tie' | undefined,
      proposing_group_slug: groupSlug,
      date_from: dateFrom,
      date_to: dateTo,
      page: 1,
      page_size: limit,
    });
  } catch {
    return (
      <div
        style={{
          padding: 20,
          fontSize: 13,
          color: 'var(--ink-3)',
          textAlign: 'center',
          border: '1px solid var(--rule)',
          background: 'var(--paper)',
        }}
      >
        {t('error')}
      </div>
    );
  }

  // Construct an equivalent /votes URL with the same filters so the
  // "See all" link carries the journalist's selection through to
  // the main site. The embed exposes short param names (topic,
  // group, from, to) but the /votes page uses the full backend
  // names (topic_slug, proposing_group_slug, date_from, date_to);
  // remap here so the deep-link actually preselects the filters.
  const detailQuery = new URLSearchParams();
  if (topicSlug) detailQuery.set('topic_slug', topicSlug);
  if (result) detailQuery.set('result', result);
  if (groupSlug) detailQuery.set('proposing_group_slug', groupSlug);
  if (dateFrom) detailQuery.set('date_from', dateFrom);
  if (dateTo) detailQuery.set('date_to', dateTo);
  const detailUrl = `/votes${detailQuery.toString() ? `?${detailQuery.toString()}` : ''}`;

  const filterChips: { label: string; color?: string }[] = [];
  if (topicName) filterChips.push({ label: topicName, color: topicColor ?? undefined });
  if (result)
    filterChips.push({
      label: t(`result_${result as 'approved' | 'rejected' | 'tie'}`),
    });
  if (groupSlug)
    filterChips.push({
      label: groupSlug.toUpperCase(),
    });
  if (dateFrom || dateTo) {
    const fromStr = dateFrom
      ? new Date(dateFrom).toLocaleDateString(locale, { dateStyle: 'medium' })
      : '…';
    const toStr = dateTo
      ? new Date(dateTo).toLocaleDateString(locale, { dateStyle: 'medium' })
      : t('now_label');
    filterChips.push({ label: `${fromStr} → ${toStr}` });
  }

  return (
    <article className="embed-card" lang={locale}>
      <header
        style={{
          paddingBottom: 10,
          marginBottom: 10,
          borderBottom: '1px solid var(--rule)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 8,
            marginBottom: 6,
            flexWrap: 'wrap',
          }}
        >
          <p
            className="eyebrow"
            style={{
              margin: 0,
              fontSize: 10,
              color: 'var(--ink-3)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            {t('eyebrow')}
          </p>
          <span
            className="tabular"
            style={{ fontSize: 11, color: 'var(--ink-3)' }}
          >
            {t('total_count', { count: page.total })}
          </span>
        </div>
        {filterChips.length > 0 ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 5,
            }}
          >
            {filterChips.map((chip, i) => (
              <span
                key={i}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '2px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--ink-2)',
                  background: chip.color
                    ? `color-mix(in oklch, ${chip.color} 14%, var(--paper))`
                    : 'var(--paper-2)',
                  border: `1px solid ${
                    chip.color
                      ? `color-mix(in oklch, ${chip.color} 32%, var(--paper))`
                      : 'var(--rule)'
                  }`,
                  whiteSpace: 'nowrap',
                }}
              >
                {chip.color && (
                  <span
                    aria-hidden="true"
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      background: chip.color,
                      flex: 'none',
                    }}
                  />
                )}
                {chip.label}
              </span>
            ))}
          </div>
        ) : (
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: 'var(--ink-3)',
              fontStyle: 'italic',
            }}
          >
            {t('no_filter_hint')}
          </p>
        )}
      </header>

      {page.items.length === 0 ? (
        <p
          style={{
            margin: 0,
            padding: '20px 4px',
            fontSize: 12,
            color: 'var(--ink-3)',
            textAlign: 'center',
          }}
        >
          {t('empty')}
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'grid',
            gap: 8,
          }}
        >
          {page.items.map((v) => (
            <VoteCard
              key={v.id}
              vote={v}
              locale={locale}
              resultLabel={singularResultLabels[v.result]}
            />
          ))}
        </ul>
      )}

      <footer
        style={{
          marginTop: 10,
          paddingTop: 8,
          borderTop: '1px solid var(--rule)',
          fontSize: 11,
          color: 'var(--ink-3)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <a
          href={detailUrl}
          target="_top"
          style={{
            color: 'var(--ink)',
            textDecoration: 'underline',
            textUnderlineOffset: 3,
            fontWeight: 600,
          }}
        >
          {t('see_all')}
        </a>
        <span>
          {t('source_label')}{' '}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            target="_top"
            style={{ color: 'var(--ink)', textDecoration: 'none', fontWeight: 700 }}
          >
            Hola Política
          </a>
        </span>
      </footer>
    </article>
  );
}

function VoteCard({
  vote,
  locale,
  resultLabel,
}: {
  vote: Vote;
  locale: string;
  resultLabel: string;
}) {
  const subject = vote.description?.trim() || vote.title;
  const resultColor =
    vote.result === 'approved'
      ? 'var(--aye)'
      : vote.result === 'rejected'
        ? 'var(--no)'
        : 'var(--abst)';
  const resultBg =
    vote.result === 'approved'
      ? 'var(--aye-soft)'
      : vote.result === 'rejected'
        ? 'var(--no-soft)'
        : 'var(--abst-soft)';
  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: 10,
        padding: '8px 0',
        borderBottom: '1px solid var(--rule)',
        alignItems: 'baseline',
      }}
    >
      <a
        href={`/votes/${vote.id}`}
        target="_top"
        style={{
          color: 'var(--ink)',
          textDecoration: 'none',
          minWidth: 0,
        }}
      >
        <div
          className="tabular"
          style={{ fontSize: 10, color: 'var(--ink-3)' }}
        >
          {new Date(vote.voted_at).toLocaleDateString(locale, {
            dateStyle: 'medium',
          })}
          {' · '}
          <span className="tabular" style={{ color: 'var(--aye)' }}>
            {vote.ayes}
          </span>
          {' · '}
          <span className="tabular" style={{ color: 'var(--no)' }}>
            {vote.noes}
          </span>
          {vote.abstentions > 0 && (
            <>
              {' · '}
              <span className="tabular" style={{ color: 'var(--abst)' }}>
                {vote.abstentions}
              </span>
            </>
          )}
        </div>
        <div
          className="serif"
          style={{
            fontSize: 13,
            lineHeight: 1.4,
            fontWeight: 500,
            color: 'var(--ink)',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            marginTop: 2,
          }}
        >
          {subject}
        </div>
      </a>
      <span
        style={{
          background: resultBg,
          color: resultColor,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          padding: '3px 7px',
          borderRadius: 4,
          whiteSpace: 'nowrap',
          flex: 'none',
        }}
      >
        {resultLabel}
      </span>
    </li>
  );
}
