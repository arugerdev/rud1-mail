"use client";

import type { SoundId } from "@/lib/sound-catalog";

/**
 * Los sonidos de rud1 Mail, generados al momento con Web Audio (sin
 * archivos). Cada uno programa sus notas a partir de `t` sobre `out`, que ya
 * lleva el volumen aplicado.
 */

type Synth = (ctx: AudioContext, out: AudioNode, t: number) => void;

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  try {
    if (!context) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      context = new Ctx();
    }
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null;
  }
}

/** Una nota con ataque y caída exponencial. */
function tone(
  ctx: AudioContext,
  out: AudioNode,
  {
    freq,
    start,
    duration,
    type = "sine",
    gain = 0.25,
    attack = 0.008,
    glideTo,
  }: { freq: number; start: number; duration: number; type?: OscillatorType; gain?: number; attack?: number; glideTo?: number },
): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + duration * 0.8);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(env).connect(out);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

/** Campana por modulación de frecuencia (FM): metálica y limpia. */
function bell(ctx: AudioContext, out: AudioNode, freq: number, start: number, duration: number, gain = 0.22, ratio = 3.5, depth = 2.2): void {
  const carrier = ctx.createOscillator();
  const modulator = ctx.createOscillator();
  const modGain = ctx.createGain();
  const env = ctx.createGain();
  carrier.frequency.value = freq;
  modulator.frequency.value = freq * ratio;
  modGain.gain.setValueAtTime(freq * depth, start);
  modGain.gain.exponentialRampToValueAtTime(1, start + duration);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  modulator.connect(modGain).connect(carrier.frequency);
  carrier.connect(env).connect(out);
  modulator.start(start);
  carrier.start(start);
  modulator.stop(start + duration + 0.05);
  carrier.stop(start + duration + 0.05);
}

/** Golpe tipo marimba: fundamental y un armónico que se apaga antes. */
function mallet(ctx: AudioContext, out: AudioNode, freq: number, start: number, gain = 0.24, duration = 0.55): void {
  tone(ctx, out, { freq, start, duration, gain, attack: 0.004 });
  tone(ctx, out, { freq: freq * 4, start, duration: duration * 0.25, gain: gain * 0.35, attack: 0.002 });
}

/** Ruido filtrado: clics, soplidos, teclas. */
function noise(
  ctx: AudioContext,
  out: AudioNode,
  { start, duration, freq, q = 1, gain = 0.3, type = "bandpass", sweepTo }: { start: number; duration: number; freq: number; q?: number; gain?: number; type?: BiquadFilterType; sweepTo?: number },
): void {
  const length = Math.ceil(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, start);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, start + duration);
  filter.Q.value = q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.02, duration / 4));
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(filter).connect(env).connect(out);
  src.start(start);
  src.stop(start + duration + 0.02);
}

