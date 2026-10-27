import '@/app/styles/election-news.css';
import '@/app/styles/pactes.css';
import '@/app/styles/eleccions.css';
import '@/app/styles/calendari.css';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowUpRight } from '@/components/icons';

import { ElectionsHeader } from '@/components/Elections';
import { ELECTION_CALENDAR, calendarStatus, daysUntil, madridToday, type CalendarKind } from '@/lib/electionCalendar';

// The page marks what is over, under way and next, so it must not be
// served from a build made days ago.
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('elections');
  return { title: t('cal_meta_title'), description: t('cal_meta_description') };
}

/**
 * The election calendar: every date of the 29 November 2026 election that
 * a voter may need, from the call to the day the new Cortes meet, with the
 * article that fixes it (lib/electionCalendar.ts). What is over is greyed
 * out, what is under way and the next date stand out.
 */
export default async function ElectionCalendarPage() {
  const t = await getTranslations('elections');
  const locale = await getLocale();
  const today = madridToday();
  const status = calendarStatus(ELECTION_CALENDAR, today);

  const day = (d: string, withWeekday = false) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString(locale, {
      ...(withWeekday ? { weekday: 'long' as const } : {}),
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });
  const kindLabel: Record<CalendarKind, string> = {
    action: t('cal_kind_action'),
    abroad: t('cal_kind_abroad'),
    process: t('cal_kind_process'),
  };

  return (
    <div className="pacts">
      <ElectionsHeader active="calendar" title={t('cal_title')} intro={t('cal_intro')} />

      <ol className="ecal">
        {ELECTION_CALENDAR.map((e, i) => {
          const s = status[i]!;
          const when = e.end
            ? t('cal_range', { from: day(e.start), to: day(e.end) })
            : day(e.start, true);
          const n = daysUntil(e.start, today);
          return (
            <li key={e.id} className={`ecal__item ecal__item--${s} ecal__item--${e.kind}`}>
              <p className="ecal__when">
                <time dateTime={e.start}>{when}</time>
                {s === 'now' && <span className="ecal__badge ecal__badge--now">{t('cal_now')}</span>}
                {s === 'next' && <span className="ecal__badge">{t('cal_in_days', { n })}</span>}
                {s === 'past' && <span className="ecal__past">{t('cal_past')}</span>}
              </p>
              <h2 className="ecal__title">{t(`cal_${e.id}_title`)}</h2>
              <p className="ecal__body">{t(`cal_${e.id}_body`)}</p>
              <p className="ecal__meta">
                <span className={`ecal__kind ecal__kind--${e.kind}`}>{kindLabel[e.kind]}</span>
                <a href={e.url} target="_blank" rel="noopener noreferrer" className="ecal__source">
                  {e.source} <ArrowUpRight size={12} aria-hidden="true" />
                </a>
              </p>
            </li>
          );
        })}
      </ol>

      <p className="ecal__note">{t('cal_note')}</p>
    </div>
  );
}
