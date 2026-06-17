// ─────────────────────────────────────────────
// GLOBUS — Точка входа
// ─────────────────────────────────────────────
import './style.css';
import { createGlobe } from './globe.js';
import { createTraces } from './traces.js';
import { generateTraces, CATEGORIES, latLngToVector3 } from './data.js';
import { createUI, showRegionPanel } from './ui.js';

// ── Init ─────────────────────────────────────

const container = document.getElementById('app');

// 1. Глобус
const globe = createGlobe(container);

// 2. Фейковые данные
const tracesData = generateTraces();

// 3. Точки-следы
const traceSystem = createTraces(globe.scene, tracesData);

// 4. UI
createUI({
  onSubmitTrace: handleSubmitTrace,
  onFilter: handleFilter,
  onGlobeClick: handleGlobeClick,
});

// ── Handlers ─────────────────────────────────

function handleSubmitTrace({ text, category }) {
  const cat = CATEGORIES.find(c => c.id === category) || CATEGORIES[0];
  const displayText = text || cat.label;

  // Фейковое определение "локации"
  const fakeLat = 41.30 + (Math.random() - 0.5) * 4;
  const fakeLng = 69.28 + (Math.random() - 0.5) * 4;

  traceSystem.addTrace({
    id: Date.now(),
    text: displayText,
    category: cat.id,
    categoryLabel: cat.label,
    color: cat.color,
    country: 'Узбекистан',
    lat: fakeLat,
    lng: fakeLng,
    date: new Date(),
  });
}

function handleFilter(categoryId) {
  traceSystem.setFilter(categoryId);
}

function handleGlobeClick(event) {
  const latLng = globe.getClickedLatLng(event);
  if (!latLng) return;

  const nearTraces = traceSystem.getTracesNear(latLng.lat, latLng.lng, 15);
  if (nearTraces.length > 0) {
    showRegionPanel(nearTraces);
  }
}

// ── Animation Loop ───────────────────────────

const clock = { start: performance.now() };

function animate() {
  requestAnimationFrame(animate);

  const time = (performance.now() - clock.start) / 1000;

  // Обновляем контролы
  globe.controls.update();

  // Обновляем пульсацию следов
  traceSystem.update(time);

  // Рендер через composer (с bloom)
  globe.composer.render();
}

animate();
