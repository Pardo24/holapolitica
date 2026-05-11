import { getTranslations } from 'next-intl/server';
import {
  Mail,
  Check,
  Scale,
  Hammer,
  Star,
  Flag,
  RotateCcw,
  FileText,
  type LucideIcon,
} from 'lucide-react';

/**
 * Educational static infographic that describes the typical lifecycle of a
 * legislative initiative in the Spanish Congreso de los Diputados.
 *
 * Strictly factual: descriptive labels per step, no editorial commentary,
 * no "interpretation" of how the process plays out politically. The shape
 * of the diagram (numbered cards + connecting line) is purely visual —
 * the actual sequence comes from the parliamentary regulation.
 *
 * Visual hierarchy:
 *   - Mobile (≤640px): vertical stack of full-width cards; a thin vertical
 *     line connects each card's left edge so the user reads top-to-bottom
 *     as a journey.
 *   - Desktop (>640px): same vertical stack but indented and slightly
 *     wider so the numbers and titles align as a documentary timeline.
 *     We keep it vertical for both viewports so the diagram is consistent
 *     and the labels are never cramped.
 *
 * Every step exposes the same three-part skeleton (number · icon · text)
 * so the page reads at a glance. Icons come from lucide-react so they
 * render consistently across platforms and fonts.
 */

interface LifecycleStep {
  id: string;
  Icon: LucideIcon;
}

const STEPS: LifecycleStep[] = [
  { id: 'presentation', Icon: Mail }, // envelope
  { id: 'qualification', Icon: Check }, // check
  { id: 'totality_debate', Icon: Scale }, // scales of justice
  { id: 'committee', Icon: Hammer }, // hammer
  { id: 'plenary_final', Icon: Star }, // star
  { id: 'senate', Icon: Flag }, // flag
  { id: 'return', Icon: RotateCcw }, // back-arrow
  { id: 'publication', Icon: FileText }, // publication
];

export async function LifecycleDiagram() {
  const t = await getTranslations('lifecycle');
  return (
    <section style={{ marginTop: 40 }}>
      <div className="eyebrow">{t('eyebrow')}</div>
      <h2
        className="h-title"
        style={{ marginTop: 4, marginBottom: 8 }}
      >
        {t('title')}
      </h2>
      <p
        style={{
          fontSize: 14,
          color: 'var(--ink-2)',
          lineHeight: 1.55,
          margin: '0 0 20px',
          maxWidth: 720,
        }}
      >
        {t('intro')}
      </p>

      <ol
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          position: 'relative',
          // Reserve a left gutter for the connecting line + number badge.
          paddingLeft: 0,
        }}
        aria-label={t('title')}
      >
        {STEPS.map((step, i) => (
          <LifecycleStepRow
            key={step.id}
            step={step}
            index={i}
            isLast={i === STEPS.length - 1}
            title={t(`steps.${step.id}.title`)}
            body={t(`steps.${step.id}.body`)}
          />
        ))}
      </ol>

      <p
        style={{
          fontSize: 12,
          color: 'var(--ink-3)',
          marginTop: 16,
          fontStyle: 'italic',
          maxWidth: 720,
          lineHeight: 1.5,
        }}
      >
        {t('caveat')}
      </p>
    </section>
  );
}

function LifecycleStepRow({
  step,
  index,
  isLast,
  title,
  body,
}: {
  step: LifecycleStep;
  index: number;
  isLast: boolean;
  title: string;
  body: string;
}) {
  return (
    <li
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '44px minmax(0, 1fr)',
        gap: 14,
        paddingBottom: isLast ? 0 : 18,
        alignItems: 'flex-start',
      }}
    >
      {/* Connecting vertical line that visually links one step to the
          next. Hidden for the last step. Drawn underneath the number
          badge so the badge sits "on" the line. */}
      {!isLast && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 21,
            top: 36,
            bottom: 0,
            width: 1,
            background: 'var(--rule-strong)',
          }}
        />
      )}

      {/* Number + icon badge. Number is the primary identifier, icon a
          small visual cue. */}
      <div
        aria-hidden="true"
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          border: '1.5px solid var(--ink)',
          background: 'var(--paper)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 'none',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <span
          className="tabular"
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--ink)',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {index + 1}
        </span>
        <span
          style={{
            color: 'var(--accent)',
            lineHeight: 1,
            marginTop: 2,
            display: 'inline-flex',
          }}
        >
          <step.Icon size={12} aria-hidden="true" />
        </span>
      </div>

      <div
        style={{
          padding: '6px 14px 14px 0',
          minWidth: 0,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--ink)',
            lineHeight: 1.3,
          }}
        >
          {title}
        </h3>
        <p
          style={{
            margin: '4px 0 0',
            fontSize: 13,
            color: 'var(--ink-2)',
            lineHeight: 1.55,
            wordBreak: 'break-word',
          }}
        >
          {body}
        </p>
      </div>
    </li>
  );
}
