import { getTranslations } from 'next-intl/server';
import { Building2 } from 'lucide-react';

import { GroupListPanel } from '@/components/GroupListPanel';
import { LegislatureSelector } from '@/components/LegislatureSelector';
import { PageHeader } from '@/components/PageHeader';
import { api, type Legislature } from '@/lib/api';

interface SearchParams {
  /** Legislature id to browse (historical). Absent = current (active). */
  legislature?: string;
}

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations('groups');
  const tVotes = await getTranslations('votes');
  const params = await searchParams;

  const legislatures = await api.legislatures
    .list()
    .then((rows) => rows.slice().sort((a, b) => b.start_date.localeCompare(a.start_date)))
    .catch(() => [] as Legislature[]);
  const activeLeg = legislatures.find((l) => l.status === 'active') ?? legislatures[0] ?? null;
  const requestedId = params.legislature ? Number(params.legislature) : null;
  const selectedLeg =
    (requestedId != null && legislatures.find((l) => l.id === requestedId)) || activeLeg;
  const selectedLegId = selectedLeg?.id;
  const isHistorical = !!selectedLeg && !!activeLeg && selectedLeg.id !== activeLeg.id;

  const groups = await api.groups.list(selectedLegId);
  const totalMembers = groups.reduce((acc, g) => acc + g.members_active, 0);

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', { count: groups.length, members: totalMembers })}
        icon={<Building2 size={20} strokeWidth={1.8} aria-hidden="true" />}
        bordered
      />
      {legislatures.length > 1 && selectedLegId != null && (
        <div style={{ paddingTop: 16 }}>
          <LegislatureSelector
            legislatures={legislatures}
            activeId={activeLeg?.id ?? null}
            selectedId={selectedLegId}
            label={tVotes('legislature_label')}
            currentSuffix={tVotes('legislature_current')}
          />
        </div>
      )}
      {isHistorical && selectedLeg && (
        <p
          style={{
            margin: '10px 0 0',
            padding: '8px 12px',
            borderRadius: 8,
            background: 'var(--paper-2)',
            border: '1px solid var(--rule)',
            fontSize: 12.5,
            color: 'var(--ink-2)',
            lineHeight: 1.5,
          }}
        >
          {tVotes('legislature_historical_note', {
            number: selectedLeg.number,
            start: new Date(selectedLeg.start_date).getFullYear(),
            end: selectedLeg.end_date ? new Date(selectedLeg.end_date).getFullYear() : '',
          })}
        </p>
      )}
      <GroupListPanel legislatureId={selectedLegId} />
    </div>
  );
}
