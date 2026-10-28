import withNuxt from './.nuxt/eslint.config.mjs';

export default withNuxt({
  ignores: ['packages/api-client/src/gen/**']
});
