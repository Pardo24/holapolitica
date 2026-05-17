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
      // Starlight 0.39 strictly validates content paths per locale.
      // We keep the Catalan files at /docs (no /ca prefix) so the
      // default locale is `root` and the other locales go under
      // /es and /en when their content lands. Switching to a
      // `ca` non-root prefix would require moving every existing
      // .md file under /docs/ca which we defer to the i18n round.
      defaultLocale: 'root',
      locales: {
        root: { label: 'Català', lang: 'ca' },
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
      // Sidebar — only slugs with backing markdown files are listed.
      // Starlight 0.39 strictly validates slug existence and would
      // fail the build for missing entries. As the docs site grows
      // (api/topics, api/groups, data/dictionary, embed/widgets, …)
      // re-add the items below alongside the new .md file.
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
          ],
        },
        {
          label: 'Dades',
          translations: { es: 'Datos', en: 'Data' },
          items: [
            {
              label: 'Dumps CC-BY 4.0',
              slug: 'data/dumps',
            },
            {
              label: 'Neutralitat',
              translations: { es: 'Neutralidad', en: 'Neutrality' },
              slug: 'data/neutrality',
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
