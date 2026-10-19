// 页面列表、当前页状态与页面位置缓存（只在尺寸变化时测量，滚动时不再读布局）。
export const pages = [...document.querySelectorAll('.page')];
export const projectPages = pages.filter(page => page.classList.contains('project-page'));
export const pageIndexByHash = hash => pages.findIndex(page => `#${page.id}` === hash);
export const state = { current: Math.max(0, pageIndexByHash(location.hash)) };

let tops = [];
const layoutListeners = new Set();
function measure() {
  tops = pages.map(page => page.offsetTop);
  layoutListeners.forEach(listener => listener());
}
measure();
const resizeObserver = new ResizeObserver(measure);
pages.forEach(page => resizeObserver.observe(page));

export const pageTop = index => tops[index];
export const onLayoutChange = listener => layoutListeners.add(listener);

/** 页面顶部越过 y 的最后一页。 */
export function pageIndexAt(y) {
  let index = 0;
  for (let next = 1; next < tops.length && tops[next] <= y; next += 1) index = next;
  return index;
}

/** 距离 y 最近、且在阈值内的页面顶部偏移；没有则返回 null。 */
export function nearestPageOffset(y, threshold) {
  let nearest = null;
  for (const top of tops) {
    const distance = top - y;
    if (Math.abs(distance) < threshold && (nearest === null || Math.abs(distance) < Math.abs(nearest))) nearest = distance;
  }
  return nearest;
}

/** 首次进入（或即将进入）某页时，才把作品集缩略图换成真实地址。 */
export function activatePage(page) {
  page.querySelectorAll('.shot-card img[data-src]').forEach(image => {
    image.loading = 'eager';
    image.src = image.dataset.src;
    delete image.dataset.src;
  });
}

export function lazyActivatePages() {
  activatePage(pages[state.current]);
  if (!('IntersectionObserver' in window)) {
    pages.forEach(activatePage);
    return;
  }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      activatePage(entry.target);
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '75% 0px' });
  pages.filter(page => page.querySelector('.project-gallery')).forEach(page => observer.observe(page));
}
