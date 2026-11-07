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
  normalMatrix,
  orthographic,
  lookAt,
  add,
  place,
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
import { figureCanvas, hasFigure } from './figures.js';
import { bodyPlan, hasBody } from './bodies3d.js';
import { bindMesh, drawMesh, releaseMeshes, uploadMeshes } from './meshes.js';
import {
  TILE,
  actorBodyHeight,
  actorSprite,
  cameraForEye,
  clampPitch,
  eyeFor,
  floorHit,
  posToWorld,
  projectPoint,
  propAt,
  roomSize,
  setPlan,
  worldToGrid,
  yawForDir,
} from './world3d.js';

const SHADOW_SIZE = 2048;
const MAX_SPRITES = 48;
const ZERO = [0, 0, 0];

/**
 * How much of the room's exposure the billboards get. Measured, not guessed: the
 * room's surfaces arrive at roughly 0.3 of a linear unit and its figures at 2.5,
 * so a pale face needs about a third of the stop to land on its own colour.
 */
const BILLBOARD_STOP = 0.34;

/** Cells per art pixel for the figures standing in the room. */
const FIGURE_UNIT = 4;

/**
 * Figures are drawn at sixteen times the detail of the painted maps (see
 * ./figures.js), which is what makes a person readable at the size a room card
 * gives them. A pose is a property of the *scene*, not of the sprite: the
 * nursery's mama leans over the crib, which is what her hotspot says she is
 * doing, and everyone else stands.
 */
const FIGURE_POSE = { mama: 'lean' };

/**
 * The sprite poses, in radians of spine. `lean` is mama over the crib: the same
 * body, bent forward, because that is the shape the beat is about.
 */
const FIGURE_LEAN = { lean: 0.34 };

/** How close a body has to be before it turns to face you. */
const BODY_NOTICE = 2.8;

function figureSource(name, { view = 'front', pose = 'idle', frame = 0, unit = FIGURE_UNIT } = {}) {
  if (!hasFigure(name)) return null;
  return figureCanvas(name, { unit, view, pose, frame });
}

/** A sprite canvas for a name, or null when the name has no art at all. */
function spriteSource(name, pose = 'idle') {
  if (typeof document === 'undefined') return null;
  const canvas = figureSource(name, { pose }) || spriteCanvas(name, '', 16);
  if (!canvas || !canvas.width || !canvas.height) return null;
  return canvas;
}

/** Which drawing of a body faces a direction. Left is the side view, flipped. */
function viewForDir(dir) {
  if (dir === 'left' || dir === 'right') return 'side';
  if (dir === 'up') return 'back';
  return 'front';
}

/**
 * Mount a walkable 3D room.
 *
 * @param {object}   options
 * @param {object}   options.room      a room from src/content/rooms.js
 * @param {Function} options.provider  returns { x, y, dir, frame } in tiles
 * @param {Function} [options.onTile]  called with { tx, ty } when the floor is clicked
 * @param {Function} [options.onProp]  called with a prop id when the prop itself is clicked
 * @param {Function} [options.onLook]  called with (dYaw, dPitch) when the view is turned
 * @param {Map}      [options.nodes]   hotspot id -> DOM node, for labels
 * @param {string}   [options.search]  location.search, for ?render=
 * @param {object}   [options.doc]     document override, for the tests
 */
