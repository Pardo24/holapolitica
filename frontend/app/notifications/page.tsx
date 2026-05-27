import { getTranslations } from 'next-intl/server';
import { Bell } from 'lucide-react';

import { NewsletterPreferencesManager } from '@/components/NewsletterPreferencesManager';
import { NotificationsManager } from '@/components/NotificationsManager';
import { PageHeader } from '@/components/PageHeader';
import { api, type ParliamentaryGroupSummary, type Topic } from '@/lib/api';

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
const ENABLE_BROWSER_PUSH = true;

export default async function NotificationsPage() {
  const t = await getTranslations('notifications');
  let topics: Topic[] = [];
  let groups: ParliamentaryGroupSummary[] = [];
  try {
    [topics, groups] = await Promise.all([
      api.topics.list(),
      // Active legislature only — the push channel is for current
      // votes, no point offering historical groups that can't propose
      // new content. Failure is best-effort: the group section just
      // disappears when the call errors.
      api.groups.list(1).catch(() => [] as ParliamentaryGroupSummary[]),
    ]);
  } catch {
    topics = [];
    groups = [];
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
      <PageHeader
        title={t('title')}
        subtitle={t('eyebrow')}
        icon={<Bell size={20} strokeWidth={1.8} aria-hidden="true" />}
        bordered
        style={{ paddingTop: 0 }}
      >
        <p style={{ fontSize: 14, color: 'var(--ink-3)', margin: 0, lineHeight: 1.5 }}>
          {t('lede')}
        </p>
      </PageHeader>

      {ENABLE_BROWSER_PUSH && (
        <NotificationsManager topics={topics} groups={groups} />
      )}

      <NewsletterPreferencesManager topics={topics} />

      <section style={{ marginTop: 32, fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.55 }}>
        <h2 style={{ fontSize: 13, color: 'var(--ink)', margin: '0 0 6px' }}>
          {t('privacy_title')}
        </h2>
        <p>{t('privacy_body')}</p>
      </section>
    </div>
  );
}
