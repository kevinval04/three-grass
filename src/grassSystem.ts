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
    waveSpeed?: number;
    waveWidth?: number;
    waveIntensity?: number;
    waveRotation?: number;
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
    uniform float waveSpeed;
    uniform float waveWidth;
    uniform float waveIntensity;
    uniform float waveRotation;
    
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    varying float vWindWaveFactor;

    void main() {
      vec4 instancePosition = instanceMatrix * vec4(position, 1.0);
      vec4 worldPosition = modelMatrix * instancePosition;

      float heightFactor = clamp(position.y / 0.3, 0.0, 1.0);

      // Only affect the top part of the blade (e.g., top 40%)
      float tipFactor = smoothstep(0.6, 1.0, heightFactor);

      // Simple sin-based wind, only at the tip
      float wind = sin(time * windFrequency + instancePosition.x * 0.5 + instancePosition.z * 0.5) * windStrength * tipFactor;

      // Wind wave effect - creates a curved arc flowing across the field
      vec2 windDir = normalize(windDirection);
      
      // Apply rotation to the wave direction
      float cosRot = cos(waveRotation);
      float sinRot = sin(waveRotation);
      vec2 rotatedWindDir = vec2(
        windDir.x * cosRot - windDir.y * sinRot,
        windDir.x * sinRot + windDir.y * cosRot
      );
      
      float waveDistance = dot(instancePosition.xz, rotatedWindDir) + time * waveSpeed;
      float waveEffect = exp(-pow(mod(waveDistance, waveWidth * 2.0) - waveWidth, 2.0) / (waveWidth * 0.3));
      float windWave = waveEffect * waveIntensity * tipFactor;
      
      // Store wind wave factor for fragment shader
      vWindWaveFactor = waveEffect;

      // Combine regular wind and wind wave
      float totalWind = wind + windWave;

      // Apply wind to world position (x and z) using rotated direction
      worldPosition.x += rotatedWindDir.x * totalWind;
      worldPosition.z += rotatedWindDir.y * totalWind;

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
    varying float vWindWaveFactor;
    
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
      
      vec3 finalColor = mix(lerpedColor, lerpedColor, 1.0-shadowIntensity);

      // Increase brightness by multiplying color
      float globalHeight = (vWorldPosition.y + 2.7469) / 3.9002;
      float brightness = 0.6 + pow(globalHeight * 0.5, 0.1);
      
      // Add brightness boost for wind wave effect
      float windWaveBrightness = vWindWaveFactor * 0.35;
      brightness += windWaveBrightness;
      
      gl_FragColor = vec4(finalColor * brightness, 1.0);
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
      windStrength: { value: 0.08 },
      windDirection: { value: new THREE.Vector2(1.0, 0.3) },
      noiseScale: { value: 0.2 },
      windFrequency: { value: 2 },
      turbulence: { value: 0.1 },
      waveSpeed: { value: -9.0 },
      waveWidth: { value: 40.0 },
      waveIntensity: { value: .35 },
      waveRotation: { value: 0.0 },
    },
    
    side: THREE.DoubleSide,
  });
}

