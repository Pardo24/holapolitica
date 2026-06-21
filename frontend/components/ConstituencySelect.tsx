'use client';

import { useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import type { ConstituencyRow } from '@/lib/api';

/**
 * Province picker for "El teu diputat". URL-driven (?prov=…) so a chosen
 * constituency can be shared or bookmarked.
 */
export function ConstituencySelect({
  constituencies,
  selected,
  label,
  placeholder,
}: {
  constituencies: ConstituencyRow[];
  selected: string | null;
  label: string;
  placeholder: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  function onChange(value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set('prov', value);
    else next.delete('prov');
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `?${qs}` : '?', { scroll: false }));
  }

  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
      <span style={{ color: 'var(--ink-2)' }}>{label}</span>
      <select
        value={selected ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={pending}
        aria-label={label}
        style={{
          appearance: 'auto',
          padding: '6px 10px',
          borderRadius: 8,
          border: '1px solid var(--rule-strong)',
          background: 'var(--paper-2)',
          color: 'var(--ink)',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        <option value="">{placeholder}</option>
        {constituencies.map((c) => (
          <option key={c.name} value={c.name}>
            {c.name} ({c.deputies})
          </option>
        ))}
      </select>
    </label>
  );
}
