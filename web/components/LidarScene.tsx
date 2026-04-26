"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { LiveIncident } from "@/lib/spotter-data";

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

const trackedPeople = [
  {
    id: "p1",
    name: "Saad",
    color: "#ff7a1a",
    path: [
      { x: -3.15, z: -3.05 },
      { x: -2.55, z: -2.45 },
      { x: -1.9, z: -2.75 },
      { x: -2.65, z: -3.35 },
    ],
  },
  {
    id: "p2",
    name: "Kareem",
    color: "#2f80ed",
    path: [
      { x: 1.35, z: -3.05 },
      { x: 2.25, z: -2.45 },
      { x: 3.05, z: -2.75 },
      { x: 2.05, z: -3.35 },
    ],
  },
  {
    id: "p3",
    name: "Fares",
    color: "#39a852",
    path: [
      { x: -3.05, z: -1.25 },
      { x: -2.35, z: -0.65 },
      { x: -1.55, z: -1.05 },
      { x: -2.45, z: -1.65 },
    ],
  },
  {
    id: "p4",
    name: "Omar",
    color: "#d08b33",
    path: [
      { x: 1.3, z: -1.2 },
      { x: 2.15, z: -0.65 },
      { x: 3.15, z: -1.05 },
      { x: 2.05, z: -1.65 },
    ],
  },
] as const;

const playback = {
  secondsPerPoint: 1.45,
};

function makeMaterial(color: string, opacity: number) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  });
}

