// ─────────────────────────────────────────────
// Audio Engine: процедурный звук (Web Audio API)
// ─────────────────────────────────────────────

let ctx = null;
let masterGain = null;
let droneNodes = null;
let isUnlocked = false;

/**
 * Разблокировка AudioContext (требование браузеров).
 * Вызывать при первом пользовательском действии.
 */
export function unlockAudio() {
  if (isUnlocked) return;
  
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = ctx.createGain();
  masterGain.gain.value = 0.6;
  masterGain.connect(ctx.destination);
  
  isUnlocked = true;
  startDrone();
}

export function isReady() {
  return isUnlocked;
}

// ── Ambient Drone ────────────────────────────
// Космический гул. Два осциллятора с легкой расстройкой + фильтр + LFO.

function startDrone() {
  if (!ctx) return;

  const droneGain = ctx.createGain();
  droneGain.gain.value = 0;
  droneGain.connect(masterGain);

  // Два осциллятора с легкой расстройкой (Thick Pad)
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.value = 55; // Low A

  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = 55.3; // Легкий detune = биения

  const osc3 = ctx.createOscillator();
  osc3.type = 'sine';
  osc3.frequency.value = 82.5; // Квинта выше, тихо

  const osc3Gain = ctx.createGain();
  osc3Gain.gain.value = 0.15;

  // Фильтр: убираем все выше ~200 Hz для глубокого гула
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 180;
  filter.Q.value = 1.5;

  // LFO: медленная модуляция громкости для дыхания
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.08; // ~12 секунд на цикл
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.03; // Очень тихая модуляция

  lfo.connect(lfoGain);
  lfoGain.connect(droneGain.gain);

  osc1.connect(filter);
  osc2.connect(filter);
  osc3.connect(osc3Gain);
  osc3Gain.connect(filter);
  filter.connect(droneGain);

  osc1.start();
  osc2.start();
  osc3.start();
  lfo.start();

  // Плавное нарастание (fade in за 4 секунды)
  droneGain.gain.setTargetAtTime(0.12, ctx.currentTime, 1.5);

  droneNodes = { osc1, osc2, osc3, lfo, droneGain, filter };
}

// ── UI Click Sound ───────────────────────────
// Короткий стеклянный щелчок.

export function playClick() {
  if (!ctx) return;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 3200;

  const gain = ctx.createGain();
  gain.gain.value = 0.08;
  gain.gain.setTargetAtTime(0, ctx.currentTime + 0.02, 0.015);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 3000;
  filter.Q.value = 5;

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  
  osc.start();
  osc.stop(ctx.currentTime + 0.1);
}

// ── Hover Sound ──────────────────────────────
// Еще более тихий и нежный.

export function playHover() {
  if (!ctx) return;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 4800;

  const gain = ctx.createGain();
  gain.gain.value = 0.03;
  gain.gain.setTargetAtTime(0, ctx.currentTime + 0.01, 0.01);

  osc.connect(gain);
  gain.connect(masterGain);
  
  osc.start();
  osc.stop(ctx.currentTime + 0.06);
}

// ── Arc Launch Sound ─────────────────────────
// Восходящий тон (свип) — ощущение взлета.

export function playArcLaunch() {
  if (!ctx) return;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 200;
  osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.8);

  const gain = ctx.createGain();
  gain.gain.value = 0.12;
  gain.gain.setTargetAtTime(0, ctx.currentTime + 0.3, 0.25);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 800;
  filter.frequency.exponentialRampToValueAtTime(3000, ctx.currentTime + 0.6);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);

  osc.start();
  osc.stop(ctx.currentTime + 1.2);

  // Шумовой слой (шипение ракеты)
  const bufferSize = ctx.sampleRate * 0.8;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.5;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.04;
  noiseGain.gain.setTargetAtTime(0, ctx.currentTime + 0.2, 0.15);

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 2000;
  noiseFilter.Q.value = 2;

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(masterGain);
  noise.start();
}

// ── Impact Sound ─────────────────────────────
// Глухой удар при приземлении дуги. Низкий тон + шум.

export function playImpact() {
  if (!ctx) return;

  // Низкий ударный тон
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 80;
  osc.frequency.setTargetAtTime(40, ctx.currentTime + 0.05, 0.1);

  const gain = ctx.createGain();
  gain.gain.value = 0.2;
  gain.gain.setTargetAtTime(0, ctx.currentTime + 0.05, 0.12);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start();
  osc.stop(ctx.currentTime + 0.5);

  // Шумовой хвост
  const bufferSize = ctx.sampleRate * 0.3;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.06;
  noiseGain.gain.setTargetAtTime(0, ctx.currentTime + 0.03, 0.08);

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.value = 600;

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(masterGain);
  noise.start();
}

// ── Camera Whoosh ────────────────────────────
// Мягкий свуш при пролете камеры.

export function playWhoosh() {
  if (!ctx) return;

  const bufferSize = ctx.sampleRate * 1.0;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;

  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.gain.setTargetAtTime(0.06, ctx.currentTime + 0.1, 0.15);
  gain.gain.setTargetAtTime(0, ctx.currentTime + 0.5, 0.2);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 400;
  filter.frequency.exponentialRampToValueAtTime(1500, ctx.currentTime + 0.5);
  filter.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 1.0);
  filter.Q.value = 1;

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  noise.start();
}
