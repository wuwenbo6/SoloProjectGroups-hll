import { useState, useRef, useCallback } from 'react'
import { Terminal, Play, ChevronDown, FileText } from 'lucide-react'
import type { SamplePacket } from '@/types/s7comm'

interface HexInputProps {
  value: string
  onChange: (value: string) => void
  onParse: () => void
  loading: boolean
  includeTpkt: boolean
  onIncludeTpktChange: (value: boolean) => void
  samples: SamplePacket[]
}

export default function HexInput({
  value,
  onChange,
  onParse,
  loading,
  includeTpkt,
  onIncludeTpktChange,
  samples,
}: HexInputProps) {
  const [showSamples, setShowSamples] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineNumbersRef = useRef<HTMLDivElement>(null)

  const lines = value.split('\n')

  const getOffsetForLine = (lineIndex: number) => {
    let offset = 0
    for (let i = 0; i < lineIndex; i++) {
      const hexBytes = lines[i].trim().split(/\s+/).filter((b) => b.length > 0)
      offset += hexBytes.length
    }
    return offset
  }

  const handleScroll = useCallback(() => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal size={18} style={{ color: '#00d4aa' }} />
          <span className="text-sm font-semibold text-gray-200">Hex Input</span>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeTpkt}
              onChange={(e) => onIncludeTpktChange(e.target.checked)}
              className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-[#00d4aa] focus:ring-[#00d4aa] focus:ring-offset-0 accent-[#00d4aa]"
            />
            <span className="text-xs text-gray-400">Include TPKT header</span>
          </label>
          <button
            onClick={onParse}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: '#00d4aa',
              color: '#0d1117',
            }}
          >
            <Play size={14} fill="currentColor" />
            {loading ? 'Parsing…' : 'Parse'}
          </button>
        </div>
      </div>

      <div
        className="relative rounded-lg border border-gray-700/80 bg-[#0d1117] overflow-hidden"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        <div className="flex">
          <div
            ref={lineNumbersRef}
            className="flex-shrink-0 select-none overflow-hidden border-r border-gray-700/60 py-3 text-right"
            style={{ width: '7.5rem' }}
          >
            {lines.map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-end gap-3 px-3"
                style={{ lineHeight: '1.625rem', fontSize: '0.75rem' }}
              >
                <span className="text-gray-600">{i + 1}</span>
                <span style={{ color: '#00d4aa', opacity: 0.5 }}>
                  {getOffsetForLine(i).toString(16).toUpperCase().padStart(4, '0')}
                </span>
              </div>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onScroll={handleScroll}
            spellCheck={false}
            className="flex-1 resize-none bg-transparent py-3 pl-4 pr-4 text-gray-200 caret-[#00d4aa] outline-none placeholder:text-gray-600"
            style={{
              lineHeight: '1.625rem',
              fontSize: '0.8125rem',
              minHeight: '14rem',
              tabSize: 2,
            }}
            placeholder="Enter hex bytes (e.g. 03 00 00 16 11 E0 00 00 00 01 00 C0 01 0A C1 02 01 00 C2 02 01 02)"
          />
        </div>
      </div>

      {samples.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setShowSamples(!showSamples)}
            className="flex items-center gap-2 rounded-md border border-gray-700/80 bg-[#161b22] px-3 py-2 text-xs text-gray-300 transition-colors hover:border-gray-600 hover:text-gray-200"
          >
            <FileText size={14} style={{ color: '#00d4aa' }} />
            <span>Sample Packets</span>
            <ChevronDown
              size={14}
              className={`transition-transform ${showSamples ? 'rotate-180' : ''}`}
            />
          </button>
          {showSamples && (
            <div className="absolute z-10 mt-1 w-80 rounded-lg border border-gray-700/80 bg-[#161b22] shadow-xl shadow-black/40 overflow-hidden">
              {samples.map((sample, i) => (
                <button
                  key={i}
                  onClick={() => {
                    onChange(sample.hex)
                    setShowSamples(false)
                  }}
                  className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors hover:bg-[#1c2333]"
                >
                  <span className="text-xs font-medium text-gray-200">
                    {sample.name}
                  </span>
                  <span className="text-[0.6875rem] text-gray-500">
                    {sample.description}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
