import { icon } from './icons.js';
import Lenis from './vendor/lenis.mjs';

const pages = [...document.querySelectorAll('.page')];
const projectPages = pages.filter(page => page.classList.contains('project-page'));
const contents = document.querySelector('.directory-page');
const contentsToggle = document.querySelector('.directory-trigger');
const contentsPanel = contents;
const directoryContent = contents.querySelector('.page-grid');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let current = Math.max(0, pages.findIndex(page => `#${page.id}` === location.hash));
let scrollFrame = 0;
let lenis = null;
let contentsAnimation = null;
let directoryClosePromise = null;
let directoryOrigin = current;
let directoryReturnFocus = null;

// 与 CryptoFactor 一致的阻尼滚动：滚轮由 Lenis 平滑，触屏保持原生惯性。
const scrollEase = t => 1 - (1 - t) ** 4;
function syncSmoothScroll() {
  if (reducedMotion.matches) {
    lenis?.destroy();
    lenis = null;
    return;
  }
  if (lenis) return;
  lenis = new Lenis({ lerp: 0.12, smoothWheel: true, anchors: false, autoRaf: true });
  lenis.on('scroll', scheduleSoftSnap);
}

// 轻吸附：停下时若离某页顶部足够近，就缓慢吸过去；离得远则停在原处。
let snapTimer = 0;
let touching = false;
window.addEventListener('touchstart', () => { touching = true; clearTimeout(snapTimer); }, { passive: true });
window.addEventListener('touchend', () => { touching = false; scheduleSoftSnap(); }, { passive: true });
window.addEventListener('touchcancel', () => { touching = false; }, { passive: true });
function scheduleSoftSnap() {
  clearTimeout(snapTimer);
  snapTimer = setTimeout(softSnap, 160);
}
function softSnap() {
  if (!lenis || lenis.isStopped || touching || contentsPanel.open) return;
  if (document.querySelector('.project-gallery.is-preview-open')) return;
  const y = window.scrollY;
  const threshold = Math.min(window.innerHeight * 0.18, 180);
  let nearest = null;
  for (const page of pages) {
    const distance = page.offsetTop - y;
    if (Math.abs(distance) < threshold && (nearest === null || Math.abs(distance) < Math.abs(nearest))) nearest = distance;
  }
  if (nearest === null || Math.abs(nearest) < 2) return;
  lenis.scrollTo(y + nearest, { duration: 0.7, easing: scrollEase });
}
syncSmoothScroll();

function scrollToInstant(top) {
  if (lenis) lenis.scrollTo(top, { immediate: true, force: true });
  else window.scrollTo({ top, behavior: 'instant' });
}

