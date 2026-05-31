import React from 'react';
import {
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { Detection } from '../types';

interface DetectionListProps {
  detections: Detection[];
  onView?: (detection: Detection) => void;
  onDelete?: (id: number) => void;
}

const DetectionList: React.FC<DetectionListProps> = ({ detections, onView, onDelete }) => {
  const getCCColor = (cc: number) => {
    if (cc >= 0.9) return 'success';
    if (cc >= 0.8) return 'primary';
    if (cc >= 0.75) return 'warning';
    return 'error';
  };

  return (
    <Paper elevation={3} sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        检测结果列表
      </Typography>

      {detections.length > 0 ? (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>台站</TableCell>
                <TableCell>通道</TableCell>
                <TableCell>检测时间</TableCell>
                <TableCell>相关系数</TableCell>
                <TableCell>使用阈值</TableCell>
                <TableCell>模板</TableCell>
                <TableCell>操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {detections.map((det) => (
                <TableRow key={det.id} hover>
                  <TableCell>{det.id}</TableCell>
                  <TableCell>{det.station}</TableCell>
                  <TableCell>{det.channel}</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>{det.detection_time}</TableCell>
                  <TableCell>
                    <Chip
                      label={det.correlation_coefficient.toFixed(3)}
                      color={getCCColor(det.correlation_coefficient)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {det.threshold_used ? det.threshold_used.toFixed(3) : '-'}
                  </TableCell>
                  <TableCell>{det.template?.name || '-'}</TableCell>
                  <TableCell>
                    {onView && (
                      <IconButton size="small" onClick={() => onView(det)} color="primary">
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                    )}
                    {onDelete && (
                      <IconButton size="small" onClick={() => onDelete(det.id)} color="error">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Typography variant="body2" color="text.secondary">
          暂无检测结果
        </Typography>
      )}
    </Paper>
  );
};

export default DetectionList;
