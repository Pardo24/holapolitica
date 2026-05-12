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
    'Iniciativa legislativa que presenten grups parlamentaris del Congrés. Si s\'aprova, esdevé llei vigent.',
  'Projecte de Llei':
    'Iniciativa legislativa que presenta el Govern. Si s\'aprova, esdevé llei vigent.',
  'Proposició no de Llei (PNL)':
    'Acord polític sense valor normatiu — el Congrés es posiciona davant del Govern o d\'altres institucions.',
  // Alias without the "(PNL)" suffix so it can be applied where the
  // short label is rendered (e.g. donut legend, tables).
  'Proposició no de Llei':
    'Acord polític sense valor normatiu — el Congrés es posiciona davant del Govern o d\'altres institucions.',
  'Reial Decret-llei':
    'Norma amb força de llei dictada pel Govern per urgència. El Congrés ha de convalidar-la o derogar-la en 30 dies.',
  'Real Decreto-ley':
    'Norma amb força de llei dictada pel Govern per urgència. El Congrés ha de convalidar-la o derogar-la en 30 dies.',
  'Moció':
    'Després d\'una pregunta urgent al Govern (interpel·lació), un grup pot presentar una moció demanant una posició concreta.',
  'Interpel·lació':
    'Pregunta urgent feta pel Congrés al Govern sobre una qüestió política concreta.',
  'Reforma d\'Estatut':
    'Modificació d\'un Estatut d\'autonomia. Tramitació especial al Congrés.',
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
  // ----- Senate / procedure terms. Spanish keys are accepted as-is so the
  // glossary can match raw Congreso descriptions (which arrive in Spanish)
  // without a separate translation pass.
  'Veto del Senado':
    'Rebuig del Senat a una llei aprovada al Congrés. El Congrés el pot aixecar per majoria absoluta.',
  'Esmena del Senat':
    'Modificació feta pel Senat a un projecte de llei que ja havia aprovat el Congrés. Torna al Congrés per a una votació final de reconciliació.',
  'Enmienda del Senado':
    'Modificació feta pel Senat a un projecte de llei que ja havia aprovat el Congrés. Torna al Congrés per a una votació final de reconciliació.',
  'Lectura única':
    'Tramitació accelerada — el text va directament al debat al ple, sense fase de comissió.',
  'Avocació al ple':
    'El ple del Congrés assumeix la votació final d\'un projecte que estava en una comissió legislativa.',
  'Avocación al pleno':
    'El ple del Congrés assumeix la votació final d\'un projecte que estava en una comissió legislativa.',
  'Convalidació':
    'Acord del Congrés acceptant un Reial Decret-llei del Govern dins del termini de 30 dies. Sense convalidació el decret decau.',
  'Convalidación':
    'Acord del Congrés acceptant un Reial Decret-llei del Govern dins del termini de 30 dies. Sense convalidació el decret decau.',
  'Derogació':
    'Acord del Congrés rebutjant un Reial Decret-llei del Govern dins del termini de 30 dies — el decret queda sense efecte.',
  'Derogación':
    'Acord del Congrés rebutjant un Reial Decret-llei del Govern dins del termini de 30 dies — el decret queda sense efecte.',
};

/**
 * Ordered list of glossary keys eligible for inline annotation of free
 * text (vote titles, descriptions, initiative titles, …). Sorted by
 * length descending so the scanner matches longer phrases first (e.g.
 * "Veto del Senat" before "Esmena", "Tramitació en lectura única"
 * before "Lectura única").
 *
 * Keep this list narrower than the full ``TERM_DEFINITIONS_CA`` table:
 * we only want to scan for terms that *appear in user-facing free text*
 * coming from the Congreso feed. Stat keys ("Cohesió de grup",
 * "Dissidència") are rendered as section headers, never embedded in
 * descriptions, so wrapping them inline would just produce noise.
 */
