// 入口：组装各模块，并负责页面间导航（链接、hash、键盘）与当前页跟踪。
import { icon } from './icons.js';
import { pages, state, pageIndexAt, pageIndexByHash, onLayoutChange, activatePage, lazyActivatePages } from './js/pages.js';
import { initSmoothScroll, glideTo } from './js/scroll.js';
import { initGalleries, closeGalleriesIn, closeOpenGallery, hasOpenGallery } from './js/gallery.js';
import { initDirectory, isDirectoryOpen, directoryClosing, closeDirectory, updatePageStatus } from './js/directory.js';
import { initStoryTabs } from './js/story-tabs.js';
import { initReveal } from './js/reveal.js';

const focusHeading = page => page.querySelector('h1,h2').focus({ preventScroll: true });

/** 以视口中线所在的页面为当前页；离开某页时收起该页打开的预览。 */
function syncCurrentPage() {
  const visible = pageIndexAt(window.scrollY + window.innerHeight / 2);
  if (visible === state.current) return;
  const previewHadFocus = closeGalleriesIn(pages[state.current]);
  state.current = visible;
  updatePageStatus();
  if (previewHadFocus) focusHeading(pages[state.current]);
}

let syncFrame = 0;
function scheduleSync() {
  if (syncFrame) return;
  syncFrame = requestAnimationFrame(() => {
    syncFrame = 0;
    syncCurrentPage();
  });
}

function goTo(target, { focus = false } = {}) {
  if (target < 0 || target >= pages.length) return;
  const closing = directoryClosing();
  if (closing) {
    closing.then(() => goTo(target, { focus }));
    return;
  }
  const incoming = pages[target];
  if (location.hash !== `#${incoming.id}`) window.history.pushState(null, '', `#${incoming.id}`);
  if (isDirectoryOpen()) {
    closeDirectory({ target, focusPage: true });
    return;
  }
  activatePage(incoming);
  const previewHadFocus = closeGalleriesIn(pages[state.current]);
  glideTo(incoming);
  if (focus || previewHadFocus) focusHeading(incoming);
}

initGalleries();
initSmoothScroll({ canSnap: () => !isDirectoryOpen() && !hasOpenGallery() });
initDirectory({ syncCurrentPage });
document.querySelectorAll('[data-icon]').forEach(element => element.replaceChildren(icon(element.dataset.icon)));
initStoryTabs();
lazyActivatePages();
initReveal();
updatePageStatus();

window.addEventListener('scroll', scheduleSync, { passive: true });
window.addEventListener('popstate', scheduleSync);
window.addEventListener('resize', scheduleSync);
onLayoutChange(scheduleSync);
scheduleSync();

window.addEventListener('hashchange', () => {
  const target = location.hash ? pageIndexByHash(location.hash) : 0;
  if (target >= 0) goTo(target, { focus: true });
});

document.querySelectorAll('a[href^="#"]:not(.skip-link)').forEach(link => {
  link.addEventListener('click', event => {
    const target = pageIndexByHash(link.getAttribute('href'));
    if (target < 0) return;
    event.preventDefault();
    goTo(target, { focus: true });
  });
});

// Esc 统一在这里处理：先关最上层（目录），再关作品集预览。
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  if (isDirectoryOpen()) {
    event.preventDefault();
    closeDirectory();
    return;
  }
  if (closeOpenGallery()) event.preventDefault();
});

