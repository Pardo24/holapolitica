'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Loader2, LocateFixed, MapPin } from 'lucide-react';

import type { ConstituencyRow } from '@/lib/api';
import { nearestProvince } from '@/lib/provinces';

/**
 * "Who represents me?" in one tap.
 *
 * Two shapes for the two moments:
 *
 *   hero  nothing chosen yet. One big button that asks the phone where it
 *         is, and a quiet "or pick it yourself" underneath for anyone who
 *         would rather not share a location, or whose location is wrong.
 *   bar   a province is chosen. The answer is the list below, so the
 *         picker shrinks to one line, with "Change" kept small: the reader
 *         came for the deputies, not for the picker.
 *
 * Privacy: the GPS fix is turned into a province ON THE DEVICE (nearest
 * centroid, lib/provinces.ts). The coordinates are never sent anywhere.
 * What IS kept is the province name, in a first-party cookie, so the tab
 * opens on your deputies next time instead of asking again. The URL still
 * wins over the cookie, so a shared ?prov= link shows what was shared.
 *
 * Nearest-centroid can miss near a provincial border, which is why the bar
 * phrases the change link as "not yours?" rather than hiding it.
 */

const COOKIE = 'hp_prov';
const YEAR = 60 * 60 * 24 * 365;

export interface ProvincePickerLabels {
  title: string;
  body: string;
  cta: string;
  detecting: string;
  manual: string;
  privacy: string;
  placeholder: string;
  change: string;
  notYours: string;
  errorGeneric: string;
  errorDenied: string;
  errorOutside: string;
}

export function ProvincePicker({
  variant,
  constituencies,
  selected,
  counts,
  labels,
}: {
  variant: 'hero' | 'bar';
  constituencies: ConstituencyRow[];
  selected: string | null;
  /** "32 diputats · 6 grups", already formatted; bar only. */
  counts?: string;
  labels: ProvincePickerLabels;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = detecting || pending;

  function go(value: string) {
    if (!value) return;
    document.cookie = `${COOKIE}=${encodeURIComponent(value)}; Max-Age=${YEAR}; Path=/; SameSite=Lax`;
    startTransition(() => router.replace(`/el-teu-diputat?prov=${encodeURIComponent(value)}`, { scroll: false }));
  }

  function locate() {
    setError(null);
    if (!('geolocation' in navigator)) {
      setError(labels.errorGeneric);
      return;
    }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDetecting(false);
        const name = nearestProvince(pos.coords.latitude, pos.coords.longitude);
        if (name && constituencies.some((c) => c.name === name)) go(name);
        else setError(labels.errorOutside);
      },
      (err) => {
        setDetecting(false);
        setError(err.code === err.PERMISSION_DENIED ? labels.errorDenied : labels.errorGeneric);
      },
      // A province does not need a precise fix: a coarse, cached one comes
      // back faster and is less of an ask.
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 30 * 60 * 1000 },
    );
  }

  // The native picker, dressed as whatever sits on top of it. On a phone
  // this opens the OS's own wheel / list, which beats any custom dropdown.
  const select = (className: string, children: React.ReactNode) => (
    <label className={className}>
      {children}
      <select
        value={selected ?? ''}
        onChange={(e) => go(e.target.value)}
        disabled={busy}
        aria-label={labels.placeholder}
      >
        <option value="" disabled>
          {labels.placeholder}
        </option>
        {constituencies.map((c) => (
          <option key={c.name} value={c.name}>
            {c.name} ({c.deputies})
          </option>
        ))}
      </select>
    </label>
  );

  if (variant === 'bar' && selected) {
    return (
      <div className="prov-bar">
        <span className="prov-bar__pin" aria-hidden="true">
          {busy ? <Loader2 size={17} className="geo-spinner" /> : <MapPin size={17} strokeWidth={2} />}
        </span>
        <span className="prov-bar__text">
          <strong>{selected}</strong>
          {counts && <span className="tabular">{counts}</span>}
        </span>
        {select(
          'prov-bar__change',
          <span>
            {labels.notYours} <u>{labels.change}</u>
          </span>,
        )}
        <SpinnerStyle />
      </div>
    );
  }

  return (
    <section className="prov-hero" aria-labelledby="prov-hero-title">
      <span className="prov-hero__icon" aria-hidden="true">
        <MapPin size={26} strokeWidth={1.9} />
      </span>
      <h2 id="prov-hero-title" className="prov-hero__title">
        {labels.title}
      </h2>
      <p className="prov-hero__body">{labels.body}</p>
      <button type="button" className="prov-hero__cta no-touch-pad" onClick={locate} disabled={busy} aria-busy={busy}>
        {busy ? (
          <Loader2 size={19} strokeWidth={2.2} aria-hidden="true" className="geo-spinner" />
        ) : (
          <LocateFixed size={19} strokeWidth={2.2} aria-hidden="true" />
        )}
        {busy ? labels.detecting : labels.cta}
      </button>
      {error && (
        <p className="prov-hero__error" role="status">
          {error}
        </p>
      )}
      {select(
        'prov-hero__manual',
        <span>
          {labels.manual} <ChevronDown size={14} strokeWidth={2.2} aria-hidden="true" />
        </span>,
      )}
      <p className="prov-hero__privacy">{labels.privacy}</p>
      <SpinnerStyle />
    </section>
  );
}

function SpinnerStyle() {
  return (
    <style>{`
      .geo-spinner { animation: geo-spin 0.9s linear infinite; }
      @keyframes geo-spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) { .geo-spinner { animation: none; } }
    `}</style>
  );
}
