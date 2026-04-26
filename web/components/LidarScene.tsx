"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useMemo } from "react";
import * as THREE from "three";

function Floor() {
  // Subtle dotted/cross-hatched floor in the warm cream palette
  const grid = useMemo(() => {
    const grid = new THREE.GridHelper(40, 40, 0x3f362c, 0x8c8175);
    grid.material.transparent = true;
    grid.material.opacity = 0.18;
    return grid;
  }, []);
  return <primitive object={grid} position={[0, 0, 0]} />;
}

function PointCloudFloor() {
  // Soft point-cloud effect to evoke LIDAR
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(1800 * 3);
    for (let i = 0; i < 1800; i++) {
      arr[i * 3 + 0] = (Math.random() - 0.5) * 36;
      arr[i * 3 + 1] = 0.02 + Math.random() * 0.04;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 22;
    }
    return arr;
  }, []);

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.06}
        color="#3F362C"
        transparent
        opacity={0.45}
        sizeAttenuation
      />
    </points>
  );
}

function Shelf({
  position,
  size = [3, 1.6, 1.2] as [number, number, number],
}: {
  position: [number, number, number];
  size?: [number, number, number];
}) {
  const [w, h, d] = size;
  return (
    <group position={position}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshBasicMaterial
          color="#FBF7F2"
          transparent
          opacity={0.06}
        />
      </mesh>
      <lineSegments position={[0, h / 2, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(w, h, d)]} />
        <lineBasicMaterial color="#3F362C" transparent opacity={0.55} />
      </lineSegments>
    </group>
  );
}

function Walls() {
  return (
    <group>
      {/* Outer perimeter as wireframe edges */}
      <lineSegments position={[0, 1.2, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(20, 2.4, 12)]} />
        <lineBasicMaterial color="#3F362C" transparent opacity={0.35} />
      </lineSegments>
    </group>
  );
}

function SceneRig() {
  // Slow auto-rotate for ambient motion
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.04;
  });

  return (
    <group ref={ref}>
      <Walls />
      <PointCloudFloor />
      <Floor />
      {/* Aisle row 1 */}
      <Shelf position={[-6, 0, -3]} />
      <Shelf position={[-1.5, 0, -3]} />
      <Shelf position={[3, 0, -3]} />
      <Shelf position={[7.5, 0, -3]} />
      {/* Aisle row 2 */}
      <Shelf position={[-6, 0, 1]} size={[3, 1.4, 1.0]} />
      <Shelf position={[-1.5, 0, 1]} size={[3, 1.4, 1.0]} />
      <Shelf position={[3, 0, 1]} size={[3, 1.4, 1.0]} />
      <Shelf position={[7.5, 0, 1]} size={[3, 1.4, 1.0]} />
    </group>
  );
}

export default function LidarScene() {
  return (
    <Canvas
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 2]}
      camera={{ position: [10, 10, 14], fov: 38 }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[8, 10, 6]} intensity={0.6} />
      <fog attach="fog" args={["#F5EEE5", 18, 38]} />
      <SceneRig />
    </Canvas>
  );
}
