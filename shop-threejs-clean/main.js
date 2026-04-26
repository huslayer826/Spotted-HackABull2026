import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const ROOM_WIDTH = 5.2;
const ROOM_DEPTH = 4.2;
const ROOM_HEIGHT = 2.6;

const canvas = document.querySelector("#scene");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#efe4cf");
scene.fog = new THREE.Fog("#efe4cf", 8, 24);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const aspect = window.innerWidth / window.innerHeight;
const frustum = 6.4;
const camera = new THREE.OrthographicCamera(
  (-frustum * aspect) / 2,
  (frustum * aspect) / 2,
  frustum / 2,
  -frustum / 2,
  0.1,
  60
);
camera.position.set(7.5, 6.5, 7.5);
camera.lookAt(0, 1.1, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.set(0, 1.05, 0.15);
controls.enablePan = false;
controls.minZoom = 0.85;
controls.maxZoom = 2.3;
controls.minPolarAngle = Math.PI * 0.2;
controls.maxPolarAngle = Math.PI * 0.48;
controls.rotateSpeed = 0.6;
controls.zoomSpeed = 0.85;

scene.add(new THREE.AmbientLight("#fff8ee", 1.8));

const keyLight = new THREE.DirectionalLight("#fff2da", 2.2);
keyLight.position.set(-6, 10, 8);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -8;
keyLight.shadow.camera.right = 8;
keyLight.shadow.camera.top = 8;
keyLight.shadow.camera.bottom = -8;
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 30;
keyLight.shadow.bias = -0.0002;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight("#dce7ef", 0.75);
fillLight.position.set(6, 8, -6);
scene.add(fillLight);

const root = new THREE.Group();
root.rotation.y = -0.16;
scene.add(root);

const floorTexture = (() => {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#d2b48c";
  ctx.fillRect(0, 0, c.width, c.height);

  for (let y = 0; y < c.height; y += 84) {
    ctx.fillStyle = y % 168 === 0 ? "rgba(105, 70, 38, 0.12)" : "rgba(255, 255, 255, 0.05)";
    ctx.fillRect(0, y, c.width, 2);
  }
  for (let x = 0; x < c.width; x += 220) {
    ctx.fillStyle = "rgba(105, 70, 38, 0.14)";
    ctx.fillRect(x, 0, 2, c.height);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.2, 1.8);
  return tex;
})();

const materials = {
  floor: new THREE.MeshStandardMaterial({
    color: "#d1b088",
    map: floorTexture,
    roughness: 0.95
  }),
  wall: new THREE.MeshStandardMaterial({
    color: "#f3e6cf",
    roughness: 0.96
  }),
  wallAlt: new THREE.MeshStandardMaterial({
    color: "#eadbc2",
    roughness: 0.96
  }),
  ceiling: new THREE.MeshStandardMaterial({
    color: "#faf1e2",
    roughness: 0.92
  }),
  wood: new THREE.MeshStandardMaterial({
    color: "#755034",
    roughness: 0.82
  }),
  woodDark: new THREE.MeshStandardMaterial({
    color: "#4c3321",
    roughness: 0.86
  }),
  woodLight: new THREE.MeshStandardMaterial({
    color: "#9a724c",
    roughness: 0.78
  }),
  fridge: new THREE.MeshStandardMaterial({
    color: "#8aa28f",
    roughness: 0.8
  }),
  checkout: new THREE.MeshStandardMaterial({
    color: "#b86f52",
    roughness: 0.8
  }),
  top: new THREE.MeshStandardMaterial({
    color: "#231b15",
    roughness: 0.7
  }),
  trim: new THREE.MeshStandardMaterial({
    color: "#2e2118",
    roughness: 0.88
  }),
  glass: new THREE.MeshPhysicalMaterial({
    color: "#d8ebe8",
    transparent: true,
    opacity: 0.24,
    roughness: 0.16,
    transmission: 0.12
  }),
  metal: new THREE.MeshStandardMaterial({
    color: "#cbbda6",
    roughness: 0.5,
    metalness: 0.28
  })
};

function addMesh(parent, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addShelfBlock(parent, width, depth, height, position, rotationY = 0, levels = 4) {
  const group = new THREE.Group();
  group.position.set(position[0], 0, position[2]);
  group.rotation.y = rotationY;
  parent.add(group);

  addMesh(group, new THREE.BoxGeometry(width, height, depth), materials.wood, [0, height / 2, 0]);
  addMesh(group, new THREE.BoxGeometry(width, 0.08, depth), materials.woodDark, [0, 0.04, 0]);
  addMesh(group, new THREE.BoxGeometry(width, 0.05, depth), materials.top, [0, height + 0.025, 0]);

  const boardGeo = new THREE.BoxGeometry(width * 0.96, 0.04, depth * 0.92);
  for (let i = 1; i <= levels; i += 1) {
    addMesh(
      group,
      boardGeo,
      materials.woodLight,
      [0, (height / (levels + 1)) * i, 0]
    );
  }

  return group;
}

function addFridgeRun(parent, doorCount, position, rotationY = 0) {
  const group = new THREE.Group();
  group.position.set(position[0], 0, position[2]);
  group.rotation.y = rotationY;
  parent.add(group);

  const width = doorCount * 0.58;
  addMesh(group, new THREE.BoxGeometry(width, 2.15, 0.86), materials.fridge, [0, 1.075, 0]);

  for (let i = 0; i < doorCount; i += 1) {
    const x = -width / 2 + 0.29 + i * 0.58;
    const door = addMesh(
      group,
      new THREE.BoxGeometry(0.48, 1.78, 0.04),
      materials.glass,
      [x, 1.12, 0.43]
    );
    door.castShadow = false;

    addMesh(group, new THREE.BoxGeometry(0.03, 1.1, 0.03), materials.metal, [x + 0.16, 1.08, 0.46]);
  }

  return group;
}

function addCounter(parent, width, depth, height, position, rotationY = 0) {
  const group = new THREE.Group();
  group.position.set(position[0], 0, position[2]);
  group.rotation.y = rotationY;
  parent.add(group);

  addMesh(group, new THREE.BoxGeometry(width, height, depth), materials.checkout, [0, height / 2, 0]);
  addMesh(group, new THREE.BoxGeometry(width + 0.04, 0.06, depth + 0.04), materials.top, [0, height + 0.03, 0]);
  addMesh(group, new THREE.BoxGeometry(0.26, 0.18, 0.02), materials.trim, [-0.22, height + 0.16, 0.06]);
  addMesh(group, new THREE.BoxGeometry(0.08, 0.16, 0.06), materials.trim, [0.04, height + 0.1, 0.06]);

  return group;
}

addMesh(
  root,
  new THREE.PlaneGeometry(16, 16),
  new THREE.MeshStandardMaterial({ color: "#e8dcc6", roughness: 1 }),
  [0, -0.01, 0],
  [-Math.PI / 2, 0, 0]
).receiveShadow = true;

addMesh(root, new THREE.BoxGeometry(ROOM_WIDTH, 0.08, ROOM_DEPTH), materials.floor, [0, 0.04, 0]);

addMesh(root, new THREE.BoxGeometry(ROOM_WIDTH, ROOM_HEIGHT, 0.08), materials.wall, [0, ROOM_HEIGHT / 2, ROOM_DEPTH / 2]);
addMesh(root, new THREE.BoxGeometry(ROOM_WIDTH, ROOM_HEIGHT, 0.08), materials.wall, [0, ROOM_HEIGHT / 2, -ROOM_DEPTH / 2]);
addMesh(root, new THREE.BoxGeometry(0.08, ROOM_HEIGHT, ROOM_DEPTH), materials.wall, [-ROOM_WIDTH / 2, ROOM_HEIGHT / 2, 0]);
addMesh(root, new THREE.BoxGeometry(0.08, ROOM_HEIGHT, ROOM_DEPTH), materials.wallAlt, [ROOM_WIDTH / 2, ROOM_HEIGHT / 2, 0]);
addMesh(root, new THREE.BoxGeometry(ROOM_WIDTH, 0.08, ROOM_DEPTH), materials.ceiling, [0, ROOM_HEIGHT, 0]);

const frontGlass = addMesh(
  root,
  new THREE.BoxGeometry(ROOM_WIDTH * 0.7, 2.3, 0.03),
  materials.glass,
  [-0.85, 1.28, ROOM_DEPTH / 2 - 0.03]
);
frontGlass.castShadow = false;

addMesh(root, new THREE.BoxGeometry(1.35, ROOM_HEIGHT, 0.08), materials.wall, [ROOM_WIDTH / 2 - 0.675, ROOM_HEIGHT / 2, ROOM_DEPTH / 2]);
addMesh(root, new THREE.BoxGeometry(0.16, ROOM_HEIGHT, 0.16), materials.trim, [-0.78, ROOM_HEIGHT / 2, 0.16]);

for (let x = -ROOM_WIDTH / 2 + 0.6; x < ROOM_WIDTH / 2; x += 0.6) {
  addMesh(root, new THREE.BoxGeometry(0.02, 0.01, ROOM_DEPTH), materials.metal, [x, ROOM_HEIGHT - 0.01, 0]);
}
for (let z = -ROOM_DEPTH / 2 + 0.6; z < ROOM_DEPTH / 2; z += 0.6) {
  addMesh(root, new THREE.BoxGeometry(ROOM_WIDTH, 0.01, 0.02), materials.metal, [0, ROOM_HEIGHT - 0.01, z]);
}

for (const [x, z] of [
  [-1.3, -1.0],
  [0.0, -0.2],
  [1.25, 0.95],
  [-0.55, 1.35]
]) {
  const glow = new THREE.PointLight("#ffe2a8", 0.45, 4.4, 1.8);
  glow.position.set(x, ROOM_HEIGHT - 0.06, z);
  scene.add(glow);
  addMesh(root, new THREE.BoxGeometry(0.46, 0.02, 0.46), materials.ceiling, [x, ROOM_HEIGHT - 0.012, z]);
}

addShelfBlock(root, 2.45, 0.48, 2.05, [-2.1, 2.95], 0, 5);
addShelfBlock(root, 3.35, 0.54, 2.05, [-0.5, 2.95], 0, 5);
addShelfBlock(root, 1.5, 0.5, 1.2, [-2.0, -0.1], 0, 3);
addShelfBlock(root, 1.55, 0.5, 1.2, [0.0, -0.08], 0, 3);
addShelfBlock(root, 1.55, 0.5, 1.2, [0.0, 0.92], 0, 3);

addFridgeRun(root, 4, [2.15, -1.72], -Math.PI / 2);
addCounter(root, 1.45, 0.76, 1.0, [1.42, 1.42], -Math.PI / 2);
addMesh(root, new THREE.BoxGeometry(0.95, 2.2, 1.12), materials.wallAlt, [2.02, 1.1, 1.85]);

function updateViewport() {
  const ratio = window.innerWidth / window.innerHeight;
  camera.left = (-frustum * ratio) / 2;
  camera.right = (frustum * ratio) / 2;
  camera.top = frustum / 2;
  camera.bottom = -frustum / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", updateViewport);

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

updateViewport();
animate();
