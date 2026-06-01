import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, Paper, FormControl, InputLabel, Select, MenuItem, Grid, List, ListItem, ListItemText, Checkbox } from '@mui/material';
import axios from 'axios';

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
  '#FFEAA7', '#DDA0DD', '#FF8C00', '#20B2AA',
  '#FF69B4', '#32CD32', '#FF4500', '#9370DB'
];

function DVHViewer({ planId }) {
  const [dvhs, setDvhs] = useState([]);
  const [selectedStructures, setSelectedStructures] = useState([]);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (planId) {
      fetchDVHs();
    }
  }, [planId]);

  useEffect(() => {
    drawDVH();
  }, [dvhs, selectedStructures]);

  const fetchDVHs = async () => {
    try {
      const response = await axios.get(`/plans/${planId}/dvh`);
      setDvhs(response.data.dvhs || []);
      if (response.data.dvhs?.length > 0) {
        setSelectedStructures(response.data.dvhs.map(d => d.structure_id));
      }
    } catch (error) {
      console.error('Error fetching DVHs:', error);
    }
  };

  const handleStructureToggle = (structureId) => {
    setSelectedStructures(prev => 
      prev.includes(structureId)
        ? prev.filter(id => id !== structureId)
        : [...prev, structureId]
    );
  };

  const drawDVH = () => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = 400;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    const padding = { top: 30, right: 20, bottom: 50, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#2d2d44';
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= 10; i++) {
      const x = padding.left + (i / 10) * chartWidth;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + chartHeight);
      ctx.stroke();

      const y = padding.top + (i / 10) * chartHeight;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();
    }

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(padding.left, padding.top, chartWidth, chartHeight);

    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 10; i++) {
      const y = padding.top + (i / 10) * chartHeight;
      ctx.fillText(`${100 - i * 10}`, padding.left - 10, y + 4);
    }

    ctx.textAlign = 'center';
    const selectedDvhs = dvhs.filter(d => selectedStructures.includes(d.structure_id));
    const maxDose = Math.max(...selectedDvhs.map(d => d.max_dose), 1);
    for (let i = 0; i <= 5; i++) {
      const x = padding.left + (i / 5) * chartWidth;
      const dose = (i / 5) * maxDose;
      ctx.fillText(dose.toFixed(1), x, padding.top + chartHeight + 20);
    }

    ctx.font = '14px Arial';
    ctx.fillText('Dose (Gy)', padding.left + chartWidth / 2, height - 10);

    ctx.save();
    ctx.translate(15, padding.top + chartHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Volume (%)', 0, 0);
    ctx.restore();

    dvhs.forEach((dvh, index) => {
      if (!selectedStructures.includes(dvh.structure_id)) return;
      if (dvh.volume <= 0) return;

      const color = COLORS[index % COLORS.length];
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      const maxDose = Math.max(...dvhs.map(d => d.max_dose), 1);

      dvh.dose_bins.forEach((dose, i) => {
        const x = padding.left + (dose / maxDose) * chartWidth;
        const volumePercent = (dvh.volume_bins[i] / dvh.volume) * 100;
        const y = padding.top + ((100 - volumePercent) / 100) * chartHeight;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();
    });

    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    let legendY = padding.top + 20;
    dvhs.forEach((dvh, index) => {
      if (!selectedStructures.includes(dvh.structure_id)) return;

      const color = COLORS[index % COLORS.length];
      ctx.fillStyle = color;
      ctx.fillRect(padding.left + 10, legendY, 15, 15);
      
      ctx.fillStyle = '#ffffff';
      ctx.fillText(dvh.structure_name, padding.left + 30, legendY + 12);
      legendY += 25;
    });
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Dose Volume Histogram (DVH)
      </Typography>
      
      <Grid container spacing={2}>
        <Grid item xs={9}>
          <Paper ref={containerRef} sx={{ bgcolor: '#1a1a2e', p: 1 }}>
            <canvas ref={canvasRef} style={{ width: '100%' }} />
          </Paper>
        </Grid>
        
        <Grid item xs={3}>
          <Paper sx={{ p: 2, maxHeight: 400, overflow: 'auto' }}>
            <Typography variant="subtitle2" gutterBottom>
              Structures
            </Typography>
            <List dense>
              {dvhs.map((dvh, index) => (
                <ListItem 
                  key={dvh.structure_id}
                  disablePadding
                  onClick={() => handleStructureToggle(dvh.structure_id)}
                  sx={{ cursor: 'pointer' }}
                >
                  <Checkbox
                    size="small"
                    checked={selectedStructures.includes(dvh.structure_id)}
                    sx={{ color: COLORS[index % COLORS.length], '&.Mui-checked': { color: COLORS[index % COLORS.length] } }}
                  />
                  <ListItemText 
                    primary={dvh.structure_name}
                    secondary={`Dmean: ${dvh.mean_dose.toFixed(2)} Gy`}
                    primaryTypographyProps={{ variant: 'body2' }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mt: 1 }}>
        {dvhs.filter(d => selectedStructures.includes(d.structure_id)).map((dvh, index) => (
          <Grid item xs={6} sm={3} key={dvh.structure_id}>
            <Paper sx={{ p: 1.5, bgcolor: 'background.default' }}>
              <Typography variant="subtitle2" sx={{ color: COLORS[index % COLORS.length] }}>
                {dvh.structure_name}
              </Typography>
              <Typography variant="body2">
                Dmean: {dvh.mean_dose.toFixed(2)} Gy
              </Typography>
              <Typography variant="body2">
                Dmax: {dvh.max_dose.toFixed(2)} Gy
              </Typography>
              <Typography variant="body2">
                Vol: {dvh.volume.toFixed(2)} cm³
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

export default DVHViewer;
