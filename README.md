# FrontBean v2

Переписанная версия проекта на Nuxt 4 с акцентом на:
- модульную архитектуру,
- типобезопасную работу с API,
- генерацию OpenAPI-типов/SDK,
- дальнейшее разделение CMS и публичной части.

## Требования

- Node.js `>= 22`
- pnpm `9.15.9`
- mise для управления локальными версиями Node.js и pnpm

Проверка:

```bash
node -v
pnpm -v
```

## Mise

Версии инструментов закреплены в `.mise.toml`:

```toml
[tools]
node = "22.18.0"
pnpm = "9.15.9"
```

Первичная настройка:

```bash
cd v2
mise trust
mise install
```

После установки `mise` автоматически подставит нужные версии `node` и `pnpm` при работе из директории `v2`.

Проверка:

```bash
mise current
node -v
pnpm -v
```

## Установка

```bash
pnpm install
```

Если проект был установлен до добавления Tailwind/shadcn primitives, после обновления обязательно повторно выполни:

```bash
pnpm install
```

Если ставишь вручную, нужны пакеты:

```bash
pnpm add class-variance-authority clsx tailwind-merge
pnpm add -D tailwindcss @tailwindcss/vite
pnpm add -D @lhci/cli
```

## Основные команды

```bash
# запуск dev-сервера
pnpm run dev

# production build
pnpm run build

# локальный preview production build
pnpm run preview

# статическая генерация (если используется)
pnpm run generate

# проверка типов
pnpm run typecheck

# design tokens (Figma → CSS)
pnpm tokens
```

## Переменные окружения

Файл: `.env`

Минимально:

```env
NUXT_API_BASE=https://coffee-prototype.servertest.pro
NUXT_API_AUTH=Basic ...
NUXT_API_TOKEN=...
NUXT_PUBLIC_SITE_URL=https://coffee-prototype.servertest.pro
NUXT_SITE_URL=https://coffee-prototype.servertest.pro

# URL OpenAPI schema для генерации
NUXT_OPENAPI_URL=https://coffee-prototype.servertest.pro/api/schema.yaml
```

## OpenAPI генерация

Генерация настраивается через `openapi-ts.config.ts` и берет схему по URL из `NUXT_OPENAPI_URL`.

Рекомендуемые скрипты в `package.json`:

```json
{
  "scripts": {
    "api:generate": "openapi-ts",
    "api:generate:watch": "openapi-ts --watch",
    "api:check": "pnpm run api:generate && pnpm run typecheck"
  }
}
```

Что делают эти команды:
- `api:generate` — однократная генерация типов/SDK из OpenAPI.
- `api:generate:watch` — генерация в режиме наблюдения за изменениями.
- `api:check` — генерация + проверка типизации проекта.

Запуск:

```bash
pnpm run api:generate
```

По умолчанию результат генерации сохраняется в:

```txt
packages/api-client/src/gen
```

## Lighthouse CI и performance budget

Для этапа 10 в проект добавлены:

- `lighthouserc.json` — сценарий Lighthouse CI (URL, пороги, режим запуска).
- `lighthouse-budget.json` — budget по весу ресурсов.
- pnpm-скрипты для локального и CI-прогона.

Скрипты:

```bash
# build + Lighthouse CI
pnpm run ci:lighthouse

# только Lighthouse CI (если build уже выполнен)
pnpm run lh:ci
```

Пороговые значения по категориям:

- Performance: `>= 0.90`
- Accessibility: `>= 0.95`
- Best Practices: `>= 0.95`
- SEO: `>= 0.95`

Минимальный запуск в CI:

```bash
pnpm install --frozen-lockfile
pnpm run ci:lighthouse
```

## Модули авторизации

