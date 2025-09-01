import "./style.css";
import { createSceneSetup, setupLighting, createSkyboxWithTexture } from "./sceneSetup";
import { createGrassSystem } from "./grassSystem";
import type { GrassExclusionZone, GrassSystem } from "./grassSystem";
import { createFireflySystem, type FireflySystem } from "./fireflySystem";
import { createCampfireSystem } from "./campfire";
import { createPostProcessing } from "./postProcessing";
import type { CampfireSystem } from "./campfire";
import type { PostProcessingSetup } from "./postProcessing";
import { AssetLoader, type LoadingProgress, type AssetCollection } from "./assetLoader";
import * as THREE from "three";

// Loading screen elements
const loadingScreen = document.getElementById("loading-screen") as HTMLElement;
const progressBar = document.getElementById("progress-bar") as HTMLElement;
const loadingPercentage = document.getElementById("loading-percentage") as HTMLElement;
const loadingAsset = document.getElementById("loading-asset") as HTMLElement;

// Global variables for scene components
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let fireflySystem: FireflySystem;
let campfireSystem: CampfireSystem;
let grassSystem: GrassSystem;
let postProcessing: PostProcessingSetup;
let assets: AssetCollection;

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

  fireflySystem = createFireflySystem(scene, camera);

  const campfirePosition = new THREE.Vector3(4, 2.0, 3); // Around infront of the camera
  const campfireRotation = new THREE.Euler(0, 0, 0);
  campfireSystem = createCampfireSystem(scene, campfirePosition, campfireRotation);

  const campfireExclusionZone: GrassExclusionZone = {
    center: new THREE.Vector3(campfirePosition.x, 0, campfirePosition.z),
    radius: 2.5
  };

  grassSystem = createGrassSystem(scene, [campfireExclusionZone]);

  postProcessing = createPostProcessing(renderer, scene, camera, {
    strength: 0.1,
    radius: 0.1,
    threshold: 0.8
  });

  const exploreButton = document.getElementById("explore-text");
  if (exploreButton) {
    exploreButton.addEventListener("click", () => {
      console.log("EXPLORE button clicked!");
    });
  }

  setupMobileCameraPosition();

  startAnimationLoop();
}

function hideLoadingScreen() {
  loadingScreen.classList.add("hidden");
  
  setTimeout(() => {
    loadingScreen.style.display = "none";
  }, 800);
}

// Mouse camera movement variables
let mouseX = 0;
let targetCameraX = 0;
let currentCameraX = 0;
const cameraInertia = 0.02; // How fast the camera follows the target (lower = more inertia)

function onMouseMove(event: MouseEvent) {
  mouseX = (event.clientX / window.innerWidth) * 2 - 1;   // Normalize mouse X to -1 to 1 range
  targetCameraX = mouseX * 0.2;
}

window.addEventListener('mousemove', onMouseMove);

function setupMobileCameraPosition() {
  if (!camera || !campfireSystem) return; // Guard clause for when components aren't initialized yet
  
  const isMobile = window.innerWidth <= 768;
  
  if (isMobile) {
    camera.position.set(5.6, 2.445, 4.25);
    camera.rotation.set(-0.6, 0.8, 0.45);
    
    // Rotate campfire by 45 degrees for mobile view
    campfireSystem.group.rotation.y = Math.PI / 4; // 45 degrees in radians
    
    console.log("Mobile camera position and campfire rotation applied");
  } else {
    // Reset campfire rotation for desktop
    campfireSystem.group.rotation.y = 0;
  }
}

function startAnimationLoop() {
  animate();
}

function animate() {
  requestAnimationFrame(animate);

  currentCameraX += (targetCameraX - currentCameraX) * cameraInertia;
  
  const isMobile = window.innerWidth <= 768;
  const basePosition = isMobile ? 
    new THREE.Vector3(5.6, 2.445, 4.25) : 
    new THREE.Vector3(4, 3, 6);
  
  camera.position.x = basePosition.x + currentCameraX;
  camera.position.y = basePosition.y;
  camera.position.z = basePosition.z;
  
  camera.lookAt(0, 0, 0);

  const elapsedTime = performance.now() * 0.001; // Convert to seconds
  grassSystem.updateWind(elapsedTime);

  fireflySystem.update(elapsedTime);

  campfireSystem.update(elapsedTime);
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