function updatePageStatus() {
  document.title = contentsPanel.open ? '目录 / folio.' : `${pages[current].dataset.label.split(' / ')[0]} / folio.`;
  document.querySelector('#page-status').textContent = `第 ${current + 1} 页，共 ${pages.length} 页。${pages[current].dataset.label}`;
  contentsPanel.querySelectorAll('a').forEach(link => {
    const isCurrent = link.hash === `#${pages[current].id}`;
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

function notifyDirectoryChange() {
  window.dispatchEvent(new Event('directorychange'));
}

function directoryHiddenTransform() {
  return getComputedStyle(contentsPanel).getPropertyValue('--directory-hidden-transform').trim();
}

function openContents() {
  if (contentsPanel.open || directoryClosePromise) return;
  if (lenis) lenis.stop();
  else window.scrollTo({ top: window.scrollY, behavior: 'instant' });
  updateCurrentPage();
  directoryOrigin = current;
  directoryReturnFocus = document.activeElement;
  closePagePreviews(pages[current]);
  prepareDirectory();
  contentsPanel.showModal();
  contentsPanel.scrollTop = 0;
  document.documentElement.classList.add('directory-open');
  contentsToggle.setAttribute('aria-expanded', 'true');
  contents.querySelector('#directory-title').focus({ preventScroll: true });
  updatePageStatus();
  notifyDirectoryChange();
  if (reducedMotion.matches) return;
  const timing = { duration: 620, easing: 'cubic-bezier(.22,.68,.12,1)', fill: 'both' };
  contentsAnimation = contentsPanel.animate([
    { transform: directoryHiddenTransform() },
    { transform: 'translate(0, 0)' },
  ], timing);
  const opening = contentsAnimation;
  opening.finished.then(() => {
    if (contentsAnimation !== opening || directoryClosePromise) return;
    opening.cancel();
    contentsAnimation = null;
  }).catch(() => {
    // A return action may interrupt the opening motion.
  });
}

function closeContents({ target = directoryOrigin, focusPage = false } = {}) {
  if (directoryClosePromise) return directoryClosePromise;
  if (!contentsPanel.open) return Promise.resolve();
  const transform = getComputedStyle(contentsPanel).transform;
  contentsAnimation?.cancel();
  directoryContent.inert = true;
  const incoming = pages[target];
  activatePage(incoming);
  lenis?.start();
  scrollToInstant(incoming.offsetTop);
  current = target;
  updatePageStatus();

  directoryClosePromise = (async () => {
    if (!reducedMotion.matches) {
      const timing = { duration: 460, easing: 'cubic-bezier(.22,.68,.12,1)', fill: 'both' };
      contentsAnimation = contentsPanel.animate([
        { transform },
        { transform: directoryHiddenTransform() },
      ], timing);
      await contentsAnimation.finished.catch(() => {});
    }
    contentsPanel.close();
    contentsAnimation?.cancel();
    contentsAnimation = null;
    directoryContent.inert = false;
    document.documentElement.classList.remove('directory-open');
    contentsToggle.setAttribute('aria-expanded', 'false');
    updatePageStatus();
    notifyDirectoryChange();
    if (focusPage) incoming.querySelector('h1,h2').focus({ preventScroll: true });
    else (directoryReturnFocus?.isConnected ? directoryReturnFocus : contentsToggle).focus({ preventScroll: true });
  })().finally(() => { directoryClosePromise = null; });
  return directoryClosePromise;
}

const pad = number => String(number).padStart(2, '0');
const directoryList = contents.querySelector('.directory-projects');
const directoryRows = projectPages.map((page, index) => {
  const item = document.createElement('li');
  const link = document.createElement('a');
  link.className = 'directory-row';
  link.href = `#${page.id}`;
  const heading = page.querySelector('.project-copy h2').cloneNode(true);
  heading.querySelectorAll('.link-arrow').forEach(arrow => arrow.remove());
  heading.querySelectorAll('br').forEach(lineBreak => lineBreak.replaceWith(' '));
  const projectSubtitle = page.querySelector('.project-subtitle');

  const number = document.createElement('span');
  number.className = 'directory-no';
  number.textContent = pad(index + 1);
  const name = document.createElement('span');
  name.className = 'directory-name';
  if (projectSubtitle.lang) name.lang = projectSubtitle.lang;
  const arrow = document.createElement('span');
  arrow.className = 'link-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.append(icon('arrow-right'));
  name.append(projectSubtitle.textContent.trim(), '\u00a0', arrow);
  const note = document.createElement('span');
  note.className = 'directory-note';
  note.textContent = heading.textContent.replace(/\s+/gu, ' ').trim();
  if (heading.lang) note.lang = heading.lang;
  link.append(number, name, note);
  item.append(link);
  directoryList.append(item);
  link.addEventListener('pointerenter', () => showDirectoryPreview(index));
  link.addEventListener('focus', () => showDirectoryPreview(index));
  return link;
});
contents.querySelector('.directory-count').textContent = pad(projectPages.length);

// 目录左侧的截图预览：悬停或聚焦哪个项目就显示哪个。
const directoryPreview = contents.querySelector('.directory-preview');
const directoryPreviewImage = directoryPreview.querySelector('img');
const directoryPreviewCaption = directoryPreview.querySelector('figcaption');
let directoryPreviewIndex = -1;
function previewSource(page) {
  const image = page.querySelector('.project-gallery:not([hidden]) .shot-card img');
  return image ? image.dataset.src || image.getAttribute('src') : '';
}
function showDirectoryPreview(index, { animate = true } = {}) {
  if (index === directoryPreviewIndex) return;
  const page = projectPages[index];
  const source = previewSource(page);
  if (!source) return;
  directoryPreviewIndex = index;
  directoryRows.forEach((row, rowIndex) => row.classList.toggle('is-previewed', rowIndex === index));
  directoryPreviewImage.src = source;
  directoryPreview.style.setProperty('--preview-rotation', `${index % 2 ? 1.6 : -2}deg`);
  directoryPreviewCaption.textContent = [page.querySelector('.project-subtitle').textContent.trim(), page.dataset.category]
    .filter(Boolean).join(' · ');
  if (animate && !reducedMotion.matches) {
    directoryPreview.animate(
      [{ opacity: 0, translate: '0 14px', offset: 0 }],
      { duration: 420, easing: 'cubic-bezier(.22, 1, .36, 1)' }
    );
  }
}
function prepareDirectory() {
  projectPages.forEach(page => {
    const source = previewSource(page);
    if (source) new Image().src = source;
  });
  const currentProject = projectPages.indexOf(pages[current]);
  directoryPreviewIndex = -1;
  showDirectoryPreview(Math.max(0, currentProject), { animate: false });
  if (reducedMotion.matches) return;
  const items = [
    ...contents.querySelectorAll('.directory-index-label, .directory-intro, .directory-head'),
    ...directoryRows,
    directoryPreview,
    contents.querySelector('.directory-contact'),
  ];
  items.forEach((item, index) => item.animate(
    [{ opacity: 0, translate: '0 18px', offset: 0 }],
    { duration: 640, delay: 180 + index * 35, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'backwards' }
  ));
}
document.querySelectorAll('[data-icon]').forEach(element => element.replaceChildren(icon(element.dataset.icon)));

contentsToggle.addEventListener('click', openContents);
contents.querySelector('.directory-close').addEventListener('click', () => closeContents());
contentsPanel.addEventListener('cancel', event => {
  event.preventDefault();
  closeContents();
});
reducedMotion.addEventListener('change', () => {
  syncSmoothScroll();
  if (!reducedMotion.matches) return;
  contentsAnimation?.cancel();
  contentsAnimation = null;
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !contentsPanel.open) return;
  event.preventDefault();
  event.stopPropagation();
  closeContents();
});

function closePagePreviews(page) {
  let hadFocus = false;
  page.querySelectorAll('.project-gallery.is-preview-open').forEach(gallery => {
    hadFocus ||= gallery.querySelector('.project-preview').contains(document.activeElement);
    gallery._closePreview();
  });
  return hadFocus;
}

function goTo(target, { focus = false } = {}) {
  if (target < 0 || target >= pages.length) return;
  if (directoryClosePromise) {
    directoryClosePromise.then(() => goTo(target, { focus }));
    return;
  }
  if (contentsPanel.open) {
    if (location.hash !== `#${pages[target].id}`) window.history.pushState(null, '', `#${pages[target].id}`);
    closeContents({ target, focusPage: true });
    return;
  }
  activatePage(pages[target]);
  const previewHadFocus = closePagePreviews(pages[current]);
  const incoming = pages[target];
  if (location.hash !== `#${incoming.id}`) window.history.pushState(null, '', `#${incoming.id}`);
  if (lenis) lenis.scrollTo(incoming, { duration: 1.1, easing: scrollEase });
  else incoming.scrollIntoView({ block: 'start', behavior: 'instant' });
  if (focus || previewHadFocus) incoming.querySelector('h1,h2').focus({ preventScroll: true });
}

updatePageStatus();

function updateCurrentPage() {
  const midpoint = window.scrollY + window.innerHeight / 2;
  let visible = 0;
  for (let index = 1; index < pages.length; index += 1) {
    if (pages[index].offsetTop <= midpoint) visible = index;
    else break;
  }
  if (visible === current) return;
  const previewHadFocus = closePagePreviews(pages[current]);
  current = visible;
  updatePageStatus();
  if (previewHadFocus) pages[current].querySelector('h1,h2').focus({ preventScroll: true });
}

function scheduleCurrentPageUpdate() {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    updateCurrentPage();
  });
}
window.addEventListener('scroll', scheduleCurrentPageUpdate, { passive: true });
window.addEventListener('resize', scheduleCurrentPageUpdate);
window.addEventListener('hashchange', () => {
  const target = location.hash ? pages.findIndex(page => `#${page.id}` === location.hash) : 0;
  if (target >= 0) goTo(target, { focus: true });
});
window.addEventListener('popstate', scheduleCurrentPageUpdate);
scheduleCurrentPageUpdate();

