import { getTranslations } from 'next-intl/server';
import {
  ArrowUpRight,
  Banknote,
  Car,
  ChevronDown,
  FileText,
  Gem,
  HandCoins,
  House,
  Info,
  Landmark,
  MessageSquareText,
  TrendingUp,
  type LucideIcon,
} from '@/components/icons';

import type { AssetDeclaration, AssetDeclarationData } from '@/lib/api';

type T = Awaited<ReturnType<typeof getTranslations<'assets'>>>;

/**
 * A deputy's "Declaraciones de Bienes y Rentas", newest first: each one as
 * the deputy filled it in, sorted into the form's sections, with the
 * official PDF beside it.
 *
 * Shown one by one and never added up: the form asks no value for homes or
 * land, and a later declaration only lists what changed. Only what passed
 * every check reaches the page (backend app/ingest/congreso/assets.py); for
 * the rest, the PDF.
 */
export async function AssetDeclarations({
  declarations,
  locale,
}: {
  declarations: AssetDeclaration[];
  locale: string;
}) {
  const t = await getTranslations('assets');
  const [latest, ...older] = declarations;

  return (
    <section id="bens" className="dep-panel assets dep-who__part" aria-labelledby="assets-title">
      <h2 id="assets-title" className="h-title">
        {t('title')}
      </h2>
      <p className="dep-panel__dek">{t('intro')}</p>
      <details className="assets__how">
        <summary>
          <Info size={15} aria-hidden="true" />
          {t('how_title')}
          <ChevronDown size={15} aria-hidden="true" className="assets__chev" />
        </summary>
        <ul>
          <li>{t('note_source')}</li>
          <li>{t('note_no_total')}</li>
          <li>{t('note_income')}</li>
        </ul>
      </details>

      {latest && <Declaration d={latest} id="decl-0" locale={locale} t={t} open />}

      {older.length > 0 && (
        <>
          <h3 className="assets__older-title">{t('older_title', { n: older.length })}</h3>
          {older.map((d, i) => (
            <Declaration key={d.pdf_url} d={d} id={`decl-${i + 1}`} locale={locale} t={t} />
          ))}
        </>
      )}
    </section>
  );
}

function Declaration({
  d,
  id,
  locale,
  t,
  open = false,
}: {
  d: AssetDeclaration;
  id: string;
  locale: string;
  t: T;
  open?: boolean;
}) {
  const date = new Date(`${d.declared_on}T12:00:00Z`).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const sections = d.status === 'ok' && d.data ? buildSections(d.data, locale, t) : null;

  const head = (
    <>
      <span className="assets__head-text">
        <span className="assets__kind">{d.sequence === 0 ? t('kind_initial') : t('kind_later')}</span>
        <span className="assets__date">{t('declared_on', { date })}</span>
      </span>
      {!open && <ChevronDown size={18} aria-hidden="true" className="assets__chev" />}
    </>
  );
  const body = (
    <>
      {sections === null ? (
        <p className="assets__unread">{d.status === 'pending' ? t('pending') : t('unread')}</p>
      ) : sections.length === 0 ? (
        <p className="assets__unread">{t('empty_form')}</p>
      ) : (
        <>
          <nav className="assets__glance" aria-label={t('glance_aria')}>
            {sections.map((s) => (
              <a key={s.key} href={`#${id}-${s.key}`}>
                <s.icon size={15} aria-hidden="true" />
                {s.short}
                {s.count != null && <span className="tabular">{s.count}</span>}
              </a>
            ))}
          </nav>
          <div className="assets__sections">
            {sections.map((s) => (
              <section key={s.key} id={`${id}-${s.key}`} className="assets__sec">
                <h4 className="assets__sec-title">
                  <span className="assets__sec-icon" aria-hidden="true">
                    <s.icon size={16} />
                  </span>
                  {s.title}
                </h4>
                {s.note && <p className="assets__sec-note">{s.note}</p>}
                {s.body}
              </section>
            ))}
          </div>
        </>
      )}
      <a href={d.pdf_url} target="_blank" rel="noopener noreferrer" className="assets__pdf">
        <FileText size={15} aria-hidden="true" />
        {t('pdf')}
        <ArrowUpRight size={13} aria-hidden="true" />
      </a>
    </>
  );

  return open ? (
    <article className="assets__decl" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="assets__head">
        {head}
      </h3>
      {body}
    </article>
  ) : (
    <details className="assets__decl">
      <summary className="assets__head">{head}</summary>
      {body}
    </details>
  );
}

interface Item {
  main: string | null;
  tag?: string | null;
  meta?: (string | null | false | undefined)[];
  amount?: string | null;
  amountNote?: string | null;
}

interface Section {
  key: string;
  icon: LucideIcon;
  title: string;
  short: string;
  count: number | null;
  note?: string;
  body: React.ReactNode;
}

