'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

/**
 * First-visit onboarding overlay.
 *
 * Three slides explaining what Hola Política is, how to read a vote
 * row, and how to follow topics. Auto-opens on the first visit;
 * persists a flag in ``localStorage`` so subsequent visits skip it.
 * The reader can dismiss at any time (X button, backdrop click,
 * Escape key); each path stores the same flag.
 *
 * Storage key is versioned (``v1``) so a future redesign can force
 * the onboarding to reappear by bumping the suffix without losing
 * the "I've seen the OLD one" semantics for analytics if ever added.
 *
 * Neutrality (CLAUDE.md): copy is descriptive, no opinion words —
 * "you can see what the chamber voted" not "you can hold them
 * accountable". The point is to teach how the data is laid out,
 * not to frame the politics.
 */

const STORAGE_KEY = 'holapolitica.onboarded.v1';

export function OnboardingModal() {
  // Server render returns null; client mounts after hydration and
  // checks localStorage. This avoids the SSR-vs-client mismatch that
  // would force a hydration error if we conditionally rendered on
  // the server based on localStorage (which doesn't exist there).
  const [open, setOpen] = useState(false);
  const [slide, setSlide] = useState(0);
  const t = useTranslations('onboarding');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY);
      if (!seen) setOpen(true);
    } catch {
      // localStorage can throw in private-browsing or quota-exhausted
      // contexts. In that case we just don't show the onboarding;
      // worse case the visitor sees the home page without context,
      // which is what they'd see anyway after dismissing the modal.
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // close is stable across renders (defined inside, but doesn't
    // capture any state that would force a fresh listener); deps are
    // empty on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    try {
      window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      // ignore
    }
    setOpen(false);
  }

  if (!open) return null;

  const slides = [
    {
      eyebrow: t('slide1_eyebrow'),
      title: t('slide1_title'),
      body: t('slide1_body'),
      visual: <Slide1Visual />,
    },
    {
      eyebrow: t('slide2_eyebrow'),
      title: t('slide2_title'),
      body: t('slide2_body'),
      visual: <Slide2Visual t={t} />,
    },
    {
      eyebrow: t('slide3_eyebrow'),
      title: t('slide3_title'),
      body: t('slide3_body'),
      visual: <Slide3Visual />,
    },
  ];
  const current = slides[slide]!;
  const isLast = slide === slides.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(20, 20, 18, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--paper)',
          border: '1px solid var(--ink)',
          maxWidth: 520,
          width: '100%',
          padding: '28px 28px 22px',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <button
          type="button"
          onClick={close}
          aria-label={t('close_aria')}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: 'transparent',
            border: 0,
            cursor: 'pointer',
            color: 'var(--ink-3)',
            padding: 4,
          }}
        >
          <X size={18} aria-hidden="true" />
        </button>

        <div>
          <div
            className="eyebrow"
            style={{
              fontSize: 10,
              color: 'var(--ink-3)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            {current.eyebrow}
          </div>
          <h2
            id="onboarding-title"
            className="serif"
            style={{
              margin: 0,
              fontSize: 22,
              lineHeight: 1.25,
              fontWeight: 700,
              color: 'var(--ink)',
              letterSpacing: '-0.01em',
            }}
          >
            {current.title}
          </h2>
        </div>

        {current.visual}

        <p
          style={{
            margin: 0,
            fontSize: 14,
            lineHeight: 1.55,
            color: 'var(--ink-2)',
          }}
        >
          {current.body}
        </p>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 4,
          }}
        >
          {/* Slide indicators — three dots, current filled. Doubles
              as the position cue + as click targets to jump. */}
          <div style={{ display: 'flex', gap: 6 }}>
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSlide(i)}
                aria-label={t('slide_aria', { n: i + 1 })}
                aria-current={i === slide ? 'true' : undefined}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: i === slide ? 'var(--ink)' : 'var(--rule)',
                  border: 0,
                  padding: 0,
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {slide > 0 && (
              <button
                type="button"
                onClick={() => setSlide((s) => s - 1)}
                style={btnSecondary}
              >
                <ChevronLeft size={14} aria-hidden="true" />
                {t('prev')}
              </button>
            )}
            {!isLast ? (
              <button
                type="button"
                onClick={() => setSlide((s) => s + 1)}
                style={btnPrimary}
              >
                {t('next')}
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            ) : (
              <button type="button" onClick={close} style={btnPrimary}>
                {t('done')}
              </button>
            )}
          </div>
        </div>
        {/* Skip link — small, low-pressure escape hatch for visitors
            who don't want the tour at all. Same effect as the X. */}
        {!isLast && (
          <button
            type="button"
            onClick={close}
            style={{
              background: 'transparent',
              border: 0,
              padding: 0,
              fontSize: 12,
              color: 'var(--ink-3)',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
              cursor: 'pointer',
              alignSelf: 'flex-start',
              marginTop: -8,
            }}
          >
            {t('skip')}
          </button>
        )}
      </div>
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '8px 14px',
  background: 'var(--ink)',
  color: 'var(--paper)',
  border: '1px solid var(--ink)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '8px 12px',
  background: 'var(--paper)',
  color: 'var(--ink)',
  border: '1px solid var(--rule)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

