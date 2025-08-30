import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// Get the canvas element
const canvas = document.getElementById('three-canvas') as HTMLCanvasElement

// Scene setup
const scene = new THREE.Scene()
// scene.background = new THREE.Color(0x87CEEB) // Removed solid background for skybox

// Add fog for atmospheric effect
scene.fog = new THREE.Fog(0x87CEEB, 50, 200) // Light blue fog, starts at 50 units, ends at 200 units

// Camera setup
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
)

// Renderer setup
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: true
})
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

// Controls
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.dampingFactor = 0.05

// Proper lighting setup for realistic rendering
const ambientLight = new THREE.AmbientLight(0x404040, 0.5) // Soft ambient
scene.add(ambientLight)

const directionalLight = new THREE.DirectionalLight(0xffffff, 5)
directionalLight.position.set(5, 15, 15) // Moved to front and lower
directionalLight.castShadow = true
directionalLight.shadow.mapSize.width = 2048
directionalLight.shadow.mapSize.height = 2048
directionalLight.shadow.camera.near = 0.5
directionalLight.shadow.camera.far = 50
directionalLight.shadow.camera.left = -25
directionalLight.shadow.camera.right = 25
directionalLight.shadow.camera.top = 25
directionalLight.shadow.camera.bottom = -25
scene.add(directionalLight)

const MAP_SIZE = 2;

// Create textured plane with grass texture
const textureLoader = new THREE.TextureLoader()
const grassTexture = textureLoader.load('/grass.png')
grassTexture.wrapS = THREE.RepeatWrapping
grassTexture.wrapT = THREE.RepeatWrapping
grassTexture.repeat.set(1, 1) // Repeat texture 1x1 times across the plane

// Load skybox texture (you can replace this URL with your own 2K PNG skybox image)
const skyboxTexture = textureLoader.load('/sky_41_2k.png') // Replace with your skybox image path
skyboxTexture.mapping = THREE.EquirectangularReflectionMapping
skyboxTexture.wrapS = THREE.RepeatWrapping
skyboxTexture.wrapT = THREE.ClampToEdgeWrapping

// Create skybox
const skyboxGeometry = new THREE.SphereGeometry(500, 64, 32)
const skyboxMaterial = new THREE.MeshBasicMaterial({
  map: skyboxTexture,
  side: THREE.BackSide, // Render on the inside of the sphere
  fog: false
})
const skybox = new THREE.Mesh(skyboxGeometry, skyboxMaterial)
// Lower the skybox by 5% (25 units down from center for a 500 radius sphere)
skybox.position.y = -80
scene.add(skybox)

const planeGeometry = new THREE.PlaneGeometry(30*MAP_SIZE, 30*MAP_SIZE)
const planeMaterial = new THREE.MeshStandardMaterial({ 
  map: grassTexture
})
const plane = new THREE.Mesh(planeGeometry, planeMaterial)
plane.rotation.x = -Math.PI / 2 // Rotate to lie flat
plane.receiveShadow = true // Enable shadow receiving for grass shadows later
scene.add(plane)

// Camera position - lowered for better view
camera.position.set(5, 3, 5)
camera.lookAt(0, 0, 0)

// Grass density configuration
const GRASS_DENSITY = 5 // Grass patches per square unit (adjust as needed)
const PLANE_SIZE = 30 * MAP_SIZE // Should match the plane geometry size
const GRASS_SEED = 12345 // Seed for consistent random generation

// Seeded pseudo-random number generator for consistent results
class SeededRandom {
  private seed: number

  constructor(seed: number) {
    this.seed = seed
  }

  // Linear congruential generator
  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296
    return this.seed / 4294967296
  }

  // Random number between min and max
  range(min: number, max: number): number {
    return min + this.next() * (max - min)
  }
}

