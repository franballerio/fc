/**
 * Synthesized ambience for the invitation, on by default.
 *
 * Everything is generated with the Web Audio API: a low drone bed, a short boot
 * blip on every start and filtered-noise keystrokes while the decrypt runs.
 * No audio file, no network request. Browsers refuse to start audio outside a
 * user gesture, so the control ships pressed and the graph is built
 * synchronously inside the guest's first pointerdown or keydown.
 */

import { subscribeDecryptState } from './selected-reveal';

/** Low ceiling: this is background texture, not a soundtrack. */
const MASTER_GAIN = 0.1;

/**
 * Time constants for the smooth gain approaches. Every gain move is scheduled,
 * never stepped, so starting and stopping never click. The master comes up fast
 * (the boot blip must be audible immediately) while the drone fades in under it.
 */
const MASTER_RAMP_UP_TAU = 0.04;
const MASTER_RAMP_DOWN_TAU = 0.16;
const DRONE_RAMP_UP_TAU = 0.5;
const DRONE_RAMP_DOWN_TAU = 0.3;

const KEYSTROKE_INTERVAL_MS = 90;
const SUSPEND_DELAY_MS = 500;
/** Upper bound for a resume() to settle before the control admits it is silent. */
const ACTIVATION_TIMEOUT_MS = 1000;
const NOISE_SECONDS = 1;

/**
 * Control state, mirrored on the button as `data-audio-state`:
 * - `pending`: on, waiting for the guest's first gesture.
 * - `running`: the context is live and the drone is audible.
 * - `off`: the guest silenced it.
 * - `blocked`: activation was attempted and the browser refused.
 * `aria-pressed` is true for `pending`/`running` and false for `off`/`blocked`.
 */
type AudioState = 'pending' | 'running' | 'off' | 'blocked';

interface AudioToggleHandle {
  destroy: () => void;
}

interface AudioToggleWindow extends Window {
  __audioToggleHandle?: AudioToggleHandle;
  __audioToggleUnloadBound?: boolean;
}

interface DroneVoice {
  type: OscillatorType;
  frequency: number;
  detune: number;
  level: number;
}

const DRONE_VOICES: DroneVoice[] = [
  { type: 'sine', frequency: 55, detune: 0, level: 0.5 },
  { type: 'sine', frequency: 82.5, detune: -7, level: 0.26 },
  { type: 'triangle', frequency: 110, detune: 11, level: 0.1 },
];

