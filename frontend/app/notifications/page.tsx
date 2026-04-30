import { getTranslations } from 'next-intl/server';

import { NotificationsManager } from '@/components/NotificationsManager';
import { api, type Topic } from '@/lib/api';

/**
 * /notifications — Web Push subscription manager.
 *
 * The page itself is a Server Component (renders the topic list at request
 * time, no flash of unstyled content). The interactive surface lives in
 * <NotificationsManager />, a Client Component that talks to the browser's
 * Push API and our /push/* endpoints.
 *
 * Neutrality: this page describes WHAT users will receive in plain
 * factual terms — never an editorial framing of which topics are
 * "important". The topic list is taxonomy data, not opinion.
 */
export default async function NotificationsPage() {
  const t = await getTranslations('notifications');
  let topics: Topic[] = [];
  try {
    topics = await api.topics.list();
  } catch {
    topics = [];
  }

  return (
    <div style={{ paddingTop: 28, paddingBottom: 48, maxWidth: 720 }}>
      <header style={{ paddingBottom: 18, borderBottom: '1px solid var(--ink)' }}>
        <div className="eyebrow">{t('eyebrow')}</div>
        <h1 className="h-headline" style={{ margin: '4px 0 0' }}>
          {t('title')}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ink-3)', marginTop: 8, lineHeight: 1.5 }}>
          {t('lede')}
        </p>
      </header>

      <NotificationsManager topics={topics} />

      <section style={{ marginTop: 32, fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.55 }}>
        <h2 style={{ fontSize: 13, color: 'var(--ink)', margin: '0 0 6px' }}>
          {t('compat_title')}
        </h2>
        <p>{t('compat_body')}</p>
        <h2 style={{ fontSize: 13, color: 'var(--ink)', margin: '14px 0 6px' }}>
          {t('privacy_title')}
        </h2>
        <p>{t('privacy_body')}</p>
      </section>
    </div>
  );
}
