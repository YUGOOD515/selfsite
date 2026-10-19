// 作品集：卡片点击后以 FLIP 方式放大成预览，关闭时缩回原卡片位置。
import { icon } from '../icons.js';
import { galleries } from './galleries-data.js';
import { motion, reducedMotion, settled } from './motion.js';

const controllers = new Map();

/** 关闭某页（或某个标签面板）内所有已打开的预览；返回焦点是否原本在预览内。 */
export function closeGalleriesIn(root) {
  let hadFocus = false;
  root.querySelectorAll('.project-gallery.is-preview-open').forEach(gallery => {
    const controller = controllers.get(gallery);
    hadFocus ||= controller.preview.contains(document.activeElement);
    controller.close();
  });
  return hadFocus;
}

export const hasOpenGallery = () => document.querySelector('.project-gallery.is-preview-open') !== null;

/** 带动画关闭当前打开的预览并把焦点还给卡片（Esc 用）；没有打开的预览时返回 false。 */
export function closeOpenGallery() {
  const gallery = document.querySelector('.project-gallery.is-preview-open');
  if (!gallery) return false;
  controllers.get(gallery).close(true);
  return true;
}

/** 卡片当前的视觉尺寸与旋转（去掉 transform 的缩放影响）。 */
function cardGeometry(card) {
  const matrix = new DOMMatrixReadOnly(getComputedStyle(card).transform);
  return {
    rect: card.getBoundingClientRect(),
    rotation: Math.atan2(matrix.b, matrix.a),
    width: card.offsetWidth * Math.hypot(matrix.a, matrix.b),
    height: card.offsetHeight * Math.hypot(matrix.c, matrix.d),
  };
}

