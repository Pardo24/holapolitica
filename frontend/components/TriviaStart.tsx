'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { Copy, Play, Share2, UserPlus, User } from 'lucide-react';

/**
 * Trivia's pre-game choice: play solo, or invite friends. "Invite" mints a
 * shared seed up front, so the link you send drops your friends onto the exact
 * same round; "Comença" enters that round yourself. After the game the result
 * link (with your score) lets everyone compare.
 */
export interface TriviaStartLabels {
  solo_title: string;
  solo_sub: string;
  solo_cta: string;
  invite_title: string;
  invite_sub: string;
  invite_cta: string;
  invite_hint: string;
  copy: string;
  copied: string;
  share: string;
  start: string;
}

export function TriviaStart({ labels }: { labels: TriviaStartLabels }) {
  const [seed, setSeed] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  function invite() {
    setSeed(Math.floor(Math.random() * 1_000_000_000));
    setCopied(false);
  }

  const link = seed != null ? `${typeof window !== 'undefined' ? window.location.origin : ''}/joc?repte=${seed}` : '';

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      /* clipboard blocked */
    }
  }
  async function share() {
    try {
      if (navigator.share) await navigator.share({ text: link });
      else await copy();
    } catch {
      /* dismissed */
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Solo */}
      <Link
        href={'/joc?solo=1' as Route}
        className="trivia-start-card"
        style={cardStyle}
      >
        <span aria-hidden="true" style={iconTile('#7F77DD')}>
          <User size={22} strokeWidth={1.9} />
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className="serif" style={titleStyle}>{labels.solo_title}</span>
          <span style={subStyle}>{labels.solo_sub}</span>
        </span>
        <span style={ctaPill('var(--ink)', 'var(--paper)')}>
          <Play size={15} strokeWidth={2.2} aria-hidden="true" />
          {labels.solo_cta}
        </span>
      </Link>

      {/* Invite */}
      <div className="trivia-start-card" style={{ ...cardStyle, flexDirection: 'column', alignItems: 'stretch', cursor: 'default' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span aria-hidden="true" style={iconTile('#1D9E75')}>
            <UserPlus size={22} strokeWidth={1.9} />
          </span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span className="serif" style={titleStyle}>{labels.invite_title}</span>
            <span style={subStyle}>{labels.invite_sub}</span>
          </span>
          {seed == null && (
            <button type="button" onClick={invite} style={{ ...ctaPill('var(--ink)', 'var(--paper)'), border: 0, cursor: 'pointer' }}>
              <UserPlus size={15} strokeWidth={2.2} aria-hidden="true" />
              {labels.invite_cta}
            </button>
          )}
        </div>

        {seed != null && (
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 12.5, color: 'var(--ink-3)', margin: '0 0 8px' }}>{labels.invite_hint}</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                style={{
                  flex: '1 1 200px',
                  minWidth: 0,
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--rule-strong)',
                  background: 'var(--paper)',
                  color: 'var(--ink-2)',
                  fontSize: 13,
                }}
              />
              <button type="button" onClick={share} style={pillBtn}>
                <Share2 size={15} strokeWidth={2} aria-hidden="true" />
                {labels.share}
              </button>
              <button type="button" onClick={copy} style={pillBtn}>
                <Copy size={15} strokeWidth={2} aria-hidden="true" />
                {copied ? labels.copied : labels.copy}
              </button>
            </div>
            <Link
              href={`/joc?repte=${seed}` as Route}
              className="btn-ink"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 12 }}
            >
              <Play size={16} strokeWidth={2.2} aria-hidden="true" />
              {labels.start}
            </Link>
          </div>
        )}
      </div>

      <style>{`.trivia-start-card { text-decoration: none; color: inherit; }
        a.trivia-start-card:hover, a.trivia-start-card:focus-visible { border-color: var(--ink); outline: none; }`}</style>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '16px 16px',
  borderRadius: 14,
  border: '1px solid var(--rule-strong)',
  background: 'var(--paper-2)',
};

function iconTile(color: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    flex: 'none',
    borderRadius: 12,
    background: `color-mix(in srgb, ${color} 15%, var(--paper))`,
    color,
  };
}
const titleStyle: React.CSSProperties = { display: 'block', fontSize: 17, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.25 };
const subStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: 'var(--ink-3)', marginTop: 2, lineHeight: 1.4 };
function ctaPill(bg: string, fg: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '9px 14px',
    borderRadius: 999,
    background: bg,
    color: fg,
    fontSize: 13,
    fontWeight: 700,
    flex: 'none',
  };
}
const pillBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '9px 14px',
  borderRadius: 999,
  border: '1px solid var(--rule-strong)',
  background: 'var(--paper)',
  color: 'var(--ink-2)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};
