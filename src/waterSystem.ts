import * as THREE from "three";

export interface WaterSystem {
  mesh: THREE.Mesh;
  update: (elapsedTime: number) => void;
  dispose: () => void;
  getCurrentWaterHeight: (worldX: number, time: number) => number;
  uniforms: { [key: string]: THREE.IUniform };
}

export function createWaterSystem(scene: THREE.Scene, waterStripesTexture?: THREE.Texture): WaterSystem {
  // Create water plane geometry with more segments for better wave deformation
  const waterGeometry = new THREE.PlaneGeometry(60, 70, 80, 64);
  
  // Vertex shader for water waves
  const vertexShader = `
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    
    uniform float uTime;
    uniform float uWaveSpeed;
    uniform float uWaveAmplitude;
    uniform float uWaveFrequency;
    
    void main() {
      vUv = uv;
      
      // Get world position
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      
      // Create sine wave based on x position with 5 repeats across the surface
      float wave = sin(position.x * uWaveFrequency + uTime * uWaveSpeed) * uWaveAmplitude;
      
      // Apply the wave to the z position (since plane is rotated)
      vec3 modifiedPosition = position;
      modifiedPosition.z += wave;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(modifiedPosition, 1.0);
    }
  `;
  
  // Fragment shader for water appearance
  const fragmentShader = `
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    
    uniform float uTime;
    uniform vec3 uWaterColor;
    uniform float uOpacity;
    uniform sampler2D uWaterStripes;
    uniform vec2 uStripesScale;
    uniform float uStripesSpeed;
    uniform float uStripesRotation;
    uniform bool uHasStripes;
    
    void main() {
      // Base water color
      vec3 color = uWaterColor;
      
      // Add some subtle variation based on position and time
      float variation = sin(vWorldPosition.x * 0.1 + uTime * 0.5) * 0.1 + 0.9;
      color *= variation;
      
      float finalOpacity = uOpacity;
      
      // Add animated water stripes if texture is available
      if (uHasStripes) {
        // Create base UV coordinates with different scaling for X and Y
        vec2 stripesUV = vWorldPosition.xz * uStripesScale;
        
        // Apply rotation
        float cosRot = cos(uStripesRotation);
        float sinRot = sin(uStripesRotation);
        vec2 rotatedUV = vec2(
          stripesUV.x * cosRot - stripesUV.y * sinRot,
          stripesUV.x * sinRot + stripesUV.y * cosRot
        );
        
        // Add animation in the wave direction (after rotation)
        rotatedUV.x += uTime * uStripesSpeed;
        
        // Sample the stripes texture
        float stripes = texture2D(uWaterStripes, rotatedUV).r;
        
        // Make stripes pure white and more pronounced
        float stripeIntensity = stripes * stripes; // Square for more contrast
        
        // Pure white color for stripes
        vec3 pureWhite = vec3(1.0, 1.0, 1.0);
        
        // Mix water color with pure white in stripe areas
        color = mix(color, pureWhite, stripeIntensity * 0.8);
        
        // Keep stripes opaque - don't reduce opacity in stripe areas
        finalOpacity = uOpacity;
      }
      
      gl_FragColor = vec4(color, finalOpacity);
    }
  `;
  
  // Create shader material with uniforms
  const waterMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0.0 },
      uWaveSpeed: { value: 2.0 },
      uWaveAmplitude: { value: 0.1 },
      uWaveFrequency: { value: Math.PI * 5 / 30 }, // 5 repeats across the 60 unit width (position ranges from -30 to +30)
      uWaterColor: { value: new THREE.Color(0x006994) },
      uOpacity: { value: 1.2 },
      uWaterStripes: { value: waterStripesTexture || null },
      uStripesScale: { value: new THREE.Vector2(0.03, 0.12) }, // Reduced tiling - fewer, larger stripes
      uStripesSpeed: { value: 0.3 }, // Slower animation speed
      uStripesRotation: { value: Math.PI / 6 }, // Rotation in radians (30 degrees)
      uHasStripes: { value: !!waterStripesTexture }
    },
    transparent: true,
    side: THREE.DoubleSide,
  });
  
  // Create water mesh
  const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
  
  // Position the water plane
  waterMesh.rotation.x = -Math.PI / 2; // Rotate to be horizontal
  waterMesh.position.y = -0.5; // Position below ground level
  waterMesh.receiveShadow = true;
  
  // Add to scene
  scene.add(waterMesh);
  
  // Update function for water animations
  function update(elapsedTime: number) {
    // Update time uniform for wave animation
    waterMaterial.uniforms.uTime.value = elapsedTime;
  }
  
  // Add getter for current water height (synced with vertex shader)
  function getCurrentWaterHeight(worldX: number, time: number): number {
    const baseLevel = -0.5; // water mesh y position
    const wave = Math.sin(worldX * (Math.PI * 5 / 30) + time * 2.0) * 0.1;
    return baseLevel + wave;
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
    getCurrentWaterHeight, // expose this for other materials
    uniforms: waterMaterial.uniforms // expose uniforms for sync
  };
}
