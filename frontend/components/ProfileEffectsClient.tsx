'use client';

import { useTranslations } from 'next-intl';
import { ChevronDown, Sparkles } from 'lucide-react';

import { PROFILES } from '@/lib/profiles';

/**
 * The client twin of {@link ProfileEffects} for the games: "Com t'afecta",
 * one plain sentence per everyday situation the law touches, under the
 * law's title on a question card. ``items`` is ``[[profile_key, text]]``,
 * already in display order and in the reader's language.
 *
 * ``folded``: a pill under the law's summary that opens into the list, as on
 * the law cards. The summary says what the law does; this, whom it touches.
 */
export function ProfileEffectsClient({
  items,
  max = 2,
  folded = false,
}: {
  items: string[][];
  max?: number;
  folded?: boolean;
}) {
  const t = useTranslations('profiles');
  const shown = items.filter((it) => PROFILES.some((p) => p.key === it[0])).slice(0, max);
  if (shown.length === 0) return null;
  const list = (
    <ul className="effects__list">
      {shown.map(([key, text]) => {
        const Icon = PROFILES.find((p) => p.key === key)!.Icon;
        return (
          <li key={key}>
            <span className="effects__icon" aria-hidden="true">
              <Icon size={15} strokeWidth={2} />
            </span>
            <p>
              <strong>{t(`title_${key}` as 'title_jove')}:</strong> {text}
            </p>
          </li>
        );
      })}
    </ul>
  );
  if (folded) {
    return (
      <details className="effects effects--fold effects--pill">
        <summary className="effects__head">
          <Sparkles size={13} strokeWidth={2.2} aria-label={t('effects_ai')} />
          {t('effects_title')}
          <span className="effects__count tabular">({shown.length})</span>
          <ChevronDown size={14} strokeWidth={2.2} aria-hidden="true" className="effects__chev" />
        </summary>
        {list}
      </details>
    );
  }
  return (
    <section className="effects effects--game">
      <h3 className="effects__head">
        <Sparkles size={13} strokeWidth={2.2} aria-label={t('effects_ai')} />
        {t('effects_title')}
      </h3>
      {list}
    </section>
  );
}

/** ``{profile_key: {ca, es}}`` → ``[[key, text]]`` in display order. */
export function effectsItems(
  effects: Record<string, { ca?: string; es?: string }> | null | undefined,
  locale: string,
): string[][] {
  if (!effects) return [];
  const es = locale.startsWith('es') || locale.startsWith('en');
  const out: string[][] = [];
  for (const { key } of PROFILES) {
    const e = effects[key];
    const text = e ? ((es ? e.es : e.ca) ?? e.es ?? e.ca) : undefined;
    if (text) out.push([key, text]);
  }
  return out;
}
