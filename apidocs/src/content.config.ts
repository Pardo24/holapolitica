// Content Layer configuration — required since Astro 6 / Starlight 0.39.
//
// In earlier versions Starlight registered the docs collection
// implicitly via `defineCollection({ schema: docsSchema() })` inside
// `src/content/config.ts`. The Content Layer API in Astro 6 makes
// the loader explicit; Starlight ships its own `docsLoader` that
// recreates the file-system loader with the right glob + slug rules.
//
// Without this file, `astro build` fails with "slug ... does not
// exist" because no loader is registered for the docs collection.

import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema(),
  }),
};
