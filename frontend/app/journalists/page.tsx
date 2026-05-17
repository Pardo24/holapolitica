import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import { api } from '@/lib/api';

export const revalidate = 600;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('journalists');
  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

/**
 * Friendly landing for newsrooms — counterpart to the technical
 * :file:`apidocs/page.tsx`. The audience here is an editor or reporter
 * who needs to drop civic context into a piece, not a developer wiring
 * an integration. The page surfaces the SAME data routes as /apidocs
 * but leads with live embed previews and concrete story angles, not
 * endpoint tables.
 *
 * Neutrality (CLAUDE.md): every example is descriptive ("approval rate
 * by topic", "average attendance"), no editorial framing. We don't
 * suggest "expose the worst performer" — only the data slices a
 * journalist can build a piece on themselves.
 */
export default async function JournalistsPage() {
  const t = await getTranslations('journalists');
  // locale is reserved for future deep-links (e.g. /apidocs?lang=X).
  await getLocale();
  // Live preview ids — pick the most recent vote so the demo always
  // shows fresh content. Group + topic + initiative slugs/ids are
  // stable references we know exist in the XV legislature; hard-coded
  // so the demo doesn't shift between page loads.
  //
  // Initiative 6 = "Proyecto de Ley Orgánica del derecho de defensa"
  // — a real published law with BOE id + entry-into-force date + a
  // final vote. The canonical "complete dossier" example.
  const latest = await api.votes
    .list({ page: 1, page_size: 1 })
    .catch(() => null);
  const sampleVoteId = latest?.items[0]?.id ?? 1;
  const sampleInitiativeId = 6;

  return (
    <article style={{ maxWidth: 880, paddingTop: 24, paddingBottom: 64 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        {t('eyebrow')}
      </div>
      <h1 className="h-headline" style={{ margin: '6px 0 14px' }}>
        {t('h1')}
      </h1>
      <p style={{ fontSize: 16, color: 'var(--ink-2)', lineHeight: 1.6, margin: '0 0 22px' }}>
        {t.rich('intro', {
          em: (chunks) => <em>{chunks}</em>,
        })}
      </p>

      {/* Live-example callout — points the reader at /avui as a real
          composed page using exactly these widgets, so the abstract
          "compose your own piece" claim has a working precedent. */}
      <aside
        style={{
          margin: '0 0 32px',
          padding: '14px 16px',
          background: 'var(--paper-2)',
          border: '1px solid var(--rule-strong)',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: 8,
            background: 'var(--ink)',
            color: 'var(--paper)',
            fontWeight: 700,
            fontSize: 14,
            fontFamily: 'var(--font-serif)',
            flex: 'none',
          }}
        >
          A
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
            {t('live_example_title')}
          </div>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            {t.rich('live_example_body', {
              link: (chunks) => (
                <Link href={'/avui' as Route} style={{ color: 'var(--accent)' }}>
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
        <Link
          href={'/avui' as Route}
          style={{
            display: 'inline-block',
            padding: '8px 14px',
            border: '1px solid var(--ink)',
            borderRadius: 999,
            background: 'var(--paper)',
            color: 'var(--ink)',
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
            flex: 'none',
          }}
        >
          {t('live_example_cta')}
        </Link>
      </aside>

      <Section title={t('widgets_section_title')}>
        <p>
          {t.rich('widgets_intro', {
            code: (chunks) => <code style={inlineCode}>{chunks}</code>,
          })}
        </p>

        {/* Dossier FIRST — Daniel: 'el primer widget sigui Fitxa
            completa d'una llei'. This is the most newsroom-ready
            widget: drop it into an article about ONE law and you're
            done. */}
        <EmbedExample
          title={t('widget_dossier_title')}
          description={t('widget_dossier_desc')}
          src={`/embed/initiatives/${sampleInitiativeId}`}
          height={460}
          snippet={`<iframe\n  src="https://holapolitica.org/embed/initiatives/${sampleInitiativeId}"\n  width="100%" height="460" frameborder="0"\n  loading="lazy"\n  title="${t('iframe_title_dossier')}"\n></iframe>`}
        />

        <EmbedExample
          title={t('widget_explorer_title')}
          description={t('widget_explorer_desc')}
          src="/embed/explorer?topic=habitatge&result=approved&limit=6"
          height={520}
          snippet={`<iframe\n  src="https://holapolitica.org/embed/explorer?topic=habitatge&result=approved&limit=6"\n  width="100%" height="520" frameborder="0"\n  loading="lazy"\n  title="${t('iframe_title_explorer')}"\n></iframe>\n<!-- ${t('explorer_params_comment')} -->`}
        />

        <EmbedExample
          title={t('widget_vote_title')}
          description={t('widget_vote_desc')}
          src={`/embed/votes/${sampleVoteId}`}
          height={400}
          snippet={`<iframe\n  src="https://holapolitica.org/embed/votes/${sampleVoteId}"\n  width="100%" height="400" frameborder="0"\n  loading="lazy"\n  title="${t('iframe_title_vote')}"\n></iframe>`}
        />

        <EmbedExample
          title={t('widget_group_title')}
          description={t('widget_group_desc')}
          src="/embed/groups/gp-socialista"
          height={300}
          snippet={`<iframe\n  src="https://holapolitica.org/embed/groups/gp-socialista"\n  width="100%" height="300" frameborder="0"\n  loading="lazy"\n  title="${t('iframe_title_group')}"\n></iframe>`}
        />

        <EmbedExample
          title={t('widget_topic_title')}
          description={t('widget_topic_desc')}
          src="/embed/topics/habitatge"
          height={220}
          snippet={`<iframe\n  src="https://holapolitica.org/embed/topics/<slug>"\n  width="100%" height="220" frameborder="0"\n  loading="lazy"\n  title="${t('iframe_title_topic')}"\n></iframe>`}
        />

        <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
          {t.rich('ids_explainer', {
            votes: (chunks) => (
              <Link href={'/votes' as Route} style={{ color: 'var(--accent)' }}>
                {chunks}
              </Link>
            ),
            groups: (chunks) => (
              <Link href={'/groups' as Route} style={{ color: 'var(--accent)' }}>
                {chunks}
              </Link>
            ),
            topics: (chunks) => (
              <Link href={'/topics' as Route} style={{ color: 'var(--accent)' }}>
                {chunks}
              </Link>
            ),
            persons: (chunks) => (
              <Link href={'/persons' as Route} style={{ color: 'var(--accent)' }}>
                {chunks}
              </Link>
            ),
            apidocs: (chunks) => (
              <Link href={'/apidocs' as Route} style={{ color: 'var(--accent)' }}>
                {chunks}
              </Link>
            ),
          })}
        </p>
      </Section>

      <Section title={t('og_section_title')}>
        <p>{t('og_intro_1')}</p>
        <p>{t('og_intro_2')}</p>
        <pre style={preStyle}>
{`https://holapolitica.org/opengraph-image
https://holapolitica.org/votes/${sampleVoteId}/opengraph-image
https://holapolitica.org/groups/gp-socialista/opengraph-image
https://holapolitica.org/topics/habitatge/opengraph-image
https://holapolitica.org/persons/<id>/opengraph-image
https://holapolitica.org/initiatives/<id>/opengraph-image
https://holapolitica.org/stats/opengraph-image`}
        </pre>
      </Section>

      <Section title={t('data_ideas_section_title')}>
        <p>{t('data_ideas_intro')}</p>
        <ul style={listStyle}>
          <li>
            {t.rich('data_idea_cohesion', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </li>
          <li>
            {t.rich('data_idea_topic_approval', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </li>
          <li>
            {t.rich('data_idea_coincidence', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </li>
          <li>
            {t.rich('data_idea_demographics', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </li>
          <li>
            {t.rich('data_idea_attendance', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </li>
        </ul>
      </Section>

      <Section title={t('api_section_title')}>
        <p>
          {t.rich('api_intro', {
            apidocs: (chunks) => (
              <Link href={'/apidocs' as Route} style={{ color: 'var(--accent)' }}>
                {chunks}
              </Link>
            ),
          })}
        </p>
        <p>
          {t.rich('api_high_volume', {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      </Section>

      <Section title={t('license_section_title')}>
        <ul style={listStyle}>
          <li>
            {t.rich('license_data', {
              strong: (chunks) => <strong>{chunks}</strong>,
              em: (chunks) => <em>{chunks}</em>,
            })}
          </li>
          <li>
            {t.rich('license_code', {
              strong: (chunks) => <strong>{chunks}</strong>,
              link: (chunks) => (
                <ExternalLink href="https://github.com/Pardo24/holapolitica">
                  {chunks}
                </ExternalLink>
              ),
            })}
          </li>
          <li>
            {t.rich('license_widgets', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </li>
        </ul>
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
          {t('contact_eyebrow')}
        </div>
        <p style={{ margin: '0 0 12px', color: 'var(--ink-2)', fontSize: 14 }}>
          {t('contact_body')}
        </p>
        <a
          href="mailto:daniel@holapolitica.org"
          className="btn-ink"
          style={{ display: 'inline-block' }}
        >
          daniel@holapolitica.org
        </a>
      </div>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ paddingTop: 28, paddingBottom: 8 }}>
      <h2
        style={{
          fontSize: 19,
          fontWeight: 700,
          margin: '0 0 12px',
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

async function EmbedExample({
  title,
  description,
  src,
  height,
  snippet,
}: {
  title: string;
  description: string;
  src: string;
  height: number;
  snippet: string;
}) {
  const t = await getTranslations('journalists');
  const snippetSummary = t('snippet_summary');
  return (
    <div
      style={{
        margin: '14px 0 22px',
        padding: 14,
        border: '1px solid var(--rule)',
        borderRadius: 12,
        background: 'var(--paper-2)',
      }}
    >
      <div
        style={{
          fontWeight: 600,
          fontSize: 14,
          color: 'var(--ink)',
          marginBottom: 2,
        }}
      >
        {title}
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink-3)' }}>
        {description}
      </p>
      <iframe
        src={src}
        title={title}
        width="100%"
        height={height}
        loading="lazy"
        style={{
          border: '1px solid var(--rule)',
          borderRadius: 8,
          background: 'var(--paper)',
          display: 'block',
        }}
      />
      <details style={{ marginTop: 10 }}>
        <summary
          style={{
            cursor: 'pointer',
            fontSize: 12,
            color: 'var(--ink-3)',
            padding: '4px 0',
          }}
        >
          {snippetSummary}
        </summary>
        <pre style={preStyle}>{snippet}</pre>
      </details>
    </div>
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
  padding: 12,
  fontSize: 12,
  overflowX: 'auto',
  lineHeight: 1.5,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  margin: '8px 0 0',
};
