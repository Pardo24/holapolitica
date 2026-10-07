import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { ExternalLink, FileText, Gavel, Globe2, Users } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { api, type Topic, type TopicGlobalStat } from '@/lib/api';
import { topicIcon } from '@/lib/topic_icons';
import { pickTopicName } from '@/lib/topics';

/**
 * Agenda 2030 — what the UN Sustainable Development Goals are, and what the
 * Congress has actually voted under each of them.
 *
 * The page was switched off before launch, on the grounds that nothing had
 * been classified against the SDG taxonomy yet. That stopped being true:
 * 648 initiatives carry SDG tags today. Meanwhile the goals were leaking
 * into chips and rankings all over the site, labels pointing at a lens that
 * had no page. So: give them the page, and take the labels back out of the
 * places that navigate by editorial theme.
 *
 * Half of it is explanation, deliberately. The Agenda is argued about a lot
 * and described accurately rather less, and the facts that settle most of
 * the argument are dull and checkable: who adopted it, when, whether it
 * binds anyone, who wrote the goals, where to read the text.
 *
 * Neutrality ("mirall, no megàfon"): the page says what the Agenda IS, never
 * whether it is good, and never whether Spain is doing well against it. The
 * numbers and official colours are the UN's. Every goal is rendered,
 * including the ones with nothing classified under them: a goal Congress has
 * not legislated on is a fact about Congress, not a gap to hide.
 */

const SDG_NUMBER_RE = /^sdg-(\d{2})/;

/** The UN's own page for the Agenda, in all its official languages. */
const UN_AGENDA_URL = 'https://sdgs.un.org/2030agenda';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('agenda_2030');
  return {
    title: t('title'),
    description: t('intro').slice(0, 220),
  };
}

