import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@/components/PageHeader';
import { TopicListPanel } from '@/components/TopicListPanel';
import type { TopicKind } from '@/lib/api';

// Default classification knowledge base. The editorial taxonomy stays the
// landing experience; the SDG tab is a secondary lens (cf. CLAUDE.md
// "mirall, no megàfon" — UN-official descriptive framing, no editorialising).
const DEFAULT_KIND: TopicKind = 'theme';

interface SearchParams {
  kind?: string;
}

export default async function TopicsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations('topics');
  const { kind: rawKind } = await searchParams;
  const activeKind: TopicKind = rawKind === 'sdg' ? 'sdg' : DEFAULT_KIND;

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle="Taxonomia · classificació automàtica"
        bordered
      >
        <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0, maxWidth: 760 }}>
          {t('subtitle')}
        </p>
      </PageHeader>

      <TopicListPanel activeKind={activeKind} hrefBase="/topics" />
    </div>
  );
}
