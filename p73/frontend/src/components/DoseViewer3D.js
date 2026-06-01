import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Box } from '@react-three/drei';
import * as THREE from 'three';
import axios from 'axios';
import { Box as MuiBox, Typography, Paper } from '@mui/material';

const ISO_LEVELS = [0.95, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];
const ISO_COLORS = [
  '#ff0000',
  '#ff4400',
  '#ff8800',
  '#ffcc00',
  '#ffff00',
  '#88ff00',
  '#00ff00',
  '#00ff88',
  '#00ffff',
  '#0088ff'
];

function DoseCloud({ volumeData, shape, spacing, origin, maxDose, showCloud }) {
  const instancedMeshRef = useRef();
  
  const { positions, colors } = useMemo(() => {
    if (!volumeData || !showCloud) return { positions: [], colors: [] };
    
    const [nx, ny, nz] = shape;
    const [sx, sy, sz] = spacing;
    const [ox, oy, oz] = origin;
    const data = new Float32Array(volumeData);
    
    const positions = [];
    const colors = [];
    const threshold = maxDose * 0.1;
    
    const step = 2;
    for (let i = 0; i < nx; i += step) {
      for (let j = 0; j < ny; j += step) {
        for (let k = 0; k < nz; k += step) {
          const idx = i * ny * nz + j * nz + k;
          const dose = data[idx];
          if (dose > threshold) {
            const x = ox + i * sx;
            const y = oy + j * sy;
            const z = oz + k * sz;
            positions.push(x, y, z);
            
            const normDose = Math.min(dose / maxDose, 1.0);
            const colorIdx = Math.floor((1 - normDose) * (ISO_COLORS.length - 1));
            const color = new THREE.Color(ISO_COLORS[Math.min(colorIdx, ISO_COLORS.length - 1)]);
            colors.push(color.r, color.g, color.b);
          }
        }
      }
    }
    return { positions, colors };
  }, [volumeData, shape, spacing, origin, maxDose, showCloud]);
  
  if (!showCloud || positions.length === 0) return null;
  
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={new Float32Array(positions)}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={colors.length / 3}
          array={new Float32Array(colors)}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={1.5} vertexColors transparent opacity={0.6} sizeAttenuation />
    </points>
  );
}

function IsoContourLines({ planId, axis, index, spacing, origin, showContours, shape }) {
  const [contours, setContours] = useState([]);
  const [sliceInfo, setSliceInfo] = useState(null);
  
  useEffect(() => {
    if (!showContours || !planId) return;
    
    const fetchContours = async () => {
      try {
        const response = await axios.get(`/plans/${planId}/dose/iso-contours`, {
          params: { axis, index, levels: '0.9,0.8,0.7,0.6,0.5,0.4,0.3,0.2,0.1' }
        });
        setContours(response.data.iso_contours || []);
        setSliceInfo(response.data.slice_info);
      } catch (error) {
        console.error('Error fetching iso contours:', error);
      }
    };
    
    fetchContours();
  }, [planId, axis, index, showContours]);
  
  if (!showContours || contours.length === 0) return null;
  
  return (
    <>
      {contours.map((iso, isoIdx) => (
        <group key={isoIdx}>
          {iso.contours.map((contour, cIdx) => {
            const points = contour.map(p => {
              if (axis === 'x') {
                const x = origin[0] + index * spacing[0];
                return new THREE.Vector3(x, p[0], p[1]);
              } else if (axis === 'y') {
                const y = origin[1] + index * spacing[1];
                return new THREE.Vector3(p[0], y, p[1]);
              } else {
                const z = origin[2] + index * spacing[2];
                return new THREE.Vector3(p[0], p[1], z);
              }
            });
            
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const color = ISO_COLORS[Math.min(isoIdx, ISO_COLORS.length - 1)];
            
            return (
              <line key={cIdx}>
                <bufferGeometry attach="geometry" {...geometry} />
                <lineBasicMaterial attach="material" color={color} linewidth={2} />
              </line>
            );
          })}
        </group>
      ))}
    </>
  );
}

function AxesGrid({ bounds }) {
  return (
    <group>
      <gridHelper args={[200, 20, '#444444', '#333333']} position={[0, 0, bounds[2][1]]} />
      <gridHelper args={[200, 20, '#444444', '#333333']} position={[0, 0, bounds[2][0]]} rotation={[Math.PI, 0, 0]} />
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={new Float32Array([
              bounds[0][0], 0, 0,
              bounds[0][1], 0, 0,
              0, bounds[1][0], 0,
              0, bounds[1][1], 0,
              0, 0, bounds[2][0],
              0, 0, bounds[2][1]
            ])}
            count={6}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial attach="material" color="#ff0000" />
      </line>
    </group>
  );
}

