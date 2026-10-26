/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure mathematical functions for procedural Arabica coffee bean geometry,
 * tumbling dynamics, velocity easing, and progress interpolation.
 */

export interface BeanVertex {
  x: number;
  y: number;
  z: number;
  creaseFactor: number; // 0 (outer lobe) to 1 (deep crease fissure)
}

/**
 * Evaluates the 3D surface point and crease factor for an Arabica bean.
 * Uses smooth, analytic C^infinity Gaussian lobe and fissure profiles to
 * eliminate all facet stepping, pinching, and normal tearing.
 *
 * @param u Longitude angle [-PI, PI] around the circumference
 * @param v Latitude angle [-PI/2, PI/2] from tip to apex along Z
 */
export function evaluateArabicaSurface(u: number, v: number): BeanVertex {
  const zn = Math.sin(v);
  const cosV = Math.cos(v);

  // Length half-extent (Z axis)
  const length = 0.44;
  const z = zn * length;

  // Longitudinal taper: Arabica beans are subtly narrower at one tip
  const taper = 1.0 - 0.08 * zn - 0.06 * zn * zn;
  const crossRadius = Math.max(0.0001, cosV) * taper;

  // Base oval width (X) and dorsal height (Y)
  const baseWidth = 0.28;
  const dorsalHeight = 0.17;
  const ventralHeight = 0.09;

  const cosU = Math.cos(u);
  const sinU = Math.sin(u);

  let x = cosU * crossRadius * baseWidth;
  let y: number;
  let creaseFactor = 0;

  if (sinU >= 0) {
    // Dorsal side (rounded shell / back of the bean)
    // Smooth convex dome with subtle organic curvature
    y = sinU * crossRadius * dorsalHeight;
    // Gentle organic crown
    y *= 1.0 + 0.06 * Math.sin(u * 2.0);
  } else {
    // Ventral side (flatter face with deep curved Arabica crease and dual lobes)
    const yBase = sinU * crossRadius * ventralHeight;

    // Arabica signature: curved S-fissure along the longitudinal axis
    const creaseCenterX = 0.028 * Math.sin(Math.PI * zn) * (1.0 - zn * zn);
    const distToCrease = x - creaseCenterX;

    // Normalized lateral distance across the bean width
    const localWidth = Math.max(0.01, crossRadius * baseWidth);
    const normDist = distToCrease / localWidth;

    // Smooth Gaussian fissure cutting inward (+Y direction) into the bean
    const envelope = Math.pow(Math.max(0, 1.0 - zn * zn), 0.6);
    const creaseWidth = 0.22;
    const fissureDepth = 0.18 * envelope * crossRadius;
    const inwardCrease = fissureDepth * Math.exp(-Math.pow(normDist / creaseWidth, 2));

    // Dual lobe swelling on left and right sides of the crease (-Y direction)
    const lobeDist = Math.abs(normDist) / 0.42;
    const lobeSwelling = 0.038 * envelope * crossRadius * lobeDist * Math.exp(-Math.pow(lobeDist, 1.6));

    y = yBase + inwardCrease - lobeSwelling;

    // Crease factor: 1.0 at center of fissure, falling smoothly to 0 on lobes
    creaseFactor = Math.min(1.0, Math.exp(-Math.pow(normDist / 0.20, 2)) * envelope);
  }

  // Subtle natural roasting micro-expansion waviness
  const waviness =
    0.005 * Math.cos(5.0 * x + 3.0 * z) * Math.sin(4.0 * z + 2.0 * y) * (1.0 - zn * zn);
  x += waviness * cosU;
  y += waviness * sinU;

  return { x, y, z, creaseFactor };
}

/**
 * Computes exponential damping of scroll velocity toward 0.
 */
export function dampVelocity(
  current: number,
  target: number = 0,
  lambda: number = 3.2,
  dt: number = 0.016
): number {
  return current + (target - current) * (1.0 - Math.exp(-lambda * dt));
}

/**
 * Computes bean dynamics: tumble speed multiplier and upward drift speed based on velocity.
 */
export function computeBeanDynamics(velocity: number) {
  const absV = Math.abs(velocity);
  const tumbleMultiplier = 1.0 + Math.min(absV * 0.018, 4.5);
  const streamUpSpeed = 0.06 + Math.min(absV * 0.024, 3.5);

  return { tumbleMultiplier, streamUpSpeed };
}

/**
 * Computes spread factor, scale factor, and blur factor from progress p in [0, 1].
 */
export function computeProgressFactors(progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  const spreadScale = 1.0 + p * 0.55;
  const sizeMultiplier = 1.0 - p * 0.25;
  const blurMultiplier = 1.0 + p * 0.85;

  return { spreadScale, sizeMultiplier, blurMultiplier };
}

/**
 * Wraps bean vertical position within bounding box [-yBound, yBound].
 */
export function wrapPosition(y: number, yBound: number = 4.2): { y: number; didWrap: boolean } {
  if (y > yBound) {
    return { y: -yBound + (y - yBound), didWrap: true };
  }
  if (y < -yBound) {
    return { y: yBound - (-yBound - y), didWrap: true };
  }
  return { y, didWrap: false };
}

/**
 * Authentic roasted Arabica coffee color palette: deep espresso to warm chestnut brown.
 */
export const ROAST_PALETTE = [
  '#160a04', // Very dark Italian roast
  '#1d0e06', // French roast
  '#251208', // Espresso dark roast
  '#2f170b', // Deep Viennese roast
  '#3a1d0f', // Dark chestnut brown
  '#462413', // Warm medium roast
  '#512b18', // Golden cinnamon roast
  '#5c321d', // Amber chestnut roast
];

/**
 * Deterministic pseudo-random number generator for reproducible bean distributions.
 */
export function createSeededRandom(seed: number = 42) {
  let s = seed;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
