/**
 * Event countdown.
 *
 * One shared interval ticks every countdown root on the page and is paused
 * while the document is hidden. The ticking boxes are decorative: the readable
 * date lives in a static sentence rendered by the component, so no assistive
 * technology ever hears a per-second update.
 */

const TICK_MS = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

/**
 * Neutral finished state, used both for a past date and for an unparseable one,
 * so the page never renders negative or `NaN` counters.
 */
const FINISHED_MESSAGE = 'El operativo ya está en marcha.';

interface CountdownParts {
  days: HTMLElement | null;
  hours: HTMLElement | null;
  minutes: HTMLElement | null;
  seconds: HTMLElement | null;
}

interface CountdownEntry {
  board: HTMLElement | null;
  finished: HTMLElement | null;
  finishedRendered: boolean;
  parts: CountdownParts;
  /** Absolute instant in milliseconds, or NaN when the config is unusable. */
  targetMs: number;
}

interface CountdownController {
  destroy: () => void;
}

interface CountdownWindow extends Window {
  __countdownController?: CountdownController;
  __countdownUnloadBound?: boolean;
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function findPart(root: HTMLElement, unit: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-countdown-unit="${unit}"]`);
}

function createEntry(root: HTMLElement): CountdownEntry {
  const iso = root.dataset.countdownTarget ?? '';

  return {
    board: root.querySelector<HTMLElement>('[data-countdown-board]'),
    finished: root.querySelector<HTMLElement>('[data-countdown-finished]'),
    finishedRendered: false,
    parts: {
      days: findPart(root, 'days'),
      hours: findPart(root, 'hours'),
      minutes: findPart(root, 'minutes'),
      seconds: findPart(root, 'seconds'),
    },
    // `dateISO` carries an explicit numeric UTC offset, so parsing yields the
    // absolute instant directly; the offset must not be applied a second time.
    targetMs: iso === '' ? Number.NaN : Date.parse(iso),
  };
}

function setText(node: HTMLElement | null, value: string): void {
  if (node !== null && node.textContent !== value) {
    node.textContent = value;
  }
}

function renderFinished(entry: CountdownEntry): void {
  if (entry.finishedRendered) {
    return;
  }
  entry.finishedRendered = true;
  entry.board?.classList.add('is-finished');
  setText(entry.finished, FINISHED_MESSAGE);
  if (entry.finished !== null) {
    entry.finished.hidden = false;
  }
}

function renderEntry(entry: CountdownEntry): void {
  const remaining = entry.targetMs - Date.now();
  if (!Number.isFinite(entry.targetMs) || !Number.isFinite(remaining) || remaining <= 0) {
    renderFinished(entry);
    return;
  }

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY));
  const hours = Math.floor((totalSeconds / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR)) % HOURS_PER_DAY);
  const minutes = Math.floor((totalSeconds / SECONDS_PER_MINUTE) % MINUTES_PER_HOUR);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;

  setText(entry.parts.days, pad(days));
  setText(entry.parts.hours, pad(hours));
  setText(entry.parts.minutes, pad(minutes));
  setText(entry.parts.seconds, pad(seconds));
}

export function initCountdown(): void {
  const host = window as CountdownWindow;
  host.__countdownController?.destroy();
  host.__countdownController = undefined;

  const roots = Array.from(document.querySelectorAll<HTMLElement>('[data-countdown]'));
  if (roots.length === 0) {
    return;
  }
  const entries = roots.map(createEntry);

  let timerId = 0;

  function tick(): void {
    entries.forEach(renderEntry);
  }

  function start(): void {
    if (timerId !== 0) {
      return;
    }
    tick();
    timerId = window.setInterval(tick, TICK_MS);
  }

  function stop(): void {
    if (timerId === 0) {
      return;
    }
    window.clearInterval(timerId);
    timerId = 0;
  }

  function handleVisibility(): void {
    if (document.hidden) {
      stop();
      return;
    }
    start();
  }

  function destroy(): void {
    stop();
    document.removeEventListener('visibilitychange', handleVisibility);
  }

  document.addEventListener('visibilitychange', handleVisibility);
  start();

  host.__countdownController = { destroy };

  if (host.__countdownUnloadBound !== true) {
    host.__countdownUnloadBound = true;
    window.addEventListener('pagehide', () => {
      host.__countdownController?.destroy();
      host.__countdownController = undefined;
    });
  }
}
