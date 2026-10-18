// -----------------------------------------------------------------------------
// The integration end to end: the fake Gladys of the SDK on one side, the fake
// Pangolin API on the other, src/app.js in between.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../src/app.js';
import { CLOUD_URL, createFakePangolin, fakeConfig, LOCAL_URL } from './helpers/fakePangolin.js';

const SELECTOR = 'test-integration';
const siteId = (id) => `ext:${SELECTOR}:site:${id}`;
const resourceId = (id) => `ext:${SELECTOR}:resource:${id}`;

/** Connect a fake Gladys to the app, with the given config. */
async function start(t, { config = fakeConfig(), pangolin = createFakePangolin() } = {}) {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, { fetch: pangolin.fetch });
  await gladys.connect();
  t.after(async () => {
    app.stop();
    await gladys.disconnect();
  });
  return { gladys, app, pangolin };
}

/** The user creates every discovered device (Discovery tab, "Create"). */
async function createAll(gladys) {
  for (const device of gladys.fake.discoveredDevices) {
    await gladys.fake.deviceCreated(device);
  }
}

/** Run one tick of the refresh timer and let it finish. */
async function tick(t, app, config = app.config()) {
  t.mock.timers.tick(config.poll_frequency * 1000);
  // The timer callback does not return its promise: read again explicitly and
  // await the shared in-flight read.
  await app.refresh();
}

test('connecting publishes one device per site and per resource, and reports connected', async (t) => {
  const { gladys } = await start(t);
  const ids = gladys.fake.discoveredDevices.map((device) => device.external_id).sort();
  assert.deepEqual(ids, [
    resourceId(10),
    resourceId(11),
    resourceId(12),
    siteId(1),
    siteId(2),
    siteId(3),
  ]);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('an incomplete configuration says what is missing and calls nothing', async (t) => {
  const pangolin = createFakePangolin();
  const { gladys } = await start(t, { config: { api_key: '' }, pangolin });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /address.*API key.*organization ID/);
  assert.equal(pangolin.requests.length, 0);
});

test('created devices get their states, uncreated ones never do', async (t) => {
  const { gladys } = await start(t);
  // Only the NAS is created.
  const nas = gladys.fake.discoveredDevices.find((d) => d.external_id === resourceId(10));
  await gladys.fake.deviceCreated(nas);
  assert.equal(gladys.fake.lastState(`${resourceId(10)}:enabled`), 1);
  assert.equal(gladys.fake.lastState(`${resourceId(10)}:healthy`), 1);
  assert.ok(
    gladys.fake.states.every((s) => s.device_feature_external_id.startsWith(resourceId(10))),
  );
});

test('states follow Pangolin at each tick', async (t) => {
  const { gladys, app, pangolin } = await start(t);
  await createAll(gladys);
  assert.equal(gladys.fake.lastState(`${siteId(1)}:online`), 1);
  assert.equal(gladys.fake.lastState(`${siteId(1)}:data-in`), 12.346);
  assert.equal(gladys.fake.lastState(`${siteId(2)}:online`), 0);
  // A local site has no online state, a resource of unknown health no health.
  assert.equal(gladys.fake.lastState(`${siteId(3)}:online`), undefined);
  assert.equal(gladys.fake.lastState(`${resourceId(11)}:healthy`), undefined);

  pangolin.sites[1].online = true;
  await tick(t, app);
  assert.equal(gladys.fake.lastState(`${siteId(2)}:online`), 1);
});

test('a site going offline fires site_status_changed once', async (t) => {
  const { gladys, app, pangolin } = await start(t);
  assert.equal(gladys.fake.sceneEvents.length, 0, 'the first read is a state, not an event');

  pangolin.sites[0].online = false;
  await tick(t, app);
  await tick(t, app);
  const events = gladys.fake.sceneEvents.filter((e) => e.key === 'site_status_changed');
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].data, { device: siteId(1), status: 'offline', site_name: 'House' });
});

test('a resource whose health changes fires resource_health_changed', async (t) => {
  const { gladys, app, pangolin } = await start(t);
  pangolin.resources[0].health = 'unhealthy';
  await tick(t, app);
  const [event] = gladys.fake.sceneEvents;
  assert.equal(event.key, 'resource_health_changed');
  assert.deepEqual(event.data, {
    device: resourceId(10),
    health: 'unhealthy',
    previous_health: 'healthy',
    resource_name: 'NAS',
    address: 'nas.example.com',
  });
});

test('losing and finding Pangolin fires connection_changed and updates the status', async (t) => {
  const { gladys, app, pangolin } = await start(t);
  await createAll(gladys);
  pangolin.failures.set(LOCAL_URL, 'unreachable');
  await tick(t, app);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /does not answer.*ECONNREFUSED/);
  assert.ok(
    gladys.fake.transports.slice(-6).every((entry) => entry.transport === 'unreachable'),
    'every created device is shown unreachable',
  );

  pangolin.failures.delete(LOCAL_URL);
  await tick(t, app);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  const statuses = gladys.fake.sceneEvents
    .filter((e) => e.key === 'connection_changed')
    .map((e) => e.data.status);
  assert.deepEqual(statuses, ['disconnected', 'connected']);
});

