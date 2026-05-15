'use client';

/**
 * Global error boundary for the App Router. Replaces the Next default
 * (full-bleed stack trace in production) with a civic-styled landing
 * that always offers a clear way back. The `reset()` callback is from
 * Next.js — it re-runs the segment so a transient error (e.g. a slow
 * backend response) clears itself if the user retries.
 *
 * `useTranslations` is safe here because this is a Client Component and
 * the locale provider is mounted at the root layout.
 */

import { useEffect } from 'react';
import type { Route } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('error_page');

  // Forward to a real error tracker once we wire one up; for now we
  // log to the browser console so devtools at least show the digest.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('app error boundary:', error);
    }
  }, [error]);

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
        {t('eyebrow')}
      </p>
      <h1 className="h-headline" style={{ margin: '6px 0 12px' }}>
        {t('title')}
      </h1>
      <p style={{ fontSize: 16, color: 'var(--ink-2)', lineHeight: 1.6 }}>
        {t('lede')}
      </p>
      {error.digest && (
        <p
          className="mono"
          style={{
            marginTop: 16,
            fontSize: 11,
            color: 'var(--ink-3)',
          }}
        >
          {t('digest')}: {error.digest}
        </p>
      )}
      <div
        style={{
          marginTop: 24,
          display: 'inline-flex',
          gap: 10,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <button
          type="button"
          onClick={reset}
          className="btn-ink"
          style={{ cursor: 'pointer' }}
        >
          {t('retry')}
        </button>
        <Link
          href={'/' as Route}
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
          {t('go_home')}
        </Link>
      </div>
    </section>
  );
}
