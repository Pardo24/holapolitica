import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { ProposerEllipsis } from '@/components/ProposerEllipsis';
import { SummaryHover } from '@/components/SummaryHover';
import { Tooltip } from '@/components/Tooltip';
import {
  api,
  ApiError,
  type Initiative,
  type ScheduledAgendaItem,
  type Topic,
} from '@/lib/api';
import { glossaryShort, pickPlainSummary, typeLabelCa } from '@/lib/glossary';

interface Params {
  slug: string;
}

const STATUS_LABEL: Record<string, string> = {
  approved: 'Aprovada',
  rejected: 'Rebutjada',
  in_debate: 'En tràmit',
  submitted: 'Presentada',
  withdrawn: 'Retirada',
  expired: 'Caducada',
};

const STATUS_COLOR: Record<string, string> = {
  approved: 'var(--aye)',
  rejected: 'var(--no)',
  in_debate: 'var(--accent)',
  submitted: 'var(--accent)',
  withdrawn: 'var(--nv)',
  expired: 'var(--nv)',
};

const TYPE_LABEL: Record<string, string> = {
  proyecto_ley: 'Projecte de Llei',
  proposicion_ley: 'Proposició de Llei',
  proposicion_no_ley: 'Proposició no de Llei',
  real_decreto_ley: 'Reial Decret-llei',
  reforma_estatuto: 'Reforma d\'Estatut',
  mocion: 'Moció',
  interpelacion: 'Interpel·lació',
  other: 'Altra',
};

const PENDING_STATUSES = new Set(['submitted', 'in_debate']);
const VOTED_STATUSES = new Set(['approved', 'rejected']);

