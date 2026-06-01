import { useCallback, useState } from "react"
import { Upload, FileUp, Loader2, Database, FileArchive } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAnalysisStore } from "@/store/useAnalysisStore"

interface FileUploadProps {
  onClose?: () => void
  onLoaded?: () => void
}

export default function FileUpload({ onClose, onLoaded }: FileUploadProps) {
  const [dragging, setDragging] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const { uploadFiles, loadDemo, loading, error } = useAnalysisStore()

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) {
        setSelectedFiles(files)
      }
    },
    []
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      if (files.length > 0) {
        setSelectedFiles(files)
      }
    },
    []
  )

  const handleUpload = useCallback(() => {
    if (selectedFiles.length > 0) {
      uploadFiles(selectedFiles).then(() => {
        onLoaded?.()
      })
    }
  }, [selectedFiles, uploadFiles, onLoaded])

  const handleDemo = useCallback(() => {
    loadDemo().then(() => onLoaded?.())
  }, [loadDemo, onLoaded])

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-navy-dark border border-navy-light/60 rounded-xl p-8 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-200">Upload Log Files</h2>
          {onClose && (
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">
              &times;
            </button>
          )}
        </div>

        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-lg py-8 px-6 cursor-pointer transition-colors",
            dragging
              ? "border-cyan bg-cyan/5"
              : "border-navy-light hover:border-cyan/50 hover:bg-cyan/5"
          )}
        >
          {loading ? (
            <Loader2 className="w-10 h-10 text-cyan animate-spin" />
          ) : (
            <FileUp className="w-10 h-10 text-slate-500" />
          )}
          <div className="text-center">
            <p className="text-sm text-slate-300">
              {loading ? "Analyzing..." : "Drag & drop or click to select"}
            </p>
            <p className="text-xs text-slate-500 mt-1">.log, .bin, .gz, .bz2, .tar, .tgz files supported</p>
          </div>
          <input
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            accept=".log,.bin,.gz,.bz2,.tar,.tgz"
          />
        </label>

        {selectedFiles.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-slate-400">Selected files ({selectedFiles.length}):</p>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {selectedFiles.map((f, i) => (
                <div key={i} className="flex items-center justify-between bg-navy-light/30 rounded px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <FileArchive className="w-4 h-4 text-cyan flex-shrink-0" />
                    <span className="text-slate-300 truncate">{f.name}</span>
                    <span className="text-slate-500 text-xs">({(f.size / 1024).toFixed(1)} KB)</span>
                  </div>
                  <button
                    onClick={() => removeFile(i)}
                    className="text-slate-500 hover:text-red-400 ml-2 flex-shrink-0"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={handleUpload}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-cyan/10 text-cyan text-sm font-medium hover:bg-cyan/20 transition-colors border border-cyan/30 disabled:opacity-50 mt-2"
            >
              <Upload className="w-4 h-4" />
              Upload & Analyze ({selectedFiles.length} files)
            </button>
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm text-red-400 text-center">{error}</p>
        )}

        <div className="mt-5 flex items-center gap-3">
          <div className="flex-1 h-px bg-navy-light" />
          <span className="text-xs text-slate-500">OR</span>
          <div className="flex-1 h-px bg-navy-light" />
        </div>

        <button
          onClick={handleDemo}
          disabled={loading}
          className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-amber/10 text-amber text-sm font-medium hover:bg-amber/20 transition-colors border border-amber/30 disabled:opacity-50"
        >
          <Database className="w-4 h-4" />
          Load Demo Data
        </button>
      </div>
    </div>
  )
}
