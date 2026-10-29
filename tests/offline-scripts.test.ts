import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
test('service worker and shared offline store parse as browser scripts', () => {
  for (const file of ['public/sw.js', 'public/offline-store.js'])
    assert.doesNotThrow(() => new vm.Script(readFileSync(file, 'utf8'), { filename: file }));
});
