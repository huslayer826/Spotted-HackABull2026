import * as THREE from "https://esm.sh/three@0.177.0";
import { OrbitControls } from "https://esm.sh/three@0.177.0/examples/jsm/controls/OrbitControls.js";

const STEP_SECONDS = 0.5;
const COLORS = ["#ff7a1a", "#2f80ed", "#39a852", "#d08b33", "#8d5b9f", "#3f8f89"];
const STORAGE_KEY = "spotter-movement-annotator-v3-trimmed";
const DEFAULT_VIDEO = "cctv_gemini_anchor_full_04m00s_to_13m20s.mp4";
const LEGACY_STORAGE_KEYS = ["spotter-movement-annotator-v1", "spotter-movement-annotator-v2"];

const state = {
  people: [
    { id: "p1", name: "P1", color: COLORS[0] },
    { id: "p2", name: "P2", color: COLORS[1] },
    { id: "p3", name: "P3", color: COLORS[2] },
    { id: "p4", name: "P4", color: COLORS[3] },
  ],
  activeId: "p1",
  samples: new Map(),
  duration: 0,
  currentTime: 0,
  playing: false,
  videoName: DEFAULT_VIDEO,
  playTimer: null,
};

const els = {
  videoFrame: document.querySelector("#videoFrame"),
  videoInput: document.querySelector("#videoInput"),
  jsonInput: document.querySelector("#jsonInput"),
  videoName: document.querySelector("#videoName"),
  canvas: document.querySelector("#lidarCanvas"),
  peopleList: document.querySelector("#peopleList"),
  addPerson: document.querySelector("#addPerson"),
  timeSlider: document.querySelector("#timeSlider"),
  timecode: document.querySelector("#timecode"),
  prevFrame: document.querySelector("#prevFrame"),
  nextFrame: document.querySelector("#nextFrame"),
  playPause: document.querySelector("#playPause"),
  loadSample: document.querySelector("#loadSample"),
  exportCsv: document.querySelector("#exportCsv"),
  exportJson: document.querySelector("#exportJson"),
  sampleCount: document.querySelector("#sampleCount"),
  activePerson: document.querySelector("#activePerson"),
};

const colors = {
  background: "#d7d3c9",
  line: "#5e625d",
  ghost: "#bfc0b9",
  glass: "#d9791c",
  floor: "#c9c7be",
  fixture: "#7b8b62",
  basket: "#a7a59c",
  product: "#6f8557",
};

const sceneState = {
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  floorHit: null,
  annotationRoot: new THREE.Group(),
  raycaster: new THREE.Raycaster(),
  pointer: new THREE.Vector2(),
};

function makeMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
}

function addEdges(mesh, color = colors.line) {
  const edges = new THREE.EdgesGeometry(mesh.geometry, 20);
  const lines = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }),
  );
  lines.position.copy(mesh.position);
  lines.rotation.copy(mesh.rotation);
  lines.scale.copy(mesh.scale);
  return lines;
}

function box({ w, h, d, x, y, z, material = makeMaterial(colors.ghost, 0.2), edges = true }) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  const group = new THREE.Group();
  group.add(mesh);
  if (edges) group.add(addEdges(mesh));
  return group;
}

function cylinder({ radius, height, x, y, z, material }) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 18), material);
  mesh.position.set(x, y, z);
  const group = new THREE.Group();
  group.add(mesh);
  group.add(addEdges(mesh));
  return group;
}

function freezerWallCurve(index) {
  const curve = Math.max(0, index - 3) / 4;
  return {
    x: -4.05 + index * 1.15,
    wallZ: 4.08 - curve * 0.76,
    freezerZ: 3.7 - curve * 0.76,
    rotation: -curve * 0.23,
  };
}

function freezerCase({ x, z, rotation = 0, materials }) {
  const freezer = new THREE.Group();
  freezer.position.set(x, 0, z);
  freezer.rotation.y = rotation;
  freezer.add(box({ w: 0.96, h: 1.72, d: 0.42, x: 0, y: 0.86, z: 0, material: materials.fridge }));
  freezer.add(box({ w: 0.98, h: 0.18, d: 0.46, x: 0, y: 1.83, z: 0, material: materials.fixture }));
  freezer.add(box({ w: 0.98, h: 0.2, d: 0.5, x: 0, y: 0.1, z: 0, material: materials.fixture }));
  freezer.add(box({ w: 0.82, h: 1.24, d: 0.035, x: 0, y: 0.92, z: -0.22, material: materials.freezerGlass }));
  return freezer;
}

