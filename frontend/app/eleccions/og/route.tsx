import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';

import { api } from '@/lib/api';
import { electionParty } from '@/lib/electionParties';
import { INK, INK_2, OG_SIZE, OgFrame, ogLocale } from '@/lib/ogFrame';

/**
 * Share image of one constituency's candidacies, for links to
 * /eleccions?circ=… ("who stands in Girona" travels on social media more
 * than any other page of the section). ``?circ=<name>&l=<locale>``.
 *
 * The lists in the BOE's ballot order, as on the page; before the BOE
 * publishes them, the seats and when they arrive.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const locale = ogLocale(url.searchParams.get('l'));
  const circ = url.searchParams.get('circ') ?? '';
  const t = await getTranslations({ locale, namespace: 'og' });
  const tE = await getTranslations({ locale, namespace: 'elections' });

  const status = await api.elections.candidacies().catch(() => null);
  const summary = status?.constituencies.find((c) => c.constituency === circ);
  if (!summary) return new Response('Unknown constituency', { status: 404 });
  const data = status?.stage ? await api.elections.constituency(circ).catch(() => null) : null;
  const lists = data?.lists ?? [];
  const shown = lists.slice(0, 8);

  return new ImageResponse(
    (
      <OgFrame motto={t('motto')} eyebrow={tE('eyebrow')} footer={t('circ_footer')}>
        <div style={{ display: 'flex', fontSize: 52, fontWeight: 700, color: INK, letterSpacing: '-0.02em' }}>
          {t('circ_title', { circ })}
        </div>
        <div style={{ display: 'flex', marginTop: 12, fontSize: 24, color: INK_2 }}>
          {lists.length > 0
            ? t('circ_facts', { seats: summary.seats, lists: lists.length })
            : t('circ_facts_pending', { seats: summary.seats })}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 30 }}>
          {shown.length === 0 ? (
            <div style={{ display: 'flex', fontSize: 22, color: INK_2 }}>{t('circ_pending')}</div>
          ) : (
            shown.map((l) => (
              <div
                key={l.ballot_order}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 16px',
                  borderRadius: 999,
                  border: `2px solid ${electionParty(l.party)?.color ?? '#9aa0aa'}`,
                  background: '#fff',
                  fontSize: 22,
                  fontWeight: 700,
                  color: INK,
                }}
              >
                {(l.acronym ?? l.name).slice(0, 28)}
              </div>
            ))
          )}
          {lists.length > shown.length && (
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 20, color: INK_2 }}>
              {t('circ_more', { n: lists.length - shown.length })}
            </div>
          )}
        </div>
      </OgFrame>
    ),
    {
      ...OG_SIZE,
      // The lists change twice in the campaign; an hour is plenty.
      headers: { 'Cache-Control': 'public, max-age=3600' },
    },
  );
}
