/**
 * The plenary agenda headings a vote falls under ("Proposiciones no de
 * Ley.", "Enmiendas del Senado."...), as the Congress publishes them, in
 * Spanish. The vote page shows one above every title, so in a Catalan or
 * English page it was the one line left in Spanish.
 *
 * The 35 below cover 99.6% of the 16,762 votes (2026-10-26). A heading not
 * listed keeps its Spanish original, which is also what the Spanish page
 * shows.
 */

const HEADINGS: Record<string, { ca: string; en: string }> = {
  'presupuestos generales del estado': { ca: "Pressupostos Generals de l'Estat", en: 'State Budget' },
  'dictámenes de comisiones sobre iniciativas legislativas': {
    ca: 'Dictàmens de comissions sobre iniciatives legislatives',
    en: 'Committee reports on bills',
  },
  'mociones consecuencia de interpelaciones urgentes': {
    ca: "Mocions conseqüència d'interpel·lacions urgents",
    en: 'Motions following urgent interpellations',
  },
  'enmiendas del senado': { ca: 'Esmenes del Senat', en: 'Senate amendments' },
  'proposiciones no de ley': { ca: 'Proposicions no de llei', en: 'Non-legislative motions' },
  'toma en consideración de proposiciones de ley': {
    ca: 'Presa en consideració de proposicions de llei',
    en: 'Consideration of bills from the chamber',
  },
  'debates de totalidad de iniciativas legislativas': {
    ca: "Debats de totalitat d'iniciatives legislatives",
    en: 'Debates on whole bills',
  },
  'propuestas de resolución relativas a las memorias del consejo general del poder judicial': {
    ca: 'Propostes de resolució sobre les memòries del Consell General del Poder Judicial',
    en: "Resolutions on the General Council of the Judiciary's reports",
  },
  'dictámenes de comisiones no permanentes': {
    ca: 'Dictàmens de comissions no permanents',
    en: 'Reports of non-permanent committees',
  },
  'convalidación o derogación de reales decretos-leyes': {
    ca: 'Convalidació o derogació de reials decrets llei',
    en: 'Validation or repeal of royal decree-laws',
  },
  'dictámenes de la comisión de asuntos exteriores sobre convenios internacionales': {
    ca: "Dictàmens de la Comissió d'Afers Exteriors sobre convenis internacionals",
    en: 'Foreign Affairs Committee reports on international treaties',
  },
  'tramitación directa y en lectura única de iniciativas legislativas': {
    ca: "Tramitació directa i en lectura única d'iniciatives legislatives",
    en: 'Bills passed directly in a single reading',
  },
  'debate de política general en torno al estado de la nación': {
    ca: "Debat de política general sobre l'estat de la nació",
    en: 'State of the Nation debate',
  },
  'debate de política general sobre el estado de la nación': {
    ca: "Debat de política general sobre l'estat de la nació",
    en: 'State of the Nation debate',
  },
  'comunicación del gobierno': { ca: 'Comunicació del Govern', en: 'Government statement' },
  'avocación de iniciativas legislativas': {
    ca: "Avocació d'iniciatives legislatives",
    en: 'Bills recalled to the plenary',
  },
  'actos en relación con los estados de alarma, excepción y sitio': {
    ca: "Actes relatius als estats d'alarma, excepció i setge",
    en: 'States of alarm, emergency and siege',
  },
  'acuerdos de comisiones relativos a informes de subcomisiones y ponencias': {
    ca: 'Acords de comissions sobre informes de subcomissions i ponències',
    en: 'Committee decisions on subcommittee reports',
  },
  'toma en consideración de proposiciones de ley de comunidades y ciudades autónomas': {
    ca: 'Presa en consideració de proposicions de llei de comunitats i ciutats autònomes',
    en: 'Consideration of bills from the regions',
  },
  'propuestas de creación de subcomisiones': {
    ca: 'Propostes de creació de subcomissions',
    en: 'Proposals to set up subcommittees',
  },
  'dictámenes de comisiones de investigación': {
    ca: "Dictàmens de comissions d'investigació",
    en: 'Reports of inquiry committees',
  },
  'propuestas de creación de comisiones': {
    ca: 'Propostes de creació de comissions',
    en: 'Proposals to set up committees',
  },
  'dictamen de la comisión del estatuto de los diputados': {
    ca: "Dictamen de la Comissió de l'Estatut dels Diputats",
    en: "Report of the Deputies' Statute Committee",
  },
  'dictámenes de la comisión del estatuto de los diputados': {
    ca: "Dictàmens de la Comissió de l'Estatut dels Diputats",
    en: "Reports of the Deputies' Statute Committee",
  },
  'solicitudes de creación de comisiones de investigación': {
    ca: "Sol·licituds de creació de comissions d'investigació",
    en: 'Requests to set up inquiry committees',
  },
  'solicitud de prórroga de subcomisiones': {
    ca: 'Sol·licitud de pròrroga de subcomissions',
    en: 'Requests to extend subcommittees',
  },
  'solicitud de prórroga de comisiones de investigación': {
    ca: "Sol·licitud de pròrroga de comissions d'investigació",
    en: 'Requests to extend inquiry committees',
  },
  'debate relativo al objetivo de estabilidad presupuestaria': {
    ca: "Debat sobre l'objectiu d'estabilitat pressupostària",
    en: 'Debate on the budget stability target',
  },
  'toma en consideración de proposición de reforma del reglamento del congreso de los diputados': {
    ca: 'Presa en consideració de la proposta de reforma del Reglament del Congrés',
    en: 'Consideration of a reform of the Congress Rules',
  },
  'toma en consideración de proposiciones de reforma del reglamento del congreso de los diputados': {
    ca: 'Presa en consideració de propostes de reforma del Reglament del Congrés',
    en: 'Consideration of reforms of the Congress Rules',
  },
  'debate de totalidad de propuestas de reforma de estatutos de autonomía': {
    ca: "Debat de totalitat de propostes de reforma d'estatuts d'autonomia",
    en: 'Debate on reforms of regional statutes',
  },
  'declaración sobre la cuenta general del estado': {
    ca: "Declaració sobre el Compte General de l'Estat",
    en: 'Statement on the State General Account',
  },
  'toma en consideración de proposiciones de ley de iniciativa popular': {
    ca: "Presa en consideració de proposicions de llei d'iniciativa popular",
    en: "Consideration of citizens' initiative bills",
  },
  'informes de comisiones permanentes': {
    ca: 'Informes de comissions permanents',
    en: 'Reports of permanent committees',
  },
  'acuerdo de tramitación directa y en lectura única de iniciativas legislativas': {
    ca: "Acord de tramitació directa i en lectura única d'iniciatives legislatives",
    en: 'Agreement to pass bills directly in a single reading',
  },
};

function key(heading: string): string {
  return heading
    .replace(/\s*\(continuaci[oó]n\)\s*/i, ' ')
    .trim()
    .replace(/\.$/, '')
    .toLowerCase();
}

/** The heading in the reader's language; Spanish (the original) otherwise. */
export function agendaHeading(heading: string, locale: string): string {
  if (locale !== 'ca' && locale !== 'en') return heading;
  return HEADINGS[key(heading)]?.[locale] ?? heading;
}
