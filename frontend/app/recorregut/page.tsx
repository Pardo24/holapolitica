import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  ArrowRight,
  FileSignature,
  HelpCircle,
  Landmark,
  MessageSquareText,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import type { InitiativeType } from '@/lib/api';
import { JOURNEY_STEPS, JOURNEY_TYPES, isJourneyType } from '@/lib/lawJourney';
import { LAW_TYPE_BINDING } from '@/lib/lawTypes';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('lifecycle');
  return {
    title: t('title'),
    description: t('page_intro').slice(0, 220),
  };
}

const TYPE_ICON: Partial<Record<InitiativeType, LucideIcon>> = {
  proyecto_ley: Landmark,
  proposicion_ley: Users,
  real_decreto_ley: Zap,
  proposicion_no_ley: MessageSquareText,
  mocion: FileSignature,
  interpelacion: HelpCircle,
};

const GLOSSARY = ['amendment', 'totality', 'taking', 'whole', 'validation', 'expired'] as const;

/**
 * How a law is made, one procedure at a time.
 *
 * Pick the kind of initiative (big cards, each saying whether it changes
 * the law), then read its steps, each with a plain explanation, then the
 * handful of words the site uses for those steps (amendment, taking into
 * consideration, whole-text vote...). The page used to stack a generic
 * eight-step diagram on top of the per-type steps, which were one word
 * each: the same journey twice, and the useful one unexplained.
 *
 * ?type= comes from the dark banner on a law's page, so the reader lands
 * on the procedure they were looking at.
 */
export default async function LifecyclePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const t = await getTranslations('lifecycle');
  const tJourney = await getTranslations('law_journey');
  const tType = await getTranslations('law_type');
  const { type } = await searchParams;
  const selected: InitiativeType = isJourneyType(type) ? type : 'proyecto_ley';
  const steps = JOURNEY_STEPS[selected] ?? JOURNEY_STEPS.other;
  const binding = LAW_TYPE_BINDING[selected];
  const SelectedIcon = TYPE_ICON[selected] ?? Landmark;

  return (
    <div className="rec">
      <div className="crumbs" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
        <Link href="/lleis" style={{ color: 'var(--ink-2)' }}>
          {t('breadcrumb_laws')}
        </Link>
        {' / '}
        <span>{t('eyebrow')}</span>
      </div>

      <header className="rec-hero">
        <h1>{t('title')}</h1>
        <p>{t('page_intro')}</p>
      </header>

      {/* 1. Which kind of initiative. */}
      <section aria-labelledby="rec-types-title">
        <h2 id="rec-types-title" className="rec-h2">
          {t('pick_type')}
        </h2>
        <ul className="rec-types">
          {JOURNEY_TYPES.map((candidate) => {
            const Icon = TYPE_ICON[candidate] ?? Landmark;
            const active = candidate === selected;
            const creates = LAW_TYPE_BINDING[candidate];
            return (
              <li key={candidate}>
                <Link
                  href={`/recorregut?type=${candidate}#rec-steps` as Route}
                  scroll={false}
                  aria-current={active ? 'page' : undefined}
                  className={active ? 'rec-type is-active' : 'rec-type'}
                >
                  <span className="rec-type__icon" aria-hidden="true">
                    <Icon size={20} strokeWidth={2} />
                  </span>
                  <span className="rec-type__name">{tJourney(`type.${candidate}` as 'type.proyecto_ley')}</span>
                  <span className={creates ? 'rec-badge rec-badge--law' : 'rec-badge'}>
                    {creates ? tType('binding') : tType('non_binding')}
                  </span>
                  <span className="rec-type__desc">{tType(`desc.${candidate}` as 'desc.proyecto_ley')}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 2. Its steps, each explained. */}
      <section id="rec-steps" className="rec-journey" aria-labelledby="rec-journey-title">
        <div className="rec-journey__head">
          <span className="rec-journey__icon" aria-hidden="true">
            <SelectedIcon size={22} strokeWidth={2} />
          </span>
          <div>
            <h2 id="rec-journey-title">{tJourney(`type.${selected}` as 'type.proyecto_ley')}</h2>
            <p>{tType(`desc.${selected}` as 'desc.proyecto_ley')}</p>
            <p className="rec-journey__binding">{binding ? t('binding_yes') : t('binding_no')}</p>
          </div>
        </div>
        <ol className="rec-steps">
          {steps.map((step, i) => (
            <li key={step.key}>
              <span className="rec-steps__n tabular" aria-hidden="true">
                {i + 1}
              </span>
              <div className="rec-steps__card">
                <h3>
                  {tJourney(`label.${selected}.${step.key}` as 'label.proyecto_ley.presentation')}
                  {step.hint && (
                    <span>{tJourney(`hint.${selected}.${step.key}` as 'hint.proyecto_ley.presentation')}</span>
                  )}
                </h3>
                <p>{t(`body.${selected}.${step.key}` as 'body.proyecto_ley.presentation')}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* 3. The words the site uses for these steps. */}
      <section aria-labelledby="rec-glossary-title">
        <h2 id="rec-glossary-title" className="rec-h2">
          {t('glossary_title')}
        </h2>
        <dl className="rec-glossary">
          {GLOSSARY.map((k) => (
            <div key={k}>
              <dt>{t(`glossary.${k}.term` as 'glossary.amendment.term')}</dt>
              <dd>{t(`glossary.${k}.body` as 'glossary.amendment.body')}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="rec-cta">
        <Link href={'/lleis' as Route} className="btn-ink">
          {t('cta_laws')} <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
