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

  adapter: vercel(),
});