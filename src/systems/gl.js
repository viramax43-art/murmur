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

/** translate (no rotation), for composing a body's own placement. */
export function translation(v) {
  const m = mat4();
  m[12] = v[0];
  m[13] = v[1];
  m[14] = v[2];
  return m;
}

/** scale, for unit solids that are stretched into shoes and skulls. */
export function scaling(s) {
  const m = mat4();
  m[0] = s[0];
  m[5] = s[1];
  m[10] = s[2];
  return m;
}

export function rotationX(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const m = mat4();
  m[5] = c;
  m[6] = s;
  m[9] = -s;
  m[10] = c;
  return m;
}

export function rotationY(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const m = mat4();
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}

export function rotationZ(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const m = mat4();
  m[0] = c;
  m[1] = s;
  m[4] = -s;
  m[5] = c;
  return m;
}

/**
 * translate * rotateY * rotateXYZ * scale — one part of one body.
 *
 * `rot` is [rx, ry, rz] applied in that nesting (`yaw` is the body's own facing,
 * `rot` the part's tilt inside it), which is the order bodies3d.js computes when
 * it aims a limb from one joint at another.
 */
export function place(translate, yaw = 0, rot = [0, 0, 0], size = [1, 1, 1]) {
  const spin = multiply(
    multiply(rotationY(rot[1]), rotationX(rot[0])),
    rotationZ(rot[2]),
  );
  return multiply(
    multiply(translation(translate), rotationY(yaw)),
    multiply(spin, scaling(size)),
  );
}

/**
 * The matrix normals want: the inverse transpose of the upper 3x3 of a model.
 *
 * A rotation alone would do — `mat3(uModel) * aNrm` is right for a rigid body — but
 * nothing in this room is rigid: every limb is a unit capsule scaled [radius,
 * length / 6, radius], and a normal stretched by that ends up pointing along the
 * stretch instead of square to it, so a thin arm is lit as if it were a fat one and
 * a squashed skull is lit as if it were round. Dividing by the stretch is exactly
 * the inverse transpose, and the cofactor matrix over the determinant is the cheap
 * way to write it: for a pure rotation the result is that same rotation, so a
 * turned head still turns its highlights with it.
 */
export function normalMatrix(model) {
  const a = [model[0], model[1], model[2]];
  const b = [model[4], model[5], model[6]];
  const c = [model[8], model[9], model[10]];
  const u = cross(b, c);
  const det = dot(a, u);
  // a zero or vanishing scale has no normals to speak of: fall back to the identity
  // rather than hand the shader a matrix of NaNs, which would blank the whole frame
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const v = cross(c, a);
  const w = cross(a, b);
  return new Float32Array([
    u[0] / det, u[1] / det, u[2] / det,
    v[0] / det, v[1] / det, v[2] / det,
    w[0] / det, w[1] / det, w[2] / det,
  ]);
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

/** An index buffer, for geometry that is worth sharing vertices between. */
export function elementBuffer(gl, data) {
  const handle = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, handle);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, gl.STATIC_DRAW);
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
