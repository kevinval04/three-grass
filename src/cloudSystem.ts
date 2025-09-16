import * as THREE from 'three';
import { Clouds, Cloud } from '@pmndrs/vanilla';
import { MeshBasicMaterial } from 'three';

export interface CloudConfig {
  position: THREE.Vector3;
  scale: number;
  animationSpeed: number;
  floatAmplitude: number;
  rotationSpeed: number;
  initialPhase: number;
  opacity: number;
  color?: THREE.Color;
}

export interface CloudSystem {
  clouds: Clouds;
  cloudsList: Cloud[];
  cloudConfigs: CloudConfig[];
  update: (camera: THREE.Camera, elapsedTime: number, deltaTime: number) => void;
}

export function createCloudSystem(scene: THREE.Scene, cloudTexture: THREE.Texture): CloudSystem {
  // Create main clouds group
  const clouds = new Clouds({ texture: cloudTexture, material: MeshBasicMaterial });
  clouds.position.set(-20, 0, 28);
  // clouds.rotation.set(0, 0, Math.PI / 4);
  scene.add(clouds);

  // Define cloud configurations for 6 different clouds
  const cloudConfigs: CloudConfig[] = [
    {
      // In front, raise a bit more above
      position: new THREE.Vector3(0, 0.7, 0),
      scale: 1.8,
      animationSpeed: 0.3,
      floatAmplitude: 0.2,
      rotationSpeed: 0.1,
      initialPhase: 0,
      opacity: 0.85
    },
    {
      // In front, raise a bit more above
      position: new THREE.Vector3(-2, 1.2, 6),
      scale: 1.4,
      animationSpeed: 0.4,
      floatAmplitude: 0.15,
      rotationSpeed: -0.08,
      initialPhase: Math.PI * 0.3,
      opacity: 0.7
    },
    {
      // Further back, raise even more
      position: new THREE.Vector3(1.5, 1.1, -7),
      scale: 1.6,
      animationSpeed: 0.25,
      floatAmplitude: 0.25,
      rotationSpeed: 0.12,
      initialPhase: Math.PI * 0.7,
      opacity: 0.8
    },
    {
      // Further back, raise even more
      position: new THREE.Vector3(-1, 1.6, -10),
      scale: 1.5,
      animationSpeed: 0.35,
      floatAmplitude: 0.18,
      rotationSpeed: -0.06,
      initialPhase: Math.PI * 1.2,
      opacity: 0.75
    },
    {
      // In front, raise a bit more above
      position: new THREE.Vector3(2.2, 0.9, 5),
      scale: 1.3,
      animationSpeed: 0.45,
      floatAmplitude: 0.12,
      rotationSpeed: 0.15,
      initialPhase: Math.PI * 1.8,
      opacity: 0.65
    },
    {
      // Further back, raise even more
      position: new THREE.Vector3(0.5, 2.0, -4),
      scale: 1.7,
      animationSpeed: 0.28,
      floatAmplitude: 0.22,
      rotationSpeed: -0.09,
      initialPhase: Math.PI * 0.5,
      opacity: 0.8
    }
  ];

  // Create clouds based on configurations
  const cloudsList: Cloud[] = [];
  
  cloudConfigs.forEach((config) => {
    const cloud = new Cloud({ opacity: config.opacity, color: config.color || new THREE.Color(0xffffff) });
    clouds.add(cloud);
    
    cloud.position.copy(config.position);
    cloud.scale.setScalar(config.scale);
    
    // Apply cloud updates
    cloud.updateCloud();
    
    cloudsList.push(cloud);
  });

  const update = (camera: THREE.Camera, elapsedTime: number, deltaTime: number) => {
    // Update clouds with camera position and time
    clouds.update(camera, elapsedTime, deltaTime);

    // Add custom animation for the clouds
    animateClouds(cloudsList, cloudConfigs, elapsedTime);
  };

  const animateClouds = (cloudsList: Cloud[], configs: CloudConfig[], elapsedTime: number) => {
    cloudsList.forEach((cloud, index) => {
      const config = configs[index];
      const basePosition = config.position;
      
      // Floating animation
      const floatOffset = Math.sin(elapsedTime * config.animationSpeed + config.initialPhase) * config.floatAmplitude;
      cloud.position.set(
        basePosition.x,
        basePosition.y + floatOffset,
        basePosition.z
      );
      
      // Rotation animation
      cloud.rotation.y = elapsedTime * config.rotationSpeed + config.initialPhase;
      
      // Subtle scale pulsing
      const scaleOffset = Math.sin(elapsedTime * config.animationSpeed * 1.5 + config.initialPhase) * 0.05;
      cloud.scale.setScalar(config.scale + scaleOffset);
    });
  };

  return {
    clouds,
    cloudsList,
    cloudConfigs,
    update,
  };
}
