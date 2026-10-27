import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { artworkCatalog, inferArtworkTheme, selectArtwork } from '../shared/scout-catalog';

test('catalogue has 300 scout pairs and a separate Christmas collection with stable asset identifiers', () => {
  assert.equal(artworkCatalog.filter((entry) => entry.collection === 'scout').length, 300);
  assert.ok(artworkCatalog.filter((entry) => entry.collection === 'christmas').length >= 30);
  assert.equal(new Set(artworkCatalog.map((entry) => entry.id)).size, artworkCatalog.length);
  assert.equal(new Set(artworkCatalog.map((entry) => entry.mascotUrl)).size, artworkCatalog.length);
  const icons = new Set<string>();
  for (const entry of artworkCatalog) {
    assert.ok(existsSync('public' + entry.iconUrl), entry.iconUrl);
    icons.add(readFileSync('public' + entry.iconUrl, 'utf8'));
    assert.ok(existsSync('public' + entry.mascotUrl.split('#')[0]), entry.mascotUrl);
  }
  assert.equal(icons.size, artworkCatalog.length);
});

test('normal commission names choose matching pairs using the project collection', () => {
  for (const name of [
    'Cocina',
    'Logística',
    'Comunicación',
    'Animación',
    'Salud',
    'Infraestructura',
  ]) {
    const normal = selectArtwork({ name, theme: 'scout', seed: 'stable-id' });
    const christmas = selectArtwork({ name, theme: 'christmas', seed: 'stable-id' });
    assert.equal(normal.collection, 'scout');
    assert.equal(christmas.collection, 'christmas');
    assert.equal(normal.family, christmas.family);
    assert.notEqual(normal.mascotUrl, christmas.mascotUrl);
  }
  assert.equal(inferArtworkTheme('Campamento de invierno'), 'christmas');
  assert.equal(inferArtworkTheme('Campamento de verano'), 'scout');
  const kitchen = selectArtwork({ name: 'Cocina', theme: 'scout', seed: 'stable-id' });
  assert.deepEqual(kitchen, selectArtwork({ name: 'Cocina', theme: 'scout', seed: 'stable-id' }));
  const custom = artworkCatalog.find(
    (entry) => entry.collection === 'scout' && entry.family === 'orientacion',
  )!;
  assert.equal(selectArtwork({ name: 'Cocina', theme: 'scout', key: custom.id }).id, custom.id);
  assert.equal(
    selectArtwork({ name: 'Cocina', theme: 'christmas', key: custom.id }).collection,
    'christmas',
  );
});
