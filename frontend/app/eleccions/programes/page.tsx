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
import { api, type KeyLaw, type Topic, type TopicDebateQuote, type TopicManifesto } from '@/lib/api';
import { ELECTION_PARTIES, type ElectionParty } from '@/lib/electionParties';
import { PARTY_OF_GROUP, PROGRAMS_2026 } from '@/lib/programs2026';
import { pickTopicName } from '@/lib/topics';
import { inGuide } from '@/lib/voteGuide';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('elections');
  return { title: t('programs_meta_title'), description: t('programs_page_intro') };
}

/** Items per source on a party's card; more when one party is picked. */
const SHOWN = 2;
const SHOWN_ONE = 6;
/** Laws whose vote each card lists. */
const LAWS = 5;
/** The election the outgoing Congress was elected in. */
const LAST_ELECTION = '2023-07';

/** The group each party sat in this term (the Mixed group's parties have none of their own). */
const GROUP_OF_PARTY: Record<string, string> = Object.fromEntries(
  Object.entries(PARTY_OF_GROUP).map(([group, party]) => [party, group]),
);

type T = Awaited<ReturnType<typeof getTranslations<'elections'>>>;

/**
 * Step 3 of the vote guide: what each party says and does, one topic at a
 * time. Four sources side by side, all of them the party's own words or
 * votes: what it proposes for 29 November, what it promised in July 2023,
 * what its deputies said in the plenary and how its group voted the latest
 * laws on the subject.
 *
 * Whether a promise was kept is for the reader to judge: the site puts the
 * 2023 sentence next to the votes that came after and says nothing about
 * them ("mirall, no megàfon"). Every selection is mechanical: literal
 * manifesto sentences (backend app/ingest/manifestos.py), the latest
 * debate passages and the latest laws voted, the same rule for every
 * party. A source not read yet says so, and one with nothing on the topic
 * says that, so an empty block is never mistaken for the other.
 */
