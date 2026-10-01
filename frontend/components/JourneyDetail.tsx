import Link from 'next/link';
import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';
import { Check } from 'lucide-react';

import type { InitiativeType } from '@/lib/api';
import { JOURNEY_STEPS, JOURNEY_TYPES } from '@/lib/lawJourney';
import { LAW_TYPE_BINDING } from '@/lib/lawTypes';

/**
 * One procedure, step by step, with the others a click away.
 *
 * The dark banner on a law's page is a map: six dots and six words. It was
 * also a dead end — the place that explains what "Ponència i dictamen"
 * actually means existed, but nothing pointed at it from the law you were
 * reading. Now the banner links here with its own procedure selected, and
 * the chips above let you read the rest.
 *
 * Same source as the banner ({@link JOURNEY_STEPS}) and the same
 * translations, so the two can never say different things.
 */
export async function JourneyDetail({ type }: { type: InitiativeType }) {
  const t = await getTranslations('law_journey');
  const tLife = await getTranslations('lifecycle');
  const steps = JOURNEY_STEPS[type] ?? JOURNEY_STEPS.other;
  const binding = LAW_TYPE_BINDING[type];

  return (
    <section style={{ marginTop: 28 }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>
        {tLife('types_eyebrow')}
      </div>

      {/* Every procedure, the current one marked. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {JOURNEY_TYPES.map((candidate) => {
          const active = candidate === type;
          return (
            <Link
              key={candidate}
              href={`/recorregut?type=${candidate}` as Route}
              scroll={false}
              aria-current={active ? 'page' : undefined}
              style={{
                padding: '6px 13px',
                borderRadius: 999,
                border: `1px solid ${active ? 'var(--ink)' : 'var(--rule-strong)'}`,
                background: active ? 'var(--ink)' : 'var(--paper)',
                color: active ? 'var(--paper)' : 'var(--ink-2)',
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {t(`type.${candidate}` as 'type.proyecto_ley')}
            </Link>
          );
        })}
      </div>

      <h2 className="serif" style={{ margin: '0 0 4px', fontSize: 'clamp(20px, 2.6vw, 26px)' }}>
        {t(`type.${type}` as 'type.proyecto_ley')}
      </h2>
      <p style={{ margin: '0 0 20px', fontSize: 13.5, color: 'var(--ink-3)', maxWidth: 680 }}>
        {binding ? tLife('binding_yes') : tLife('binding_no')}
      </p>

      {/* The steps, read downwards: each one gets the room its explanation
          needs, which the six dots in the banner cannot give it. */}
      <ol
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
        {steps.map((step, i) => (
          <li
            key={step.key}
            style={{
              display: 'grid',
              gridTemplateColumns: '28px minmax(0, 1fr)',
              columnGap: 14,
              paddingBottom: i === steps.length - 1 ? 0 : 18,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span
                aria-hidden="true"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  border: '1px solid var(--rule-strong)',
                  background: 'var(--paper-2)',
                  color: 'var(--ink-2)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  flex: 'none',
                }}
                className="tabular"
              >
                {i + 1}
              </span>
              {i < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  style={{ flex: 1, width: 1, background: 'var(--rule-strong)', marginTop: 4 }}
                />
              )}
            </div>
            <div style={{ minWidth: 0, paddingTop: 2 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
                {t(`label.${type}.${step.key}` as 'label.proyecto_ley.presentation')}
              </div>
              {step.hint && (
                <p style={{ margin: '3px 0 0', fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                  {t(`hint.${type}.${step.key}` as 'hint.proyecto_ley.presentation')}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      <p
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          margin: '22px 0 0',
          padding: '10px 13px',
          borderRadius: 10,
          background: 'var(--paper-2)',
          border: '1px solid var(--rule)',
          fontSize: 12.5,
          color: 'var(--ink-2)',
          lineHeight: 1.55,
          maxWidth: 680,
        }}
      >
        <Check size={14} strokeWidth={2} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
        {tLife('caveat')}
      </p>
    </section>
  );
}
