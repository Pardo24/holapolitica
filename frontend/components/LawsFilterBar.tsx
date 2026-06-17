'use client';

import type { Route } from 'next';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';

import { TopicCombobox } from '@/components/TopicCombobox';
import type { Topic } from '@/lib/api';
import { pickTopicName } from '@/lib/topics';

/**
 * Filter toolbar for /lleis — the same clean, hierarchical pattern as the
 * /votes toolbar, adapted to the laws view:
 *  - SEARCH is the hero (full width, top).
 *  - The TYPE lens (Lleis / Posicionaments / Tot) is the primary segmented
 *    control.
 *  - STATUS (approved / rejected / in progress) is a secondary chip row,
 *    shown for the laws + all lenses (positions carry an unreliable status).
 *  - TOPIC is a drill-down combobox with removable chips.
 *
 * URL-driven and auto-applying: every change pushes the router; search is
 * debounced 400 ms. The /lleis server page reads the same params back.
 */
export type LawsLens = 'lleis' | 'posicionaments' | 'tot';

export interface LawsFilterLabels {
  search_placeholder: string;
  lens_aria: string;
  lens_laws: string;
  lens_positions: string;
  lens_all: string;
  status_all: string;
  status_approved: string;
  status_rejected: string;
  status_in_debate: string;
  topic_label: string;
  topic_placeholder: string;
  topic_clear: string;
  clear_all: string;
  remove_label: string;
}

interface Props {
  topics: Topic[];
  initialQ: string;
  initialLens: LawsLens;
  initialStatus: string;
  initialTopicSlugs: string[];
  locale: string;
  labels: LawsFilterLabels;
}

const STATUS_OPTIONS = ['approved', 'rejected', 'in_debate'] as const;

