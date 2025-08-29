import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";

// Constants
export const MAP_SIZE = 3;
export const PLANE_SIZE = 30 * MAP_SIZE;
export const GRASS_DENSITY = 10; // Grass instances per unit area

export interface GrassSystem {
  plane: THREE.Mesh;
  grassMaterial: THREE.ShaderMaterial;
  updateWind: (time: number) => void;
}

// Create custom grass shader material
function createGrassShaderMaterial(grassTexture: THREE.Texture): THREE.ShaderMaterial {
  const vertexShader = `
    uniform float time;
    uniform float windStrength;
    uniform vec2 windDirection;
    
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    
    void main() {
      // Apply instance matrix transformation
      vec4 instancePosition = instanceMatrix * vec4(position, 1.0);
      vec4 worldPosition = modelMatrix * instancePosition;
      
      // Calculate wind effect based on vertex height (Y position)
      // Higher vertices (tips of grass) sway more than lower ones (base)
      float heightFactor = max(0.0, instancePosition.y) / 2.0; // Normalize height influence
      
      // Create wind wave using sine functions with different frequencies
      float windWave1 = sin(time * 2.0 + worldPosition.x * 0.1 + worldPosition.z * 0.1) * 0.5;
      float windWave2 = sin(time * 3.0 + worldPosition.x * 0.05 + worldPosition.z * 0.15) * 0.3;
      float windWave3 = sin(time * 1.5 + worldPosition.x * 0.2 + worldPosition.z * 0.08) * 0.2;
      
      // Combine wind waves
      float windEffect = (windWave1 + windWave2 + windWave3) * heightFactor * windStrength;
      
      // Apply wind displacement in X and Z directions
      worldPosition.x += windDirection.x * windEffect;
      worldPosition.z += windDirection.y * windEffect;
      
      vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
      vPosition = (viewMatrix * worldPosition).xyz;
      vUv = uv;
      vWorldPosition = worldPosition.xyz;
      
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `
  
  const fragmentShader = `
    uniform sampler2D grassTexture;
    uniform vec2 textureRepeat;
    uniform float planeSize;
    uniform vec3 lightDirection;
    uniform float lightIntensity;
    
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec2 vUv;
    varying vec3 vWorldPosition;

    // Function to increase saturation of an RGB color
    vec3 saturateColor(vec3 color, float saturation) {
      float luma = dot(color, vec3(0.299, 0.587, 0.114));
      return mix(vec3(luma), color, saturation);
    }
    
    void main() {
      // Calculate UV coordinates for sampling the grass texture based on world position
      vec2 worldUV = (vWorldPosition.xz + planeSize * 0.5) / planeSize;
      vec2 repeatedUV = worldUV * textureRepeat;
      
      // Sample the grass texture to get the surface color
      vec3 surfaceColor = texture2D(grassTexture, repeatedUV).rgb;

      // Increase saturation
      float saturationAmount = 1.7; // >1.0 increases saturation
      surfaceColor = saturateColor(surfaceColor, saturationAmount);
      
      // Basic lighting calculation
      vec3 normal = normalize(vNormal);
      vec3 lightDir = normalize(-lightDirection);
      float NdotL = max(dot(normal, lightDir), 0.0);
      
      // For debugging, let's also output the raw surface color to see what we're sampling
      vec3 finalColor = surfaceColor;

      // Apply a gradient along uv.y towards a light yellowish green color
      // Define the target color (light yellowish green)
      vec3 lightYellowGreen = vec3(0.5, 0.8, 1.0); // tweak as needed

      // Blend from finalColor (at base, uv.y=0) to lightYellowGreen (at tip, uv.y=1)
      finalColor = mix(lightYellowGreen, finalColor, clamp(vUv.y, 0.0, 1.0));
         
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `
  
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      grassTexture: { value: grassTexture },
      textureRepeat: { value: new THREE.Vector2(16 * MAP_SIZE, 16 * MAP_SIZE) },
      planeSize: { value: PLANE_SIZE },
      lightDirection: { value: new THREE.Vector3(5, 15, 15).normalize() },
      lightIntensity: { value: 1.0 },
      time: { value: 0.0 },
      windStrength: { value: 0.5 },
      windDirection: { value: new THREE.Vector2(1.0, 0.5) }
    },
    side: THREE.DoubleSide
  })
}

