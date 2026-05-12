import { ImageResponse } from 'next/og';
import { getLocale, getTranslations } from 'next-intl/server';

import { api, ApiError, type Initiative } from '@/lib/api';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = "Fitxa d'una iniciativa al Congrés";

const STATUS_COLOR: Record<string, string> = {
  approved: '#16a34a',
  rejected: '#dc2626',
  in_debate: '#7c3aed',
  submitted: '#3b82f6',
  withdrawn: '#6b7280',
  expired: '#6b7280',
};

const STATUS_LABEL: Record<string, string> = {
  approved: 'Aprovada',
  rejected: 'Rebutjada',
  in_debate: 'En debat',
  submitted: 'Registrada',
  withdrawn: 'Retirada',
  expired: 'Caducada',
};

export default async function InitiativeOg({
  params,
}: {
  params: { id: string };
}) {
  const t = await getTranslations('og');
  const locale = await getLocale();

  let initiative: Initiative | null = null;
  try {
    initiative = await api.initiatives.get(Number(params.id));
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
  }

  if (!initiative) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: '#fbf9f4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#1a2138',
            fontSize: 48,
            fontWeight: 600,
          }}
        >
          Hola Política
        </div>
      ),
      { ...size },
    );
  }

  const title =
    locale === 'es' && initiative.title_es
      ? initiative.title_es
      : locale === 'en' && initiative.title_en
        ? initiative.title_en
        : initiative.title_ca ?? initiative.title_original;
  const titleShort = title.length > 200 ? title.slice(0, 197) + '…' : title;
  const submittedAt = initiative.submitted_at
    ? new Date(initiative.submitted_at).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';
  const statusLabel = STATUS_LABEL[initiative.status] ?? initiative.status;
  const statusColor = STATUS_COLOR[initiative.status] ?? '#1a2138';

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
                justifyContent: 'flex-start',
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
                {t('motto')}
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
            Iniciativa · {initiative.official_id}
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
          {submittedAt && (
            <div
              style={{
                fontSize: 14,
                color: '#3f4c66',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                marginBottom: 18,
              }}
            >
              {submittedAt}
            </div>
          )}
          <div
            style={{
              fontSize: titleShort.length > 140 ? 34 : 42,
              lineHeight: 1.2,
              color: '#1a2138',
              fontWeight: 600,
              letterSpacing: '-0.015em',
              fontFamily: 'serif',
            }}
          >
            {titleShort}
          </div>
          {initiative.submitted_by && (
            <div
              style={{
                marginTop: 16,
                fontSize: 16,
                color: '#3f4c66',
                fontStyle: 'italic',
              }}
            >
              {initiative.submitted_by}
            </div>
          )}
        </div>

        {/* Footer: status pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 30,
            paddingTop: 18,
            borderTop: '1px solid #d2cdbc',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span
              style={{
                fontSize: 12,
                color: '#3f4c66',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}
            >
              Estat
            </span>
            <span
              style={{
                fontSize: 40,
                fontWeight: 700,
                color: statusColor,
                letterSpacing: '-0.015em',
              }}
            >
              {statusLabel}
            </span>
          </div>
          <div
            style={{
              fontSize: 12,
              color: '#3f4c66',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            holapolitica.org
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
