import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { CalendarDays } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { DailyQuestion } from '@/components/DailyQuestion';

/**
 * "La pregunta del dia" — its own destination. The homepage shows a compact
 * clickable teaser that leads here; the question only opens once you've chosen
 * to play it. Shareable via this stable URL.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('daily');
  return { title: `${t('page_title')} · Hola Política`, description: t('page_subtitle') };
}

export default async function PreguntaDelDiaPage() {
  const t = await getTranslations('daily');
  const locale = await getLocale();

  return (
    <div style={{ maxWidth: 620, marginInline: 'auto' }}>
      <PageHeader
        title={t('page_title')}
        subtitle={t('page_subtitle')}
        icon={<CalendarDays size={20} strokeWidth={1.8} aria-hidden="true" />}
        bordered
      />
      <DailyQuestion
        locale={locale}
        labels={{
          eyebrow: t('eyebrow'),
          correct: t('correct'),
          wrong: t('wrong'),
          pct_correct: t('pct_correct'),
          answered_today: t('answered_today'),
          explore: t('explore'),
          play_cta: t('play_cta'),
          share: t('share'),
          share_copied: t('share_copied'),
          share_text: t('share_text'),
          streak: t('streak'),
          loading: t('loading'),
          unavailable: t('unavailable'),
        }}
      />
    </div>
  );
}