export default async function TopicDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const t = await getTranslations('topic');
  const locale = await getLocale();

  let topic: Topic;
  try {
    topic = await api.topics.get(slug);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const [initiatives, upcomingAgenda, topicGlobals] = await Promise.all([
    api.topics.initiatives(slug, { legislature_id: 1 }),
    api.agenda.itemsByTopic(slug).catch(() => [] as ScheduledAgendaItem[]),
    api.stats.topicsGlobal().catch(() => []),
  ]);

  const pending = initiatives.filter((i) => PENDING_STATUSES.has(i.status));
  const voted = initiatives.filter((i) => VOTED_STATUSES.has(i.status));
  const otherTerminal = initiatives.filter(
    (i) => !PENDING_STATUSES.has(i.status) && !VOTED_STATUSES.has(i.status),
  );
  const approved = initiatives.filter((i) => i.status === 'approved').length;
  const rejected = initiatives.filter((i) => i.status === 'rejected').length;
  const decided = approved + rejected;
  const approvalRate = decided > 0 ? Math.round((approved / decided) * 100) : null;

  // Top proposers — aggregate the submitted_by free-text field. The strings
  // come from the Congreso feed verbatim ("Grupo Parlamentario VOX",
  // "Gobierno", etc.); we just count and sort. Keep top 4.
  const proposerCounts = new Map<string, number>();
  for (const it of initiatives) {
    const k = (it.submitted_by ?? 'Sense origen registrat').trim();
    proposerCounts.set(k, (proposerCounts.get(k) ?? 0) + 1);
  }
  const topProposers = Array.from(proposerCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const proposerMax = Math.max(...topProposers.map(([, n]) => n), 1);

  // Use the global stats as a fallback if our per-page initiatives count
  // diverges (e.g., during ingestion).
  const topicGlobal = topicGlobals.find((g) => g.topic_slug === slug);

  return (
    <article>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', paddingTop: 18 }}>
        <Link href="/topics" style={{ color: 'var(--ink-2)' }}>
          Temes
        </Link>
        {' / '}
        <span style={{ color: 'var(--ink)' }}>{topic.name_ca}</span>
      </div>

      <header
        style={{
          paddingTop: 12,
          paddingBottom: 24,
          borderTop: `3px solid ${topic.color_hex ?? 'var(--accent)'}`,
          marginTop: 12,
          borderBottom: '1px solid var(--ink)',
        }}
      >
        <div className="eyebrow">Tema</div>
        <h1
          className="h-display"
          style={{ margin: '6px 0 4px', fontSize: 'clamp(32px, 4.4vw, 48px)' }}
        >
          {topic.name_ca}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>
          {topic.name_es} · {topic.name_en}
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            borderTop: '1px solid var(--rule)',
            marginTop: 18,
          }}
        >
          <div className="kpi">
            <span className="label">Total iniciatives</span>
            <span className="value tabular">{initiatives.length}</span>
            <span className="sub">classificades sota aquest tema</span>
          </div>
          <div className="kpi">
            <span className="label">Encara no votades</span>
            <span className="value tabular">{pending.length}</span>
            <span className="sub">presentades / en tràmit</span>
          </div>
          <div className="kpi">
            <span className="label">Ja votades</span>
            <span className="value tabular">{voted.length}</span>
            <span className="sub">aprovades o rebutjades</span>
          </div>
        </div>
      </header>

      {/* Stats widget for this topic */}
      <section style={{ paddingTop: 28 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          Estadístiques d&apos;aquest tema
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.1fr 1fr',
            gap: 18,
            padding: 20,
            border: '1px solid var(--rule-strong)',
            borderRadius: 14,
            background: 'var(--paper-2)',
          }}
          className="topic-stats-widget"
        >
          {/* Approval rate + status counts */}
          <div>
            <div className="eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>
              <Tooltip
                term="Índex d'aprovació"
                explanation={glossaryShort('approval_rate')}
              />
            </div>
            <div
              className="tabular"
              style={{
                fontSize: 44,
                fontWeight: 600,
                color: 'var(--aye)',
                letterSpacing: '-0.02em',
                lineHeight: 1,
              }}
            >
              {approvalRate == null ? '—' : `${approvalRate}%`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
              {approved} aprovades · {rejected} rebutjades · {pending.length} pendents
            </div>

            {decided > 0 && (
              <div style={{ marginTop: 14 }}>
                <div
                  style={{
                    display: 'flex',
                    height: 12,
                    borderRadius: 2,
                    overflow: 'hidden',
                    background: 'var(--paper-3)',
                  }}
                >
                  <div
                    style={{
                      width: `${(approved / decided) * 100}%`,
                      background: 'var(--aye)',
                    }}
                  />
                  <div
                    style={{
                      width: `${(rejected / decided) * 100}%`,
                      background: 'var(--no)',
                    }}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 10,
                    color: 'var(--ink-3)',
                    marginTop: 4,
                  }}
                >
                  <span style={{ color: 'var(--aye)', fontWeight: 600 }}>
                    Sí {approved}
                  </span>
                  <span style={{ color: 'var(--no)', fontWeight: 600 }}>
                    No {rejected}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Top proposers */}
          <div>
            <div className="eyebrow" style={{ fontSize: 9, marginBottom: 6 }}>
              Qui proposa en aquest tema
            </div>
            {topProposers.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: 0 }}>
                Cap iniciativa registrada.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {topProposers.map(([who, count]) => (
                  <li
                    key={who}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 60px 30px',
                      alignItems: 'center',
                      gap: 8,
                      padding: '5px 0',
                      borderBottom: '1px solid var(--rule)',
                      fontSize: 11,
                    }}
                  >
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--ink-2)',
                      }}
                      title={who}
                    >
                      {who}
                    </span>
                    <div
                      style={{
                        height: 6,
                        background: 'var(--paper-3)',
                        borderRadius: 1,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${(count / proposerMax) * 100}%`,
                          height: '100%',
                          background: 'var(--accent)',
                          opacity: 0.85,
                        }}
                      />
                    </div>
                    <span
                      className="tabular"
                      style={{ fontWeight: 600, textAlign: 'right' }}
                    >
                      {count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 8 }}>
              <Tooltip
                term="d'on vénen aquestes dades"
                explanation={glossaryShort('data_source')}
              />
            </div>
          </div>
        </div>

        <style>{`
          @media (max-width: 720px) {
            .topic-stats-widget { grid-template-columns: 1fr !important; gap: 22px !important; }
          }
        `}</style>
      </section>

      {/* Pending — what's still in motion */}
      <section style={{ paddingTop: 28 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Encara no votades · presentades o en tràmit
        </div>
        <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 0, marginBottom: 12 }}>
          Iniciatives registrades al Congrés sota aquest tema que encara no han arribat a votació final. Ordre cronològic invers (més recents a dalt).
        </p>
        {upcomingAgenda.length > 0 && (
          <div
            style={{
              padding: '10px 14px',
              background: 'var(--accent-soft)',
              border: '1px solid var(--accent)',
              borderRadius: 10,
              marginBottom: 14,
              fontSize: 13,
              color: 'var(--ink)',
            }}
          >
            <b>{upcomingAgenda.length}</b> d&apos;aquestes iniciatives estan a l&apos;ordre del dia de la pròxima sessió plenària.
          </div>
        )}
        {pending.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            Cap iniciativa pendent en aquest tema ara mateix.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {pending.slice(0, 30).map((i) => (
              <InitiativeRow key={i.id} initiative={i} locale={locale} />
            ))}
            {pending.length > 30 && (
              <li style={{ padding: '12px 0', fontSize: 12, color: 'var(--ink-3)' }}>
                + {pending.length - 30} iniciatives més · disponibles via API
              </li>
            )}
          </ul>
        )}
      </section>

      {/* Voted — approved or rejected */}
      <section style={{ paddingTop: 32 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Ja votades · aprovades o rebutjades
        </div>
        {voted.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>{t('no_votes_yet')}</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {voted.slice(0, 30).map((i) => (
              <InitiativeRow key={i.id} initiative={i} locale={locale} />
            ))}
            {voted.length > 30 && (
              <li style={{ padding: '12px 0', fontSize: 12, color: 'var(--ink-3)' }}>
                + {voted.length - 30} iniciatives més
              </li>
            )}
          </ul>
        )}
      </section>

      {/* Terminal but not voted: withdrawn / expired */}
      {otherTerminal.length > 0 && (
        <section style={{ paddingTop: 32 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Retirades o caducades
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {otherTerminal.slice(0, 20).map((i) => (
              <InitiativeRow key={i.id} initiative={i} locale={locale} />
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function InitiativeRow({
  initiative,
  locale,
}: {
  initiative: Initiative;
  locale: string;
}) {
  const submittedDate = initiative.submitted_at
    ? new Date(initiative.submitted_at)
    : null;
  const isCurrentYear = submittedDate
    ? submittedDate.getFullYear() === new Date().getFullYear()
    : false;
  const shortDate = submittedDate
    ? submittedDate
        .toLocaleDateString(locale, {
          day: 'numeric',
          month: 'short',
          ...(isCurrentYear ? {} : { year: '2-digit' }),
        })
        .replace(/\.$/, '')
    : '—';
  const longDate = submittedDate
    ? submittedDate.toLocaleDateString(locale, { dateStyle: 'medium' })
    : '—';
  const typeLabel = typeLabelCa(initiative.type);
  const typeShort = glossaryShort(initiative.type);
  const plainSummary = pickPlainSummary(initiative, locale);
  const statusLabel = STATUS_LABEL[initiative.status] ?? initiative.status;
  const statusColor = STATUS_COLOR[initiative.status] ?? 'var(--ink-3)';
  const linkHref = initiative.source_url ?? '#';
  const isExternal = !!initiative.source_url;
  return (
    <li>
      <a
        href={linkHref}
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? 'noopener noreferrer' : undefined}
        className="initiative-row"
        style={{
          textDecoration: 'none',
          color: 'inherit',
          borderBottom: '1px solid var(--rule)',
          padding: '14px 0',
          display: 'grid',
          gap: 14,
          // Mobile: 2-col [date | content]; desktop: 3-col [date | content | status]
          // The desktop status cell is also rendered but `hidden sm:flex` so it
          // only participates in the layout once the breakpoint kicks in. The
          // grid columns are set via inline + a media query in <style>.
          gridTemplateColumns: 'minmax(56px, max-content) 1fr',
          alignItems: 'baseline',
        }}
      >
        <span
          className="tabular"
          style={{
            fontSize: 12,
            color: 'var(--ink-3)',
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span className="sm:hidden">{shortDate}</span>
          <span className="hidden sm:inline">{longDate}</span>
        </span>
        <div style={{ minWidth: 0 }}>
          {/* Desktop metadata row — kept above the title for a scannable
              "type · proposer" lead. Hidden on mobile to declutter. */}
          <span
            className="hidden sm:inline"
            style={{ fontSize: 11, color: 'var(--ink-3)' }}
          >
            {typeShort ? (
              <Tooltip term={typeLabel} explanation={typeShort} />
            ) : (
              typeLabel
            )}
            {initiative.submitted_by ? (
              <>
                {' · '}
                <ProposerEllipsis text={initiative.submitted_by} />
              </>
            ) : ''}
          </span>
          <div
            className="line-clamp-2 sm:line-clamp-3"
            style={{ fontSize: 14, lineHeight: 1.4, marginTop: 2, color: 'var(--ink)' }}
          >
            <SummaryHover
              summary={plainSummary}
              fallback={initiative.summary ?? undefined}
              provider={initiative.plain_summary_provider}
            >
              {initiative.title_original}
            </SummaryHover>
          </div>
          {/* Mobile attribution line — type · proposer · colored status,
              all baseline-aligned beneath the title. Mirrors the votes
              page mobile pattern so the visual rhythm is consistent. */}
          <div
            className="sm:hidden"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
              marginTop: 6,
              fontSize: 11,
              color: 'var(--ink-3)',
              lineHeight: 1.3,
            }}
          >
            <span>
              {typeShort ? (
                <Tooltip term={typeLabel} explanation={typeShort} />
              ) : (
                typeLabel
              )}
            </span>
            {initiative.submitted_by && (
              <>
                <span aria-hidden="true">·</span>
                <ProposerEllipsis text={initiative.submitted_by} />
              </>
            )}
            <span aria-hidden="true">·</span>
            <span style={{ color: statusColor, fontWeight: 600 }}>
              {statusLabel}
            </span>
          </div>
          <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 4, display: 'inline-block' }}>
            {initiative.official_id}
          </span>
        </div>
        {/* Desktop-only status badge column. Hidden on mobile because the
            status text appears inline in the attribution line above. */}
        <span
          className="hidden sm:inline-flex"
          style={{ alignItems: 'center', justifyContent: 'flex-end' }}
        >
          <span
            className="badge"
            style={{
              fontWeight: 600,
              color: statusColor,
              borderColor: 'transparent',
              background: 'var(--paper-2)',
              whiteSpace: 'nowrap',
            }}
          >
            {statusLabel}
          </span>
        </span>
      </a>
    </li>
  );
}
