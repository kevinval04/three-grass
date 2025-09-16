import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface LoadingProgress {
  loaded: number;
  total: number;
  percentage: number;
  currentAsset: string;
}

export interface AssetCollection {
  textures: Map<string, THREE.Texture>;
  models: Map<string, any>;
  skybox: THREE.Texture;
}

export class AssetLoader {
  private loadingManager: THREE.LoadingManager;
  private textureLoader: THREE.TextureLoader;
  private gltfLoader: GLTFLoader;
  private onProgress: (progress: LoadingProgress) => void;
  private onComplete: (assets: AssetCollection) => void;
  
  private currentAssetName = '';
  private assets: AssetCollection;

  constructor(
    onProgress: (progress: LoadingProgress) => void,
    onComplete: (assets: AssetCollection) => void
  ) {
    this.onProgress = onProgress;
    this.onComplete = onComplete;
    this.assets = {
      textures: new Map(),
      models: new Map(),
      skybox: null as any
    };

    // Create loading manager
    this.loadingManager = new THREE.LoadingManager(
      // onLoad
      () => {
        console.log('All assets loaded successfully');
        this.onComplete(this.assets);
      },
      // onProgress
      (url, itemsLoaded, itemsTotal) => {
        const progress: LoadingProgress = {
          loaded: itemsLoaded,
          total: itemsTotal,
          percentage: (itemsLoaded / itemsTotal) * 100,
          currentAsset: this.currentAssetName || url.split('/').pop() || 'Loading...'
        };
        this.onProgress(progress);
      },
      // onError
      (url) => {
        console.error('Failed to load asset:', url);
      }
    );

    // Create loaders with the loading manager
    this.textureLoader = new THREE.TextureLoader(this.loadingManager);
    this.gltfLoader = new GLTFLoader(this.loadingManager);
  }

  async loadAllAssets(): Promise<void> {
    const assetsToLoad = [
      // Skybox
      { type: 'skybox', path: '/sky_13_2k.png', name: 'skybox' },
      
      // Textures
      { type: 'texture', path: '/grass.png', name: 'grass' },
      { type: 'texture', path: '/fire/fire2.png', name: 'fire' },
      { type: 'texture', path: '/water.png', name: 'water' },
      { type: 'texture', path: '/waterstripes.png', name: 'waterstripes' },
      { type: 'texture', path: '/cloud.png', name: 'cloud' },
      { type: 'texture', path: '/flowers/flowers2.png', name: 'flowers' },
      { type: 'texture', path: '/flowers/flowers2Gradient.png', name: 'flowersGradient' },
      { type: 'texture', path: '/flowers/flowers2RGB.png', name: 'flowersRGB' },
      { type: 'texture', path: '/flowers/flowerInstanceMap.png', name: 'flowerInstanceMap' },
      
      // Models
      { type: 'model', path: '/campfire.glb', name: 'campfire' },
      { type: 'model', path: '/grass-patch.glb', name: 'grassPatch' },
      { type: 'model', path: '/surface.glb', name: 'surface' },
    ];

    // Start loading all assets
    assetsToLoad.forEach(asset => {
      this.loadAsset(asset.type, asset.path, asset.name);
    });
  }

  private loadAsset(type: string, path: string, name: string): void {
    this.currentAssetName = name;

    switch (type) {
      case 'skybox':
        this.textureLoader.load(
          path,
          (texture) => {
            this.assets.skybox = texture;
            console.log(`Skybox loaded: ${name}`);
          },
          undefined,
          (error) => console.error(`Failed to load skybox ${name}:`, error)
        );
        break;

      case 'texture':
        this.textureLoader.load(
          path,
          (texture) => {
            // Configure texture based on type
            if (name === 'grass') {
              texture.colorSpace = THREE.SRGBColorSpace;
              texture.magFilter = THREE.LinearFilter;
              texture.minFilter = THREE.LinearMipmapLinearFilter;
              texture.generateMipmaps = true;
              texture.flipY = true;
            } else if (name === 'water') {
              // Water texture for grass exclusion - needs to match surface UV mapping
              texture.wrapS = THREE.ClampToEdgeWrapping;
              texture.wrapT = THREE.ClampToEdgeWrapping;
              texture.magFilter = THREE.LinearFilter;
              texture.minFilter = THREE.LinearFilter;
              texture.flipY = false; // Match surface model UV orientation
              texture.colorSpace = THREE.LinearSRGBColorSpace; // For grayscale sampling
            } else if (name === 'waterstripes') {
              // Water stripes texture for animated surface effect
              texture.wrapS = THREE.RepeatWrapping;
              texture.wrapT = THREE.RepeatWrapping;
              texture.magFilter = THREE.LinearFilter;
              texture.minFilter = THREE.LinearFilter;
              texture.flipY = false;
              texture.colorSpace = THREE.LinearSRGBColorSpace;
            } else if (name === 'cloud') {
              texture.colorSpace = THREE.SRGBColorSpace;
              texture.magFilter = THREE.LinearFilter;
              texture.minFilter = THREE.LinearMipmapLinearFilter;
              texture.generateMipmaps = true;
              texture.flipY = true;
            } else if (name.startsWith('flowers')) {
              texture.colorSpace = THREE.SRGBColorSpace;
              texture.magFilter = THREE.LinearFilter;
              texture.minFilter = THREE.LinearMipmapLinearFilter;
              texture.generateMipmaps = true;
              texture.flipY = true;
            } else if (name.startsWith('ground')) {
              texture.wrapS = THREE.RepeatWrapping;
              texture.wrapT = THREE.RepeatWrapping;
              if (name !== 'groundBase') {
                texture.colorSpace = THREE.LinearSRGBColorSpace;
              }
            }
            
            this.assets.textures.set(name, texture);
            console.log(`Texture loaded: ${name}`);
          },
          undefined,
          (error) => console.error(`Failed to load texture ${name}:`, error)
        );
        break;

      case 'model':
        this.gltfLoader.load(
          path,
          (gltf) => {
            this.assets.models.set(name, gltf);
            console.log(`Model loaded: ${name}`);
          },
          undefined,
          (error) => console.error(`Failed to load model ${name}:`, error)
        );
        break;
    }
  }

  // Helper methods to get loaded assets
  getTexture(name: string): THREE.Texture | undefined {
    return this.assets.textures.get(name);
  }

  getModel(name: string): any {
    return this.assets.models.get(name);
  }

  getSkybox(): THREE.Texture {
    return this.assets.skybox;
  }

  getAllAssets(): AssetCollection {
    return this.assets;
  }
}
