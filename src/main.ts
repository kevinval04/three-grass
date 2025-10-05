import "./style.css";
import {
  createSceneSetup,
  setupLighting,
  createSkyboxWithTexture,
} from "./sceneSetup";
import { createGrassSystem } from "./grassSystem";
import type { GrassExclusionZone, GrassSystem } from "./grassSystem";
import { createFireflySystem, type FireflySystem } from "./fireflySystem";
import { createCampfireSystem } from "./campfire";
import { createPostProcessing } from "./postProcessing";
import { createWaterSystem, type WaterSystem } from "./waterSystem";
import type { CampfireSystem } from "./campfire";
import type { PostProcessingSetup } from "./postProcessing";
import {
  AssetLoader,
  type LoadingProgress,
  type AssetCollection,
} from "./assetLoader";
import * as THREE from "three";
import studio from "@theatre/studio";
import { getProject } from "@theatre/core";

if (import.meta.env.DEV) {
  studio.initialize();
}

// Loading screen elements
const loadingScreen = document.getElementById("loading-screen") as HTMLElement;
const progressBar = document.getElementById("progress-bar") as HTMLElement;
const loadingPercentage = document.getElementById(
  "loading-percentage"
) as HTMLElement;
const loadingAsset = document.getElementById("loading-asset") as HTMLElement;
const startButton = document.getElementById("start-button") as HTMLElement;

// Global variables for scene components
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let fireflySystem: FireflySystem;
let campfireSystem: CampfireSystem;
let grassSystem: GrassSystem;
let waterSystem: WaterSystem;
let postProcessing: PostProcessingSetup;
let assets: AssetCollection;
let clock: THREE.Clock;
let backgroundAudio: HTMLAudioElement;

// Loading progress handler
function onLoadingProgress(progress: LoadingProgress) {
  const percentage = Math.round(progress.percentage);
  progressBar.style.width = `${percentage}%`;
  loadingPercentage.textContent = `${percentage}%`;
  loadingAsset.textContent = `Loading ${progress.currentAsset}...`;

  console.log(`Loading progress: ${percentage}% - ${progress.currentAsset}`);
}

// Assets loaded handler
function onAssetsLoaded(loadedAssets: AssetCollection) {
  console.log("All assets loaded, initializing scene...");
  assets = loadedAssets;

  // Update loading screen
  loadingAsset.textContent = "Initializing scene...";

  // Initialize the scene after a small delay for smooth transition
  setTimeout(() => {
    initializeScene();
    setupTheatre();
    hideLoadingScreen();
  }, 500);
}

function initializeScene() {
  const canvas = document.getElementById("three-canvas") as HTMLCanvasElement;

  const sceneSetup = createSceneSetup(canvas);
  scene = sceneSetup.scene;
  camera = sceneSetup.camera;
  renderer = sceneSetup.renderer;

  setupLighting(scene);

  createSkyboxWithTexture(scene, assets.skybox);

  // Initialize clock for delta time calculations
  clock = new THREE.Clock();

  fireflySystem = createFireflySystem(scene, camera);

  const campfirePosition = new THREE.Vector3(4, 0.85, 3); // Around infront of the camera
  const campfireRotation = new THREE.Euler(0, 0, 0);
  campfireSystem = createCampfireSystem(
    scene,
    campfirePosition,
    campfireRotation
  );

  const campfireExclusionZone: GrassExclusionZone = {
    center: new THREE.Vector3(campfirePosition.x, 0, campfirePosition.z),
    radius: 2.5,
  };

  // Initialize water system first so it can be passed to grass system
  waterSystem = createWaterSystem(scene, assets.textures.get('waterstripes'));

  // Create grass system with water system for foam synchronization
  grassSystem = createGrassSystem(scene, [campfireExclusionZone], assets.textures.get('water') || null, waterSystem);



  postProcessing = createPostProcessing(renderer, scene, camera, {
    strength: 0.12,
    radius: 0.1,
    threshold: 0.8,
  });

  // Camera position is now handled by natural movement system
  camera.lookAt(0, 0, 0); // Ensure camera looks at center of scene

  // Initialize character system

  const exploreButton = document.getElementById("explore-text");
  if (exploreButton) {
    exploreButton.addEventListener("click", () => {
      console.log("EXPLORE button clicked!");
    });
  }

  setupMobileCameraPosition();

  setupAudioAndStartButton();

  startAnimationLoop();
}

function setupTheatre() {
  // Theatre.js setup
  
  
  const project = getProject("Grass Field with Campfire");
  const exploreStartSheet = project.sheet("Explore Start");

  const craneCamera = exploreStartSheet.object("Camera", {
    position: {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    },
    rotation: {
      x: camera.rotation.x,
      y: camera.rotation.y,
      z: camera.rotation.z,
    },
    fov: camera.fov,
  });
  craneCamera.onValuesChange((_value) => {
    // console.log("Camera values changed:", _value);
    // camera.position.set(_value.position.x, _value.position.y, _value.position.z);
    // camera.rotation.set(_value.rotation.x, _value.rotation.y, _value.rotation.z);
    // camera.fov = _value.fov;
  });

}

