'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Reloads the server-rendered results every ``seconds`` while the count is
 * running, only while the tab is visible. The page cache in front serves
 * the same render to everyone, so this costs one request per reader.
 */
export function ResultsAutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);
  return null;
}

export interface SumParty {
  key: string;
  label: string;
  color: string;
  seats: number;
}

/**
 * Add up the seats of any lists the reader picks, against the absolute
 * majority. No blocs, no suggested pacts: the reader chooses.
 */
export function SeatSum({
  parties,
  majority,
  labels,
}: {
  parties: SumParty[];
  majority: number;
  labels: { title: string; hint: string; total: { one: string; other: string }; yes: string; no: string; clear: string };
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const total = parties.filter((p) => picked.has(p.key)).reduce((a, p) => a + p.seats, 0);
  const seatsText = (total === 1 ? labels.total.one : labels.total.other).replace('#', String(total));
  const reached = total >= majority;
  const toggle = (key: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <section className="rsum" aria-labelledby="rsum-title">
      <h2 id="rsum-title" className="esec-title">
        {labels.title}
      </h2>
      <p className="rsum__hint">{labels.hint}</p>
      <div className="rsum__chips">
        {parties.map((p) => (
          <button
            key={p.key}
            type="button"
            className="rsum__chip"
            aria-pressed={picked.has(p.key)}
            onClick={() => toggle(p.key)}
            style={{ ['--party' as string]: p.color }}
          >
            <span className="rsum__dot" aria-hidden="true" />
            {p.label} <span className="tabular rsum__n">{p.seats}</span>
          </button>
        ))}
      </div>
      <div className="rsum__result" aria-live="polite">
        <div className="rsum__bar" aria-hidden="true">
          {parties
            .filter((p) => picked.has(p.key))
            .map((p) => (
              <span key={p.key} style={{ width: `${(100 * p.seats) / (2 * majority - 2)}%`, background: p.color }} />
            ))}
          <i style={{ left: `${(100 * majority) / (2 * majority - 2)}%` }} />
        </div>
        <p className="rsum__total">
          <b className="tabular">{seatsText}</b>
          {total > 0 && (
            <span className={reached ? 'rsum__verdict rsum__verdict--yes' : 'rsum__verdict'}>
              {reached ? labels.yes : labels.no.replace('{n}', String(majority - total))}
            </span>
          )}
          {picked.size > 0 && (
            <button type="button" className="rsum__clear" onClick={() => setPicked(new Set())}>
              {labels.clear}
            </button>
          )}
        </p>
      </div>
    </section>
  );
}
