/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initBeans, BeansController } from './beans';

declare global {
  interface Window {
    beansController?: BeansController;
  }
}

function initApp() {
  const canvas = document.getElementById('beans-canvas') as HTMLCanvasElement;
  if (!canvas) {
    console.error('Canvas #beans-canvas not found');
    return;
  }

  // Initialize Three.js roasted coffee beans scene
  const controller = initBeans(canvas);
  window.beansController = controller;

  // Track scroll velocity and progress for demo preview
  let wheelMomentum = 0;
  let lastScrollY = window.scrollY;
  let lastScrollTime = performance.now();

  // Mouse wheel listener: fakes scroll velocity from the mouse wheel as requested
  window.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      // Normalize wheel delta across browsers and input devices
      const delta = Math.abs(e.deltaY);
      const impulse = Math.min(delta * 0.45, 45);
      wheelMomentum = Math.min(100, wheelMomentum + impulse);
      controller.setScrollVelocity(wheelMomentum);
    },
    { passive: true }
  );

  // Window scroll listener: calculates real page scroll progress p in [0, 1]
  // and scroll velocity from scroll movements
  function onScroll() {
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollHeight > 0 ? window.scrollY / scrollHeight : 0;
    controller.setProgress(progress);

    const now = performance.now();
    const dt = Math.max(10, now - lastScrollTime);
    const deltaY = Math.abs(window.scrollY - lastScrollY);
    const scrollSpeed = (deltaY / dt) * 60;

    if (scrollSpeed > 2) {
      wheelMomentum = Math.min(100, wheelMomentum + scrollSpeed * 0.35);
      controller.setScrollVelocity(wheelMomentum);
    }

    lastScrollY = window.scrollY;
    lastScrollTime = now;
  }

  window.addEventListener('scroll', onScroll, { passive: true });

  // Touch move listener for mobile drag scroll velocity
  let lastTouchY = 0;
  window.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      if (e.touches.length > 0) {
        lastTouchY = e.touches[0].clientY;
      }
    },
    { passive: true }
  );

  window.addEventListener(
    'touchmove',
    (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const currentY = e.touches[0].clientY;
        const delta = Math.abs(lastTouchY - currentY);
        wheelMomentum = Math.min(100, wheelMomentum + delta * 0.6);
        controller.setScrollVelocity(wheelMomentum);
        lastTouchY = currentY;
      }
    },
    { passive: true }
  );

  // Smooth decay loop for wheelMomentum
  function tickMomentum() {
    if (wheelMomentum > 0.05) {
      wheelMomentum *= 0.94;
      controller.setScrollVelocity(wheelMomentum);
    }
    requestAnimationFrame(tickMomentum);
  }
  requestAnimationFrame(tickMomentum);

  // Initial trigger
  onScroll();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
