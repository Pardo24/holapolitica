/**
 * Map topic.icon strings (set by the backend seed in
 * ``alembic/versions/0002_seed.py`` and ``0015_classification_knowledge_bases.py``)
 * to lucide-react icons.
 *
 * The backend's `topic.icon` field stores a short kebab-case identifier
 * such as ``"home"``, ``"heart-pulse"``, ``"briefcase"``. We keep the
 * registry on the frontend so designers can swap iconography without
 * a backend migration, and so the bundle only pulls icons we use.
 */

import {
  Archive,
  BookOpen,
  Briefcase,
  Building,
  Building2,
  ChartBar,
  CloudSun,
  Cpu,
  Droplet,
  Factory,
  Fish,
  GraduationCap,
  Globe,
  Globe2,
  Handshake,
  Heart,
  HeartPulse,
  Home,
  Landmark,
  Leaf,
  Music,
  Recycle,
  Scale,
  Shield,
  Sprout,
  Trees,
  Truck,
  Users,
  Wallet,
  Wheat,
  Zap,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  archive: Archive,
  book: BookOpen,
  briefcase: Briefcase,
  building: Building,
  'building-2': Building2,
  chart: ChartBar,
  'cloud-sun': CloudSun,
  cpu: Cpu,
  droplet: Droplet,
  factory: Factory,
  fish: Fish,
  globe: Globe,
  'globe-2': Globe2,
  'graduation-cap': GraduationCap,
  handshake: Handshake,
  heart: Heart,
  'heart-pulse': HeartPulse,
  home: Home,
  landmark: Landmark,
  leaf: Leaf,
  music: Music,
  recycle: Recycle,
  scale: Scale,
  shield: Shield,
  sprout: Sprout,
  trees: Trees,
  truck: Truck,
  users: Users,
  'venus-mars': Users,
  wallet: Wallet,
  wheat: Wheat,
  zap: Zap,
};

/** Resolve a topic.icon string to a lucide-react component, with a sane fallback. */
export function topicIcon(icon: string | null | undefined): LucideIcon {
  if (!icon) return Sprout;
  return ICONS[icon] ?? Sprout;
}
