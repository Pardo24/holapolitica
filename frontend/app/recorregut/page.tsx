import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';

import { LifecycleDiagram } from '@/components/LifecycleDiagram';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('lifecycle');
  return {
    title: t('title'),
    description: t('intro').slice(0, 220),
  };
}

export default async function LifecyclePage() {
  const t = await getTranslations('lifecycle');
  return (
    <div style={{ paddingTop: 28, paddingBottom: 48 }}>
      <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
        <Link href="/votes" style={{ color: 'var(--ink-2)' }}>
          {t('breadcrumb_votes')}
        </Link>
        {' / '}
        <span>{t('eyebrow')}</span>
      </div>
      <LifecycleDiagram />
      <div style={{ marginTop: 28, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Link href="/votes" className="btn-ink">
          {t('cta_votes')} <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
