import type { Route } from 'next';
import Link from 'next/link';
import { getMessages, getTranslations } from 'next-intl/server';
import { ArrowRight, Info } from 'lucide-react';

import { LifecycleDiagram } from '@/components/LifecycleDiagram';
import { NewsletterSignup } from '@/components/NewsletterSignup';
import { PageHeader } from '@/components/PageHeader';
import { PageToc } from '@/components/PageToc';

/**
 * About: what this is, how it works, and the reference material.
 *
 * It was one column of sections run together, with nothing to tell you
 * where you were or what came next, and on a phone it was a long wall.
 * Now every section has an id and a place in the index (a sticky column
 * beside the text on a desktop, a sticky chip row on a phone), so the
 * rest of the site can send a reader straight to the part that answers
 * their question: the "made with AI" label to #ia, a parliamentary term
 * to #glossari, "how it works" to #que-es.
 *
 * Those ids are links from elsewhere; keep them stable.
 */

interface GlossaryTerm {
  term: string;
  definition: string;
}

// Base URL of the public backend, for the copy-paste curl examples.
const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export default async function AboutPage() {
  const t = await getTranslations('about');
  const messages = (await getMessages()) as Record<string, unknown>;
  const aboutMessages = (messages.about ?? {}) as Record<string, unknown>;
  const glossary: GlossaryTerm[] = Array.isArray(aboutMessages.glossary_terms)
    ? (aboutMessages.glossary_terms as GlossaryTerm[])
    : [];

  const toc = [
    { id: 'per-que', label: t('toc_why') },
    { id: 'que-es', label: t('toc_mission') },
    { id: 'principi', label: t('toc_principle') },
    { id: 'ia', label: t('toc_ai') },
    { id: 'dades', label: t('toc_sources') },
    { id: 'recorregut', label: t('toc_lifecycle') },
    { id: 'glossari', label: t('toc_glossary') },
    { id: 'cobertura', label: t('toc_coverage') },
    { id: 'api', label: t('toc_api') },
    { id: 'llicencia', label: t('toc_licence') },
  ];

  const dumps = [
    { path: '/dump/deputies?legislature_id=1', label: t('api_dump_deputies') },
    { path: '/dump/votes?legislature_id=1&from=2024-01-01&to=2024-12-31', label: t('api_dump_votes') },
    { path: '/dump/vote-records?vote_id=42', label: t('api_dump_vote_records') },
    { path: '/dump/initiatives?legislature_id=1', label: t('api_dump_initiatives') },
  ];

  return (
    <article className="about">
      <PageHeader
        title={t('title')}
        subtitle={t('page_eyebrow')}
        icon={<Info size={20} strokeWidth={1.8} aria-hidden="true" />}
      />

      <div className="about-grid">
        <PageToc items={toc} title={t('toc_title')} />

        <div className="about-body">
          <Section id="per-que" n={1} title={t('why_title')} lead>
            <p>{t('why_body')}</p>
          </Section>

          <Section id="que-es" n={2} title={t('mission_title')}>
            <p>{t('mission_body')}</p>
          </Section>

          <Section id="principi" n={3} title={t('principle_title')} lead>
            <p>{t('principle_body')}</p>
          </Section>

          <Section id="ia" n={4} title={t('ai_title')}>
            <p>{t('ai_intro')}</p>
            <ul className="about-points">
              <li>{t('ai_point_summary')}</li>
              <li>{t('ai_point_topics')}</li>
              <li>{t('ai_point_audience')}</li>
              <li>{t('ai_point_text')}</li>
            </ul>
            <p>{t('ai_marked')}</p>
            <p className="about-callout">{t('ai_not_votes')}</p>
          </Section>

          <Section id="dades" n={5} title={t('sources_title')}>
            <p>{t('sources_body')}</p>
            <p>{t('sources_untouched')}</p>
            <Link href={'/about/data' as Route} className="about-more">
              {t('sources_legal_link')} <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </Section>

          {/* The diagram carries its own heading. */}
          <div id="recorregut" className="about-section about-section--embed">
            <LifecycleDiagram />
            <Link href={'/recorregut' as Route} className="about-more">
              {t('lifecycle_more')} <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>

          <Section id="glossari" n={7} title={t('glossary_title')}>
            <p>{t('glossary_intro')}</p>
            <dl className="about-glossary">
              {glossary.map((g) => (
                <div key={g.term}>
                  <dt>{g.term}</dt>
                  <dd>{g.definition}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section id="cobertura" n={8} title={t('coverage_title')}>
            <ul className="about-coverage">
              {[t('coverage_phase1'), t('coverage_phase2'), t('coverage_phase3')].map((line, i) => (
                <li key={line} data-live={i === 0 ? 'true' : undefined}>
                  <span aria-hidden="true" />
                  {line}
                </li>
              ))}
            </ul>
          </Section>

          <Section id="api" n={9} title={t('api_title')}>
            <p>{t('api_intro')}</p>
            <ul className="about-api-links">
              {[
                { path: '/docs', label: t('api_docs_label') },
                { path: '/redoc', label: t('api_redoc_label') },
                { path: '/openapi.json', label: t('api_openapi_label') },
              ].map((l) => (
                <li key={l.path}>
                  <a href={`${PUBLIC_API_URL}${l.path}`} target="_blank" rel="noopener noreferrer">
                    <code>GET {l.path}</code>
                    <span>{l.label}</span>
                  </a>
                </li>
              ))}
            </ul>
            <h3>{t('api_dump_title')}</h3>
            <p>{t('api_dump_intro')}</p>
            <ul className="about-dumps">
              {dumps.map((d) => (
                <li key={d.path}>
                  <p>{d.label}</p>
                  <pre>{`curl '${PUBLIC_API_URL}${d.path}'`}</pre>
                </li>
              ))}
            </ul>
            <h3>{t('api_rate_limit_title')}</h3>
            <p>{t('api_rate_limit_body')}</p>
          </Section>

          <Section id="llicencia" n={10} title={t('licence_title')}>
            <p>{t('licence_body')}</p>
          </Section>

          <div className="about-section">
            <NewsletterSignup />
          </div>
        </div>
      </div>
    </article>
  );
}

function Section({
  id,
  n,
  title,
  lead,
  children,
}: {
  id: string;
  n: number;
  title: string;
  /** A tinted panel, for the three paragraphs that say what this is. */
  lead?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={lead ? 'about-section about-section--lead' : 'about-section'}>
      <span className="about-section__n tabular" aria-hidden="true">
        {String(n).padStart(2, '0')}
      </span>
      <h2>{title}</h2>
      <div className="about-section__body">{children}</div>
    </section>
  );
}
