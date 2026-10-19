// 目录：<dialog> 从侧边滑入，左侧截图预览随悬停/聚焦的项目交叉淡入切换。
import { icon } from '../icons.js';
import { motion, reducedMotion, settled } from './motion.js';
import { pages, projectPages, state, activatePage, pageTop } from './pages.js';
import { stopScroll, startScroll, jumpTo } from './scroll.js';
import { closeGalleriesIn } from './gallery.js';

const panel = document.querySelector('.directory-page');
const toggle = document.querySelector('.directory-trigger');
const content = panel.querySelector('.page-grid');
const preview = panel.querySelector('.directory-preview');
const previewCard = preview.querySelector('.directory-preview-card');
const previewCaption = preview.querySelector('figcaption');
const HOVER_DELAY_MS = 60;
const ROW_STAGGER_MS = 35;

let panelAnimation = null;
let closePromise = null;
let origin = state.current;
let returnFocus = null;
let syncCurrentPage = () => {};
let rows = [];

export const isDirectoryOpen = () => panel.open;
export const directoryClosing = () => closePromise;

const pad = number => String(number).padStart(2, '0');

export function updatePageStatus() {
  const page = pages[state.current];
  document.title = panel.open ? '目录 / folio.' : `${page.dataset.label.split(' / ')[0]} / folio.`;
  document.querySelector('#page-status').textContent = `第 ${state.current + 1} 页，共 ${pages.length} 页。${page.dataset.label}`;
  panel.querySelectorAll('a').forEach(link => {
    const isCurrent = link.hash === `#${page.id}`;
    if (isCurrent) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
    const indicator = link.querySelector('.link-arrow');
    const indicatorIcon = isCurrent ? 'circle-dot' : 'arrow-right';
    if (indicator && indicator.dataset.icon !== indicatorIcon) {
      indicator.replaceChildren(icon(indicatorIcon));
      indicator.dataset.icon = indicatorIcon;
    }
  });
}

const notifyDirectoryChange = () => window.dispatchEvent(new Event('directorychange'));
const hiddenTransform = () => getComputedStyle(panel).getPropertyValue('--directory-hidden-transform').trim();

/* ---------- 截图预览 ---------- */

let previewIndex = -1;
let previewToken = 0;
let hoverTimer = 0;

function previewSource(page) {
  const image = page.querySelector('.project-gallery:not([hidden]) .shot-card img');
  return image ? image.dataset.src || image.getAttribute('src') : '';
}

function previewLayers() {
  return [...previewCard.querySelectorAll('img')];
}

/** 新图解码完成后叠在旧图上淡入，淡入结束再移除旧图，扫过多行时不会闪白。 */
function crossfadeTo(source, token) {
  const image = new Image();
  image.alt = '';
  image.decoding = 'async';
  image.src = source;
  image.decode().catch(() => {}).then(() => {
    if (token !== previewToken) return;
    const previous = previewLayers();
    previewCard.append(image);
    if (reducedMotion.matches) {
      previous.forEach(layer => layer.remove());
      return;
    }
    settled(image.animate([{ opacity: 0 }, { opacity: 1 }], { duration: motion.base, easing: motion.easeOut }))
      .then(() => previous.forEach(layer => layer.remove()));
  });
}

function showPreview(index, { delay = 0, instant = false } = {}) {
  if (index === previewIndex) return;
  const page = projectPages[index];
  const source = previewSource(page);
  if (!source) return;
  previewIndex = index;
  const token = ++previewToken;
  clearTimeout(hoverTimer);
  rows.forEach((row, rowIndex) => row.classList.toggle('is-previewed', rowIndex === index));
  preview.style.setProperty('--preview-rotation', `${index % 2 ? 1.6 : -2}deg`);
  previewCaption.textContent = [page.querySelector('.project-subtitle').textContent.trim(), page.dataset.category]
    .filter(Boolean).join(' · ');
  if (instant) {
    const [first, ...rest] = previewLayers();
    rest.forEach(layer => layer.remove());
    first.getAnimations().forEach(animation => animation.cancel());
    first.src = source;
    return;
  }
  // 鼠标快速扫过时稍等一下，只加载最终停住的那一行。
  if (delay) hoverTimer = setTimeout(() => crossfadeTo(source, token), delay);
  else crossfadeTo(source, token);
}

