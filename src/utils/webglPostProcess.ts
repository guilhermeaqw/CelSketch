import type { PostProcessSettings } from '../types/harmony';

const VERT_SRC = `#version 300 es
precision highp float;
const vec2 POS[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2( 3.0, -1.0),
  vec2(-1.0,  3.0)
);
out vec2 vUv;
void main() {
  vec2 p = POS[gl_VertexID];
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

// Pass 1: Directional Motion Blur + Chromatic Aberration (RGB Split)
const PASS1_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uMotionDist;
uniform vec2 uMotionDir;
uniform float uChromaticPx;

vec4 sampleMotion(vec2 uv) {
  vec4 base = texture(uSrc, uv);
  if (uMotionDist <= 0.5) return base;
  vec4 acc = base;
  float wSum = 1.0;
  for (int i = 1; i <= 6; i++) {
    float frac = float(i) / 6.0;
    float w = 0.22 * (1.0 - frac * 0.65);
    vec2 off = uMotionDir * (frac * uMotionDist) * uTexel;
    acc += texture(uSrc, clamp(uv + off, vec2(0.0), vec2(1.0))) * w;
    acc += texture(uSrc, clamp(uv - off, vec2(0.0), vec2(1.0))) * w;
    wSum += 2.0 * w;
  }
  return acc / wSum;
}

void main() {
  vec4 c = sampleMotion(vUv);
  if (uChromaticPx >= 0.5 && c.a > 0.004) {
    float dx = uChromaticPx * uTexel.x;
    float r = sampleMotion(vec2(clamp(vUv.x - dx, 0.0, 1.0), vUv.y)).r;
    float b = sampleMotion(vec2(clamp(vUv.x + dx, 0.0, 1.0), vUv.y)).b;
    outColor = vec4(r, c.g, b, c.a);
  } else {
    outColor = c;
  }
}
`;

// Pass 2: Half-res bright-pass highlight extraction for Anime Bloom
const BLOOM_EXTRACT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform float uThreshold;

void main() {
  vec4 c = texture(uSrc, vUv);
  if (c.a <= 0.004) {
    outColor = vec4(0.0);
    return;
  }
  float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  if (lum <= uThreshold) {
    outColor = vec4(0.0);
  } else {
    float factor = clamp((lum - uThreshold) / max(0.004, 1.0 - uThreshold), 0.0, 1.0);
    outColor = vec4(c.rgb * factor, c.a);
  }
}
`;

// Pass 3 & 4: Separable 9-tap Gaussian Blur
const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform vec2 uStep;

void main() {
  const float W0 = 0.227027;
  const float W1 = 0.1945946;
  const float W2 = 0.1216216;
  const float W3 = 0.054054;
  const float W4 = 0.016216;
  vec4 acc = texture(uSrc, vUv) * W0;
  acc += texture(uSrc, clamp(vUv + uStep * 1.0, vec2(0.0), vec2(1.0))) * W1;
  acc += texture(uSrc, clamp(vUv - uStep * 1.0, vec2(0.0), vec2(1.0))) * W1;
  acc += texture(uSrc, clamp(vUv + uStep * 2.0, vec2(0.0), vec2(1.0))) * W2;
  acc += texture(uSrc, clamp(vUv - uStep * 2.0, vec2(0.0), vec2(1.0))) * W2;
  acc += texture(uSrc, clamp(vUv + uStep * 3.0, vec2(0.0), vec2(1.0))) * W3;
  acc += texture(uSrc, clamp(vUv - uStep * 3.0, vec2(0.0), vec2(1.0))) * W3;
  acc += texture(uSrc, clamp(vUv + uStep * 4.0, vec2(0.0), vec2(1.0))) * W4;
  acc += texture(uSrc, clamp(vUv - uStep * 4.0, vec2(0.0), vec2(1.0))) * W4;
  outColor = acc;
}
`;

