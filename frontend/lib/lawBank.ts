/**
 * Trivia questions about laws: how a law is made (majorities, deadlines, who
 * can propose one, the BOE, the Senate) and well-known laws of recent years.
 * Laws are what the site is about, so the "Lleis" category and the Corona
 * draw on these as well as on real votes.
 *
 * Same rules as the rest of the bank (lib/triviaBank.ts): verifiable facts
 * only, the procedure as the Constitution and the Reglament set it, and for
 * named laws what they established and when, never whether it was right.
 * The first option of each multiple-choice item is the correct one; the
 * options are shuffled per round.
 */
import type { DuelQuestion } from '@/lib/triviaBank';

type Lang = 'ca' | 'es';
const lang2 = (lang: string): Lang => (lang.toLowerCase().startsWith('es') ? 'es' : 'ca');

interface LawMC {
  ca: string;
  es: string;
  optsCa: [string, string, string, string];
  optsEs: [string, string, string, string];
  expCa: string;
  expEs: string;
}

interface LawVF {
  ca: string;
  es: string;
  a: boolean;
  expCa: string;
  expEs: string;
}

const MC: LawMC[] = [
  {
    ca: 'Quants vots calen al Congrés per aprovar una llei orgànica?',
    es: '¿Cuántos votos hacen falta en el Congreso para aprobar una ley orgánica?',
    optsCa: ['176, la majoria absoluta', 'Més sís que nos', '210, tres cinquenes parts', '233, dos terços'],
    optsEs: ['176, la mayoría absoluta', 'Más síes que noes', '210, tres quintos', '233, dos tercios'],
    expCa: "Les lleis orgàniques necessiten la majoria absoluta (176 de 350) en una votació final sobre el text sencer.",
    expEs: 'Las leyes orgánicas necesitan la mayoría absoluta (176 de 350) en una votación final sobre el texto entero.',
  },
  {
    ca: 'Qui presenta un projecte de llei?',
    es: '¿Quién presenta un proyecto de ley?',
    optsCa: ['El Govern', 'Un grup parlamentari', 'El Senat', 'El Tribunal Constitucional'],
    optsEs: ['El Gobierno', 'Un grupo parlamentario', 'El Senado', 'El Tribunal Constitucional'],
    expCa: "Projecte de llei, si el proposa el Govern; proposició de llei, si la proposa un grup o quinze diputats.",
    expEs: 'Proyecto de ley, si lo propone el Gobierno; proposición de ley, si la propone un grupo o quince diputados.',
  },
  {
    ca: 'Quantes signatures calen perquè la ciutadania proposi una llei?',
    es: '¿Cuántas firmas hacen falta para que la ciudadanía proponga una ley?',
    optsCa: ['500.000', '50.000', '100.000', '1.000.000'],
    optsEs: ['500.000', '50.000', '100.000', '1.000.000'],
    expCa: "La iniciativa legislativa popular necessita 500.000 signatures (article 87.3 de la Constitució).",
    expEs: 'La iniciativa legislativa popular necesita 500.000 firmas (artículo 87.3 de la Constitución).',
  },
  {
    ca: 'Quants dies té el Congrés per convalidar o derogar un reial decret llei?',
    es: '¿Cuántos días tiene el Congreso para convalidar o derogar un real decreto-ley?',
    optsCa: ['30', '15', '60', '90'],
    optsEs: ['30', '15', '60', '90'],
    expCa: 'Trenta dies des que es publica; si no el convalida, queda derogat.',
    expEs: 'Treinta días desde su publicación; si no lo convalida, queda derogado.',
  },
  {
    ca: 'On es publiquen les lleis perquè entrin en vigor?',
    es: '¿Dónde se publican las leyes para que entren en vigor?',
    optsCa: ["Al Butlletí Oficial de l'Estat (BOE)", 'Al Diari de Sessions del Congrés', 'Al web del Govern', 'Als diaris'],
    optsEs: ['En el Boletín Oficial del Estado (BOE)', 'En el Diario de Sesiones del Congreso', 'En la web del Gobierno', 'En los periódicos'],
    expCa: 'Una llei entra en vigor quan es publica al BOE i passa el termini que fixa.',
    expEs: 'Una ley entra en vigor cuando se publica en el BOE y pasa el plazo que fija.',
  },
  {
    ca: 'Si una llei no diu quan entra en vigor, quan ho fa?',
    es: 'Si una ley no dice cuándo entra en vigor, ¿cuándo lo hace?',
    optsCa: ['Als 20 dies de publicar-se al BOE', "L'endemà de publicar-se", 'Al cap d’un mes', 'Quan la signa el Rei'],
    optsEs: ['A los 20 días de publicarse en el BOE', 'Al día siguiente de publicarse', 'Al cabo de un mes', 'Cuando la firma el Rey'],
    expCa: 'Ho diu el Codi Civil: si la llei no fixa una altra data, entra en vigor als vint dies de publicar-se.',
    expEs: 'Lo dice el Código Civil: si la ley no fija otra fecha, entra en vigor a los veinte días de publicarse.',
  },
  {
    ca: 'Quant temps té el Senat per esmenar o vetar una llei aprovada pel Congrés?',
    es: '¿Cuánto tiempo tiene el Senado para enmendar o vetar una ley aprobada por el Congreso?',
    optsCa: ['Dos mesos', 'Dues setmanes', 'Sis mesos', 'Un any'],
    optsEs: ['Dos meses', 'Dos semanas', 'Seis meses', 'Un año'],
    expCa: 'Dos mesos, o vint dies si el Govern o el Congrés la declaren urgent.',
    expEs: 'Dos meses, o veinte días si el Gobierno o el Congreso la declaran urgente.',
  },
  {
    ca: 'Si el Senat veta una llei, què pot fer el Congrés?',
    es: 'Si el Senado veta una ley, ¿qué puede hacer el Congreso?',
    optsCa: [
      "Aixecar el veto: amb majoria absoluta de seguida, o simple al cap de dos mesos",
      'Res: la llei queda rebutjada',
      'Portar-la al Tribunal Constitucional',
      'Convocar un referèndum',
    ],
    optsEs: [
      'Levantar el veto: con mayoría absoluta enseguida, o simple a los dos meses',
      'Nada: la ley queda rechazada',
      'Llevarla al Tribunal Constitucional',
      'Convocar un referéndum',
    ],
    expCa: "El Congrés té l'última paraula: pot aixecar el veto i aprovar la llei.",
    expEs: 'El Congreso tiene la última palabra: puede levantar el veto y aprobar la ley.',
  },
  {
    ca: 'Qui sanciona i promulga les lleis?',
    es: '¿Quién sanciona y promulga las leyes?',
    optsCa: ['El Rei', 'El president del Govern', 'La presidència del Congrés', 'El Tribunal Constitucional'],
    optsEs: ['El Rey', 'El presidente del Gobierno', 'La presidencia del Congreso', 'El Tribunal Constitucional'],
    expCa: "El Rei les sanciona en quinze dies i n'ordena la publicació; no les pot vetar.",
    expEs: 'El Rey las sanciona en quince días y ordena su publicación; no puede vetarlas.',
  },
  {
    ca: 'Què és una proposició no de llei (PNL)?',
    es: '¿Qué es una proposición no de ley (PNL)?',
    optsCa: [
      'Una proposta que demana coses al Govern però no canvia cap llei',
      'Una llei aprovada sense votació',
      'Una llei que proposa el Senat',
      'Una llei aprovada per decret',
    ],
    optsEs: [
      'Una propuesta que pide cosas al Gobierno pero no cambia ninguna ley',
      'Una ley aprobada sin votación',
      'Una ley que propone el Senado',
      'Una ley aprobada por decreto',
    ],
    expCa: "Si s'aprova, és la posició del Congrés, però el Govern no està obligat a complir-la.",
    expEs: 'Si se aprueba, es la posición del Congreso, pero el Gobierno no está obligado a cumplirla.',
  },
  {
    ca: 'Quin tipus de llei regula els drets fonamentals?',
    es: '¿Qué tipo de ley regula los derechos fundamentales?',
    optsCa: ['Una llei orgànica', 'Una llei ordinària', 'Un reial decret', 'Una ordre ministerial'],
    optsEs: ['Una ley orgánica', 'Una ley ordinaria', 'Un real decreto', 'Una orden ministerial'],
    expCa: "També el règim electoral i els estatuts d'autonomia: per això demanen majoria absoluta.",
    expEs: 'También el régimen electoral y los estatutos de autonomía: por eso piden mayoría absoluta.',
  },
  {
    ca: 'Quina d’aquestes coses NO es pot regular amb un decret llei?',
    es: '¿Cuál de estas cosas NO se puede regular con un decreto-ley?',
    optsCa: ['Els drets fonamentals', 'Ajudes urgents per una catàstrofe', 'Mesures econòmiques urgents', 'La pròrroga d’unes ajudes'],
    optsEs: ['Los derechos fundamentales', 'Ayudas urgentes por una catástrofe', 'Medidas económicas urgentes', 'La prórroga de unas ayudas'],
    expCa: 'La Constitució ho prohibeix, igual que tocar el règim electoral o les institucions bàsiques.',
    expEs: 'La Constitución lo prohíbe, igual que tocar el régimen electoral o las instituciones básicas.',
  },
  {
    ca: "Què passa si no s'aproven uns pressupostos nous a temps?",
    es: '¿Qué pasa si no se aprueban unos presupuestos nuevos a tiempo?',
    optsCa: ["Es prorroguen els de l'any anterior", "L'Estat no pot gastar", 'Hi ha eleccions automàticament', 'Els aprova el Senat'],
    optsEs: ['Se prorrogan los del año anterior', 'El Estado no puede gastar', 'Hay elecciones automáticamente', 'Los aprueba el Senado'],
    expCa: 'Els pressupostos anteriors continuen vigents fins que se n’aprovin uns de nous.',
    expEs: 'Los presupuestos anteriores siguen vigentes hasta que se aprueben unos nuevos.',
  },
  {
    ca: "Qui pot recórrer una llei davant del Tribunal Constitucional?",
    es: '¿Quién puede recurrir una ley ante el Tribunal Constitucional?',
    optsCa: ['50 diputats o 50 senadors, entre d’altres', 'Qualsevol ciutadà', 'Qualsevol ajuntament', 'Un sindicat'],
    optsEs: ['50 diputados o 50 senadores, entre otros', 'Cualquier ciudadano', 'Cualquier ayuntamiento', 'Un sindicato'],
    expCa: 'També el president del Govern, el Defensor del Poble i els governs i parlaments autonòmics.',
    expEs: 'También el presidente del Gobierno, el Defensor del Pueblo y los gobiernos y parlamentos autonómicos.',
  },
  {
    ca: 'Què és una esmena a la totalitat?',
    es: '¿Qué es una enmienda a la totalidad?',
    optsCa: [
      'Una proposta per retornar el projecte o canviar-ne tot el text',
      "Un canvi a un sol article",
      'Una moció de censura',
      'Un recurs al Tribunal Constitucional',
    ],
    optsEs: [
      'Una propuesta para devolver el proyecto o cambiar todo su texto',
      'Un cambio en un solo artículo',
      'Una moción de censura',
      'Un recurso al Tribunal Constitucional',
    ],
    expCa: "Si el Ple l'aprova, la llei s'acaba aquí; si la rebutja, continua el seu camí.",
    expEs: 'Si el Pleno la aprueba, la ley termina aquí; si la rechaza, sigue su camino.',
  },
  {
    ca: "Quin any es va aprovar la llei que regula l'eutanàsia?",
    es: '¿En qué año se aprobó la ley que regula la eutanasia?',
    optsCa: ['2021', '2015', '2019', '2023'],
    optsEs: ['2021', '2015', '2019', '2023'],
    expCa: "La Llei orgànica 3/2021, de regulació de l'eutanàsia.",
    expEs: 'La Ley Orgánica 3/2021, de regulación de la eutanasia.',
  },
  {
    ca: 'Per quants vots de diferència es va convalidar la reforma laboral del 2022?',
    es: '¿Por cuántos votos de diferencia se convalidó la reforma laboral de 2022?',
    optsCa: ['Un vot', 'Deu vots', 'Cinquanta vots', 'Per unanimitat'],
    optsEs: ['Un voto', 'Diez votos', 'Cincuenta votos', 'Por unanimidad'],
    expCa: 'El Congrés la va convalidar per 175 vots a favor i 174 en contra, el febrer del 2022.',
    expEs: 'El Congreso la convalidó por 175 votos a favor y 174 en contra, en febrero de 2022.',
  },
  {
    ca: "Què permet la Llei del dret a l'habitatge del 2023?",
    es: '¿Qué permite la Ley por el derecho a la vivienda de 2023?',
    optsCa: [
      'Limitar els preus del lloguer en zones de mercat tensionat',
      'Prohibir el lloguer turístic a tot Espanya',
      'Congelar totes les hipoteques',
      "Expropiar qualsevol pis buit",
    ],
    optsEs: [
      'Limitar los precios del alquiler en zonas de mercado tensionado',
      'Prohibir el alquiler turístico en toda España',
      'Congelar todas las hipotecas',
      'Expropiar cualquier piso vacío',
    ],
    expCa: "Les comunitats poden declarar zones tensionades, on s'hi poden contenir els preus del lloguer.",
    expEs: 'Las comunidades pueden declarar zonas tensionadas, donde se pueden contener los precios del alquiler.',
  },
  {
    ca: "Què va establir l'anomenada «llei rider» del 2021?",
    es: '¿Qué estableció la llamada «ley rider» de 2021?',
    optsCa: [
      'Que els repartidors de plataformes es consideren assalariats',
      'Que els repartidors han de ser autònoms',
      'Que es prohibeixen les plataformes de repartiment',
      'Que els repartidors cobren per comanda',
    ],
    optsEs: [
      'Que los repartidores de plataformas se consideran asalariados',
      'Que los repartidores deben ser autónomos',
      'Que se prohíben las plataformas de reparto',
      'Que los repartidores cobran por pedido',
    ],
    expCa: 'La llei presumeix que hi ha relació laboral quan una plataforma digital organitza la feina.',
    expEs: 'La ley presume que hay relación laboral cuando una plataforma digital organiza el trabajo.',
  },
  {
    ca: 'De quin any és la Llei de memòria democràtica?',
    es: '¿De qué año es la Ley de memoria democrática?',
    optsCa: ['2022', '2007', '2015', '2019'],
    optsEs: ['2022', '2007', '2015', '2019'],
    expCa: 'La Llei 20/2022. La del 2007 era la Llei de memòria històrica, que va substituir.',
    expEs: 'La Ley 20/2022. La de 2007 era la Ley de memoria histórica, a la que sustituyó.',
  },
  {
    ca: 'Què posa al centre la llei de llibertat sexual del 2022, coneguda com «només sí és sí»?',
    es: '¿Qué pone en el centro la ley de libertad sexual de 2022, conocida como «solo sí es sí»?',
    optsCa: ['El consentiment', 'La denúncia en 72 hores', 'Un informe mèdic', 'Dos testimonis'],
    optsEs: ['El consentimiento', 'La denuncia en 72 horas', 'Un informe médico', 'Dos testigos'],
    expCa: 'La Llei orgànica 10/2022 defineix les agressions sexuals a partir de l’absència de consentiment.',
    expEs: 'La Ley Orgánica 10/2022 define las agresiones sexuales a partir de la ausencia de consentimiento.',
  },
  {
    ca: "Quin any es va aprovar la llei d'amnistia vinculada al procés independentista català?",
    es: '¿En qué año se aprobó la ley de amnistía vinculada al proceso independentista catalán?',
    optsCa: ['2024', '2017', '2021', '2026'],
    optsEs: ['2024', '2017', '2021', '2026'],
    expCa: 'La Llei orgànica 1/2024, aprovada definitivament pel Congrés el maig del 2024.',
    expEs: 'La Ley Orgánica 1/2024, aprobada definitivamente por el Congreso en mayo de 2024.',
  },
  {
    ca: "Quin any es va crear l'ingrés mínim vital?",
    es: '¿En qué año se creó el ingreso mínimo vital?',
    optsCa: ['2020', '2012', '2016', '2023'],
    optsEs: ['2020', '2012', '2016', '2023'],
    expCa: 'Amb el Reial decret llei 20/2020, convalidat pel Congrés i tramitat després com a llei.',
    expEs: 'Con el Real Decreto-ley 20/2020, convalidado por el Congreso y tramitado después como ley.',
  },
  {
    ca: "Quin any es va reformar l'article 49 de la Constitució per treure la paraula «disminuïts»?",
    es: '¿En qué año se reformó el artículo 49 de la Constitución para quitar la palabra «disminuidos»?',
    optsCa: ['2024', '1992', '2011', '2018'],
    optsEs: ['2024', '1992', '2011', '2018'],
    expCa: 'Ara parla de «persones amb discapacitat». És la tercera reforma de la Constitució.',
    expEs: 'Ahora habla de «personas con discapacidad». Es la tercera reforma de la Constitución.',
  },
  {
    ca: 'A què va tornar a vincular les pensions la reforma del 2021?',
    es: '¿A qué volvió a vincular las pensiones la reforma de 2021?',
    optsCa: ["A l'IPC (la inflació)", 'Al salari mínim', 'Al PIB', "A l'atur"],
    optsEs: ['Al IPC (la inflación)', 'Al salario mínimo', 'Al PIB', 'Al paro'],
    expCa: "Les pensions es revaloritzen cada any segons la inflació mitjana de l'any anterior.",
    expEs: 'Las pensiones se revalorizan cada año según la inflación media del año anterior.',
  },
];

