import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createFireSystem, defaultCampfireConfig } from './fireSystem';
import type { FireSystem } from './fireSystem';
import type { PostProcessingSetup } from './postProcessing';

// Toon Shader
const toonVertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewPosition;
  
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const toonFragmentShader = `
  uniform vec3 uColor;
  uniform vec3 uLightPosition;
  uniform vec3 uLightColor;
  uniform float uAmbientStrength;
  uniform float uToonLevels;
  uniform vec3 uRimColor;
  uniform float uRimPower;
  
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewPosition;
  
  void main() {
    vec3 normal = normalize(vNormal);
    vec3 lightDir = normalize(uLightPosition - vPosition);
    vec3 viewDir = normalize(vViewPosition);
    
    // Toon shading - quantize the diffuse lighting
    float NdotL = max(dot(normal, lightDir), 0.0);
    float toonDiffuse = floor(NdotL * uToonLevels) / uToonLevels;
    
    // Ambient lighting
    vec3 ambient = uAmbientStrength * uLightColor;
    
    // Diffuse lighting with toon effect
    vec3 diffuse = toonDiffuse * uLightColor;
    
    // Rim lighting for cartoon effect
    float rimFactor = 1.0 - max(dot(viewDir, normal), 0.0);
    rimFactor = smoothstep(0.6, 1.0, rimFactor);
    vec3 rim = rimFactor * uRimColor;
    
    // Combine lighting
    vec3 lighting = ambient + diffuse + rim;
    vec3 finalColor = uColor * lighting;
    
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// Global variables
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let clock: THREE.Clock;
let composer: EffectComposer;
let bloomPass: UnrealBloomPass;
let controls: OrbitControls;
let fireSystem: FireSystem;
let fireLight: THREE.PointLight;
let toonMaterials: THREE.ShaderMaterial[] = [];

// Create toon material
function createToonMaterial(color: THREE.Color, lightPosition: THREE.Vector3): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    vertexShader: toonVertexShader,
    fragmentShader: toonFragmentShader,
    uniforms: {
      uColor: { value: color },
      uLightPosition: { value: lightPosition },
      uLightColor: { value: new THREE.Color(0xffaa44) }, // Warm fire light color
      uAmbientStrength: { value: 0.3 },
      uToonLevels: { value: 4.0 }, // Number of toon shading levels
      uRimColor: { value: new THREE.Color(0xff6600) }, // Orange rim light
      uRimPower: { value: 2.0 }
    },
    side: THREE.DoubleSide
  });
  
  // Store reference for later updates
  toonMaterials.push(material);
  return material;
}

function initScene() {
  // Scene setup
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x001122); // Dark blue night sky

  // Camera setup
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1, 3);
  camera.lookAt(0, 0, 0);

  // Renderer setup
  const canvas = document.getElementById('three-canvas') as HTMLCanvasElement;
  renderer = new THREE.WebGLRenderer({ 
    canvas,
    antialias: true,
    alpha: true
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Add basic lighting
  const ambientLight = new THREE.AmbientLight(0x404040, 0.1);
  scene.add(ambientLight);

  // Add fire light
  fireLight = new THREE.PointLight(0xff4400, 2, 10);
  fireLight.position.set(0, 0.5, 0);
  fireLight.castShadow = true;
  fireLight.shadow.mapSize.width = 1024;
  fireLight.shadow.mapSize.height = 1024;
  scene.add(fireLight);

  // Create ground plane
  const groundGeometry = new THREE.PlaneGeometry(20, 20);
  const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x2d1810 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.75;
  ground.receiveShadow = true;
  scene.add(ground);

  // Create fire system
  fireSystem = createFireSystem(scene, defaultCampfireConfig);
  fireSystem.innerFlame.position.z = 0.1;
  fireSystem.innerFlame.position.y = -0.1;
  // Load campfire model if available
  loadCampfireModel();

  // Add orbit controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 1;
  controls.maxDistance = 10;
  controls.maxPolarAngle = Math.PI / 2.1;

  // Setup post-processing
  setupPostProcessing();

  // Handle window resize
  window.addEventListener('resize', onWindowResize);
}

function loadCampfireModel() {
  const loader = new GLTFLoader();
  loader.load(
    '/campfire.glb',
    (gltf) => {
      const campfireModel = gltf.scene;
      campfireModel.position.set(0, -0.75, 0);
      campfireModel.scale.setScalar(1.7);
      campfireModel.rotation.y = Math.PI / 4;
      
      // Apply toon shader to the model and enable shadows
      campfireModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          // Get original material color or use default
          const color = new THREE.Color(0x612f0b);
          
          // Apply toon material
          child.material = createToonMaterial(color, fireLight.position);
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      
      scene.add(campfireModel);
      console.log('Campfire model loaded successfully with toon shader');
    },
    (progress) => {
      console.log('Loading progress:', progress);
    },
    (error) => {
      console.log('Could not load campfire model:', error);
      // Create simple log placeholder instead
      createLogPlaceholder();
    }
  );
}

function createLogPlaceholder() {
  // Create simple log geometry as placeholder
  const logGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1.2, 8);
  const logToonMaterial = createToonMaterial(new THREE.Color(0x8B4513), fireLight.position);
  
  // Create multiple logs
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(logGeometry, logToonMaterial.clone());
    log.position.set(
      Math.cos(i * Math.PI * 2 / 3) * 0.3,
      -0.65,
      Math.sin(i * Math.PI * 2 / 3) * 0.3
    );
    log.rotation.y = i * Math.PI * 2 / 3;
    log.rotation.z = Math.PI / 2;
    log.castShadow = true;
    log.receiveShadow = true;
    scene.add(log);
  }
}

function setupPostProcessing() {
  // Create composer
  composer = new EffectComposer(renderer);
  
  // Add render pass
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  
  // Add bloom pass
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.12, // strength
    0.7, // radius
    0.9 // threshold
  );
  composer.addPass(bloomPass);
  
  // Add output pass for tone mapping
  const outputPass = new OutputPass();
  composer.addPass(outputPass);
}

function setupControls() {
  // Main Flame Controls
  const mainFlameStartSlider = document.getElementById('mainFlameStart') as HTMLInputElement;
  const mainFlameStartValue = document.getElementById('mainFlameStartValue') as HTMLElement;
  if (mainFlameStartSlider && mainFlameStartValue) {
    mainFlameStartSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      fireSystem.mainMaterial.uniforms.flameStart.value = value;
      mainFlameStartValue.textContent = value.toString();
    });
  }

  const mainFireIntensitySlider = document.getElementById('mainFireIntensity') as HTMLInputElement;
  const mainFireIntensityValue = document.getElementById('mainFireIntensityValue') as HTMLElement;
  if (mainFireIntensitySlider && mainFireIntensityValue) {
    mainFireIntensitySlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      fireSystem.mainMaterial.uniforms.uIntensity.value = value;
      mainFireIntensityValue.textContent = value.toString();
    });
  }

  const mainVoronoiSpeedSlider = document.getElementById('mainVoronoiSpeed') as HTMLInputElement;
  const mainVoronoiSpeedValue = document.getElementById('mainVoronoiSpeedValue') as HTMLElement;
  if (mainVoronoiSpeedSlider && mainVoronoiSpeedValue) {
    mainVoronoiSpeedSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      fireSystem.mainMaterial.uniforms.uSpeed.value = value;
      mainVoronoiSpeedValue.textContent = value.toString();
    });
  }

  // Inner Flame Controls
  const innerFlameStartSlider = document.getElementById('innerFlameStart') as HTMLInputElement;
  const innerFlameStartValue = document.getElementById('innerFlameStartValue') as HTMLElement;
  if (innerFlameStartSlider && innerFlameStartValue) {
    innerFlameStartSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      fireSystem.innerMaterial.uniforms.flameStart.value = value;
      innerFlameStartValue.textContent = value.toString();
    });
  }

  const innerFireIntensitySlider = document.getElementById('innerFireIntensity') as HTMLInputElement;
  const innerFireIntensityValue = document.getElementById('innerFireIntensityValue') as HTMLElement;
  if (innerFireIntensitySlider && innerFireIntensityValue) {
    innerFireIntensitySlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      fireSystem.innerMaterial.uniforms.uIntensity.value = value;
      innerFireIntensityValue.textContent = value.toString();
    });
  }

  const innerVoronoiSpeedSlider = document.getElementById('innerVoronoiSpeed') as HTMLInputElement;
  const innerVoronoiSpeedValue = document.getElementById('innerVoronoiSpeedValue') as HTMLElement;
  if (innerVoronoiSpeedSlider && innerVoronoiSpeedValue) {
    innerVoronoiSpeedSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      fireSystem.innerMaterial.uniforms.uSpeed.value = value;
      innerVoronoiSpeedValue.textContent = value.toString();
    });
  }

  // Bloom Controls
  const bloomStrengthSlider = document.getElementById('bloomStrength') as HTMLInputElement;
  const bloomStrengthValue = document.getElementById('bloomStrengthValue') as HTMLElement;
  if (bloomStrengthSlider && bloomStrengthValue) {
    bloomStrengthSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      bloomPass.strength = value;
      bloomStrengthValue.textContent = value.toString();
    });
  }

  const bloomThresholdSlider = document.getElementById('bloomThreshold') as HTMLInputElement;
  const bloomThresholdValue = document.getElementById('bloomThresholdValue') as HTMLElement;
  if (bloomThresholdSlider && bloomThresholdValue) {
    bloomThresholdSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      bloomPass.threshold = value;
      bloomThresholdValue.textContent = value.toString();
    });
  }

  const exposureSlider = document.getElementById('exposure') as HTMLInputElement;
  const exposureValue = document.getElementById('exposureValue') as HTMLElement;
  if (exposureSlider && exposureValue) {
    exposureSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      renderer.toneMappingExposure = value;
      exposureValue.textContent = value.toString();
    });
  }

  // Toon Shader Controls
  const toonLevelsSlider = document.getElementById('toonLevels') as HTMLInputElement;
  const toonLevelsValue = document.getElementById('toonLevelsValue') as HTMLElement;
  if (toonLevelsSlider && toonLevelsValue) {
    toonLevelsSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      toonMaterials.forEach(material => {
        material.uniforms.uToonLevels.value = value;
      });
      toonLevelsValue.textContent = value.toString();
    });
  }

  const ambientStrengthSlider = document.getElementById('ambientStrength') as HTMLInputElement;
  const ambientStrengthValue = document.getElementById('ambientStrengthValue') as HTMLElement;
  if (ambientStrengthSlider && ambientStrengthValue) {
    ambientStrengthSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      toonMaterials.forEach(material => {
        material.uniforms.uAmbientStrength.value = value;
      });
      ambientStrengthValue.textContent = value.toString();
    });
  }

  // Camera Distance Control (only available in standalone campfire page)
  const cameraDistanceSlider = document.getElementById('cameraDistance') as HTMLInputElement;
  const cameraDistanceValue = document.getElementById('cameraDistanceValue') as HTMLElement;
  if (cameraDistanceSlider && cameraDistanceValue) {
    cameraDistanceSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      const direction = camera.position.clone().normalize();
      camera.position.copy(direction.multiplyScalar(value));
      camera.position.y = Math.max(0.5, camera.position.y); // Keep camera above ground
      cameraDistanceValue.textContent = value.toString();
    });
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  // Update controls
  if (controls) {
    controls.update();
  }

  // Update fire system
  if (fireSystem) {
    const time = clock.getElapsedTime();
    fireSystem.update(time);
  }

  // Render with post-processing
  composer.render();
}

function init() {
  clock = new THREE.Clock();
  initScene();
  setupControls();
  animate();
}

// Initialize the campfire scene only if we're in the standalone campfire page
if (typeof window !== 'undefined' && window.location.pathname.includes('campfire.html')) {
  init();
}

// Export interface and functions for use in other modules
export interface CampfireSystem {
  group: THREE.Group; // Main group containing all campfire elements
  fireSystem: FireSystem;
  fireLight: THREE.PointLight;
  toonMaterials: THREE.ShaderMaterial[];
  update: (time: number) => void;
  dispose: () => void;
}

export function createCampfireSystem(
  scene: THREE.Scene,
  position: THREE.Vector3 = new THREE.Vector3(0, 0, 2),
  rotation: THREE.Euler = new THREE.Euler(0, Math.PI / 2, 0)
): CampfireSystem {
  const campfireToonMaterials: THREE.ShaderMaterial[] = [];
  
  // Create main campfire group
  const campfireGroup = new THREE.Group();
  campfireGroup.position.copy(position);
  campfireGroup.rotation.copy(rotation);
  scene.add(campfireGroup);
  
  // Create fire light (positioned relative to group)
  const campfireLight = new THREE.PointLight(0xff4400, 2, 10);
  campfireLight.position.set(0, 0.5, 0); // Relative to group center
  campfireLight.castShadow = true;
  campfireLight.shadow.mapSize.width = 1024;
  campfireLight.shadow.mapSize.height = 1024;
  campfireGroup.add(campfireLight); // Add to group instead of scene

  // Create toon material function for this campfire
  function createCampfireToonMaterial(color: THREE.Color, lightPosition: THREE.Vector3): THREE.ShaderMaterial {
    const material = new THREE.ShaderMaterial({
      vertexShader: toonVertexShader,
      fragmentShader: toonFragmentShader,
      uniforms: {
        uColor: { value: color },
        uLightPosition: { value: lightPosition },
        uLightColor: { value: new THREE.Color(0xffaa44) }, // Warm fire light color
        uAmbientStrength: { value: 0.3 },
        uToonLevels: { value: 4.0 }, // Number of toon shading levels
        uRimColor: { value: new THREE.Color(0xff6600) }, // Orange rim light
        uRimPower: { value: 2.0 }
      },
      side: THREE.DoubleSide
    });
    
    // Store reference for later updates
    campfireToonMaterials.push(material);
    return material;
  }

  // Create fire system with relative positioning
  const campfireConfig = {
    ...defaultCampfireConfig,
    mainFlame: {
      ...defaultCampfireConfig.mainFlame,
      position: { x: 0, y: 0, z: 0.1 } // Relative to group center
    },
    innerFlame: {
      ...defaultCampfireConfig.innerFlame,
      position: { x: 0, y: -0.29, z: 0.11 } // Relative to group center
    }
  };
  
  // Create fire system normally, then move flames to group
  const campfireSystem = createFireSystem(scene, campfireConfig);
  
  // Remove flames from scene and add them to the campfire group
  scene.remove(campfireSystem.mainFlame);
  scene.remove(campfireSystem.innerFlame);
  campfireGroup.add(campfireSystem.mainFlame);
  campfireGroup.add(campfireSystem.innerFlame);

  // Load campfire model
  const loader = new GLTFLoader();
  loader.load(
    '/campfire.glb',
    (gltf) => {
      const campfireModel = gltf.scene;
      campfireModel.position.set(0, -0.75, 0); // Relative to group center
      campfireModel.scale.setScalar(1.7);
      
      // Apply toon shader to the model and enable shadows
      campfireModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          // Get original material color or use default
          const originalColor = child.material instanceof THREE.MeshStandardMaterial || 
                               child.material instanceof THREE.MeshLambertMaterial ||
                               child.material instanceof THREE.MeshPhongMaterial
                               ? child.material.color.clone()
                               : new THREE.Color(0x8B4513); // Default brown color for wood
          
          // Apply toon material
          child.material = createCampfireToonMaterial(originalColor, campfireLight.position);
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      
      campfireGroup.add(campfireModel); // Add to group instead of scene
      console.log('Campfire model loaded successfully with toon shader');
    },
    (progress) => {
      console.log('Loading progress:', progress);
    },
    (error) => {
      console.log('Could not load campfire model:', error);
      // Create simple log placeholder instead
      createCampfireLogPlaceholder(campfireGroup, campfireLight, createCampfireToonMaterial);
    }
  );

  const update = (time: number) => {
    campfireSystem.update(time);
  };

  const dispose = () => {
    scene.remove(campfireGroup); // Remove the entire group
    campfireSystem.dispose();
    campfireToonMaterials.forEach(material => material.dispose());
    campfireToonMaterials.length = 0;
  };

  return {
    group: campfireGroup,
    fireSystem: campfireSystem,
    fireLight: campfireLight,
    toonMaterials: campfireToonMaterials,
    update,
    dispose
  };
}

function createCampfireLogPlaceholder(
  campfireGroup: THREE.Group,
  fireLight: THREE.PointLight,
  createToonMaterial: (color: THREE.Color, lightPosition: THREE.Vector3) => THREE.ShaderMaterial
) {
  // Create simple log geometry as placeholder
  const logGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1.2, 8);
  const logToonMaterial = createToonMaterial(new THREE.Color(0x8B4513), fireLight.position);
  
  // Create multiple logs directly in the campfire group
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(logGeometry, logToonMaterial.clone());
    log.position.set(
      Math.cos(i * Math.PI * 2 / 3) * 0.3,
      -0.65,
      Math.sin(i * Math.PI * 2 / 3) * 0.3
    );
    log.rotation.y = i * Math.PI * 2 / 3;
    log.rotation.z = Math.PI / 2;
    log.castShadow = true;
    log.receiveShadow = true;
    campfireGroup.add(log); // Add directly to campfire group
  }
}

export function setupCampfireControls(campfireSystem: CampfireSystem): void {
  // Main Flame Controls
  const mainFlameStartSlider = document.getElementById('mainFlameStart') as HTMLInputElement;
  const mainFlameStartValue = document.getElementById('mainFlameStartValue') as HTMLElement;
  if (mainFlameStartSlider && mainFlameStartValue) {
    mainFlameStartSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      campfireSystem.fireSystem.mainMaterial.uniforms.flameStart.value = value;
      mainFlameStartValue.textContent = value.toString();
    });
  }

  const mainFireIntensitySlider = document.getElementById('mainFireIntensity') as HTMLInputElement;
  const mainFireIntensityValue = document.getElementById('mainFireIntensityValue') as HTMLElement;
  if (mainFireIntensitySlider && mainFireIntensityValue) {
    mainFireIntensitySlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      campfireSystem.fireSystem.mainMaterial.uniforms.uIntensity.value = value;
      mainFireIntensityValue.textContent = value.toString();
    });
  }

  const mainVoronoiSpeedSlider = document.getElementById('mainVoronoiSpeed') as HTMLInputElement;
  const mainVoronoiSpeedValue = document.getElementById('mainVoronoiSpeedValue') as HTMLElement;
  if (mainVoronoiSpeedSlider && mainVoronoiSpeedValue) {
    mainVoronoiSpeedSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      campfireSystem.fireSystem.mainMaterial.uniforms.uSpeed.value = value;
      mainVoronoiSpeedValue.textContent = value.toString();
    });
  }

  // Inner Flame Controls
  const innerFlameStartSlider = document.getElementById('innerFlameStart') as HTMLInputElement;
  const innerFlameStartValue = document.getElementById('innerFlameStartValue') as HTMLElement;
  if (innerFlameStartSlider && innerFlameStartValue) {
    innerFlameStartSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      campfireSystem.fireSystem.innerMaterial.uniforms.flameStart.value = value;
      innerFlameStartValue.textContent = value.toString();
    });
  }

  const innerFireIntensitySlider = document.getElementById('innerFireIntensity') as HTMLInputElement;
  const innerFireIntensityValue = document.getElementById('innerFireIntensityValue') as HTMLElement;
  if (innerFireIntensitySlider && innerFireIntensityValue) {
    innerFireIntensitySlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      campfireSystem.fireSystem.innerMaterial.uniforms.uIntensity.value = value;
      innerFireIntensityValue.textContent = value.toString();
    });
  }

  const innerVoronoiSpeedSlider = document.getElementById('innerVoronoiSpeed') as HTMLInputElement;
  const innerVoronoiSpeedValue = document.getElementById('innerVoronoiSpeedValue') as HTMLElement;
  if (innerVoronoiSpeedSlider && innerVoronoiSpeedValue) {
    innerVoronoiSpeedSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      campfireSystem.fireSystem.innerMaterial.uniforms.uSpeed.value = value;
      innerVoronoiSpeedValue.textContent = value.toString();
    });
  }

  // Toon Shader Controls
  const toonLevelsSlider = document.getElementById('toonLevels') as HTMLInputElement;
  const toonLevelsValue = document.getElementById('toonLevelsValue') as HTMLElement;
  if (toonLevelsSlider && toonLevelsValue) {
    toonLevelsSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      campfireSystem.toonMaterials.forEach(material => {
        material.uniforms.uToonLevels.value = value;
      });
      toonLevelsValue.textContent = value.toString();
    });
  }

  const ambientStrengthSlider = document.getElementById('ambientStrength') as HTMLInputElement;
  const ambientStrengthValue = document.getElementById('ambientStrengthValue') as HTMLElement;
  if (ambientStrengthSlider && ambientStrengthValue) {
    ambientStrengthSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      campfireSystem.toonMaterials.forEach(material => {
        material.uniforms.uAmbientStrength.value = value;
      });
      ambientStrengthValue.textContent = value.toString();
    });
  }
}

export function setupPostProcessingControls(postProcessing: PostProcessingSetup, renderer: THREE.WebGLRenderer): void {
  // Bloom Controls
  const bloomStrengthSlider = document.getElementById('bloomStrength') as HTMLInputElement;
  const bloomStrengthValue = document.getElementById('bloomStrengthValue') as HTMLElement;
  if (bloomStrengthSlider && bloomStrengthValue) {
    bloomStrengthSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      postProcessing.bloomPass.strength = value;
      bloomStrengthValue.textContent = value.toString();
    });
  }

  const bloomThresholdSlider = document.getElementById('bloomThreshold') as HTMLInputElement;
  const bloomThresholdValue = document.getElementById('bloomThresholdValue') as HTMLElement;
  if (bloomThresholdSlider && bloomThresholdValue) {
    bloomThresholdSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      postProcessing.bloomPass.threshold = value;
      bloomThresholdValue.textContent = value.toString();
    });
  }

  const exposureSlider = document.getElementById('exposure') as HTMLInputElement;
  const exposureValue = document.getElementById('exposureValue') as HTMLElement;
  if (exposureSlider && exposureValue) {
    exposureSlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      renderer.toneMappingExposure = value;
      exposureValue.textContent = value.toString();
    });
  }
}
