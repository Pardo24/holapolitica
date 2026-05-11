import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';

import { api, ApiError, type Person, type PersonKPIs } from '@/lib/api';
import { displayGroupShort, groupAbbreviation, readableTextOn } from '@/lib/groups';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Activitat parlamentària · Hola Política';

export default async function PersonOg({ params }: { params: { id: string } }) {
  const t = await getTranslations('og');
  let person: Person | null = null;
  let kpis: PersonKPIs | null = null;
  try {
    [person, kpis] = await Promise.all([
      api.persons.get(Number(params.id)),
      api.persons.kpis(Number(params.id)).catch(() => null),
    ]);
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
  }

  if (!person) {
    return new ImageResponse(
      (
        <div style={fallback}>Hola Política</div>
      ),
      { ...size },
    );
  }

  const groupColor = person.current_group_color ?? '#9ca3af';
  const groupSlug = person.current_group_slug ?? '';
  const abbrev = groupAbbreviation(groupSlug);
  const groupShort = person.current_group_short
    ? displayGroupShort(person.current_group_short)
    : t('person_no_group');
  const attendancePct =
    kpis && kpis.attendance_pct !== null
      ? `${Math.round(kpis.attendance_pct * 100)}%`
      : '—';
  const dissidencePct =
    kpis && kpis.dissidence_pct !== null
      ? `${Math.round(kpis.dissidence_pct * 100)}%`
      : '—';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#fbf9f4',
          display: 'flex',
          flexDirection: 'column',
          padding: '60px 70px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: 18,
            borderBottom: '2px solid #1a2138',
          }}
        >
          <Brand motto={t('motto')} />
          <div
            style={{
              fontSize: 13,
              color: '#3f4c66',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            {t('person_eyebrow')}
          </div>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 50,
            paddingTop: 30,
            paddingBottom: 30,
          }}
        >
          {/* Left: group disc + name */}
          <div
            style={{
              width: 200,
              height: 200,
              borderRadius: 999,
              background: groupColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: readableTextOn(groupColor),
              fontWeight: 800,
              fontSize: abbrev.length >= 4 ? 44 : 64,
              letterSpacing: abbrev.length >= 4 ? '-0.04em' : '-0.01em',
              flexShrink: 0,
            }}
          >
            {abbrev}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <span
              style={{
                fontSize: 13,
                color: '#3f4c66',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}
            >
              {groupShort}
              {person.current_constituency ? ` · ${person.current_constituency}` : ''}
            </span>
            <span
              style={{
                fontSize: 56,
                fontWeight: 700,
                color: '#1a2138',
                letterSpacing: '-0.02em',
                marginTop: 6,
                lineHeight: 1.1,
                fontFamily: 'serif',
              }}
            >
              {person.full_name}
            </span>
          </div>
        </div>

        {/* Footer KPIs */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            paddingTop: 18,
            borderTop: '1px solid #d2cdbc',
            gap: 30,
          }}
        >
          <Kpi
            label={t('person_kpi_votes_cast')}
            value={String(kpis?.votes_cast ?? '—')}
            sub={kpis ? t('person_kpi_of_total', { total: kpis.votes_total }) : ''}
          />
          <Kpi label={t('person_kpi_attendance')} value={attendancePct} sub="" />
          <Kpi
            label={t('person_kpi_dissidence')}
            value={dissidencePct}
            sub={kpis ? t('person_kpi_times', { count: kpis.dissents }) : ''}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}

const fallback: React.CSSProperties = {
  width: '100%',
  height: '100%',
  background: '#fbf9f4',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#1a2138',
  fontSize: 48,
  fontWeight: 600,
};

function Brand({ motto }: { motto: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div
        style={{
          width: 32,
          height: 32,
          border: '2.5px solid #1a2138',
          display: 'flex',
          flexDirection: 'column',
          padding: '8px 0 0',
        }}
      >
        <div style={{ height: 2.5, background: '#1a2138', marginBottom: 5 }} />
        <div style={{ height: 2.5, background: '#1a2138' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: '#1a2138' }}>
          Hola Política
        </span>
        <span style={{ fontSize: 14, color: '#3f4c66', fontStyle: 'italic' }}>
          {motto}
        </span>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span
        style={{
          fontSize: 12,
          color: '#3f4c66',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 38,
          fontWeight: 700,
          color: '#1a2138',
          letterSpacing: '-0.02em',
          fontFamily: 'monospace',
        }}
      >
        {value}
      </span>
      {sub && <span style={{ fontSize: 12, color: '#3f4c66' }}>{sub}</span>}
    </div>
  );
}