function Items({ items }: { items: Item[] }) {
  return (
    <ul className="assets__items">
      {items.map((it, i) => {
        const meta = (it.meta ?? []).filter(Boolean).join(' · ');
        return (
          <li key={i} className="assets__item">
            <span className="assets__item-main">
              {it.tag && <span className="assets__tag">{it.tag}</span>}
              {it.main}
            </span>
            {meta && <span className="assets__item-meta">{meta}</span>}
            {it.amount && (
              <span className="assets__item-amount tabular">
                {it.amount}
                {it.amountNote && <small>{it.amountNote}</small>}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function buildSections(data: AssetDeclarationData, locale: string, t: T): Section[] {
  const eur = (n: number | null | undefined) =>
    n == null ? null : n.toLocaleString(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
  const out: Section[] = [];

  const income: Item[] = data.income.map((r) => ({
    tag: t(`income_${r.kind}`),
    main: r.concept,
    amount: r.as_written ?? eur(r.amount),
  }));
  if (data.income_tax_paid != null || data.income_tax_as_written) {
    income.push({ main: t('income_tax'), amount: data.income_tax_as_written ?? eur(data.income_tax_paid) });
  }
  if (income.length) {
    out.push({
      key: 'income',
      icon: Banknote,
      title: t('income_title'),
      short: t('short_income'),
      count: null,
      note: t('income_note'),
      body: <Items items={income} />,
    });
  }

  if (data.properties.length) {
    out.push({
      key: 'properties',
      icon: House,
      title: t('properties_heading'),
      short: t('short_properties'),
      count: data.properties.length,
      note: t('properties_note'),
      body: (
        <Items
          items={data.properties.map((r) => ({
            tag: t(`property_${r.kind}`),
            main: r.description,
            meta: [r.location, r.acquired && t('acquired', { date: r.acquired }), r.right],
          }))}
        />
      ),
    });
  }

  // One row per line the deputy filled; rows read before that carry a
  // single total and note instead.
  const deposits =
    data.deposits ??
    (data.deposits_total != null || data.deposits_note
      ? [{ description: data.deposits_note ?? null, amount: data.deposits_total ?? null, as_written: null }]
      : []);
  if (deposits.length) {
    out.push({
      key: 'deposits',
      icon: Landmark,
      title: t('deposits_title'),
      short: t('short_deposits'),
      count: null,
      body: (
        <Items
          items={deposits.map((r) => ({
            main: r.description ?? t('deposits_total'),
            amount: r.as_written ?? eur(r.amount),
          }))}
        />
      ),
    });
  }

  if (data.securities.length) {
    out.push({
      key: 'securities',
      icon: TrendingUp,
      title: t('securities_title'),
      short: t('short_securities'),
      count: data.securities.length,
      body: (
        <Items
          items={data.securities.map((r) => ({
            tag: t(`security_${r.kind}`),
            main: r.description,
            amount: r.as_written ?? eur(r.value),
          }))}
        />
      ),
    });
  }

  if (data.vehicles.length) {
    out.push({
      key: 'vehicles',
      icon: Car,
      title: t('vehicles_title'),
      short: t('short_vehicles'),
      count: data.vehicles.length,
      body: (
        <Items
          items={data.vehicles.map((r) => ({
            main: r.description,
            meta: [r.acquired && t('acquired', { date: r.acquired })],
          }))}
        />
      ),
    });
  }

  if (data.other_assets.length) {
    out.push({
      key: 'other',
      icon: Gem,
      title: t('other_title'),
      short: t('short_other'),
      count: data.other_assets.length,
      body: (
        <Items
          items={data.other_assets.map((r) => ({ main: r.description, amount: r.as_written ?? eur(r.value) }))}
        />
      ),
    });
  }

  if (data.loans.length || data.other_debts) {
    const loans: Item[] = data.loans.map((r) => {
      const granted = r.amount_as_written ?? eur(r.amount);
      return {
        main: r.description,
        meta: [
          r.granted_on && t('granted_on', { date: r.granted_on }),
          granted && t('loan_amount', { amount: granted }),
        ],
        amount: r.outstanding_as_written ?? eur(r.outstanding),
        amountNote: t('loan_pending_caption'),
      };
    });
    if (data.other_debts) loans.push({ main: data.other_debts });
    out.push({
      key: 'debts',
      icon: HandCoins,
      title: t('debts_title'),
      short: t('short_debts'),
      count: data.loans.length || null,
      body: <Items items={loans} />,
    });
  }

  if (data.observations) {
    out.push({
      key: 'observations',
      icon: MessageSquareText,
      title: t('observations_title'),
      short: t('short_observations'),
      count: null,
      body: <blockquote className="assets__quote">{data.observations}</blockquote>,
    });
  }

  return out;
}
