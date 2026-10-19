// 项目内的标签切换：位移 + 透明度交叉淡入（不用 blur，避免每帧重绘）。
import { motion, reducedMotion, settled } from './motion.js';
import { closeGalleriesIn } from './gallery.js';

const SHIFT_PX = 18;

export function initStoryTabs() {
  const tabs = [...document.querySelectorAll('[data-story-tab]')];
  const panels = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));
  let animations = [];
  let transitionId = 0;

  function select(tab, directionHint = 0) {
    const nextIndex = tabs.indexOf(tab);
    const previousIndex = tabs.findIndex(item => item.getAttribute('aria-selected') === 'true');
    if (nextIndex === previousIndex) return;

    const id = ++transitionId;
    animations.forEach(animation => animation.cancel());
    animations = [];
    panels.forEach((panel, index) => {
      panel.classList.remove('is-entering', 'is-exiting');
      panel.hidden = index !== previousIndex;
      panel.inert = index !== previousIndex;
      panel.removeAttribute('aria-hidden');
    });

    const outgoing = panels[previousIndex];
    const incoming = panels[nextIndex];
    closeGalleriesIn(outgoing);
    outgoing.inert = true;
    outgoing.setAttribute('aria-hidden', 'true');
    incoming.hidden = false;
    incoming.inert = !reducedMotion.matches;
    tabs.forEach((item, index) => {
      const selected = index === nextIndex;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
    });

    if (reducedMotion.matches) {
      outgoing.hidden = true;
      outgoing.removeAttribute('aria-hidden');
      return;
    }

    const direction = directionHint || Math.sign(nextIndex - previousIndex);
    const timing = { duration: motion.base, easing: motion.ease, fill: 'forwards' };
    outgoing.classList.add('is-exiting');
    incoming.classList.add('is-entering');
    animations = [
      outgoing.animate([
        { transform: 'translateX(0)', opacity: 1 },
        { transform: `translateX(${-SHIFT_PX * direction}px)`, opacity: 0 },
      ], timing),
      incoming.animate([
        { transform: `translateX(${SHIFT_PX * direction}px)`, opacity: 0 },
        { transform: 'translateX(0)', opacity: 1 },
      ], timing),
    ];
    Promise.all(animations.map(settled)).then(() => {
      if (id !== transitionId) return;
      outgoing.hidden = true;
      outgoing.removeAttribute('aria-hidden');
      outgoing.classList.remove('is-exiting');
      incoming.classList.remove('is-entering');
      incoming.inert = false;
      animations.forEach(animation => animation.cancel());
      animations = [];
    });
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : step ? (index + step + tabs.length) % tabs.length : -1;
      if (target < 0) return;
      event.preventDefault();
      event.stopPropagation();
      select(tabs[target], step);
      tabs[target].focus();
    });
  });
}
