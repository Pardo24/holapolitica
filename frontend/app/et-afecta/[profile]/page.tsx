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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ profile: string }>;
}): Promise<Metadata> {
  const { profile } = await params;
  if (!isProfileKey(profile)) return {};
  const t = await getTranslations('profiles');
  return {
    title: `${t(`title_${profile}` as 'title_jove')} · Hola Política`,
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
  searchParams: Promise<{ page?: string }>;
}) {
  const { profile } = await params;
  if (!isProfileKey(profile)) notFound();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const t = await getTranslations('profiles');
  const locale = await getLocale();
  const Icon = profileIcon(profile);

  const [data, groups, counts] = await Promise.all([
    api.initiatives
      .list({ profile, creates_law: true, page, page_size: PAGE_SIZE })
      .catch(() => null),
    api.groups.list().catch(() => [] as ParliamentaryGroupSummary[]),
    api.initiatives.profiles().catch(() => null),
  ]);
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) =>
    (p > 1 ? `/et-afecta/${profile}?page=${p}` : `/et-afecta/${profile}`) as Route;

  return (
    <div>
      <PageHeader
        hue="var(--hue-lleis)"
        title={t(`title_${profile}` as 'title_jove')}
        subtitle={total > 0 ? t('page_lede', { n: total }) : t('empty')}
        icon={<Icon size={20} strokeWidth={1.8} aria-hidden="true" />}
      />

      {data && data.items.length > 0 && (
        <ul style={{ ...LAW_CARD_LIST_STYLE, marginTop: 18 }}>
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
