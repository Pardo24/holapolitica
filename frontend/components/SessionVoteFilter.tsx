'use client';

import { useEffect, useRef, useState } from 'react';

type ResultFilter = 'all' | 'approved' | 'rejected';

export interface TopicOption {
  slug: string;
  name: string;
  color: string | null;
}

/**
 * Filters for the plenary session sheet: by the item's result and by
 * topic. Topics are a filter over the whole list, not a second list.
 *
 * The rows are server-rendered ``<li data-result data-topics>`` (one per
 * item; the nested sub-votes carry neither, so they follow their item).
 * This client wrapper hides the rows that don't match both filters,
 * hides a section (``.session-kind-group``) left with no row, and opens
 * the folded "Trámites" section when a filter finds something inside it.
 *
 * The lede's topic links point at ``#tema-<slug>``: arriving on that hash
 * applies the topic filter and scrolls to the list.
 */
export function SessionVoteFilter({
  labels,
  topics,
  children,
}: {
  labels: {
    eyebrow: string;
    all: string;
    approved: string;
    rejected: string;
    topicEyebrow: string;
    topicAll: string;
    empty: string;
  };
  topics: TopicOption[];
  children: React.ReactNode;
}) {
  const [result, setResult] = useState<ResultFilter>('all');
  const [topic, setTopic] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fromHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id.startsWith('tema-')) return;
      const slug = id.slice('tema-'.length);
      if (!topics.some((tp) => tp.slug === slug)) return;
      setTopic(slug);
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [topics]);

  useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const filtering = result !== 'all' || topic != null;
    let anyVisible = false;
    root.querySelectorAll<HTMLLIElement>('li[data-result]').forEach((li) => {
      const okResult = result === 'all' || li.dataset.result === result;
      const okTopic = topic == null || (li.dataset.topics ?? '').split(' ').includes(topic);
      const show = okResult && okTopic;
      li.style.display = show ? '' : 'none';
      if (show) anyVisible = true;
    });
    root.querySelectorAll<HTMLElement>('.session-kind-group').forEach((group) => {
      const hasRow = Array.from(group.querySelectorAll<HTMLLIElement>('li[data-result]')).some(
        (li) => li.style.display !== 'none',
      );
      group.style.display = hasRow ? '' : 'none';
      if (group instanceof HTMLDetailsElement && filtering) group.open = hasRow;
    });
    setEmpty(!anyVisible);
  }, [result, topic]);

  const chip = (
    key: string,
    active: boolean,
    onClick: () => void,
    label: string,
    dot?: string | null,
  ) => (
    <button
      key={key}
      type="button"
      aria-pressed={active}
      onClick={onClick}
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
        flex: 'none',
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

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 10,
  };
  const eyebrowStyle: React.CSSProperties = {
    margin: 0,
    marginRight: 4,
    color: 'var(--ink-3)',
    flex: 'none',
  };

  return (
    <section ref={sectionRef} style={{ marginBottom: 8, scrollMarginTop: 64 }}>
      <div role="group" aria-label={labels.eyebrow} style={{ ...rowStyle, flexWrap: 'wrap' }}>
        <span className="eyebrow" style={eyebrowStyle}>
          {labels.eyebrow}
        </span>
        {chip('all', result === 'all', () => setResult('all'), labels.all)}
        {chip(
          'approved',
          result === 'approved',
          () => setResult('approved'),
          labels.approved,
          'var(--aye, #16A34A)',
        )}
        {chip(
          'rejected',
          result === 'rejected',
          () => setResult('rejected'),
          labels.rejected,
          'var(--no, #DC2626)',
        )}
      </div>
      {topics.length > 1 && (
        // One swipeable line on phones rather than a wall of wrapped chips.
        <div
          role="group"
          aria-label={labels.topicEyebrow}
          style={{ ...rowStyle, overflowX: 'auto', marginBottom: 4 }}
        >
          <span className="eyebrow" style={eyebrowStyle}>
            {labels.topicEyebrow}
          </span>
          {chip('topic-all', topic == null, () => setTopic(null), labels.topicAll)}
          {topics.map((tp) =>
            chip(
              `topic-${tp.slug}`,
              topic === tp.slug,
              () => setTopic(topic === tp.slug ? null : tp.slug),
              tp.name,
              tp.color,
            ),
          )}
        </div>
      )}
      <div ref={listRef}>{children}</div>
      {empty && (
        <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '12px 0 20px' }}>
          {labels.empty}
        </p>
      )}
    </section>
  );
}
