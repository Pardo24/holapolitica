import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';
import {
  ArrowRight,
  Banknote,
  Briefcase,
  Clock,
  HandCoins,
  House,
  Landmark,
  ShieldCheck,
  TrendingUp,
  type LucideIcon,
} from '@/components/icons';

import type {
  ActivitiesData,
  AssetDeclaration,
  InterestDeclaration,
  InterestsData,
  Mandate,
  Person,
} from '@/lib/api';

// Our mandates start with the 2011 legislature: anyone there may go further back.
const FIRST_LEGISLATURE_WE_HOLD = 2011;
// Lines of the official biography that say nothing about a career.
const SHOWN = 3;
// Register sections that are work beside the seat, not posts or pensions.
const AUTHORISED = ['private_authorised', 'creative', 'teaching', 'other'] as const;

interface Line {
  text: string;
  amount: string | null;
  note?: string;
}

const NOT_CAREER = /^(casad|solter|divorciad|separad|viud|nacid|naci[oó]\b|padre|madre|pareja|diputad|\d+ hij|un hij|dos hij)/i;

/**
 * Who a deputy is, seen before any tab: what they did before, how long they
 * have sat, the jobs and authorised activities they declared, and the first
 * lines of their declaration of assets.
 *
 * Only the declaration made on taking the seat is summarised. A later one
 * lists just what changed, so "none declared" would be false coming from it.
 * Amounts are the deputy's, row by row: nothing is added up, for the reasons
 * in AssetDeclarations.
 */
