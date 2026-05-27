'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';

import { GroupBadge } from '@/components/GroupBadge';
import { GroupCombobox } from '@/components/GroupCombobox';
import { TopicCombobox } from '@/components/TopicCombobox';
import type {
  ParliamentaryGroupSummary,
  Topic,
  VoteResult,
} from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';
import { pickTopicName } from '@/lib/topics';

/**
 * Auto-apply filter card for /votes.
 *
 * Replaces the previous server-rendered form + "Apply" button with a
 * client component that pushes URL changes the moment the user picks a
 * value. Multi-value for topic and group (both stored in URL as
 * comma-separated slugs, e.g. ``?topic_slug=habitatge,sanitat``); the
 * search input debounces typing at 400 ms idle so the URL doesn't churn
 * on every keystroke.
 *
 * Selected topic / group chips are rendered inline under each combobox
 * with their own × to remove a single value. The result-row chips are
 * a four-way radio (All / Aprovada / Rebutjada / Empat) with the
 * checked state derived from the URL on every render — so toggling a
 * chip is the same trip through the router as any other field, no
 * local UI drift.
 *
 * No "Apply" button. The filters apply themselves.
 */
export interface VotesFilterCardLabels {
  search: string;
  search_placeholder: string;
  topics_label: string;
  topics_placeholder: string;
  topics_clear: string;
  groups_label: string;
  groups_placeholder: string;
  groups_clear: string;
  group_government: string;
  result_label: string;
  result_all: string;
  result_approved: string;
  result_rejected: string;
  result_tie: string;
  clear_all: string;
  remove_label: string;
}

interface Props {
  topics: Topic[];
  groups: ParliamentaryGroupSummary[];
  initialQ: string;
  initialTopicSlugs: string[];
  initialGroupSlugs: string[];
  initialResult: VoteResult | '';
  hasOtherActiveFilters: boolean;
  locale: string;
  labels: VotesFilterCardLabels;
}

