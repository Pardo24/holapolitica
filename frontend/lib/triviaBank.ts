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
    ca: 'El Congrés dels Diputats té 350 escons.',
    es: 'El Congreso de los Diputados tiene 350 escaños.',
    a: true,
    expCa: 'Cert: el Congrés té 350 diputats.',
    expEs: 'Cierto: el Congreso tiene 350 diputados.',
  },
  {
    ca: 'El Senat és la cambra alta de les Corts Generals.',
    es: 'El Senado es la cámara alta de las Cortes Generales.',
    a: true,
    expCa: 'Cert: el Senat és la cambra alta; el Congrés, la baixa.',
    expEs: 'Cierto: el Senado es la cámara alta; el Congreso, la baja.',
  },
  {
    ca: "La majoria absoluta al Congrés s'assoleix amb 176 diputats.",
    es: 'La mayoría absoluta en el Congreso se alcanza con 176 diputados.',
    a: true,
    expCa: 'Cert: la meitat de 350 més un.',
    expEs: 'Cierto: la mitad de 350 más uno.',
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
    ca: 'Les eleccions generals a Espanya se celebren, com a màxim, cada quatre anys.',
    es: 'Las elecciones generales en España se celebran, como máximo, cada cuatro años.',
    a: true,
    expCa: 'Cert: la legislatura dura un màxim de quatre anys.',
    expEs: 'Cierto: la legislatura dura un máximo de cuatro años.',
  },
  {
    ca: 'Espanya és una monarquia parlamentària.',
    es: 'España es una monarquía parlamentaria.',
    a: true,
    expCa: 'Cert, segons la Constitució de 1978.',
    expEs: 'Cierto, según la Constitución de 1978.',
  },
  {
    ca: "L'ONU té 193 estats membres.",
    es: 'La ONU tiene 193 Estados miembros.',
    a: true,
    expCa: "Cert des del 2011, amb l'entrada del Sudan del Sud.",
    expEs: 'Cierto desde 2011, con la entrada de Sudán del Sur.',
  },
  {
    ca: "El Consell de Seguretat de l'ONU té cinc membres permanents.",
    es: 'El Consejo de Seguridad de la ONU tiene cinco miembros permanentes.',
    a: true,
    expCa: 'Cert: els EUA, Rússia, la Xina, França i el Regne Unit.',
    expEs: 'Cierto: EE. UU., Rusia, China, Francia y el Reino Unido.',
  },
  {
    ca: 'La Unió Europea té 27 estats membres.',
    es: 'La Unión Europea tiene 27 Estados miembros.',
    a: true,
    expCa: 'Cert des de la sortida del Regne Unit el 2020.',
    expEs: 'Cierto desde la salida del Reino Unido en 2020.',
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
    ca: 'Per votar a les eleccions generals cal tenir 18 anys.',
    es: 'Para votar en las elecciones generales hay que tener 18 años.',
    a: true,
    expCa: "Cert: l'edat mínima per votar és 18 anys.",
    expEs: 'Cierto: la edad mínima para votar es 18 años.',
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
    ca: 'El Tribunal Constitucional espanyol té dotze magistrats.',
    es: 'El Tribunal Constitucional español tiene doce magistrados.',
    a: true,
    expCa: 'Cert: el componen dotze magistrats.',
    expEs: 'Cierto: lo componen doce magistrados.',
  },
  {
    ca: "La Constitució espanyola es va aprovar en referèndum el 1978.",
    es: "La Constitución española se aprobó en referéndum en 1978.",
    a: true,
    expCa: "Cert: el referèndum va ser el 6 de desembre de 1978.",
    expEs: "Cierto: el referéndum fue el 6 de diciembre de 1978.",
  },
  {
    ca: "El Senat pot vetar una llei de manera definitiva.",
    es: "El Senado puede vetar una ley de forma definitiva.",
    a: false,
    expCa: "Fals: el Congrés pot aixecar el veto del Senat i aprovar la llei igualment.",
    expEs: "Falso: el Congreso puede levantar el veto del Senado y aprobar la ley igualmente.",
  },
  {
    ca: "Un reial decret llei s'ha de convalidar al Congrés en els 30 dies següents a la seva publicació.",
    es: "Un real decreto-ley debe convalidarse en el Congreso en los 30 días siguientes a su publicación.",
    a: true,
    expCa: "Cert: si no es convalida en aquest termini, decau.",
    expEs: "Cierto: si no se convalida en ese plazo, decae.",
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
    ca: "Cada província elegeix com a mínim dos diputats.",
    es: "Cada provincia elige como mínimo dos diputados.",
    a: true,
    expCa: "Cert: la resta d'escons es reparteix segons la població.",
    expEs: "Cierto: el resto de escaños se reparte según la población.",
  },
  {
    ca: "Ceuta i Melilla elegeixen un diputat cadascuna.",
    es: "Ceuta y Melilla eligen un diputado cada una.",
    a: true,
    expCa: "Cert: són les dues úniques circumscripcions d'un sol diputat.",
    expEs: "Cierto: son las dos únicas circunscripciones de un solo diputado.",
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
    ca: "La Constitució espanyola té 169 articles.",
    es: "La Constitución española tiene 169 artículos.",
    a: true,
    expCa: "Cert, més les disposicions addicionals, transitòries i finals.",
    expEs: "Cierto, más las disposiciones adicionales, transitorias y finales.",
  },
  {
    ca: "El president del Govern pot dissoldre les Corts i avançar les eleccions.",
    es: "El presidente del Gobierno puede disolver las Cortes y adelantar las elecciones.",
    a: true,
    expCa: "Cert: ho proposa ell i ho decreta el rei.",
    expEs: "Cierto: lo propone él y lo decreta el rey.",
  },
  {
    ca: "Una iniciativa legislativa popular necessita 500.000 signatures.",
    es: "Una iniciativa legislativa popular necesita 500.000 firmas.",
    a: true,
    expCa: "Cert: així ho fixa l'article 87 de la Constitució.",
    expEs: "Cierto: así lo fija el artículo 87 de la Constitución.",
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
    ca: "El mandat d'un senador dura sis anys.",
    es: "El mandato de un senador dura seis años.",
    a: false,
    expCa: "Fals: dura quatre anys, com el dels diputats.",
    expEs: "Falso: dura cuatro años, como el de los diputados.",
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
    ca: "Les eleccions al Parlament Europeu se celebren cada cinc anys.",
    es: "Las elecciones al Parlamento Europeo se celebran cada cinco años.",
    a: true,
    expCa: "Cert: la legislatura europea dura cinc anys.",
    expEs: "Cierto: la legislatura europea dura cinco años.",
  },
  {
    ca: "Espanya és membre de la Unió Europea des de 1986.",
    es: "España es miembro de la Unión Europea desde 1986.",
    a: true,
    expCa: "Cert: hi va entrar l'1 de gener de 1986, junt amb Portugal.",
    expEs: "Cierto: entró el 1 de enero de 1986, junto con Portugal.",
  },
  {
    ca: "Espanya va entrar a l'OTAN el 1982.",
    es: "España entró en la OTAN en 1982.",
    a: true,
    expCa: "Cert, i el 1986 es va fer un referèndum sobre la permanència.",
    expEs: "Cierto, y en 1986 se celebró un referéndum sobre la permanencia.",
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
    ca: "Amb 16 anys es pot votar a les eleccions generals.",
    es: "Con 16 años se puede votar en las elecciones generales.",
    a: false,
    expCa: "Fals: cal ser major d'edat, 18 anys.",
    expEs: "Falso: hay que ser mayor de edad, 18 años.",
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
  {
    ca: "Espanya té 50 províncies.",
    es: "España tiene 50 provincias.",
    a: true,
    expCa: "Cert, més les ciutats autònomes de Ceuta i Melilla.",
    expEs: "Cierto, más las ciudades autónomas de Ceuta y Melilla.",
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
    ca: 'Quants escons té el Congrés dels Diputats?',
    es: '¿Cuántos escaños tiene el Congreso de los Diputados?',
    optsCa: ['350', '300', '400', '250'],
    optsEs: ['350', '300', '400', '250'],
    expCa: 'El Congrés té 350 diputats.',
    expEs: 'El Congreso tiene 350 diputados.',
  },
  {
    ca: 'Quants estats membres té la Unió Europea?',
    es: '¿Cuántos Estados miembros tiene la Unión Europea?',
    optsCa: ['27', '25', '28', '30'],
    optsEs: ['27', '25', '28', '30'],
    expCa: '27 des del 2020.',
    expEs: '27 desde 2020.',
  },
  {
    ca: "Quants membres permanents té el Consell de Seguretat de l'ONU?",
    es: '¿Cuántos miembros permanentes tiene el Consejo de Seguridad de la ONU?',
    optsCa: ['5', '7', '10', '15'],
    optsEs: ['5', '7', '10', '15'],
    expCa: 'Cinc, amb dret de veto.',
    expEs: 'Cinco, con derecho de veto.',
  },
  {
    ca: 'Quants vots calen per a la majoria absoluta al Congrés?',
    es: '¿Cuántos votos hacen falta para la mayoría absoluta en el Congreso?',
    optsCa: ['176', '151', '175', '200'],
    optsEs: ['176', '151', '175', '200'],
    expCa: 'La meitat de 350 més un: 176.',
    expEs: 'La mitad de 350 más uno: 176.',
  },
  {
    ca: 'On té la seu el Banc Central Europeu?',
    es: '¿Dónde tiene su sede el Banco Central Europeo?',
    optsCa: ['Frankfurt', 'Brussel·les', 'Estrasburg', 'Luxemburg'],
    optsEs: ['Fráncfort', 'Bruselas', 'Estrasburgo', 'Luxemburgo'],
    expCa: 'A Frankfurt (Alemanya).',
    expEs: 'En Fráncfort (Alemania).',
  },
  {
    ca: 'Quantes comunitats autònomes té Espanya?',
    es: '¿Cuántas comunidades autónomas tiene España?',
    optsCa: ['17', '15', '16', '19'],
    optsEs: ['17', '15', '16', '19'],
    expCa: '17 comunitats, més dues ciutats autònomes.',
    expEs: '17 comunidades, más dos ciudades autónomas.',
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
    ca: 'Quants anys dura, com a màxim, una legislatura a Espanya?',
    es: '¿Cuántos años dura, como máximo, una legislatura en España?',
    optsCa: ['4', '3', '5', '6'],
    optsEs: ['4', '3', '5', '6'],
    expCa: 'Quatre anys com a màxim.',
    expEs: 'Cuatro años como máximo.',
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
    ca: 'Quina edat mínima cal per votar a Espanya?',
    es: '¿Qué edad mínima se necesita para votar en España?',
    optsCa: ['18', '16', '20', '21'],
    optsEs: ['18', '16', '20', '21'],
    expCa: '18 anys.',
    expEs: '18 años.',
  },
  {
    ca: 'Quantes circumscripcions electorals té el Congrés dels Diputats?',
    es: '¿Cuántas circunscripciones electorales tiene el Congreso de los Diputados?',
    optsCa: ['52', '50', '47', '54'],
    optsEs: ['52', '50', '47', '54'],
    expCa: '52: les 50 províncies més Ceuta i Melilla.',
    expEs: '52: las 50 provincias más Ceuta y Melilla.',
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
    ca: 'Quants magistrats té el Tribunal Constitucional espanyol?',
    es: '¿Cuántos magistrados tiene el Tribunal Constitucional español?',
    optsCa: ['12', '10', '9', '15'],
    optsEs: ['12', '10', '9', '15'],
    expCa: 'Dotze magistrats.',
    expEs: 'Doce magistrados.',
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
    ca: "Quantes signatures calen per a una iniciativa legislativa popular?",
    es: "¿Cuántas firmas hacen falta para una iniciativa legislativa popular?",
    optsCa: ["500.000", "100.000", "1.000.000", "50.000"],
    optsEs: ["500.000", "100.000", "1.000.000", "50.000"],
    expCa: "500.000, segons l'article 87 de la Constitució.",
    expEs: "500.000, según el artículo 87 de la Constitución.",
  },
  {
    ca: "En quin any es va aprovar la Constitució espanyola?",
    es: "¿En qué año se aprobó la Constitución española?",
    optsCa: ["1978", "1975", "1982", "1977"],
    optsEs: ["1978", "1975", "1982", "1977"],
    expCa: "El 1978, en referèndum el 6 de desembre.",
    expEs: "En 1978, en referéndum el 6 de diciembre.",
  },
  {
    ca: "Quants articles té la Constitució espanyola?",
    es: "¿Cuántos artículos tiene la Constitución española?",
    optsCa: ["169", "155", "200", "120"],
    optsEs: ["169", "155", "200", "120"],
    expCa: "169 articles.",
    expEs: "169 artículos.",
  },
  {
    ca: "Quants dies té el Congrés per convalidar un reial decret llei?",
    es: "¿Cuántos días tiene el Congreso para convalidar un real decreto-ley?",
    optsCa: ["30", "15", "60", "90"],
    optsEs: ["30", "15", "60", "90"],
    expCa: "30 dies des de la seva publicació.",
    expEs: "30 días desde su publicación.",
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
    ca: "Quants diputats elegeix cadascuna de les ciutats de Ceuta i Melilla?",
    es: "¿Cuántos diputados elige cada una de las ciudades de Ceuta y Melilla?",
    optsCa: ["1", "2", "3", "Cap"],
    optsEs: ["1", "2", "3", "Ninguno"],
    expCa: "Un diputat cadascuna.",
    expEs: "Un diputado cada una.",
  },
  {
    ca: "Quants diputats elegeix, com a mínim, cada província?",
    es: "¿Cuántos diputados elige, como mínimo, cada provincia?",
    optsCa: ["2", "1", "3", "5"],
    optsEs: ["2", "1", "3", "5"],
    expCa: "Dos com a mínim; la resta, segons la població.",
    expEs: "Dos como mínimo; el resto, según la población.",
  },
  {
    ca: "En quin any va entrar Espanya a la Comunitat Europea?",
    es: "¿En qué año entró España en la Comunidad Europea?",
    optsCa: ["1986", "1982", "1992", "1978"],
    optsEs: ["1986", "1982", "1992", "1978"],
    expCa: "El 1986, junt amb Portugal.",
    expEs: "En 1986, junto con Portugal.",
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
    ca: "Quant dura el mandat d'un senador?",
    es: "¿Cuánto dura el mandato de un senador?",
    optsCa: ["4 anys", "6 anys", "5 anys", "2 anys"],
    optsEs: ["4 años", "6 años", "5 años", "2 años"],
    expCa: "Quatre anys, com els diputats.",
    expEs: "Cuatro años, como los diputados.",
  },
  {
    ca: "Cada quant se celebren les eleccions al Parlament Europeu?",
    es: "¿Cada cuánto se celebran las elecciones al Parlamento Europeo?",
    optsCa: ["Cada 5 anys", "Cada 4 anys", "Cada 6 anys", "Cada 3 anys"],
    optsEs: ["Cada 5 años", "Cada 4 años", "Cada 6 años", "Cada 3 años"],
    expCa: "Cada cinc anys.",
    expEs: "Cada cinco años.",
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
    ca: "Si la llei no diu res, quants dies després de publicar-se al BOE entra en vigor?",
    es: "Si la ley no dice nada, ¿cuántos días después de publicarse en el BOE entra en vigor?",
    optsCa: ["20", "1", "30", "10"],
    optsEs: ["20", "1", "30", "10"],
    expCa: "Vint dies, segons el Codi Civil.",
    expEs: "Veinte días, según el Código Civil.",
  },
  {
    ca: "Quina majoria exigeix una reforma constitucional ordinària a cada cambra?",
    es: "¿Qué mayoría exige una reforma constitucional ordinaria en cada cámara?",
    optsCa: ["Tres cinquenes", "Absoluta", "Dos terços", "Simple"],
    optsEs: ["Tres quintos", "Absoluta", "Dos tercios", "Simple"],
    expCa: "Tres cinquenes, segons l'article 167.",
    expEs: "Tres quintos, según el artículo 167.",
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
    ca: "Quantes províncies té Espanya?",
    es: "¿Cuántas provincias tiene España?",
    optsCa: ["50", "52", "48", "17"],
    optsEs: ["50", "52", "48", "17"],
    expCa: "50, més Ceuta i Melilla.",
    expEs: "50, más Ceuta y Melilla.",
  },
  {
    ca: "En quin any va entrar Espanya a l'OTAN?",
    es: "¿En qué año entró España en la OTAN?",
    optsCa: ["1982", "1986", "1978", "1992"],
    optsEs: ["1982", "1986", "1978", "1992"],
    expCa: "El 1982.",
    expEs: "En 1982.",
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
    ca: "Quants vocals té el Consell General del Poder Judicial, a més del president?",
    es: "¿Cuántos vocales tiene el Consejo General del Poder Judicial, además del presidente?",
    optsCa: ["20", "12", "15", "30"],
    optsEs: ["20", "12", "15", "30"],
    expCa: "Vint vocals.",
    expEs: "Veinte vocales.",
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
  {
    ca: "Quants diputats o senadors calen per presentar un recurs d'inconstitucionalitat?",
    es: "¿Cuántos diputados o senadores hacen falta para presentar un recurso de inconstitucionalidad?",
    optsCa: ["50", "35", "100", "176"],
    optsEs: ["50", "35", "100", "176"],
    expCa: "50 diputats o 50 senadors.",
    expEs: "50 diputados o 50 senadores.",
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
