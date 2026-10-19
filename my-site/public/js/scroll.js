// 滚动：滚轮/触控板由 Lenis 阻尼平滑，触屏保持原生惯性。
// 轻吸附只在滚轮滚动停下后触发；触屏、键盘、拖动滚动条与程序跳转都不吸附。
import Lenis from '../vendor/lenis.mjs';
import { reducedMotion } from './motion.js';
import { nearestPageOffset } from './pages.js';

const easeOutQuart = t => 1 - (1 - t) ** 4;
const GLIDE_SECONDS = 1.1;
const SNAP_SECONDS = 0.7;
const SNAP_IDLE_MS = 160;

let lenis = null;
let snapArmed = false;
let snapTimer = 0;
let canSnap = () => true;

function disarmSnap() {
  snapArmed = false;
  clearTimeout(snapTimer);
}

function scheduleSnap() {
  if (!snapArmed) return;
  clearTimeout(snapTimer);
  snapTimer = setTimeout(softSnap, SNAP_IDLE_MS);
}

function softSnap() {
  if (!lenis || lenis.isStopped || !snapArmed) return;
  snapArmed = false;
  if (!canSnap()) return;
  const y = window.scrollY;
  const offset = nearestPageOffset(y, Math.min(window.innerHeight * 0.18, 180));
  if (offset === null || Math.abs(offset) < 2) return;
  lenis.scrollTo(y + offset, { duration: SNAP_SECONDS, easing: easeOutQuart });
}

function syncSmoothScroll() {
  if (reducedMotion.matches) {
    disarmSnap();
    lenis?.destroy();
    lenis = null;
    return;
  }
  if (lenis) return;
  lenis = new Lenis({ lerp: 0.12, smoothWheel: true, anchors: false, autoRaf: true });
  lenis.on('scroll', scheduleSnap);
}

export function initSmoothScroll(options = {}) {
  if (options.canSnap) canSnap = options.canSnap;
  window.addEventListener('wheel', event => {
    if (!event.ctrlKey) snapArmed = true;
  }, { passive: true });
  ['touchstart', 'pointerdown', 'keydown'].forEach(type => window.addEventListener(type, disarmSnap, { passive: true }));
  reducedMotion.addEventListener('change', syncSmoothScroll);
  syncSmoothScroll();
}

/** 锁定滚动（打开目录时）。 */
export function stopScroll() {
  disarmSnap();
  if (lenis) lenis.stop();
  else window.scrollTo({ top: window.scrollY, behavior: 'instant' });
}

export function startScroll() {
  lenis?.start();
}

export function jumpTo(top) {
  disarmSnap();
  if (lenis) lenis.scrollTo(top, { immediate: true, force: true });
  else window.scrollTo({ top, behavior: 'instant' });
}

export function glideTo(element) {
  disarmSnap();
  if (lenis) lenis.scrollTo(element, { duration: GLIDE_SECONDS, easing: easeOutQuart });
  else element.scrollIntoView({ block: 'start', behavior: 'instant' });
}
