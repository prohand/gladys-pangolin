import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  buildDiscoveredDevices,
  buildStates,
  findItem,
  parseDeviceExternalId,
} from '../src/devices/index.js';
import { sampleResources, sampleSites } from './helpers/fakePangolin.js';

const snapshot = () => ({ sites: sampleSites(), resources: sampleResources() });

test('Gladys accepts the discovery payload (categories, types, units, min/max)', async () => {
  const gladys = createFakeGladys();
  await gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, snapshot()));
  assert.equal(gladys.fake.discoveredDevices.length, 6);
  for (const device of gladys.fake.discoveredDevices) {
    assert.equal(device.should_poll, undefined, 'the integration drives its own refresh');
    for (const feature of device.features) {
      assert.ok(
        feature.min !== undefined && feature.max !== undefined,
        `${feature.external_id} min/max`,
      );
    }
  }
});

test('Gladys accepts the states', async () => {
  const gladys = createFakeGladys();
  await gladys.publishStates(buildStates(gladys, snapshot()));
  assert.ok(gladys.fake.states.length > 0);
});

test('a local site has no online feature', () => {
  const gladys = createFakeGladys();
  const [, , local] = buildDiscoveredDevices(gladys, snapshot());
  assert.deepEqual(
    local.features.map((f) => f.external_id.split(':').at(-1)),
    ['data-in', 'data-out'],
  );
});

test('external ids are built from the Pangolin numeric ids, never from names', () => {
  const gladys = createFakeGladys();
  const renamed = snapshot();
  renamed.sites[0].name = 'Renamed';
  renamed.sites[0].niceId = 'renamed';
  const ids = (s) => buildDiscoveredDevices(gladys, s).map((d) => d.external_id);
  assert.deepEqual(ids(renamed), ids(snapshot()));
});

test('device external ids parse back to their type and Pangolin id', () => {
  const gladys = createFakeGladys();
  assert.deepEqual(parseDeviceExternalId(gladys, 'ext:test-integration:resource:12'), {
    type: 'resource',
    id: '12',
  });
  assert.equal(parseDeviceExternalId(gladys, 'ext:test-integration:resource:12:enabled'), null);
  assert.equal(parseDeviceExternalId(gladys, 'ext:other:resource:12'), null);
  assert.equal(parseDeviceExternalId(gladys, 'ext:test-integration:camera:1'), null);
  assert.equal(findItem(gladys, snapshot(), 'ext:test-integration:site:2').item.name, 'Cabin');
});
