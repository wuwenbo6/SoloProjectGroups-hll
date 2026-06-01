import React, { useState, useEffect } from 'react';
import { Box, Drawer, AppBar, Toolbar, Typography, List, ListItem, 
         ListItemText, Button, TextField, Slider, FormControl, 
         InputLabel, Select, MenuItem, Grid, Paper, Divider,
         Accordion, AccordionSummary, AccordionDetails, Tabs, Tab } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import axios from 'axios';
import DoseViewer3D from './components/DoseViewer3D';
import SliceViewer from './components/SliceViewer';
import DVHViewer from './components/DVHViewer';
import BEVViewer from './components/BEVViewer';

const drawerWidth = 320;

function App() {
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [planDetails, setPlanDetails] = useState(null);
  const [newPlanName, setNewPlanName] = useState('');
  const [newPatientId, setNewPatientId] = useState('');
  const [sliceAxis, setSliceAxis] = useState('z');
  const [sliceIndex, setSliceIndex] = useState(50);
  const [viewMode, setViewMode] = useState('3d');
  const [showIsoContours, setShowIsoContours] = useState(true);
  const [showVolumeCloud, setShowVolumeCloud] = useState(true);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const response = await axios.get('/plans/');
      setPlans(response.data);
    } catch (error) {
      console.error('Error fetching plans:', error);
    }
  };

  const createPlan = async () => {
    if (!newPlanName) return;
    try {
      await axios.post('/plans/', null, {
        params: {
          plan_name: newPlanName,
          patient_id: newPatientId
        }
      });
      setNewPlanName('');
      setNewPatientId('');
      fetchPlans();
    } catch (error) {
      console.error('Error creating plan:', error);
    }
  };

  const selectPlan = async (plan) => {
    setSelectedPlan(plan);
    try {
      const response = await axios.get(`/plans/${plan.id}`);
      setPlanDetails(response.data);
    } catch (error) {
      console.error('Error fetching plan details:', error);
    }
  };

  const calculateDose = async () => {
    if (!selectedPlan) return;
    try {
      await axios.post(`/plans/${selectedPlan.id}/calculate-dose`);
      fetchPlans();
      if (selectedPlan) {
        const response = await axios.get(`/plans/${selectedPlan.id}`);
        setPlanDetails(response.data);
      }
    } catch (error) {
      console.error('Error calculating dose:', error);
    }
  };

  const addSampleBeams = async () => {
    if (!selectedPlan) return;
    const beams = [
      { beam_name: 'AP', gantry_angle: 0, mu: 100, field_size_x: 80, field_size_y: 80, isocenter: {x: 0, y: 0, z: 0} },
      { beam_name: 'PA', gantry_angle: 180, mu: 100, field_size_x: 80, field_size_y: 80, isocenter: {x: 0, y: 0, z: 0} },
      { beam_name: 'RT', gantry_angle: 270, mu: 80, field_size_x: 80, field_size_y: 80, isocenter: {x: 0, y: 0, z: 0} },
      { beam_name: 'LT', gantry_angle: 90, mu: 80, field_size_x: 80, field_size_y: 80, isocenter: {x: 0, y: 0, z: 0} }
    ];
    
    for (const beam of beams) {
      try {
        await axios.post(`/plans/${selectedPlan.id}/beams/`, beam);
      } catch (error) {
        console.error('Error adding beam:', error);
      }
    }
    fetchPlans();
    if (selectedPlan) {
      const response = await axios.get(`/plans/${selectedPlan.id}`);
      setPlanDetails(response.data);
    }
  };

  const exportDose = async (format) => {
    if (!selectedPlan) return;
    try {
      const response = await axios.post(`/plans/${selectedPlan.id}/export/dose`, null, {
        params: {
          format: format,
          patient_name: 'Test^Patient',
          patient_id: selectedPlan.patient_id || 'P001'
        },
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      const contentDisposition = response.headers['content-disposition'];
      let filename = `dose_export.${format === 'dicom' ? 'dcm' : format === 'numpy' ? 'npz' : 'raw'}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting dose:', error);
    }
  };

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" noWrap component="div">
            RT Dose Planning System
          </Typography>
        </Toolbar>
      </AppBar>
      
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto', p: 2 }}>
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>Create New Plan</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Plan Name"
                    value={newPlanName}
                    onChange={(e) => setNewPlanName(e.target.value)}
                    size="small"
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Patient ID"
                    value={newPatientId}
                    onChange={(e) => setNewPatientId(e.target.value)}
                    size="small"
                  />
                </Grid>
                <Grid item xs={12}>
                  <Button 
                    fullWidth 
                    variant="contained" 
                    onClick={createPlan}
                    disabled={!newPlanName}
                  >
                    Create Plan
                  </Button>
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>

          <Divider sx={{ my: 2 }} />

          <Typography variant="h6" gutterBottom>
            Plans
          </Typography>
          <List>
            {plans.map((plan) => (
              <ListItem 
                button 
                key={plan.id}
                selected={selectedPlan?.id === plan.id}
                onClick={() => selectPlan(plan)}
              >
                <ListItemText 
                  primary={plan.plan_name}
                  secondary={`Beams: ${plan.beam_count}, Dose: ${plan.has_dose ? 'Yes' : 'No'}`}
                />
              </ListItem>
            ))}
          </List>

          {selectedPlan && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="h6" gutterBottom>
                Plan Actions
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Button 
                    fullWidth 
                    variant="contained" 
                    onClick={addSampleBeams}
                  >
                    Add Sample Beams (4-field)
                  </Button>
                </Grid>
                <Grid item xs={12}>
                  <Button 
                    fullWidth 
                    variant="contained" 
                    color="secondary"
                    onClick={calculateDose}
                    disabled={planDetails?.beams?.length === 0}
                  >
                    Calculate Dose
                  </Button>
                </Grid>
              </Grid>

              {planDetails?.has_dose && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    View Settings
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <FormControl fullWidth size="small">
                        <InputLabel>View Mode</InputLabel>
                        <Select
                          value={viewMode}
                          label="View Mode"
                          onChange={(e) => setViewMode(e.target.value)}
                        >
                          <MenuItem value="3d">3D Volume</MenuItem>
                          <MenuItem value="slice">Slice View</MenuItem>
                          <MenuItem value="dvh">DVH</MenuItem>
                          <MenuItem value="bev">BEV</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    {viewMode === 'slice' && (
                      <>
                        <Grid item xs={12}>
                          <FormControl fullWidth size="small">
                            <InputLabel>Axis</InputLabel>
                            <Select
                              value={sliceAxis}
                              label="Axis"
                              onChange={(e) => setSliceAxis(e.target.value)}
                            >
                              <MenuItem value="x">X (Sagittal)</MenuItem>
                              <MenuItem value="y">Y (Coronal)</MenuItem>
                              <MenuItem value="z">Z (Axial)</MenuItem>
                            </Select>
                          </FormControl>
                        </Grid>
                        <Grid item xs={12}>
                          <Typography gutterBottom>Slice: {sliceIndex}</Typography>
                          <Slider
                            value={sliceIndex}
                            onChange={(e, val) => setSliceIndex(val)}
                            min={0}
                            max={99}
                            valueLabelDisplay="auto"
                          />
                        </Grid>
                      </>
                    )}
                    <Grid item xs={12}>
                      <Button
                        fullWidth
                        variant="outlined"
                        onClick={() => setShowIsoContours(!showIsoContours)}
                      >
                        Iso Contours: {showIsoContours ? 'ON' : 'OFF'}
                      </Button>
                    </Grid>
                    {viewMode === '3d' && (
                      <Grid item xs={12}>
                        <Button
                          fullWidth
                          variant="outlined"
                          onClick={() => setShowVolumeCloud(!showVolumeCloud)}
                        >
                          Volume Cloud: {showVolumeCloud ? 'ON' : 'OFF'}
                        </Button>
                      </Grid>
                    )}
                  </Grid>

                  <Divider sx={{ my: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    Export
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <Button
                        fullWidth
                        variant="contained"
                        color="success"
                        onClick={() => exportDose('dicom')}
                      >
                        Export RT Dose (DICOM)
                      </Button>
                    </Grid>
                    <Grid item xs={12}>
                      <Button
                        fullWidth
                        variant="outlined"
                        onClick={() => exportDose('numpy')}
                      >
                        Export Dose (NumPy)
                      </Button>
                    </Grid>
                  </Grid>
                </>
              )}
            </>
          )}
        </Box>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, bgcolor: 'background.default' }}>
        <Toolbar />
        {selectedPlan && planDetails?.has_dose ? (
          viewMode === '3d' ? (
            <DoseViewer3D 
              planId={selectedPlan.id}
              showIsoContours={showIsoContours}
              showVolumeCloud={showVolumeCloud}
            />
          ) : viewMode === 'slice' ? (
            <SliceViewer
              planId={selectedPlan.id}
              axis={sliceAxis}
              index={sliceIndex}
              showIsoContours={showIsoContours}
            />
          ) : viewMode === 'dvh' ? (
            <DVHViewer planId={selectedPlan.id} />
          ) : viewMode === 'bev' ? (
            <BEVViewer planId={selectedPlan.id} beams={planDetails?.beams || []} />
          ) : null
        ) : (
          <Box sx={{ p: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="h5" gutterBottom>
                Welcome to RT Dose Planning System
              </Typography>
              <Typography variant="body1" color="text.secondary">
                {selectedPlan 
                  ? 'Add beams and calculate dose to visualize'
                  : 'Select a plan or create a new one to get started'}
              </Typography>
            </Paper>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default App;
