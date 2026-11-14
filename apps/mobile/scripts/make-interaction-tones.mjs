// Tons d'interaction (14/11) — synthèse déterministe, 22,05 kHz mono 16 bits.
import fs from 'node:fs';
const RATE = 22050;
function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.max(-1, Math.min(1, v)) * 32767 | 0, i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
// Note : glissando f0→f1, attaque `a` s, décroissance exponentielle `tau` s, harmonique douce.
function note(out, at, dur, f0, f1, amp, a = 0.004, tau = 0.05) {
  let phase = 0;
  const n = Math.round(dur * RATE), o = Math.round(at * RATE);
  for (let i = 0; i < n; i++) {
    const t = i / RATE, k = i / n;
    const f = f0 * Math.pow(f1 / f0, Math.min(1, k * 2.2));
    phase += 2 * Math.PI * f / RATE;
    const env = Math.min(1, t / a) * Math.exp(-t / tau) * (1 - Math.pow(k, 8));
    out[o + i] = (out[o + i] || 0) + amp * env * (Math.sin(phase) + 0.18 * Math.sin(2 * phase));
  }
}
function render(total, build) { const out = new Float64Array(Math.round(total * RATE)); build(out); return Array.from(out); }
// J'aime : « pop » rond et bref, montée 520 → 980 Hz (~90 ms).
const like = render(0.11, (o) => note(o, 0, 0.11, 520, 980, 0.5, 0.003, 0.03));
// Commentaire envoyé : deux notes claires (Mi5 → La5), carillon léger (~220 ms).
const comment = render(0.24, (o) => { note(o, 0, 0.12, 659, 659, 0.34, 0.004, 0.045); note(o, 0.075, 0.165, 880, 880, 0.36, 0.004, 0.06); });
fs.writeFileSync(process.argv[2] + '/like.wav', wav(like));
fs.writeFileSync(process.argv[2] + '/comment.wav', wav(comment));
