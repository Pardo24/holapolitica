/**
 * Curated general-knowledge question bank for Trivia's non-vote categories
 * ("Veritat o fals" and "Món"). These are NOT derived from our vote data, so
 * they live here as a hand-written, strictly factual and neutral set: stable
 * civic and institutional facts (seat counts, majorities, international bodies),
 * never opinion or contested/partisan content. Kept verifiable so the game
 * stays a mirror, not a megaphone. Catalan + Castilian; other locales fall back
 * to Catalan (matching the vote-question engine).
 *
 * The shared `DuelQuestion` shape is also the target the vote-based API
 * questions are mapped into (see `fromGameQuestion`), so the game treats both
 * sources uniformly.
 */
import type { GameQuestion } from '@/lib/api';

export type Cat = 'lleis' | 'partits' | 'vf' | 'mon';

export interface DuelOption {
  text: string;
  correct: boolean;
  partySlug?: string | null;
  partyColor?: string | null;
}

export interface DuelQuestion {
  id: string;
  category: Cat;
  prompt: string;
  /** Plain-language law context — only for vote-based cards. */
  lawSummary?: string;
  /** The law's short plain title, shown above the summary. */
  lawTitle?: string | null;
  /** "Com t'afecta": [[profile_key, sentence]]. */
  lawEffects?: string[][];
  topic?: string | null;
  options: DuelOption[];
  partySlug?: string | null;
  partyColor?: string | null;
  reveal?: string | null;
  /** Source vote id — only vote-based cards link out to it. */
  sourceId?: number;
}

type Lang = 'ca' | 'es';
const lang2 = (lang: string): Lang => (lang.toLowerCase().startsWith('es') ? 'es' : 'ca');

/** Deterministic seed for the day's challenge, so everyone who plays "el repte
 *  del dia" on the same date faces the same round and can compare scores. */
export function dailySeed(date: Date): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

/** Map a vote-based API question into the unified duel shape. */
export function fromGameQuestion(q: GameQuestion): DuelQuestion {
  return {
    id: q.id,
    category: q.category === 'partits' ? 'partits' : 'lleis',
    prompt: q.prompt,
    lawSummary: q.law_summary,
    lawTitle: q.law_title ?? null,
    lawEffects: q.law_effects ?? [],
    topic: q.topic,
    options: q.options.map((o) => ({
      text: o.text,
      correct: o.correct,
      partySlug: o.party_slug,
      partyColor: o.party_color,
    })),
    partySlug: q.party_slug,
    partyColor: q.party_color,
    reveal: q.reveal,
    sourceId: q.source_id,
  };
}

// ── True / false bank ───────────────────────────────────────────────────────
// `a` = the statement is true.
interface VFItem {
  ca: string;
  es: string;
  a: boolean;
  expCa: string;
  expEs: string;
}

