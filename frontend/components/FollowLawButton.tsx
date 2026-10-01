'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bell, BellRing, Loader2 } from 'lucide-react';

import { api } from '@/lib/api';

/**
 * "Tell me how this law ends."
 *
 * A bill is voted several times over months — the amendments, the whole
 * text, whatever the Senate sends back — and the only way to find out how it
 * finished was to come back and look. This follows ONE law and notifies the
 * browser on every vote it gets.
 *
 * Web Push, deliberately: no email, no account, nothing of the reader stored
 * beyond the browser-issued endpoint the push service itself hands out. That
 * keeps the promise on the front page ("no trackers") literally true.
 *
 * Degrades quietly. A browser without push support, or one where the reader
 * says no, simply doesn't show the button rather than explaining itself at
 * length on a page about a law.
 */
export function FollowLawButton({ initiativeId }: { initiativeId: number }) {
  const t = useTranslations('initiative_detail');
  const [supported, setSupported] = useState(false);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (
        typeof window === 'undefined' ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !('Notification' in window)
      ) {
        return;
      }
      if (!cancelled) setSupported(true);
      if (Notification.permission === 'denied') {
        if (!cancelled) setDenied(true);
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration('/');
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (!sub || cancelled) return;
        setEndpoint(sub.endpoint);
        const { following: ids } = await api.push.following({
          endpoint: sub.endpoint,
          initiative_ids: [initiativeId],
        });
        if (!cancelled) setFollowing(ids.includes(initiativeId));
      } catch {
        /* no subscription yet, or the API is unreachable: the button still
           works, it just subscribes on the first click. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initiativeId]);

  const toggle = useCallback(async () => {
    setBusy(true);
    try {
      let current = endpoint;
      if (!current) {
        // First follow on this browser: ask permission, subscribe, and only
        // then record the law.
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setDenied(permission === 'denied');
          return;
        }
        const reg =
          (await navigator.serviceWorker.getRegistration('/')) ??
          (await navigator.serviceWorker.register('/sw.js', { scope: '/' }));
        const { public_key } = await api.push.publicKey();
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(public_key),
        });
        const json = sub.toJSON();
        await api.push.subscribe({
          endpoint: sub.endpoint,
          keys: {
            p256dh: json.keys?.p256dh ?? '',
            auth: json.keys?.auth ?? '',
          },
          // Following one law is not following a topic: the reader asked
          // for this law and nothing else.
          topic_slugs: [],
          group_slugs: [],
        });
        current = sub.endpoint;
        setEndpoint(current);
      }
      const next = !following;
      await api.push.followInitiative({
        endpoint: current,
        initiative_id: initiativeId,
        following: next,
      });
      setFollowing(next);
    } catch {
      /* Nothing to say that would help on a law's page; leave the button as
         it was so a retry is one tap away. */
    } finally {
      setBusy(false);
    }
  }, [endpoint, following, initiativeId]);

  if (!supported || denied) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={following}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '8px 14px',
        borderRadius: 999,
        border: `1px solid ${following ? 'var(--ink)' : 'var(--rule-strong)'}`,
        background: following ? 'var(--ink)' : 'var(--paper)',
        color: following ? 'var(--paper)' : 'var(--ink-2)',
        fontSize: 13,
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: busy ? 'progress' : 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {busy ? (
        <Loader2 size={14} strokeWidth={2} aria-hidden="true" className="spin" />
      ) : following ? (
        <BellRing size={14} strokeWidth={2} aria-hidden="true" />
      ) : (
        <Bell size={14} strokeWidth={2} aria-hidden="true" />
      )}
      {following ? t('follow_on') : t('follow_off')}
    </button>
  );
}

/** VAPID keys travel base64url; PushManager wants bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalised);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}
