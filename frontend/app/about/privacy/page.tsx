import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';

/**
 * Privacy policy for the site and the iOS/Android apps. The App Store and
 * Google Play both require one that describes what the app collects; keep
 * it in step with mobile/ios/App/App/PrivacyInfo.xcprivacy and the store
 * answers in mobile/docs/store-submission.md.
 *
 * Written per locale inline (not in messages/*.json): it is long-form legal
 * text that is edited as a whole, not UI strings.
 */

export const metadata: Metadata = {
  title: 'Privacitat · Hola Política',
  description:
    'Quines dades tracta Hola Política (web i apps): cap rastrejador, correu només si et subscrius, ubicació només al dispositiu.',
};

type Block = { h: string; p: string[] };
type Copy = { eyebrow: string; title: string; updated: string; lede: string; blocks: Block[] };

const CONTACT = 'dades@holapolitica.org';
const UPDATED = '2026-10-08';

const COPY: Record<'ca' | 'es' | 'en', Copy> = {
  ca: {
    eyebrow: 'Sobre',
    title: 'Privacitat',
    updated: 'Darrera actualització',
    lede:
      'Hola Política no té comptes d’usuari, ni publicitat, ni analítica, ni rastrejadors. Aquesta pàgina explica les poques dades que tractem, al web i a les apps per a iOS i Android, i per a què.',
    blocks: [
      {
        h: 'Qui en som responsables',
        p: [
          `Hola Política, projecte cívic independent sense afany de lucre. No té cap vincle amb el Congrés, el Govern ni cap partit. Contacte per a qualsevol qüestió de privacitat: ${CONTACT}.`,
        ],
      },
      {
        h: 'El que NO fem',
        p: [
          'No et demanem registre ni inici de sessió. No fem servir galetes de seguiment, analítica, píxels ni SDK publicitaris, i no venem ni cedim dades a ningú.',
        ],
      },
      {
        h: 'Ubicació (“Troba els meus diputats”)',
        p: [
          'Si toques el botó, el dispositiu et demana permís per a la ubicació. La fem servir només al teu dispositiu per deduir la província i mostrar-te els diputats que la representen. La ubicació no s’envia mai als nostres servidors ni es desa. També pots triar la província a mà.',
        ],
      },
      {
        h: 'Notificacions',
        p: [
          'Si actives els avisos, el sistema (Apple, Google o el teu navegador) genera un identificador de notificacions per a aquest dispositiu. El desem amb els temes o grups que tries, sense cap dada que t’identifiqui, només per enviar-te aquests avisos. A les apps, l’enviament passa per Firebase Cloud Messaging (Google), que actua com a encarregat. Si desactives els avisos, l’identificador s’esborra.',
        ],
      },
      {
        h: 'Newsletter i alertes per correu',
        p: [
          'Només si t’hi subscrius: desem el teu correu, l’idioma i els temes triats, per enviar-te el resum setmanal o les alertes que has demanat. Cal confirmar la subscripció des del correu. Cada missatge porta un enllaç per canviar preferències o donar-te de baixa; en donar-te de baixa deixem d’enviar-te res.',
        ],
      },
      {
        h: 'Pregunta del dia i jocs',
        p: [
          'Quan respons la pregunta del dia, només sumem un vot anònim a l’opció triada (un comptador global). Les teves puntuacions i preferències es desen només al teu dispositiu (emmagatzematge local del navegador o de l’app).',
        ],
      },
      {
        h: 'Dades tècniques',
        p: [
          'Com qualsevol web, els servidors registren temporalment dades tècniques de les peticions (adreça IP, data, pàgina) per seguretat i per resoldre errors. No les fem servir per identificar ningú. L’única galeta és la de l’idioma triat. El web s’allotja a Vercel i les dades del servei, en un servidor a la Unió Europea (Hetzner, Alemanya).',
        ],
      },
      {
        h: 'Base legal, conservació i drets',
        p: [
          'Tractem el correu i l’identificador de notificacions amb el teu consentiment, que pots retirar quan vulguis. Els conservem mentre la subscripció estigui activa. Pots exercir els drets d’accés, rectificació, supressió, oposició, limitació i portabilitat escrivint a ' +
            CONTACT +
            ', i reclamar davant l’Agència Espanyola de Protecció de Dades (aepd.es).',
        ],
      },
      {
        h: 'Menors',
        p: [
          'Hola Política és informació pública per a tothom i no està adreçada específicament a menors de 14 anys. No en recollim dades conscientment.',
        ],
      },
    ],
  },
  es: {
    eyebrow: 'Sobre',
    title: 'Privacidad',
    updated: 'Última actualización',
    lede:
      'Hola Política no tiene cuentas de usuario, ni publicidad, ni analítica, ni rastreadores. Esta página explica los pocos datos que tratamos, en la web y en las apps para iOS y Android, y para qué.',
    blocks: [
      {
        h: 'Quién es responsable',
        p: [
          `Hola Política, proyecto cívico independiente sin ánimo de lucro. No tiene vínculo con el Congreso, el Gobierno ni ningún partido. Contacto para cualquier cuestión de privacidad: ${CONTACT}.`,
        ],
      },
      {
        h: 'Lo que NO hacemos',
        p: [
          'No pedimos registro ni inicio de sesión. No usamos cookies de seguimiento, analítica, píxeles ni SDK publicitarios, y no vendemos ni cedemos datos a nadie.',
        ],
      },
      {
        h: 'Ubicación («Encuentra a mis diputados»)',
        p: [
          'Si tocas el botón, el dispositivo te pide permiso para la ubicación. La usamos solo en tu dispositivo para deducir la provincia y mostrarte los diputados que la representan. La ubicación nunca se envía a nuestros servidores ni se guarda. También puedes elegir la provincia a mano.',
        ],
      },
      {
        h: 'Notificaciones',
        p: [
          'Si activas los avisos, el sistema (Apple, Google o tu navegador) genera un identificador de notificaciones para este dispositivo. Lo guardamos con los temas o grupos que elijas, sin ningún dato que te identifique, solo para enviarte esos avisos. En las apps, el envío pasa por Firebase Cloud Messaging (Google), que actúa como encargado. Si desactivas los avisos, el identificador se borra.',
        ],
      },
      {
        h: 'Newsletter y alertas por correo',
        p: [
          'Solo si te suscribes: guardamos tu correo, el idioma y los temas elegidos, para enviarte el resumen semanal o las alertas que has pedido. Hay que confirmar la suscripción desde el correo. Cada mensaje lleva un enlace para cambiar preferencias o darte de baja; al darte de baja dejamos de enviarte nada.',
        ],
      },
      {
        h: 'Pregunta del día y juegos',
        p: [
          'Cuando respondes la pregunta del día, solo sumamos un voto anónimo a la opción elegida (un contador global). Tus puntuaciones y preferencias se guardan solo en tu dispositivo (almacenamiento local del navegador o de la app).',
        ],
      },
      {
        h: 'Datos técnicos',
        p: [
          'Como cualquier web, los servidores registran temporalmente datos técnicos de las peticiones (dirección IP, fecha, página) por seguridad y para resolver errores. No los usamos para identificar a nadie. La única cookie es la del idioma elegido. La web se aloja en Vercel y los datos del servicio, en un servidor en la Unión Europea (Hetzner, Alemania).',
        ],
      },
      {
        h: 'Base legal, conservación y derechos',
        p: [
          'Tratamos el correo y el identificador de notificaciones con tu consentimiento, que puedes retirar cuando quieras. Los conservamos mientras la suscripción esté activa. Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a ' +
            CONTACT +
            ', y reclamar ante la Agencia Española de Protección de Datos (aepd.es).',
        ],
      },
      {
        h: 'Menores',
        p: [
          'Hola Política es información pública para todo el mundo y no está dirigida específicamente a menores de 14 años. No recogemos sus datos de forma consciente.',
        ],
      },
    ],
  },
  en: {
    eyebrow: 'About',
    title: 'Privacy',
    updated: 'Last updated',
    lede:
      'Hola Política has no user accounts, no ads, no analytics and no trackers. This page explains the little data we handle, on the website and in the iOS and Android apps, and why.',
    blocks: [
      {
        h: 'Who is responsible',
        p: [
          `Hola Política, an independent, non-profit civic project. It has no ties to the Spanish Congress, the Government or any party. Privacy contact: ${CONTACT}.`,
        ],
      },
      {
        h: 'What we do NOT do',
        p: [
          'No sign-up or login. No tracking cookies, analytics, pixels or advertising SDKs, and we never sell or share data with anyone.',
        ],
      },
      {
        h: 'Location (“Find my deputies”)',
        p: [
          'If you tap the button, your device asks for location permission. We use it only on your device, to work out your province and show the deputies who represent it. Your location is never sent to our servers or stored. You can also pick your province by hand.',
        ],
      },
      {
        h: 'Notifications',
        p: [
          'If you turn alerts on, the system (Apple, Google or your browser) creates a notification identifier for this device. We store it with the topics or groups you pick, with nothing that identifies you, only to send you those alerts. In the apps, delivery goes through Firebase Cloud Messaging (Google), acting as a processor. Turning alerts off deletes the identifier.',
        ],
      },
      {
        h: 'Newsletter and email alerts',
        p: [
          'Only if you subscribe: we store your email address, language and chosen topics to send you the weekly digest or the alerts you asked for. You confirm the subscription from your inbox. Every message has a link to change preferences or unsubscribe; once you unsubscribe we stop sending anything.',
        ],
      },
      {
        h: 'Question of the day and games',
        p: [
          'When you answer the question of the day, we only add one anonymous vote to the option you picked (a global counter). Your scores and preferences stay on your device (the browser’s or app’s local storage).',
        ],
      },
      {
        h: 'Technical data',
        p: [
          'Like any website, our servers briefly log technical request data (IP address, time, page) for security and to fix errors. We do not use it to identify anyone. The only cookie stores your chosen language. The website is hosted on Vercel and the service data on a server in the European Union (Hetzner, Germany).',
        ],
      },
      {
        h: 'Legal basis, retention and your rights',
        p: [
          'We process your email and notification identifier with your consent, which you can withdraw at any time, and keep them while the subscription is active. You can exercise your rights of access, rectification, erasure, objection, restriction and portability by writing to ' +
            CONTACT +
            ', and complain to the Spanish Data Protection Agency (aepd.es).',
        ],
      },
      {
        h: 'Children',
        p: [
          'Hola Política is public information for everyone and is not specifically aimed at children under 14. We do not knowingly collect their data.',
        ],
      },
    ],
  },
};

export default async function PrivacyPage() {
  const locale = await getLocale();
  const c = COPY[(locale in COPY ? locale : 'ca') as keyof typeof COPY];

  return (
    <article style={{ maxWidth: 760, paddingTop: 24, paddingBottom: 64 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        {c.eyebrow}
      </div>
      <h1 className="h-headline" style={{ margin: '6px 0 14px' }}>
        {c.title}
      </h1>
      <p style={{ fontSize: 16, color: 'var(--ink-2)', lineHeight: 1.6, margin: '0 0 8px' }}>
        {c.lede}
      </p>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '0 0 12px' }}>
        {c.updated}: {UPDATED}
      </p>
      {c.blocks.map((b) => (
        <section key={b.h} style={{ paddingTop: 20, paddingBottom: 4 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: 'var(--ink)' }}>
            {b.h}
          </h2>
          {b.p.map((para) => (
            <p key={para.slice(0, 32)} style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.65, margin: '0 0 8px' }}>
              {para}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
