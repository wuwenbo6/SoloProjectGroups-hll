import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Slider,
  Button,
  Stack,
  Paper,
  Chip,
} from '@mui/material';
import DeviceCard from './DeviceCard';
import { deviceAPI } from '../services/api';
import socketService from '../services/socket';

function DeviceGrid() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterArea, setFilterArea] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [globalBrightness, setGlobalBrightness] = useState(80);
  const [globalColorTemp, setGlobalColorTemp] = useState(4000);

  const areas = ['all', '会议室A', '会议室B', '办公区A', '办公区B', '走廊', '大厅', '休息区'];

  useEffect(() => {
    fetchDevices();
    socketService.connect();

    const handleDeviceStatusBatch = (updates) => {
      if (Array.isArray(updates) && updates.length > 0) {
        setDevices((prev) => {
          const updateMap = new Map();
          updates.forEach(device => updateMap.set(device.id, device));
          
          return prev.map((d) => {
            const update = updateMap.get(d.id);
            return update ? { ...d, ...update } : d;
          });
        });
      }
    };

    const handleDeviceList = (data) => {
      if (Array.isArray(data)) {
        setDevices(data);
      }
    };

    socketService.on('deviceStatusBatch', handleDeviceStatusBatch);
    socketService.on('deviceList', handleDeviceList);

    return () => {
      socketService.off('deviceStatusBatch', handleDeviceStatusBatch);
      socketService.off('deviceList', handleDeviceList);
    };
  }, []);

  const fetchDevices = async () => {
    try {
      const response = await deviceAPI.getAllDevices();
      if (response.data.length === 0) {
        await deviceAPI.syncDevices();
        const syncResponse = await deviceAPI.getAllDevices();
        setDevices(syncResponse.data);
      } else {
        setDevices(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch devices:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeviceControl = async (deviceId, controlData) => {
    try {
      await deviceAPI.controlDevice(deviceId, controlData);
      setDevices((prev) =>
        prev.map((d) =>
          d.id === deviceId ? { ...d, ...controlData, lastUpdate: new Date() } : d
        )
      );
    } catch (error) {
      console.error('Failed to control device:', error);
    }
  };

  const handleGlobalControl = async () => {
    try {
      const controlData = {
        brightness: globalBrightness,
        colorTemperature: globalColorTemp,
        area: filterArea === 'all' ? undefined : filterArea,
      };
      await deviceAPI.controlAllDevices(controlData);

      setDevices((prev) =>
        prev.map((d) =>
          filterArea === 'all' || d.area === filterArea
            ? { ...d, ...controlData, lastUpdate: new Date() }
            : d
        )
      );
    } catch (error) {
      console.error('Failed to control all devices:', error);
    }
  };

  const filteredDevices = devices.filter((device) => {
    const matchesArea = filterArea === 'all' || device.area === filterArea;
    const matchesSearch =
      device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.id.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesArea && matchesSearch;
  });

  const onlineCount = filteredDevices.filter((d) => d.online).length;

  if (loading) {
    return <Typography>加载中...</Typography>;
  }

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6" gutterBottom>
            全局控制
          </Typography>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                size="small"
                label="搜索设备"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>区域</InputLabel>
                <Select
                  value={filterArea}
                  label="区域"
                  onChange={(e) => setFilterArea(e.target.value)}
                >
                  {areas.map((area) => (
                    <MenuItem key={area} value={area}>
                      {area === 'all' ? '全部区域' : area}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <Typography variant="caption" gutterBottom>
                亮度: {globalBrightness}%
              </Typography>
              <Slider
                value={globalBrightness}
                onChange={(e, newValue) => setGlobalBrightness(newValue)}
                min={0}
                max={100}
                size="small"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <Typography variant="caption" gutterBottom>
                色温: {globalColorTemp}K
              </Typography>
              <Slider
                value={globalColorTemp}
                onChange={(e, newValue) => setGlobalColorTemp(newValue)}
                min={2700}
                max={6500}
                step={100}
                size="small"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <Button fullWidth variant="contained" onClick={handleGlobalControl}>
                应用到全部
              </Button>
            </Grid>
          </Grid>
          <Box display="flex" gap={1}>
            <Chip label={`总计: ${filteredDevices.length} 个设备`} size="small" />
            <Chip label={`在线: ${onlineCount}`} color="success" size="small" />
            <Chip label={`离线: ${filteredDevices.length - onlineCount}`} color="error" size="small" />
          </Box>
        </Stack>
      </Paper>

      <Grid container spacing={2}>
        {filteredDevices.map((device) => (
          <Grid item xs={6} sm={4} md={3} lg={2} key={device.id}>
            <DeviceCard device={device} onControl={handleDeviceControl} />
          </Grid>
        ))}
      </Grid>

      {filteredDevices.length === 0 && (
        <Box textAlign="center" py={4}>
          <Typography color="text.secondary">没有找到匹配的设备</Typography>
        </Box>
      )}
    </Box>
  );
}

export default DeviceGrid;
