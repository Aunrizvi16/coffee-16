/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  evaluateArabicaSurface,
  dampVelocity,
  computeBeanDynamics,
  computeProgressFactors,
  wrapPosition,
  ROAST_PALETTE,
  createSeededRandom,
} from './beanMath';

export interface BeansController {
  setScrollVelocity: (v: number) => void;
  setProgress: (p: number) => void;
  setDensity: (n: number) => void;
  dispose: () => void;
}

interface BeanInstanceData {
  x: number;
  y: number;
  z: number;
  driftPhase: number;
  driftSpeed: number;
  rotSpeed: number;
  rotAxis: THREE.Vector3;
  currentQuat: THREE.Quaternion;
  baseScale: THREE.Vector3;
}

/**
 * Procedurally generates an Arabica coffee bean BufferGeometry with
 * smooth vertex normals, calculated tangents, and vertex colors for inner fissure darkening.
 */
function createArabicaBeanGeometry(): THREE.BufferGeometry {
  const segmentsU = 40;
  const segmentsV = 48;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= segmentsV; j++) {
    const v = (j / segmentsV) * Math.PI - Math.PI / 2;
    const vNorm = j / segmentsV;

    for (let i = 0; i <= segmentsU; i++) {
      const u = (i / segmentsU) * (2 * Math.PI) - Math.PI;
      const uNorm = i / segmentsU;

      const pt = evaluateArabicaSurface(u, v);
      positions.push(pt.x, pt.y, pt.z);
      uvs.push(uNorm, vNorm);

      // Vertex color: inside the crease is shaded with burnt dark espresso tones
      const crease = pt.creaseFactor;
      if (crease > 0.05) {
        // Deep fissure darkening
        const r = THREE.MathUtils.lerp(1.0, 0.22, crease);
        const g = THREE.MathUtils.lerp(1.0, 0.12, crease);
        const b = THREE.MathUtils.lerp(1.0, 0.07, crease);
        colors.push(r, g, b);
      } else {
        colors.push(1.0, 1.0, 1.0);
      }
    }
  }

  // Construct index buffer with smooth winding
  for (let j = 0; j < segmentsV; j++) {
    for (let i = 0; i < segmentsU; i++) {
      const a = j * (segmentsU + 1) + i;
      const b = (j + 1) * (segmentsU + 1) + i;
      const c = (j + 1) * (segmentsU + 1) + (i + 1);
      const d = j * (segmentsU + 1) + (i + 1);

      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);

  geometry.computeVertexNormals();

  // Tangents for bump map illumination
  const posCount = geometry.getAttribute('position').count;
  const tangents = new Float32Array(posCount * 4);
  for (let i = 0; i < posCount; i++) {
    tangents[i * 4] = 1.0;
    tangents[i * 4 + 1] = 0.0;
    tangents[i * 4 + 2] = 0.0;
    tangents[i * 4 + 3] = 1.0;
  }
  geometry.setAttribute('tangent', new THREE.BufferAttribute(tangents, 4));

  return geometry;
}

/**
 * Generates procedural roasted bean skin micro-relief canvas texture.
 */
function createCoffeeSurfaceTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  const rng = createSeededRandom(9102);
  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      // Gentle cellular roasting grain
      const cellularGrain = rng() * 12 - 6;
      // Subtle longitudinal cooling micro-creases
      const longitudinal = Math.sin(x * 0.15 + Math.sin(y * 0.05) * 2.5) * 4;
      // Soft organic skin mottle
      const mottle = Math.sin((x / size) * Math.PI * 3) * Math.cos((y / size) * Math.PI * 3) * 5;

      const val = Math.min(255, Math.max(0, 128 + cellularGrain + longitudinal + mottle));
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.generateMipmaps = true;

  return texture;
}

/**
 * Initializes the full-window floating coffee bean Three.js scene.
 */
