// 作品页背景氛围：基于 ascii-magic-art（MIT，vendor/ascii-magic/）。
// 低分辨率渲染后放大，配合遮罩与低透明度形成淡雅、模糊的纹理；
// 接近视口才导入（手机端位置见 style.css）；只播放视口内的那一页，减少动态效果时停在首帧。
// 性能：画布按小尺寸渲染再用 CSS 放大（模糊后看不出差别），并限制帧率。
import { play } from './vendor/ascii-magic/runtime/player.js';

const CELL_W = 0.602; // 等宽字符宽度 / 字号，与 runtime/canvas.js 一致
const SPEED = 0.4; // 播放速度：放慢成"呼吸"
const desktop = matchMedia('(min-width: 768px)');
// 慢速动画下 12 帧已足够顺滑；手机再降一点省电
const maxFps = () => (desktop.matches ? 12 : 10);
const dark = matchMedia('(prefers-color-scheme: dark)');

async function mount(layer) {
  const slug = (layer.dataset.ascii || '').replace(/[^a-z0-9-]/g, '');
  if (!slug) return;
  let mod;
  try {
    mod = await import(`./vendor/ascii-magic/pieces/${slug}.js`);
  } catch {
    layer.hidden = true;
    return;
  }
  const { cols, rows, cell } = mod.meta;
  // 统一用点阵质感，模糊后像细腻的网点
  const look = { mono: true, look: layer.dataset.asciiLook || 'dots' };
  const inner = document.createElement('div');
  inner.className = 'ambient-inner';
  const pre = document.createElement('pre');
  // 输出画布：把 player 的小画布连同模糊一起画上来，模糊只算低分辨率像素，
  // 而不是在放大后的整屏图层上做 CSS 模糊（后者是放大后的主要开销）
  const out = document.createElement('canvas');
  out.className = 'ambient-out';
  out.setAttribute('aria-hidden', 'true');
  const octx = out.getContext('2d');
  const canFilter = typeof octx.filter === 'string';
  if (!canFilter) out.classList.add('is-css-blur');
  inner.append(pre, out);
  layer.append(inner);
  let blurPx = 0; // 输出画布上的模糊半径（物理像素）
  const present = () => {
    const src = pre._canvas;
    if (!src) return;
    if (out.width !== src.width || out.height !== src.height) {
      out.width = src.width;
      out.height = src.height;
    }
    octx.clearRect(0, 0, out.width, out.height);
    if (canFilter) octx.filter = blurPx > 0 ? `blur(${blurPx}px)` : 'none';
    octx.drawImage(src, 0, 0);
  };

  let fontPx = 0;
  let stop = () => {};
  const fit = (force = false) => {
    const width = layer.clientWidth;
    const height = layer.clientHeight;
    if (!width || !height) return;
    const rowPx = cell === 'square' ? CELL_W : 1; // 每行高度 / 字号
    const cover = Math.max(width / (cols * CELL_W), height / (rows * rowPx)); // 铺满图层所需字号
    // 低分辨率渲染：每格只用 --ambient-cell 个物理像素，再放大 k 倍铺满
    const dpr = Math.min(2, window.devicePixelRatio || 1); // 与 player 一致
    const cellPx = parseFloat(getComputedStyle(layer).getPropertyValue('--ambient-cell')) || 6;
    const next = Math.min(cover, cellPx / dpr / CELL_W);
    const k = cover / next;
    inner.style.setProperty('--ambient-k', String(k));
    const blur = parseFloat(getComputedStyle(layer).getPropertyValue('--ambient-blur')) || 0; // 放大后的视觉模糊
    blurPx = (blur / k) * dpr;
    if (!force && Math.abs(next - fontPx) < 0.01) return;
    fontPx = next;
    pre.style.fontSize = `${fontPx}px`;
    stop();
    stop = play(pre, mod, { look, speed: SPEED, maxFps: maxFps(), onFrame: present });
  };
  // 只在本页可见时播放：隐藏后 player 内部的 IntersectionObserver 判定离屏并暂停，
  // 动画状态保留，回来时接着播（作品页首尾相接，player 自带的 100px 余量会让相邻页也一直在跑）
  inner.hidden = true;
  new IntersectionObserver(([entry]) => {
    inner.hidden = !entry.isIntersecting || entry.intersectionRatio < 0.01;
  }, { threshold: [0, 0.01] }).observe(layer);
  fit();
  new ResizeObserver(() => fit()).observe(layer);
  dark.addEventListener('change', () => fit(true)); // 深浅色切换后重新取墨色
  requestAnimationFrame(() => layer.classList.add('is-ready'));
}

const layers = [...document.querySelectorAll('[data-ascii]')];
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    observer.unobserve(entry.target);
    mount(entry.target);
  });
}, { rootMargin: '50% 0px' });
layers.forEach(layer => observer.observe(layer));
