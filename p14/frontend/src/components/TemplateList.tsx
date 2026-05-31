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
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { Template } from '../types';

interface TemplateListProps {
  templates: Template[];
  onSelect?: (template: Template) => void;
  onDelete?: (id: number) => void;
}

const TemplateList: React.FC<TemplateListProps> = ({ templates, onSelect, onDelete }) => {
  return (
    <Paper elevation={3} sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        模板列表
      </Typography>

      {templates.length > 0 ? (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>名称</TableCell>
                <TableCell>台站</TableCell>
                <TableCell>通道</TableCell>
                <TableCell>采样率</TableCell>
                <TableCell>操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {templates.map((tpl) => (
                <TableRow key={tpl.id} hover>
                  <TableCell>{tpl.id}</TableCell>
                  <TableCell>{tpl.name}</TableCell>
                  <TableCell>{tpl.station}</TableCell>
                  <TableCell>{tpl.channel}</TableCell>
                  <TableCell>{tpl.sampling_rate} Hz</TableCell>
                  <TableCell>
                    {onSelect && (
                      <IconButton size="small" onClick={() => onSelect(tpl)} color="primary">
                        <PlayArrowIcon fontSize="small" />
                      </IconButton>
                    )}
                    {onDelete && (
                      <IconButton size="small" onClick={() => onDelete(tpl.id)} color="error">
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
          暂无模板，请先上传模板文件
        </Typography>
      )}
    </Paper>
  );
};

export default TemplateList;
