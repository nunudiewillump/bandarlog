import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeChecklist, ChecklistError, type ChecklistItem } from '../server/task-checklist';
test('checklist caps stored steps without mutating existing data and frees capacity on removal', () => {
  const items: ChecklistItem[] = Array.from({ length: 100 }, (_, i) => ({
    id: crypto.randomUUID(),
    title: `Paso ${i + 1}`,
    done: false,
  }));
  const added = { action: 'add' as const, id: crypto.randomUUID(), title: 'Otro paso' };
  assert.throws(
    () => changeChecklist(items, added),
    (error: any) => error instanceof ChecklistError && error.status === 400,
  );
  const smaller = changeChecklist(items, { action: 'remove', id: items[0].id });
  assert.equal(changeChecklist(smaller, added).length, 100);
  assert.equal(items.length, 100);
  assert.equal(items[0].title, 'Paso 1');
});