function createPlane(): THREE.Mesh {
  const planeGeometry = new THREE.PlaneGeometry(30 * MAP_SIZE, 30 * MAP_SIZE);
  const planeMaterial = new THREE.MeshStandardMaterial({
    color: 0x5a7c20,
    roughness: 1.0, // fully rough, no shininess
    metalness: 0.0, // no metallic reflection
    envMap: null,   // explicitly no environment reflection
  });
  
  const plane = new THREE.Mesh(planeGeometry, planeMaterial);
  plane.rotation.x = -Math.PI / 2; // Rotate the mesh to lie flat
  plane.position.y = 0; // Explicitly set to 0
  plane.receiveShadow = true; // Enable shadow receiving for grass shadows later
  
  return plane;
}

// Helper: Biased random for more small than big (quadratic bias)
function biasedRandomScale(min: number, max: number): number {
  // Use Math.pow(Math.random(), 2) for quadratic bias toward min
  return min + (max - min) * Math.pow(Math.random(), 2);
}

function createGrassInstances(
  scene: THREE.Scene, 
  plane: THREE.Mesh, 
  grassMaterial: THREE.ShaderMaterial
): void {
  const loader = new GLTFLoader();
  loader.load("/grass-patch.glb", (gltf) => {
    // Inside your GLTFLoader callback for '/grass-patch.glb'
    const grassMesh = gltf.scene.children[0]; // Your full patch mesh

    if (grassMesh && grassMesh.type === "Mesh" && grassMesh instanceof THREE.Mesh) {
      const geometry: THREE.BufferGeometry = grassMesh.geometry.clone();

      // IMPORTANT: Bake the original mesh's transformation into the geometry
      // This preserves the exact look/orientation from Blender (e.g., blade positions/rotations)
      geometry.applyMatrix4(grassMesh.matrixWorld);

      // Prepare geometry (fixes any normal/bound issues)
      geometry.computeVertexNormals();
      
      geometry.computeBoundingBox();
      console.log("Grass geometry bounding box:", geometry.boundingBox);

      // Calculate number of instances based on density and plane area
      const planeArea = (30 * MAP_SIZE) * (30 * MAP_SIZE); // Width * Height of the plane
      const instanceCount = Math.floor(planeArea * GRASS_DENSITY);
      
      // Create InstancedMesh with calculated count
      const instancedMesh = new THREE.InstancedMesh(geometry, grassMaterial, instanceCount);
      instancedMesh.castShadow = false;
      instancedMesh.receiveShadow = true;

      // Sampler setup
      const sampler = new MeshSurfaceSampler(plane)
        .setWeightAttribute("color")
        .build();
      const position = new THREE.Vector3();
      const matrix = new THREE.Matrix4();
      const scale = new THREE.Vector3();
      const rotation = new THREE.Euler();

      for (let i = 0; i < instanceCount; i++) {
        sampler.sample(position);
        plane.localToWorld(position);
        position.y = 0; // Keep on the plane

        // Random scale between 1 and 2.5, more small than big
        const s = biasedRandomScale(1, 2.5);
        scale.set(s, s, s);

        // Add a random rotation around the Y axis for each instance
        rotation.set(0, Math.random() * Math.PI * 2, 0);

        // Compose transformation
        matrix.compose(position, new THREE.Quaternion().setFromEuler(rotation), scale);

        instancedMesh.setMatrixAt(i, matrix);
      }

      instancedMesh.instanceMatrix.needsUpdate = true;
      scene.add(instancedMesh);

      console.log("Instanced grass added");
    }
  });
}

export function createGrassSystem(scene: THREE.Scene): GrassSystem {
  // Create textured plane with grass texture
  const textureLoader = new THREE.TextureLoader();
  const grassTexture = textureLoader.load("/grass.png");
  grassTexture.wrapS = THREE.RepeatWrapping;
  grassTexture.wrapT = THREE.RepeatWrapping;
  grassTexture.repeat.set(1, 1); // Repeat texture 1x1 times across the plane

  // Create plane
  const plane = createPlane();
  scene.add(plane);

  // Create shared grass shader material with the grass texture
  const grassMaterial = createGrassShaderMaterial(grassTexture);
  // Set the texture repeat to match the plane's texture repeat
  grassMaterial.uniforms.textureRepeat.value.copy(grassTexture.repeat);

  // Create grass instances
  createGrassInstances(scene, plane, grassMaterial);

  // Function to update wind animation
  const updateWind = (time: number) => {
    if (grassMaterial.uniforms.time) {
      grassMaterial.uniforms.time.value = time;
    }
  };

  return { plane, grassMaterial, updateWind };
}
