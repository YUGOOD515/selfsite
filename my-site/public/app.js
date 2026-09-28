document.documentElement.classList.add('js');

const pages = [...document.querySelectorAll('.page')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let current = Math.max(0, pages.findIndex(page => `#${page.id}` === location.hash));
let busy = false;
let wheelTotal = 0;
let lastWheel = 0;
let wheelBlockedUntil = 0;
let wheelGestureLocked = false;
let pendingHashTarget = null;
let touchStart = null;

// All directions describe the CURRENT canvas's movement.
// Forward boundary 1: outgoing (-x,-y), incoming (+x,+y).
// Forward boundary 2: outgoing (+x,-y), incoming (-x,+y).
// Backward movement exactly inverts the same boundary.
function movement(from, to) {
  const forward = to > from;
  const boundary = forward ? from : to;
  const horizontal = boundary % 2 === 0 ? -1 : 1;
  return { x: forward ? horizontal : -horizontal, y: forward ? -1 : 1 };
}

// Arrows point opposite to the outgoing canvas's movement.
function arrowFor({ x, y }) { return y < 0 ? (x < 0 ? '↘' : '↙') : (x < 0 ? '↗' : '↖'); }
function directionName({ x, y }) { return `${x < 0 ? '左' : '右'}${y < 0 ? '上' : '下'}`; }

function updatePageTitle() {
  document.title = `${pages[current].dataset.label.split(' / ')[0]} / folio.`;
}

function addPageControls(page, index) {
  const controls = document.createElement('nav');
  controls.className = 'page-controls';
  controls.setAttribute('aria-label', '画布切换');
  for (const [type, target, label] of [['previous', index - 1, '上一页'], ['next', index + 1, '下一页']]) {
    if (target < 0 || target >= pages.length) continue;
    const direction = movement(index, target);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `page-control ${type}`;
    button.setAttribute('aria-label', `${label}，当前画布向${directionName(direction)}移出`);
    button.innerHTML = `<span class="control-arrow" aria-hidden="true">${arrowFor(direction)}</span><span class="control-label">${label}</span>`;
    button.addEventListener('click', () => goTo(target, { focus: true }));
    controls.append(button);
  }
  page.append(controls);
}

async function goTo(target, { focus = false, history = true } = {}) {
  if (busy || target < 0 || target >= pages.length || target === current) return;
  busy = true;
  const outgoing = pages[current];
  const incoming = pages[target];
  outgoing.querySelector('.project-gallery')?._closePreview?.();
  const { x, y } = movement(current, target);
  const shift = (sign = 1) => `translate3d(${x * sign * 100}%, ${y * sign * 100}%, 0)`;
  incoming.classList.add('active');
  incoming.style.zIndex = '1';
  incoming.scrollTop = 0;
  outgoing.inert = true;
  outgoing.setAttribute('aria-hidden', 'true');
  if (!reducedMotion.matches) {
    const timing = { duration: 800, easing: 'cubic-bezier(.65,0,.2,1)', fill: 'both' };
    const leave = outgoing.animate([{ transform: 'translate3d(0,0,0)', opacity: 1 }, { transform: shift(), opacity: 0.35 }], timing);
    const enter = incoming.animate([{ transform: shift(-1), opacity: 0.35 }, { transform: 'translate3d(0,0,0)', opacity: 1 }], timing);
    await Promise.allSettled([leave.finished, enter.finished]);
    leave.cancel();
    enter.cancel();
  }
  outgoing.classList.remove('active');
  incoming.style.zIndex = '';
  incoming.inert = false;
  incoming.removeAttribute('aria-hidden');
  current = target;
  if (history && pendingHashTarget === null) window.history.pushState({ page: target }, '', `#${incoming.id}`);
  updatePageTitle();
  document.querySelector('#page-status').textContent = `第 ${current + 1} 页，共 ${pages.length} 页。${incoming.dataset.label}`;
  if (focus || outgoing.contains(document.activeElement)) incoming.querySelector('h1,h2').focus({ preventScroll: true });
  wheelTotal = 0;
  wheelBlockedUntil = performance.now() + 250;
  busy = false;
  if (pendingHashTarget !== null) {
    const pending = pendingHashTarget;
    pendingHashTarget = null;
    goTo(pending, { focus: true, history: false });
  }
}

pages.forEach((page, index) => {
  addPageControls(page, index);
  page.classList.toggle('active', index === current);
  page.inert = index !== current;
  if (index !== current) page.setAttribute('aria-hidden', 'true');
  else page.removeAttribute('aria-hidden');
});
updatePageTitle();

document.querySelectorAll('a[href^="#"]:not(.skip-link)').forEach(link => {
  link.addEventListener('click', event => {
    const target = pages.findIndex(page => `#${page.id}` === link.getAttribute('href'));
    if (target < 0) return;
    event.preventDefault();
    goTo(target, { focus: true });
  });
});

function canScrollWithin(delta) {
  const page = pages[current];
  if (page.scrollHeight <= page.clientHeight + 2) return false;
  return delta > 0 ? page.scrollTop + page.clientHeight < page.scrollHeight - 2 : page.scrollTop > 2;
}

window.addEventListener('wheel', event => {
  if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
  if (canScrollWithin(delta) && !busy) return;
  event.preventDefault();
  const now = performance.now();
  const gap = now - lastWheel;
  lastWheel = now;
  if (gap > 180) wheelGestureLocked = false;
  if (busy || now < wheelBlockedUntil || wheelGestureLocked) { wheelTotal = 0; return; }
  if (gap > 180 || Math.sign(delta) !== Math.sign(wheelTotal)) wheelTotal = 0;
  wheelTotal += delta;
  if (Math.abs(wheelTotal) >= 55) {
    wheelGestureLocked = true;
    goTo(current + Math.sign(wheelTotal));
    wheelTotal = 0;
  }
}, { passive: false });

window.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    const gallery = pages[current].querySelector('.project-gallery');
    if (gallery?.classList.contains('is-preview-open')) {
      event.preventDefault();
      gallery._closePreview(true);
      return;
    }
  }
  if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
  if (event.key === ' ' && event.target.closest('button,a')) return;
  const delta = ['ArrowDown', 'PageDown', 'ArrowRight', ' '].includes(event.key) ? (event.shiftKey && event.key === ' ' ? -1 : 1) : ['ArrowUp', 'PageUp', 'ArrowLeft'].includes(event.key) ? -1 : 0;
  if (delta && !canScrollWithin(delta)) { event.preventDefault(); goTo(current + delta, { focus: true }); }
  if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); goTo(event.key === 'Home' ? 0 : pages.length - 1, { focus: true }); }
});

