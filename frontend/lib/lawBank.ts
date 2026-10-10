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
    ca: "Quina majoria necessita una llei orgànica?",
    es: "¿Qué mayoría necesita una ley orgánica?",
    optsCa: ["La majoria absoluta del Congrés", "Més sís que nos", "La unanimitat", "La majoria del Senat"],
    optsEs: ["La mayoría absoluta del Congreso", "Más síes que noes", "La unanimidad", "La mayoría del Senado"],
    expCa: "Més de la meitat de tots els diputats, en una votació final sobre el text sencer. Les lleis ordinàries s'aproven amb més sís que nos.",
    expEs: "Más de la mitad de todos los diputados, en una votación final sobre el texto entero. Las leyes ordinarias se aprueban con más síes que noes.",
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
    ca: "Com pot la ciutadania proposar una llei al Congrés?",
    es: "¿Cómo puede la ciudadanía proponer una ley al Congreso?",
    optsCa: ["Recollint signatures (iniciativa legislativa popular)", "Escrivint a un diputat", "Votant en un referèndum", "No pot"],
    optsEs: ["Recogiendo firmas (iniciativa legislativa popular)", "Escribiendo a un diputado", "Votando en un referéndum", "No puede"],
    expCa: "És la iniciativa legislativa popular. No pot tractar d'impostos, de matèries de llei orgànica ni de relacions internacionals.",
    expEs: "Es la iniciativa legislativa popular. No puede tratar de impuestos, de materias de ley orgánica ni de relaciones internacionales.",
  },
  {
    ca: "Què ha de fer el Congrés amb un reial decret llei del Govern?",
    es: "¿Qué tiene que hacer el Congreso con un real decreto-ley del Gobierno?",
    optsCa: ["Convalidar-lo o derogar-lo", "Esmenar-lo article per article", "Res: ja és definitiu", "Enviar-lo al Senat"],
    optsEs: ["Convalidarlo o derogarlo", "Enmendarlo artículo por artículo", "Nada: ya es definitivo", "Enviarlo al Senado"],
    expCa: "Si el convalida, es queda; si no, deixa de valer. Després pot decidir tramitar-lo també com a projecte de llei per poder-hi fer canvis.",
    expEs: "Si lo convalida, se queda; si no, deja de valer. Después puede decidir tramitarlo también como proyecto de ley para poder introducir cambios.",
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
    ca: "Quan comença a aplicar-se una llei aprovada?",
    es: "¿Cuándo empieza a aplicarse una ley aprobada?",
    optsCa: ["Quan es publica al BOE i passa el termini que fixa", "Quan la vota el Congrés", "Quan la vota el Senat", "Quan la signa el president del Govern"],
    optsEs: ["Cuando se publica en el BOE y pasa el plazo que fija", "Cuando la vota el Congreso", "Cuando la vota el Senado", "Cuando la firma el presidente del Gobierno"],
    expCa: "Abans la sanciona el Rei i es publica al BOE; la mateixa llei diu quan entra en vigor.",
    expEs: "Antes la sanciona el Rey y se publica en el BOE; la propia ley dice cuándo entra en vigor.",
  },
  {
    ca: "Què pot fer el Senat amb una llei aprovada pel Congrés?",
    es: "¿Qué puede hacer el Senado con una ley aprobada por el Congreso?",
    optsCa: ["Aprovar-la, esmenar-la o vetar-la", "Anul·lar-la definitivament", "Res: només en pren nota", "Portar-la a referèndum"],
    optsEs: ["Aprobarla, enmendarla o vetarla", "Anularla definitivamente", "Nada: solo toma nota", "Llevarla a referéndum"],
    expCa: "Si la veta o hi fa canvis, el text torna al Congrés, que té l'última paraula.",
    expEs: "Si la veta o introduce cambios, el texto vuelve al Congreso, que tiene la última palabra.",
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
    optsCa: ['Un grup de diputats o de senadors, entre d’altres', 'Qualsevol ciutadà', 'Qualsevol ajuntament', 'Un sindicat'],
    optsEs: ['Un grupo de diputados o de senadores, entre otros', 'Cualquier ciudadano', 'Cualquier ayuntamiento', 'Un sindicato'],
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
    ca: "Què permet la llei de l'eutanàsia?",
    es: "¿Qué permite la ley de la eutanasia?",
    optsCa: ["Que una persona amb una malaltia greu i incurable demani ajuda per morir, amb requisits", "Que la família decideixi per la persona malalta", "Que el metge decideixi sense el consentiment del pacient", "Només els tractaments pal·liatius"],
    optsEs: ["Que una persona con una enfermedad grave e incurable pida ayuda para morir, con requisitos", "Que la familia decida por la persona enferma", "Que el médico decida sin el consentimiento del paciente", "Solo los tratamientos paliativos"],
    expCa: "Ho ha de demanar la mateixa persona, més d'una vegada, i ho han de validar metges i una comissió.",
    expEs: "Lo tiene que pedir la propia persona, más de una vez, y lo tienen que validar médicos y una comisión.",
  },
  {
    ca: "Què va canviar la reforma laboral del 2022?",
    es: "¿Qué cambió la reforma laboral de 2022?",
    optsCa: ["Va fer del contracte indefinit la norma i va limitar els temporals", "Va permetre l'acomiadament lliure", "Va fixar la setmana laboral de quatre dies", "Va eliminar el salari mínim"],
    optsEs: ["Hizo del contrato indefinido la norma y limitó los temporales", "Permitió el despido libre", "Fijó la semana laboral de cuatro días", "Eliminó el salario mínimo"],
    expCa: "Els contractes temporals queden per a causes concretes. El Congrés la va convalidar per un sol vot de diferència.",
    expEs: "Los contratos temporales quedan para causas concretas. El Congreso la convalidó por un solo voto de diferencia.",
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
    ca: "Què fa la Llei de memòria democràtica?",
    es: "¿Qué hace la Ley de memoria democrática?",
    optsCa: ["Posa a càrrec de l'Estat la recerca i identificació de les víctimes de la Guerra Civil i el franquisme", "Prohibeix parlar de la Guerra Civil", "Reforma la Constitució", "Indemnitza els partits polítics"],
    optsEs: ["Pone a cargo del Estado la búsqueda e identificación de las víctimas de la Guerra Civil y el franquismo", "Prohíbe hablar de la Guerra Civil", "Reforma la Constitución", "Indemniza a los partidos políticos"],
    expCa: "Va substituir la Llei de memòria històrica i fa que la recerca de desapareguts sigui una tasca de l’Estat.",
    expEs: "Sustituyó a la Ley de memoria histórica y hace que la búsqueda de desaparecidos sea una tarea del Estado.",
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
    ca: "Què fa la llei d'amnistia aprovada pel Congrés el 2024?",
    es: "¿Qué hace la ley de amnistía aprobada por el Congreso en 2024?",
    optsCa: ["Extingeix responsabilitats penals i administratives vinculades al procés independentista català", "Convoca un referèndum a Catalunya", "Reforma l'Estatut de Catalunya", "Indulta totes les persones condemnades a Espanya"],
    optsEs: ["Extingue responsabilidades penales y administrativas vinculadas al proceso independentista catalán", "Convoca un referéndum en Cataluña", "Reforma el Estatuto de Cataluña", "Indulta a todas las personas condenadas en España"],
    expCa: "Abasta fets vinculats al procés entre el 2011 i el 2023. Qui hi entra ho decideixen els tribunals.",
    expEs: "Abarca hechos vinculados al proceso entre 2011 y 2023. Quién entra lo deciden los tribunales.",
  },
  {
    ca: "Què és l'ingrés mínim vital?",
    es: "¿Qué es el ingreso mínimo vital?",
    optsCa: ["Una ajuda per a les llars amb pocs ingressos", "Un sou igual per a tothom", "Una pensió de jubilació", "Un descompte als impostos"],
    optsEs: ["Una ayuda para los hogares con pocos ingresos", "Un sueldo igual para todo el mundo", "Una pensión de jubilación", "Un descuento en los impuestos"],
    expCa: "És una prestació de la Seguretat Social per a llars en situació de vulnerabilitat econòmica.",
    expEs: "Es una prestación de la Seguridad Social para hogares en situación de vulnerabilidad económica.",
  },
  {
    ca: "Què va canviar la reforma de l'article 49 de la Constitució?",
    es: "¿Qué cambió la reforma del artículo 49 de la Constitución?",
    optsCa: ["Va substituir «disminuïts» per «persones amb discapacitat»", "Va rebaixar l'edat per votar", "Va canviar el sistema electoral", "Va suprimir el Senat"],
    optsEs: ["Sustituyó «disminuidos» por «personas con discapacidad»", "Rebajó la edad para votar", "Cambió el sistema electoral", "Suprimió el Senado"],
    expCa: "També hi afegeix la protecció de les persones amb discapacitat. És una de les poques reformes que ha tingut la Constitució.",
    expEs: "También añade la protección de las personas con discapacidad. Es una de las pocas reformas que ha tenido la Constitución.",
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
    ca: "La reforma laboral del 2022 va fer del contracte indefinit la norma.",
    es: "La reforma laboral de 2022 hizo del contrato indefinido la norma.",
    a: true,
    expCa: "Cert: els contractes temporals queden per a causes concretes.",
    expEs: "Cierto: los contratos temporales quedan para causas concretas.",
  },
  {
    ca: "Un grup parlamentari pot presentar una proposició de llei.",
    es: "Un grupo parlamentario puede presentar una proposición de ley.",
    a: true,
    expCa: "Cert: també ho poden fer un grup de diputats, el Senat, els parlaments autonòmics o la ciutadania.",
    expEs: "Cierto: también pueden hacerlo un grupo de diputados, el Senado, los parlamentos autonómicos o la ciudadanía.",
  },
  {
    ca: "Si el Congrés no convalida un decret llei, deixa de valer.",
    es: "Si el Congreso no convalida un decreto-ley, deja de valer.",
    a: true,
    expCa: "Cert: queda derogat, encara que fins llavors s'hagi aplicat.",
    expEs: "Cierto: queda derogado, aunque hasta entonces se haya aplicado.",
  },
  {
    ca: "La llei de l’eutanàsia permet que la família decideixi per la persona malalta.",
    es: "La ley de la eutanasia permite que la familia decida por la persona enferma.",
    a: false,
    expCa: "Fals: ho ha de demanar la mateixa persona, més d'una vegada.",
    expEs: "Falso: lo tiene que pedir la propia persona, más de una vez.",
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