function lowBasketRack({ x, z, materials }) {
  const rack = new THREE.Group();
  rack.add(box({ w: 1.05, h: 0.12, d: 0.52, x, y: 0.08, z, material: materials.basket }));
  rack.add(box({ w: 1.05, h: 0.08, d: 0.48, x, y: 0.38, z: z - 0.04, material: materials.basket }));
  rack.add(box({ w: 1.05, h: 0.08, d: 0.42, x, y: 0.68, z: z - 0.08, material: materials.basket }));
  rack.add(box({ w: 1.05, h: 0.08, d: 0.36, x, y: 0.96, z: z - 0.12, material: materials.basket }));
  return rack;
}

function sideBasketRack({ x, z, faceDirection, materials }) {
  const rack = new THREE.Group();
  rack.add(box({ w: 0.5, h: 0.14, d: 1.08, x, y: 0.11, z, material: materials.basket }));
  rack.add(box({ w: 0.44, h: 0.08, d: 1.02, x: x + faceDirection * 0.05, y: 0.52, z, material: materials.basket }));
  rack.add(box({ w: 0.38, h: 0.08, d: 0.96, x: x + faceDirection * 0.09, y: 0.92, z, material: materials.basket }));
  rack.add(box({ w: 0.32, h: 0.08, d: 0.9, x: x + faceDirection * 0.13, y: 1.28, z, material: materials.basket }));
  return rack;
}

function centerBasketRack({ x, z, materials }) {
  const rack = new THREE.Group();
  rack.add(box({ w: 2.16, h: 0.14, d: 0.56, x, y: 0.1, z, material: materials.basket }));
  rack.add(box({ w: 2.08, h: 0.08, d: 0.5, x, y: 0.5, z, material: materials.basket }));
  rack.add(box({ w: 1.96, h: 0.08, d: 0.44, x, y: 0.9, z, material: materials.basket }));
  rack.add(box({ w: 1.84, h: 0.08, d: 0.38, x, y: 1.26, z, material: materials.basket }));
  return rack;
}

