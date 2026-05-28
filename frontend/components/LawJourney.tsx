import { getTranslations } from 'next-intl/server';

import type { InitiativeType, InitiativeStatus, VoteResult } from '@/lib/api';

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

interface JourneyStep {
  key: string;
  /** Whether a ``hint.<type>.<key>`` translation exists for this step. */
  hint: boolean;
}

const STEPS: Record<InitiativeType, JourneyStep[]> = {
  proyecto_ley: [
    { key: 'presentation', hint: true },
    { key: 'bocg', hint: true },
    { key: 'committee', hint: true },
    { key: 'floor', hint: true },
    { key: 'senate', hint: true },
    { key: 'boe', hint: true },
  ],
  proposicion_ley: [
    { key: 'presentation', hint: true },
    { key: 'taking', hint: true },
    { key: 'committee', hint: true },
    { key: 'floor', hint: true },
    { key: 'senate', hint: true },
    { key: 'boe', hint: true },
  ],
  proposicion_no_ley: [
    { key: 'presentation', hint: true },
    { key: 'amendments', hint: true },
    { key: 'debate', hint: true },
    { key: 'vote', hint: true },
  ],
  mocion: [
    { key: 'interpellation', hint: true },
    { key: 'motion', hint: true },
    { key: 'debate', hint: true },
    { key: 'vote', hint: true },
  ],
  real_decreto_ley: [
    { key: 'rdl', hint: true },
    { key: 'debate', hint: true },
    { key: 'vote', hint: true },
  ],
  interpelacion: [
    { key: 'presentation', hint: true },
    { key: 'debate', hint: true },
  ],
  other: [
    { key: 'presentation', hint: false },
    { key: 'debate', hint: false },
    { key: 'vote', hint: false },
  ],
};

function deriveActiveIndex(
  type: InitiativeType,
  status: InitiativeStatus | null,
  hasBoe: boolean,
  voteResult: VoteResult | null,
): number {
  const steps = STEPS[type] ?? STEPS.other;
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
  const steps = STEPS[type] ?? STEPS.other;
  const activeIndex = deriveActiveIndex(type, status, hasBoe, voteResult);
  const accent =
    voteResult === 'approved' || status === 'approved'
      ? 'var(--aye)'
      : voteResult === 'rejected' || status === 'rejected'
        ? 'var(--no)'
        : 'var(--paper)';
  const typeLabel = t(`type.${type}`);
  const statusLabel = status ? t(`status.${status}`) : null;
  const doneCount = activeIndex + 1;

  return (
    <section
      aria-label={t('aria', { type: typeLabel })}
      className="law-journey"
      style={{
        background: 'var(--ink)',
        color: 'var(--paper)',
        padding: '16px 24px',
        // Contained, rounded banner that respects the page column — no
        // longer full-bleed to the viewport edges (Daniel: "que en la
        // web no arribi fins a les voreres").
        borderRadius: 14,
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
            }}
          >
            {typeLabel}
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'color-mix(in oklch, var(--paper) 60%, transparent)',
              marginTop: 4,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <span className="tabular">
              {t('steps_count', { done: doneCount, total: steps.length })}
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
      <style>{`
        @media (max-width: 720px) {
          .law-journey {
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
          }
          .law-journey-steps > li {
            scroll-snap-align: start;
          }
        }
      `}</style>
    </section>
  );
}
