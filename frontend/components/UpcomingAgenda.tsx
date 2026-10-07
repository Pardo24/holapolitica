import { getLocale, getTranslations } from 'next-intl/server';

import type { ScheduledSession } from '@/lib/api';

interface UpcomingAgendaProps {
  /** Sessions still on the calendar (withdrawn ones already removed). */
  sessions: ScheduledSession[];
  /** How many upcoming sessions the Congress withdrew from its calendar. */
  withdrawn?: number;
}

/**
 * Server component that renders the upcoming plenary agenda on the home page.
 *
 * Always renders: it shows a friendly empty-state when no sessions are
 * scheduled (the agenda ingestion can run dry for stretches). It used to have
 * a second, compact form that sat above the /votes list; that archive now
 * leads with its results instead, so the card belongs to the home page alone.
 *
 * Visual rules:
 *  - Long subjects truncate with ellipsis. Container is `overflow: hidden`
 *    + `min-width: 0` so nothing pushes the page horizontally on mobile.
 *  - No links to a detail route yet — no `/sessions/[id]` page exists.
 */
export async function UpcomingAgenda({ sessions, withdrawn = 0 }: UpcomingAgendaProps) {
  const t = await getTranslations('upcoming');
  const locale = await getLocale();

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
              {withdrawn > 0 ? (
                <>
                  <strong style={{ color: 'var(--ink)' }}>{t('none_convened_title')}</strong>{' '}
                  {t('none_convened_body', { n: withdrawn })}
                </>
              ) : (
                t('empty')
              )}
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
  // "planned" rows come from the yearly calendar and carry a synthetic,
  // negative session number; any session with no items yet reads the same.
  const isPlanned = session.status === 'planned' || session.items.length === 0;
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