export function createScene3D({ room, provider, onTile, onProp, onLook, nodes, search = '', doc } = {}) {
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

  /* ---------- the cast's solids ---------- */

  // A body is five unit shapes plus a list of placements. Uploaded once, here; if
  // a driver refuses the indexed buffers, bodyMeshes stays null and every slot
  // keeps its painted card, so a weak machine gets the old picture rather than no
  // picture at all.
  let bodyMeshes = null;
  try {
    bodyMeshes = uploadMeshes(gl);
    // the room's cube is already exactly a body's shoe: same layout, same 36
    // vertices, so a box part borrows it instead of uploading a copy
    bodyMeshes.box = { handle: cube, element: null, count: 36 };
  } catch (error) {
    bodyMeshes = null;
  }

  /**
   * The body a sprite wears, or null for a sprite that was only ever a drawing.
   * `height` is metres: the prop's own height, or for the player the height their
   * eye implies, because the lens is inside that head.
   */
  function makeBody(sprite, height, opts = {}) {
    if (!bodyMeshes || !hasBody(sprite)) return null;
    const plan = bodyPlan(sprite, {
      height,
      pose: opts.pose === 'walk' ? 'walk' : 'idle',
      phase: opts.phase || 0,
      lean: opts.lean || 0,
    });
    if (!plan || !plan.parts.length) return null;
    return {
      plan,
      height,
      // a body's resting facing: the room's own, towards the south wall
      home: 0,
      yaw: 0,
      // the player's head is full of camera, so parts this high are left out of
      // the picture — never out of the shadow, which needs a whole silhouette
      hideAbove: opts.hideAbove || 0,
    };
  }

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

  function addSlot({ id, sprite, origin, height, node = null, kind = 'prop', pose = 'idle', lean = 0, hideAbove = 0 }) {
    if (slots.length >= MAX_SPRITES) return null;
    // A sprite with a body is drawn as volumes, so its card is never needed — the
    // only reason to keep the texture is the frame after a driver refused the
    // meshes, and in that case makeBody() has already returned null.
    const body = makeBody(sprite, height, { lean, hideAbove });
    const source = body ? null : spriteSource(sprite, pose);
    if (!source && !body) return null;
    const slot = {
      id,
      sprite,
      kind,
      node,
      origin,
      height,
      body,
      flip: false,
      aspect: source ? source.width / source.height : 1,
      texture: source ? canvasTexture(gl, source) : null,
      glow: 0,
      tint: ZERO,
      hidden: false,
      // a body the lens stands inside still casts a shadow, but is never drawn
      shadowOnly: false,
    };
    slots.push(slot);
    return slot;
  }

  for (const prop of plan.props) {
    if (prop.kind === 'patch' || prop.kind === 'geometry') continue;
    addSlot({
      id: prop.id,
      sprite: prop.sprite,
      pose: FIGURE_POSE[prop.sprite] || 'idle',
      lean: FIGURE_LEAN[FIGURE_POSE[prop.sprite]] || 0,
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
    // The eye is a gameplay constant, the body is derived from it: a 1.34 m view
    // belongs to a child of about 1.48 m, and the head that high is where the
    // camera goes.
    height: actorBodyHeight(room),
    // nothing above the eye can be seen anyway, and drawing it would put a skull
    // around the lens
    hideAbove: eyeFor(room) - 0.05,
    kind: 'player',
  });
  // First person: the lens is in this body's own head, so its card only ever
  // casts a shadow — you never see your own sprite in front of you.
  if (playerSlot) playerSlot.shadowOnly = true;

  /**
   * The player is the one body in the room that moves, so it is the one body
   * that needs more than one drawing: a walk cycle per facing, built on demand
   * and shared between frames. `playerSheet` is what stagePlayer() advances.
   */
  const playerName = actorSprite(room);
  const playerSheets = new Map();

  function playerSheet(view, pose, frame) {
    if (!playerSlot || !hasFigure(playerName)) return null;
    const key = `${playerName}|${view}|${pose}|${frame}`;
    const hit = playerSheets.get(key);
    if (hit) return hit;
    const canvas = figureSource(playerName, { view, pose, frame });
    if (!canvas) return null;
    const sheet = { texture: canvasTexture(gl, canvas), aspect: canvas.width / canvas.height };
    playerSheets.set(key, sheet);
    return sheet;
  }

  function dressPlayer(view, pose, frame) {
    const sheet = playerSheet(view, pose, frame);
    if (!sheet) return;
    playerSlot.texture = sheet.texture;
    playerSlot.aspect = sheet.aspect;
    playerSlot.pose = `${view}/${pose}/${frame}`;
  }

  /**
   * The player's body, rebuilt per frame from the stride phase — a leg has to be
   * in a different place sixty times a second or the walk is a slide. The phase is
   * quantised to a hundredth of a stride because a body that is asked the same
   * question twice should not be rebuilt twice: standing still costs nothing.
   */
  let playerPlanCached = null;
  let playerPlanKey = '';

  function playerPlan(pose, phase) {
    // a stride has no seam: 0.99 and 1.0 are the same instant, so both go to 0
    const step = Math.round(phase * 100) % 100;
    const key = `${pose}|${step}`;
    if (playerPlanCached && key === playerPlanKey) return playerPlanCached;
    const plan = bodyPlan(playerName, { height: actorBodyHeight(room), pose, phase: step / 100 });
    if (plan) {
      playerPlanCached = plan;
      playerPlanKey = key;
    }
    return plan || playerPlanCached;
  }

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
  let cameraRight = [1, 0, 0];
  // The look direction lives in the game (explore.js owns yaw and pitch, because
  // turning is gameplay); the scene only eases towards it, so a mouse jitter
  // cannot shake the picture.
  const lens = { yaw: 0, pitch: -0.04, seen: false };
  const eyeHeight = eyeFor(room);
  let camera = cameraForEye([0, 0, 0], { aspect: 1.6, eye: eyeHeight });
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

  let walked = [0, 0, 0];
  let stepPhase = 0;
  let bobY = 0;
  let lastSeconds = 0;
  let propSeconds = 0;

  /** The signed difference between two angles, in -pi..pi: the short way round. */
  function shortestAngle(from, to) {
    let delta = (to - from) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
  }

  function has(slot, name) {
    const node = slot.node;
    return Boolean(node && node.classList && node.classList.contains(name));
  }

  function playerPosition() {
    const state = provider && typeof provider === 'function' ? provider() : null;
    return state || { x: size.w / 2, y: size.h / 2, dir: 'down', frame: 0 };
  }

  function stagePlayer(seconds) {
    const player = playerPosition();
    const world = posToWorld(room, player);
    const dx = world[0] - walked[0];
    const dz = world[2] - walked[2];
    const dt = Math.min(0.12, Math.max(0, seconds - lastSeconds));
    lastSeconds = seconds;
    walked = world;
    const travelled = Math.hypot(dx, dz);
    const moving = Boolean(player.frame) || travelled > 0.002;

    // The look. The game owns yaw and pitch; the scene only eases towards them,
    // so a coarse input rate can never make the picture stutter.
    const wantYaw = Number.isFinite(player.yaw) ? player.yaw : yawForDir(player.dir);
    const wantPitch = clampPitch(Number.isFinite(player.pitch) ? player.pitch : -0.04);
    if (!lens.seen) {
      lens.yaw = wantYaw;
      lens.pitch = wantPitch;
      lens.seen = true;
    }
    const ease = Math.min(1, dt * 22);
    lens.yaw += shortestAngle(lens.yaw, wantYaw) * ease;
    lens.pitch += (wantPitch - lens.pitch) * ease;

    // The step. The eye rides on the feet, so it dips once per stride; the phase
    // is advanced by distance walked, not by the clock, or the head would keep
    // bobbing while you stand still.
    if (moving && !reduceMotion) {
      stepPhase = (stepPhase + travelled * 12 + dt * 5.5) % (Math.PI * 2);
    } else {
      stepPhase *= 0.9;
    }
    bobY = reduceMotion ? 0 : Math.sin(stepPhase) * (moving ? 0.05 : 0.008);

    if (playerSlot) {
      playerSlot.origin = [world[0], 0.006, world[2]];
      playerSlot.flip = player.dir === 'left';
      if (playerSlot.body) {
        // The body walks when the feet walk, and it turns with the head: looking
        // down should show your own chest facing the way you are looking.
        playerSlot.body.plan = playerPlan(moving ? 'walk' : 'idle', stepPhase / (Math.PI * 2));
        playerSlot.body.yaw = lens.yaw;
      } else {
        dressPlayer(viewForDir(player.dir), moving ? 'walk' : 'idle', 0);
      }
    }
    return world;
  }

  function stageProps(seconds) {
    const dt = Math.min(0.12, Math.max(0, seconds - propSeconds));
    propSeconds = seconds;
    for (const slot of slots) {
      if (slot.kind === 'player') continue;
      if (slot.body) {
        // A body knows where its audience is. Walk up behind someone and they turn
        // to face you; step away and they drift back to the room's own front. The
        // turn is eased over about half a second, which is what makes it read as
        // noticing rather than as a turntable.
        const dx = camera.eye[0] - slot.origin[0];
        const dz = camera.eye[2] - slot.origin[2];
        const close = !reduceMotion && Math.hypot(dx, dz) < BODY_NOTICE;
        const target = close ? Math.atan2(dx, dz) : slot.body.home;
        slot.body.yaw += shortestAngle(slot.body.yaw, target) * Math.min(1, dt * 2.4);
      }
      if (!slot.node) continue;
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

  /**
   * Every body in the room, part by part.
   *
   * The same list feeds the colour pass and the shadow pass — which is the whole
   * point of building a body out of volumes: the shadow on the floor is a child's
   * shadow, with a nose and elbows in it, and it changes when the child walks.
   * Meshes are rebound only when they change, because a body's parts come in runs
   * (both legs, the torso, both arms) and a rebind per part would be six times the
   * work for the same picture.
   */
  function drawBodies(progRef, { shadow = false } = {}) {
    if (!bodyMeshes) return;
    let bound = null;
    for (const slot of slots) {
      const body = slot.body;
      if (!body || !body.plan) continue;
      if (!shadow && slot.hidden) continue;
      const plan = body.plan;
      const base = place([slot.origin[0], slot.origin[1] + (plan.lift || 0), slot.origin[2]], body.yaw);
      for (const part of plan.parts) {
        // the lens is inside the player's head: draw the body, not the skull
        if (!shadow && body.hideAbove && part.at[1] > body.hideAbove) continue;
        const mesh = bodyMeshes[part.mesh];
        if (!mesh) continue;
        const model = multiply(base, place(part.at, 0, part.rot, part.scale));
        gl.uniformMatrix4fv(progRef.uniform('uModel'), false, model);
        if (!shadow) {
          // a limb is a unit capsule scaled [radius, length / 6, radius], so its
          // normals have to come through the inverse transpose or the sun lands on
          // it as if it were a ball
          gl.uniformMatrix3fv(progRef.uniform('uNrmMat'), false, normalMatrix(model));
          gl.uniform3fv(progRef.uniform('uAlbedo'), part.color);
          gl.uniform1f(progRef.uniform('uRough'), part.rough);
          // Clothing takes the woven pattern, skin and hair stay smooth: the rough
          // value is the material, so the shader can be told by that alone
          gl.uniform1f(progRef.uniform('uPattern'), part.rough >= 0.86 ? 3 : 0);
        }
        if (bound !== mesh) {
          bindMesh(gl, progRef, mesh);
          bound = mesh;
        }
        drawMesh(gl, mesh);
      }
    }
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
    // the cast casts too, as volumes: a whole silhouette, head to heel
    drawBodies(depthSolid, { shadow: true });

    // a card that has no body is still a silhouette, alpha tested, so it leaves a
    // shape rather than a rectangle — and is skipped entirely once a body exists
    depthSprite.use();
    gl.disable(gl.CULL_FACE);
    gl.uniformMatrix4fv(depthSprite.uniform('uLightVP'), false, lightVP);
    gl.uniform1i(depthSprite.uniform('uTex'), 0);
    bindAttribs(depthSprite, quad, quadLayout);
    for (const slot of slots) {
      if (slot.hidden || slot.body || !slot.texture) continue;
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
      gl.uniformMatrix3fv(surface.uniform('uNrmMat'), false, normalMatrix(item.model));
      gl.uniform3fv(surface.uniform('uAlbedo'), item.color);
      gl.uniform1f(surface.uniform('uRough'), item.rough);
      gl.uniform1f(surface.uniform('uPattern'), item.pattern);
      gl.uniform1f(surface.uniform('uGlow'), item.glow || 0);
      gl.drawArrays(gl.TRIANGLES, 0, 36);
    }

    // The cast is lit by the same program as the room, which is what keeps a face
    // and a wall in the same light: same sun, same window fill, same shadow map.
    gl.uniform1f(surface.uniform('uGlow'), 0);
    gl.uniform3fv(surface.uniform('uTint'), ZERO);
    drawBodies(surface);
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
    // The room's own albedos are dark, so its exposure is set for them. A
    // figure's albedo is a face: at the room's stop a pale skin tone arrives at
    // three times the light it needs and clips to white, so the billboards are
    // stopped down instead.
    gl.uniform1f(billboard.uniform('uExposure'), light.exposure * BILLBOARD_STOP);
    gl.uniform1i(billboard.uniform('uTex'), 0);
    gl.uniform1i(billboard.uniform('uShadow'), 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, shadow.texture);
    bindAttribs(billboard, quad, quadLayout);

    for (const slot of slots) {
      // a body was drawn in the surface pass; the player's card is never drawn
      if (slot.hidden || slot.shadowOnly || slot.body || !slot.texture) continue;
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

    // First person: no pointer parallax — the pointer *is* the view now, and the
    // only thing that moves the eye besides the feet is a whole 4 cm step.
    camera = cameraForEye(playerWorld, {
      yaw: lens.yaw,
      pitch: lens.pitch,
      eye: eyeHeight,
      aspect: width / Math.max(1, height),
      bob: bobY,
    });
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
      canvas.dataset.yaw = lens.yaw.toFixed(3);
      canvas.dataset.pitch = lens.pitch.toFixed(3);
      canvas.dataset.eye = eyeHeight.toFixed(2);
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

  /* ---------- input: drag or pointer lock turns the head, a click walks ------- */

  const LOOK = 0.0026; // radians per pixel of mouse travel
  const DRAG_LOOK = 0.0034; // a drag has no pointer lock, so it needs a longer arm
  let dragging = false;
  let dragged = false;
  let downX = 0;
  let downY = 0;
  let lastX = 0;
  let lastY = 0;

  function look(dx, dy, rate) {
    if (!onLook) return;
    onLook(-dx * rate, -dy * rate);
  }

  function pointOf(event) {
    const box = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    if (!box || !box.width || !box.height) return null;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
    };
  }

  /** Is the pointer already captured by this canvas? */
  function locked() {
    return typeof host.pointerLockElement !== 'undefined' && host.pointerLockElement === canvas;
  }

  function capture() {
    if (!canvas.requestPointerLock || locked()) return;
    try {
      canvas.requestPointerLock();
    } catch (error) {
      /* a browser that refuses the lock is still playable by dragging */
    }
  }

  function onPointerDown(event) {
    dragging = true;
    dragged = false;
    downX = lastX = event.clientX || 0;
    downY = lastY = event.clientY || 0;
  }

  function onPointerMove(event) {
    const point = pointOf(event);
    if (point) {
      pointer.x = point.x;
      pointer.y = point.y;
      pointer.active = true;
    }
    // Locked: every move is a look, and there is no cursor to pick with.
    if (locked()) {
      look(event.movementX || 0, event.movementY || 0, LOOK);
      return;
    }
    if (!dragging) return;
    const x = event.clientX || 0;
    const y = event.clientY || 0;
    if (!dragged && Math.hypot(x - downX, y - downY) > 3) dragged = true;
    if (!dragged) return;
    look(x - lastX, y - lastY, DRAG_LOOK);
    lastX = x;
    lastY = y;
  }

  function onPointerOut() {
    pointer.active = false;
  }

  function onPointerUp(event) {
    const wasDrag = dragged;
    dragging = false;
    dragged = false;
    if (wasDrag || locked()) return; // a drag looked, it did not pick
    choose(event);
  }

  /**
   * A click without a drag: a prop in the crosshair is walked up to, a spot on
   * the floor is walked to, and the empty air behind both asks for the mouse.
   */
  function choose(event) {
    const point = pointOf(event);
    if (!point) return;
    const hit = floorHit(camera, point.x, point.y);
    if (!hit) {
      capture();
      return;
    }
    const prop = propAt(plan.props, hit);
    if (prop) {
      if (onProp) onProp(prop.id);
      return;
    }
    const tile = worldToGrid(room, hit[0], hit[2]);
    if (tile.tx < 0 || tile.ty < 0 || tile.tx >= size.w || tile.ty >= size.h) return;
    if (onTile) onTile(tile);
  }

  /** Double click captures the mouse: free look without holding a button. */
  function onDoubleClick(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    capture();
  }

  if (typeof canvas.addEventListener === 'function') {
    canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
    canvas.addEventListener('pointermove', onPointerMove, { passive: true });
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerOut);
    canvas.addEventListener('pointerleave', onPointerOut);
    canvas.addEventListener('dblclick', onDoubleClick);
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
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerOut);
      canvas.removeEventListener('pointerleave', onPointerOut);
      canvas.removeEventListener('dblclick', onDoubleClick);
    }
    if (typeof host.exitPointerLock === 'function' && locked()) host.exitPointerLock();
    if (view && typeof view.removeEventListener === 'function') view.removeEventListener('resize', resize);
    for (const slot of slots) if (slot.texture) gl.deleteTexture(slot.texture);
    for (const sheet of playerSheets.values()) {
      if (sheet.texture !== (playerSlot && playerSlot.texture)) gl.deleteTexture(sheet.texture);
    }
    playerSheets.clear();
    if (bodyMeshes) {
      // the box is the room's own cube, deleted below with the rest of the room
      const { box, ...own } = bodyMeshes;
      releaseMeshes(gl, own);
    }
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
    firstPerson: true,
    hotspots: plan.props.filter((prop) => prop.hotspot).map((prop) => prop.id),
    get frames() {
      return frames;
    },
    /** Where the lens is pointing, for probes and for anything that needs to know. */
    get look() {
      return { yaw: lens.yaw, pitch: lens.pitch, eye: eyeHeight };
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