const VF: LawVF[] = [
  {
    ca: 'Una proposició no de llei obliga el Govern a complir-la.',
    es: 'Una proposición no de ley obliga al Gobierno a cumplirla.',
    a: false,
    expCa: 'Fals: fixa la posició del Congrés, però no és una llei.',
    expEs: 'Falso: fija la posición del Congreso, pero no es una ley.',
  },
  {
    ca: 'Un reial decret llei ja és vigent abans que el Congrés el voti.',
    es: 'Un real decreto-ley ya está vigente antes de que el Congreso lo vote.',
    a: true,
    expCa: 'Cert: té força de llei des que es publica; el Congrés el convalida o el deroga després.',
    expEs: 'Cierto: tiene fuerza de ley desde que se publica; el Congreso lo convalida o lo deroga después.',
  },
  {
    ca: 'Una llei pot quedar aprovada sense passar pel Congrés.',
    es: 'Una ley puede quedar aprobada sin pasar por el Congreso.',
    a: false,
    expCa: 'Fals: totes les lleis passen pel Congrés, que té l’última paraula.',
    expEs: 'Falso: todas las leyes pasan por el Congreso, que tiene la última palabra.',
  },
  {
    ca: 'Si es rebutja una esmena, la llei sencera queda rebutjada.',
    es: 'Si se rechaza una enmienda, la ley entera queda rechazada.',
    a: false,
    expCa: 'Fals: una esmena és un canvi proposat; la llei es decideix en la votació final.',
    expEs: 'Falso: una enmienda es un cambio propuesto; la ley se decide en la votación final.',
  },
  {
    ca: 'Una iniciativa legislativa popular pot proposar un impost nou.',
    es: 'Una iniciativa legislativa popular puede proponer un impuesto nuevo.',
    a: false,
    expCa: 'Fals: la Constitució n’exclou els impostos, les lleis orgàniques i la gràcia.',
    expEs: 'Falso: la Constitución excluye los impuestos, las leyes orgánicas y la gracia.',
  },
  {
    ca: 'El Rei pot negar-se a sancionar una llei aprovada per les Corts.',
    es: 'El Rey puede negarse a sancionar una ley aprobada por las Cortes.',
    a: false,
    expCa: 'Fals: l’ha de sancionar en quinze dies; no té dret de veto.',
    expEs: 'Falso: debe sancionarla en quince días; no tiene derecho de veto.',
  },
  {
    ca: 'Quan es dissolen les Corts per eleccions, la majoria d’iniciatives en tràmit caduquen.',
    es: 'Cuando se disuelven las Cortes por elecciones, la mayoría de iniciativas en trámite caducan.',
    a: true,
    expCa: 'Cert: s’han de tornar a presentar a la nova legislatura.',
    expEs: 'Cierto: se tienen que volver a presentar en la nueva legislatura.',
  },
  {
    ca: 'Qualsevol grup parlamentari pot presentar la Llei de Pressupostos.',
    es: 'Cualquier grupo parlamentario puede presentar la Ley de Presupuestos.',
    a: false,
    expCa: 'Fals: només la pot presentar el Govern.',
    expEs: 'Falso: solo la puede presentar el Gobierno.',
  },
  {
    ca: 'Una llei entra en vigor el mateix dia que l’aprova el Congrés.',
    es: 'Una ley entra en vigor el mismo día que la aprueba el Congreso.',
    a: false,
    expCa: 'Fals: abans l’ha de sancionar el Rei i s’ha de publicar al BOE.',
    expEs: 'Falso: antes la tiene que sancionar el Rey y se tiene que publicar en el BOE.',
  },
  {
    ca: 'El Tribunal Constitucional pot anul·lar una llei si és contrària a la Constitució.',
    es: 'El Tribunal Constitucional puede anular una ley si es contraria a la Constitución.',
    a: true,
    expCa: 'Cert: és qui decideix si una llei respecta la Constitució.',
    expEs: 'Cierto: es quien decide si una ley respeta la Constitución.',
  },
  {
    ca: 'Algunes lleis les pot aprovar una comissió sense que les voti el Ple.',
    es: 'Algunas leyes las puede aprobar una comisión sin que las vote el Pleno.',
    a: true,
    expCa: 'Cert: és la competència legislativa plena; no s’hi permet per a lleis orgàniques ni pressupostos.',
    expEs: 'Cierto: es la competencia legislativa plena; no se permite para leyes orgánicas ni presupuestos.',
  },
  {
    ca: 'Per reformar la Constitució sempre cal un referèndum.',
    es: 'Para reformar la Constitución siempre hace falta un referéndum.',
    a: false,
    expCa: 'Fals: en la reforma ordinària només n’hi ha si ho demana una desena part d’alguna cambra.',
    expEs: 'Falso: en la reforma ordinaria solo lo hay si lo pide una décima parte de alguna cámara.',
  },
  {
    ca: 'La reforma laboral del 2022 es va convalidar per un sol vot de diferència.',
    es: 'La reforma laboral de 2022 se convalidó por un solo voto de diferencia.',
    a: true,
    expCa: 'Cert: 175 vots a favor i 174 en contra.',
    expEs: 'Cierto: 175 votos a favor y 174 en contra.',
  },
  {
    ca: 'Quinze diputats poden presentar una proposició de llei.',
    es: 'Quince diputados pueden presentar una proposición de ley.',
    a: true,
    expCa: 'Cert: també ho pot fer un grup parlamentari amb la signatura del seu portaveu.',
    expEs: 'Cierto: también lo puede hacer un grupo parlamentario con la firma de su portavoz.',
  },
  {
    ca: 'Si el Congrés no convalida un decret llei en 30 dies, queda derogat.',
    es: 'Si el Congreso no convalida un decreto-ley en 30 días, queda derogado.',
    a: true,
    expCa: 'Cert: deixa de valer, encara que fins llavors s’hagi aplicat.',
    expEs: 'Cierto: deja de valer, aunque hasta entonces se haya aplicado.',
  },
  {
    ca: 'La llei que regula l’eutanàsia es va aprovar el 2021.',
    es: 'La ley que regula la eutanasia se aprobó en 2021.',
    a: true,
    expCa: 'Cert: la Llei orgànica 3/2021.',
    expEs: 'Cierto: la Ley Orgánica 3/2021.',
  },
];

