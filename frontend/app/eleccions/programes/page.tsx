import '@/app/styles/election-news.css';
import '@/app/styles/pactes.css';
import '@/app/styles/eleccions.css';
import '@/app/styles/comparar.css';
import '@/app/styles/el-teu-vot.css';
import type { Metadata } from 'next';
import type { Route } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowRight } from '@/components/icons';

import { ElectionsHeader } from '@/components/Elections';
import { VoteGuideBar, VoteGuideFooter } from '@/components/VoteGuide';
import { api, type Topic, type TopicManifesto } from '@/lib/api';
import { ELECTION_PARTIES } from '@/lib/electionParties';
import { PROGRAMS_2026 } from '@/lib/programs2026';
import { pickTopicName } from '@/lib/topics';
import { inGuide } from '@/lib/voteGuide';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('elections');
  return { title: t('programs_meta_title'), description: t('programs_page_intro') };
}

/** Quotes shown per party before "show more". */
const SHOWN = 4;

/**
 * Step 3 of the vote guide: what each party proposes for 29 November, one
 * topic at a time, side by side.
 *
 * Only the parties' own words: sentences copied from each manifesto with
 * their page (backend app/ingest/manifestos.py, the same extraction for
 * every party, reviewed before import). Nothing summarised, nothing
 * judged. A party whose manifesto is out but not read yet says so, and one
 * that says nothing concrete on the topic says that, so an empty card is
 * never mistaken for the other.
 */
export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{ tema?: string; guia?: string }>;
}) {
  const t = await getTranslations('elections');
  const locale = await getLocale();
  const { tema, guia } = await searchParams;
  const guide = inGuide(guia);
  const keep = guide ? '&guia=1' : '';

  const published = ELECTION_PARTIES.filter((p) => PROGRAMS_2026[p.slug]);
  const topics: Topic[] = published.length
    ? (await api.topics.list({ kind: 'theme' }).catch(() => [] as Topic[])).sort((a, b) =>
        pickTopicName(a, locale).localeCompare(pickTopicName(b, locale), locale),
      )
    : [];
  const topic = topics.find((tp) => tp.slug === tema) ?? topics.find((tp) => tp.slug === 'habitatge') ?? topics[0];
  const manifesto: TopicManifesto | null = topic ? await api.topics.manifesto(topic.slug).catch(() => null) : null;

  return (
    <div className="pacts">
      {guide && <VoteGuideBar step={3} />}
      <ElectionsHeader active="vote" title={t('programs_page_title')} intro={t('programs_page_intro')} bare={guide} />

      {published.length === 0 ? (
        <p className="vprog__none">{t('programs_none_yet')}</p>
      ) : (
        <>
          <nav className="cmp__topics" aria-label={t('programs_topics_aria')}>
            {topics.map((tp) => (
              <Link
                key={tp.slug}
                href={`/eleccions/programes?tema=${tp.slug}${keep}` as Route}
                className={tp.slug === topic?.slug ? 'cmp__topic cmp__topic--on' : 'cmp__topic'}
                aria-current={tp.slug === topic?.slug ? 'page' : undefined}
                style={{ ['--topic' as string]: tp.color_hex ?? 'var(--ink-3)' }}
                scroll={false}
              >
                {pickTopicName(tp, locale)}
              </Link>
            ))}
          </nav>
          {topic && (
            <h2 className="esec-title vsec">{t('programs_topic_title', { topic: pickTopicName(topic, locale) })}</h2>
          )}
        </>
      )}

      <ul className="vparty">
        {ELECTION_PARTIES.map((p) => {
          const program = PROGRAMS_2026[p.slug];
          const quotes = manifesto?.points.filter((q) => q.party === p.slug) ?? [];
          const read = (manifesto?.counts[p.slug] ?? 0) > 0;
          return (
            <li key={p.slug} className="vparty__card" style={{ ['--party' as string]: p.color }}>
              <div className="vparty__head">
                <span className="vparty__name">{p.name}</span>
                {program ? (
                  <a href={program.url} target="_blank" rel="noopener noreferrer" className="vprog__link">
                    {t('program_open')} <ArrowRight size={13} aria-hidden="true" />
                  </a>
                ) : (
                  <span className="vprog__pending">{t('program_pending')}</span>
                )}
              </div>
              {program && !read && <p className="vparty__state">{t('program_reading')}</p>}
              {program && read && quotes.length === 0 && <p className="vparty__state">{t('program_silent')}</p>}
              {quotes.length > 0 && (
                <ul className="vparty__quotes">
                  {quotes.slice(0, SHOWN).map((q, i) => (
                    <Quote key={i} q={q} pageLabel={q.page != null ? t('program_page', { n: q.page }) : null} />
                  ))}
                </ul>
              )}
              {quotes.length > SHOWN && (
                <details className="vparty__more">
                  <summary>{t('programs_more', { n: quotes.length - SHOWN })}</summary>
                  <ul className="vparty__quotes">
                    {quotes.slice(SHOWN).map((q, i) => (
                      <Quote key={i} q={q} pageLabel={q.page != null ? t('program_page', { n: q.page }) : null} />
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>
      {published.length > 0 && <p className="tvot__source">{t('programs_method')}</p>}

      {guide && <VoteGuideFooter step={3} />}
    </div>
  );
}

function Quote({ q, pageLabel }: { q: TopicManifesto['points'][number]; pageLabel: string | null }) {
  const href = q.source_url && q.page != null ? `${q.source_url}#page=${q.page}` : q.source_url;
  return (
    <li>
      <blockquote className="vparty__quote">{q.quote}</blockquote>
      {pageLabel &&
        (href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="vparty__page">
            {pageLabel}
          </a>
        ) : (
          <span className="vparty__page">{pageLabel}</span>
        ))}
    </li>
  );
}
