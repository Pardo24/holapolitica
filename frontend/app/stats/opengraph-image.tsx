import { ImageResponse } from 'next/og';

import { api, type StatsSummary } from '@/lib/api';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Estadístiques · Hola Política';

export default async function StatsOg() {
  let summary: StatsSummary | null = null;
  try {
    summary = await api.stats.summary();
  } catch {
    /* render with — */
  }
  const classifiedPct =
    summary && summary.initiatives_total > 0
      ? Math.round((summary.initiatives_classified / summary.initiatives_total) * 100)
      : null;

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
                Mirall, no megàfon.
              </span>
            </div>
          </div>
          <div
            style={{
              fontSize: 13,
              color: '#3f4c66',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            Estadístiques · XV legislatura
          </div>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            paddingTop: 30,
            paddingBottom: 30,
          }}
        >
          <div
            style={{
              fontSize: 56,
              fontWeight: 700,
              color: '#1a2138',
              letterSpacing: '-0.02em',
              fontFamily: 'serif',
              lineHeight: 1.05,
              maxWidth: 880,
            }}
          >
            Què vota el Congrés, classificat per tema.
          </div>
          <div
            style={{
              fontSize: 22,
              color: '#3f4c66',
              marginTop: 22,
              maxWidth: 880,
              lineHeight: 1.4,
            }}
          >
            Open data del Congrés dels Diputats: cada vot del ple, qui ho proposa,
            com vota cada grup. Tot en obert.
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
            label="Iniciatives"
            value={summary ? summary.initiatives_total.toLocaleString('ca-ES') : '—'}
          />
          <Kpi
            label="Votacions"
            value={summary ? summary.votes_total.toLocaleString('ca-ES') : '—'}
          />
          <Kpi
            label="Classificades"
            value={classifiedPct == null ? '—' : `${classifiedPct}%`}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
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
          fontSize: 44,
          fontWeight: 700,
          color: '#1a2138',
          letterSpacing: '-0.02em',
          fontFamily: 'monospace',
        }}
      >
        {value}
      </span>
    </div>
  );
}
