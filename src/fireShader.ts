import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createFireSystem } from './fireSystem';
import type { FireSystem } from './fireSystem';



// Global variables
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let clock: THREE.Clock;
let composer: EffectComposer;
let bloomPass: UnrealBloomPass;
let controls: OrbitControls;
let fireSystem: FireSystem;

function initScene() {
  // Scene setup
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000); // Gray background

  // Camera setup
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 2;

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

  // Create fire system using the reusable function
  const fireConfig = {
    mainFlame: {
      size: { width: 1.0, height: 1.5 },
      position: { x: 0, y: 0, z: 0 },
      intensity: 1.3,
      speed: 0.4,
      flameStart: 0.4,
      color: { r: 1.0, g: 0.25, b: 0.0, a: 1.0 },
      bloom: 15.0
    },
    innerFlame: {
      size: { width: 0.55, height: 0.7 },
      position: { x: 0.0, y: -0.29, z: 0.0 },
      intensity: 1.0,
      speed: 0.6,
      flameStart: 0.32,
      color: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
      bloom: 15.0
    }
  };
  
  fireSystem = createFireSystem(scene, fireConfig);

  // Add orbit controls for debugging
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Debug logging
  console.log('Fire system created successfully');
  console.log('Camera position:', camera.position);


  // Setup post-processing
  setupPostProcessing();

  // Handle window resize
  window.addEventListener('resize', onWindowResize);
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
    0.7, // radius - remove the outline by going below 1
    0.9 // threshold
  );
  composer.addPass(bloomPass);
  
  // Add output pass for tone mapping
  const outputPass = new OutputPass();
  composer.addPass(outputPass);
}

function setupControls() {
  // Outer Flame Controls
  // Outer Flame Start
  const outerFlameStartSlider = document.getElementById('outerFlameStart') as HTMLInputElement;
  const outerFlameStartValue = document.getElementById('outerFlameStartValue') as HTMLElement;
  outerFlameStartSlider.addEventListener('input', (e) => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    fireSystem.mainMaterial.uniforms.flameStart.value = value;
    outerFlameStartValue.textContent = value.toString();
  });

  // Outer Intensity
  const outerFireIntensitySlider = document.getElementById('outerFireIntensity') as HTMLInputElement;
  const outerFireIntensityValue = document.getElementById('outerFireIntensityValue') as HTMLElement;
  outerFireIntensitySlider.addEventListener('input', (e) => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    fireSystem.mainMaterial.uniforms.uIntensity.value = value;
    outerFireIntensityValue.textContent = value.toString();
  });

  // Outer Speed
  const outerVoronoiSpeedSlider = document.getElementById('outerVoronoiSpeed') as HTMLInputElement;
  const outerVoronoiSpeedValue = document.getElementById('outerVoronoiSpeedValue') as HTMLElement;
  outerVoronoiSpeedSlider.addEventListener('input', (e) => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    fireSystem.mainMaterial.uniforms.uSpeed.value = value;
    outerVoronoiSpeedValue.textContent = value.toString();
  });

  // Inner Flame Controls
  // Inner Flame Start
  const innerFlameStartSlider = document.getElementById('innerFlameStart') as HTMLInputElement;
  const innerFlameStartValue = document.getElementById('innerFlameStartValue') as HTMLElement;
  innerFlameStartSlider.addEventListener('input', (e) => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    fireSystem.innerMaterial.uniforms.flameStart.value = value;
    innerFlameStartValue.textContent = value.toString();
  });

  // Inner Intensity
  const innerFireIntensitySlider = document.getElementById('innerFireIntensity') as HTMLInputElement;
  const innerFireIntensityValue = document.getElementById('innerFireIntensityValue') as HTMLElement;
  innerFireIntensitySlider.addEventListener('input', (e) => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    fireSystem.innerMaterial.uniforms.uIntensity.value = value;
    innerFireIntensityValue.textContent = value.toString();
  });

  // Inner Speed
  const innerVoronoiSpeedSlider = document.getElementById('innerVoronoiSpeed') as HTMLInputElement;
  const innerVoronoiSpeedValue = document.getElementById('innerVoronoiSpeedValue') as HTMLElement;
  innerVoronoiSpeedSlider.addEventListener('input', (e) => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    fireSystem.innerMaterial.uniforms.uSpeed.value = value;
    innerVoronoiSpeedValue.textContent = value.toString();
  });

  // Bloom Strength
  const bloomStrengthSlider = document.getElementById('bloomStrength') as HTMLInputElement;
  const bloomStrengthValue = document.getElementById('bloomStrengthValue') as HTMLElement;
  bloomStrengthSlider.addEventListener('input', (e) => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    bloomPass.strength = value;
    bloomStrengthValue.textContent = value.toString();
  });

  // Bloom Threshold
  const bloomThresholdSlider = document.getElementById('bloomThreshold') as HTMLInputElement;
  const bloomThresholdValue = document.getElementById('bloomThresholdValue') as HTMLElement;
  bloomThresholdSlider.addEventListener('input', (e) => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    bloomPass.threshold = value;
    bloomThresholdValue.textContent = value.toString();
  });

  // Exposure
  const exposureSlider = document.getElementById('exposure') as HTMLInputElement;
  const exposureValue = document.getElementById('exposureValue') as HTMLElement;
  exposureSlider.addEventListener('input', (e) => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    renderer.toneMappingExposure = value;
    exposureValue.textContent = value.toString();
  });
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

// Initialize the fire shader playground
init();