// The walkable world, rendered: the same room the 2D explorer paints, rebuilt as
// a place you stand in.
//
// Division of labour with src/ui/screens/explore.js is deliberate and thin:
//
//   explore.js   owns the game — the grid, the keys, the pathfinding, the beats.
//   world3d.js   owns the plan — tiles to metres, walls, props, camera, light.
//   scene3d.js   owns the picture — programs, buffers, shadow map, draw order.
//
// The screen hands this module nothing but a getter for the player's position,
// so gameplay can be written (and tested) as if there were no renderer at all.
// No WebGL2, no shader, no canvas: `createScene3D()` returns null and explore.js
// keeps its 2D room, exactly like the beat stage does.

import {
  buffer,
  canvasTexture,
  compose,
  contextOf,
  multiply,
  normal,
  orthographic,
  lookAt,
  add,
  scale,
  program,
  shadowTarget,
} from './gl.js';
import {
  BILLBOARD_FS,
  BILLBOARD_VS,
  DEPTH_FS,
  DEPTH_SPRITE_FS,
  DEPTH_SPRITE_VS,
  DEPTH_VS,
  POST_FS,
  POST_VS,
  SURFACE_FS,
  SURFACE_VS,
  cubeGeometry,
  quadGeometry,
  renderAsk,
  resolutionFor,
} from './stage3d.js';
import { spriteCanvas } from './sprites.js';
import {
  TILE,
  actorHeight,
  actorSprite,
  cameraForPlayer,
  floorHit,
  posToWorld,
  projectPoint,
  propAt,
  roomSize,
  setPlan,
  worldToGrid,
} from './world3d.js';

const SHADOW_SIZE = 2048;
const MAX_SPRITES = 48;
const ZERO = [0, 0, 0];

/** A sprite canvas for a name, or null when the name has no art at all. */
function spriteSource(name) {
  if (typeof document === 'undefined') return null;
  const canvas = spriteCanvas(name, '', 16);
  if (!canvas || !canvas.width || !canvas.height) return null;
  return canvas;
}

/**
 * Mount a walkable 3D room.
 *
 * @param {object}   options
 * @param {object}   options.room      a room from src/content/rooms.js
 * @param {Function} options.provider  returns { x, y, dir, frame } in tiles
 * @param {Function} [options.onTile]  called with { tx, ty } when the floor is clicked
 * @param {Function} [options.onProp]  called with a prop id when the prop itself is clicked
 * @param {Map}      [options.nodes]   hotspot id -> DOM node, for labels
 * @param {string}   [options.search]  location.search, for ?render=
 * @param {object}   [options.doc]     document override, for the tests
 */
