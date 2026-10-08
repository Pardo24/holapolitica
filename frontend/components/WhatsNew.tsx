'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { BarChart3, FileSearch, Gamepad2, LayoutList, Sparkles, UserRound, X, type LucideIcon } from 'lucide-react';

/**
 * "What's new", once per batch of improvements, for people who have been
 * here before.
 *
 * A first-time visitor gets the welcome (WelcomeWizard on a phone, the
 * IntroNote strip on a desktop); stacking a changelog on top of that would
 * be noise. So this only opens when one of those has already been seen, and
 * only until it is closed for this release. Bump RELEASE to show it again.
 *
 * Storage can throw (private mode): then it simply stays closed.
 */
const RELEASE = '2026-10-08';
const STORAGE_KEY = `holapolitica.news.${RELEASE}`;
const RETURNING_KEYS = ['holapolitica.welcome.v1', 'holapolitica.onboarded.v1'];

const ITEMS: { key: string; Icon: LucideIcon; href: string }[] = [
  { key: 'affects', Icon: UserRound, href: '/et-afecta' },
  { key: 'cards', Icon: LayoutList, href: '/lleis' },
  { key: 'text', Icon: FileSearch, href: '/lleis' },
  { key: 'games', Icon: Gamepad2, href: '/jocs' },
  { key: 'data', Icon: BarChart3, href: '/stats' },
];

export function WhatsNew() {
  const t = useTranslations('whats_new');
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY) != null;
      const returning = RETURNING_KEYS.some((k) => window.localStorage.getItem(k) != null);
      if (returning && !seen) setOpen(true);
    } catch {
      /* no storage: stay closed */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    button.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    setOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  if (!open) return null;

  return (
    <div className="news-backdrop" onClick={close}>
      <div
        className="news"
        role="dialog"
        aria-modal="true"
        aria-labelledby="news-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="news__close" onClick={close} aria-label={t('close')}>
          <X size={20} aria-hidden="true" />
        </button>
        <span className="news__kicker">
          <Sparkles size={14} strokeWidth={2.2} aria-hidden="true" />
          {t('kicker')}
        </span>
        <h2 id="news-title" className="news__title">
          {t('title')}
        </h2>
        <p className="news__lede">{t('lede')}</p>
        <ul className="news__list">
          {ITEMS.map(({ key, Icon, href }) => (
            <li key={key}>
              <Link href={href as Route} onClick={close}>
                <span className="news__icon" aria-hidden="true">
                  <Icon size={18} strokeWidth={2} />
                </span>
                <span>
                  <strong>{t(`${key}_title` as 'affects_title')}</strong>
                  <span>{t(`${key}_body` as 'affects_body')}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <button ref={button} type="button" className="news__ok" onClick={close}>
          {t('ok')}
        </button>
      </div>
    </div>
  );
}
