import "./style.css";
import { createSceneSetup, setupLighting, createSkybox } from "./sceneSetup";
import { createGrassSystem } from "./grassSystem";

// Get the canvas element
const canvas = document.getElementById("three-canvas") as HTMLCanvasElement;

// Initialize scene, camera, renderer, and controls
const { scene, camera, renderer, controls } = createSceneSetup(canvas);

// Setup lighting
setupLighting(scene);

// Create skybox
createSkybox(scene);

// Create grass system (plane and grass)
const grassSystem = createGrassSystem(scene);

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  // Update controls
  controls.update();

  // Update wind animation
  const elapsedTime = performance.now() * 0.001; // Convert to seconds
  grassSystem.updateWind(elapsedTime);

  renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start the animation
animate();