import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGE_SIZE,
  PangolinApiError,
  PangolinClient,
  PangolinUnreachableError,
} from '../src/pangolin/client.js';
import { API_KEY, createFakePangolin, LOCAL_URL, ORG_ID } from './helpers/fakePangolin.js';

const clientOf = (pangolin, apiKey = API_KEY) =>
  new PangolinClient({ baseUrl: LOCAL_URL, apiKey, fetch: pangolin.fetch });

test('lists are unwrapped and every page is read', async () => {
  const sites = Array.from({ length: PAGE_SIZE * 2 + 5 }, (_, i) => ({
    siteId: i + 1,
    name: `Site ${i + 1}`,
    online: true,
  }));
  const pangolin = createFakePangolin({ sites });
  const listed = await clientOf(pangolin).listSites(ORG_ID);
  assert.equal(listed.length, sites.length);
  assert.equal(pangolin.requests.length, 3, 'three pages, no extra request');
  assert.match(pangolin.requests[0].url, /\/org\/home\/sites\?pageSize=100&page=1$/);
});

test('the key travels as a Bearer token, a wrong one is a 401 PangolinApiError', async () => {
  await assert.rejects(clientOf(createFakePangolin(), 'wrong.key').getOrg(ORG_ID), (err) => {
    assert.ok(err instanceof PangolinApiError);
    assert.equal(err.status, 401);
    assert.equal(err.message, 'Invalid API key');
    return true;
  });
});

test('getOrg returns the organization itself', async () => {
  assert.deepEqual(await clientOf(createFakePangolin()).getOrg(ORG_ID), {
    orgId: ORG_ID,
    name: 'Home',
  });
});

test('a server that does not answer is a PangolinUnreachableError naming the cause', async () => {
  const pangolin = createFakePangolin();
  pangolin.failures.set(LOCAL_URL, 'unreachable');
  await assert.rejects(clientOf(pangolin).listSites(ORG_ID), (err) => {
    assert.ok(err instanceof PangolinUnreachableError);
    assert.match(err.message, /ECONNREFUSED/);
    return true;
  });
});

test('an answer that is not JSON is not mistaken for an empty list', async () => {
  const client = new PangolinClient({
    baseUrl: LOCAL_URL,
    apiKey: API_KEY,
    fetch: async () => ({ ok: true, status: 200, json: async () => JSON.parse('<html>') }),
  });
  await assert.rejects(client.listSites(ORG_ID), /not the Pangolin API/);
});

test('setResourceEnabled posts the flag and returns the updated resource', async () => {
  const pangolin = createFakePangolin();
  const updated = await clientOf(pangolin).setResourceEnabled(10, false);
  assert.equal(updated.enabled, false);
  assert.deepEqual(pangolin.requests.at(-1), {
    url: `${LOCAL_URL}/resource/10`,
    method: 'POST',
    body: { enabled: false },
  });
});
