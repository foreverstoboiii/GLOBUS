// ─────────────────────────────────────────────
// GLOBUS — Точка входа (Integration)
// ─────────────────────────────────────────────
import './style.css';
import { createGlobe } from './globe.js';
import { createTraces } from './traces.js';
import { generateTraces, CATEGORIES, latLngToVector3 } from './data.js';
import { createUI, showRegionPanel, hideRegionPanel } from './ui.js';
import { playArcLaunch, playImpact, playWhoosh } from './audio.js';

// ── Init ─────────────────────────────────────

const container = document.getElementById('app');

// 1. Глобус
const globe = createGlobe(container);

// 2. Фейковые данные (история)
const tracesData = generateTraces();

// 3. Точки-следы
const traceSystem = createTraces(globe.scene, tracesData);

// Фиксированная точка "пользователя" для вылета дуги (Ташкент)
const USER_LAT = 41.30;
const USER_LNG = 69.28;

// 4. UI
createUI({
  onSubmitTrace: handleSubmitTrace,
  onFilter: handleFilter,
  onGlobeClick: handleGlobeClick,
  onClosePanel: handleClosePanel,
});

// ── Handlers ─────────────────────────────────

function handleSubmitTrace({ text, category }) {
  const cat = CATEGORIES.find(c => c.id === category) || CATEGORIES[0];
  const displayText = text || cat.label;

  // Фейковое определение случайной "локации назначения" в пределах мира
  const destLat = (Math.random() - 0.5) * 140; // Избегаем полюсов
  const destLng = (Math.random() - 0.5) * 360;

  const newTrace = {
    id: Date.now(),
    text: displayText,
    category: cat.id,
    categoryLabel: cat.label,
    color: cat.color,
    country: 'Somewhere', // В идеале нужен reverse geocoding
    lat: destLat,
    lng: destLng,
    date: new Date(),
  };

  // 1. Летим камерой к месту вылета
  globe.flyTo(USER_LAT, USER_LNG, 3.5, 1.0);
  playWhoosh();

  // 2. Добавляем след со стрельбой дугой
  setTimeout(() => {
    playArcLaunch();
    traceSystem.addTrace(newTrace, USER_LAT, USER_LNG);
  }, 1000);

  // 3. Звук удара при приземлении дуги
  setTimeout(() => {
    playImpact();
  }, 2400);

  // 4. Подлетаем к точке назначения
  setTimeout(() => {
    playWhoosh();
    globe.flyTo(destLat, destLng, 2.0, 2.0);
  }, 2500);

  // 5. Возвращаемся на орбиту
  setTimeout(() => {
    globe.resetCamera();
  }, 6000);
}

function handleFilter(categoryId) {
  traceSystem.setFilter(categoryId);
}

function handleGlobeClick(event) {
  const latLng = globe.getClickedLatLng(event);
  if (!latLng) return;

  const nearTraces = traceSystem.getTracesNear(latLng.lat, latLng.lng, 15);
  
  if (nearTraces.length > 0) {
    playWhoosh();
    globe.flyTo(latLng.lat, latLng.lng, 1.8, 1.5);
    showRegionPanel(nearTraces);
  } else {
    hideRegionPanel();
    globe.resetCamera();
  }
}

function handleClosePanel() {
  globe.resetCamera();
}

// ── Animation Loop ───────────────────────────

const clock = { start: performance.now() };

function animate() {
  requestAnimationFrame(animate);

  const time = (performance.now() - clock.start) / 1000;

  // Обновляем логику глобуса (звезды, контролы)
  globe.update(time);

  // Обновляем пульсацию следов
  traceSystem.update(time);

  // Рендер через composer (bloom + vignette + film grain)
  globe.composer.render();
}

animate();
