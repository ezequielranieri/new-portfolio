// @ts-check
import { defineConfig } from 'astro/config';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://ezequielranieri.vercel.app',
  output: 'static',
  trailingSlash: 'always',

  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es'],
    routing: {
      prefixDefaultLocale: false,
    },
  },

  vite: {
    build: {
      rolldownOptions: {
        external: ['vitest'],
      },
    },
  },

  content: {
    loaders: [
      glob({
        base: 'src/content',
        pattern: 'blog/**/*.{md,mdx}',
        schema: {
          title: z.string(),
          excerpt: z.string(),
          date: z.date(),
          updatedDate: z.date().optional(),
          tags: z.array(z.string()).default([]),
          draft: z.boolean().default(false),
          translationKey: z.string().optional(),
          lang: z.enum(['en', 'es']).optional(),
        },
      }),
      glob({
        base: 'src/content',
        pattern: 'projects/**/*.{md,mdx}',
        schema: {
          title: z.string(),
          description: z.string(),
          fullDescription: z.string().optional(),
          problem: z.string(),
          decisions: z.array(z.string()).default([]),
          stack: z.array(z.string()).default([]),
          tradeoffs: z.array(z.string()).default([]),
          links: z.object({
            github: z.string().url().optional(),
            demo: z.string().url().optional(),
            article: z.string().url().optional(),
          }).optional(),
          featured: z.boolean().default(false),
          order: z.number().default(0),
        },
      }),
    ],
  },

  adapter: vercel(),
});