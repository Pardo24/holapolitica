'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { useTransition } from 'react';

import { GroupCombobox } from '@/components/GroupCombobox';
import type { ParliamentaryGroupSummary } from '@/lib/api';

/**
 * Inline filter rail rendered above the initiative list on the topic
 * detail page. Wraps :file:`GroupCombobox` for typeahead group selection
 * and adds two affordances the bare combobox doesn't:
 *
 *   1. Submits the new slug straight to the URL (``?group=<slug>``) so
 *      filtering happens server-side via the existing SSR render — no
 *      client-side list mutation, no skeleton flicker.
 *   2. Shows a compact result count + a "clear filter" link when a
 *      filter is active, so the user always knows the list above is
 *      narrowed and can undo it in one click.
 *
 * The combobox keeps the `?subset=` value in a hidden input so flipping
 * between "Per votar" / "Votades" tabs and changing the group filter
 * don't clobber each other.
 */
export function TopicGroupFilter({
  slug,
  subset,
  groups,
  value,
  labels,
  clearHref,
}: {
  slug: string;
  subset: 'pending' | 'voted';
  groups: ParliamentaryGroupSummary[];
  value: string;
  labels: {
    label: string;
    placeholder: string;
    clearLabel: string;
    ariaLabel: string;
    governmentLabel: string;
    countLabel: string;
    totalLabel: string;
    clearCta: string;
  };
  clearHref: Route;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const hasFilter = value !== '';

  // Programmatic navigation on combobox change — saves the user from
  // hunting for an apply button. The transition keeps the segmented tabs
  // and stats above from showing a loading flash.
  const handleChange = (newSlug: string) => {
    const qs = new URLSearchParams();
    qs.set('subset', subset);
    if (newSlug) qs.set('group', newSlug);
    const href = (qs.toString() ? `/topics/${slug}?${qs.toString()}` : `/topics/${slug}`) as Route;
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        flexWrap: 'wrap',
        padding: '10px 0 14px',
        borderBottom: '1px solid var(--rule)',
        marginBottom: 14,
      }}
    >
      <span
        className="eyebrow"
        style={{ fontSize: 10, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}
      >
        {labels.label}
      </span>
      <div style={{ minWidth: 0, flex: '1 1 240px', maxWidth: 360 }}>
        <GroupCombobox
          name="group"
          value={value}
          onChange={handleChange}
          groups={groups}
          extraOptions={[{ slug: 'govern', label: labels.governmentLabel }]}
          emptyValue=""
          clearLabel={labels.clearLabel}
          placeholder={labels.placeholder}
          ariaLabel={labels.ariaLabel}
        />
      </div>
      <span
        className="tabular"
        style={{
          fontSize: 12,
          color: 'var(--ink-3)',
          fontVariantNumeric: 'tabular-nums',
          marginLeft: 'auto',
          opacity: pending ? 0.6 : 1,
          transition: 'opacity .15s ease',
        }}
        aria-live="polite"
      >
        {hasFilter ? labels.countLabel : labels.totalLabel}
      </span>
      {hasFilter && (
        <Link
          href={clearHref}
          style={{
            fontSize: 12,
            color: 'var(--ink-2)',
            textDecoration: 'underline',
            textUnderlineOffset: 2,
          }}
        >
          {labels.clearCta}
        </Link>
      )}
    </div>
  );
}
