/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateArabicaSurface,
  dampVelocity,
  computeBeanDynamics,
  computeProgressFactors,
  wrapPosition,
  ROAST_PALETTE,
  createSeededRandom,
} from './beanMath';

test('evaluateArabicaSurface generates valid coordinates and crease detection', () => {
  // Test dorsal side (u = PI / 2, looking up)
  const dorsal = evaluateArabicaSurface(Math.PI / 2, 0);
  assert.ok(dorsal.y > 0, 'Dorsal side should have positive Y');
  assert.equal(dorsal.creaseFactor, 0, 'Dorsal side should have 0 crease factor');
  assert.ok(!Number.isNaN(dorsal.x) && !Number.isNaN(dorsal.y) && !Number.isNaN(dorsal.z));

  // Test ventral center (u = -PI / 2, v = 0)
  const ventralCenter = evaluateArabicaSurface(-Math.PI / 2, 0);
  assert.ok(ventralCenter.creaseFactor > 0.5, 'Ventral center should have high crease factor');
  assert.ok(!Number.isNaN(ventralCenter.x) && !Number.isNaN(ventralCenter.y));

  // Test tips
  const tipA = evaluateArabicaSurface(0, -Math.PI / 2);
  const tipB = evaluateArabicaSurface(0, Math.PI / 2);
  assert.ok(Math.abs(tipA.x) < 0.01 && Math.abs(tipA.y) < 0.01);
  assert.ok(Math.abs(tipB.x) < 0.01 && Math.abs(tipB.y) < 0.01);
});

test('dampVelocity decays velocity toward target', () => {
  let v = 100;
  for (let i = 0; i < 10; i++) {
    v = dampVelocity(v, 0, 3.2, 0.016);
  }
  assert.ok(v < 100, 'Velocity should decrease after damping');
  assert.ok(v > 0, 'Velocity should decay smoothly without undershooting below 0');

  // After sufficient damping frames, it should be very close to 0
  for (let i = 0; i < 200; i++) {
    v = dampVelocity(v, 0, 3.2, 0.016);
  }
  assert.ok(v < 0.01, 'Velocity should approach 0 closely');
});

test('computeBeanDynamics scales tumble and stream speed with velocity', () => {
  const base = computeBeanDynamics(0);
  const high = computeBeanDynamics(80);

  assert.equal(base.tumbleMultiplier, 1.0, 'Baseline tumble multiplier should be 1.0');
  assert.ok(base.streamUpSpeed > 0, 'Baseline stream speed should be positive');
  assert.ok(high.tumbleMultiplier > base.tumbleMultiplier, 'High velocity tumbles faster');
  assert.ok(high.streamUpSpeed > base.streamUpSpeed, 'High velocity streams upward faster');
});

test('computeProgressFactors maps progress correctly to spread, scale, and blur', () => {
  const p0 = computeProgressFactors(0);
  assert.equal(p0.spreadScale, 1.0);
  assert.equal(p0.sizeMultiplier, 1.0);
  assert.equal(p0.blurMultiplier, 1.0);

  const p1 = computeProgressFactors(1.0);
  assert.ok(p1.spreadScale > 1.0, 'Beans should spread out as progress increases');
  assert.ok(p1.sizeMultiplier < 1.0, 'Beans should become slightly smaller as progress increases');
  assert.ok(p1.blurMultiplier > 1.0, 'Beans should become more blurred as progress increases');

  // Clamping test
  const pClamp = computeProgressFactors(1.5);
  assert.equal(pClamp.spreadScale, p1.spreadScale);
});

test('wrapPosition correctly wraps coordinates across viewport bounds', () => {
  const inside = wrapPosition(1.5, 4.0);
  assert.equal(inside.y, 1.5);
  assert.equal(inside.didWrap, false);

  const wrappedTop = wrapPosition(4.5, 4.0);
  assert.ok(wrappedTop.didWrap);
  assert.ok(wrappedTop.y < 0, 'Position exceeding top should wrap to bottom');

  const wrappedBottom = wrapPosition(-4.5, 4.0);
  assert.ok(wrappedBottom.didWrap);
  assert.ok(wrappedBottom.y > 0, 'Position exceeding bottom should wrap to top');
});

test('ROAST_PALETTE contains valid hexadecimal coffee colors', () => {
  assert.ok(ROAST_PALETTE.length >= 6);
  for (const hex of ROAST_PALETTE) {
    assert.match(hex, /^#[0-9a-fA-F]{6}$/);
  }
});

test('createSeededRandom generates deterministic sequence', () => {
  const rng1 = createSeededRandom(123);
  const seq1 = [rng1(), rng1(), rng1()];

  const rng2 = createSeededRandom(123);
  const seq2 = [rng2(), rng2(), rng2()];

  assert.deepEqual(seq1, seq2, 'Seeded RNG must be strictly deterministic');
});