document.querySelectorAll('a[href^="#"]:not(.skip-link)').forEach(link => {
  link.addEventListener('click', event => {
    const target = pages.findIndex(page => `#${page.id}` === link.getAttribute('href'));
    if (target < 0) return;
    event.preventDefault();
    goTo(target, { focus: true });
  });
});

window.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const gallery = document.querySelector('.project-gallery.is-preview-open');
  if (!gallery) return;
  event.preventDefault();
  gallery._closePreview(true);
});

const galleries = {
  verdant: {
    directory: "hackthon", kind: "截图",
    images: [
      {"file": "VERDANT_资产图鉴_币种指纹总览.png", "label": "VERDANT · 资产图鉴", "position": [2, 3, -4]},
      {"file": "VERDANT_风险研究_ETH风险概览.png", "label": "VERDANT · ETH 风险研究", "position": [30, 1, 4]},
      {"file": "VERDANT_风险研究_模型与依据.png", "label": "VERDANT · 模型与依据", "position": [15, 22, -2]},
      {"file": "VERDANT_报告存证_链上发布与核验.png", "label": "VERDANT · 报告存证", "position": [1, 49, 3]},
      {"file": "VERDANT_资产详情_市场轨迹与指纹构成.png", "label": "VERDANT · 市场轨迹与指纹构成", "position": [32, 57, -4]},
      {"file": "VERDANT_资产观测_Ethereum数字指纹.png", "label": "VERDANT · Ethereum 数字指纹与市场观测", "position": [18, 34, 2]},
    ]
  },
  scentDialogue: {
    directory: "loreal", kind: "图片",
    images: [
      {"file": "ScentDialogue_获奖证明_BrandStorm2026中国赛区Top200.png", "label": "SCENT DIALOGUE · 中国赛区 Top 200 证书", "position": [2, 3, -4]},
      {"file": "ScentDialogue_品牌标识_项目Logo.png", "label": "SCENT DIALOGUE · 品牌标识", "position": [30, 1, 4]},
      {"file": "ScentDialogue_市场分析_用户洞察与品牌定位.png", "label": "SCENT DIALOGUE · 用户洞察与品牌定位", "position": [1, 49, 3]},
      {"file": "ScentDialogue_营销策略_推广路径与可持续设计.png", "label": "SCENT DIALOGUE · 营销策略与可持续设计", "position": [32, 57, -4]},
      {"file": "ScentDialogue_产品设计_模块化香氛与数字体验.png", "label": "SCENT DIALOGUE · 模块化香氛与数字体验", "position": [18, 28, 2]},
    ]
  },
  movieDB: {
    directory: "movieDB", kind: "截图",
    images: [
      {"file": "MovieDB_电影分类_影片浏览.png", "label": "电影分类 · 影片浏览", "position": [2, 3, -4]},
      {"file": "MovieDB_影视详情_爱乐之城.png", "label": "影视详情 · 爱乐之城", "position": [30, 1, 4]},
      {"file": "MovieDB_媒体资源管理_剧集列表.png", "label": "媒体资源管理 · 剧集列表", "position": [15, 17, -2]},
      {"file": "MovieDB_最受好评电影_推荐列表.png", "label": "最受好评电影 · 推荐列表", "position": [1, 33, 3]},
      {"file": "MovieDB_影视详情_百年孤独_概览.png", "label": "影视详情 · 百年孤独 · 概览", "position": [32, 31, -4]},
      {"file": "MovieDB_媒体资源管理_剧集文件关联.png", "label": "媒体资源管理 · 剧集文件关联", "position": [17, 49, 2]},
      {"file": "MovieDB_影视详情_Pluribus.png", "label": "影视详情 · Pluribus", "position": [3, 63, -3]},
      {"file": "MovieDB_影视详情_百年孤独_演员与信息.png", "label": "影视详情 · 百年孤独 · 演员与信息", "position": [33, 61, 4]},
      {"file": "MovieDB_首页_精选轮播.png", "label": "首页 · 精选轮播", "position": [18, 42, -1]},
    ]
  },
  cryptoFactor: {
    directory: "cryptoFactor", kind: "截图",
    images: [
      {"file": "CryptoFactor_市场概览_代币经济功能.png", "label": "市场概览 · 代币经济功能", "position": [2, 3, -4]},
      {"file": "CryptoFactor_论文_来源论文与因子.png", "label": "论文 · 来源论文与因子", "position": [30, 1, 4]},
      {"file": "CryptoFactor_方法论_每周构建流程.png", "label": "方法论 · 每周构建流程", "position": [15, 15, -2]},
      {"file": "CryptoFactor_数据下载_因子数据包.png", "label": "数据下载 · 因子数据包", "position": [1, 49, 3]},
      {"file": "CryptoFactor_因子详情_活跃地址价值因子.png", "label": "因子详情 · 活跃地址价值因子", "position": [34, 32, 3]},
      {"file": "CryptoFactor_总览_八因子周收益.png", "label": "总览 · 八因子周收益", "position": [8, 65, -3]},
      {"file": "CryptoFactor_因子目录_市场因子MKT.png", "label": "因子目录 · 市场因子 MKT", "position": [31, 59, 4]},
      {"file": "CryptoFactor_首页_周度因子库.png", "label": "首页 · 周度因子库", "position": [17, 36, -1], "layer": 9},
    ]
  },
  studyJourney: {
    directory: "studyJourney", kind: "截图",
    images: [
      {"file": "StudyJourney_培养计划_课程添加与编辑.png", "label": "培养计划 · 课程添加与编辑", "position": [3, 5, -4]},
      {"file": "StudyJourney_学期课表_课程时间轴.png", "label": "学期课表 · 课程时间轴", "position": [30, 20, 4]},
      {"file": "StudyJourney_学业进度_毕业要求总览.png", "label": "学业进度 · 毕业要求总览", "position": [1, 55, 3]},
      {"file": "StudyJourney_培养计划_课程规划总览.png", "label": "培养计划 · 课程规划总览", "position": [20, 40, -1]},
    ]
  },
  quantchain: {
    directory: "quantchain", kind: "图片",
    images: [
      {"file": "slide-02.png", "label": "QuantChain · 研究汇报目录", "position": [2, 3, -4]},
      {"file": "slide-03.png", "label": "QuantChain · 研究背景", "position": [30, 1, 4]},
      {"file": "slide-04.png", "label": "QuantChain · 政策背景", "position": [15, 15, -2]},
      {"file": "slide-05.png", "label": "QuantChain · 社会背景", "position": [1, 49, 3]},
      {"file": "slide-08.png", "label": "QuantChain · 项目概述与研究框架", "position": [18, 30, 0], "layer": 9},
      {"file": "slide-10.png", "label": "QuantChain · 变量设定与模型", "position": [34, 32, 3]},
      {"file": "slide-16.png", "label": "QuantChain · 倾向得分匹配检验", "position": [8, 65, -3]},
      {"file": "slide-22.png", "label": "QuantChain · 理论意义", "position": [31, 59, 4]},
    ]
  },
  autoResearch: {
    directory: "autoResearch", kind: "图表",
    images: [
      {"file": "figure-01.svg", "label": "固定车型组的月度产量与计划", "position": [2, 4, -4]},
      {"file": "figure-02.svg", "label": "计划产量相对实际产量的偏离", "position": [29, 9, 3]},
      {"file": "figure-03.svg", "label": "新闻检索任务的主题分布", "position": [14, 24, -2]},
      {"file": "figure-04.svg", "label": "新闻样本的字段可用性", "position": [31, 40, 3]},
      {"file": "figure-05.svg", "label": "全国新能源汽车产量：年度参照", "position": [17, 56, -1], "sources": [{"label": "国家统计局 2024 年统计公报", "href": "https://www.stats.gov.cn/sj/zxfb/202502/t20250228_1958817.html"}, {"label": "国家统计局 2025 年统计公报", "href": "https://www.stats.gov.cn/sj/zxfb/202602/t20260228_1962662.html"}]},
    ]
  },
  galgameScenes: {
    directory: "galgame", kind: "截图",
    images: [
      {"file": "雾港七日_场景_标题画面.png", "label": "标题画面", "position": [2, 3, -4]},
      {"file": "雾港七日_场景_夜晚的房间.png", "label": "夜晚的房间", "position": [30, 1, 4]},
      {"file": "雾港七日_场景_海岸相遇.png", "label": "海岸相遇", "position": [15, 17, -2]},
      {"file": "雾港七日_场景_放学之后.png", "label": "放学之后", "position": [1, 33, 3]},
      {"file": "雾港七日_场景_天文社室.png", "label": "天文社室", "position": [32, 31, -4]},
      {"file": "雾港七日_场景_雾钟咖啡店.png", "label": "雾钟咖啡店", "position": [17, 49, 2]},
      {"file": "雾港七日_场景_街道选择.png", "label": "街道选择", "position": [3, 63, -3]},
      {"file": "雾港七日_场景_图书馆.png", "label": "图书馆", "position": [33, 61, 4]},
    ]
  },
  galgameEndings: {
    directory: "galgame", kind: "结局画面",
    images: [
      {"file": "雾港七日_结局_END1遗忘.webp", "label": "END 1 / 遗忘", "position": [3, 5, -4]},
      {"file": "雾港七日_结局_END2离岸.webp", "label": "END 2 / 离岸", "position": [30, 20, 4]},
      {"file": "雾港七日_结局_END3留在雾里.webp", "label": "END 3 / 留在雾里", "position": [1, 55, 3]},
      {"file": "雾港七日_结局_END4雾港七日.webp", "label": "END 4 / 雾港七日", "position": [20, 40, -1]},
    ]
  },
  galgamePortraits: {
    directory: "galgame", kind: "立绘",
    images: [
      {"file": "雾港七日_立绘_澄恋.png", "label": "澄恋"},
      {"file": "雾港七日_立绘_茜.png", "label": "茜"},
      {"file": "雾港七日_立绘_海斗.png", "label": "海斗"},
      {"file": "雾港七日_立绘_流转.png", "label": "流转"},
      {"file": "雾港七日_立绘_凛子.png", "label": "凛子"},
      {"file": "雾港七日_立绘_彻.png", "label": "彻"},
    ]
  },
};

