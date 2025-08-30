import "./style.css";
import { createSceneSetup, setupLighting, createSkybox } from "./sceneSetup";
import { createGrassSystem } from "./grassSystem";
import type { GrassExclusionZone } from "./grassSystem";
import { createFireflySystem } from "./fireflySystem";
import { PerformanceMonitor } from "./performanceMonitor";
import { createCampfireSystem, setupCampfireControls, setupPostProcessingControls } from "./campfire";
import { createPostProcessing } from "./postProcessing";
import type { CampfireSystem } from "./campfire";
import type { PostProcessingSetup } from "./postProcessing";
import * as THREE from "three";

// Get the canvas element
const canvas = document.getElementById("three-canvas") as HTMLCanvasElement;

// Initialize scene, camera, renderer, and controls
const { scene, camera, renderer, controls } = createSceneSetup(canvas);

// Setup lighting
setupLighting(scene);

// Create skybox
createSkybox(scene);

// Create firefly system
const fireflySystem = createFireflySystem(scene, camera);

// Create campfire system positioned in front of the camera with 90-degree Y rotation
const campfirePosition = new THREE.Vector3(4, 2.0, 3);
const campfireRotation = new THREE.Euler(0, 0, 0); // 90 degrees on Y-axis
const campfireSystem: CampfireSystem = createCampfireSystem(scene, campfirePosition, campfireRotation);

// Create exclusion zone around campfire so grass doesn't spawn there
const campfireExclusionZone: GrassExclusionZone = {
  center: new THREE.Vector3(campfirePosition.x, 0, campfirePosition.z), // Ground level
  radius: 2.5 // 4.5 unit radius around campfire (3x bigger)
};

// Create grass system with campfire exclusion zone
const grassSystem = createGrassSystem(scene, [campfireExclusionZone]);

// Example: Easy manipulation of the entire campfire as a group
// campfireSystem.group.position.set(5, 0, 5); // Move entire campfire
// campfireSystem.group.rotation.y += Math.PI; // Rotate entire campfire

// Setup post-processing with bloom for fire effects
const postProcessing: PostProcessingSetup = createPostProcessing(renderer, scene, camera, {
  strength: 0.02,
  radius: 0.1,
  threshold: 0.8
});

// Initialize performance monitor
const performanceMonitor = new PerformanceMonitor();
performanceMonitor.setRenderer(renderer);

// Setup UI controls
// setupCampfireControls(campfireSystem);
// setupPostProcessingControls(postProcessing, renderer);

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  // Update controls
  controls.update();

  // Update wind animation
  const elapsedTime = performance.now() * 0.001; // Convert to seconds
  grassSystem.updateWind(elapsedTime);

  // Update fireflies
  fireflySystem.update(elapsedTime, camera);

  // Update campfire
  campfireSystem.update(elapsedTime);

  // Update performance monitor
  performanceMonitor.update();

  // Render with post-processing for bloom effects
  postProcessing.render();
}

// Handle window resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postProcessing.resize(window.innerWidth, window.innerHeight);
});

// Start the animation
animate();