export function VotesFilterCard({
  topics,
  groups,
  initialQ,
  initialTopicSlugs,
  initialGroupSlugs,
  initialResult,
  hasOtherActiveFilters,
  locale,
  labels,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  // Wrap every router.replace in startTransition so React skips the
  // loading.tsx skeleton and keeps the current list visible until the
  // new SSR pass resolves. Without this, every chip/combobox tap
  // flashes the gray skeleton and reads as a full page refresh.
  const [, startTransition] = useTransition();
  // q is the only field that doesn't apply immediately; we debounce
  // it 400 ms after the last keystroke so typing doesn't push the
  // router on every character. The rest fire on selection.
  const [qDraft, setQDraft] = useState(initialQ);

  const pushUrl = useCallback(
    (next: URLSearchParams) => {
      next.delete('page');
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `/votes?${qs}` : '/votes', { scroll: false });
      });
    },
    [router],
  );

  // Reset the local draft when the URL changes externally (e.g. user
  // clicks a topic chip in the strip above). Without this the typed
  // value would stick around after an out-of-band navigation.
  useEffect(() => {
    setQDraft(initialQ);
  }, [initialQ]);

  // Debounced push of the search box.
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

  const updateMulti = useCallback(
    (paramKey: string, current: string[], slug: string, add: boolean) => {
      if (!slug) return;
      const next = new URLSearchParams(sp.toString());
      const updated = add
        ? Array.from(new Set([...current, slug]))
        : current.filter((s) => s !== slug);
      if (updated.length === 0) next.delete(paramKey);
      else next.set(paramKey, updated.join(','));
      pushUrl(next);
    },
    [sp, pushUrl],
  );

  const addTopic = (slug: string) =>
    updateMulti('topic_slug', initialTopicSlugs, slug, true);
  const removeTopic = (slug: string) =>
    updateMulti('topic_slug', initialTopicSlugs, slug, false);
  const addGroup = (slug: string) =>
    updateMulti('proposing_group_slug', initialGroupSlugs, slug, true);
  const removeGroup = (slug: string) =>
    updateMulti('proposing_group_slug', initialGroupSlugs, slug, false);

  const setResult = (value: VoteResult | '') => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set('result', value);
    else next.delete('result');
    pushUrl(next);
  };

  const clearAll = () => {
    // Wipe everything we own; leave tab/kind alone so the user stays
    // on the same view if those carryover params are around.
    const next = new URLSearchParams(sp.toString());
    next.delete('q');
    next.delete('topic_slug');
    next.delete('proposing_group_slug');
    next.delete('result');
    next.delete('date_from');
    next.delete('date_to');
    next.delete('page');
    pushUrl(next);
  };

  const topicBySlug = useMemo(
    () => new Map(topics.map((tp) => [tp.slug, tp] as const)),
    [topics],
  );
  const groupBySlug = useMemo(
    () => new Map(groups.map((g) => [g.slug, g] as const)),
    [groups],
  );

  const totalActive =
    (qDraft.trim() ? 1 : 0) +
    initialTopicSlugs.length +
    initialGroupSlugs.length +
    (initialResult ? 1 : 0) +
    (hasOtherActiveFilters ? 1 : 0);

  return (
    <section
      aria-label={labels.search}
      className="votes-filter-card"
      style={{
        marginTop: 14,
        padding: 16,
        border: '1px solid var(--rule-strong)',
        borderRadius: 12,
        background: 'var(--paper-2)',
      }}
    >
      <div
        className="votes-filter-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 12,
          alignItems: 'start',
        }}
      >
        <Field label={labels.search}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              border: '1px solid var(--rule-strong)',
              borderRadius: 10,
              background: 'var(--paper)',
              width: '100%',
            }}
          >
            <span
              aria-hidden="true"
              style={{ color: 'var(--ink-3)', display: 'inline-flex' }}
            >
              <Search size={14} aria-hidden="true" />
            </span>
            <input
              type="search"
              placeholder={labels.search_placeholder}
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              style={{
                border: 0,
                background: 'transparent',
                fontSize: 14,
                flex: 1,
                outline: 'none',
                fontFamily: 'inherit',
                color: 'var(--ink)',
                minWidth: 0,
              }}
            />
          </label>
        </Field>

        <Field label={labels.topics_label}>
          <TopicCombobox
            name=""
            value=""
            onChange={addTopic}
            topics={topics}
            emptyValue=""
            clearLabel={labels.topics_clear}
            placeholder={labels.topics_placeholder}
            ariaLabel={labels.topics_label}
          />
          {initialTopicSlugs.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                marginTop: 8,
              }}
            >
              {initialTopicSlugs.map((slug) => {
                const tp = topicBySlug.get(slug);
                if (!tp) return null;
                const color = tp.color_hex ?? 'var(--ink-3)';
                return (
                  <SelectedChip
                    key={slug}
                    label={pickTopicName(tp, locale)}
                    accentDot={color}
                    accentBg={`color-mix(in oklch, ${color} 14%, var(--paper))`}
                    accentBorder={`color-mix(in oklch, ${color} 30%, var(--paper))`}
                    onRemove={() => removeTopic(slug)}
                    removeLabel={labels.remove_label}
                  />
                );
              })}
            </div>
          )}
        </Field>

        <Field label={labels.groups_label}>
          <GroupCombobox
            name=""
            value=""
            onChange={addGroup}
            groups={groups}
            extraOptions={[
              { slug: 'govern', label: labels.group_government },
            ]}
            emptyValue=""
            clearLabel={labels.groups_clear}
            placeholder={labels.groups_placeholder}
            ariaLabel={labels.groups_label}
          />
          {initialGroupSlugs.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                marginTop: 8,
              }}
            >
              {initialGroupSlugs.map((slug) => {
                if (slug === 'govern') {
                  return (
                    <SelectedChip
                      key={slug}
                      label={labels.group_government}
                      onRemove={() => removeGroup(slug)}
                      removeLabel={labels.remove_label}
                    />
                  );
                }
                const g = groupBySlug.get(slug);
                if (!g) return null;
                return (
                  <SelectedChip
                    key={slug}
                    label={displayGroupShort(g.name_short)}
                    accent={
                      <GroupBadge
                        slug={g.slug}
                        color={g.color_hex}
                        size="xs"
                        link={false}
                        logoUrl={g.logo_url}
                      />
                    }
                    accentBg={
                      g.color_hex
                        ? `color-mix(in oklch, ${g.color_hex} 14%, var(--paper))`
                        : undefined
                    }
                    accentBorder={
                      g.color_hex
                        ? `color-mix(in oklch, ${g.color_hex} 30%, var(--paper))`
                        : undefined
                    }
                    onRemove={() => removeGroup(slug)}
                    removeLabel={labels.remove_label}
                  />
                );
              })}
            </div>
          )}
        </Field>
      </div>

      <div style={{ marginTop: 14 }}>
        <Field label={labels.result_label}>
          <div
            role="radiogroup"
            aria-label={labels.result_label}
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
          >
            <ResultChip
              checked={!initialResult}
              label={labels.result_all}
              accent="ink"
              onClick={() => setResult('')}
            />
            <ResultChip
              checked={initialResult === 'approved'}
              label={labels.result_approved}
              accent="aye"
              onClick={() => setResult('approved')}
            />
            <ResultChip
              checked={initialResult === 'rejected'}
              label={labels.result_rejected}
              accent="no"
              onClick={() => setResult('rejected')}
            />
            <ResultChip
              checked={initialResult === 'tie'}
              label={labels.result_tie}
              accent="abst"
              onClick={() => setResult('tie')}
            />
          </div>
        </Field>
      </div>

      {totalActive > 0 && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: '1px solid var(--rule)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={clearAll}
            style={{
              background: 'transparent',
              border: 0,
              color: 'var(--ink-2)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              padding: '4px 8px',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            × {labels.clear_all}
          </button>
        </div>
      )}

      <style>{`
        @media (max-width: 980px) {
          .votes-filter-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }
        @media (max-width: 600px) {
          .votes-filter-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: 'var(--ink-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function SelectedChip({
  label,
  accent,
  accentDot,
  accentBg,
  accentBorder,
  onRemove,
  removeLabel,
}: {
  label: string;
  accent?: React.ReactNode;
  accentDot?: string;
  accentBg?: string;
  accentBorder?: string;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 4px 4px 10px',
        borderRadius: 999,
        background: accentBg ?? 'var(--paper)',
        border: `1px solid ${accentBorder ?? 'var(--rule-strong)'}`,
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--ink-2)',
        whiteSpace: 'nowrap',
      }}
    >
      {accent ?? (accentDot ? (
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: accentDot,
          }}
        />
      ) : null)}
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${removeLabel} ${label}`}
        style={{
          background: 'transparent',
          border: 0,
          padding: 2,
          marginLeft: 2,
          cursor: 'pointer',
          color: 'var(--ink-3)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 999,
        }}
      >
        <X size={12} aria-hidden="true" />
      </button>
    </span>
  );
}

function ResultChip({
  checked,
  label,
  accent,
  onClick,
}: {
  checked: boolean;
  label: string;
  accent: 'ink' | 'aye' | 'no' | 'abst';
  onClick: () => void;
}) {
  const accentVar = accent === 'ink' ? 'var(--ink-2)' : `var(--${accent})`;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      style={{
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        border: checked
          ? `1.5px solid ${accentVar}`
          : '1px solid var(--rule-strong)',
        background: checked
          ? `color-mix(in oklch, ${accentVar} 14%, var(--paper))`
          : 'var(--paper)',
        color: checked ? accentVar : 'var(--ink-2)',
        transition: 'background-color 120ms ease, border-color 120ms ease',
        whiteSpace: 'nowrap',
        fontFamily: 'inherit',
      }}
    >
      {accent !== 'ink' && (
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: accentVar,
            display: 'inline-block',
          }}
        />
      )}
      {label}
    </button>
  );
}