export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{ tema?: string; partit?: string; guia?: string }>;
}) {
  const t = await getTranslations('elections');
  const locale = await getLocale();
  const { tema, partit, guia } = await searchParams;
  const guide = inGuide(guia);
  const keep = guide ? '&guia=1' : '';

  const topics: Topic[] = (await api.topics.list({ kind: 'theme' }).catch(() => [] as Topic[])).sort((a, b) =>
    pickTopicName(a, locale).localeCompare(pickTopicName(b, locale), locale),
  );
  const topic = topics.find((tp) => tp.slug === tema) ?? topics.find((tp) => tp.slug === 'habitatge') ?? topics[0];
  const one = ELECTION_PARTIES.find((p) => p.slug === partit) ?? null;
  // The parties with a record of their own in this Congress, and any other
  // whose 29-N manifesto is out.
  const parties = ELECTION_PARTIES.filter((p) => GROUP_OF_PARTY[p.slug] || PROGRAMS_2026[p.slug]);
  const shown = one ? [one] : parties;
  const perSource = one ? SHOWN_ONE : SHOWN;

  const [now, then, said, laws] = topic
    ? await Promise.all([
        api.topics.manifesto(topic.slug).catch(() => null),
        api.topics.manifesto(topic.slug, LAST_ELECTION).catch(() => null),
        api.topics.debateQuotes(topic.slug, SHOWN_ONE).catch(() => null),
        api.topics.keyLaws(topic.slug, LAWS).catch(() => null),
      ])
    : [null, null, null, null];

  const hrefFor = (topicSlug: string | undefined, partySlug: string | null) =>
    `/eleccions/programes?${[topicSlug && `tema=${topicSlug}`, partySlug && `partit=${partySlug}`]
      .filter(Boolean)
      .join('&')}${keep}` as Route;

  return (
    <div className="pacts">
      {guide && <VoteGuideBar step={3} />}
      <ElectionsHeader active="vote" title={t('programs_page_title')} intro={t('programs_page_intro')} bare={guide} />

      <nav className="cmp__topics" aria-label={t('programs_topics_aria')}>
        {topics.map((tp) => (
          <Link
            key={tp.slug}
            href={hrefFor(tp.slug, one?.slug ?? null)}
            className={tp.slug === topic?.slug ? 'cmp__topic cmp__topic--on' : 'cmp__topic'}
            aria-current={tp.slug === topic?.slug ? 'page' : undefined}
            style={{ ['--topic' as string]: tp.color_hex ?? 'var(--ink-3)' }}
            scroll={false}
          >
            {pickTopicName(tp, locale)}
          </Link>
        ))}
      </nav>

      <nav className="vpos__parties" aria-label={t('positions_parties_aria')}>
        <Link
          href={hrefFor(topic?.slug, null)}
          className={one ? 'vpos__party' : 'vpos__party vpos__party--on'}
          aria-current={one ? undefined : 'page'}
          scroll={false}
        >
          {t('positions_all_parties')}
        </Link>
        {parties.map((p) => (
          <Link
            key={p.slug}
            href={hrefFor(topic?.slug, p.slug)}
            className={one?.slug === p.slug ? 'vpos__party vpos__party--on' : 'vpos__party'}
            aria-current={one?.slug === p.slug ? 'page' : undefined}
            style={{ ['--party' as string]: p.color }}
            scroll={false}
          >
            <span className="vpos__dot" aria-hidden="true" />
            {p.name}
          </Link>
        ))}
      </nav>

      {topic && (
        <h2 className="esec-title vsec">{t('positions_topic_title', { topic: pickTopicName(topic, locale) })}</h2>
      )}

      <ul className={one ? 'vparty vparty--one' : 'vparty'}>
        {shown.map((p) => (
          <PartyCard
            key={p.slug}
            party={p}
            group={GROUP_OF_PARTY[p.slug] ?? null}
            now={now}
            then={then}
            said={said}
            laws={laws}
            perSource={perSource}
            more={one ? null : hrefFor(topic?.slug, p.slug)}
            locale={locale}
            t={t}
          />
        ))}
      </ul>
      <p className="tvot__source">{t('positions_method')}</p>

      {guide && <VoteGuideFooter step={3} />}
    </div>
  );
}

