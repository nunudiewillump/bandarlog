import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyTutorial } from '../shared/tutorial';
import {
  advanceTutorial,
  tutorialCommand,
  summarizeTutorial,
  isAbandoned,
  ABANDON_AFTER_MS,
} from '../server/tutorial';
const start = '2026-10-30T09:00:00.000Z';
const later = (ms: number) => new Date(Date.parse(start) + ms).toISOString();
test('first completion is optional, unique and never celebrated again after undo or replay', () => {
  const initial = emptyTutorial();
  let p = advanceTutorial(initial, { action: 'open' }, start).progress;
  assert.equal(initial.events.tutorial_started, undefined);
  const first = advanceTutorial(
    p,
    { action: 'status', status: 'done', expectedVersion: p.version },
    later(120000),
  );
  assert.equal(first.celebrate, true);
  assert.deepEqual(first.progress.steps, [false, false]);
  p = advanceTutorial(
    first.progress,
    { action: 'undo', expectedVersion: first.progress.version },
    later(121000),
  ).progress;
  assert.equal(p.taskStatus, 'pending');
  assert.ok(p.events.tutorial_completed);
  assert.ok(p.events.tutorial_undo_used);
  const again = advanceTutorial(
    p,
    { action: 'status', status: 'done', expectedVersion: p.version },
    later(122000),
  );
  assert.equal(again.celebrate, false);
  p = advanceTutorial(again.progress, { action: 'open', restart: true }, later(123000)).progress;
  assert.equal(p.taskStatus, 'pending');
  assert.equal(
    advanceTutorial(
      p,
      { action: 'status', status: 'done', expectedVersion: p.version },
      later(124000),
    ).celebrate,
    false,
  );
  assert.equal(p.events.tutorial_completed, later(120000));
});
test('abandonment requires a start and 24h inactivity, never a mere display or an explicit skip', () => {
  let p = advanceTutorial(emptyTutorial(), { action: 'shown' }, start).progress;
  assert.equal(isAbandoned(p, Date.parse(start) + ABANDON_AFTER_MS * 2), false);
  p = advanceTutorial(p, { action: 'open' }, start).progress;
  assert.equal(isAbandoned(p, Date.parse(start) + ABANDON_AFTER_MS - 1), false);
  assert.equal(isAbandoned(p, Date.parse(start) + ABANDON_AFTER_MS), true);
  const reopened = advanceTutorial(p, { action: 'open' }, later(ABANDON_AFTER_MS + 1)).progress;
  assert.ok(reopened.events.tutorial_abandoned);
  assert.ok(reopened.events.tutorial_reopened);
  assert.equal(isAbandoned(reopened, Date.parse(later(ABANDON_AFTER_MS + 2))), false);
  p = advanceTutorial(p, { action: 'skip' }, later(1000)).progress;
  assert.equal(isAbandoned(p, Date.parse(start) + ABANDON_AFTER_MS * 2), false);
});
test('metrics count unique people, distinguish never-started and skipped, and compute the median of first completions', () => {
  const shown = advanceTutorial(emptyTutorial(), { action: 'shown' }, start).progress;
  const skip = advanceTutorial(emptyTutorial(), { action: 'skip' }, start).progress;
  const opened = advanceTutorial(emptyTutorial(), { action: 'open' }, start).progress;
  const a = advanceTutorial(
    opened,
    { action: 'status', status: 'done', expectedVersion: opened.version },
    later(100000),
  ).progress;
  const b = advanceTutorial(
    opened,
    { action: 'status', status: 'done', expectedVersion: opened.version },
    later(300000),
  ).progress;
  const stats = summarizeTutorial([shown, skip, a, b], Date.parse(later(400000)));
  assert.deepEqual(
    [stats.shown, stats.started, stats.skipped, stats.completed, stats.neverStarted],
    [4, 2, 1, 2, 1],
  );
  assert.deepEqual(stats.rates, {
    started: 50,
    skipped: 25,
    completed: 50,
    completedAmongStarted: 100,
  });
  assert.equal(stats.medianCompletionMs, 200000);
  assert.equal(stats.abandoned, 0);
  assert.equal(summarizeTutorial([]).medianCompletionMs, null);
  assert.deepEqual(summarizeTutorial([]).rates, {
    started: 0,
    skipped: 0,
    completed: 0,
    completedAmongStarted: 0,
  });
});
test('tutorial accepts only bounded state and usage flags, not content, user IDs or caller timestamps', () => {
  for (const body of [
    { action: 'update', expectedVersion: 0, body: 'PRIVATE' },
    { action: 'shown', userId: 'other' },
    { action: 'shown', now: start },
    { action: 'check', expectedVersion: 0, index: 2, done: true },
    { action: 'status', expectedVersion: 0, status: 'unknown' },
  ])
    assert.equal(tutorialCommand.safeParse(body).success, false);
  assert.throws(() =>
    advanceTutorial(
      emptyTutorial(),
      { action: 'check', index: 0, done: true, expectedVersion: 0 },
      start,
    ),
  );
  const p = advanceTutorial(emptyTutorial(), { action: 'open' }, start).progress;
  assert.throws(
    () => advanceTutorial(p, { action: 'check', index: 0, done: true, expectedVersion: 0 }, start),
    /otra ventana/,
  );
});