const VF: VFItem[] = [
  {
    ca: 'El Senat és la cambra alta de les Corts Generals.',
    es: 'El Senado es la cámara alta de las Cortes Generales.',
    a: true,
    expCa: 'Cert: el Senat és la cambra alta; el Congrés, la baixa.',
    expEs: 'Cierto: el Senado es la cámara alta; el Congreso, la baja.',
  },
  {
    ca: 'El president del Govern és elegit directament per la ciutadania.',
    es: 'El presidente del Gobierno es elegido directamente por la ciudadanía.',
    a: false,
    expCa: "Fals: l'inviteix i l'escull el Congrés dels Diputats.",
    expEs: 'Falso: lo inviste el Congreso de los Diputados.',
  },
  {
    ca: 'Una moció de censura a Espanya ha de proposar un candidat alternatiu.',
    es: 'Una moción de censura en España debe proponer un candidato alternativo.',
    a: true,
    expCa: 'Cert: és una moció de censura constructiva.',
    expEs: 'Cierto: es una moción de censura constructiva.',
  },
  {
    ca: 'El Tribunal Constitucional forma part del poder judicial ordinari.',
    es: 'El Tribunal Constitucional forma parte del poder judicial ordinario.',
    a: false,
    expCa: "Fals: és un òrgan constitucional independent del poder judicial.",
    expEs: 'Falso: es un órgano constitucional independiente del poder judicial.',
  },
  {
    ca: 'Espanya és una monarquia parlamentària.',
    es: 'España es una monarquía parlamentaria.',
    a: true,
    expCa: 'Cert, segons la Constitució de 1978.',
    expEs: 'Cierto, según la Constitución de 1978.',
  },
  {
    ca: "L'euro és la moneda oficial de tots els estats de la Unió Europea.",
    es: 'El euro es la moneda oficial de todos los Estados de la Unión Europea.',
    a: false,
    expCa: "Fals: alguns estats, com Suècia o Polònia, no l'han adoptat.",
    expEs: 'Falso: algunos, como Suecia o Polonia, no lo han adoptado.',
  },
  {
    ca: 'El Regne Unit continua sent membre de la Unió Europea.',
    es: 'El Reino Unido sigue siendo miembro de la Unión Europea.',
    a: false,
    expCa: 'Fals: en va sortir el 2020 (Brexit).',
    expEs: 'Falso: salió en 2020 (Brexit).',
  },
  {
    ca: "L'OTAN és una aliança de defensa militar.",
    es: 'La OTAN es una alianza de defensa militar.',
    a: true,
    expCa: 'Cert: és una aliança politicomilitar de defensa col·lectiva.',
    expEs: 'Cierto: es una alianza político-militar de defensa colectiva.',
  },
  {
    ca: "El cap de l'Estat a Espanya és el president del Govern.",
    es: 'El jefe del Estado en España es el presidente del Gobierno.',
    a: false,
    expCa: "Fals: el cap de l'Estat és el Rei; el president dirigeix el Govern.",
    expEs: 'Falso: el jefe del Estado es el Rey; el presidente dirige el Gobierno.',
  },
  {
    ca: 'A Espanya el vot és obligatori.',
    es: 'En España el voto es obligatorio.',
    a: false,
    expCa: 'Fals: votar és un dret, no una obligació.',
    expEs: 'Falso: votar es un derecho, no una obligación.',
  },
  {
    ca: 'La Comissió Europea és qui proposa la legislació de la Unió Europea.',
    es: 'La Comisión Europea es quien propone la legislación de la Unión Europea.',
    a: true,
    expCa: 'Cert: la Comissió té la iniciativa legislativa a la UE.',
    expEs: 'Cierto: la Comisión tiene la iniciativa legislativa en la UE.',
  },
  {
    ca: 'Tots els estats de la Unió Europea tenen el mateix nombre d’eurodiputats.',
    es: 'Todos los Estados de la Unión Europea tienen el mismo número de eurodiputados.',
    a: false,
    expCa: 'Fals: es reparteixen segons la població de cada estat.',
    expEs: 'Falso: se reparten según la población de cada Estado.',
  },
  {
    ca: 'El Banc Central Europeu fixa els tipus d’interès de la zona euro.',
    es: 'El Banco Central Europeo fija los tipos de interés de la zona euro.',
    a: true,
    expCa: 'Cert: el BCE marca la política monetària de l’euro.',
    expEs: 'Cierto: el BCE marca la política monetaria del euro.',
  },
  {
    ca: "El Senat pot vetar una llei de manera definitiva.",
    es: "El Senado puede vetar una ley de forma definitiva.",
    a: false,
    expCa: "Fals: el Congrés pot aixecar el veto del Senat i aprovar la llei igualment.",
    expEs: "Falso: el Congreso puede levantar el veto del Senado y aprobar la ley igualmente.",
  },
  {
    ca: "Una llei orgànica necessita la majoria absoluta del Congrés en una votació final.",
    es: "Una ley orgánica necesita la mayoría absoluta del Congreso en una votación final.",
    a: true,
    expCa: "Cert: 176 vots a favor en la votació de conjunt.",
    expEs: "Cierto: 176 votos a favor en la votación de conjunto.",
  },
  {
    ca: "El Defensor del Poble l'elegeixen les Corts Generals.",
    es: "El Defensor del Pueblo lo eligen las Cortes Generales.",
    a: true,
    expCa: "Cert: és un alt comissionat de les Corts.",
    expEs: "Cierto: es un alto comisionado de las Cortes.",
  },
  {
    ca: "Els escons del Congrés es reparteixen amb la llei d'Hondt.",
    es: "Los escaños del Congreso se reparten con la ley d'Hondt.",
    a: true,
    expCa: "Cert: s'aplica a cada província per separat.",
    expEs: "Cierto: se aplica en cada provincia por separado.",
  },
  {
    ca: "A les eleccions al Congrés pots votar candidats de partits diferents.",
    es: "En las elecciones al Congreso puedes votar candidatos de partidos distintos.",
    a: false,
    expCa: "Fals: les llistes del Congrés són tancades i bloquejades.",
    expEs: "Falso: las listas del Congreso son cerradas y bloqueadas.",
  },
  {
    ca: "A les eleccions al Senat pots votar candidats de partits diferents.",
    es: "En las elecciones al Senado puedes votar candidatos de partidos distintos.",
    a: true,
    expCa: "Cert: al Senat les llistes són obertes.",
    expEs: "Cierto: en el Senado las listas son abiertas.",
  },
  {
    ca: "Les Corts Generals estan formades pel Congrés i el Senat.",
    es: "Las Cortes Generales están formadas por el Congreso y el Senado.",
    a: true,
    expCa: "Cert: són les dues cambres del Parlament espanyol.",
    expEs: "Cierto: son las dos cámaras del Parlamento español.",
  },
  {
    ca: "El president del Govern pot dissoldre les Corts i avançar les eleccions.",
    es: "El presidente del Gobierno puede disolver las Cortes y adelantar las elecciones.",
    a: true,
    expCa: "Cert: ho proposa ell i ho decreta el rei.",
    expEs: "Cierto: lo propone él y lo decreta el rey.",
  },
  {
    ca: "Una iniciativa legislativa popular pot proposar canvis d'impostos.",
    es: "Una iniciativa legislativa popular puede proponer cambios de impuestos.",
    a: false,
    expCa: "Fals: la Constitució exclou la matèria tributària, entre altres.",
    expEs: "Falso: la Constitución excluye la materia tributaria, entre otras.",
  },
  {
    ca: "Una proposició no de llei obliga el Govern a complir-la.",
    es: "Una proposición no de ley obliga al Gobierno a cumplirla.",
    a: false,
    expCa: "Fals: és una petició o una presa de posició, no és vinculant.",
    expEs: "Falso: es una petición o una toma de posición, no es vinculante.",
  },
  {
    ca: "Les Corts aproven cada any els Pressupostos Generals de l'Estat que presenta el Govern.",
    es: "Las Cortes aprueban cada año los Presupuestos Generales del Estado que presenta el Gobierno.",
    a: true,
    expCa: "Cert: el Govern els elabora i les Corts els aproven.",
    expEs: "Cierto: el Gobierno los elabora y las Cortes los aprueban.",
  },
  {
    ca: "Si no s'aproven pressupostos nous, es prorroguen els de l'any anterior.",
    es: "Si no se aprueban presupuestos nuevos, se prorrogan los del año anterior.",
    a: true,
    expCa: "Cert: es prorroguen automàticament fins que n'hi hagi de nous.",
    expEs: "Cierto: se prorrogan automáticamente hasta que haya nuevos.",
  },
  {
    ca: "El rei pot vetar les lleis que aproven les Corts.",
    es: "El rey puede vetar las leyes que aprueban las Cortes.",
    a: false,
    expCa: "Fals: les sanciona i les promulga; no té dret de veto.",
    expEs: "Falso: las sanciona y las promulga; no tiene derecho de veto.",
  },
  {
    ca: "Un diputat només pot ser detingut en cas de flagrant delicte.",
    es: "Un diputado solo puede ser detenido en caso de flagrante delito.",
    a: true,
    expCa: "Cert: és la immunitat parlamentària.",
    expEs: "Cierto: es la inmunidad parlamentaria.",
  },
  {
    ca: "Els diputats i senadors els jutja el Tribunal Suprem.",
    es: "A los diputados y senadores los juzga el Tribunal Supremo.",
    a: true,
    expCa: "Cert: és l'anomenat aforament.",
    expEs: "Cierto: es el llamado aforamiento.",
  },
  {
    ca: "Una part dels senadors la designen els parlaments autonòmics.",
    es: "Una parte de los senadores la designan los parlamentos autonómicos.",
    a: true,
    expCa: "Cert: la resta s'elegeixen directament a les urnes.",
    expEs: "Cierto: el resto se eligen directamente en las urnas.",
  },
  {
    ca: "El Tribunal de Comptes controla els comptes i la gestió econòmica de l'Estat.",
    es: "El Tribunal de Cuentas controla las cuentas y la gestión económica del Estado.",
    a: true,
    expCa: "Cert: en depèn directament de les Corts.",
    expEs: "Cierto: depende directamente de las Cortes.",
  },
  {
    ca: "El Consell d'Estat és l'òrgan consultiu suprem del Govern.",
    es: "El Consejo de Estado es el órgano consultivo supremo del Gobierno.",
    a: true,
    expCa: "Cert, segons l'article 107 de la Constitució.",
    expEs: "Cierto, según el artículo 107 de la Constitución.",
  },
  {
    ca: "Una reforma total de la Constitució s'ha de sotmetre a referèndum.",
    es: "Una reforma total de la Constitución debe someterse a referéndum.",
    a: true,
    expCa: "Cert: el procediment agreujat de l'article 168 l'exigeix.",
    expEs: "Cierto: el procedimiento agravado del artículo 168 lo exige.",
  },
  {
    ca: "El Parlament Europeu l'elegeixen directament els ciutadans.",
    es: "El Parlamento Europeo lo eligen directamente los ciudadanos.",
    a: true,
    expCa: "Cert: és l'única institució de la UE elegida a les urnes.",
    expEs: "Cierto: es la única institución de la UE elegida en las urnas.",
  },
  {
    ca: "Els ciutadans d'altres països de la UE residents a Espanya poden votar a les municipals.",
    es: "Los ciudadanos de otros países de la UE residentes en España pueden votar en las municipales.",
    a: true,
    expCa: "Cert: també a les europees, però no a les generals.",
    expEs: "Cierto: también en las europeas, pero no en las generales.",
  },
  {
    ca: "El salari mínim interprofessional el fixa el Govern.",
    es: "El salario mínimo interprofesional lo fija el Gobierno.",
    a: true,
    expCa: "Cert: l'aprova cada any per reial decret.",
    expEs: "Cierto: lo aprueba cada año por real decreto.",
  },
  {
    ca: "Una llei sempre entra en vigor l'endemà de publicar-se al BOE.",
    es: "Una ley siempre entra en vigor al día siguiente de publicarse en el BOE.",
    a: false,
    expCa: "Fals: si la llei no diu res, entra en vigor als 20 dies.",
    expEs: "Falso: si la ley no dice nada, entra en vigor a los 20 días.",
  },
  {
    ca: "Una moció de censura necessita majoria absoluta per prosperar.",
    es: "Una moción de censura necesita mayoría absoluta para prosperar.",
    a: true,
    expCa: "Cert: 176 vots a favor del candidat alternatiu.",
    expEs: "Cierto: 176 votos a favor del candidato alternativo.",
  },
  {
    ca: "La qüestió de confiança la planteja el president del Govern.",
    es: "La cuestión de confianza la plantea el presidente del Gobierno.",
    a: true,
    expCa: "Cert: n'hi ha prou amb la majoria simple per superar-la.",
    expEs: "Cierto: basta la mayoría simple para superarla.",
  },
  {
    ca: "A les eleccions generals es pot votar per correu.",
    es: "En las elecciones generales se puede votar por correo.",
    a: true,
    expCa: "Cert: cal demanar-ho a Correus abans del termini.",
    expEs: "Cierto: hay que pedirlo en Correos antes del plazo.",
  },
  {
    ca: "Els estatuts d'autonomia s'aproven com a lleis orgàniques.",
    es: "Los estatutos de autonomía se aprueban como leyes orgánicas.",
    a: true,
    expCa: "Cert: necessiten la majoria absoluta del Congrés.",
    expEs: "Cierto: necesitan la mayoría absoluta del Congreso.",
  },
  {
    ca: "Les sessions plenàries del Congrés són, en general, públiques.",
    es: "Las sesiones plenarias del Congreso son, en general, públicas.",
    a: true,
    expCa: "Cert: es retransmeten i se'n publica el Diari de Sessions.",
    expEs: "Cierto: se retransmiten y se publica el Diario de Sesiones.",
  },
  {
    ca: "El Congrés pot crear comissions d'investigació.",
    es: "El Congreso puede crear comisiones de investigación.",
    a: true,
    expCa: "Cert: les seves conclusions no vinculen els tribunals.",
    expEs: "Cierto: sus conclusiones no vinculan a los tribunales.",
  },
  {
    ca: "El Defensor del Poble pot presentar un recurs d'inconstitucionalitat.",
    es: "El Defensor del Pueblo puede presentar un recurso de inconstitucionalidad.",
    a: true,
    expCa: "Cert: com el president del Govern, 50 diputats o 50 senadors.",
    expEs: "Cierto: como el presidente del Gobierno, 50 diputados o 50 senadores.",
  },
  {
    ca: "Un decret llei del Govern no ha de passar mai pel Congrés.",
    es: "Un decreto-ley del Gobierno no tiene que pasar nunca por el Congreso.",
    a: false,
    expCa: "Fals: els decrets llei s'han de convalidar al Congrés.",
    expEs: "Falso: los decretos-ley deben convalidarse en el Congreso.",
  },
  {
    ca: "El Congrés té l'última paraula en l'aprovació de les lleis.",
    es: "El Congreso tiene la última palabra en la aprobación de las leyes.",
    a: true,
    expCa: "Cert: pot acceptar o rebutjar les esmenes i el veto del Senat.",
    expEs: "Cierto: puede aceptar o rechazar las enmiendas y el veto del Senado.",
  },
];