window.addEventListener('touchstart', event => {
  if (event.touches.length !== 1) { touchStart = null; return; }
  touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY, time: performance.now(), scrollTop: pages[current].scrollTop };
}, { passive: true });
window.addEventListener('touchend', event => {
  if (!touchStart) return;
  const delta = touchStart.y - event.changedTouches[0].clientY;
  const horizontal = touchStart.x - event.changedTouches[0].clientX;
  const scrolled = Math.abs(touchStart.scrollTop - pages[current].scrollTop) > 2;
  if (!scrolled && Math.abs(delta) > 55 && Math.abs(delta) > Math.abs(horizontal) * 1.3 && performance.now() - touchStart.time < 700 && !canScrollWithin(delta)) goTo(current + Math.sign(delta));
  touchStart = null;
}, { passive: true });
window.addEventListener('touchcancel', () => { touchStart = null; });
window.addEventListener('hashchange', () => {
  const target = pages.findIndex(page => `#${page.id}` === location.hash);
  if (target < 0) return;
  if (busy) { pendingHashTarget = target; return; }
  goTo(target, { focus: true, history: false });
});

const galleryImages = {
  movieDB: [
    'MovieDB_电影分类_影片浏览.png',
    'MovieDB_影视详情_爱乐之城.png',
    'MovieDB_媒体资源管理_剧集列表.png',
    'MovieDB_最受好评电影_推荐列表.png',
    'MovieDB_影视详情_百年孤独_概览.png',
    'MovieDB_媒体资源管理_剧集文件关联.png',
    'MovieDB_影视详情_Pluribus.png',
    'MovieDB_影视详情_百年孤独_演员与信息.png',
    'MovieDB_首页_最近观看与最近添加.png'
  ],
  cryptoFactor: [
    'CryptoFactor_代币分类_经济功能分析.png',
    'CryptoFactor_方法论_因子构建框架.png',
    'CryptoFactor_数据下载_公共数据文件.png',
    'CryptoFactor_因子详情_关系网络图.png',
    'CryptoFactor_因子详情_活跃地址价值因子.png',
    'CryptoFactor_因子详情_相关性矩阵.png',
    'CryptoFactor_首页_因子数据库概览.png'
  ],
  studyJourney: [
    'StudyJourney_培养计划_课程添加与编辑.png',
    'StudyJourney_学期课表_课程时间轴.png',
    'StudyJourney_学业进度_毕业要求总览.png',
    'StudyJourney_培养计划_课程规划总览.png'
  ]
};

const galleryLayouts = {
  9: [[2, 3, -4], [30, 1, 4], [15, 17, -2], [1, 33, 3], [32, 31, -4], [17, 49, 2], [3, 63, -3], [33, 61, 4], [18, 42, -1]],
  7: [[3, 4, -4], [30, 5, 3], [16, 21, -2], [1, 38, 3], [32, 40, -4], [18, 62, 2], [17, 42, -1]],
  4: [[3, 5, -4], [30, 20, 4], [1, 55, 3], [20, 40, -1]]
};

