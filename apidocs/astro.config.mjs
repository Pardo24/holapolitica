// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// docs.holapolitica.org — technical reference for the public API,
// data dictionary, methodology and bulk dumps.
//
// Default locale is Catalan (the project's default UI language); we
// keep `es` (Spanish) as the second priority. English is included
// because most international funders and code-collaboration audiences
// (NLnet, NGI Zero, Code for All) read in English. See
// docs/docs-subdomain-plan.md for the full rationale.
export default defineConfig({
  site: 'https://docs.holapolitica.org',
  integrations: [
    starlight({
      title: 'Hola Política — Docs',
      description:
        "Documentació tècnica i de dades del projecte Hola Política. " +
        "API pública, diccionari de dades, metodologia, dumps massius.",
      defaultLocale: 'ca',
      locales: {
        ca: { label: 'Català', lang: 'ca' },
        es: { label: 'Español', lang: 'es' },
        en: { label: 'English', lang: 'en' },
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/danpinto/monitor-parlamentari',
        },
      ],
      sidebar: [
        {
          label: 'Començar',
          translations: { es: 'Empezar', en: 'Get started' },
          items: [
            {
              label: 'Introducció',
              translations: { es: 'Introducción', en: 'Introduction' },
              slug: 'intro',
            },
            {
              label: 'Primer ús de l\'API',
              translations: { es: 'Primer uso de la API', en: 'First API call' },
              slug: 'first-call',
            },
          ],
        },
        {
          label: 'API',
          items: [
            { label: 'Votacions / Votes', slug: 'api/votes' },
            { label: 'Iniciatives / Initiatives', slug: 'api/initiatives' },
            { label: 'Temes / Topics', slug: 'api/topics' },
            { label: 'Grups / Groups', slug: 'api/groups' },
            { label: 'Persones / Persons', slug: 'api/persons' },
            { label: 'Estadístiques / Stats', slug: 'api/stats' },
          ],
        },
        {
          label: 'Dades',
          translations: { es: 'Datos', en: 'Data' },
          items: [
            {
              label: 'Diccionari de dades',
              translations: {
                es: 'Diccionario de datos',
                en: 'Data dictionary',
              },
              slug: 'data/dictionary',
            },
            {
              label: 'Dumps CC-BY 4.0',
              slug: 'data/dumps',
            },
            {
              label: 'Metodologia',
              translations: { es: 'Metodología', en: 'Methodology' },
              slug: 'data/methodology',
            },
            {
              label: 'Neutralitat',
              translations: { es: 'Neutralidad', en: 'Neutrality' },
              slug: 'data/neutrality',
            },
          ],
        },
        {
          label: 'Embed',
          items: [
            { label: 'Widgets', slug: 'embed/widgets' },
            {
              label: 'Cards socials',
              translations: { es: 'Cards sociales', en: 'Social cards' },
              slug: 'embed/cards',
            },
          ],
        },
      ],
      // No Google Analytics, no Plausible cloud — matches the main
      // site's tracker-free posture. If we add analytics later it
      // will be self-hosted Umami or Plausible.
    }),
  ],
});
