import type { Metadata, Route } from 'next';
import { getTranslations } from 'next-intl/server';
import { ChevronRight, User } from 'lucide-react';

import { EmbedFooter } from '@/components/EmbedFooter';
import { GroupBadge } from '@/components/GroupBadge';
import { api, type DeputyCard } from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';

/**
 * Embeddable "who represents this province": the deputies a constituency
 * elected, grouped by party, largest first, with how many votes each has
 * cast. Built for local newsrooms in a campaign: one iframe per province.
 *
 * /embed/diputats/Girona (the name exactly as the Congress writes it,
 * URL-encoded: "Balears%20(Illes)", "Valencia%2FVal%C3%A8ncia").
 *
 * Neutrality: parties ordered by how many seats they hold here, never by
 * side; every deputy rendered the same way.
 */
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('embed_widgets');
  return { title: t('deputies_meta_title'), robots: { index: false } };
}

export default async function EmbedDeputiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ prov: string }>;
  searchParams: Promise<{ partit?: string }>;
}) {
  const { prov: raw } = await params;
  const { partit } = await searchParams;
  const prov = decodeURIComponent(raw);
  const t = await getTranslations('embed_widgets');
  const tDeputy = await getTranslations('deputy');

  const deputies = await api.persons.byConstituency(prov).catch(() => [] as DeputyCard[]);
  if (deputies.length === 0) {
    return <p className="embed-empty">{t('not_found')}</p>;
  }

  const byGroup = new Map<string, { slug: string; short: string | null; color: string | null; list: DeputyCard[] }>();
  for (const d of deputies) {
    const key = d.group_slug ?? '-';
    const g = byGroup.get(key);
    if (g) g.list.push(d);
    else byGroup.set(key, { slug: d.group_slug ?? '', short: d.group_short, color: d.group_color, list: [d] });
  }
  const parties = [...byGroup.values()].sort((a, b) => b.list.length - a.list.length);
  // ?partit=<group slug>: one party only. The chips below switch it inside
  // the iframe, so a reader can play with it without leaving the article.
  const party = partit && parties.some((p) => p.slug === partit) ? partit : null;
  const shown = party ? parties.filter((p) => p.slug === party) : parties;
  const self = (slug: string | null) =>
    `/embed/diputats/${encodeURIComponent(prov)}${slug ? `?partit=${slug}` : ''}`;

  return (
    <div className="embed-widget">
      <article className="embed-card">
        <div className="embed-eyebrow">{t('deputies_eyebrow')}</div>
        <h1 className="embed-title">{t('deputies_title', { prov })}</h1>
        <p className="embed-sub tabular">{tDeputy('bar_counts', { n: deputies.length, g: parties.length })}</p>

        {/* The constituency at a glance: one segment per party, sized by
            its seats here. */}
        <div className="embed-seatbar" aria-hidden="true">
          {parties.map((p) => (
            <span key={p.slug || 'none'} style={{ flex: p.list.length, background: p.color ?? 'var(--ink-3)' }} />
          ))}
        </div>

        {parties.length > 1 && (
          <nav className="party-filter party-filter--embed" aria-label={tDeputy('party_filter_aria')}>
            <a href={self(null)} className={!party ? 'is-active' : undefined}>
              {tDeputy('party_filter_all')}
              <span className="tabular">{deputies.length}</span>
            </a>
            {parties.map((p) =>
              p.slug ? (
                <a
                  key={p.slug}
                  href={self(p.slug)}
                  className={party === p.slug ? 'is-active' : undefined}
                  style={{ ['--party' as string]: p.color ?? 'var(--ink-3)' }}
                >
                  <span className="party-filter__dot" aria-hidden="true" />
                  {p.short ? displayGroupShort(p.short) : '-'}
                  <span className="tabular">{p.list.length}</span>
                </a>
              ) : null,
            )}
          </nav>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
          {shown.map((p) => (
            <section key={p.slug || 'none'}>
              <div className="embed-party">
                {p.slug ? <GroupBadge slug={p.slug} color={p.color} size="sm" link={false} /> : null}
                <strong>{p.short ? displayGroupShort(p.short) : '-'}</strong>
                <span className="tabular">{p.list.length}</span>
              </div>
              <ul className="embed-people">
                {p.list.map((d) => (
                  <li key={d.person_id}>
                    <a href={`/persons/${d.person_id}`}>
                      <span className="embed-avatar" style={{ boxShadow: `0 0 0 2px ${d.group_color ?? 'var(--rule-strong)'}` }}>
                        {d.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={d.photo_url} alt="" width={36} height={36} loading="lazy" />
                        ) : (
                          <User size={16} strokeWidth={1.8} aria-hidden="true" />
                        )}
                      </span>
                      <span className="embed-person">
                        <strong>{d.full_name}</strong>
                        <span className="tabular">{tDeputy('votes_cast', { n: d.votes_cast })}</span>
                      </span>
                      <ChevronRight size={15} strokeWidth={2} aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </article>
      <EmbedFooter href={`/el-teu-diputat?prov=${encodeURIComponent(prov)}` as Route} label={t('open_deputies')} />
    </div>
  );
}
