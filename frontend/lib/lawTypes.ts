import type { InitiativeType } from '@/lib/api';

/**
 * Whether each procedural initiative type CREATES LAW.
 *
 *   true  → binding: becomes (or provisionally is) law if passed
 *   false → non-binding: a position / question / motion; never law
 *   null  → unknown family ("other")
 *
 * This is the single distinction most readers miss, so it's shared
 * between the LawTypeChip (icon + tooltip) and the LawJourney banner
 * (description line) to keep the signal consistent everywhere.
 */
export const LAW_TYPE_BINDING: Record<InitiativeType, boolean | null> = {
  proyecto_ley: true,
  proposicion_ley: true,
  real_decreto_ley: true,
  proposicion_no_ley: false,
  mocion: false,
  interpelacion: false,
  other: null,
};
