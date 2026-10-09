'use client';

import { useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.holapolitica.org';

/**
 * Ask for a free key for the bulk downloads (/dump/*). The key is shown
 * once, here; we keep only its hash, with the email, name and purpose the
 * person gave and their acceptance of the attribution terms.
 */
export function ApiKeyForm() {
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
      if (r.status === 429) throw new Error("Has demanat massa claus en poca estona. Torna-ho a provar d'aquí a una hora.");
      if (!r.ok) throw new Error('Revisa les dades: correu vàlid, nom i un ús d’almenys 10 caràcters.');
      const body = (await r.json()) as { key: string };
      setKey(body.key);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No s’ha pogut crear la clau.');
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
        <p style={{ margin: 0, fontWeight: 700 }}>La teva clau (guarda-la: no la tornarem a mostrar)</p>
        <div className="apikey__key">
          <code>{key}</code>
          <button type="button" onClick={copy} aria-label="Copia la clau">
            {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>
          Fes-la servir a la capçalera <code>X-API-Key</code> (o <code>?key=</code>) de les rutes{' '}
          <code>/dump/*</code>.
        </p>
      </div>
    );
  }

  return (
    <form className="apikey" onSubmit={submit}>
      <label>
        Correu
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      <label>
        Nom o mitjà
        <input required minLength={2} maxLength={160} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Per a què faràs servir les dades
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
        <span>
          Accepto la llicència CC BY 4.0: citaré «Dades: Hola Política (holapolitica.org)» amb un enllaç
          allà on les publiqui.
        </span>
      </label>
      {error && <p className="apikey__error">{error}</p>}
      <button type="submit" disabled={busy || !accept}>
        <KeyRound size={16} aria-hidden="true" />
        {busy ? 'Creant…' : 'Demana la clau'}
      </button>
    </form>
  );
}
