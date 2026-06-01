import { useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useVolumeStore } from '../store/useVolumeStore';

import vertexShader from '../shaders/raycast.vert?raw';
import fragmentShader from '../shaders/raycast.frag?raw';

interface VolumeMeshProps {
  volumeData: Uint8Array;
  dimensions: { x: number; y: number; z: number };
}

function VolumeMesh({ volumeData, dimensions }: VolumeMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();

  const { renderParams, clipPlanes } = useVolumeStore();

  const texture3D = useMemo(() => {
    const dataArray = new Uint8Array(volumeData);

    const texture = new THREE.Data3DTexture(
      dataArray,
      dimensions.x,
      dimensions.y,
      dimensions.z
    );

    texture.format = THREE.RedFormat;
    texture.type = THREE.UnsignedByteType;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;

    return texture;
  }, [volumeData, dimensions]);

  const uniforms = useMemo(() => {
    return {
      uVolumeData: { value: texture3D },
      uVolumeDimensions: { value: new THREE.Vector3(dimensions.x, dimensions.y, dimensions.z) },
      uVolumeSpacing: { value: new THREE.Vector3(1, 1, 1) },
      uWindowWidth: { value: renderParams.windowWidth },
      uWindowLevel: { value: renderParams.windowLevel },
      uOpacityThreshold: { value: renderParams.opacityThreshold },
      uSampleDistance: { value: renderParams.sampleDistance },
      uRenderMode: { value: renderParams.renderMode === 'mip' ? 0 : 1 },
      uClipPlaneX: { value: new THREE.Vector3(clipPlanes.x.position - 0.5, 0, 0) },
      uClipPlaneY: { value: new THREE.Vector3(0, clipPlanes.y.position - 0.5, 0) },
      uClipPlaneZ: { value: new THREE.Vector3(0, 0, clipPlanes.z.position - 0.5) },
      uClipXEnabled: { value: clipPlanes.x.enabled },
      uClipYEnabled: { value: clipPlanes.y.enabled },
      uClipZEnabled: { value: clipPlanes.z.enabled },
      uCameraPosition: { value: new THREE.Vector3() },
      uInverseModelMatrix: { value: new THREE.Matrix4() },
    };
  }, [texture3D, dimensions, renderParams, clipPlanes]);

  useFrame(() => {
    if (meshRef.current) {
      const material = meshRef.current.material as THREE.ShaderMaterial;
      material.uniforms.uWindowWidth.value = renderParams.windowWidth;
      material.uniforms.uWindowLevel.value = renderParams.windowLevel;
      material.uniforms.uOpacityThreshold.value = renderParams.opacityThreshold;
      material.uniforms.uSampleDistance.value = renderParams.sampleDistance;
      material.uniforms.uRenderMode.value = renderParams.renderMode === 'mip' ? 0 : 1;

      material.uniforms.uClipPlaneX.value.set(clipPlanes.x.position * dimensions.x - dimensions.x / 2, 0, 0);
      material.uniforms.uClipPlaneY.value.set(0, clipPlanes.y.position * dimensions.y - dimensions.y / 2, 0);
      material.uniforms.uClipPlaneZ.value.set(0, 0, clipPlanes.z.position * dimensions.z - dimensions.z / 2);
      material.uniforms.uClipXEnabled.value = clipPlanes.x.enabled;
      material.uniforms.uClipYEnabled.value = clipPlanes.y.enabled;
      material.uniforms.uClipZEnabled.value = clipPlanes.z.enabled;

      material.uniforms.uCameraPosition.value.copy(camera.position);
      material.uniforms.uInverseModelMatrix.value.copy(meshRef.current.matrixWorld).invert();
    }
  });

  const geometry = useMemo(() => {
    const geo = new THREE.BoxGeometry(dimensions.x, dimensions.y, dimensions.z);
    return geo;
  }, [dimensions]);

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        side={THREE.BackSide}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

function AxesHelper() {
  const { showAxes } = useVolumeStore();
  if (!showAxes) return null;
  return <axesHelper args={[100]} />;
}

function BoundingBox({ dimensions }: { dimensions: { x: number; y: number; z: number } }) {
  const { showBoundingBox } = useVolumeStore();
  if (!showBoundingBox) return null;

  const geometry = useMemo(() => {
    return new THREE.BoxGeometry(dimensions.x, dimensions.y, dimensions.z);
  }, [dimensions]);

  return (
    <lineSegments geometry={new THREE.EdgesGeometry(geometry)}>
      <lineBasicMaterial color="#06b6d4" transparent opacity={0.5} />
    </lineSegments>
  );
}

function ClipPlaneVisual({
  axis,
  dimensions,
}: {
  axis: 'x' | 'y' | 'z';
  dimensions: { x: number; y: number; z: number };
}) {
  const { clipPlanes, setClipPlane } = useVolumeStore();
  const planeState = clipPlanes[axis];

  if (!planeState.enabled) return null;

  const planeSize = useMemo(() => {
    if (axis === 'x') return [dimensions.y, dimensions.z];
    if (axis === 'y') return [dimensions.x, dimensions.z];
    return [dimensions.x, dimensions.y];
  }, [axis, dimensions]);

  const position = useMemo(() => {
    const pos = planeState.position;
    if (axis === 'x') return [(pos - 0.5) * dimensions.x, 0, 0];
    if (axis === 'y') return [0, (pos - 0.5) * dimensions.y, 0];
    return [0, 0, (pos - 0.5) * dimensions.z];
  }, [axis, dimensions, planeState.position]);

  const rotation = useMemo(() => {
    if (axis === 'x') return [0, Math.PI / 2, 0];
    if (axis === 'y') return [Math.PI / 2, 0, 0];
    return [0, 0, 0];
  }, [axis]);

  const colors = {
    x: '#ef4444',
    y: '#22c55e',
    z: '#3b82f6',
  };

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={planeSize} />
      <meshBasicMaterial
        color={colors[axis]}
        transparent
        opacity={0.15}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
      <lineSegments geometry={new THREE.EdgesGeometry(new THREE.PlaneGeometry(planeSize[0], planeSize[1]))}>
        <lineBasicMaterial color={colors[axis]} />
      </lineSegments>
    </mesh>
  );
}

