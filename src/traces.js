// ─────────────────────────────────────────────
// Traces: точки-следы на глобусе (Кристальные ядра)
// ─────────────────────────────────────────────
import * as THREE from 'three';
import { latLngToVector3 } from './data.js';

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

    // Изящная пульсация
    float pulse = 1.0 + 0.2 * sin(uTime * 2.0 + aPhase * 6.28);

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // Размер attenuation (уменьшается при отдалении) - сделан значительно меньше
    gl_PointSize = aSize * pulse * uPixelRatio * (50.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Фрагментный шейдер: Резкое ядро + мягкий ореол
const traceFragmentShader = `
  varying vec3 vColor;
  varying float vOpacity;

  void main() {
    vec2 xy = gl_PointCoord.xy - vec2(0.5);
    float dist = length(xy);
    if(dist > 0.5) discard;

    // Резкое, почти белое ядро в самом центре (как у звезды)
    float core = exp(-dist * dist * 300.0);
    
    // Мягкое широкое свечение (более плотное и компактное)
    float glow = exp(-dist * dist * 40.0) * 0.5;
    
    float alpha = core + glow;
    
    // Слегка "пересвечиваем" цвет для эффекта Bloom (HDR-like)
    vec3 bloomColor = vColor * 1.2;

    gl_FragColor = vec4(bloomColor, alpha * vOpacity);
  }
`;

export function createTraces(scene, traces) {
  const count = traces.length;

  const positions = new Float32Array(count * 3);
  const colors    = new Float32Array(count * 3);
  const sizes     = new Float32Array(count);
  const opacities = new Float32Array(count);
  const phases    = new Float32Array(count);
  const categoryIndices = [];

  const tempColor = new THREE.Color();
  const GLOBE_RADIUS = 1.002; // Практически лежат на поверхности

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

    // Базовый размер
    sizes[i]     = 0.4 + Math.random() * 0.3;
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
    // AdditiveBlending снова включен! 
    // Поскольку шейдер теперь имеет резкое узкое ядро и мягкий спад, 
    // сложение цветов даст красивый эффект "сгустка энергии", а не белый квадрат.
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime:       { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  // ── API ──

  let filterAnimation = null;

  function setFilter(categoryId) {
    const targetOpacities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      if (!categoryId || categoryIndices[i] === categoryId) {
        targetOpacities[i] = 1.0;
      } else {
        targetOpacities[i] = 0.02; // почти невидимы
      }
    }

    if (filterAnimation) cancelAnimationFrame(filterAnimation);

    const currentOpacities = geometry.attributes.aOpacity.array;
    const startOpacities = new Float32Array(currentOpacities);
    const startTime = performance.now();
    const duration = 600;

    function animateFilter() {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);

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

  function addTrace(trace) {
    traces.push(trace);
    flashAt(trace.lat, trace.lng, trace.color);
  }

  function flashAt(lat, lng, color) {
    const pos = latLngToVector3(lat, lng, 1.005);
    // Крошечная вспышка-ядро
    const flashGeo = new THREE.SphereGeometry(0.005, 12, 12);
    const flashMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(2.0), // HDR boost
      transparent: true,
      opacity: 1,
    });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.set(pos.x, pos.y, pos.z);
    scene.add(flash);

    const startTime = performance.now();
    function animateFlash() {
      const elapsed = performance.now() - startTime;
      const t = elapsed / 1000;
      if (t >= 1) {
        scene.remove(flash);
        flashGeo.dispose();
        flashMat.dispose();
        return;
      }
      const scale = 1 + t * 5;
      flash.scale.setScalar(scale);
      flashMat.opacity = 1 - t;
      requestAnimationFrame(animateFlash);
    }
    animateFlash();
  }

  function update(time) {
    material.uniforms.uTime.value = time;
  }

  function getTracesNear(lat, lng, radiusDeg = 15) {
    return traces.filter(t => {
      const dlat = t.lat - lat;
      const dlng = t.lng - lng;
      return Math.sqrt(dlat * dlat + dlng * dlng) < radiusDeg;
    });
  }

  return { points, setFilter, addTrace, update, getTracesNear };
}
