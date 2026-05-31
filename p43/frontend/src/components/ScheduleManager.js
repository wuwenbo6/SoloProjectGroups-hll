import React, { useState, useEffect } from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Stack,
  Divider,
  Chip,
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  Schedule,
} from '@mui/icons-material';
import { scheduledTaskAPI, sceneAPI } from '../services/api';

function ScheduleManager() {
  const [tasks, setTasks] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    cronExpression: '0 9 * * 1-5',
    sceneId: '',
    enabled: true,
    action: { type: 'scene', sceneId: '' },
  });

  useEffect(() => {
    fetchTasks();
    fetchScenes();
  }, []);

  const fetchTasks = async () => {
    try {
      const response = await scheduledTaskAPI.getAllTasks();
      setTasks(response.data);
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
    }
  };

  const fetchScenes = async () => {
    try {
      const response = await sceneAPI.getAllScenes();
      setScenes(response.data);
    } catch (error) {
      console.error('Failed to fetch scenes:', error);
    }
  };

  const handleOpenDialog = (task = null) => {
    if (task) {
      setEditingTask(task);
      setFormData({
        name: task.name,
        description: task.description || '',
        cronExpression: task.cronExpression,
        sceneId: task.sceneId || '',
        enabled: task.enabled,
        action: task.action,
      });
    } else {
      setEditingTask(null);
      setFormData({
        name: '',
        description: '',
        cronExpression: '0 9 * * 1-5',
        sceneId: '',
        enabled: true,
        action: { type: 'scene', sceneId: '' },
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingTask(null);
  };

  const handleSave = async () => {
    try {
      const taskData = {
        ...formData,
        action: {
          ...formData.action,
          sceneId: formData.sceneId,
        },
      };

      if (editingTask) {
        await scheduledTaskAPI.updateTask(editingTask.id, taskData);
      } else {
        await scheduledTaskAPI.createTask(taskData);
      }
      fetchTasks();
      handleCloseDialog();
    } catch (error) {
      console.error('Failed to save task:', error);
    }
  };

  const handleDelete = async (taskId) => {
    if (window.confirm('确定要删除这个定时任务吗？')) {
      try {
        await scheduledTaskAPI.deleteTask(taskId);
        fetchTasks();
      } catch (error) {
        console.error('Failed to delete task:', error);
      }
    }
  };

  const getCronDescription = (cron) => {
    const parts = cron.split(' ');
    if (parts.length < 5) return cron;
    
    const [minute, hour, day, month, weekday] = parts;
    
    let desc = '';
    if (hour !== '*' && minute !== '*') {
      desc += `每天 ${hour}:${minute.padStart(2, '0')}`;
    }
    if (weekday !== '*') {
      const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      if (weekday.includes('-')) {
        const [start, end] = weekday.split('-');
        desc += ` (${weekdays[start]}-${weekdays[end]})`;
      } else {
        desc += ` (${weekdays[weekday]})`;
      }
    }
    return desc || cron;
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5">定时任务</Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => handleOpenDialog()}
        >
          创建任务
        </Button>
      </Box>

      <List>
        {tasks.map((task) => (
          <React.Fragment key={task.id}>
            <ListItem>
              <Schedule sx={{ mr: 2, color: task.enabled ? 'primary.main' : 'text.disabled' }} />
              <ListItemText
                primary={
                  <Box display="flex" alignItems="center" gap={1}>
                    {task.name}
                    {task.enabled ? (
                      <Chip label="已启用" size="small" color="success" />
                    ) : (
                      <Chip label="已禁用" size="small" />
                    )}
                  </Box>
                }
                secondary={
                  <Box>
                    <Typography variant="body2">{task.description}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {getCronDescription(task.cronExpression)}
                    </Typography>
                    {task.sceneId && (
                      <Typography variant="caption" color="text.secondary" ml={2}>
                        场景: {scenes.find(s => s.id === task.sceneId)?.name || task.sceneId}
                      </Typography>
                    )}
                  </Box>
                }
              />
              <ListItemSecondaryAction>
                <IconButton onClick={() => handleOpenDialog(task)}>
                  <Edit />
                </IconButton>
                <IconButton onClick={() => handleDelete(task.id)}>
                  <Delete />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
            <Divider variant="inset" component="li" />
          </React.Fragment>
        ))}
        {tasks.length === 0 && (
          <ListItem>
            <ListItemText
              primary="暂无定时任务"
              secondary="点击右上角按钮创建新的定时任务"
            />
          </ListItem>
        )}
      </List>

      <Dialog open={openDialog} onClose={handleCloseDialog}>
        <DialogTitle>
          {editingTask ? '编辑定时任务' : '创建定时任务'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1, minWidth: 400 }}>
            <TextField
              label="任务名称"
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
            <TextField
              label="Cron 表达式"
              fullWidth
              value={formData.cronExpression}
              onChange={(e) =>
                setFormData({ ...formData, cronExpression: e.target.value })
              }
              helperText="例如: 0 9 * * 1-5 表示工作日9点执行"
            />
            <FormControl fullWidth>
              <InputLabel>执行场景</InputLabel>
              <Select
                value={formData.sceneId}
                label="执行场景"
                onChange={(e) =>
                  setFormData({ ...formData, sceneId: e.target.value })
                }
              >
                {scenes.map((scene) => (
                  <MenuItem key={scene.id} value={scene.id}>
                    {scene.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.enabled}
                  onChange={(e) =>
                    setFormData({ ...formData, enabled: e.target.checked })
                  }
                />
              }
              label="启用任务"
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

export default ScheduleManager;
