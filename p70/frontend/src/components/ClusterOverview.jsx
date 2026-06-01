import { useState, useEffect } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Button,
  LinearProgress,
  Tooltip,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  Storage,
  Memory,
  Computer,
  PlayCircle,
  Sync,
  Refresh,
  Download,
  Memory as MemoryIcon,
} from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { clusterAPI } from '../services/api';

function ClusterOverview({ nodes, services, onSync, onRefresh }) {
  const [exportMenuAnchor, setExportMenuAnchor] = useState(null);
  const [resourceHistory, setResourceHistory] = useState([]);

  useEffect(() => {
    if (nodes.length > 0) {
      const avgCPU = nodes.reduce((sum, n) => sum + (n.CPUUsed || 0), 0) / nodes.length;
      const avgMemory = nodes.length > 0 
        ? nodes.reduce((sum, n) => sum + ((n.MemoryUsed || 0) / (n.MemoryMB || 1) * 100), 0) / nodes.length
        : 0;
      
      setResourceHistory(prev => {
        const newHistory = [...prev, {
          time: new Date().toLocaleTimeString(),
          cpu: avgCPU.toFixed(1),
          memory: avgMemory.toFixed(1),
        }];
        return newHistory.slice(-20);
      });
    }
  }, [nodes]);

  const activeNodes = nodes.filter(n => n.Status === 'active').length;
  const inactiveNodes = nodes.filter(n => n.Status !== 'active').length;
  const runningServices = services.filter(s => s.Status === 'running' || s.RunningReplicas > 0).length;

  const totalCPU = nodes.reduce((sum, n) => sum + (n.CPUCores || 0), 0);
  const totalMemory = nodes.reduce((sum, n) => sum + (n.MemoryMB || 0), 0);
  const usedMemory = nodes.reduce((sum, n) => sum + (n.MemoryUsed || 0), 0);
  const avgCPU = nodes.length > 0 ? nodes.reduce((sum, n) => sum + (n.CPUUsed || 0), 0) / nodes.length : 0;
  const memoryPercent = totalMemory > 0 ? (usedMemory / totalMemory * 100) : 0;

  const totalGPUs = nodes.reduce((sum, n) => sum + (n.GPUCount || 0), 0);
  const gpuNodes = nodes.filter(n => n.GPUCount > 0).length;
  const avgGPU = gpuNodes > 0 ? nodes.filter(n => n.GPUCount > 0).reduce((sum, n) => sum + (n.GPUUsed || 0), 0) / gpuNodes : 0;

  const handleExportReport = async (format) => {
    try {
      const response = await clusterAPI.exportReport(format);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `cluster-report.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export report:', error);
    }
    setExportMenuAnchor(null);
  };

  return (
    <Box>
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <Computer sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="h6">节点总数</Typography>
              </Box>
              <Typography variant="h3" color="primary" gutterBottom>
                {nodes.length}
              </Typography>
              <Box display="flex" gap={1}>
                <Chip label={`活跃: ${activeNodes}`} color="success" size="small" />
                <Chip label={`离线: ${inactiveNodes}`} color="error" size="small" />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <PlayCircle sx={{ mr: 1, color: 'secondary.main' }} />
                <Typography variant="h6">运行服务</Typography>
              </Box>
              <Typography variant="h3" color="secondary" gutterBottom>
                {runningServices}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                共 {services.length} 个服务配置
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <Storage sx={{ mr: 1, color: 'info.main' }} />
                <Typography variant="h6">CPU 使用率</Typography>
              </Box>
              <Typography variant="h3" color="info" gutterBottom>
                {avgCPU.toFixed(1)}%
              </Typography>
              <LinearProgress 
                variant="determinate" 
                value={Math.min(avgCPU, 100)} 
                sx={{ height: 8, borderRadius: 4 }}
              />
              <Typography variant="body2" color="text.secondary" mt={1}>
                共 {totalCPU} 核
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <Memory sx={{ mr: 1, color: 'warning.main' }} />
                <Typography variant="h6">内存使用率</Typography>
              </Box>
              <Typography variant="h3" color="warning" gutterBottom>
                {memoryPercent.toFixed(1)}%
              </Typography>
              <LinearProgress 
                variant="determinate" 
                value={Math.min(memoryPercent, 100)} 
                color="warning"
                sx={{ height: 8, borderRadius: 4 }}
              />
              <Typography variant="body2" color="text.secondary" mt={1}>
                {(usedMemory / 1024).toFixed(1)} / {(totalMemory / 1024).toFixed(1)} GB
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <MemoryIcon sx={{ mr: 1, color: gpuNodes > 0 ? 'success.main' : 'action.disabled' }} />
                <Typography variant="h6">GPU 资源</Typography>
              </Box>
              <Typography variant="h3" color={gpuNodes > 0 ? 'success' : 'text.secondary'} gutterBottom>
                {totalGPUs}
              </Typography>
              <LinearProgress 
                variant="determinate" 
                value={Math.min(avgGPU, 100)} 
                color="success"
                sx={{ height: 8, borderRadius: 4 }}
              />
              <Typography variant="body2" color="text.secondary" mt={1}>
                {gpuNodes} 个节点 / {avgGPU.toFixed(1)}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">资源使用趋势</Typography>
                <Box>
                  <Tooltip title="导出报告">
                    <Button
                      startIcon={<Download />}
                      size="small"
                      onClick={(e) => setExportMenuAnchor(e.currentTarget)}
                      sx={{ mr: 1 }}
                    >
                      导出报告
                    </Button>
                  </Tooltip>
                  <Menu
                    anchorEl={exportMenuAnchor}
                    open={Boolean(exportMenuAnchor)}
                    onClose={() => setExportMenuAnchor(null)}
                  >
                    <MenuItem onClick={() => handleExportReport('json')}>导出 JSON</MenuItem>
                    <MenuItem onClick={() => handleExportReport('md')}>导出 Markdown</MenuItem>
                  </Menu>
                  <Tooltip title="同步Swarm">
                    <Button startIcon={<Sync />} size="small" onClick={onSync} sx={{ mr: 1 }}>
                      同步
                    </Button>
                  </Tooltip>
                  <Tooltip title="刷新数据">
                    <Button startIcon={<Refresh />} size="small" onClick={onRefresh}>
                      刷新
                    </Button>
                  </Tooltip>
                </Box>
              </Box>
              <Box height={200}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={resourceHistory}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <RechartsTooltip />
                    <Area type="monotone" dataKey="cpu" name="CPU %" stroke="#1976d2" fill="#1976d2" fillOpacity={0.3} />
                    <Area type="monotone" dataKey="memory" name="内存 %" stroke="#ed6c02" fill="#ed6c02" fillOpacity={0.3} />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" mb={2}>节点状态分布</Typography>
              <Box height={200}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={nodes.map(n => ({
                    name: n.Name || n.Hostname || n.ID?.slice(0, 8),
                    cpu: n.CPUUsed || 0,
                    memory: n.MemoryMB ? (n.MemoryUsed / n.MemoryMB * 100) : 0,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <RechartsTooltip />
                    <Line type="monotone" dataKey="cpu" name="CPU %" stroke="#1976d2" strokeWidth={2} />
                    <Line type="monotone" dataKey="memory" name="内存 %" stroke="#ed6c02" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default ClusterOverview;