function SlicePlane({ axis, index, spacing, origin, shape }) {
  const [nx, ny, nz] = shape;
  const [sx, sy, sz] = spacing;
  const [ox, oy, oz] = origin;
  
  let position, rotation, width, height;
  
  if (axis === 'x') {
    const x = ox + Math.min(Math.max(index, 0), nx - 1) * sx;
    position = [x, oy + ny * sy / 2, oz + nz * sz / 2];
    rotation = [0, Math.PI / 2, 0];
    width = ny * sy;
    height = nz * sz;
  } else if (axis === 'y') {
    const y = oy + Math.min(Math.max(index, 0), ny - 1) * sy;
    position = [ox + nx * sx / 2, y, oz + nz * sz / 2];
    rotation = [Math.PI / 2, 0, 0];
    width = nx * sx;
    height = nz * sz;
  } else {
    const z = oz + Math.min(Math.max(index, 0), nz - 1) * sz;
    position = [ox + nx * sx / 2, oy + ny * sy / 2, z];
    rotation = [0, 0, 0];
    width = nx * sx;
    height = ny * sy;
  }
  
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial color="#222266" transparent opacity={0.2} side={THREE.DoubleSide} />
    </mesh>
  );
}

function DoseViewer3D({ planId, showIsoContours, showVolumeCloud }) {
  const [doseData, setDoseData] = useState(null);
  const [sliceAxis, setSliceAxis] = useState('z');
  const [sliceIndex, setSliceIndex] = useState(50);
  
  useEffect(() => {
    if (!planId) return;
    
    const fetchDose = async () => {
      try {
        const response = await axios.get(`/plans/${planId}/dose/volume`);
        setDoseData(response.data);
      } catch (error) {
        console.error('Error fetching dose volume:', error);
      }
    };
    
    fetchDose();
  }, [planId]);
  
  if (!doseData) {
    return (
      <MuiBox sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <Paper sx={{ p: 4 }}>
          <Typography>Loading dose data...</Typography>
        </Paper>
      </MuiBox>
    );
  }
  
  const bounds = [
    [doseData.origin[0], doseData.origin[0] + doseData.shape[0] * doseData.spacing[0]],
    [doseData.origin[1], doseData.origin[1] + doseData.shape[1] * doseData.spacing[1]],
    [doseData.origin[2], doseData.origin[2] + doseData.shape[2] * doseData.spacing[2]]
  ];
  
  return (
    <MuiBox sx={{ width: '100%', height: 'calc(100vh - 64px)', position: 'relative' }}>
      <MuiBox sx={{ position: 'absolute', top: 10, left: 10, zIndex: 100 }}>
        <Paper sx={{ p: 2, mb: 1 }}>
          <Typography variant="body2">Max Dose: {doseData.max_dose.toFixed(2)} Gy</Typography>
          <Typography variant="body2">Grid Size: {doseData.shape.join(' x ')}</Typography>
        </Paper>
      </MuiBox>
      
      <Canvas>
        <PerspectiveCamera makeDefault position={[300, 200, 300]} />
        <OrbitControls enableDamping dampingFactor={0.05} />
        <ambientLight intensity={0.6} />
        <pointLight position={[300, 300, 300]} intensity={0.8} />
        
        <AxesGrid bounds={bounds} />
        
        <DoseCloud
          volumeData={doseData.subsampled_data}
          shape={doseData.subsampled_shape}
          spacing={[
            doseData.spacing[0] * (doseData.shape[0] / doseData.subsampled_shape[0]),
            doseData.spacing[1] * (doseData.shape[1] / doseData.subsampled_shape[1]),
            doseData.spacing[2] * (doseData.shape[2] / doseData.subsampled_shape[2])
          ]}
          origin={doseData.origin}
          maxDose={doseData.max_dose}
          showCloud={showVolumeCloud}
        />
        
        <SlicePlane
          axis={sliceAxis}
          index={sliceIndex}
          spacing={doseData.spacing}
          origin={doseData.origin}
          shape={doseData.shape}
        />
        
        <IsoContourLines
          planId={planId}
          axis={sliceAxis}
          index={sliceIndex}
          spacing={doseData.spacing}
          origin={doseData.origin}
          showContours={showIsoContours}
        />
      </Canvas>
      
      <MuiBox sx={{ position: 'absolute', bottom: 10, left: 10, zIndex: 100 }}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="body2" gutterBottom>Slice View (for contour lines)</Typography>
          <select 
            value={sliceAxis} 
            onChange={(e) => setSliceAxis(e.target.value)}
            style={{ marginRight: 10 }}
          >
            <option value="x">X (Sagittal)</option>
            <option value="y">Y (Coronal)</option>
            <option value="z">Z (Axial)</option>
          </select>
          <input
            type="range"
            min="0"
            max="99"
            value={sliceIndex}
            onChange={(e) => setSliceIndex(parseInt(e.target.value))}
            style={{ width: 150 }}
          />
          <Typography variant="caption"> Slice: {sliceIndex}</Typography>
        </Paper>
      </MuiBox>
      
      <MuiBox sx={{ position: 'absolute', bottom: 10, right: 10, zIndex: 100 }}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="body2" gutterBottom>Isodose Legend</Typography>
          {ISO_LEVELS.slice(0, 6).map((level, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ 
                width: 20, 
                height: 12, 
                backgroundColor: ISO_COLORS[idx],
                marginRight: 8
              }} />
              <Typography variant="caption">{(level * 100).toFixed(0)}%</Typography>
            </div>
          ))}
        </Paper>
      </MuiBox>
    </MuiBox>
  );
}

export default DoseViewer3D;
