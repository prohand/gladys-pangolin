// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../src/app.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';
import { SCENE_ACTIONS, SCENE_TRIGGER_KEYS } from '../src/capabilities/scenes.js';
import { DEFAULT_PROBLEMS_SHOWN, WIDGETS } from '../src/capabilities/widget.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

// Minimum version of the manifest `gladys_version` range, e.g. [5, 1, 0].
function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('every manifest action has a registered handler', async () => {
  const gladys = createFakeGladys();
  createApp(gladys);
  for (const action of manifest.actions) {
    const ack = await gladys.fake.action(action.key, {});
    assert.notEqual(ack.error, 'not implemented', `manifest action "${action.key}" has no handler`);
  }
});

test('the manifest declares both transports: local server and Internet address', () => {
  assert.deepEqual(manifest.transports, ['local', 'cloud']);
});

test('categories, scene triggers, scene actions and widgets require Gladys >= 5.1.0', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  for (const field of ['scene_triggers', 'scene_actions', 'widgets']) {
    assert.ok(manifest[field]?.length > 0, `${field} is declared`);
  }
  assert.ok(isAtLeast(minGladysVersion(), [5, 1, 0]), `got "${manifest.gladys_version}"`);
});

// The store's catalog shelves (integration-catalog-categories.md), with the four
// added in 2026-10. An unknown key is only dropped with a warning, so a typo
// would silently cost the integration a shelf.
const CATALOG_CATEGORIES = [
  'climate',
  'lighting',
  'energy',
  'security',
  'multimedia',
  'appliances',
  'environment',
  'protocols',
  'network',
  'notifications',
  'assistants',
  'services',
  'transport',
  'vehicles',
  'servers',
  'leisure',
];

test('categories are 1 to 3 unique keys of the store vocabulary, servers first', () => {
  assert.equal(new Set(manifest.categories).size, manifest.categories.length);
  for (const category of manifest.categories) {
    assert.ok(CATALOG_CATEGORIES.includes(category), `unknown category "${category}"`);
  }
  assert.equal(manifest.categories[0], 'servers');
});

test('keywords are 1 to 10 unique search terms of 2 to 30 characters', () => {
  assert.ok(Array.isArray(manifest.keywords));
  assert.ok(manifest.keywords.length >= 1 && manifest.keywords.length <= 10);
  const normalized = manifest.keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.equal(new Set(normalized).size, normalized.length, 'keywords must be unique');
  for (const keyword of normalized) {
    assert.ok(keyword.length >= 2 && keyword.length <= 30, `keyword "${keyword}"`);
  }
});

test('Pangolin is used worldwide: no countries restriction', () => {
  assert.equal(manifest.countries, undefined);
});

test('keywords, countries and music require Gladys >= 5.3.0', () => {
  const declared = ['keywords', 'countries', 'music'].filter((f) => manifest[f] !== undefined);
  assert.ok(declared.length > 0);
  assert.ok(isAtLeast(minGladysVersion(), [5, 3, 0]), `got "${manifest.gladys_version}"`);
});

test('every scene_actions key has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
});

test('every widgets key has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets).sort(), Object.keys(WIDGETS).sort());
  const setting = manifest.widgets[0].settings.find((s) => s.key === 'problems_shown');
  assert.equal(setting.default, DEFAULT_PROBLEMS_SHOWN);
});

test('every scene trigger the code fires is declared, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), [...SCENE_TRIGGER_KEYS].sort());
});

test('scene action outputs declared in the manifest are the ones returned', () => {
  const refresh = manifest.scene_actions.find((a) => a.key === 'refresh_status');
  assert.deepEqual(keysOf(refresh.outputs), [
    'connected',
    'sites_online',
    'sites_offline',
    'resources_unhealthy',
    'resources_disabled',
  ]);
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.type === 'section') {
      assert.ok(!(field.key in DEFAULT_CONFIG), `section "${field.key}" stores no value`);
      assert.equal(field.required, undefined);
      assert.equal(field.default, undefined);
      for (const link of field.links ?? []) {
        assert.match(link.url, /^https:\/\//, 'section links must be https');
      }
      continue;
    }
    assert.ok(field.key in DEFAULT_CONFIG, `DEFAULT_CONFIG has no "${field.key}"`);
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `DEFAULT_CONFIG.${field.key}`);
    }
  }
});

test('the API key is a secret field', () => {
  assert.equal(manifest.config_schema.find((f) => f.key === 'api_key').type, 'secret');
});

test('dynamic selects declare a source and no static options', () => {
  for (const field of allFields.filter((f) => f.source !== undefined)) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined, `field "${field.key}": source and options together`);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(
    manifest.docker_image.endsWith(`:${manifest.version}`),
    `docker_image must be tagged :${manifest.version}, got "${manifest.docker_image}"`,
  );
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${lang}: ${text.length} characters`,
    );
  }
});

test('every text of the manifest is written in English, French, German and Spanish', () => {
  // label, description, placeholder: wherever a multi-language object sits.
  const missing = [];
  (function walk(node, path) {
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, `${path}[${i}]`));
      return;
    }
    if (node && typeof node === 'object') {
      if (typeof node.en === 'string') {
        for (const language of LANGUAGES) {
          if (typeof node[language] !== 'string' || node[language].trim() === '') {
            missing.push(`${path}.${language}`);
          }
        }
        return;
      }
      for (const [key, child] of Object.entries(node)) {
        walk(child, `${path}.${key}`);
      }
    }
  })(manifest, 'manifest');
  assert.deepEqual(missing, []);
});

test('field placeholders are multi-language objects', () => {
  const withPlaceholder = allFields.filter((f) => f.placeholder !== undefined);
  assert.ok(withPlaceholder.length > 0);
  for (const field of withPlaceholder) {
    assert.equal(typeof field.placeholder, 'object', `field "${field.key}": placeholder`);
  }
});