function buildLidarScene() {
  const canvas = els.canvas;
  sceneState.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  sceneState.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  sceneState.renderer.outputColorSpace = THREE.SRGBColorSpace;

  sceneState.scene = new THREE.Scene();
  sceneState.scene.background = new THREE.Color(colors.background);
  sceneState.scene.fog = new THREE.Fog(colors.background, 22, 46);

  sceneState.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  sceneState.camera.position.set(8.8, 7.6, 10.2);

  sceneState.controls = new OrbitControls(sceneState.camera, canvas);
  sceneState.controls.enableDamping = true;
  sceneState.controls.target.set(0, 1.7, 0);
  sceneState.controls.minDistance = 6;
  sceneState.controls.maxDistance = 23;
  sceneState.controls.maxPolarAngle = Math.PI * 0.48;

  sceneState.scene.add(new THREE.HemisphereLight("#fffaf0", "#9c9a91", 2.35));
  const mainLight = new THREE.DirectionalLight("#fff8e8", 2);
  mainLight.position.set(6, 9, 7);
  sceneState.scene.add(mainLight);

  const materials = {
    ghost: makeMaterial(colors.ghost, 0.2),
    fixture: makeMaterial(colors.fixture, 0.26),
    fridge: makeMaterial(colors.glass, 0.16),
    freezerGlass: makeMaterial("#e58b22", 0.2),
    basket: makeMaterial(colors.basket, 0.3),
  };

  const root = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(10.4, 8.4),
    new THREE.MeshBasicMaterial({ color: colors.floor, transparent: true, opacity: 0.52, side: THREE.DoubleSide }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  root.add(floor);

  sceneState.floorHit = new THREE.Mesh(
    new THREE.PlaneGeometry(10.4, 8.4),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  sceneState.floorHit.rotation.x = -Math.PI / 2;
  sceneState.floorHit.position.y = 0.04;
  sceneState.scene.add(sceneState.floorHit);

  const floorGrid = new THREE.GridHelper(10.4, 26, "#9b9990", "#9b9990");
  floorGrid.position.y = 0.01;
  floorGrid.material.transparent = true;
  floorGrid.material.opacity = 0.42;
  root.add(floorGrid);

  root.add(box({ w: 0.16, h: 3.1, d: 8.2, x: -5.1, y: 1.55, z: 0, material: materials.ghost }));
  root.add(box({ w: 0.16, h: 3.1, d: 8.2, x: 5.1, y: 1.55, z: 0, material: materials.ghost }));
  root.add(box({ w: 1.25, h: 3.1, d: 0.16, x: -4.45, y: 1.55, z: -4.1, material: materials.ghost }));
  root.add(box({ w: 6.9, h: 3.1, d: 0.16, x: 1.65, y: 1.55, z: -4.1, material: materials.ghost }));
  root.add(box({ w: 0.16, h: 3.1, d: 1.15, x: -3.9, y: 1.55, z: -3.45, material: materials.ghost }));
  root.add(box({ w: 1.2, h: 1.05, d: 0.42, x: -4.35, y: 0.53, z: 3.55, material: materials.fixture }));
  root.add(cylinder({ radius: 0.17, height: 2.6, x: 0.15, y: 1.3, z: -1.25, material: materials.fixture }));

  for (let i = 0; i < 8; i += 1) {
    const segment = freezerWallCurve(i);
    root.add(freezerCase({ x: segment.x, z: segment.freezerZ, rotation: segment.rotation, materials }));
  }

  [-2.05, -0.85, 0.35].forEach((z) => {
    root.add(sideBasketRack({ x: 4.55, z, faceDirection: -1, materials }));
    root.add(sideBasketRack({ x: -4.55, z, faceDirection: 1, materials }));
  });
  for (let i = 0; i < 5; i += 1) root.add(lowBasketRack({ x: -0.1 + i * 1.2, z: -3.55, materials }));
  root.add(centerBasketRack({ x: 0.2, z: 0.2, materials }));
  sceneState.scene.add(root);
  sceneState.scene.add(sceneState.annotationRoot);

  canvas.addEventListener("pointerdown", handleScenePointer);
  window.addEventListener("resize", resizeScene);
  resizeScene();
  animateScene();
}

function resizeScene() {
  const rect = els.canvas.getBoundingClientRect();
  sceneState.renderer.setSize(rect.width, rect.height, false);
  sceneState.camera.aspect = rect.width / Math.max(rect.height, 1);
  sceneState.camera.updateProjectionMatrix();
}

function animateScene() {
  requestAnimationFrame(animateScene);
  sceneState.controls.update();
  sceneState.renderer.render(sceneState.scene, sceneState.camera);
}

function handleScenePointer(event) {
  if (event.button !== 0) return;
  const rect = els.canvas.getBoundingClientRect();
  sceneState.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  sceneState.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  sceneState.raycaster.setFromCamera(sceneState.pointer, sceneState.camera);
  const hit = sceneState.raycaster.intersectObject(sceneState.floorHit, false)[0];
  if (!hit) return;
  addSample({ x: hit.point.x, z: hit.point.z });
}

async function loadVideoMeta(name = state.videoName) {
  state.videoName = name;
  els.videoName.textContent = name;
  const response = await fetch(`/video_meta?name=${encodeURIComponent(name)}`, { cache: "no-store" });
  const meta = await response.json();
  state.duration = meta.duration || 0;
  els.timeSlider.max = String(Math.max(0, Math.floor(state.duration / STEP_SECONDS) * STEP_SECONDS));
  renderFrame();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    people: state.people,
    activeId: state.activeId,
    samples: [...state.samples.values()],
  }));
}

