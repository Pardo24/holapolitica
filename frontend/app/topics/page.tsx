import { getTranslations } from 'next-intl/server';

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
      <header
        style={{
          paddingTop: 28,
          paddingBottom: 18,
          borderBottom: '1px solid var(--ink)',
        }}
      >
        <div className="eyebrow">Taxonomia · classificació automàtica</div>
        <h1 className="h-headline" style={{ margin: '4px 0 0' }}>
          {t('title')}
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--ink-3)',
            marginTop: 6,
            maxWidth: 760,
          }}
        >
          {t('subtitle')}
        </p>
      </header>

      <TopicListPanel activeKind={activeKind} hrefBase="/topics" />
    </div>
  );
}
