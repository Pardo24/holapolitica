/**
 * "Decideix el teu vot": the four steps of the guide, each a page of its
 * own. ``?guia=1`` marks a page opened from the guide: it shows where the
 * reader is and leads to the next step, so nobody has to go back to the
 * list to carry on.
 */
export const GUIDE_STEPS = [
  { n: 1, path: '/com-et-representen' },
  { n: 2, path: '/comparar' },
  { n: 3, path: '/eleccions/programes' },
  { n: 4, path: '/eleccions/com-compta' },
] as const;

export type GuideStep = (typeof GUIDE_STEPS)[number]['n'];

export const GUIDE_HOME = '/eleccions/el-teu-vot';

/** A step's page as the guide opens it. */
export function guideHref(n: GuideStep): string {
  return `${GUIDE_STEPS[n - 1]!.path}?guia=1`;
}

/** Whether a page was opened from the guide. */
export function inGuide(param: string | string[] | undefined): boolean {
  return param === '1';
}
