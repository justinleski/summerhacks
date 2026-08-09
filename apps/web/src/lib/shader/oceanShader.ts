// Only ever reached via dynamic import() — never statically imported — so this
// module (GLSL source + compile logic) stays out of every route's initial chunk.

const VERTEX_SRC = `#version 300 es
const vec2 pos[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() {
  gl_Position = vec4(pos[gl_VertexID], 0.0, 1.0);
}`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
out vec4 outColor;

float caustic(vec2 uv, float t) {
  vec2 p = uv * 3.0;
  float c = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    p += vec2(
      sin(p.y + t * (0.3 + fi * 0.1) + fi),
      cos(p.x - t * (0.25 + fi * 0.08) + fi)
    );
    c += sin(p.x * 1.2 + t * 0.4) * cos(p.y * 1.2 - t * 0.3);
  }
  return c;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float t = uTime * 0.05;
  float c1 = caustic(uv, t);
  float c2 = caustic(uv * 1.3 + 5.0, t * 1.1);
  float glow = smoothstep(-0.4, 1.2, (c1 + c2) * 0.5 + 0.5);
  vec3 col = mix(uColorA, uColorB, glow);
  col = mix(col, uColorC, smoothstep(0.8, 1.3, glow) * 0.5);
  float vign = smoothstep(1.2, 0.1, length(uv - 0.5));
  outColor = vec4(col * (0.18 + 0.28 * vign) * 0.6, 1.0);
}`;

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info ?? "unknown"}`);
  }
  return shader;
}

function hexToRgb01(hex: string): [number, number, number] {
  const m = hex.trim().replace("#", "");
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  return [r, g, b];
}

export type OceanShaderColors = {
  colorA: string;
  colorB: string;
  colorC: string;
};

/** Mounts an animated ambient caustics/bokeh shader onto `canvas`. Returns a cleanup function. */
export function mountOceanShader(
  canvas: HTMLCanvasElement,
  colors: OceanShaderColors,
): () => void {
  const gl = canvas.getContext("webgl2", { alpha: true, antialias: false });
  if (!gl) throw new Error("WebGL2 not available");

  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create program");
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    throw new Error(`Program link error: ${info ?? "unknown"}`);
  }
  gl.useProgram(program);

  const uResolution = gl.getUniformLocation(program, "uResolution");
  const uTime = gl.getUniformLocation(program, "uTime");
  const uColorA = gl.getUniformLocation(program, "uColorA");
  const uColorB = gl.getUniformLocation(program, "uColorB");
  const uColorC = gl.getUniformLocation(program, "uColorC");

  gl.uniform3f(uColorA, ...hexToRgb01(colors.colorA));
  gl.uniform3f(uColorB, ...hexToRgb01(colors.colorB));
  gl.uniform3f(uColorC, ...hexToRgb01(colors.colorC));

  let raf = 0;
  const start = performance.now();
  let paused = false;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  };

  const frame = (now: number) => {
    if (!paused) {
      resize();
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    raf = requestAnimationFrame(frame);
  };

  const onVisibility = () => {
    paused = document.hidden;
  };

  resize();
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", onVisibility);
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", onVisibility);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };
}
