import type { MetadataRoute } from 'next';

/**
 * Web App Manifest. Next.js serves this at /manifest.webmanifest and
 * sets the right Content-Type. Required for Chrome's "Install" prompt
 * and iOS' "Add to Home Screen" to render the right name + icon.
 *
 * Theme color matches the warm-paper background used by the design
 * tokens; standalone display drops the browser chrome on launch.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Hola Política',
    short_name: 'Hola Política',
    description:
      'Què vota cada diputat, en cada votació, classificat per tema. Plataforma cívica oberta — mirall, no megàfon.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#fbf9f4',
    theme_color: '#fbf9f4',
    lang: 'ca',
    categories: ['news', 'government', 'politics'],
    // App-shortcut menu — long-press on iOS / Android lets users jump
    // directly to the most-used surfaces without first hitting the home
    // page. Four entries max so the menu stays readable; ordered by the
    // routes a returning visitor uses most.
    shortcuts: [
      {
        name: 'Crònica del ple',
        short_name: 'Avui',
        description: 'Última sessió plenària del Congrés',
        url: '/avui',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
      {
        name: 'Votacions',
        short_name: 'Votes',
        description: 'Cercador de votacions per tema, grup, data',
        url: '/votes',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
      {
        name: 'Joc cívic',
        short_name: 'Joc',
        description: 'Aprèn jugant les votacions del Congrés',
        url: '/joc',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
      {
        name: 'Notificacions',
        short_name: 'Avisos',
        description: 'Subscriu-te a temes o partits',
        url: '/notifications',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
    ],
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        // Default home-screen icon. SVG renders sharp at every size.
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        // Android adaptive-icon path: without a maskable icon some
        // launchers crop the default `any` icon awkwardly. Listed as
        // a separate entry because Next.js' Manifest type rejects the
        // space-separated "any maskable" combined purpose value the
        // raw spec allows.
        purpose: 'maskable',
      },
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
