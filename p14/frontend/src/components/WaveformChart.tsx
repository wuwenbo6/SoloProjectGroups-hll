import React, { useRef, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { WaveformSegment } from '../types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface WaveformChartProps {
  waveform: WaveformSegment;
  title?: string;
  color?: string;
  height?: number;
}

const WaveformChart: React.FC<WaveformChartProps> = ({
  waveform,
  title,
  color = 'rgb(75, 192, 192)',
  height = 200,
}) => {
  const chartRef = useRef<ChartJS<'line'>>(null);

  const labels = waveform.data.map((_, i) => {
    const time = i / waveform.sampling_rate;
    return time.toFixed(2);
  });

  const data = {
    labels,
    datasets: [
      {
        label: title || `${waveform.station} ${waveform.channel}`,
        data: waveform.data,
        borderColor: color,
        backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.1)'),
        borderWidth: 1,
        pointRadius: 0,
        tension: 0,
        fill: true,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: !!title,
        position: 'top' as const,
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            return `振幅: ${context.parsed.y.toFixed(4)}`;
          },
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: '时间 (秒)',
        },
        ticks: {
          maxTicksLimit: 10,
        },
      },
      y: {
        title: {
          display: true,
          text: '振幅',
        },
      },
    },
  };

  return (
    <div style={{ height }}>
      <Line ref={chartRef} data={data} options={options} />
    </div>
  );
};

export default WaveformChart;
