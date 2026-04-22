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
 *   subscribed   → has a real PushSubscription; show topic toggles + Apply
 *                  + Stop notifications.
 *
 * The page never persists state in localStorage — the browser's
 * pushManager is the source of truth. On mount we read both
 * Notification.permission and pushManager.getSubscription().
 *
 * Neutrality: visible labels are factual ("New vote on topic X").
 * The component never shows editorial framing or vote outcomes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { ApiError, api, type Topic } from '@/lib/api';

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

export function NotificationsManager({ topics }: Props) {
  const t = useTranslations('notifications');
  const [phase, setPhase] = useState<Phase>('init');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
      setPhase(Notification.permission === 'granted' ? 'granted-no-sub' : 'not-granted');
      setMessage(t('msg_stopped'));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      setMessage(t('msg_error', { reason }));
    } finally {
      setBusy(false);
    }
  }, [endpoint, t]);

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

  return (
    <div style={{ marginTop: 20 }}>
      {phase !== 'subscribed' && (
        <p style={{ fontSize: 14, color: 'var(--ink-3)', marginBottom: 12 }}>
          {t('select_intro')}
        </p>
      )}
      {topicGrid}

      <div style={{ marginTop: 18, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {phase !== 'subscribed' ? (
          <button
            type="button"
            onClick={handleEnable}
            disabled={busy}
            style={primaryButtonStyle}
          >
            {busy ? t('working') : t('enable_cta')}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handleApply}
              disabled={busy}
              style={primaryButtonStyle}
            >
              {busy ? t('working') : t('apply_cta')}
            </button>
            <button
              type="button"
              onClick={handleStop}
              disabled={busy}
              style={secondaryButtonStyle}
            >
              {t('stop_cta')}
            </button>
          </>
        )}
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

const primaryButtonStyle: React.CSSProperties = {
  background: 'var(--ink)',
  color: 'var(--bg)',
  border: '1px solid var(--ink)',
  borderRadius: 6,
  padding: '10px 18px',
  fontSize: 14,
  cursor: 'pointer',
  minHeight: 44,
};

const secondaryButtonStyle: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--ink)',
  border: '1px solid var(--ink)',
  borderRadius: 6,
  padding: '10px 18px',
  fontSize: 14,
  cursor: 'pointer',
  minHeight: 44,
};
