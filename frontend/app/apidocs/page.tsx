import '@/app/styles/apidocs-52e082.css';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from '@/components/icons';
import { getTranslations } from 'next-intl/server';

import { ApiKeyForm } from '@/components/ApiKeyForm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('apidocs');
  return { title: t('meta_title'), description: t('meta_description') };
}

const ENDPOINTS: [path: string, key: string][] = [
  ['GET /votes', 'ep_votes'],
  ['GET /votes/{id}', 'ep_vote'],
  ['GET /initiatives/{id}', 'ep_initiative'],
  ['GET /topics', 'ep_topics'],
  ['GET /topics/{slug}', 'ep_topic'],
  ['GET /topics/{slug}/initiatives', 'ep_topic_initiatives'],
  ['GET /groups', 'ep_groups'],
  ['GET /groups/{slug}', 'ep_group'],
  ['GET /groups/{slug}/members', 'ep_group_members'],
  ['GET /groups/{slug}/composition', 'ep_group_composition'],
  ['GET /persons', 'ep_persons'],
  ['GET /persons/{id}', 'ep_person'],
  ['GET /persons/{id}/kpis', 'ep_person_kpis'],
  ['GET /stats/summary', 'ep_stats'],
  ['GET /metrics/cohesion?vote_id=N', 'ep_cohesion'],
  ['GET /metrics/coincidence?legislature_id=N', 'ep_coincidence'],
  ['GET /metrics/attendance?legislature_id=N', 'ep_attendance'],
  ['GET /metrics/dissidence?legislature_id=N', 'ep_dissidence'],
];

const EMBEDS: [path: string, key: string, height: string][] = [
  ['/embed/llei/{id}', 'emb_law', '620px'],
  ['/embed/ple/{data|darrer}', 'emb_plenary', '560px'],
  ['/embed/diputats/{província}', 'emb_deputies', '760px'],
  ['/embed/votes/{id}', 'emb_vote', '320px'],
  ['/embed/groups/{slug}', 'emb_group', '220px'],
  ['/embed/topics/{slug}', 'emb_topic', '220px'],
  ['/embed/persons/{id}', 'emb_person', '220px'],
];

const DICTIONARY = [
  'd_result',
  'd_gov',
  'd_expediente',
  'd_type',
  'd_cohesion',
  'd_coincidence',
  'd_attendance',
  'd_dissidence',
];

/**
 * Hub de documentació tècnica per a la reutilització de dades.
 *
 * No fem aquí explicació editorial (la fa /about/data). Aquí donem el
 * material que una redacció o un desenvolupador necessita per
 * incrustar el contingut: URLs, paràmetres, exemples curl, fragments
 * d'iframe. Els camps tècnics (rutes, queries) queden en anglès per
 * convenció; la resta es tradueix (missatges ``apidocs``).
 */
