import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Box,
  Typography,
} from '@mui/material';

function DeploymentHistory({ history, loading }) {
  const getStatusColor = (status) => {
    switch (status) {
      case 'success':
        return 'success';
      case 'failed':
        return 'error';
      case 'pending':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getActionColor = (action) => {
    switch (action) {
      case 'create':
      case 'deploy':
        return 'primary';
      case 'failover':
        return 'warning';
      case 'delete':
        return 'error';
      case 'update':
        return 'info';
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
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>时间</TableCell>
            <TableCell>服务名称</TableCell>
            <TableCell>操作类型</TableCell>
            <TableCell>状态</TableCell>
            <TableCell>节点</TableCell>
            <TableCell>消息</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {history.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} align="center">
                <Typography color="text.secondary" py={4}>
                  暂无部署历史
                </Typography>
              </TableCell>
            </TableRow>
          ) : (
            history.map((item, i) => (
              <TableRow key={item.ID || i} hover>
                <TableCell>
                  <Typography variant="caption">
                    {item.Timestamp ? new Date(item.Timestamp).toLocaleString() : '-'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight="medium">
                    {item.ServiceName || item.ServiceID?.slice(0, 12)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={item.Action || 'unknown'}
                    size="small"
                    color={getActionColor(item.Action)}
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    label={item.Status || 'unknown'}
                    size="small"
                    color={getStatusColor(item.Status)}
                  />
                </TableCell>
                <TableCell>{item.NodeID?.slice(0, 12) || '-'}</TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {item.Message || '-'}
                  </Typography>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default DeploymentHistory;
