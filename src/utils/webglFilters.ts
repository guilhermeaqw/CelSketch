import type { HsvAdjustment } from './hsvUtils';
import type { BlurSettings } from './blurUtils';

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

// Exact Photoshop/CSP HSL + Colorize shader matching hsvUtils.ts
const HSL_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform int uCount;
uniform vec4 uSteps[8]; // (hDelta, sDelta, lDelta, colorize01)

vec3 rgbToHsl(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float d = mx - mn;
  float l = 0.5 * (mx + mn);
  if (d <= 0.00001) return vec3(0.0, 0.0, l);
  float s = d / max(0.00001, 1.0 - abs(2.0 * l - 1.0));
  float h = 0.0;
  if (mx == c.r) h = mod((c.g - c.b) / d, 6.0);
  else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
  else h = (c.r - c.g) / d + 4.0;
  h *= 60.0;
  if (h < 0.0) h += 360.0;
  return vec3(h, s, l);
}

vec3 hslToRgb(vec3 hsl) {
  float c = (1.0 - abs(2.0 * hsl.z - 1.0)) * hsl.y;
  float hp = hsl.x / 60.0;
  float x = c * (1.0 - abs(mod(hp, 2.0) - 1.0));
  float m = hsl.z - 0.5 * c;
  vec3 rgb;
  if (hp < 1.0) rgb = vec3(c, x, 0.0);
  else if (hp < 2.0) rgb = vec3(x, c, 0.0);
  else if (hp < 3.0) rgb = vec3(0.0, c, x);
  else if (hp < 4.0) rgb = vec3(0.0, x, c);
  else if (hp < 5.0) rgb = vec3(x, 0.0, c);
  else rgb = vec3(c, 0.0, x);
  return clamp(rgb + m, 0.0, 1.0);
}

void main() {
  vec4 tex = texture(uSrc, vUv);
  if (tex.a <= 0.002) {
    outColor = vec4(0.0);
    return;
  }
  vec3 rgb = tex.rgb;
  for (int i = 0; i < 8; i++) {
    if (i >= uCount) break;
    vec4 st = uSteps[i];
    vec3 hsl = rgbToHsl(rgb);
    if (st.w > 0.5) {
      hsl.x = mod(mod(st.x, 360.0) + 360.0, 360.0);
      hsl.y = clamp(0.5 + st.y / 200.0, 0.0, 1.0);
    } else {
      hsl.x = mod(mod(hsl.x + st.x, 360.0) + 360.0, 360.0);
      if (st.y < 0.0) hsl.y = max(0.0, hsl.y * (1.0 + st.y / 100.0));
      else if (st.y > 0.0 && hsl.y > 0.001) hsl.y = min(1.0, hsl.y + (1.0 - hsl.y) * (st.y / 100.0));
    }
    if (st.z < 0.0) hsl.z = max(0.0, hsl.z * (1.0 + st.z / 100.0));
    else if (st.z > 0.0) hsl.z = min(1.0, hsl.z + (1.0 - hsl.z) * (st.z / 100.0));
    rgb = hslToRgb(hsl);
  }
  outColor = vec4(rgb, tex.a);
}
`;

// 256-entry 1D LUT shader for Levels / Brightness / Contrast
const LEVELS_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform sampler2D uLut;

void main() {
  vec4 tex = texture(uSrc, vUv);
  if (tex.a <= 0.002) {
    outColor = vec4(0.0);
    return;
  }
  float r = texture(uLut, vec2((tex.r * 255.0 + 0.5) / 256.0, 0.5)).r;
  float g = texture(uLut, vec2((tex.g * 255.0 + 0.5) / 256.0, 0.5)).r;
  float b = texture(uLut, vec2((tex.b * 255.0 + 0.5) / 256.0, 0.5)).r;
  outColor = vec4(r, g, b, tex.a);
}
`;

// Premultiplied-alpha Motion Blur shader (both / forward / backward)
const MOTION_BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform vec2 uDir;     // (cos, -sin) in WebGL UV space
uniform float uDist;
uniform int uDirMode;  // 0=both, 1=forward, 2=backward
uniform int uTaps;

