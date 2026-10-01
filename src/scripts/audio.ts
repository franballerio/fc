/**
 * Optional synthesized ambience for the invitation.
 *
 * Everything is generated with the Web Audio API: a low drone bed, a short boot
 * blip on the first enable and filtered-noise keystrokes while the decrypt runs.
 * No audio file, no network request. The context is created inside the click
 * handler only, so the page stays muted until the guest asks for sound.
 */

import { subscribeDecryptState } from './selected-reveal';

/** Low ceiling: this is background texture, not a soundtrack. */
const MASTER_GAIN = 0.1;

/**
 * Time constants for the smooth gain approaches. Every gain move is scheduled,
 * never stepped, so enabling and disabling never click. The master comes up fast
 * (the boot blip must be audible immediately) while the drone fades in under it.
 */
const MASTER_RAMP_UP_TAU = 0.04;
const MASTER_RAMP_DOWN_TAU = 0.16;
const DRONE_RAMP_UP_TAU = 0.5;
const DRONE_RAMP_DOWN_TAU = 0.3;

const KEYSTROKE_INTERVAL_MS = 90;
const SUSPEND_DELAY_MS = 500;
const NOISE_SECONDS = 1;

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

  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let droneGain: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let keystrokeTimer = 0;
  let suspendTimer = 0;
  let enabled = false;
  let decryptRunning = false;
  let destroyed = false;

  function paint(): void {
    button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    if (labelOn !== null) {
      labelOn.hidden = !enabled;
    }
    if (labelOff !== null) {
      labelOff.hidden = enabled;
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
   * toggles so re-enabling never restarts them abruptly.
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
    // Starts silent and is ramped up, so enabling never clicks.
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
    if (keystrokeTimer !== 0 || !enabled || !decryptRunning) {
      return;
    }
    keystrokeTimer = window.setInterval(() => {
      const audio = context;
      const output = master;
      if (!enabled || audio === null || output === null || audio.state !== 'running') {
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

  function enable(): void {
    const audio = ensureGraph();
    const output = master;
    const bed = droneGain;
    if (audio === null || output === null || bed === null || destroyed) {
      return;
    }

    const start = async (): Promise<void> => {
      // Resuming must happen inside the gesture; the context was created here.
      if (audio.state !== 'running') {
        try {
          await audio.resume();
        } catch {
          return;
        }
      }
      if (destroyed) {
        return;
      }

      const now = audio.currentTime;
      output.gain.cancelScheduledValues(now);
      output.gain.setTargetAtTime(MASTER_GAIN, now, MASTER_RAMP_UP_TAU);
      bed.gain.cancelScheduledValues(now);
      bed.gain.setTargetAtTime(1, now, DRONE_RAMP_UP_TAU);

      enabled = true;
      paint();
      playBootBlip(audio, output);
      startKeystrokes();
    };

    void start();
  }

  function disable(): void {
    enabled = false;
    stopKeystrokes();
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
      if (!enabled && audio.state === 'running') {
        audio.suspend().catch(() => undefined);
      }
    }, SUSPEND_DELAY_MS);
  }

  function handleClick(): void {
    if (enabled) {
      disable();
      return;
    }
    enable();
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

    // Only resume when the guest left the audio on.
    if (enabled && audio.state === 'suspended') {
      audio.resume().catch(() => undefined);
    }
  }

  const unsubscribeDecrypt = subscribeDecryptState((state) => {
    decryptRunning = state.running;
    if (enabled && decryptRunning) {
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
    enabled = false;
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
  paint();

  host.__audioToggleHandle = { destroy };

  if (host.__audioToggleUnloadBound !== true) {
    host.__audioToggleUnloadBound = true;
    window.addEventListener('pagehide', () => {
      host.__audioToggleHandle?.destroy();
      host.__audioToggleHandle = undefined;
    });
  }
}
