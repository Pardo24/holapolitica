/**
 * Centralised plain-language definitions for parliamentary jargon. Keep
 * concise (<200 chars) — they appear in tooltips, not paragraphs. The
 * full glossary on /about gets the longer explanations.
 *
 * Two kinds of entries live here:
 *
 * 1. Stat keys (``cohesion``, ``attendance``, ``approval_rate``,
 *    ``data_source``) and initiative-type codes (``proyecto_ley``…) used
 *    by the existing CSS-only ``<Tooltip>`` component via
 *    ``glossaryShort(key)``.
 *
 * 2. Parliamentary terms keyed by their *human label* (e.g. ``"Cohesió
 *    de grup"``), used by the ``<GlossaryTerm>`` component. These appear
 *    verbatim in section headers and KPI labels around the app; keep the
 *    keys identical to the visible text so authors can apply the
 *    component without an indirection.
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

/**
 * Definitions of parliamentary terms, keyed by their Catalan label as it
 * appears in the UI. Used by the ``<GlossaryTerm term="…">`` component.
 *
 * Keep these in sync with ``messages/ca.json`` → ``glossary``. The map
 * here is the source of truth for Server Components that don't have the
 * intl context bootstrapped (everything in /stats, /persons, /groups,
 * /votes is a Server Component today). The JSON copy is kept around so
 * future locale switches can replace it without code changes.
 */
const TERM_DEFINITIONS_CA: Record<string, string> = {
  'Proposició de Llei':
    'Iniciativa legislativa que presenten grups parlamentaris del Congrés.',
  'Projecte de Llei':
    'Iniciativa legislativa que presenta el Govern.',
  'Proposició no de Llei (PNL)':
    'Acord polític sense valor normatiu — el Congrés es posiciona davant del Govern o d\'altres institucions.',
  'Cohesió de grup':
    'Percentatge de membres del grup que voten igual en una votació.',
  'Dissidència':
    'Vot d\'un diputat que difereix de la línia majoritària del seu grup.',
  'Coincidència':
    'Percentatge de votacions en què dos grups (o dos diputats) han votat igual.',
  'Esmena':
    'Modificació proposada a un text en tramitació, abans de la votació final.',
  'Tramitació en lectura única':
    'Tramitació accelerada — sense passar per comissió, debat directe al ple.',
  'Quòrum':
    'Mínim d\'assistència per a què una votació sigui vàlida.',
  'Veto del Senat':
    'Rebuig del Senat a una llei aprovada al Congrés — només revesteix força si el Senat l\'aprova per majoria absoluta.',
};

/**
 * Look up the definition of a parliamentary term by its visible label.
 * Returns ``null`` when the term is not in the glossary so callers can
 * fall through to plain text without a tooltip (neutrality — we never
 * show "?" or empty bubbles that suggest there's more info).
 */
export function termDefinitionCa(term: string): string | null {
  return TERM_DEFINITIONS_CA[term] ?? null;
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