const INLINE_GLOSSARY_KEYS: readonly string[] = (
  [
    'Tramitació en lectura única',
    'Avocación al pleno',
    'Avocació al ple',
    'Enmienda del Senado',
    'Esmena del Senat',
    'Veto del Senado',
    'Veto del Senat',
    'Real Decreto-ley',
    'Reial Decret-llei',
    'Convalidación',
    'Convalidació',
    'Derogación',
    'Derogació',
    'Lectura única',
    'Interpel·lació',
  ] as const
)
  .filter((k) => k in TERM_DEFINITIONS_CA)
  .slice()
  .sort((a, b) => b.length - a.length);

/**
 * Case-insensitive regex that matches any of ``INLINE_GLOSSARY_KEYS``.
 * Built once at module load. Capturing group is the matched span so
 * ``String.prototype.split`` returns alternating plain-text / matched
 * segments.
 *
 * The pattern is unanchored on word boundaries because the Spanish
 * terms include accented characters that the standard ``\b`` token
 * does not treat as word characters — relying on it would skip
 * "Derogación" when it sits at the end of a sentence. We do a manual
 * pre/post check in :func:`annotateGlossary` instead.
 */
const INLINE_GLOSSARY_REGEX =
  INLINE_GLOSSARY_KEYS.length > 0
    ? new RegExp(
        '(' + INLINE_GLOSSARY_KEYS.map(escapeRegex).join('|') + ')',
        'gi',
      )
    : null;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolve a *cased* visible substring back to its canonical glossary
 * key. The scanner matches case-insensitively (Spanish descriptions
 * sometimes capitalise terms differently — "DEROGACIÓN" in a header,
 * "derogación" in a paragraph) but the glossary keys are the canonical
 * spellings the about-page glossary uses. Returns ``null`` when the
 * input doesn't correspond to any key (defence-in-depth — the regex
 * should never produce one).
 */
function canonicalGlossaryKey(matched: string): string | null {
  const needle = matched.toLowerCase();
  for (const key of INLINE_GLOSSARY_KEYS) {
    if (key.toLowerCase() === needle) return key;
  }
  return null;
}

/**
 * Match-span returned by :func:`findInlineGlossaryMatches`. ``visible``
 * preserves the source casing so the rendered label reads naturally,
 * while ``key`` is the canonical glossary key used to look up the
 * tooltip definition.
 */
export interface GlossaryMatch {
  visible: string;
  key: string;
}

/**
 * Split ``text`` on known glossary terms (Catalan + Spanish), returning
 * an array of plain-text segments interleaved with match descriptors.
 * Used by ``<AnnotatedText>`` to wrap each match in ``<GlossaryTerm>``.
 *
 * - Case-insensitive. The match preserves the source casing so the
 *   rendered label reads naturally in context.
 * - Longest match wins: ``INLINE_GLOSSARY_KEYS`` is sorted by length
 *   descending so the regex prefers "Tramitació en lectura única" over
 *   "Lectura única" when both could match the same span.
 * - Returns ``[text]`` unchanged when no patterns match — callers can
 *   detect this fast path and avoid the wrapper component entirely.
 */
export function findInlineGlossaryMatches(
  text: string,
): Array<string | GlossaryMatch> {
  if (!INLINE_GLOSSARY_REGEX || text.length === 0) return [text];
  // ``split`` with a capturing group interleaves the match spans into
  // the result array. Reset ``lastIndex`` defensively in case the regex
  // was used by a stale call site.
  INLINE_GLOSSARY_REGEX.lastIndex = 0;
  const parts = text.split(INLINE_GLOSSARY_REGEX);
  if (parts.length <= 1) return [text];
  // Even-indexed entries are plain text; odd-indexed are matches.
  const out: Array<string | GlossaryMatch> = [];
  for (let i = 0; i < parts.length; i++) {
    const segment = parts[i] ?? '';
    if (i % 2 === 0) {
      if (segment !== '') out.push(segment);
    } else {
      const key = canonicalGlossaryKey(segment);
      if (key === null) {
        // Unreachable in practice, but degrade gracefully — keep the
        // visible text without a tooltip rather than throwing.
        out.push(segment);
      } else {
        out.push({ visible: segment, key });
      }
    }
  }
  return out;
}

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