// ── Multiple-choice bank ("Món" / general knowledge) ────────────────────────
// First option is the correct one; it gets shuffled per draw.
interface MCItem {
  ca: string;
  es: string;
  optsCa: [string, string, string, string];
  optsEs: [string, string, string, string];
  expCa: string;
  expEs: string;
}

const MC: MCItem[] = [
  {
    ca: 'On té la seu el Banc Central Europeu?',
    es: '¿Dónde tiene su sede el Banco Central Europeo?',
    optsCa: ['Frankfurt', 'Brussel·les', 'Estrasburg', 'Luxemburg'],
    optsEs: ['Fráncfort', 'Bruselas', 'Estrasburgo', 'Luxemburgo'],
    expCa: 'A Frankfurt (Alemanya).',
    expEs: 'En Fráncfort (Alemania).',
  },
  {
    ca: 'Quina és la cambra alta de les Corts Generals?',
    es: '¿Cuál es la cámara alta de las Cortes Generales?',
    optsCa: ['El Senat', 'El Congrés', 'El Govern', 'El Tribunal Constitucional'],
    optsEs: ['El Senado', 'El Congreso', 'El Gobierno', 'El Tribunal Constitucional'],
    expCa: 'El Senat és la cambra alta.',
    expEs: 'El Senado es la cámara alta.',
  },
  {
    ca: 'On se celebren les sessions plenàries del Parlament Europeu?',
    es: '¿Dónde se celebran las sesiones plenarias del Parlamento Europeo?',
    optsCa: ['Estrasburg', 'Brussel·les', 'Frankfurt', 'La Haia'],
    optsEs: ['Estrasburgo', 'Bruselas', 'Fráncfort', 'La Haya'],
    expCa: 'El ple oficial és a Estrasburg; molta feina es fa a Brussel·les.',
    expEs: 'El pleno oficial es en Estrasburgo; mucho trabajo se hace en Bruselas.',
  },
  {
    ca: 'En segona votació, quina majoria necessita el Congrés per investir un president?',
    es: 'En segunda votación, ¿qué mayoría necesita el Congreso para investir a un presidente?',
    optsCa: ['Majoria simple', 'Majoria absoluta', 'Dos terços', 'Unanimitat'],
    optsEs: ['Mayoría simple', 'Mayoría absoluta', 'Dos tercios', 'Unanimidad'],
    expCa: 'En segona votació n’hi ha prou amb majoria simple (més sís que nos).',
    expEs: 'En segunda votación basta con mayoría simple (más síes que noes).',
  },
  {
    ca: "Qui és el cap de l'Estat a Espanya?",
    es: '¿Quién es el jefe del Estado en España?',
    optsCa: ['El Rei', 'El president del Govern', 'La presidència del Congrés', 'El Tribunal Constitucional'],
    optsEs: ['El Rey', 'El presidente del Gobierno', 'La presidencia del Congreso', 'El Tribunal Constitucional'],
    expCa: "El Rei és el cap de l'Estat.",
    expEs: 'El Rey es el jefe del Estado.',
  },
  {
    ca: "Quina institució de la UE representa els governs dels estats membres?",
    es: '¿Qué institución de la UE representa a los gobiernos de los Estados miembros?',
    optsCa: ['El Consell de la UE', 'La Comissió Europea', 'El Parlament Europeu', 'El Tribunal de Justícia'],
    optsEs: ['El Consejo de la UE', 'La Comisión Europea', 'El Parlamento Europeo', 'El Tribunal de Justicia'],
    expCa: 'El Consell de la UE reuneix els governs dels estats.',
    expEs: 'El Consejo de la UE reúne a los gobiernos de los Estados.',
  },
  {
    ca: 'On té la seu el Tribunal de Justícia de la Unió Europea?',
    es: '¿Dónde tiene su sede el Tribunal de Justicia de la Unión Europea?',
    optsCa: ['Luxemburg', 'Estrasburg', 'Brussel·les', 'La Haia'],
    optsEs: ['Luxemburgo', 'Estrasburgo', 'Bruselas', 'La Haya'],
    expCa: 'A Luxemburg.',
    expEs: 'En Luxemburgo.',
  },
  {
    ca: "Amb quin sistema es reparteixen els escons del Congrés?",
    es: "¿Con qué sistema se reparten los escaños del Congreso?",
    optsCa: ["La llei d'Hondt", "El mètode Sainte-Laguë", "Majoria simple per districte", "La quota Hare"],
    optsEs: ["La ley d'Hondt", "El método Sainte-Laguë", "Mayoría simple por distrito", "La cuota Hare"],
    expCa: "La llei d'Hondt, província per província.",
    expEs: "La ley d'Hondt, provincia por provincia.",
  },
  {
    ca: "Quina majoria necessita una llei orgànica al Congrés?",
    es: "¿Qué mayoría necesita una ley orgánica en el Congreso?",
    optsCa: ["Absoluta (176)", "Simple", "Tres cinquenes (210)", "Dos terços (234)"],
    optsEs: ["Absoluta (176)", "Simple", "Tres quintos (210)", "Dos tercios (234)"],
    expCa: "Majoria absoluta en la votació final.",
    expEs: "Mayoría absoluta en la votación final.",
  },
  {
    ca: "Qui aprova els Pressupostos Generals de l'Estat?",
    es: "¿Quién aprueba los Presupuestos Generales del Estado?",
    optsCa: ["Les Corts Generals", "El Govern", "El Banc d'Espanya", "El rei"],
    optsEs: ["Las Cortes Generales", "El Gobierno", "El Banco de España", "El rey"],
    expCa: "Els elabora el Govern i els aproven les Corts.",
    expEs: "Los elabora el Gobierno y los aprueban las Cortes.",
  },
  {
    ca: "Qui sanciona i promulga les lleis aprovades per les Corts?",
    es: "¿Quién sanciona y promulga las leyes aprobadas por las Cortes?",
    optsCa: ["El rei", "El president del Govern", "El Tribunal Constitucional", "La presidenta del Congrés"],
    optsEs: ["El rey", "El presidente del Gobierno", "El Tribunal Constitucional", "La presidenta del Congreso"],
    expCa: "El rei, en un termini de 15 dies.",
    expEs: "El rey, en un plazo de 15 días.",
  },
  {
    ca: "Quin tribunal jutja els diputats i senadors?",
    es: "¿Qué tribunal juzga a los diputados y senadores?",
    optsCa: ["El Tribunal Suprem", "L'Audiència Nacional", "El Tribunal Constitucional", "Un jutjat ordinari"],
    optsEs: ["El Tribunal Supremo", "La Audiencia Nacional", "El Tribunal Constitucional", "Un juzgado ordinario"],
    expCa: "La Sala Penal del Tribunal Suprem.",
    expEs: "La Sala de lo Penal del Tribunal Supremo.",
  },
  {
    ca: "Qui proposa al Congrés el candidat a president del Govern?",
    es: "¿Quién propone al Congreso el candidato a presidente del Gobierno?",
    optsCa: ["El rei", "La presidenta del Congrés", "El partit més votat", "El Senat"],
    optsEs: ["El rey", "La presidenta del Congreso", "El partido más votado", "El Senado"],
    expCa: "El rei, després de consultar els grups.",
    expEs: "El rey, tras consultar a los grupos.",
  },
  {
    ca: "Quina majoria necessita una moció de censura?",
    es: "¿Qué mayoría necesita una moción de censura?",
    optsCa: ["Absoluta", "Simple", "Tres cinquenes", "Dos terços"],
    optsEs: ["Absoluta", "Simple", "Tres quintos", "Dos tercios"],
    expCa: "Majoria absoluta: 176 vots.",
    expEs: "Mayoría absoluta: 176 votos.",
  },
  {
    ca: "Quin és l'òrgan consultiu suprem del Govern?",
    es: "¿Cuál es el órgano consultivo supremo del Gobierno?",
    optsCa: ["El Consell d'Estat", "El Consell General del Poder Judicial", "El Tribunal de Comptes", "El Defensor del Poble"],
    optsEs: ["El Consejo de Estado", "El Consejo General del Poder Judicial", "El Tribunal de Cuentas", "El Defensor del Pueblo"],
    expCa: "El Consell d'Estat.",
    expEs: "El Consejo de Estado.",
  },
  {
    ca: "Qui fiscalitza els comptes i la gestió econòmica de l'Estat?",
    es: "¿Quién fiscaliza las cuentas y la gestión económica del Estado?",
    optsCa: ["El Tribunal de Comptes", "El Banc d'Espanya", "El Consell d'Estat", "L'Agència Tributària"],
    optsEs: ["El Tribunal de Cuentas", "El Banco de España", "El Consejo de Estado", "La Agencia Tributaria"],
    expCa: "El Tribunal de Comptes, que depèn de les Corts.",
    expEs: "El Tribunal de Cuentas, que depende de las Cortes.",
  },
  {
    ca: "Qui elegeix el Defensor del Poble?",
    es: "¿Quién elige al Defensor del Pueblo?",
    optsCa: ["Les Corts Generals", "El Govern", "El rei", "El Tribunal Suprem"],
    optsEs: ["Las Cortes Generales", "El Gobierno", "El rey", "El Tribunal Supremo"],
    expCa: "Les Corts Generals, per a cinc anys.",
    expEs: "Las Cortes Generales, para cinco años.",
  },
  {
    ca: "On treballa el Congrés dels Diputats?",
    es: "¿Dónde trabaja el Congreso de los Diputados?",
    optsCa: ["Al Palau de les Corts", "Al Palau del Senat", "Al Palau de la Moncloa", "Al Palau Reial"],
    optsEs: ["En el Palacio de las Cortes", "En el Palacio del Senado", "En el Palacio de la Moncloa", "En el Palacio Real"],
    expCa: "Al Palau de les Corts, a la Carrera de San Jerónimo de Madrid.",
    expEs: "En el Palacio de las Cortes, en la Carrera de San Jerónimo de Madrid.",
  },
  {
    ca: "On té la residència i la seu el president del Govern?",
    es: "¿Dónde tiene su residencia y sede el presidente del Gobierno?",
    optsCa: ["Al Palau de la Moncloa", "Al Palau de la Zarzuela", "Al Palau de les Corts", "Al Palau de Santa Cruz"],
    optsEs: ["En el Palacio de la Moncloa", "En el Palacio de la Zarzuela", "En el Palacio de las Cortes", "En el Palacio de Santa Cruz"],
    expCa: "Al Palau de la Moncloa, a Madrid.",
    expEs: "En el Palacio de la Moncloa, en Madrid.",
  },
  {
    ca: "Sobre quina d'aquestes matèries no es pot presentar una iniciativa legislativa popular?",
    es: "¿Sobre cuál de estas materias no se puede presentar una iniciativa legislativa popular?",
    optsCa: ["Els impostos", "L'habitatge", "La sanitat", "El transport"],
    optsEs: ["Los impuestos", "La vivienda", "La sanidad", "El transporte"],
    expCa: "La matèria tributària n'està exclosa.",
    expEs: "La materia tributaria está excluida.",
  },
  {
    ca: "Qui pot plantejar una qüestió de confiança al Congrés?",
    es: "¿Quién puede plantear una cuestión de confianza en el Congreso?",
    optsCa: ["El president del Govern", "Qualsevol grup parlamentari", "El rei", "La presidenta del Congrés"],
    optsEs: ["El presidente del Gobierno", "Cualquier grupo parlamentario", "El rey", "La presidenta del Congreso"],
    expCa: "Només el president del Govern, amb l'acord del Consell de Ministres.",
    expEs: "Solo el presidente del Gobierno, con el acuerdo del Consejo de Ministros.",
  },
  {
    ca: "Quina cambra té l'última paraula en l'aprovació de les lleis?",
    es: "¿Qué cámara tiene la última palabra en la aprobación de las leyes?",
    optsCa: ["El Congrés", "El Senat", "Les dues per igual", "Cap: decideix el Govern"],
    optsEs: ["El Congreso", "El Senado", "Las dos por igual", "Ninguna: decide el Gobierno"],
    expCa: "El Congrés, que pot aixecar el veto del Senat.",
    expEs: "El Congreso, que puede levantar el veto del Senado.",
  },
];

