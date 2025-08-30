// Unity Noise Functions as String Templates

export const unityVoronoiNoise = `
  // Unity Voronoi implementation
  vec2 unity_voronoi_noise_randomVector(vec2 UV, float offset) {
    mat2 m = mat2(15.27, 47.63, 99.41, 89.98);
    UV = fract(sin(m * UV) * 46839.32);
    return vec2(sin(UV.y * +offset) * 0.5 + 0.5, cos(UV.x * offset) * 0.5 + 0.5);
  }

  void Unity_Voronoi_float(vec2 UV, float AngleOffset, float CellDensity, out float Out, out float Cells) {
    vec2 g = floor(UV * CellDensity);
    vec2 f = fract(UV * CellDensity);
    float t = 8.0;
    vec3 res = vec3(8.0, 0.0, 0.0);

    for(int y = -1; y <= 1; y++) {
      for(int x = -1; x <= 1; x++) {
        vec2 lattice = vec2(x, y);
        vec2 offset = unity_voronoi_noise_randomVector(lattice + g, AngleOffset);
        float d = distance(lattice + offset, f);
        if(d < res.x) {
          res = vec3(d, offset.x, offset.y);
          Out = res.x;
          Cells = res.y;
        }
      }
    }
  }
`;

export const unitySimpleNoise = `
  // Unity Simple Noise implementation
  float unity_noise_randomValue(vec2 uv) {
    return fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
  }

  float unity_noise_interpolate(float a, float b, float t) {
    return (1.0 - t) * a + (t * b);
  }

  float unity_valueNoise(vec2 uv) {
    vec2 i = floor(uv);
    vec2 f = fract(uv);
    f = f * f * (3.0 - 2.0 * f);

    uv = abs(fract(uv) - 0.5);
    vec2 c0 = i + vec2(0.0, 0.0);
    vec2 c1 = i + vec2(1.0, 0.0);
    vec2 c2 = i + vec2(0.0, 1.0);
    vec2 c3 = i + vec2(1.0, 1.0);
    float r0 = unity_noise_randomValue(c0);
    float r1 = unity_noise_randomValue(c1);
    float r2 = unity_noise_randomValue(c2);
    float r3 = unity_noise_randomValue(c3);

    float bottomOfGrid = unity_noise_interpolate(r0, r1, f.x);
    float topOfGrid = unity_noise_interpolate(r2, r3, f.x);
    float t = unity_noise_interpolate(bottomOfGrid, topOfGrid, f.y);
    return t;
  }

  float Unity_SimpleNoise_float(vec2 UV, float Scale) {
    float t = 0.0;

    float freq = pow(2.0, float(0));
    float amp = pow(0.5, float(3 - 0));
    t += unity_valueNoise(vec2(UV.x * Scale / freq, UV.y * Scale / freq)) * amp;

    freq = pow(2.0, float(1));
    amp = pow(0.5, float(3 - 1));
    t += unity_valueNoise(vec2(UV.x * Scale / freq, UV.y * Scale / freq)) * amp;

    freq = pow(2.0, float(2));
    amp = pow(0.5, float(3 - 2));
    t += unity_valueNoise(vec2(UV.x * Scale / freq, UV.y * Scale / freq)) * amp;

    return t;
  }
`;
