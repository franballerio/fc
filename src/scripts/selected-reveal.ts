/**
 * Scroll-driven decrypt for the "FUISTE SELECCIONADO" reveal.
 *
 * The markup ships in its final, fully legible state. This script only
 * re-scrambles the decorative glyph layer while the guest scrolls, and it arms
 * itself exclusively when it can really animate (JavaScript on and motion
 * allowed); otherwise the static state stays untouched.
 *
 * A `window` registry keeps a hot reload from leaking frames or listeners, and
 * the same module owns the decrypt lifecycle event that the audio layer listens
 * to for its keystroke texture.
 */

/** Fixed scramble alphabet: no data ever reaches the DOM through markup. */
const CHARSET =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Progress at which every glyph is locked. */
const DECRYPT_END = 0.85;

/** Progress at which the tail line and the call to action show up. */
const TAIL_AT = 0.75;

/** Lifecycle event broadcast while the decrypt loop runs or stops. */
export const DECRYPT_STATE_EVENT = 'invitation:decrypt-state';

export interface DecryptState {
  running: boolean;
}

/** Latest broadcast state, replayed to late subscribers. */
let currentDecryptState: DecryptState = { running: false };

interface SelectedRevealHandle {
  destroy: () => void;
}

interface SelectedRevealWindow extends Window {
  __selectedRevealHandle?: SelectedRevealHandle;
  __selectedRevealUnloadBound?: boolean;
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  return value > 1 ? 1 : value;
}

function randomGlyph(): string {
  return CHARSET.charAt(Math.floor(Math.random() * CHARSET.length));
}

/** Broadcasts the decrypt lifecycle without leaking a typed detail contract. */
function dispatchState(running: boolean): void {
  currentDecryptState = { running };
  document.dispatchEvent(new CustomEvent<DecryptState>(DECRYPT_STATE_EVENT, { detail: currentDecryptState }));
}

/**
 * Subscribes to the decrypt lifecycle. Returns an unsubscribe function so the
 * audio layer can tear itself down without keeping a stale listener alive, and
 * replays the current state so a late subscriber never misses the start.
 */
export function subscribeDecryptState(listener: (state: DecryptState) => void): () => void {
  const handler = (event: Event): void => {
    if (!(event instanceof CustomEvent)) {
      return;
    }
    const detail: unknown = event.detail;
    if (typeof detail !== 'object' || detail === null) {
      return;
    }
    const running = (detail as Partial<DecryptState>).running;
    if (typeof running === 'boolean') {
      listener({ running });
    }
  };

  document.addEventListener(DECRYPT_STATE_EVENT, handler);
  listener(currentDecryptState);

  return () => {
    document.removeEventListener(DECRYPT_STATE_EVENT, handler);
  };
}

export function initSelectedReveal(): void {
  const host = window as SelectedRevealWindow;
  host.__selectedRevealHandle?.destroy();
  host.__selectedRevealHandle = undefined;

  const maybeRoot = document.querySelector<HTMLElement>('[data-selected-reveal]');
  if (maybeRoot === null) {
    return;
  }
  // Aliased to a non-nullable binding: TypeScript drops control-flow narrowing
  // of captured variables inside hoisted function declarations.
  const root: HTMLElement = maybeRoot;

  const glyphNodes = Array.from(root.querySelectorAll<HTMLElement>('[data-selected-glyph]'));
  if (glyphNodes.length === 0) {
    return;
  }

  // The server-rendered characters are the target text; capture them before the
  // first frame overwrites the layer with scrambled glyphs.
  const target = glyphNodes.map((node) => node.textContent ?? '');

  const animated = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animated) {
    return;
  }

  const tail = root.querySelector<HTMLElement>('[data-selected-tail]');
  const cta = root.querySelector<HTMLElement>('[data-selected-cta]');
  const meter = root.querySelector<HTMLElement>('[data-selected-meter]');
  const percent = root.querySelector<HTMLElement>('[data-selected-percent]');

  let frameId = 0;
  let running = false;
  let intersecting = false;
  let destroyed = false;

  // Armed state hides the tail and the CTA in CSS; it is set only when this
  // script will actually drive them, so the static state stays visible.
  root.dataset.selectedState = 'armed';

  function setText(node: HTMLElement | null, value: string): void {
    if (node !== null && node.textContent !== value) {
      node.textContent = value;
    }
  }

  function readProgress(): number {
    const rect = root.getBoundingClientRect();
    const scrollable = rect.height - window.innerHeight;
    if (scrollable <= 0) {
      return 1;
    }
    return clamp01(-rect.top / scrollable);
  }

  function render(progress: number): void {
    const locked = Math.min(
      target.length,
      Math.max(0, Math.floor((progress / DECRYPT_END) * target.length)),
    );

    for (let index = 0; index < glyphNodes.length; index += 1) {
      const node = glyphNodes[index];
      if (node === undefined) {
        continue;
      }
      setText(node, index < locked ? target[index] ?? '' : randomGlyph());
    }

    const rounded = Math.round(progress * 100);
    setText(percent, `${rounded}%`);
    if (meter !== null) {
      meter.style.width = `${rounded}%`;
    }

    if (progress >= TAIL_AT) {
      tail?.classList.add('is-revealed');
      cta?.classList.add('is-revealed');
    }
  }

  function frame(): void {
    frameId = 0;
    if (!running || destroyed) {
      return;
    }
    // Scroll work is coalesced here: one read of the wrapper rect per frame, all
    // DOM writes in the same frame and no scroll listener at all.
    render(readProgress());
    frameId = window.requestAnimationFrame(frame);
  }

  function start(): void {
    if (running || destroyed) {
      return;
    }
    running = true;
    if (frameId === 0) {
      frameId = window.requestAnimationFrame(frame);
    }
    dispatchState(true);
  }

  function stop(): void {
    if (!running) {
      return;
    }
    running = false;
    if (frameId !== 0) {
      window.cancelAnimationFrame(frameId);
      frameId = 0;
    }
    dispatchState(false);
  }

  function handleVisibility(): void {
    if (document.hidden) {
      stop();
      return;
    }
    if (intersecting) {
      start();
    }
  }

  const observer = new IntersectionObserver((entries) => {
    const [entry] = entries;
    if (entry === undefined || destroyed) {
      return;
    }
    intersecting = entry.isIntersecting;
    if (intersecting) {
      start();
    } else {
      stop();
    }
  });

  function destroy(): void {
    if (destroyed) {
      return;
    }
    stop();
    destroyed = true;
    observer.disconnect();
    document.removeEventListener('visibilitychange', handleVisibility);

    // Restore the static final state so a torn-down instance never leaves a
    // scrambled or half-hidden message behind.
    for (let index = 0; index < glyphNodes.length; index += 1) {
      const node = glyphNodes[index];
      if (node !== undefined) {
        setText(node, target[index] ?? '');
      }
    }
    setText(percent, '100%');
    if (meter !== null) {
      meter.style.width = '100%';
    }
    tail?.classList.add('is-revealed');
    cta?.classList.add('is-revealed');
    delete root.dataset.selectedState;
  }

  observer.observe(root);
  document.addEventListener('visibilitychange', handleVisibility);

  host.__selectedRevealHandle = { destroy };

  if (host.__selectedRevealUnloadBound !== true) {
    host.__selectedRevealUnloadBound = true;
    window.addEventListener('pagehide', () => {
      host.__selectedRevealHandle?.destroy();
      host.__selectedRevealHandle = undefined;
    });
  }
}
