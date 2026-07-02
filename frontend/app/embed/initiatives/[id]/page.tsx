import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { api } from '@/lib/api';
import { pickPlainSummary } from '@/lib/glossary';
import { pickTopicName } from '@/lib/topics';

/**
 * Embed widget for one initiative — the "dossier" view (#6 from
 * the comparative scan, Civio/ProPublica inspired).
 *
 * Usage:
 *   <iframe src="https://www.holapolitica.org/embed/initiatives/123"
 *           width="100%" height="460" frameborder="0"
 *           loading="lazy"></iframe>
 *
 * Combines into a single iframe everything a newsroom typically
 * wants next to an article about a single law: the title, the
 * plain-language summary, topic chips, the final vote breakdown
 * (when published), and the BOE link with entry-into-force when
 * available. No cohesion strip — that's the vote embed's job, and
 * an initiative may have multiple votes (committee, plenary, etc.)
 * which would make cohesion ambiguous here.
 *
 * Embed contract (CLAUDE.md "Embed widgets — guidelines"):
 *   - sub-1s render, inline styles, no JS / third-party assets
 *   - factual only (zero editorial framing)
 *   - attribution + link back to the canonical page
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const STATUS_COLOR: Record<string, string> = {
  approved: 'var(--aye)',
  rejected: 'var(--no)',
  in_debate: 'var(--accent, oklch(0.55 0.10 220))',
  submitted: 'var(--accent, oklch(0.55 0.10 220))',
  withdrawn: 'var(--ink-3)',
  expired: 'var(--ink-3)',
};

export default async function EmbedInitiativePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const initiativeId = Number(id);
  const t = await getTranslations('embed_initiative');
  const tInit = await getTranslations('initiative_detail');
  const locale = await getLocale();

  if (!Number.isFinite(initiativeId)) {
    return (
      <div
        style={{
          padding: 20,
          fontSize: 13,
          color: 'var(--ink-3)',
          textAlign: 'center',
          border: '1px solid var(--rule)',
          background: 'var(--paper)',
        }}
      >
        {t('not_found')}
      </div>
    );
  }

  let initiative;
  try {
    initiative = await api.initiatives.get(initiativeId);
  } catch {
    return (
      <div
        style={{
          padding: 20,
          fontSize: 13,
          color: 'var(--ink-3)',
          textAlign: 'center',
          border: '1px solid var(--rule)',
          background: 'var(--paper)',
        }}
      >
        {t('not_found')}
      </div>
    );
  }

  const title =
    (locale === 'es' && initiative.title_es) ||
    (locale === 'en' && initiative.title_en) ||
    initiative.title_ca ||
    initiative.title_original;
  // Plain summary in the user's language; pickPlainSummary follows
  // the same CA -> ES cascade as the main site.
  const summary = pickPlainSummary(initiative, locale);
  // Pick the most recent vote (votes are bundled on the initiative
  // detail response in chronological order; .at(-1) is the final
  // vote, which is the one a journalist usually wants).
  const finalVote = (initiative.votes ?? []).at(-1) ?? null;
  const totalCast = finalVote
    ? finalVote.ayes + finalVote.noes + finalVote.abstentions + finalVote.absent
    : 0;
  const statusColor = STATUS_COLOR[initiative.status] ?? 'var(--ink)';

  return (
    <article className="embed-card" lang={locale}>
      <header
        style={{
          paddingBottom: 12,
          marginBottom: 12,
          borderBottom: `1px solid ${statusColor}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <p
            className="eyebrow"
            style={{
              margin: 0,
              fontSize: 10,
              color: 'var(--ink-3)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            <span className="mono">{initiative.official_id}</span> ·{' '}
            <StatusLabel status={initiative.status} t={t} />
          </p>
          {initiative.submitted_at && (
            <p
              className="tabular"
              style={{
                margin: 0,
                fontSize: 10,
                color: 'var(--ink-3)',
              }}
            >
              {new Date(initiative.submitted_at).toLocaleDateString(locale, {
                dateStyle: 'medium',
              })}
            </p>
          )}
        </div>
        {/* AI plain-language summary leads as the headline; the
            official title drops to a small muted line beneath it.
            Initiatives without a summary keep the title as headline. */}
        {summary ? (
          <>
            <h1
              className="serif"
              style={{
                margin: '6px 0 0',
                fontSize: 16,
                lineHeight: 1.4,
                fontWeight: 600,
                color: 'var(--ink)',
                letterSpacing: '-0.005em',
                display: '-webkit-box',
                WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {summary}
            </h1>
            <p
              style={{
                margin: '5px 0 0',
                fontSize: 10.5,
                lineHeight: 1.4,
                color: 'var(--ink-3)',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {title}
            </p>
          </>
        ) : (
          <h1
            className="serif"
            style={{
              margin: '6px 0 0',
              fontSize: 16,
              lineHeight: 1.35,
              fontWeight: 600,
              color: 'var(--ink)',
              letterSpacing: '-0.005em',
              display: '-webkit-box',
              WebkitLineClamp: 4,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {title}
          </h1>
        )}
      </header>

      {initiative.topics && initiative.topics.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 5,
            marginBottom: 12,
          }}
        >
          {initiative.topics.slice(0, 3).map((topic) => (
            <span
              key={topic.slug}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '1px 7px 2px',
                fontSize: 10.5,
                fontWeight: 600,
                color: 'var(--ink-2)',
                background: topic.color_hex
                  ? `color-mix(in oklch, ${topic.color_hex} 14%, var(--paper))`
                  : 'var(--paper-2)',
                border: `1px solid ${
                  topic.color_hex
                    ? `color-mix(in oklch, ${topic.color_hex} 32%, var(--paper))`
                    : 'var(--rule)'
                }`,
                letterSpacing: '0.01em',
                whiteSpace: 'nowrap',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: topic.color_hex ?? 'var(--ink-3)',
                  flex: 'none',
                }}
              />
              {pickTopicName(topic, locale)}
            </span>
          ))}
        </div>
      )}

      {finalVote && totalCast > 0 && (
        <section style={{ marginBottom: 12 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 8,
              marginBottom: 6,
            }}
          >
            <span
              className="eyebrow"
              style={{
                fontSize: 10,
                color: 'var(--ink-3)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              {t('final_vote_eyebrow')}
            </span>
            <span
              className="tabular"
              style={{ fontSize: 11, color: 'var(--ink-3)' }}
            >
              {new Date(finalVote.voted_at).toLocaleDateString(locale, {
                dateStyle: 'medium',
              })}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              height: 6,
              overflow: 'hidden',
              background: 'var(--rule)',
              marginBottom: 6,
            }}
          >
            {finalVote.ayes > 0 && (
              <span
                style={{
                  width: `${(finalVote.ayes / totalCast) * 100}%`,
                  background: 'var(--aye)',
                }}
              />
            )}
            {finalVote.noes > 0 && (
              <span
                style={{
                  width: `${(finalVote.noes / totalCast) * 100}%`,
                  background: 'var(--no)',
                }}
              />
            )}
            {finalVote.abstentions > 0 && (
              <span
                style={{
                  width: `${(finalVote.abstentions / totalCast) * 100}%`,
                  background: 'var(--abst)',
                }}
              />
            )}
            {finalVote.absent > 0 && (
              <span
                style={{
                  width: `${(finalVote.absent / totalCast) * 100}%`,
                  background: 'var(--nv, #CBD5E1)',
                }}
              />
            )}
          </div>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 8,
              margin: 0,
            }}
          >
            <Stat
              label={t('label_aye')}
              value={finalVote.ayes}
              color="var(--aye)"
            />
            <Stat
              label={t('label_no')}
              value={finalVote.noes}
              color="var(--no)"
            />
            <Stat
              label={t('label_abst')}
              value={finalVote.abstentions}
              color="var(--abst)"
            />
            <Stat
              label={t('label_absent')}
              value={finalVote.absent}
              color="var(--ink-3)"
            />
          </dl>
        </section>
      )}

      {(initiative.boe_id ||
        initiative.boe_entry_in_force ||
        initiative.source_url) && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            padding: '10px 12px',
            background: 'var(--paper-2)',
            border: '1px solid var(--rule)',
            marginBottom: 12,
            fontSize: 11,
          }}
        >
          {initiative.source_url && (
            <a
              href={initiative.source_url}
              target="_top"
              rel="noopener noreferrer"
              style={{
                color: 'var(--ink)',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
                fontWeight: 600,
              }}
            >
              {tInit('source_pdf_cta')}
            </a>
          )}
          {initiative.boe_url && initiative.boe_id && (
            <span>
              <span
                className="eyebrow"
                style={{ fontSize: 9, color: 'var(--ink-3)', marginRight: 4 }}
              >
                {tInit('boe_cta')}
              </span>
              <a
                href={initiative.boe_url}
                target="_top"
                rel="noopener noreferrer"
                className="mono"
                style={{
                  color: 'var(--ink)',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                  fontWeight: 600,
                }}
              >
                {initiative.boe_id}
              </a>
            </span>
          )}
          {initiative.boe_entry_in_force && (
            <span>
              <span
                className="eyebrow"
                style={{ fontSize: 9, color: 'var(--ink-3)', marginRight: 4 }}
              >
                {tInit('entry_in_force')}
              </span>
              <span className="tabular" style={{ color: 'var(--ink)', fontWeight: 600 }}>
                {new Date(initiative.boe_entry_in_force).toLocaleDateString(
                  locale,
                  { dateStyle: 'medium' },
                )}
              </span>
            </span>
          )}
        </div>
      )}

      <footer
        style={{
          paddingTop: 8,
          borderTop: '1px solid var(--rule)',
          fontSize: 11,
          color: 'var(--ink-3)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <a
          href={`/initiatives/${initiative.id}`}
          target="_top"
          style={{
            color: 'var(--ink)',
            textDecoration: 'underline',
            textUnderlineOffset: 3,
            fontWeight: 600,
          }}
        >
          {t('see_detail')}
        </a>
        <span>
          {t('source_label')}{' '}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            target="_top"
            style={{ color: 'var(--ink)', textDecoration: 'none', fontWeight: 700 }}
          >
            Hola Política
          </a>
        </span>
      </footer>
    </article>
  );
}

/** Resolve a stable translation key for each InitiativeStatus value;
 * falls back to the raw status string if we ever add a status the
 * embed translations don't know about (rather than throwing at
 * render time, which would 500 the iframe). */
function StatusLabel({
  status,
  t,
}: {
  status: string;
  t: Awaited<ReturnType<typeof getTranslations<'embed_initiative'>>>;
}) {
  const known = new Set([
    'submitted',
    'in_debate',
    'approved',
    'rejected',
    'withdrawn',
    'expired',
  ]);
  if (known.has(status)) {
    return <>{t(`status_${status}` as 'status_approved')}</>;
  }
  return <>{status}</>;
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div>
      <dt
        style={{
          fontSize: 9,
          color: 'var(--ink-3)',
          margin: 0,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 600,
        }}
      >
        {label}
      </dt>
      <dd
        className="tabular"
        style={{
          fontSize: 18,
          fontWeight: 600,
          margin: 0,
          color,
          letterSpacing: '-0.01em',
          lineHeight: 1,
        }}
      >
        {value}
      </dd>
    </div>
  );
}
