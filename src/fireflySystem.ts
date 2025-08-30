import * as THREE from "three";

export interface FireflySystem {
  particles: THREE.Points;
  update: (time: number, camera: THREE.Camera) => void;
  setFireflyCount: (count: number) => void;
  setGlowIntensity: (intensity: number) => void;
}

function createFireflyMaterial(): THREE.ShaderMaterial {
  const vertexShader = `
    uniform float time;
    uniform float glowIntensity;
    
    attribute float size;
    attribute float speed;
    attribute float phase;
    attribute vec3 velocity;
    
    varying float vOpacity;
    varying float vSize;
    varying vec2 vMotionBlur;
    varying vec3 vWorldPosition;
    varying float vDistanceFromCamera;
    
    void main() {
      vec3 pos = position;
      vec3 oldPos = pos;
      
      // Add floating movement with individual phases
      float timeOffset = time * speed + phase;
      pos.x += sin(timeOffset * 0.8 + phase) * 0.5;
      pos.y += cos(timeOffset * 0.6 + phase * 1.3) * 0.3;
      pos.z += sin(timeOffset * 0.9 + phase * 0.7) * 0.4;
      
      // Calculate previous position for motion blur
      float prevTime = timeOffset - 0.016; // ~60fps frame time
      vec3 prevPos = oldPos;
      prevPos.x += sin(prevTime * 0.8 + phase) * 0.5;
      prevPos.y += cos(prevTime * 0.6 + phase * 1.3) * 0.3;
      prevPos.z += sin(prevTime * 0.9 + phase * 0.7) * 0.4;
      
      // Add some gentle drift
      pos += velocity * time * 0.1;
      prevPos += velocity * (time - 0.016) * 0.1;
      
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      vec4 prevMvPosition = modelViewMatrix * vec4(prevPos, 1.0);
      
      gl_Position = projectionMatrix * mvPosition;
      
      // Calculate motion blur vector in screen space
      vec4 screenPos = projectionMatrix * mvPosition;
      vec4 prevScreenPos = projectionMatrix * prevMvPosition;
      vMotionBlur = (screenPos.xy / screenPos.w - prevScreenPos.xy / prevScreenPos.w) * 10.0;
      
      // Size attenuation based on distance
      float distance = length(mvPosition.xyz);
      gl_PointSize = size * (300.0 / distance);
      
      // Store distance for fragment shader transparency
      vDistanceFromCamera = distance;
      
      // Flickering effect
      float flicker = sin(timeOffset * 3.0 + phase * 2.0) * 0.5 + 0.5;
      vOpacity = (0.6 + flicker * 0.4) * glowIntensity;
      vSize = gl_PointSize;
      vWorldPosition = pos;
    }
  `;

  const fragmentShader = `
    uniform vec3 color;
    uniform float time;
    
    varying float vOpacity;
    varying float vSize;
    varying vec2 vMotionBlur;
    varying vec3 vWorldPosition;
    varying float vDistanceFromCamera;
    
    void main() {
      vec2 center = gl_PointCoord - 0.5;
      float distance = length(center);
      
      // Create flat circle with soft edges
      float circle = 1.0 - smoothstep(0.2, 0.5, distance);
      
      // Add soft transparency towards edges
      float edgeFade = 1.0 - smoothstep(0.1, 0.4, distance);
      circle *= edgeFade;
      
      // Motion blur effect - stretch the circle along motion vector
      vec2 motionOffset = vMotionBlur * 0.1;
      float motionLength = length(motionOffset);
      
      if (motionLength > 0.01) {
        // Create elongated shape for motion blur
        vec2 motionDir = normalize(motionOffset);
        vec2 perpDir = vec2(-motionDir.y, motionDir.x);
        
        // Project point onto motion direction
        float alongMotion = dot(center, motionDir);
        float perpMotion = dot(center, perpDir);
        
        // Create stretched ellipse
        float stretchFactor = 1.0 + motionLength * 5.0;
        float ellipse = 1.0 - smoothstep(0.2, 0.4, 
          sqrt(alongMotion * alongMotion / (stretchFactor * stretchFactor) + 
               perpMotion * perpMotion));
        
        circle = max(circle, ellipse * 0.7);
      }
      
      // Add some texture variation
      float noise = sin(vWorldPosition.x * 20.0) * sin(vWorldPosition.z * 20.0) * 0.1 + 0.9;
      
      // Simple flat color with slight variation
      vec3 finalColor = color * noise;
      
      // Add subtle flickering
      float flicker = sin(time * 3.0 + vWorldPosition.x * 10.0) * 0.1 + 0.9;
      finalColor *= flicker;
      
      // Distance-based transparency (closer = more opaque, further = more transparent)
      float distanceFade = 1.0 - smoothstep(5.0, 20.0, vDistanceFromCamera);
      distanceFade = mix(0.3, 1.0, distanceFade); // Min 30% opacity, max 100%
      
      float alpha = circle * vOpacity * distanceFade;
      
      gl_FragColor = vec4(finalColor, alpha);
    }
  `;

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      time: { value: 0.0 },
      color: { value: new THREE.Color(0xffdd88) }, // Warm yellow for authentic fireflies
      glowIntensity: { value: 1.0 }
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

export function createFireflySystem(scene: THREE.Scene, camera: THREE.Camera): FireflySystem {
  const fireflyCount = 128;
  
  // Create geometry for particles
  const geometry = new THREE.BufferGeometry();
  
  // Positions
  const positions = new Float32Array(fireflyCount * 3);
  const sizes = new Float32Array(fireflyCount);
  const speeds = new Float32Array(fireflyCount);
  const phases = new Float32Array(fireflyCount);
  const velocities = new Float32Array(fireflyCount * 3);
  
  // Position fireflies in front of the camera in a natural distribution
  const cameraPosition = camera.position.clone();
  const cameraDirection = new THREE.Vector3(0, 0, -1);
  cameraDirection.applyQuaternion(camera.quaternion);
  
  for (let i = 0; i < fireflyCount; i++) {
    const i3 = i * 3;
    
    // Create a volume in front of the camera
    const distance = 2 + Math.random() * 15; // 2-17 units in front
    const spread = 20; // Horizontal and vertical spread
    
    // Random position within the volume
    const x = (Math.random() - 0.5) * spread;
    const y = 0.5 + Math.random() * 2; // Always above ground (0.5 to 6.5 units high)
    const z = (Math.random() - 0.5) * spread * 2; // More depth variation
    
    // Position relative to camera
    const fireflyPos = cameraPosition.clone();
    fireflyPos.add(cameraDirection.clone().multiplyScalar(distance));
    fireflyPos.x += x;
    fireflyPos.y = y; // Set absolute Y position instead of adding to camera Y
    fireflyPos.z += z;
    
    positions[i3] = fireflyPos.x;
    positions[i3 + 1] = fireflyPos.y;
    positions[i3 + 2] = fireflyPos.z;
    
    // Random attributes
    sizes[i] = 0.5 + Math.random() * 0.1; // Smaller size range
    speeds[i] = 0.5 + Math.random() * 1.0; // Movement speed
    phases[i] = Math.random() * Math.PI * 2; // Phase offset
    
    // Gentle random velocity
    velocities[i3] = (Math.random() - 0.5) * 0.2;
    velocities[i3 + 1] = (Math.random() - 0.5) * 0.1;
    velocities[i3 + 2] = (Math.random() - 0.5) * 0.2;
  }
  
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('speed', new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
  
  const material = createFireflyMaterial();
  const particles = new THREE.Points(geometry, material);
  
  scene.add(particles);
  
  const update = (time: number, camera: THREE.Camera) => {
    if (material.uniforms.time) {
      material.uniforms.time.value = time;
    }
  };
  
  const setFireflyCount = (count: number) => {
    // This would require recreating the geometry with new count
    console.log(`Setting firefly count to ${count} (requires recreation)`);
  };
  
  const setGlowIntensity = (intensity: number) => {
    if (material.uniforms.glowIntensity) {
      material.uniforms.glowIntensity.value = intensity;
    }
  };
  
  return {
    particles,
    update,
    setFireflyCount,
    setGlowIntensity
  };
}
