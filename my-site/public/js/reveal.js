// 滚动浮现：每组内容进入视口时上浮淡入，只播放一次；首屏已可见的内容不再重复动画。
import { motion, reducedMotion } from './motion.js';
import { pages } from './pages.js';

const RISE_PX = 28;
const STAGGER_MS = 70;
const VISUAL_OFFSET_MS = 120;

function revealGroups(page) {
  const copy = [...page.querySelectorAll('.copy > *')];
  const visual = [...page.querySelectorAll(
    '.visual .contact-methods > *, .visual .site-credits, .story-tabs, .project-gallery:not([hidden]) > .shot-card'
  )];
  return [
    { container: page.querySelector('.copy'), items: copy, offset: 0 },
    { container: page.querySelector('.visual'), items: visual, offset: VISUAL_OFFSET_MS },
  ].filter(group => group.container && group.items.length);
}

export function initReveal() {
  if (reducedMotion.matches || !('IntersectionObserver' in window)) return;
  const pending = new Map();
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const group = pending.get(entry.target);
      if (!group) return;
      pending.delete(entry.target);
      observer.unobserve(entry.target);
      group.items.forEach((item, index) => {
        item.classList.remove('reveal-pending');
        if (reducedMotion.matches) return;
        item.animate(
          [{ opacity: 0, translate: `0 ${RISE_PX}px`, offset: 0 }],
          { duration: motion.slow, delay: group.offset + index * STAGGER_MS, easing: motion.easeOut, fill: 'backwards' }
        );
      });
    });
  }, { threshold: 0.12 });

  const foldLine = window.innerHeight * 0.92;
  pages.filter(page => page.id !== 'intro').forEach(page => {
    revealGroups(page).forEach(group => {
      if (group.container.getBoundingClientRect().top < foldLine) return;
      group.items.forEach(item => item.classList.add('reveal-pending'));
      pending.set(group.container, group);
      observer.observe(group.container);
    });
  });
}
