/**
 * Lightweight, dependency-free sound effects synthesized with the Web Audio
 * API — no audio assets required. All sounds are short, soft, and optional.
 */

let ctx: AudioContext | null = null;
let muted = false;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  if (!ctx) ctx = new AudioCtor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function setMuted(value: boolean) {
  muted = value;
}

function tone(freq: number, duration: number, opts: { type?: OscillatorType; gain?: number; delay?: number } = {}) {
  if (muted) return;
  const audio = getContext();
  if (!audio) return;

  const { type = "sine", gain = 0.08, delay = 0 } = opts;
  const start = audio.currentTime + delay;

  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(g).connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function playMove(symbol: "X" | "O") {
  tone(symbol === "X" ? 620 : 520, 0.16, { type: "sine", gain: 0.07 });
}

export function playInvalid() {
  tone(180, 0.18, { type: "sawtooth", gain: 0.05 });
}

export function playTurn() {
  tone(340, 0.09, { type: "triangle", gain: 0.04 });
}

export function playWin() {
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) =>
    tone(freq, 0.32, { type: "sine", gain: 0.07, delay: i * 0.09 }),
  );
}

export function playDraw() {
  tone(300, 0.22, { type: "sine", gain: 0.05 });
  tone(240, 0.28, { type: "sine", gain: 0.05, delay: 0.1 });
}