function restoreState() {
  LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const payload = JSON.parse(raw);
    if (Array.isArray(payload.people) && payload.people.length) state.people = payload.people;
    if (payload.activeId) state.activeId = payload.activeId;
    if (Array.isArray(payload.samples)) {
      state.samples = new Map(payload.samples.map((sample) => [`${Number(sample.time_sec).toFixed(1)}:${sample.person_id}`, sample]));
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function loadAnnotationPayload(payload) {
  if (Array.isArray(payload.people) && payload.people.length) {
    state.people = payload.people.map((person, index) => ({
      id: person.id || `p${index + 1}`,
      name: person.name || person.person_name || `P${index + 1}`,
      color: person.color || COLORS[index % COLORS.length],
    }));
  }
  if (Array.isArray(payload.samples)) {
    state.samples = new Map(
      payload.samples.map((sample) => [
        `${Number(sample.time_sec).toFixed(1)}:${sample.person_id}`,
        {
          time_sec: Number(sample.time_sec),
          person_id: sample.person_id,
          x: Number(sample.x),
          z: Number(sample.z),
        },
      ]),
    );
  }
  state.activeId = state.people[0]?.id || "p1";
  saveState();
  render();
}

async function importJsonFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  loadAnnotationPayload(JSON.parse(await file.text()));
}

async function loadSampleAnnotations() {
  const response = await fetch("/sample_annotations.json", { cache: "no-store" });
  const payload = await response.json();
  loadAnnotationPayload(payload);
  const firstTime = Math.min(...payload.samples.map((sample) => Number(sample.time_sec)));
  seekBoth(Number.isFinite(firstTime) ? firstTime : 0);
}

function snapTime(value) {
  return Math.max(0, Math.round(value / STEP_SECONDS) * STEP_SECONDS);
}

function timeKey(value = state.currentTime || 0) {
  return snapTime(value).toFixed(1);
}

function sampleKey(personId, time = timeKey()) {
  return `${time}:${personId}`;
}

function currentTime() {
  return Number(timeKey());
}

async function setVideoFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  await loadVideoMeta(file.name);
}

function seekBoth(time) {
  const snapped = snapTime(time);
  state.currentTime = Math.min(snapped, state.duration || snapped);
  els.timeSlider.value = String(snapped);
  renderFrame();
  render();
}

function setPlaying(shouldPlay) {
  state.playing = shouldPlay;
  if (state.playTimer) {
    window.clearInterval(state.playTimer);
    state.playTimer = null;
  }
  if (shouldPlay) {
    state.playTimer = window.setInterval(() => {
      if (state.currentTime >= state.duration) {
        setPlaying(false);
        return;
      }
      seekBoth(state.currentTime + STEP_SECONDS);
    }, STEP_SECONDS * 1000);
  }
  els.playPause.textContent = shouldPlay ? "Pause" : "Play";
}

function renderFrame() {
  els.videoFrame.src = `/video_frame?name=${encodeURIComponent(state.videoName)}&t=${currentTime().toFixed(1)}&cache=${Date.now()}`;
}

function addSample(point) {
  state.samples.set(sampleKey(state.activeId), {
    time_sec: currentTime(),
    person_id: state.activeId,
    x: Number(point.x.toFixed(4)),
    z: Number(point.z.toFixed(4)),
  });
  saveState();
  render();
}

function sortedSamplesFor(personId) {
  return [...state.samples.values()].filter((sample) => sample.person_id === personId).sort((a, b) => a.time_sec - b.time_sec);
}

function interpolatedSamples(time) {
  const visible = [];
  for (const person of state.people) {
    const points = sortedSamplesFor(person.id);
    const exact = points.find((point) => point.time_sec === time);
    if (exact) {
      visible.push({ ...exact, person });
      continue;
    }
    const before = [...points].reverse().find((point) => point.time_sec < time);
    const after = points.find((point) => point.time_sec > time);
    if (!before || !after) continue;
    const mix = (time - before.time_sec) / (after.time_sec - before.time_sec);
    visible.push({
      time_sec: time,
      person_id: person.id,
      x: before.x + (after.x - before.x) * mix,
      z: before.z + (after.z - before.z) * mix,
      person,
    });
  }
  return visible;
}

function renderPeopleList() {
  els.peopleList.replaceChildren();
  for (const person of state.people) {
    const row = document.createElement("button");
    row.className = `person-row${person.id === state.activeId ? " active" : ""}`;
    row.type = "button";
    row.addEventListener("click", () => {
      state.activeId = person.id;
      saveState();
      render();
    });

    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = person.color;

    const input = document.createElement("input");
    input.value = person.name;
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("input", () => {
      person.name = input.value;
      saveState();
      renderSceneAnnotations();
      updateStats();
    });

    const count = document.createElement("code");
    count.textContent = String(sortedSamplesFor(person.id).length);
    row.append(swatch, input, count);
    els.peopleList.append(row);
  }
}

