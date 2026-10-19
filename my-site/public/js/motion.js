// 动效参数统一来自 style.css 的 :root（--dur-* / --ease*），JS 与 CSS 共用一套节奏。
const root = getComputedStyle(document.documentElement);
const token = name => root.getPropertyValue(name).trim();
const ms = (name, fallback) => parseFloat(token(name)) || fallback;

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

export const motion = {
  fast: ms('--dur-fast', 200),
  base: ms('--dur-base', 440),
  slow: ms('--dur-slow', 680),
  ease: token('--ease') || 'cubic-bezier(.22,.68,.12,1)',
  easeOut: token('--ease-out') || 'cubic-bezier(.22,1,.36,1)',
};

/** 动效被打断（cancel）时 finished 会 reject，统一吞掉 AbortError。 */
export function settled(animation) {
  return animation.finished.catch(error => {
    if (error?.name !== 'AbortError') console.error(error);
  });
}
