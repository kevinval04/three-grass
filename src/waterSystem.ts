import * as THREE from "three";

export interface WaterSystem {
  mesh: THREE.Mesh;
  update: (elapsedTime: number) => void;
  dispose: () => void;
}

export function createWaterSystem(scene: THREE.Scene): WaterSystem {
  // Create water plane geometry
  const waterGeometry = new THREE.PlaneGeometry(100, 100, 32, 32);
  
  // Create blue standard material for water
  const waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x006994, // Deep blue color
    transparent: true,
    opacity: 0.8,
    roughness: 0.1,
    metalness: 0.1,
  });
  
  // Create water mesh
  const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
  
  // Position the water plane
  waterMesh.rotation.x = -Math.PI / 2; // Rotate to be horizontal
  waterMesh.position.y = -0.5; // Position below ground level
  waterMesh.receiveShadow = true;
  
  // Add to scene
  scene.add(waterMesh);
  
  // Update function for potential animations (currently empty but ready for future enhancements)
  function update(elapsedTime: number) {
    // Future: Add water animations like waves, ripples, etc.
    // For now, keep it static
  }
  
  // Dispose function for cleanup
  function dispose() {
    scene.remove(waterMesh);
    waterGeometry.dispose();
    waterMaterial.dispose();
  }
  
  return {
    mesh: waterMesh,
    update,
    dispose,
  };
}
