'use client';

import type { Route } from 'next';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';

import { GroupBadge } from '@/components/GroupBadge';
import { GroupCombobox } from '@/components/GroupCombobox';
import { TopicChip } from '@/components/TopicChip';
import { TopicCombobox } from '@/components/TopicCombobox';
import type { AudienceCount, ParliamentaryGroupSummary, Topic } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';
import { useEdgeFade } from '@/lib/useEdgeFade';
import { pickTopicName } from '@/lib/topics';

/**
 * Filter toolbar for /lleis — the same clean, hierarchical pattern as the
 * /votes toolbar, adapted to the laws view:
 *  - SEARCH is the hero (full width, top).
 *  - TOPIC + PROPOSING GROUP sit right under it, always visible: "laws
 *    about X" and "what does party Y table" are the two questions this list
 *    gets asked. They used to be hidden behind the disclosure while the
 *    audience tags took the visible row.
 *  - STATUS (approved / rejected / in progress) is the chip row below —
 *    "did it pass" is the other question a law gets asked.
 *  - AUDIENCE ("who does it affect") moved into the "More filters"
 *    disclosure: a real question, but a narrower one, and its long tail of
 *    tags ate the visible row. It auto-opens whenever a tag is applied.
 *
 * /lleis is laws-only; non-binding votes (positions) live on /votes, reached
 * via an explained link on the page. URL-driven and auto-applying.
 */
export interface LawsFilterLabels {
  search_placeholder: string;
  status_all: string;
  status_approved: string;
  status_rejected: string;
  status_in_debate: string;
  topic_label: string;
  topic_placeholder: string;
  group_label: string;
  group_placeholder: string;
  group_government: string;
  more_filters: string;
  clear_all: string;
  remove_label: string;
  audience_label: string;
}

interface Props {
  topics: Topic[];
  groups: ParliamentaryGroupSummary[];
  /** Audience tags in use, most common first; the row shows the top ones. */
  audiences: AudienceCount[];
  initialQ: string;
  /** Comma-separated outcomes, OR-ed by the API. */
  initialResults: string[];
  initialTopicSlugs: string[];
  initialGroupSlugs: string[];
  initialAudiences: string[];
  locale: string;
  labels: LawsFilterLabels;
}

/** How many audience chips to offer before the reader has picked any. */
const AUDIENCE_CHIPS = 10;

const STATUS_OPTIONS = ['approved', 'rejected', 'pending'] as const;

