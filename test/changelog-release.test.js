// The release commit is pushed straight to main by the Release workflow: what
// .github/scripts/changelog-release.mjs writes must be right the first time.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const REPO = 'https://github.com/prohand/gladys-pangolin';

test('the Unreleased section moves under the new version, links follow', () => {
  const text = `# Changelog\n\n## [Unreleased]\n\n### Added\n\n- A thing.\n\n[Unreleased]: ${REPO}/commits/main\n`;
  const rolled = rollChangelog(text, '1.0.0', '2026-10-18');
  assert.match(
    rolled,
    /## \[Unreleased\]\n\n## \[1\.0\.0\] - 2026-10-18\n\n### Added\n\n- A thing\.\n/,
  );
  assert.match(rolled, new RegExp(`\\[Unreleased\\]: ${REPO}/compare/v1\\.0\\.0\\.\\.\\.HEAD`));
  assert.match(rolled, new RegExp(`\\[1\\.0\\.0\\]: ${REPO}/releases/tag/v1\\.0\\.0`));

  const next = rollChangelog(rolled, '1.0.1', '2026-10-19');
  assert.match(
    next,
    /## \[1\.0\.1\] - 2026-10-19\n\n- Maintenance release, no functional change\./,
  );
  assert.match(next, new RegExp(`\\[1\\.0\\.1\\]: ${REPO}/compare/v1\\.0\\.0\\.\\.\\.v1\\.0\\.1`));
});

test('the real CHANGELOG.md has an Unreleased section and its link', async () => {
  const text = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.ok(text.includes('## [Unreleased]'));
  assert.match(text, /^\[Unreleased\]: https:\/\/github\.com\/prohand\/gladys-pangolin\//m);
});
