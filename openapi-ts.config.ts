import 'dotenv/config';
import { defineConfig } from '@hey-api/openapi-ts';

const openApiUrl = process.env.NUXT_OPENAPI_URL?.trim();
const localizedTag = '@localized';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const markLocalizedSchemas = (value: unknown): void => {
  if (Array.isArray(value)) {
    value.forEach(markLocalizedSchemas);
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (value['x-localized'] === true) {
    const description = typeof value.description === 'string'
      ? value.description.trimEnd()
      : '';

    if (!description.includes(localizedTag)) {
      value.description = description
        ? `${description}\n\n${localizedTag}`
        : localizedTag;
    }
  }

  Object.values(value).forEach(markLocalizedSchemas);
};

if (!openApiUrl) {
  throw new Error('Установи NUXT_OPENAPI_URL в .env');
}

export default defineConfig({
  input: {
    path: openApiUrl,
    fetch: {
      headers: {
        Authorization: process.env.NUXT_API_AUTH ?? '',
        Accept: 'application/yaml,application/json'
      }
    }
  },
  parser: {
    patch: {
      schemas: (_name, schema) => {
        markLocalizedSchemas(schema);
      }
    }
  },
  output: {
    path: 'packages/api-client/src/gen',
    clean: true,
    postProcess: [
      {
        command: 'node',
        args: [
          'scripts/openapi/generate-localized-fields.mjs',
          '--output',
          '{{path}}'
        ],
        name: 'CMS localized fields'
      }
    ]
  },
  plugins: ['@hey-api/typescript', '@hey-api/sdk', '@hey-api/client-ofetch']
});
