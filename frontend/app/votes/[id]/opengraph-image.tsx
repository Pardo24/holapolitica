import { ImageResponse } from 'next/og';
import { getLocale, getTranslations } from 'next-intl/server';

import { api, ApiError, type Vote } from '@/lib/api';
import { groupAbbreviation, readableTextOn } from '@/lib/groups';

/**
 * Dynamic share card for one vote — the "fact card" a citizen pastes
 * into a WhatsApp group to answer misinformation with the official
 * record. Upgraded from the counts-only version:
 *
 * - The AI plain-language summary leads as the headline (same
 *   AI-first rule as the page itself); official subject as fallback.
 * - NEW: per-group stance clusters — A FAVOR / EN CONTRA / ABSTENCIÓN
 *   with each group as a colour disc + abbreviation — so the card
 *   answers "who voted what" without opening the link. Discs, not our
 *   SVG logos: satori's SVG-in-img support is unreliable and discs
 *   stay legible at thumbnail size.
 *
 * Neutral by construction: result, counts and stances are verbatim
 * Congreso open data; no editorial framing.
 */

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Resultat de la votació al Congrés';

const RESULT_COLOR: Record<Vote['result'], string> = {
  approved: '#16a34a',
  rejected: '#dc2626',
  tie: '#ca8a04',
};

interface OgGroupRow {
  slug: string;
  name_short: string;
  color_hex: string | null;
  choices: Record<string, string>;
}

export default async function VoteOg({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations('og');
  const tSession = await getTranslations('session_sheet');
  const locale = await getLocale();
  const RESULT_LABEL: Record<Vote['result'], string> = {
    approved: t('vote_result_approved'),
    rejected: t('vote_result_rejected'),
    tie: t('vote_result_tie'),
  };
  let vote: Vote | null = null;
  let groups: OgGroupRow[] = [];
  try {
    vote = await api.votes.get(Number(id));
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
  }
  if (vote) {
    try {
      groups = (await api.votes.groupChoices([vote.id])).groups as OgGroupRow[];
    } catch {
      groups = [];
    }
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

  // AI-first headline, same rule as the vote page itself.
  const plain =
    (locale === 'es' ? vote.plain_summary_es : vote.plain_summary_ca) ??
    vote.plain_summary_es ??
    vote.plain_summary_ca ??
    null;
  const subject = plain ?? (vote.description?.trim() || vote.title);
  const subjectShort =
    subject.length > 200 ? subject.slice(0, 197) + '…' : subject;
  const date = new Date(vote.voted_at).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const resultLabel = RESULT_LABEL[vote.result];
  const resultColor = RESULT_COLOR[vote.result];

  const stance = (choice: string) =>
    groups.filter((g) => g.choices[String(vote.id)] === choice);
  const clusters = [
    { label: tSession('choice_aye'), color: '#16a34a', members: stance('aye') },
    { label: tSession('choice_no'), color: '#dc2626', members: stance('no') },
    { label: tSession('choice_abstention'), color: '#ca8a04', members: stance('abstention') },
  ].filter((c) => c.members.length > 0);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#fbf9f4',
          display: 'flex',
          flexDirection: 'column',
          padding: '48px 64px 40px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: 16,
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
            {t('vote_eyebrow')}
          </div>
        </div>

        {/* Result strip — the answer first: pill + date. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 24 }}>
          <span
            style={{
              background: resultColor,
              color: '#ffffff',
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '7px 20px',
              borderRadius: 999,
            }}
          >
            {resultLabel}
          </span>
          <span style={{ fontSize: 20, color: '#3f4c66' }}>{date}</span>
          {vote.expediente_raw && (
            <span style={{ fontSize: 16, color: '#6b7690', fontFamily: 'monospace' }}>
              {vote.expediente_raw}
            </span>
          )}
        </div>

        {/* Headline */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            paddingTop: 14,
            paddingBottom: 14,
          }}
        >
          <div
            style={{
              fontSize: subjectShort.length > 130 ? 32 : 40,
              lineHeight: 1.22,
              color: '#1a2138',
              fontWeight: 600,
              letterSpacing: '-0.01em',
              fontFamily: 'serif',
            }}
          >
            {subjectShort}
          </div>
        </div>

        {/* Who voted what — stance clusters with party discs. */}
        {clusters.length > 0 && (
          <div style={{ display: 'flex', gap: 36, marginBottom: 20, flexWrap: 'wrap' }}>
            {clusters.map((c) => (
              <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: c.color,
                  }}
                >
                  {c.label}
                </span>
                <div style={{ display: 'flex', gap: 5 }}>
                  {c.members.slice(0, 8).map((g) => (
                    <div
                      key={g.slug}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 999,
                        background: g.color_hex ?? '#9ca3af',
                        color: readableTextOn(g.color_hex),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: groupAbbreviation(g.slug).length > 3 ? 10 : 13,
                        fontWeight: 700,
                      }}
                    >
                      {groupAbbreviation(g.slug)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer: numbers + provenance */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 30,
            paddingTop: 16,
            borderTop: '1px solid #d2cdbc',
          }}
        >
          <div style={{ display: 'flex', gap: 28, alignItems: 'flex-end' }}>
            <Block label={t('vote_aye')} n={vote.ayes} color="#16a34a" />
            <Block label={t('vote_no')} n={vote.noes} color="#dc2626" />
            <Block label={t('vote_abst')} n={vote.abstentions} color="#ca8a04" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontSize: 19, fontWeight: 700, color: '#1a2138' }}>
              holapolitica.org
            </span>
            <span style={{ fontSize: 14, color: '#6b7690' }}>
              Open Data · Congreso de los Diputados
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}

function Block({ label, n, color }: { label: string; n: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
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
