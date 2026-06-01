import { Info } from 'lucide-react';

export function LegendPanel() {
  const legendItems = [
    { color: '#165DFF', label: '现有道路', description: '该年度已存在的道路' },
    { color: '#00B42A', label: '新增道路', description: '该年度新增的道路' },
    { color: '#F53F3F', label: '消失道路', description: '该年度消失的道路' },
  ];

  return (
    <div className="absolute top-4 right-4 z-[1000]">
      <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-xl p-4 border border-gray-100 max-w-xs">
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-800">图例说明</h3>
        </div>
        <div className="space-y-3">
          {legendItems.map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <div
                className="w-8 h-1.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <div>
                <div className="text-sm font-medium text-gray-700">{item.label}</div>
                <div className="text-xs text-gray-400">{item.description}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-gray-100">
          <div className="text-xs text-gray-400">
            道路粗细表示道路等级：高速公路 > 主干道 > 次干道
          </div>
        </div>
      </div>
    </div>
  );
}
