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
