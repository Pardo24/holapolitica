/**
 * Centralised plain-language definitions for parliamentary jargon. Keep
 * concise (<200 chars) — they appear in tooltips, not paragraphs. The
 * full glossary on /about gets the longer explanations.
 */

export interface GlossaryEntry {
  /** What shows on hover. */
  short: string;
  /** Initiative type code or stat-key from the backend. */
  key: string;
}

const ENTRIES: Record<string, GlossaryEntry> = {
  proyecto_ley: {
    key: 'proyecto_ley',
    short:
      'Llei proposada pel Govern. Si s\'aprova, esdevé llei vigent.',
  },
  proposicion_ley: {
    key: 'proposicion_ley',
    short:
      'Llei proposada per un grup parlamentari (no pel Govern). Si s\'aprova, esdevé llei vigent.',
  },
  proposicion_no_ley: {
    key: 'proposicion_no_ley',
    short:
      'Proposta NO vinculant. Demana al Govern fer alguna cosa, però no canvia la llei. Són les votacions més freqüents al ple.',
  },
  real_decreto_ley: {
    key: 'real_decreto_ley',
    short:
      'Norma amb força de llei dictada pel Govern per urgència. El Congrés ha de convalidar-la o derogar-la en 30 dies.',
  },
  mocion: {
    key: 'mocion',
    short:
      'Després d\'una pregunta urgent al Govern (interpel·lació), un grup pot presentar una moció demanant una posició concreta.',
  },
  interpelacion: {
    key: 'interpelacion',
    short:
      'Pregunta urgent feta pel Congrés al Govern sobre una qüestió política concreta.',
  },
  reforma_estatuto: {
    key: 'reforma_estatuto',
    short:
      'Modificació d\'un Estatut d\'autonomia. Tramitació especial.',
  },
  cohesion: {
    key: 'cohesion',
    short:
      '% de membres del grup que voten igual. Cohesió 100% = disciplina total; números més baixos = més votacions creuades.',
  },
  attendance: {
    key: 'attendance',
    short:
      '% de vots Sí/No/Abstenció emesos respecte el total convocat. No comptem absents per malaltia o permís.',
  },
  approval_rate: {
    key: 'approval_rate',
    short:
      '% d\'iniciatives aprovades sobre les que han arribat a votació final (aprovades + rebutjades). Les que estan en tràmit no compten.',
  },
  data_source: {
    key: 'data_source',
    short:
      'Dades del portal d\'Open Data del Congrés (congreso.es). Actualitzem cada 4 hores. La classificació temàtica és automàtica via LLM.',
  },
};

/** Look up the short tooltip text by key. Returns the key itself if missing. */
export function glossaryShort(key: string): string {
  return ENTRIES[key]?.short ?? '';
}

const TYPE_LABELS_CA: Record<string, string> = {
  proyecto_ley: 'Projecte de Llei',
  proposicion_ley: 'Proposició de Llei',
  proposicion_no_ley: 'Proposició no de Llei',
  real_decreto_ley: 'Reial Decret-llei',
  reforma_estatuto: 'Reforma d\'Estatut',
  mocion: 'Moció',
  interpelacion: 'Interpel·lació',
  other: 'Altra',
};

export function typeLabelCa(type: string): string {
  return TYPE_LABELS_CA[type] ?? type;
}

/**
 * Pick the LLM-generated plain-language summary for the user's locale,
 * falling back through the available languages so we never show a blank
 * tooltip when one of the two has been generated.
 */
export function pickPlainSummary(
  obj: { plain_summary_ca?: string | null; plain_summary_es?: string | null },
  locale: string,
): string | null {
  if (locale === 'es') return obj.plain_summary_es ?? obj.plain_summary_ca ?? null;
  if (locale === 'en') return obj.plain_summary_es ?? obj.plain_summary_ca ?? null;
  return obj.plain_summary_ca ?? obj.plain_summary_es ?? null;
}
