import type { VoteStageKey } from '@/lib/api';

/**
 * Reading a vote's stage (backend app/services/vote_stage.py) on the page.
 *
 * A law is voted several times on the day it passes: each group's
 * amendments, then the committee's text, then (organic laws) the whole
 * text again. Shown as a flat list, those read as one question answered
 * "no" six times and "yes" twice. These helpers say which is which.
 */

/** Votes on a change TO the law: their result is not the law's. */
export const AMENDMENT_STAGES: ReadonlySet<VoteStageKey> = new Set<VoteStageKey>([
  'amendment',
  'senate_amendment',
  'totality',
]);

export function isAmendmentStage(stage: VoteStageKey | null | undefined): boolean {
  return stage != null && AMENDMENT_STAGES.has(stage);
}

/** Votes that decide the law itself. */
export function isFinalStage(stage: VoteStageKey | null | undefined): boolean {
  return stage === 'final' || stage === 'whole';
}

/**
 * The XML's ``<TextoSubGrupo>`` line ("Enmienda 26.", "Punto 3.", "Resto de
 * las enmiendas.") in the reader's language. The common shapes are
 * translated; anything else is the official Spanish, verbatim, which is
 * better than a guess.
 */
export function localizeSubgroupText(text: string | null | undefined, locale: string): string | null {
  const raw = (text ?? '').trim().replace(/\.$/, '');
  if (!raw) return null;
  if (locale === 'es') return raw;
  const ca = locale === 'ca';
  let m: RegExpMatchArray | null;
  if ((m = raw.match(/^Enmienda transaccional(?: en Comisión)? n[º°o]\s*(\S+)$/i))) {
    return ca ? `Esmena transaccional ${m[1]}` : `Compromise amendment ${m[1]}`;
  }
  if ((m = raw.match(/^Enmiendas? (?:núms?\.|n[º°o]s?\.?)?\s*([\d ,y]+)$/i))) {
    const nums = m[1]!.trim().replace(/\s+y\s+/g, ca ? ' i ' : ' and ');
    const plural = /[ ,]/.test(nums);
    return ca ? `${plural ? 'Esmenes' : 'Esmena'} ${nums}` : `${plural ? 'Amendments' : 'Amendment'} ${nums}`;
  }
  if (/^Resto de (las )?enmiendas$/i.test(raw)) return ca ? "La resta d'esmenes" : 'The other amendments';
  if (/^Votación en bloque de las enmiendas$/i.test(raw)) {
    return ca ? 'Totes les esmenes, en bloc' : 'All the amendments, together';
  }
  if ((m = raw.match(/^Punto (\S+)$/i))) return ca ? `Punt ${m[1]}` : `Point ${m[1]}`;
  // Motions voted in blocks: "Segundo bloque", "Punto 3 del primer bloque",
  // "Puntos 1, 2 y 4 del primer bloque".
  const BLOCK: Record<string, [string, string]> = {
    primer: ['Primer bloc', 'First block'],
    segundo: ['Segon bloc', 'Second block'],
    tercer: ['Tercer bloc', 'Third block'],
    cuarto: ['Quart bloc', 'Fourth block'],
  };
  if ((m = raw.match(/^(primer|segundo|tercer|cuarto) bloque$/i))) {
    const b = BLOCK[m[1]!.toLowerCase()]!;
    return ca ? b[0] : b[1];
  }
  if ((m = raw.match(/^Puntos? ([\d ,y]+?) del (primer|segundo|tercer|cuarto) bloque$/i))) {
    const nums = m[1]!.trim().replace(/\s+y\s+/g, ca ? ' i ' : ' and ');
    const plural = /[ ,]/.test(nums);
    const b = BLOCK[m[2]!.toLowerCase()]!;
    return ca
      ? `${plural ? 'Punts' : 'Punt'} ${nums} del ${b[0].toLowerCase()}`
      : `${plural ? 'Points' : 'Point'} ${nums} of the ${b[1].toLowerCase()}`;
  }
  if (/^Voto particular/i.test(raw)) return ca ? 'Vot particular' : 'Dissenting proposal';
  return raw;
}
