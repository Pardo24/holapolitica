import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';
import { Layers } from 'lucide-react';

import type { SameProposal } from '@/lib/api';
import { STATUS_COLOR, STATUS_KEY } from '@/lib/lawStatus';

/**
 * The other times this same proposal was tabled.
 *
 * A proposal is often filed more than once: withdrawn and filed again,
 * re-registered after it lapsed, filed by a second group. The lists show it
 * as ONE card (the furthest-along presentation, see backend
 * ``_one_card_per_proposal``) and this note names the rest, each with how it
 * ended and a link, so three cards with one title and three different
 * statuses no longer read as a contradiction.
 */
export async function SameProposalNote({ others, locale }: { others: SameProposal[]; locale: string }) {
  if (others.length === 0) return null;
  const t = await getTranslations('lleis');
  const tStats = await getTranslations('stats');
  const tVotes = await getTranslations('votes');
  return (
    <div className="same-note">
      <p className="same-note__head">
        <Layers size={15} strokeWidth={2.2} aria-hidden="true" />
        {t('same_title_intro', { n: others.length })}
      </p>
      <ul className="same-note__list">
        {others.map((o) => {
          const state = o.verdict ?? o.status;
          const key = STATUS_KEY[o.status];
          const label = o.verdict
            ? tVotes(`result.${o.verdict}` as 'result.approved')
            : key
              ? tStats(key as 'status_singular_approved')
              : o.status;
          const when = o.submitted_at
            ? new Date(o.submitted_at).toLocaleDateString(locale, { month: 'short', year: 'numeric' })
            : null;
          return (
            <li key={o.id}>
              <Link href={`/initiatives/${o.id}` as Route}>
                <span
                  className="same-note__dot"
                  style={{ background: STATUS_COLOR[state] ?? 'var(--ink-3)' }}
                  aria-hidden="true"
                />
                <strong>{label}</strong>
                {when && <span>{t('same_title_filed', { date: when })}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
