import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";

export const GRASS_DENSITY = 12;

export interface GrassSystem {
  plane: THREE.Mesh | null;
  grassMaterial: THREE.ShaderMaterial;
  updateWind: (time: number) => void;
  setWindParameters: (params: {
    strength?: number;
    direction?: THREE.Vector2;
    noiseScale?: number;
    frequency?: number;
    turbulence?: number;
  }) => void;
}

function createGrassShaderMaterial(
  grassTexture: THREE.Texture,
  planeSize: number,
  textureRepeat: THREE.Vector2
): THREE.ShaderMaterial {
  const vertexShader = `
    uniform float time;
    uniform float windStrength;
    uniform vec2 windDirection;
    uniform float noiseScale;
    uniform float windFrequency;
    uniform float turbulence;
    
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    
    // 3D Simplex noise function
    vec3 mod289(vec3 x) {
      return x - floor(x * (1.0 / 289.0)) * 289.0;
    }
    
    vec4 mod289(vec4 x) {
      return x - floor(x * (1.0 / 289.0)) * 289.0;
    }
    
    vec4 permute(vec4 x) {
      return mod289(((x*34.0)+1.0)*x);
    }
    
    vec4 taylorInvSqrt(vec4 r) {
      return 1.79284291400159 - 0.85373472095314 * r;
    }
    
    float snoise(vec3 v) {
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      
      vec3 i = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      
      i = mod289(i);
      vec4 p = permute(permute(permute(
                 i.z + vec4(0.0, i1.z, i2.z, 1.0))
               + i.y + vec4(0.0, i1.y, i2.y, 1.0))
               + i.x + vec4(0.0, i1.x, i2.x, 1.0));
      
      float n_ = 0.142857142857;
      vec3 ns = n_ * D.wyz - D.xzx;
      
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);
      
      vec4 x = x_ *ns.x + ns.yyyy;
      vec4 y = y_ *ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      
      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);
      
      vec4 s0 = floor(b0) * 2.0 + 1.0;
      vec4 s1 = floor(b1) * 2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      
      vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
      
      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);
      
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
      p0 *= norm.x;
      p1 *= norm.y;
      p2 *= norm.z;
      p3 *= norm.w;
      
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }
    
    void main() {
      vec4 instancePosition = instanceMatrix * vec4(position, 1.0);
      vec4 worldPosition = modelMatrix * instancePosition;
      
      float heightFactor = max(0.0, instancePosition.y) / 2.0;
      
      // Create noise-based wind using multiple octaves
      vec3 noisePos = worldPosition.xyz * noiseScale + time * windFrequency;
      
      // Primary wind noise
      float windNoise1 = snoise(noisePos) * 0.5;
      
      // Add turbulence with higher frequency
      float windNoise2 = snoise(noisePos * 2.0 + vec3(100.0)) * 0.3 * turbulence;
      float windNoise3 = snoise(noisePos * 4.0 + vec3(200.0)) * 0.2 * turbulence;
      
      // Combine noise layers
      float combinedNoise = windNoise1 + windNoise2 + windNoise3;
      
      // Apply wind effect with height-based falloff
      float windEffect = combinedNoise * heightFactor * windStrength;
      
      // Create directional wind with some perpendicular turbulence
      vec2 windDir = normalize(windDirection);
      vec2 perpDir = vec2(-windDir.y, windDir.x);
      
      // Main wind direction with some perpendicular turbulence
      float mainWind = windEffect;
      float turbWind = snoise(noisePos * 3.0 + vec3(300.0)) * 0.3 * turbulence * heightFactor;
      
      worldPosition.x += windDir.x * mainWind + perpDir.x * turbWind;
      worldPosition.z += windDir.y * mainWind + perpDir.y * turbWind;
      
      vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
      vPosition = (viewMatrix * worldPosition).xyz;
      vUv = uv;
      vWorldPosition = worldPosition.xyz;
      
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `;

  const fragmentShader = `
    uniform sampler2D grassTexture;
    uniform vec2 textureRepeat;
    uniform float planeSize;
    
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    
    void main() {
      vec2 worldUV = (vWorldPosition.xz + planeSize * 0.5) / planeSize;
      
      vec3 surfaceColor = texture2D(grassTexture, worldUV).rgb;

      // Color gradient from root (texture color) to tip (slightly lighter/greener)
      vec3 rootColor = surfaceColor;  // Use exact texture color at base
      vec3 tipColor = vec3(0.2575, 0.4557, 0.05935);
      // vec3 tipColor = vec3(1.0, 0.0, 0.0);
      float tipColorStrength = 1.0;

      float b = (1.0 - vUv.y) * tipColorStrength;
      vec3 lerpedColor = mix(rootColor, tipColor, distance(vec2(0.0, vUv.y), vec2(0.0,1.0)));

      float shadowIntensity = 0.14;
      
      // vec3 finalColor = mix(lerpedColor, lerpedColor, 1.0-shadowIntensity);

      // Increase brightness by multiplying color
      gl_FragColor = vec4(lerpedColor * 1.25, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      grassTexture: { value: grassTexture },
      textureRepeat: { value: textureRepeat },
      planeSize: { value: planeSize },
      lightDirection: { value: new THREE.Vector3(5, 15, 15).normalize() },
      lightIntensity: { value: 1.0 },
      time: { value: 0.0 },
      windStrength: { value: 0.1 },
      windDirection: { value: new THREE.Vector2(1.0, 0.3) },
      noiseScale: { value: 0.2 },
      windFrequency: { value: 0.3 },
      turbulence: { value: 0.1 },
    },
    
    side: THREE.DoubleSide,
  });
}

function loadPlaneFromGLTF(
  scene: THREE.Scene,
  grassTexture: THREE.Texture,
  onPlaneLoaded?: (plane: THREE.Mesh, planeSize: number, planeArea: number) => void
): void {
  const loader = new GLTFLoader();

  loader.load("/surface2.glb", (gltf) => {
    const surfaceMesh = gltf.scene.children[0];

    if (surfaceMesh && surfaceMesh.type === "Mesh" && surfaceMesh instanceof THREE.Mesh) {
      const geometry: THREE.BufferGeometry = surfaceMesh.geometry.clone();
      geometry.applyMatrix4(surfaceMesh.matrixWorld);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();

      const boundingBox = geometry.boundingBox!;
      const planeWidth = boundingBox.max.x - boundingBox.min.x;
      const planeHeight = boundingBox.max.z - boundingBox.min.z;
      const planeSize = Math.max(planeWidth, planeHeight);
      const planeArea = planeWidth * planeHeight;

      const planeMaterial = new THREE.MeshStandardMaterial({ map: grassTexture });
      const plane = new THREE.Mesh(geometry, planeMaterial);
      plane.position.set(0, 0, 0);
      plane.receiveShadow = true;
      plane.castShadow = false;

      scene.add(plane);

      if (onPlaneLoaded) {
        onPlaneLoaded(plane, planeSize, planeArea);
      }
    }
  });
}

function biasedRandomScale(min: number, max: number): number {
  return min + (max - min) * Math.pow(Math.random(), 2);
}

function createGrassInstances(
  scene: THREE.Scene,
  plane: THREE.Mesh,
  grassMaterial: THREE.ShaderMaterial,
  planeArea: number
): void {
  const loader = new GLTFLoader();
  loader.load("/grass-patch.glb", (gltf) => {
    const grassMesh = gltf.scene.children[0];

    if (grassMesh && grassMesh.type === "Mesh" && grassMesh instanceof THREE.Mesh) {
      const geometry: THREE.BufferGeometry = grassMesh.geometry.clone();
      geometry.applyMatrix4(grassMesh.matrixWorld);
      // geometry.computeVertexNormals();
      geometry.computeBoundingBox();

      const instanceCount = Math.floor(planeArea * GRASS_DENSITY);
      const instancedMesh = new THREE.InstancedMesh(geometry, grassMaterial, instanceCount);
      instancedMesh.castShadow = false;
      instancedMesh.receiveShadow = true;

      const sampler = new MeshSurfaceSampler(plane).build();
      const position = new THREE.Vector3();
      const matrix = new THREE.Matrix4();
      const scale = new THREE.Vector3();
      const rotation = new THREE.Euler();

      for (let i = 0; i < 60 * 60 * GRASS_DENSITY; i++) {
        sampler.sample(position);
        plane.localToWorld(position);
        position.y += 0.01;

        const s = biasedRandomScale(1, 2.5);
        scale.set(s, s, s);
        rotation.set(0, Math.random() * Math.PI * 2, 0);

        matrix.compose(position, new THREE.Quaternion().setFromEuler(rotation), scale);
        instancedMesh.setMatrixAt(i, matrix);
      }

      instancedMesh.instanceMatrix.needsUpdate = true;
      scene.add(instancedMesh);
    }
  });
}

export function createGrassSystem(scene: THREE.Scene): GrassSystem {
  const textureLoader = new THREE.TextureLoader();
  const grassTexture = textureLoader.load("/grass.png");

  grassTexture.colorSpace = THREE.SRGBColorSpace;
  grassTexture.magFilter = THREE.LinearFilter;
  grassTexture.minFilter = THREE.LinearMipmapLinearFilter;
  grassTexture.generateMipmaps = true;
  grassTexture.flipY = true;

  let grassMaterial: THREE.ShaderMaterial | null = null;
  let plane: THREE.Mesh | null = null;

  loadPlaneFromGLTF(scene, grassTexture, (loadedPlane, planeSize, planeArea) => {
    plane = loadedPlane;
    const textureRepeat = new THREE.Vector2(1, 1);
    grassMaterial = createGrassShaderMaterial(grassTexture, planeSize, textureRepeat);
    createGrassInstances(scene, plane, grassMaterial, planeArea);
  });

  const updateWind = (time: number) => {
    if (grassMaterial && grassMaterial.uniforms.time) {
      grassMaterial.uniforms.time.value = time;
    }
  };

  const setWindParameters = (params: {
    strength?: number;
    direction?: THREE.Vector2;
    noiseScale?: number;
    frequency?: number;
    turbulence?: number;
  }) => {
    if (!grassMaterial) return;
    
    if (params.strength !== undefined) {
      grassMaterial.uniforms.windStrength.value = params.strength;
    }
    if (params.direction !== undefined) {
      grassMaterial.uniforms.windDirection.value = params.direction;
    }
    if (params.noiseScale !== undefined) {
      grassMaterial.uniforms.noiseScale.value = params.noiseScale;
    }
    if (params.frequency !== undefined) {
      grassMaterial.uniforms.windFrequency.value = params.frequency;
    }
    if (params.turbulence !== undefined) {
      grassMaterial.uniforms.turbulence.value = params.turbulence;
    }
  };

  return {
    get plane() {
      return plane;
    },
    get grassMaterial() {
      return grassMaterial!;
    },
    updateWind,
    setWindParameters,
  };
}