- `cms-core` (включен по умолчанию): объединяет `cms-auth` и `cms-mode`.
- `cms-core` автоматически добавляет страницу входа по `loginPath` (по умолчанию `/login`) и форму авторизации CMS.
- `user-auth` (выключен по умолчанию): отдельная пользовательская авторизация через endpoints `accounts/auth`.
- `user-auth` автоматически добавляет страницу входа по `loginPath` (по умолчанию `/auth/login`) с формой входа по email-коду.

Настройка в `nuxt.config.ts`:

```ts
cmsCore: {
  enabled: true,
  loginPath: '/login'
},
userAuth: {
  enabled: false,
  loginPath: '/auth/login'
}
```

## Стили и темы

Точка входа: `app/assets/css/main.css`.

### Design tokens (Figma → Style Dictionary)

```bash
pnpm tokens
```

- Вход: `figma-input/**`
- Выход: `app/assets/css/tokens/{base,semantic,components}.css` (generated, не править руками)

Кратко:

- **semantic** — header/footer/article-blocks/pages
- **component** — только `app/components/ui/*` primitives
- **legacy** `layers/tokens.css` — compat для текущих shadcn-aliases, не для нового product UI

### CSS-слои

- `app/assets/css/tokens/*.css` — SD tokens (source of truth для DS values)
- `app/assets/css/layers/tokens.css` — legacy palette (compat)
- `app/assets/css/layers/themes.css` — shadcn/site theme aliases (`--primary`, …)
- `app/assets/css/layers/base.css` — Tailwind `@theme` mapping + base
- `app/assets/css/layers/fonts.css` — шрифты

Принцип:

- Сайт и user-auth используют базовую тему из `themes.css` без runtime-переключения.
- CMS и site изолированы: включение CMS не меняет глобальные site-токены.

### Shadcn primitives и доменные компоненты

- Примитивы shadcn: `app/components/ui/*` (`UiButton`, `UiInput`, `UiCard`, `UiBadge`).
- Компоненты сайта: `app/components/site/*` (`SiteButton`, `SiteInput`, `SiteCard`, ...).
- Компоненты CMS: `modules/cms-core/runtime/components/*` (`CmsButton`, `CmsInput`, ...).
- Компоненты user-auth: `modules/user-auth/runtime/components/*` (`UserAuthButton`, `UserAuthInput`, ...).

Правило:

- В feature-компонентах не используем `Ui*` напрямую.
- Для сайта используем `Site*`, для CMS — `Cms*`, для user-auth — `UserAuth*`.

### Использование `@apply` в `.vue`

Используй `lang="postcss"` в style-блоке:

```vue
<style scoped lang="postcss">
.card {
  @apply rounded-xl border border-border bg-card text-card-foreground p-4;
}
</style>
```

## Архитектурное правило проекта

- Клиентская часть (`app/**`) не должна обращаться к backend напрямую.
- Все запросы должны идти через серверный слой Nuxt (`server/routes/n-api/**`) как через proxy/BFF.

Это позволяет централизовать авторизацию, скрыть служебные токены и упростить поддержку.

## Bootstrap init (menus/configs/feedback)

- Добавлен серверный route: `GET /n-api/init`.
- Он агрегирует данные:
  - `/api/configs/`
  - `/api/menus/`
  - `/api/feedback/`
- Для снижения нагрузки используется серверный TTL-кэш в `server/services/bootstrap/init.ts` (ключ кэша учитывает `Accept-Language`).
- На клиенте используется composable `app/composables/useInit.ts`.

`useInit` возвращает:

- `headerMenu`, `footerMenu`
- `getConfig`, `getConfigKey`
- `getFeedback`, `getFeedbackForm`
- `status`, `error`, `refresh`, `ensureResolved`

В `app/app.vue` init запрашивается на SSR (`await init.ensureResolved()`), чтобы данные были доступны уже в первом HTML.

## SSR counters/meta snippets

Добавлен Nitro-плагин: `server/plugins/counters-html.ts`.

Что делает:

