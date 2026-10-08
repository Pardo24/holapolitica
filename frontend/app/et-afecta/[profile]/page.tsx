import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { LawCard } from '@/components/LawCard';
import { LAW_CARD_LIST_STYLE } from '@/components/LawCardParts';
import { PageHeader } from '@/components/PageHeader';
import { ProfilePicker } from '@/components/ProfilePicker';
import { api, type InitiativeListItem, type ParliamentaryGroupSummary } from '@/lib/api';
import { parseProposer } from '@/lib/groups';
import { isProfileKey, profileIcon } from '@/lib/profiles';

const PAGE_SIZE = 20;

/** Which of the situation's laws to list: all, the ones the chamber has
 *  already voted (approved or rejected), or the ones still in progress.
 *  Same reading of "voted" as /lleis: by the law's latest decisive vote. */
type Subset = 'all' | 'voted' | 'pending';
const SUBSET_RESULT: Record<Subset, string | undefined> = {
  all: undefined,
  voted: 'approved,rejected',
  pending: 'pending',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ profile: string }>;
}): Promise<Metadata> {
  const { profile } = await params;
  if (!isProfileKey(profile)) return {};
  const t = await getTranslations('profiles');
  return {
    title: t(`title_${profile}` as 'title_jove'),
    description: t('section_lede'),
  };
}

/**
 * The laws with a concrete measure for one everyday situation, each with
 * the sentence that says what the text establishes for it ("Per a tu") and
 * how the chamber voted. Facts on both sides: what the text does, and what
 * each group voted. Nothing here says whether it is good for the reader.
 */
export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ profile: string }>;
  searchParams: Promise<{ page?: string; estat?: string }>;
}) {
  const { profile } = await params;
  if (!isProfileKey(profile)) notFound();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const subset: Subset = sp.estat === 'votades' ? 'voted' : sp.estat === 'en-tramit' ? 'pending' : 'all';
  const t = await getTranslations('profiles');
  const locale = await getLocale();
  const Icon = profileIcon(profile);

  const countOf = (s: Subset) =>
    api.initiatives
      .list({ profile, page: 1, page_size: 1, result: SUBSET_RESULT[s] })
      .then((r) => r.total)
      .catch(() => null);
  const [data, groups, counts, allCount, votedCount, pendingCount] = await Promise.all([
    api.initiatives
      .list({ profile, page, page_size: PAGE_SIZE, result: SUBSET_RESULT[subset] })
      .catch(() => null),
    api.groups.list().catch(() => [] as ParliamentaryGroupSummary[]),
    api.initiatives.profiles().catch(() => null),
    countOf('all'),
    countOf('voted'),
    countOf('pending'),
  ]);
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hrefFor = (s: Subset, p = 1) => {
    const qs = new URLSearchParams();
    const e = s === 'voted' ? 'votades' : s === 'pending' ? 'en-tramit' : null;
    if (e) qs.set('estat', e);
    if (p > 1) qs.set('page', String(p));
    const q = qs.toString();
    return (q ? `/et-afecta/${profile}?${q}` : `/et-afecta/${profile}`) as Route;
  };
  const pageHref = (p: number) => hrefFor(subset, p);

  return (
    <div>
      <PageHeader
        hue="var(--hue-lleis)"
        title={t(`title_${profile}` as 'title_jove')}
        subtitle={(allCount ?? total) > 0 ? t('page_lede', { n: allCount ?? total }) : t('empty')}
        icon={<Icon size={20} strokeWidth={1.8} aria-hidden="true" />}
      />

      {(allCount ?? 0) > 0 && (
        <div className="seg-tabs" role="tablist" aria-label={t('filter_aria')}>
          {(
            [
              ['all', t('filter_all'), allCount],
              ['voted', t('filter_voted'), votedCount],
              ['pending', t('filter_pending'), pendingCount],
            ] as const
          ).map(([key, label, n]) => (
            <Link
              key={key}
              href={hrefFor(key)}
              role="tab"
              aria-selected={subset === key}
              className={subset === key ? 'is-active' : undefined}
            >
              {label}
              {n != null && <span className="tabular">{n}</span>}
            </Link>
          ))}
        </div>
      )}

      {data && data.items.length === 0 && (allCount ?? 0) > 0 && (
        <p style={{ marginTop: 18, color: 'var(--ink-3)', fontSize: 14 }}>{t('filter_empty')}</p>
      )}

      {data && data.items.length > 0 && (
        <ul style={{ ...LAW_CARD_LIST_STYLE, marginTop: 14 }}>
          {data.items.map((i: InitiativeListItem) => (
            <LawCard
              key={i.id}
              initiative={i}
              parsed={parseProposer(i.submitted_by, groups)}
              locale={locale}
              profileKey={profile}
            />
          ))}
        </ul>
      )}

      {lastPage > 1 && (
        <nav className="profile-pager" aria-label={t('pager_aria')}>
          {page > 1 ? (
            <Link href={pageHref(page - 1)}>
              <ChevronLeft size={16} aria-hidden="true" />
              {t('pager_prev')}
            </Link>
          ) : (
            <span />
          )}
          <span className="tabular">
            {page} / {lastPage}
          </span>
          {page < lastPage ? (
            <Link href={pageHref(page + 1)}>
              {t('pager_next')}
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}

      <div style={{ marginTop: 36 }}>
        <h2 className="profiles-other">{t('other_profiles')}</h2>
        <ProfilePicker
          heading={false}
          counts={counts ? new Map(counts.filter((c) => c.key !== profile).map((c) => [c.key, c.count])) : null}
        />
      </div>
    </div>
  );
}