void main() {
  vec3 accRgb = vec3(0.0);
  float accA = 0.0;
  float wSum = 0.0;
  float denom = max(1.0, float(uTaps - 1));

  for (int i = 0; i < 35; i++) {
    if (i >= uTaps) break;
    float u = float(i) / denom;
    float signedT = 0.0;
    float wt = 1.0;
    if (uDirMode == 1) {
      signedT = u * uDist;
      wt = 1.0 - u * 0.65;
    } else if (uDirMode == 2) {
      signedT = -u * uDist;
      wt = 1.0 - u * 0.65;
    } else {
      signedT = (u - 0.5) * 2.0 * uDist;
      wt = 1.0 - abs(u - 0.5) * 2.0 * 0.55;
    }
    vec2 uv = vUv - uDir * signedT * uTexel;
    wSum += wt;
    if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
      vec4 s = texture(uSrc, uv);
      if (s.a > 0.002) {
        float aw = s.a * wt;
        accRgb += s.rgb * aw;
        accA += aw;
      }
    }
  }

  float outA = clamp(accA / max(0.0001, wSum), 0.0, 1.0);
  if (outA <= 0.002 || accA <= 0.0001) {
    outColor = vec4(0.0);
  } else {
    outColor = vec4(clamp(accRgb / accA, 0.0, 1.0), outA);
  }
}
`;

// Premultiplied-alpha Radial Blur shader (zoom / spin)
const RADIAL_BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform vec2 uSize;
uniform vec2 uCenter;  // in pixels (cx, h - cy)
uniform float uStrength;
uniform int uSpin;     // 0=zoom, 1=spin
uniform int uTaps;

void main() {
  vec2 px = vUv * uSize;
  vec2 rel = px - uCenter;
  float denom = max(1.0, float(uTaps - 1));
  float maxFrac = (uStrength / 100.0) * 0.24;
  float maxRad = (uStrength / 100.0) * 0.42;

  vec3 accRgb = vec3(0.0);
  float accA = 0.0;

  for (int i = 0; i < 25; i++) {
    if (i >= uTaps) break;
    float u = float(i) / denom;
    vec2 samplePx;
    if (uSpin == 1) {
      float ang = (u - 0.5) * maxRad;
      float ca = cos(ang);
      float sa = sin(ang);
      samplePx = uCenter + vec2(rel.x * ca - rel.y * sa, rel.x * sa + rel.y * ca);
    } else {
      float sc = 1.0 - u * maxFrac;
      samplePx = uCenter + rel * sc;
    }
    vec2 uv = samplePx / uSize;
    if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
      vec4 s = texture(uSrc, uv);
      if (s.a > 0.002) {
        accRgb += s.rgb * s.a;
        accA += s.a;
      }
    }
  }

  float outA = clamp(accA / float(uTaps), 0.0, 1.0);
  if (outA <= 0.002 || accA <= 0.0001) {
    outColor = vec4(0.0);
  } else {
    outColor = vec4(clamp(accRgb / accA, 0.0, 1.0), outA);
  }
}
`;

class WebGLFilterEngine {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private contextLost = false;
  private vao: WebGLVertexArrayObject | null = null;
  private srcTex: WebGLTexture | null = null;
  private lutTex: WebGLTexture | null = null;
  private progHsl: WebGLProgram | null = null;
  private progLevels: WebGLProgram | null = null;
  private progMotion: WebGLProgram | null = null;
  private progRadial: WebGLProgram | null = null;
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

  private compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('WebGLFilterEngine shader error:', gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  private link(gl: WebGL2RenderingContext, frag: string): WebGLProgram | null {
    const vs = this.compile(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = this.compile(gl, gl.FRAGMENT_SHADER, frag);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    if (!p) return null;
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn('WebGLFilterEngine link error:', gl.getProgramInfoLog(p));
      gl.deleteProgram(p);
      return null;
    }
    return p;
  }

  private makeTex(gl: WebGL2RenderingContext, linear: boolean): WebGLTexture | null {
    const tex = gl.createTexture();
    if (!tex) return null;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const filt = linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
    return tex;
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
      this.srcTex = this.makeTex(gl, true);
      this.lutTex = this.makeTex(gl, false);
      this.progHsl = this.link(gl, HSL_FRAG);
      this.progLevels = this.link(gl, LEVELS_FRAG);
      this.progMotion = this.link(gl, MOTION_BLUR_FRAG);
      this.progRadial = this.link(gl, RADIAL_BLUR_FRAG);
      this.ready = Boolean(
        this.vao && this.srcTex && this.lutTex && this.progHsl && this.progLevels && this.progMotion && this.progRadial
      );
    } catch {
      this.ready = false;
    }
  }

  public isAvailable(): boolean {
    return this.ready && !this.contextLost && Boolean(this.gl);
  }

