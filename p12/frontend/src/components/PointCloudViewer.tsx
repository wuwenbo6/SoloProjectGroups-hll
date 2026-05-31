import React, { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Detection } from '../types';

interface PointCloudViewerProps {
  points: number[];
  detections: Detection[];
  selectedDetectionId?: number | null;
  onBoxSelect?: (id: number | null) => void;
  pointSize?: number;
  colorMode?: 'height' | 'intensity' | 'uniform';
}

const PointCloudViewer: React.FC<PointCloudViewerProps> = ({
  points,
  detections,
  selectedDetectionId,
  onBoxSelect,
  pointSize = 0.05,
  colorMode = 'height',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const pointCloudRef = useRef<THREE.Points | null>(null);
  const boxesRef = useRef<Map<number, THREE.Group>>(new Map());
  const animationIdRef = useRef<number>(0);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());

  const getPointColor = useCallback((index: number, pointsArray: Float32Array): THREE.Color => {
    if (colorMode === 'height') {
      const y = pointsArray[index * 3 + 1];
      const normalizedY = Math.max(0, Math.min(1, (y + 2) / 4));
      const hue = (1 - normalizedY) * 0.65;
      return new THREE.Color().setHSL(hue, 0.8, 0.5);
    }
    return new THREE.Color(0x88ccff);
  }, [colorMode]);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e17);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      60,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(10, 10, 10);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1;
    controls.maxDistance = 100;
    controlsRef.current = controls;

    const gridHelper = new THREE.GridHelper(50, 50, 0x334155, 0x1e293b);
    gridHelper.position.y = -1;
    scene.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationIdRef.current);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    if (!sceneRef.current || points.length === 0) return;

    if (pointCloudRef.current) {
      sceneRef.current.remove(pointCloudRef.current);
      pointCloudRef.current.geometry.dispose();
      (pointCloudRef.current.material as THREE.PointsMaterial).dispose();
    }

    const numPoints = Math.floor(points.length / 3);
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(points.slice(0, numPoints * 3));
    const colors = new Float32Array(numPoints * 3);

    for (let i = 0; i < numPoints; i++) {
      const color = getPointColor(i, positions);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: pointSize,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
    });

    const pointCloud = new THREE.Points(geometry, material);
    sceneRef.current.add(pointCloud);
    pointCloudRef.current = pointCloud;
  }, [points, pointSize, getPointColor]);

  useEffect(() => {
    if (!sceneRef.current) return;

    boxesRef.current.forEach((box) => {
      sceneRef.current?.remove(box);
    });
    boxesRef.current.clear();

    detections.forEach((det) => {
      const boxGroup = createBoundingBox(det, det.id === selectedDetectionId);
      boxGroup.userData = { detectionId: det.id };
      sceneRef.current?.add(boxGroup);
      boxesRef.current.set(det.id, boxGroup);
    });
  }, [detections, selectedDetectionId]);

  const createBoundingBox = (det: Detection, isSelected: boolean): THREE.Group => {
    const group = new THREE.Group();

    const { x, y, z, w, h, l, rotation_y, class_name } = det;

    const isCar = class_name === 'Car';
    const boxColor = isCar ? 0x22c55e : 0xf59e0b;
    const edgeColor = isSelected ? 0x3b82f6 : boxColor;

    const geometry = new THREE.BoxGeometry(w, h, l);
    const material = new THREE.MeshBasicMaterial({
      color: boxColor,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
    });
    const boxMesh = new THREE.Mesh(geometry, material);

    const edges = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: edgeColor,
      linewidth: isSelected ? 2 : 1,
    });
    const wireframe = new THREE.LineSegments(edges, lineMaterial);

    const center = new THREE.Vector3(x, y, z);

    boxMesh.position.copy(center);
    boxMesh.rotation.y = rotation_y || 0;
    wireframe.position.copy(center);
    wireframe.rotation.y = rotation_y || 0;

    group.add(boxMesh);
    group.add(wireframe);

    const arrowGeometry = new THREE.ConeGeometry(0.3, 0.6, 8);
    const arrowMaterial = new THREE.MeshBasicMaterial({ color: edgeColor });
    const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
    arrow.position.set(x + l / 2, y, z);
    arrow.rotation.z = -Math.PI / 2;
    arrow.rotation.y = rotation_y || 0;
    group.add(arrow);

    return group;
  };

  const handleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !cameraRef.current || !onBoxSelect) return;

    const rect = containerRef.current.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

    const boxMeshes: THREE.Mesh[] = [];
    boxesRef.current.forEach((boxGroup) => {
      boxGroup.traverse((child) => {
        if (child instanceof THREE.Mesh && child.geometry instanceof THREE.BoxGeometry) {
          boxMeshes.push(child);
        }
      });
    });

    const intersects = raycasterRef.current.intersectObjects(boxMeshes);

    if (intersects.length > 0) {
      const clickedMesh = intersects[0].object;
      let parent = clickedMesh.parent;
      while (parent && !parent.userData.detectionId) {
        parent = parent.parent;
      }
      if (parent && parent.userData.detectionId !== undefined) {
        onBoxSelect(parent.userData.detectionId);
        return;
      }
    }
    onBoxSelect(null);
  }, [onBoxSelect]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      onClick={handleClick}
      style={{ cursor: 'crosshair' }}
    >
      <div className="absolute bottom-4 left-4 bg-dark-surface/80 backdrop-blur-sm rounded-lg px-3 py-2 text-xs font-mono text-gray-400">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-red-500"></span> X
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-green-500"></span> Y
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-blue-500"></span> Z
          </span>
        </div>
      </div>
      <div className="absolute top-4 right-4 bg-dark-surface/80 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-gray-400">
        <div>点数量: {Math.floor(points.length / 3).toLocaleString()}</div>
        <div>检测框: {detections.length}</div>
      </div>
    </div>
  );
};

export default PointCloudViewer;
