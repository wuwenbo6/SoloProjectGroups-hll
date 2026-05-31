import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  TextField,
  CircularProgress,
} from '@mui/material';
import { Download, History } from '@mui/icons-material';
import { logAPI } from '../services/api';

const actionLabels = {
  manual: { label: '手动控制', color: 'primary' },
  scene: { label: '场景切换', color: 'secondary' },
  schedule: { label: '定时任务', color: 'warning' },
  automation: { label: '传感器联动', color: 'info' },
  daylight: { label: '日光补偿', color: 'success' },
};

function ControlLogViewer() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [actionFilter, setActionFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const areas = ['', '会议室A', '会议室B', '办公区A', '办公区B', '走廊', '大厅', '休息区'];

  useEffect(() => {
    fetchLogs();
  }, [page, pageSize, actionFilter, areaFilter, startDate, endDate]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = {
        page: page + 1,
        pageSize,
        action: actionFilter || undefined,
        area: areaFilter || undefined,
        startTime: startDate || undefined,
        endTime: endDate || undefined,
      };

      const response = await logAPI.getLogs(params);
      setLogs(response.data.data || []);
      setTotal(response.data.total || 0);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format) => {
    try {
      const params = {
        action: actionFilter || undefined,
        area: areaFilter || undefined,
        startTime: startDate || undefined,
        endTime: endDate || undefined,
        format,
      };

      const response = await logAPI.exportLogs(params);
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `control_logs.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Failed to export logs:', error);
    }
  };

  const handleChangePage = (_, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setPageSize(parseInt(event.target.value, 10));
    setPage(0);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
          <Box display="flex" alignItems="center">
            <History sx={{ mr: 1 }} />
            <Typography variant="h6">控制日志</Typography>
          </Box>
          <Box>
            <Button
              variant="outlined"
              startIcon={<Download />}
              onClick={() => handleExport('csv')}
              sx={{ mr: 1 }}
            >
              导出 CSV
            </Button>
            <Button
              variant="outlined"
              startIcon={<Download />}
              onClick={() => handleExport('json')}
            >
              导出 JSON
            </Button>
          </Box>
        </Box>

        <Grid container spacing={2} mb={3}>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>操作类型</InputLabel>
              <Select
                value={actionFilter}
                label="操作类型"
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(0);
                }}
              >
                <MenuItem value="">全部</MenuItem>
                {Object.entries(actionLabels).map(([key, value]) => (
                  <MenuItem key={key} value={key}>
                    {value.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>区域</InputLabel>
              <Select
                value={areaFilter}
                label="区域"
                onChange={(e) => {
                  setAreaFilter(e.target.value);
                  setPage(0);
                }}
              >
                <MenuItem value="">全部区域</MenuItem>
                {areas.filter(a => a).map((area) => (
                  <MenuItem key={area} value={area}>
                    {area}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label="开始日期"
              InputLabelProps={{ shrink: true }}
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(0);
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label="结束日期"
              InputLabelProps={{ shrink: true }}
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(0);
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Button fullWidth variant="contained" onClick={fetchLogs}>
              查询
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>时间</TableCell>
              <TableCell>操作类型</TableCell>
              <TableCell>操作来源</TableCell>
              <TableCell>设备/区域</TableCell>
              <TableCell>亮度</TableCell>
              <TableCell>色温</TableCell>
              <TableCell>影响设备数</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Typography color="text.secondary">暂无日志数据</Typography>
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => {
                const actionInfo = actionLabels[log.action] || { label: log.action, color: 'default' };
                return (
                  <TableRow key={log.id} hover>
                    <TableCell>{formatDate(log.timestamp)}</TableCell>
                    <TableCell>
                      <Chip label={actionInfo.label} color={actionInfo.color} size="small" />
                    </TableCell>
                    <TableCell>{log.actionSource || '-'}</TableCell>
                    <TableCell>{log.area || log.deviceName || log.deviceId || '-'}</TableCell>
                    <TableCell>{log.brightness !== undefined ? `${log.brightness}%` : '-'}</TableCell>
                    <TableCell>{log.colorTemperature ? `${log.colorTemperature}K` : '-'}</TableCell>
                    <TableCell>{log.affectedDevices || 1}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <TablePagination
          rowsPerPageOptions={[10, 20, 50, 100]}
          component="div"
          count={total}
          rowsPerPage={pageSize}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          labelRowsPerPage="每页行数"
        />
      </TableContainer>
    </Box>
  );
}

export default ControlLogViewer;
