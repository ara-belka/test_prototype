/**
 * Style Dictionary — Klaux Figma export (DTCG multi-file) → CSS custom properties.
 *
 * Source of truth: Figma Variables → Klaux plugin ZIP → figma-input/
 *   pnpm tokens          # SD build → app/assets/css/tokens/
 *   (положите JSON из Klaux ZIP в figma-input/ вручную)
 *
 * Вход:  figma-input/{base,semantic,components}/*.json  (+ $metadata.json)
 * Выход: app/assets/css/tokens/{base,semantic,components}.css
 *
 * 3 CSS layers (import order: base → semantic → components):
 *   1) base        — raw palette / primitives (do not use in UI)
 *   2) semantic    — theme + density bridge (Light/Dark, five window size classes)
 *   3) components  — product UI tokens (prefer these in Vue/CSS)
 *
 * Modes (no hand-written token values outside this pipeline):
 * - colors: Light -> :root, Dark -> .dark (same CSS variable names)
 * - sizes:  Compact -> :root; Medium/Expanded/Large/Extra-large -> page min-width media
 *
 * Format note: JSON is W3C DTCG-like ($type/$value/$extensions), multi-file layout
 * compatible with @tokens-studio/sd-transforms (library only — not Tokens Studio plugin).
 */

import { register, expandTypesMap } from '@tokens-studio/sd-transforms';
import StyleDictionary from 'style-dictionary';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { layoutCss, layoutTypescript, readLayoutBreakpoints, removeLegacyWrapperTokens } from './scripts/layout-tokens.mjs';

register(StyleDictionary);

StyleDictionary.registerPreprocessor({
  name: 'layout-migration',
  preprocessor: removeLegacyWrapperTokens,
});

StyleDictionary.registerTransform({
  name: 'custom/number-to-px',
  type: 'value',
  filter: (token) => {
    const type = token.$type || token.type;
    if (type !== 'number') return false;
    const name = (token.path?.join('-') || token.name || '').toLowerCase();
    // unitless CSS numbers — never append px
    if (name.includes('weight')) return false; // font-weight / typography-weight-*
    if (name.includes('opacity')) return false;
    if (name.includes('z-index') || name.endsWith('-z') || name.includes('zindex')) return false;
    if (name.includes('lineheight') && !name.includes('line-height')) {
      /* line-height handled by ts/size/lineheight when ratio; px sizes OK */
    }
    return true;
  },
  transform: (token) => {
    const val = token.$value ?? token.value;
    if (typeof val === 'number') {
      return val === 0 ? '0px' : `${val}px`;
    }
    const num = Number(val);
    if (!isNaN(num)) {
      return num === 0 ? '0px' : `${num}px`;
    }
    return val;
  },
});

/**
 * Strip erroneous `px` from font-weight tokens.
 * `ts/size/px` and older filters may treat weight numbers as dimensions.
 */
StyleDictionary.registerTransform({
  name: 'custom/font-weight-unitless',
  type: 'value',
  filter: (token) => {
    const name = (token.path?.join('-') || token.name || '').toLowerCase();
    return name.includes('weight');
  },
  transform: (token) => {
    const val = token.$value ?? token.value;
    if (typeof val === 'number') return String(val);
    if (typeof val === 'string') {
      const stripped = val.trim().replace(/px$/i, '');
      // keep named weights (Regular, Semibold) as-is
      return stripped;
    }
    return val;
  },
});

/** Output CSS directory (prod default keeps Nuxt imports stable). */
const TOKENS_DIR = process.env.TOKENS_CSS_DIR || 'app/assets/css/tokens';
/** Klaux DTCG JSON root (default: figma-input). */
const FIGMA_INPUT_DIR = (process.env.FIGMA_INPUT_DIR || 'figma-input').replace(/\/+$/, '');
/** Label in generated file headers (helps tell tokens vs tokens2 apart). */
const BUILD_LABEL = process.env.TOKENS_BUILD_LABEL || 'sd.config.mjs';

function inputPath(...parts) {
  return [FIGMA_INPUT_DIR, ...parts].join('/');
}

