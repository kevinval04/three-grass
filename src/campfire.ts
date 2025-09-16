import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createFireSystem, defaultCampfireConfig } from "./fireSystem";
import type { FireSystem } from "./fireSystem";

// Toon Shader
const toonVertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewPosition;
  
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const toonFragmentShader = `
  uniform vec3 uColor;
  uniform vec3 uLightPosition;
  uniform vec3 uLightColor;
  uniform float uAmbientStrength;
  uniform float uToonLevels;
  uniform vec3 uRimColor;
  uniform float uRimPower;
  
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewPosition;
  
  void main() {
    vec3 normal = normalize(vNormal);
    vec3 lightDir = normalize(uLightPosition - vPosition);
    vec3 viewDir = normalize(vViewPosition);
    
    // Toon shading - quantize the diffuse lighting
    float NdotL = max(dot(normal, lightDir), 0.0);
    float toonDiffuse = floor(NdotL * uToonLevels) / uToonLevels;
    
    // Ambient lighting
    vec3 ambient = uAmbientStrength * uLightColor;
    
    // Diffuse lighting with toon effect
    vec3 diffuse = toonDiffuse * uLightColor;
    
    // Rim lighting for cartoon effect
    float rimFactor = 1.0 - max(dot(viewDir, normal), 0.0);
    rimFactor = smoothstep(0.6, 1.0, rimFactor);
    vec3 rim = rimFactor * uRimColor;
    
    // Combine lighting
    vec3 lighting = ambient + diffuse + rim;
    vec3 finalColor = uColor * lighting;
    
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// Export interface and functions for use in other modules
export interface CampfireSystem {
  group: THREE.Group; // Main group containing all campfire elements
  fireSystem: FireSystem;
  fireLight: THREE.PointLight;
  toonMaterials: THREE.ShaderMaterial[];
  update: (time: number) => void;
  dispose: () => void;
}

export function createCampfireSystem(
  scene: THREE.Scene,
  position: THREE.Vector3 = new THREE.Vector3(0, 0, 2),
  rotation: THREE.Euler = new THREE.Euler(0, Math.PI / 2, 0)
): CampfireSystem {
  const campfireToonMaterials: THREE.ShaderMaterial[] = [];

  // Create main campfire group
  const campfireGroup = new THREE.Group();
  campfireGroup.position.copy(position);
  campfireGroup.rotation.copy(rotation);
  scene.add(campfireGroup);

  // Create fire light (positioned relative to group)
  const campfireLight = new THREE.PointLight(0xff4400, 2, 10);
  campfireLight.position.set(0, 0.5, 0); // Relative to group center
  campfireLight.castShadow = true;
  campfireLight.shadow.mapSize.width = 1024;
  campfireLight.shadow.mapSize.height = 1024;
  campfireGroup.add(campfireLight); // Add to group instead of scene

  // Fire flicker properties
  const baseIntensity = 10.0; // Increased base intensity
  const baseColor = new THREE.Color(0xff4400);
  const flickerSpeed = 2.8; // Faster flicker
  const intensityVariation = 0.7; // Stronger variation
  const colorVariation = 0.4; // More color variation
  const positionVariation = 0.06; // Reduced position movement
  let flickerTime = 0;

  // Enhanced noise function for more dynamic fire flicker
  const noise = (x: number, y: number = 0, z: number = 0) => {
    // Multiple layers for more complex and erratic flicker
    const n1 = Math.sin(x * 1.0 + y * 1.3 + z * 0.7) * 0.4;
    const n2 = Math.sin(x * 2.1 + y * 0.8 + z * 1.4) * 0.25;
    const n3 = Math.sin(x * 4.3 + y * 2.1 + z * 0.9) * 0.15;
    const n4 = Math.sin(x * 8.7 + y * 4.2 + z * 1.8) * 0.08;
    const n5 = Math.sin(x * 15.1 + y * 7.3 + z * 3.2) * 0.04; // High frequency for sparks
    const n6 = Math.sin(x * 0.3 + y * 0.2 + z * 0.1) * 0.08; // Low frequency for slow variations

    // Add some turbulence
    const turbulence = Math.sin(x * 3.7 + y * 2.9 + z * 1.1) * Math.cos(x * 1.9 + y * 3.1 + z * 0.8) * 0.1;

    return n1 + n2 + n3 + n4 + n5 + n6 + turbulence + 0.5; // Normalize to 0-1 range
  };

  // Fire flare particle system
  interface FireParticle {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    life: number;
    maxLife: number;
    size: number;
  }

  const particles: FireParticle[] = [];
  const maxParticles = 50;
  const particleSpawnRate = 0.1; // Spawn chance per frame

  // Create toon material function for this campfire
  function createCampfireToonMaterial(
    color: THREE.Color,
    lightPosition: THREE.Vector3
  ): THREE.ShaderMaterial {
    const material = new THREE.ShaderMaterial({
      vertexShader: toonVertexShader,
      fragmentShader: toonFragmentShader,
      uniforms: {
        uColor: { value: color },
        uLightPosition: { value: lightPosition },
        uLightColor: { value: new THREE.Color(0xffaa44) }, // Warm fire light color
        uAmbientStrength: { value: 0.3 },
        uToonLevels: { value: 20.0 }, // Number of toon shading levels
        uRimColor: { value: new THREE.Color(0xff6600) }, // Orange rim light
        uRimPower: { value: 2.0 },
      },
      side: THREE.DoubleSide,
    });

    // Store reference for later updates
    campfireToonMaterials.push(material);
    return material;
  }

  // Create fire system with relative positioning
  const campfireConfig = {
    ...defaultCampfireConfig,
    mainFlame: {
      ...defaultCampfireConfig.mainFlame,
      position: { x: 0, y: 0, z: 0.1 }, // Relative to group center
    },
    innerFlame: {
      ...defaultCampfireConfig.innerFlame,
      position: { x: 0, y: -0.29, z: 0.11 }, // Relative to group center
    },
  };

  // Create fire system normally, then move flames to group
  const campfireSystem = createFireSystem(scene, campfireConfig);

  // Remove flames from scene and add them to the campfire group
  scene.remove(campfireSystem.mainFlame);
  scene.remove(campfireSystem.innerFlame);
  campfireGroup.add(campfireSystem.mainFlame);
  campfireGroup.add(campfireSystem.innerFlame);

  // Store flame references for scaling
  const mainFlame = campfireSystem.mainFlame;
  const innerFlame = campfireSystem.innerFlame;
  const mainFlameBaseScale = mainFlame.scale.clone();
  const innerFlameBaseScale = innerFlame.scale.clone();

  // Load campfire model
  const loader = new GLTFLoader();
  loader.load(
    "/campfire.glb",
    (gltf) => {
      const campfireModel = gltf.scene;
      campfireModel.position.set(0, -0.75, 0); // Relative to group center
      campfireModel.scale.setScalar(1.7);

      // Apply toon shader to the model and enable shadows
      campfireModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          // Get original material color or use default
          const originalColor =
            child.material instanceof THREE.MeshStandardMaterial ||
            child.material instanceof THREE.MeshLambertMaterial ||
            child.material instanceof THREE.MeshPhongMaterial
              ? child.material.color.clone()
              : new THREE.Color(0x8b4513); // Default brown color for wood

          // Apply toon material
          child.material = createCampfireToonMaterial(
            originalColor,
            campfireLight.position
          );
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      campfireGroup.add(campfireModel); // Add to group instead of scene
      console.log("Campfire model loaded successfully with toon shader");
    },
    (progress) => {
      console.log("Loading progress:", progress);
    },
    (error) => {
      console.log("Could not load campfire model:", error);
      // Create simple log placeholder instead
    }
  );

  // Create particle system for fire flares
  const particleGeometry = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(maxParticles * 3);
  const particleColors = new Float32Array(maxParticles * 3);
  const particleSizes = new Float32Array(maxParticles);
  const particleOpacities = new Float32Array(maxParticles);

  particleGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(particlePositions, 3)
  );
  particleGeometry.setAttribute(
    "color",
    new THREE.BufferAttribute(particleColors, 3)
  );
  particleGeometry.setAttribute(
    "size",
    new THREE.BufferAttribute(particleSizes, 1)
  );
  particleGeometry.setAttribute(
    "opacity",
    new THREE.BufferAttribute(particleOpacities, 1)
  );

  const particleMaterial = new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: `
      attribute float size;
      attribute float opacity;
      varying float vOpacity;
      varying vec3 vColor;
      
      void main() {
        vOpacity = opacity;
        vColor = color;
        
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying float vOpacity;
      varying vec3 vColor;
      
      void main() {
        float distance = length(gl_PointCoord - vec2(0.5));
        if (distance > 0.5) discard;
        
        // Solid color - no transparency
        gl_FragColor = vec4(vColor, 1.0);
      }
    `,
    transparent: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true,
  });

  const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
  campfireGroup.add(particleSystem);

  // Function to spawn a new particle
  const spawnParticle = () => {
    if (particles.length >= maxParticles) return;

    const particle: FireParticle = {
      position: new THREE.Vector3(
        (Math.random() - 0.5) * 0.3, // Small spread around fire center
        -0.2, // Start near fire base
        (Math.random() - 0.5) * 0.3
      ),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.5, // Random horizontal drift
        1.5 + Math.random() * 1.0, // Upward velocity with variation
        (Math.random() - 0.5) * 0.5
      ),
      life: 0,
      maxLife: 1.0 + Math.random() * 1.5, // 1-2.5 seconds life
      size: 0.05 + Math.random() * 0.05, // Random size 0.05-0.1 (tiny specks)
    };

    particles.push(particle);
  };

  // Function to update particles
  const updateParticles = (deltaTime: number) => {
    // Spawn new particles occasionally
    if (Math.random() < particleSpawnRate && particles.length < maxParticles) {
      spawnParticle();
    }

    // Update existing particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];

      // Update life
      particle.life += deltaTime;

      // Remove dead particles
      if (particle.life >= particle.maxLife) {
        particles.splice(i, 1);
        continue;
      }

      // Update position
      particle.position.add(
        particle.velocity.clone().multiplyScalar(deltaTime)
      );

      // Add some drift and slow down over time
      particle.velocity.y *= 0.98; // Slight deceleration
      particle.velocity.x *= 0.99;
      particle.velocity.z *= 0.99;
    }

    // Update geometry attributes
    const positions = particleGeometry.attributes.position
      .array as Float32Array;
    const colors = particleGeometry.attributes.color.array as Float32Array;
    const sizes = particleGeometry.attributes.size.array as Float32Array;
    const opacities = particleGeometry.attributes.opacity.array as Float32Array;

    // Clear arrays
    positions.fill(0);
    colors.fill(0);
    sizes.fill(0);
    opacities.fill(0);

    // Fill with active particles
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      const lifeRatio = particle.life / particle.maxLife;

      // Position
      positions[i * 3] = particle.position.x;
      positions[i * 3 + 1] = particle.position.y;
      positions[i * 3 + 2] = particle.position.z;

      // Color (red gradient)
      const red = 1.0;
      const green = 0.1 * (1.0 - lifeRatio); // Very little green, fades out
      const blue = 0.0; // No blue for pure red

      colors[i * 3] = red;
      colors[i * 3 + 1] = green;
      colors[i * 3 + 2] = blue;

      // Size (shrink over time)
      sizes[i] = particle.size * (1.0 - lifeRatio * 0.5);

      // No opacity - particles are solid (but we still need to set the attribute)
      opacities[i] = 1.0;
    }

    // Mark attributes as needing update
    particleGeometry.attributes.position.needsUpdate = true;
    particleGeometry.attributes.color.needsUpdate = true;
    particleGeometry.attributes.size.needsUpdate = true;
    particleGeometry.attributes.opacity.needsUpdate = true;

    // Update draw range
    particleGeometry.setDrawRange(0, particles.length);
  };

  // Function to update fire light flicker with enhanced dynamics
  const updateFireFlicker = (time: number) => {
    flickerTime = time * flickerSpeed;

    // Multiple noise layers for more complex flicker patterns
    const primaryNoise = noise(flickerTime, 0, 0);
    const secondaryNoise = noise(flickerTime * 1.3, flickerTime * 0.7, 0);
    const detailNoise = noise(flickerTime * 2.1, flickerTime * 1.4, flickerTime * 0.8);
    const sparkNoise = noise(flickerTime * 4.7, flickerTime * 3.1, flickerTime * 2.3);
    const slowNoise = noise(flickerTime * 0.5, flickerTime * 0.3, flickerTime * 0.2);

    // Combine noise layers with different weights for erratic behavior
    const combinedNoise = primaryNoise * 0.4 + secondaryNoise * 0.3 + detailNoise * 0.2 + sparkNoise * 0.08 + slowNoise * 0.02;

    // Apply stronger flickering to intensity (can go down to 30% for more dramatic effect)
    const intensityMultiplier = 0.3 + combinedNoise * intensityVariation;
    campfireLight.intensity = baseIntensity * intensityMultiplier;

    // Enhanced color temperature variation
    const colorFlicker = (combinedNoise - 0.5) * colorVariation;
    const tempVariation = (sparkNoise - 0.5) * 0.3; // Additional temperature shift

    // Color temperature shifts: warmer (more red/yellow) to cooler (more blue/white)
    const r = Math.min(1, Math.max(0, baseColor.r + colorFlicker * 0.3 + tempVariation * 0.2));
    const g = Math.min(1, Math.max(0, baseColor.g + colorFlicker * 0.2 - tempVariation * 0.1));
    const b = Math.min(1, Math.max(0, baseColor.b + colorFlicker * 0.1 + tempVariation * 0.15));

    campfireLight.color.setRGB(r, g, b);

    // Subtle position movement - gentle flicker
    const positionFlickerX = (primaryNoise - 0.5) * positionVariation * 0.3;
    const positionFlickerY = (secondaryNoise - 0.5) * positionVariation * 0.5;
    const positionFlickerZ = (detailNoise - 0.5) * positionVariation * 0.2;

    campfireLight.position.set(
      positionFlickerX,
      0.5 + positionFlickerY,
      positionFlickerZ
    );

    // Gentle flame scaling variation
    const scaleNoise = noise(flickerTime * 1.7, flickerTime * 1.1, flickerTime * 0.9);
    const scaleVariation = (scaleNoise - 0.5) * 0.08; // ±8% scale variation (reduced)

    // Apply subtle scaling to flames
    const mainScaleMultiplier = 1.0 + scaleVariation * 0.4;
    const innerScaleMultiplier = 1.0 + scaleVariation * 0.2;

    mainFlame.scale.copy(mainFlameBaseScale).multiplyScalar(mainScaleMultiplier);
    innerFlame.scale.copy(innerFlameBaseScale).multiplyScalar(innerScaleMultiplier);

    // Very subtle rotation
    const rotationNoise = noise(flickerTime * 0.8, flickerTime * 0.6, 0);
    const rotationVariation = (rotationNoise - 0.5) * 0.05; // Much smaller rotation

    mainFlame.rotation.z = rotationVariation * 0.15;
    innerFlame.rotation.z = -rotationVariation * 0.25;
  };

  let lastTime = 0;
  const update = (time: number) => {
    const deltaTime = time - lastTime;
    lastTime = time;

    campfireSystem.update(time);
    updateFireFlicker(time);
    updateParticles(deltaTime);
  };

  const dispose = () => {
    scene.remove(campfireGroup); // Remove the entire group
    campfireSystem.dispose();
    campfireToonMaterials.forEach((material) => material.dispose());
    campfireToonMaterials.length = 0;

    // Clean up particle system
    particleGeometry.dispose();
    particleMaterial.dispose();
    particles.length = 0;
  };

  return {
    group: campfireGroup,
    fireSystem: campfireSystem,
    fireLight: campfireLight,
    toonMaterials: campfireToonMaterials,
    update,
    dispose,
  };
}