function loadPlaneFromGLTF(
  scene: THREE.Scene,
  grassTexture: THREE.Texture,
  waterTexture: THREE.Texture,
  onPlaneLoaded?: (plane: THREE.Mesh, planeSize: number, planeArea: number) => void
): void {
  const loader = new GLTFLoader();

  loader.load("/surface.glb", (gltf) => {
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

// Cache for texture data to avoid recreating canvas each time
let textureDataCache: Map<THREE.Texture, ImageData> = new Map();

function getTextureData(texture: THREE.Texture): ImageData | null {
  if (textureDataCache.has(texture)) {
    return textureDataCache.get(texture)!;
  }

  if (!texture.image) {
    console.warn('Texture has no image data');
    return null;
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    console.warn('Could not get 2D context');
    return null;
  }

  canvas.width = texture.image.width;
  canvas.height = texture.image.height;
  ctx.drawImage(texture.image, 0, 0);
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  textureDataCache.set(texture, imageData);
  
  return imageData;
}

function sampleWaterTexture(position: THREE.Vector3, waterTexture: THREE.Texture, plane: THREE.Mesh): boolean {
  // Get the plane's geometry and compute UV coordinates from world position
  const geometry = plane.geometry as THREE.BufferGeometry;
  const boundingBox = geometry.boundingBox;
  
  if (!boundingBox) {
    console.warn('Plane geometry has no bounding box');
    return false; // Allow grass if we can't sample
  }

  // Convert world position to local position relative to the plane
  const localPosition = position.clone();
  plane.worldToLocal(localPosition);

  // Convert local position to UV coordinates (0-1 range)
  const uvX = (localPosition.x - boundingBox.min.x) / (boundingBox.max.x - boundingBox.min.x);
  const uvY = (localPosition.z - boundingBox.min.z) / (boundingBox.max.z - boundingBox.min.z);

  // Clamp UV coordinates to [0, 1] range
  const clampedUvX = Math.max(0, Math.min(1, uvX));
  const clampedUvY = Math.max(0, Math.min(1, uvY));

  // Get cached texture data
  const imageData = getTextureData(waterTexture);
  if (!imageData) {
    return false; // Allow grass if we can't sample
  }

  // Get pixel at UV coordinates
  const pixelX = Math.floor(clampedUvX * (imageData.width - 1));
  const pixelY = Math.floor(clampedUvY * (imageData.height - 1));
  
  // Calculate pixel index in the ImageData array
  const pixelIndex = (pixelY * imageData.width + pixelX) * 4; // 4 bytes per pixel (RGBA)
  const red = imageData.data[pixelIndex];
  
  // If the pixel is white (or close to white), exclude grass
  // Assuming white = 255, black = 0 in the texture
  const isWhite = red > 128; // Threshold for white vs black
  
  return isWhite; // Return true if should exclude grass (white pixel)
}

function createGrassInstances(
  scene: THREE.Scene,
  plane: THREE.Mesh,
  grassMaterial: THREE.ShaderMaterial,
  planeArea: number,
  exclusionZones: GrassExclusionZone[] = [],
  waterTexture?: THREE.Texture | null
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

      // Track min and max world Y positions
      let minWorldY = Infinity;
      let maxWorldY = -Infinity;

      let instanceIndex = 0;
      for (let i = 0; i < 60 * 60 * GRASS_DENSITY && instanceIndex < instanceCount; i++) {
        sampler.sample(position);
        plane.localToWorld(position);
        position.y += 0.01;

        // Skip this position if it's in an exclusion zone
        if (isPositionInExclusionZone(position, exclusionZones)) {
          continue;
        }

        // Skip this position if water texture indicates exclusion (white pixel)
        if (waterTexture && sampleWaterTexture(position, waterTexture, plane)) {
          continue;
        }

        const s = biasedRandomScale(1, 2.5);
        scale.set(s, s, s);
        rotation.set(0, Math.random() * Math.PI * 2, 0);

        // Track the world Y position for this grass instance
        minWorldY = Math.min(minWorldY, position.y);
        maxWorldY = Math.max(maxWorldY, position.y);

        matrix.compose(position, new THREE.Quaternion().setFromEuler(rotation), scale);
        instancedMesh.setMatrixAt(instanceIndex, matrix);
        instanceIndex++;
      }

      // Log the min and max world Y positions of all grass instances
      console.log(`Grass World Y Positions - Min: ${minWorldY.toFixed(4)}, Max: ${maxWorldY.toFixed(4)}, Range: ${(maxWorldY - minWorldY).toFixed(4)}`);
      
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

export function createGrassSystem(scene: THREE.Scene, initialExclusionZones: GrassExclusionZone[] = [], waterTexture?: THREE.Texture | null): GrassSystem {
  const textureLoader = new THREE.TextureLoader();
  const grassTexture = textureLoader.load("/grass1.png");

  grassTexture.colorSpace = THREE.SRGBColorSpace;
  grassTexture.magFilter = THREE.LinearFilter;
  grassTexture.minFilter = THREE.LinearMipmapLinearFilter;
  grassTexture.generateMipmaps = true;
  grassTexture.flipY = false; // default for GLTF-converted meshes is often false
  grassTexture.rotation = 0;
  grassTexture.center.set(0.5, 0.5);
  grassTexture.repeat.set(1, 1);
  grassTexture.offset.set(0, 0);

  let grassMaterial: THREE.ShaderMaterial | null = null;
  let plane: THREE.Mesh | null = null;
  let exclusionZones: GrassExclusionZone[] = [...initialExclusionZones];

  loadPlaneFromGLTF(scene, grassTexture, waterTexture as THREE.Texture, (loadedPlane, planeSize, planeArea) => {
    plane = loadedPlane;
    const textureRepeat = new THREE.Vector2(1, 1);
    grassMaterial = createGrassShaderMaterial(grassTexture, planeSize, textureRepeat);
    createGrassInstances(scene, plane, grassMaterial, planeArea, exclusionZones, waterTexture);
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
    waveSpeed?: number;
    waveWidth?: number;
    waveIntensity?: number;
    waveRotation?: number;
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
    if (params.waveSpeed !== undefined) {
      grassMaterial.uniforms.waveSpeed.value = params.waveSpeed;
    }
    if (params.waveWidth !== undefined) {
      grassMaterial.uniforms.waveWidth.value = params.waveWidth;
    }
    if (params.waveIntensity !== undefined) {
      grassMaterial.uniforms.waveIntensity.value = params.waveIntensity;
    }
    if (params.waveRotation !== undefined) {
      grassMaterial.uniforms.waveRotation.value = params.waveRotation;
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
