import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
import { createMonitor, diffSnapshots, TRANSITIONS } from '../src/pangolin/monitor.js';
import {
  createFakePangolin,
  fakeConfig,
  LOCAL_URL,
  sampleResources,
  sampleSites,
} from './helpers/fakePangolin.js';

const config = normalizeConfig(fakeConfig());

test('no previous snapshot, no transition', () => {
  assert.deepEqual(diffSnapshots(null, { sites: sampleSites(), resources: sampleResources() }), []);
});

test('a site that appears, or a local site, is not a status change', () => {
  const before = { sites: sampleSites().slice(0, 1), resources: [] };
  const after = { sites: sampleSites(), resources: [] };
  after.sites[2].online = true; // a local site never reports a status
  assert.deepEqual(diffSnapshots(before, after), []);
});

test('site status and resource health changes are reported', () => {
  const before = { sites: sampleSites(), resources: sampleResources() };
  const after = { sites: sampleSites(), resources: sampleResources() };
  after.sites[1].online = true;
  after.resources[1].health = 'healthy';
  after.resources[2].health = 'weird'; // anything unknown counts as unknown
  const kinds = diffSnapshots(before, after).map((t) => [
    t.kind,
    t.site?.siteId ?? t.resource?.resourceId,
  ]);
  assert.deepEqual(kinds, [
    [TRANSITIONS.SITE_STATUS, 2],
    [TRANSITIONS.RESOURCE_HEALTH, 11],
    [TRANSITIONS.RESOURCE_HEALTH, 12],
  ]);
});

test('concurrent refreshes share one read', async () => {
  const pangolin = createFakePangolin();
  const monitor = createMonitor({ fetch: pangolin.fetch });
  await Promise.all([monitor.refresh(config), monitor.refresh(config), monitor.refresh(config)]);
  assert.equal(pangolin.requests.length, 2, 'one sites + one resources request');
});

test('a read started before a reset does not overwrite the new state', async () => {
  const pangolin = createFakePangolin();
  const monitor = createMonitor({ fetch: pangolin.fetch });
  const pending = monitor.refresh(config);
  monitor.reset();
  const outcome = await pending;
  assert.equal(outcome.stale, true);
  assert.equal(monitor.state.snapshot, null);
});

test('a failed read keeps the last snapshot and reports the disconnection once', async () => {
  const pangolin = createFakePangolin();
  const monitor = createMonitor({ fetch: pangolin.fetch });
  await monitor.refresh(config);
  pangolin.failures.set(LOCAL_URL, 'unreachable');
  const first = await monitor.refresh(config);
  const second = await monitor.refresh(config);
  assert.equal(first.transitions.length, 1);
  assert.equal(second.transitions.length, 0);
  assert.equal(monitor.state.snapshot.sites.length, 3);
});