document.querySelectorAll('.project-gallery').forEach(gallery => {
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

  const resizePreview = () => {
    if (gallery.classList.contains('is-preview-open')) fitPreviewFrame();
  };
  new ResizeObserver(resizePreview).observe(preview);
  window.addEventListener('resize', resizePreview);

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
    const previousTransition = selectedCard.style.transition;
    selectedCard.style.transition = 'none';
    const target = selectedCard.getBoundingClientRect();
    const matrix = new DOMMatrixReadOnly(getComputedStyle(selectedCard).transform);
    const source = frame.getBoundingClientRect();
    const dx = target.left + target.width / 2 - source.left - source.width / 2;
    const dy = target.top + target.height / 2 - source.top - source.height / 2;
    const sx = selectedCard.offsetWidth * Math.hypot(matrix.a, matrix.b) / source.width;
    const sy = selectedCard.offsetHeight * Math.hypot(matrix.c, matrix.d) / source.height;
    const rotation = Math.atan2(matrix.b, matrix.a);
    selectedCard.style.transition = previousTransition;
    const animation = frame.animate([
      { transform: fromTransform },
      { transform: `translate(${dx}px, ${dy}px) rotate(${rotation}rad) scale(${sx}, ${sy})` },
    ], { duration: 460, easing: 'cubic-bezier(.22,.68,.12,1)', fill: 'both' });
    previewAnimation = animation;
    animation.finished.then(() => {
      if (activeRequest === requestId) finishClose(true);
    }).catch(error => {
      if (error.name !== 'AbortError') {
        console.error(error);
        if (activeRequest === requestId) finishClose(true);
      }
    });
  }
  gallery._closePreview = closePreview;
  closeButton.addEventListener('click', () => closePreview(true));

  async function expandPreview(source, rotation, sourceWidth, sourceHeight, activeRequest) {
    const target = frame.getBoundingClientRect();
    const dx = source.left + source.width / 2 - target.left - target.width / 2;
    const dy = source.top + source.height / 2 - target.top - target.height / 2;
    gallery.classList.add('is-preview-opening');
    const animation = frame.animate([
      { transform: `translate(${dx}px, ${dy}px) rotate(${rotation}rad) scale(${sourceWidth / target.width}, ${sourceHeight / target.height})` },
      { transform: 'translate(0, 0) rotate(0) scale(1)' },
    ], { duration: 540, easing: 'cubic-bezier(.22,.68,.12,1)', fill: 'both' });
    previewAnimation = animation;
    try {
      await animation.finished;
    } catch (error) {
      if (error.name !== 'AbortError') console.error(error);
    } finally {
      if (activeRequest === requestId) stopPreviewAnimation();
    }
  }

  function openPreview(item, card, original, thumbnail) {
    const activeRequest = ++requestId;
    stopPreviewAnimation();
    clearPreviewLoading();
    const source = card.getBoundingClientRect();
    const matrix = new DOMMatrixReadOnly(getComputedStyle(card).transform);
    const rotation = Math.atan2(matrix.b, matrix.a);
    const sourceWidth = card.offsetWidth * Math.hypot(matrix.a, matrix.b);
    const sourceHeight = card.offsetHeight * Math.hypot(matrix.c, matrix.d);
    const cardImage = card.querySelector('img');
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
    sources.replaceChildren(...(item.sources || []).map(({ label, href }) => {
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
    }));
    sources.hidden = !item.sources?.length;
    preview.inert = false;
    cards.forEach(other => { other.inert = true; });
    exitingElements.forEach(element => { element.inert = true; });
    closeButton.focus({ preventScroll: true });
    if (!reducedMotion.matches) expandPreview(source, rotation, sourceWidth, sourceHeight, activeRequest);
    fullImage.decode().then(() => {
      if (activeRequest !== requestId) return;
      clearPreviewLoading();
      previewDimensions = { width: fullImage.naturalWidth, height: fullImage.naturalHeight };
      fitPreviewFrame();
      gallery.classList.add('is-preview-ready');
    }).catch(() => {
      if (activeRequest !== requestId) return;
      clearPreviewLoading();
      errorMessage.hidden = false;
    });
  }

  const cards = config.images.map((item, index) => {
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
  gallery.replaceChildren(...cards, preview);
});

function activatePage(page) {
  page.querySelectorAll('.shot-card img[data-src]').forEach(image => {
    image.loading = 'eager';
    image.src = image.dataset.src;
    delete image.dataset.src;
  });
}

activatePage(pages[current]);
if ('IntersectionObserver' in window) {
  const galleryObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      activatePage(entry.target);
      galleryObserver.unobserve(entry.target);
    });
  }, { rootMargin: '75% 0px' });
  pages.filter(page => page.querySelector('.project-gallery')).forEach(page => galleryObserver.observe(page));
} else {
  pages.forEach(activatePage);
}

