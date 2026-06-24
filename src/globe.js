// ─────────────────────────────────────────────
// 3D Globe: сцена, глобус, облака, day/night, звезды
// ─────────────────────────────────────────────
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import gsap from 'gsap';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  VignetteEffect,
  NoiseEffect,
  KernelSize,
  BlendFunction,
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
  renderer.toneMappingExposure = 1.2;
  container.appendChild(renderer.domElement);

  // ── Scene ──
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#010103');

  // ── Camera ──
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 0, 3.5);

  // ── Controls ──
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.04;
  controls.rotateSpeed = 0.4;
  controls.zoomSpeed = 0.6;
  controls.minDistance = 1.3;
  controls.maxDistance = 5;
  controls.enablePan = false;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.2;

  // ── Lighting ──
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.03);
  scene.add(ambientLight);

  // Солнечный свет — позиция будет пересчитываться по реальному времени
  const sunLight = new THREE.DirectionalLight(0xfff5e6, 3.5);
  sunLight.position.set(5, 3, 5);
  scene.add(sunLight);

  // Холодный rim для объема теневой стороны
  const rimLight = new THREE.DirectionalLight(0x334477, 1.0);
  rimLight.position.set(-5, 0, -5);
  scene.add(rimLight);

  // ── Deep Space & Stardust ──
  const starsGeometry = new THREE.BufferGeometry();
  const starsCount = 2500;
  const posArray = new Float32Array(starsCount * 3);
  const colorArray = new Float32Array(starsCount * 3);
  const tempColor = new THREE.Color();

  for (let i = 0; i < starsCount * 3; i += 3) {
    const r = 10 + Math.random() * 20;
    const theta = 2 * Math.PI * Math.random();
    const phi = Math.acos(2 * Math.random() - 1);

    posArray[i] = r * Math.sin(phi) * Math.cos(theta);
    posArray[i + 1] = r * Math.sin(phi) * Math.sin(theta);
    posArray[i + 2] = r * Math.cos(phi);

    const hue = Math.random() > 0.5 ? 0.6 + Math.random() * 0.1 : 0.05 + Math.random() * 0.05;
    tempColor.setHSL(hue, 0.8, 0.8 + Math.random() * 0.2);
    colorArray[i] = tempColor.r;
    colorArray[i + 1] = tempColor.g;
    colorArray[i + 2] = tempColor.b;
  }
  starsGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
  starsGeometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));

  const starsMaterial = new THREE.PointsMaterial({
    size: 0.02,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const stars = new THREE.Points(starsGeometry, starsMaterial);
  scene.add(stars);

  // ── Premium Earth ──
  const earthGroup = new THREE.Group();
  scene.add(earthGroup);

  const textureLoader = new THREE.TextureLoader();
  textureLoader.setCrossOrigin('anonymous');

  const earthGeometry = new THREE.SphereGeometry(1, 128, 128);

  // Дневная текстура
  const dayTexture = textureLoader.load('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg');
  // Текстура ночных огней (используем earth-dark как emissive map)
  const nightTexture = textureLoader.load('https://unpkg.com/three-globe/example/img/earth-dark.jpg');
  // Bump
  const bumpTexture = textureLoader.load('https://unpkg.com/three-globe/example/img/earth-topology.png');

  const earthMaterial = new THREE.MeshStandardMaterial({
    map: dayTexture,
    bumpMap: bumpTexture,
    bumpScale: 0.015,
    roughness: 0.85,
    metalness: 0.05,
    // emissiveMap проявит огни городов в тени
    emissive: new THREE.Color(0xffcc66),
    emissiveMap: nightTexture,
    emissiveIntensity: 0.8,
  });

  const earth = new THREE.Mesh(earthGeometry, earthMaterial);
  earthGroup.add(earth);

  // ── Cloud Layer ──
  const cloudTexture = textureLoader.load('https://unpkg.com/three-globe/example/img/earth-water.png');
  const cloudGeometry = new THREE.SphereGeometry(1.015, 96, 96);
  const cloudMaterial = new THREE.MeshStandardMaterial({
    map: cloudTexture,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    roughness: 1,
    metalness: 0,
  });
  const clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
  earthGroup.add(clouds);

  // ── Deep Atmosphere ──
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
      gl_FragColor = vec4(0.2, 0.5, 1.0, 1.0) * intensity * 1.5;
    }
  `;
  const atmosphereMat = new THREE.ShaderMaterial({
    vertexShader: atmosphereVertex,
    fragmentShader: atmosphereFragment,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  });
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.06, 64, 64), atmosphereMat);
  earthGroup.add(atmosphere);

  // ── Postprocessing (Cinematic) ──
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);

  const bloomEffect = new BloomEffect({
    intensity: 1.0,
    luminanceThreshold: 0.15,
    luminanceSmoothing: 0.8,
    kernelSize: KernelSize.LARGE,
    mipmapBlur: true,
  });

  const noiseEffect = new NoiseEffect({
    blendFunction: BlendFunction.OVERLAY,
    opacity: 0.15,
  });

  const vignetteEffect = new VignetteEffect({
    eskil: false,
    offset: 0.35,
    darkness: 0.5,
  });

  const effectPass = new EffectPass(camera, bloomEffect, vignetteEffect, noiseEffect);
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

  // ── Raycaster ──
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function getClickedLatLng(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(earth);
    if (intersects.length > 0) {
      const point = intersects[0].point;
      const lat = 90 - Math.acos(point.y) * (180 / Math.PI);

      let lng = Math.atan2(point.z, -point.x) * (180 / Math.PI) - 180;
      if (lng < -180) lng += 360;

      return { lat, lng };
    }
    return null;
  }

  // ── Smart Camera FlyTo ──
  function flyTo(lat, lng, altitude = 2.0, duration = 1.5) {
    const wasAutoRotate = controls.autoRotate;
    controls.autoRotate = false;

    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);

    const targetPos = new THREE.Vector3(
      -(altitude * Math.sin(phi) * Math.cos(theta)),
      altitude * Math.cos(phi),
      altitude * Math.sin(phi) * Math.sin(theta)
    );

    const startSpherical = new THREE.Spherical().setFromVector3(camera.position);
    const endSpherical = new THREE.Spherical().setFromVector3(targetPos);

    let azimuthDiff = endSpherical.theta - startSpherical.theta;
    while (azimuthDiff > Math.PI) azimuthDiff -= Math.PI * 2;
    while (azimuthDiff < -Math.PI) azimuthDiff += Math.PI * 2;
    endSpherical.theta = startSpherical.theta + azimuthDiff;

    const proxy = {
      radius: startSpherical.radius,
      phi: startSpherical.phi,
      theta: startSpherical.theta,
    };

    gsap.to(proxy, {
      radius: endSpherical.radius,
      phi: endSpherical.phi,
      theta: endSpherical.theta,
      duration: duration,
      ease: 'power3.inOut',
      onUpdate: () => {
        camera.position.setFromSphericalCoords(proxy.radius, proxy.phi, proxy.theta);
        controls.update();
      },
      onComplete: () => {
        controls.autoRotate = wasAutoRotate;
      },
    });
  }

  function resetCamera(duration = 2.0) {
    const startSpherical = new THREE.Spherical().setFromVector3(camera.position);
    const endSpherical = new THREE.Spherical(3.5, Math.PI / 2, 0);

    let azimuthDiff = endSpherical.theta - startSpherical.theta;
    while (azimuthDiff > Math.PI) azimuthDiff -= Math.PI * 2;
    while (azimuthDiff < -Math.PI) azimuthDiff += Math.PI * 2;
    endSpherical.theta = startSpherical.theta + azimuthDiff;

    const proxy = {
      radius: startSpherical.radius,
      phi: startSpherical.phi,
      theta: startSpherical.theta,
    };

    gsap.to(proxy, {
      radius: endSpherical.radius,
      phi: endSpherical.phi,
      theta: endSpherical.theta,
      duration: duration,
      ease: 'power3.inOut',
      onUpdate: () => {
        camera.position.setFromSphericalCoords(proxy.radius, proxy.phi, proxy.theta);
        controls.update();
      },
    });
  }

  // ── Sun Position (Real-Time Day/Night) ──
  function updateSunPosition() {
    const now = new Date();
    const hours = now.getUTCHours() + now.getUTCMinutes() / 60;
    
    // Солнечная долгота: в 12:00 UTC солнце над 0° долготы
    const sunLng = -(hours / 24) * 360 + 180;
    
    // Наклон земной оси ~23.4°. Простая аппроксимация.
    const dayOfYear = Math.floor(
      (now - new Date(now.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24)
    );
    const sunLat = 23.4 * Math.sin(((dayOfYear - 81) / 365) * 2 * Math.PI);

    const phi = (90 - sunLat) * (Math.PI / 180);
    const theta = (sunLng + 180) * (Math.PI / 180);
    const dist = 8;

    sunLight.position.set(
      -(dist * Math.sin(phi) * Math.cos(theta)),
      dist * Math.cos(phi),
      dist * Math.sin(phi) * Math.sin(theta)
    );

    // Rim light всегда с противоположной стороны
    rimLight.position.copy(sunLight.position).negate().multiplyScalar(0.8);
  }

  // Первоначальный расчет
  updateSunPosition();

  // Обновление раз в минуту
  setInterval(updateSunPosition, 60000);

  // ── Update ──
  function update(time) {
    controls.update();
    stars.rotation.y = time * 0.02;
    
    // Облака вращаются чуть быстрее Земли
    clouds.rotation.y = time * 0.008;
  }

  return {
    renderer,
    scene,
    camera,
    controls,
    composer,
    earth,
    getClickedLatLng,
    flyTo,
    resetCamera,
    onResize,
    update,
  };
}
