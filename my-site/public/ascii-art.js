// 作品页背景氛围：基于 ascii-magic-art（MIT，vendor/ascii-magic/）。
// 每页一个作品，淡、柔、无边界（遮罩与透明度见 style.css，手机端放在右上角留白）。
// 渲染：作品在 JS 里算字符画，网点交给 WebGL 按原始分辨率画（ambient-gl.js），
// 与首尾页的流体背景一样主要在显卡上完成；不支持 WebGL 时退回 canvas 播放器。
// 节流：接近视口才导入，只播放视口内的那一页，远离时释放画布，减少动态效果时停在首帧。
import { createDotRenderer, toneOf } from './ambient-gl.js';

const CELL_W = 0.602; // 等宽字符宽度 / 字号，与 runtime/canvas.js 一致
const DENSITY = 1.31; // 每格网点数（沿短边），与 paintTone 一致
const SPEED = 0.4; // 播放速度：放慢成"呼吸"
const desktop = matchMedia('(min-width: 768px)');
const maxFps = () => (desktop.matches ? 15 : 12); // 慢速动画下已足够顺滑，手机再省一点
const dark = matchMedia('(prefers-color-scheme: dark)');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

const cssNumber = (el, name, fallback) => {
  const v = parseFloat(getComputedStyle(el).getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
};
const inkOf = el => (getComputedStyle(el).color.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(v => v / 255);

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
  if (!mountGL(layer, mod)) await mountCanvas(layer, mod);
  requestAnimationFrame(() => layer.classList.add('is-ready'));
}

function mountGL(layer, mod) {
  const canvas = document.createElement('canvas');
  canvas.className = 'ambient-gl';
  canvas.setAttribute('aria-hidden', 'true');
  let gl = createDotRenderer(canvas);
  if (!gl) return false;
  layer.append(canvas);

  const { cols, rows, cell, fps = 24 } = mod.meta;
  const draw = mod.default();
  const tone = new Uint8Array(cols * rows);
  const vals = new Float32Array(cols * rows);
  let geo = null;
  let elapsed = 0;
  let near = false; // 接近视口：持有画布
  let active = false; // 在视口内：播放

  const layout = () => {
    const width = layer.clientWidth;
    const height = layer.clientHeight;
    if (!width || !height) return false;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // 铺满图层（cover）：字号决定格子大小，作品居中
    const rowPx = cell === 'square' ? CELL_W : 1;
    const font = Math.max(width / (cols * CELL_W), height / (rows * rowPx));
    const cw = font * CELL_W;
    const ch = cell === 'square' ? cw : font;
    const unit = Math.min(cw, ch);
    geo = {
      dpr, unit, step: unit / DENSITY,
      w: cols * cw, h: rows * ch,
      ox: (width - cols * cw) / 2, oy: (height - rows * ch) / 2,
      soft: cssNumber(layer, '--ambient-soft', 1),
      ink: inkOf(layer),
    };
    const W = Math.round(width * dpr), H = Math.round(height * dpr);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    return true;
  };
  const render = () => {
    if (!geo) return;
    const f = draw(elapsed);
    toneOf(f, f.palette || mod.meta.palette, cols, rows, tone, vals);
    gl.draw(tone, cols, rows, geo);
  };
  const release = () => { canvas.width = 1; canvas.height = 1; geo = null; };
  const refresh = () => { if (near && layout()) render(); };

  // 播放循环：只在 active 时跑，按 maxFps 节流
  let raf = 0, prev = 0, last = 0;
  const loop = now => {
    raf = requestAnimationFrame(loop);
    if (prev) elapsed += ((now - prev) / 1000) * SPEED;
    prev = now;
    const step = 1000 / Math.min(fps, maxFps());
    if (now - last < step) return;
    last = now - ((now - last) % step);
    render();
  };
  const sync = () => {
    const run = active && near && !reduce.matches && !mod.meta.still && !gl.lost;
    if (run && !raf) { prev = 0; raf = requestAnimationFrame(loop); }
    if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
  };

  new IntersectionObserver(([entry]) => {
    const next = entry.isIntersecting;
    if (next && !near) { near = true; refresh(); }
    if (!next && near) { near = false; release(); }
    sync();
  }, { rootMargin: '100% 0px' }).observe(layer);
  new IntersectionObserver(([entry]) => {
    active = entry.isIntersecting && entry.intersectionRatio >= 0.01;
    sync();
  }, { threshold: [0, 0.01] }).observe(layer);
  new ResizeObserver(refresh).observe(layer);
  dark.addEventListener('change', refresh); // 深浅色切换后重新取墨色
  reduce.addEventListener('change', sync);
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); sync(); });
  canvas.addEventListener('webglcontextrestored', () => { gl = createDotRenderer(canvas) || gl; refresh(); sync(); });
  return true;
}

// 退路：不支持 WebGL 时用 ascii-magic 自带的 canvas 播放器，小尺寸渲染再放大。
async function mountCanvas(layer, mod) {
  const { play } = await import('./vendor/ascii-magic/runtime/player.js');
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
