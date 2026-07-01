'use client';

import { useState } from 'react';

import { GroupBadge } from '@/components/GroupBadge';
import { displayGroupShort } from '@/lib/groups';

/**
 * On-demand "how each group voted across a law's votes" matrix.
 *
 * A law gets voted several times in a session (amendments, articles, the
 * whole text). This shows, for each parliamentary group, its majority stance
 * on each of those votes as a coloured dot — so who voted what, and who
 * CHANGED between votes, reads at a glance.
 *
 * Loads on demand (a "see how each group voted" button) so the session sheet
 * doesn't fetch a breakdown for every grouped law up front. Fetches the
 * public API directly from the browser (CORS allows our own origin).
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

const CHOICE_COLOR: Record<string, string> = {
  aye: 'var(--aye, #16A34A)',
  no: 'var(--no, #DC2626)',
  abstention: 'var(--abst, #CA8A04)',
  absent: 'var(--rule-strong)',
};

interface GroupRow {
  slug: string;
  name_short: string;
  color_hex: string | null;
  choices: Record<string, string>;
}

export interface GroupVoteMatrixLabels {
  show: string;
  loading: string;
  error: string;
  title: string;
  aye: string;
  no: string;
  abstention: string;
  absent: string;
}

export function GroupVoteMatrix({
  votes,
  labels,
}: {
  /** The law's votes, in the same (sequence) order as the rows above. */
  votes: { id: number; seq: number | null }[];
  labels: GroupVoteMatrixLabels;
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [rows, setRows] = useState<GroupRow[]>([]);

  const load = async () => {
    setState('loading');
    try {
      const ids = votes.map((v) => v.id).join(',');
      const res = await fetch(`${API_BASE}/votes/group-choices?ids=${ids}`);
      if (!res.ok) throw new Error(String(res.status));
      const data: { groups: GroupRow[] } = await res.json();
      setRows(data.groups ?? []);
      setState('loaded');
    } catch {
      setState('error');
    }
  };

  if (state === 'idle' || state === 'loading' || state === 'error') {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (state !== 'loading') load();
        }}
        style={{
          marginTop: 10,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderRadius: 999,
          border: '1px solid var(--rule-strong)',
          background: 'transparent',
          color: 'var(--ink-2)',
          fontSize: 11,
          fontWeight: 600,
          cursor: state === 'loading' ? 'progress' : 'pointer',
        }}
      >
        {state === 'loading' ? labels.loading : state === 'error' ? labels.error : labels.show}
      </button>
    );
  }

  const choiceLabel = (c: string): string =>
    c === 'aye' ? labels.aye : c === 'no' ? labels.no : c === 'abstention' ? labels.abstention : labels.absent;

  return (
    <div style={{ marginTop: 10 }}>
      <div
        className="eyebrow"
        style={{ fontSize: 9, color: 'var(--ink-3)', marginBottom: 6 }}
      >
        {labels.title}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0 }} />
              {votes.map((v, i) => (
                <th
                  key={v.id}
                  className="tabular"
                  style={{
                    padding: '2px 5px',
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--ink-3)',
                    textAlign: 'center',
                    minWidth: 22,
                  }}
                >
                  {v.seq != null ? String(v.seq).padStart(2, '0') : i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.slug}>
                <th
                  scope="row"
                  style={{
                    position: 'sticky',
                    left: 0,
                    background: 'var(--paper)',
                    padding: '3px 10px 3px 0',
                    textAlign: 'left',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <GroupBadge slug={g.slug} color={g.color_hex} size="xs" link={false} />
                    <span style={{ color: 'var(--ink)' }}>{displayGroupShort(g.name_short)}</span>
                  </span>
                </th>
                {votes.map((v) => {
                  const c = g.choices[String(v.id)];
                  return (
                    <td key={v.id} style={{ padding: '3px 5px', textAlign: 'center' }}>
                      {c ? (
                        <span
                          title={choiceLabel(c)}
                          aria-label={choiceLabel(c)}
                          style={{
                            display: 'inline-block',
                            width: 11,
                            height: 11,
                            borderRadius: 999,
                            background: CHOICE_COLOR[c] ?? 'var(--rule)',
                            border:
                              c === 'absent' ? '1px solid var(--rule-strong)' : '0',
                            boxSizing: 'border-box',
                            opacity: c === 'absent' ? 0.5 : 1,
                            verticalAlign: 'middle',
                          }}
                        />
                      ) : (
                        <span aria-hidden="true" style={{ color: 'var(--ink-3)' }}>
                          ·
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Legend */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginTop: 8,
          fontSize: 10,
          color: 'var(--ink-3)',
          flexWrap: 'wrap',
        }}
      >
        {(['aye', 'no', 'abstention', 'absent'] as const).map((c) => (
          <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span
              aria-hidden="true"
              style={{
                width: 9,
                height: 9,
                borderRadius: 999,
                background: CHOICE_COLOR[c],
                border: c === 'absent' ? '1px solid var(--rule-strong)' : '0',
                boxSizing: 'border-box',
                opacity: c === 'absent' ? 0.5 : 1,
              }}
            />
            {choiceLabel(c)}
          </span>
        ))}
      </div>
    </div>
  );
}