export async function DeputyWhoIs({
  person,
  mandates,
  declarations,
  interests = [],
  href,
  locale,
}: {
  person: Person;
  mandates: Mandate[];
  declarations: AssetDeclaration[];
  interests?: InterestDeclaration[];
  href: { career: Route; assets: Route; interests: Route; all: Route };
  locale: string;
}) {
  const t = await getTranslations('person');
  const none = t('who_none');
  const rows: {
    key: string;
    icon: LucideIcon;
    label: string;
    value?: string;
    lines?: Line[];
    more?: number;
    to: Route;
  }[] = [];

  const career = person.profession ?? careerFromBio(person.bio_text) ?? person.education;
  if (career) rows.push({ key: 'career', icon: Briefcase, label: t('who_career'), value: career, to: href.career });

  if (mandates.length > 0) {
    const year = Math.min(...mandates.map((m) => new Date(m.start_date).getFullYear()));
    rows.push({
      key: 'congress',
      icon: Landmark,
      label: t('who_congress'),
      value: t(year <= FIRST_LEGISLATURE_WE_HOLD ? 'who_mandates_or_before' : 'who_mandates', {
        n: mandates.length,
        year,
      }),
      to: href.career,
    });
  }

  // Jobs in the five years before the seat, from the first economic-interests
  // form; and what the Congreso lets them do beside it, from its register.
  const firstForm = interests
    .filter((d) => d.kind === 'interests' && d.status === 'ok' && d.data)
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))[0];
  const before = (firstForm?.data as InterestsData | undefined)?.activities ?? [];
  if (firstForm) {
    rows.push({
      key: 'before',
      icon: Clock,
      label: t('who_before'),
      ...listedLines(
        before.map((r) => ({ text: r.employer ?? r.description ?? '', amount: r.period })),
        none,
      ),
      to: href.interests,
    });
  }
  const register = interests.find((d) => d.kind === 'activities' && d.status === 'ok' && d.data);
  const registerData = register?.data as ActivitiesData | undefined;
  if (registerData) {
    const authorised = AUTHORISED.flatMap((key) => registerData.sections?.[key] ?? []).filter((r) => r.text);
    rows.push({
      key: 'authorised',
      icon: ShieldCheck,
      label: t('who_authorised'),
      ...(registerData.awaiting_plenary
        ? { value: t('who_awaiting') }
        : listedLines(
            authorised.map((r) => ({ text: r.text ?? '', amount: null })),
            t('who_authorised_none'),
          )),
      to: href.interests,
    });
  }

  const initial = declarations.find((d) => d.sequence === 0 && d.status === 'ok' && d.data);
  const data = initial?.data;
  const eur = (n: number | null | undefined) =>
    n == null ? null : n.toLocaleString(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
  // Each row with what the deputy wrote beside it, never added up.
  const listed = (all: Line[]) => listedLines(all, none);
  if (data) {
    rows.push({
      key: 'income',
      icon: Banknote,
      label: t('who_income'),
      ...listed(
        data.income.map((r) => ({
          text: r.concept ?? t(`who_income_${r.kind}`),
          amount: r.as_written ?? eur(r.amount),
        })),
      ),
      to: href.assets,
    });
    rows.push({
      key: 'properties',
      icon: House,
      label: t('who_properties'),
      value: data.properties.length ? t('who_properties_value', { n: data.properties.length }) : none,
      to: href.assets,
    });
    const shares = data.securities.filter((r) => r.kind === 'shares' || r.kind === 'stake');
    rows.push({
      key: 'shares',
      icon: TrendingUp,
      label: t('who_shares'),
      ...listed(shares.map((r) => ({ text: r.description ?? t('who_shares'), amount: r.as_written ?? eur(r.value) }))),
      to: href.assets,
    });
    rows.push({
      key: 'debts',
      icon: HandCoins,
      label: t('who_debts'),
      ...listed([
        ...data.loans.map((r) => ({
          text: r.description ?? t('who_debts'),
          amount: r.outstanding_as_written ?? eur(r.outstanding),
          note: t('who_pending'),
        })),
        ...(data.other_debts ? [{ text: data.other_debts, amount: null }] : []),
      ]),
      to: href.assets,
    });
  } else if (declarations.length > 0) {
    rows.push({ key: 'unread', icon: Banknote, label: t('who_assets'), value: t('who_unread'), to: href.assets });
  }

  if (rows.length === 0) return null;

  const later = declarations.filter((d) => d.sequence > 0).length;
  const date = initial
    ? new Date(`${initial.declared_on}T12:00:00Z`).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : null;

  return (
    <section className="dep-who" aria-labelledby="dep-who-title">
      <div className="dep-who__head">
        <h2 id="dep-who-title" className="dep-who__title">
          {t('who_title')}
        </h2>
        <Link href={href.all} scroll={false} className="dep-who__all">
          {t('who_all')} <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <ul className="dep-who__rows">
        {rows.map((r) => (
          <li key={r.key}>
            <Link href={r.to} className="dep-who__row">
              <span className="dep-who__icon" aria-hidden="true">
                <r.icon size={16} />
              </span>
              <span className="dep-who__text">
                <span className="dep-who__label">{r.label}</span>
                {r.value && <span className="dep-who__value">{r.value}</span>}
                {r.lines && (
                  <span className="dep-who__lines">
                    {r.lines.map((line, i) => (
                      <span key={i} className="dep-who__line">
                        <span className="dep-who__line-text">{line.text}</span>
                        {line.amount && (
                          <span className="dep-who__line-amount tabular">
                            {line.amount}
                            {line.note && <small>{line.note}</small>}
                          </span>
                        )}
                      </span>
                    ))}
                    {r.more ? <span className="dep-who__more">{t('who_more', { n: r.more })}</span> : null}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {date && (
        <p className="dep-who__note">
          {t('who_declared_note', { date })}
          {later > 0 && ` ${t('who_later', { n: later })}`}
        </p>
      )}
    </section>
  );
}

/** Up to SHOWN lines and how many more, or ``empty`` when there are none. */
function listedLines(all: Line[], empty: string): { lines?: Line[]; more?: number; value?: string } {
  return all.length ? { lines: all.slice(0, SHOWN), more: Math.max(all.length - SHOWN, 0) } : { value: empty };
}

/** The first paragraph of the official biography about a career, not a family. */
function careerFromBio(bio: string | null): string | null {
  if (!bio) return null;
  const paragraphs = bio.split(/\n{2,}/).map((p) => p.trim());
  return paragraphs.find((p) => p && !NOT_CAREER.test(p)) ?? null;
}