/** Slide 1 visual — minimal masthead-style mark so the reader sees
 *  the brand visually before reading the mission text. */
function Slide1Visual() {
  return (
    <div
      aria-hidden="true"
      style={{
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--paper-2)',
        border: '1px solid var(--rule)',
      }}
    >
      <span
        className="serif"
        style={{
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: 'var(--ink)',
        }}
      >
        Hola Política
      </span>
    </div>
  );
}

/** Slide 2 visual — anatomy of a sample vote row, labelling each
 *  bit (title, result pill, ayes/noes/abst counts, topic chip)
 *  so a first-time reader can decode the rest of the site. */
function Slide2Visual({
  t,
}: {
  t: ReturnType<typeof useTranslations<'onboarding'>>;
}) {
  return (
    <div
      style={{
        padding: 12,
        background: 'var(--paper-2)',
        border: '1px solid var(--rule)',
        fontSize: 11,
        color: 'var(--ink-2)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 8,
          marginBottom: 6,
        }}
      >
        <strong
          className="serif"
          style={{ fontSize: 13, color: 'var(--ink)', flex: 1 }}
        >
          {t('slide2_sample_title')}
        </strong>
        <span
          style={{
            background: 'var(--aye-soft)',
            color: 'oklch(0.32 0.10 152)',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            padding: '3px 7px',
            whiteSpace: 'nowrap',
          }}
        >
          {t('slide2_sample_result')}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          gap: 14,
          fontSize: 11,
          marginBottom: 6,
        }}
      >
        <span style={{ color: 'var(--aye)' }}>
          <strong className="tabular">187</strong> {t('slide2_aye')}
        </span>
        <span style={{ color: 'var(--no)' }}>
          <strong className="tabular">152</strong> {t('slide2_no')}
        </span>
        <span style={{ color: 'var(--abst)' }}>
          <strong className="tabular">11</strong> {t('slide2_abst')}
        </span>
      </div>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '1px 7px 2px',
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--ink-2)',
          background: 'color-mix(in oklch, #16a34a 14%, var(--paper))',
          border: '1px solid color-mix(in oklch, #16a34a 32%, var(--paper))',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 5,
            height: 5,
            borderRadius: 999,
            background: '#16a34a',
          }}
        />
        {t('slide2_sample_topic')}
      </span>
    </div>
  );
}

/** Slide 3 visual — a small "follow topics" badge stack so the
 *  reader sees what the notification surface looks like before
 *  being asked to subscribe. */
function Slide3Visual() {
  const sample = [
    { name: 'Habitatge', color: '#16a34a' },
    { name: 'Treball', color: '#1e88e5' },
    { name: 'Educació', color: '#9333ea' },
    { name: 'Sanitat', color: '#dc2626' },
  ];
  return (
    <div
      aria-hidden="true"
      style={{
        padding: 14,
        background: 'var(--paper-2)',
        border: '1px solid var(--rule)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
      }}
    >
      {sample.map((s) => (
        <span
          key={s.name}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 9px',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--ink-2)',
            background: `color-mix(in oklch, ${s.color} 14%, var(--paper))`,
            border: `1px solid color-mix(in oklch, ${s.color} 32%, var(--paper))`,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: s.color,
            }}
          />
          {s.name}
        </span>
      ))}
    </div>
  );
}
