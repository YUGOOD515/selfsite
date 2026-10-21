// 作品页背景氛围：基于 ascii-magic-art（MIT，vendor/ascii-magic/）。
// 低分辨率渲染后放大，配合遮罩与低透明度形成淡雅、模糊的纹理；
// 仅桌面端加载，接近视口才导入，离屏由 player 自动暂停，减少动态效果时停在首帧。
import { play } from './vendor/ascii-magic/runtime/player.js';

const CELL_W = 0.602; // 等宽字符宽度 / 字号，与 runtime/canvas.js 一致
const SPEED = 0.4; // 播放速度：放慢成"呼吸"
const desktop = matchMedia('(min-width: 768px)');
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
  inner.append(pre);
  layer.append(inner);

  let fontPx = 0;
  let stop = () => {};
  const fit = (force = false) => {
    const width = layer.clientWidth;
    const height = layer.clientHeight;
    if (!width || !height) return;
    const rowPx = cell === 'square' ? CELL_W : 1; // 每行高度 / 字号
    // 铺满图层（cover），按缩小后的尺寸渲染
    const scale = parseFloat(getComputedStyle(layer).getPropertyValue('--ambient-scale')) || 1; // 放大倍数，越大越糊
    const next = Math.max(width / (cols * CELL_W), height / (rows * rowPx)) / scale;
    if (!force && Math.abs(next - fontPx) < 0.05) return;
    fontPx = next;
    pre.style.fontSize = `${fontPx}px`;
    stop();
    stop = play(pre, mod, { look, speed: SPEED });
  };
  fit();
  new ResizeObserver(() => fit()).observe(layer);
  dark.addEventListener('change', () => fit(true)); // 深浅色切换后重新取墨色
  requestAnimationFrame(() => layer.classList.add('is-ready'));
}

const layers = [...document.querySelectorAll('[data-ascii]')];
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting || !desktop.matches) return;
    observer.unobserve(entry.target);
    mount(entry.target);
  });
}, { rootMargin: '50% 0px' });
const start = () => {
  if (!desktop.matches) return; // 移动端不显示，也不加载
  layers.forEach(layer => observer.observe(layer));
};
start();
desktop.addEventListener('change', start);
