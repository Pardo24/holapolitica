'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MapPinned } from 'lucide-react';

import type { ConstituencyRow } from '@/lib/api';
import { nearestProvince } from '@/lib/provinces';

/**
 * Province picker for "El teu diputat". URL-driven (?prov=…) so a chosen
 * constituency can be shared or bookmarked. The "use my location" button maps
 * the device's GPS to a province ENTIRELY ON THE DEVICE (nearest centroid) —
 * the coordinates never leave the browser.
 */
export function ConstituencySelect({
  constituencies,
  selected,
  label,
  placeholder,
  geolocateLabel,
  detectingLabel,
  geolocateError,
}: {
  constituencies: ConstituencyRow[];
  selected: string | null;
  label: string;
  placeholder: string;
  geolocateLabel: string;
  detectingLabel: string;
  geolocateError: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState(false);

  function go(value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set('prov', value);
    else next.delete('prov');
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `?${qs}` : '?', { scroll: false }));
  }

  function detect() {
    setError(false);
    if (!('geolocation' in navigator)) {
      setError(true);
      return;
    }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDetecting(false);
        const name = nearestProvince(pos.coords.latitude, pos.coords.longitude);
        if (name && constituencies.some((c) => c.name === name)) go(name);
        else setError(true);
      },
      () => {
        setDetecting(false);
        setError(true);
      },
      { timeout: 10000, maximumAge: 600000 },
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
          <span style={{ color: 'var(--ink-2)' }}>{label}</span>
          <select
            value={selected ?? ''}
            onChange={(e) => go(e.target.value)}
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
        <button
          type="button"
          onClick={detect}
          disabled={detecting}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 999,
            border: '1px solid var(--rule-strong)',
            background: 'var(--paper-2)',
            color: 'var(--ink-2)',
            fontSize: 13,
            fontWeight: 600,
            cursor: detecting ? 'progress' : 'pointer',
          }}
        >
          <MapPinned size={15} strokeWidth={1.8} aria-hidden="true" />
          {detecting ? detectingLabel : geolocateLabel}
        </button>
      </div>
      {error && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{geolocateError}</span>}
    </div>
  );
}
