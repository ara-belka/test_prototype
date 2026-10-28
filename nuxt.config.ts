import tailwindcss from '@tailwindcss/vite';
import { layoutBreakpoints } from './shared/layout';
import {
  DEFAULT_LOCALE_CODE,
  DEFAULT_YANDEX_MAPS_LANG,
  NON_DEFAULT_LOCALE_CODES,
  NUXT_I18N_LOCALES
} from './shared/i18n/locales';

const isDev = process.env.NODE_ENV !== 'production';
const isDevPagesEnabled =
  isDev ||
  process.env.NUXT_ENABLE_DEV_PAGES === 'true' ||
  process.env.NUXT_ENABLE_DEV_PAGES === '1' ||
  // servertest / preview hosts keep /dev/* playground without local NODE_ENV=development
  process.env.NUXT_PUBLIC_SITE_URL?.includes('servertest') === true ||
  process.env.NUXT_SITE_URL?.includes('servertest') === true;
const isPwaEnabled = !isDev && process.env.NUXT_PWA_ENABLED === 'true';
const isNitroDebugEnabled =
  isDev ||
  process.env.NUXT_NITRO_DEBUG === 'true' ||
  process.env.NITRO_DEBUG === 'true';
const isNitroTimingEnabled =
  isDev ||
  process.env.NUXT_NITRO_TIMING === 'true' ||
  process.env.NITRO_TIMING === 'true';
const isMediaProxyEnabled =
  process.env.NUXT_MEDIA_PROXY_ENABLED === 'true' ||
  process.env.NUXT_MEDIA_PROXY_ENABLED === '1' ||
  process.env.NUXT_PUBLIC_MEDIA_PROXY_ENABLED === 'true' ||
  process.env.NUXT_PUBLIC_MEDIA_PROXY_ENABLED === '1';
// Автоматически добавляем prerender-правила только для offline-страниц.
// CMS-driven корневые страницы должны рендериться динамически на SSR,
// иначе production build зависит от доступности upstream API.
const localizedPrerenderRules = Object.fromEntries(
  NON_DEFAULT_LOCALE_CODES.map((localeCode) => [`/${localeCode}/offline`, { prerender: true }])
);

