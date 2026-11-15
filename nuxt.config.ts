// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  modules: ['@nuxtjs/i18n', '@nuxt/fonts'],
  i18n: {
    defaultLocale: 'en',
    strategy: 'no_prefix',
    detectBrowserLanguage: false,
    locales: [
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
  fonts: {
    families: [{ name: 'Geist', src: '/fonts/Geist-Variable.woff2', weight: '100 900', style: 'normal', global: true }],
  },
})
