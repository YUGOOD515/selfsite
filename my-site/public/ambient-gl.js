// 作品页背景氛围的 WebGL 点阵渲染器。
// 作品（ascii-magic-art 的 piece）每帧仍在 JS 里算出字符画，这里只把每格亮度
// （约 3000 个数）传给显卡，由片元着色器按屏幕原始分辨率画出半调网点：
// 清晰、不用缩放，主线程几乎没有绘制开销。网点规则与 runtime/canvas.js 的
// paintTone 一致：亮度取百分位归一，4 档点径，4×4 Bayer 抖动过渡。
import { cover } from './vendor/ascii-magic/runtime/glyphs.js';

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;
const FRAG = `
precision highp float;
uniform sampler2D u_prev; // 上一帧亮度
uniform sampler2D u_next; // 当前帧亮度
uniform float u_mix;      // 两帧之间的插值，让 15fps 的作品看起来更连贯
uniform vec2 u_res;     // 画布物理像素
uniform float u_dpr;
uniform vec2 u_origin;  // 作品左上角（CSS 像素）
uniform vec2 u_size;    // 作品尺寸（CSS 像素）
uniform float u_step;   // 网点间距
uniform float u_unit;   // 格子短边
uniform float u_soft;   // 点边缘柔化（CSS 像素）
uniform vec3 u_ink;
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float sizeAt(float l) { return l < 0.5 ? 0.2 : l < 1.5 ? 0.5 : l < 2.5 ? 0.85 : 1.32; }
// 一个网点的覆盖度；最大的点会略超出自己的格子，所以要看相邻格
float dotAt(vec2 p, vec2 id, float aa) {
  vec2 c = (id + 0.5) * u_step;
  vec2 uv = c / u_size;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  float x = mix(texture2D(u_prev, uv).r, texture2D(u_next, uv).r, u_mix) * 4.0 - 0.5;
  float lvl = floor(x);
  if (x - lvl > bayer4(id) + 0.03125) lvl += 1.0;
  if (lvl < 0.0) return 0.0;
  float rad = 0.3 * u_unit * sizeAt(min(lvl, 3.0));
  return 1.0 - smoothstep(rad - aa, rad + aa, length(p - c));
}
void main() {
  vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) / u_dpr - u_origin;
  vec2 id = floor(p / u_step);
  float aa = 0.5 / u_dpr + 0.5 * u_soft;
  float a = dotAt(p, id, aa);
  // 只有贴近格子边缘时，相邻格的大点才可能盖过来（最大点径略大于半个间距）
  vec2 f = p / u_step - id;
  float reach = (0.396 * u_unit + aa) / u_step - 0.5;
  if (reach > 0.0 && min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) < reach) {
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      if (i != 0 || j != 0) a = max(a, dotAt(p, id + vec2(float(i), float(j)), aa));
    }
  }
  if (a <= 0.0) discard;
  gl_FragColor = vec4(u_ink * a, a);
}
`;

const LV = { '▁': 0.135, '▂': 0.257, '▃': 0.378, '▄': 0.51, '▅': 0.635, '▆': 0.757, '▇': 0.878, '█': 1 };
const coverOf = new Map();
const glyphValue = ch => {
  let v = coverOf.get(ch);
  if (v === undefined) coverOf.set(ch, (v = LV[ch] ?? cover(ch) / 100));
  return v;
};
const lumOf = new Map();
const lum = hex => {
  if (!hex) return 0.88;
  let v = lumOf.get(hex);
  if (v === undefined) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    lumOf.set(hex, (v = 0.2126 * r + 0.7152 * g + 0.0722 * b));
  }
  return v;
};

/** 一帧字符画 → 每格网点亮度（0–255），与 paintTone 的归一方式一致。 */
export function toneOf(frame, palette, cols, rows, out, vals) {
  const text = typeof frame === 'string' ? frame : frame.text;
  const color = typeof frame === 'string' ? null : frame.color;
  const T = text.split('\n');
  const C = color ? color.split('\n') : null;
  let vmax = 0;
  for (let r = 0; r < rows; r++) {
    const row = T[r] || '';
    const crow = C ? C[r] || '' : '';
    let c = 0;
    for (const ch of row) {
      if (c >= cols) break;
      const i = r * cols + c;
      if (ch === ' ') vals[i] = -1;
      else {
        const k = crow[c];
        const v = glyphValue(ch) * lum(k && k !== ' ' && palette ? palette[k] : null);
        vals[i] = v;
        if (v > vmax) vmax = v;
      }
      c++;
    }
    for (; c < cols; c++) vals[r * cols + c] = -1;
  }
  // 4% / 98.5% 百分位做黑白点，曲线 1.1
  const HB = 256, hist = new Uint32Array(HB);
  let n = 0;
  for (let i = 0; i < vals.length; i++) if (vals[i] >= 0) { hist[Math.min(HB - 1, Math.floor((vals[i] / (vmax || 1)) * HB))]++; n++; }
  const P = q => { let acc = 0; const want = q * n; for (let k = 0; k < HB; k++) { acc += hist[k]; if (acc >= want) return ((k + 0.5) / HB) * vmax; } return vmax; };
  const a = P(0.04), b = Math.max(P(0.985), a + 1e-4);
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    out[i] = v < 0 ? 0 : Math.round(255 * Math.pow(Math.min(1, Math.max(0, (v - a) / (b - a))), 1.1));
  }
  return out;
}

/** 在 canvas 上建点阵渲染器；不支持 WebGL 时返回 null。 */
export function createDotRenderer(canvas) {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
  if (!gl) return null;
  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = shader(gl.VERTEX_SHADER, VERT), fs = shader(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  const makeTex = () => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  };
  const tex = [makeTex(), makeTex()];
  const u = name => gl.getUniformLocation(prog, name);
  const U = { mix: u('u_mix'), res: u('u_res'), dpr: u('u_dpr'), origin: u('u_origin'), size: u('u_size'), step: u('u_step'), unit: u('u_unit'), soft: u('u_soft'), ink: u('u_ink') };
  gl.uniform1i(u('u_prev'), 0);
  gl.uniform1i(u('u_next'), 1);
  let texW = 0, texH = 0;
  const upload = (unit, data, cols, rows) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex[unit]);
    if (texW !== cols || texH !== rows) gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, cols, rows, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, data);
    else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.LUMINANCE, gl.UNSIGNED_BYTE, data);
  };
  return {
    get lost() { return gl.isContextLost(); },
    /** 换帧：prev / next 为 cols×rows 的亮度（约 3000 字节，两张一起传）。 */
    frames(prev, next, cols, rows) {
      if (gl.isContextLost()) return;
      upload(0, prev, cols, rows);
      upload(1, next, cols, rows);
      texW = cols; texH = rows;
    },
    /** 画一帧：mix 为两帧之间的插值，geo 为布局（CSS 像素）。 */
    draw(mix, geo) {
      if (gl.isContextLost() || !texW) return;
      gl.uniform1f(U.mix, mix);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.res, canvas.width, canvas.height);
      gl.uniform1f(U.dpr, geo.dpr);
      gl.uniform2f(U.origin, geo.ox, geo.oy);
      gl.uniform2f(U.size, geo.w, geo.h);
      gl.uniform1f(U.step, geo.step);
      gl.uniform1f(U.unit, geo.unit);
      gl.uniform1f(U.soft, geo.soft);
      gl.uniform3f(U.ink, geo.ink[0], geo.ink[1], geo.ink[2]);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}
