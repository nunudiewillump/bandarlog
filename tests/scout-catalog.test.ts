import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  artworkCatalog,
  inferArtworkTheme,
  selectArtwork,
  hasArtworkAssociation,
  projectArtworkTheme,
} from '../shared/scout-catalog';

test('catalogue has 302 scout pairs and a separate Christmas collection with stable asset identifiers', () => {
  assert.equal(artworkCatalog.filter((entry) => entry.collection === 'scout').length, 302);
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

test('Servicios and Animación select dedicated pairs and Autobuses becomes Logística without changing its saved key', () => {
  for (const [name, id] of [
    ['Servicios', 'servicios-general'],
    ['Animación', 'animacion-general'],
    ['Logística', 'logistica-02'],
  ]) {
    const entry = selectArtwork({ name, theme: 'scout', seed: 'any-commission-id' });
    assert.equal(entry.id, id);
    assert.equal(entry.name, name);
  }
  const logistics = selectArtwork({ name: 'Otra comisión', theme: 'scout', key: 'logistica-02' });
  assert.equal(logistics.name, 'Logística');
  assert.equal(logistics.mascotUrl, '/artwork/mascots/002.webp#tile=4');
  assert.ok(!artworkCatalog.some((entry) => entry.name === 'Autobuses'));
});

test('Christmas has six named pairs and names determine whether manual selection is available', () => {
  for (const [name, key] of [
    ['Servicios', 'servicios'],
    ['Animación', 'animacion'],
    ['Material', 'material'],
    ['Menú', 'menu'],
    ['Logística', 'logistica'],
    ['Lugar', 'lugar'],
  ]) {
    assert.equal(selectArtwork({ name, theme: 'christmas' }).id, `navidad-${key}`);
    assert.equal(hasArtworkAssociation(name, 'christmas'), true);
    assert.equal(hasArtworkAssociation(name, 'scout'), true);
  }
  assert.equal(hasArtworkAssociation('Equipo QA sin coincidencias', 'scout'), false);
  assert.equal(
    projectArtworkTheme({ name: 'Campamento de Navidad', artworkTheme: 'scout' }),
    'christmas',
  );
});

test('automatic icons prioritize the nearest name, independent of seed and misleading descriptions', () => {
  for (const name of ['Servicios', 'Logística', 'Animacion', 'Menús', 'Material']) {
    const first = selectArtwork({ name, theme: 'christmas', seed: 'first' });
    const second = selectArtwork({
      name,
      theme: 'christmas',
      seed: 'other',
      description: 'Botiquín, salud, enfermería',
    });
    assert.equal(first.id, second.id);
  }
  assert.equal(
    selectArtwork({ name: 'Comisión de animación', theme: 'scout' }).id,
    'animacion-general',
  );
  assert.equal(selectArtwork({ name: 'Logistca', theme: 'scout' }).family, 'logistica');
});
