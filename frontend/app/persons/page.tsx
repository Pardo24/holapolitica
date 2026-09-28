import { permanentRedirect } from 'next/navigation';
import type { Route } from 'next';

/**
 * The deputies directory lives at /el-teu-diputat.
 *
 * This page and that one both showed a hemicycle and the list of groups
 * under different names, and the site's own navigation pointed at one from
 * the bottom bar and the other from the menu. /el-teu-diputat won because
 * its name says what it does; this route keeps working for old links and
 * search results, and carries the tab across.
 *
 * Only the index moves: /persons/[id], every deputy's own page, is
 * untouched.
 */
export default async function PersonsIndexRedirect({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  // The old page had two tabs: the directory (default) and groups.
  const target = tab === 'grups' ? '/el-teu-diputat?tab=grups' : '/el-teu-diputat?tab=tots';
  permanentRedirect(target as Route);
}
