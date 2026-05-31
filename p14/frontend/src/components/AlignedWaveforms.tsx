import React from 'react';
import { Paper, Typography, Box } from '@mui/material';
import { AlignedWaveforms as AlignedWaveformsType } from '../types';
import WaveformChart from './WaveformChart';

interface AlignedWaveformsProps {
  data: AlignedWaveformsType;
}

const AlignedWaveformsComponent: React.FC<AlignedWaveformsProps> = ({ data }) => {
  const colors = [
    'rgb(75, 192, 192)',
    'rgb(255, 99, 132)',
    'rgb(54, 162, 235)',
    'rgb(255, 206, 86)',
    'rgb(153, 102, 255)',
    'rgb(255, 159, 64)',
  ];

  return (
    <Paper elevation={3} sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        对齐波形对比
      </Typography>

      <Box mb={4}>
        <Typography variant="subtitle1" gutterBottom>
          模板波形 ({data.template.station} {data.template.channel})
        </Typography>
        <WaveformChart
          waveform={data.template}
          title="模板"
          color={colors[0]}
          height={180}
        />
      </Box>

      {data.detections.length > 0 ? (
        data.detections.map((waveform, index) => (
          <Box key={index} mb={2}>
            <Typography variant="subtitle1" gutterBottom>
              检测到的事件 #{index + 1} ({waveform.start_time})
            </Typography>
            <WaveformChart
              waveform={waveform}
              title={`检测 ${index + 1}`}
              color={colors[(index + 1) % colors.length]}
              height={150}
            />
          </Box>
        ))
      ) : (
        <Typography variant="body2" color="text.secondary">
          暂无检测波形数据
        </Typography>
      )}
    </Paper>
  );
};

export default AlignedWaveformsComponent;
