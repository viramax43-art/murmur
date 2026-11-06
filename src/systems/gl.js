// Raw WebGL2 plumbing for the 3D stage: matrices, programs, buffers, targets.
// Nothing here touches the DOM or the GPU at import time, so `boot-check` and
// `smoke` can import it in a stub environment (same rule as atlas.js).

/* ---------- column-major 4x4 matrices (WebGL order) ---------- */

export function mat4() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

/** a * b, column-major: b is applied first. */
export function multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col += 1) {
    const b0 = b[col * 4];
    const b1 = b[col * 4 + 1];
    const b2 = b[col * 4 + 2];
    const b3 = b[col * 4 + 3];
    out[col * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[col * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[col * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[col * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

/** translate * rotateY * scale, which is every box in this scene. */
export function compose(translate, rotateY = 0, scale = [1, 1, 1]) {
  const c = Math.cos(rotateY);
  const s = Math.sin(rotateY);
  const [sx, sy, sz] = scale;
  const m = new Float32Array(16);
  m[0] = c * sx;
  m[2] = -s * sx;
  m[5] = sy;
  m[8] = s * sz;
  m[10] = c * sz;
  m[12] = translate[0];
  m[13] = translate[1];
  m[14] = translate[2];
  m[15] = 1;
  return m;
}

export function perspective(fovyRad, aspect, near, far) {
  const f = 1 / Math.tan(fovyRad / 2);
  const m = new Float32Array(16);
  m[0] = f / Math.max(aspect, 1e-4);
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

export function orthographic(left, right, bottom, top, near, far) {
  const m = new Float32Array(16);
  m[0] = 2 / (right - left);
  m[5] = 2 / (top - bottom);
  m[10] = -2 / (far - near);
  m[12] = -(right + left) / (right - left);
  m[13] = -(top + bottom) / (top - bottom);
  m[14] = -(far + near) / (far - near);
  m[15] = 1;
  return m;
}

export function lookAt(eye, target, up = [0, 1, 0]) {
  const z = normal(sub(eye, target));
  const x = normal(cross(up, z));
  const y = cross(z, x);
  const m = new Float32Array(16);
  m[0] = x[0];
  m[1] = y[0];
  m[2] = z[0];
  m[4] = x[1];
  m[5] = y[1];
  m[6] = z[1];
  m[8] = x[2];
  m[9] = y[2];
  m[10] = z[2];
  m[12] = -dot(x, eye);
  m[13] = -dot(y, eye);
  m[14] = -dot(z, eye);
  m[15] = 1;
  return m;
}

/* ---------- vec3 ---------- */

export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export function normal(a) {
  const len = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / len, a[1] / len, a[2] / len];
}

/* ---------- context, programs, buffers ---------- */

/**
 * A WebGL2 context, or null. The `typeof` probes matter: the test harnesses hand
 * back a fake canvas whose `getContext` returns a 2D-ish object, and a renderer
 * that trusted the name alone would throw on the first `createShader`.
 */
export function contextOf(canvas, attrs = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  let gl = null;
  try {
    gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      depth: true,
      powerPreference: 'high-performance',
      ...attrs,
    });
  } catch {
    return null;
  }
  if (!gl) return null;
  if (typeof gl.createShader !== 'function' || typeof gl.texImage2D !== 'function') return null;
  return gl;
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`shader: ${log}`);
  }
  return shader;
}

export function program(gl, vertexSource, fragmentSource) {
  const vs = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const handle = gl.createProgram();
  gl.attachShader(handle, vs);
  gl.attachShader(handle, fs);
  gl.linkProgram(handle);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
    throw new Error(`program: ${gl.getProgramInfoLog(handle)}`);
  }
  const uniforms = new Map();
  const attribs = new Map();
  return {
    handle,
    use() {
      gl.useProgram(handle);
      return this;
    },
    uniform(name) {
      if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(handle, name));
      return uniforms.get(name);
    },
    attrib(name) {
      if (!attribs.has(name)) attribs.set(name, gl.getAttribLocation(handle, name));
      return attribs.get(name);
    },
    dispose() {
      gl.deleteProgram(handle);
    },
  };
}

export function buffer(gl, data) {
  const handle = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, handle);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return handle;
}

/** Upload an element (canvas, image) as a crisp, non-repeating sprite texture. */
export function canvasTexture(gl, source) {
  const handle = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, handle);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  return handle;
}

/** Depth-only render target for the sun's shadow map. */
export function shadowTarget(gl, size) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.NONE);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, texture, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!ok) {
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(texture);
    return null;
  }
  return { fbo, texture, size };
}