export default defineNuxtConfig({
  compatibilityDate: '2026-04-15',
  devtools: { enabled: false },

  // Dev-страницы (/dev/blocks/, /dev/components/) не попадают в production bundle
  ignore: isDevPagesEnabled ? [] : ['app/pages/dev/**'],

  app: {
    head: {
      script: [
        {
          // Matches VueUse useDark defaults (class=dark on html, storage key vueuse-color-scheme).
          // Prevents light FOUC when the preferred/stored theme is dark.
          key: 'color-theme-fouc',
          innerHTML: `(function(){try{var k='vueuse-color-scheme';var s=localStorage.getItem(k);var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var dark=s==='dark'||((s==='auto'||s==null)&&d);document.documentElement.classList.toggle('dark',!!dark);document.documentElement.style.colorScheme=dark?'dark':'light';}catch(e){}})();`
        }
      ]
    }
  },

  modules: [
    '@nuxt/eslint',
    '@nuxt/icon',
    'shadcn-nuxt',
    '@nuxtjs/i18n',
    '@nuxtjs/sitemap',
    '@nuxt/image',
    '@nuxt/scripts',
    '@pinia/nuxt',
    'vue-sonner/nuxt',
    'vue-yandex-maps/nuxt',
    ...(isPwaEnabled ? ['@vite-pwa/nuxt'] : []),
    './modules/cms-core/module',
    './modules/user-auth/module'
  ],

  css: ['~/assets/css/main.css'],

  cmsCore: {
    enabled: true,
    loginPath: '/login'
  },

  userAuth: {
    enabled: false,
    loginPath: '/auth/login'
  },

  components: [
    {
      path: '~/components/site',
      // SiteButton / SiteCard… — не голые Button/Card (pathPrefix схлопывает button/Button → Button)
      prefix: 'Site',
      pathPrefix: false,
      // only .vue — avoid registering *.ts barrels as components
      extensions: ['.vue'],
      pattern: '**/*.vue'
    },
    {
      path: '~/components',
      pathPrefix: false,
      ignore: ['**/ui/**', '**/site/**']
    }
  ],

  shadcn: {
    prefix: 'Ui',
    componentDir: './app/components/ui'
  },

  icon: {
    mode: 'svg',
    localApiEndpoint: '/_nuxt_icon',
    customCollections: [
      {
        prefix: 'cs',
        dir: './app/assets/icons'
      }
    ]
  },

  image: {
    densities: [1, 2],
    format: ['avif', 'webp'],
    quality: 78,
    screens: {
      ...layoutBreakpoints
    }
  },

  scripts: {
    defaultScriptOptions: {
      trigger: 'onNuxtReady',
      warmupStrategy: false
    }
  },

  yandexMaps: {
    apikey:
      process.env.NUXT_PUBLIC_YANDEX_MAPS_API_KEY ||
      process.env.YANDEX_MAPS_API_KEY ||
      'e300300d-2f63-4d7f-9856-afc0e82975cb',
    lang: DEFAULT_YANDEX_MAPS_LANG,
    version: 'v3'
  },

  site: {
    url: process.env.NUXT_SITE_URL || process.env.NUXT_PUBLIC_SITE_URL || 'https://example.com',
    name: 'Coffee Studio'
  },

  i18n: {
    baseUrl: process.env.NUXT_PUBLIC_SITE_URL || process.env.NUXT_SITE_URL || 'https://example.com',
    strategy: 'prefix_except_default',
    // Дефолт и список локалей всегда читаем из единого реестра.
    defaultLocale: DEFAULT_LOCALE_CODE,
    locales: [...NUXT_I18N_LOCALES],
    langDir: 'locales',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_redirected',
      redirectOn: 'root',
      alwaysRedirect: false,
      fallbackLocale: DEFAULT_LOCALE_CODE
    }
  },

  sitemap: {
    autoI18n: false,
    autoLastmod: true,
    includeAppSources: false,
    sources: ['/api/__sitemap__/urls']
  },

  runtimeConfig: {
    apiBase: process.env.NUXT_API_BASE,
    apiAuth: process.env.NUXT_API_AUTH,
    apiToken: process.env.NUXT_API_TOKEN,
    mediaProxyEnabled: isMediaProxyEnabled,
    public: {
      mediaProxyEnabled: isMediaProxyEnabled,
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || process.env.NUXT_SITE_URL || '',
      yandexCaptcha: process.env.NUXT_PUBLIC_YANDEX_CAPTCHA || process.env.YANDEX_CAPTCHA || ''
    }
  },

  nitro: {
    compressPublicAssets: true,
    sourceMap: false,
    debug: isNitroDebugEnabled,
    logLevel: isNitroDebugEnabled ? 4 : 1,
    timing: isNitroTimingEnabled
  },

  ...(isPwaEnabled
    ? {
        pwa: {
          registerType: 'autoUpdate',
          // Используем динамический серверный роут /manifest.webmanifest
          manifest: false,
          workbox: {
            // В @vite-pwa/nuxt html-ресурсы в precache трансформируются в "без .html":
            // offline.html -> /offline. Поэтому fallback должен быть /offline.
            navigateFallback: '/offline',
            globPatterns: ['**/*.{js,css,html,woff2}'],
            runtimeCaching: [
              {
                // Никогда не кэшируем auth/upload API в SW-кэше.
                urlPattern: /^\/n-api\/(?:auth|user-auth|upload)\//i,
                handler: 'NetworkOnly'
              },
              {
                // Кэшируем только публичные read-эндпоинты контента.
                urlPattern: /^\/n-api\/(?:init|pages\/slug\/).*/i,
                handler: 'NetworkFirst',
                method: 'GET',
                options: {
                  cacheName: 'api-cache',
                  networkTimeoutSeconds: 8,
                  expiration: {
                    maxEntries: 50,
                    maxAgeSeconds: 60 * 60
                  }
                }
              },
              {
                urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'image-cache',
                  expiration: {
                    maxEntries: 100,
                    maxAgeSeconds: 60 * 60 * 24 * 30
                  }
                }
              },
              {
                urlPattern: /\.(?:woff2?|ttf|otf|eot)$/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'font-cache',
                  expiration: {
                    maxEntries: 20,
                    maxAgeSeconds: 60 * 60 * 24 * 365
                  }
                }
              }
            ]
          }
        }
      }
    : {}),

  routeRules: {
    '/offline': { prerender: true },
    ...localizedPrerenderRules,
    '/n-api/auth/**': {
      headers: {
        'cache-control': 'no-store'
      }
    },
    '/n-api/user-auth/**': {
      headers: {
        'cache-control': 'no-store'
      }
    },
    '/n-api/upload/**': {
      headers: {
        'cache-control': 'no-store'
      }
    }
  },

  vite: {
    build: {
      sourcemap: false,
      modulePreload: {
        polyfill: false
      }
    },
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: [
        '@vue/devtools-core',
        '@vue/devtools-kit',
        '@vueuse/core',
        'class-variance-authority',
        'clsx',
        'reka-ui',
        'tailwind-merge',
        'lucide-vue-next',
        'embla-carousel-vue'
      ]
    }
  }
});
