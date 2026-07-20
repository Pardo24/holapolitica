import type { Route } from 'next';
import { permanentRedirect } from 'next/navigation';

/**
 * The parliamentary-groups directory used to live here as its own page.
 * It now sits inside the deputies hub, alongside the chamber map, because
 * splitting "who the parties are" from "who sits in the chamber" made a
 * mobile visitor pay a navigation step to cross between two halves of the
 * same question.
 *
 * This route stays as a permanent redirect rather than a deletion: it was
 * linked from the nav, the home page and the hemicycle legend for months,
 * and external links (and search engines) still point at it.
 *
 * Only the INDEX moves. ``/groups/[slug]`` — the individual party profiles,
 * which are the actual destination — is untouched.
 */
export default function GroupsIndexRedirect(): never {
  permanentRedirect('/el-teu-diputat' as Route);
}