const SYNTHS: Record<Exclude<SoundId, "personalizado" | "ninguno">, Synth> = {
  // --- Moderno ---
  destello: (ctx, out, t) => {
    tone(ctx, out, { freq: 880, start: t, duration: 0.35, gain: 0.2 });
    tone(ctx, out, { freq: 1320, start: t + 0.09, duration: 0.4, gain: 0.2 });
  },
  burbuja: (ctx, out, t) => {
    tone(ctx, out, { freq: 420, glideTo: 1250, start: t, duration: 0.16, gain: 0.3 });
    tone(ctx, out, { freq: 650, glideTo: 1700, start: t + 0.11, duration: 0.14, gain: 0.18 });
  },
  pulso: (ctx, out, t) => {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1800;
    lp.connect(out);
    tone(ctx, lp, { freq: 660, start: t, duration: 0.22, type: "triangle", gain: 0.3 });
    tone(ctx, lp, { freq: 990, start: t + 0.14, duration: 0.3, type: "triangle", gain: 0.26 });
  },
  brillo: (ctx, out, t) => {
    [1047, 1319, 1568, 2093].forEach((f, i) => tone(ctx, out, { freq: f, start: t + i * 0.06, duration: 0.32, gain: 0.14 }));
  },
  envio: (ctx, out, t) => {
    noise(ctx, out, { start: t, duration: 0.42, freq: 500, sweepTo: 4200, q: 0.9, gain: 0.32 });
    tone(ctx, out, { freq: 1568, start: t + 0.3, duration: 0.25, gain: 0.08 });
  },

  // --- Estilo Apple (suaves, de cristal y madera) ---
  cristal: (ctx, out, t) => {
    tone(ctx, out, { freq: 2093, start: t, duration: 1.2, gain: 0.16, attack: 0.003 });
    tone(ctx, out, { freq: 4186, start: t, duration: 0.5, gain: 0.05, attack: 0.003 });
    tone(ctx, out, { freq: 6279, start: t, duration: 0.25, gain: 0.025, attack: 0.002 });
  },
  campanita: (ctx, out, t) => {
    bell(ctx, out, 1175, t, 1.1, 0.18, 3.5, 1.6);
    bell(ctx, out, 1568, t + 0.12, 1.0, 0.13, 3.5, 1.4);
  },
  nota: (ctx, out, t) => mallet(ctx, out, 784, t, 0.28, 0.7),
  "tres-notas": (ctx, out, t) => {
    mallet(ctx, out, 784, t, 0.24);
    mallet(ctx, out, 988, t + 0.13, 0.24);
    mallet(ctx, out, 1175, t + 0.26, 0.26, 0.8);
  },
  "aviso-suave": (ctx, out, t) => {
    tone(ctx, out, { freq: 1046, start: t, duration: 0.5, gain: 0.14, attack: 0.03 });
    tone(ctx, out, { freq: 1568, start: t + 0.05, duration: 0.6, gain: 0.08, attack: 0.04 });
  },

  // --- Retro (8 bits) ---
  moneda: (ctx, out, t) => {
    tone(ctx, out, { freq: 988, start: t, duration: 0.09, type: "square", gain: 0.12, attack: 0.002 });
    tone(ctx, out, { freq: 1319, start: t + 0.08, duration: 0.4, type: "square", gain: 0.12, attack: 0.002 });
  },
  arcade: (ctx, out, t) => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(ctx, out, { freq: f, start: t + i * 0.055, duration: 0.09, type: "square", gain: 0.1, attack: 0.002 }));
  },
  bip: (ctx, out, t) => {
    tone(ctx, out, { freq: 1000, start: t, duration: 0.08, type: "square", gain: 0.11, attack: 0.002 });
    tone(ctx, out, { freq: 1000, start: t + 0.14, duration: 0.08, type: "square", gain: 0.11, attack: 0.002 });
  },
  "power-up": (ctx, out, t) => {
    tone(ctx, out, { freq: 300, glideTo: 1400, start: t, duration: 0.38, type: "square", gain: 0.1, attack: 0.003 });
    tone(ctx, out, { freq: 450, glideTo: 2100, start: t + 0.04, duration: 0.36, type: "triangle", gain: 0.08, attack: 0.003 });
  },
  "error-retro": (ctx, out, t) => {
    tone(ctx, out, { freq: 330, start: t, duration: 0.16, type: "square", gain: 0.11, attack: 0.003 });
    tone(ctx, out, { freq: 220, start: t + 0.17, duration: 0.3, type: "square", gain: 0.11, attack: 0.003 });
  },

  // --- Clásico ---
  timbre: (ctx, out, t) => {
    bell(ctx, out, 659, t, 0.9, 0.2, 2, 0.9);
    bell(ctx, out, 523, t + 0.32, 1.2, 0.2, 2, 0.9);
  },
  campana: (ctx, out, t) => bell(ctx, out, 523, t, 2.0, 0.22, 1.4, 3),
  maquina: (ctx, out, t) => {
    [0, 0.09, 0.16].forEach((d) => noise(ctx, out, { start: t + d, duration: 0.03, freq: 2500, q: 3, gain: 0.35 }));
    bell(ctx, out, 2093, t + 0.3, 0.9, 0.12, 2.76, 1.2);
  },

  // --- Natural ---
  gota: (ctx, out, t) => {
    tone(ctx, out, { freq: 1400, glideTo: 520, start: t, duration: 0.18, gain: 0.3, attack: 0.002 });
    tone(ctx, out, { freq: 900, glideTo: 1100, start: t + 0.12, duration: 0.12, gain: 0.08 });
  },
  madera: (ctx, out, t) => {
    tone(ctx, out, { freq: 1180, start: t, duration: 0.07, gain: 0.32, attack: 0.001 });
    noise(ctx, out, { start: t, duration: 0.04, freq: 1800, q: 6, gain: 0.2 });
    tone(ctx, out, { freq: 880, start: t + 0.12, duration: 0.07, gain: 0.26, attack: 0.001 });
  },
  clic: (ctx, out, t) => noise(ctx, out, { start: t, duration: 0.035, freq: 3200, q: 2, gain: 0.45 }),
  vibracion: (ctx, out, t) => {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 400;
    lp.connect(out);
    tone(ctx, lp, { freq: 150, start: t, duration: 0.2, type: "square", gain: 0.35, attack: 0.01 });
    tone(ctx, lp, { freq: 150, start: t + 0.3, duration: 0.2, type: "square", gain: 0.35, attack: 0.01 });
  },
};

let customAudio: HTMLAudioElement | null = null;

/**
 * Suena `id` al volumen indicado (0–1). "personalizado" usa el archivo que
 * subió la persona (`customUrl`).
 */
export function playSound(id: SoundId, volume: number, customUrl?: string | null): void {
  if (id === "ninguno" || volume <= 0) return;
  if (id === "personalizado") {
    if (!customUrl) return;
    try {
      customAudio?.pause();
      customAudio = new Audio(customUrl);
      customAudio.volume = Math.min(1, Math.max(0, volume));
      void customAudio.play().catch(() => undefined);
    } catch {
      // Sin audio no pasa nada.
    }
    return;
  }
  const synth = SYNTHS[id];
  const ctx = audioContext();
  if (!synth || !ctx) return;
  const out = ctx.createGain();
  // Curva de volumen más natural al oído que la lineal.
  out.gain.value = Math.pow(Math.min(1, Math.max(0, volume)), 1.6) * 1.6;
  out.connect(ctx.destination);
  synth(ctx, out, ctx.currentTime + 0.02);
  window.setTimeout(() => out.disconnect(), 3000);
}
