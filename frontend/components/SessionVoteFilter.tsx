'use client';

import { useRef, useState } from 'react';

type Filter = 'all' | 'approved' | 'rejected';

/**
 * Result filter for the plenary session sheet's collapsible topic tree.
 *
 * Renders three toggle chips (all / approved / rejected) above the
 * server-rendered `<details>` topic groups (passed as ``children``). The
 * groups and their vote rows are server-rendered with ``data-result`` on
 * each row `<li>`; this client wrapper just sets a class on the container so
 * CSS hides the non-matching rows, and imperatively opens the groups that
 * have a match (collapsing the rest) so a filtered view reads at a glance
 * instead of needing every topic expanded by hand.
 *
 * Picking "all" restores the default collapsed tree.
 */
export function SessionVoteFilter({
  labels,
  children,
}: {
  labels: { eyebrow: string; all: string; approved: string; rejected: string };
  children: React.ReactNode;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const ref = useRef<HTMLDivElement>(null);

  const apply = (next: Filter) => {
    setFilter(next);
    const root = ref.current;
    if (!root) return;
    const groups = root.querySelectorAll<HTMLDetailsElement>('details.session-topic-group');
    groups.forEach((d) => {
      if (next === 'all') {
        d.style.display = '';
        d.open = false; // back to the collapsed default
        return;
      }
      const hasMatch = d.querySelector(`li[data-result="${next}"]`) != null;
      d.style.display = hasMatch ? '' : 'none';
      d.open = hasMatch;
    });
  };

  const chip = (value: Filter, label: string, dot?: string) => {
    const active = filter === value;
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={() => apply(value)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 12px',
          borderRadius: 999,
          border: `1px solid ${active ? 'var(--ink)' : 'var(--rule-strong)'}`,
          background: active ? 'var(--ink)' : 'transparent',
          color: active ? 'var(--paper)' : 'var(--ink-2)',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {dot && (
          <span
            aria-hidden="true"
            style={{ width: 8, height: 8, borderRadius: 999, background: dot, flex: 'none' }}
          />
        )}
        {label}
      </button>
    );
  };

  return (
    <section style={{ marginBottom: 8 }}>
      <div
        role="group"
        aria-label={labels.eyebrow}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          paddingBottom: 12,
          marginBottom: 4,
        }}
      >
        <span
          className="eyebrow"
          style={{ margin: 0, marginRight: 4, color: 'var(--ink-3)' }}
        >
          {labels.eyebrow}
        </span>
        {chip('all', labels.all)}
        {chip('approved', labels.approved, 'var(--aye, #16A34A)')}
        {chip('rejected', labels.rejected, 'var(--no, #DC2626)')}
      </div>
      <div ref={ref} className={`session-vote-filter session-vote-filter--${filter}`}>
        {children}
      </div>
      <style>{`
        .session-vote-filter--approved li[data-result='rejected'],
        .session-vote-filter--approved li[data-result='tie'],
        .session-vote-filter--rejected li[data-result='approved'],
        .session-vote-filter--rejected li[data-result='tie'] {
          display: none;
        }
      `}</style>
    </section>
  );
}
