import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { GlossaryTerm } from '@/components/GlossaryTerm';
import { GroupChip } from '@/components/GroupChip';
import { ShareButton } from '@/components/ShareButton';
import { TopicBars } from '@/components/TopicBars';
import {
  api,
  ApiError,
  type Mandate,
  type Person,
  type PersonKPIs,
  type TopicVoteStat,
} from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';

interface Params {
  id: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isFinite(personId)) return {};
  try {
    const p = await api.persons.get(personId);
    const groupBit = p.current_group_short
      ? ` · ${p.current_group_short}`
      : '';
    const constBit = p.current_constituency ? ` · ${p.current_constituency}` : '';
    const description = `Activitat parlamentària de ${p.full_name}${groupBit}${constBit}.`;
    return {
      title: p.full_name,
      description,
      openGraph: {
        title: p.full_name,
        description,
        type: 'profile',
      },
      twitter: {
        card: 'summary_large_image',
        title: p.full_name,
        description,
      },
    };
  } catch {
    return {};
  }
}

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isFinite(personId)) notFound();

  const t = await getTranslations('person');
  const locale = await getLocale();

  let person: Person;
  let mandates: Mandate[] = [];
  let topicStats: TopicVoteStat[] = [];
  let kpis: PersonKPIs;
  try {
    [person, mandates, topicStats, kpis] = await Promise.all([
      api.persons.get(personId),
      api.persons.mandates(personId),
      api.persons.topicStats(personId),
      api.persons.kpis(personId),
    ]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const wikiSearch = `https://es.wikipedia.org/w/index.php?search=${encodeURIComponent(
    person.full_name + ' diputado',
  )}`;

  return (
    <article>
      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: 'var(--ink-3)', paddingTop: 18 }}>
        <Link href="/persons" style={{ color: 'var(--ink-2)' }}>
          Diputats
        </Link>
      </div>

      <header
        className="person-header"
        style={{
          display: 'grid',
          gridTemplateColumns: '192px 1fr',
          gap: 28,
          paddingTop: 18,
          paddingBottom: 24,
          borderBottom: '1px solid var(--ink)',
          alignItems: 'flex-start',
        }}
      >
        {person.photo_url ? (
          // Photo is served by congreso.es with predictable dimensions; next/image
          // would require domain allowlisting + a separate optimizer pass. The
          // ficha photos are already small (~30-60 KB) and cached aggressively
          // by Caddy in front of the API.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={person.photo_url}
            alt=""
            width={192}
            height={240}
            style={{
              width: 192,
              height: 240,
              objectFit: 'cover',
              border: '1px solid var(--rule)',
              background: 'var(--paper-2)',
            }}
          />
        ) : (
          <div
            style={{
              width: 192,
              height: 240,
              border: '1px solid var(--rule)',
              background: 'var(--paper-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 56,
              fontWeight: 600,
              color: 'var(--ink-3)',
            }}
            aria-hidden="true"
          >
            {personInitials(person.full_name)}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">Diputat/da · XV legislatura</div>
          <h1 className="h-headline" style={{ margin: '4px 0 12px' }}>
            {person.full_name}
          </h1>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: 'var(--ink-2)',
            }}
          >
            {person.current_group_short && person.current_group_slug && (
              <GroupChip
                slug={person.current_group_slug}
                short={displayGroupShort(person.current_group_short)}
                color={person.current_group_color}
                size="sm"
              />
            )}
            {person.current_constituency && (
              <span>· {person.current_constituency}</span>
            )}
            {person.birth_year && (
              <span>
                · {t('born_in')} {person.birth_year}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 14, alignItems: 'center' }}>
            <ShareButton
              url={`/persons/${person.id}`}
              title={person.full_name}
              text={`Activitat parlamentària de ${person.full_name} al Congrés.`}
              size="sm"
            />
            {person.biography_url ? (
              <a
                href={person.biography_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 13, color: 'var(--ink)' }}
              >
                {t('biography_link')} ↗
              </a>
            ) : (
              <a
                href={wikiSearch}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 13, color: 'var(--ink)' }}
              >
                {t('wikipedia_search')} ↗
              </a>
            )}
          </div>
        </div>
      </header>

      <KpiStrip kpis={kpis} />

      <section style={{ paddingTop: 28 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          {t('mandates_title')}
        </div>
        {mandates.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>{t('no_mandates')}</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {mandates.map((m) => (
              <li
                key={m.id}
                style={{
                  borderBottom: '1px solid var(--rule)',
                  padding: '10px 0',
                  fontSize: 13,
                  display: 'flex',
                  gap: 18,
                  flexWrap: 'wrap',
                }}
              >
                <span className="tabular" style={{ fontWeight: 600 }}>
                  {t('mandate_dates', {
                    from: new Date(m.start_date).toLocaleDateString(locale),
                    to: m.end_date ? new Date(m.end_date).toLocaleDateString(locale) : t('mandate_current'),
                  })}
                </span>
                {m.constituency && (
                  <span style={{ color: 'var(--ink-3)' }}>
                    {t('constituency')}: {m.constituency}
                  </span>
                )}
                {m.electoral_list_party && (
                  <span style={{ color: 'var(--ink-3)' }}>
                    {t('list')}: {m.electoral_list_party}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ paddingTop: 28 }}>
        <h2 className="h-title">Vot per tema</h2>
        <p
          style={{
            fontSize: 12,
            color: 'var(--ink-3)',
            marginTop: 0,
            marginBottom: 12,
            maxWidth: 760,
          }}
        >
          Distribució dels vots emesos per àrea temàtica. Les iniciatives es classifiquen automàticament; un mateix vot pot comptar en més d&apos;un tema.
        </p>
        <TopicBars
          rows={topicStats}
          emptyHint="Encara no hi ha vots d'aquesta persona en iniciatives classificades. La cobertura creixerà a mesura que carreguem sessions històriques."
        />
      </section>

      <style>{`
        @media (max-width: 720px) {
          .person-header { grid-template-columns: 1fr !important; gap: 16px !important; }
          .person-header img,
          .person-header > div:first-child { width: 100% !important; max-width: 192px; }
        }
      `}</style>
    </article>
  );
}

function KpiStrip({ kpis }: { kpis: PersonKPIs }) {
  const empty = kpis.votes_total === 0;
  if (empty) {
    return (
      <p style={{ fontSize: 13, color: 'var(--ink-3)', paddingTop: 18 }}>
        Encara no hi ha vots registrats per a aquesta persona.
      </p>
    );
  }
  return (
    <section
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <div className="kpi">
        <span className="label">Vots emesos</span>
        <span className="value tabular">{kpis.votes_cast}</span>
        <span className="sub">de {kpis.votes_total} possibles</span>
      </div>
      <div className="kpi">
        <span className="label">Assistència</span>
        <span className="value tabular">
          {kpis.attendance_pct === null ? '—' : `${(kpis.attendance_pct * 100).toFixed(0)}%`}
        </span>
        <span className="sub">
          {kpis.votes_cast} de {kpis.votes_total}
        </span>
      </div>
      <div className="kpi">
        <span className="label">
          <GlossaryTerm term="Dissidència">Dissidència</GlossaryTerm>
        </span>
        <span className="value tabular">
          {kpis.dissidence_pct === null ? '—' : `${(kpis.dissidence_pct * 100).toFixed(0)}%`}
        </span>
        <span className="sub">
          {kpis.dissidence_pct === null
            ? 'Sense vots comparables'
            : `${kpis.dissents} cops vs majoria del grup`}
        </span>
      </div>
    </section>
  );
}

function personInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]!;
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1]!;
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}