function buildRows() {
  const list = panel.querySelector('.directory-projects');
  rows = projectPages.map((page, index) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.className = 'directory-row';
    link.href = `#${page.id}`;
    const heading = page.querySelector('.project-copy h2').cloneNode(true);
    heading.querySelectorAll('.link-arrow').forEach(arrow => arrow.remove());
    heading.querySelectorAll('br').forEach(lineBreak => lineBreak.replaceWith(' '));
    const subtitle = page.querySelector('.project-subtitle');

    const number = document.createElement('span');
    number.className = 'directory-no';
    number.textContent = pad(index + 1);
    const name = document.createElement('span');
    name.className = 'directory-name';
    if (subtitle.lang) name.lang = subtitle.lang;
    const arrow = document.createElement('span');
    arrow.className = 'link-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.append(icon('arrow-right'));
    name.append(subtitle.textContent.trim(), '\u00a0', arrow);
    const note = document.createElement('span');
    note.className = 'directory-note';
    note.textContent = heading.textContent.replace(/\s+/gu, ' ').trim();
    if (heading.lang) note.lang = heading.lang;
    link.append(number, name, note);
    item.append(link);
    list.append(item);
    link.addEventListener('pointerenter', () => showPreview(index, { delay: HOVER_DELAY_MS }));
    link.addEventListener('focus', () => showPreview(index));
    return link;
  });
  panel.querySelector('.directory-count').textContent = pad(projectPages.length);
}

function prepareDirectory() {
  projectPages.forEach(page => {
    const source = previewSource(page);
    if (source) new Image().src = source;
  });
  previewIndex = -1;
  showPreview(Math.max(0, projectPages.indexOf(pages[state.current])), { instant: true });
  if (reducedMotion.matches) return;
  const items = [
    ...panel.querySelectorAll('.directory-index-label, .directory-intro, .directory-head'),
    ...rows,
    preview,
    panel.querySelector('.directory-contact'),
  ];
  items.forEach((item, index) => item.animate(
    [{ opacity: 0, translate: '0 18px', offset: 0 }],
    { duration: motion.slow, delay: motion.fast + index * ROW_STAGGER_MS, easing: motion.easeOut, fill: 'backwards' }
  ));
}

/* ---------- 打开 / 关闭 ---------- */

export function openDirectory() {
  if (panel.open || closePromise) return;
  stopScroll();
  syncCurrentPage();
  origin = state.current;
  returnFocus = document.activeElement;
  closeGalleriesIn(pages[state.current]);
  prepareDirectory();
  panel.showModal();
  panel.scrollTop = 0;
  document.documentElement.classList.add('directory-open');
  toggle.setAttribute('aria-expanded', 'true');
  panel.querySelector('#directory-title').focus({ preventScroll: true });
  updatePageStatus();
  notifyDirectoryChange();
  if (reducedMotion.matches) return;
  const opening = panel.animate([
    { transform: hiddenTransform() },
    { transform: 'translate(0, 0)' },
  ], { duration: motion.slow, easing: motion.ease, fill: 'both' });
  panelAnimation = opening;
  settled(opening).then(() => {
    if (panelAnimation !== opening || closePromise) return;
    opening.cancel();
    panelAnimation = null;
  });
}

export function closeDirectory({ target = origin, focusPage = false } = {}) {
  if (closePromise) return closePromise;
  if (!panel.open) return Promise.resolve();
  const transform = getComputedStyle(panel).transform;
  panelAnimation?.cancel();
  content.inert = true;
  const incoming = pages[target];
  activatePage(incoming);
  startScroll();
  jumpTo(pageTop(target));
  state.current = target;
  updatePageStatus();

  closePromise = (async () => {
    if (!reducedMotion.matches) {
      panelAnimation = panel.animate([
        { transform },
        { transform: hiddenTransform() },
      ], { duration: motion.base, easing: motion.ease, fill: 'both' });
      await settled(panelAnimation);
    }
    panel.close();
    panelAnimation?.cancel();
    panelAnimation = null;
    content.inert = false;
    document.documentElement.classList.remove('directory-open');
    toggle.setAttribute('aria-expanded', 'false');
    updatePageStatus();
    notifyDirectoryChange();
    if (focusPage) incoming.querySelector('h1,h2').focus({ preventScroll: true });
    else (returnFocus?.isConnected ? returnFocus : toggle).focus({ preventScroll: true });
  })().finally(() => { closePromise = null; });
  return closePromise;
}

export function initDirectory(options = {}) {
  if (options.syncCurrentPage) syncCurrentPage = options.syncCurrentPage;
  buildRows();
  toggle.addEventListener('click', openDirectory);
  panel.querySelector('.directory-close').addEventListener('click', () => closeDirectory());
  // Esc 与安卓返回键都会触发 dialog 的 cancel，由这里统一走带动画的关闭。
  panel.addEventListener('cancel', event => {
    event.preventDefault();
    closeDirectory();
  });
  reducedMotion.addEventListener('change', () => {
    if (!reducedMotion.matches) return;
    panelAnimation?.cancel();
    panelAnimation = null;
  });
}
