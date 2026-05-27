import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';
import { Users } from 'lucide-react';

import { DeputiesList } from '@/components/DeputiesList';
import { GroupListPanel } from '@/components/GroupListPanel';
import { HubTabs } from '@/components/HubTabs';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';

type PersonsTab = 'diputats' | 'grups';

interface SearchParams {
  tab?: string;
}

export default async function PersonsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations('persons');
  const tNav = await getTranslations('nav');
  const params = await searchParams;
  const activeTab: PersonsTab = params.tab === 'grups' ? 'grups' : 'diputats';

  return (
    <div>
      <PageHeader
        title={tNav('persons')}
        subtitle={t('hub_eyebrow')}
        icon={<Users size={20} strokeWidth={1.8} aria-hidden="true" />}
      />

      <HubTabs
        ariaLabel="Vistes de representants"
        tabs={[
          {
            href: '/persons' as Route,
            label: t('title'),
            active: activeTab === 'diputats',
          },
          {
            href: '/persons?tab=grups' as Route,
            label: t('groups_tab_label'),
            active: activeTab === 'grups',
          },
        ]}
      />

      {activeTab === 'diputats' ? <DiputatsTab /> : <GroupListPanel />}
    </div>
  );
}

async function DiputatsTab() {
  // We fetch:
  // - groups: for the right-hand sidebar + the group filter combobox
  // - hemicycle layout: serves a DUAL purpose — drives the SVG chart
  //   AND supplies every active deputy (name, photo_url, group, slug,
  //   constituency) so the directory list can render entirely client
  //   side without an extra paginated `/persons` call.
  //
  // The hemicycle endpoint is graceful (returns 200 + every active
  // deputy even when seat coordinates haven't been ingested yet). We
  // still ``catch`` to keep the page interactive if the backend goes
  // away — the empty layout produces an empty list and an empty SVG,
  // and the groups sidebar continues to render.
  const [groups, hemicycleLayout] = await Promise.all([
    api.groups.list(),
    api.legislatures.hemicycle(1).catch(() => null),
  ]);

  return <DeputiesList layout={hemicycleLayout} groups={groups} />;
}
