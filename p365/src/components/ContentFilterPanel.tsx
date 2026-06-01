import { useDDSStore, ContentFilterConfig } from '@/store/ddsStore'
import { Filter, Tag, Hash, Search, ToggleLeft, ToggleRight } from 'lucide-react'

const TOPIC_OPTIONS = [
  { value: '*', label: '全部主题' },
  { value: 'sensor/temp', label: '🌡️ 温度 (sensor/temp)' },
  { value: 'sensor/pressure', label: '💨 压力 (sensor/pressure)' },
  { value: 'sensor/humidity', label: '💧 湿度 (sensor/humidity)' },
  { value: 'sensor/velocity', label: '🚀 速度 (sensor/velocity)' },
  { value: 'control/command', label: '🎮 控制 (control/command)' },
]

export default function ContentFilterPanel() {
  const { contentFilter, setContentFilter, contentFilterCount } = useDDSStore()

  const handleChange = (key: keyof ContentFilterConfig, value: unknown) => {
    setContentFilter({ [key]: value })
  }

  return (
    <div className="bg-[#111827] border border-[#1E293B] rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-purple-400" />
          <h2 className="text-lg font-semibold text-white tracking-wide">ContentFilteredTopic</h2>
        </div>
        <button
          onClick={() => handleChange('enabled', !contentFilter.enabled)}
          className="flex items-center gap-2 text-sm"
        >
          {contentFilter.enabled ? (
            <ToggleRight className="w-8 h-8 text-purple-500" />
          ) : (
            <ToggleLeft className="w-8 h-8 text-slate-600" />
          )}
        </button>
      </div>

      <div
        className={`space-y-4 transition-opacity duration-300 ${
          contentFilter.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'
        }`}
      >
        <div>
          <label className="flex items-center gap-2 text-sm text-slate-400 mb-2">
            <Tag className="w-4 h-4" />
            主题过滤
          </label>
          <select
            value={contentFilter.topic}
            onChange={(e) => handleChange('topic', e.target.value)}
            className="w-full bg-[#0F172A] border border-[#1E293B] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
          >
            {TOPIC_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="flex items-center gap-2 text-sm text-slate-400 mb-2">
              <Hash className="w-4 h-4" />
              数值最小值
            </label>
            <input
              type="number"
              placeholder="不限"
              value={contentFilter.valueMin ?? ''}
              onChange={(e) =>
                handleChange('valueMin', e.target.value === '' ? null : Number(e.target.value))
              }
              className="w-full bg-[#0F172A] border border-[#1E293B] rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm text-slate-400 mb-2">
              <Hash className="w-4 h-4" />
              数值最大值
            </label>
            <input
              type="number"
              placeholder="不限"
              value={contentFilter.valueMax ?? ''}
              onChange={(e) =>
                handleChange('valueMax', e.target.value === '' ? null : Number(e.target.value))
              }
              className="w-full bg-[#0F172A] border border-[#1E293B] rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
            />
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm text-slate-400 mb-2">
            <Search className="w-4 h-4" />
            内容关键词
          </label>
          <input
            type="text"
            placeholder="输入关键词，如 Sample-100"
            value={contentFilter.keyword}
            onChange={(e) => handleChange('keyword', e.target.value)}
            className="w-full bg-[#0F172A] border border-[#1E293B] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
          />
        </div>
      </div>

      {contentFilter.enabled && contentFilterCount > 0 && (
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-purple-300">内容过滤已拦截</span>
          <span className="text-xl font-bold text-purple-400 font-mono">{contentFilterCount}</span>
        </div>
      )}
    </div>
  )
}
