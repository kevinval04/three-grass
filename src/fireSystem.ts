import * as THREE from 'three';
import { unityVoronoiNoise, unitySimpleNoise } from './unityNoiseFunctions';

// Fire Shader
const fireVertexShader = `
  varying vec2 vUv;
  
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fireFragmentShader = `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uSpeed;
  uniform sampler2D fire;
  uniform vec4 uColor;
  uniform float bloom;
  uniform float flameStart;
  
  varying vec2 vUv;
  
  ${unityVoronoiNoise}
  
  ${unitySimpleNoise}
  
  void main() {
    // Add upward movement with speed control (negative vUv makes it go upward)
    vec2 st = -vUv;
    st.y += uTime * uSpeed; // Move pattern upward
    
    // Generate Unity Voronoi noise with density 10 and time as angle offset
    float voronoiOut, voronoiCells;
    Unity_Voronoi_float(st, uTime + 10.0, 10.0, voronoiOut, voronoiCells);
    
    // Generate Unity Simple Noise with scale of 50 (no time)
    float simpleNoise = Unity_SimpleNoise_float(vUv, 50.0);
    
    // Multiply Voronoi with Unity Simple Noise
    float combinedNoise = voronoiOut * simpleNoise;
    
    // White background with black cells
    vec3 cellColor = vec3(0.0); // Black
    
    // Mix between white and black based on combined noise
    vec3 noiseFinal = mix(cellColor, vec3(1.0, 1.0, 1.0), combinedNoise);
    
    // Apply intensity
    noiseFinal *= uIntensity;

    float g = 1. - vUv.y;
    g = pow(g, 0.3);
    vec4 fireShape = texture2D(fire, vUv);
    g = (fireShape.x) * g;

    float edge = smoothstep(0.0, flameStart, vUv.y);
    noiseFinal = mix(vec3(1.0), noiseFinal, edge);

    float cappedNoise = min(noiseFinal.x, 1.0) * 0.9;
    float fireWithNoise = cappedNoise + g;
    fireWithNoise = step(1.0, fireWithNoise);

    float glow = 4.0;
    vec4 bloomColor = vec4(vec3(1.0, 1.0, 1.0) * glow, 1.0);
    bloomColor *= uColor;

    vec4 finalColor = uColor * fireWithNoise;
    
    gl_FragColor = vec4(finalColor.xyz * bloom, finalColor.a);
  }
`;

export interface FireConfig {
  // Main flame config
  mainFlame: {
    size: { width: number; height: number };
    position: { x: number; y: number; z: number };
    intensity: number;
    speed: number;
    flameStart: number;
    color: { r: number; g: number; b: number; a: number };
    bloom: number;
  };
  // Inner flame config
  innerFlame: {
    size: { width: number; height: number };
    position: { x: number; y: number; z: number };
    intensity: number;
    speed: number;
    flameStart: number;
    color: { r: number; g: number; b: number; a: number };
    bloom: number;
  };
}

export interface FireSystem {
  mainFlame: THREE.Mesh;
  innerFlame: THREE.Mesh;
  mainMaterial: THREE.ShaderMaterial;
  innerMaterial: THREE.ShaderMaterial;
  update: (time: number) => void;
  dispose: () => void;
}

export function createFireSystem(scene: THREE.Scene, config: FireConfig): FireSystem {
  // Load fire texture
  const fireTexture = new THREE.TextureLoader().load('/fire/fire2.png');
  
  // Create material for main fire
  const mainMaterial = new THREE.ShaderMaterial({
    vertexShader: fireVertexShader,
    fragmentShader: fireFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: config.mainFlame.intensity },
      uSpeed: { value: config.mainFlame.speed },
      fire: { value: fireTexture },
      uColor: { value: new THREE.Vector4(
        config.mainFlame.color.r,
        config.mainFlame.color.g,
        config.mainFlame.color.b,
        config.mainFlame.color.a
      )},
      bloom: { value: config.mainFlame.bloom },
      flameStart: { value: config.mainFlame.flameStart }
    },
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.001,
    blending: THREE.AdditiveBlending,
    depthWrite: false // Disable depth writing for better transparency
  });

  // Create material for inner fire
  const innerMaterial = new THREE.ShaderMaterial({
    vertexShader: fireVertexShader,
    fragmentShader: fireFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: config.innerFlame.intensity },
      uSpeed: { value: config.innerFlame.speed },
      fire: { value: fireTexture },
      uColor: { value: new THREE.Vector4(
        config.innerFlame.color.r,
        config.innerFlame.color.g,
        config.innerFlame.color.b,
        config.innerFlame.color.a
      )},
      bloom: { value: config.innerFlame.bloom },
      flameStart: { value: config.innerFlame.flameStart }
    },
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.001,
    blending: THREE.AdditiveBlending,
    depthWrite: false // Disable depth writing for better transparency
  });

  // Create main flame plane
  const mainGeometry = new THREE.PlaneGeometry(
    config.mainFlame.size.width,
    config.mainFlame.size.height
  );
  const mainFlame = new THREE.Mesh(mainGeometry, mainMaterial);
  mainFlame.position.set(
    config.mainFlame.position.x,
    config.mainFlame.position.y,
    config.mainFlame.position.z
  );
  mainFlame.renderOrder = 1; // Render first (behind)
  scene.add(mainFlame);

  // Create inner flame plane
  const innerGeometry = new THREE.PlaneGeometry(
    config.innerFlame.size.width,
    config.innerFlame.size.height
  );
  const innerFlame = new THREE.Mesh(innerGeometry, innerMaterial);
  innerFlame.position.set(
    config.innerFlame.position.x,
    config.innerFlame.position.y,
    config.innerFlame.position.z
  );
  innerFlame.renderOrder = 2; // Render second (in front)
  scene.add(innerFlame);

  // Update function
  const update = (time: number) => {
    mainMaterial.uniforms.uTime.value = time;
    innerMaterial.uniforms.uTime.value = time;
  };

  // Dispose function
  const dispose = () => {
    scene.remove(mainFlame);
    scene.remove(innerFlame);
    mainGeometry.dispose();
    innerGeometry.dispose();
    mainMaterial.dispose();
    innerMaterial.dispose();
    fireTexture.dispose();
  };

  return {
    mainFlame,
    innerFlame,
    mainMaterial,
    innerMaterial,
    update,
    dispose
  };
}

// Default campfire configuration
export const defaultCampfireConfig: FireConfig = {
  mainFlame: {
    size: { width: 1.0, height: 1.5 },
    position: { x: 0, y: 0.0, z: 0 },
    intensity: 1.3,
    speed: 0.4,
    flameStart: 0.4,
    color: { r: 0.8, g: 0.0, b: 0.0, a: 1.0 },
    bloom: 15
  },
  innerFlame: {
    size: { width: 0.55, height: 0.7 },
    position: { x: 0.0, y: -0.29, z: 0.0 },
    intensity: 1.0,
    speed: 0.6,
    flameStart: 0.32,
    color: { r: 1.0, g: 0.8, b: 0.3, a: 1.0 }, // Warm yellow-orange instead of pure white
    bloom: 15.0
  }
};
