import * as THREE from "https://esm.sh/three@0.177.0";
import { OrbitControls } from "https://esm.sh/three@0.177.0/examples/jsm/controls/OrbitControls.js";

const canvas = document.querySelector("#scene");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#d7d3c9");
scene.fog = new THREE.Fog("#d7d3c9", 22, 46);

const camera = new THREE.PerspectiveCamera(
  42,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(8.8, 7.6, 10.2);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 1.7, 0);
controls.minDistance = 6;
controls.maxDistance = 23;
controls.maxPolarAngle = Math.PI * 0.48;

scene.add(new THREE.HemisphereLight("#fffaf0", "#9c9a91", 2.35));

const mainLight = new THREE.DirectionalLight("#fff8e8", 2);
mainLight.position.set(6, 9, 7);
scene.add(mainLight);

const blueprintWhite = "#5e625d";
const blueprintBlue = "#bfc0b9";
const glassBlue = "#d9791c";
const floorBlue = "#c9c7be";

const lineMaterial = new THREE.LineBasicMaterial({
  color: blueprintWhite,
  transparent: true,
  opacity: 0.9,
});

const ghostMaterial = new THREE.MeshBasicMaterial({
  color: blueprintBlue,
  transparent: true,
  opacity: 0.2,
  depthWrite: false,
});

const fixtureMaterial = new THREE.MeshBasicMaterial({
  color: "#7b8b62",
  transparent: true,
  opacity: 0.26,
  depthWrite: false,
});

function addEdges(mesh, material = lineMaterial) {
  const edges = new THREE.EdgesGeometry(mesh.geometry, 20);
  const lines = new THREE.LineSegments(edges, material);
  lines.position.copy(mesh.position);
  lines.rotation.copy(mesh.rotation);
  lines.scale.copy(mesh.scale);
  return lines;
}

function box({ w, h, d, x, y, z, material = ghostMaterial, edges = true }) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  const group = new THREE.Group();
  group.add(mesh);
  if (edges) group.add(addEdges(mesh));
  return group;
}

function cylinder({ radius, height, x, y, z, material = ghostMaterial }) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 18),
    material,
  );
  mesh.position.set(x, y, z);
  const group = new THREE.Group();
  group.add(mesh);
  group.add(addEdges(mesh));
  return group;
}

function continuousWall({ path, height, thickness, material = ghostMaterial }) {
  const half = thickness / 2;
  const positions = [];
  const indices = [];
  const edgePositions = [];

  const sectionPoints = path.map((point, index) => {
    const previous = path[Math.max(index - 1, 0)];
    const next = path[Math.min(index + 1, path.length - 1)];
    const tangent = new THREE.Vector2(next.x - previous.x, next.z - previous.z).normalize();
    const normal = new THREE.Vector2(-tangent.y, tangent.x);

    return {
      front: { x: point.x + normal.x * half, z: point.z + normal.y * half },
      back: { x: point.x - normal.x * half, z: point.z - normal.y * half },
    };
  });

  sectionPoints.forEach((section) => {
    positions.push(
      section.front.x, 0, section.front.z,
      section.front.x, height, section.front.z,
      section.back.x, 0, section.back.z,
      section.back.x, height, section.back.z,
    );
  });

  for (let i = 0; i < sectionPoints.length - 1; i += 1) {
    const current = i * 4;
    const next = current + 4;
    indices.push(
      current, next, current + 1,
      current + 1, next, next + 1,
      current + 2, current + 3, next + 2,
      current + 3, next + 3, next + 2,
      current + 1, next + 1, current + 3,
      current + 3, next + 1, next + 3,
      current, current + 2, next,
      current + 2, next + 2, next,
    );
  }

  const first = 0;
  const last = (sectionPoints.length - 1) * 4;
  indices.push(
    first, first + 1, first + 2,
    first + 1, first + 3, first + 2,
    last, last + 2, last + 1,
    last + 1, last + 2, last + 3,
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const wall = new THREE.Group();
  wall.add(new THREE.Mesh(geometry, material));

  const addEdge = (a, b) => {
    edgePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  };

  for (let i = 0; i < sectionPoints.length - 1; i += 1) {
    const current = sectionPoints[i];
    const next = sectionPoints[i + 1];
    addEdge({ x: current.front.x, y: 0, z: current.front.z }, { x: next.front.x, y: 0, z: next.front.z });
    addEdge({ x: current.front.x, y: height, z: current.front.z }, { x: next.front.x, y: height, z: next.front.z });
    addEdge({ x: current.back.x, y: 0, z: current.back.z }, { x: next.back.x, y: 0, z: next.back.z });
    addEdge({ x: current.back.x, y: height, z: current.back.z }, { x: next.back.x, y: height, z: next.back.z });
  }

  [sectionPoints[0], sectionPoints[sectionPoints.length - 1]].forEach((section) => {
    addEdge({ x: section.front.x, y: 0, z: section.front.z }, { x: section.front.x, y: height, z: section.front.z });
    addEdge({ x: section.back.x, y: 0, z: section.back.z }, { x: section.back.x, y: height, z: section.back.z });
    addEdge({ x: section.front.x, y: height, z: section.front.z }, { x: section.back.x, y: height, z: section.back.z });
    addEdge({ x: section.front.x, y: 0, z: section.front.z }, { x: section.back.x, y: 0, z: section.back.z });
  });

  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(edgePositions, 3));
  wall.add(new THREE.LineSegments(edgeGeometry, lineMaterial));

  return wall;
}

