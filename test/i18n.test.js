import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, localize, pick } from '../src/i18n.js';

test('the four languages, English first since it is the fallback', () => {
  assert.deepEqual(LANGUAGES, ['en', 'fr', 'de', 'es']);
});

test('pick falls back to English', () => {
  assert.equal(pick('it', { en: 'Hello', fr: 'Bonjour' }), 'Hello');
  assert.equal(pick('fr', { en: 'Hello', fr: 'Bonjour' }), 'Bonjour');
});

test('localize builds one text per language', () => {
  assert.deepEqual(
    localize((language) => language.toUpperCase()),
    { en: 'EN', fr: 'FR', de: 'DE', es: 'ES' },
  );
});
