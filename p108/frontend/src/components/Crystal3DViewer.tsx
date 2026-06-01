import { useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, MarchingCubes } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useSimulationStore } from '../store/simulationStore';

interface VolumeData {
  data: Uint8Array;
  dimensions: [number, number, number];
}

function CrystalMesh({ volumeData }: { volumeData: VolumeData | null }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.001;
    }
  });

  const { positions, normals, colors } = useMemo(() => {
    if (!volumeData || !volumeData.data.length) {
      return { positions: new Float32Array(), normals: new Float32Array(), colors: new Float32Array() };
    }

    const { data, dimensions } = volumeData;
    const [nx, ny, nz] = dimensions;
    const scale = 1.8;
    const offsetX = (nx * scale) / 2;
    const offsetY = (ny * scale) / 2;
    const offsetZ = (nz * scale) / 2;

    const threshold = 0.4;
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];

    const getValue = (i: number, j: number, k: number): number => {
      if (i < 0 || i >= nx - 1 || j < 0 || j >= ny - 1 || k < 0 || k >= nz - 1) return 0;
      return data[i + j * nx + k * nx * ny] / 255;
    };

    const edgePositions = new Float32Array(12 * 3);
    const edgeIndices = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]
    ];

    const cubeOffsets = [
      [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
      [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
    ];

    const triTable = [
      [], [0, 8, 3], [0, 1, 9], [1, 8, 3, 9, 8, 1],
      [1, 2, 10], [0, 8, 3, 1, 2, 10], [9, 2, 10, 0, 2, 9], [2, 8, 3, 2, 10, 8, 10, 9, 8],
      [3, 11, 2], [0, 11, 2, 8, 11, 0], [1, 9, 0, 2, 3, 11], [1, 11, 2, 1, 9, 11, 9, 8, 11],
      [3, 10, 1, 11, 10, 3], [0, 10, 1, 0, 8, 10, 8, 11, 10], [3, 9, 0, 3, 11, 9, 11, 10, 9],
      [9, 8, 10, 10, 8, 11],
      [4, 7, 8], [4, 3, 0, 7, 3, 4], [0, 1, 9, 8, 4, 7], [4, 1, 9, 4, 7, 1, 7, 3, 1],
      [1, 2, 10, 8, 4, 7], [3, 4, 7, 3, 0, 4, 1, 2, 10], [9, 2, 10, 9, 0, 2, 8, 4, 7],
      [2, 10, 9, 2, 9, 7, 2, 7, 3, 7, 9, 4],
      [8, 4, 7, 3, 11, 2], [11, 4, 7, 11, 2, 4, 2, 0, 4], [9, 0, 1, 8, 4, 7, 2, 3, 11],
      [4, 7, 11, 9, 4, 11, 9, 11, 1, 1, 11, 2],
      [3, 10, 1, 3, 11, 10, 7, 8, 4], [1, 11, 10, 1, 4, 11, 1, 0, 4, 7, 11, 4],
      [4, 7, 8, 9, 0, 11, 9, 11, 10, 11, 0, 3],
      [4, 7, 11, 4, 11, 9, 9, 11, 10],
      [9, 5, 4], [9, 5, 4, 0, 8, 3], [0, 5, 4, 1, 5, 0], [8, 5, 4, 8, 3, 5, 3, 1, 5],
      [1, 2, 10, 9, 5, 4], [3, 0, 8, 1, 2, 10, 4, 9, 5], [5, 2, 10, 5, 4, 2, 4, 0, 2],
      [2, 10, 5, 3, 2, 5, 3, 5, 4, 3, 4, 8],
      [9, 5, 4, 2, 3, 11], [0, 11, 2, 0, 8, 11, 4, 9, 5], [0, 5, 4, 0, 1, 5, 2, 3, 11],
      [8, 11, 2, 8, 5, 11, 8, 1, 5, 10, 11, 5],
      [10, 3, 11, 10, 1, 3, 9, 5, 4], [4, 9, 5, 0, 8, 1, 8, 10, 1, 8, 11, 10],
      [5, 4, 0, 5, 0, 11, 5, 11, 10, 11, 0, 3],
      [5, 4, 8, 5, 8, 10, 10, 8, 11],
      [9, 7, 8, 5, 7, 9], [9, 3, 0, 9, 5, 3, 5, 7, 3], [0, 7, 8, 0, 1, 7, 1, 5, 7],
      [1, 5, 3, 3, 5, 7],
      [9, 7, 8, 9, 5, 7, 10, 1, 2], [10, 1, 2, 9, 5, 0, 5, 3, 0, 5, 7, 3],
      [8, 0, 2, 8, 2, 5, 8, 5, 7, 10, 5, 2], [2, 10, 5, 2, 5, 3, 3, 5, 7],
      [7, 9, 5, 7, 8, 9, 3, 11, 2], [9, 5, 7, 9, 7, 2, 9, 2, 0, 2, 7, 11],
      [2, 3, 11, 0, 1, 8, 1, 7, 8, 1, 5, 7], [11, 2, 1, 11, 1, 7, 7, 1, 5],
      [9, 5, 8, 8, 5, 7, 10, 1, 3, 10, 3, 11],
      [5, 7, 0, 5, 0, 9, 7, 11, 0, 1, 0, 10, 11, 10, 0],
      [11, 10, 0, 11, 0, 3, 10, 5, 0, 8, 0, 7, 5, 7, 0],
      [11, 10, 5, 7, 11, 5],
      [10, 6, 5], [0, 8, 3, 5, 10, 6], [9, 0, 1, 5, 10, 6], [1, 8, 3, 1, 9, 8, 5, 10, 6],
      [1, 6, 5, 2, 6, 1], [0, 8, 3, 1, 6, 5, 2, 6, 1],
      [9, 6, 5, 9, 0, 6, 0, 2, 6], [5, 9, 8, 5, 8, 2, 5, 2, 6, 3, 2, 8],
      [2, 3, 11, 10, 6, 5], [11, 0, 8, 11, 2, 0, 10, 6, 5],
      [0, 1, 9, 2, 3, 11, 5, 10, 6], [5, 10, 6, 1, 9, 2, 9, 11, 2, 9, 8, 11],
      [6, 3, 11, 6, 5, 3, 5, 1, 3], [0, 8, 11, 0, 11, 5, 0, 5, 1, 5, 11, 6],
      [3, 11, 6, 0, 3, 6, 0, 6, 5, 0, 5, 9], [6, 5, 9, 6, 9, 11, 11, 9, 8],
      [5, 10, 6, 4, 7, 8], [4, 3, 0, 4, 7, 3, 6, 5, 10],
      [1, 9, 0, 5, 10, 6, 8, 4, 7], [10, 6, 5, 1, 9, 7, 1, 7, 3, 7, 9, 4],
      [6, 1, 2, 6, 5, 1, 4, 7, 8], [1, 2, 5, 5, 2, 6, 3, 0, 4, 3, 4, 7],
      [8, 4, 7, 9, 0, 5, 0, 6, 5, 0, 2, 6], [7, 3, 9, 7, 9, 4, 3, 2, 9, 5, 9, 6, 2, 6, 9],
      [3, 11, 2, 7, 8, 4, 10, 6, 5], [5, 10, 6, 4, 7, 2, 4, 2, 0, 2, 7, 11],
      [0, 1, 9, 4, 7, 8, 2, 3, 11, 5, 10, 6],
      [9, 2, 1, 9, 11, 2, 9, 4, 11, 7, 11, 4, 5, 10, 6],
      [8, 4, 7, 3, 11, 5, 3, 5, 1, 5, 11, 6],
      [5, 1, 11, 5, 11, 6, 1, 0, 11, 7, 11, 4, 0, 4, 11],
      [0, 5, 9, 0, 3, 5, 0, 7, 3, 5, 6, 11, 3, 11, 7],
      [6, 5, 9, 6, 9, 11, 4, 7, 9, 7, 11, 9],
      [10, 4, 9, 6, 4, 10], [4, 10, 6, 4, 9, 10, 0, 8, 3],
      [10, 0, 1, 10, 6, 0, 6, 4, 0], [8, 3, 1, 8, 1, 6, 8, 6, 4, 6, 1, 10],
      [1, 4, 9, 1, 2, 4, 2, 6, 4], [3, 0, 8, 1, 2, 9, 2, 4, 9, 2, 6, 4],
      [0, 2, 4, 4, 2, 6], [8, 3, 2, 8, 2, 4, 4, 2, 6],
      [10, 4, 9, 10, 6, 4, 11, 2, 3], [0, 8, 2, 2, 8, 11, 4, 9, 10, 4, 10, 6],
      [3, 11, 2, 0, 1, 6, 0, 6, 4, 6, 1, 10],
      [6, 4, 1, 6, 1, 10, 4, 8, 1, 2, 1, 11, 8, 11, 1],
      [9, 6, 4, 9, 3, 6, 9, 1, 3, 11, 6, 3],
      [8, 11, 1, 8, 1, 0, 11, 6, 1, 9, 1, 4, 6, 4, 1],
      [3, 11, 6, 3, 6, 0, 0, 6, 4], [6, 4, 8, 11, 6, 8],
      [7, 10, 6, 7, 8, 10, 8, 9, 10], [0, 8, 3, 7, 10, 6, 8, 7, 6, 8, 6, 9],
      [10, 6, 7, 1, 10, 7, 1, 7, 0, 0, 7, 8],
      [10, 6, 7, 10, 7, 1, 1, 7, 3], [1, 2, 6, 1, 6, 7, 1, 7, 8, 8, 7, 6],
      [2, 6, 9, 2, 9, 1, 6, 7, 9, 0, 9, 8, 7, 8, 9],
      [7, 8, 0, 7, 0, 6, 6, 0, 2], [7, 2, 3, 7, 6, 2, 6, 8, 2, 8, 9, 6],
      [2, 3, 11, 10, 6, 8, 10, 8, 7, 8, 6, 9],
      [2, 0, 7, 2, 7, 11, 0, 9, 7, 6, 7, 10, 9, 10, 7],
      [1, 8, 0, 1, 7, 8, 1, 10, 7, 6, 7, 10, 2, 3, 11],
      [11, 2, 1, 11, 1, 7, 10, 6, 1, 6, 7, 1],
      [8, 9, 6, 8, 6, 7, 9, 1, 6, 11, 6, 3, 1, 3, 6],
      [0, 9, 1, 11, 6, 7], [7, 8, 0, 7, 0, 6, 3, 11, 0, 11, 6, 0],
      [7, 11, 6], [7, 8, 4, 11, 8, 10], [4, 11, 10, 4, 9, 11, 9, 10, 11],
      [2, 8, 10, 2, 0, 8, 4, 9, 11],
      [2, 0, 10, 2, 10, 11, 0, 9, 10, 8, 10, 4, 9, 4, 10],
      [2, 8, 10, 4, 8, 2, 4, 9, 8], [2, 0, 11, 2, 11, 10, 0, 9, 11, 4, 11, 8, 9, 8, 11],
      [4, 11, 10, 9, 11, 4], [9, 3, 1, 9, 11, 3, 9, 4, 11, 8, 10, 11, 4, 10, 11],
      [4, 10, 8, 4, 9, 10, 0, 8, 10, 0, 3, 8, 1, 11, 9],
      [10, 11, 4, 10, 4, 2, 2, 4, 0], [10, 11, 4, 10, 4, 2, 8, 10, 2, 8, 2, 0],
      [4, 11, 1, 4, 9, 11, 1, 3, 11], [4, 11, 1, 4, 9, 11, 8, 11, 1, 0, 1, 8],
      [4, 0, 3, 4, 11, 0, 11, 1, 0], [4, 11, 10, 8, 11, 4],
      [8, 4, 10, 8, 10, 3, 10, 2, 3], [9, 4, 10, 9, 10, 3, 9, 0, 10, 0, 3, 10],
      [0, 8, 2, 0, 2, 4, 4, 2, 10], [3, 9, 0, 3, 10, 9, 10, 4, 9],
      [1, 4, 8, 1, 8, 2, 8, 10, 2], [9, 0, 1, 8, 10, 4],
      [4, 0, 3, 4, 10, 0, 10, 2, 0], [10, 4, 3], [8, 4, 11, 8, 11, 1, 1, 11, 10],
      [4, 11, 10, 4, 9, 11, 9, 10, 11, 0, 8, 3],
      [0, 1, 10, 0, 10, 8, 8, 10, 11], [3, 0, 10, 3, 10, 11, 0, 9, 10, 8, 10, 4, 9, 4, 10],
      [1, 10, 11, 1, 11, 4, 4, 11, 8], [9, 10, 1, 9, 11, 10, 9, 4, 11, 8, 3, 0, 4, 11, 0],
      [0, 11, 8, 0, 2, 11, 2, 10, 11], [0, 8, 3, 2, 11, 10, 4, 9, 11],
      [2, 11, 8, 2, 8, 1, 1, 8, 0], [10, 2, 0, 10, 0, 4, 4, 0, 9],
      [10, 2, 0, 10, 0, 4, 8, 10, 4, 8, 4, 3], [4, 9, 10, 4, 10, 8, 8, 10, 1],
      [4, 11, 8, 9, 11, 4, 9, 1, 11, 1, 3, 11], [0, 8, 1, 0, 1, 9, 4, 11, 8, 10, 11, 4],
      [4, 11, 8, 4, 9, 11, 0, 3, 11], [10, 11, 4], [1, 8, 2, 1, 9, 8, 8, 9, 10],
      [0, 8, 3, 1, 9, 10, 8, 1, 10], [9, 10, 1, 9, 1, 2, 2, 1, 0],
      [10, 3, 2, 10, 1, 3, 9, 1, 8, 1, 0, 8], [1, 8, 2, 8, 11, 2, 8, 4, 11, 10, 2, 11],
      [0, 8, 3, 1, 9, 11, 1, 11, 10, 11, 9, 4], [11, 2, 1, 11, 1, 7, 7, 1, 0, 5, 10, 4],
      [11, 2, 1, 11, 1, 7, 10, 4, 1, 4, 7, 1], [2, 3, 8, 2, 8, 11, 4, 10, 8, 10, 4, 7],
      [4, 10, 8, 4, 7, 10, 0, 8, 9, 7, 10, 9, 3, 11, 1],
      [1, 11, 10, 0, 9, 7, 9, 10, 7, 9, 4, 10], [0, 3, 11, 0, 11, 7, 7, 11, 10],
      [7, 10, 4], [0, 1, 8, 8, 1, 10], [0, 1, 8, 0, 8, 3, 8, 1, 10, 8, 10, 11],
      [0, 2, 1, 0, 3, 2], [8, 10, 11, 8, 11, 4, 10, 1, 11, 9, 11, 0, 1, 0, 11],
      [4, 10, 11, 9, 10, 4, 9, 3, 10, 9, 0, 3, 3, 10, 11],
      [2, 11, 4, 2, 4, 0, 0, 4, 9], [8, 3, 2, 8, 2, 4, 4, 2, 11, 10, 11, 2, 9, 4, 0],
      [1, 9, 4, 1, 4, 2, 2, 4, 8], [1, 9, 4, 1, 4, 2, 9, 3, 4, 8, 4, 2, 3, 2, 4],
      [0, 3, 2, 4, 9, 11], [4, 9, 11, 8, 4, 11], [2, 5, 9, 2, 8, 5, 8, 4, 5],
      [4, 9, 5, 4, 0, 9, 8, 5, 0, 2, 5, 3], [2, 1, 0, 2, 7, 1, 2, 5, 7, 5, 1, 4],
      [8, 5, 3, 8, 4, 5, 1, 0, 5, 7, 5, 0, 0, 5, 4], [9, 5, 2, 9, 7, 5, 7, 1, 5],
      [9, 5, 2, 9, 7, 5, 9, 0, 7, 8, 5, 3, 0, 3, 5],
      [5, 8, 4, 5, 3, 8, 5, 2, 3, 11, 8, 3, 1, 0, 9, 7, 9, 10],
      [5, 0, 1, 5, 1, 11, 5, 11, 4, 11, 1, 7, 10, 11, 9],
      [0, 3, 2, 9, 7, 4, 7, 10, 4], [9, 7, 4, 10, 7, 11, 10, 11, 2, 11, 7, 3],
      [2, 8, 5, 8, 11, 5, 11, 9, 5, 7, 5, 10, 9, 10, 5],
      [8, 0, 5, 8, 5, 3, 3, 5, 11, 7, 10, 9, 5, 11, 9],
      [1, 11, 7, 1, 7, 5, 5, 7, 10], [0, 9, 1, 5, 11, 7, 11, 10, 7],
      [0, 3, 2, 7, 10, 11], [7, 10, 11], [2, 9, 6, 2, 8, 9, 8, 4, 9],
      [3, 0, 6, 0, 5, 6, 0, 9, 5, 8, 9, 2, 5, 2, 6], [0, 1, 5, 0, 5, 6, 6, 5, 8],
      [8, 3, 6, 8, 6, 5, 6, 1, 5, 1, 9, 6], [2, 6, 11, 2, 1, 6, 1, 5, 6],
      [0, 8, 3, 1, 6, 11, 1, 5, 6], [5, 8, 0, 5, 6, 8, 11, 6, 2, 2, 6, 0],
      [6, 11, 5, 6, 5, 8, 8, 5, 3, 3, 5, 1], [11, 6, 3, 10, 6, 11, 9, 8, 4],
      [4, 9, 10, 6, 11, 3, 11, 10, 3], [0, 1, 6, 0, 6, 4, 4, 6, 11, 9, 6, 10, 11, 10, 6],
      [8, 3, 6, 8, 6, 4, 1, 6, 8, 10, 6, 11, 1, 11, 6],
      [9, 4, 5, 9, 11, 4, 9, 1, 11, 1, 10, 11],
      [4, 11, 5, 0, 8, 9, 8, 10, 9, 8, 11, 10], [0, 5, 1, 11, 5, 3, 5, 4, 3, 6, 3, 11],
      [8, 4, 11, 8, 11, 5, 5, 11, 1, 10, 11, 6, 1, 6, 11],
      [3, 6, 11], [2, 8, 11, 2, 11, 6, 8, 9, 11, 0, 8, 4, 9, 4, 11],
      [0, 9, 4, 5, 6, 2, 6, 11, 2], [2, 8, 11, 2, 11, 6, 0, 1, 8, 1, 9, 8],
      [6, 2, 11, 6, 11, 4, 4, 11, 9, 0, 9, 8, 3, 0, 1],
      [8, 2, 1, 8, 4, 2, 4, 6, 2, 10, 2, 11, 6, 11, 2],
      [2, 11, 4, 2, 4, 8, 0, 1, 4, 9, 4, 1, 10, 11, 6], [0, 1, 9, 11, 4, 8],
      [10, 2, 0, 10, 0, 6, 6, 0, 4], [10, 2, 0, 10, 0, 6, 8, 0, 4, 3, 0, 8],
      [7, 8, 11, 7, 11, 6, 6, 11, 2], [4, 8, 11, 4, 9, 11, 0, 8, 9, 6, 11, 7, 2, 10, 3],
      [0, 1, 7, 0, 7, 4, 7, 11, 4, 2, 10, 11, 11, 10, 7],
      [4, 11, 1, 4, 9, 11, 1, 10, 11, 6, 11, 7, 10, 7, 11], [4, 11, 8],
      [4, 9, 11, 3, 11, 8], [8, 4, 0, 8, 0, 6, 6, 0, 2], [0, 6, 2, 0, 8, 6, 3, 0, 8],
      [2, 6, 7, 0, 6, 4], [2, 6, 7, 2, 3, 6, 3, 8, 6, 3, 4, 8],
      [0, 5, 9, 6, 7, 11], [3, 0, 9, 6, 7, 11], [6, 7, 11], [7, 11, 6]
    ];

    const step = 2;
    let vertexCount = 0;

    for (let i = 0; i < nx - 1; i += step) {
      for (let j = 0; j < ny - 1; j += step) {
        for (let k = 0; k < nz - 1; k += step) {
          const cubeValues: number[] = [];
          const cubeVertices: [number, number, number][] = [];

          for (let v = 0; v < 8; v++) {
            const [di, dj, dk] = cubeOffsets[v];
            const val = getValue(i + di, j + dj, k + dk);
            cubeValues.push(val);
            cubeVertices.push([
              (i + di) * scale - offsetX,
              (j + dj) * scale - offsetY,
              (k + dk) * scale - offsetZ
            ]);
          }

          let cubeIndex = 0;
          for (let v = 0; v < 8; v++) {
            if (cubeValues[v] >= threshold) cubeIndex |= 1 << v;
          }

          if (cubeIndex === 0 || cubeIndex === 255) continue;

          const triIndices = triTable[cubeIndex];
          if (!triIndices || triIndices.length === 0) continue;

          for (let e = 0; e < 12; e++) {
            const [v1, v2] = edgeIndices[e];
            const val1 = cubeValues[v1];
            const val2 = cubeValues[v2];
            const p1 = cubeVertices[v1];
            const p2 = cubeVertices[v2];

            const t = (threshold - val1) / (val2 - val1 + 1e-10);
            edgePositions[e * 3] = p1[0] + t * (p2[0] - p1[0]);
            edgePositions[e * 3 + 1] = p1[1] + t * (p2[1] - p1[1]);
            edgePositions[e * 3 + 2] = p1[2] + t * (p2[2] - p1[2]);
          }

          for (let t = 0; t < triIndices.length; t += 3) {
            for (let v = 0; v < 3; v++) {
              const edgeIdx = triIndices[t + v];
              const x = edgePositions[edgeIdx * 3];
              const y = edgePositions[edgeIdx * 3 + 1];
              const z = edgePositions[edgeIdx * 3 + 2];
              positions.push(x, y, z);

              const hue = 0.5 + (i / nx) * 0.15;
              const color = new THREE.Color().setHSL(hue, 0.75, 0.5);
              colors.push(color.r, color.g, color.b);
            }
            vertexCount++;
          }

          if (vertexCount > 25000) break;
        }
        if (vertexCount > 25000) break;
      }
      if (vertexCount > 25000) break;
    }

    const posArray = new Float32Array(positions);
    const colArray = new Float32Array(colors);
    const normArray = new Float32Array(positions.length);

    for (let i = 0; i < positions.length; i += 9) {
      const ax = positions[i], ay = positions[i + 1], az = positions[i + 2];
      const bx = positions[i + 3], by = positions[i + 4], bz = positions[i + 5];
      const cx = positions[i + 6], cy = positions[i + 7], cz = positions[i + 8];

      const nx1 = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
      const ny1 = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      const nz1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const len = Math.sqrt(nx1 * nx1 + ny1 * ny1 + nz1 * nz1) + 1e-10;

      for (let v = 0; v < 3; v++) {
        normArray[i + v * 3] = nx1 / len;
        normArray[i + v * 3 + 1] = ny1 / len;
        normArray[i + v * 3 + 2] = nz1 / len;
      }
    }

    return {
      positions: posArray,
      normals: normArray,
      colors: colArray
    };
  }, [volumeData]);

  if (!volumeData || positions.length === 0) {
    return null;
  }

  return (
    <mesh ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-normal"
          count={normals.length / 3}
          array={normals}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={colors.length / 3}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <meshStandardMaterial
        ref={materialRef}
        vertexColors
        transparent
        opacity={0.9}
        roughness={0.3}
        metalness={0.2}
        emissive="#1a4a5a"
        emissiveIntensity={0.3}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function LoadingPlaceholder() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.01;
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.5) * 0.2;
    }
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[20, 1]} />
      <meshStandardMaterial
        color="#64ffda"
        wireframe
        transparent
        opacity={0.5}
      />
    </mesh>
  );
}