const VF_LABEL: Record<Lang, { t: string; f: string }> = {
  ca: { t: 'Veritat', f: 'Fals' },
  es: { t: 'Verdadero', f: 'Falso' },
};

// Tiny deterministic shuffle so a seeded round serves the same bank order to
// both players. Mulberry32-style PRNG over the index.
function seededOrder(length: number, seed: number): number[] {
  let s = (seed ^ 0x9e3779b9) >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const idx = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const a = idx[i]!;
    idx[i] = idx[j]!;
    idx[j] = a;
  }
  return idx;
}

/** Localised curated questions for a bank category, deterministic per seed. */
export function bankQuestions(lang: string, category: 'vf' | 'mon', seed: number): DuelQuestion[] {
  const l = lang2(lang);
  if (category === 'vf') {
    const order = seededOrder(VF.length, seed);
    const lbl = VF_LABEL[l];
    return order.map((i) => {
      const item = VF[i]!;
      return {
        id: `vf:${i}`,
        category: 'vf',
        prompt: l === 'es' ? item.es : item.ca,
        options: [
          { text: lbl.t, correct: item.a },
          { text: lbl.f, correct: !item.a },
        ],
        reveal: l === 'es' ? item.expEs : item.expCa,
      };
    });
  }
  const order = seededOrder(MC.length, seed);
  return order.map((i) => {
    const item = MC[i]!;
    const opts = l === 'es' ? item.optsEs : item.optsCa;
    // Build with the correct answer first, then shuffle the four options once,
    // deterministically (seed + index) so the layout is stable across renders
    // and identical for both duel players.
    const built = opts.map((text, k) => ({ text, correct: k === 0 }));
    const oo = seededOrder(built.length, seed + i * 97 + 7);
    return {
      id: `mon:${i}`,
      category: 'mon',
      prompt: l === 'es' ? item.es : item.ca,
      options: oo.map((k) => built[k]!),
      reveal: l === 'es' ? item.expEs : item.expCa,
    };
  });
}