export function initBeans(canvas: HTMLCanvasElement): BeansController {
  // Detect software WebGL
  const isSoftwareGl = (() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  })();

  const scene = new THREE.Scene();

  // Perspective camera
  const camera = new THREE.PerspectiveCamera(
    36,
    canvas.clientWidth / (canvas.clientHeight || 1),
    0.1,
    30
  );
  camera.position.set(0, 0, 5.6);

  // Renderer with transparent background
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
    premultipliedAlpha: false,
  });

  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

  // Studio PBR Environment
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const roomEnv = new RoomEnvironment();
  const envTexture = pmremGenerator.fromScene(roomEnv, 0.04).texture;
  scene.environment = envTexture;
  roomEnv.dispose();
  pmremGenerator.dispose();

  // Cinematic Lighting:
  // Warm amber key light from upper right
  const keyLight = new THREE.DirectionalLight(0xffbe85, 2.4);
  keyLight.position.set(6.5, 7.5, 5.0);
  scene.add(keyLight);

  // Soft warm rim light from lower-left back
  const rimLight = new THREE.DirectionalLight(0xff8833, 1.6);
  rimLight.position.set(-6.5, -3.5, -4.5);
  scene.add(rimLight);

  // Subtle top edge accent
  const topLight = new THREE.DirectionalLight(0xffcaa0, 1.0);
  topLight.position.set(0, 7.0, -2.5);
  scene.add(topLight);

  // Dim fill light
  const fillLight = new THREE.HemisphereLight(0x3a2517, 0x120a06, 0.65);
  scene.add(fillLight);

  // Procedural geometry & textures
  const beanGeometry = createArabicaBeanGeometry();
  const bumpTexture = createCoffeeSurfaceTexture();
  bumpTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  // Depth-of-Field uniforms
  const dofUniforms = {
    uFocalDistance: { value: 5.6 }, // Sharp focus plane at distance 5.6 (around z=0)
    uFocalRange: { value: 1.8 },
    uDefocusStrength: { value: 1.0 },
  };

  // MeshPhysicalMaterial: authentic roasted Arabica coffee bean
  // Deep espresso to warm chestnut, soft natural oil sheen (clearcoat), fine texture
  const beanMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.54,
    metalness: 0.02,
    clearcoat: 0.28,             // Soft natural oily sheen
    clearcoatRoughness: 0.38,
    bumpMap: bumpTexture,
    bumpScale: 0.0035,
    sheen: 0.35,
    sheenColor: new THREE.Color(0x8a4b24),
    vertexColors: true,
    transparent: true,
    opacity: 1.0,
  });

  // Inject optical depth-of-field into material
  beanMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uFocalDistance = dofUniforms.uFocalDistance;
    shader.uniforms.uFocalRange = dofUniforms.uFocalRange;
    shader.uniforms.uDefocusStrength = dofUniforms.uDefocusStrength;

    shader.vertexShader = `
      varying float vViewZ;
      ${shader.vertexShader}
    `.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vViewZ = - (modelViewMatrix * vec4(transformed, 1.0)).z;
      `
    );

    shader.fragmentShader = `
      uniform float uFocalDistance;
      uniform float uFocalRange;
      uniform float uDefocusStrength;
      varying float vViewZ;
      ${shader.fragmentShader}
    `.replace(
      '#include <dithering_fragment>',
      `
      #include <dithering_fragment>

      // Optical circle of confusion
      float coc = clamp(abs(vViewZ - uFocalDistance) / uFocalRange, 0.0, 1.0);
      coc = pow(coc, 1.25) * uDefocusStrength;

      // Soft photographic defocus rolloff at silhouettes
      float fresnel = 1.0 - max(0.0, dot(normalize(vNormal), normalize(-vViewPosition)));
      float edgeSoft = smoothstep(0.0, 1.0, 1.0 - fresnel * coc * 0.45);
      gl_FragColor.a *= edgeSoft;

      // Atmospheric warm falloff on distant/near blurred beans
      vec3 atmosphericTint = vec3(0.09, 0.055, 0.035);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, atmosphericTint, coc * 0.28);
      `
    );
  };

  const MAX_BEANS = 90;
  const DEFAULT_BEANS = 40;
  let currentDensity = DEFAULT_BEANS;

  const instancedMesh = new THREE.InstancedMesh(beanGeometry, beanMaterial, MAX_BEANS);
  instancedMesh.count = currentDensity;
  instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(instancedMesh);

  // Initialize individual beans
  const rng = createSeededRandom(2026);
  const beanData: BeanInstanceData[] = [];

  const tempColor = new THREE.Color();
  const tempMatrix = new THREE.Matrix4();
  const tempQuat = new THREE.Quaternion();
  const tempScale = new THREE.Vector3();
  const tempPos = new THREE.Vector3();
  const rotDelta = new THREE.Quaternion();

  for (let i = 0; i < MAX_BEANS; i++) {
    // 3D Depth distribution:
    // Focus plane (z in [-0.5, 0.4]): ~35% in crisp sharp focus
    // Background (z in [-2.8, -1.0]): ~40% softly blurred in depth
    // Foreground (z in [0.7, 1.5]): ~25% in soft foreground bokeh
    let z: number;
    const bucket = rng();
    if (bucket < 0.38) {
      z = (rng() - 0.5) * 0.8;
    } else if (bucket < 0.74) {
      z = -1.0 - rng() * 1.8;
    } else {
      z = 0.7 + rng() * 0.85;
    }

    // Viewport spatial spread
    const depthFrustum = 1.0 - z * 0.22;
    const x = (rng() - 0.5) * 6.2 * depthFrustum;
    const y = (rng() - 0.5) * 6.8;

    // Initial random tumble orientation
    const q = new THREE.Quaternion();
    q.setFromEuler(
      new THREE.Euler(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2)
    );

    // Rotation axis and gentle baseline tumble speed
    const axis = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
    const rotSpeed = 0.10 + rng() * 0.22;

    // Subtle individual bean size variation (scale ~ 0.42 to 0.54)
    const uniformScale = 0.42 + rng() * 0.14;
    const aspectX = 0.94 + rng() * 0.12;
    const aspectY = 0.92 + rng() * 0.16;
    const aspectZ = 0.95 + rng() * 0.10;
    const baseScale = new THREE.Vector3(
      uniformScale * aspectX,
      uniformScale * aspectY,
      uniformScale * aspectZ
    );

    beanData.push({
      x,
      y,
      z,
      driftPhase: rng() * Math.PI * 2,
      driftSpeed: 0.25 + rng() * 0.35,
      rotSpeed,
      rotAxis: axis,
      currentQuat: q,
      baseScale,
    });

    // Realistic roast color from deep espresso to warm chestnut
    const colorHex = ROAST_PALETTE[Math.floor(rng() * ROAST_PALETTE.length)];
    tempColor.set(colorHex);
    // Subtle natural roast variation
    const jitter = (rng() - 0.5) * 0.05;
    tempColor.r = Math.min(1, Math.max(0, tempColor.r + jitter));
    tempColor.g = Math.min(1, Math.max(0, tempColor.g + jitter * 0.5));
    tempColor.b = Math.min(1, Math.max(0, tempColor.b + jitter * 0.25));

    instancedMesh.setColorAt(i, tempColor);
  }

  if (instancedMesh.instanceColor) {
    instancedMesh.instanceColor.needsUpdate = true;
  }

  // Interaction State
  let targetScrollVelocity = 0;
  let currentScrollVelocity = 0;
  let targetProgress = 0;
  let currentProgress = 0;

  let isDisposed = false;
  let isPaused = false;
  let frameId = 0;
  let lastTime = performance.now();
  let totalTime = 0;

  function renderFrame(now: number) {
    if (isDisposed) return;

    if (isPaused) {
      frameId = requestAnimationFrame(renderFrame);
      return;
    }

    const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;
    totalTime += dt;

    // Damp velocities smoothly
    currentScrollVelocity = dampVelocity(currentScrollVelocity, targetScrollVelocity, 3.2, dt);
    targetScrollVelocity = dampVelocity(targetScrollVelocity, 0, 2.6, dt);
    currentProgress = dampVelocity(currentProgress, targetProgress, 3.8, dt);

    const { tumbleMultiplier, streamUpSpeed } = computeBeanDynamics(currentScrollVelocity);
    const { spreadScale, sizeMultiplier, blurMultiplier } = computeProgressFactors(currentProgress);

    dofUniforms.uDefocusStrength.value = blurMultiplier;

    for (let i = 0; i < currentDensity; i++) {
      const bean = beanData[i];

      // Tumble: speeds up with scroll velocity, returns to slow drift at rest
      const rotAngle = bean.rotSpeed * tumbleMultiplier * dt;
      rotDelta.setFromAxisAngle(bean.rotAxis, rotAngle);
      bean.currentQuat.multiply(rotDelta);

      // Upward drift
      bean.y += streamUpSpeed * dt;

      // Wrap smoothly at viewport boundary
      const wrapResult = wrapPosition(bean.y, 4.6);
      if (wrapResult.didWrap) {
        bean.y = wrapResult.y;
        bean.x = (rng() - 0.5) * 5.8 * (1.0 - bean.z * 0.2);
      }

      // Gentle organic 3D drift oscillation
      const driftX = Math.sin(totalTime * bean.driftSpeed + bean.driftPhase) * 0.06;
      const driftZ = Math.cos(totalTime * (bean.driftSpeed * 0.7) + bean.driftPhase) * 0.04;

      tempPos.set(
        (bean.x + driftX) * spreadScale,
        bean.y * spreadScale,
        bean.z + driftZ
      );

      tempScale.copy(bean.baseScale).multiplyScalar(sizeMultiplier);

      tempMatrix.compose(tempPos, bean.currentQuat, tempScale);
      instancedMesh.setMatrixAt(i, tempMatrix);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.computeBoundingSphere();

    renderer.render(scene, camera);

    if (isSoftwareGl) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      if (sync) {
        const poll = () => {
          if (isDisposed) return;
          const status = gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (status === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 4);
          } else {
            gl.deleteSync(sync);
            frameId = window.setTimeout(() => {
              renderFrame(performance.now());
            }, 60);
          }
        };
        frameId = window.setTimeout(poll, 4);
      } else {
        frameId = window.setTimeout(() => {
          renderFrame(performance.now());
        }, 60);
      }
    } else {
      frameId = requestAnimationFrame(renderFrame);
    }
  }

  function handleResize() {
    if (isDisposed) return;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height, false);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.5));
  }

  function handleVisibilityChange() {
    isPaused = document.hidden;
    if (!isPaused) {
      lastTime = performance.now();
    }
  }

  window.addEventListener('resize', handleResize);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  handleResize();
  frameId = requestAnimationFrame(renderFrame);

  return {
    setScrollVelocity(v: number) {
      targetScrollVelocity = v;
      currentScrollVelocity += v * 0.45;
    },
    setProgress(p: number) {
      targetProgress = Math.max(0, Math.min(1, p));
    },
    setDensity(n: number) {
      const clamped = Math.max(1, Math.min(MAX_BEANS, Math.round(n)));
      currentDensity = clamped;
      instancedMesh.count = clamped;
      instancedMesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      if (isDisposed) return;
      isDisposed = true;

      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (isSoftwareGl) {
        clearTimeout(frameId);
      } else {
        cancelAnimationFrame(frameId);
      }

      beanGeometry.dispose();
      bumpTexture.dispose();
      beanMaterial.dispose();
      envTexture.dispose();
      renderer.dispose();
    },
  };
}
