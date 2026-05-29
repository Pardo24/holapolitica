import { FileText, MessageSquare, Scale } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Tooltip } from '@/components/Tooltip';
import type { InitiativeType } from '@/lib/api';
import { LAW_TYPE_BINDING } from '@/lib/lawTypes';

/**
 * Small chip that names a parliamentary initiative's procedural type and,
 * crucially, signals whether it CREATES LAW or not — the distinction most
 * readers miss ("I thought everything was laws"). The icon splits the two
 * families (⚖ creates law vs 💬 non-binding position/question); the label
 * is the full type name; the tooltip spells out "Crea llei / No crea llei"
 * plus a one-line plain explanation.
 *
 * Server component — resolves its own translations. Safe to drop into
 * list rows and detail headers. Wrapped in the CSS-only <Tooltip> so it
 * works with no client JS and nests safely inside link cards.
 */

function iconFor(type: InitiativeType) {
  const binding = LAW_TYPE_BINDING[type];
  if (binding === true) return Scale;
  if (binding === false) return MessageSquare;
  return FileText;
}

export async function LawTypeChip({
  type,
  size = 'sm',
}: {
  type: InitiativeType;
  size?: 'sm' | 'md';
}) {
  const tType = await getTranslations('law_journey');
  const tDesc = await getTranslations('law_type');

  const label = tType(`type.${type}`);
  const binding = LAW_TYPE_BINDING[type];
  const bindingTag =
    binding === true
      ? tDesc('binding')
      : binding === false
        ? tDesc('non_binding')
        : null;
  const desc = tDesc(`desc.${type}`);
  const explanation = bindingTag ? `${bindingTag}. ${desc}` : desc;

  const Icon = iconFor(type);
  const fontSize = size === 'md' ? 12 : 11;

  return (
    <Tooltip
      term={
        <span
          className="law-type-chip"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: size === 'md' ? '3px 10px' : '2px 8px',
            borderRadius: 999,
            fontSize,
            fontWeight: 600,
            color: 'var(--ink-2)',
            background: 'var(--paper-2)',
            border: '1px solid var(--rule-strong)',
            whiteSpace: 'nowrap',
            lineHeight: 1.3,
            verticalAlign: 'middle',
          }}
        >
          <Icon size={fontSize + 1} strokeWidth={1.9} aria-hidden="true" />
          {label}
        </span>
      }
      explanation={explanation}
    />
  );
}
