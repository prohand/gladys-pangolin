import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  missingSettings,
  normalizeApiUrl,
  normalizeConfig,
} from '../src/config.js';

test('an API address gets its /v1, with or without a trailing slash', () => {
  assert.equal(normalizeApiUrl('https://api.example.com'), 'https://api.example.com/v1');
  assert.equal(normalizeApiUrl('https://api.example.com/v1/'), 'https://api.example.com/v1');
  assert.equal(normalizeApiUrl(' http://192.168.1.10:3004 '), 'http://192.168.1.10:3004/v1');
  assert.equal(
    normalizeApiUrl('https://example.com/pangolin/api'),
    'https://example.com/pangolin/api/v1',
  );
});

test('an address that is not http(s) is ignored, credentials and query are dropped', () => {
  assert.equal(normalizeApiUrl(''), '');
  assert.equal(normalizeApiUrl('not a url'), '');
  assert.equal(normalizeApiUrl('ftp://example.com'), '');
  assert.equal(
    normalizeApiUrl('https://user:pw@api.example.com/v1?x=1#y'),
    'https://api.example.com/v1',
  );
});

test('the refresh interval is kept within its bounds', () => {
  assert.equal(normalizeConfig({ poll_frequency: '5' }).poll_frequency, 30);
  assert.equal(normalizeConfig({ poll_frequency: 99999 }).poll_frequency, 3600);
  assert.equal(
    normalizeConfig({ poll_frequency: 'abc' }).poll_frequency,
    DEFAULT_CONFIG.poll_frequency,
  );
  assert.equal(normalizeConfig().poll_frequency, 60);
});

test('only an explicit false turns the local preference off', () => {
  assert.equal(normalizeConfig().GLADYS_PREFER_LOCAL, true);
  assert.equal(normalizeConfig({ GLADYS_PREFER_LOCAL: false }).GLADYS_PREFER_LOCAL, false);
});

test('missingSettings names what blocks the API calls', () => {
  assert.deepEqual(missingSettings(normalizeConfig()), ['url', 'api_key', 'org_id']);
  assert.deepEqual(
    missingSettings(
      normalizeConfig({ cloud_url: 'https://api.pangolin.net', api_key: 'a.b', org_id: 'x' }),
    ),
    [],
  );
});
