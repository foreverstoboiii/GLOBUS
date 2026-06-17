// ─────────────────────────────────────────────
// UI: overlay, фильтры, панель региона
// ─────────────────────────────────────────────
import { CATEGORIES } from './data.js';

/**
 * Создание всего UI
 */
export function createUI({ onSubmitTrace, onFilter, onGlobeClick }) {
  createOverlay(onSubmitTrace);
  createFilters(onFilter);
  createRegionPanel();
  createCounter();
  setupGlobeClickHandler(onGlobeClick);
}

// ── Overlay (главный вопрос) ──────────────────

function createOverlay(onSubmit) {
  const overlay = document.createElement('div');
  overlay.id = 'overlay';
  overlay.innerHTML = `
    <div class="overlay-content">
      <h1 class="overlay-question">
        Что сейчас занимает<br>больше всего места<br>в твоей голове?
      </h1>

      <div class="category-chips" id="category-chips">
        ${CATEGORIES.map(cat => `
          <button class="chip" data-category="${cat.id}" style="--chip-color: ${cat.color}">
            ${cat.label}
          </button>
        `).join('')}
      </div>

      <div class="custom-input-wrap" id="custom-input-wrap">
        <textarea
          id="custom-thought"
          class="custom-input"
          placeholder="или напиши своё..."
          maxlength="200"
        ></textarea>
        <span class="char-count" id="char-count">0 / 200</span>
      </div>

      <button class="submit-btn" id="submit-btn" disabled>
        Оставить след
      </button>
    </div>
  `;
  document.body.appendChild(overlay);

  // ── Логика ──
  let selectedCategory = null;
  const chips = overlay.querySelectorAll('.chip');
  const textarea = overlay.querySelector('#custom-thought');
  const charCount = overlay.querySelector('#char-count');
  const submitBtn = overlay.querySelector('#submit-btn');

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      const catId = chip.dataset.category;
      if (selectedCategory === catId) {
        // Деселект
        chip.classList.remove('active');
        selectedCategory = null;
      } else {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        selectedCategory = catId;
      }
      updateSubmitState();
    });
  });

  textarea.addEventListener('input', () => {
    charCount.textContent = `${textarea.value.length} / 200`;
    updateSubmitState();
  });

  function updateSubmitState() {
    const hasInput = selectedCategory || textarea.value.trim().length > 0;
    submitBtn.disabled = !hasInput;
  }

  submitBtn.addEventListener('click', () => {
    const text = textarea.value.trim();
    const category = selectedCategory || 'search';
    onSubmit({ text, category });
    hideOverlay();
  });

  // Enter для отправки (shift+enter — новая строка)
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!submitBtn.disabled) submitBtn.click();
    }
  });
}

function hideOverlay() {
  const overlay = document.getElementById('overlay');
  overlay.classList.add('hidden');
  // Показать фильтры
  setTimeout(() => {
    document.getElementById('filter-bar').classList.add('visible');
    showCounter();
  }, 600);
}

/**
 * Показать overlay снова
 */
export function showOverlay() {
  const overlay = document.getElementById('overlay');
  overlay.classList.remove('hidden');
  document.getElementById('filter-bar').classList.remove('visible');
}

// ── Фильтры ──────────────────────────────────

function createFilters(onFilter) {
  const bar = document.createElement('div');
  bar.id = 'filter-bar';
  bar.innerHTML = `
    <button class="filter-chip active" data-filter="all">
      <span class="filter-dot" style="background: #fff"></span>
      все
    </button>
    ${CATEGORIES.map(cat => `
      <button class="filter-chip" data-filter="${cat.id}">
        <span class="filter-dot" style="background: ${cat.color}"></span>
        ${cat.label}
      </button>
    `).join('')}
  `;
  document.body.appendChild(bar);

  const chips = bar.querySelectorAll('.filter-chip');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const filter = chip.dataset.filter === 'all' ? null : chip.dataset.filter;
      onFilter(filter);
    });
  });
}

// ── Панель региона ───────────────────────────

