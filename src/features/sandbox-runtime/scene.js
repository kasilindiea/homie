import './scene.css';
import * as THREE from 'three';
import { GLTFLoader } from '../../../sandbox-prototype/house-modeling/viewer/vendor/GLTFLoader.js';
import { OrbitControls } from '../../../sandbox-prototype/house-modeling/viewer/vendor/OrbitControls.js';
import { StateMotion, CameraTravel } from '../../../sandbox-prototype/house-modeling/viewer/interaction-runtime.js';

// Disposal is per mount: GLTF parsing, runtime effects and highlight layers can
// share resources within one scene, so release each resource only once.
function disposeObjects(objects) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), images = new Set(), skeletons = new Set();
  const texture = value => {
    if (!value?.isTexture || textures.has(value)) return;
    textures.add(value);
    const image = value.source?.data ?? value.image;
    for (const source of Array.isArray(image) ? image : [image]) if (source?.close) images.add(source);
  };
  for (const root of objects) root?.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    if (node.skeleton) skeletons.add(node.skeleton);
    if (node.shadow) node.shadow.dispose();
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      Object.values(material).forEach(texture);
      if (material.uniforms) Object.values(material.uniforms).forEach(uniform => texture(uniform.value));
    }
  });
  geometries.forEach(resource => resource.dispose());
  materials.forEach(resource => resource.dispose());
  textures.forEach(resource => resource.dispose());
  skeletons.forEach(resource => resource.dispose());
  images.forEach(source => source.close());
}

