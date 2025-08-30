import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export interface PostProcessingSetup {
  composer: EffectComposer;
  bloomPass: UnrealBloomPass;
  render: () => void;
  resize: (width: number, height: number) => void;
}

export function createPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  bloomConfig?: {
    strength?: number;
    radius?: number;
    threshold?: number;
  }
): PostProcessingSetup {
  // Create composer
  const composer = new EffectComposer(renderer);
  
  // Add render pass
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  
  // Add bloom pass with configurable settings
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    bloomConfig?.strength ?? 0.12, // strength
    bloomConfig?.radius ?? 0.7, // radius
    bloomConfig?.threshold ?? 0.9, // threshold,
  );

  composer.addPass(bloomPass);
  
  // Add output pass for tone mapping
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  const render = () => {
    composer.render();
  };

  const resize = (width: number, height: number) => {
    composer.setSize(width, height);
  };

  return {
    composer,
    bloomPass,
    render,
    resize
  };
}
