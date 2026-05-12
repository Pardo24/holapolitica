import { getTranslations } from 'next-intl/server';

import { GroupListPanel } from '@/components/GroupListPanel';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';

export default async function GroupsPage() {
  const t = await getTranslations('groups');
  const groups = await api.groups.list();
  const totalMembers = groups.reduce((acc, g) => acc + g.members_active, 0);

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', { count: groups.length, members: totalMembers })}
        bordered
      />
      <GroupListPanel />
    </div>
  );
}
