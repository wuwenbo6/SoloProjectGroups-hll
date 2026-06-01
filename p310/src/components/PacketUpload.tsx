import { useState, useCallback } from 'react'
import { Upload, FileCode, Loader2, Sparkles, Settings2 } from 'lucide-react'
import type { CodecListResponse } from '@/types'

interface PacketUploadProps {
  onFileUpload: (file: File) => void
  onHexSubmit: (hex: string) => void
  onDemoGenerate: () => void
  loading: boolean
  codecs: CodecListResponse | null
  selectedCodec: string
  onCodecChange: (codec: string) => void
}

export default function PacketUpload({
  onFileUpload,
  onHexSubmit,
  onDemoGenerate,
  loading,
  codecs,
  selectedCodec,
  onCodecChange,
}: PacketUploadProps) {
  const [hexInput, setHexInput] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) onFileUpload(file)
    },
    [onFileUpload]
  )

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFileUpload(file)
    e.target.value = ''
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
      <h2 className="text-lg font-semibold text-slate-100 mb-4">报文上传</h2>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
          dragOver
            ? 'border-brand-400 bg-brand-500/10'
            : 'border-slate-600 hover:border-slate-500 hover:bg-slate-800/50'
        }`}
      >
        <input
          type="file"
          onChange={handleFileChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          accept=".bin,.pcap,.raw,.hex"
        />
        <Upload className="mx-auto mb-2 text-slate-500" size={28} />
        <p className="text-sm text-slate-400">
          拖拽 RTCP XR 报文文件至此，或 <span className="text-brand-400">点击上传</span>
        </p>
        <p className="text-xs text-slate-600 mt-1">支持 .bin / .pcap / .raw 二进制文件</p>
      </div>

      <div className="mt-4">
        <label className="flex items-center gap-2 text-sm text-slate-400 mb-2">
          <Settings2 size={14} />
          编解码器类型
        </label>
        <select
          value={selectedCodec}
          onChange={(e) => onCodecChange(e.target.value)}
          disabled={loading}
          className="w-full bg-slate-900/50 border border-slate-700 rounded-xl p-3 text-sm text-slate-300 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {codecs?.codecs.map((codecName) => {
            const params = codecs.params[codecName]
            return (
              <option key={codecName} value={codecName}>
                {codecName} - {params.description} ({params.packetization_ms}ms, 基础 MOS: {params.base_mos})
              </option>
            )
          })}
          {!codecs && (
            <option value="G.711">G.711 - PCM 64kbps (20ms)</option>
          )}
        </select>
      </div>

      <div className="mt-4">
        <label className="flex items-center gap-2 text-sm text-slate-400 mb-2">
          <FileCode size={14} />
          十六进制输入
        </label>
        <textarea
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value)}
          placeholder="粘贴 RTCP XR 报文的十六进制字符串，例如：80CF0008..."
          className="w-full h-20 bg-slate-900/50 border border-slate-700 rounded-xl p-3 text-sm font-mono text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50 resize-none"
        />
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => { onHexSubmit(hexInput); setHexInput('') }}
            disabled={!hexInput.trim() || loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-brand-500/25 disabled:shadow-none"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <FileCode size={14} />}
            解析报文
          </button>
          <button
            onClick={onDemoGenerate}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-slate-300 rounded-xl text-sm font-medium transition-all"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            生成演示数据
          </button>
        </div>
      </div>
    </div>
  )
}
