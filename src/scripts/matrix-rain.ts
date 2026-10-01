/**
 * Matrix-style code rain for the page background.
 *
 * The loop is started only when the feature flag allows it AND the visitor has
 * not asked for reduced motion; otherwise exactly one static frame is painted.
 * A registry on `window` keeps a hot reload from leaking loops or listeners.
 */

const CHARSET =
  'アカサタナハマヤラワガザダバパイキシチニヒミリギジビピウクスツヌフムユルグズヅブプエケセテネヘメレゲゼデベペオコソトノホモヨロゴゾドボポヴ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const FONT_SIZE = 16;
const MAX_COLUMNS = 180;
const MAX_DEVICE_PIXEL_RATIO = 2;
const TRAIL_ALPHA = 0.09;
const RESIZE_DEBOUNCE_MS = 150;
const RESPAWN_CHANCE = 0.975;

interface MatrixRainHandle {
  destroy: () => void;
}

interface MatrixRainWindow extends Window {
  /** Handles keyed by canvas so a hot reload can tear down the previous run. */
  __matrixRainHandles?: Map<HTMLCanvasElement, MatrixRainHandle>;
  __matrixRainUnloadBound?: boolean;
}

function matrixRainWindow(): MatrixRainWindow {
  return window as MatrixRainWindow;
}

function getRegistry(): Map<HTMLCanvasElement, MatrixRainHandle> {
  const host = matrixRainWindow();
  host.__matrixRainHandles ??= new Map<HTMLCanvasElement, MatrixRainHandle>();
  return host.__matrixRainHandles;
}

function readToken(source: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = source.getPropertyValue(name).trim();
  return value.length > 0 ? value : fallback;
}

function createMatrixRain(canvas: HTMLCanvasElement): MatrixRainHandle | null {
  const maybeContext = canvas.getContext('2d');
  if (maybeContext === null) {
    return null;
  }
  // Aliased to a non-nullable binding: TypeScript drops control-flow narrowing
  // of captured variables inside hoisted function declarations.
  const context: CanvasRenderingContext2D = maybeContext;

  const tokens = getComputedStyle(document.documentElement);
  const voidColor = readToken(tokens, '--void', '#030704');
  const phosphor = readToken(tokens, '--phos', '#33ff66');
  const fontStack = readToken(tokens, '--font-mono', 'monospace');

  const animated =
    canvas.dataset.enabled !== 'false' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let columns = 0;
  let drops: number[] = [];
  let ratio = 1;
  let frameId = 0;
  let resizeTimer = 0;
  let running = false;
  let destroyed = false;

  function sizeCanvas(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    ratio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    canvas.width = Math.max(1, Math.floor(width * ratio));
    canvas.height = Math.max(1, Math.floor(height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.font = `${FONT_SIZE}px ${fontStack}`;
    context.textBaseline = 'top';
    context.fillStyle = voidColor;
    context.fillRect(0, 0, width, height);
  }

  function resetColumns(): void {
    const nextColumns = Math.min(Math.floor(window.innerWidth / FONT_SIZE), MAX_COLUMNS);
    columns = Math.max(1, nextColumns);
    drops = Array.from({ length: columns }, () => Math.random() * -40);
  }

  function drawGlyph(x: number, y: number): void {
    const character = CHARSET.charAt(Math.floor(Math.random() * CHARSET.length));
    context.fillStyle = phosphor;
    context.fillText(character, x, y);
  }

  function step(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Translucent void wash: old glyphs fade instead of being erased, which is
    // what produces the trailing effect.
    context.globalAlpha = TRAIL_ALPHA;
    context.fillStyle = voidColor;
    context.fillRect(0, 0, width, height);
    context.globalAlpha = 1;

    for (let column = 0; column < columns; column += 1) {
      const y = drops[column] * FONT_SIZE;
      if (y >= -FONT_SIZE) {
        drawGlyph(column * FONT_SIZE, y);
      }

      if (y > height && Math.random() > RESPAWN_CHANCE) {
        drops[column] = 0;
      } else {
        drops[column] += 1;
      }
    }
  }

  function loop(): void {
    if (!running) {
      return;
    }
    step();
    frameId = window.requestAnimationFrame(loop);
  }

  function start(): void {
    if (running || destroyed) {
      return;
    }
    running = true;
    frameId = window.requestAnimationFrame(loop);
  }

  function stop(): void {
    running = false;
    if (frameId !== 0) {
      window.cancelAnimationFrame(frameId);
      frameId = 0;
    }
  }

  function renderStaticFrame(): void {
    sizeCanvas();
    resetColumns();
    const height = window.innerHeight;
    for (let column = 0; column < columns; column += 1) {
      const runLength = 2 + Math.floor(Math.random() * 6);
      const maxStart = Math.max(0, Math.floor(height / FONT_SIZE) - runLength);
      const startRow = Math.floor(Math.random() * maxStart);
      for (let row = 0; row < runLength; row += 1) {
        context.globalAlpha = 0.2 + (row / runLength) * 0.7;
        drawGlyph(column * FONT_SIZE, (startRow + row) * FONT_SIZE);
      }
    }
    context.globalAlpha = 1;
  }

  function handleResize(): void {
    sizeCanvas();
    resetColumns();
    if (!animated) {
      renderStaticFrame();
    }
  }

  function handleVisibility(): void {
    if (document.hidden) {
      stop();
      return;
    }
    if (animated) {
      start();
    }
  }

  const observer = new ResizeObserver(() => {
    if (destroyed) {
      return;
    }
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      resizeTimer = 0;
      if (!destroyed) {
        handleResize();
      }
    }, RESIZE_DEBOUNCE_MS);
  });

  function destroy(): void {
    if (destroyed) {
      return;
    }
    destroyed = true;
    stop();
    window.clearTimeout(resizeTimer);
    resizeTimer = 0;
    observer.disconnect();
    document.removeEventListener('visibilitychange', handleVisibility);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  observer.observe(document.documentElement);
  document.addEventListener('visibilitychange', handleVisibility);

  if (animated) {
    handleResize();
    start();
  } else {
    renderStaticFrame();
  }

  return { destroy };
}

export function initMatrixRain(): void {
  const registry = getRegistry();
  const canvases = document.querySelectorAll<HTMLCanvasElement>('canvas[data-matrix-rain]');

  canvases.forEach((canvas) => {
    registry.get(canvas)?.destroy();
    const handle = createMatrixRain(canvas);
    if (handle === null) {
      registry.delete(canvas);
      return;
    }
    registry.set(canvas, handle);
  });

  const host = matrixRainWindow();
  if (host.__matrixRainUnloadBound !== true) {
    host.__matrixRainUnloadBound = true;
    window.addEventListener('pagehide', () => {
      const handles = getRegistry();
      handles.forEach((handle) => handle.destroy());
      handles.clear();
    });
  }
}
