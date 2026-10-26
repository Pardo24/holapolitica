import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from '@/components/icons';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('about_data');
  return { title: t('title'), description: t('meta_description') };
}

export default async function AboutDataPage() {
  const t = await getTranslations('about_data');
  // List items carry their bold lead-in and, some, one link.
  const rich = (key: string, href?: string) =>
    t.rich(key, {
      b: (chunks) => <strong>{chunks}</strong>,
      link: (chunks) => <ExternalLink href={href ?? ''}>{chunks}</ExternalLink>,
    });

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
          <li>{rich('src_opendata', 'https://www.congreso.es/es/opendata')}</li>
          <li>{rich('src_search', 'https://www.congreso.es/es/busqueda-de-iniciativas')}</li>
          <li>{rich('src_texts', 'https://www.boe.es/datosabiertos/')}</li>
          <li>{rich('src_hemi', 'https://www.congreso.es/es/hemiciclo')}</li>
          <li>{rich('src_profiles')}</li>
          <li>{rich('src_wiki')}</li>
        </ul>
      </Section>

      <Section title={t('methodology_title')}>
        <p>{t('methodology_intro')}</p>
        <ol style={listStyle}>
          <li>{rich('m_download')}</li>
          <li>{rich('m_normalise')}</li>
          <li>{rich('m_classify')}</li>
          <li>{rich('m_summaries')}</li>
          <li>{rich('m_metrics')}</li>
        </ol>
      </Section>

      <Section title={t('frequency_title')}>
        <ul style={listStyle}>
          <li>{rich('f_votes')}</li>
          <li>{rich('f_initiatives')}</li>
          <li>{rich('f_deputies')}</li>
          <li>{rich('f_hemi')}</li>
          <li>{rich('f_ai')}</li>
        </ul>
      </Section>

      <Section title={t('neutrality_title')}>
        <p>{t('neutrality_body_1')}</p>
        <ul style={listStyle}>
          <li>{t('n_1')}</li>
          <li>{t('n_2')}</li>
          <li>{t('n_3')}</li>
          <li>{t('n_4')}</li>
          <li>{t('n_5')}</li>
        </ul>
        <p style={{ marginTop: 16 }}>{t('neutrality_body_2')}</p>
      </Section>

      <Section title={t('limits_title')}>
        <ul style={listStyle}>
          <li>{rich('l_link')}</li>
          <li>{rich('l_senate')}</li>
          <li>{rich('l_history')}</li>
          <li>{rich('l_language')}</li>
        </ul>
      </Section>

      <Section title={t('correction_title')}>
        <p>{t('correction_body')}</p>
        <p style={{ marginTop: 12 }}>
          <strong>{t('contact_label')}</strong>:{' '}
          <a href="mailto:dades@holapolitica.org" style={{ color: 'var(--accent)' }}>
            dades@holapolitica.org
          </a>
        </p>
      </Section>

      <Section title={t('licences_title')}>
        <ul style={listStyle}>
          <li>{rich('lic_code', 'https://github.com/Pardo24/holapolitica')}</li>
          <li>{rich('lic_data')}</li>
          <li>{rich('lic_photos')}</li>
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
