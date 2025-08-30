import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface SceneSetup {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
}

export function createSceneSetup(canvas: HTMLCanvasElement): SceneSetup {
  // Scene setup
  const scene = new THREE.Scene();
  
  // Add fog for atmospheric effect
  scene.fog = new THREE.Fog(0x87ceeb, 50, 200); // Light blue fog, starts at 50 units, ends at 200 units

  // Camera setup
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );

  // Renderer setup
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  // Set proper color space for accurate color representation
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // renderer.toneMappingExposure = 1.0;

  // Controls
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Camera position - lowered for better view
  camera.position.set(5, 3, 5);
  camera.lookAt(0, 0, 0);

  return { scene, camera, renderer, controls };
}

export function setupLighting(scene: THREE.Scene): void {
  // Proper lighting setup for realistic rendering
  const ambientLight = new THREE.AmbientLight(0x404040, 1.5); // Increased for better visibility
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0); // Reduced from 2.0
  directionalLight.position.set(5, 15, 15); // Moved to front and lower
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 50;
  directionalLight.shadow.camera.left = -25;
  directionalLight.shadow.camera.right = 25;
  directionalLight.shadow.camera.top = 25;
  directionalLight.shadow.camera.bottom = -25;
  scene.add(directionalLight);
}

export function createSkybox(scene: THREE.Scene): void {
  const textureLoader = new THREE.TextureLoader();
  
  // Load skybox texture
  const skyboxTexture = textureLoader.load("/sky_16_2k.png");
  skyboxTexture.mapping = THREE.EquirectangularReflectionMapping;
  skyboxTexture.wrapS = THREE.RepeatWrapping;
  skyboxTexture.wrapT = THREE.ClampToEdgeWrapping;

  // Create skybox
  const skyboxGeometry = new THREE.SphereGeometry(500, 64, 32);
  const skyboxMaterial = new THREE.MeshBasicMaterial({
    map: skyboxTexture,
    side: THREE.BackSide, // Render on the inside of the sphere
    fog: false,
  });
  const skybox = new THREE.Mesh(skyboxGeometry, skyboxMaterial);
  // Lower the skybox by 5% (25 units down from center for a 500 radius sphere)
  skybox.position.y = -90;
  scene.add(skybox);
}
