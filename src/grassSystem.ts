import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";

export const GRASS_DENSITY = 12;

export interface GrassExclusionZone {
  center: THREE.Vector3;
  radius: number;
}

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
  addExclusionZone: (zone: GrassExclusionZone) => void;
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

    void main() {
      vec4 instancePosition = instanceMatrix * vec4(position, 1.0);
      vec4 worldPosition = modelMatrix * instancePosition;

      // Calculate height factor to ensure bottom is completely unaffected
      // Assumes grass blade height is around 2.0 units - adjust the divisor as needed
      float heightFactor = clamp(instancePosition.y / 2.0, 0.0, 1.0);

      // Only affect the top part of the blade (e.g., top 40%)
      float tipFactor = smoothstep(0.6, 1.0, heightFactor);

      // Simple sin-based wind, only at the tip
      float wind = sin(time * windFrequency + instancePosition.x * 0.5 + instancePosition.z * 0.5) * windStrength * tipFactor;

      // Wind direction
      vec2 windDir = normalize(windDirection);

      // Apply wind to world position (x and z)
      worldPosition.x += windDir.x * wind;
      worldPosition.z += windDir.y * wind;

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

      float shadowIntensity = 0.5;
      
      vec3 finalColor = mix(lerpedColor, lerpedColor, 1.0-shadowIntensity);

      // Increase brightness by multiplying color
      gl_FragColor = vec4(finalColor, 1.0);
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
      windFrequency: { value: 2 },
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

function isPositionInExclusionZone(position: THREE.Vector3, exclusionZones: GrassExclusionZone[]): boolean {
  for (const zone of exclusionZones) {
    const distance = position.distanceTo(zone.center);
    if (distance <= zone.radius) {
      return true;
    }
  }
  return false;
}

function createGrassInstances(
  scene: THREE.Scene,
  plane: THREE.Mesh,
  grassMaterial: THREE.ShaderMaterial,
  planeArea: number,
  exclusionZones: GrassExclusionZone[] = []
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

      let instanceIndex = 0;
      for (let i = 0; i < 60 * 60 * GRASS_DENSITY && instanceIndex < instanceCount; i++) {
        sampler.sample(position);
        plane.localToWorld(position);
        position.y += 0.01;

        // Skip this position if it's in an exclusion zone
        if (isPositionInExclusionZone(position, exclusionZones)) {
          continue;
        }

        const s = biasedRandomScale(1, 2.5);
        scale.set(s, s, s);
        rotation.set(0, Math.random() * Math.PI * 2, 0);

        matrix.compose(position, new THREE.Quaternion().setFromEuler(rotation), scale);
        instancedMesh.setMatrixAt(instanceIndex, matrix);
        instanceIndex++;
      }
      
      // Set remaining instances to invisible if we didn't fill all slots
      for (let i = instanceIndex; i < instanceCount; i++) {
        matrix.makeScale(0, 0, 0); // Make invisible
        instancedMesh.setMatrixAt(i, matrix);
      }

      instancedMesh.instanceMatrix.needsUpdate = true;
      scene.add(instancedMesh);
    }
  });
}

export function createGrassSystem(scene: THREE.Scene, initialExclusionZones: GrassExclusionZone[] = []): GrassSystem {
  const textureLoader = new THREE.TextureLoader();
  const grassTexture = textureLoader.load("/grass.png");

  grassTexture.colorSpace = THREE.SRGBColorSpace;
  grassTexture.magFilter = THREE.LinearFilter;
  grassTexture.minFilter = THREE.LinearMipmapLinearFilter;
  grassTexture.generateMipmaps = true;
  grassTexture.flipY = true;

  let grassMaterial: THREE.ShaderMaterial | null = null;
  let plane: THREE.Mesh | null = null;
  let exclusionZones: GrassExclusionZone[] = [...initialExclusionZones];

  loadPlaneFromGLTF(scene, grassTexture, (loadedPlane, planeSize, planeArea) => {
    plane = loadedPlane;
    const textureRepeat = new THREE.Vector2(1, 1);
    grassMaterial = createGrassShaderMaterial(grassTexture, planeSize, textureRepeat);
    createGrassInstances(scene, plane, grassMaterial, planeArea, exclusionZones);
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

  const addExclusionZone = (zone: GrassExclusionZone) => {
    exclusionZones.push(zone);
    // Note: This will only affect future grass generation
    // To update existing grass, you'd need to regenerate the instances
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
    addExclusionZone,
  };
}