const storyTabs = [...document.querySelectorAll('[data-story-tab]')];
const storyPanels = storyTabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));
let storyAnimations = [];
let storyTransitionId = 0;
function selectStoryTab(tab, directionHint = 0) {
  const nextIndex = storyTabs.indexOf(tab);
  const previousIndex = storyTabs.findIndex(item => item.getAttribute('aria-selected') === 'true');
  if (nextIndex === previousIndex) return;

  const transitionId = ++storyTransitionId;
  storyAnimations.forEach(animation => animation.cancel());
  storyAnimations = [];
  storyPanels.forEach((panel, index) => {
    panel.classList.remove('is-entering', 'is-exiting');
    panel.hidden = index !== previousIndex;
    panel.inert = index !== previousIndex;
    panel.removeAttribute('aria-hidden');
  });

  const outgoing = storyPanels[previousIndex];
  const incoming = storyPanels[nextIndex];
  outgoing._closePreview?.();
  outgoing.inert = true;
  outgoing.setAttribute('aria-hidden', 'true');
  incoming.hidden = false;
  incoming.inert = !reducedMotion.matches;
  storyTabs.forEach((item, index) => {
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
  const timing = { duration: 340, easing: 'cubic-bezier(.22,.68,.12,1)', fill: 'forwards' };
  outgoing.classList.add('is-exiting');
  incoming.classList.add('is-entering');
  const leave = outgoing.animate([
    { transform: 'translateX(0)', opacity: 1, filter: 'blur(0px)' },
    { transform: `translateX(${-18 * direction}px)`, opacity: 0, filter: 'blur(2.5px)' }
  ], timing);
  const enter = incoming.animate([
    { transform: `translateX(${18 * direction}px)`, opacity: 0, filter: 'blur(2.5px)' },
    { transform: 'translateX(0)', opacity: 1, filter: 'blur(0px)' }
  ], timing);
  storyAnimations = [leave, enter];
  Promise.allSettled(storyAnimations.map(animation => animation.finished)).then(() => {
    if (transitionId !== storyTransitionId) return;
    outgoing.hidden = true;
    outgoing.removeAttribute('aria-hidden');
    outgoing.classList.remove('is-exiting');
    incoming.classList.remove('is-entering');
    incoming.inert = false;
    storyAnimations.forEach(animation => animation.cancel());
    storyAnimations = [];
  });
}
storyTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectStoryTab(tab));
  tab.addEventListener('keydown', event => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? storyTabs.length - 1 : step ? (index + step + storyTabs.length) % storyTabs.length : -1;
    if (target < 0) return;
    event.preventDefault();
    event.stopPropagation();
    selectStoryTab(storyTabs[target], step);
    storyTabs[target].focus();
  });
});

