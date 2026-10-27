'use client';

import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';

import { changeTagIcon, isChangeTag } from '@/lib/changeTags';

/**
 * A game card's tags: the law's theme(s) and what the text changes ("Baixa
 * impostos", "Amplia drets"), the same chips as the law cards. Neutral ink:
 * both sides of a change are drawn alike (lib/changeTags.ts).
 */
export function GameLawTags({
  topics = [],
  tags = [],
  style,
}: {
  topics?: { key: string; name: string; color?: string | null }[];
  tags?: string[];
  style?: CSSProperties;
}) {
  const t = useTranslations('change_tags');
  const changes = tags.filter(isChangeTag);
  if (topics.length === 0 && changes.length === 0) return null;
  return (
    <div className="game-tags" style={style}>
      {topics.map((tp) => (
        <span
          key={tp.key}
          className="game-tags__topic"
          style={{ ['--topic' as string]: tp.color ?? 'var(--rule-strong)' }}
        >
          {tp.name}
        </span>
      ))}
      {changes.map((tag) => {
        const Icon = changeTagIcon(tag);
        return (
          <span key={tag} className="change-chip">
            <Icon size={12} strokeWidth={2} aria-hidden="true" />
            {t(tag)}
          </span>
        );
      })}
    </div>
  );
}
