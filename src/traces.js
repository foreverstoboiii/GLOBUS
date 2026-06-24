// ─────────────────────────────────────────────
// Traces: точки-следы, Object Pooling, Energy Arcs
// ─────────────────────────────────────────────
import * as THREE from 'three';
import gsap from 'gsap';
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

    float pulse = 1.0 + 0.2 * sin(uTime * 2.0 + aPhase * 6.28);

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * pulse * uPixelRatio * (50.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const traceFragmentShader = `
  varying vec3 vColor;
  varying float vOpacity;

  void main() {
    vec2 xy = gl_PointCoord.xy - vec2(0.5);
    float dist = length(xy);
    if(dist > 0.5) discard;

    float core = exp(-dist * dist * 300.0);
    float glow = exp(-dist * dist * 40.0) * 0.5;
    float alpha = core + glow;
    
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
  const GLOBE_RADIUS = 1.002;

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
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime:       { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  // ── Object Pooling для вспышек ──
  const flashPoolSize = 20;
  const flashPool = [];
  const flashGeo = new THREE.SphereGeometry(0.005, 12, 12);
  
  for (let i = 0; i < flashPoolSize; i++) {
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.visible = false;
    scene.add(flash);
    flashPool.push({ mesh: flash, active: false });
  }

  function getFreeFlash() {
    return flashPool.find(f => !f.active);
  }

  function flashAt(lat, lng, color) {
    const poolObj = getFreeFlash();
    if (!poolObj) return; // Пул исчерпан

    poolObj.active = true;
    const mesh = poolObj.mesh;
    
    const pos = latLngToVector3(lat, lng, 1.005);
    mesh.position.copy(pos);
    mesh.material.color.set(color).multiplyScalar(2.0); // HDR boost
    mesh.visible = true;
    mesh.scale.setScalar(1);
    mesh.material.opacity = 1;

    gsap.to(mesh.scale, {
      x: 6, y: 6, z: 6,
      duration: 1.0,
      ease: "power2.out"
    });
    
    gsap.to(mesh.material, {
      opacity: 0,
      duration: 1.0,
      ease: "power2.out",
      onComplete: () => {
        mesh.visible = false;
        poolObj.active = false;
      }
    });
  }

  // ── Energy Arcs (Кинетические дуги) ──
  // Пользователь "отправляет" мысль
  function shootArc(startLat, startLng, endLat, endLng, color, onComplete) {
    const startPos = latLngToVector3(startLat, startLng, GLOBE_RADIUS);
    const endPos = latLngToVector3(endLat, endLng, GLOBE_RADIUS);

    // Контрольная точка для дуги (поднимаем вверх над поверхностью)
    const midPos = startPos.clone().add(endPos).multiplyScalar(0.5);
    const dist = startPos.distanceTo(endPos);
    midPos.normalize().multiplyScalar(GLOBE_RADIUS + dist * 0.5);

    const curve = new THREE.QuadraticBezierCurve3(startPos, midPos, endPos);
    
    // Светящийся "снаряд"
    const projectileGeo = new THREE.SphereGeometry(0.015, 12, 12);
    const projectileMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(3.0),
      transparent: true,
      blending: THREE.AdditiveBlending
    });
    const projectile = new THREE.Mesh(projectileGeo, projectileMat);
    scene.add(projectile);

    const proxy = { t: 0 };
    gsap.to(proxy, {
      t: 1,
      duration: 1.5,
      ease: "power2.inOut",
      onUpdate: () => {
        const point = curve.getPoint(proxy.t);
        projectile.position.copy(point);
      },
      onComplete: () => {
        scene.remove(projectile);
        projectileGeo.dispose();
        projectileMat.dispose();
        flashAt(endLat, endLng, color);
        if (onComplete) onComplete();
      }
    });
  }

  // ── Фильтры через GSAP ──
  function setFilter(categoryId) {
    const targetOpacities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      if (!categoryId || categoryIndices[i] === categoryId) {
        targetOpacities[i] = 1.0;
      } else {
        targetOpacities[i] = 0.02;
      }
    }

    const currentOpacities = geometry.attributes.aOpacity.array;
    
    // GSAP может анимировать массивы
    gsap.to(currentOpacities, {
      endArray: targetOpacities,
      duration: 0.6,
      ease: "power2.out",
      onUpdate: () => {
        geometry.attributes.aOpacity.needsUpdate = true;
      }
    });
  }

  function addTrace(trace, userLat, userLng) {
    traces.push(trace);
    
    if (userLat !== undefined && userLng !== undefined) {
      shootArc(userLat, userLng, trace.lat, trace.lng, trace.color, () => {
        // Мы не добавляем новую точку аппаратно в буфер для перформанса
        // (в реальном проекте нужен был бы dynamic buffer)
      });
    } else {
      flashAt(trace.lat, trace.lng, trace.color);
    }
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

  return { points, setFilter, addTrace, update, getTracesNear, flashAt, shootArc };
}
