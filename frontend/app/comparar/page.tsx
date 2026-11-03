import '@/app/styles/comparar.css';
import '@/app/styles/el-teu-vot.css';
import type { Metadata } from 'next';
import type { Route } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowRight, Scale } from '@/components/icons';

import { PageHeader } from '@/components/PageHeader';
import { stanceLabel } from '@/components/PartyStanceRow';
import { VoteGuideBar, VoteGuideFooter } from '@/components/VoteGuide';
import { api, type KeyLaw, type Topic } from '@/lib/api';
import { groupLogoUrl } from '@/lib/groupLogos';
import { pickTopicName } from '@/lib/topics';
import { inGuide } from '@/lib/voteGuide';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('compare');
  return { title: t('meta_title'), description: t('meta_description') };
}

const CHOICES = ['aye', 'no', 'abstention'] as const;

/**
 * Compare the parties, topic by topic (step 2 of the vote guide): pick a
 * subject and see, law by law, which groups voted for, against or
 * abstained (backend /topics/{slug}/key-laws).
 *
 * It used to be one bar per group with its share of yeses over every vote
 * of the subject, amendments included. Every group came out near half and
 * half, so the bars said nothing. A law and who backed it says something.
 *
 * Neutral selection: the latest laws the plenary voted, none picked by
 * hand; groups in each row in the order the record gives them, never
 * ranked. Each law links to its page.
 */
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ tema?: string; guia?: string }>;
}) {
  const t = await getTranslations('compare');
  const locale = await getLocale();
  const { tema: asked, guia } = await searchParams;
  const guide = inGuide(guia);
  const topics: Topic[] = (await api.topics.list({ kind: 'theme' }).catch(() => [] as Topic[])).sort((a, b) =>
    pickTopicName(a, locale).localeCompare(pickTopicName(b, locale), locale),
  );
  const topic = topics.find((tp) => tp.slug === asked) ?? topics.find((tp) => tp.slug === 'habitatge') ?? topics[0];
  // null = the API failed: not the same as a topic with no laws voted.
  const laws: KeyLaw[] | null = topic ? await api.topics.keyLaws(topic.slug).catch(() => null) : [];
  const topicName = topic ? pickTopicName(topic, locale) : '';

  return (
    <div className="cmp">
      {guide && <VoteGuideBar step={2} />}
      <PageHeader
        hue="var(--hue-partits)"
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<Scale size={20} strokeWidth={1.8} aria-hidden="true" />}
      />

      <nav className="cmp__topics" aria-label={t('topics_aria')}>
        {topics.map((tp) => (
          <Link
            key={tp.slug}
            href={`/comparar?tema=${tp.slug}${guide ? '&guia=1' : ''}` as Route}
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
        <section aria-labelledby="cmp-title">
          <h2 id="cmp-title" className="cmp__title">
            {t('laws_title', { topic: topicName })}
          </h2>
          <p className="cmp__lede">{t('laws_lede')}</p>
          {laws === null ? (
            <p className="cmp__empty">{t('laws_error')}</p>
          ) : laws.length === 0 ? (
            <p className="cmp__empty">{t('laws_empty')}</p>
          ) : (
            <ol className="claw">
              {laws.map((law) => (
                <LawCard key={law.initiative_id} law={law} locale={locale} t={t} />
              ))}
            </ol>
          )}
          <p className="cmp__method">{t('laws_method')}</p>
          <Link href={`/topics/${topic.slug}` as Route} className="cmp__more">
            {t('see_topic', { topic: topicName })} <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </section>
      )}

      {guide && <VoteGuideFooter step={2} />}
    </div>
  );
}

/** What was voted, and how it went, in words a reader knows. */
function outcomeKey(law: KeyLaw): string {
  const stage = ['taking', 'totality', 'convalidation'].includes(law.stage) ? law.stage : 'other';
  const verdict = law.verdict === 'approved' || law.verdict === 'rejected' ? law.verdict : 'open';
  return `outcome_${stage}_${verdict}`;
}

function LawCard({
  law,
  locale,
  t,
}: {
  law: KeyLaw;
  locale: string;
  t: (key: string) => string;
}) {
  const title = (locale === 'ca' ? law.title_ca : law.title_es) ?? law.title_es ?? law.title_ca ?? '';
  const date = law.voted_at
    ? new Date(law.voted_at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  const by = (choice: string) => law.groups.filter((g) => g.choice === choice);
  return (
    <li className="claw__card">
      <Link href={`/initiatives/${law.initiative_id}` as Route} className="claw__title">
        {title}
      </Link>
      <p className="claw__meta">
        {date && <span>{date}</span>}
        <span className={`claw__outcome claw__outcome--${law.verdict ?? 'open'}`}>{t(outcomeKey(law))}</span>
      </p>
      <dl className="claw__sides">
        {CHOICES.map((choice) => {
          const groups = by(choice);
          if (groups.length === 0) return null;
          return (
            <div key={choice} className={`claw__side claw__side--${choice}`}>
              <dt>{t(`side_${choice}`)}</dt>
              <dd>
                {groups.map((g) => {
                  const logo = groupLogoUrl(g.slug);
                  return (
                    <span key={g.slug} className="claw__group">
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logo} alt="" width={18} height={18} loading="lazy" decoding="async" />
                      ) : (
                        <span
                          className="claw__disc"
                          style={{ background: g.color_hex ?? 'var(--ink-3)' }}
                          aria-hidden="true"
                        />
                      )}
                      {stanceLabel({ slug: g.slug, name_short: g.name_short ?? g.slug })}
                    </span>
                  );
                })}
              </dd>
            </div>
          );
        })}
      </dl>
    </li>
  );
}