// Pass 5: Final composite (Screen Bloom + Radial Vignette + Procedural Film Grain)
const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uBase;
uniform sampler2D uBloom;
uniform float uBloomAlpha;
uniform float uVignette;
uniform float uGrain;
uniform vec2 uResolution;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec4 base = texture(uBase, vUv);
  vec3 col = base.rgb;

  // Screen-blend anime bloom
  if (uBloomAlpha > 0.001) {
    vec3 b = texture(uBloom, vUv).rgb * uBloomAlpha;
    col = 1.0 - (1.0 - col) * (1.0 - b);
  }

  // Cinematic radial vignette
  if (uVignette > 0.001) {
    vec2 centered = (vUv - 0.5) * 2.0;
    float d = length(centered) / 1.41421356;
    float vig = smoothstep(0.42, 1.0, d) * uVignette;
    col *= (1.0 - vig);
  }

  // Subtle overlay film grain
  if (uGrain > 0.001) {
    float n = hash12(floor(vUv * uResolution));
    vec3 overlayCol = mix(2.0 * col * n, 1.0 - 2.0 * (1.0 - col) * (1.0 - n), step(0.5, col));
    col = mix(col, overlayCol, uGrain);
  }

  outColor = vec4(clamp(col, 0.0, 1.0), base.a);
}
`;

interface FboTarget {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
}

class WebGLPostProcessor {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private contextLost = false;
  private vao: WebGLVertexArrayObject | null = null;
  private srcTex: WebGLTexture | null = null;
  private progPass1: WebGLProgram | null = null;
  private progExtract: WebGLProgram | null = null;
  private progBlur: WebGLProgram | null = null;
  private progComposite: WebGLProgram | null = null;
  private fboBase: FboTarget | null = null;
  private fboHalfA: FboTarget | null = null;
  private fboHalfB: FboTarget | null = null;
  private ready = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.ready = false;
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.init();
    });
    this.init();
  }

  private compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('WebGL2 shader compile error:', gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  private createProgram(gl: WebGL2RenderingContext, fragSrc: string): WebGLProgram | null {
    const vs = this.compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    if (!prog) return null;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('WebGL2 program link error:', gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
      return null;
    }
    return prog;
  }

  private createTexture(gl: WebGL2RenderingContext): WebGLTexture | null {
    const tex = gl.createTexture();
    if (!tex) return null;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  private ensureFbo(slot: 'base' | 'halfA' | 'halfB', w: number, h: number): FboTarget | null {
    const gl = this.gl;
    if (!gl) return null;
    const existing = slot === 'base' ? this.fboBase : slot === 'halfA' ? this.fboHalfA : this.fboHalfB;
    if (existing && existing.w === w && existing.h === h) return existing;

    if (existing) {
      gl.deleteFramebuffer(existing.fbo);
      gl.deleteTexture(existing.tex);
    }
    const tex = this.createTexture(gl);
    const fbo = gl.createFramebuffer();
    if (!tex || !fbo) return null;

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const target: FboTarget = { fbo, tex, w, h };
    if (slot === 'base') this.fboBase = target;
    else if (slot === 'halfA') this.fboHalfA = target;
    else this.fboHalfB = target;
    return target;
  }

  private init() {
    try {
      const gl = this.canvas.getContext('webgl2', {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true
      });
      if (!gl) return;
      this.gl = gl;
      this.vao = gl.createVertexArray();
      this.srcTex = this.createTexture(gl);
      this.progPass1 = this.createProgram(gl, PASS1_FRAG);
      this.progExtract = this.createProgram(gl, BLOOM_EXTRACT_FRAG);
      this.progBlur = this.createProgram(gl, BLUR_FRAG);
      this.progComposite = this.createProgram(gl, COMPOSITE_FRAG);

      this.ready = Boolean(
        this.vao &&
          this.srcTex &&
          this.progPass1 &&
          this.progExtract &&
          this.progBlur &&
          this.progComposite
      );
    } catch {
      this.ready = false;
    }
  }

  public isAvailable(): boolean {
    return this.ready && !this.contextLost && Boolean(this.gl);
  }

  public apply(targetCanvas: HTMLCanvasElement, pp: PostProcessSettings): boolean {
    if (!this.isAvailable() || !this.gl || !this.srcTex || !this.vao) return false;
    const gl = this.gl;
    const w = targetCanvas.width;
    const h = targetCanvas.height;
    if (w <= 0 || h <= 0) return false;

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }

    const baseFbo = this.ensureFbo('base', w, h);
    if (!baseFbo) return false;

    // Upload 2D canvas directly to GPU texture (flipped vertically for WebGL convention)
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, targetCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);

    // Pass 1: Motion Blur + Chromatic Aberration -> baseFbo
    gl.bindFramebuffer(gl.FRAMEBUFFER, baseFbo.fbo);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.progPass1!);
    gl.uniform1i(gl.getUniformLocation(this.progPass1!, 'uSrc'), 0);
    gl.uniform2f(gl.getUniformLocation(this.progPass1!, 'uTexel'), 1 / w, 1 / h);
    const rad = ((pp.motionBlurAngle || 0) * Math.PI) / 180;
    gl.uniform1f(gl.getUniformLocation(this.progPass1!, 'uMotionDist'), Math.min(28, pp.motionBlur || 0));
    gl.uniform2f(gl.getUniformLocation(this.progPass1!, 'uMotionDir'), Math.cos(rad), -Math.sin(rad));
    gl.uniform1f(gl.getUniformLocation(this.progPass1!, 'uChromaticPx'), Math.min(24, pp.chromaticAberration || 0));
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Pass 2-4: Optional Half-Res Anime Bloom (Extract + Separable H/V Gaussian Blur)
    const bloomAlpha = Math.max(0, Math.min(1, (pp.bloomIntensity || 0) / 100));
    let bloomTex: WebGLTexture = baseFbo.tex;
    if (bloomAlpha > 0.001) {
      const bw = Math.max(2, Math.round(w * 0.5));
      const bh = Math.max(2, Math.round(h * 0.5));
      const halfA = this.ensureFbo('halfA', bw, bh);
      const halfB = this.ensureFbo('halfB', bw, bh);
      if (halfA && halfB) {
        // Extract highlights
        gl.bindFramebuffer(gl.FRAMEBUFFER, halfA.fbo);
        gl.viewport(0, 0, bw, bh);
        gl.useProgram(this.progExtract!);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, baseFbo.tex);
        gl.uniform1i(gl.getUniformLocation(this.progExtract!, 'uSrc'), 0);
        gl.uniform1f(
          gl.getUniformLocation(this.progExtract!, 'uThreshold'),
          Math.max(60, Math.min(250, pp.bloomThreshold ?? 175)) / 255
        );
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // Two separable passes for smooth wide glow
        const radius = Math.max(2, Math.min(36, (pp.bloomRadius || 14) * 0.5));
        const stepScale = radius / 4.0;
        gl.useProgram(this.progBlur!);
        gl.uniform1i(gl.getUniformLocation(this.progBlur!, 'uSrc'), 0);
        const uStep = gl.getUniformLocation(this.progBlur!, 'uStep');

        for (let pass = 0; pass < 2; pass++) {
          const mul = pass === 0 ? stepScale : stepScale * 0.65;
          // Horizontal: halfA -> halfB
          gl.bindFramebuffer(gl.FRAMEBUFFER, halfB.fbo);
          gl.bindTexture(gl.TEXTURE_2D, halfA.tex);
          gl.uniform2f(uStep, mul / bw, 0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);

          // Vertical: halfB -> halfA
          gl.bindFramebuffer(gl.FRAMEBUFFER, halfA.fbo);
          gl.bindTexture(gl.TEXTURE_2D, halfB.tex);
          gl.uniform2f(uStep, 0, mul / bh);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        bloomTex = halfA.tex;
      }
    }

    // Pass 5: Final Composite -> default framebuffer (this.canvas)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.progComposite!);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, baseFbo.tex);
    gl.uniform1i(gl.getUniformLocation(this.progComposite!, 'uBase'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomTex);
    gl.uniform1i(gl.getUniformLocation(this.progComposite!, 'uBloom'), 1);
    gl.uniform1f(gl.getUniformLocation(this.progComposite!, 'uBloomAlpha'), bloomAlpha);
    gl.uniform1f(
      gl.getUniformLocation(this.progComposite!, 'uVignette'),
      Math.max(0, Math.min(0.92, ((pp.vignette || 0) / 100) * 0.85))
    );
    gl.uniform1f(
      gl.getUniformLocation(this.progComposite!, 'uGrain'),
      Math.max(0, Math.min(0.45, ((pp.filmGrain || 0) / 100) * 0.55))
    );
    gl.uniform2f(gl.getUniformLocation(this.progComposite!, 'uResolution'), w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Copy GPU result back onto the 2D targetCanvas in one hardware-accelerated blit
    const ctx = targetCanvas.getContext('2d');
    if (!ctx) return false;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(this.canvas, 0, 0);
    ctx.restore();
    return true;
  }
}

let sharedWebGLProcessor: WebGLPostProcessor | null | undefined;

export function applyPostProcessWebGL(
  canvas: HTMLCanvasElement,
  pp: PostProcessSettings
): boolean {
  if (typeof document === 'undefined') return false;
  if (sharedWebGLProcessor === undefined) {
    sharedWebGLProcessor = new WebGLPostProcessor();
  }
  return sharedWebGLProcessor ? sharedWebGLProcessor.apply(canvas, pp) : false;
}

export function isWebGLPostProcessAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  if (sharedWebGLProcessor === undefined) {
    sharedWebGLProcessor = new WebGLPostProcessor();
  }
  return Boolean(sharedWebGLProcessor?.isAvailable());
}