function PartyCard({
  party,
  group,
  now,
  then,
  said,
  laws,
  perSource,
  more,
  locale,
  t,
}: {
  party: ElectionParty;
  /** Its group this term, or null for a party of the Mixed group. */
  group: string | null;
  now: TopicManifesto | null;
  then: TopicManifesto | null;
  said: TopicDebateQuote[] | null;
  laws: KeyLaw[] | null;
  perSource: number;
  /** "See everything" for this party, on the all-parties view. */
  more: Route | null;
  locale: string;
  t: T;
}) {
  const program = PROGRAMS_2026[party.slug];
  const nowQuotes = now?.points.filter((q) => q.party === party.slug) ?? [];
  // 2023 manifestos are filed under the group the party formed.
  const thenQuotes = group ? (then?.points.filter((q) => q.party === group) ?? []) : [];
  const ownSaid = group ? (said?.filter((q) => q.group_slug === group) ?? []) : [];
  const votes = group
    ? (laws ?? []).map((law) => ({ law, choice: law.groups.find((g) => g.slug === group)?.choice ?? null }))
    : [];
  const pick = (title_ca: string | null, title_es: string | null) =>
    (locale === 'ca' ? title_ca : title_es) ?? title_es ?? title_ca ?? '';
  const day = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Madrid' });
  const hasMore =
    more != null &&
    (nowQuotes.length > perSource || thenQuotes.length > perSource || ownSaid.length > perSource);

  return (
    <li className="vparty__card" style={{ ['--party' as string]: party.color }}>
      <div className="vparty__head">
        <span className="vparty__name">{party.name}</span>
        {program && (
          <a href={program.url} target="_blank" rel="noopener noreferrer" className="vprog__link">
            {t('program_open')} <ArrowRight size={13} aria-hidden="true" />
          </a>
        )}
      </div>

      <section className="vpos__sec">
        <h3 className="vpos__h">{t('positions_now')}</h3>
        {!program ? (
          <p className="vparty__state">{t('program_pending')}</p>
        ) : (now?.counts[party.slug] ?? 0) === 0 ? (
          <p className="vparty__state">{t('program_reading')}</p>
        ) : nowQuotes.length === 0 ? (
          <p className="vparty__state">{t('program_silent')}</p>
        ) : (
          <Quotes quotes={nowQuotes.slice(0, perSource)} t={t} />
        )}
      </section>

      {group ? (
        <>
          <section className="vpos__sec">
            <h3 className="vpos__h">{t('positions_then')}</h3>
            {(then?.counts[group] ?? 0) === 0 ? (
              <p className="vparty__state">{t('positions_then_unread')}</p>
            ) : thenQuotes.length === 0 ? (
              <p className="vparty__state">{t('positions_then_silent')}</p>
            ) : (
              <Quotes quotes={thenQuotes.slice(0, perSource)} t={t} />
            )}
          </section>

          <section className="vpos__sec">
            <h3 className="vpos__h">{t('positions_said')}</h3>
            {said === null ? (
              <p className="vparty__state">{t('positions_error')}</p>
            ) : ownSaid.length === 0 ? (
              <p className="vparty__state">{t('positions_said_none')}</p>
            ) : (
              <ul className="vparty__quotes">
                {ownSaid.slice(0, perSource).map((q, i) => (
                  <li key={i}>
                    <blockquote className="vparty__quote">{q.quote}</blockquote>
                    <p className="vpos__cite">
                      {q.speaker_name} · {day(q.debate_date)} ·{' '}
                      <Link href={`/initiatives/${q.initiative_id}` as Route}>{pick(q.title_ca, q.title_es)}</Link> ·{' '}
                      <a href={`${q.source_url}#page=${q.page}`} target="_blank" rel="noopener noreferrer">
                        {t('positions_said_source', { n: q.page })}
                      </a>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="vpos__sec">
            <h3 className="vpos__h">{t('positions_voted')}</h3>
            {laws === null ? (
              <p className="vparty__state">{t('positions_error')}</p>
            ) : votes.length === 0 ? (
              <p className="vparty__state">{t('positions_voted_none')}</p>
            ) : (
              <ul className="vpos__votes">
                {votes.map(({ law, choice }) => (
                  <li key={law.initiative_id}>
                    <span className={`vpos__choice vpos__choice--${choice ?? 'none'}`}>
                      {t(`positions_choice_${choice && ['aye', 'no', 'abstention'].includes(choice) ? choice : 'none'}`)}
                    </span>
                    <Link href={`/initiatives/${law.initiative_id}` as Route} className="vpos__law">
                      {pick(law.title_ca, law.title_es)}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <p className="vparty__state">{t('positions_mixed')}</p>
      )}

      {hasMore && (
        <Link href={more} className="vpos__more" scroll={false}>
          {t('positions_more', { party: party.name })} <ArrowRight size={13} aria-hidden="true" />
        </Link>
      )}
    </li>
  );
}

function Quotes({ quotes, t }: { quotes: TopicManifesto['points']; t: T }) {
  return (
    <ul className="vparty__quotes">
      {quotes.map((q, i) => {
        const href = q.source_url && q.page != null ? `${q.source_url}#page=${q.page}` : q.source_url;
        const label = q.page != null ? t('program_page', { n: q.page }) : null;
        return (
          <li key={i}>
            <blockquote className="vparty__quote">{q.quote}</blockquote>
            {label &&
              (href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="vparty__page">
                  {label}
                </a>
              ) : (
                <span className="vparty__page">{label}</span>
              ))}
          </li>
        );
      })}
    </ul>
  );
}