const store = new THREE.Group();
scene.add(store);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(10.4, 8.4),
  new THREE.MeshBasicMaterial({
    color: floorBlue,
    transparent: true,
    opacity: 0.52,
    side: THREE.DoubleSide,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.02;
store.add(floor);

const floorGrid = new THREE.GridHelper(10.4, 26, "#8ecbff", "#2f6f9f");
floorGrid.position.y = 0.01;
floorGrid.material.transparent = true;
floorGrid.material.color.set("#9b9990");
floorGrid.material.opacity = 0.42;
store.add(floorGrid);

const outer = new THREE.Group();
outer.add(box({ w: 0.16, h: 3.1, d: 8.2, x: -5.1, y: 1.55, z: 0 }));
outer.add(box({ w: 0.16, h: 3.1, d: 8.2, x: 5.1, y: 1.55, z: 0 }));
outer.add(box({ w: 1.25, h: 3.1, d: 0.16, x: -4.45, y: 1.55, z: -4.1 }));
outer.add(box({ w: 6.9, h: 3.1, d: 0.16, x: 1.65, y: 1.55, z: -4.1 }));
outer.add(box({ w: 0.16, h: 3.1, d: 1.15, x: -3.9, y: 1.55, z: -3.45 }));
outer.add(box({ w: 1.2, h: 0.16, d: 0.16, x: -4.45, y: 3.14, z: -3.45 }));

function freezerWallCurve(index) {
  const curve = Math.max(0, index - 3) / 4;
  return {
    x: -4.05 + index * 1.15,
    wallZ: 4.08 - curve * 0.76,
    freezerZ: 3.7 - curve * 0.76,
    rotation: -curve * 0.23,
  };
}

const freezerWallPath = [
  { x: -5.1, z: 4.08 },
  ...Array.from({ length: 8 }, (_, index) => {
    const segment = freezerWallCurve(index);
    return { x: segment.x, z: segment.wallZ };
  }),
  { x: 5.08, z: freezerWallCurve(7).wallZ },
];
outer.add(continuousWall({ path: freezerWallPath, height: 3.1, thickness: 0.16 }));
store.add(outer);

const fixtures = new THREE.Group();
fixtures.add(box({ w: 1.2, h: 1.05, d: 0.42, x: -4.35, y: 0.53, z: 3.55, material: fixtureMaterial }));
fixtures.add(cylinder({ radius: 0.17, height: 2.6, x: 0.15, y: 1.3, z: -1.25, material: fixtureMaterial }));
store.add(fixtures);

const fridgeMaterial = new THREE.MeshBasicMaterial({
  color: glassBlue,
  transparent: true,
  opacity: 0.16,
  depthWrite: false,
});

const freezerGlassMaterial = new THREE.MeshBasicMaterial({
  color: "#e58b22",
  transparent: true,
  opacity: 0.2,
  depthWrite: false,
});

const basketMaterial = new THREE.MeshBasicMaterial({
  color: "#a7a59c",
  transparent: true,
  opacity: 0.3,
  depthWrite: false,
});

const productMaterial = new THREE.MeshBasicMaterial({
  color: "#6f8557",
  transparent: true,
  opacity: 0.38,
  depthWrite: false,
});

const cameraBodyMaterial = new THREE.MeshBasicMaterial({
  color: "#d9791c",
  transparent: true,
  opacity: 0.42,
  depthWrite: false,
});

function freezerCase({ x, z, faceDirection, rotation = 0 }) {
  const freezer = new THREE.Group();
  const faceZ = faceDirection * 0.22;
  const handleZ = faceDirection * 0.27;
  const shelfZ = faceDirection * 0.24;

  freezer.position.set(x, 0, z);
  freezer.rotation.y = rotation;

  freezer.add(box({ w: 0.96, h: 1.72, d: 0.42, x: 0, y: 0.86, z: 0, material: fridgeMaterial }));
  freezer.add(box({ w: 0.98, h: 0.18, d: 0.46, x: 0, y: 1.83, z: 0, material: fixtureMaterial }));
  freezer.add(box({ w: 0.98, h: 0.2, d: 0.5, x: 0, y: 0.1, z: 0, material: fixtureMaterial }));
  freezer.add(box({ w: 0.82, h: 1.24, d: 0.035, x: 0, y: 0.92, z: faceZ, material: freezerGlassMaterial }));

  freezer.add(box({ w: 0.04, h: 1.34, d: 0.05, x: -0.43, y: 0.92, z: faceZ, material: fixtureMaterial }));
  freezer.add(box({ w: 0.04, h: 1.34, d: 0.05, x: 0.43, y: 0.92, z: faceZ, material: fixtureMaterial }));
  freezer.add(box({ w: 0.84, h: 0.04, d: 0.05, x: 0, y: 1.57, z: faceZ, material: fixtureMaterial }));
  freezer.add(box({ w: 0.84, h: 0.04, d: 0.05, x: 0, y: 0.28, z: faceZ, material: fixtureMaterial }));

  freezer.add(box({ w: 0.7, h: 0.03, d: 0.05, x: 0, y: 0.68, z: shelfZ, material: fixtureMaterial }));
  freezer.add(box({ w: 0.7, h: 0.03, d: 0.05, x: 0, y: 1.03, z: shelfZ, material: fixtureMaterial }));
  freezer.add(box({ w: 0.7, h: 0.03, d: 0.05, x: 0, y: 1.35, z: shelfZ, material: fixtureMaterial }));
  freezer.add(box({ w: 0.035, h: 0.92, d: 0.05, x: 0.28, y: 0.94, z: handleZ, material: fixtureMaterial }));

  return freezer;
}

function lowBasketRack({ x, z }) {
  const rack = new THREE.Group();

  rack.add(box({ w: 1.05, h: 0.12, d: 0.52, x, y: 0.08, z, material: basketMaterial }));
  rack.add(box({ w: 1.05, h: 0.08, d: 0.48, x, y: 0.38, z: z - 0.04, material: basketMaterial }));
  rack.add(box({ w: 1.05, h: 0.08, d: 0.42, x, y: 0.68, z: z - 0.08, material: basketMaterial }));
  rack.add(box({ w: 1.05, h: 0.08, d: 0.36, x, y: 0.96, z: z - 0.12, material: basketMaterial }));
  rack.add(box({ w: 0.05, h: 1.02, d: 0.06, x: x - 0.55, y: 0.52, z: z - 0.12, material: basketMaterial }));
  rack.add(box({ w: 0.05, h: 1.02, d: 0.06, x: x + 0.55, y: 0.52, z: z - 0.12, material: basketMaterial }));
  rack.add(box({ w: 1.14, h: 0.05, d: 0.06, x, y: 1.06, z: z - 0.32, material: basketMaterial }));

  for (let shelf = 0; shelf < 3; shelf += 1) {
    const y = 0.24 + shelf * 0.3;
    const shelfZ = z + 0.08 - shelf * 0.1;
    for (let i = 0; i < 4; i += 1) {
      rack.add(box({
        w: 0.16,
        h: 0.18,
        d: 0.16,
        x: x - 0.36 + i * 0.24,
        y,
        z: shelfZ,
        material: productMaterial,
      }));
    }
  }

  return rack;
}

function highSideBasketRack({ x, z, faceDirection }) {
  const rack = new THREE.Group();
  const shelfX = x + faceDirection * 0.05;
  const railX = x - faceDirection * 0.24;

  rack.add(box({ w: 0.5, h: 0.14, d: 1.08, x, y: 0.11, z, material: basketMaterial }));
  rack.add(box({ w: 0.44, h: 0.08, d: 1.02, x: shelfX, y: 0.52, z, material: basketMaterial }));
  rack.add(box({ w: 0.38, h: 0.08, d: 0.96, x: shelfX + faceDirection * 0.04, y: 0.92, z, material: basketMaterial }));
  rack.add(box({ w: 0.32, h: 0.08, d: 0.9, x: shelfX + faceDirection * 0.08, y: 1.28, z, material: basketMaterial }));
  rack.add(box({ w: 0.06, h: 1.42, d: 0.05, x: railX, y: 0.72, z: z - 0.54, material: basketMaterial }));
  rack.add(box({ w: 0.06, h: 1.42, d: 0.05, x: railX, y: 0.72, z: z + 0.54, material: basketMaterial }));
  rack.add(box({ w: 0.06, h: 0.05, d: 1.16, x: railX, y: 1.45, z, material: basketMaterial }));

  for (let shelf = 0; shelf < 3; shelf += 1) {
    const y = 0.32 + shelf * 0.38;
    const productX = x + faceDirection * (0.08 + shelf * 0.04);
    for (let i = 0; i < 4; i += 1) {
      rack.add(box({
        w: 0.14,
        h: 0.2,
        d: 0.16,
        x: productX,
        y,
        z: z - 0.36 + i * 0.24,
        material: productMaterial,
      }));
    }
  }

  return rack;
}

function centerBasketRack({ x, z }) {
  const rack = new THREE.Group();

  rack.add(box({ w: 2.16, h: 0.14, d: 0.56, x, y: 0.1, z, material: basketMaterial }));
  rack.add(box({ w: 2.08, h: 0.08, d: 0.5, x, y: 0.5, z, material: basketMaterial }));
  rack.add(box({ w: 1.96, h: 0.08, d: 0.44, x, y: 0.9, z, material: basketMaterial }));
  rack.add(box({ w: 1.84, h: 0.08, d: 0.38, x, y: 1.26, z, material: basketMaterial }));
  rack.add(box({ w: 0.06, h: 1.42, d: 0.05, x: x - 1.1, y: 0.72, z: z - 0.28, material: basketMaterial }));
  rack.add(box({ w: 0.06, h: 1.42, d: 0.05, x: x + 1.1, y: 0.72, z: z - 0.28, material: basketMaterial }));
  rack.add(box({ w: 0.06, h: 1.42, d: 0.05, x: x - 1.1, y: 0.72, z: z + 0.28, material: basketMaterial }));
  rack.add(box({ w: 0.06, h: 1.42, d: 0.05, x: x + 1.1, y: 0.72, z: z + 0.28, material: basketMaterial }));
  rack.add(box({ w: 2.24, h: 0.05, d: 0.06, x, y: 1.45, z: z - 0.28, material: basketMaterial }));
  rack.add(box({ w: 2.24, h: 0.05, d: 0.06, x, y: 1.45, z: z + 0.28, material: basketMaterial }));

  for (let shelf = 0; shelf < 3; shelf += 1) {
    const y = 0.3 + shelf * 0.38;
    for (let i = 0; i < 7; i += 1) {
      [-1, 1].forEach((side) => {
        rack.add(box({
          w: 0.16,
          h: 0.2,
          d: 0.16,
          x: x - 0.75 + i * 0.25,
          y,
          z: z + side * (0.16 + shelf * 0.05),
          material: productMaterial,
        }));
      });
    }
  }

  return rack;
}

function securityCamera({ x, y, z, rotationY }) {
  const cameraUnit = new THREE.Group();
  cameraUnit.position.set(x, y, z);
  cameraUnit.rotation.y = rotationY;

  cameraUnit.add(box({ w: 0.08, h: 0.42, d: 0.08, x: 0, y: 0, z: 0, material: cameraBodyMaterial }));
  cameraUnit.add(box({ w: 0.08, h: 0.08, d: 0.42, x: 0, y: -0.16, z: -0.2, material: cameraBodyMaterial }));
  cameraUnit.add(box({ w: 0.42, h: 0.26, d: 0.3, x: 0, y: -0.2, z: -0.48, material: cameraBodyMaterial }));
  cameraUnit.add(box({ w: 0.24, h: 0.18, d: 0.06, x: 0, y: -0.2, z: -0.66, material: fixtureMaterial }));

  return cameraUnit;
}

for (let i = 0; i < 8; i += 1) {
  const segment = freezerWallCurve(i);
  fixtures.add(freezerCase({
    x: segment.x,
    z: segment.freezerZ,
    faceDirection: -1,
    rotation: segment.rotation,
  }));
}

[-2.05, -0.85, 0.35].forEach((z) => {
  fixtures.add(highSideBasketRack({ x: 4.55, z, faceDirection: -1 }));
  fixtures.add(highSideBasketRack({ x: -4.55, z, faceDirection: 1 }));
});

for (let i = 0; i < 5; i += 1) {
fixtures.add(lowBasketRack({ x: -0.1 + i * 1.2, z: -3.55 }));
}

fixtures.add(centerBasketRack({ x: 0.2, z: 0.2 }));
fixtures.add(securityCamera({ x: 5.18, y: 2.74, z: 3.98, rotationY: Math.PI / 2 }));
fixtures.add(securityCamera({ x: -2.85, y: 2.65, z: 3.9, rotationY: -0.72 }));

const dotPalette = ["#ff7a1a", "#2f80ed", "#39a852", "#b64cff"];
const trackedPeople = [
  {
    id: "Person A",
    color: dotPalette[0],
    path: [
      [-3.2, 1.9],
      [-1.5, 1.2],
      [0.2, 0.35],
      [1.25, 0.25],
      [1.7, 0.65],
      [1.25, 1.05],
    ],
  },
  {
    id: "Person B",
    color: dotPalette[1],
    path: [
      [3.7, 2.65],
      [2.2, 1.9],
      [0.7, 1.3],
      [-0.2, 0.7],
      [-1.5, 0.25],
      [-2.5, -0.35],
    ],
  },
  {
    id: "Person C",
    color: dotPalette[2],
    path: [
      [3.9, -2.6],
      [2.8, -2.2],
      [1.65, -1.4],
      [0.5, -0.6],
      [-0.8, -0.15],
      [-2.2, 0.4],
    ],
  },
];

function makeLabel(text, color) {
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 256;
  labelCanvas.height = 80;
  const context = labelCanvas.getContext("2d");
  context.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
  context.fillStyle = "rgba(246, 245, 240, 0.88)";
  context.fillRect(0, 8, 156, 42);
  context.fillStyle = color;
  context.font = "700 24px Manrope, Arial, sans-serif";
  context.fillText(text, 14, 37);

  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.15, 0.36, 1);
  sprite.position.y = 0.55;
  return sprite;
}

function interpolatePath(path, t) {
  const scaled = t * (path.length - 1);
  const index = Math.min(path.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const [x1, z1] = path[index];
  const [x2, z2] = path[index + 1];
  return {
    x: x1 + (x2 - x1) * local,
    z: z1 + (z2 - z1) * local,
  };
}

const peopleDots = trackedPeople.map((person) => {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: person.color });
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 24, 16), material);
  dot.position.y = 0.17;
  group.add(dot);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.18, 0.25, 28),
    new THREE.MeshBasicMaterial({
      color: person.color,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.025;
  group.add(ring);
  group.add(makeLabel(person.id, person.color));

  const trailMaterial = new THREE.LineBasicMaterial({
    color: person.color,
    transparent: true,
    opacity: 0.75,
  });
  const trailGeometry = new THREE.BufferGeometry().setFromPoints(
    person.path.map(([x, z]) => new THREE.Vector3(x, 0.045, z)),
  );
  store.add(new THREE.Line(trailGeometry, trailMaterial));

  store.add(group);
  return { ...person, group };
});

const startTime = performance.now();

function animate() {
  const elapsed = (performance.now() - startTime) / 1000;
  peopleDots.forEach((person, index) => {
    const phase = (elapsed * 0.105 + index * 0.18) % 1;
    const pingPong = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
    const position = interpolatePath(person.path, pingPong);
    person.group.position.set(position.x, 0, position.z);
  });
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
