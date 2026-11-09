// @ts-check
import { defineConfig } from 'astro/config';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

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

  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: {
          en: 'en',
          es: 'es',
        },
      },
      serialize: (item) => {
        const { url, links = [] } = item;
        // x-default apunta a la versión en inglés (locale por defecto)
        const defaultUrl = url.includes('/es/') ? url.replace('/es/', '/') : url;
        return {
          ...item,
          links: [...links, { lang: 'x-default', url: defaultUrl }],
        };
      },
    }),
  ],

  vite: {
    build: {
      rolldownOptions: {
        external: ['vitest'],
      },
    },
  },

  adapter: vercel(),
});