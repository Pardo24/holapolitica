import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'API i widgets · Hola Política',
  description:
    'Documentació pràctica per a periodistes i desenvolupadors: endpoints REST públics, ' +
    'widgets embedables, llicències, exemples copy-paste. Tot CC-BY 4.0.',
};

/**
 * Hub de documentació tècnica per a la reutilització de dades.
 *
 * No fem aquí explicació editorial (la fa /about/data). Aquí donem el
 * material que una redacció o un desenvolupador necessita per
 * incrustar el contingut: URLs, paràmetres, exemples curl, fragments
 * d'iframe. Text en català perquè és l'audiència principal del
 * projecte; els camps tècnics (rutes, queries) són anglès per
 * convenció.
 */
export default function ApiDocsPage() {
  return (
    <article style={{ maxWidth: 820, paddingTop: 24, paddingBottom: 64 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        Per a periodistes i desenvolupadors
      </div>
      <h1 className="h-headline" style={{ margin: '6px 0 14px' }}>
        API i widgets
      </h1>
      <p style={{ fontSize: 16, color: 'var(--ink-2)', lineHeight: 1.6, margin: '0 0 28px' }}>
        Tot el contingut de Hola Política és open data sota llicència CC-BY 4.0. Pots
        consumir l&apos;API REST directament, incrustar widgets a la teva web o
        descarregar fitxers de tota la legislatura.{' '}
        <Link href={'/about/data' as Route} style={{ color: 'var(--accent)' }}>
          Veure metodologia →
        </Link>
      </p>

      <Section title="API REST pública">
        <p>
          L&apos;API està hostatjada a{' '}
          <code style={inlineCode}>https://api.holapolitica.org</code>. No requereix
          autenticació; les peticions són respostes JSON amb caché de 5 minuts. Si
          esperes fer més de 100 peticions per minut, contacta&apos;ns abans de
          desplegar res.
        </p>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Endpoint</th>
              <th style={thStyle}>Descripció</th>
            </tr>
          </thead>
          <tbody>
            <Row path="GET /votes" desc="Llistat paginat de votacions. Filtres: chamber_id, legislature_id, topic_slug, proposing_group_slug, result, date_from, date_to, q." />
            <Row path="GET /votes/{id}" desc="Detall d'una votació individual: totals (sí, no, abst., absent), descripció, expedient, proposant, resum planer." />
            <Row path="GET /initiatives/{id}" desc="Iniciativa parlamentària: títol original, situació, vots associats, temes." />
            <Row path="GET /topics" desc="Taxonomia tancada de temes (17 editorials + 17 ODS). Paràmetre opcional kind=theme|sdg." />
            <Row path="GET /topics/{slug}" desc="Detall del tema amb nom multilingüe i descripció." />
            <Row path="GET /topics/{slug}/initiatives" desc="Iniciatives classificades sota un tema. Filtres: legislature_id, status." />
            <Row path="GET /groups" desc="Grups parlamentaris actius. Filtre legislature_id." />
            <Row path="GET /groups/{slug}" desc="Detall d'un grup parlamentari." />
            <Row path="GET /groups/{slug}/members" desc="Diputats actius del grup amb dates de pertinença." />
            <Row path="GET /groups/{slug}/composition" desc="Distribució per gènere, edat i partit electoral." />
            <Row path="GET /persons" desc="Llistat paginat de diputats. Filtres: q, legislature_id." />
            <Row path="GET /persons/{id}" desc="Fitxa pública del diputat (mai dades privades)." />
            <Row path="GET /persons/{id}/kpis" desc="Indicadors agregats: assistència, dissidència, vots emesos." />
            <Row path="GET /stats/summary" desc="Comptadors globals (iniciatives, votacions, classificades)." />
            <Row path="GET /metrics/cohesion?vote_id=N" desc="Cohesió per grup en una votació concreta." />
            <Row path="GET /metrics/coincidence?legislature_id=N" desc="Matriu completa de coincidència entre parelles de grups." />
            <Row path="GET /metrics/attendance?legislature_id=N" desc="Assistència per diputat al període sol·licitat." />
            <Row path="GET /metrics/dissidence?legislature_id=N" desc="Dissidència individual respecte a la línia del grup." />
          </tbody>
        </table>
        <p style={{ marginTop: 14 }}>
          <strong>Exemple amb curl</strong> — última pàgina de votacions del PSOE:
        </p>
        <pre style={preStyle}>
{`curl -s "https://api.holapolitica.org/votes?proposing_group_slug=psoe&page_size=5" \\
  | jq '.items[] | {id, title, voted_at, result}'`}
        </pre>
        <p style={{ marginTop: 8, fontSize: 13, color: 'var(--ink-3)' }}>
          Les rutes són estables; canvis de signatura es comuniquen amb mes
          d&apos;antelació al{' '}
          <ExternalLink href="https://github.com/Pardo24/holapolitica/blob/main/CHANGELOG.md">
            CHANGELOG
          </ExternalLink>
          .
        </p>
      </Section>

      <Section title="Widgets embedables">
        <p>
          Cinc widgets pensats per a articles de premsa: incrusta&apos;ls amb un{' '}
          <code style={inlineCode}>&lt;iframe&gt;</code> sense scripts ni cookies
          de tercers. Cap tracker, càrrega &lt;1s, contingut només factual amb
          atribució a Hola Política i enllaç a la font.
        </p>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Ruta</th>
              <th style={thStyle}>Què mostra</th>
              <th style={thStyle}>Alçada</th>
            </tr>
          </thead>
          <tbody>
            <RowEmbed path="/embed/votes/{id}" desc="Resultat d'una votació: totals, qui ho proposa, barra apilada." h="320px" />
            <RowEmbed path="/embed/groups/{slug}" desc="Cohesió mitjana, assistència mitjana, mida del grup." h="220px" />
            <RowEmbed path="/embed/topics/{slug}" desc="Distribució d'iniciatives sobre el tema (aprovades, rebutjades, en tràmit)." h="220px" />
            <RowEmbed path="/embed/persons/{id}" desc="Fitxa breu del diputat: foto, grup, KPIs (assistència, dissidència)." h="220px" />
            <RowEmbed path="/api/og/vote/{id}" desc="Imatge social 1200×630 (PNG) per a Open Graph / Twitter." h="—" />
          </tbody>
        </table>
        <p style={{ marginTop: 14 }}>
          <strong>Exemple d&apos;iframe</strong>:
        </p>
        <pre style={preStyle}>
{`<iframe
  src="https://holapolitica.org/embed/votes/12345"
  width="100%" height="320" frameborder="0"
  sandbox="allow-scripts allow-same-origin"
  loading="lazy"
  title="Votació al Congrés — Hola Política"
></iframe>`}
        </pre>
        <p style={{ marginTop: 8, fontSize: 13, color: 'var(--ink-3)' }}>
          El sandbox és recomanat però opcional. Si t&apos;omple massa l&apos;alçada,
          ajusta l&apos;atribut <code style={inlineCode}>height</code> — el
          contingut és responsive.
        </p>
      </Section>

      <Section title="Diccionari de dades essencial">
        <p>
          Els camps més consultats. La definició completa és al codi font (
          <ExternalLink href="https://github.com/Pardo24/holapolitica/blob/main/backend/app/models/__init__.py">
            models/__init__.py
          </ExternalLink>
          ).
        </p>
        <ul style={listStyle}>
          <li>
            <strong>vote.result</strong>: <code style={inlineCode}>approved</code> |{' '}
            <code style={inlineCode}>rejected</code> |{' '}
            <code style={inlineCode}>tie</code>. Empat només quan els sí igualen els
            no exactament.
          </li>
          <li>
            <strong>vote.proposed_by_government</strong>: booleà. Quan és{' '}
            <code style={inlineCode}>true</code>, el camp{' '}
            <code style={inlineCode}>proposing_group_slug</code> sol ser{' '}
            <code style={inlineCode}>null</code>: el govern proposa, no un grup.
          </li>
          <li>
            <strong>vote.expediente_raw</strong>: codi oficial del Congrés (p.ex.{' '}
            <code style={inlineCode}>122/000262</code>) — clau per cercar a la font
            original.
          </li>
          <li>
            <strong>initiative.type</strong>: enum amb{' '}
            <code style={inlineCode}>proyecto_ley</code>,{' '}
            <code style={inlineCode}>proposicion_ley</code>,{' '}
            <code style={inlineCode}>proposicion_no_ley</code>,{' '}
            <code style={inlineCode}>real_decreto_ley</code>,{' '}
            <code style={inlineCode}>mocion</code>,{' '}
            <code style={inlineCode}>interpelacion</code>,{' '}
            <code style={inlineCode}>other</code>.
          </li>
          <li>
            <strong>cohesion</strong>: percentatge de membres del grup que voten
            igual que la majoria del grup. <code style={inlineCode}>null</code>{' '}
            quan menys de 3 membres voten.
          </li>
          <li>
            <strong>coincidence</strong>: percentatge de votacions on dos grups
            voten igual sentit (sí vs. sí, no vs. no, abst. vs. abst.).
          </li>
          <li>
            <strong>attendance</strong>: percentatge de votacions on el diputat
            emet un vot (sí, no o abstenció). Excusats i baixes computen com a
            absents perquè la font no els distingeix.
          </li>
          <li>
            <strong>dissidence</strong>: percentatge de votacions on el diputat
            vota diferent que la majoria del seu grup. Diputats amb càrrec
            institucional (govern, mesa) tenen valors no comparables; el camp{' '}
            <code style={inlineCode}>role_kind</code> ho indica.
          </li>
        </ul>
      </Section>

      <Section title="Llicències i atribució">
        <ul style={listStyle}>
          <li>
            <strong>Dades</strong>: CC-BY 4.0. Reutilitza-les citant{' '}
            <em>Hola Política</em> i la font original (Congreso de los Diputados).
          </li>
          <li>
            <strong>Codi font</strong>: EUPL-1.2 (
            <ExternalLink href="https://github.com/Pardo24/holapolitica">
              GitHub
            </ExternalLink>
            ).
          </li>
          <li>
            <strong>Widgets i imatges OG</strong>: lliures d&apos;ús en mitjans i
            xarxes amb la mateixa obligació d&apos;atribució.
          </li>
        </ul>
        <p style={{ marginTop: 12 }}>
          Contacte tècnic:{' '}
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
          Et falta un endpoint
        </div>
        <p style={{ margin: '0 0 12px', color: 'var(--ink-2)', fontSize: 14 }}>
          Si la teva redacció necessita un tall concret (per exemple, totes les
          votacions d&apos;un partit en un trimestre), obre un issue al repositori i
          ho prioritzem.
        </p>
        <ExternalLink href="https://github.com/Pardo24/holapolitica/issues/new">
          Obrir un issue a GitHub
        </ExternalLink>
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