function sourceLink({ label, href }) {
  const link = document.createElement('a');
  link.href = href;
  link.textContent = label;
  const arrow = document.createElement('span');
  arrow.className = 'link-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.append(icon('arrow-right'));
  link.append('\u00a0', arrow);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function setupGallery(gallery) {
  const config = galleries[gallery.dataset.gallery];
  const page = gallery.closest('.project-page');
  const portrait = config.kind === '立绘';
  const research = config.kind === '图表';

  const preview = document.createElement('figure');
  preview.className = 'project-preview';
  preview.inert = true;
  const frame = document.createElement('div');
  frame.className = 'preview-frame';
  let previewThumb = document.createElement('img');
  previewThumb.className = 'preview-thumb';
  previewThumb.alt = '';
  let previewFull = document.createElement('img');
  previewFull.className = 'preview-full';
  previewFull.decoding = 'async';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'preview-close';
  closeButton.setAttribute('aria-label', `收起${config.kind}`);
  closeButton.append(icon('x'));
  const sources = document.createElement('div');
  sources.className = 'preview-sources';
  sources.hidden = true;
  const errorMessage = document.createElement('p');
  errorMessage.className = 'preview-error';
  errorMessage.setAttribute('role', 'status');
  errorMessage.textContent = '原图加载失败，当前显示预览图。';
  errorMessage.hidden = true;
  const loadingStatus = document.createElement('div');
  loadingStatus.className = 'preview-loading';
  loadingStatus.setAttribute('role', 'status');
  loadingStatus.append(icon('loader-circle'), '原图加载中');
  loadingStatus.hidden = true;
  frame.append(previewThumb, previewFull, closeButton, sources, errorMessage, loadingStatus);
  preview.append(frame);

  let requestId = 0;
  let selectedCard = null;
  let previewAnimation = null;
  let previewDimensions = null;
  let loadingTimer = 0;
  let cards = [];
  const exitingElements = [...page.querySelectorAll('.project-copy, .story-tabs')];

  function clearPreviewLoading() {
    clearTimeout(loadingTimer);
    loadingTimer = 0;
    loadingStatus.hidden = true;
    preview.setAttribute('aria-busy', 'false');
  }

  function fitPreviewFrame() {
    if (!previewDimensions) return;
    const styles = getComputedStyle(frame);
    const horizontalInset = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight)
      + parseFloat(styles.borderLeftWidth) + parseFloat(styles.borderRightWidth);
    const verticalInset = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom)
      + parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth);
    const width = Math.max(1, preview.clientWidth - horizontalInset);
    const height = Math.max(1, preview.clientHeight - verticalInset);
    const scale = Math.min(width / previewDimensions.width, height / previewDimensions.height);
    frame.style.width = `${previewDimensions.width * scale + horizontalInset}px`;
    frame.style.height = `${previewDimensions.height * scale + verticalInset}px`;
  }

  // 窗口缩放也会改变 preview 尺寸，一个 ResizeObserver 即可覆盖。
  new ResizeObserver(() => {
    if (gallery.classList.contains('is-preview-open')) fitPreviewFrame();
  }).observe(preview);

  function stopPreviewAnimation() {
    previewAnimation?.cancel();
    previewAnimation = null;
    gallery.classList.remove('is-preview-opening');
  }

  function finishClose(restoreFocus) {
    stopPreviewAnimation();
    gallery.classList.remove('is-preview-open', 'is-preview-ready', 'is-preview-closing');
    page.classList.remove('is-detail-open');
    preview.inert = true;
    errorMessage.hidden = true;
    sources.hidden = true;
    cards.forEach(card => { card.inert = false; });
    exitingElements.forEach(element => { element.inert = false; });
    selectedCard?.classList.remove('is-selected');
    if (restoreFocus) selectedCard?.focus({ preventScroll: true });
    selectedCard = null;
    previewDimensions = null;
  }

  function closePreview(restoreFocus = false) {
    if (!gallery.classList.contains('is-preview-open')) return;
    if (restoreFocus && gallery.classList.contains('is-preview-closing')) return;
    const activeRequest = ++requestId;
    const fromTransform = getComputedStyle(frame).transform;
    stopPreviewAnimation();
    clearPreviewLoading();
    if (!restoreFocus || reducedMotion.matches || !selectedCard) {
      finishClose(restoreFocus);
      return;
    }
    gallery.classList.add('is-preview-closing');
    page.classList.remove('is-detail-open');
    // 读取卡片的静止位置：临时关掉 hover 过渡，避免量到动画中途的值。
    const previousTransition = selectedCard.style.transition;
    selectedCard.style.transition = 'none';
    const target = cardGeometry(selectedCard);
    selectedCard.style.transition = previousTransition;
    const source = frame.getBoundingClientRect();
    const dx = target.rect.left + target.rect.width / 2 - source.left - source.width / 2;
    const dy = target.rect.top + target.rect.height / 2 - source.top - source.height / 2;
    const animation = frame.animate([
      { transform: fromTransform },
      { transform: `translate(${dx}px, ${dy}px) rotate(${target.rotation}rad) scale(${target.width / source.width}, ${target.height / source.height})` },
    ], { duration: motion.base, easing: motion.ease, fill: 'both' });
    previewAnimation = animation;
    animation.finished.then(() => {
      if (activeRequest === requestId) finishClose(true);
    }, error => {
      if (error.name === 'AbortError') return;
      console.error(error);
      if (activeRequest === requestId) finishClose(true);
    });
  }

  function expandPreview(origin, activeRequest) {
    const target = frame.getBoundingClientRect();
    const dx = origin.rect.left + origin.rect.width / 2 - target.left - target.width / 2;
    const dy = origin.rect.top + origin.rect.height / 2 - target.top - target.height / 2;
    gallery.classList.add('is-preview-opening');
    const animation = frame.animate([
      { transform: `translate(${dx}px, ${dy}px) rotate(${origin.rotation}rad) scale(${origin.width / target.width}, ${origin.height / target.height})` },
      { transform: 'translate(0, 0) rotate(0) scale(1)' },
    ], { duration: motion.base, easing: motion.ease, fill: 'both' });
    previewAnimation = animation;
    settled(animation).then(() => {
      if (activeRequest === requestId && previewAnimation === animation) stopPreviewAnimation();
    });
  }

  function openPreview(item, card, original, thumbnail) {
    const activeRequest = ++requestId;
    stopPreviewAnimation();
    clearPreviewLoading();
    const origin = cardGeometry(card);
    const cardImage = card.querySelector('img');
    // 先按缩略图比例定好预览框尺寸，原图加载后只换内容。
    previewDimensions = {
      width: cardImage.naturalWidth || cardImage.width,
      height: cardImage.naturalHeight || cardImage.height,
    };
    selectedCard = card;
    card.classList.add('is-selected');
    errorMessage.hidden = true;
    gallery.classList.remove('is-preview-ready');
    gallery.classList.add('is-preview-open');
    page.classList.add('is-detail-open');
    fitPreviewFrame();
    // Fresh layers discard the previous bitmap and opacity transition immediately.
    const thumbnailImage = cardImage.cloneNode();
    thumbnailImage.className = 'preview-thumb';
    thumbnailImage.alt = '';
    thumbnailImage.decoding = 'sync';
    thumbnailImage.removeAttribute('data-src');
    thumbnailImage.src = cardImage.currentSrc || thumbnail;
    previewThumb.replaceWith(thumbnailImage);
    previewThumb = thumbnailImage;
    const fullImage = document.createElement('img');
    fullImage.className = 'preview-full';
    fullImage.decoding = 'async';
    fullImage.alt = `${item.label}${config.kind}`;
    previewFull.replaceWith(fullImage);
    previewFull = fullImage;
    fullImage.src = original;
    preview.setAttribute('aria-busy', 'true');
    loadingTimer = setTimeout(() => {
      if (activeRequest === requestId) loadingStatus.hidden = false;
    }, 300);
    sources.replaceChildren(...(item.sources || []).map(sourceLink));
    sources.hidden = !item.sources?.length;
    preview.inert = false;
    cards.forEach(other => { other.inert = true; });
    exitingElements.forEach(element => { element.inert = true; });
    closeButton.focus({ preventScroll: true });
    if (!reducedMotion.matches) expandPreview(origin, activeRequest);

    fullImage.decode().then(() => {
      if (activeRequest !== requestId) return;
      clearPreviewLoading();
      const next = { width: fullImage.naturalWidth, height: fullImage.naturalHeight };
      const aspectChanged = Math.abs(next.width / next.height - previewDimensions.width / previewDimensions.height) > 0.01;
      previewDimensions = next;
      const reveal = () => {
        if (activeRequest !== requestId) return;
        if (aspectChanged) fitPreviewFrame();
        gallery.classList.add('is-preview-ready');
      };
      // 比例不同才需要改框尺寸；放大动画还在进行时，等它结束再改，避免中途跳动。
      if (aspectChanged && previewAnimation) settled(previewAnimation).then(reveal);
      else reveal();
    }, () => {
      if (activeRequest !== requestId) return;
      clearPreviewLoading();
      errorMessage.hidden = false;
    });
  }

  cards = config.images.map((item, index) => {
    const original = `assets/${config.directory}/${encodeURIComponent(item.file)}`;
    const thumbnail = research ? original : `assets/thumbs/${config.directory}/${encodeURIComponent(item.file.replace(/\.[^.]+$/, '.webp'))}`;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'shot-card';
    card.setAttribute('aria-label', `放大查看${item.label}${config.kind}`);
    if (!portrait) {
      const [x, y, rotation] = item.position || [2 + index % 3 * 14, 3 + index % 4 * 17, index % 2 ? 3 : -3];
      card.style.setProperty('--x', `${x}%`);
      card.style.setProperty('--y', `${y}%`);
      card.style.setProperty('--rotation', `${rotation}deg`);
    }
    card.style.setProperty('--layer', item.layer ?? index + 1);
    const image = document.createElement('img');
    image.dataset.src = thumbnail;
    image.alt = '';
    image.width = portrait ? 480 : research ? 920 : 960;
    image.height = portrait ? 720 : research ? 590 : 600;
    image.decoding = 'async';
    card.append(image);
    if (portrait) {
      const name = document.createElement('span');
      name.className = 'portrait-name';
      name.textContent = item.label;
      card.append(name);
    }
    card.addEventListener('click', () => openPreview(item, card, original, thumbnail));
    return card;
  });
  closeButton.addEventListener('click', () => closePreview(true));
  gallery.replaceChildren(...cards, preview);
  controllers.set(gallery, { preview, close: closePreview });
}

export function initGalleries() {
  document.querySelectorAll('.project-gallery').forEach(setupGallery);
}