interface VolumeRendererProps {
  onContextReady?: (gl: THREE.WebGLRenderer) => void;
}

export default function VolumeRenderer({ onContextReady }: VolumeRendererProps) {
  const { volume } = useVolumeStore();

  const onCreated = ({ gl }: { gl: THREE.WebGLRenderer }) => {
    onContextReady?.(gl);
  };

  if (!volume.loaded || !volume.data || !volume.meta) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="text-slate-400 text-lg mb-2">准备加载体数据</div>
          <div className="text-slate-500 text-sm">请上传DICOM文件或使用示例数据</div>
        </div>
      </div>
    );
  }

  const dimensions = volume.meta.dimensions;
  const maxDim = Math.max(dimensions.x, dimensions.y, dimensions.z);
  const cameraDistance = maxDim * 2;

  return (
    <Canvas
      camera={{ position: [cameraDistance, cameraDistance * 0.5, cameraDistance], fov: 45 }}
      gl={{ antialias: true, alpha: false }}
      onCreated={onCreated}
      style={{ background: '#0a1628' }}
    >
      <color attach="background" args={['#0a1628']} />

      <VolumeMesh volumeData={volume.data} dimensions={dimensions} />

      <BoundingBox dimensions={dimensions} />
      <AxesHelper />

      <ClipPlaneVisual axis="x" dimensions={dimensions} />
      <ClipPlaneVisual axis="y" dimensions={dimensions} />
      <ClipPlaneVisual axis="z" dimensions={dimensions} />

      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={maxDim * 0.5}
        maxDistance={maxDim * 5}
      />
    </Canvas>
  );
}