function createRegionPanel() {
  const panel = document.createElement('div');
  panel.id = 'region-panel';
  panel.innerHTML = `
    <button class="panel-close" id="panel-close">&times;</button>
    <h2 class="panel-title" id="panel-title">—</h2>
    <div class="panel-stats" id="panel-stats"></div>
    <div class="panel-divider"></div>
    <div class="panel-traces" id="panel-traces"></div>
  `;
  document.body.appendChild(panel);

  document.getElementById('panel-close').addEventListener('click', () => {
    panel.classList.remove('visible');
  });
}

/**
 * Показать панель региона с данными
 */
export function showRegionPanel(traces) {
  if (!traces.length) return;

  const panel = document.getElementById('region-panel');
  const title = document.getElementById('panel-title');
  const stats = document.getElementById('panel-stats');
  const tracesList = document.getElementById('panel-traces');

  // Определяем страну (самая частая)
  const countryCounts = {};
  traces.forEach(t => {
    countryCounts[t.country] = (countryCounts[t.country] || 0) + 1;
  });
  const topCountry = Object.entries(countryCounts)
    .sort((a, b) => b[1] - a[1])[0][0];

  title.textContent = topCountry;

  // Статистика по категориям
  const catCounts = {};
  traces.forEach(t => {
    catCounts[t.categoryLabel] = (catCounts[t.categoryLabel] || 0) + 1;
  });
  const total = traces.length;
  const sorted = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  stats.innerHTML = sorted.map(([label, count]) => {
    const pct = Math.round((count / total) * 100);
    const cat = CATEGORIES.find(c => c.label === label);
    const color = cat ? cat.color : '#fff';
    return `
      <div class="stat-row">
        <span class="stat-label">
          <span class="stat-dot" style="background: ${color}"></span>
          ${label}
        </span>
        <span class="stat-value">${pct}%</span>
        <div class="stat-bar">
          <div class="stat-bar-fill" style="width: ${pct}%; background: ${color}"></div>
        </div>
      </div>
    `;
  }).join('');

  // Показать 3 случайных следа
  const sample = traces
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);
  
  tracesList.innerHTML = sample.map(t => `
    <div class="trace-card">
      <p class="trace-text">"${t.text}"</p>
      <span class="trace-category" style="color: ${t.color}">${t.categoryLabel}</span>
    </div>
  `).join('');

  panel.classList.add('visible');
}

// ── Счётчик ──────────────────────────────────

function createCounter() {
  const counter = document.createElement('div');
  counter.id = 'trace-counter';
  counter.innerHTML = `
    <div class="counter-content">
      <span class="counter-number" id="counter-number">0</span>
      <span class="counter-label">человек оставили похожие мысли<br>за последние 30 дней</span>
    </div>
  `;
  document.body.appendChild(counter);
}

function showCounter() {
  const counter = document.getElementById('trace-counter');
  const numberEl = document.getElementById('counter-number');
  counter.classList.add('visible');

  // Анимация числа
  const target = 800 + Math.floor(Math.random() * 1500);
  const duration = 2000;
  const start = performance.now();

  function animate() {
    const elapsed = performance.now() - start;
    const t = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const current = Math.floor(target * eased);
    numberEl.textContent = current.toLocaleString('ru-RU');
    if (t < 1) requestAnimationFrame(animate);
  }
  animate();

  // Скрыть через 5 секунд
  setTimeout(() => {
    counter.classList.remove('visible');
  }, 6000);
}

// ── Globe click handler ──────────────────────

function setupGlobeClickHandler(onGlobeClick) {
  let pointerDownPos = null;

  document.addEventListener('pointerdown', (e) => {
    pointerDownPos = { x: e.clientX, y: e.clientY };
  });

  document.addEventListener('pointerup', (e) => {
    if (!pointerDownPos) return;
    const dx = e.clientX - pointerDownPos.x;
    const dy = e.clientY - pointerDownPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Только если это клик, а не drag
    if (dist < 5) {
      onGlobeClick(e);
    }
    pointerDownPos = null;
  });
}
