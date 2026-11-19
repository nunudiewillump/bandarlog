import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveUsage,
  usageGroups,
  type UsagePeriod,
} from '../docs/platform-administration/usage-model.js';

test('usage counts accounts within groups and distinguishes adoption, recurrence and previous-cohort retention', () => {
  const data = deriveUsage('7', usageGroups);
  assert.equal(data.daily, 19);
  assert.equal(data.weekly, 57);
  assert.equal(data.monthly, 86);
  assert.equal(data.members, 118);
  assert.equal(data.contributors, 35);
  assert.equal(data.recurrence, 33 / 57);
  assert.equal(data.retention, 44 / 49);
  assert.equal(data.adoption, 57 / 118);
  assert.equal(data.meanDays, 157 / 57);
  assert.equal(data.events, 119);
  // Checklist and finalization overlap updates; adding every display row would double count.
  assert.ok(data.events < data.features.reduce((n, f) => n + f.events, 0));
});
test('period changes affect usage and comparisons, while daily/weekly/monthly windows remain explicit', () => {
  const week = deriveUsage('7', usageGroups),
    month = deriveUsage('30', usageGroups);
  assert.equal(month.active, 86);
  assert.equal(month.previous, 74);
  assert.equal(month.retention, 61 / 74);
  assert.equal(month.features.find((f) => f.label === 'Tareas creadas')!.events, 49);
  assert.equal(week.features.find((f) => f.label === 'Tareas creadas')!.events, 18);
  assert.equal(month.activeProjects, 10);
  assert.equal(week.activeProjects, 7);
  assert.equal(month.daily, week.daily);
  assert.equal(month.weekly, week.weekly);
  assert.equal(month.monthly, week.monthly);
});
test('synthetic usage denominators and actors remain coherent in every group and window', () => {
  for (const group of usageGroups) {
    assert.ok(group.daily <= group.periods['7'].active);
    assert.ok(group.periods['7'].active <= group.periods['30'].active);
    for (const period of ['7', '30'] as UsagePeriod[]) {
      const window = group.periods[period];
      assert.ok(window.active <= group.members);
      assert.ok(window.returning <= Math.min(window.active, window.previous));
      assert.ok(window.recurring <= window.active);
      assert.ok(window.contributors <= window.active);
      assert.ok(window.days >= window.active + window.recurring);
      assert.ok(window.days <= window.active * Number(period));
      assert.ok(window.activeProjects <= group.projects);
      const data = deriveUsage(period, [group]);
      for (const feature of data.features) {
        assert.ok(feature.users <= feature.events);
        assert.ok(feature.users <= window.contributors);
        assert.ok(feature.reach === null || (feature.reach >= 0 && feature.reach <= 1));
      }
    }
  }
});
test('empty and inactive groups have unknown rates rather than invented percentages or NaN', () => {
  for (const groups of [[], usageGroups.filter((g) => g.name === 'Grupo Mirador')]) {
    const data = deriveUsage('7', groups);
    assert.equal(data.collaboration, null);
    assert.equal(data.recurrence, null);
    assert.equal(data.retention, null);
    assert.equal(data.change, null);
    assert.equal(data.meanDays, null);
    assert.ok(data.features.every((f) => f.reach === null));
  }
});
