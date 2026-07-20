import Link from 'next/link';
import type { Route } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { ChevronRight, MapPin, User } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { ConstituencySelect } from '@/components/ConstituencySelect';
import { GroupBadge } from '@/components/GroupBadge';
import { Hemicycle } from '@/components/Hemicycle';
import { PartyBand } from '@/components/PartyBand';
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
  const { prov } = await searchParams;

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
  const selected = prov && constituencies.some((c) => c.name === prov) ? prov : null;

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

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<MapPin size={20} strokeWidth={1.8} aria-hidden="true" />}
        bordered
      />

      <div style={{ paddingTop: 18, marginBottom: selected ? 18 : 0 }}>
        <ConstituencySelect
          constituencies={constituencies}
          selected={selected}
          label={t('picker_label')}
          placeholder={t('picker_placeholder')}
          geolocateLabel={t('geolocate')}
          detectingLabel={t('detecting')}
          geolocateError={t('geolocate_error')}
        />
      </div>

      {/* The chamber, on open. Every seat is a deputy you can hover/tap;
          picking (or detecting) a province lights up just its seats so you
          see where your representatives sit. */}
      {hemicycle && hemicycle.seats.length > 0 && (
        <section style={{ marginBottom: 24, maxWidth: 920 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>
            {t('hemicycle_title')}
          </div>
          <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '0 0 10px', lineHeight: 1.5 }}>
            {selected ? t('hemicycle_hint_selected', { prov: selected }) : t('hemicycle_hint')}
          </p>
          {/* Chart + clickable group legend (the legend doubles as the
              gateway to the party profile pages). Side padding keeps
              the seats off the screen edges on mobile. */}
          <div style={{ margin: '0 auto', paddingInline: 'clamp(10px, 3vw, 20px)' }}>
            <Hemicycle layout={hemicycle} highlightConstituency={selected} showLegend />
          </div>
        </section>
      )}

      {/* The parties themselves, absorbed from the old standalone /groups
          page. One card per group, each a large tap target straight into
          that party's profile — on a phone this is the primary way in,
          which is why it sits directly under the chamber map rather than
          behind a "see the parties" gateway card as it used to. */}
      <PartyBand
        groups={allGroups}
        variant="plain"
        title={tHome('parties_title')}
        caption={tHome('parties_caption')}
        seatsLabel={(n) => tHome('parties_seats', { n })}
      />

      {/* Remaining gateway: the map. The party gateway is gone — the
          parties are on this page now. */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 12,
          marginBottom: 28,
          maxWidth: 760,
        }}
      >
        {[
          {
            href: '/mapa' as Route,
            title: t('map_cta_title'),
            sub: t('map_cta_sub'),
          },
        ].map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="deputy-card"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '14px 18px',
              background: 'var(--paper-2)',
              border: '1px solid var(--rule)',
              borderRadius: 12,
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <span style={{ minWidth: 0 }}>
              <span
                className="serif"
                style={{ display: 'block', fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}
              >
                {c.title}
              </span>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>
                {c.sub}
              </span>
            </span>
            <ChevronRight
              size={17}
              strokeWidth={2}
              aria-hidden="true"
              style={{ color: 'var(--ink-3)', flex: 'none' }}
            />
          </Link>
        ))}
      </section>

      {!selected ? (
        <EmptyState title={t('empty_title')} body={t('pick_prompt')} />
      ) : deputies.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>{t('empty')}</p>
      ) : (
        <div>
          <p style={{ fontSize: 14, color: 'var(--ink-2)', margin: '0 0 18px', lineHeight: 1.5 }}>
            {t('summary', { prov: selected, n: deputies.length, g: parties.length })}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {parties.map((p) => (
              <section key={p.slug || 'none'}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
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
        </div>
      )}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        marginTop: 20,
        padding: '28px 24px',
        borderRadius: 16,
        border: '1px dashed var(--rule-strong)',
        background: 'var(--paper-2)',
        textAlign: 'center',
        maxWidth: 520,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 52,
          height: 52,
          borderRadius: 14,
          background: 'color-mix(in srgb, var(--accent) 14%, var(--paper))',
          color: 'var(--accent)',
          marginBottom: 12,
        }}
      >
        <MapPin size={26} strokeWidth={1.8} />
      </span>
      <div className="serif" style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
        {title}
      </div>
      <p style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.55, margin: 0 }}>{body}</p>
    </div>
  );
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