export function LawsFilterBar({
  topics,
  initialQ,
  initialLens,
  initialStatus,
  initialTopicSlugs,
  locale,
  labels,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();
  const [qDraft, setQDraft] = useState(initialQ);

  const pushUrl = useCallback(
    (next: URLSearchParams) => {
      next.delete('page');
      const qs = next.toString();
      startTransition(() => {
        router.replace((qs ? `/lleis?${qs}` : '/lleis') as Route, { scroll: false });
      });
    },
    [router],
  );

  useEffect(() => {
    setQDraft(initialQ);
  }, [initialQ]);

  useEffect(() => {
    if (qDraft === initialQ) return;
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(sp.toString());
      if (qDraft.trim()) next.set('q', qDraft.trim());
      else next.delete('q');
      pushUrl(next);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [qDraft, initialQ, sp, pushUrl]);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(sp.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      pushUrl(next);
    },
    [sp, pushUrl],
  );

  const setLens = (lens: LawsLens) => setParam('lens', lens === 'lleis' ? null : lens);
  const setStatus = (status: string | null) => setParam('status', status);

  const addTopic = (slug: string) => {
    if (!slug) return;
    const updated = Array.from(new Set([...initialTopicSlugs, slug]));
    setParam('topic_slug', updated.join(','));
  };
  const removeTopic = (slug: string) => {
    const updated = initialTopicSlugs.filter((s) => s !== slug);
    setParam('topic_slug', updated.length ? updated.join(',') : null);
  };

  const clearAll = () => {
    const next = new URLSearchParams(sp.toString());
    ['q', 'lens', 'status', 'topic_slug', 'page'].forEach((k) => next.delete(k));
    pushUrl(next);
  };

  const topicBySlug = useMemo(
    () => new Map(topics.map((tp) => [tp.slug, tp] as const)),
    [topics],
  );

  const totalActive =
    (qDraft.trim() ? 1 : 0) +
    (initialLens !== 'lleis' ? 1 : 0) +
    (initialStatus ? 1 : 0) +
    initialTopicSlugs.length;

  const showStatus = initialLens !== 'posicionaments';
  const lensTabs: { key: LawsLens; label: string }[] = [
    { key: 'lleis', label: labels.lens_laws },
    { key: 'posicionaments', label: labels.lens_positions },
    { key: 'tot', label: labels.lens_all },
  ];
  const statusLabel: Record<string, string> = {
    approved: labels.status_approved,
    rejected: labels.status_rejected,
    in_debate: labels.status_in_debate,
  };

  return (
    <section
      aria-label={labels.search_placeholder}
      style={{
        marginTop: 18,
        padding: 14,
        border: '1px solid var(--rule)',
        borderRadius: 14,
        background: 'var(--paper)',
      }}
    >
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '11px 14px',
          border: '1px solid var(--rule-strong)',
          borderRadius: 10,
          background: 'var(--paper)',
          width: '100%',
        }}
      >
        <Search size={16} aria-hidden="true" style={{ color: 'var(--ink-3)', flex: 'none' }} />
        <input
          type="search"
          placeholder={labels.search_placeholder}
          aria-label={labels.search_placeholder}
          value={qDraft}
          onChange={(e) => setQDraft(e.target.value)}
          style={{
            border: 0,
            background: 'transparent',
            fontSize: 15,
            flex: 1,
            outline: 'none',
            fontFamily: 'inherit',
            color: 'var(--ink)',
            minWidth: 0,
          }}
        />
      </label>

      {/* Primary: type lens + clear. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
        <div
          role="radiogroup"
          aria-label={labels.lens_aria}
          style={{
            display: 'inline-flex',
            gap: 2,
            padding: 3,
            border: '1px solid var(--rule-strong)',
            borderRadius: 999,
            background: 'var(--paper-2)',
          }}
        >
          {lensTabs.map((tab) => {
            const active = initialLens === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setLens(tab.key)}
                style={{
                  cursor: 'pointer',
                  padding: '5px 13px',
                  borderRadius: 999,
                  border: 0,
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  background: active ? 'var(--ink)' : 'transparent',
                  color: active ? 'var(--paper)' : 'var(--ink-2)',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {totalActive > 0 && (
          <button
            type="button"
            onClick={clearAll}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 0,
              color: 'var(--ink-3)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontFamily: 'inherit',
            }}
          >
            <X size={13} aria-hidden="true" />
            {labels.clear_all}
          </button>
        )}
      </div>

      {/* Secondary: status chips (laws/all only) + topic combobox. */}
      {showStatus && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <StatusChip active={!initialStatus} onClick={() => setStatus(null)}>
            {labels.status_all}
          </StatusChip>
          {STATUS_OPTIONS.map((s) => (
            <StatusChip key={s} active={initialStatus === s} onClick={() => setStatus(s)}>
              {statusLabel[s]}
            </StatusChip>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12, maxWidth: 420 }}>
        <span
          style={{
            display: 'block',
            fontSize: 10.5,
            fontWeight: 700,
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: 6,
          }}
        >
          {labels.topic_label}
        </span>
        <TopicCombobox
          name=""
          value=""
          onChange={addTopic}
          topics={topics}
          emptyValue=""
          clearLabel={labels.topic_clear}
          placeholder={labels.topic_placeholder}
          ariaLabel={labels.topic_label}
        />
        {initialTopicSlugs.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {initialTopicSlugs.map((slug) => {
              const tp = topicBySlug.get(slug);
              if (!tp) return null;
              const color = tp.color_hex ?? 'var(--ink-3)';
              return (
                <span
                  key={slug}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 4px 4px 10px',
                    borderRadius: 999,
                    background: `color-mix(in oklch, ${color} 14%, var(--paper))`,
                    border: `1px solid color-mix(in oklch, ${color} 30%, var(--paper))`,
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--ink-2)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{ width: 8, height: 8, borderRadius: 999, background: color }}
                  />
                  {pickTopicName(tp, locale)}
                  <button
                    type="button"
                    onClick={() => removeTopic(slug)}
                    aria-label={`${labels.remove_label} ${pickTopicName(tp, locale)}`}
                    style={{
                      background: 'transparent',
                      border: 0,
                      padding: 2,
                      marginLeft: 2,
                      cursor: 'pointer',
                      color: 'var(--ink-3)',
                      display: 'inline-flex',
                    }}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function StatusChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: '4px 11px',
        borderRadius: 999,
        border: `1px solid ${active ? 'var(--ink)' : 'var(--rule-strong)'}`,
        background: active ? 'var(--ink)' : 'transparent',
        color: active ? 'var(--paper)' : 'var(--ink-2)',
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}
