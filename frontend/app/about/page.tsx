import { getTranslations, getMessages } from 'next-intl/server';

import { LifecycleDiagram } from '@/components/LifecycleDiagram';
import { NewsletterSignup } from '@/components/NewsletterSignup';

interface GlossaryTerm {
  term: string;
  definition: string;
}

// Base URL of the public backend. Surfaced to the browser via the
// standard NEXT_PUBLIC_API_URL env, with a localhost fallback for dev
// builds where the env isn't wired. The API section embeds this in the
// curl examples so the reader can copy/paste against the real host.
const PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export default async function AboutPage() {
  const t = await getTranslations('about');
  // Glossary lives in the messages file as a typed array — getTranslations
  // returns strings, so we read the raw messages object for the array.
  const messages = (await getMessages()) as Record<string, unknown>;
  const aboutMessages = (messages.about ?? {}) as Record<string, unknown>;
  const glossary: GlossaryTerm[] = Array.isArray(aboutMessages.glossary_terms)
    ? (aboutMessages.glossary_terms as GlossaryTerm[])
    : [];
  return (
    <article style={{ paddingTop: 28, maxWidth: 760 }}>
      <div className="eyebrow">{t('page_eyebrow')}</div>
      <h1 className="h-headline" style={{ margin: '4px 0 28px' }}>
        {t('title')}
      </h1>

      <Section title={t('why_title')} accent>{t('why_body')}</Section>
      <Section title={t('mission_title')}>{t('mission_body')}</Section>
      <Section title={t('principle_title')} accent>{t('principle_body')}</Section>

      {/* Public API section — documented surface + bulk dumps. */}
      <ApiSection
        baseUrl={PUBLIC_API_URL}
        title={t('api_title')}
        intro={t('api_intro')}
        docsLabel={t('api_docs_label')}
        redocLabel={t('api_redoc_label')}
        openapiLabel={t('api_openapi_label')}
        dumpTitle={t('api_dump_title')}
        dumpIntro={t('api_dump_intro')}
        dumpDeputies={t('api_dump_deputies')}
        dumpVotes={t('api_dump_votes')}
        dumpVoteRecords={t('api_dump_vote_records')}
        dumpInitiatives={t('api_dump_initiatives')}
        rateLimitTitle={t('api_rate_limit_title')}
        rateLimitBody={t('api_rate_limit_body')}
      />

      <h2 className="h-title" style={{ marginTop: 32, marginBottom: 8 }}>
        {t('coverage_title')}
      </h2>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          borderTop: '1px solid var(--ink)',
        }}
      >
        {[t('coverage_phase1'), t('coverage_phase2'), t('coverage_phase3')].map((line, i) => (
          <li
            key={i}
            style={{
              padding: '12px 0',
              borderBottom: '1px solid var(--rule)',
              fontSize: 14,
              color: 'var(--ink-2)',
            }}
          >
            {line}
          </li>
        ))}
      </ul>

      {/* Lifecycle diagram: educational static infographic of how a
          legislative initiative travels through the Spanish Congress.
          Sits next to the glossary because both are reference material —
          the glossary defines terms, the diagram defines the process. */}
      <LifecycleDiagram />

      <h2 className="h-title" style={{ marginTop: 32, marginBottom: 8 }}>
        {t('glossary_title')}
      </h2>
      <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 0, marginBottom: 12 }}>
        {t('glossary_intro')}
      </p>
      <dl style={{ borderTop: '1px solid var(--ink)', margin: 0 }}>
        {glossary.map((g) => (
          <div
            key={g.term}
            style={{
              padding: '14px 0',
              borderBottom: '1px solid var(--rule)',
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 200px) 1fr',
              gap: 18,
              alignItems: 'baseline',
            }}
            className="glossary-row"
          >
            <dt style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 14 }}>
              {g.term}
            </dt>
            <dd style={{ margin: 0, color: 'var(--ink-2)', fontSize: 14, lineHeight: 1.5 }}>
              {g.definition}
            </dd>
          </div>
        ))}
      </dl>

      <Section title={t('licence_title')}>{t('licence_body')}</Section>

      {/* Newsletter signup — closing CTA on the about page. Visitors
          who reach this section are the ones most likely to want
          weekly updates. */}
      <NewsletterSignup />
    </article>
  );
}

function Section({
  title,
  children,
  accent,
}: {
  title: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <section
      style={{
        marginTop: 24,
        padding: accent ? '20px 24px' : 0,
        background: accent ? 'var(--paper-2)' : 'transparent',
        borderLeft: accent ? '3px solid var(--accent)' : 'none',
      }}
    >
      <h2 className="h-title" style={{ marginTop: 0, marginBottom: 8 }}>
        {title}
      </h2>
      <p style={{ color: 'var(--ink-2)', fontSize: 15, lineHeight: 1.6, margin: 0 }}>
        {children}
      </p>
    </section>
  );
}