// Function to generate grass positions and properties based on density
function generateGrassData(planeSize: number, density: number, seed: number): Array<{ x: number, z: number, scale: number, rotation: number }> {
  const grassData: Array<{ x: number, z: number, scale: number, rotation: number }> = []
  const totalArea = planeSize * planeSize
  const grassCount = Math.floor(totalArea * density)
  
  const rng = new SeededRandom(seed)
  
  // Generate random positions and properties within the plane bounds
  for (let i = 0; i < grassCount; i++) {
    const x = rng.range(-planeSize * 0.45, planeSize * 0.45) // Leave small margin from edges
    const z = rng.range(-planeSize * 0.45, planeSize * 0.45)
    const scale = 1 + rng.range(0, 2.5) // Base scale 1.0 + random 0 to 2.5
    const rotation = rng.range(0, Math.PI * 2)
    
    grassData.push({ x, z, scale, rotation })
  }
  
  console.log(`Generated ${grassCount} grass patches for density ${density} on ${planeSize}x${planeSize} plane with seed ${seed}`)
  return grassData
}

// Create custom grass shader material
function createGrassShaderMaterial(grassTexture: THREE.Texture): THREE.ShaderMaterial {
  const vertexShader = `
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
      vUv = uv;
      vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `
  
  const fragmentShader = `
    uniform sampler2D grassTexture;
    uniform vec2 textureRepeat;
    uniform float planeSize;
    uniform vec3 lightDirection;
    uniform float lightIntensity;
    
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    
    void main() {
      // Calculate UV coordinates for sampling the grass texture based on world position
      vec2 worldUV = (vWorldPosition.xz + planeSize * 0.5) / planeSize;
      vec2 repeatedUV = worldUV * textureRepeat;
      
      // Sample the grass texture to get the surface color
      vec3 surfaceColor = texture2D(grassTexture, repeatedUV).rgb;
      
      // Basic lighting calculation
      vec3 normal = normalize(vNormal);
      vec3 lightDir = normalize(-lightDirection);
      float NdotL = max(dot(normal, lightDir), 0.0);
      
      vec3 grassColor = vec3(1.0, 1.0, 1.0); // Pure white for debugging
      vec3 finalColor = surfaceColor;
      
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `
  
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      grassTexture: { value: grassTexture },
      textureRepeat: { value: new THREE.Vector2(1, 1) },
      planeSize: { value: PLANE_SIZE },
      lightDirection: { value: new THREE.Vector3(5, 15, 15).normalize() },
      lightIntensity: { value: 1.0 }
    },
    side: THREE.DoubleSide
  })
}
// Create shared grass shader material with the grass texture
const sharedGrassMaterial = createGrassShaderMaterial(grassTexture)
// Set the texture repeat to match the plane's texture repeat
sharedGrassMaterial.uniforms.textureRepeat.value.copy(grassTexture.repeat)
// Load and place grass patches
const loader = new GLTFLoader()
loader.load(
  '/grass-patch.glb',
  (gltf) => {   
    // Generate grass positions and properties based on density and seed
    const grassData = generateGrassData(PLANE_SIZE, GRASS_DENSITY, GRASS_SEED)
    
    grassData.forEach((grass, index) => {
      const grassClone = gltf.scene.clone()
      grassClone.position.set(grass.x, 0, grass.z)
      grassClone.scale.setScalar(grass.scale) // Apply seeded random scale variation
      
      // Apply seeded random rotation for variety
      grassClone.rotation.y = grass.rotation
      
      // Apply custom shader material with texture sampling
      grassClone.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          // Use the shared material (all grass blades sample from the same texture)
          child.material = sharedGrassMaterial
          child.castShadow = false // Disabled shadow casting as requested
          child.receiveShadow = true
        }
      })
      
      scene.add(grassClone)
    })
    
    console.log(`Added ${grassData.length} grass patches to scene`)
  },
  (progress) => {
    console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%')
  },
  (error) => {
    console.error('Error loading grass model:', error)
  }
)

// Animation loop
function animate() {
  requestAnimationFrame(animate)
  
  // Update controls
  controls.update()
  
  renderer.render(scene, camera)
}

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// Start the animation
animate()