function addEdges(mesh: THREE.Mesh, color = colors.line) {
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

function box({
  w,
  h,
  d,
  x,
  y,
  z,
  material = makeMaterial(colors.ghost, 0.2),
  edges = true,
}: {
  w: number;
  h: number;
  d: number;
  x: number;
  y: number;
  z: number;
  material?: THREE.Material;
  edges?: boolean;
}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  const group = new THREE.Group();
  group.add(mesh);
  if (edges) group.add(addEdges(mesh));
  return group;
}

function cylinder({
  radius,
  height,
  x,
  y,
  z,
  material,
}: {
  radius: number;
  height: number;
  x: number;
  y: number;
  z: number;
  material: THREE.Material;
}) {
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

function continuousWall({
  path,
  height,
  thickness,
  material,
}: {
  path: Array<{ x: number; z: number }>;
  height: number;
  thickness: number;
  material: THREE.Material;
}) {
  const half = thickness / 2;
  const positions: number[] = [];
  const indices: number[] = [];
  const edgePositions: number[] = [];

  const sectionPoints = path.map((point, index) => {
    const previous = path[Math.max(index - 1, 0)];
    const next = path[Math.min(index + 1, path.length - 1)];
    const tangent = new THREE.Vector2(
      next.x - previous.x,
      next.z - previous.z,
    ).normalize();
    const normal = new THREE.Vector2(-tangent.y, tangent.x);

    return {
      front: { x: point.x + normal.x * half, z: point.z + normal.y * half },
      back: { x: point.x - normal.x * half, z: point.z - normal.y * half },
    };
  });

  sectionPoints.forEach((section) => {
    positions.push(
      section.front.x,
      0,
      section.front.z,
      section.front.x,
      height,
      section.front.z,
      section.back.x,
      0,
      section.back.z,
      section.back.x,
      height,
      section.back.z,
    );
  });

  for (let i = 0; i < sectionPoints.length - 1; i += 1) {
    const current = i * 4;
    const next = current + 4;
    indices.push(
      current,
      next,
      current + 1,
      current + 1,
      next,
      next + 1,
      current + 2,
      current + 3,
      next + 2,
      current + 3,
      next + 3,
      next + 2,
      current + 1,
      next + 1,
      current + 3,
      current + 3,
      next + 1,
      next + 3,
      current,
      current + 2,
      next,
      current + 2,
      next + 2,
      next,
    );
  }

  const first = 0;
  const last = (sectionPoints.length - 1) * 4;
  indices.push(
    first,
    first + 1,
    first + 2,
    first + 1,
    first + 3,
    first + 2,
    last,
    last + 2,
    last + 1,
    last + 1,
    last + 2,
    last + 3,
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const wall = new THREE.Group();
  wall.add(new THREE.Mesh(geometry, material));

  const addEdge = (a: THREE.Vector3, b: THREE.Vector3) => {
    edgePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  };

  for (let i = 0; i < sectionPoints.length - 1; i += 1) {
    const current = sectionPoints[i];
    const next = sectionPoints[i + 1];
    addEdge(new THREE.Vector3(current.front.x, 0, current.front.z), new THREE.Vector3(next.front.x, 0, next.front.z));
    addEdge(new THREE.Vector3(current.front.x, height, current.front.z), new THREE.Vector3(next.front.x, height, next.front.z));
    addEdge(new THREE.Vector3(current.back.x, 0, current.back.z), new THREE.Vector3(next.back.x, 0, next.back.z));
    addEdge(new THREE.Vector3(current.back.x, height, current.back.z), new THREE.Vector3(next.back.x, height, next.back.z));
  }

  for (const section of [
    sectionPoints[0],
    sectionPoints[sectionPoints.length - 1],
  ]) {
    addEdge(new THREE.Vector3(section.front.x, 0, section.front.z), new THREE.Vector3(section.front.x, height, section.front.z));
    addEdge(new THREE.Vector3(section.back.x, 0, section.back.z), new THREE.Vector3(section.back.x, height, section.back.z));
    addEdge(new THREE.Vector3(section.front.x, height, section.front.z), new THREE.Vector3(section.back.x, height, section.back.z));
    addEdge(new THREE.Vector3(section.front.x, 0, section.front.z), new THREE.Vector3(section.back.x, 0, section.back.z));
  }

  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(edgePositions, 3),
  );
  wall.add(
    new THREE.LineSegments(
      edgeGeometry,
      new THREE.LineBasicMaterial({
        color: colors.line,
        transparent: true,
        opacity: 0.9,
      }),
    ),
  );

  return wall;
}

function freezerWallCurve(index: number) {
  const curve = Math.max(0, index - 3) / 4;
  return {
    x: -4.05 + index * 1.15,
    wallZ: 4.08 - curve * 0.76,
    freezerZ: 3.7 - curve * 0.76,
    rotation: -curve * 0.23,
  };
}

function freezerCase({
  x,
  z,
  faceDirection,
  rotation = 0,
  materials,
}: {
  x: number;
  z: number;
  faceDirection: number;
  rotation?: number;
  materials: ReturnType<typeof makeSceneMaterials>;
}) {
  const freezer = new THREE.Group();
  const faceZ = faceDirection * 0.22;
  const handleZ = faceDirection * 0.27;
  const shelfZ = faceDirection * 0.24;
  freezer.position.set(x, 0, z);
  freezer.rotation.y = rotation;

  freezer.add(box({ w: 0.96, h: 1.72, d: 0.42, x: 0, y: 0.86, z: 0, material: materials.fridge }));
  freezer.add(box({ w: 0.98, h: 0.18, d: 0.46, x: 0, y: 1.83, z: 0, material: materials.fixture }));
  freezer.add(box({ w: 0.98, h: 0.2, d: 0.5, x: 0, y: 0.1, z: 0, material: materials.fixture }));
  freezer.add(box({ w: 0.82, h: 1.24, d: 0.035, x: 0, y: 0.92, z: faceZ, material: materials.freezerGlass }));
  freezer.add(box({ w: 0.04, h: 1.34, d: 0.05, x: -0.43, y: 0.92, z: faceZ, material: materials.fixture }));
  freezer.add(box({ w: 0.04, h: 1.34, d: 0.05, x: 0.43, y: 0.92, z: faceZ, material: materials.fixture }));
  freezer.add(box({ w: 0.84, h: 0.04, d: 0.05, x: 0, y: 1.57, z: faceZ, material: materials.fixture }));
  freezer.add(box({ w: 0.84, h: 0.04, d: 0.05, x: 0, y: 0.28, z: faceZ, material: materials.fixture }));
  freezer.add(box({ w: 0.7, h: 0.03, d: 0.05, x: 0, y: 0.68, z: shelfZ, material: materials.fixture }));
  freezer.add(box({ w: 0.7, h: 0.03, d: 0.05, x: 0, y: 1.03, z: shelfZ, material: materials.fixture }));
  freezer.add(box({ w: 0.7, h: 0.03, d: 0.05, x: 0, y: 1.35, z: shelfZ, material: materials.fixture }));
  freezer.add(box({ w: 0.035, h: 0.92, d: 0.05, x: 0.28, y: 0.94, z: handleZ, material: materials.fixture }));
  return freezer;
}

function lowBasketRack({
  x,
  z,
  materials,
}: {
  x: number;
  z: number;
  materials: ReturnType<typeof makeSceneMaterials>;
}) {
  const rack = new THREE.Group();
  rack.add(box({ w: 1.05, h: 0.12, d: 0.52, x, y: 0.08, z, material: materials.basket }));
  rack.add(box({ w: 1.05, h: 0.08, d: 0.48, x, y: 0.38, z: z - 0.04, material: materials.basket }));
  rack.add(box({ w: 1.05, h: 0.08, d: 0.42, x, y: 0.68, z: z - 0.08, material: materials.basket }));
  rack.add(box({ w: 1.05, h: 0.08, d: 0.36, x, y: 0.96, z: z - 0.12, material: materials.basket }));
  rack.add(box({ w: 0.05, h: 1.02, d: 0.06, x: x - 0.55, y: 0.52, z: z - 0.12, material: materials.basket }));
  rack.add(box({ w: 0.05, h: 1.02, d: 0.06, x: x + 0.55, y: 0.52, z: z - 0.12, material: materials.basket }));
  rack.add(box({ w: 1.14, h: 0.05, d: 0.06, x, y: 1.06, z: z - 0.32, material: materials.basket }));

  for (let shelf = 0; shelf < 3; shelf += 1) {
    const y = 0.24 + shelf * 0.3;
    const shelfZ = z + 0.08 - shelf * 0.1;
    for (let i = 0; i < 4; i += 1) {
      rack.add(box({ w: 0.16, h: 0.18, d: 0.16, x: x - 0.36 + i * 0.24, y, z: shelfZ, material: materials.product }));
    }
  }
  return rack;
}

function sideBasketRack({
  x,
  z,
  faceDirection,
  materials,
}: {
  x: number;
  z: number;
  faceDirection: number;
  materials: ReturnType<typeof makeSceneMaterials>;
}) {
  const rack = new THREE.Group();
  const shelfX = x + faceDirection * 0.05;
  const railX = x - faceDirection * 0.24;
  rack.add(box({ w: 0.5, h: 0.14, d: 1.08, x, y: 0.11, z, material: materials.basket }));
  rack.add(box({ w: 0.44, h: 0.08, d: 1.02, x: shelfX, y: 0.52, z, material: materials.basket }));
  rack.add(box({ w: 0.38, h: 0.08, d: 0.96, x: shelfX + faceDirection * 0.04, y: 0.92, z, material: materials.basket }));
  rack.add(box({ w: 0.32, h: 0.08, d: 0.9, x: shelfX + faceDirection * 0.08, y: 1.28, z, material: materials.basket }));
  rack.add(box({ w: 0.06, h: 1.42, d: 0.05, x: railX, y: 0.72, z: z - 0.54, material: materials.basket }));
  rack.add(box({ w: 0.06, h: 1.42, d: 0.05, x: railX, y: 0.72, z: z + 0.54, material: materials.basket }));
  rack.add(box({ w: 0.06, h: 0.05, d: 1.16, x: railX, y: 1.45, z, material: materials.basket }));
  for (let shelf = 0; shelf < 3; shelf += 1) {
    const y = 0.32 + shelf * 0.38;
    const productX = x + faceDirection * (0.08 + shelf * 0.04);
    for (let i = 0; i < 4; i += 1) {
      rack.add(box({ w: 0.14, h: 0.2, d: 0.16, x: productX, y, z: z - 0.36 + i * 0.24, material: materials.product }));
    }
  }
  return rack;
}

function centerBasketRack({
  x,
  z,
  materials,
}: {
  x: number;
  z: number;
  materials: ReturnType<typeof makeSceneMaterials>;
}) {
  const rack = new THREE.Group();
  rack.add(box({ w: 2.16, h: 0.14, d: 0.56, x, y: 0.1, z, material: materials.basket }));
  rack.add(box({ w: 2.08, h: 0.08, d: 0.5, x, y: 0.5, z, material: materials.basket }));
  rack.add(box({ w: 1.96, h: 0.08, d: 0.44, x, y: 0.9, z, material: materials.basket }));
  rack.add(box({ w: 1.84, h: 0.08, d: 0.38, x, y: 1.26, z, material: materials.basket }));
  for (const dx of [-1.1, 1.1]) {
    for (const dz of [-0.28, 0.28]) {
      rack.add(box({ w: 0.06, h: 1.42, d: 0.05, x: x + dx, y: 0.72, z: z + dz, material: materials.basket }));
    }
  }
  rack.add(box({ w: 2.24, h: 0.05, d: 0.06, x, y: 1.45, z: z - 0.28, material: materials.basket }));
  rack.add(box({ w: 2.24, h: 0.05, d: 0.06, x, y: 1.45, z: z + 0.28, material: materials.basket }));
  for (let shelf = 0; shelf < 3; shelf += 1) {
    const y = 0.3 + shelf * 0.38;
    for (let i = 0; i < 7; i += 1) {
      [-1, 1].forEach((side) => {
        rack.add(box({ w: 0.16, h: 0.2, d: 0.16, x: x - 0.75 + i * 0.25, y, z: z + side * (0.16 + shelf * 0.05), material: materials.product }));
      });
    }
  }
  return rack;
}

function securityCamera({
  x,
  y,
  z,
  rotationY,
  materials,
}: {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  materials: ReturnType<typeof makeSceneMaterials>;
}) {
  const cameraUnit = new THREE.Group();
  cameraUnit.position.set(x, y, z);
  cameraUnit.rotation.y = rotationY;
  cameraUnit.add(box({ w: 0.08, h: 0.42, d: 0.08, x: 0, y: 0, z: 0, material: materials.cameraBody }));
  cameraUnit.add(box({ w: 0.08, h: 0.08, d: 0.42, x: 0, y: -0.16, z: -0.2, material: materials.cameraBody }));
  cameraUnit.add(box({ w: 0.42, h: 0.26, d: 0.3, x: 0, y: -0.2, z: -0.48, material: materials.cameraBody }));
  cameraUnit.add(box({ w: 0.24, h: 0.18, d: 0.06, x: 0, y: -0.2, z: -0.66, material: materials.fixture }));
  return cameraUnit;
}

function makeLabel(text: string, color: string) {
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 256;
  labelCanvas.height = 80;
  const context = labelCanvas.getContext("2d");
  if (!context) return new THREE.Sprite();
  context.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
  context.fillStyle = "rgba(246, 245, 240, 0.88)";
  context.fillRect(0, 8, 156, 42);
  context.fillStyle = color;
  context.font = "700 24px Arial, sans-serif";
  context.fillText(text, 14, 37);
  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    }),
  );
  sprite.renderOrder = 22;
  sprite.scale.set(1.85, 0.58, 1);
  sprite.position.y = 1.3;
  return sprite;
}

