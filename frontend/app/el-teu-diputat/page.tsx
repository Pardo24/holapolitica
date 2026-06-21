import Link from 'next/link';
import type { Route } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { MapPin, User } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { ConstituencySelect } from '@/components/ConstituencySelect';
import { api, type ConstituencyRow, type DeputyCard } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';

export const revalidate = 300;

interface SearchParams {
  prov?: string;
}

/**
 * "El teu diputat" — hyperlocal accountability. Pick your province and see the
 * people who represent you: how present they are, how often they break with
 * their own party, and a way into their full record. Reuses the existing
 * attendance / dissidence metrics, scoped to the constituency.
 */
export default async function ElTeuDiputatPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations('deputy');
  const locale = await getLocale();
  const { prov } = await searchParams;

  const constituencies: ConstituencyRow[] = await api.persons
    .constituencies()
    .catch(() => [] as ConstituencyRow[]);
  const selected = prov && constituencies.some((c) => c.name === prov) ? prov : null;

  const deputies: DeputyCard[] = selected
    ? await api.persons.byConstituency(selected).catch(() => [] as DeputyCard[])
    : [];

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<MapPin size={20} strokeWidth={1.8} aria-hidden="true" />}
        bordered
      />

      <div style={{ paddingTop: 18, marginBottom: 18 }}>
        <ConstituencySelect
          constituencies={constituencies}
          selected={selected}
          label={t('picker_label')}
          placeholder={t('picker_placeholder')}
        />
      </div>

      {!selected ? (
        <p style={{ fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.6 }}>{t('pick_prompt')}</p>
      ) : deputies.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>{t('empty')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {deputies.map((d) => (
            <DeputyCardView key={d.person_id} d={d} locale={locale} labels={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function pct(v: number | null): string {
  return v == null ? '—' : `${Math.round(v * 100)}%`;
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
  return (
    <Link
      href={`/persons/${d.person_id}` as Route}
      style={{
        display: 'block',
        background: 'var(--paper-2)',
        border: '1px solid var(--rule)',
        borderRadius: 12,
        padding: '16px 18px',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span
          aria-hidden="true"
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            flex: 'none',
            background: 'var(--paper-3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            borderTop: `3px solid ${d.group_color ?? 'var(--ink)'}`,
          }}
        >
          {d.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.photo_url} alt="" width={44} height={44} style={{ objectFit: 'cover' }} />
          ) : (
            <User size={20} strokeWidth={1.8} color="var(--ink-3)" />
          )}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>
            {d.full_name}
          </span>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--ink-3)' }}>
            {d.group_short ? displayGroupShort(d.group_short) : '—'}
            {d.constituency ? ` · ${d.constituency}` : ''}
          </span>
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ background: 'var(--paper)', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{labels('attendance')}</div>
          <div className="tabular" style={{ fontSize: 22, fontWeight: 600, color: 'var(--ink)' }}>
            {pct(d.attendance_pct)}
          </div>
        </div>
        <div style={{ background: 'var(--paper)', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{labels('independence')}</div>
          <div className="tabular" style={{ fontSize: 22, fontWeight: 600, color: 'var(--ink)' }}>
            {pct(d.dissidence_pct)}
          </div>
        </div>
      </div>
    </Link>
  );
}
