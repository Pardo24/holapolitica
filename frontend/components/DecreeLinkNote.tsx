import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';
import { ArrowRight, Link2 } from 'lucide-react';

import type { DecreeLink } from '@/lib/api';

/**
 * A decree-law and the bill it became, explained and linked. After the
 * Congress validates a Real Decreto-ley it can also process it as a bill,
 * so the groups can amend it: two real initiatives for one law, one in
 * force and one in progress. Without this they read as a duplicate with
 * contradictory outcomes.
 */
export async function DecreeLinkNote({ link }: { link: DecreeLink }) {
  const t = await getTranslations('lleis');
  const number = link.label.replace(/^Real Decreto-ley\s*/i, '');
  return (
    <p className="decree-note">
      <Link2 size={15} strokeWidth={2.2} aria-hidden="true" />
      <span>
        {link.kind === 'from_decree' ? t('decree_from', { n: number }) : t('decree_as_bill')}{' '}
        <Link href={`/initiatives/${link.id}` as Route}>
          {link.kind === 'from_decree' ? t('decree_see_decree') : t('decree_see_bill')}
          <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </span>
    </p>
  );
}
