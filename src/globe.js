// ─────────────────────────────────────────────
// 3D Globe: сцена, глобус, атмосфера, камера
// ─────────────────────────────────────────────
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  KernelSize,
} from 'postprocessing';

// ── Atmosphere Shader ──────────────────────────

const atmosphereVertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const atmosphereFragmentShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vec3 viewDir = normalize(-vPosition);
    float fresnel = 1.0 - dot(viewDir, vNormal);
    fresnel = pow(fresnel, 5.0) * 0.5;
    vec3 color = mix(
      vec3(0.05, 0.15, 0.4),
      vec3(0.15, 0.35, 0.7),
      fresnel
    );
    gl_FragColor = vec4(color, fresnel * 0.12);
  }
`;

/**
 * Процедурная текстура ночной Земли
 * Рисуем контуры континентов светлыми контурами на тёмном фоне
 */
function createEarthTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Тёмный океан
  ctx.fillStyle = '#080810';
  ctx.fillRect(0, 0, 2048, 1024);

  // Сетка координат — еле заметная
  ctx.strokeStyle = 'rgba(40, 50, 80, 0.15)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 36; i++) {
    const x = (i / 36) * 2048;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1024);
    ctx.stroke();
  }
  for (let i = 0; i < 18; i++) {
    const y = (i / 18) * 1024;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(2048, y);
    ctx.stroke();
  }

  // Упрощённые контуры континентов (equirectangular projection)
  // Каждый массив — полигон [lng, lat] → [x, y] на канвасе
  const continents = getContinentPaths();
  
  ctx.fillStyle = 'rgba(18, 22, 35, 1)';
  ctx.strokeStyle = 'rgba(50, 70, 120, 0.3)';
  ctx.lineWidth = 1;

  for (const continent of continents) {
    ctx.beginPath();
    for (let i = 0; i < continent.length; i++) {
      const [lng, lat] = continent[i];
      const x = ((lng + 180) / 360) * 2048;
      const y = ((90 - lat) / 180) * 1024;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Города — маленькие точки света
  const cities = [
    [37.62, 55.75], [30.32, 59.93], // Москва, Питер
    [69.28, 41.30], [66.96, 39.65], // Ташкент, Самарканд
    [71.43, 51.17], [76.95, 43.24], // Астана, Алматы
    [28.98, 41.01], [32.86, 39.93], // Стамбул, Анкара
    [13.40, 52.52], [11.58, 48.14], // Берлин, Мюнхен
    [2.35, 48.86],  [-0.13, 51.51], // Париж, Лондон
    [-74.01, 40.71],[-118.24, 34.05],[-87.63, 41.88],[-122.42, 37.77], // US
    [139.69, 35.68],[135.50, 34.69], // Токио, Осака
    [126.98, 37.57], // Сеул
    [121.47, 31.23],[116.40, 39.90], // Шанхай, Пекин
    [77.21, 28.61], [72.88, 19.08],  // Дели, Мумбаи
    [-46.63, -23.55],[-43.17, -22.91], // Сан-Паулу, Рио
    [31.24, 30.04], // Каир
    [151.21, -33.87], // Сидней
    [12.57, 55.68], [18.07, 59.33], [24.94, 60.17], // Копенгаген, Стокгольм, Хельсинки
    [30.52, 50.45], [27.57, 53.90], // Киев, Минск
    [44.78, 41.72], [44.51, 40.18], // Тбилиси, Ереван
    [51.39, 35.69], [55.27, 25.20], [46.68, 24.71], // Тегеран, Дубай, Эр-Рияд
    [3.38, 6.52],   [36.82, -1.29],  // Лагос, Найроби
    [-99.13, 19.43],[-58.38, -34.60], // Мехико, Буэнос-Айрес
  ];

  for (const [lng, lat] of cities) {
    const x = ((lng + 180) / 360) * 2048;
    const y = ((90 - lat) / 180) * 1024;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, 6);
    grd.addColorStop(0, 'rgba(180, 190, 230, 0.6)');
    grd.addColorStop(1, 'rgba(180, 190, 230, 0)');
    ctx.fillStyle = grd;
    ctx.fillRect(x - 6, y - 6, 12, 12);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Упрощённые полигоны континентов [lng, lat]
 */
function getContinentPaths() {
  return [
    // Евразия (очень упрощённо)
    [
      [-10, 35], [0, 38], [5, 43], [3, 47], [-5, 48], [-10, 52],
      [-5, 55], [0, 53], [5, 51], [10, 54], [12, 57], [15, 55],
      [20, 55], [24, 57], [28, 56], [30, 60], [28, 64], [30, 68],
      [35, 69], [40, 67], [45, 68], [50, 67], [55, 68], [60, 66],
      [65, 67], [70, 69], [80, 70], [90, 72], [100, 73], [110, 72],
      [120, 72], [130, 70], [140, 72], [150, 68], [160, 65],
      [170, 63], [180, 65], [180, 63], [170, 58], [160, 55],
      [150, 50], [145, 45], [140, 48], [135, 50], [132, 43],
      [130, 42], [128, 38], [127, 35], [130, 33], [132, 34],
      [135, 35], [137, 35], [140, 36], [142, 39], [145, 43],
      [142, 46], [140, 45], [135, 48], [130, 48],
      [125, 40], [122, 30], [120, 25], [115, 22], [110, 20],
      [108, 16], [106, 10], [104, 2], [100, 5], [98, 8],
      [100, 13], [100, 18], [97, 20], [92, 22], [88, 22],
      [88, 26], [85, 28], [80, 28], [77, 30], [75, 33],
      [72, 34], [70, 30], [68, 24], [65, 25], [60, 25],
      [57, 26], [55, 24], [52, 23], [50, 26], [48, 30],
      [47, 33], [44, 35], [42, 37], [40, 38], [36, 36],
      [35, 33], [35, 31], [33, 29], [35, 25], [37, 20],
      [42, 15], [43, 12], [45, 11], [50, 12], [52, 17],
      [55, 22], [54, 24], [52, 23],
      [48, 30], [44, 33], [40, 35], [36, 35], [32, 36],
      [30, 36], [27, 37], [22, 38], [20, 40], [15, 38],
      [12, 38], [10, 36], [5, 36], [0, 36], [-5, 36], [-10, 35],
    ],
    // Африка
    [
      [-17, 15], [-15, 11], [-16, 13], [-12, 8], [-8, 5], [-5, 5],
      [0, 5], [5, 4], [10, 4], [10, 2], [9, 1], [12, -5],
      [15, -5], [18, -10], [20, -15], [25, -20], [30, -25],
      [32, -28], [30, -33], [28, -34], [25, -34], [20, -33],
      [18, -30], [15, -25], [12, -17], [12, -6], [29, -3],
      [33, -1], [40, -2], [42, 0], [44, 2], [48, 5], [50, 11],
      [48, 11], [44, 12], [43, 15], [40, 17], [35, 20],
      [33, 25], [33, 28], [33, 30], [30, 31], [25, 32],
      [15, 35], [10, 37], [5, 36], [0, 35], [-5, 36],
      [-10, 35], [-13, 28], [-17, 21], [-17, 15],
    ],
    // Северная Америка
    [
      [-170, 65], [-165, 62], [-160, 60], [-150, 60], [-140, 60],
      [-130, 55], [-125, 50], [-124, 45], [-120, 38], [-115, 32],
      [-110, 25], [-105, 20], [-100, 18], [-95, 18], [-90, 15],
      [-85, 12], [-83, 10], [-80, 8], [-78, 8], [-77, 18],
      [-80, 25], [-82, 27], [-82, 30], [-85, 30], [-90, 30],
      [-95, 28], [-97, 26], [-100, 28], [-105, 30], [-110, 32],
      [-115, 33], [-120, 35], [-122, 38], [-124, 42], [-124, 48],
      [-130, 55], [-135, 58], [-140, 60], [-150, 62], [-160, 64],
      [-165, 68], [-160, 70], [-155, 71], [-140, 70], [-130, 70],
      [-120, 72], [-110, 72], [-100, 73], [-90, 73], [-80, 72],
      [-70, 70], [-65, 68], [-60, 65], [-55, 55], [-58, 48],
      [-63, 45], [-67, 44], [-70, 42], [-72, 41], [-75, 40],
      [-78, 38], [-80, 32], [-82, 30],
    ],
    // Южная Америка
    [
      [-80, 8], [-78, 5], [-75, 0], [-80, -2], [-80, -5],
      [-75, -10], [-70, -15], [-65, -20], [-60, -25], [-55, -30],
      [-52, -33], [-50, -28], [-45, -23], [-40, -15], [-37, -10],
      [-35, -5], [-50, 0], [-55, 2], [-60, 5], [-65, 8],
      [-70, 10], [-75, 10], [-77, 8], [-80, 8],
    ],
    // Австралия
    [
      [115, -20], [120, -15], [130, -12], [135, -12], [140, -15],
      [145, -15], [150, -20], [153, -25], [152, -30], [150, -35],
      [148, -38], [145, -38], [140, -36], [136, -35], [132, -33],
      [128, -30], [122, -32], [115, -33], [113, -28], [115, -20],
    ],
  ];
}


/**
 * Инициализация 3D-сцены
 */
export function createGlobe(container) {
  // ── Renderer ──
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  // ── Scene ──
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0a0a0f');

  // ── Camera ──
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 0, 3.2);

  // ── Controls ──
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 0.8;
  controls.minDistance = 1.5;
  controls.maxDistance = 6;
  controls.enablePan = false;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.3;

  // ── Lighting ──
  const ambientLight = new THREE.AmbientLight(0x222244, 0.5);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xccccff, 0.8);
  sunLight.position.set(5, 3, 5);
  scene.add(sunLight);

  const fillLight = new THREE.DirectionalLight(0x4466aa, 0.3);
  fillLight.position.set(-5, -2, -5);
  scene.add(fillLight);

  // ── Earth Globe ──
  const earthGeometry = new THREE.SphereGeometry(1, 64, 64);
  const earthTexture = createEarthTexture();

  const earthMaterial = new THREE.MeshStandardMaterial({
    map: earthTexture,
    roughness: 0.85,
    metalness: 0.1,
  });

  const earth = new THREE.Mesh(earthGeometry, earthMaterial);
  scene.add(earth);

  // ── Atmosphere ──
  const atmosphereGeometry = new THREE.SphereGeometry(1.04, 64, 64);
  const atmosphereMaterial = new THREE.ShaderMaterial({
    vertexShader: atmosphereVertexShader,
    fragmentShader: atmosphereFragmentShader,
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
  scene.add(atmosphere);

  // ── Postprocessing (Bloom) ──
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  
  const bloomEffect = new BloomEffect({
    intensity: 0.8,
    luminanceThreshold: 0.4,
    luminanceSmoothing: 0.5,
    kernelSize: KernelSize.MEDIUM,
    mipmapBlur: true,
  });

  const effectPass = new EffectPass(camera, bloomEffect);
  composer.addPass(renderPass);
  composer.addPass(effectPass);

  // ── Resize ──
  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  // ── Raycaster для кликов ──
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function getClickedLatLng(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(earth);
    if (intersects.length > 0) {
      const point = intersects[0].point;
      // Convert back to lat/lng
      const lat = 90 - Math.acos(point.y) * (180 / Math.PI);
      const lng = ((270 + Math.atan2(point.x, point.z) * (180 / Math.PI)) % 360) - 180;
      return { lat, lng };
    }
    return null;
  }

  return {
    renderer,
    scene,
    camera,
    controls,
    composer,
    earth,
    getClickedLatLng,
    onResize,
  };
}
