import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { unityVoronoiNoise, unitySimpleNoise } from './unityNoiseFunctions';

// Simple Fire Shader with Texture
const fireVertexShader = `
  varying vec2 vUv;
  
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fireFragmentShader = `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uSpeed;
  uniform sampler2D fire;
  uniform vec4 uColor;
  uniform float bloom;
  uniform float flameStart;
  
  varying vec2 vUv;
  
  ${unityVoronoiNoise}
  
  ${unitySimpleNoise}
  
  void main() {
    // Add upward movement with speed control (negative vUv makes it go upward)
    vec2 st = -vUv;
    st.y += uTime * uSpeed; // Move pattern upward
    
    // Generate Unity Voronoi noise with density 10 and time as angle offset
    float voronoiOut, voronoiCells;
    Unity_Voronoi_float(st, uTime + 10.0, 10.0, voronoiOut, voronoiCells);
    
    // Generate Unity Simple Noise with scale of 50 (no time)
    float simpleNoise = Unity_SimpleNoise_float(vUv, 50.0);
    
    // Multiply Voronoi with Unity Simple Noise
    float combinedNoise = voronoiOut * simpleNoise;
    
    // White background with black cells
    
    vec3 cellColor = vec3(0.0); // Black
    
    // Mix between white and black based on combined noise
    vec3 noiseFinal = mix(cellColor, vec3(1.0, 1.0, 1.0), combinedNoise);
    
    // Apply intensity
    noiseFinal *= uIntensity;

    float g = 1. - vUv.y;
    g = pow(g, 0.3);
    vec4 fireShape = texture2D(fire, vUv);
    g = (fireShape.x) * g;

    float edge = smoothstep(0.0, flameStart, vUv.y);
    noiseFinal = mix(vec3(1.0), noiseFinal, edge);

    float cappedNoise = min(noiseFinal.x, 1.0) * 0.9;
    float fireWithNoise = cappedNoise + g;
    fireWithNoise = step(1.0, fireWithNoise);

    float glow = 4.0;
    vec4 bloomColor = vec4(vec3(1.0, 1.0, 1.0) * glow, 1.0);
    bloomColor *= uColor;

    vec4 finalColor = uColor * fireWithNoise;
    
    gl_FragColor = vec4(finalColor.xyz * bloom, finalColor.a);
  }
`;

// Global variables
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let fireOuterMaterial: THREE.ShaderMaterial;
let fireInnerMaterial: THREE.ShaderMaterial;
let clock: THREE.Clock;
let composer: EffectComposer;
let bloomPass: UnrealBloomPass;
let fireOuter: THREE.Mesh;
let fireInner: THREE.Mesh;
let controls: OrbitControls;

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

  const fireTexture = new THREE.TextureLoader().load('/fire/fire2.png');
  
  // Create material for outer fire with Voronoi noise
  fireOuterMaterial = new THREE.ShaderMaterial({
    vertexShader: fireVertexShader,
    fragmentShader: fireFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1.3 },
      uSpeed: { value: 0.4 },
      fire: { value: fireTexture },
      uColor: { value: new THREE.Vector4(1.0, .0, .0, 1.0) },
      bloom: { value: 15.0 },
      flameStart: { value: 0.4 }
    },
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.001,
    blending: THREE.NormalBlending
  });

  // Create material for inner fire with same shader
  fireInnerMaterial = new THREE.ShaderMaterial({
    vertexShader: fireVertexShader,
    fragmentShader: fireFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1.0 },
      uSpeed: { value: 0.6 },
      fire: { value: fireTexture },
      uColor: { value: new THREE.Vector4(1.0, 1.0, 1.0, 1.0) },
      bloom: { value: 15.0 },
      flameStart: { value: 0.32 }
    },
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.001,
    blending: THREE.NormalBlending
  });

  // Create fire outer plane (larger)
  const fireOuterGeometry = new THREE.PlaneGeometry(1.0, 1.5);
  fireOuter = new THREE.Mesh(fireOuterGeometry, fireOuterMaterial);
  fireOuter.position.set(0, 0, 0);
  scene.add(fireOuter);

  // Create fire inner plane (smaller, positioned forward)
  const fireInnerGeometry = new THREE.PlaneGeometry(0.55, 0.7);
  fireInner = new THREE.Mesh(fireInnerGeometry, fireInnerMaterial);
  fireInner.position.set(0.0, -0.29, 0.0); // Offset to the right and up, slightly forward
  scene.add(fireInner);

  // Add orbit controls for debugging
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Debug logging
  console.log('Fire Outer position:', fireOuter.position);
  console.log('Fire Inner position:', fireInner.position);
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
    fireOuterMaterial.uniforms.flameStart.value = value;
    outerFlameStartValue.textContent = value.toString();
  });

  // Outer Intensity
  const outerFireIntensitySlider = document.getElementById('outerFireIntensity') as HTMLInputElement;
  const outerFireIntensityValue = document.getElementById('outerFireIntensityValue') as HTMLElement;
  outerFireIntensitySlider.addEventListener('input', (e) => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    fireOuterMaterial.uniforms.uIntensity.value = value;
    outerFireIntensityValue.textContent = value.toString();
  });

  // Outer Speed
  const outerVoronoiSpeedSlider = document.getElementById('outerVoronoiSpeed') as HTMLInputElement;
  const outerVoronoiSpeedValue = document.getElementById('outerVoronoiSpeedValue') as HTMLElement;
  outerVoronoiSpeedSlider.addEventListener('input', (e) => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    fireOuterMaterial.uniforms.uSpeed.value = value;
    outerVoronoiSpeedValue.textContent = value.toString();
  });

  // Inner Flame Controls
  // Inner Flame Start
  const innerFlameStartSlider = document.getElementById('innerFlameStart') as HTMLInputElement;
  const innerFlameStartValue = document.getElementById('innerFlameStartValue') as HTMLElement;
  innerFlameStartSlider.addEventListener('input', (e) => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    fireInnerMaterial.uniforms.flameStart.value = value;
    innerFlameStartValue.textContent = value.toString();
  });

  // Inner Intensity
  const innerFireIntensitySlider = document.getElementById('innerFireIntensity') as HTMLInputElement;
  const innerFireIntensityValue = document.getElementById('innerFireIntensityValue') as HTMLElement;
  innerFireIntensitySlider.addEventListener('input', (e) => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    fireInnerMaterial.uniforms.uIntensity.value = value;
    innerFireIntensityValue.textContent = value.toString();
  });

  // Inner Speed
  const innerVoronoiSpeedSlider = document.getElementById('innerVoronoiSpeed') as HTMLInputElement;
  const innerVoronoiSpeedValue = document.getElementById('innerVoronoiSpeedValue') as HTMLElement;
  innerVoronoiSpeedSlider.addEventListener('input', (e) => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    fireInnerMaterial.uniforms.uSpeed.value = value;
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

  // Update time uniform for animation
  if (fireOuterMaterial && fireInnerMaterial) {
    const time = clock.getElapsedTime();
    fireOuterMaterial.uniforms.uTime.value = time;
    fireInnerMaterial.uniforms.uTime.value = time;
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