function createSd(sources) {
  return new StyleDictionary({
    source: sources,
    preprocessors: ['layout-migration', 'tokens-studio'],
    usesDtcg: true,
    expand: {
      typesMap: expandTypesMap,
      include: (token) => {
        const type = token.$type || token.type;
        return type === 'typography' || type === 'composition';
      },
    },
    log: {
      errors: {
        brokenReferences: 'throw',
      },
      verbosity: 'silent',
    },
    platforms: {
      css: {
        transforms: [
          'ts/descriptionToComment',
          'ts/resolveMath',
          'ts/size/px',
          'ts/opacity',
          'ts/size/css/letterspacing',
          'ts/size/lineheight',
          'ts/typography/fontWeight',
          'ts/shadow/innerShadow',
          'ts/color/css/hexrgba',
          'ts/color/modifiers',
          'custom/number-to-px',
          'custom/font-weight-unitless',
          'shadow/css/shorthand',
          'fontFamily/css',
          'name/kebab',
        ],
        buildPath: `${TOKENS_DIR}/`,
        files: [],
      },
    },
  });
}

/**
 * @param {string[]} sources
 * @param {string} destination
 * @param {string|string[]} selector
 * @param {(token: any) => boolean} [filter]
 * @param {{ outputReferences?: boolean }} [opts]
 */
async function buildCssFile(sources, destination, selector, filter, opts = {}) {
  const sd = createSd(sources);
  sd.platforms.css.files = [
    {
      destination,
      format: 'css/variables',
      filter: filter || (() => true),
      options: {
        selector,
        outputReferences: opts.outputReferences ?? true,
      },
    },
  ];
  await sd.buildPlatform('css');
}

/**
 * Extract `--name: value;` lines from the first matching selector block.
 * @param {string} css
 * @param {string} selector
 * @returns {string[]}
 */
