'use client';

import { useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Landmark } from 'lucide-react';

import type { Legislature } from '@/lib/api';

/**
 * Context switcher for browsing a past legislature's data (votes, groups…).
 *
 * Unlocked by the X-XV historical backfill. It's a *context* switch, not a
 * filter: changing it re-scopes the whole dataset, so it sits apart from the
 * topic/result/group filters. URL-driven via a `legislature` param that holds
 * the legislature id; the active (current) legislature is the default and
 * carries NO param, so the common case keeps a clean URL.
 *
 * Pattern matches VotesFilterCard: we clone the current search params, set or
 * delete `legislature`, drop `page`, and push — so any active filters survive
 * the switch.
 */
export function LegislatureSelector({
  legislatures,
  activeId,
  selectedId,
  label,
  currentSuffix,
}: {
  /** All legislatures, ordered most-recent-first. */
  legislatures: Legislature[];
  /** The active (current) legislature id — the default, rendered without a URL param. */
  activeId: number | null;
  /** Currently selected legislature id (from the URL, or activeId). */
  selectedId: number;
  /** Field label, e.g. "Legislatura". */
  label: string;
  /** Parenthetical appended to the active legislature, e.g. "actual". */
  currentSuffix: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const onChange = (value: string) => {
    const next = new URLSearchParams(sp.toString());
    const id = Number(value);
    if (activeId !== null && id === activeId) {
      next.delete('legislature');
    } else {
      next.set('legislature', String(id));
    }
    next.delete('page');
    const qs = next.toString();
    startTransition(() => {
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    });
  };

  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        color: 'var(--ink-2)',
      }}
    >
      <Landmark size={15} strokeWidth={1.8} aria-hidden="true" />
      <span style={{ fontWeight: 600 }}>{label}</span>
      <select
        value={String(selectedId)}
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
          cursor: pending ? 'progress' : 'pointer',
        }}
      >
        {legislatures.map((leg) => (
          <option key={leg.id} value={String(leg.id)}>
            {leg.number}
            {leg.id === activeId ? ` (${currentSuffix})` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
