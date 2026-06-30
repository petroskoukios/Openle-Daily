/* Synthesized sound effects via the Web Audio API — no asset files. Sounds are
   on by default; the mute state persists in localStorage. The audio context is
   created/resumed on the first user gesture to satisfy browser autoplay rules. */

const KEY = "ot.muted";
let muted = false;
try { muted = JSON.parse(localStorage.getItem(KEY)) === true; } catch {}

let ctx = null;
let master = null;   // shared output bus; one knob for overall loudness
const MASTER_GAIN = 1.7;
function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(ctx.destination);
    } catch { ctx = null; }
  }
  if (ctx && ctx.state === "suspended") ctx.resume();
  return ctx;
}
// Unlock audio on the first interaction so later (timer-driven) sounds can play.
const unlock = () => ensureCtx();
window.addEventListener("pointerdown", unlock, { once: true });
window.addEventListener("keydown", unlock, { once: true });

export function isMuted() { return muted; }
export function toggleMute() { muted = !muted; try { localStorage.setItem(KEY, JSON.stringify(muted)); } catch {} return muted; }

// One enveloped oscillator note: quick attack, exponential decay to silence.
function note(freq, start, dur, { type = "sine", gain = 0.2 } = {}) {
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// A short filtered-noise burst — the body of a piece landing. A low lowpass
// cutoff keeps it a dull, muffled thud rather than a crisp high tick.
function thud(start, dur, gain, cutoff) {
  const t0 = ctx.currentTime + start;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt).connect(g).connect(master);
  src.start(t0); src.stop(t0 + dur + 0.02);
}

export function play(name) {
  if (muted || !ensureCtx()) return;
  switch (name) {
    case "move":                                   // low, very muffled thud
      note(120, 0, 0.09, { type: "sine", gain: 0.12 });
      thud(0, 0.055, 0.06, 300);
      break;
    case "capture":                                // higher pitch, short click-like tap
      note(170, 0, 0.08, { type: "sine", gain: 0.13 });
      thud(0, 0.028, 0.15, 3000);
      break;
    case "win":                                    // gentle ascending arpeggio
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, i * 0.085, 0.18, { type: "sine", gain: 0.15 }));
      break;
    case "miss":                                   // soft descending two-note
      note(330, 0, 0.16, { type: "sine", gain: 0.15 });
      note(247, 0.12, 0.24, { type: "sine", gain: 0.15 });
      break;
  }
}
