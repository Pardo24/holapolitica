'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, ChevronDown, Scale, Search, SlidersHorizontal, X } from 'lucide-react';

import { GroupBadge } from '@/components/GroupBadge';
import { GroupCombobox } from '@/components/GroupCombobox';
import { LegislatureSelector } from '@/components/LegislatureSelector';
import { TopicCombobox } from '@/components/TopicCombobox';
import type { Legislature, ParliamentaryGroupSummary, Topic, VoteResult } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';
import { useEdgeFade } from '@/lib/useEdgeFade';
import { pickTopicName } from '@/lib/topics';

/**
 * Filter toolbar for /votes.
 *
 * Every control on the page lives here — the page used to stack this card
 * under a separate legislature/lens row and a topic strip, three toolbars
 * deep before the first vote.
 *
 * Design: a clean toolbar with a clear hierarchy rather than a flat form.
 *  - The SEARCH box is the hero (full width, top).
 *  - RESULT is the primary categorical filter — a compact segmented
 *    control, always visible, since "approved / rejected" is the question
 *    most readers come with. The LAWS-ONLY lens sits beside it: it changes
 *    what the archive contains, so it belongs in the primary row.
 *  - TOPIC, GROUP and the LEGISLATURE switch are secondary "drill-downs"
 *    tucked behind a "More filters" disclosure, so the default view stays
 *    uncluttered. The panel auto-opens whenever one of those is active, so
 *    a selection is never hidden.
 *  - Active topic/group selections render as removable chips, as does a
 *    date arrived at from another page; "Clear all" appears only when
 *    something is filtered.
 *
 * URL-driven and auto-applying (no Apply button): every change pushes the
 * router. Multi-value for topic + group (comma-separated slugs); search is
 * debounced 400 ms.
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
  more_filters: string;
  law_only: string;
  legislature_label: string;
  legislature_current: string;
}

interface Props {
  topics: Topic[];
  groups: ParliamentaryGroupSummary[];
  initialQ: string;
  initialTopicSlugs: string[];
  initialGroupSlugs: string[];
  initialResult: VoteResult | '';
  /** ``?law=1`` — keep only the votes that make law. */
  lawOnly: boolean;
  /** Already-formatted single day, when the URL carries date_from=date_to. */
  activeDateLabel: string | null;
  /** Empty (or single) when there is nothing to switch between. */
  legislatures: Legislature[];
  activeLegId: number | null;
  selectedLegId: number | null;
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
  lawOnly,
  activeDateLabel,
  legislatures,
  activeLegId,
  selectedLegId,
  locale,
  labels,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const resultScroller = useEdgeFade<HTMLDivElement>();
  const [, startTransition] = useTransition();
  const [qDraft, setQDraft] = useState(initialQ);

  // Browsing a past term is a context, not a filter, but it is just as
  // hidden inside the disclosure, so it counts towards the badge and opens
  // the panel.
  const historicalLeg =
    selectedLegId != null && activeLegId != null && selectedLegId !== activeLegId;
  const secondaryActive =
    initialTopicSlugs.length + initialGroupSlugs.length + (historicalLeg ? 1 : 0);
  // Disclosure for the secondary (topic / group / legislature) controls.
  // Open by default only when one is already applied, so a selection is
  // never hidden.
  const [expanded, setExpanded] = useState(secondaryActive > 0);

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

  useEffect(() => {
    setQDraft(initialQ);
  }, [initialQ]);

  // Keep the panel open whenever a secondary control is engaged, so what is
  // filtering the list is never out of sight.
  useEffect(() => {
    if (initialTopicSlugs.length > 0 || initialGroupSlugs.length > 0 || historicalLeg) {
      setExpanded(true);
    }
  }, [initialTopicSlugs.length, initialGroupSlugs.length, historicalLeg]);

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

  const addTopic = (slug: string) => updateMulti('topic_slug', initialTopicSlugs, slug, true);
  const removeTopic = (slug: string) => updateMulti('topic_slug', initialTopicSlugs, slug, false);
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

  const toggleLawOnly = () => {
    const next = new URLSearchParams(sp.toString());
    if (lawOnly) next.delete('law');
    else next.set('law', '1');
    pushUrl(next);
  };

  const clearDate = () => {
    const next = new URLSearchParams(sp.toString());
    next.delete('date_from');
    next.delete('date_to');
    pushUrl(next);
  };

  const clearAll = () => {
    const next = new URLSearchParams(sp.toString());
    // `legislature` survives: it says WHICH archive you are reading, not
    // how it is filtered, so clearing the filters shouldn't teleport you
    // back to the current term.
    next.delete('q');
    next.delete('topic_slug');
    next.delete('proposing_group_slug');
    next.delete('result');
    next.delete('law');
    next.delete('date_from');
    next.delete('date_to');
    next.delete('page');
    pushUrl(next);
  };

  const topicBySlug = useMemo(() => new Map(topics.map((tp) => [tp.slug, tp] as const)), [topics]);
  const groupBySlug = useMemo(() => new Map(groups.map((g) => [g.slug, g] as const)), [groups]);

  const totalActive =
    (qDraft.trim() ? 1 : 0) +
    initialTopicSlugs.length +
    initialGroupSlugs.length +
    (initialResult ? 1 : 0) +
    (lawOnly ? 1 : 0) +
    (activeDateLabel ? 1 : 0);

  return (
    <section
      aria-label={labels.search}
      className="votes-filter-card"
      style={{
        marginTop: 14,
        padding: 14,
        border: '1px solid var(--rule)',
        borderRadius: 14,
        background: 'var(--paper)',
      }}
    >
      {/* Hero: search. */}
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
          aria-label={labels.search}
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

      {/* Primary controls: result (segmented) + the laws lens + the
          More-filters disclosure. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          marginTop: 12,
        }}
      >
        {/* Four segments don't fit a phone's width, and the control can't
            wrap without ceasing to look like one control — so it scrolls,
            with a fade marking the side that has more. */}
        <div
          role="radiogroup"
          aria-label={labels.result_label}
          ref={resultScroller.ref}
          className={`no-scrollbar ${resultScroller.className}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            padding: 3,
            maxWidth: '100%',
            overflowX: 'auto',
            border: '1px solid var(--rule-strong)',
            borderRadius: 999,
            background: 'var(--paper-2)',
          }}
        >
          <ResultSegment
            checked={!initialResult}
            label={labels.result_all}
            accent="ink"
            onClick={() => setResult('')}
          />
          <ResultSegment
            checked={initialResult === 'approved'}
            label={labels.result_approved}
            accent="aye"
            onClick={() => setResult('approved')}
          />
          <ResultSegment
            checked={initialResult === 'rejected'}
            label={labels.result_rejected}
            accent="no"
            onClick={() => setResult('rejected')}
          />
          <ResultSegment
            checked={initialResult === 'tie'}
            label={labels.result_tie}
            accent="abst"
            onClick={() => setResult('tie')}
          />
        </div>

        {/* The laws lens. Especially load-bearing on a past legislature,
            where those votes carry no linked initiative and the expediente
            prefix is the only way to find the laws. */}
        <button
          type="button"
          onClick={toggleLawOnly}
          aria-pressed={lawOnly}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 12px',
            borderRadius: 999,
            border: `1px solid ${lawOnly ? 'var(--ink)' : 'var(--rule-strong)'}`,
            background: lawOnly ? 'var(--ink)' : 'var(--paper)',
            color: lawOnly ? 'var(--paper)' : 'var(--ink-2)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <Scale size={14} strokeWidth={1.8} aria-hidden="true" />
          {labels.law_only}
        </button>

        {/* A day filter can only arrive by link (from /avui, or the embed
            explorer), so it needs somewhere to show and a way out. */}
        {activeDateLabel && (
          <SelectedChip
            label={activeDateLabel}
            accent={<CalendarDays size={13} strokeWidth={1.8} aria-hidden="true" />}
            onRemove={clearDate}
            removeLabel={labels.remove_label}
          />
        )}

        <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '7px 12px',
              borderRadius: 999,
              border: '1px solid var(--rule-strong)',
              background: expanded ? 'var(--paper-2)' : 'var(--paper)',
              color: 'var(--ink-2)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            {labels.more_filters}
            {secondaryActive > 0 && (
              <span
                className="tabular"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 18,
                  height: 18,
                  padding: '0 5px',
                  borderRadius: 999,
                  background: 'var(--accent)',
                  color: 'var(--paper)',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {secondaryActive}
              </span>
            )}
            <ChevronDown
              size={14}
              aria-hidden="true"
              style={{
                transform: expanded ? 'rotate(180deg)' : 'none',
                transition: 'transform 120ms ease',
              }}
            />
          </button>
          {totalActive > 0 && (
            <button
              type="button"
              onClick={clearAll}
              style={{
                background: 'transparent',
                border: 0,
                color: 'var(--ink-3)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                padding: '4px 4px',
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
      </div>

      {/* Secondary: the legislature context, then topic + group. Disclosed
          on demand. */}
      {expanded && (
        <div
          className="votes-filter-secondary"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 12,
            marginTop: 14,
            paddingTop: 14,
            borderTop: '1px solid var(--rule)',
            alignItems: 'start',
          }}
        >
          {legislatures.length > 1 && selectedLegId != null && (
            // Its own row: switching term re-scopes the whole archive, so
            // it reads as the frame around the two filters below it.
            <div style={{ gridColumn: '1 / -1' }}>
              <LegislatureSelector
                legislatures={legislatures}
                activeId={activeLegId}
                selectedId={selectedLegId}
                label={labels.legislature_label}
                currentSuffix={labels.legislature_current}
              />
            </div>
          )}

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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
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
              extraOptions={[{ slug: 'govern', label: labels.group_government }]}
              emptyValue=""
              clearLabel={labels.groups_clear}
              placeholder={labels.groups_placeholder}
              ariaLabel={labels.groups_label}
            />
            {initialGroupSlugs.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
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
      )}

      <style>{`
        @media (max-width: 600px) {
          .votes-filter-secondary {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
      {accent ??
        (accentDot ? (
          <span
            aria-hidden="true"
            style={{ width: 8, height: 8, borderRadius: 999, background: accentDot }}
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

function ResultSegment({
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
  const accentVar = accent === 'ink' ? 'var(--ink)' : `var(--${accent})`;
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
        padding: '5px 12px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        border: 0,
        background: checked ? `color-mix(in oklch, ${accentVar} 16%, var(--paper))` : 'transparent',
        color: checked ? accentVar : 'var(--ink-2)',
        transition: 'background-color 120ms ease, color 120ms ease',
        whiteSpace: 'nowrap',
        fontFamily: 'inherit',
      }}
    >
      {accent !== 'ink' && (
        <span
          aria-hidden="true"
          style={{ width: 8, height: 8, borderRadius: 999, background: accentVar, display: 'inline-block' }}
        />
      )}
      {label}
    </button>
  );
}
