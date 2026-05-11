import { ImageResponse } from 'next/og';
import { getLocale, getTranslations } from 'next-intl/server';

import { api, ApiError, type Vote } from '@/lib/api';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Resultat de la votació al Congrés';

const RESULT_COLOR: Record<Vote['result'], string> = {
  approved: '#16a34a',
  rejected: '#dc2626',
  tie: '#ca8a04',
};

export default async function VoteOg({ params }: { params: { id: string } }) {
  const t = await getTranslations('og');
  const locale = await getLocale();
  const RESULT_LABEL: Record<Vote['result'], string> = {
    approved: t('vote_result_approved'),
    rejected: t('vote_result_rejected'),
    tie: t('vote_result_tie'),
  };
  let vote: Vote | null = null;
  try {
    vote = await api.votes.get(Number(params.id));
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
  }

  // Fallback when the vote can't be loaded: render the brand card
  if (!vote) {
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

  const subject = vote.description?.trim() || vote.title;
  const subjectShort =
    subject.length > 220 ? subject.slice(0, 217) + '…' : subject;
  const date = new Date(vote.voted_at).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const total = vote.ayes + vote.noes + vote.abstentions;
  const resultLabel = RESULT_LABEL[vote.result];
  const resultColor = RESULT_COLOR[vote.result];

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
                position: 'relative',
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
            {t('vote_eyebrow')}
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
              display: 'flex',
              alignItems: 'baseline',
              gap: 18,
              marginBottom: 18,
            }}
          >
            <span
              style={{
                fontSize: 14,
                color: '#3f4c66',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}
            >
              {date}
            </span>
            {vote.expediente_raw && (
              <span style={{ fontSize: 13, color: '#3f4c66', fontFamily: 'monospace' }}>
                {t('vote_expediente_prefix', { id: vote.expediente_raw })}
              </span>
            )}
          </div>

          <div
            style={{
              fontSize: subjectShort.length > 140 ? 36 : 44,
              lineHeight: 1.18,
              color: '#1a2138',
              fontWeight: 600,
              letterSpacing: '-0.015em',
              fontFamily: 'serif',
            }}
          >
            {subjectShort}
          </div>
        </div>

        {/* Footer: result + numbers */}
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
              {t('vote_result_label')}
            </span>
            <span
              style={{
                fontSize: 40,
                fontWeight: 700,
                color: resultColor,
                letterSpacing: '-0.015em',
              }}
            >
              {resultLabel}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 28,
              alignItems: 'flex-end',
            }}
          >
            <Block label={t('vote_aye')} n={vote.ayes} color="#16a34a" />
            <Block label={t('vote_no')} n={vote.noes} color="#dc2626" />
            <Block label={t('vote_abst')} n={vote.abstentions} color="#ca8a04" />
            <Block label={t('vote_total')} n={total} color="#1a2138" />
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}

function Block({ label, n, color }: { label: string; n: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <span
        style={{
          fontSize: 11,
          color: '#3f4c66',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 36,
          fontWeight: 700,
          color,
          letterSpacing: '-0.02em',
          fontFamily: 'monospace',
        }}
      >
        {n}
      </span>
    </div>
  );
}