export function initAudioToggle(): void {
  const host = window as AudioToggleWindow;
  host.__audioToggleHandle?.destroy();
  host.__audioToggleHandle = undefined;

  const maybeButton = document.querySelector<HTMLButtonElement>('[data-audio-toggle]');
  if (maybeButton === null) {
    return;
  }
  // Aliased to a non-nullable binding: TypeScript drops control-flow narrowing
  // of captured variables inside hoisted function declarations.
  const button: HTMLButtonElement = maybeButton;

  const labelOn = document.querySelector<HTMLElement>('[data-audio-toggle-on]');
  const labelOff = document.querySelector<HTMLElement>('[data-audio-toggle-off]');
  const hint = document.querySelector<HTMLElement>('[data-audio-toggle-hint]');

  let state: AudioState = 'pending';
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let droneGain: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let keystrokeTimer = 0;
  let suspendTimer = 0;
  let decryptRunning = false;
  let destroyed = false;
  let activationArmed = false;
  // Incremented on every start attempt and on every silence, so a late
  // resume() resolution can never resurrect sound the guest has turned off.
  let attemptId = 0;

  function paint(): void {
    button.dataset.audioState = state;
    button.setAttribute(
      'aria-pressed',
      state === 'pending' || state === 'running' ? 'true' : 'false',
    );
    const audible = state === 'pending' || state === 'running';
    if (labelOn !== null) {
      labelOn.hidden = !audible;
    }
    if (labelOff !== null) {
      labelOff.hidden = audible;
    }
    if (hint !== null) {
      // The hint is the control's accessible description: it explains that the
      // drone is armed but silent until the first gesture. It stays visible
      // while that is true and leaves only once the outcome is known, i.e. the
      // context is confirmed `running` or the attempt ended in `off`/`blocked`.
      hint.hidden = state === 'running' || state === 'off' || state === 'blocked';
    }
  }

  function getNoiseBuffer(audio: AudioContext): AudioBuffer {
    if (noiseBuffer !== null) {
      return noiseBuffer;
    }
    const frames = Math.floor(audio.sampleRate * NOISE_SECONDS);
    const buffer = audio.createBuffer(1, frames, audio.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < frames; index += 1) {
      channel[index] = Math.random() * 2 - 1;
    }
    noiseBuffer = buffer;
    return buffer;
  }

  /**
   * Builds the context, the master gain and the drone chain once, inside the
   * gesture handler. The drone oscillators stay alive at zero gain between
   * stops so restarting never brings them up abruptly.
   */
  function ensureGraph(): AudioContext | null {
    if (context !== null) {
      return context;
    }

    // Older or audio-disabled environments simply keep the invitation silent.
    if (typeof window.AudioContext === 'undefined') {
      return null;
    }

    const audio = new AudioContext();
    const output = audio.createGain();
    // Starts silent and is ramped up, so starting never clicks.
    output.gain.value = 0;
    output.connect(audio.destination);

    const now = audio.currentTime;
    const filter = audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(340, now);
    filter.Q.setValueAtTime(0.8, now);

    const bed = audio.createGain();
    bed.gain.setValueAtTime(0, now);
    filter.connect(bed);
    bed.connect(output);

    DRONE_VOICES.forEach((voice) => {
      const oscillator = audio.createOscillator();
      oscillator.type = voice.type;
      oscillator.frequency.setValueAtTime(voice.frequency, now);
      oscillator.detune.setValueAtTime(voice.detune, now);

      const level = audio.createGain();
      level.gain.setValueAtTime(voice.level, now);

      oscillator.connect(level);
      level.connect(filter);
      oscillator.start(now);
    });

    context = audio;
    master = output;
    droneGain = bed;
    return audio;
  }

  function playBootBlip(audio: AudioContext, output: GainNode): void {
    const now = audio.currentTime;
    const oscillator = audio.createOscillator();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(180, now);
    oscillator.frequency.exponentialRampToValueAtTime(760, now + 0.14);

    const envelope = audio.createGain();
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(0.5, now + 0.02);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    oscillator.connect(envelope);
    envelope.connect(output);
    oscillator.start(now);
    oscillator.stop(now + 0.22);
  }

  function playKeystroke(audio: AudioContext, output: GainNode): void {
    const now = audio.currentTime;

    const source = audio.createBufferSource();
    source.buffer = getNoiseBuffer(audio);

    const filter = audio.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(700 + Math.random() * 1800, now);
    filter.Q.setValueAtTime(1.4, now);

    const envelope = audio.createGain();
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(0.3, now + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(output);
    source.start(now);
    source.stop(now + 0.05);
  }

  function startKeystrokes(): void {
    if (keystrokeTimer !== 0 || state !== 'running' || !decryptRunning) {
      return;
    }
    keystrokeTimer = window.setInterval(() => {
      const audio = context;
      const output = master;
      if (state !== 'running' || audio === null || output === null || audio.state !== 'running') {
        return;
      }
      playKeystroke(audio, output);
    }, KEYSTROKE_INTERVAL_MS);
  }

  function stopKeystrokes(): void {
    if (keystrokeTimer === 0) {
      return;
    }
    window.clearInterval(keystrokeTimer);
    keystrokeTimer = 0;
  }

  function clearSuspendTimer(): void {
    if (suspendTimer === 0) {
      return;
    }
    window.clearTimeout(suspendTimer);
    suspendTimer = 0;
  }

  /**
   * Ramps the drone up and fires the boot blip. Called only once the context is
   * confirmed running, so it never schedules into a suspended graph.
   */
  function startPlayback(audio: AudioContext, output: GainNode, bed: GainNode): void {
    const now = audio.currentTime;
    output.gain.cancelScheduledValues(now);
    output.gain.setTargetAtTime(MASTER_GAIN, now, MASTER_RAMP_UP_TAU);
    bed.gain.cancelScheduledValues(now);
    bed.gain.setTargetAtTime(1, now, DRONE_RAMP_UP_TAU);
    playBootBlip(audio, output);
    startKeystrokes();
  }

  /**
   * Resumes the context and confirms it actually reached `running`. A resume()
   * can settle while the context stays suspended, so the outcome follows the
   * context, never the promise: anything short of `running` is `blocked`, the
   * only state that admits the sound is not playing. `stillCurrent` drops a
   * settlement a newer attempt or an explicit silence already outran, and
   * `onRunning` runs only for a confirmed live context.
   */
  function confirmRunning(
    audio: AudioContext,
    stillCurrent: () => boolean,
    onRunning?: () => void,
  ): void {
    void audio
      .resume()
      .then(() => {
        if (!stillCurrent()) {
          return;
        }
        if (audio.state !== 'running') {
          state = 'blocked';
          paint();
          return;
        }
        if (onRunning !== undefined) {
          onRunning();
        }
      })
      .catch(() => {
        if (!stillCurrent()) {
          return;
        }
        state = 'blocked';
        paint();
      });
  }

  /**
   * Builds and resumes the graph inside the current gesture. The AudioContext
   * constructor and the resume() call are synchronous; only the confirmation
   * that the context reached `running` is deferred.
   */
  function startFromGesture(): void {
    const audio = ensureGraph();
    const output = master;
    const bed = droneGain;
    if (audio === null || output === null || bed === null) {
      state = 'blocked';
      paint();
      return;
    }

    attemptId += 1;
    const id = attemptId;

    // A resume() that neither resolves nor rejects (the gesture was not
    // accepted as user activation, for example) must not leave the control
    // frozen on `pending`. The bound reuses the suspend-timer slot so destroy()
    // clears it, and the attempt id stops it from touching a newer state.
    clearSuspendTimer();
    suspendTimer = window.setTimeout(() => {
      suspendTimer = 0;
      if (destroyed || id !== attemptId || state !== 'pending') {
        return;
      }
      state = 'blocked';
      paint();
    }, ACTIVATION_TIMEOUT_MS);

    confirmRunning(
      audio,
      () => !destroyed && id === attemptId,
      () => {
        clearSuspendTimer();
        state = 'running';
        paint();
        startPlayback(audio, output, bed);
      },
    );
  }

  /** Explicit silence: cancels any pending or in-flight activation. */
  function silence(): void {
    attemptId += 1;
    disarmActivation();
    stopKeystrokes();
    state = 'off';
    paint();

    const audio = context;
    const output = master;
    const bed = droneGain;
    if (audio === null || output === null || bed === null) {
      return;
    }

    const now = audio.currentTime;
    output.gain.cancelScheduledValues(now);
    output.gain.setTargetAtTime(0, now, MASTER_RAMP_DOWN_TAU);
    bed.gain.cancelScheduledValues(now);
    bed.gain.setTargetAtTime(0, now, DRONE_RAMP_DOWN_TAU);

    // Suspend only after the fade so the stop is silent, never a click.
    clearSuspendTimer();
    suspendTimer = window.setTimeout(() => {
      suspendTimer = 0;
      if (state !== 'running' && audio.state === 'running') {
        audio.suspend().catch(() => undefined);
      }
    }, SUSPEND_DELAY_MS);
  }

  function handleClick(): void {
    // Pending means the guest silenced the invitation before it made a sound:
    // never build a context from this gesture.
    if (state === 'pending' || state === 'running') {
      silence();
      return;
    }
    startFromGesture();
  }

  function handleVisibility(): void {
    const audio = context;
    if (audio === null) {
      return;
    }

    if (document.hidden) {
      if (audio.state === 'running') {
        audio.suspend().catch(() => undefined);
      }
      return;
    }

    // Only act when the guest left the audio on and the context is not live.
    // Anything short of `running` shares the gesture path's confirmation, so a
    // rejected, still-suspended or already-closed context falls to `blocked`
    // instead of leaving the control claiming sound it cannot produce.
    if (state !== 'running' || audio.state === 'running') {
      return;
    }

    if (audio.state === 'closed') {
      // A closed context can never play again, so resume() would only reject.
      state = 'blocked';
      paint();
      return;
    }

    confirmRunning(audio, () => !destroyed && state === 'running');
  }

  function isToggleGesture(event: Event): boolean {
    const target = event.target;
    return target instanceof Node && button.contains(target);
  }

  function handleFirstGesture(event: Event): void {
    // The toggle's own gesture belongs to the click handler, which may mean
    // "silence": never start sound from it.
    if (isToggleGesture(event)) {
      return;
    }
    disarmActivation();
    if (destroyed || state !== 'pending') {
      return;
    }
    startFromGesture();
  }

  function armActivation(): void {
    if (activationArmed) {
      return;
    }
    activationArmed = true;
    document.addEventListener('pointerdown', handleFirstGesture, { capture: true, passive: true });
    document.addEventListener('keydown', handleFirstGesture, { capture: true, passive: true });
  }

  function disarmActivation(): void {
    if (!activationArmed) {
      return;
    }
    activationArmed = false;
    document.removeEventListener('pointerdown', handleFirstGesture, { capture: true });
    document.removeEventListener('keydown', handleFirstGesture, { capture: true });
  }

  const unsubscribeDecrypt = subscribeDecryptState((next) => {
    decryptRunning = next.running;
    if (state === 'running' && decryptRunning) {
      startKeystrokes();
      return;
    }
    stopKeystrokes();
  });

  function destroy(): void {
    if (destroyed) {
      return;
    }
    destroyed = true;
    attemptId += 1;
    disarmActivation();
    stopKeystrokes();
    clearSuspendTimer();
    document.removeEventListener('visibilitychange', handleVisibility);
    button.removeEventListener('click', handleClick);
    unsubscribeDecrypt();

    const audio = context;
    if (audio !== null && audio.state !== 'closed') {
      audio.close().catch(() => undefined);
    }

    context = null;
    master = null;
    droneGain = null;
    noiseBuffer = null;
  }

  button.addEventListener('click', handleClick);
  document.addEventListener('visibilitychange', handleVisibility);

  // Without the constructor no gesture can ever start audio, so say so at once
  // instead of showing a pending invitation that will never sound.
  state = typeof window.AudioContext === 'undefined' ? 'blocked' : 'pending';
  if (state === 'pending') {
    armActivation();
  }
  paint();

  host.__audioToggleHandle = { destroy };

  if (host.__audioToggleUnloadBound !== true) {
    host.__audioToggleUnloadBound = true;
    window.addEventListener('pagehide', (event) => {
      // A back/forward-cache navigation must keep the live control: nothing
      // re-initialises on restore, so tearing the graph down here would leave
      // the button claiming sound it can no longer produce.
      if (event.persisted) {
        return;
      }
      host.__audioToggleHandle?.destroy();
      host.__audioToggleHandle = undefined;
    });
  }
}
