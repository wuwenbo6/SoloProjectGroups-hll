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
  LinearProgress,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Delete,
  PlayArrow,
  History,
  Add,
  Storage,
  Memory,
  Memory as MemoryIcon,
} from '@mui/icons-material';
import { nodeAPI, clusterAPI } from '../services/api';

function NodeList({ nodes, loading, onRefresh }) {
  const [selectedNode, setSelectedNode] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [nodeHistory, setNodeHistory] = useState([]);
  const [showRegister, setShowRegister] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    name: '',
    hostname: '',
    ip_address: '',
    role: 'worker',
    cpu_cores: 4,
    memory_mb: 8192,
    has_gpu: false,
    gpu_count: 1,
    gpu_type: '',
  });

  const handleViewHistory = async (nodeId) => {
    try {
      const res = await nodeAPI.getNodeHistory(nodeId, 50);
      setNodeHistory(res.data);
      setSelectedNode(nodeId);
      setShowHistory(true);
    } catch (error) {
      console.error('Failed to get node history:', error);
    }
  };

  const handleTriggerFailover = async (nodeId) => {
    if (window.confirm('确定要触发该节点的故障迁移吗？')) {
      try {
        await clusterAPI.triggerFailover(nodeId);
        onRefresh();
      } catch (error) {
        console.error('Failed to trigger failover:', error);
      }
    }
  };

  const handleDeleteNode = async (nodeId) => {
    if (window.confirm('确定要删除该节点吗？')) {
      try {
        await nodeAPI.deleteNode(nodeId);
        onRefresh();
      } catch (error) {
        console.error('Failed to delete node:', error);
      }
    }
  };

  const handleRegister = async () => {
    try {
      const data = {
        name: registerForm.name,
        hostname: registerForm.hostname,
        ip_address: registerForm.ip_address,
        role: registerForm.role,
        cpu_cores: registerForm.cpu_cores,
        memory_mb: registerForm.memory_mb,
        cpu_used: 0,
        memory_used: 0,
      };
      
      if (registerForm.has_gpu) {
        data.gpu_count = registerForm.gpu_count;
        data.gpu_type = registerForm.gpu_type;
        data.gpu_used = 0;
        data.gpu_memory_used = 0;
      }
      
      await nodeAPI.registerNode(data);
      setShowRegister(false);
      setRegisterForm({
        name: '',
        hostname: '',
        ip_address: '',
        role: 'worker',
        cpu_cores: 4,
        memory_mb: 8192,
        has_gpu: false,
        gpu_count: 1,
        gpu_type: '',
      });
      onRefresh();
    } catch (error) {
      console.error('Failed to register node:', error);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
      case 'running':
      case 'ready':
        return 'success';
      case 'inactive':
      case 'down':
        return 'error';
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
          onClick={() => setShowRegister(true)}
        >
          注册节点
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>节点名称</TableCell>
              <TableCell>主机名</TableCell>
              <TableCell>IP 地址</TableCell>
              <TableCell>角色</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>CPU</TableCell>
              <TableCell>内存</TableCell>
              <TableCell>GPU</TableCell>
              <TableCell>最后心跳</TableCell>
              <TableCell>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {nodes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} align="center">
                  <Typography color="text.secondary" py={4}>
                    暂无节点数据
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              nodes.map((node) => (
                <TableRow key={node.ID} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {node.Name || node.ID?.slice(0, 12)}
                    </Typography>
                  </TableCell>
                  <TableCell>{node.Hostname || '-'}</TableCell>
                  <TableCell>{node.IPAddress || '-'}</TableCell>
                  <TableCell>
                    <Chip
                      label={node.Role || 'worker'}
                      size="small"
                      color={node.Role === 'manager' ? 'primary' : 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={node.Status || 'unknown'}
                      size="small"
                      color={getStatusColor(node.Status)}
                    />
                  </TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Storage fontSize="small" color="action" />
                      <Box width={80}>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(node.CPUUsed || 0, 100)}
                          sx={{ height: 6, borderRadius: 3 }}
                        />
                      </Box>
                      <Typography variant="caption">
                        {(node.CPUUsed || 0).toFixed(1)}%
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Memory fontSize="small" color="action" />
                      <Box width={80}>
                        <LinearProgress
                          variant="determinate"
                          value={node.MemoryMB ? Math.min((node.MemoryUsed / node.MemoryMB * 100), 100) : 0}
                          color="warning"
                          sx={{ height: 6, borderRadius: 3 }}
                        />
                      </Box>
                      <Typography variant="caption">
                        {node.MemoryMB ? ((node.MemoryUsed / node.MemoryMB * 100).toFixed(1)) : 0}%
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    {node.GPUCount > 0 ? (
                      <Box>
                        <Chip
                          label={`${node.GPUCount} x ${node.GPUType || 'GPU'}`}
                          size="small"
                          color="success"
                          variant="outlined"
                        />
                        <Typography variant="caption" display="block" mt={0.5}>
                          {(node.GPUUsed || 0).toFixed(1)}%
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        -
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">
                      {node.LastSeen ? new Date(node.LastSeen).toLocaleString() : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Tooltip title="查看历史">
                      <IconButton
                        size="small"
                        onClick={() => handleViewHistory(node.ID)}
                        color="info"
                      >
                        <History fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="触发故障迁移">
                      <IconButton
                        size="small"
                        onClick={() => handleTriggerFailover(node.ID)}
                        color="warning"
                      >
                        <PlayArrow fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="删除节点">
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteNode(node.ID)}
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

      <Dialog open={showHistory} onClose={() => setShowHistory(false)} maxWidth="md" fullWidth>
        <DialogTitle>节点历史记录</DialogTitle>
        <DialogContent>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>时间</TableCell>
                  <TableCell>状态</TableCell>
                  <TableCell>CPU 使用率</TableCell>
                  <TableCell>内存使用</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {nodeHistory.map((h, i) => (
                  <TableRow key={i}>
                    <TableCell>{new Date(h.Timestamp).toLocaleString()}</TableCell>
                    <TableCell>
                      <Chip label={h.Status} size="small" color={getStatusColor(h.Status)} />
                    </TableCell>
                    <TableCell>{h.CPUUsed?.toFixed(1)}%</TableCell>
                    <TableCell>{(h.MemoryUsed / 1024).toFixed(2)} MB</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowHistory(false)}>关闭</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={showRegister} onClose={() => setShowRegister(false)}>
        <DialogTitle>注册新节点</DialogTitle>
        <DialogContent>
          <Box component="form" sx={{ mt: 2, width: 400 }}>
            <TextField
              fullWidth
              label="节点名称"
              margin="normal"
              value={registerForm.name}
              onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
            />
            <TextField
              fullWidth
              label="主机名"
              margin="normal"
              value={registerForm.hostname}
              onChange={(e) => setRegisterForm({ ...registerForm, hostname: e.target.value })}
            />
            <TextField
              fullWidth
              label="IP 地址"
              margin="normal"
              value={registerForm.ip_address}
              onChange={(e) => setRegisterForm({ ...registerForm, ip_address: e.target.value })}
            />
            <TextField
              fullWidth
              label="角色"
              margin="normal"
              select
              SelectProps={{ native: true }}
              value={registerForm.role}
              onChange={(e) => setRegisterForm({ ...registerForm, role: e.target.value })}
            >
              <option value="worker">Worker</option>
              <option value="manager">Manager</option>
            </TextField>
            <TextField
              fullWidth
              label="CPU 核心数"
              type="number"
              margin="normal"
              value={registerForm.cpu_cores}
              onChange={(e) => setRegisterForm({ ...registerForm, cpu_cores: parseInt(e.target.value) })}
            />
            <TextField
              fullWidth
              label="内存 (MB)"
              type="number"
              margin="normal"
              value={registerForm.memory_mb}
              onChange={(e) => setRegisterForm({ ...registerForm, memory_mb: parseInt(e.target.value) })}
            />
            <Box mt={2}>
              <FormControlLabel
                control={
                  <Switch
                    checked={registerForm.has_gpu}
                    onChange={(e) => setRegisterForm({ ...registerForm, has_gpu: e.target.checked })}
                  />
                }
                label="节点有 GPU"
              />
            </Box>
            {registerForm.has_gpu && (
              <>
                <TextField
                  fullWidth
                  label="GPU 数量"
                  type="number"
                  margin="normal"
                  value={registerForm.gpu_count}
                  onChange={(e) => setRegisterForm({ ...registerForm, gpu_count: parseInt(e.target.value) })}
                />
                <TextField
                  fullWidth
                  label="GPU 类型"
                  margin="normal"
                  value={registerForm.gpu_type}
                  onChange={(e) => setRegisterForm({ ...registerForm, gpu_type: e.target.value })}
                  placeholder="如: NVIDIA RTX 3090"
                />
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowRegister(false)}>取消</Button>
          <Button onClick={handleRegister} variant="contained">注册</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default NodeList;