function extractBlockVars(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*\\{`);
  const m = re.exec(css);
  if (!m) return [];

  let i = m.index + m[0].length - 1;
  let depth = 0;
  let start = -1;
  for (; i < css.length; i++) {
    if (css[i] === '{') {
      depth++;
      if (depth === 1) start = i + 1;
    } else if (css[i] === '}') {
      depth--;
      if (depth === 0) {
        const body = css.slice(start, i);
        return body
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.startsWith('--') && l.includes(':'));
      }
    }
  }
  return [];
}

/**
 * @param {string[]} vars
 * @param {string} indent
 */
function formatVars(vars, indent) {
  return vars.map((v) => `${indent}${v.replace(/^\s+/, '')}`).join('\n');
}

function pathIncludes(token, fragment) {
  const fp = (token.filePath || '').replace(/\\/g, '/');
  return fp.includes(fragment);
}

async function main() {
  // Keep the directory in place so a running Vite/Nuxt dev server never sees a missing
  // ./tokens/*.css import mid-build (rm -rf would race with CSS resolution).
  console.log(`\n🎨 Style Dictionary (Klaux → CSS)`);
  console.log(`   input:  ${FIGMA_INPUT_DIR}/`);
  console.log(`   output: ${TOKENS_DIR}/`);
  await mkdir(TOKENS_DIR, { recursive: true });

  const primitiveRelPath = existsSync(join(FIGMA_INPUT_DIR, 'primitive/Value.json'))
    ? 'primitive/Value.json'
    : existsSync(join(FIGMA_INPUT_DIR, 'base/Value.json'))
      ? 'base/Value.json'
      : 'primitive/Value.json';
  const primitiveFragment = primitiveRelPath.startsWith('primitive') ? 'primitive/' : 'base/';

  const primitives = JSON.parse(await readFile(inputPath(primitiveRelPath), 'utf8'));
  const breakpoints = readLayoutBreakpoints(primitives);
  const MEDIUM_MQ = `(min-width: ${breakpoints.medium}px)`;
  const EXPANDED_MQ = `(min-width: ${breakpoints.expanded}px)`;
  const LARGE_MQ = `(min-width: ${breakpoints.large}px)`;
  const XL_MQ = `(min-width: ${breakpoints['extra-large']}px)`;
  await writeFile(join(TOKENS_DIR, 'layout.css'), layoutCss(breakpoints));
  const layoutTsPath = process.env.LAYOUT_TS_PATH || 'shared/layout.ts';
  await mkdir(dirname(layoutTsPath), { recursive: true });
  await writeFile(layoutTsPath, layoutTypescript(breakpoints));

  // base / primitive (raw palette)
  await buildCssFile(
    [inputPath(primitiveRelPath)],
    'base.css',
    ':root',
    (t) => pathIncludes(t, primitiveFragment),
    { outputReferences: false },
  );

  // semantic Light + Compact sizes + typography → :root
  // Keep var(--base-*) refs (Figma aliases), same as components layer.
  await buildCssFile(
    [
      inputPath(primitiveRelPath),
      inputPath('semantic/colors/Light.json'),
      inputPath('semantic/sizes/Compact.json'),
      inputPath('semantic/typography/Value.json'),
    ],
    '_semantic-root.css',
    ':root',
    (t) => pathIncludes(t, 'semantic/'),
    { outputReferences: true },
  );

  // semantic Dark colors -> .dark
  await buildCssFile(
    [inputPath(primitiveRelPath), inputPath('semantic/colors/Dark.json')],
    '_semantic-dark.css',
    '.dark',
    (t) => pathIncludes(t, 'semantic/colors/Dark'),
    { outputReferences: true },
  );

  // semantic Medium sizes → temp :root (wrapped in media below)
  await buildCssFile(
    [inputPath(primitiveRelPath), inputPath('semantic/sizes/Medium.json')],
    '_semantic-medium.css',
    ':root',
    (t) => pathIncludes(t, 'semantic/sizes/Medium'),
    { outputReferences: true },
  );

  // semantic Expanded sizes → temp :root (wrapped in media below)
  await buildCssFile(
    [inputPath(primitiveRelPath), inputPath('semantic/sizes/Expanded.json')],
    '_semantic-expanded.css',
    ':root',
    (t) => pathIncludes(t, 'semantic/sizes/Expanded'),
    { outputReferences: true },
  );

  // semantic Large sizes → temp :root (wrapped in media below)
  await buildCssFile(
    [inputPath(primitiveRelPath), inputPath('semantic/sizes/Large.json')],
    '_semantic-large.css',
    ':root',
    (t) => pathIncludes(t, 'semantic/sizes/Large'),
    { outputReferences: true },
  );

  // semantic Extra-large sizes → temp :root (wrapped in media below)
  await buildCssFile(
    [inputPath(primitiveRelPath), inputPath('semantic/sizes/Extra-large.json')],
    '_semantic-xl.css',
    ':root',
    (t) => pathIncludes(t, 'semantic/sizes/Extra-large'),
    { outputReferences: true },
  );

  // components: single Value set; keep var() refs so colors follow theme
  await buildCssFile(
    [
      inputPath(primitiveRelPath),
      inputPath('semantic/colors/Light.json'),
      inputPath('semantic/sizes/Compact.json'),
      inputPath('semantic/typography/Value.json'),
      inputPath('components/Value.json'),
    ],
    'components.css',
    ':root',
    (t) => pathIncludes(t, 'components/'),
    { outputReferences: true },
  );

  const rootRaw = await readFile(join(TOKENS_DIR, '_semantic-root.css'), 'utf8');
  const darkRaw = await readFile(join(TOKENS_DIR, '_semantic-dark.css'), 'utf8');
  const mediumRaw = await readFile(join(TOKENS_DIR, '_semantic-medium.css'), 'utf8');
  const expandedRaw = await readFile(join(TOKENS_DIR, '_semantic-expanded.css'), 'utf8');
  const largeRaw = await readFile(join(TOKENS_DIR, '_semantic-large.css'), 'utf8');
  const xlRaw = await readFile(join(TOKENS_DIR, '_semantic-xl.css'), 'utf8');

  const darkVars =
    extractBlockVars(darkRaw, '.dark').length > 0
      ? extractBlockVars(darkRaw, '.dark')
      : extractBlockVars(darkRaw, ':root');
  const mediumVars = extractBlockVars(mediumRaw, ':root');
  const expandedVars = extractBlockVars(expandedRaw, ':root');
  const largeVars = extractBlockVars(largeRaw, ':root');
  const xlVars = extractBlockVars(xlRaw, ':root');

  const rootBody = rootRaw.replace(/^\/\*\*[\s\S]*?\*\/\s*/m, '').trim() + '\n';
  const header =
    '/**\n' +
    ` * Do not edit directly, this file was auto-generated by ${BUILD_LABEL}\n` +
    ' * Light colors + Compact sizes -> :root\n' +
    ' * Dark colors -> .dark\n' +
    ' * Fixed-light subtree pin (CMS chrome) -> .light\n' +
    ` * Medium sizes -> media ${MEDIUM_MQ}\n` +
    ` * Expanded sizes -> media ${EXPANDED_MQ}\n` +
    ` * Large sizes -> media ${LARGE_MQ}\n` +
    ` * Extra-large sizes -> media ${XL_MQ}\n` +
    ' */\n\n';

  const rootVars = Object.fromEntries(
    extractBlockVars(rootRaw, ':root').map((line) => {
      const m = line.match(/^--([^:]+):\s*(.+);$/);
      return m ? [m[1], m[2].trim()] : [line, ''];
    }),
  );

  let out = header + rootBody + '\n';
  if (darkVars.length) {
    out += `.dark {\n${formatVars(darkVars, '  ')}\n}\n\n`;

    // Fixed-light subtree: same var names as .dark, forced to Light values.
    // `.light` — точечный эскейп-хэтч. CMS-хром получает те же vars без классов —
    // по селекторам из cms-layer.css (список дублирует его :where-перечень).
    const CMS_SELECTORS = [
      '.cms',
      '.cms-sidebar',
      '.cms-content-sheet',
      '.cms-content-sheet__layout',
      '.cms-page-editor-sheet',
      '.cms-page-editor-sheet__content',
      '.cms-pages-list-dialog__content',
      '.cms-pages-list-dialog__delete-content',
      '.cms-pages-tree-table',
      '.cms-media-uploader',
      // .cms-block-staff-overlay НЕ пиним: под ним живой блок сайта (.site-theme),
      // светлая семантика сломала бы WYSIWYG-темизацию блока.
      '.cms-image-crop-dialog__content',
      '.cms-login-page',
      '.cms-mobile-toggle',
    ];
    const themeLightVars = darkVars
      .map((line) => {
        const m = line.match(/^--([^:]+):/);
        return m && rootVars[m[1]] !== undefined ? `--${m[1]}: ${rootVars[m[1]]};` : null;
      })
      .filter(Boolean);
    if (themeLightVars.length) {
      out += `:where(.light,\n${CMS_SELECTORS.map((s) => `  ${s}`).join(',\n')}) {\n${formatVars(themeLightVars, '  ')}\n}\n\n`;
    }
  }
  if (mediumVars.length) {
    out += `@media ${MEDIUM_MQ} {\n  :root {\n${formatVars(mediumVars, '    ')}\n  }\n}\n\n`;
  }
  if (expandedVars.length) {
    out += `@media ${EXPANDED_MQ} {\n  :root {\n${formatVars(expandedVars, '    ')}\n  }\n}\n\n`;
  }
  if (largeVars.length) {
    out += `@media ${LARGE_MQ} {\n  :root {\n${formatVars(largeVars, '    ')}\n  }\n}\n\n`;
  }
  if (xlVars.length) {
    out += `@media ${XL_MQ} {\n  :root {\n${formatVars(xlVars, '    ')}\n  }\n}\n`;
  }

  await writeFile(join(TOKENS_DIR, 'semantic.css'), out, 'utf8');

  for (const f of [
    '_semantic-root.css',
    '_semantic-dark.css',
    '_semantic-medium.css',
    '_semantic-expanded.css',
    '_semantic-large.css',
    '_semantic-xl.css',
  ]) {
    await rm(join(TOKENS_DIR, f), { force: true });
  }

  // sanity: .dark must exist and override at least one color vs :root
  if (!out.includes('.dark {')) {
    throw new Error('Dark merge failed: missing .dark block');
  }
  const darkVarsMap = Object.fromEntries(
    darkVars.map((line) => {
      const m = line.match(/^--([^:]+):\s*(.+);$/);
      return m ? [m[1], m[2].trim()] : [line, ''];
    }),
  );
  const themeDiffs = Object.keys(darkVarsMap).filter(
    (k) => rootVars[k] !== undefined && rootVars[k] !== darkVarsMap[k],
  );
  if (themeDiffs.length === 0) {
    throw new Error(
      'Dark merge failed: no differing color vars between :root and .dark (check Light/Dark JSON)',
    );
  }

  console.log('\n✅ Tokens built successfully!');
  console.log(`   ${TOKENS_DIR}/base.css`);
  console.log(
    `   ${TOKENS_DIR}/semantic.css  (:root Light+Compact, .dark, medium @${MEDIUM_MQ}, expanded @${EXPANDED_MQ}, large @${LARGE_MQ}, xl @${XL_MQ})`,
  );
  console.log(`   ${TOKENS_DIR}/components.css`);
  console.log(`   dark color vars: ${darkVars.length} (theme diffs: ${themeDiffs.length}), medium: ${mediumVars.length}, expanded: ${expandedVars.length}, large: ${largeVars.length}, xl: ${xlVars.length}`);
  console.log(`   theme sample diffs: ${themeDiffs.slice(0, 8).join(', ')}`);
}

await main();
