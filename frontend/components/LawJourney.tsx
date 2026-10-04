import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';

import type { InitiativeType, InitiativeStatus, VoteResult } from '@/lib/api';
import { JOURNEY_STEPS } from '@/lib/lawJourney';
import { LAW_TYPE_BINDING } from '@/lib/lawTypes';

/**
 * Dark trajectory banner that sits at the top of a law-detail page.
 * Each parliamentary procedure (Proyecto de Ley, Proposición, PNL,
 * Moció, RDL, etc.) has its own canonical sequence — pulled from the
 * Reglament del Congrés — and the banner highlights the step the
 * initiative is currently at, based on its ``status``.
 *
 * All labels are localised via the ``law_journey`` namespace. Step
 * labels/hints are keyed by ``label.<type>.<stepKey>`` /
 * ``hint.<type>.<stepKey>`` so each procedure can carry its own
 * procedural wording in CA/ES/EN.
 *
 * Neutrality (CLAUDE.md "mirall, no megàfon"): step labels are
 * procedural language from the Reglament; nothing editorial. The dot
 * colour shifts to green/red only on the terminal step when the
 * initiative was Approved/Rejected.
 */

function deriveActiveIndex(
  type: InitiativeType,
  status: InitiativeStatus | null,
  hasBoe: boolean,
  voteResult: VoteResult | null,
): number {
  const steps = JOURNEY_STEPS[type] ?? JOURNEY_STEPS.other;
  const last = steps.length - 1;

  if (type === 'proyecto_ley' || type === 'proposicion_ley') {
    if (status === 'approved' && hasBoe) return last;
    if (status === 'approved') return Math.max(last - 1, 0);
    if (status === 'rejected') {
      const idx = steps.findIndex((s) => s.key === 'floor');
      return idx >= 0 ? idx : Math.max(last - 1, 0);
    }
    if (status === 'in_debate') {
      const idx = steps.findIndex((s) => s.key === 'committee');
      return idx >= 0 ? idx : 1;
    }
    return 0;
  }

  if (
    type === 'proposicion_no_ley' ||
    type === 'mocion' ||
    type === 'real_decreto_ley' ||
    type === 'interpelacion'
  ) {
    if (status === 'approved' || status === 'rejected' || voteResult) return last;
    if (status === 'in_debate') return Math.max(0, last - 1);
    return 0;
  }

  return 0;
}

