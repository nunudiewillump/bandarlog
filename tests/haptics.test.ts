import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskHaptic } from '../src/haptics';
test('haptic enhancement uses bounded patterns and honours preferences, motion and unsupported devices', () => {
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    media = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
  const calls: (number | number[])[] = [];
  try {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        vibrate: (value: number | number[]) => {
          calls.push(value);
          return true;
        },
      },
    });
    Object.defineProperty(globalThis, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false }),
    });
    assert.equal(taskHaptic('start'), true);
    assert.equal(taskHaptic('done'), true);
    assert.equal(taskHaptic('error'), true);
    assert.deepEqual(calls, [18, [15, 45, 15], [25, 30, 10]]);
    assert.equal(taskHaptic('start', false), false);
    Object.defineProperty(globalThis, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: true }),
    });
    assert.equal(taskHaptic('start'), false);
    assert.equal(calls.length, 3);
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
    assert.equal(taskHaptic('done'), false);
    Object.defineProperty(globalThis, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false }),
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        vibrate: () => {
          throw Error('Unavailable');
        },
      },
    });
    assert.equal(taskHaptic('done'), false);
  } finally {
    if (nav) Object.defineProperty(globalThis, 'navigator', nav);
    else delete (globalThis as any).navigator;
    if (media) Object.defineProperty(globalThis, 'matchMedia', media);
    else delete (globalThis as any).matchMedia;
  }
});