export function LawsFilterBar({
  topics,
  groups,
  audiences,
  initialQ,
  initialResults,
  initialTopicSlugs,
  initialGroupSlugs,
  initialAudiences,
  locale,
  labels,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const audienceScroller = useEdgeFade<HTMLDivElement>();
  const [, startTransition] = useTransition();
  const [qDraft, setQDraft] = useState(initialQ);

  // The disclosure now holds the audience tags only; topic and group are
  // in the visible row.
  const secondaryActive = initialAudiences.length;
  const [expanded, setExpanded] = useState(secondaryActive > 0);

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
    if (initialAudiences.length > 0) setExpanded(true);
  }, [initialAudiences.length]);

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

  // Outcomes are multi-select: "approved or rejected" is one question
  // ("what has the chamber actually settled?") that a single chip could not
  // ask. "Any" clears them all.
  const toggleStatus = (value: string) =>
    updateMulti('result', initialResults, value, !initialResults.includes(value));

  const updateMulti = (key: string, current: string[], slug: string, add: boolean) => {
    if (!slug) return;
    const updated = add
      ? Array.from(new Set([...current, slug]))
      : current.filter((s) => s !== slug);
    setParam(key, updated.length ? updated.join(',') : null);
  };
  const addTopic = (slug: string) => updateMulti('topic_slug', initialTopicSlugs, slug, true);
  const removeTopic = (slug: string) => updateMulti('topic_slug', initialTopicSlugs, slug, false);
  const addGroup = (slug: string) =>
    updateMulti('proposing_group_slug', initialGroupSlugs, slug, true);
  const removeGroup = (slug: string) =>
    updateMulti('proposing_group_slug', initialGroupSlugs, slug, false);

  const toggleAudience = (tag: string) =>
    updateMulti('audience', initialAudiences, tag, !initialAudiences.includes(tag));

  const clearAll = () => {
    const next = new URLSearchParams(sp.toString());
    ['q', 'result', 'topic_slug', 'proposing_group_slug', 'audience', 'sort', 'page'].forEach((k) =>
      next.delete(k),
    );
    pushUrl(next);
  };

  // Always offer the tags already picked (even if they fall out of the top
  // slice) plus the most common ones, so a chosen filter never disappears.
  const audienceChips = [
    ...initialAudiences,
    ...audiences
      .map((a) => a.tag)
      .filter((tag) => !initialAudiences.includes(tag))
      .slice(0, AUDIENCE_CHIPS),
  ];

  const topicBySlug = useMemo(() => new Map(topics.map((tp) => [tp.slug, tp] as const)), [topics]);
  const groupBySlug = useMemo(() => new Map(groups.map((g) => [g.slug, g] as const)), [groups]);

  const totalActive =
    (qDraft.trim() ? 1 : 0) +
    initialResults.length +
    initialTopicSlugs.length +
    initialGroupSlugs.length +
    initialAudiences.length;

  const statusLabel: Record<string, string> = {
    approved: labels.status_approved,
    rejected: labels.status_rejected,
    pending: labels.status_in_debate,
  };

  return (
    <section
      aria-label={labels.search_placeholder}
      className="laws-filter-card"
      style={{
        marginTop: 18,
        padding: 14,
        border: '1px solid var(--rule)',
        borderRadius: 14,
        background: 'var(--paper)',
      }}
    >
      <label
        className="laws-filter-search"
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

      {/* Topic and proposing group are PRIMARY: "which laws about X" and
          "what does party Y table" are the two questions this list gets
          asked, and both used to be hidden behind the disclosure while the
          audience tags took the visible row. */}
      <div
        className="laws-filter-primary"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 12,
          marginTop: 12,
          alignItems: 'start',
        }}
      >
        <FilterField label={labels.topic_label}>
          <TopicCombobox
            name=""
            value=""
            onChange={addTopic}
            topics={topics}
            emptyValue=""
            clearLabel={labels.topic_placeholder}
            placeholder={labels.topic_placeholder}
            ariaLabel={labels.topic_label}
          />
          {initialTopicSlugs.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {initialTopicSlugs.map((slug) => {
                const tp = topicBySlug.get(slug);
                if (!tp) return null;
                return (
                  <span key={slug} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <TopicChip name={pickTopicName(tp, locale)} color={tp.color_hex} />
                    <RemoveButton
                      onClick={() => removeTopic(slug)}
                      label={`${labels.remove_label} ${pickTopicName(tp, locale)}`}
                    />
                  </span>
                );
              })}
            </div>
          )}
        </FilterField>

        <FilterField label={labels.group_label}>
          <GroupCombobox
            name=""
            value=""
            onChange={addGroup}
            groups={groups}
            extraOptions={[{ slug: 'govern', label: labels.group_government }]}
            emptyValue=""
            clearLabel={labels.group_placeholder}
            placeholder={labels.group_placeholder}
            ariaLabel={labels.group_label}
          />
          {initialGroupSlugs.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {initialGroupSlugs.map((slug) => {
                const label =
                  slug === 'govern'
                    ? labels.group_government
                    : displayGroupShort(groupBySlug.get(slug)?.name_short ?? slug);
                const g = slug === 'govern' ? null : groupBySlug.get(slug);
                return (
                  <span
                    key={slug}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '3px 6px 3px 6px',
                      borderRadius: 999,
                      border: '1px solid var(--rule-strong)',
                      background: 'var(--paper)',
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--ink-2)',
                    }}
                  >
                    {g && (
                      <GroupBadge slug={g.slug} color={g.color_hex} size="xs" link={false} logoUrl={g.logo_url} />
                    )}
                    {label}
                    <RemoveButton onClick={() => removeGroup(slug)} label={`${labels.remove_label} ${label}`} />
                  </span>
                );
              })}
            </div>
          )}
        </FilterField>
      </div>

      {/* Outcome chips (did it pass) + the disclosure + clear. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <StatusChip
            active={initialResults.length === 0}
            onClick={() => setParam('result', null)}
          >
            {labels.status_all}
          </StatusChip>
          {STATUS_OPTIONS.map((s) => (
            <StatusChip
              key={s}
              active={initialResults.includes(s)}
              onClick={() => toggleStatus(s)}
            >
              {statusLabel[s]}
            </StatusChip>
          ))}
        </div>

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
              style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 120ms ease' }}
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

      {expanded && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: '1px solid var(--rule)',
          }}
        >
          {/* "Laws that affect me" — a real question, but a narrower one
              than the topic or the party, and the tags are a long tail
              that ate the visible row. Behind the disclosure, which opens
              by itself whenever a tag is applied. Tags come from the
              initiatives themselves, ordered by how many laws carry them,
              so every chip returns something. */}
          {audienceChips.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 11,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  color: 'var(--ink-3)',
                  marginBottom: 6,
                }}
              >
                {labels.audience_label}
              </span>
              {/* One scrolling line rather than a wrapping block: eleven tags
                  wrapped to seven rows on a phone and pushed the laws off the
                  screen, which is the opposite of the point. */}
              <div
                ref={audienceScroller.ref}
                className={`no-scrollbar ${audienceScroller.className}`}
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'nowrap',
                  overflowX: 'auto',
                  paddingBottom: 2,
                }}
              >
              {audienceChips.map((tag) => {
                const active = initialAudiences.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleAudience(tag)}
                    aria-pressed={active}
                    style={{
                      padding: '5px 11px',
                      borderRadius: 999,
                      border: `1px solid ${active ? 'var(--ink)' : 'var(--rule-strong)'}`,
                      background: active ? 'var(--ink)' : 'var(--paper)',
                      color: active ? 'var(--paper)' : 'var(--ink-2)',
                      fontSize: 12.5,
                      fontWeight: active ? 600 : 400,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      whiteSpace: 'nowrap',
                      flex: 'none',
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
              </div>
            </div>
      )}
        </div>
      )}

      <style>{`
        @media (max-width: 600px) {
          .laws-filter-primary { grid-template-columns: minmax(0, 1fr) !important; }
        }
      `}</style>
    </section>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
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

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        background: 'transparent',
        border: 0,
        padding: 2,
        cursor: 'pointer',
        color: 'var(--ink-3)',
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      <X size={12} aria-hidden="true" />
    </button>
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
        padding: '5px 13px',
        borderRadius: 999,
        border: `1px solid ${active ? 'var(--ink)' : 'var(--rule-strong)'}`,
        background: active ? 'var(--ink)' : 'transparent',
        color: active ? 'var(--paper)' : 'var(--ink-2)',
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}
