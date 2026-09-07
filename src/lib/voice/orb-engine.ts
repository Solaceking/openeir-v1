// OpenEir — the Eir Orb. A dependency-free WebGL fragment-shader "hanging
// blob" in the spirit of OpenAI's Advanced Voice sphere and Gemini's smoke:
// a breathing plasma body over a deep-space backdrop, driven by real signals:
//   - uW0..3  blended conversation state (idle / listening / thinking / speaking)
//   - uLevel  live microphone RMS (the orb swells when YOU speak)
//   - uAmp    live amplitude of Eir's own neural voice playback (she shimmers
//             while she talks — tapped from the <audio> element's analyser)
// Falls back gracefully: if WebGL is unavailable the component renders a CSS
// orb instead; the conversation keeps working either way.

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec4 uW;       // state weights: idle, listening, thinking, speaking
uniform float uLevel;  // mic RMS 0..1 (smoothed)
uniform float uAmp;    // Eir voice amplitude 0..1 (smoothed)
uniform float uDark;   // 1 = dark theme
uniform float uReduced; // 1 = reduced motion (calm everything down)
varying vec2 vUv;

// --- Ashima 3D simplex noise ---------------------------------------------
vec3 mod289(vec3 x){return x - floor(x * (1.0/289.0)) * 289.0;}
vec4 mod289(vec4 x){return x - floor(x * (1.0/289.0)) * 289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
float fbm(vec3 p){
  float f = 0.0;
  f += 0.5333 * snoise(p);
  f += 0.2667 * snoise(p * 2.02);
  f += 0.1333 * snoise(p * 4.05);
  f += 0.0667 * snoise(p * 8.1);
  return f;
}
float hash21(vec2 p){
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

void main(){
  float aspect = uRes.x / max(uRes.y, 1.0);
  vec2 uv = (vUv - 0.5) * 2.0;
  uv.x *= aspect;

  float t = uTime * mix(1.0, 0.35, uReduced);
  float wListen = uW.y; float wThink = uW.z; float wSpeak = uW.w;

  // gentle hanging drift (the blob floats, it is never pinned)
  vec2 drift = vec2(sin(t * 0.32) * 0.015, cos(t * 0.24) * 0.02);
  vec2 p = uv - drift;
  float r = length(p);
  float ang = atan(p.y, p.x);

  // domain-warped plasma surface
  vec3 np = vec3(p * 1.55, t * 0.42 + wThink * t * 0.35);
  float warp = fbm(np + fbm(np * 1.3) * 0.9);
  // state energy: listening reacts to the user's mic, speaking to Eir's voice
  float energy = uLevel * (0.10 + 0.16 * wListen) + uAmp * (0.12 + 0.20 * wSpeak);
  float breathe = 1.0 + 0.022 * sin(t * 1.35) + uAmp * 0.05 + uLevel * 0.04;
  float radius = 0.50 * breathe + warp * 0.14 + energy;

  float d = r - radius;
  float body = smoothstep(0.015, -0.22, d);
  float inner = smoothstep(-0.28, -0.62, d); // hot core
  float rim = exp(-9.0 * max(d + 0.03, 0.0)) * step(-0.05, d);

  // state palettes (teal home base; violet thought; luminous speech)
  vec3 cIdle = mix(vec3(0.020, 0.235, 0.215), vec3(0.060, 0.620, 0.560), clamp(warp * 0.7 + 0.5, 0.0, 1.0));
  vec3 cList = mix(vec3(0.030, 0.330, 0.360), vec3(0.220, 0.880, 0.810), clamp(warp * 0.6 + 0.5 + uLevel * 0.7, 0.0, 1.0));
  vec3 cThink = mix(vec3(0.170, 0.090, 0.330), vec3(0.560, 0.380, 0.980), clamp(warp * 0.6 + 0.5, 0.0, 1.0));
  vec3 cSpeak = mix(vec3(0.040, 0.430, 0.470), vec3(0.480, 0.960, 0.880), clamp(warp * 0.5 + 0.5 + uAmp * 0.8, 0.0, 1.0));
  vec3 bodyCol = uW.x * cIdle + uW.y * cList + uW.z * cThink + wSpeak * cSpeak;
  vec3 coreCol = bodyCol * 1.65 + vec3(0.10);

  vec3 col = body * mix(bodyCol, coreCol, inner);
  float glowK = 0.55 + wListen * 0.5 + wSpeak * 0.6 + wThink * 0.4;
  col += rim * glowK * bodyCol * 1.6;
  // outer aura — the "smoke"
  float aura = exp(-4.5 * max(d, 0.0)) * step(-0.01, d);
  col += aura * 0.18 * bodyCol * glowK;

  // faint stars — tiny twinkling points, not blocky cells
  vec2 sg = uv * 42.0;
  vec2 cell = floor(sg);
  vec2 f = fract(sg) - 0.5;
  float starTw = hash21(cell);
  vec2 jitter = vec2(hash21(cell + 7.1), hash21(cell + 3.7)) - 0.5;
  float star = smoothstep(0.10, 0.0, length(f - jitter * 0.6)) * step(0.993, starTw);
  float tw = 0.35 + 0.65 * (0.5 + 0.5 * sin(t * 2.0 + starTw * 40.0));
  float starA = star * tw * (1.0 - body);
  col += vec3(0.85, 0.98, 1.0) * starA * 0.85;

  // film grain — kills banding on gradients (visible areas only)
  float grain = (hash21(vUv * uRes + fract(t) * 100.0) - 0.5) * 0.012;
  col += grain * (0.3 + 0.7 * body);

  // the canvas composites over the scene: transparent outside the glow
  float alpha = clamp(body + rim * 0.9 + aura * 0.45 + starA, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
`

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking'

const STATE_INDEX: Record<OrbState, number> = { idle: 0, listening: 1, thinking: 2, speaking: 3 }

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type)
  if (!sh) return null
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('orb shader:', gl.getShaderInfoLog(sh))
    gl.deleteShader(sh)
    return null
  }
  return sh
}

export class OrbEngine {
  private gl: WebGLRenderingContext | null = null
  private canvas: HTMLCanvasElement | null = null
  private program: WebGLProgram | null = null
  private uni: Record<string, WebGLUniformLocation | null> = {}
  private raf = 0
  private t0 = performance.now()
  private disposed = false
  private w = [1, 0, 0, 0] // blended state weights (lerped)
  private target = [1, 0, 0, 0]
  private level = 0
  private amp = 0
  private dark = 1
  private reduced = 0

  /** Returns false when WebGL is unavailable — caller renders the CSS fallback. */
  attach(canvas: HTMLCanvasElement): boolean {
    this.canvas = canvas
    const gl = (canvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: false, powerPreference: 'low-power' })
      ?? canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
    if (!gl) return false
    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) return false
    const program = gl.createProgram()
    if (!program) return false
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('orb link:', gl.getProgramInfoLog(program))
      return false
    }
    gl.useProgram(program)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(program, 'aPos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    for (const name of ['uRes', 'uTime', 'uW', 'uLevel', 'uAmp', 'uDark', 'uReduced']) {
      this.uni[name] = gl.getUniformLocation(program, name)
    }
    this.gl = gl
    this.program = program
    this.resize()
    this.loop()
    return true
  }

  setState(s: OrbState) {
    const target = [0, 0, 0, 0]
    target[STATE_INDEX[s]] = 1
    this.target = target
  }
  /** Raw mic RMS — call every frame-ish; engine smooths. */
  setLevel(v: number) { this.level = Math.min(1, Math.max(0, v)) }
  /** Raw neural-voice amplitude 0..1. */
  setAmp(v: number) { this.amp = Math.min(1, Math.max(0, v)) }
  setTheme(dark: boolean) { this.dark = dark ? 1 : 0 }
  setReducedMotion(r: boolean) { this.reduced = r ? 1 : 0 }

  private resize() {
    const c = this.canvas
    const gl = this.gl
    if (!c || !gl) return
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
    const w = Math.max(2, Math.round(c.clientWidth * dpr))
    const h = Math.max(2, Math.round(c.clientHeight * dpr))
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
    gl.viewport(0, 0, w, h)
  }

  private loop = () => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    const gl = this.gl
    if (!gl || document.hidden) return
    this.resize()
    // lerp state weights + levels (fast attack, slow release)
    for (let i = 0; i < 4; i++) this.w[i] += (this.target[i] - this.w[i]) * 0.075
    const now = performance.now()
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.uniform2f(this.uni.uRes, this.canvas!.width, this.canvas!.height)
    gl.uniform1f(this.uni.uTime, (now - this.t0) / 1000)
    gl.uniform4f(this.uni.uW, this.w[0], this.w[1], this.w[2], this.w[3])
    gl.uniform1f(this.uni.uLevel, this.level)
    gl.uniform1f(this.uni.uAmp, this.amp)
    gl.uniform1f(this.uni.uDark, this.dark)
    gl.uniform1f(this.uni.uReduced, this.reduced)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  destroy() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    if (this.gl && this.program) this.gl.deleteProgram(this.program)
    this.gl = null
    this.canvas = null
  }
}
