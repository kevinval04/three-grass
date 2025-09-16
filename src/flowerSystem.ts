import * as THREE from 'three';
// import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import { biasedRandomScale } from './utils';

export interface FlowerSystem {
  group: THREE.Group;
  update: (camera: THREE.Camera, elapsedTime: number) => void;
  addFlower: (position: THREE.Vector3, scale?: number) => void;
}

const flowerVertexShader = `
  uniform float uTime;
  uniform float windStrength;
  uniform vec2 windDirection;
  uniform float windFrequency;
  
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  
  void main() {
    vUv = uv;
    
    // Calculate world position
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    
    // Apply simple wind effect similar to grass
    // Only affect the upper part of the flower (like grass tips)
    float heightFactor = clamp(position.y + 0.5, 0.0, 1.0); // Offset by 0.5 since plane is centered
    float tipFactor = smoothstep(0.3, 1.0, heightFactor);
    
    // Simple sin-based wind, only at the tip
    float wind = sin(uTime * windFrequency + worldPosition.x * 0.5 + worldPosition.z * 0.5) * windStrength * tipFactor;
    
    // Apply wind to world position using wind direction
    vec2 windDir = normalize(windDirection);
    worldPosition.x += windDir.x * wind;
    worldPosition.z += windDir.y * wind;
    
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const flowerFragmentShader = `
  varying vec2 vUv;

  uniform sampler2D uFlowerTexture;         
  uniform sampler2D uFlowerGradientTexture; 
  uniform sampler2D uFlowerRGBTexture; // for petals

  // flower colors (to replace the R/G/B mask colors)
  uniform vec3 uRedMaskColor;
  uniform vec3 uGreenMaskColor;
  uniform vec3 uBlueMaskColor;

  void main() {
    float opacity = texture2D(uFlowerTexture, vUv).r;

    vec4 mask = texture2D(uFlowerRGBTexture, vUv);

    vec3 baseColor =
        uRedMaskColor   * mask.r +
        uGreenMaskColor * mask.g +
        uBlueMaskColor  * mask.b;

    // Stem gradient
    vec3 stem = texture2D(uFlowerGradientTexture, vUv).rgb;
    vec3 stemColor = vec3(0.2, 0.7, 0.2);   // grass green
    vec3 stemTopColor = vec3(0.5, 1.0, 0.2); // yellowish green
    vec3 stemGradient = mix(stemColor, stemTopColor, stem.r);

    vec3 finalColor = mix(stemGradient, baseColor, mask.a);

    gl_FragColor = vec4(finalColor, opacity);
  }
`;

const createFlowerShaderMaterial = () => {
  // Load the flower textures with THREE.TextureLoader
  const textureLoader = new THREE.TextureLoader();
  const flowerTexture = textureLoader.load('/flowers/flowers2.png');
  const flowerGradientTexture = textureLoader.load('/flowers/flowers2Gradient.png');
  const flowerRGBTexture = textureLoader.load('/flowers/flowers2RGB.png');
  return  new THREE.ShaderMaterial({
    vertexShader: flowerVertexShader,
    fragmentShader: flowerFragmentShader,
    
    uniforms: {
      uTime: { value: 0 },
      uFlowerTexture: { value: flowerTexture },
      uFlowerGradientTexture: { value: flowerGradientTexture },
      uFlowerRGBTexture: { value: flowerRGBTexture },
      windStrength: { value: 0.15 },
      windDirection: { value: new THREE.Vector2(1.0, 0.3) },
      windFrequency: { value: 2.5 },

      // flower colors
      uRedMaskColor:   { value: new THREE.Color(0xd6b4fc) }, // light purple
      uGreenMaskColor: { value: new THREE.Color(0xffe6a1) }, // yellowish orange
      uBlueMaskColor:  { value: new THREE.Color(0xffd6e6) }, // pale pink
    },
    transparent: true,
    alphaTest: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
    
  });
}


export const createInstancedFlowers = (scene: THREE.Scene, plane: THREE.Mesh): FlowerSystem => {
  console.log('Creating surface-sampled flower clumps');
  const flowerMaterial = createFlowerShaderMaterial();
  const flowerCount = 200; // Reduced count since we're creating clumps instead of individual instances

  const flowerGeometry = new THREE.PlaneGeometry(1, 1);
  
  // Create a group to hold all flower clumps
  const flowerGroup = new THREE.Group();
  flowerGroup.name = 'SurfaceSampledFlowers';

  const sampler = new MeshSurfaceSampler(plane).setWeightAttribute("color").build();
  const position = new THREE.Vector3();
  
  for (let i = 0; i < flowerCount; i++) {
    sampler.sample(position);
    plane.localToWorld(position);

    // Create a clump group for this flower location
    const clumpGroup = new THREE.Group();
    
    // Create 1-3 planes per clump, similar to the original addFlower function
    const planesInClump = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3 planes
    
    // Define plane configurations similar to the original addFlower function
    const planeConfigs = [
      { rotation: 0, offset: { x: 0, y: 0, z: 0.1 } },
      { rotation: Math.PI / 3, offset: { x: 0.1, y: 0.05, z: 0.15 } },
      { rotation: Math.PI * 2/3, offset: { x: -0.05, y: 0.1, z: 0.2 } },
    ];
    
    for (let j = 0; j < planesInClump; j++) {
      const flowerPlane = new THREE.Mesh(flowerGeometry, flowerMaterial);
      
      // Use predefined configurations for the first few planes, then random for extras
      if (j < planeConfigs.length) {
        const config = planeConfigs[j];
        flowerPlane.position.set(config.offset.x, config.offset.y, config.offset.z);
        flowerPlane.rotation.y = config.rotation;
      } else {
        // Random positioning and rotation for additional planes
        const offsetX = (Math.random() - 0.5) * 0.3;
        const offsetY = (Math.random() - 0.5) * 0.2;
        const offsetZ = (Math.random() - 0.5) * 0.3;
        flowerPlane.position.set(offsetX, offsetY, offsetZ);
        flowerPlane.rotation.y = Math.random() * Math.PI * 2;
      }
      
      // Slight scale variation for natural look
      const s = biasedRandomScale(0.8, 2.0);
      const scaleVariation = 1.0 + (j * 0.02 - 0.05); // Varies slightly per plane in clump
      flowerPlane.scale.setScalar(s * scaleVariation);
      
      flowerPlane.castShadow = false;
      flowerPlane.receiveShadow = true;
      
      clumpGroup.add(flowerPlane);
    }
    
    // Position the entire clump at the sampled position
    clumpGroup.position.copy(position);
    // Add slight vertical offset to ensure flowers are above ground
    clumpGroup.position.y += 0.5;
    
    flowerGroup.add(clumpGroup);
  }

  scene.add(flowerGroup);

  // Return a FlowerSystem object with update functionality
  return {
    group: flowerGroup,
    update: (_camera: THREE.Camera, elapsedTime: number) => {
      // Update the time uniform for wind animation
      if (flowerMaterial && flowerMaterial.uniforms.uTime) {
        flowerMaterial.uniforms.uTime.value = elapsedTime;
      }
    },
    addFlower: (position: THREE.Vector3, scale: number = 1) => {
      // Implementation for adding individual flowers if needed
      const clumpGroup = new THREE.Group();
      const flowerPlane = new THREE.Mesh(flowerGeometry, flowerMaterial);
      flowerPlane.scale.setScalar(scale);
      clumpGroup.add(flowerPlane);
      clumpGroup.position.copy(position);
      flowerGroup.add(clumpGroup);
    }
  };
}