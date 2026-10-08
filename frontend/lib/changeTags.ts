import { Building2, Leaf, Receipt, Scale, type LucideIcon } from 'lucide-react';

/**
 * "What the text changes": symmetric facts read from a bill's own text
 * (backend app/services/law_text.py).
 *
 * Always in pairs, and both sides of a pair look the same: same icon,
 * same neutral chip, no green for one and red for the other. Which side is
 * good is the reader's call, not ours; the tag only says what the text
 * does, and every tag carries the passage that justifies it.
 */
export const CHANGE_PAIRS: { key: 'tax' | 'rights' | 'env' | 'management'; Icon: LucideIcon; tags: [ChangeTag, ChangeTag] }[] = [
  { key: 'tax', Icon: Receipt, tags: ['tax_up', 'tax_down'] },
  { key: 'rights', Icon: Scale, tags: ['rights_expand', 'rights_restrict'] },
  { key: 'env', Icon: Leaf, tags: ['env_strengthen', 'env_relax'] },
  { key: 'management', Icon: Building2, tags: ['public_more', 'private_more'] },
];

export type ChangeTag =
  | 'tax_up'
  | 'tax_down'
  | 'rights_expand'
  | 'rights_restrict'
  | 'env_strengthen'
  | 'env_relax'
  | 'public_more'
  | 'private_more';

export const CHANGE_TAGS: ChangeTag[] = CHANGE_PAIRS.flatMap((p) => p.tags);

export function isChangeTag(v: string): v is ChangeTag {
  return (CHANGE_TAGS as string[]).includes(v);
}

/** The icon of the pair a tag belongs to. */
export function changeTagIcon(tag: ChangeTag): LucideIcon {
  return CHANGE_PAIRS.find((p) => p.tags.includes(tag))!.Icon;
}

/** The plain PDF address from a BOCG source_url ("…PDF#page=3"). */
export function pdfUrl(sourceUrl: string | null | undefined): string | null {
  if (!sourceUrl) return null;
  const url = sourceUrl.trim();
  return /\.pdf(#|$)/i.test(url) ? url : null;
}
