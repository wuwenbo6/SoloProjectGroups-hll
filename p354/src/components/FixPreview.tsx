import { useState } from "react"
import { X, Download, Copy, Check, AlertTriangle, Wrench } from "lucide-react"
import { useAnalysisStore } from "@/store/useAnalysisStore"
import { formatSize, formatNumber } from "@/lib/utils"
import { cn } from "@/lib/utils"

interface FixPreviewProps {
  onClose: () => void
}

export default function FixPreview({ onClose }: FixPreviewProps) {
  const { currentFix, generateFix, loading } = useAnalysisStore()
  const [scriptType, setScriptType] = useState<"ceph" | "binary">("ceph")
  const [copied, setCopied] = useState(false)

  const handleGenerate = async () => {
    await generateFix(scriptType)
  }

  const handleDownload = () => {
    if (!currentFix) return
    const ext = scriptType === "ceph" ? "sh" : "hex.txt"
    const blob = new Blob([currentFix.script_content], {
      type: scriptType === "ceph" ? "text/x-shellscript" : "text/plain",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `bluefs_fix_${Date.now()}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleCopy = async () => {
    if (!currentFix) return
    await navigator.clipboard.writeText(currentFix.script_content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!currentFix) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-navy-dark border border-navy-light/60 rounded-xl p-8 w-full max-w-3xl shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-slate-200">Generate Fix Script</h2>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">
              &times;
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">Script Type</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setScriptType("ceph")}
                  className={cn(
                    "px-4 py-2 rounded-md text-sm font-medium transition-colors border",
                    scriptType === "ceph"
                      ? "bg-cyan/10 text-cyan border-cyan/30"
                      : "bg-navy-light/30 text-slate-400 border-navy-light hover:text-slate-300"
                  )}
                >
                  Ceph CLI Script
                </button>
                <button
                  onClick={() => setScriptType("binary")}
                  className={cn(
                    "px-4 py-2 rounded-md text-sm font-medium transition-colors border",
                    scriptType === "binary"
                      ? "bg-cyan/10 text-cyan border-cyan/30"
                      : "bg-navy-light/30 text-slate-400 border-navy-light hover:text-slate-300"
                  )}
                >
                  Binary Log (Hex)
                </button>
              </div>
            </div>

            <div className="bg-amber/10 border border-amber/30 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-amber font-medium">Warning</p>
                <p className="text-slate-400 mt-1">
                  This will generate DEALLOC operations for all detected leak blocks.
                  Always back up your data before applying fixes.
                </p>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md bg-amber/10 text-amber text-sm font-medium hover:bg-amber/20 transition-colors border border-amber/30 disabled:opacity-50"
            >
              <Wrench className="w-4 h-4" />
              Generate Fix Script
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-navy-dark border border-navy-light/60 rounded-xl p-8 w-full max-w-4xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-200">Fix Script Preview</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-navy-light/30 rounded-lg p-3 border border-navy-light/60">
            <p className="text-xs text-slate-500">Blocks to Fix</p>
            <p className="text-xl font-bold text-amber font-mono">{formatNumber(currentFix.block_count)}</p>
          </div>
          <div className="bg-navy-light/30 rounded-lg p-3 border border-navy-light/60">
            <p className="text-xs text-slate-500">Operations</p>
            <p className="text-xl font-bold text-cyan font-mono">{formatNumber(currentFix.operation_count)}</p>
          </div>
          <div className="bg-navy-light/30 rounded-lg p-3 border border-navy-light/60">
            <p className="text-xs text-slate-500">Total Size</p>
            <p className="text-xl font-bold text-green-500 font-mono">{formatSize(currentFix.total_size)}</p>
          </div>
          <div className="bg-navy-light/30 rounded-lg p-3 border border-navy-light/60">
            <p className="text-xs text-slate-500">Script Type</p>
            <p className="text-xl font-bold text-slate-300 font-mono capitalize">{currentFix.script_type}</p>
          </div>
        </div>

        <div className="flex gap-2 mb-3">
          <button
            onClick={handleCopy}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-navy-light/30 text-slate-300 text-sm hover:bg-navy-light/50 transition-colors border border-navy-light/60 disabled:opacity-50"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={handleDownload}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-cyan/10 text-cyan text-sm hover:bg-cyan/20 transition-colors border border-cyan/30 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
          <button
            onClick={() => useAnalysisStore.getState().setCurrentFix(null)}
            className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber/10 text-amber text-sm hover:bg-amber/20 transition-colors border border-amber/30"
          >
            <Wrench className="w-4 h-4" />
            Regenerate
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-black/30 rounded-lg border border-navy-light/40">
          <pre className="p-4 text-xs font-mono text-slate-300 whitespace-pre-wrap break-all">
            {currentFix.script_content}
          </pre>
        </div>
      </div>
    </div>
  )
}