document.querySelectorAll('.project-gallery').forEach(gallery => {
  const galleryName = gallery.dataset.gallery;
  const files = galleryImages[galleryName];
  const layout = galleryLayouts[files.length];
  const page = gallery.closest('.project-page');
  const preview = document.createElement('figure');
  preview.className = 'project-preview';
  preview.inert = true;
  const frame = document.createElement('div');
  frame.className = 'preview-frame';
  const previewThumb = document.createElement('img');
  previewThumb.className = 'preview-thumb';
  previewThumb.alt = '';
  previewThumb.width = 960;
  previewThumb.height = 600;
  const previewFull = document.createElement('img');
  previewFull.className = 'preview-full';
  previewFull.width = 3072;
  previewFull.height = 1920;
  previewFull.decoding = 'async';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'preview-close';
  closeButton.setAttribute('aria-label', '收起截图');
  closeButton.textContent = '×';
  frame.append(previewThumb, previewFull);
  preview.append(frame, closeButton);
  let requestId = 0;
  let selectedCard = null;
  let flightAnimation = null;
  let flightElement = null;
  let cards;

  function expandedFrameRect() {
    const grid = page.querySelector('.page-grid');
    const copy = page.querySelector('.project-copy');
    const gridTransition = grid.style.transition;
    const copyTransition = copy.style.transition;
    grid.style.transition = 'none';
    copy.style.transition = 'none';
    page.classList.add('is-detail-open');
    const target = frame.getBoundingClientRect();
    page.classList.remove('is-detail-open');
    grid.getBoundingClientRect();
    grid.style.transition = gridTransition;
    copy.style.transition = copyTransition;
    return target;
  }

  function closePreview(restoreFocus = false) {
    if (!gallery.classList.contains('is-preview-open')) return;
    requestId += 1;
    flightAnimation?.cancel();
    flightElement?.remove();
    flightAnimation = null;
    flightElement = null;
    gallery.classList.remove('is-preview-open', 'is-preview-ready', 'is-preview-error', 'is-flight');
    page.classList.remove('is-detail-open');
    preview.inert = true;
    cards.forEach(card => { card.inert = false; });
    if (restoreFocus) selectedCard?.focus({ preventScroll: true });
    selectedCard = null;
  }
  gallery._closePreview = closePreview;
  closeButton.addEventListener('click', () => closePreview(true));

  cards = files.map((file, index) => {
    const [x, y, rotation] = layout[index];
    const label = file.replace(/^[^_]+_/, '').replace(/\.png$/, '').replaceAll('_', ' · ');
    const thumbnailPath = `assets/thumbs/${galleryName}/${file}`;
    const originalPath = `assets/${galleryName}/${file}`;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'shot-card';
    card.setAttribute('aria-label', `放大查看${label}截图`);
    card.style.setProperty('--x', `${x}%`);
    card.style.setProperty('--y', `${y}%`);
    card.style.setProperty('--rotation', `${rotation}deg`);
    card.style.setProperty('--layer', index + 1);
    const image = document.createElement('img');
    image.src = thumbnailPath;
    image.alt = '';
    image.width = 960;
    image.height = 600;
    image.loading = 'lazy';
    image.decoding = 'async';
    card.append(image);
    card.addEventListener('click', () => {
      const activeRequest = ++requestId;
      const source = card.getBoundingClientRect();
      const target = reducedMotion.matches ? null : expandedFrameRect();
      selectedCard = card;
      gallery.classList.remove('is-preview-ready', 'is-preview-error');
      gallery.classList.add('is-preview-open');
      if (target) gallery.classList.add('is-flight');
      page.classList.add('is-detail-open');
      previewThumb.src = thumbnailPath;
      previewFull.alt = `${label}截图`;
      previewFull.src = originalPath;
      preview.inert = false;
      cards.forEach(item => { item.inert = true; });
      closeButton.focus({ preventScroll: true });
      if (target) {
        const flight = document.createElement('div');
        flight.className = 'image-flight';
        flight.style.left = `${source.left}px`;
        flight.style.top = `${source.top}px`;
        flight.style.width = `${source.width}px`;
        flight.style.height = `${source.height}px`;
        const flightImage = document.createElement('img');
        flightImage.src = thumbnailPath;
        flightImage.alt = '';
        flight.append(flightImage);
        document.body.append(flight);
        flightElement = flight;
        flightAnimation = flight.animate([
          { left: `${source.left}px`, top: `${source.top}px`, width: `${source.width}px`, height: `${source.height}px`, filter: 'blur(0)', opacity: 1 },
          { left: `${target.left}px`, top: `${target.top}px`, width: `${target.width}px`, height: `${target.height}px`, filter: 'blur(5px)', opacity: 0.92 }
        ], { duration: 540, easing: 'cubic-bezier(.22,.68,.12,1)', fill: 'forwards' });
        flightAnimation.finished.then(() => {
          if (activeRequest !== requestId) return;
          flight.remove();
          flightElement = null;
          flightAnimation = null;
          gallery.classList.remove('is-flight');
        }).catch(() => {});
      }
      previewFull.decode().then(() => {
        if (activeRequest === requestId) gallery.classList.add('is-preview-ready');
      }).catch(() => {
        if (activeRequest === requestId) gallery.classList.add('is-preview-error');
      });
    });
    return card;
  });
  gallery.replaceChildren(...cards, preview);
});