export async function LawJourney({
  type,
  status,
  hasBoe = false,
  voteResult = null,
}: {
  type: InitiativeType;
  status: InitiativeStatus | null;
  /** True when the initiative has a populated ``boe_url`` — only
   *  meaningful for the legislative series; ignored otherwise. */
  hasBoe?: boolean;
  /** Optional outcome when this journey is being rendered on a
   *  vote-detail page — sharpens the colour of the terminal step. */
  voteResult?: VoteResult | null;
}) {
  const t = await getTranslations('law_journey');
  const tType = await getTranslations('law_type');
  const steps = JOURNEY_STEPS[type] ?? JOURNEY_STEPS.other;
  const binding = LAW_TYPE_BINDING[type];
  const bindingTag =
    binding === true
      ? tType('binding')
      : binding === false
        ? tType('non_binding')
        : null;
  const typeDesc = tType(`desc.${type}`);
  // For single-vote procedures (PNL, moció, RDL) the floor vote IS the
  // outcome, but the initiative's own status often lags behind the vote
  // feed and still says "submitted". Showing "Presentada" next to an
  // approved vote contradicts the page, so the vote result wins there.
  // Legislative series are left alone: one vote on a bill (e.g. the
  // toma en consideración) is not its final outcome.
  const singleVote =
    type === 'proposicion_no_ley' || type === 'mocion' || type === 'real_decreto_ley';
  const effectiveStatus: InitiativeStatus | null =
    singleVote && (voteResult === 'approved' || voteResult === 'rejected') &&
    status !== 'approved' && status !== 'rejected'
      ? voteResult
      : status;
  const activeIndex = deriveActiveIndex(type, effectiveStatus, hasBoe, voteResult);
  const accent =
    voteResult === 'approved' || effectiveStatus === 'approved'
      ? 'var(--aye)'
      : voteResult === 'rejected' || effectiveStatus === 'rejected'
        ? 'var(--no)'
        : 'var(--paper)';
  const typeLabel = t(`type.${type}`);
  const statusLabel = effectiveStatus ? t(`status.${effectiveStatus}`) : null;
  const doneCount = activeIndex + 1;

  return (
    <Link
      href={`/recorregut?type=${type}` as Route}
      aria-label={t('aria', { type: typeLabel })}
      className="law-journey"
      style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}
    >
    <section
      aria-hidden="true"
      className="law-journey-body"
      style={{
        background: 'var(--ink)',
        color: 'var(--paper)',
        padding: '16px 24px',
        // Square corners (no rounding). Contained within the page column
        // on desktop; on mobile it goes full-bleed edge-to-edge (see the
        // .law-journey rule in globals.css).
        marginTop: 8,
        marginBottom: 18,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '200px 1fr',
          gap: 24,
          alignItems: 'center',
        }}
        className="law-journey-inner"
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'color-mix(in oklch, var(--paper) 60%, transparent)',
              marginBottom: 4,
            }}
          >
            {t('eyebrow')}
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--paper)',
              letterSpacing: '-0.005em',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            {typeLabel}
            {bindingTag && (
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  padding: '2px 7px',
                  borderRadius: 999,
                  color: 'var(--paper)',
                  background: `color-mix(in oklch, ${binding ? 'var(--aye)' : 'var(--abst)'} 45%, transparent)`,
                  whiteSpace: 'nowrap',
                }}
              >
                {bindingTag}
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'color-mix(in oklch, var(--paper) 60%, transparent)',
              marginTop: 6,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <span className="tabular">
              {t('steps_count', { done: doneCount, total: steps.length })}
            </span>
            {/* The banner is a link; say so. The page it opens explains this
                procedure step by step and lets you read the others. */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--paper)',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
                textDecorationColor: 'color-mix(in oklch, var(--paper) 45%, transparent)',
              }}
            >
              {t('explain_cta')}
              <ArrowRight size={12} strokeWidth={2} aria-hidden="true" />
            </span>
            {statusLabel && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: 'var(--paper)',
                  background: `color-mix(in oklch, ${accent} 55%, transparent)`,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: accent,
                  }}
                />
                {statusLabel}
              </span>
            )}
          </div>
        </div>
        <ol
          className="law-journey-steps"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'grid',
            gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
            gap: 0,
          }}
        >
          {steps.map((step, i) => {
            const isActive = i === activeIndex;
            const isPast = i < activeIndex;
            const dotBg = isActive
              ? accent
              : isPast
                ? 'var(--paper)'
                : 'transparent';
            const dotBorder = isPast || isActive
              ? accent
              : 'color-mix(in oklch, var(--paper) 35%, transparent)';
            const label = t(`label.${type}.${step.key}`);
            const hint = step.hint ? t(`hint.${type}.${step.key}`) : null;
            return (
              <li
                key={step.key}
                aria-current={isActive ? 'step' : undefined}
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  paddingRight: 14,
                  minWidth: 0,
                }}
              >
                {i < steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      top: 6,
                      left: 14,
                      right: -2,
                      height: 1,
                      background:
                        i < activeIndex
                          ? 'color-mix(in oklch, var(--paper) 80%, transparent)'
                          : 'color-mix(in oklch, var(--paper) 22%, transparent)',
                    }}
                  />
                )}
                <span
                  aria-hidden="true"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 999,
                    background: dotBg,
                    border: `1.5px solid ${dotBorder}`,
                    boxShadow: isActive
                      ? `0 0 0 4px color-mix(in oklch, ${accent} 22%, transparent)`
                      : 'none',
                    position: 'relative',
                    zIndex: 1,
                    flex: 'none',
                  }}
                />
                <div
                  style={{
                    fontSize: 11.5,
                    fontWeight: isActive ? 700 : 600,
                    color:
                      isActive || isPast
                        ? 'var(--paper)'
                        : 'color-mix(in oklch, var(--paper) 55%, transparent)',
                    marginTop: 8,
                    lineHeight: 1.25,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    width: '100%',
                  }}
                >
                  {label}
                </div>
                {hint && (
                  <div
                    style={{
                      fontSize: 10,
                      color: 'color-mix(in oklch, var(--paper) 50%, transparent)',
                      marginTop: 2,
                      lineHeight: 1.3,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      width: '100%',
                    }}
                  >
                    {hint}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      {/* Full-width plain one-liner explaining what this procedure is —
          the piece that fixes "I thought everything was laws". */}
      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: '1px solid color-mix(in oklch, var(--paper) 16%, transparent)',
          fontSize: 12,
          lineHeight: 1.45,
          color: 'color-mix(in oklch, var(--paper) 72%, transparent)',
          maxWidth: 860,
        }}
      >
        {typeDesc}
      </div>
      <style>{`
        @media (max-width: 720px) {
          /* Full-bleed edge-to-edge on mobile — escape the page's horizontal
             padding so the dark strip touches both sides. */
          .law-journey {
            margin-left: calc(50% - 50vw) !important;
            margin-right: calc(50% - 50vw) !important;
          }
          /* The tighter inner padding belongs to the dark band, not to the
             transparent link around it. Setting it on .law-journey pushed the
             band 16px back in from each edge (so it was never full-bleed) and
             added that to the band's own 24px, leaving the steps starting 40px
             into a 375px screen. */
          .law-journey-body {
            padding: 14px 16px !important;
          }
          .law-journey-inner {
            grid-template-columns: 1fr !important;
            gap: 14px !important;
          }
          .law-journey-steps {
            overflow-x: auto;
            grid-template-columns: repeat(${steps.length}, minmax(120px, 1fr)) !important;
            scroll-snap-type: x proximity;
            /* This box is only as tall as one dot plus two short lines, and a
               horizontal scrollbar is drawn inside it — straight across the
               step sub-labels, which also lost their last fraction of a pixel
               to the scroll container's rounding. Give the bar its own lane. */
            padding-bottom: 12px;
            scrollbar-width: thin;
          }
          .law-journey-steps > li {
            scroll-snap-align: start;
          }
        }
      `}</style>
    </section>
    </Link>
  );
}