/** One cancellable scene lifetime. This module never writes furniture or sends commands. */
export async function createHomeScene(host, { map, modelUrl, templateId }, onSelect, options = {}) {
  if (options.signal?.aborted) throw new DOMException('Scene mount cancelled', 'AbortError');
  const download = new AbortController();
  const removers = [];
  const tags = [];
  const loadedScenes = [];
  const canvas = document.createElement('canvas');
  canvas.className = 'homie-scene-canvas';
  canvas.setAttribute('aria-label', options.canvasLabel || 'Interactive apartment model');
  let renderer, scene, controls, observer, travel, motion, camera, model;
  let destroyed = false, ready = false, contextLost = false, requestedActive = true, pageVisible = true;
  let frameId = null, previous = 0, renderedFrames = 0;
  let selected = null, planIds = [], labelMode = 'all', interacted = false, first = true;
  const names = {}, roots = {}, outlines = [];
  let selectionLayer, planLayer, down = null, lastPick = null;
  const listen = (target, name, callback, settings) => {
    target.addEventListener(name, callback, settings);
    removers.push(() => target.removeEventListener(name, callback, settings));
  };
  const active = () => ready && !destroyed && !contextLost && requestedActive && pageVisible && !document.hidden;
  const stopFrames = () => { if (frameId !== null) cancelAnimationFrame(frameId); frameId = null; };
  function destroy() {
    if (destroyed) return;
    destroyed = true; ready = false;
    download.abort(); stopFrames();
    removers.splice(0).forEach(remove => remove());
    observer?.disconnect(); travel?.cancel(); controls?.dispose();
    tags.splice(0).forEach(tag => tag.button.remove());
    disposeObjects(scene ? [scene, ...loadedScenes] : loadedScenes);
    scene?.clear(); loadedScenes.length = 0; outlines.length = 0;
    renderer?.renderLists.dispose(); renderer?.dispose(); renderer?.forceContextLoss();
    canvas.remove(); host.classList.remove('homie-scene-host');
  }
  listen(options.signal ?? download.signal, 'abort', destroy, { once: true });
  if (options.signal?.aborted) { destroy(); throw new DOMException('Scene mount cancelled', 'AbortError'); }

  const world = name => {
    if (!names[name]) throw new Error('Model mapping is missing node: ' + name);
    return names[name].getWorldPosition(new THREE.Vector3());
  };
  const clear = group => {
    disposeObjects([group]);
    group.clear();
  };
  function outline(id) {
    clear(selectionLayer); outlines.length = 0;
    if (!id) return;
    const meta = map.objects.find(item => item.shared_id === id);
    const root = meta?.object_type === 'room' ? names[id + '__floor'] : roots[id];
    root?.traverse(object => {
      if (!object.isMesh || object.userData.runtimeEffect) return;
      const line = new THREE.LineSegments(new THREE.EdgesGeometry(object.geometry, 36), new THREE.LineBasicMaterial({ color: 0x327a70, depthTest: false, transparent: true, opacity: .8 }));
      line.matrixAutoUpdate = false; line.matrix.copy(object.matrixWorld);
      selectionLayer.add(line); outlines.push([line, object]);
    });
  }
  function focus(id) {
    if (destroyed) return;
    const meta = map.objects.find(item => item.shared_id === id && item.spatial);
    if (!meta) throw new Error('This object has no model location');
    selected = id; interacted = true;
    const target = world(meta.focus_name);
    travel.go(target.clone().add(new THREE.Vector3(...meta.camera_offset_gltf_m)), target);
    outline(id); motion.setSelected(id); onSelect(id);
  }
  function fit(immediate, notify) {
    if (destroyed) return;
    selected = null; interacted = false;
    const target = world(map.home_camera.target_node), box = new THREE.Box3().setFromObject(model);
    const direction = new THREE.Vector3(...map.home_camera.camera_offset_gltf_m).normalize();
    const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right);
    const verticalTangent = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const horizontalTangent = verticalTangent * camera.aspect;
    let distance = 0;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const corner = new THREE.Vector3(x, y, z).sub(target);
      const screenDepth = Math.max(Math.abs(corner.dot(right)) / horizontalTangent, Math.abs(corner.dot(up)) / verticalTangent);
      distance = Math.max(distance, corner.dot(direction) + screenDepth);
    }
    travel.go(target.clone().addScaledVector(direction, distance * 1.10), target, immediate);
    outline(null); motion.setSelected(null);
    if (notify) onSelect(null);
  }
  function preview(ids) {
    if (destroyed || JSON.stringify(ids) === JSON.stringify(planIds)) return;
    planIds = [...ids]; clear(planLayer);
    for (const id of ids) {
      const meta = map.objects.find(item => item.shared_id === id && item.spatial);
      if (!meta) continue;
      const anchor = world(meta.anchor_name), points = [];
      for (let i = 0; i <= 64; i++) {
        const angle = i / 64 * Math.PI * 2;
        points.push(new THREE.Vector3(anchor.x + .42 * Math.cos(angle), anchor.y, anchor.z + .42 * Math.sin(angle)));
      }
      const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineDashedMaterial({ color: 0xb67b36, dashSize: .09, gapSize: .055, depthTest: false }));
      ring.computeLineDistances(); planLayer.add(ring);
    }
  }
  function apply(objects) {
    if (destroyed) return;
    motion.applySnapshot({ objects }, { immediate: first }); first = false;
    for (const { meta, button, status } of tags) {
      const record = objects[meta.shared_id];
      const state = record?.state ?? record?.cycle_state ?? record?.door_state ?? record?.cover_state ?? 'unknown';
      button.classList.toggle('is-unknown', state === 'unknown');
      status.textContent = options.stateLabel?.(meta.shared_id, state) ?? state;
    }
  }
  function positionLabels() {
    const placed = [], width = host.clientWidth, height = host.clientHeight;
    const margin = 8, gap = 7;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const overlaps = (a, b) => a.x < b.x + b.width + gap && a.x + a.width + gap > b.x
      && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
    for (const { meta, button } of [...tags].sort((a, b) => Number(b.meta.shared_id === selected) - Number(a.meta.shared_id === selected))) {
      const point = world(meta.anchor_name).project(camera);
      const visible = point.z >= -1 && point.z <= 1 && Math.abs(point.x) < .95 && Math.abs(point.y) < .94;
      button.hidden = !visible || labelMode === 'hidden' || (labelMode === 'clean' && meta.shared_id !== selected);
      if (button.hidden) continue;
      // Actual dimensions matter: English labels can occupy more lines than
      // Chinese. Absolute top-left rectangles also avoid the old bottom-anchor
      // adjustment pushing two labels back onto each other at the viewport edge.
      const labelWidth = button.offsetWidth, labelHeight = button.offsetHeight;
      const preferred = {
        x: clamp((point.x + 1) * width / 2 - labelWidth / 2, margin, width - margin - labelWidth),
        y: clamp((1 - point.y) * height / 2 - labelHeight, margin, height - margin - labelHeight),
        width: labelWidth, height: labelHeight,
      };
      const xPositions = [preferred.x, margin, width - margin - labelWidth];
      const yPositions = [preferred.y, margin, height - margin - labelHeight];
      for (const other of placed) {
        xPositions.push(other.x - gap - labelWidth, other.x + other.width + gap);
        yPositions.push(other.y - gap - labelHeight, other.y + other.height + gap);
      }
      let best = null, bestDistance = Infinity;
      for (const x of xPositions) for (const y of yPositions) {
        const candidate = {
          ...preferred,
          x: clamp(x, margin, width - margin - labelWidth),
          y: clamp(y, margin, height - margin - labelHeight),
        };
        if (placed.some(other => overlaps(candidate, other))) continue;
        const distance = (candidate.x - preferred.x) ** 2 + (candidate.y - preferred.y) ** 2;
        if (distance < bestDistance) { bestDistance = distance; best = candidate; }
      }
      // In a very small viewport the list remains the accessible alternative.
      // Never cover an already placed label, especially the selected object.
      if (!best) { button.hidden = true; continue; }
      button.style.left = best.x + 'px'; button.style.top = best.y + 'px';
      button.classList.toggle('is-selected', meta.shared_id === selected);
      placed.push(best);
    }
  }
  function resize() {
    if (destroyed || !host.clientWidth || !host.clientHeight) return;
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix();
    if (!interacted) fit(true, false);
  }
  function frame(now) {
    frameId = null;
    if (!active()) return;
    frameId = requestAnimationFrame(frame);
    if (now - previous < 1000 / 30) return;
    const dt = Math.min(.1, (now - previous) / 1000); previous = now;
    travel.tick(dt); controls.update(); motion.tick(dt, now / 1000);
    for (const [line, source] of outlines) line.matrix.copy(source.matrixWorld);
    positionLabels(); renderer.render(scene, camera); renderedFrames++;
  }
  function updateActivity() {
    if (controls) controls.enabled = active() && !travel?.travel;
    if (!active()) { stopFrames(); return; }
    if (frameId === null) { previous = performance.now() - 1000 / 30; frameId = requestAnimationFrame(frame); }
  }

  try {
    host.classList.add('homie-scene-host'); host.prepend(canvas);
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.25));
    renderer.setClearColor(0xe9ece6); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    listen(canvas, 'webglcontextlost', event => {
      event.preventDefault(); contextLost = true; destroy(); options.onContextLost?.();
    });
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(map.home_camera.vertical_fov_degrees, 1, .05, 200);
    controls = new OrbitControls(camera, canvas);
    Object.assign(controls, { enableDamping: true, enablePan: true, zoomToCursor: true, zoomSpeed: 1.1, minDistance: .65, maxDistance: 90 });
    const [minPolar, maxPolar] = map.home_camera.polar_angle_limits_degrees;
    controls.minPolarAngle = THREE.MathUtils.degToRad(minPolar);
    controls.maxPolarAngle = THREE.MathUtils.degToRad(maxPolar);
    travel = new CameraTravel(camera, controls);
    scene.add(new THREE.HemisphereLight(0xf6f8ed, 0x879387, 2));
    for (const [position, intensity] of [[[-3, 12, 6], 3], [[8, 8, -3], 1.1], [[3, 6, 15], .7]]) {
      const light = new THREE.DirectionalLight(0xfff7e9, intensity); light.position.set(...position); scene.add(light);
      if (intensity === 3) {
        light.castShadow = true; light.shadow.mapSize.set(1024, 1024);
        Object.assign(light.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 });
        light.shadow.bias = -.0002; light.shadow.normalBias = .025;
      }
    }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: .12 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -.37; ground.receiveShadow = true; scene.add(ground);
    // fetch supports cancellation. GLTF parsing does not, so a late parse result
    // is released before it can append hotspots, listeners or an animation loop.
    const response = await fetch(modelUrl, { signal: download.signal });
    if (!response.ok) throw new Error('Model could not be loaded');
    const binary = await response.arrayBuffer();
    if (destroyed) throw new DOMException('Scene mount cancelled', 'AbortError');
    const parsed = await new GLTFLoader().parseAsync(binary, new URL('.', new URL(modelUrl, document.baseURI)).href);
    if (destroyed) {
      disposeObjects(parsed.scenes ?? [parsed.scene]);
      throw new DOMException('Scene mount cancelled', 'AbortError');
    }
    loadedScenes.push(...(parsed.scenes ?? [parsed.scene])); model = parsed.scene; scene.add(model);
    model.traverse(object => {
      names[object.name] = object;
      if (object.userData.shared_id) roots[object.userData.shared_id] = object;
      if (object.isMesh) {
        object.castShadow = !(Array.isArray(object.material) ? object.material.some(material => material.transparent) : object.material.transparent);
        object.receiveShadow = true;
      }
    });
    model.updateMatrixWorld(true);
    for (const item of map.objects.filter(object => object.spatial)) { world(item.anchor_name); world(item.focus_name); }
    const lights = {};
    for (const { shared_id: id } of map.objects) {
      const origin = id + '__light_origin';
      if (!names[origin]) continue;
      const lamp = new THREE.PointLight(0xffdca5, 0, 4, 2);
      lamp.position.copy(world(origin)); scene.add(lamp); lights[id] = lamp;
    }
    motion = new StateMotion({ model, names, roots, lights, templateId });
    selectionLayer = new THREE.Group(); planLayer = new THREE.Group(); scene.add(selectionLayer, planLayer);
    for (const meta of map.objects.filter(object => object.spatial && object.object_type !== 'room')) {
      const button = document.createElement('button'); button.type = 'button';
      button.className = 'homie-scene-hotspot'; button.dataset.objectId = meta.shared_id;
      const title = document.createElement('strong'), status = document.createElement('span');
      title.textContent = options.labels?.[meta.shared_id] ?? meta.display_name ?? meta.shared_id;
      button.append(title, status); host.append(button);
      listen(button, 'click', () => focus(meta.shared_id)); tags.push({ meta, button, status });
    }
    const owner = object => {
      while (object && !object.userData.shared_id) object = object.parent;
      return object?.userData.shared_id;
    };
    const ray = new THREE.Raycaster();
    listen(canvas, 'pointerdown', event => { travel.cancel(); down = [event.clientX, event.clientY]; });
    listen(canvas, 'pointercancel', () => { down = null; });
    listen(canvas, 'pointerup', event => {
      const origin = down; down = null;
      if (event.button !== 0 || !origin || Math.hypot(event.clientX - origin[0], event.clientY - origin[1]) > 5 || !active()) return;
      const bounds = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2), camera);
      const hit = ray.intersectObject(model, true).find(item => !item.object.userData.runtimeEffect);
      const id = hit && owner(hit.object);
      if (id && map.objects.some(item => item.shared_id === id && item.spatial)) { lastPick = 'mesh'; focus(id); }
    });
    const onStart = () => { interacted = true; };
    controls.addEventListener('start', onStart); removers.push(() => controls.removeEventListener('start', onStart));
    listen(document, 'visibilitychange', updateActivity);
    listen(window, 'pagehide', () => { pageVisible = false; updateActivity(); });
    listen(window, 'pageshow', () => { pageVisible = true; updateActivity(); });
    observer = new ResizeObserver(resize); observer.observe(host); resize();
    ready = true; updateActivity();
    return {
      focus, reset: (immediate = false) => fit(immediate, true), preview, apply,
      setLabels: value => { if (!destroyed && ['all', 'clean', 'hidden'].includes(value)) labelMode = value; },
      setActive: value => { requestedActive = Boolean(value); updateActivity(); },
      inspect: () => ({ selected, planIds: [...planIds], lastPick, animation: motion.snapshot(), camera: camera.position.toArray(), target: controls.target.toArray(), emissive: names.living_room_light__emitter?.material?.emissiveIntensity ?? 0, active: active(), destroyed, renderedFrames }),
      destroy,
    };
  } catch (error) { destroy(); throw error; }
}
