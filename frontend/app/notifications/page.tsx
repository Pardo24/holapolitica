import { getTranslations } from 'next-intl/server';

import { NewsletterPreferencesManager } from '@/components/NewsletterPreferencesManager';
import { NotificationsManager } from '@/components/NotificationsManager';
import { api, type Topic } from '@/lib/api';

/**
 * /notifications — Newsletter topic-preferences manager (formerly Web Push).
 *
 * Why this page exists today
 * --------------------------
 * We flipped the entire concept of this page on 2026-05-12: instead of
 * letting the user subscribe to *browser* push notifications, we now ask
 * them to pick the topics for their weekly NEWSLETTER. Push is noisier
 * than email, was rarely apply-rate'd, and doesn't fit the project's
 * "mirror, not megaphone" rhythm.
 *
 * The previous push UI (state machine + apply/stop buttons) lives in
 * :file:`components/NotificationsManager.tsx` and is gated off via
 * ``ENABLE_BROWSER_PUSH`` below. Flip the flag to bring it back as a
 * second channel — no other change should be needed.
 *
 * Neutrality: the topic taxonomy is data, not opinion. We never publish
 * "important" rankings; the macro categories used to group topics are a
 * UX shortcut (see :file:`lib/topic_categories.ts`).
 */

// Feature flag — set to `true` to reactivate the browser-Push manager
// alongside the newsletter picker. We keep the legacy component
// untouched so reverting is a one-line change.
const ENABLE_BROWSER_PUSH = false;

export default async function NotificationsPage() {
  const t = await getTranslations('notifications');
  let topics: Topic[] = [];
  try {
    topics = await api.topics.list();
  } catch {
    topics = [];
  }

  return (
    <div
      style={{
        paddingTop: 28,
        paddingBottom: 48,
        maxWidth: 720,
        marginLeft: 'auto',
        marginRight: 'auto',
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      <header style={{ paddingBottom: 18, borderBottom: '1px solid var(--ink)' }}>
        <div className="eyebrow">{t('eyebrow')}</div>
        <h1 className="h-headline" style={{ margin: '4px 0 0' }}>
          {t('title')}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ink-3)', marginTop: 8, lineHeight: 1.5 }}>
          {t('lede')}
        </p>
      </header>

      <NewsletterPreferencesManager topics={topics} />

      {ENABLE_BROWSER_PUSH && <NotificationsManager topics={topics} />}

      <section style={{ marginTop: 32, fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.55 }}>
        <h2 style={{ fontSize: 13, color: 'var(--ink)', margin: '0 0 6px' }}>
          {t('privacy_title')}
        </h2>
        <p>{t('privacy_body')}</p>
      </section>
    </div>
  );
}