function renderSceneAnnotations() {
  sceneState.annotationRoot.clear();
  const time = currentTime();
  for (const person of state.people) {
    const points = sortedSamplesFor(person.id);
    if (points.length > 1) {
      const geometry = new THREE.BufferGeometry().setFromPoints(points.map((point) => new THREE.Vector3(point.x, 0.07, point.z)));
      sceneState.annotationRoot.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: person.color, transparent: true, opacity: 0.35 })));
    }
  }
  for (const point of interpolatedSamples(time)) {
    const person = point.person;
    const group = new THREE.Group();
    group.position.set(point.x, 0, point.z);
    const active = person.id === state.activeId;
    group.add(new THREE.Mesh(new THREE.SphereGeometry(active ? 0.23 : 0.18, 32, 20), new THREE.MeshBasicMaterial({ color: person.color })));
    group.children[0].position.y = 0.2;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(active ? 0.3 : 0.24, active ? 0.44 : 0.36, 40),
      new THREE.MeshBasicMaterial({ color: person.color, transparent: true, opacity: active ? 0.68 : 0.48, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    group.add(ring);
    sceneState.annotationRoot.add(group);
  }
}

function updateStats() {
  els.timecode.textContent = `${currentTime().toFixed(1)}s`;
  els.sampleCount.textContent = String(state.samples.size);
  els.activePerson.textContent = state.people.find((person) => person.id === state.activeId)?.name || state.activeId;
}

function render() {
  renderPeopleList();
  renderSceneAnnotations();
  updateStats();
}

function exportRows() {
  const rows = [...state.samples.values()].sort((a, b) => a.time_sec - b.time_sec || a.person_id.localeCompare(b.person_id));
  const lastByPerson = new Map();
  return rows.map((row) => {
    const previous = lastByPerson.get(row.person_id);
    const dt = previous ? row.time_sec - previous.time_sec : null;
    const dx = previous ? row.x - previous.x : null;
    const dz = previous ? row.z - previous.z : null;
    const speed = dt ? Math.hypot(dx, dz) / dt : null;
    lastByPerson.set(row.person_id, row);
    const person = state.people.find((item) => item.id === row.person_id);
    return {
      ...row,
      person_name: person?.name || row.person_id,
      dx: dx === null ? "" : Number(dx.toFixed(4)),
      dz: dz === null ? "" : Number(dz.toFixed(4)),
      speed_scene_units_per_sec: speed === null ? "" : Number(speed.toFixed(4)),
    };
  });
}

function download(name, type, content) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function exportCsv() {
  const rows = exportRows();
  const headers = ["time_sec", "person_id", "person_name", "x", "z", "dx", "dz", "speed_scene_units_per_sec"];
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((header) => JSON.stringify(row[header] ?? "")).join(","));
  download("spotter_lidar_scene_annotations.csv", "text/csv", lines.join("\n"));
}

function exportJson() {
  download("spotter_lidar_scene_annotations.json", "application/json", JSON.stringify({ step_seconds: STEP_SECONDS, people: state.people, samples: exportRows() }, null, 2));
}

els.videoInput.addEventListener("change", () => setVideoFile(els.videoInput));
els.jsonInput.addEventListener("change", () => importJsonFile(els.jsonInput));
els.loadSample.addEventListener("click", loadSampleAnnotations);
els.addPerson.addEventListener("click", () => {
  const index = state.people.length + 1;
  const id = `p${index}`;
  state.people.push({ id, name: `P${index}`, color: COLORS[(index - 1) % COLORS.length] });
  state.activeId = id;
  saveState();
  render();
});
els.prevFrame.addEventListener("click", () => seekBoth(currentTime() - STEP_SECONDS));
els.nextFrame.addEventListener("click", () => seekBoth(currentTime() + STEP_SECONDS));
els.playPause.addEventListener("click", () => setPlaying(!state.playing));
els.timeSlider.addEventListener("input", () => seekBoth(Number(els.timeSlider.value)));
els.exportCsv.addEventListener("click", exportCsv);
els.exportJson.addEventListener("click", exportJson);

restoreState();
buildLidarScene();
loadVideoMeta();
render();
