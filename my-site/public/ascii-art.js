// 作品页 ASCII 标识：基于 ascii-magic-art（MIT，vendor/ascii-magic/），
// 只加载页面上用到的片段；接近视口才导入，离屏由 player 自动暂停，减少动态效果时停在首帧。
import { play } from './vendor/ascii-magic/runtime/player.js';

const CELL_W = 0.602; // 等宽字符宽度 / 字号，与 runtime/canvas.js 一致

async function mount(block) {
  const slug = (block.dataset.ascii || '').replace(/[^a-z0-9-]/g, '');
  if (!slug) return;
  let mod;
  try {
    mod = await import(`./vendor/ascii-magic/pieces/${slug}.js`);
  } catch {
    block.hidden = true;
    return;
  }
  const { cols, rows, cell } = mod.meta;
  const look = { mono: true };
  if (block.dataset.asciiLook) look.look = block.dataset.asciiLook;
  const pre = document.createElement('pre');
  block.append(pre);

  let fontPx = 0;
  let stop = () => {};
  const fit = () => {
    const width = block.clientWidth;
    const height = block.clientHeight;
    if (!width || !height) return;
    const rowPx = cell === 'square' ? CELL_W : 1; // 每行高度 / 字号
    const next = Math.min(width / (cols * CELL_W), height / (rows * rowPx));
    if (Math.abs(next - fontPx) < 0.05) return;
    fontPx = next;
    pre.style.fontSize = `${fontPx}px`;
    stop();
    stop = play(pre, mod, { look });
  };
  fit();
  new ResizeObserver(fit).observe(block);
  // 深浅色切换后重新取墨色
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    fontPx = 0;
    fit();
  });
  block.classList.add('is-ready');
}

const blocks = [...document.querySelectorAll('[data-ascii]')];
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      mount(entry.target);
    });
  }, { rootMargin: '50% 0px' });
  blocks.forEach(block => observer.observe(block));
} else {
  blocks.forEach(mount);
}