export default async function Agenda2030Page() {
  const t = await getTranslations('agenda_2030');
  const locale = await getLocale();

  const [sdgTopics, globals] = await Promise.all([
    api.topics.list({ kind: 'sdg' }).catch(() => [] as Topic[]),
    api.stats.topicsGlobal().catch(() => [] as TopicGlobalStat[]),
  ]);
  const countsBySlug = new Map(globals.map((g) => [g.topic_slug, g.initiatives_total] as const));

  // SDGs are 01-17 by spec. Sort by the leading two digits so goal 1 reads
  // first whatever order the API happened to return.
  const ordered = [...sdgTopics].sort((a, b) => {
    const an = a.slug.match(SDG_NUMBER_RE)?.[1] ?? '99';
    const bn = b.slug.match(SDG_NUMBER_RE)?.[1] ?? '99';
    return an.localeCompare(bn);
  });

  const totalIniciatives = ordered.reduce((acc, top) => acc + (countsBySlug.get(top.slug) ?? 0), 0);
  const covered = ordered.filter((top) => (countsBySlug.get(top.slug) ?? 0) > 0).length;

  const facts = [
    { Icon: Globe2, title: t('fact_what_title'), body: t('fact_what_body') },
    { Icon: Gavel, title: t('fact_binding_title'), body: t('fact_binding_body') },
    { Icon: Users, title: t('fact_who_title'), body: t('fact_who_body') },
    {
      Icon: FileText,
      title: t('fact_read_title'),
      body: t('fact_read_body'),
      href: UN_AGENDA_URL,
      cta: t('fact_read_cta'),
    },
  ];

  return (
    <div style={{ paddingTop: 28, paddingBottom: 48 }}>
      <PageHeader title={t('title')} subtitle={t('eyebrow')} bordered style={{ paddingTop: 0 }}>
        <p
          style={{
            fontSize: 14,
            color: 'var(--ink-3)',
            margin: 0,
            maxWidth: 760,
            lineHeight: 1.55,
          }}
        >
          {t('intro')}
        </p>
      </PageHeader>

      {/* The four checkable facts, before any numbers. Someone arriving to
          find out what this thing is should not have to read a chart first. */}
      <section style={{ paddingTop: 26 }} aria-labelledby="agenda-facts">
        <div className="eyebrow" id="agenda-facts" style={{ marginBottom: 12 }}>
          {t('facts_eyebrow')}
        </div>
        <ul
          className="agenda-facts"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))',
            gap: 12,
          }}
        >
          {facts.map(({ Icon, title, body, href, cta }) => (
            <li
              key={title}
              style={{
                border: '1px solid var(--rule)',
                borderRadius: 14,
                background: 'var(--paper)',
                padding: '14px 16px 15px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Icon
                  size={15}
                  strokeWidth={2}
                  aria-hidden="true"
                  style={{ color: 'var(--accent)', flex: 'none' }}
                />
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{title}</span>
              </span>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--ink-2)' }}>
                {body}
              </p>
              {href && (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    marginTop: 'auto',
                    paddingTop: 6,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: 'var(--ink-2)',
                    textDecoration: 'none',
                  }}
                >
                  {cta}
                  <ExternalLink size={12} strokeWidth={2} aria-hidden="true" />
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* What we do with the taxonomy, said plainly: the classification is a
          machine's, and the site is not keeping score. */}
      <section style={{ paddingTop: 22 }} aria-labelledby="agenda-scope">
        <div
          style={{
            border: '1px solid var(--rule)',
            borderLeft: '3px solid var(--accent)',
            borderRadius: 10,
            background: 'var(--paper-2)',
            padding: '13px 16px',
            maxWidth: 860,
          }}
        >
          <div
            id="agenda-scope"
            style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}
          >
            {t('scope_title')}
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--ink-2)' }}>
            {t('scope_body')}
          </p>
        </div>
      </section>

      <section style={{ paddingTop: 30 }} aria-labelledby="agenda-goals">
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            marginBottom: 14,
          }}
        >
          <div className="eyebrow" id="agenda-goals">
            {t('goals_eyebrow')}
          </div>
          <div
            style={{
              display: 'flex',
              gap: 22,
              flexWrap: 'wrap',
              fontSize: 13,
              color: 'var(--ink-2)',
            }}
          >
            <span>
              <span className="eyebrow">{t('stat_iniciatives')}</span>{' '}
              <strong className="tabular" style={{ color: 'var(--ink)' }}>
                {totalIniciatives.toLocaleString(locale)}
              </strong>
            </span>
            <span>
              <span className="eyebrow">{t('stat_sdgs_covered')}</span>{' '}
              <strong className="tabular" style={{ color: 'var(--ink)' }}>
                {covered}
                <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}> / 17</span>
              </strong>
            </span>
          </div>
        </div>

        <ul
          className="sdg-grid"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))',
            gap: 12,
          }}
          aria-label={t('grid_aria')}
        >
          {ordered.map((top) => (
            <SDGCard
              key={top.slug}
              top={top}
              count={countsBySlug.get(top.slug) ?? 0}
              iniciativesLabel={t('count_iniciatives_label')}
              emptyLabel={t('count_empty_label')}
              locale={locale}
            />
          ))}
        </ul>
      </section>

      <p
        style={{
          marginTop: 24,
          fontSize: 12,
          color: 'var(--ink-3)',
          lineHeight: 1.5,
          fontStyle: 'italic',
          maxWidth: 760,
        }}
      >
        {t('attribution')}
      </p>

      <style>{`
        @media (max-width: 640px) {
          .sdg-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }
          .sdg-card {
            min-height: 96px !important;
            padding: 10px 12px 12px !important;
          }
          .sdg-card .sdg-number { font-size: 26px !important; }
          .sdg-card .sdg-title { font-size: 12px !important; line-height: 1.25 !important; }
        }
      `}</style>
    </div>
  );
}

function SDGCard({
  top,
  count,
  iniciativesLabel,
  emptyLabel,
  locale,
}: {
  top: Topic;
  count: number;
  iniciativesLabel: string;
  emptyLabel: string;
  locale: string;
}) {
  const color = top.color_hex ?? '#1a2138';
  const num = top.slug.match(SDG_NUMBER_RE)?.[1] ?? '';
  const Icon = topicIcon(top.icon);
  return (
    <li>
      <Link
        href={`/topics/${top.slug}`}
        className="sdg-card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '14px 16px 16px',
          borderRadius: 14,
          background: color,
          color: '#fff',
          textDecoration: 'none',
          minHeight: 132,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            className="sdg-number tabular"
            aria-hidden="true"
            style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1 }}
          >
            {num}
          </span>
          <span
            aria-hidden="true"
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.85,
            }}
          >
            <Icon size={20} strokeWidth={2.2} aria-hidden="true" />
          </span>
        </div>
        <span
          className="sdg-title serif"
          style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, wordBreak: 'break-word' }}
        >
          {pickTopicName(top, locale)}
        </span>
        <span
          className="tabular"
          style={{
            marginTop: 'auto',
            fontSize: 11,
            opacity: 0.9,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {count > 0 ? `${count} ${iniciativesLabel}` : emptyLabel}
        </span>
      </Link>
    </li>
  );
}
