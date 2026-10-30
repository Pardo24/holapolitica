import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';
import {
  ArrowRight,
  Banknote,
  Briefcase,
  HandCoins,
  House,
  Landmark,
  TrendingUp,
  type LucideIcon,
} from '@/components/icons';

import type { AssetDeclaration, Mandate, Person } from '@/lib/api';

// Our mandates start with the 2011 legislature: anyone there may go further back.
const FIRST_LEGISLATURE_WE_HOLD = 2011;
// Lines of the official biography that say nothing about a career.
const NOT_CAREER = /^(casad|solter|divorciad|separad|viud|nacid|naci[oó]\b|padre|madre|pareja|diputad|\d+ hij|un hij|dos hij)/i;

/**
 * Who a deputy is, seen before any tab: what they did before, how long they
 * have sat, and the first lines of their declaration of assets.
 *
 * Only the declaration made on taking the seat is summarised. A later one
 * lists just what changed, so "none declared" would be false coming from it.
 * Nothing is added up, for the reasons in AssetDeclarations.
 */
export async function DeputyWhoIs({
  person,
  mandates,
  declarations,
  href,
  locale,
}: {
  person: Person;
  mandates: Mandate[];
  declarations: AssetDeclaration[];
  href: { career: Route; assets: Route; all: Route };
  locale: string;
}) {
  const t = await getTranslations('person');
  const none = t('who_none');
  const rows: { key: string; icon: LucideIcon; label: string; value: string; to: Route }[] = [];

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

  const initial = declarations.find((d) => d.sequence === 0 && d.status === 'ok' && d.data);
  const data = initial?.data;
  const firstTwo = (texts: (string | null | undefined)[]) => {
    const named = texts.filter((s): s is string => Boolean(s));
    if (named.length === 0) return null;
    const shown = named.slice(0, 2).join(' · ');
    return named.length > 2 ? `${shown} ${t('who_more', { n: named.length - 2 })}` : shown;
  };
  if (data) {
    rows.push({
      key: 'income',
      icon: Banknote,
      label: t('who_income'),
      value: firstTwo(data.income.map((r) => r.concept)) ?? none,
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
      value: firstTwo(shares.map((r) => r.description)) ?? (shares.length ? String(shares.length) : none),
      to: href.assets,
    });
    rows.push({
      key: 'debts',
      icon: HandCoins,
      label: t('who_debts'),
      value: data.loans.length
        ? t('who_debts_value', { n: data.loans.length })
        : data.other_debts
          ? data.other_debts
          : none,
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
                <span className="dep-who__value">{r.value}</span>
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

/** The first paragraph of the official biography about a career, not a family. */
function careerFromBio(bio: string | null): string | null {
  if (!bio) return null;
  const paragraphs = bio.split(/\n{2,}/).map((p) => p.trim());
  return paragraphs.find((p) => p && !NOT_CAREER.test(p)) ?? null;
}
