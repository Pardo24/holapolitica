import type { InitiativeType } from '@/lib/api';

/**
 * The canonical path each parliamentary procedure follows, from the
 * Reglament del Congrés.
 *
 * Shared by the dark banner on a law's page ({@link LawJourney}) and by the
 * page that explains the procedures in full (/recorregut), so the two can
 * never drift: the banner is the map, that page is the legend, and clicking
 * the banner goes there.
 *
 * Labels and hints live in the ``law_journey`` namespace, keyed
 * ``label.<type>.<stepKey>`` and ``hint.<type>.<stepKey>``, so each
 * procedure carries its own wording in CA/ES/EN.
 */

export interface JourneyStep {
  key: string;
  /** Whether a ``hint.<type>.<key>`` translation exists for this step. */
  hint: boolean;
}

export const JOURNEY_STEPS: Record<InitiativeType, JourneyStep[]> = {
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

/** The procedures offered on /recorregut, in the order they are listed. */
export const JOURNEY_TYPES: InitiativeType[] = [
  'proyecto_ley',
  'proposicion_ley',
  'real_decreto_ley',
  'proposicion_no_ley',
  'mocion',
  'interpelacion',
];

export function isJourneyType(value: string | undefined): value is InitiativeType {
  return !!value && (JOURNEY_TYPES as string[]).includes(value);
}
