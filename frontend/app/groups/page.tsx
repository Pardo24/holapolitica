import { getTranslations } from 'next-intl/server';
import { Building2 } from 'lucide-react';

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
        icon={<Building2 size={20} strokeWidth={1.8} aria-hidden="true" />}
        bordered
      />
      <GroupListPanel />
    </div>
  );
}
