import { getTranslations } from 'next-intl/server';
import {
  ArrowUpRight,
  BookOpen,
  Briefcase,
  ChevronDown,
  Clock,
  FileText,
  Gift,
  GraduationCap,
  HeartHandshake,
  Info,
  Landmark,
  MessageSquareText,
  ShieldCheck,
  Users,
  type LucideIcon,
} from '@/components/icons';

import { Items, type Item } from '@/components/AssetDeclarations';
import type { ActivitiesData, ActivitySection, InterestDeclaration, InterestsData } from '@/lib/api';

type T = Awaited<ReturnType<typeof getTranslations<'interests'>>>;

/** The register's sections, in its own order, each with an icon. */
const SECTIONS: { key: ActivitySection; icon: LucideIcon }[] = [
  { key: 'public_posts', icon: Landmark },
  { key: 'public_renounced', icon: Landmark },
  { key: 'pensions_renounced', icon: ShieldCheck },
  { key: 'pensions_compatible', icon: ShieldCheck },
  { key: 'teaching', icon: GraduationCap },
  { key: 'party_posts', icon: Users },
  { key: 'creative', icon: BookOpen },
  { key: 'private_authorised', icon: Briefcase },
  { key: 'other', icon: Briefcase },
];

interface Part {
  key: string;
  icon: LucideIcon;
  title: string;
  note?: string;
  body: React.ReactNode;
}

/**
 * A deputy's activities and economic interests: the activities the Congreso
 * lets them hold beside the seat (its register, one page rewritten in place),
 * then each "Declaración de Intereses Económicos", newest first (jobs in the
 * five years before, gifts, contributions). As written, with the PDF beside
 * each; only what passed every check (backend app/ingest/congreso/interests.py).
 */
export async function InterestDeclarations({
  declarations,
  locale,
}: {
  declarations: InterestDeclaration[];
  locale: string;
}) {
  if (declarations.length === 0) return null;
  const t = await getTranslations('interests');
  const register = declarations.find((d) => d.kind === 'activities');
  const forms = declarations.filter((d) => d.kind === 'interests');

  return (
    <section id="interessos" className="dep-panel assets dep-who__part" aria-labelledby="interests-title">
      <h2 id="interests-title" className="h-title">
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
          <li>{t('note_register')}</li>
          <li>{t('note_form')}</li>
          <li>{t('note_source')}</li>
        </ul>
      </details>

      {register && (
        <Doc
          id="act"
          kind={t('register_kind')}
          title={t('register_title')}
          d={register}
          parts={
            register.status === 'ok' && register.data && !register.data.awaiting_plenary
              ? registerParts(register.data as ActivitiesData, t)
              : null
          }
          message={register.data?.awaiting_plenary ? t('awaiting') : undefined}
          empty={t('register_empty')}
          t={t}
          open
        />
      )}

      {forms.map((d, i) => {
        const data = d.status === 'ok' ? (d.data as InterestsData | null) : null;
        return (
          <Doc
            key={d.pdf_url}
            id={`int-${i}`}
            kind={data?.initial === false || (d.sequence ?? 1) > 1 ? t('form_later') : t('form_initial')}
            title={d.declared_on ? t('declared_on', { date: longDate(d.declared_on, locale) }) : t('form_title')}
            d={d}
            parts={data ? formParts(data, t) : null}
            empty={t('form_empty')}
            t={t}
            open={i === 0}
          />
        );
      })}
    </section>
  );
}

function longDate(iso: string, locale: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function Doc({
  id,
  kind,
  title,
  d,
  parts,
  message,
  empty,
  t,
  open = false,
}: {
  id: string;
  kind: string;
  title: string;
  d: InterestDeclaration;
  parts: Part[] | null;
  message?: string;
  empty: string;
  t: T;
  open?: boolean;
}) {
  const head = (
    <>
      <span className="assets__head-text">
        <span className="assets__kind">{kind}</span>
        <span className="assets__date">{title}</span>
      </span>
      {!open && <ChevronDown size={18} aria-hidden="true" className="assets__chev" />}
    </>
  );
  const body = (
    <>
      {message ? (
        <p className="assets__unread">{message}</p>
      ) : parts === null ? (
        <p className="assets__unread">{d.status === 'pending' ? t('pending') : t('unread')}</p>
      ) : parts.length === 0 ? (
        <p className="assets__unread">{empty}</p>
      ) : (
        <div className="assets__sections">
          {parts.map((p) => (
            <section key={p.key} id={`${id}-${p.key}`} className="assets__sec">
              <h4 className="assets__sec-title">
                <span className="assets__sec-icon" aria-hidden="true">
                  <p.icon size={16} />
                </span>
                {p.title}
              </h4>
              {p.note && <p className="assets__sec-note">{p.note}</p>}
              {p.body}
            </section>
          ))}
        </div>
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

function registerParts(data: ActivitiesData, t: T): Part[] {
  return SECTIONS.flatMap(({ key, icon }) => {
    const rows = (data.sections?.[key] ?? []).filter((r) => r.text);
    if (rows.length === 0) return [];
    const items: Item[] = rows.map((r) => ({
      main: r.text,
      meta: [r.approved_on && t('approved_on', { date: r.approved_on })],
    }));
    return [{ key, icon, title: t(`section_${key}`), body: <Items items={items} /> }];
  });
}

function formParts(data: InterestsData, t: T): Part[] {
  const out: Part[] = [];
  if (data.activities.length) {
    out.push({
      key: 'before',
      icon: Clock,
      title: t('before_title'),
      note: t('before_note'),
      body: (
        <Items
          items={data.activities.map((r) => ({
            tag:
              r.sector === 'public' ? t('sector_public') : r.sector === 'private' ? t('sector_private') : r.sector_as_written,
            main: r.employer,
            meta: [r.description, r.period],
          }))}
        />
      ),
    });
  }
  if (data.gifts.length) {
    out.push({
      key: 'gifts',
      icon: Gift,
      title: t('gifts_title'),
      body: <Items items={data.gifts.map((r) => ({ main: r.description, meta: [r.benefactor] }))} />,
    });
  }
  if (data.contributions.length) {
    out.push({
      key: 'contributions',
      icon: HeartHandshake,
      title: t('contributions_title'),
      body: <Items items={data.contributions.map((r) => ({ main: r.recipient, meta: [r.description] }))} />,
    });
  }
  if (data.other) {
    out.push({
      key: 'other',
      icon: MessageSquareText,
      title: t('other_title'),
      body: <blockquote className="assets__quote">{data.other}</blockquote>,
    });
  }
  return out;
}
