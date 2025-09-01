import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createFireSystem, defaultCampfireConfig } from './fireSystem';
import type { FireSystem } from './fireSystem';

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

  // Create toon material function for this campfire
  function createCampfireToonMaterial(color: THREE.Color, lightPosition: THREE.Vector3): THREE.ShaderMaterial {
    const material = new THREE.ShaderMaterial({
      vertexShader: toonVertexShader,
      fragmentShader: toonFragmentShader,
      uniforms: {
        uColor: { value: color },
        uLightPosition: { value: lightPosition },
        uLightColor: { value: new THREE.Color(0xffaa44) }, // Warm fire light color
        uAmbientStrength: { value: 0.3 },
        uToonLevels: { value: 4.0 }, // Number of toon shading levels
        uRimColor: { value: new THREE.Color(0xff6600) }, // Orange rim light
        uRimPower: { value: 2.0 }
      },
      side: THREE.DoubleSide
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
      position: { x: 0, y: 0, z: 0.1 } // Relative to group center
    },
    innerFlame: {
      ...defaultCampfireConfig.innerFlame,
      position: { x: 0, y: -0.29, z: 0.11 } // Relative to group center
    }
  };
  
  // Create fire system normally, then move flames to group
  const campfireSystem = createFireSystem(scene, campfireConfig);
  
  // Remove flames from scene and add them to the campfire group
  scene.remove(campfireSystem.mainFlame);
  scene.remove(campfireSystem.innerFlame);
  campfireGroup.add(campfireSystem.mainFlame);
  campfireGroup.add(campfireSystem.innerFlame);

  // Load campfire model
  const loader = new GLTFLoader();
  loader.load(
    '/campfire.glb',
    (gltf) => {
      const campfireModel = gltf.scene;
      campfireModel.position.set(0, -0.75, 0); // Relative to group center
      campfireModel.scale.setScalar(1.7);
      
      // Apply toon shader to the model and enable shadows
      campfireModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          // Get original material color or use default
          const originalColor = child.material instanceof THREE.MeshStandardMaterial || 
                               child.material instanceof THREE.MeshLambertMaterial ||
                               child.material instanceof THREE.MeshPhongMaterial
                               ? child.material.color.clone()
                               : new THREE.Color(0x8B4513); // Default brown color for wood
          
          // Apply toon material
          child.material = createCampfireToonMaterial(originalColor, campfireLight.position);
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      
      campfireGroup.add(campfireModel); // Add to group instead of scene
      console.log('Campfire model loaded successfully with toon shader');
    },
    (progress) => {
      console.log('Loading progress:', progress);
    },
    (error) => {
      console.log('Could not load campfire model:', error);
      // Create simple log placeholder instead
    }
  );

  const update = (time: number) => {
    campfireSystem.update(time);
  };

  const dispose = () => {
    scene.remove(campfireGroup); // Remove the entire group
    campfireSystem.dispose();
    campfireToonMaterials.forEach(material => material.dispose());
    campfireToonMaterials.length = 0;
  };

  return {
    group: campfireGroup,
    fireSystem: campfireSystem,
    fireLight: campfireLight,
    toonMaterials: campfireToonMaterials,
    update,
    dispose
  };
}
