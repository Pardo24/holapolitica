import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { SessionSheet } from '@/components/SessionSheet';
import { api, type Vote } from '@/lib/api';

/**
 * `/avui/[date]` — archive of a specific plenary session.
 *
 * The route renders the same :file:`SessionSheet` component as
 * `/avui` but anchored to a fixed YYYY-MM-DD. Permalinks are
 * citation-friendly: a journalist or researcher can drop the URL in
 * a footnote without worrying it'll shift under their feet.
 *
 * To compute the prev/next navigation arrows the component shows in
 * its header, we additionally fetch a recent window of votes (50
 * items) and look up the dates immediately before and after the
 * requested date among the buckets. That keeps neighbour navigation
 * working without a dedicated backend endpoint.
 *
 * Cache: 30 day ISR (immutable). Past plenary data doesn't change,
 * so we let the static generation linger to avoid a Vercel rebuild
 * per archive view.
 */
export const revalidate = 2592000; // 30 days

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
  // Future dates are nonsensical here — /avui already handles "the
  // latest" — and serve as a tiny attack surface (every random date
  // would otherwise materialise a cached blank page).
  if (date > new Date().toISOString().slice(0, 10)) notFound();

  const locale = await getLocale();

  // Fetch the exact-day window for the sheet, plus a wider context
  // window for prev/next neighbour resolution. Both calls hit the
  // same backend cache so the parallel cost is negligible.
  const [exact, context] = await Promise.all([
    api.votes
      .list({ date_from: date, date_to: date, page: 1, page_size: 50 })
      .catch(() => null),
    api.votes
      .list({ page: 1, page_size: 200 })
      .catch(() => null),
  ]);

  const votes: Vote[] = exact?.items ?? [];
  if (votes.length === 0) notFound();

  // Adjacent session dates — sort all distinct dates from the context
  // window and pick the neighbour entries on each side.
  const distinctDates = uniqueDatesNewestFirst(context?.items ?? []);
  const idx = distinctDates.indexOf(date);
  // newer neighbour sits at idx-1 (dates are newest-first), older at idx+1.
  const nextDate = idx > 0 ? distinctDates[idx - 1] ?? null : null;
  const prevDate =
    idx >= 0 && idx < distinctDates.length - 1 ? distinctDates[idx + 1] ?? null : null;

  return (
    <SessionSheet
      date={date}
      votes={votes}
      prevDate={prevDate}
      nextDate={nextDate}
      isArchive={true}
      locale={locale}
    />
  );
}

function uniqueDatesNewestFirst(items: Vote[]): string[] {
  const seen = new Set<string>();
  const dates: string[] = [];
  for (const v of items) {
    const d = v.voted_at.slice(0, 10);
    if (seen.has(d)) continue;
    seen.add(d);
    dates.push(d);
  }
  dates.sort((a, b) => b.localeCompare(a));
  return dates;
}
