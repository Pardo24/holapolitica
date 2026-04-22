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
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
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
