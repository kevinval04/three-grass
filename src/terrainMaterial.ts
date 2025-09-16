import * as THREE from "three";

export function createTerrainMaterial(
  groundTexture: THREE.Texture,
  waterUniforms: { [key: string]: THREE.IUniform }
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    map: groundTexture,
    color: 0xffffff,
    metalness: 0.0,
    roughness: 1.0,
    // ensure emissive contribution is allowed
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 1.0,
  });

  groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;

  const customUniforms = {
    uTime: waterUniforms.uTime,
    uWaveSpeed: waterUniforms.uWaveSpeed,
    uWaveAmplitude: waterUniforms.uWaveAmplitude,
    uWaveFrequency: waterUniforms.uWaveFrequency,
    uWaterLevel: { value: -0.5 },
    uFoamDepth: { value: 0.08 },
  };

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, customUniforms);

    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
       varying vec3 vWorldPosition;
      `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
       varying vec3 vWorldPosition;
       uniform float uTime;
       uniform float uWaveSpeed;
       uniform float uWaveAmplitude;
       uniform float uWaveFrequency;
       uniform float uWaterLevel;
       uniform float uFoamDepth;
      `
    );

    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `
      vec4 worldPos = modelMatrix * vec4( transformed, 1.0 );
      vWorldPosition = worldPos.xyz;

      #include <project_vertex>
      `
    );

    // Keep the original map untouched; inject foam via emission after base color is set
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `
      #include <map_fragment>
      `
    );

    // Add foam after lighting inputs are prepared but before final color output.
    // Hook into emissive fragment to add pure white foam
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `
      #include <emissivemap_fragment>

      // Foam mask in world space
      float wave = sin(vWorldPosition.x * uWaveFrequency + uTime * uWaveSpeed) * uWaveAmplitude;
      float currentWaterHeight = uWaterLevel + wave;
      float distanceFromWater = vWorldPosition.y - currentWaterHeight;

      float foamThicknessMultiplier = 2.0;
      float foamDepthThick = uFoamDepth * foamThicknessMultiplier;

      float foamMask = 0.0;
      if (distanceFromWater >= 0.0 && distanceFromWater <= foamDepthThick) {
        foamMask = 1.0 - (distanceFromWater / foamDepthThick);
      }
      foamMask = clamp(foamMask, 0.0, 1.0);

      // Add pure white foam as emission so base texture color remains original.
      // totalEmissiveRadiance is in linear space.
      totalEmissiveRadiance += vec3(1.0) * foamMask;
      `
    );

    (mat as any).userData.shader = shader;
  };

  return mat;
}