export function createScene3D({ room, provider, onTile, onProp, nodes, search = '', doc } = {}) {
  const host = doc || (typeof document === 'undefined' ? null : document);
  if (!host || !room) return null;

  const canvas = host.createElement('canvas');
  canvas.className = 'scene3d';
  canvas.setAttribute('aria-hidden', 'true');

  const gl = contextOf(canvas);
  if (!gl) return null;

  let surface = null;
  let depthSolid = null;
  let depthSprite = null;
  let billboard = null;
  let post = null;
  try {
    surface = program(gl, SURFACE_VS, SURFACE_FS);
    depthSolid = program(gl, DEPTH_VS, DEPTH_FS);
    depthSprite = program(gl, DEPTH_SPRITE_VS, DEPTH_SPRITE_FS);
    billboard = program(gl, BILLBOARD_VS, BILLBOARD_FS);
    post = program(gl, POST_VS, POST_FS);
  } catch (error) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('scene3d: falling back to the 2D room —', error && error.message ? error.message : error);
    }
    return null;
  }

  const plan = setPlan(room);
  const light = plan.light;
  const size = roomSize(room);

  /* ---------- geometry ---------- */

  const boxes = [...plan.surfaces, ...plan.sky].map((entry) => ({
    ...entry,
    model: compose(entry.center, 0, entry.size),
  }));

  // A pool of sunlight or moonlight is a lit patch, not a card standing up: a
  // wide dim slab with a smaller bright core, which reads as a falloff.
  for (const prop of plan.props) {
    if (prop.kind !== 'patch') continue;
    const cool = prop.sprite === 'moonpatch';
    const core = cool ? [0.4, 0.46, 0.8] : [0.86, 0.62, 0.28];
    boxes.push({
      ...prop,
      color: cool ? [0.2, 0.24, 0.46] : [0.4, 0.28, 0.12],
      pattern: 0,
      rough: 1,
      glow: 0.2,
      model: compose([prop.center[0], 0.013, prop.center[2]], 0, [prop.width, 0.02, prop.depth]),
    });
    boxes.push({
      ...prop,
      color: core,
      pattern: 0,
      rough: 1,
      glow: 0.34,
      model: compose(
        [prop.center[0], 0.014, prop.center[2]],
        0,
        [prop.width * 0.62, 0.02, prop.depth * 0.62],
      ),
    });
  }

  const cube = buffer(gl, cubeGeometry());
  const quad = buffer(gl, quadGeometry());
  const screenQuad = buffer(gl, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]));
  const cubeLayout = [['aPos', 3, 0, 24], ['aNrm', 3, 12, 24]];
  const quadLayout = [['aPos', 2, 0, 8]];

  /* ---------- the shadow map ---------- */

  const lightDir = light.sunDir;
  const reach = Math.max(plan.bounds.width, plan.bounds.depth) * 0.85;
  const lightCentre = [0, 0.4, 0];
  const lightVP = multiply(
    orthographic(-reach, reach, -reach, reach, 1, 34),
    lookAt(add(lightCentre, scale(lightDir, 16)), lightCentre),
  );
  const shadow = shadowTarget(gl, SHADOW_SIZE) || depthOnlyFallback();

  /** 1x1 depth texture at max depth: no occluders, so the room is simply lit. */
  function depthOnlyFallback() {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, 1, 1, 0,
      gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, new Uint32Array([0xffffffff]),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return { fbo: null, texture, size: 1 };
  }

  /* ---------- sprites: props, plants and the player ---------- */

  /**
   * Every billboard in the room. `origin` is the base of the card, so a prop
   * stands on the floor instead of floating around its middle.
   */
  const slots = [];

  function addSlot({ id, sprite, origin, height, node = null, kind = 'prop' }) {
    if (slots.length >= MAX_SPRITES) return null;
    const source = spriteSource(sprite);
    if (!source) return null;
    const slot = {
      id,
      sprite,
      kind,
      node,
      origin,
      height,
      flip: false,
      aspect: source.width / source.height,
      texture: canvasTexture(gl, source),
      glow: 0,
      tint: ZERO,
      hidden: false,
    };
    slots.push(slot);
    return slot;
  }

  for (const prop of plan.props) {
    if (prop.kind === 'patch' || prop.kind === 'geometry') continue;
    addSlot({
      id: prop.id,
      sprite: prop.sprite,
      origin: [prop.center[0], 0, prop.center[2]],
      height: prop.height,
      node: nodes && typeof nodes.get === 'function' ? nodes.get(prop.id) || null : null,
      kind: prop.hotspot ? 'hotspot' : 'prop',
    });
  }

  for (const plant of plan.plants) {
    addSlot({ id: null, sprite: plant.sprite, origin: plant.center, height: plant.height });
  }

  const playerSlot = addSlot({
    id: 'player',
    sprite: actorSprite(room),
    origin: [0, 0, 0],
    height: actorHeight(room),
    kind: 'player',
  });

  /**
   * Where each hotspot's DOM label sits. Furniture built as boxes has no
   * billboard of its own, so the anchor is kept apart from the sprite slots.
   */
  const anchors = plan.props
    .filter((prop) => prop.hotspot)
    .map((prop) => ({
      id: prop.id,
      node: nodes && typeof nodes.get === 'function' ? nodes.get(prop.id) || null : null,
      point: [prop.center[0], prop.height * 1.05, prop.center[2]],
    }));

  /* ---------- state ---------- */

  const view = host.defaultView || null;
  const pointer = { x: 0.5, y: 0.5, active: false };
  const sway = { x: 0, y: 0 };
  let cameraRight = [1, 0, 0];
  let camera = cameraForPlayer([0, 0, 0], 1.6);
  let disposed = false;
  let frames = 0;
  let width = 1;
  let height = 1;
  let raf = 0;
  const ask = renderAsk(search);
  const reduceMotion = Boolean(
    view && typeof view.matchMedia === 'function' && view.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  function resize() {
    if (disposed) return;
    const box = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    const cssWidth = Math.round(box && box.width ? box.width : canvas.clientWidth || 0);
    const cssHeight = Math.round(box && box.height ? box.height : canvas.clientHeight || 0);
    if (!cssWidth || !cssHeight) return;
    const next = resolutionFor(cssWidth, cssHeight, (view && view.devicePixelRatio) || 1, ask.cap, ask.exact);
    if (next.width === width && next.height === height) return;
    width = next.width;
    height = next.height;
    canvas.width = width;
    canvas.height = height;
    if (canvas.dataset) canvas.dataset.pixels = `${width}x${height}`;
  }

  /* ---------- per-frame staging ---------- */

  function has(slot, name) {
    const node = slot.node;
    return Boolean(node && node.classList && node.classList.contains(name));
  }

  function playerPosition() {
    const state = provider && typeof provider === 'function' ? provider() : null;
    return state || { x: size.w / 2, y: size.h / 2, dir: 'down', frame: 0 };
  }

  function stagePlayer(seconds) {
    if (!playerSlot) return [0, 0, 0];
    const player = playerPosition();
    const world = posToWorld(room, player);
    const bob = reduceMotion ? 0 : Math.sin(seconds * 7.5) * (player.frame ? 0.035 : 0.01);
    playerSlot.origin = [world[0], 0.006 + bob, world[2]];
    playerSlot.flip = player.dir === 'left';
    return world;
  }

  function stageProps(seconds) {
    for (const slot of slots) {
      if (slot.kind === 'player' || !slot.node) continue;
      // The room already speaks in CSS classes; read them here so the 3D room
      // answers exactly the state the 2D room would.
      const near = has(slot, 'is-near');
      const next = has(slot, 'is-next');
      slot.glow = has(slot, 'is-done')
        ? 0
        : near
          ? 0.24
          : next && !reduceMotion
            ? 0.1 + 0.07 * Math.sin(seconds * 3.1)
            : 0;
      slot.hidden = has(slot, 'is-locked') && !near;
    }
  }

  /** Project each hotspot onto the canvas so its DOM label sits on the prop. */
  function placeLabels() {
    for (const anchor of anchors) {
      const node = anchor.node;
      if (!node || !node.style) continue;
      const point = projectPoint(camera, anchor.point);
      if (!point.visible) {
        node.style.visibility = 'hidden';
        continue;
      }
      node.style.visibility = '';
      node.style.left = `${point.x.toFixed(2)}%`;
      node.style.top = `${point.y.toFixed(2)}%`;
    }
  }


  /* ---------- passes ---------- */

  function bindAttribs(progRef, handle, layout) {
    gl.bindBuffer(gl.ARRAY_BUFFER, handle);
    for (const [name, count, offset, stride] of layout) {
      const at = progRef.attrib(name);
      if (at < 0) continue;
      gl.enableVertexAttribArray(at);
      gl.vertexAttribPointer(at, count, gl.FLOAT, false, stride, offset);
    }
  }

  function setSprite(progRef, slot) {
    const cardWidth = slot.height * slot.aspect;
    gl.uniform3fv(progRef.uniform('uOrigin'), slot.origin);
    gl.uniform3fv(progRef.uniform('uRight'), cameraRight);
    gl.uniform1f(progRef.uniform('uWidth'), cardWidth);
    gl.uniform1f(progRef.uniform('uHeight'), slot.height);
    gl.uniform1f(progRef.uniform('uFlip'), slot.flip ? -1 : 1);
  }

  function drawShadowPass() {
    if (!shadow.fbo) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadow.fbo);
    gl.viewport(0, 0, shadow.size, shadow.size);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    depthSolid.use();
    gl.uniformMatrix4fv(depthSolid.uniform('uLightVP'), false, lightVP);
    bindAttribs(depthSolid, cube, cubeLayout);
    for (const item of boxes) {
      if (item.noShadow) continue;
      gl.uniformMatrix4fv(depthSolid.uniform('uModel'), false, item.model);
      gl.drawArrays(gl.TRIANGLES, 0, 36);
    }

    // props and the player cast too: alpha tested, so a figure leaves a
    // silhouette rather than a rectangle
    depthSprite.use();
    gl.disable(gl.CULL_FACE);
    gl.uniformMatrix4fv(depthSprite.uniform('uLightVP'), false, lightVP);
    gl.uniform1i(depthSprite.uniform('uTex'), 0);
    bindAttribs(depthSprite, quad, quadLayout);
    for (const slot of slots) {
      if (slot.hidden) continue;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, slot.texture);
      setSprite(depthSprite, slot);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    gl.enable(gl.CULL_FACE);
  }

  function drawSurfaces(camera, viewProj) {
    surface.use();
    gl.uniformMatrix4fv(surface.uniform('uViewProj'), false, viewProj);
    gl.uniformMatrix4fv(surface.uniform('uLightVP'), false, lightVP);
    gl.uniform3fv(surface.uniform('uSunDir'), lightDir);
    gl.uniform3fv(surface.uniform('uSunColor'), light.sunColor);
    gl.uniform3fv(surface.uniform('uFillDir'), light.fillDir);
    gl.uniform3fv(surface.uniform('uFillColor'), light.fillColor);
    gl.uniform3fv(surface.uniform('uAmbSky'), light.ambSky);
    gl.uniform3fv(surface.uniform('uAmbGround'), light.ambGround);
    gl.uniform3fv(surface.uniform('uLampPos'), plan.lamp);
    gl.uniform3fv(surface.uniform('uLampColor'), light.lampColor);
    gl.uniform3fv(surface.uniform('uEye'), camera.eye);
    gl.uniform3fv(surface.uniform('uTint'), ZERO);
    gl.uniform1f(surface.uniform('uExposure'), light.exposure);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, shadow.texture);
    gl.uniform1i(surface.uniform('uShadow'), 0);
    bindAttribs(surface, cube, cubeLayout);

    for (const item of boxes) {
      gl.uniformMatrix4fv(surface.uniform('uModel'), false, item.model);
      gl.uniform3fv(surface.uniform('uAlbedo'), item.color);
      gl.uniform1f(surface.uniform('uRough'), item.rough);
      gl.uniform1f(surface.uniform('uPattern'), item.pattern);
      gl.uniform1f(surface.uniform('uGlow'), item.glow || 0);
      gl.drawArrays(gl.TRIANGLES, 0, 36);
    }
  }

  function drawSprites(camera) {
    billboard.use();
    const viewProj = multiply(camera.projection, camera.view);
    gl.uniformMatrix4fv(billboard.uniform('uViewProj'), false, viewProj);
    gl.uniformMatrix4fv(billboard.uniform('uLightVP'), false, lightVP);
    gl.uniform3fv(billboard.uniform('uSunDir'), lightDir);
    gl.uniform3fv(billboard.uniform('uSunColor'), light.sunColor);
    gl.uniform3fv(billboard.uniform('uFillDir'), light.fillDir);
    gl.uniform3fv(billboard.uniform('uFillColor'), light.fillColor);
    gl.uniform3fv(billboard.uniform('uAmbSky'), light.ambSky);
    gl.uniform3fv(billboard.uniform('uAmbGround'), light.ambGround);
    gl.uniform3fv(billboard.uniform('uLampPos'), plan.lamp);
    gl.uniform3fv(billboard.uniform('uLampColor'), light.lampColor);
    gl.uniform1f(billboard.uniform('uExposure'), light.exposure);
    gl.uniform1i(billboard.uniform('uTex'), 0);
    gl.uniform1i(billboard.uniform('uShadow'), 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, shadow.texture);
    bindAttribs(billboard, quad, quadLayout);

    for (const slot of slots) {
      if (slot.hidden) continue;
      const facing = normal([camera.eye[0] - slot.origin[0], camera.eye[1] - slot.origin[1], camera.eye[2] - slot.origin[2]]);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, slot.texture);
      gl.uniform3fv(billboard.uniform('uFacing'), facing);
      gl.uniform3fv(billboard.uniform('uTint'), slot.tint || ZERO);
      gl.uniform1f(billboard.uniform('uGlow'), slot.glow || 0);
      setSprite(billboard, slot);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }

  /** Vignette over the finished frame, the same one the beat stage uses. */
  function drawVignette() {
    post.use();
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(post.uniform('uVignette'), 0.62);
    bindAttribs(post, screenQuad, [['aPos', 2, 0, 8]]);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
  }



  /* ---------- the frame ---------- */

  function render(seconds) {
    const playerWorld = stagePlayer(seconds);
    stageProps(seconds);

    // pointer parallax, eased: the lens leans, the layout never moves
    const wantX = pointer.active ? (pointer.x - 0.5) * 0.7 : 0;
    const wantY = pointer.active ? (0.5 - pointer.y) * 0.3 : 0;
    sway.x += (wantX - sway.x) * 0.1;
    sway.y += (wantY - sway.y) * 0.1;

    camera = cameraForPlayer(playerWorld, width / Math.max(1, height), sway);
    cameraRight = camera.right;
    const viewProj = multiply(camera.projection, camera.view);
    placeLabels();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0.015, 0.013, 0.028, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    drawShadowPass();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    drawSurfaces(camera, viewProj);
    gl.disable(gl.CULL_FACE);
    drawSprites(camera, viewProj);
    drawVignette();

    frames += 1;
    if (canvas.dataset) {
      if (frames % 30 === 0) canvas.dataset.frames = String(frames);
      canvas.dataset.walk = playerWorld.map((n) => n.toFixed(2)).join(',');
    }
  }

  const requestFrame =
    view && typeof view.requestAnimationFrame === 'function'
      ? (cb) => view.requestAnimationFrame(cb)
      : (cb) => setTimeout(() => cb(Date.now()), 16);
  const cancelFrame =
    view && typeof view.cancelAnimationFrame === 'function'
      ? (id) => view.cancelAnimationFrame(id)
      : (id) => clearTimeout(id);

  function tick(now) {
    if (disposed) return;
    raf = requestFrame(tick);
    if (host.hidden) return; // a background tab should not spend the GPU
    resize();
    if (width < 2 || height < 2) return;
    render((now || 0) / 1000);
  }

  /* ---------- input: click the floor to walk, click a prop to go there ---------- */

  function pointOf(event) {
    const box = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    if (!box || !box.width || !box.height) return null;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
    };
  }

  function onPointerMove(event) {
    const point = pointOf(event);
    if (!point) return;
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.active = true;
  }

  function onPointerOut() {
    pointer.active = false;
  }

  function onClick(event) {
    const point = pointOf(event);
    if (!point) return;
    const hit = floorHit(camera, point.x, point.y);
    if (!hit) return;
    const prop = propAt(plan.props, hit);
    if (prop) {
      if (onProp) onProp(prop.id);
      return;
    }
    const tile = worldToGrid(room, hit[0], hit[2]);
    if (tile.tx < 0 || tile.ty < 0 || tile.tx >= size.w || tile.ty >= size.h) return;
    if (onTile) onTile(tile);
  }

  if (typeof canvas.addEventListener === 'function') {
    canvas.addEventListener('pointermove', onPointerMove, { passive: true });
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('pointerleave', onPointerOut);
    canvas.addEventListener('webglcontextlost', (event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      const parent = canvas.parentElement;
      if (parent && parent.classList) parent.classList.remove('room--3d');
    });
  }
  if (view && typeof view.addEventListener === 'function') view.addEventListener('resize', resize);
  if (view && typeof view.ResizeObserver === 'function') {
    new view.ResizeObserver(resize).observe(canvas);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelFrame(raf);
    if (typeof canvas.removeEventListener === 'function') {
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('pointerleave', onPointerOut);
    }
    if (view && typeof view.removeEventListener === 'function') view.removeEventListener('resize', resize);
    for (const slot of slots) if (slot.texture) gl.deleteTexture(slot.texture);
    gl.deleteBuffer(cube);
    gl.deleteBuffer(quad);
    gl.deleteBuffer(screenQuad);
    gl.deleteTexture(shadow.texture);
    if (shadow.fbo) gl.deleteFramebuffer(shadow.fbo);
    for (const progRef of [surface, depthSolid, depthSprite, billboard, post]) progRef.dispose();
    if (canvas.parentNode && typeof canvas.parentNode.removeChild === 'function') {
      canvas.parentNode.removeChild(canvas);
    }
  }

  resize();
  raf = requestFrame(tick);

  return {
    el: canvas,
    resize,
    dispose,
    plan,
    hotspots: plan.props.filter((prop) => prop.hotspot).map((prop) => prop.id),
    get frames() {
      return frames;
    },
    get pixels() {
      return { width, height };
    },
    get camera() {
      return camera;
    },
    /** Metres per room tile, for anything outside that needs the same scale. */
    tile: TILE,
  };
}
