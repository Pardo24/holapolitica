'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bell, Landmark, Scale, Users, type LucideIcon } from 'lucide-react';

import { isNativeApp } from '@/lib/native';

/**
 * Welcome, the first time the mobile app opens.
 *
 * Four short steps: what the app is, then one per tab of the bottom bar
 * (laws, deputies, data and following a law), so a new user knows what
 * each tab holds before tapping around. Skippable from the first step.
 *
 * App only. On the web a full-screen welcome was a barrier for a reader
 * arriving from a shared link (see IntroNote, which replaced one), but a
 * person who just installed the app expects to be shown around once.
 *
 * Shown once: finishing or skipping remembers it, and also marks the
 * first-visit strip as seen so the two never stack. Storage can throw
 * (private mode): then it simply doesn't show.
 */

const STORAGE_KEY = 'holapolitica.welcome.v1';
const INTRO_NOTE_KEY = 'holapolitica.onboarded.v1';

type StepKey = 'what' | 'laws' | 'deputies' | 'follow';

const STEPS: { key: StepKey; Icon: LucideIcon; hue: string }[] = [
  { key: 'what', Icon: Landmark, hue: 'var(--accent)' },
  { key: 'laws', Icon: Scale, hue: 'var(--hue-lleis)' },
  { key: 'deputies', Icon: Users, hue: 'var(--hue-partits)' },
  { key: 'follow', Icon: Bell, hue: 'var(--hue-dades, var(--accent))' },
];

export function WelcomeWizard() {
  const t = useTranslations('welcome');
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const primary = useRef<HTMLButtonElement>(null);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    if (!isNativeApp()) return;
    try {
      if (!window.localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {
      /* no storage: don't show */
    }
  }, []);

  useEffect(() => {
    if (open) primary.current?.focus();
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') setStep((s) => Math.min(s + 1, STEPS.length - 1));
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(s - 1, 0));
    };
    document.addEventListener('keydown', onKey);
    // The page underneath doesn't scroll while the welcome is up.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  function close() {
    setOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
      window.localStorage.setItem(INTRO_NOTE_KEY, '1');
    } catch {
      /* nothing to remember it with */
    }
  }

  if (!open) return null;

  const current = STEPS[step]!;
  const last = step === STEPS.length - 1;

  return (
    <div
      className="welcome"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX;
        touchX.current = null;
        if (start == null || end == null || Math.abs(end - start) < 50) return;
        setStep((s) => (end < start ? Math.min(s + 1, STEPS.length - 1) : Math.max(s - 1, 0)));
      }}
    >
      <div className="welcome__top">
        <span className="welcome__count tabular">
          {step + 1} / {STEPS.length}
        </span>
        {!last && (
          <button type="button" className="welcome__skip" onClick={close}>
            {t('skip')}
          </button>
        )}
      </div>

      <div className="welcome__body" key={current.key}>
        <span className="welcome__icon" aria-hidden="true" style={{ ['--hue' as string]: current.hue }}>
          <current.Icon size={34} strokeWidth={1.8} />
        </span>
        <span className="eyebrow">{t(`${current.key}_eyebrow`)}</span>
        <h2 id="welcome-title" className="serif">
          {t(`${current.key}_title`)}
        </h2>
        <p>{t(`${current.key}_body`)}</p>
      </div>

      <div className="welcome__dots" role="tablist" aria-label={t('steps_aria')}>
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={i === step}
            aria-label={t('step_aria', { n: i + 1 })}
            className={i === step ? 'welcome__dot welcome__dot--on' : 'welcome__dot'}
            onClick={() => setStep(i)}
          />
        ))}
      </div>

      <div className="welcome__actions">
        {step > 0 && (
          <button type="button" className="welcome__back" onClick={() => setStep(step - 1)}>
            {t('back')}
          </button>
        )}
        <button
          ref={primary}
          type="button"
          className="welcome__next"
          onClick={() => (last ? close() : setStep(step + 1))}
        >
          {last ? t('start') : t('next')}
        </button>
      </div>
    </div>
  );
}