- На `render:html` получает `configs` через кэшируемый серверный сервис.
- Если `COUNTERS_AND_GOALS_DEBUG` выключен, вставляет raw snippets:
  - в `<head>`: `COUNTERS_HEAD`, `META_TAGS`
  - в начало `<body>`: `COUNTERS_BODY_START`
  - в конец `<body>`: `COUNTERS_BODY_END`, `GOALS`, `COUNTERS`

Особенности:

- Данные вставляются только на сервере (SSR), без `v-html` в клиентских компонентах.
- Пустые строки игнорируются, дубликаты не добавляются.
- Если в контексте есть `cspNonce`, он автоматически проставляется в `<script>` тегах сниппетов.

## SEO composable

- Добавлен `app/composables/useAppSeoMeta.ts`.
- Используется в `SlugPage` и заполняет:
  - `title`, `description`, `keywords`
  - OpenGraph (`og:*`)
  - Twitter (`twitter:*`)
  - canonical link
- Источники данных:
  - SEO поля страницы (`page.seo`, `page.og`)
  - fallback из init-config (`SITE_NAME`, `SITE_DESCRIPTION`, `SITE_KEYWORDS`, `SITE_IMAGE`)
  - базовый URL из `runtimeConfig.public.siteUrl`

## Favicon и manifest

Подключено в `nuxt.config.ts` через `app.head`:

- `/favicon.ico`
- `/icons/icon-192x192.png`
- `/icons/icon-512x512.png`
- `apple-touch-icon` -> `/icons/icon-192x192.png`
- `manifest` -> `/manifest.webmanifest`

Добавлен серверный роут `server/routes/manifest.webmanifest.ts`:

- подтягивает `SITE_NAME` и `SITE_DESCRIPTION` из конфигов;
- возвращает fallback manifest при недоступности API;
- использует иконки из `public/icons/*`.

## Как добавить новую локаль

В проекте локали настраиваются из одного файла:

- `shared/i18n/locales.ts`

Это единая точка правды для:

- `@nuxtjs/i18n` (список локалей, default/fallback),
- `html lang/dir` в SSR,
- `Accept-Language` в init-запросах,
- `og:locale` в SEO,
- sitemap `hreflang`,
- `manifest` (`lang/dir`),
- fallback локали в CMS data-layer.

### Шаг 1. Добавить локаль в реестр

Открой `shared/i18n/locales.ts` и добавь объект в `APP_LOCALES`.

Пример для арабского:

```ts
{
  code: 'ar',
  dir: 'rtl',
  file: 'ar.json',
  language: 'ar-SA',
  name: 'العربية',
  ogLocale: 'ar_SA',
  yandexMapsLang: 'ar_SA'
}
```

Пример для китайского:

```ts
{
  code: 'zh',
  dir: 'ltr',
  file: 'zh.json',
  language: 'zh-CN',
  name: '中文',
  ogLocale: 'zh_CN',
  yandexMapsLang: 'zh_CN'
}
```

Примечания:

- `code` — используется в URL (например, `/ar`, `/zh`).
- `dir` — направление интерфейса (`rtl` для арабского).
- `file` — файл переводов в `i18n/locales`.
- `language` — значение для `Accept-Language` и `hreflang`.
- `ogLocale` и `yandexMapsLang` опциональны, но лучше указывать явно.

### Шаг 2. Добавить файл переводов

Создай файл в `i18n/locales` с именем из поля `file`:

- `i18n/locales/ar.json`
- `i18n/locales/zh.json`

Минимальный шаблон:

```json
{}
```

Затем постепенно наполни ключами переводов.

### Шаг 3. Проверить проект

```bash
pnpm run typecheck
pnpm run dev
```

Проверь:

- открывается локализованный маршрут (`/ar`, `/zh`);
- корректно выставляется направление (`dir="rtl"` для арабского);
- переключение языка работает;
- нет ошибок в консоли/SSR.

### Частый сценарий: одноязычный сайт

Если проект одноязычный, оставь в `APP_LOCALES` только одну локаль.
Остальная конфигурация подстроится автоматически.
