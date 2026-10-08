import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { UserRound } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { ProfilePicker } from '@/components/ProfilePicker';
import { api } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('profiles');
  return { title: t('index_title'), description: t('section_lede') };
}

/** Every everyday situation, as the home's "I a tu, què t'afecta?" offers. */
export default async function ProfilesIndexPage() {
  const t = await getTranslations('profiles');
  const counts = await api.initiatives.profiles().catch(() => null);
  return (
    <div>
      <PageHeader
        hue="var(--hue-lleis)"
        title={t('index_title')}
        subtitle={t('section_lede')}
        icon={<UserRound size={20} strokeWidth={1.8} aria-hidden="true" />}
      />
      <div style={{ marginTop: 18 }}>
        <ProfilePicker heading={false} counts={counts ? new Map(counts.map((c) => [c.key, c.count])) : null} />
      </div>
    </div>
  );
}
