'use client';

/**
 * Client-side controller for /notifications.
 *
 * State machine, plain text version:
 *
 *   unsupported  → browser has no Push API; show a notice, hide controls.
 *   not-granted  → permission ∈ {default, denied}; show CTA to enable.
 *   granted-no-sub
 *                → permission granted but pushManager has no subscription
 *                  (user might have unsubscribed); show CTA to (re)subscribe.
 *   subscribed   → has a real PushSubscription; show topic chip-picker +
 *                  master toggle + Apply + Stop notifications.
 *
 * The page never persists state in localStorage — the browser's
 * pushManager is the source of truth. On mount we read both
 * Notification.permission and pushManager.getSubscription().
 *
 * Neutrality: visible labels are factual ("New vote on topic X").
 * The component never shows editorial framing or vote outcomes.
 *
 * UX redesign (2026-05-11): the legacy flat 34-cell grid was reported as
 * overwhelming, so the "subscribed" phase now uses:
 *   - a master iOS-style switch (Active / Stopped)
 *   - a chip-based picker with typeahead autocomplete
 *   - selected topics rendered as removable pill chips
 *   - a "Veure tots els temes" escape hatch that expands a grouped
 *     checkbox list (themes section + Agenda 2030 / ODS section, with
 *     Agenda 2030 collapsed by default on mobile)
 *   - a sticky "Apply" bar visible only while there are unsaved changes
 *
 * The push-subscription state machine, the network calls and the URL
 * pinned to `Notification.permission` + `pushManager` are UNCHANGED —
 * only the JSX of the "subscribed" phase has been rewritten.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { useTranslations } from 'next-intl';

import { ApiError, api, type Topic, type TopicKind } from '@/lib/api';

type Phase =
  | 'init'
  | 'unsupported'
  | 'not-granted'
  | 'granted-no-sub'
  | 'subscribed';

interface Props {
  topics: Topic[];
}

/** Convert a base64url VAPID public key into the Uint8Array shape the
 * pushManager.subscribe API requires. The padding restore + replace
 * dance is the canonical one from the W3C examples. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = typeof atob === 'function' ? atob(b64) : '';
  const buffer = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}

/** Extract endpoint + base64url-encoded keys from a browser PushSubscription. */
function serializeSubscription(sub: PushSubscription): {
  endpoint: string;
  keys: { p256dh: string; auth: string };
} {
  const json = sub.toJSON();
  return {
    endpoint: json.endpoint || sub.endpoint,
    keys: {
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
    },
  };
}