function setupAudioAndStartButton() {
  // Initialize background audio
  backgroundAudio = new Audio('/sfx/underthesky.mp3');
  backgroundAudio.loop = true;
  backgroundAudio.volume = 0.3; // Set to 30% volume

  // Add event listener for start button
  startButton.addEventListener('click', () => {
    // Play audio
    backgroundAudio.play().catch(error => {
      console.warn('Audio playback failed:', error);
    });

    // Immediately hide loading screen and start button
    loadingScreen.style.display = "none";
    startButton.style.visibility = "hidden";
    startButton.style.opacity = "0";

    console.log('Experience started - audio playing');
  });
}

function hideLoadingScreen() {
  // Hide loading elements but keep the dark background
  const loadingElements = loadingScreen.querySelectorAll('.loading-title, .loading-progress, .loading-text, .loading-asset');
  loadingElements.forEach(element => {
    (element as HTMLElement).style.display = 'none';
  });

  // Show the start button on the same dark background
  startButton.classList.add("visible");
}


// Natural camera movement parameters
const cameraMovement = {
  basePosition: new THREE.Vector3(4, -1, 6), // Original camera position
  amplitude: {
    x: 0.34, // Left/right movement amplitude
    y: 0.1, // Up/down movement amplitude
    z: 0.1, // Forward/back movement amplitude
    rotX: 0.2, // Pitch rotation amplitude (up/down)
    rotY: 0.3  // Yaw rotation amplitude (left/right)
  },
  frequency: {
    x: 0.6, // Left/right movement speed
    y: 0.2, // Up/down movement speed
    z: 0.32, // Forward/back movement speed
    rotX: 0.5, // Pitch rotation speed
    rotY: 0.2  // Yaw rotation speed
  },
  phase: {
    x: 0, // Phase offset for x movement
    y: Math.PI / 4, // Phase offset for y movement
    z: Math.PI / 2, // Phase offset for z movement
    rotX: Math.PI / 3, // Phase offset for pitch rotation
    rotY: Math.PI / 6  // Phase offset for yaw rotation
  }
};

function updateNaturalCameraMovement(elapsedTime: number) {
  if (!camera) return;

  // Calculate natural movement using sine waves with different frequencies and phases
  const xOffset = Math.sin(elapsedTime * cameraMovement.frequency.x + cameraMovement.phase.x) * cameraMovement.amplitude.x;
  const yOffset = Math.sin(elapsedTime * cameraMovement.frequency.y + cameraMovement.phase.y) * cameraMovement.amplitude.y;
  const zOffset = Math.sin(elapsedTime * cameraMovement.frequency.z + cameraMovement.phase.z) * cameraMovement.amplitude.z;

  // Calculate natural rotation offsets
  const rotXOffset = Math.sin(elapsedTime * cameraMovement.frequency.rotX + cameraMovement.phase.rotX) * cameraMovement.amplitude.rotX;
  const rotYOffset = Math.sin(elapsedTime * cameraMovement.frequency.rotY + cameraMovement.phase.rotY) * cameraMovement.amplitude.rotY;

  // Apply movement to camera position
  camera.position.set(
    cameraMovement.basePosition.x + xOffset,
    cameraMovement.basePosition.y + yOffset,
    cameraMovement.basePosition.z + zOffset
  );

  // Apply natural rotation by looking at a slightly offset target
  // This creates subtle camera rotation effects (pitch and yaw)
  camera.lookAt(
    rotYOffset * 3, // Slight horizontal offset for yaw effect
    rotXOffset * 2, // Slight vertical offset for pitch effect
    0 // Keep looking at center depth
  );
}

function setupMobileCameraPosition() {
  if (!camera || !campfireSystem) return; // Guard clause for when components aren't initialized yet

  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    // Adjust base position for mobile
    cameraMovement.basePosition.set(5.6, 2.445, 4.25);

    // Rotate campfire by 45 degrees for mobile view
    campfireSystem.group.rotation.y = Math.PI / 4; // 45 degrees in radians

    console.log("Mobile camera position and campfire rotation applied");
  } else {
    // Reset base position for desktop
    cameraMovement.basePosition.set(4, 1.4, 6);
    // Reset campfire rotation for desktop
    campfireSystem.group.rotation.y = 0;
  }
}

function startAnimationLoop() {
  animate();
}

function animate() {
  requestAnimationFrame(animate);

  clock.getDelta(); // Keep clock running for other systems that might need it
  const elapsedTime = performance.now() * 0.001; // Convert to seconds

  // Update natural camera movement
  updateNaturalCameraMovement(elapsedTime);

  grassSystem.updateWind(elapsedTime);
  
  // Update flower system if it exists
  if (grassSystem.flowerSystem) {
    grassSystem.flowerSystem.update(camera, elapsedTime);
  }
  
  // Example: Rotate the wave effect over time
  // You can adjust this rotation speed or make it interactive
  const waveRotationSpeed = 0.1; // radians per second
  grassSystem.setWindParameters({
    waveRotation: elapsedTime * waveRotationSpeed
  });

  fireflySystem.update(elapsedTime);

  campfireSystem.update(elapsedTime);

  waterSystem.update(elapsedTime);

  postProcessing.render();
}

window.addEventListener("resize", () => {
  if (camera && renderer && postProcessing) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    postProcessing.resize(window.innerWidth, window.innerHeight);

    setupMobileCameraPosition();
  }
});

console.log("Starting asset loading...");
const assetLoader = new AssetLoader(onLoadingProgress, onAssetsLoaded);
assetLoader.loadAllAssets();
