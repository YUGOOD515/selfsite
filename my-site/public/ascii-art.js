// 作品页背景氛围：基于 ascii-magic-art（MIT，vendor/ascii-magic/）。
// 每页一个作品，淡、柔、无边界（遮罩与透明度见 style.css，手机端放在右上角留白）。
// 渲染：作品在 JS 里算字符画，网点交给 WebGL 按原始分辨率画（ambient-gl.js），
// 与首尾页的流体背景一样主要在显卡上完成；不支持 WebGL 时退回 canvas 播放器。
// 调度：当前页和上下相邻页一起播放（最多三个），共用一个 rAF，每个 tick 最多算一个作品的一帧，
// 把开销错开；相邻页离屏时只推进动画、不画，用半速。两帧之间在显卡上插值，看起来比 15fps 更连贯。
// 起停都按速度缓动（约 0.6 秒），不会瞬间开始或停住；远离时释放画布，减少动态效果时缓停。
import { createDotRenderer, toneOf } from './ambient-gl.js';

const CELL_W = 0.602; // 等宽字符宽度 / 字号，与 runtime/canvas.js 一致
const DENSITY = 1.31; // 每格网点数（沿短边），与 paintTone 一致
const SPEED = 0.4; // 播放速度：放慢成"呼吸"
const desktop = matchMedia('(min-width: 768px)');
const maxFps = () => (desktop.matches ? 15 : 12); // 作品计算帧率：慢速动画下已足够，手机再省一点
const DRAW_FPS = 30; // 显卡插值绘制帧率
const EASE = 0.4; // 起停缓动时间常数（秒），约 1 秒内平滑到位
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

// 共用调度：一个 rAF 驱动所有播放中的作品
const players = new Set();
let raf = 0, prevNow = 0;
const wake = () => { if (!raf) { prevNow = 0; raf = requestAnimationFrame(tick); } };
function tick(now) {
  raf = 0;
  const dt = prevNow ? Math.min(0.1, (now - prevNow) / 1000) : 0;
  prevNow = now;
  let due = null, best = 0;
  for (const p of players) {
    p.ease(dt);
    const late = p.lateness(now);
    if (late > best) { best = late; due = p; }
  }
  if (due) due.compute(now); // 每个 tick 最多算一帧，几个作品错开
  for (const p of players) p.present(now);
  for (const p of players) if (!p.busy()) players.delete(p);
  if (players.size) { raf = requestAnimationFrame(tick); } else prevNow = 0;
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
  let prevTone = new Uint8Array(cols * rows);
  let nextTone = new Uint8Array(cols * rows);
  const vals = new Float32Array(cols * rows);
  let geo = null;
  let elapsed = 0;
  let near = false; // 当前页或相邻页：持有画布、播放
  let visible = false; // 在视口内：绘制
  let speed = 0; // 0–1，起停缓动
  let frames = 0; // 已算帧数
  let lastCompute = 0, interval = 1, lastDraw = 0, dirty = false, settled = true;

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
      soft: cssNumber(layer, '--ambient-soft', 0),
      ink: inkOf(layer),
    };
    const W = Math.round(width * dpr), H = Math.round(height * dpr);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    dirty = true;
    return true;
  };
  // 算一帧：新帧放到 next，旧的 next 变成 prev
  const step = () => {
    const f = draw(elapsed);
    [prevTone, nextTone] = [nextTone, prevTone];
    toneOf(f, f.palette || mod.meta.palette, cols, rows, nextTone, vals);
    if (!frames++) prevTone.set(nextTone);
    gl.frames(prevTone, nextTone, cols, rows);
  };
  const mixAt = now => (settled ? 1 : Math.min(1, (now - lastCompute) / interval));
  let lastMix = -1;
  const paint = now => {
    if (!geo || !visible) return;
    const m = mixAt(now);
    if (!dirty && m === lastMix) return; // 画面没变就不画
    gl.draw(m, geo);
    lastDraw = now; lastMix = m; dirty = false;
  };
  const target = () => (near && !reduce.matches && !mod.meta.still && !gl.lost && !document.hidden ? 1 : 0);
  // 计算间隔：基础帧率 ×（离屏半速）÷ 当前速度；速度降到 0 时自然不再算
  const baseInterval = () => (1000 / Math.min(fps, maxFps())) * (visible ? 1 : 2);

  const player = {
    ease(dt) {
      const t = target();
      speed += (t - speed) * (1 - Math.exp(-dt / EASE));
      if (Math.abs(t - speed) < 0.01) speed = t;
      elapsed += dt * SPEED * speed;
    },
    lateness(now) {
      if (!geo || speed <= 0) return 0;
      const late = (now - lastCompute) / (baseInterval() / speed);
      return late >= 0.92 ? late : 0; // 留一点余量，免得 60Hz 的 tick 让帧率掉一档
    },
    compute(now) {
      interval = Math.min(1000, baseInterval() / Math.max(speed, 0.05));
      lastCompute = now;
      settled = false;
      step();
    },
    present(now) {
      // 已停下且最后一帧插值走完：定格
      if (!settled && speed <= 0 && now - lastCompute >= interval) { settled = true; dirty = true; }
      if (visible && (dirty || now - lastDraw >= 1000 / DRAW_FPS - 2)) paint(now);
    },
    busy() { return !!geo && (speed > 0 || target() > 0 || !settled || (dirty && visible)); },
  };
  const start = () => { if (geo && (target() > 0 || speed > 0 || dirty)) { players.add(player); wake(); } };
  const refresh = () => {
    if (!near || !layout()) return;
    if (!frames) { step(); lastCompute = performance.now(); } // 首帧：先画出静止画面，再缓动起播
    dirty = true;
    paint(performance.now());
    start();
  };
  const release = () => { canvas.width = 1; canvas.height = 1; geo = null; speed = 0; settled = true; players.delete(player); };

  new IntersectionObserver(([entry]) => {
    const next = entry.isIntersecting;
    if (next && !near) { near = true; refresh(); }
    if (!next && near) { near = false; release(); }
  }, { rootMargin: '100% 0px' }).observe(layer);
  // 相邻页贴着视口边缘时 isIntersecting 也为 true，要看实际露出的比例
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting && entry.intersectionRatio > 0;
    if (visible) { dirty = true; start(); }
  }, { threshold: [0, 0.001] }).observe(layer);
  new ResizeObserver(refresh).observe(layer);
  dark.addEventListener('change', refresh); // 深浅色切换后重新取墨色
  reduce.addEventListener('change', start); // 打开减少动态效果：缓停；关闭：缓动起播
  document.addEventListener('visibilitychange', start);
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); });
  canvas.addEventListener('webglcontextrestored', () => {
    gl = createDotRenderer(canvas) || gl;
    if (frames) gl.frames(prevTone, nextTone, cols, rows);
    dirty = true;
    refresh();
  });
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
