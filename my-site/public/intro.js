import { createAsciiFluid } from './vendor/ascii-fluid.js';

const motion = matchMedia('(prefers-reduced-motion: reduce)');
const palette = matchMedia('(prefers-color-scheme: dark)');

document.querySelectorAll('[data-fluid]').forEach(stage => {
  const canvas = stage.querySelector('canvas');
  let fluid = null;
  let visible = false;
  let pageActive = true;
  let contextAvailable = true;
  let optionsKey = '';

  function syncFluid() {
    const directory = stage.matches('dialog');
    const exposed = directory ? stage.open : visible && !document.documentElement.classList.contains('directory-open');
    const active = exposed && !document.hidden && pageActive && contextAvailable;
    if (!contextAvailable) {
      fluid?.pause();
      stage.dataset.fluidState = 'unavailable';
      delete stage.dataset.fluidReady;
      return;
    }

    const styles = getComputedStyle(stage);
    const options = {
      charset: ' .,:;-=+<>[]{}()/01abcdefxyzABCDEF#%@',
      color: styles.getPropertyValue('--ink').trim(),
      backgroundColor: styles.getPropertyValue('--paper').trim(),
      cellSize: innerWidth < 768 ? 11 : 13,
      force: 0.65,
      brush: 0.65,
      dissipation: 0.022,
      animate: !motion.matches,
      interactive: !motion.matches,
    };
    if (!fluid) {
      fluid = createAsciiFluid(canvas, options);
      fluid?.pause();
    }
    if (!fluid) {
      stage.dataset.fluidState = 'unavailable';
      return;
    }
    const nextOptionsKey = JSON.stringify(options);
    if (optionsKey !== nextOptionsKey) {
      fluid.setOptions(options);
      fluid.render();
      optionsKey = nextOptionsKey;
      stage.dataset.fluidReady = 'true';
    }
    if (!active) {
      fluid.pause();
      stage.dataset.fluidState = 'paused';
      return;
    }
    fluid.resume();
    stage.dataset.fluidState = motion.matches ? 'static' : 'running';
  }

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting && entry.intersectionRatio > 0.05;
    syncFluid();
  }, { threshold: [0, 0.05] });
  observer.observe(stage);

  new ResizeObserver(syncFluid).observe(stage);
  motion.addEventListener('change', syncFluid);
  palette.addEventListener('change', syncFluid);
  document.addEventListener('visibilitychange', syncFluid);
  window.addEventListener('directorychange', syncFluid);
  window.addEventListener('pagehide', () => {
    pageActive = false;
    syncFluid();
  });
  window.addEventListener('pageshow', () => {
    pageActive = true;
    syncFluid();
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    contextAvailable = false;
    syncFluid();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    fluid?.destroy();
    fluid = null;
    optionsKey = '';
    contextAvailable = true;
    syncFluid();
  });
  // Prepare each shared background before navigation, including the directory.
  syncFluid();
});
