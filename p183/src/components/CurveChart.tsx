import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useFitStore } from '../store/useFitStore';

const CurveChart: React.FC = () => {
  const { measuredData, fittedData, yAxisScale, setYAxisScale } = useFitStore();

  const option = useMemo(() => {
    const measuredSeries = measuredData.map(d => [d.v, d.i]);
    const fittedSeries = fittedData.map(d => [d.v, d.i]);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(30, 58, 95, 0.95)',
        borderColor: '#1e3a5f',
        textStyle: { color: '#fff' },
        formatter: (params: any) => {
          let html = `<div style="font-weight: 600; margin-bottom: 8px;">V = ${params[0]?.value[0]?.toFixed(4)} V</div>`;
          params.forEach((param: any) => {
            const value = param.value[1];
            let formatted: string;
            if (yAxisScale === 'log') {
              formatted = value >= 1e-3 
                ? `${(value * 1000).toFixed(4)} mA`
                : value >= 1e-6
                ? `${(value * 1e6).toFixed(4)} μA`
                : `${(value * 1e9).toFixed(4)} nA`;
            } else {
              formatted = value >= 1e-3 
                ? `${(value * 1000).toFixed(4)} mA`
                : `${value.toExponential(4)} A`;
            }
            html += `<div style="display: flex; align-items: center; gap: 8px; margin: 4px 0;">
              <span style="width: 10px; height: 10px; border-radius: 50%; background: ${param.color};"></span>
              <span>${param.seriesName}: ${formatted}</span>
            </div>`;
          });
          return html;
        }
      },
      legend: {
        data: ['实测数据', '拟合曲线'],
        top: 10,
        textStyle: { color: '#475569' }
      },
      grid: {
        left: '12%',
        right: '5%',
        bottom: '12%',
        top: '15%'
      },
      xAxis: {
        name: '电压 (V)',
        nameLocation: 'middle',
        nameGap: 25,
        nameTextStyle: { color: '#475569', fontSize: 13 },
        type: 'value',
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#64748b' },
        splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } }
      },
      yAxis: {
        name: yAxisScale === 'log' ? '电流 (A) [对数]' : '电流 (A) [线性]',
        nameLocation: 'middle',
        nameGap: 45,
        nameTextStyle: { color: '#475569', fontSize: 13 },
        type: yAxisScale as 'log' | 'value',
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#64748b' },
        splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } },
        ...(yAxisScale === 'linear' ? { min: 0 } : {})
      },
      series: [
        {
          name: '实测数据',
          type: 'scatter',
          data: measuredSeries,
          symbolSize: 8,
          itemStyle: {
            color: '#1e3a5f',
            opacity: 0.8
          }
        },
        {
          name: '拟合曲线',
          type: 'line',
          data: fittedSeries,
          smooth: true,
          lineStyle: {
            color: '#10b981',
            width: 3
          },
          symbol: 'none',
          itemStyle: { color: '#10b981' }
        }
      ]
    };
  }, [measuredData, fittedData, yAxisScale]);

  const hasData = measuredData.length > 0 && fittedData.length > 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-800">V-I 曲线对比</h3>
        {hasData && (
          <div className="flex items-center space-x-2">
            <span className="text-sm text-slate-500">Y轴:</span>
            <div className="flex bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setYAxisScale('log')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  yAxisScale === 'log'
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                对数
              </button>
              <button
                onClick={() => setYAxisScale('linear')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  yAxisScale === 'linear'
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                线性
              </button>
            </div>
          </div>
        )}
      </div>
      {hasData ? (
        <ReactECharts 
          option={option} 
          style={{ height: '400px', width: '100%' }}
          opts={{ renderer: 'canvas' }}
        />
      ) : (
        <div className="h-80 flex items-center justify-center text-slate-400">
          <div className="text-center">
            <svg className="w-16 h-16 mx-auto mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
            <p>上传数据后显示曲线</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CurveChart;
