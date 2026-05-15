import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

export const metadata: Metadata = {
  title: 'Sobre les dades · Hola Política',
  description:
    "Fonts, metodologia, llicències i procediment de correcció de Hola Política. " +
    'Tota la informació prové de portals d\'open data oficials sota CC-BY 4.0.',
};

export default async function AboutDataPage() {
  const t = await getTranslations('about_data');

  return (
    <article style={{ maxWidth: 760, paddingTop: 24, paddingBottom: 64 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        {t('eyebrow')}
      </div>
      <h1 className="h-headline" style={{ margin: '6px 0 14px' }}>
        {t('title')}
      </h1>
      <p style={{ fontSize: 16, color: 'var(--ink-2)', lineHeight: 1.6, margin: '0 0 28px' }}>
        {t('lede')}
      </p>

      <Section title={t('sources_title')}>
        <p>{t('sources_intro')}</p>
        <ul style={listStyle}>
          <li>
            <strong>Open data del Congrés dels Diputats</strong> —{' '}
            <ExternalLink href="https://www.congreso.es/es/opendata">
              congreso.es/es/opendata
            </ExternalLink>
            . Diputats, iniciatives, votacions del ple. Llicència CC-BY 4.0.
          </li>
          <li>
            <strong>Cercador d&apos;iniciatives del Congrés</strong> —{' '}
            <ExternalLink href="https://www.congreso.es/ca/busqueda-de-iniciativas">
              busqueda-de-iniciativas
            </ExternalLink>
            . Sèries 162 (Proposicions no de Llei), 173 (Mocions), via AJAX
            del Liferay. Mateixa llicència.
          </li>
          <li>
            <strong>Hemicicle</strong> — mapa de seients oficial publicat a{' '}
            <ExternalLink href="https://www.congreso.es/ca/hemiciclo">
              congreso.es/ca/hemiciclo
            </ExternalLink>
            . Imatge i coordenades són del Congrés; només mostrem on seu cada
            diputat.
          </li>
          <li>
            <strong>Fitxes de diputats</strong> — pàgines públiques del
            Congrés. D&apos;allà extreim fotografia oficial, codi parlamentari
            i any de naixement. Mai dades privades (telèfon personal, adreça,
            família).
          </li>
        </ul>
      </Section>

      <Section title={t('methodology_title')}>
        <p>{t('methodology_intro')}</p>
        <ol style={listStyle}>
          <li>
            <strong>Descàrrega periòdica</strong> dels datasets oficials. Una
            tasca programada baixa cada 4 hores les votacions noves i una
            vegada al dia els diputats i iniciatives.
          </li>
          <li>
            <strong>Normalització</strong> a la nostra base de dades amb
            esquema documentat. Cap dada calculada s&apos;inventa: tot prové
            d&apos;una columna identificable de la font.
          </li>
          <li>
            <strong>Classificació temàtica per LLM</strong>. Cada iniciativa
            es classifica per tema (17 temes editorials + 17 ODS de l&apos;Agenda
            2030) amb un model de llenguatge (Mistral, europeu). La taxonomia és
            tancada — el model assigna entre els temes definits, no n&apos;inventa.
            La precisió varia; iniciatives sense classificació són explícites.
          </li>
          <li>
            <strong>Resums planers per LLM</strong>. Quan el text original és
            jurídic-procedimental, generem un resum &laquo;planer&raquo; en català
            i castellà. El model té instruccions estrictes contra emetre
            opinions: si detecta llenguatge editorial el resum es marca com a
            null en lloc d&apos;arriscar-se a publicar valoració.
          </li>
          <li>
            <strong>Mètriques agregades</strong> (cohesió, assistència,
            coincidència entre grups, índex d&apos;aprovació per tema). Totes
            calculades amb fórmules documentades al codi font, sense
            ponderacions opaques.
          </li>
        </ol>
      </Section>

      <Section title={t('frequency_title')}>
        <ul style={listStyle}>
          <li>
            <strong>Votacions del ple</strong>: revisem cada 4 hores. El Congrés
            publica el resultat ~24-48h després de la sessió, així que la
            cobertura sol arribar al cap d&apos;1-2 dies.
          </li>
          <li>
            <strong>Iniciatives</strong>: cada nit. La majoria es publiquen el
            mateix dia o l&apos;endemà del registre.
          </li>
          <li>
            <strong>Diputats actius</strong>: cada nit. Capturen
            substitucions, canvis de grup.
          </li>
          <li>
            <strong>Hemicicle (mapa de seients)</strong>: manual, quan
            sabem que hi ha hagut reassignacions.
          </li>
          <li>
            <strong>Classificació LLM</strong>: automàtica en cada ingest.
            Costos a càrrec del projecte.
          </li>
        </ul>
      </Section>

      <Section title={t('neutrality_title')}>
        <p>{t('neutrality_body_1')}</p>
        <ul style={listStyle}>
          <li>Cap llista &laquo;el millor/pitjor diputat&raquo;.</li>
          <li>Cap valoració automàtica de qualitat d&apos;una llei.</li>
          <li>
            Si publiquem cohesió alta d&apos;un grup, també publiquem la baixa,
            costat per costat.
          </li>
          <li>
            Si publiquem &laquo;qui aprova més&raquo; d&apos;un tema, també
            publiquem &laquo;qui rebutja més&raquo;, al mateix widget.
          </li>
          <li>
            No tenim secció de comentaris, reaccions ni vots paral·lels:
            l&apos;eina és un mirall, no un megàfon.
          </li>
        </ul>
        <p style={{ marginTop: 16 }}>{t('neutrality_body_2')}</p>
      </Section>

      <Section title={t('limits_title')}>
        <ul style={listStyle}>
          <li>
            <strong>Vincle vot↔iniciativa</strong>: el Congrés assigna codis
            d&apos;expedient diferents als documents procedimentals (162 PNL,
            173 Moció...) i a les lleis subjacents (121, 122...). El vincle
            es manté quan el codi és el mateix; per a la resta, sense
            classificació de tema. Treballem en una capa de matching per
            text.
          </li>
          <li>
            <strong>Senat</strong>: no hi és encara. El Senat no publica
            votacions individuals en format obert estructurat. Quan ho faci,
            l&apos;incorporem.
          </li>
          <li>
            <strong>Història</strong>: cobertura XV legislatura (des
            d&apos;agost 2023). Legislatures anteriors planejades per a
            fase 2.
          </li>
          <li>
            <strong>Llenguatge</strong>: el contingut original és
            castellà. Traduccions al català per IA estan en desenvolupament
            per a títols i resums.
          </li>
        </ul>
      </Section>

      <Section title={t('correction_title')}>
        <p>{t('correction_body')}</p>
        <p style={{ marginTop: 12 }}>
          <strong>Correu de contacte</strong>:{' '}
          <a href="mailto:dades@holapolitica.org" style={{ color: 'var(--accent)' }}>
            dades@holapolitica.org
          </a>
        </p>
      </Section>

      <Section title={t('licences_title')}>
        <ul style={listStyle}>
          <li>
            <strong>Codi font</strong>: EUPL-1.2 (European Union Public
            Licence). Disponible a{' '}
            <ExternalLink href="https://github.com/Pardo24/holapolitica">
              github.com/Pardo24/holapolitica
            </ExternalLink>
            .
          </li>
          <li>
            <strong>Dades</strong>: CC-BY 4.0. Pots reutilitzar-les
            citant Hola Política i la font original (Congrés dels Diputats).
          </li>
          <li>
            <strong>Fotografies oficials</strong>: propietat del Congrés
            dels Diputats. Les redistribuim sota la mateixa autorització
            que ells publiquen al seu portal.
          </li>
        </ul>
      </Section>

      <Section title={t('rgpd_title')}>
        <p>{t('rgpd_body_1')}</p>
        <p style={{ marginTop: 12 }}>{t('rgpd_body_2')}</p>
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
        <p style={{ margin: '0 0 12px', color: 'var(--ink-2)', fontSize: 14 }}>
          {t('cta_body')}
        </p>
        <Link href="/about" className="btn-ink" style={{ display: 'inline-block' }}>
          {t('cta_button')}
        </Link>
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
      <div style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.65 }}>{children}</div>
    </section>
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
  lineHeight: 1.65,
};
