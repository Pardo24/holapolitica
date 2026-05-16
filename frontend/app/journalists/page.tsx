import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { api } from '@/lib/api';

export const revalidate = 600;

export const metadata: Metadata = {
  title: 'Per a periodistes · Hola Política',
  description:
    'Eines llestes per a redaccions: widgets embedables, cards socials, API REST i datasets ' +
    'oberts del Congrés dels Diputats. Tot sota CC-BY 4.0 amb atribució.',
};

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
  // Live preview ids: pick the most recent vote so the iframe always
  // shows real, fresh content. The group + topic are stable slugs we
  // know will exist in the legislature; we keep them hard-coded so the
  // demo doesn't shift between page loads.
  const latest = await api.votes
    .list({ page: 1, page_size: 1 })
    .catch(() => null);
  const sampleVoteId = latest?.items[0]?.id ?? 1;

  return (
    <article style={{ maxWidth: 880, paddingTop: 24, paddingBottom: 64 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        Per a redaccions
      </div>
      <h1 className="h-headline" style={{ margin: '6px 0 14px' }}>
        Eines llestes per a periodistes
      </h1>
      <p style={{ fontSize: 16, color: 'var(--ink-2)', lineHeight: 1.6, margin: '0 0 28px' }}>
        Quatre maneres d&apos;incorporar el que vota el Congrés en una peça:
        widgets responsius, cards socials, API REST i descàrregues directes.
        Tot CC-BY 4.0 — només cal citar <em>Hola Política</em> i la font
        original (Congreso de los Diputados).
      </p>

      <Section title="Widgets per a articles">
        <p>
          Cada widget és un <code style={inlineCode}>&lt;iframe&gt;</code> de
          menys d&apos;un segon de càrrega, sense cookies de tercers, amb
          enllaç a la font original. Copia el fragment i enganxa&apos;l al
          CMS.
        </p>

        <EmbedExample
          title="Resultat d'una votació"
          description="Totals (Sí · No · Abst. · Absents), barra apilada, propietat institucional + enllaç a la fitxa."
          src={`/embed/votes/${sampleVoteId}`}
          height={320}
          snippet={`<iframe\n  src="https://holapolitica.org/embed/votes/${sampleVoteId}"\n  width="100%" height="320" frameborder="0"\n  loading="lazy"\n  title="Votació al Congrés — Hola Política"\n></iframe>`}
        />

        <EmbedExample
          title="Fitxa de grup parlamentari"
          description="Cohesió mitjana, vots emesos i mida del grup. Mateix patró visual per a totes les forces."
          src="/embed/groups/gp-socialista"
          height={220}
          snippet={`<iframe\n  src="https://holapolitica.org/embed/groups/gp-socialista"\n  width="100%" height="220" frameborder="0"\n  loading="lazy"\n  title="Grup parlamentari — Hola Política"\n></iframe>`}
        />

        <EmbedExample
          title="Tema · distribució d'iniciatives"
          description="Per a un tema concret: quantes iniciatives s'han aprovat, rebutjat o estan en tràmit."
          src="/embed/topics/habitatge"
          height={220}
          snippet={`<iframe\n  src="https://holapolitica.org/embed/topics/<slug>"\n  width="100%" height="220" frameborder="0"\n  loading="lazy"\n  title="Tema — Hola Política"\n></iframe>`}
        />

        <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
          Tots els slugs (grup, tema) i identificadors (vot, persona) són els
          de la nostra base de dades. Pots trobar-los a{' '}
          <Link href={'/votes' as Route} style={{ color: 'var(--accent)' }}>
            /votes
          </Link>
          ,{' '}
          <Link href={'/groups' as Route} style={{ color: 'var(--accent)' }}>
            /groups
          </Link>
          ,{' '}
          <Link href={'/topics' as Route} style={{ color: 'var(--accent)' }}>
            /topics
          </Link>{' '}
          o{' '}
          <Link href={'/persons' as Route} style={{ color: 'var(--accent)' }}>
            /persons
          </Link>
          .
        </p>
      </Section>

      <Section title="Cards socials (Open Graph)">
        <p>
          Cada votació, iniciativa, grup o persona té una imatge OG 1200×630
          que es genera automàticament. Quan compartiu un enllaç de Hola
          Política a Bluesky, X o LinkedIn, la previsualització ja inclou
          el resultat de la votació o la fitxa del diputat — sense haver
          de fer cap muntatge.
        </p>
        <p>
          Si voleu utilitzar la imatge directament com a fitxer (header
          d&apos;article, etc.), aquestes són les URLs estables de la
          convenció Next.js:
        </p>
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

      <Section title="Idees de talls de dades">
        <p>
          Aquestes són rutes obertes que es poden creuar amb facilitat —
          no són «històries», són dades sense interpretació que la
          redacció pot vestir:
        </p>
        <ul style={listStyle}>
          <li>
            <strong>Cohesió mitjana per grup</strong> a la legislatura
            actual i comparació amb anteriors (quan tinguem cobertura
            històrica completa).
          </li>
          <li>
            <strong>Aprovació per tema</strong>: quins blocs temàtics tenen
            més iniciatives aprovades respecte rebutjades. Tots els temes,
            sense rànquings.
          </li>
          <li>
            <strong>Coincidència entre parelles de grups</strong>: matriu
            simètrica completa amb el percentatge de vots on dos grups
            voten igual sentit.
          </li>
          <li>
            <strong>Demografia per grup</strong>: distribució per gènere
            i edat mitjana de membres actius. Totes les forces visibles.
          </li>
          <li>
            <strong>Assistència agregada</strong> per grup i diputat.
            Caveats clars per a càrrecs institucionals (govern, mesa) on
            la mètrica no és comparable amb la resta.
          </li>
        </ul>
      </Section>

      <Section title="API REST i datasets">
        <p>
          L&apos;API està documentada a{' '}
          <Link href={'/apidocs' as Route} style={{ color: 'var(--accent)' }}>
            /apidocs
          </Link>{' '}
          — endpoints REST públics, paginació estable, JSON. Cap clau
          d&apos;API ni registre. Cache de 5 minuts a la capa Vercel + 1
          hora al backend.
        </p>
        <p>
          <strong>Volums alts d&apos;ús</strong> (&gt; 100 req/min sostingudes)
          envieu-nos un correu abans de desplegar res — així us avancem
          quotes i preparem el caché.
        </p>
      </Section>

      <Section title="Llicències">
        <ul style={listStyle}>
          <li>
            <strong>Dades</strong>: CC-BY 4.0. Atribució a{' '}
            <em>Hola Política</em> i la font original (Congreso de los
            Diputados).
          </li>
          <li>
            <strong>Codi font</strong>: EUPL-1.2 — repositori a{' '}
            <ExternalLink href="https://github.com/Pardo24/holapolitica">
              github.com/Pardo24/holapolitica
            </ExternalLink>
            .
          </li>
          <li>
            <strong>Widgets i imatges OG</strong>: lliures d&apos;ús
            editorial amb la mateixa obligació d&apos;atribució.
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
          Contacte editorial
        </div>
        <p style={{ margin: '0 0 12px', color: 'var(--ink-2)', fontSize: 14 }}>
          Si la teva redacció vol un tall específic (per exemple, totes les
          votacions d&apos;un partit en un trimestre, o l&apos;activitat per
          circumscripció), escrivim-vos i ho preparem.
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

function EmbedExample({
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
          Fragment HTML
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
