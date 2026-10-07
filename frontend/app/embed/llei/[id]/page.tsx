import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { EmbedFooter } from '@/components/EmbedFooter';
import { LawCard } from '@/components/LawCard';
import { LAW_CARD_LIST_STYLE } from '@/components/LawCardParts';
import { api, type ParliamentaryGroupSummary } from '@/lib/api';
import { parseProposer } from '@/lib/groups';

/**
 * Embeddable law: the same card as /lleis.
 *
 * What it does in plain language, who it affects, how it ended and how
 * every group voted, with the per-group detail one tap away. The older
 * dossier widget led with the official title and a row of loose figures;
 * this one is the card readers of the site already know.
 *
 * <iframe src="https://www.holapolitica.org/embed/llei/1584" ...>
 */
export const revalidate = 1800;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('embed_widgets');
  return { title: t('law_meta_title'), robots: { index: false } };
}

export default async function EmbedLawPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations('embed_widgets');
  const locale = await getLocale();
  const numericId = Number.parseInt(id, 10);

  const [page, groups] = await Promise.all([
    Number.isFinite(numericId)
      ? api.initiatives.list({ ids: String(numericId), page_size: 1 }).catch(() => null)
      : Promise.resolve(null),
    api.groups.list(1).catch(() => [] as ParliamentaryGroupSummary[]),
  ]);
  const initiative = page?.items[0];

  if (!initiative) {
    return <p className="embed-empty">{t('not_found')}</p>;
  }

  return (
    <div className="embed-widget">
      <ul style={LAW_CARD_LIST_STYLE}>
        <LawCard initiative={initiative} parsed={parseProposer(initiative.submitted_by, groups)} locale={locale} />
      </ul>
      <EmbedFooter href={`/initiatives/${initiative.id}`} label={t('open_law')} />
    </div>
  );
}
