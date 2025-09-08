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

    // Declare varying and uniforms
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

    // Compute world position once per vertex
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `
      vec4 worldPos = modelMatrix * vec4( transformed, 1.0 );
      vWorldPosition = worldPos.xyz;

      #include <project_vertex>
      `
    );

    // Modify the base color right after map sampling
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `
      #include <map_fragment>

      

      // Foam mask in world space
      float wave = sin(vWorldPosition.x * uWaveFrequency + uTime * uWaveSpeed) * uWaveAmplitude;
      float currentWaterHeight = uWaterLevel + wave;
      float distanceFromWater = vWorldPosition.y - currentWaterHeight;

      // Make foam thicker by increasing the foam depth range
      float foamThicknessMultiplier = 2.0; // Increase for thicker foam
      float foamDepthThick = uFoamDepth * foamThicknessMultiplier;

      float foamMask = 0.0;
      if (distanceFromWater >= 0.0 && distanceFromWater <= foamDepthThick) {
        foamMask = 1.0 - (distanceFromWater / foamDepthThick);
      }
      foamMask = clamp(foamMask, 0.0, 1.0);

      // Blend foam into albedo (pre-lighting)
      vec3 foamColor = vec3(0.85, 0.88, 0.9);
      diffuseColor.rgb = mix(diffuseColor.rgb, foamColor, foamMask);
      `
    );

    (mat as any).userData.shader = shader;
  };

  return mat;
}