test('the cloud address takes over when the local one is down, shown as degraded', async (t) => {
  const pangolin = createFakePangolin();
  pangolin.failures.set(LOCAL_URL, 'unreachable');
  const { gladys } = await start(t, { config: fakeConfig({ cloud_url: CLOUD_URL }), pangolin });
  await createAll(gladys);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  const last = gladys.fake.transports.at(-1);
  assert.equal(last.transport, 'cloud');
  assert.equal(last.degraded, true);
  assert.ok(last.message.en.length <= 200);
});

test('preferring the cloud calls the cloud address first, without degraded flag', async (t) => {
  const pangolin = createFakePangolin();
  const { gladys } = await start(t, {
    config: fakeConfig({ cloud_url: CLOUD_URL, GLADYS_PREFER_LOCAL: false }),
    pangolin,
  });
  await createAll(gladys);
  assert.ok(pangolin.requests.every((r) => r.url.startsWith(CLOUD_URL)));
  const last = gladys.fake.transports.at(-1);
  assert.equal(last.transport, 'cloud');
  assert.equal(last.degraded, undefined);
});

test('switching a resource off from Gladys disables it in Pangolin', async (t) => {
  const { gladys, pangolin } = await start(t);
  await createAll(gladys);
  const device = gladys.fake.devices.find((d) => d.external_id === resourceId(10));
  const feature = device.features.find((f) => f.external_id.endsWith(':enabled'));
  const ack = await gladys.fake.setValue(device, feature, 0);
  assert.deepEqual(ack, { success: true });
  assert.equal(pangolin.resources[0].enabled, false);
  assert.deepEqual(pangolin.requests.at(-1).body, { enabled: false });
  assert.equal(gladys.fake.lastState(feature.external_id), 0);
});

test('a read-only feature refuses commands', async (t) => {
  const { gladys } = await start(t);
  await createAll(gladys);
  const device = gladys.fake.devices.find((d) => d.external_id === siteId(1));
  const ack = await gladys.fake.setValue(device, device.features[0], 0);
  assert.equal(ack.success, false);
});

test('scene action set_resource_enabled returns the confirmed state', async (t) => {
  const { gladys, pangolin } = await start(t);
  const ack = await gladys.fake.sceneAction('set_resource_enabled', {
    device: resourceId(12),
    enabled: true,
  });
  assert.deepEqual(ack.data.outputs, { enabled: true });
  assert.equal(pangolin.resources[2].enabled, true);

  const refused = await gladys.fake.sceneAction('set_resource_enabled', {
    device: siteId(1),
    enabled: true,
  });
  assert.equal(refused.success, false, 'a site is not a resource');
});

test('scene action refresh_status returns the counts', async (t) => {
  const { gladys } = await start(t);
  const ack = await gladys.fake.sceneAction('refresh_status', {});
  assert.deepEqual(ack.data.outputs, {
    connected: true,
    sites_online: 1,
    sites_offline: 1,
    resources_unhealthy: 1,
    resources_disabled: 1,
  });
});

test('test_connection reports every configured address', async (t) => {
  const pangolin = createFakePangolin();
  pangolin.failures.set(CLOUD_URL, 401);
  const { gladys } = await start(t, { config: fakeConfig({ cloud_url: CLOUD_URL }), pangolin });
  const ack = await gladys.fake.action('test_connection', {});
  const [local, cloud] = ack.data.message.en.split('\n');
  assert.match(
    local,
    /^✔ http:\/\/192\.168\.1\.10:3004\/v1 \(local\): organization "Home", 3 site/,
  );
  assert.match(
    cloud,
    /^✘ https:\/\/api\.pangolin\.net\/v1 \(Internet\): Pangolin refused the API key/,
  );
  for (const language of ['fr', 'de', 'es']) {
    assert.ok(ack.data.message[language], `message in ${language}`);
  }
  assert.ok(!JSON.stringify(ack.data.message).includes('s3cr3t'), 'the key never leaks');
});

test('the widget content is valid and its Refresh button answers', async (t) => {
  const { gladys } = await start(t);
  const ack = await gladys.fake.widgetGet('pangolin_overview');
  assert.deepEqual(validateWidgetContent(ack.data.content), []);
  const refreshed = await gladys.fake.widgetAction('pangolin_overview', 'refresh', {});
  assert.equal(refreshed.success, true);
  assert.ok(gladys.fake.widgetRefreshes.includes('pangolin_overview'));
});

test('a new configuration pointing at another organization starts from scratch', async (t) => {
  const { gladys, pangolin } = await start(t);
  pangolin.sites[0].online = false;
  await gladys.fake.configUpdated(fakeConfig({ org_id: 'other' }));
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /no organization "other"/);
  // Back to the first organization: the first read is a state again, no event.
  await gladys.fake.configUpdated(fakeConfig());
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(gladys.fake.sceneEvents.filter((e) => e.key === 'site_status_changed').length, 0);
});