function interpolatePath(
  path: readonly { x: number; z: number }[],
  elapsed: number,
) {
  if (path.length === 1) {
    return { x: path[0].x, z: path[0].z };
  }

  const segmentCount = path.length;
  const progress = (elapsed / playback.secondsPerPoint) % segmentCount;
  const currentIndex = Math.floor(progress);
  const nextIndex = (currentIndex + 1) % segmentCount;
  const local = progress - currentIndex;
  const previous = path[currentIndex];
  const next = path[nextIndex];
  return {
    x: previous.x + (next.x - previous.x) * local,
    z: previous.z + (next.z - previous.z) * local,
  };
}

function makeSceneMaterials() {
  return {
    ghost: makeMaterial(colors.ghost, 0.2),
    fixture: makeMaterial(colors.fixture, 0.26),
    fridge: makeMaterial(colors.glass, 0.16),
    freezerGlass: makeMaterial("#e58b22", 0.2),
    basket: makeMaterial(colors.basket, 0.3),
    product: makeMaterial(colors.product, 0.38),
    cameraBody: makeMaterial(colors.glass, 0.42),
  };
}

function StoreReconstruction() {
  const store = useMemo(() => {
    const materials = makeSceneMaterials();
    const root = new THREE.Group();

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(10.4, 8.4),
      new THREE.MeshBasicMaterial({
        color: colors.floor,
        transparent: true,
        opacity: 0.52,
        side: THREE.DoubleSide,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    root.add(floor);

    const floorGrid = new THREE.GridHelper(10.4, 26, "#9b9990", "#9b9990");
    floorGrid.position.y = 0.01;
    floorGrid.material.transparent = true;
    floorGrid.material.opacity = 0.42;
    root.add(floorGrid);

    const outer = new THREE.Group();
    outer.add(box({ w: 0.16, h: 3.1, d: 8.2, x: -5.1, y: 1.55, z: 0, material: materials.ghost }));
    outer.add(box({ w: 0.16, h: 3.1, d: 8.2, x: 5.1, y: 1.55, z: 0, material: materials.ghost }));
    outer.add(box({ w: 1.25, h: 3.1, d: 0.16, x: -4.45, y: 1.55, z: -4.1, material: materials.ghost }));
    outer.add(box({ w: 6.9, h: 3.1, d: 0.16, x: 1.65, y: 1.55, z: -4.1, material: materials.ghost }));
    outer.add(box({ w: 0.16, h: 3.1, d: 1.15, x: -3.9, y: 1.55, z: -3.45, material: materials.ghost }));
    outer.add(box({ w: 1.2, h: 0.16, d: 0.16, x: -4.45, y: 3.14, z: -3.45, material: materials.ghost }));
    const freezerWallPath = [
      { x: -5.1, z: 4.08 },
      ...Array.from({ length: 8 }, (_, index) => {
        const segment = freezerWallCurve(index);
        return { x: segment.x, z: segment.wallZ };
      }),
      { x: 5.08, z: freezerWallCurve(7).wallZ },
    ];
    outer.add(continuousWall({ path: freezerWallPath, height: 3.1, thickness: 0.16, material: materials.ghost }));
    root.add(outer);

    root.add(box({ w: 1.2, h: 1.05, d: 0.42, x: -4.35, y: 0.53, z: 3.55, material: materials.fixture }));
    root.add(cylinder({ radius: 0.17, height: 2.6, x: 0.15, y: 1.3, z: -1.25, material: materials.fixture }));

    for (let i = 0; i < 8; i += 1) {
      const segment = freezerWallCurve(i);
      root.add(freezerCase({ x: segment.x, z: segment.freezerZ, faceDirection: -1, rotation: segment.rotation, materials }));
    }

    [-2.05, -0.85, 0.35].forEach((z) => {
      root.add(sideBasketRack({ x: 4.55, z, faceDirection: -1, materials }));
      root.add(sideBasketRack({ x: -4.55, z, faceDirection: 1, materials }));
    });

    for (let i = 0; i < 5; i += 1) {
      root.add(lowBasketRack({ x: -0.1 + i * 1.2, z: -3.55, materials }));
    }

    root.add(centerBasketRack({ x: 0.2, z: 0.2, materials }));
    root.add(securityCamera({ x: 5.18, y: 2.74, z: 3.98, rotationY: Math.PI / 2, materials }));
    root.add(securityCamera({ x: -2.85, y: 2.65, z: 3.9, rotationY: -0.72, materials }));

    return root;
  }, []);

  return <primitive object={store} />;
}

function MovingPeople({ incident }: { incident?: LiveIncident }) {
  const peopleRefs = useRef<Array<THREE.Group | null>>([]);
  const activeTrackIndex =
    typeof incident?.alert?.trackId === "number"
      ? Math.abs(incident.alert.trackId - 1) % trackedPeople.length
      : typeof incident?.event?.trackId === "number"
        ? Math.abs(incident.event.trackId - 1) % trackedPeople.length
        : null;
  const hasIncident = Boolean(incident?.confirmed && (incident.alert || incident.event));

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    peopleRefs.current.forEach((group, index) => {
      if (!group) return;
      const person = trackedPeople[index];
      const position = interpolatePath(person.path, elapsed + index * 1.9);
      group.position.set(position.x, 0, position.z);
    });
  });

  return (
    <>
      {trackedPeople.map((person, index) => {
        const isActiveIncident = hasIncident && activeTrackIndex === index;
        const color = isActiveIncident ? "#9B2D24" : person.color;

        return (
          <group
            key={person.id}
            ref={(node) => {
              peopleRefs.current[index] = node;
            }}
          >
            <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.42, 0.68, 36]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={isActiveIncident ? 0.82 : 0.46}
                depthTest={false}
                side={THREE.DoubleSide}
              />
            </mesh>
            {isActiveIncident && (
              <>
                <mesh position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[0.78, 0.84, 48]} />
                  <meshBasicMaterial
                    color="#9B2D24"
                    transparent
                    opacity={0.95}
                    depthTest={false}
                    side={THREE.DoubleSide}
                  />
                </mesh>
                <mesh position={[0, 0.11, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[1.08, 1.12, 64]} />
                  <meshBasicMaterial
                    color="#9B2D24"
                    transparent
                    opacity={0.38}
                    depthTest={false}
                    side={THREE.DoubleSide}
                  />
                </mesh>
                <lineSegments position={[0, 0.13, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                  <bufferGeometry>
                    <bufferAttribute
                      attach="attributes-position"
                      args={[
                        new Float32Array([
                          -1.3, 0, 0, -0.76, 0, 0,
                          0.76, 0, 0, 1.3, 0, 0,
                          0, -1.3, 0, 0, -0.76, 0,
                          0, 0.76, 0, 0, 1.3, 0,
                        ]),
                        3,
                      ]}
                    />
                  </bufferGeometry>
                  <lineBasicMaterial
                    color="#9B2D24"
                    transparent
                    opacity={0.9}
                    depthTest={false}
                  />
                </lineSegments>
                <Html
                  center
                  position={[0, 2.0, 0]}
                  distanceFactor={7}
                  occlude={false}
                  zIndexRange={[80, 0]}
                >
                  <div className="pointer-events-none select-none">
                    <div className="relative h-24 w-24">
                      <span className="absolute left-0 top-0 h-7 w-7 border-l-2 border-t-2 border-crimson-500" />
                      <span className="absolute right-0 top-0 h-7 w-7 border-r-2 border-t-2 border-crimson-500" />
                      <span className="absolute bottom-0 left-0 h-7 w-7 border-b-2 border-l-2 border-crimson-500" />
                      <span className="absolute bottom-0 right-0 h-7 w-7 border-b-2 border-r-2 border-crimson-500" />
                      <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-crimson-500/30" />
                      <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-crimson-500/30" />
                      <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-crimson-500 shadow-[0_0_18px_rgba(155,45,36,0.75)]" />
                    </div>
                    <div className="mt-1 rounded-md bg-crimson-500 px-2 py-1 text-center text-[10px] font-bold uppercase leading-none tracking-wider text-paper-50 shadow-soft">
                      Target lock
                    </div>
                  </div>
                </Html>
              </>
            )}
            <mesh position={[0, 0.55, 0]}>
              <sphereGeometry args={[0.38, 32, 20]} />
              <meshBasicMaterial color={color} depthTest={false} />
            </mesh>
            <Html
              center
              position={[0, 1.15, 0]}
              distanceFactor={8}
              occlude={false}
              zIndexRange={[50, 0]}
            >
              <div className="pointer-events-none flex select-none flex-col items-center gap-1">
                <span
                  className="block h-4 w-4 rounded-full border-2 border-paper-50 shadow-[0_3px_12px_rgba(28,24,20,0.35)]"
                  style={{ backgroundColor: color }}
                />
                <span className="whitespace-nowrap rounded-md bg-ink-900/85 px-2 py-1 text-[11px] font-semibold leading-none text-paper-50 shadow-soft">
                  {person.name}
                </span>
              </div>
            </Html>
          </group>
        );
      })}
    </>
  );
}

export default function LidarScene({ incident }: { incident?: LiveIncident }) {
  return (
    <Canvas
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 2]}
      camera={{ position: [8.8, 7.6, 10.2], fov: 42, near: 0.1, far: 100 }}
      style={{ background: "transparent" }}
      onCreated={({ scene }) => {
        scene.fog = new THREE.Fog(colors.background, 22, 46);
      }}
    >
      <color attach="background" args={[colors.background]} />
      <hemisphereLight args={["#fffaf0", "#9c9a91", 2.35]} />
      <directionalLight position={[6, 9, 7]} intensity={2} color="#fff8e8" />
      <StoreReconstruction />
      <MovingPeople incident={incident} />
      <OrbitControls
        enableDamping
        target={[0, 1.7, 0]}
        minDistance={6}
        maxDistance={23}
        maxPolarAngle={Math.PI * 0.48}
      />
    </Canvas>
  );
}