  private uploadSource(src: HTMLCanvasElement | HTMLImageElement, w: number, h: number) {
    const gl = this.gl!;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  private blitToDst(dst: HTMLCanvasElement, w: number, h: number): boolean {
    if (dst.width !== w || dst.height !== h) {
      dst.width = w;
      dst.height = h;
    }
    const ctx = dst.getContext('2d');
    if (!ctx) return false;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(this.canvas, 0, 0);
    ctx.restore();
    return true;
  }

  public applyHsl(src: HTMLCanvasElement | HTMLImageElement, dst: HTMLCanvasElement, steps: HsvAdjustment[]): boolean {
    if (!this.isAvailable() || steps.length === 0 || steps.length > 8) return false;
    const w = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
    const h = src instanceof HTMLImageElement ? src.naturalHeight : src.height;
    if (w <= 0 || h <= 0) return false;
    const gl = this.gl!;
    this.uploadSource(src, w, h);
    gl.useProgram(this.progHsl!);
    gl.uniform1i(gl.getUniformLocation(this.progHsl!, 'uSrc'), 0);
    gl.uniform1i(gl.getUniformLocation(this.progHsl!, 'uCount'), steps.length);
    const flat = new Float32Array(8 * 4);
    for (let i = 0; i < steps.length; i++) {
      flat[i * 4] = steps[i].h;
      flat[i * 4 + 1] = steps[i].s;
      flat[i * 4 + 2] = steps[i].v;
      flat[i * 4 + 3] = steps[i].colorize ? 1 : 0;
    }
    gl.uniform4fv(gl.getUniformLocation(this.progHsl!, 'uSteps'), flat);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return this.blitToDst(dst, w, h);
  }

  public applyLevels(src: HTMLCanvasElement | HTMLImageElement, dst: HTMLCanvasElement, lut: Uint8Array): boolean {
    if (!this.isAvailable()) return false;
    const w = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
    const h = src instanceof HTMLImageElement ? src.naturalHeight : src.height;
    if (w <= 0 || h <= 0) return false;
    const gl = this.gl!;
    this.uploadSource(src, w, h);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 1, 0, gl.RED, gl.UNSIGNED_BYTE, lut);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);

    gl.useProgram(this.progLevels!);
    gl.uniform1i(gl.getUniformLocation(this.progLevels!, 'uSrc'), 0);
    gl.uniform1i(gl.getUniformLocation(this.progLevels!, 'uLut'), 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return this.blitToDst(dst, w, h);
  }

  public applyBlur(src: HTMLCanvasElement, dst: HTMLCanvasElement, cfg: BlurSettings): boolean {
    if (!this.isAvailable() || cfg.mode === 'gaussian') return false;
    const w = src.width;
    const h = src.height;
    if (w <= 0 || h <= 0) return false;
    const gl = this.gl!;
    this.uploadSource(src, w, h);

    if (cfg.mode === 'motion') {
      const dist = Math.max(1, Math.min(100, cfg.radius));
      const rad = ((cfg.angle || 0) * Math.PI) / 180;
      const taps = Math.max(9, Math.min(35, Math.round(dist * 0.9) | 1));
      const dirMode = cfg.direction === 'forward' ? 1 : cfg.direction === 'backward' ? 2 : 0;
      gl.useProgram(this.progMotion!);
      gl.uniform1i(gl.getUniformLocation(this.progMotion!, 'uSrc'), 0);
      gl.uniform2f(gl.getUniformLocation(this.progMotion!, 'uTexel'), 1 / w, 1 / h);
      gl.uniform2f(gl.getUniformLocation(this.progMotion!, 'uDir'), Math.cos(rad), -Math.sin(rad));
      gl.uniform1f(gl.getUniformLocation(this.progMotion!, 'uDist'), dist);
      gl.uniform1i(gl.getUniformLocation(this.progMotion!, 'uDirMode'), dirMode);
      gl.uniform1i(gl.getUniformLocation(this.progMotion!, 'uTaps'), taps);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return this.blitToDst(dst, w, h);
    }

    const strength = Math.max(1, Math.min(80, cfg.radius));
    const taps = Math.max(9, Math.min(25, Math.round(strength * 0.5) | 1));
    const cx = (cfg.centerX ?? 0.5) * w;
    const cy = (1 - (cfg.centerY ?? 0.5)) * h;
    gl.useProgram(this.progRadial!);
    gl.uniform1i(gl.getUniformLocation(this.progRadial!, 'uSrc'), 0);
    gl.uniform2f(gl.getUniformLocation(this.progRadial!, 'uSize'), w, h);
    gl.uniform2f(gl.getUniformLocation(this.progRadial!, 'uCenter'), cx, cy);
    gl.uniform1f(gl.getUniformLocation(this.progRadial!, 'uStrength'), strength);
    gl.uniform1i(gl.getUniformLocation(this.progRadial!, 'uSpin'), cfg.radialStyle === 'spin' ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(this.progRadial!, 'uTaps'), taps);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return this.blitToDst(dst, w, h);
  }
}

let sharedEngine: WebGLFilterEngine | null | undefined;
function getEngine(): WebGLFilterEngine | null {
  if (typeof document === 'undefined') return null;
  if (sharedEngine === undefined) sharedEngine = new WebGLFilterEngine();
  return sharedEngine;
}

export function applyHslWebGL(src: HTMLCanvasElement | HTMLImageElement, dst: HTMLCanvasElement, steps: HsvAdjustment[]): boolean {
  return Boolean(getEngine()?.applyHsl(src, dst, steps));
}

export function applyLevelsWebGL(src: HTMLCanvasElement | HTMLImageElement, dst: HTMLCanvasElement, lut: Uint8Array): boolean {
  return Boolean(getEngine()?.applyLevels(src, dst, lut));
}

export function applyBlurWebGL(src: HTMLCanvasElement, dst: HTMLCanvasElement, cfg: BlurSettings): boolean {
  return Boolean(getEngine()?.applyBlur(src, dst, cfg));
}