// 滚动浮现：与 CryptoFactor 相同的上浮节奏，每组只播放一次。
const revealEasing = 'cubic-bezier(.22, 1, .36, 1)';
function revealGroups(page) {
  const copy = [...page.querySelectorAll('.copy > *')];
  const visual = [...page.querySelectorAll(
    '.visual .contact-methods > *, .visual .site-credits, .story-tabs, .project-gallery:not([hidden]) > .shot-card'
  )];
  return [
    { container: page.querySelector('.copy'), items: copy, offset: 0 },
    { container: page.querySelector('.visual'), items: visual, offset: 120 },
  ].filter(group => group.container && group.items.length);
}

if (!reducedMotion.matches && 'IntersectionObserver' in window) {
  const pendingGroups = new Map();
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const group = pendingGroups.get(entry.target);
      if (!group) return;
      pendingGroups.delete(entry.target);
      revealObserver.unobserve(entry.target);
      group.items.forEach((item, index) => {
        item.classList.remove('reveal-pending');
        if (reducedMotion.matches) return;
        item.animate(
          [{ opacity: 0, translate: '0 28px', offset: 0 }],
          { duration: 800, delay: group.offset + index * 70, easing: revealEasing, fill: 'backwards' }
        );
      });
    });
  }, { threshold: 0.12 });

  const foldLine = window.innerHeight * 0.92;
  pages.filter(page => page.id !== 'intro').forEach(page => {
    revealGroups(page).forEach(group => {
      if (group.container.getBoundingClientRect().top < foldLine) return;
      group.items.forEach(item => item.classList.add('reveal-pending'));
      pendingGroups.set(group.container, group);
      revealObserver.observe(group.container);
    });
  });
}