interface ApiSectionProps {
  baseUrl: string;
  title: string;
  intro: string;
  docsLabel: string;
  redocLabel: string;
  openapiLabel: string;
  dumpTitle: string;
  dumpIntro: string;
  dumpDeputies: string;
  dumpVotes: string;
  dumpVoteRecords: string;
  dumpInitiatives: string;
  rateLimitTitle: string;
  rateLimitBody: string;
}

/**
 * Renders the "Public API" section on the About page.
 *
 * Three sub-blocks:
 *  1. Three documented entry points (Swagger UI, ReDoc, OpenAPI JSON)
 *     linked directly to the live backend.
 *  2. The four bulk JSON dump endpoints, each with a sample curl call
 *     so journalists / researchers can copy and run them as-is.
 *  3. A short "be reasonable, contact us for bulk" rate-limit note.
 */
function ApiSection({
  baseUrl,
  title,
  intro,
  docsLabel,
  redocLabel,
  openapiLabel,
  dumpTitle,
  dumpIntro,
  dumpDeputies,
  dumpVotes,
  dumpVoteRecords,
  dumpInitiatives,
  rateLimitTitle,
  rateLimitBody,
}: ApiSectionProps) {
  const dumps: { path: string; label: string; curl: string }[] = [
    {
      path: '/dump/deputies?legislature_id=1',
      label: dumpDeputies,
      curl: `curl '${baseUrl}/dump/deputies?legislature_id=1'`,
    },
    {
      path: '/dump/votes?legislature_id=1&from=2024-01-01&to=2024-12-31',
      label: dumpVotes,
      curl: `curl '${baseUrl}/dump/votes?legislature_id=1&from=2024-01-01&to=2024-12-31'`,
    },
    {
      path: '/dump/vote-records?vote_id=42',
      label: dumpVoteRecords,
      curl: `curl '${baseUrl}/dump/vote-records?vote_id=42'`,
    },
    {
      path: '/dump/initiatives?legislature_id=1',
      label: dumpInitiatives,
      curl: `curl '${baseUrl}/dump/initiatives?legislature_id=1'`,
    },
  ];

  return (
    <section style={{ marginTop: 32 }}>
      <h2 className="h-title" style={{ marginTop: 0, marginBottom: 8 }}>
        {title}
      </h2>
      <p
        style={{
          color: 'var(--ink-2)',
          fontSize: 15,
          lineHeight: 1.6,
          margin: '0 0 14px',
        }}
      >
        {intro}
      </p>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        <ApiLink href={`${baseUrl}/docs`} path="/docs" label={docsLabel} />
        <ApiLink href={`${baseUrl}/redoc`} path="/redoc" label={redocLabel} />
        <ApiLink
          href={`${baseUrl}/openapi.json`}
          path="/openapi.json"
          label={openapiLabel}
        />
      </ul>

      <h3
        className="h-title"
        style={{ marginTop: 22, marginBottom: 6, fontSize: 16 }}
      >
        {dumpTitle}
      </h3>
      <p
        style={{
          color: 'var(--ink-2)',
          fontSize: 14,
          lineHeight: 1.6,
          margin: '0 0 10px',
        }}
      >
        {dumpIntro}
      </p>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {dumps.map((d) => (
          <li
            key={d.path}
            style={{
              padding: '10px 0',
              borderBottom: '1px solid var(--rule)',
            }}
          >
            <code
              style={{
                fontSize: 13,
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, monospace',
                color: 'var(--ink)',
              }}
            >
              GET {d.path}
            </code>
            <div
              style={{
                color: 'var(--ink-2)',
                fontSize: 13,
                lineHeight: 1.5,
                marginTop: 3,
              }}
            >
              {d.label}
            </div>
            <pre
              style={{
                margin: '6px 0 0',
                padding: '8px 10px',
                background: 'var(--paper-2)',
                borderRadius: 4,
                fontSize: 12,
                lineHeight: 1.4,
                overflowX: 'auto',
                color: 'var(--ink)',
              }}
            >
              {d.curl}
            </pre>
          </li>
        ))}
      </ul>

      <h3
        className="h-title"
        style={{ marginTop: 22, marginBottom: 6, fontSize: 16 }}
      >
        {rateLimitTitle}
      </h3>
      <p style={{ color: 'var(--ink-2)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
        {rateLimitBody}
      </p>
    </section>
  );
}

function ApiLink({
  href,
  path,
  label,
}: {
  href: string;
  path: string;
  label: string;
}) {
  return (
    <li
      style={{
        padding: '8px 0',
        borderBottom: '1px solid var(--rule)',
        display: 'flex',
        gap: 12,
        alignItems: 'baseline',
        flexWrap: 'wrap',
      }}
    >
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          fontSize: 13,
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, monospace',
          color: 'var(--accent)',
          textDecoration: 'none',
        }}
      >
        GET {path}
      </a>
      <span style={{ color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.5 }}>
        {label}
      </span>
    </li>
  );
}
