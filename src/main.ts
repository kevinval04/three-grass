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
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import studio from "@theatre/studio";
import { getProject } from "@theatre/core";

studio.initialize();

// Loading screen elements
const loadingScreen = document.getElementById("loading-screen") as HTMLElement;
const progressBar = document.getElementById("progress-bar") as HTMLElement;
const loadingPercentage = document.getElementById(
  "loading-percentage"
) as HTMLElement;
const loadingAsset = document.getElementById("loading-asset") as HTMLElement;

// Global variables for scene components
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let fireflySystem: FireflySystem;
let campfireSystem: CampfireSystem;
let grassSystem: GrassSystem;
let waterSystem: WaterSystem;
let postProcessing: PostProcessingSetup;
let assets: AssetCollection;
let clock: THREE.Clock;

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

  const campfirePosition = new THREE.Vector3(4, 0.8, 3); // Around infront of the camera
  const campfireRotation = new THREE.Euler(-0.05, 0, 0);
  campfireSystem = createCampfireSystem(
    scene,
    campfirePosition,
    campfireRotation
  );

  const campfireExclusionZone: GrassExclusionZone = {
    center: new THREE.Vector3(campfirePosition.x, 0, campfirePosition.z),
    radius: 2.5,
  };

  grassSystem = createGrassSystem(scene, [campfireExclusionZone], assets.textures.get('water') || null);

  // Initialize water system
  waterSystem = createWaterSystem(scene);

  postProcessing = createPostProcessing(renderer, scene, camera, {
    strength: 0.1,
    radius: 0.1,
    threshold: 0.8,
  });

  // Setup OrbitControls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0); // Look at center of scene
  controls.enableDamping = true; // Enable smooth camera movement
  controls.dampingFactor = 0.05;
  controls.enableZoom = true;
  controls.enableRotate = true;
  controls.enablePan = false; // Disable panning for better UX
  controls.minDistance = 3; // Minimum zoom distance
  controls.maxDistance = 15; // Maximum zoom distance
  controls.minPolarAngle = Math.PI / 6; // Limit vertical rotation (30 degrees from top)
  controls.maxPolarAngle = Math.PI / 2.2; // Limit vertical rotation (about 80 degrees from top)

  // Initialize character system

  const exploreButton = document.getElementById("explore-text");
  if (exploreButton) {
    exploreButton.addEventListener("click", () => {
      console.log("EXPLORE button clicked!");
    });
  }

  setupMobileCameraPosition();

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

function hideLoadingScreen() {
  loadingScreen.classList.add("hidden");

  setTimeout(() => {
    loadingScreen.style.display = "none";
  }, 800);
}


function setupMobileCameraPosition() {
  if (!camera || !campfireSystem || !controls) return; // Guard clause for when components aren't initialized yet

  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    camera.position.set(5.6, 2.445, 4.25);
    controls.target.set(0, 0, 0);
    controls.update(); // Update controls after changing camera position

    // Rotate campfire by 45 degrees for mobile view
    campfireSystem.group.rotation.y = Math.PI / 4; // 45 degrees in radians

    console.log("Mobile camera position and campfire rotation applied");
  } else {
    // Reset campfire rotation for desktop
    campfireSystem.group.rotation.y = 0;
    controls.update(); // Update controls
  }
}

function startAnimationLoop() {
  animate();
}

function animate() {
  requestAnimationFrame(animate);

  clock.getDelta(); // Keep clock running for other systems that might need it
  const elapsedTime = performance.now() * 0.001; // Convert to seconds

  // Update OrbitControls
  controls.update();

  grassSystem.updateWind(elapsedTime);
  
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
  if (camera && renderer && postProcessing && controls) {
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
