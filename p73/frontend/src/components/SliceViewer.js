import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import axios from 'axios';
import { Box, Typography, Paper, Slider, FormControl, InputLabel, Select, MenuItem } from '@mui/material';

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

function DoseTexture({ sliceData, minDose, maxDose }) {
  const textureRef = useRef();
  
  const texture = useMemo(() => {
    if (!sliceData || sliceData.length === 0) return null;
    
    const data = sliceData;
    const width = data[0].length;
    const height = data.length;
    
    const imgData = new Uint8Array(width * height * 4);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dose = data[y][x];
        const normDose = maxDose > minDose ? (dose - minDose) / (maxDose - minDose) : 0;
        
        let r, g, b;
        if (normDose <= 0) {
          r = g = b = 20;
        } else {
          const colorIdx = Math.floor((1 - Math.min(normDose, 1)) * (ISO_COLORS.length - 1));
          const color = new THREE.Color(ISO_COLORS[Math.min(colorIdx, ISO_COLORS.length - 1)]);
          r = Math.floor(color.r * 255);
          g = Math.floor(color.g * 255);
          b = Math.floor(color.b * 255);
        }
        
        const idx = (y * width + x) * 4;
        imgData[idx] = r;
        imgData[idx + 1] = g;
        imgData[idx + 2] = b;
        imgData[idx + 3] = 255;
      }
    }
    
    const tex = new THREE.DataTexture(imgData, width, height, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }, [sliceData, minDose, maxDose]);
  
  if (!texture) return null;
  
  return (
    <mesh>
      <planeGeometry args={[200, 200]} />
      <meshBasicMaterial map={texture} side={THREE.DoubleSide} />
    </mesh>
  );
}

function IsoContours2D({ contours, spacing, origin, axis }) {
  return (
    <>
      {contours.map((iso, isoIdx) => (
        <group key={isoIdx}>
          {iso.contours.map((contour, cIdx) => {
            const points = contour.map(p => 
              new THREE.Vector3(
                (p[0] - origin[0]) * (200 / (100 * spacing[0])) - 100,
                (p[1] - origin[1]) * (200 / (100 * spacing[1])) - 100,
                0.1
              )
            );
            
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const color = ISO_COLORS[Math.min(isoIdx, ISO_COLORS.length - 1)];
            
            return (
              <line key={cIdx}>
                <bufferGeometry attach="geometry" {...geometry} />
                <lineBasicMaterial attach="material" color={color} linewidth={3} />
              </line>
            );
          })}
        </group>
      ))}
    </>
  );
}

function SliceViewer({ planId, axis, index, showIsoContours }) {
  const [sliceData, setSliceData] = useState(null);
  const [contours, setContours] = useState([]);
  const [currentAxis, setCurrentAxis] = useState(axis);
  const [currentIndex, setCurrentIndex] = useState(index);
  
  useEffect(() => {
    if (!planId) return;
    
    const fetchSlice = async () => {
      try {
        const response = await axios.get(`/plans/${planId}/dose/slice`, {
          params: { axis: currentAxis, index: currentIndex }
        });
        setSliceData(response.data);
        
        if (showIsoContours) {
          const contourResponse = await axios.get(`/plans/${planId}/dose/iso-contours`, {
            params: { axis: currentAxis, index: currentIndex, levels: '0.9,0.8,0.7,0.6,0.5,0.4,0.3,0.2,0.1' }
          });
          setContours(contourResponse.data.iso_contours || []);
        }
      } catch (error) {
        console.error('Error fetching slice:', error);
      }
    };
    
    fetchSlice();
  }, [planId, currentAxis, currentIndex, showIsoContours]);
  
  if (!sliceData) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <Paper sx={{ p: 4 }}>
          <Typography>Loading slice data...</Typography>
        </Paper>
      </Box>
    );
  }
  
  return (
    <Box sx={{ width: '100%', height: 'calc(100vh - 64px)', position: 'relative' }}>
      <Box sx={{ position: 'absolute', top: 10, left: 10, zIndex: 100 }}>
        <Paper sx={{ p: 2, mb: 1 }}>
          <Typography variant="h6" gutterBottom>Slice View</Typography>
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel>Axis</InputLabel>
            <Select
              value={currentAxis}
              label="Axis"
              onChange={(e) => setCurrentAxis(e.target.value)}
            >
              <MenuItem value="x">X (Sagittal)</MenuItem>
              <MenuItem value="y">Y (Coronal)</MenuItem>
              <MenuItem value="z">Z (Axial)</MenuItem>
            </Select>
          </FormControl>
          <Typography gutterBottom>Slice: {currentIndex}</Typography>
          <Slider
            value={currentIndex}
            onChange={(e, val) => setCurrentIndex(val)}
            min={0}
            max={99}
            valueLabelDisplay="auto"
            sx={{ mb: 2 }}
          />
          <Typography variant="body2">Max Dose: {sliceData.max_dose.toFixed(2)} Gy</Typography>
          <Typography variant="body2">Axis: {currentAxis.toUpperCase()}</Typography>
        </Paper>
      </Box>
      
      <Canvas>
        <PerspectiveCamera makeDefault position={[0, 0, 300]} />
        <OrbitControls enableZoom enablePan enableRotate={false} />
        <ambientLight intensity={1} />
        
        <DoseTexture 
          sliceData={sliceData.data} 
          minDose={sliceData.min_dose} 
          maxDose={sliceData.max_dose} 
        />
        
        {showIsoContours && (
          <IsoContours2D 
            contours={contours} 
            spacing={sliceData.spacing}
            origin={sliceData.origin}
          />
        )}
        
        <gridHelper args={[200, 20, '#444444', '#222222']} position={[0, 0, -0.1]} />
      </Canvas>
      
      <Box sx={{ position: 'absolute', bottom: 10, right: 10, zIndex: 100 }}>
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
              <Typography variant="caption">
                {(level * 100).toFixed(0)}% ({(level * sliceData.max_dose).toFixed(2)} Gy)
              </Typography>
            </div>
          ))}
        </Paper>
      </Box>
      
      <Box sx={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 100 }}>
        <Paper sx={{ p: 1, px: 2 }}>
          <Typography variant="caption">Use mouse wheel to zoom, drag to pan</Typography>
        </Paper>
      </Box>
    </Box>
  );
}

export default SliceViewer;
