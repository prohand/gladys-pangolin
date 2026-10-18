import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from '../src/config.js';
import { buildOverviewContent } from '../src/capabilities/widget.js';
import { PangolinUnreachableError } from '../src/pangolin/client.js';
import { fakeConfig, sampleResources, sampleSites } from './helpers/fakePangolin.js';

const config = normalizeConfig(fakeConfig());
const connected = (snapshot = { sites: sampleSites(), resources: sampleResources() }) => ({
  snapshot,
  connected: true,
  transport: 'local',
  degraded: false,
});
const statusOf = (content) => content.components.find((c) => c.type === 'status');

const CASES = {
  'connected with problems': [connected(), config],
  'connected, all fine': [
    connected({ sites: sampleSites().slice(0, 1), resources: sampleResources().slice(0, 1) }),
    config,
  ],
  degraded: [{ ...connected(), degraded: true, transport: 'cloud' }, config],
  unreachable: [
    {
      ...connected(),
      connected: false,
      error: new PangolinUnreachableError(`${'x'.repeat(200)} unreachable`),
    },
    config,
  ],
  'not configured': [{ snapshot: null, connected: null }, normalizeConfig()],
  'before the first read': [{ snapshot: null, connected: null }, config],
};

for (const [name, [state, cfg]] of Object.entries(CASES)) {
  test(`the content is rendered exactly as sent: ${name}`, () => {
    for (const problems of [0, 1, 5, 9]) {
      assert.deepEqual(
        validateWidgetContent(buildOverviewContent(state, cfg, { problems_shown: problems })),
        [],
      );
    }
  });
}

test('problems are listed worst first: offline sites, unhealthy, then disabled resources', () => {
  const sites = sampleSites();
  const resources = sampleResources();
  resources[0].health = 'unhealthy';
  const items = statusOf(buildOverviewContent(connected({ sites, resources }), config)).items;
  assert.deepEqual(
    items.map((item) => [item.label.en ?? item.label, item.color]),
    [
      ['Pangolin', 'success'],
      ['Cabin', 'danger'],
      ['NAS', 'warning'],
      ['SSH', 'neutral'],
    ],
  );
});

test('the list is cut at the chosen size, the rest counted', () => {
  const items = statusOf(buildOverviewContent(connected(), config, { problems_shown: 1 })).items;
  assert.equal(items.length, 3);
  assert.equal(items.at(-1).value, 1);
});

test('all fine says so', () => {
  const content = buildOverviewContent(
    connected({ sites: sampleSites().slice(0, 1), resources: sampleResources().slice(0, 1) }),
    config,
  );
  assert.equal(statusOf(content).items.at(-1).value.en, 'All fine');
});
