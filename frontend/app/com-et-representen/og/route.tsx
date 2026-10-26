import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';

import { api } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';
import { INK, INK_2, OG_SIZE, OgFrame, ogLocale } from '@/lib/ogFrame';
import { parseQuizResult } from '@/lib/quizResult';

/**
 * Share image of a "Com et representen?" result: the group the reader
 * voted like most often and how often, as they chose to share it
 * (``?r=<slug>.<pct>.<votes>&l=<locale>``, from components/AlignQuiz.tsx).
 * The reader's own result, stated as such; the site adds no reading of it.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const locale = ogLocale(url.searchParams.get('l'));
  const result = parseQuizResult(url.searchParams.get('r'));
  if (!result) return new Response('Bad result', { status: 400 });
  const t = await getTranslations({ locale, namespace: 'og' });
  const groups = await api.groups.list().catch(() => []);
  const group = groups.find((g) => g.slug === result.slug);
  if (!group) return new Response('Unknown group', { status: 404 });
  const name = displayGroupShort(group.name_short);
  const color = group.color_hex ?? INK;

  return new ImageResponse(
    (
      <OgFrame motto={t('motto')} eyebrow={t('quiz_eyebrow')} footer={t('quiz_footer')}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 26 }}>
          <span style={{ fontSize: 150, fontWeight: 700, color, letterSpacing: '-0.04em', lineHeight: 1 }}>
            {`${result.pct}%`}
          </span>
        </div>
        <div style={{ display: 'flex', marginTop: 18, fontSize: 46, fontWeight: 700, color: INK }}>
          {t('quiz_title', { name })}
        </div>
        <div style={{ display: 'flex', marginTop: 12, fontSize: 24, color: INK_2 }}>
          {t('quiz_sub', { n: result.compared })}
        </div>
        <div style={{ display: 'flex', marginTop: 28, height: 14, width: 1060, borderRadius: 999, background: '#e8e4d8' }}>
          <div style={{ display: 'flex', width: `${result.pct}%`, height: 14, borderRadius: 999, background: color }} />
        </div>
      </OgFrame>
    ),
    { ...OG_SIZE, headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
}
