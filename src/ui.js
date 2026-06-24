// ─────────────────────────────────────────────
// UI: overlay, фильтры, панель региона
// ─────────────────────────────────────────────
import { CATEGORIES } from './data.js';
import gsap from 'gsap';
import { playClick, playHover, unlockAudio } from './audio.js';

export function createUI({ onSubmitTrace, onFilter, onGlobeClick, onClosePanel }) {
  createOverlay(onSubmitTrace);
  createFilters(onFilter);
  createRegionPanel(onClosePanel);
  createCounter();
  setupGlobeClickHandler(onGlobeClick);

  // Начальная анимация появления оверлея
  gsap.fromTo('#overlay .overlay-content', 
    { opacity: 0, y: 30, scale: 0.95 }, 
    { opacity: 1, y: 0, scale: 1, duration: 1.2, ease: "power3.out", delay: 0.5 }
  );
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

  let selectedCategory = null;
  const chips = overlay.querySelectorAll('.chip');
  const textarea = overlay.querySelector('#custom-thought');
  const charCount = overlay.querySelector('#char-count');
  const submitBtn = overlay.querySelector('#submit-btn');

  chips.forEach(chip => {
    chip.addEventListener('mouseenter', () => playHover());
    chip.addEventListener('click', () => {
      unlockAudio();
      playClick();
      const catId = chip.dataset.category;
      if (selectedCategory === catId) {
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
    unlockAudio();
    playClick();
    const text = textarea.value.trim();
    const category = selectedCategory || 'search';
    onSubmit({ text, category });
    hideOverlay();
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!submitBtn.disabled) submitBtn.click();
    }
  });
}

function hideOverlay() {
  const overlay = document.getElementById('overlay');
  
  gsap.to('#overlay .overlay-content', {
    opacity: 0,
    y: -30,
    scale: 0.95,
    duration: 0.8,
    ease: "power3.in",
    onComplete: () => {
      overlay.style.display = 'none';
      
      // Показываем фильтры
      const filterBar = document.getElementById('filter-bar');
      filterBar.style.display = 'flex';
      gsap.fromTo(filterBar, 
        { opacity: 0, y: 20 }, 
        { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }
      );
      
      showCounter();
    }
  });
}

export function showOverlay() {
  const overlay = document.getElementById('overlay');
  const filterBar = document.getElementById('filter-bar');

  gsap.to(filterBar, {
    opacity: 0, y: 20, duration: 0.5, ease: "power2.in", onComplete: () => {
      filterBar.style.display = 'none';
    }
  });

  overlay.style.display = 'flex';
  gsap.fromTo('#overlay .overlay-content', 
    { opacity: 0, y: 30, scale: 0.95 }, 
    { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: "power3.out" }
  );
}

// ── Фильтры ──────────────────────────────────

function createFilters(onFilter) {
  const bar = document.createElement('div');
  bar.id = 'filter-bar';
  bar.style.display = 'none'; // Скрыты до отправки первой мысли
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
    chip.addEventListener('mouseenter', () => playHover());
    chip.addEventListener('click', () => {
      playClick();
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const filter = chip.dataset.filter === 'all' ? null : chip.dataset.filter;
      onFilter(filter);
    });
  });
}

// ── Панель региона ───────────────────────────

function createRegionPanel(onClose) {
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
    hideRegionPanel();
    if (onClose) onClose();
  });
}

export function showRegionPanel(traces) {
  if (!traces.length) return;

  const panel = document.getElementById('region-panel');
  const title = document.getElementById('panel-title');
  const stats = document.getElementById('panel-stats');
  const tracesList = document.getElementById('panel-traces');

  const countryCounts = {};
  traces.forEach(t => {
    countryCounts[t.country] = (countryCounts[t.country] || 0) + 1;
  });
  const topCountry = Object.entries(countryCounts)
    .sort((a, b) => b[1] - a[1])[0][0];

  title.textContent = topCountry;

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
          <div class="stat-bar-fill" style="width: 0%; background: ${color}" data-width="${pct}%"></div>
        </div>
      </div>
    `;
  }).join('');

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
  gsap.fromTo(panel, 
    { x: '100%', opacity: 0 }, 
    { x: '0%', opacity: 1, duration: 0.6, ease: "power3.out" }
  );

  // Анимация прогресс-баров
  setTimeout(() => {
    const fills = panel.querySelectorAll('.stat-bar-fill');
    fills.forEach(fill => {
      gsap.to(fill, { width: fill.dataset.width, duration: 1, ease: "power2.out", delay: 0.2 });
    });
  }, 100);
}

export function hideRegionPanel() {
  const panel = document.getElementById('region-panel');
  if (panel.classList.contains('visible')) {
    gsap.to(panel, {
      x: '100%', opacity: 0, duration: 0.5, ease: "power3.in",
      onComplete: () => panel.classList.remove('visible')
    });
  }
}

// ── Счётчик ──────────────────────────────────

function createCounter() {
  const counter = document.createElement('div');
  counter.id = 'trace-counter';
  counter.style.display = 'none';
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
  
  counter.style.display = 'block';
  gsap.fromTo(counter, 
    { opacity: 0, y: 20 }, 
    { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }
  );

  const target = 800 + Math.floor(Math.random() * 1500);
  const proxy = { val: 0 };
  
  gsap.to(proxy, {
    val: target,
    duration: 2.5,
    ease: "power3.out",
    onUpdate: () => {
      numberEl.textContent = Math.floor(proxy.val).toLocaleString('ru-RU');
    }
  });

  // Скрыть через 6 секунд
  gsap.to(counter, {
    opacity: 0, y: -20, duration: 0.8, delay: 6, ease: "power2.in",
    onComplete: () => counter.style.display = 'none'
  });
}

// ── Globe click handler ──────────────────────

function setupGlobeClickHandler(onGlobeClick) {
  let pointerDownPos = null;

  document.addEventListener('pointerdown', (e) => {
    // Не кликаем сквозь UI
    if (e.target.closest('#region-panel') || e.target.closest('#overlay') || e.target.closest('#filter-bar')) {
      return;
    }
    pointerDownPos = { x: e.clientX, y: e.clientY };
  });

  document.addEventListener('pointerup', (e) => {
    if (!pointerDownPos) return;
    const dx = e.clientX - pointerDownPos.x;
    const dy = e.clientY - pointerDownPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 5) {
      onGlobeClick(e);
    }
    pointerDownPos = null;
  });
}