export default async function ApiDocsPage() {
  const t = await getTranslations('apidocs');
  const tags = {
    b: (chunks: React.ReactNode) => <strong>{chunks}</strong>,
    em: (chunks: React.ReactNode) => <em>{chunks}</em>,
    c: (chunks: React.ReactNode) => <code style={inlineCode}>{chunks}</code>,
  };
  const withLink = (href: string) => ({
    ...tags,
    link: (chunks: React.ReactNode) => <ExternalLink href={href}>{chunks}</ExternalLink>,
  });

  return (
    <article style={{ maxWidth: 820, paddingTop: 24, paddingBottom: 64 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        {t('eyebrow')}
      </div>
      <h1 className="h-headline" style={{ margin: '6px 0 14px' }}>
        {t('meta_title')}
      </h1>
      <p style={{ fontSize: 16, color: 'var(--ink-2)', lineHeight: 1.6, margin: '0 0 28px' }}>
        {t('lede')}{' '}
        <Link href={'/about/data' as Route} style={{ color: 'var(--accent)' }}>
          {t('methodology_link')}
        </Link>
      </p>

      <Section title={t('rest_title')}>
        <p>
          {t.rich('rest_intro', {
            ...tags,
            keys: (chunks) => (
              <a href="#clau" style={{ color: 'var(--accent)' }}>
                {chunks}
              </a>
            ),
          })}
        </p>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>{t('th_endpoint')}</th>
              <th style={thStyle}>{t('th_description')}</th>
            </tr>
          </thead>
          <tbody>
            {ENDPOINTS.map(([path, key]) => (
              <Row key={path} path={path} desc={t(key)} />
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: 14 }}>{t.rich('curl_example', tags)}</p>
        <pre style={preStyle}>
{`curl -s "https://api.holapolitica.org/votes?proposing_group_slug=psoe&page_size=5" \\
  | jq '.items[] | {id, title, voted_at, result}'`}
        </pre>
        <p style={{ marginTop: 8, fontSize: 13, color: 'var(--ink-3)' }}>
          {t.rich('stability', withLink('https://github.com/Pardo24/holapolitica/blob/main/CHANGELOG.md'))}
        </p>
      </Section>

      <section id="clau" style={{ scrollMarginTop: 80 }}>
        <Section title={t('dump_title')}>
          <p>{t.rich('dump_intro', tags)}</p>
          <ApiKeyForm />
          <pre style={{ ...preStyle, marginTop: 14 }}>
{`curl -s -H "X-API-Key: hp_…" "https://api.holapolitica.org/dump/votes"`}
          </pre>
        </Section>
      </section>

      <Section title={t('widgets_title')}>
        <p>
          {t.rich('widgets_intro', {
            // The message wraps just the word; the angle brackets go here so
            // the message syntax doesn't read <iframe> as a tag of its own.
            tag: (chunks) => <code style={inlineCode}>&lt;{chunks}&gt;</code>,
          })}
        </p>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>{t('th_route')}</th>
              <th style={thStyle}>{t('th_shows')}</th>
              <th style={thStyle}>{t('th_height')}</th>
            </tr>
          </thead>
          <tbody>
            {EMBEDS.map(([path, key, h]) => (
              <RowEmbed key={path} path={path} desc={t(key)} h={h} />
            ))}
            <RowEmbed
              path="/votes/{id}/opengraph-image"
              desc={t('emb_og', {
                paths: '/groups/{slug}, /topics/{slug}, /persons/{id}, /initiatives/{id}, /stats',
              })}
              h="-"
            />
          </tbody>
        </table>
        <p style={{ marginTop: 14 }}>
          <strong>{t('iframe_example')}</strong>:
        </p>
        <pre style={preStyle}>
{`<iframe
  src="https://www.holapolitica.org/embed/votes/12345"
  width="100%" height="320" frameborder="0"
  sandbox="allow-scripts allow-same-origin"
  loading="lazy"
  title="${t('iframe_title')}"
></iframe>`}
        </pre>
        <p style={{ marginTop: 8, fontSize: 13, color: 'var(--ink-3)' }}>
          {t.rich('sandbox_note', tags)}
        </p>
      </Section>

      <Section title={t('dict_title')}>
        <p>
          {t.rich(
            'dict_intro',
            withLink('https://github.com/Pardo24/holapolitica/blob/main/backend/app/models/__init__.py'),
          )}
        </p>
        <ul style={listStyle}>
          {DICTIONARY.map((key) => (
            <li key={key}>{t.rich(key, tags)}</li>
          ))}
        </ul>
      </Section>

      <Section title={t('lic_title')}>
        <ul style={listStyle}>
          <li>{t.rich('lic_data', tags)}</li>
          <li>{t.rich('lic_code', withLink('https://github.com/Pardo24/holapolitica'))}</li>
          <li>{t.rich('lic_widgets', tags)}</li>
        </ul>
        <p style={{ marginTop: 12 }}>
          {t('contact')}:{' '}
          <a href="mailto:dades@holapolitica.org" style={{ color: 'var(--accent)' }}>
            dades@holapolitica.org
          </a>
          .
        </p>
      </Section>

      <div
        style={{
          marginTop: 40,
          padding: 18,
          background: 'var(--paper-2)',
          border: '1px solid var(--rule-strong)',
          borderRadius: 12,
        }}
      >
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          {t('cta_eyebrow')}
        </div>
        <p style={{ margin: '0 0 12px', color: 'var(--ink-2)', fontSize: 14 }}>{t('cta_body')}</p>
        <ExternalLink href="https://github.com/Pardo24/holapolitica/issues/new">{t('cta_button')}</ExternalLink>
      </div>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ paddingTop: 24, paddingBottom: 8 }}>
      <h2
        style={{
          fontSize: 18,
          fontWeight: 700,
          margin: '0 0 10px',
          color: 'var(--ink)',
        }}
      >
        {title}
      </h2>
      <div style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.65 }}>
        {children}
      </div>
    </section>
  );
}

function Row({ path, desc }: { path: string; desc: string }) {
  return (
    <tr>
      <td style={tdStyle}>
        <code style={inlineCode}>{path}</code>
      </td>
      <td style={tdStyle}>{desc}</td>
    </tr>
  );
}

function RowEmbed({ path, desc, h }: { path: string; desc: string; h: string }) {
  return (
    <tr>
      <td style={tdStyle}>
        <code style={inlineCode}>{path}</code>
      </td>
      <td style={tdStyle}>{desc}</td>
      <td style={{ ...tdStyle, color: 'var(--ink-3)' }} className="tabular">
        {h}
      </td>
    </tr>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: 'var(--accent)',
        textDecoration: 'underline',
        textDecorationColor: 'var(--accent-soft)',
        textUnderlineOffset: 3,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {children}
      <ArrowUpRight size={12} aria-hidden />
    </a>
  );
}

const listStyle: React.CSSProperties = {
  margin: '8px 0 16px',
  paddingLeft: 22,
  lineHeight: 1.7,
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: 12,
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px 8px 0',
  borderBottom: '1px solid var(--rule-strong)',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--ink-3)',
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: '10px 10px 10px 0',
  verticalAlign: 'top',
  borderBottom: '1px solid var(--rule)',
};

const inlineCode: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '0.92em',
  background: 'var(--paper-2)',
  padding: '1px 5px',
  borderRadius: 4,
  border: '1px solid var(--rule)',
};

const preStyle: React.CSSProperties = {
  background: 'var(--paper-3)',
  border: '1px solid var(--rule-strong)',
  borderRadius: 6,
  padding: 14,
  fontSize: 12,
  overflowX: 'auto',
  lineHeight: 1.5,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  margin: '8px 0',
};
