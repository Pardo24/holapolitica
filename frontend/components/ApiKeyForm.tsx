'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy, KeyRound } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.holapolitica.org';

/**
 * Ask for a free key for the bulk downloads (/dump/*). The key is shown
 * once, here; we keep only its hash, with the email, name and purpose the
 * person gave and their acceptance of the attribution terms.
 */
export function ApiKeyForm() {
  const t = useTranslations('api_key_form');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await fetch(`${API}/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, purpose, accept_terms: accept }),
      });
      if (r.status === 429) throw new Error(t('err_rate'));
      if (!r.ok) throw new Error(t('err_invalid'));
      const body = (await r.json()) as { key: string };
      setKey(body.key);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('err_generic'));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
    } catch {
      /* the key is selectable on screen */
    }
  }

  if (key) {
    return (
      <div className="apikey apikey--done">
        <p style={{ margin: 0, fontWeight: 700 }}>{t('your_key')}</p>
        <div className="apikey__key">
          <code>{key}</code>
          <button type="button" onClick={copy} aria-label={t('copy_aria')}>
            {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>
          {t.rich('usage', { c: (chunks) => <code>{chunks}</code> })}
        </p>
      </div>
    );
  }

  return (
    <form className="apikey" onSubmit={submit}>
      <label>
        {t('email')}
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      <label>
        {t('name')}
        <input required minLength={2} maxLength={160} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        {t('purpose')}
        <textarea
          required
          minLength={10}
          maxLength={1000}
          rows={3}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
        />
      </label>
      <label className="apikey__check">
        <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} required />
        <span>{t('accept')}</span>
      </label>
      {error && <p className="apikey__error">{error}</p>}
      <button type="submit" disabled={busy || !accept}>
        <KeyRound size={16} aria-hidden="true" />
        {busy ? t('creating') : t('submit')}
      </button>
    </form>
  );
}
