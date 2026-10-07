import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';

import { JourneyDetail } from '@/components/JourneyDetail';
import { LifecycleDiagram } from '@/components/LifecycleDiagram';
import { isJourneyType } from '@/lib/lawJourney';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('lifecycle');
  return {
    title: t('title'),
    description: t('intro').slice(0, 220),
  };
}

export default async function LifecyclePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const t = await getTranslations('lifecycle');
  // ?type comes from the dark banner on a law's page, so the reader lands on
  // the procedure they were looking at; the chips switch to the others.
  const { type } = await searchParams;
  // Arriving from a law's banner, the reader asked about THAT procedure.
  // The page led with the eight stages of a bill regardless, so someone
  // who clicked through from a motion landed on the wrong journey and had
  // to scroll past it to find theirs. With no type the generic explainer
  // is still the right lead: that reader asked "how is a law made".
  const asked = isJourneyType(type);
  const selected = asked ? type : 'proyecto_ley';
  return (
    <div style={{ paddingTop: 28, paddingBottom: 48 }}>
      <div className="crumbs" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
        <Link href="/votes" style={{ color: 'var(--ink-2)' }}>
          {t('breadcrumb_votes')}
        </Link>
        {' / '}
        <span>{t('eyebrow')}</span>
      </div>
      {asked ? (
        <>
          <JourneyDetail type={selected} />
          <LifecycleDiagram />
        </>
      ) : (
        <>
          <LifecycleDiagram />
          <JourneyDetail type={selected} />
        </>
      )}
      <div style={{ marginTop: 28, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Link href="/votes" className="btn-ink">
          {t('cta_votes')} <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
