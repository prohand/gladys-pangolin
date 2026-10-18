import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
import { callPangolin, channelsOf } from '../src/pangolin/transport.js';
import {
  CLOUD_URL,
  createFakePangolin,
  fakeConfig,
  LOCAL_URL,
  ORG_ID,
} from './helpers/fakePangolin.js';

const both = (overrides = {}) =>
  normalizeConfig(fakeConfig({ cloud_url: CLOUD_URL, ...overrides }));
const listSites = (client) => client.listSites(ORG_ID);

test('the local preference orders the channels', () => {
  assert.deepEqual(
    channelsOf(both()).map((c) => c.transport),
    ['local', 'cloud'],
  );
  assert.deepEqual(
    channelsOf(both({ GLADYS_PREFER_LOCAL: false })).map((c) => c.transport),
    ['cloud', 'local'],
  );
  assert.deepEqual(
    channelsOf(normalizeConfig(fakeConfig({ local_url: '', cloud_url: CLOUD_URL }))).map(
      (c) => c.transport,
    ),
    ['cloud'],
  );
});

test('the nominal channel answering is not degraded', async () => {
  const pangolin = createFakePangolin();
  const outcome = await callPangolin(both(), listSites, { fetch: pangolin.fetch });
  assert.equal(outcome.transport, 'local');
  assert.equal(outcome.degraded, false);
});

for (const failure of ['unreachable', 502, 503, 504]) {
  test(`a nominal channel answering ${failure} falls back, degraded`, async () => {
    const pangolin = createFakePangolin();
    pangolin.failures.set(LOCAL_URL, failure);
    const outcome = await callPangolin(both(), listSites, { fetch: pangolin.fetch });
    assert.equal(outcome.transport, 'cloud');
    assert.equal(outcome.degraded, true);
    assert.ok(outcome.fallbackReason);
  });
}

test('a refused key does not fall back: the other address is the same server', async () => {
  const pangolin = createFakePangolin();
  pangolin.failures.set(LOCAL_URL, 401);
  await assert.rejects(callPangolin(both(), listSites, { fetch: pangolin.fetch }), { status: 401 });
  assert.ok(pangolin.requests.every((r) => r.url.startsWith(LOCAL_URL)));
});

test('both channels down rejects with the last error', async () => {
  const pangolin = createFakePangolin();
  pangolin.failures.set(LOCAL_URL, 'unreachable');
  pangolin.failures.set(CLOUD_URL, 'unreachable');
  await assert.rejects(
    callPangolin(both(), listSites, { fetch: pangolin.fetch }),
    /api\.pangolin\.net/,
  );
});
