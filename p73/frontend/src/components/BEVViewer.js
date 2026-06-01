import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, Paper, FormControl, InputLabel, Select, MenuItem, Grid, Slider } from '@mui/material';
import axios from 'axios';

function BEVViewer({ planId, beams }) {
  const [selectedBeamId, setSelectedBeamId] = useState(null);
  const [bevData, setBevData] = useState(null);
  const [windowLevel, setWindowLevel] = useState(1.0);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (beams && beams.length > 0 && !selectedBeamId) {
      setSelectedBeamId(beams[0].id);
    }
  }, [beams]);

  useEffect(() => {
    if (planId && selectedBeamId) {
      fetchBEV();
    }
  }, [planId, selectedBeamId]);

  useEffect(() => {
    drawBEV();
  }, [bevData, windowLevel]);

  const fetchBEV = async () => {
    try {
      const response = await axios.get(`/plans/${planId}/bev`, {
        params: { beam_id: selectedBeamId, view_size: 256 }
      });
      setBevData(response.data);
      if (response.data.max_dose > 0) {
        setWindowLevel(response.data.max_dose);
      }
    } catch (error) {
      console.error('Error fetching BEV:', error);
    }
  };

  const drawBEV = () => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current || !bevData) return;

    const size = Math.min(containerRef.current.clientWidth - 40, 512);
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);

    const imageData = ctx.createImageData(size, size);
    const bevImage = bevData.bev_image;
    const bevSize = bevData.shape[0];
    const scale = size / bevSize;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const bevX = Math.floor(x / scale);
        const bevY = Math.floor(y / scale);
        let dose = 0;
        
        if (bevX < bevSize && bevY < bevSize) {
          dose = bevImage[bevY][bevX] || 0;
        }

        const intensity = windowLevel > 0 ? Math.min(dose / windowLevel, 1.0) : 0;
        const pixelIndex = (y * size + x) * 4;

        const [r, g, b] = doseToColor(intensity);
        imageData.data[pixelIndex] = r;
        imageData.data[pixelIndex + 1] = g;
        imageData.data[pixelIndex + 2] = b;
        imageData.data[pixelIndex + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    const [jawX1, jawX2, jawY1, jawY2] = bevData.jaw_positions;
    const fieldHalfX = bevData.field_size[0] / 2;
    const fieldHalfY = bevData.field_size[1] / 2;
    
    const scaleMmToPixel = (size / 2) / (bevSize * bevData.spacing[0] / 2);
    
    const centerX = size / 2;
    const centerY = size / 2;
    
    const rectX = centerX + jawX1 * scaleMmToPixel;
    const rectY = centerY + jawY1 * scaleMmToPixel;
    const rectW = (jawX2 - jawX1) * scaleMmToPixel;
    const rectH = (jawY2 - jawY1) * scaleMmToPixel;

    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.strokeRect(rectX, rectY, rectW, rectH);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2);
    ctx.lineTo(size, size / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    const gantryAngle = bevData.gantry_angle || 0;
    const angleRad = (gantryAngle - 90) * Math.PI / 180;
    const lineLength = size * 0.35;
    const endX = centerX + Math.cos(angleRad) * lineLength;
    const endY = centerY + Math.sin(angleRad) * lineLength;

    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.arc(endX, endY, 8, 0, Math.PI * 2);
    ctx.fill();
  };

  const doseToColor = (intensity) => {
    if (intensity <= 0) return [0, 0, 0];
    if (intensity < 0.25) {
      const t = intensity / 0.25;
      return [0, 0, Math.floor(t * 255)];
    }
    if (intensity < 0.5) {
      const t = (intensity - 0.25) / 0.25;
      return [0, Math.floor(t * 255), 255];
    }
    if (intensity < 0.75) {
      const t = (intensity - 0.5) / 0.25;
      return [0, 255, Math.floor(255 - t * 255)];
    }
    if (intensity < 1.0) {
      const t = (intensity - 0.75) / 0.25;
      return [Math.floor(t * 255), 255, 0];
    }
    return [255, Math.floor(255 - (intensity - 1.0) * 128), 0];
  };

  const selectedBeam = beams?.find(b => b.id === selectedBeamId);

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Beam's Eye View (BEV)
      </Typography>
      
      <Grid container spacing={2}>
        <Grid item xs={3}>
          <Paper sx={{ p: 2 }}>
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Select Beam</InputLabel>
              <Select
                value={selectedBeamId || ''}
                label="Select Beam"
                onChange={(e) => setSelectedBeamId(e.target.value)}
              >
                {beams?.map((beam) => (
                  <MenuItem key={beam.id} value={beam.id}>
                    {beam.beam_name} ({beam.gantry_angle}°)
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {selectedBeam && (
              <>
                <Typography variant="subtitle2" gutterBottom>
                  Beam Parameters
                </Typography>
                <Typography variant="body2">
                  Gantry: {selectedBeam.gantry_angle}°
                </Typography>
                <Typography variant="body2">
                  Collimator: {selectedBeam.collimator_angle}°
                </Typography>
                <Typography variant="body2">
                  Field Size: {selectedBeam.field_size_x}×{selectedBeam.field_size_y} mm
                </Typography>
                <Typography variant="body2">
                  MU: {selectedBeam.mu}
                </Typography>
                <Typography variant="body2">
                  Energy: {selectedBeam.energy}
                </Typography>
              </>
            )}

            {bevData && (
              <>
                <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                  Window Level
                </Typography>
                <Slider
                  value={windowLevel}
                  onChange={(e, val) => setWindowLevel(val)}
                  min={0}
                  max={bevData.max_dose * 1.2}
                  step={0.01}
                  valueLabelDisplay="auto"
                />
                <Typography variant="caption" display="block">
                  Max Dose: {bevData.max_dose.toFixed(2)} Gy
                </Typography>
              </>
            )}
          </Paper>
        </Grid>
        
        <Grid item xs={9}>
          <Paper ref={containerRef} sx={{ p: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 550 }}>
            {bevData ? (
              <Box sx={{ textAlign: 'center' }}>
                <canvas ref={canvasRef} style={{ border: '1px solid #333' }} />
                <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                  {selectedBeam?.beam_name} - Gantry {selectedBeam?.gantry_angle}° | Isocenter: ({bevData.isocenter[0]}, {bevData.isocenter[1]}, {bevData.isocenter[2]})
                </Typography>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Select a beam to view BEV
              </Typography>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

export default BEVViewer;