function seededOrder(length: number, seed: number): number[] {
  let s = (seed ^ 0x51ed27) >>> 0;
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

/** The law questions for a round, deterministic per seed (both players of a
 *  duel get the same ones, in the same order). */
export function lawBankQuestions(lang: string, seed: number): DuelQuestion[] {
  const l = lang2(lang);
  const yes = l === 'es' ? 'Verdadero' : 'Veritat';
  const no = l === 'es' ? 'Falso' : 'Fals';
  const mc: DuelQuestion[] = MC.map((item, i) => {
    const opts = l === 'es' ? item.optsEs : item.optsCa;
    const built = opts.map((text, k) => ({ text, correct: k === 0 }));
    const order = seededOrder(built.length, seed + i * 131 + 3);
    return {
      id: `llei-mc:${i}`,
      category: 'lleis',
      prompt: l === 'es' ? item.es : item.ca,
      options: order.map((k) => built[k]!),
      reveal: l === 'es' ? item.expEs : item.expCa,
    };
  });
  const vf: DuelQuestion[] = VF.map((item, i) => ({
    id: `llei-vf:${i}`,
    category: 'lleis',
    prompt: l === 'es' ? item.es : item.ca,
    options: [
      { text: yes, correct: item.a },
      { text: no, correct: !item.a },
    ],
    reveal: l === 'es' ? item.expEs : item.expCa,
  }));
  const all = [...mc, ...vf];
  return seededOrder(all.length, seed).map((i) => all[i]!);
}

/** Interleave two lists: a, b, a, b... then whatever is left of the longer. */
export function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (i < a.length) out.push(a[i]!);
    if (i < b.length) out.push(b[i]!);
  }
  return out;
}
