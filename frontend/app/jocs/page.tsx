import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { GamesHub } from '@/components/GamesHub';

/**
 * "Jocs": the games hub. A coloured header with the player's own record,
 * then one big card per game; see components/GamesHub.tsx.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('jocs');
  return { title: t('title'), description: t('subtitle') };
}

export default function JocsPage() {
  return <GamesHub />;
}
