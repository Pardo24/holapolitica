import {
  Accessibility,
  Armchair,
  Baby,
  Backpack,
  Briefcase,
  Building2,
  Car,
  Globe2,
  GraduationCap,
  HeartHandshake,
  House,
  KeyRound,
  Landmark,
  Laptop,
  Rainbow,
  SearchCheck,
  ShoppingCart,
  Tractor,
  UserRound,
  type LucideIcon,
} from 'lucide-react';

/**
 * The everyday situations of "I a tu, què t'afecta?", in display order.
 * Mirrors ``PROFILES`` in backend/app/services/law_profiles.py; kept in
 * sync by hand.
 */
export const PROFILES = [
  { key: 'jove', Icon: Backpack },
  { key: 'estudiant', Icon: GraduationCap },
  { key: 'assalariat', Icon: Briefcase },
  { key: 'autonom', Icon: Laptop },
  { key: 'empresa', Icon: Building2 },
  { key: 'funcionari', Icon: Landmark },
  { key: 'aturat', Icon: SearchCheck },
  { key: 'pensionista', Icon: Armchair },
  { key: 'llogater', Icon: KeyRound },
  { key: 'propietari', Icon: House },
  { key: 'families', Icon: Baby },
  { key: 'discapacitat', Icon: Accessibility },
  { key: 'cuidador', Icon: HeartHandshake },
  { key: 'migrant', Icon: Globe2 },
  { key: 'dona', Icon: UserRound },
  { key: 'lgtbi', Icon: Rainbow },
  { key: 'consumidor', Icon: ShoppingCart },
  { key: 'conductor', Icon: Car },
  { key: 'rural', Icon: Tractor },
] as const satisfies readonly { key: string; Icon: LucideIcon }[];

export type ProfileKey = (typeof PROFILES)[number]['key'];

export function isProfileKey(value: string): value is ProfileKey {
  return PROFILES.some((p) => p.key === value);
}

export function profileIcon(key: ProfileKey): LucideIcon {
  return PROFILES.find((p) => p.key === key)?.Icon ?? UserRound;
}
