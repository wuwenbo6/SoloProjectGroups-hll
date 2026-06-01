import { useState } from 'react';
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Switch,
  FormControlLabel,
  Slider,
} from '@mui/material';
import {
  Delete,
  Add,
  PlayArrow,
} from '@mui/icons-material';
import { serviceAPI } from '../services/api';

function ServiceList({ services, loading, onRefresh }) {
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    image: 'nginx:alpine',
    replicas: 1,
    priority: 5,
    gpu_required: false,
    gpu_count: 1,
    gpu_memory: 0,
    env: '',
    node_id: '',
  });
  const [ports, setPorts] = useState([{ host_port: 80, container_port: 80, protocol: 'tcp' }]);

  const handleDelete = async (serviceId) => {
    if (window.confirm('确定要删除该服务吗？')) {
      try {
        await serviceAPI.deleteService(serviceId);
        onRefresh();
      } catch (error) {
        console.error('Failed to delete service:', error);
      }
    }
  };

  const handleCreate = async () => {
    try {
      const data = {
        name: createForm.name,
        image: createForm.image,
        replicas: parseInt(createForm.replicas),
        priority: parseInt(createForm.priority),
        gpu_required: createForm.gpu_required,
        gpu_count: createForm.gpu_required ? parseInt(createForm.gpu_count) : 0,
        gpu_memory: createForm.gpu_required ? parseInt(createForm.gpu_memory) : 0,
        env: createForm.env ? createForm.env.split('\n').filter(e => e.trim()) : [],
        ports: ports,
        node_id: createForm.node_id,
      };
      await serviceAPI.createService(data);
      setShowCreate(false);
      setCreateForm({
        name: '',
        image: 'nginx:alpine',
        replicas: 1,
        priority: 5,
        gpu_required: false,
        gpu_count: 1,
        gpu_memory: 0,
        env: '',
        node_id: '',
      });
      setPorts([{ host_port: 80, container_port: 80, protocol: 'tcp' }]);
      onRefresh();
    } catch (error) {
      console.error('Failed to create service:', error);
      alert('创建服务失败，请检查后端服务是否正常运行');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'running':
      case 'completed':
        return 'success';
      case 'failed':
      case 'error':
        return 'error';
      case 'starting':
      case 'preparing':
        return 'warning';
      default:
        return 'default';
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="flex-end" mb={2}>
        <Button
          startIcon={<Add />}
          variant="contained"
          onClick={() => setShowCreate(true)}
        >
          部署服务
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>服务名称</TableCell>
              <TableCell>镜像</TableCell>
              <TableCell>副本数</TableCell>
              <TableCell>优先级</TableCell>
              <TableCell>GPU</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>节点</TableCell>
              <TableCell>创建时间</TableCell>
              <TableCell>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {services.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center">
                  <Typography color="text.secondary" py={4}>
                    暂无服务数据
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              services.map((service) => (
                <TableRow key={service.ID} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {service.Name || service.ID?.slice(0, 12)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                      {service.Image || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {service.RunningReplicas || 0} / {service.Replicas || 1}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={service.Priority || 5}
                      size="small"
                      color={service.Priority >= 8 ? 'error' : service.Priority >= 5 ? 'primary' : 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    {service.GPURequired ? (
                      <Chip
                        label={`GPU x${service.GPUCount || 1}`}
                        size="small"
                        color="success"
                      />
                    ) : (
                      <Typography variant="caption" color="text.secondary">-</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={service.Status || 'unknown'}
                      size="small"
                      color={getStatusColor(service.Status)}
                    />
                  </TableCell>
                  <TableCell>{service.NodeID?.slice(0, 12) || '-'}</TableCell>
                  <TableCell>
                    <Typography variant="caption">
                      {service.CreatedAt ? new Date(service.CreatedAt).toLocaleString() : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Tooltip title="查看日志">
                      <IconButton
                        size="small"
                        color="info"
                      >
                        <PlayArrow fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="删除服务">
                      <IconButton
                        size="small"
                        onClick={() => handleDelete(service.ID)}
                        color="error"
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={showCreate} onClose={() => setShowCreate(false)} maxWidth="sm" fullWidth>
        <DialogTitle>部署新服务</DialogTitle>
        <DialogContent>
          <Box component="form" sx={{ mt: 2 }}>
            <TextField
              fullWidth
              label="服务名称"
              margin="normal"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
            />
            <TextField
              fullWidth
              label="镜像名称"
              margin="normal"
              value={createForm.image}
              onChange={(e) => setCreateForm({ ...createForm, image: e.target.value })}
            />
            <TextField
              fullWidth
              label="副本数"
              type="number"
              margin="normal"
              value={createForm.replicas}
              onChange={(e) => setCreateForm({ ...createForm, replicas: e.target.value })}
              InputProps={{ inputProps: { min: 1 } }}
            />
            <Box mt={2} mb={1}>
              <Typography variant="subtitle2" gutterBottom>
                优先级: {createForm.priority}
              </Typography>
              <Slider
                value={createForm.priority}
                onChange={(e, value) => setCreateForm({ ...createForm, priority: value })}
                min={1}
                max={10}
                step={1}
                marks
                valueLabelDisplay="auto"
              />
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={createForm.gpu_required}
                  onChange={(e) => setCreateForm({ ...createForm, gpu_required: e.target.checked })}
                />
              }
              label="需要 GPU 资源"
            />
            {createForm.gpu_required && (
              <Grid container spacing={2} sx={{ mt: 1, mb: 1 }}>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="GPU 数量"
                    type="number"
                    size="small"
                    value={createForm.gpu_count}
                    onChange={(e) => setCreateForm({ ...createForm, gpu_count: parseInt(e.target.value) })}
                    InputProps={{ inputProps: { min: 1 } }}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="GPU 显存 (MB)"
                    type="number"
                    size="small"
                    value={createForm.gpu_memory}
                    onChange={(e) => setCreateForm({ ...createForm, gpu_memory: parseInt(e.target.value) })}
                    placeholder="可选"
                  />
                </Grid>
              </Grid>
            )}
            <TextField
              fullWidth
              label="目标节点 ID (可选)"
              margin="normal"
              value={createForm.node_id}
              onChange={(e) => setCreateForm({ ...createForm, node_id: e.target.value })}
              placeholder="留空则自动调度"
            />
            <TextField
              fullWidth
              label="环境变量 (每行一个，格式: KEY=VALUE)"
              margin="normal"
              multiline
              rows={3}
              value={createForm.env}
              onChange={(e) => setCreateForm({ ...createForm, env: e.target.value })}
              placeholder="DEBUG=true&#10;PORT=8080"
            />
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>端口映射</Typography>
            {ports.map((port, i) => (
              <Grid container spacing={2} key={i} sx={{ mb: 1 }}>
                <Grid item xs={4}>
                  <TextField
                    fullWidth
                    size="small"
                    label="主机端口"
                    type="number"
                    value={port.host_port}
                    onChange={(e) => {
                      const newPorts = [...ports];
                      newPorts[i].host_port = parseInt(e.target.value);
                      setPorts(newPorts);
                    }}
                  />
                </Grid>
                <Grid item xs={4}>
                  <TextField
                    fullWidth
                    size="small"
                    label="容器端口"
                    type="number"
                    value={port.container_port}
                    onChange={(e) => {
                      const newPorts = [...ports];
                      newPorts[i].container_port = parseInt(e.target.value);
                      setPorts(newPorts);
                    }}
                  />
                </Grid>
                <Grid item xs={4}>
                  <TextField
                    fullWidth
                    size="small"
                    label="协议"
                    select
                    SelectProps={{ native: true }}
                    value={port.protocol}
                    onChange={(e) => {
                      const newPorts = [...ports];
                      newPorts[i].protocol = e.target.value;
                      setPorts(newPorts);
                    }}
                  >
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                  </TextField>
                </Grid>
              </Grid>
            ))}
            <Button
              size="small"
              onClick={() => setPorts([...ports, { host_port: 0, container_port: 0, protocol: 'tcp' }])}
            >
              + 添加端口
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCreate(false)}>取消</Button>
          <Button onClick={handleCreate} variant="contained">部署</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default ServiceList;
