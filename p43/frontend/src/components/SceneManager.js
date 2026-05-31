import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Slider,
  IconButton,
  Stack,
  Chip,
} from '@mui/material';
import {
  PlayArrow,
  Edit,
  Delete,
  Add,
  Lightbulb,
} from '@mui/icons-material';
import { sceneAPI } from '../services/api';

function SceneManager() {
  const [scenes, setScenes] = useState([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingScene, setEditingScene] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    brightness: 50,
    colorTemperature: 4000,
  });

  useEffect(() => {
    fetchScenes();
  }, []);

  const fetchScenes = async () => {
    try {
      const response = await sceneAPI.getAllScenes();
      setScenes(response.data);
    } catch (error) {
      console.error('Failed to fetch scenes:', error);
    }
  };

  const handleApplyScene = async (sceneId) => {
    try {
      await sceneAPI.applyScene(sceneId);
    } catch (error) {
      console.error('Failed to apply scene:', error);
    }
  };

  const handleOpenDialog = (scene = null) => {
    if (scene) {
      setEditingScene(scene);
      setFormData({
        name: scene.name,
        description: scene.description,
        brightness: scene.brightness,
        colorTemperature: scene.colorTemperature,
      });
    } else {
      setEditingScene(null);
      setFormData({
        name: '',
        description: '',
        brightness: 50,
        colorTemperature: 4000,
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingScene(null);
  };

  const handleSave = async () => {
    try {
      if (editingScene) {
        await sceneAPI.updateScene(editingScene.id, formData);
      } else {
        await sceneAPI.createScene({
          ...formData,
          id: `scene-${Date.now()}`,
          isPreset: false,
        });
      }
      fetchScenes();
      handleCloseDialog();
    } catch (error) {
      console.error('Failed to save scene:', error);
    }
  };

  const handleDelete = async (sceneId) => {
    if (window.confirm('确定要删除这个场景吗？')) {
      try {
        await sceneAPI.deleteScene(sceneId);
        fetchScenes();
      } catch (error) {
        console.error('Failed to delete scene:', error);
      }
    }
  };

  const getSceneColor = (brightness, colorTemperature) => {
    const temp = colorTemperature / 100;
    let red, green, blue;

    if (temp <= 66) {
      red = 255;
      green = temp > 19 ? 99.4708025861 * Math.log(temp - 10) - 161.1195681661 : 0;
    } else {
      red = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
      green = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
    }
    blue = temp >= 66 ? 255 : temp > 19 ? 138.5177312231 * Math.log(temp - 10) - 305.0447927307 : 0;

    const factor = brightness / 100;
    return `rgb(${Math.round(red * factor)}, ${Math.round(green * factor)}, ${Math.round(blue * factor)})`;
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5">场景管理</Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => handleOpenDialog()}
        >
          创建场景
        </Button>
      </Box>

      <Grid container spacing={3}>
        {scenes.map((scene) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={scene.id}>
            <Card>
              <CardContent>
                <Box
                  display="flex"
                  justifyContent="center"
                  alignItems="center"
                  height={80}
                  mb={2}
                  borderRadius={1}
                  sx={{
                    backgroundColor: getSceneColor(
                      scene.brightness,
                      scene.colorTemperature
                    ),
                  }}
                >
                  <Lightbulb sx={{ fontSize: 48, color: 'white' }} />
                </Box>
                <Typography variant="h6" gutterBottom>
                  {scene.name}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {scene.description}
                </Typography>
                <Stack direction="row" spacing={1} mb={1}>
                  <Chip label={`亮度: ${scene.brightness}%`} size="small" />
                  <Chip label={`色温: ${scene.colorTemperature}K`} size="small" />
                </Stack>
                {scene.isPreset && (
                  <Chip label="预设场景" color="primary" size="small" />
                )}
              </CardContent>
              <CardActions>
                <Button
                  fullWidth
                  startIcon={<PlayArrow />}
                  variant="outlined"
                  onClick={() => handleApplyScene(scene.id)}
                >
                  应用
                </Button>
                {!scene.isPreset && (
                  <>
                    <IconButton onClick={() => handleOpenDialog(scene)}>
                      <Edit />
                    </IconButton>
                    <IconButton onClick={() => handleDelete(scene.id)}>
                      <Delete />
                    </IconButton>
                  </>
                )}
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Dialog open={openDialog} onClose={handleCloseDialog}>
        <DialogTitle>
          {editingScene ? '编辑场景' : '创建场景'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1, minWidth: 400 }}>
            <TextField
              label="场景名称"
              fullWidth
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
            />
            <TextField
              label="描述"
              fullWidth
              multiline
              rows={2}
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
            />
            <Box>
              <Typography gutterBottom>
                亮度: {formData.brightness}%
              </Typography>
              <Slider
                value={formData.brightness}
                onChange={(e, newValue) =>
                  setFormData({ ...formData, brightness: newValue })
                }
                min={0}
                max={100}
              />
            </Box>
            <Box>
              <Typography gutterBottom>
                色温: {formData.colorTemperature}K
              </Typography>
              <Slider
                value={formData.colorTemperature}
                onChange={(e, newValue) =>
                  setFormData({ ...formData, colorTemperature: newValue })
                }
                min={2700}
                max={6500}
                step={100}
              />
            </Box>
            <Box
              height={100}
              borderRadius={1}
              sx={{
                backgroundColor: getSceneColor(
                  formData.brightness,
                  formData.colorTemperature
                ),
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>取消</Button>
          <Button onClick={handleSave} variant="contained">
            保存
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default SceneManager;
