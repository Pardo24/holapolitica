import { getTranslations } from 'next-intl/server';

/**
 * Generic page skeleton, shown the instant a tab is tapped.
 *
 * Every page renders on the server per request (the locale comes from a
 * header), so without a loading state a tap on the bottom tab bar did
 * nothing visible until the whole render came back, half a second or more
 * on a phone. With a ``loading.tsx`` Next.js also prefetches this shell for
 * every link in view, so the tap paints immediately and the content
 * streams in behind it.
 *
 * CSS-only shimmering rectangles in the rhythm of the real pages: a
 * header, an optional search box, then rows. No client JS, no fetches.
 */
export async function PageSkeleton({ search = false, rows = 5 }: { search?: boolean; rows?: number }) {
  const t = await getTranslations('common');
  return (
    <div aria-busy="true" aria-label={t('loading')} className="page-skeleton">
      <Bar w="32%" h={11} mb={8} />
      <Bar w="58%" h={28} mb={10} />
      <Bar w="78%" h={13} mb={20} />
      {search && <div className="page-skeleton__box" style={{ height: 46, marginBottom: 18 }} />}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="page-skeleton__row">
          <Bar w="24%" h={10} mb={10} />
          <Bar w="86%" h={16} mb={8} />
          <Bar w="64%" h={16} />
        </div>
      ))}
    </div>
  );
}

function Bar({ w, h, mb = 0 }: { w: string; h: number; mb?: number }) {
  return <div className="page-skeleton__bar" style={{ width: w, height: h, marginBottom: mb }} />;
}
