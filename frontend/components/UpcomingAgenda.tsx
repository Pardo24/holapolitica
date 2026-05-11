import { getLocale, getTranslations } from 'next-intl/server';

import type { ScheduledSession } from '@/lib/api';

interface UpcomingAgendaProps {
  sessions: ScheduledSession[];
  /**
   * - `home`: full card with eyebrow + title, multi-row list, empty state.
   * - `compact`: inline banner above a table. Hidden entirely when empty.
   */
  mode: 'home' | 'compact';
}

/**
 * Server component that renders the upcoming plenary agenda.
 *
 * Behaviour by mode:
 *  - `home`: always renders. Shows a friendly empty-state when no sessions
 *    are scheduled (the agenda ingestion can run dry for stretches).
 *  - `compact`: renders nothing when empty — keeps the /votes table from
 *    inheriting visual clutter. When populated, shows a single-line banner
 *    above the list with up to two upcoming sessions.
 *
 * Visual rules:
 *  - Long subjects truncate with ellipsis. Container is `overflow: hidden`
 *    + `min-width: 0` so nothing pushes the page horizontally on mobile.
 *  - No links to a detail route yet — no `/sessions/[id]` page exists.
 */
export async function UpcomingAgenda({ sessions, mode }: UpcomingAgendaProps) {
  const t = await getTranslations('upcoming');
  const locale = await getLocale();

  if (mode === 'compact' && sessions.length === 0) return null;

  if (mode === 'compact') {
    // Up to 2 sessions in the compact banner — anything more crowds the
    // table that follows.
    const visible = sessions.slice(0, 2);
    return (
      <section
        aria-label={t('title_compact')}
        style={{
          marginTop: 14,
          marginBottom: 14,
          padding: '12px 16px',
          border: '1px solid var(--rule)',
          borderRadius: 10,
          background: 'var(--paper-2)',
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        <div
          className="eyebrow"
          style={{ marginBottom: 6, fontSize: 11 }}
        >
          {t('title_compact')}
        </div>
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {visible.map((s) => (
            <CompactRow key={s.id} session={s} locale={locale} t={t} />
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section
      style={{
        paddingTop: 32,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 12,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <h2
          className="h-headline"
          style={{ margin: 0, fontSize: 22, minWidth: 0 }}
        >
          {t('title_home')}
        </h2>
        <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
          {t('subtitle')}
        </div>
      </div>
      {sessions.length === 0 ? (
        <div
          style={{
            padding: '20px 22px',
            borderRadius: 14,
            border: '1px dashed var(--rule-strong)',
            background: 'var(--paper-2)',
            display: 'flex',
            gap: 16,
            alignItems: 'flex-start',
            minWidth: 0,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              fontSize: 22,
              lineHeight: 1,
              color: 'var(--ink-3)',
              flex: '0 0 auto',
            }}
          >
            ·
          </span>
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                color: 'var(--ink-2)',
                lineHeight: 1.5,
                wordBreak: 'break-word',
              }}
            >
              {t('empty')}
            </p>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: 11,
                color: 'var(--ink-3)',
                fontStyle: 'italic',
              }}
            >
              {t('caveat')}
            </p>
          </div>
        </div>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            borderRadius: 14,
            border: '1px solid var(--rule)',
            background: 'var(--paper-2)',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          {sessions.map((s) => (
            <HomeRow key={s.id} session={s} locale={locale} t={t} />
          ))}
          <li
            style={{
              padding: '10px 18px',
              fontSize: 11,
              color: 'var(--ink-3)',
              fontStyle: 'italic',
              borderTop: '1px solid var(--rule)',
              wordBreak: 'break-word',
            }}
          >
            {t('caveat')}
          </li>
        </ul>
      )}
      <style>{`
        @media (max-width: 560px) {
          .upcoming-row-grid {
            grid-template-columns: 1fr auto !important;
            grid-template-rows: auto auto !important;
            row-gap: 4px !important;
          }
          .upcoming-row-grid > :nth-child(2) {
            grid-column: 1 / -1 !important;
          }
        }
      `}</style>
    </section>
  );
}

type UpcomingTranslator = Awaited<ReturnType<typeof getTranslations<'upcoming'>>>;

function formatDate(date: string, locale: string): string {
  return new Date(date).toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });
}

function HomeRow({
  session,
  locale,
  t,
}: {
  session: ScheduledSession;
  locale: string;
  t: UpcomingTranslator;
}) {
  const dateStr = formatDate(session.date, locale);
  const itemCount = session.items.length;
  const isPlanned = session.status === 'planned';
  const firstItem = session.items[0];
  return (
    <li
      className="upcoming-row-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(120px, 160px) minmax(0, 1fr) auto',
        gap: 16,
        padding: '14px 18px',
        borderBottom: '1px solid var(--rule)',
        alignItems: 'baseline',
        minWidth: 0,
      }}
    >
      <div
        className="tabular"
        style={{
          fontSize: 13,
          color: 'var(--ink)',
          fontWeight: 600,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {dateStr}
      </div>
      <div style={{ minWidth: 0 }}>
        {isPlanned ? (
          <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            {t('planned_label')}
          </span>
        ) : (
          <>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              {t('items_count', { count: itemCount })}
            </span>
            {firstItem && (
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--ink-3)',
                  marginTop: 4,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}
                title={firstItem.subject}
              >
                {firstItem.subject}
              </div>
            )}
          </>
        )}
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--ink-3)',
          whiteSpace: 'nowrap',
          flex: '0 0 auto',
        }}
      >
        {isPlanned
          ? t('status_planned')
          : t('session_number', { n: session.session_number })}
      </div>
    </li>
  );
}

function CompactRow({
  session,
  locale,
  t,
}: {
  session: ScheduledSession;
  locale: string;
  t: UpcomingTranslator;
}) {
  const dateStr = formatDate(session.date, locale);
  const isPlanned = session.status === 'planned';
  const itemCount = session.items.length;
  return (
    <li
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'baseline',
        minWidth: 0,
        flexWrap: 'wrap',
      }}
    >
      <span
        className="tabular"
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--ink)',
          whiteSpace: 'nowrap',
          flex: '0 0 auto',
        }}
      >
        {dateStr}
      </span>
      <span
        style={{
          fontSize: 12,
          color: 'var(--ink-2)',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: '1 1 auto',
        }}
      >
        {isPlanned
          ? t('planned_label')
          : t('items_count', { count: itemCount })}
      </span>
    </li>
  );
}
