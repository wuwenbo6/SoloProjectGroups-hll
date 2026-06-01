import { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { TrendingUp, MapPin, BarChart3, Route } from 'lucide-react';
import { api } from '@/services/api';
import { Region, YearStats } from '@/types';

export default function Stats() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [stats, setStats] = useState<YearStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRegions = async () => {
      try {
        const data = await api.getRegions();
        setRegions(data);
        if (data.length > 0) {
          setSelectedRegion(data[0].id);
        }
      } catch (error) {
        console.error('Failed to fetch regions:', error);
      }
    };
    fetchRegions();
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      if (selectedRegion) {
        setLoading(true);
        try {
          const data = await api.getStats(selectedRegion);
          setStats(data);
        } catch (error) {
          console.error('Failed to fetch stats:', error);
        } finally {
          setLoading(false);
        }
      }
    };
    fetchStats();
  }, [selectedRegion]);

  const countChartOption = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      textStyle: { color: '#374151' },
    },
    legend: {
      data: ['新增道路', '消失道路', '道路总数'],
      top: 10,
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: stats.map((s) => s.year),
      axisLine: { lineStyle: { color: '#e5e7eb' } },
      axisLabel: { color: '#6b7280' },
    },
    yAxis: [
      {
        type: 'value',
        name: '新增/消失道路',
        position: 'left',
        axisLine: { show: false },
        splitLine: { lineStyle: { color: '#f3f4f6' } },
        axisLabel: { color: '#6b7280' },
      },
      {
        type: 'value',
        name: '道路总数',
        position: 'right',
        axisLine: { show: false },
        splitLine: { show: false },
        axisLabel: { color: '#6b7280' },
      },
    ],
    series: [
      {
        name: '新增道路',
        type: 'bar',
        data: stats.map((s) => s.newRoads),
        itemStyle: { color: '#00B42A' },
        barWidth: 20,
      },
      {
        name: '消失道路',
        type: 'bar',
        data: stats.map((s) => s.disappearedRoads),
        itemStyle: { color: '#F53F3F' },
        barWidth: 20,
      },
      {
        name: '道路总数',
        type: 'line',
        yAxisIndex: 1,
        data: stats.map((s) => s.totalRoads),
        smooth: true,
        lineStyle: { color: '#165DFF', width: 3 },
        itemStyle: { color: '#165DFF' },
        symbol: 'circle',
        symbolSize: 8,
      },
    ],
  };

  const lengthChartOption = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      textStyle: { color: '#374151' },
      formatter: (params: any) => {
        let result = `<div class="font-medium">${params[0].axisValue}年</div>`;
        params.forEach((item: any) => {
          const value = item.seriesName.includes('总长度') 
            ? (item.value / 1000).toFixed(2) + ' km'
            : '+' + (item.value / 1000).toFixed(2) + ' km';
          result += `<div style="color:${item.color}">${item.marker} ${item.seriesName}: ${value}</div>`;
        });
        return result;
      },
    },
    legend: {
      data: ['新增里程', '消失里程', '总长度'],
      top: 10,
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: stats.map((s) => s.year),
      axisLine: { lineStyle: { color: '#e5e7eb' } },
      axisLabel: { color: '#6b7280' },
    },
    yAxis: [
      {
        type: 'value',
        name: '新增/消失里程 (km)',
        position: 'left',
        axisLine: { show: false },
        splitLine: { lineStyle: { color: '#f3f4f6' } },
        axisLabel: { 
          color: '#6b7280',
          formatter: (value: number) => (value / 1000).toFixed(0),
        },
      },
      {
        type: 'value',
        name: '总长度 (km)',
        position: 'right',
        axisLine: { show: false },
        splitLine: { show: false },
        axisLabel: { 
          color: '#6b7280',
          formatter: (value: number) => (value / 1000).toFixed(0),
        },
      },
    ],
    series: [
      {
        name: '新增里程',
        type: 'bar',
        data: stats.map((s) => s.newLength),
        itemStyle: { color: '#36BFFA' },
        barWidth: 20,
      },
      {
        name: '消失里程',
        type: 'bar',
        data: stats.map((s) => s.disappearedLength),
        itemStyle: { color: '#FF7D00' },
        barWidth: 20,
      },
      {
        name: '总长度',
        type: 'line',
        yAxisIndex: 1,
        data: stats.map((s) => s.totalLength),
        smooth: true,
        lineStyle: { color: '#722ED1', width: 3 },
        itemStyle: { color: '#722ED1' },
        symbol: 'circle',
        symbolSize: 8,
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(114, 46, 209, 0.3)' },
              { offset: 1, color: 'rgba(114, 46, 209, 0.05)' },
            ],
          },
        },
      },
    ],
  };

  const totalStats = stats.reduce(
    (acc, curr) => ({
      totalNew: acc.totalNew + curr.newRoads,
      totalDisappeared: acc.totalDisappeared + curr.disappearedRoads,
      maxTotal: Math.max(acc.maxTotal, curr.totalRoads),
      totalNewLength: acc.totalNewLength + curr.newLength,
      totalDisappearedLength: acc.totalDisappearedLength + curr.disappearedLength,
      maxTotalLength: Math.max(acc.maxTotalLength, curr.totalLength),
    }),
    { totalNew: 0, totalDisappeared: 0, maxTotal: 0, totalNewLength: 0, totalDisappearedLength: 0, maxTotalLength: 0 }
  );

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">统计分析</h1>
          <p className="text-gray-500">查看各地区路网演变趋势和详细数据</p>
        </div>

        <div className="mb-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              <span className="text-gray-600">选择地区：</span>
            </div>
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              <p className="text-xs text-gray-500">累计新增道路</p>
            </div>
            <p className="text-xl font-bold text-gray-900">{totalStats.totalNew}</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-red-600 rotate-180" />
              <p className="text-xs text-gray-500">累计消失道路</p>
            </div>
            <p className="text-xl font-bold text-gray-900">{totalStats.totalDisappeared}</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              <p className="text-xs text-gray-500">当前道路总数</p>
            </div>
            <p className="text-xl font-bold text-gray-900">{totalStats.maxTotal}</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <Route className="w-5 h-5 text-cyan-600" />
              <p className="text-xs text-gray-500">累计新增里程</p>
            </div>
            <p className="text-xl font-bold text-gray-900">{(totalStats.totalNewLength / 1000).toFixed(1)} km</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <Route className="w-5 h-5 text-orange-600" />
              <p className="text-xs text-gray-500">累计消失里程</p>
            </div>
            <p className="text-xl font-bold text-gray-900">{(totalStats.totalDisappearedLength / 1000).toFixed(1)} km</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <Route className="w-5 h-5 text-purple-600" />
              <p className="text-xs text-gray-500">当前总里程</p>
            </div>
            <p className="text-xl font-bold text-gray-900">{(totalStats.maxTotalLength / 1000).toFixed(1)} km</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">道路数量变化</h2>
            {loading ? (
              <div className="h-80 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <ReactECharts option={countChartOption} style={{ height: '350px' }} />
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">道路长度变化</h2>
            {loading ? (
              <div className="h-80 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <ReactECharts option={lengthChartOption} style={{ height: '350px' }} />
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">详细数据</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    年份
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    新增道路
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    消失道路
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    道路总数
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    新增里程
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    总里程
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.map((stat) => {
                  const netGrowth = stat.newRoads - stat.disappearedRoads;
                  return (
                    <tr key={stat.year} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {stat.year}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                          +{stat.newRoads}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">
                          -{stat.disappearedRoads}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {stat.totalRoads}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-cyan-600">
                        +{(stat.newLength / 1000).toFixed(1)} km
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-purple-600">
                        {(stat.totalLength / 1000).toFixed(1)} km
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
