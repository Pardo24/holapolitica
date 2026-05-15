import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

/**
 * Global 404 page. Replaces the Next.js default white screen with a
 * civic-styled landing that gives the user one obvious way back.
 *
 * Reached either by an explicit `notFound()` call from a detail page
 * (vote/initiative/person id missing) OR when no app route matches.
 * Keep it serif-led so it looks like the rest of the site.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('not_found');
  return {
    title: t('title'),
    description: t('lede'),
    robots: { index: false },
  };
}

export default async function NotFound() {
  const t = await getTranslations('not_found');
  return (
    <section
      style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '64px 16px 80px',
        textAlign: 'center',
      }}
    >
      <p
        className="eyebrow"
        style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 12 }}
      >
        404
      </p>
      <h1 className="h-headline" style={{ margin: '6px 0 12px' }}>
        {t('title')}
      </h1>
      <p style={{ fontSize: 16, color: 'var(--ink-2)', lineHeight: 1.6 }}>
        {t('lede')}
      </p>
      <div style={{ marginTop: 24, display: 'inline-flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link href={'/' as Route} className="btn-ink">
          {t('go_home')}
        </Link>
        <Link
          href={'/votes' as Route}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '10px 16px',
            border: '1px solid var(--rule-strong)',
            borderRadius: 999,
            color: 'var(--ink-2)',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {t('go_votes')}
        </Link>
      </div>
    </section>
  );
}
