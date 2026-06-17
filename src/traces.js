// ─────────────────────────────────────────────
// Traces: точки-следы на глобусе
// ─────────────────────────────────────────────
import * as THREE from 'three';
import { latLngToVector3, CATEGORIES } from './data.js';

// Вершинный шейдер для точек
const traceVertexShader = `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aOpacity;
  attribute float aPhase;

  varying vec3 vColor;
  varying float vOpacity;

  uniform float uTime;
  uniform float uPixelRatio;

  void main() {
    vColor = aColor;
    vOpacity = aOpacity;

    // Пульсация размера
    float pulse = 1.0 + 0.3 * sin(uTime * 1.5 + aPhase * 6.28);

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * pulse * uPixelRatio * (80.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Фрагментный шейдер — мягкий круг со свечением
const traceFragmentShader = `
  varying vec3 vColor;
  varying float vOpacity;

  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;

    // Мягкое затухание от центра
    float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
    alpha = pow(alpha, 1.5);

    gl_FragColor = vec4(vColor, alpha * vOpacity * 0.85);
  }
`;

/**
 * Создание системы точек-следов
 */
export function createTraces(scene, traces) {
  const count = traces.length;

  // Буферы
  const positions = new Float32Array(count * 3);
  const colors    = new Float32Array(count * 3);
  const sizes     = new Float32Array(count);
  const opacities = new Float32Array(count);
  const phases    = new Float32Array(count);
  const categoryIndices = []; // для фильтрации

  const tempColor = new THREE.Color();
  const GLOBE_RADIUS = 1.01; // чуть выше поверхности

  for (let i = 0; i < count; i++) {
    const trace = traces[i];
    const pos = latLngToVector3(trace.lat, trace.lng, GLOBE_RADIUS);

    positions[i * 3]     = pos.x;
    positions[i * 3 + 1] = pos.y;
    positions[i * 3 + 2] = pos.z;

    tempColor.set(trace.color);
    colors[i * 3]     = tempColor.r;
    colors[i * 3 + 1] = tempColor.g;
    colors[i * 3 + 2] = tempColor.b;

    sizes[i]     = 0.5 + Math.random() * 0.4;
    opacities[i] = 1.0;
    phases[i]    = Math.random();

    categoryIndices.push(trace.category);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor',   new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize',    new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aOpacity', new THREE.BufferAttribute(opacities, 1));
  geometry.setAttribute('aPhase',   new THREE.BufferAttribute(phases, 1));

  const material = new THREE.ShaderMaterial({
    vertexShader:   traceVertexShader,
    fragmentShader: traceFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime:       { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  // ── API ──

  let activeFilter = null;
  let filterAnimation = null;

  /**
   * Фильтрация по категории (null = все)
   */
  function setFilter(categoryId) {
    activeFilter = categoryId;

    // Плавная анимация opacity
    const targetOpacities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      if (!categoryId || categoryIndices[i] === categoryId) {
        targetOpacities[i] = 1.0;
      } else {
        targetOpacities[i] = 0.04;
      }
    }

    // Запускаем анимацию
    if (filterAnimation) cancelAnimationFrame(filterAnimation);

    const currentOpacities = geometry.attributes.aOpacity.array;
    const startOpacities = new Float32Array(currentOpacities);
    const startTime = performance.now();
    const duration = 600;

    function animateFilter() {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic

      for (let i = 0; i < count; i++) {
        currentOpacities[i] = startOpacities[i] + (targetOpacities[i] - startOpacities[i]) * eased;
      }
      geometry.attributes.aOpacity.needsUpdate = true;

      if (t < 1) {
        filterAnimation = requestAnimationFrame(animateFilter);
      }
    }
    animateFilter();
  }

  /**
   * Добавить новый след с эффектом вспышки
   */
  function addTrace(trace) {
    traces.push(trace);
    // Для MVP — визуальная вспышка без реального добавления в BufferGeometry
    // (BufferGeometry имеет фиксированный размер, расширение будет в полной версии)
    flashAt(trace.lat, trace.lng, trace.color);
  }

  /**
   * Вспышка в точке
   */
  function flashAt(lat, lng, color) {
    const pos = latLngToVector3(lat, lng, 1.02);
    const flashGeo = new THREE.SphereGeometry(0.008, 12, 12);
    const flashMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 1,
    });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.set(pos.x, pos.y, pos.z);
    scene.add(flash);

    const startTime = performance.now();
    function animateFlash() {
      const elapsed = performance.now() - startTime;
      const t = elapsed / 1500;
      if (t >= 1) {
        scene.remove(flash);
        flashGeo.dispose();
        flashMat.dispose();
        return;
      }
      const scale = 1 + t * 4;
      flash.scale.setScalar(scale);
      flashMat.opacity = 1 - t;
      requestAnimationFrame(animateFlash);
    }
    animateFlash();
  }

  /**
   * Обновление времени (вызывается каждый кадр)
   */
  function update(time) {
    material.uniforms.uTime.value = time;
  }

  /**
   * Найти ближайшие следы к lat/lng
   */
  function getTracesNear(lat, lng, radiusDeg = 15) {
    return traces.filter(t => {
      const dlat = t.lat - lat;
      const dlng = t.lng - lng;
      return Math.sqrt(dlat * dlat + dlng * dlng) < radiusDeg;
    });
  }

  return {
    points,
    setFilter,
    addTrace,
    update,
    getTracesNear,
  };
}
