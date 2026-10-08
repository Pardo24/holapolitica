import Link from 'next/link';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { ChevronRight, MapPin, User } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { GroupBadge } from '@/components/GroupBadge';
import { DeputiesList } from '@/components/DeputiesList';
import { GroupListPanel } from '@/components/GroupListPanel';
import { Hemicycle } from '@/components/Hemicycle';
import { HubTabs } from '@/components/HubTabs';
import { PartyBand } from '@/components/PartyBand';
import { ProvincePicker, type ProvincePickerLabels } from '@/components/ProvincePicker';
import {
  api,
  type ConstituencyRow,
  type DeputyCard,
  type HemicycleLayout,
  type ParliamentaryGroupSummary,
} from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';

export const revalidate = 300;

interface SearchParams {
  prov?: string;
  /** meus (default) | tots | grups */
  tab?: string;
}

interface PartyGroup {
  slug: string;
  short: string | null;
  color: string | null;
  deputies: DeputyCard[];
}

/**
 * "El teu diputat" — hyperlocal accountability. Pick your province and see who
 * represents you, grouped by party so the makeup of your constituency reads at
 * a glance: who they are, how present they are, and a way into their full
 * record. Reuses the existing attendance metric, scoped to the constituency.
 */
export default async function ElTeuDiputatPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations('deputy');
  const tHome = await getTranslations('home');
  const locale = await getLocale();
  const { prov, tab } = await searchParams;
  const activeTab = tab === 'grups' ? 'grups' : tab === 'tots' ? 'tots' : 'meus';

  const [constituencies, hemicycle, allGroups]: [
    ConstituencyRow[],
    HemicycleLayout | null,
    ParliamentaryGroupSummary[],
  ] = await Promise.all([
    api.persons.constituencies().catch(() => [] as ConstituencyRow[]),
    // Drives the chamber map at the top of the page. Graceful: an empty
    // layout just renders nothing.
    api.legislatures.hemicycle(1).catch(() => null),
    api.groups.list().catch(() => [] as ParliamentaryGroupSummary[]),
  ]);
  // The URL wins (a shared link shows what was shared); otherwise the
  // province this reader picked last time, so the tab opens on their
  // deputies instead of asking again.
  const remembered = (await cookies()).get('hp_prov')?.value;
  const wanted = prov ?? (remembered ? safeDecode(remembered) : undefined);
  const selected = wanted && constituencies.some((c) => c.name === wanted) ? wanted : null;

  const deputies: DeputyCard[] = selected
    ? await api.persons.byConstituency(selected).catch(() => [] as DeputyCard[])
    : [];

  // Group the deputies by their parliamentary group, largest first, so the
  // constituency's makeup is the first thing you read.
  const byGroup = new Map<string, PartyGroup>();
  for (const d of deputies) {
    const key = d.group_slug ?? '—';
    const g = byGroup.get(key);
    if (g) g.deputies.push(d);
    else byGroup.set(key, { slug: d.group_slug ?? '', short: d.group_short, color: d.group_color, deputies: [d] });
  }
  const parties = [...byGroup.values()].sort((a, b) => b.deputies.length - a.deputies.length);

  // One page for the chamber's people, three questions: who represents ME,
  // who are they ALL, and how do they group. /persons used to answer the
  // last two with its own hemicycle and its own group list, so the site had
  // two pages showing the same thing under different names.
  const tabs = (
    <HubTabs
      ariaLabel={t('tabs_aria')}
      tabs={[
        {
          href: '/el-teu-diputat' as Route,
          label: t('tab_mine'),
          shortLabel: t('tab_mine_short'),
          active: activeTab === 'meus',
        },
        {
          href: '/el-teu-diputat?tab=tots' as Route,
          label: t('tab_all'),
          shortLabel: t('tab_all_short'),
          active: activeTab === 'tots',
        },
        {
          href: '/el-teu-diputat?tab=grups' as Route,
          label: t('tab_groups'),
          shortLabel: t('tab_groups_short'),
          active: activeTab === 'grups',
        },
      ]}
    />
  );

  if (activeTab !== 'meus') {
    return (
      <div>
        <PageHeader
        hue="var(--hue-partits)"
          title={t('title')}
          subtitle={t('subtitle')}
          icon={<MapPin size={20} strokeWidth={1.8} aria-hidden="true" />}
          bordered
        />
        {tabs}
        {activeTab === 'grups' ? (
          <GroupListPanel />
        ) : (
          <DeputiesList layout={hemicycle} groups={allGroups} />
        )}
      </div>
    );
  }

  const pickerLabels: ProvincePickerLabels = {
    title: t('empty_title'),
    body: t('locate_body'),
    cta: t('locate_cta'),
    detecting: t('detecting'),
    manual: t('locate_manual'),
    privacy: t('locate_privacy'),
    placeholder: t('picker_placeholder'),
    change: t('bar_change'),
    notYours: t('bar_not_yours'),
    errorGeneric: t('geolocate_error'),
    errorDenied: t('geolocate_denied'),
    errorOutside: t('geolocate_outside'),
  };

  return (
    <div>
      <PageHeader
        hue="var(--hue-partits)"
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<MapPin size={20} strokeWidth={1.8} aria-hidden="true" />}
        bordered
      />
      {tabs}

      {/* The answer first. Before, the reader's own deputies came after
          the chamber map, the nine party cards and the map link: on a
          phone, three screens down from the question they came with. */}
      {!selected ? (
        <ProvincePicker variant="hero" constituencies={constituencies} selected={null} labels={pickerLabels} />
      ) : (
        <>
          <ProvincePicker
            variant="bar"
            constituencies={constituencies}
            selected={selected}
            counts={t('bar_counts', { n: deputies.length, g: parties.length })}
            labels={pickerLabels}
          />
          {deputies.length === 0 ? (
            <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>{t('empty')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginBottom: 30 }}>
              {parties.map((p) => (
                <section key={p.slug || 'none'}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    {p.slug ? <GroupBadge slug={p.slug} color={p.color} size="sm" link={false} /> : null}
                    <span className="serif" style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>
                      {p.short ? displayGroupShort(p.short) : '—'}
                    </span>
                    <span
                      className="tabular"
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--ink-3)',
                        background: 'var(--paper-3)',
                        borderRadius: 999,
                        padding: '2px 9px',
                      }}
                    >
                      {p.deputies.length}
                    </span>
                  </div>
                  <div
                    className="dep-group-grid"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(248px, 1fr))',
                      gap: 10,
                    }}
                  >
                    {p.deputies.map((d) => (
                      <DeputyCardView key={d.person_id} d={d} locale={locale} labels={t} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {/* The chamber. Every seat is a deputy you can tap; a chosen
          province lights up just its seats. */}
      {hemicycle && hemicycle.seats.length > 0 && (
        <section style={{ marginBottom: 24, maxWidth: 920 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>
            {t('hemicycle_title')}
          </div>
          <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '0 0 10px', lineHeight: 1.5 }}>
            {selected ? t('hemicycle_hint_selected', { prov: selected }) : t('hemicycle_hint')}
          </p>
          <div style={{ margin: '0 auto', paddingInline: 'clamp(10px, 3vw, 20px)' }}>
            <Hemicycle layout={hemicycle} highlightConstituency={selected} showLegend />
          </div>
        </section>
      )}

      {/* The parties themselves: one card per group, each a large tap
          target straight into that party's profile. */}
      <PartyBand
        groups={allGroups}
        variant="plain"
        title={tHome('parties_title')}
        caption={tHome('parties_caption')}
        seatsLabel={(n) => tHome('parties_seats', { n })}
      />

      <Link
        href={'/mapa' as Route}
        className="deputy-card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '14px 18px',
          marginBottom: 28,
          maxWidth: 760,
          background: 'var(--paper-2)',
          border: '1px solid var(--rule)',
          borderRadius: 12,
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <span style={{ minWidth: 0 }}>
          <span className="serif" style={{ display: 'block', fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>
            {t('map_cta_title')}
          </span>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>
            {t('map_cta_sub')}
          </span>
        </span>
        <ChevronRight size={17} strokeWidth={2} aria-hidden="true" style={{ color: 'var(--ink-3)', flex: 'none' }} />
      </Link>
    </div>
  );
}

function safeDecode(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function DeputyCardView({
  d,
  locale,
  labels,
}: {
  d: DeputyCard;
  locale: string;
  labels: Awaited<ReturnType<typeof getTranslations<'deputy'>>>;
}) {
  const attendance = d.attendance_pct == null ? null : Math.round(d.attendance_pct * 100);
  return (
    <Link
      href={`/persons/${d.person_id}` as Route}
      className="deputy-card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 12px',
        background: 'var(--paper-2)',
        border: '1px solid var(--rule)',
        borderRadius: 12,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 46,
          height: 46,
          borderRadius: 999,
          flex: 'none',
          background: 'var(--paper-3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          boxShadow: `0 0 0 2px ${d.group_color ?? 'var(--rule-strong)'}`,
        }}
      >
        {d.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.photo_url} alt="" width={46} height={46} style={{ objectFit: 'cover' }} />
        ) : (
          <User size={20} strokeWidth={1.8} color="var(--ink-3)" />
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontWeight: 600,
            fontSize: 14.5,
            color: 'var(--ink)',
            lineHeight: 1.25,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {d.full_name}
        </span>
        <span className="tabular" style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
          {attendance == null
            ? labels('votes_cast', { n: d.votes_cast })
            : `${labels('attendance')} ${attendance}% · ${labels('votes_cast', { n: d.votes_cast })}`}
        </span>
      </span>
      <ChevronRight size={17} strokeWidth={2} aria-hidden="true" style={{ color: 'var(--ink-3)', flex: 'none' }} />
      <style>{`.deputy-card:hover, .deputy-card:focus-visible { border-color: var(--ink); outline: none; }`}</style>
    </Link>
  );
}
