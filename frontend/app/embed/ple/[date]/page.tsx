import type { Metadata, Route } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { EmbedFooter } from '@/components/EmbedFooter';
import { ResultPill } from '@/components/ResultPill';
import { api, type InitiativeTopicSlug, type Vote } from '@/lib/api';
import { pickPlainSummary, pickPlainTitle } from '@/lib/glossary';
import { summaryHeadline } from '@/lib/plainSummary';
import { fateResult, fateVote, initiativeKey, summariseLaws, voteKind, voteStage } from '@/lib/sessionSummary';
import { pickTopicName } from '@/lib/topics';

/**
 * Embeddable plenary day: what the Congress decided, at a glance.
 *
 * The same three figures and topic chips as the plenary page on a phone,
 * then the laws and motions of the day, one line each with how they
 * ended. Counted per initiative (its deciding vote), never per raw vote,
 * as everywhere on the site.
 *
 * /embed/ple/2026-09-30 for a given sitting, /embed/ple/darrer for the
 * latest one (refreshes itself as new sittings land).
 */
export const revalidate = 1800;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ROWS = 8;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('embed_widgets');
  return { title: t('session_meta_title'), robots: { index: false } };
}

export default async function EmbedSessionPage({ params }: { params: Promise<{ date: string }> }) {
  const { date: raw } = await params;
  const t = await getTranslations('embed_widgets');
  const tSheet = await getTranslations('session_sheet');
  const locale = await getLocale();

  const date = DATE_RE.test(raw)
    ? raw
    : raw === 'darrer' || raw === 'latest'
      ? ((await api.votes.list({ page: 1, page_size: 1 }).catch(() => null))?.items[0]?.voted_at.slice(0, 10) ?? null)
      : null;
  const votes: Vote[] = date
    ? ((await api.votes.list({ date_from: date, date_to: date, page_size: 100 }).catch(() => null))?.items ?? [])
    : [];
  if (!date || votes.length === 0) {
    return <p className="embed-empty">{t('not_found')}</p>;
  }

  const counts = summariseLaws(votes);

  // One row per initiative, laws before motions, in sitting order.
  const byItem = new Map<string, Vote[]>();
  for (const v of [...votes].sort((a, b) => a.voted_at.localeCompare(b.voted_at))) {
    if (voteKind(v) === 'procedures') continue;
    const key = initiativeKey(v);
    byItem.set(key, [...(byItem.get(key) ?? []), v]);
  }
  const items = [...byItem.values()]
    .map((vs) => ({ lead: vs[0]!, decider: fateVote(vs), outcome: fateResult(vs), kind: voteKind(vs[0]!) }))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'laws' ? -1 : 1));

  // Topics of the day, by number of initiatives.
  const topicCount = new Map<string, { topic: InitiativeTopicSlug; n: number }>();
  for (const { lead } of items) {
    for (const tp of lead.topics ?? []) {
      const cur = topicCount.get(tp.slug);
      topicCount.set(tp.slug, { topic: tp, n: (cur?.n ?? 0) + 1 });
    }
  }
  const topTopics = [...topicCount.values()].sort((a, b) => b.n - a.n).slice(0, 4);

  const dateLong = new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, { dateStyle: 'full' });

  return (
    <div className="embed-widget">
      <article className="embed-card">
        <div className="embed-eyebrow">{t('session_eyebrow')}</div>
        <h1 className="embed-title">{dateLong}</h1>

        <div className="session-lede-figs" style={{ marginTop: 12 }}>
          <span>
            <strong className="tabular">{counts.laws}</strong>
            {tSheet('tile_items', { n: counts.laws })}
          </span>
          <span style={{ color: 'var(--aye)' }}>
            <strong className="tabular">{counts.approved}</strong>
            {tSheet('tile_approved', { n: counts.approved })}
          </span>
          <span style={{ color: 'var(--no)' }}>
            <strong className="tabular">{counts.rejected}</strong>
            {tSheet('tile_rejected', { n: counts.rejected })}
          </span>
        </div>

        {topTopics.length > 0 && (
          <div className="session-lede-topics">
            {topTopics.map(({ topic, n }) => (
              <a
                key={topic.slug}
                href={`/avui/${date}#tema-${topic.slug}`}
                style={{ ['--topic' as string]: topic.color_hex ?? 'var(--accent)' }}
              >
                {pickTopicName(topic, locale)}
                <span className="tabular">{n}</span>
              </a>
            ))}
          </div>
        )}

        <ul className="embed-rows">
          {items.slice(0, MAX_ROWS).map(({ lead, decider, outcome }) => {
            // Worded for the procedural stage, as on the plenary page: a
            // rejected amendment to the whole bill means the bill goes on,
            // and "Aprovada" next to it read as the opposite.
            const stage = voteStage(decider);
            const label =
              stage === 'other' || outcome === 'tie'
                ? tSheet(`result_${outcome}` as 'result_approved')
                : tSheet(`outcome_${stage}_${outcome}` as 'result_approved');
            const plain = pickPlainSummary(lead, locale);
            const headline =
              pickPlainTitle(lead, locale) ??
              (plain ? summaryHeadline(plain) : (lead.description?.trim() || lead.title));
            const href = lead.initiative_id != null ? `/initiatives/${lead.initiative_id}` : `/votes/${lead.id}`;
            return (
              <li key={lead.id}>
                <a href={href}>{headline}</a>
                <ResultPill result={outcome} label={label} />
              </li>
            );
          })}
        </ul>
        {items.length > MAX_ROWS && (
          <p className="embed-more">{t('session_more', { n: items.length - MAX_ROWS })}</p>
        )}
      </article>
      <EmbedFooter href={`/avui/${date}` as Route} label={t('open_session')} />
    </div>
  );
}
