'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { ApiError, api, type NewsletterLanguage } from '@/lib/api';

type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error';

// Very permissive RFC-5322-ish check. We don't enforce anything beyond
// "looks like an address" client-side — the backend uses pydantic's
// `EmailStr` which is the authoritative validator.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function languageFromLocale(locale: string): NewsletterLanguage {
  if (locale === 'es' || locale === 'en') return locale;
  return 'ca';
}

/**
 * Compact inline newsletter signup block.
 *
 * Renders an eyebrow, one-line factual body, an email input + submit
 * button. On submit, POSTs to the backend `/newsletter` endpoint and
 * surfaces success / error inline.
 *
 * Neutral by design — no marketing language, no scarcity tactics, no
 * emoji. Mirror, not megaphone.
 *
 * Visual variants:
 *  - `variant="card"` (default) — bordered card, used at section breaks.
 *  - `variant="bare"` — no border, for use inside an already-bordered host.
 */
export function NewsletterSignup({
  variant = 'card',
}: {
  variant?: 'card' | 'bare';
}) {
  const t = useTranslations('newsletter');
  const locale = useLocale();

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [message, setMessage] = useState<string>('');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();

    if (!EMAIL_RE.test(trimmed)) {
      setStatus('error');
      setMessage(t('signup_error_invalid_email'));
      return;
    }

    setStatus('submitting');
    setMessage('');

    try {
      const res = await api.newsletter.subscribe({
        email: trimmed,
        language: languageFromLocale(locale),
      });
      setStatus('success');
      // Prefer the backend's localised detail when present, fall back to
      // our own translated copy. Either way we surface a confirm hint.
      setMessage(res.detail || t('signup_success'));
      setEmail('');
    } catch (err) {
      setStatus('error');
      if (err instanceof ApiError) {
        // Backend may return `{ detail: "..." }` on validation errors
        // (HTTPException(400) is shaped that way by FastAPI).
        const body = err.body as { detail?: string } | undefined;
        setMessage(body?.detail ?? t('signup_error_generic'));
      } else {
        setMessage(t('signup_error_generic'));
      }
    }
  }

  const containerStyle: React.CSSProperties =
    variant === 'card'
      ? {
          marginTop: 28,
          padding: '16px 18px',
          border: '1px solid var(--rule-strong)',
          borderRadius: 12,
          background: 'var(--paper-2)',
        }
      : {
          padding: 0,
        };

  return (
    <section
      aria-labelledby="newsletter-signup-heading"
      // Cap the desktop width so the signup card doesn't sprawl across
      // wide containers. 480px keeps it comfortable for an email + button
      // on one row while staying readable on narrow desktops. We center it
      // via auto inline margins so the parent's natural alignment is
      // preserved. On mobile the card still expands to the full width via
      // `width: 100%` (no max-width fight there because the viewport
      // is narrower than 480px on phones).
      style={{
        ...containerStyle,
        maxWidth: 480,
        width: '100%',
        marginInline: 'auto',
        minWidth: 0,
      }}
      className="newsletter-signup"
    >
      <div className="eyebrow" style={{ marginBottom: 6 }}>
        {t('signup_eyebrow')}
      </div>
      <p
        id="newsletter-signup-heading"
        style={{
          margin: '0 0 14px',
          fontSize: 14,
          color: 'var(--ink-2)',
          lineHeight: 1.5,
        }}
      >
        {t('signup_body')}
      </p>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="newsletter-signup-form"
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'stretch',
          flexWrap: 'wrap',
        }}
      >
        <label
          htmlFor="newsletter-email"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
          }}
        >
          {t('signup_placeholder')}
        </label>
        <input
          id="newsletter-email"
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder={t('signup_placeholder')}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === 'error') {
              setStatus('idle');
              setMessage('');
            }
          }}
          disabled={status === 'submitting'}
          aria-invalid={status === 'error' ? 'true' : 'false'}
          className="input-modern"
          // Flex sizing + mobile-safe font-size kept inline; the rest of
          // the visual chrome (border, radius, focus ring) comes from the
          // global ``.input-modern`` rule. We pin font-size at 16px so
          // iOS Safari doesn't auto-zoom the page on focus on mobile.
          style={{ flex: '1 1 220px', minWidth: 0, fontSize: 16 }}
        />
        <button
          type="submit"
          className="btn-ink"
          disabled={status === 'submitting'}
          style={{
            flex: '0 0 auto',
            whiteSpace: 'nowrap',
          }}
        >
          {status === 'submitting' ? t('signup_sending') : t('signup_cta')}
        </button>
      </form>

      <div
        aria-live="polite"
        role="status"
        style={{
          marginTop: 10,
          minHeight: 16,
          fontSize: 12,
          lineHeight: 1.5,
          color:
            status === 'success'
              ? 'var(--aye)'
              : status === 'error'
                ? 'var(--no)'
                : 'var(--ink-3)',
          wordBreak: 'break-word',
        }}
      >
        {message ? message : status === 'idle' ? t('signup_privacy') : ''}
      </div>

      <style>{`
        @media (max-width: 640px) {
          .newsletter-signup { margin-top: 20px !important; }
          .newsletter-signup-form {
            flex-direction: column;
            gap: 6px !important;
          }
          .newsletter-signup-form > input,
          .newsletter-signup-form > button { width: 100%; }
          /* CRITICAL: when the form flips to flex-direction:column,
             the inline flex:1 1 220px on the input reinterprets the
             220 px as a MIN HEIGHT (main axis is now vertical). That
             made the input render ~220 px tall on phones. Force the
             flex shorthand back to a sane row-equivalent so the input
             gets its natural content height + the explicit min-height
             below. */
          .newsletter-signup-form > input.input-modern {
            flex: 0 0 auto !important;
            padding: 8px 12px !important;
            min-height: 40px !important;
            height: 40px !important;
          }
          .newsletter-signup-form > button {
            flex: 0 0 auto !important;
            min-height: 40px !important;
          }
        }
      `}</style>
    </section>
  );
}