/** Strip combining diacritical marks so "hábit" matches "habit". Lowercase
 *  to make the comparison case-insensitive. Mirrors TopicCombobox. */
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function NotificationsManager({ topics }: Props) {
  const t = useTranslations('notifications');
  const [phase, setPhase] = useState<Phase>('init');
  // `selected` is the in-flight selection (dirty). `applied` is the last
  // selection successfully persisted to the server; we use the diff to
  // decide whether to show the "unsaved changes" sticky bar.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Master toggle — only meaningful when phase === 'subscribed'. When the
  // user flips it OFF we call handleStop() which transitions out of the
  // subscribed phase, so this stays in sync with phase implicitly. While
  // we're in the 'init' / 'unsupported' / etc. phases the value is moot.
  const masterOn = phase === 'subscribed';

  // Probe the browser once on mount and seed `selected` from the server.
  useEffect(() => {
    let cancelled = false;
    const probe = async (): Promise<void> => {
      if (
        typeof window === 'undefined' ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window)
      ) {
        if (!cancelled) setPhase('unsupported');
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration('/');
      const existing = reg ? await reg.pushManager.getSubscription() : null;
      const permission = Notification.permission;

      if (existing) {
        if (cancelled) return;
        const serialized = serializeSubscription(existing);
        setEndpoint(serialized.endpoint);
        // We don't have a /push/interests GET endpoint yet (no auth model),
        // so we treat the server's slug list returned by PATCH as the
        // authoritative response after the user clicks "Apply". On first
        // page load we start with an empty selection — the user re-confirms
        // their interests. This is also the safest default privacy-wise.
        setSelected(new Set());
        setApplied(new Set());
        setPhase('subscribed');
        return;
      }
      if (permission === 'granted') {
        if (!cancelled) setPhase('granted-no-sub');
      } else if (!cancelled) {
        setPhase('not-granted');
      }
    };
    void probe();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback((slug: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }, []);

  const addSlug = useCallback((slug: string) => {
    setSelected((prev) => {
      if (prev.has(slug)) return prev;
      const next = new Set(prev);
      next.add(slug);
      return next;
    });
  }, []);

  const removeSlug = useCallback((slug: string) => {
    setSelected((prev) => {
      if (!prev.has(slug)) return prev;
      const next = new Set(prev);
      next.delete(slug);
      return next;
    });
  }, []);

  const selectAll = useCallback((slugs: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      slugs.forEach((s) => next.add(s));
      return next;
    });
  }, []);

  const clearGroup = useCallback((slugs: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      slugs.forEach((s) => next.delete(s));
      return next;
    });
  }, []);

  const handleEnable = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPhase('not-granted');
        setMessage(t('msg_denied'));
        return;
      }
      const reg =
        (await navigator.serviceWorker.getRegistration('/')) ||
        (await navigator.serviceWorker.register('/sw.js', { scope: '/' }));
      const { public_key: vapidPublic } = await api.push.publicKey();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublic),
      });
      const serialized = serializeSubscription(sub);
      await api.push.subscribe({
        endpoint: serialized.endpoint,
        keys: serialized.keys,
        topic_slugs: Array.from(selected),
      });
      setEndpoint(serialized.endpoint);
      setApplied(new Set(selected));
      setPhase('subscribed');
      setMessage(t('msg_enabled'));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      setMessage(t('msg_error', { reason }));
    } finally {
      setBusy(false);
    }
  }, [selected, t]);

  const handleApply = useCallback(async () => {
    if (!endpoint) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.push.updateInterests({
        endpoint,
        topic_slugs: Array.from(selected),
      });
      setApplied(new Set(selected));
      setMessage(t('msg_saved'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Server lost the subscription (e.g. DB reset) — treat as new.
        setPhase('granted-no-sub');
        setMessage(t('msg_resubscribe'));
      } else {
        const reason = err instanceof Error ? err.message : String(err);
        setMessage(t('msg_error', { reason }));
      }
    } finally {
      setBusy(false);
    }
  }, [endpoint, selected, t]);

  const handleStop = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await api.push.unsubscribe({ endpoint: sub.endpoint }).catch(() => null);
        await sub.unsubscribe();
      } else if (endpoint) {
        await api.push.unsubscribe({ endpoint }).catch(() => null);
      }
      setEndpoint(null);
      setSelected(new Set());
      setApplied(new Set());
      setPhase(Notification.permission === 'granted' ? 'granted-no-sub' : 'not-granted');
      setMessage(t('msg_stopped'));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      setMessage(t('msg_error', { reason }));
    } finally {
      setBusy(false);
    }
  }, [endpoint, t]);

  // Pre-subscribed phases (not-granted, granted-no-sub) still use the
  // legacy flat grid because the user hasn't committed to any subscription
  // yet — this is essentially an opt-in selection step before the
  // permission prompt. Keeping it visually different from the post-
  // subscription "settings" view makes the journey clearer.
  const topicGrid = useMemo(
    () => (
      <ul
        style={{
          listStyle: 'none',
          margin: '16px 0 0',
          padding: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 8,
        }}
      >
        {topics.map((topic) => {
          const checked = selected.has(topic.slug);
          return (
            <li key={topic.slug}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 12px',
                  border: '1px solid var(--ink)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: checked ? 'var(--ink)' : 'transparent',
                  color: checked ? 'var(--bg)' : 'var(--ink)',
                  fontSize: 13,
                  minHeight: 44,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(topic.slug)}
                  disabled={busy}
                  aria-label={topic.name_ca}
                />
                <span style={{ flex: 1 }}>{topic.name_ca}</span>
              </label>
            </li>
          );
        })}
      </ul>
    ),
    [topics, selected, busy, toggle],
  );

  if (phase === 'init') {
    return (
      <p style={{ marginTop: 18, fontSize: 13, color: 'var(--ink-3)' }}>{t('loading')}</p>
    );
  }

  if (phase === 'unsupported') {
    return (
      <p
        style={{
          marginTop: 18,
          padding: 12,
          border: '1px dashed var(--ink-3)',
          borderRadius: 6,
          fontSize: 13,
        }}
      >
        {t('unsupported')}
      </p>
    );
  }

  // Pre-subscription: same legacy grid + single "Activa notificacions" CTA.
  if (phase !== 'subscribed') {
    return (
      <div style={{ marginTop: 20 }}>
        <p style={{ fontSize: 14, color: 'var(--ink-3)', marginBottom: 12 }}>
          {t('select_intro')}
        </p>
        {topicGrid}
        <div style={{ marginTop: 18, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button
            type="button"
            onClick={handleEnable}
            disabled={busy}
            style={primaryButtonStyle}
          >
            {busy ? t('working') : t('enable_cta')}
          </button>
        </div>
        {message && (
          <p
            role="status"
            aria-live="polite"
            style={{ marginTop: 14, fontSize: 13, color: 'var(--ink-3)' }}
          >
            {message}
          </p>
        )}
      </div>
    );
  }

  // ============ Subscribed phase — settings-style redesign ============

  return (
    <SubscribedView
      topics={topics}
      selected={selected}
      applied={applied}
      masterOn={masterOn}
      busy={busy}
      message={message}
      onAdd={addSlug}
      onRemove={removeSlug}
      onToggle={toggle}
      onSelectAll={selectAll}
      onClearGroup={clearGroup}
      onApply={handleApply}
      onStop={handleStop}
    />
  );
}

// =================================================================
// Subscribed view (settings-style)
// =================================================================

interface SubscribedViewProps {
  topics: Topic[];
  selected: Set<string>;
  applied: Set<string>;
  masterOn: boolean;
  busy: boolean;
  message: string | null;
  onAdd: (slug: string) => void;
  onRemove: (slug: string) => void;
  onToggle: (slug: string) => void;
  onSelectAll: (slugs: string[]) => void;
  onClearGroup: (slugs: string[]) => void;
  onApply: () => void;
  onStop: () => void;
}

function SubscribedView({
  topics,
  selected,
  applied,
  masterOn,
  busy,
  message,
  onAdd,
  onRemove,
  onToggle,
  onSelectAll,
  onClearGroup,
  onApply,
  onStop,
}: SubscribedViewProps) {
  const t = useTranslations('notifications');
  const [showAll, setShowAll] = useState(false);
  const themes = useMemo(() => topics.filter((tp) => tp.kind === 'theme'), [topics]);
  const sdgs = useMemo(() => topics.filter((tp) => tp.kind === 'sdg'), [topics]);
  const selectedTopics = useMemo(
    () =>
      // Preserve the canonical topic order from the server (matches the
      // grouped view) rather than the order in which the user added chips.
      topics.filter((tp) => selected.has(tp.slug)),
    [topics, selected],
  );

  // "Dirty" = current selection differs from what's persisted server-side.
  const dirty = useMemo(() => {
    if (selected.size !== applied.size) return true;
    for (const slug of selected) {
      if (!applied.has(slug)) return true;
    }
    return false;
  }, [selected, applied]);

  const count = selected.size;
  const statusLine = masterOn
    ? t('master_status_active', { count })
    : t('master_status_stopped');

  return (
    <div
      style={{
        marginTop: 18,
        // Sticky bar gets out of the way when keyboard pops up on mobile.
        paddingBottom: dirty ? 88 : 0,
        transition: 'padding-bottom 200ms ease',
      }}
    >
      {/* Master toggle card */}
      <div style={cardStyle}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            minHeight: 44,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
              {masterOn ? t('master_on') : t('master_off')}
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--ink-3)',
                marginTop: 2,
              }}
            >
              {statusLine}
            </div>
          </div>
          <IosSwitch
            on={masterOn}
            disabled={busy}
            ariaLabel={masterOn ? t('master_on') : t('master_off')}
            onChange={(next) => {
              if (!next && masterOn) onStop();
            }}
          />
        </div>
      </div>

      {/* Topic picker section */}
      <section
        aria-label={t('section_themes')}
        style={{
          ...cardStyle,
          marginTop: 12,
          opacity: masterOn ? 1 : 0.55,
          pointerEvents: masterOn ? 'auto' : 'none',
          transition: 'opacity 180ms ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={eyebrowStyle}>{t('topics_eyebrow')}</div>
            <h2 style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
              {t('topics_title')}
            </h2>
          </div>
        </div>

        <TopicTypeahead
          topics={topics}
          selected={selected}
          disabled={busy || !masterOn}
          onPick={onAdd}
        />

        {selectedTopics.length === 0 ? (
          <p
            style={{
              marginTop: 12,
              padding: '12px 14px',
              fontSize: 13,
              color: 'var(--ink-3)',
              border: '1px dashed var(--rule-strong)',
              borderRadius: 12,
              textAlign: 'center',
            }}
          >
            {t('selection_empty')}
          </p>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              margin: '12px 0 0',
              padding: 0,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
            }}
          >
            {selectedTopics.map((topic) => (
              <li key={topic.slug}>
                <TopicChip
                  topic={topic}
                  disabled={busy || !masterOn}
                  removeLabel={t('remove_topic', { name: topic.name_ca })}
                  onRemove={() => onRemove(topic.slug)}
                />
              </li>
            ))}
          </ul>
        )}

        <div style={{ marginTop: 14 }}>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            aria-controls="all-topics-region"
            disabled={busy || !masterOn}
            style={linkButtonStyle}
          >
            {showAll ? t('view_all_topics_hide') : t('view_all_topics')}
            <span aria-hidden="true" style={{ marginLeft: 4 }}>
              {showAll ? '▴' : '▾'}
            </span>
          </button>
        </div>

        {showAll && (
          <div
            id="all-topics-region"
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: '1px solid var(--rule)',
            }}
          >
            <TopicSectionAccordion
              title={t('section_themes')}
              topics={themes}
              selected={selected}
              busy={busy || !masterOn}
              defaultOpen
              onToggle={onToggle}
              onSelectAll={onSelectAll}
              onClearGroup={onClearGroup}
              selectAllLabel={t('select_all')}
              clearLabel={t('clear_section')}
            />
            <div style={{ height: 10 }} />
            <TopicSectionAccordion
              title={t('section_sdg')}
              topics={sdgs}
              selected={selected}
              busy={busy || !masterOn}
              defaultOpen={false}
              onToggle={onToggle}
              onSelectAll={onSelectAll}
              onClearGroup={onClearGroup}
              selectAllLabel={t('select_all')}
              clearLabel={t('clear_section')}
            />
          </div>
        )}
      </section>

      {/* Inline status message — non-sticky, in-document. */}
      {message && (
        <p
          role="status"
          aria-live="polite"
          style={{
            marginTop: 14,
            padding: '10px 12px',
            fontSize: 13,
            color: 'var(--ink-2)',
            background: 'var(--paper-2)',
            border: '1px solid var(--rule)',
            borderRadius: 10,
          }}
        >
          {message}
        </p>
      )}

      {/* Sticky apply bar — only when dirty. Hidden when not dirty so it
          doesn't compete for attention. */}
      {dirty && masterOn && (
        <div style={stickyBarStyle} role="region" aria-label={t('unsaved_changes_apply')}>
          <div
            style={{
              maxWidth: 720,
              margin: '0 auto',
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 13,
                color: 'var(--ink-2)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {t('unsaved_changes')}
            </div>
            <button
              type="button"
              onClick={onApply}
              disabled={busy}
              style={primaryButtonStyle}
            >
              {busy ? t('working') : t('apply_cta')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// =================================================================
// TopicChip — removable pill for a selected topic.
// =================================================================

function TopicChip({
  topic,
  disabled,
  removeLabel,
  onRemove,
}: {
  topic: Topic;
  disabled: boolean;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <span style={chipStyle}>
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: topic.color_hex ?? 'var(--ink-3)',
          flex: 'none',
        }}
      />
      <span
        style={{
          fontSize: 13,
          color: 'var(--ink)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {topic.name_ca}
      </span>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={removeLabel}
        style={chipRemoveButtonStyle}
      >
        <span aria-hidden="true">×</span>
      </button>
    </span>
  );
}

// =================================================================
// TopicTypeahead — chip-picker autocomplete input. Filters by name,
// accent + case insensitive, themes first then SDGs. Skips already-
// selected topics. Keyboard nav: ArrowUp/Down move active row, Enter
// commits, Escape closes.
// =================================================================

function TopicTypeahead({
  topics,
  selected,
  disabled,
  onPick,
}: {
  topics: Topic[];
  selected: Set<string>;
  disabled: boolean;
  onPick: (slug: string) => void;
}) {
  const t = useTranslations('notifications');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  // Build the flat rows of dropdown options. Headers are visual only —
  // not focusable. We skip topics already selected so users can't pick
  // them again.
  const rows = useMemo(() => {
    const norm = normalize(query);
    const available = topics.filter((tp) => !selected.has(tp.slug));
    const match = (tp: Topic) =>
      norm === '' || normalize(tp.name_ca).includes(norm);
    const filteredThemes = available.filter((tp) => tp.kind === 'theme' && match(tp));
    const filteredSdgs = available.filter((tp) => tp.kind === 'sdg' && match(tp));
    const out: Array<
      | { kind: 'header'; label: string; topicKind: TopicKind }
      | { kind: 'option'; topic: Topic }
    > = [];
    if (filteredThemes.length > 0) {
      out.push({ kind: 'header', label: t('section_themes'), topicKind: 'theme' });
      filteredThemes.forEach((tp) => out.push({ kind: 'option', topic: tp }));
    }
    if (filteredSdgs.length > 0) {
      out.push({ kind: 'header', label: t('section_sdg'), topicKind: 'sdg' });
      filteredSdgs.forEach((tp) => out.push({ kind: 'option', topic: tp }));
    }
    return out;
  }, [topics, selected, query, t]);

  const focusableIndices = useMemo(
    () =>
      rows
        .map((row, i) => ({ row, i }))
        .filter(({ row }) => row.kind === 'option')
        .map(({ i }) => i),
    [rows],
  );

  // Reset focus to the first selectable row whenever the popup opens or
  // the filtered list changes so Enter immediately commits the top hit.
  useEffect(() => {
    if (!open) return;
    const first = focusableIndices[0];
    setActiveIndex(typeof first === 'number' ? first : 0);
  }, [open, query, focusableIndices]);

  // Close on outside click — popover hygiene.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const commit = useCallback(
    (slug: string) => {
      onPick(slug);
      setQuery('');
      // Keep the dropdown open so the user can pick several in a row;
      // they can press Escape or click outside to close.
    },
    [onPick],
  );

  const moveActive = useCallback(
    (delta: number) => {
      if (focusableIndices.length === 0) return;
      const pos = focusableIndices.indexOf(activeIndex);
      const nextPos =
        pos < 0
          ? 0
          : (pos + delta + focusableIndices.length) % focusableIndices.length;
      const nextIdx = focusableIndices[nextPos];
      if (typeof nextIdx === 'number') setActiveIndex(nextIdx);
    },
    [activeIndex, focusableIndices],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else moveActive(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      else moveActive(-1);
    } else if (e.key === 'Enter') {
      if (!open) {
        if (focusableIndices.length > 0) setOpen(true);
        return;
      }
      e.preventDefault();
      const row = rows[activeIndex];
      if (!row || row.kind !== 'option') return;
      commit(row.topic.slug);
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    } else if (e.key === 'Home') {
      if (open) {
        e.preventDefault();
        const first = focusableIndices[0];
        if (typeof first === 'number') setActiveIndex(first);
      }
    } else if (e.key === 'End') {
      if (open) {
        e.preventDefault();
        const last = focusableIndices[focusableIndices.length - 1];
        if (typeof last === 'number') setActiveIndex(last);
      }
    }
  };

  const hasResults = focusableIndices.length > 0;

  return (
    <div
      ref={wrapperRef}
      style={{ position: 'relative', width: '100%' }}
      role="combobox"
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-owns={listboxId}
      aria-controls={listboxId}
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={t('add_topic_placeholder')}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={
          open && hasResults ? `${listboxId}-opt-${activeIndex}` : undefined
        }
        style={typeaheadInputStyle}
      />

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={t('add_topic_placeholder')}
          style={listboxStyle}
        >
          {!hasResults && (
            <li
              role="presentation"
              style={{
                padding: '10px 12px',
                fontSize: 13,
                color: 'var(--ink-3)',
              }}
            >
              {t('no_results')}
            </li>
          )}
          {rows.map((row, i) => {
            if (row.kind === 'header') {
              return (
                <li
                  key={`h-${row.label}-${i}`}
                  role="presentation"
                  style={headerStyle}
                >
                  {row.label}
                </li>
              );
            }
            const isActive = i === activeIndex;
            return (
              <li
                key={row.topic.slug}
                id={`${listboxId}-opt-${i}`}
                role="option"
                aria-selected={isActive}
                onMouseDown={(e) => {
                  // Use mousedown so the input doesn't lose focus first.
                  e.preventDefault();
                  commit(row.topic.slug);
                }}
                onMouseEnter={() => setActiveIndex(i)}
                style={optionStyle(isActive)}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: row.topic.color_hex ?? 'var(--ink-3)',
                    marginRight: 8,
                    flex: 'none',
                  }}
                />
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.topic.name_ca}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// =================================================================
// TopicSectionAccordion — full grouped checkbox list for a single
// taxonomy kind. Used inside the "Veure tots els temes" escape hatch.
// =================================================================

function TopicSectionAccordion({
  title,
  topics,
  selected,
  busy,
  defaultOpen,
  onToggle,
  onSelectAll,
  onClearGroup,
  selectAllLabel,
  clearLabel,
}: {
  title: string;
  topics: Topic[];
  selected: Set<string>;
  busy: boolean;
  defaultOpen: boolean;
  onToggle: (slug: string) => void;
  onSelectAll: (slugs: string[]) => void;
  onClearGroup: (slugs: string[]) => void;
  selectAllLabel: string;
  clearLabel: string;
}) {
  const selectedInSection = topics.filter((tp) => selected.has(tp.slug)).length;
  const slugs = topics.map((tp) => tp.slug);

  return (
    <details
      open={defaultOpen}
      style={{
        borderRadius: 12,
        border: '1px solid var(--rule)',
        background: 'var(--paper-2)',
        padding: '4px 4px',
      }}
    >
      <summary
        style={{
          listStyle: 'none',
          cursor: 'pointer',
          minHeight: 44,
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          userSelect: 'none',
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontSize: 11,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
              fontWeight: 600,
            }}
          >
            {title}
          </span>
          <span
            style={{
              display: 'block',
              fontSize: 12,
              color: 'var(--ink-3)',
              marginTop: 2,
            }}
          >
            {selectedInSection} / {topics.length}
          </span>
        </span>
        <span aria-hidden="true" style={{ color: 'var(--ink-3)', fontSize: 13 }}>
          ▾
        </span>
      </summary>

      <div style={{ padding: '4px 12px 12px' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <button
            type="button"
            disabled={busy || selectedInSection === topics.length}
            onClick={() => onSelectAll(slugs)}
            style={smallButtonStyle}
          >
            {selectAllLabel}
          </button>
          <button
            type="button"
            disabled={busy || selectedInSection === 0}
            onClick={() => onClearGroup(slugs)}
            style={smallButtonStyle}
          >
            {clearLabel}
          </button>
        </div>

        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 6,
          }}
        >
          {topics.map((tp) => {
            const checked = selected.has(tp.slug);
            return (
              <li key={tp.slug}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    minHeight: 44,
                    border: '1px solid var(--rule)',
                    borderRadius: 10,
                    background: checked ? 'var(--accent-soft)' : 'var(--paper)',
                    cursor: busy ? 'not-allowed' : 'pointer',
                    fontSize: 13,
                    color: 'var(--ink)',
                    transition: 'background 120ms ease',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={busy}
                    onChange={() => onToggle(tp.slug)}
                    aria-label={tp.name_ca}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: tp.color_hex ?? 'var(--ink-3)',
                      flex: 'none',
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tp.name_ca}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}

// =================================================================
// IosSwitch — visual-only iOS-style switch. We render a real checkbox
// inside for a11y; the visual track + knob is purely CSS. Respect
// `prefers-reduced-motion` via globals.css (it kills the transition).
// =================================================================

function IosSwitch({
  on,
  disabled,
  ariaLabel,
  onChange,
}: {
  on: boolean;
  disabled: boolean;
  ariaLabel: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      style={{
        position: 'relative',
        display: 'inline-block',
        width: 51,
        height: 31,
        flex: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <input
        type="checkbox"
        role="switch"
        aria-checked={on}
        aria-label={ariaLabel}
        checked={on}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0,
          margin: 0,
          cursor: 'inherit',
        }}
      />
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 999,
          background: on ? 'var(--accent)' : 'var(--paper-3)',
          border: '1px solid',
          borderColor: on ? 'var(--accent)' : 'var(--rule-strong)',
          transition: 'background-color 200ms ease, border-color 200ms ease',
        }}
      />
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 22 : 2,
          width: 25,
          height: 25,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'left 200ms ease',
        }}
      />
    </label>
  );
}

// =================================================================
// Styles — kept local so the file is self-contained.
// =================================================================

const cardStyle: CSSProperties = {
  background: 'var(--paper)',
  border: '1px solid var(--rule)',
  borderRadius: 14,
  padding: '14px 16px',
  boxShadow: '0 1px 0 rgba(15,23,42,.03)',
};

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
  fontWeight: 600,
};

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 8px 6px 12px',
  borderRadius: 999,
  background: 'var(--paper-2)',
  border: '1px solid var(--rule-strong)',
  minHeight: 32,
  maxWidth: '100%',
};

const chipRemoveButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  borderRadius: '50%',
  border: 'none',
  background: 'transparent',
  color: 'var(--ink-2)',
  fontSize: 18,
  lineHeight: 1,
  cursor: 'pointer',
  padding: 0,
  flex: 'none',
};

const typeaheadInputStyle: CSSProperties = {
  width: '100%',
  minHeight: 44,
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid var(--rule-strong)',
  background: 'var(--paper)',
  color: 'var(--ink)',
  fontFamily: 'inherit',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};

const listboxStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  left: 0,
  right: 0,
  maxHeight: 320,
  overflowY: 'auto',
  background: 'var(--paper)',
  border: '1px solid var(--rule-strong)',
  borderRadius: 12,
  margin: 0,
  padding: 6,
  listStyle: 'none',
  zIndex: 50,
  boxShadow: '0 12px 32px rgba(15,23,42,0.12)',
};

const headerStyle: CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
  padding: '10px 10px 4px',
  fontWeight: 600,
};

function optionStyle(active: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    minHeight: 40,
    padding: '8px 10px',
    fontSize: 14,
    cursor: 'pointer',
    borderRadius: 8,
    background: active ? 'var(--paper-2)' : 'transparent',
    color: 'var(--ink)',
    transition: 'background-color 80ms ease',
  };
}

const linkButtonStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--accent)',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  padding: '6px 0',
  minHeight: 32,
};

const smallButtonStyle: CSSProperties = {
  background: 'var(--paper)',
  border: '1px solid var(--rule-strong)',
  borderRadius: 999,
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--ink)',
  cursor: 'pointer',
  minHeight: 32,
  fontFamily: 'inherit',
};

const stickyBarStyle: CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  background: 'color-mix(in oklch, var(--paper) 92%, transparent)',
  backdropFilter: 'saturate(140%) blur(8px)',
  WebkitBackdropFilter: 'saturate(140%) blur(8px)',
  borderTop: '1px solid var(--rule)',
  zIndex: 40,
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
};

const primaryButtonStyle: CSSProperties = {
  background: 'var(--ink)',
  color: 'var(--paper)',
  border: '1px solid var(--ink)',
  borderRadius: 10,
  padding: '10px 18px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  minHeight: 44,
  fontFamily: 'inherit',
};