export function Crystal3DViewer() {
  const { isosurfaceData } = useSimulationStore();

  const volumeData = useMemo((): VolumeData | null => {
    if (!isosurfaceData || !isosurfaceData.x.length) {
      return null;
    }

    const { x, y, z, values, dimensions } = isosurfaceData;
    const [nx, ny, nz] = dimensions;
    const data = new Uint8Array(nx * ny * nz);

    for (let i = 0; i < x.length; i++) {
      const idx = x[i] + y[i] * nx + z[i] * nx * ny;
      if (idx >= 0 && idx < data.length) {
        data[idx] = Math.floor(values[i] * 255);
      }
    }

    return { data, dimensions: dimensions as [number, number, number] };
  }, [isosurfaceData]);

  return (
    <div className="w-full h-full relative">
      <Canvas
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        dpr={[1, Math.min(window.devicePixelRatio, 1.5)]}
        performance={{ min: 0.5 }}
      >
        <PerspectiveCamera makeDefault position={[0, 0, 120]} fov={50} />
        
        <color attach="background" args={['#020c1b']} />
        <fog attach="fog" args={['#020c1b', 80, 250]} />
        
        <ambientLight intensity={0.4} />
        <pointLight position={[60, 60, 60]} intensity={1.2} color="#64ffda" />
        <pointLight position={[-60, -40, -60]} intensity={0.6} color="#00ff88" />
        <directionalLight position={[0, 50, 0]} intensity={0.3} color="#ffffff" />
        
        {volumeData ? <CrystalMesh volumeData={volumeData} /> : <LoadingPlaceholder />}
        
        <gridHelper args={[150, 15, '#1a365d', '#1a365d']} position={[0, -45, 0]} />
        
        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          minDistance={60}
          maxDistance={300}
          enablePan={false}
        />
        
        <EffectComposer>
          <Bloom
            intensity={1.0}
            luminanceThreshold={0.4}
            luminanceSmoothing={0.9}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
      
      <div className="absolute bottom-4 left-4 text-slate-500 text-sm font-mono">
        <p>🖱️ 拖拽旋转 | 滚轮缩放</p>
      </div>
    </div>
  );
}
