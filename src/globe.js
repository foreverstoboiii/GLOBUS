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
  renderer.toneMappingExposure = 1.1; // Чуть светлее для контраста
  container.appendChild(renderer.domElement);

  // ── Scene ──
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#030305'); // Почти абсолютный черный

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
  // Очень слабый заполняющий
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.05);
  scene.add(ambientLight);

  // Резкий боковой "солнечный" свет
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
  sunLight.position.set(5, 3, 5);
  scene.add(sunLight);

  // Холодный контровой свет (Rim Light) для объема
  const rimLight = new THREE.DirectionalLight(0x4466aa, 1.5);
  rimLight.position.set(-5, 0, -5);
  scene.add(rimLight);

  // ── Premium Earth ──
  const earthGroup = new THREE.Group();
  scene.add(earthGroup);

  const textureLoader = new THREE.TextureLoader();
  textureLoader.setCrossOrigin('anonymous');
  
  // Высокополигональная сфера
  const earthGeometry = new THREE.SphereGeometry(1, 128, 128);
  
  // Загружаем реальные текстуры высокого разрешения (Dark Earth + Topology)
  const earthMaterial = new THREE.MeshStandardMaterial({
    map: textureLoader.load('https://unpkg.com/three-globe/example/img/earth-dark.jpg'),
    bumpMap: textureLoader.load('https://unpkg.com/three-globe/example/img/earth-topology.png'),
    bumpScale: 0.015,
    roughness: 0.8,
    metalness: 0.1,
  });

  const earth = new THREE.Mesh(earthGeometry, earthMaterial);
  earthGroup.add(earth);

  // ── Deep Atmosphere ──
  // Более мягкий и объемный шейдер атмосферы
  const atmosphereVertex = `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  const atmosphereFragment = `
    varying vec3 vNormal;
    void main() {
      float intensity = pow(0.65 - dot(vNormal, vec3(0, 0, 1.0)), 4.0);
      gl_FragColor = vec4(0.2, 0.5, 1.0, 1.0) * intensity * 1.2;
    }
  `;
  const atmosphereMat = new THREE.ShaderMaterial({
    vertexShader: atmosphereVertex,
    fragmentShader: atmosphereFragment,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false
  });
  // Чуть больше радиус для глубины свечения
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.06, 64, 64), atmosphereMat);
  earthGroup.add(atmosphere);

  // ── Postprocessing (Bloom) ──
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  
  // Изящный bloom для "кристальных" огоньков
  const bloomEffect = new BloomEffect({
    intensity: 0.8,
    luminanceThreshold: 0.2,
    luminanceSmoothing: 0.8,
    kernelSize: KernelSize.LARGE,
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
