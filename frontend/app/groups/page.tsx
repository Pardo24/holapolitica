import { getTranslations } from 'next-intl/server';

import { GroupListPanel } from '@/components/GroupListPanel';
import { api } from '@/lib/api';

export default async function GroupsPage() {
  const t = await getTranslations('groups');
  const groups = await api.groups.list();
  const totalMembers = groups.reduce((acc, g) => acc + g.members_active, 0);

  return (
    <div>
      <header
        style={{
          paddingTop: 28,
          paddingBottom: 18,
          borderBottom: '1px solid var(--ink)',
        }}
      >
        <div className="eyebrow">
          {t('subtitle', { count: groups.length, members: totalMembers })}
        </div>
        <h1 className="h-headline" style={{ margin: '4px 0 0' }}>
          {t('title')}
        </h1>
      </header>

      <GroupListPanel />
    </div>
  );
}
