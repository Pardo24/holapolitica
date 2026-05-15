'use client';

import { useState } from 'react';
import { ArrowUpRight, Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * One-tap sharing. On mobile uses the native share sheet (`navigator.share`);
 * on desktop falls back to copying the URL to clipboard with a "copied"
 * confirmation that auto-dismisses.
 *
 * The button label changes based on what's possible. We don't expose
 * partisan share targets — the URL is the share target, full stop.
 */
export function ShareButton({
  url,
  title,
  text,
  label = 'Comparteix',
  size = 'md',
}: {
  url: string;
  title: string;
  text?: string;
  label?: string;
  size?: 'sm' | 'md';
}) {
  const t = useTranslations('share');
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');

  const onClick = async () => {
    const absUrl =
      url.startsWith('http')
        ? url
        : (typeof window !== 'undefined' ? window.location.origin : '') + url;

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text: text ?? title, url: absUrl });
        return;
      } catch {
        /* user cancelled — silent */
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(absUrl);
      setState('copied');
      window.setTimeout(() => setState('idle'), 2000);
    } catch {
      setState('error');
      window.setTimeout(() => setState('idle'), 2000);
    }
  };

  const padding = size === 'sm' ? '6px 12px' : '8px 14px';
  const fontSize = size === 'sm' ? 12 : 13;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${title}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding,
        border: '1px solid var(--ink)',
        background: state === 'copied' ? 'var(--accent-soft)' : 'transparent',
        borderColor: state === 'copied' ? 'var(--accent)' : 'var(--ink)',
        color: state === 'copied' ? 'var(--accent)' : 'var(--ink)',
        fontSize,
        fontWeight: 600,
        fontFamily: 'inherit',
        borderRadius: 'var(--radius-2)',
        cursor: 'pointer',
        transition: 'background .15s ease, border-color .15s ease, color .15s ease',
      }}
    >
      <span aria-hidden="true" style={{ display: 'inline-flex', lineHeight: 1 }}>
        {state === 'copied' ? (
          <Check size={fontSize + 1} aria-hidden="true" />
        ) : state === 'error' ? (
          <X size={fontSize + 1} aria-hidden="true" />
        ) : (
          <ArrowUpRight size={fontSize + 1} aria-hidden="true" />
        )}
      </span>
      <span>
        {state === 'copied' ? t('copied') : state === 'error' ? t('copy_error') : label}
      </span>
    </button>
  );
}
