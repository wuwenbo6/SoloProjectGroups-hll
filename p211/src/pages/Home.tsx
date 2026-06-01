import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFileStore } from '@/store/useFileStore'
import { Upload, Satellite, FileUp, AlertCircle, Loader2 } from 'lucide-react'

export default function Home() {
  const navigate = useNavigate()
  const { uploading, uploadProgress, error, setFile, setUploading, setUploadProgress, setError } = useFileStore()
  const [dragActive, setDragActive] = useState(false)

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith('.ubx')) {
        setError('仅支持 .ubx 格式文件')
        return
      }

      setUploading(true)
      setUploadProgress(0)
      setError(null)

      const formData = new FormData()
      formData.append('file', file)

      try {
        const xhr = new XMLHttpRequest()
        const result = await new Promise<any>((resolve, reject) => {
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              setUploadProgress(Math.round((e.loaded / e.total) * 100))
            }
          })
          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(JSON.parse(xhr.responseText))
            } else {
              const errData = JSON.parse(xhr.responseText)
              reject(new Error(errData.error || '上传失败'))
            }
          })
          xhr.addEventListener('error', () => reject(new Error('网络错误')))
          xhr.open('POST', '/api/upload')
          xhr.send(formData)
        })

        setFile({
          fileId: result.fileId,
          fileName: result.fileName,
          fileSize: result.fileSize,
          stats: result.stats,
          snrData: result.snrData,
          mwData: result.mwData || [],
          position: result.position || null,
        })

        navigate(`/overview/${result.fileId}`)
      } catch (err: any) {
        setError(err.message || '解析失败')
      }
    },
    [navigate, setFile, setUploading, setUploadProgress, setError]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragActive(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragActive(false)
  }, [])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-[#00D4FF] to-[#2DD4BF] mb-6 shadow-lg shadow-[#00D4FF]/20">
            <Satellite className="w-10 h-10 text-[#0A1628]" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">
            UBX 数据处理工具
          </h1>
          <p className="text-[#7BA3C4] text-lg">
            上传 u-blox .ubx 文件，提取伪距、载波相位、多普勒，生成 RINEX 观测文件
          </p>
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 cursor-pointer ${
            dragActive
              ? 'border-[#00D4FF] bg-[#00D4FF]/5 scale-[1.02]'
              : 'border-[#1E3A5F] bg-[#0D1B2E]/50 hover:border-[#00D4FF]/50 hover:bg-[#0D1B2E]'
          } ${uploading ? 'pointer-events-none' : ''}`}
        >
          <input
            type="file"
            accept=".ubx"
            onChange={handleInputChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={uploading}
          />

          {uploading ? (
            <div className="space-y-6">
              <Loader2 className="w-12 h-12 text-[#00D4FF] mx-auto animate-spin" />
              <div>
                <p className="text-white text-lg font-medium mb-3">正在解析 UBX 文件...</p>
                <div className="w-full bg-[#1E3A5F] rounded-full h-3 overflow-hidden max-w-sm mx-auto">
                  <div
                    className="h-full bg-gradient-to-r from-[#00D4FF] to-[#2DD4BF] rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-[#5B8DB8] text-sm mt-2">{uploadProgress}%</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <FileUp className="w-12 h-12 text-[#00D4FF] mx-auto" />
              <div>
                <p className="text-white text-lg font-medium">
                  拖拽 .ubx 文件到此处
                </p>
                <p className="text-[#5B8DB8] text-sm mt-1">
                  或点击选择文件上传
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 text-xs text-[#3A5A7A]">
                <Upload className="w-3 h-3" />
                <span>支持 RAWX 消息的 .ubx 文件，最大 500MB</span>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        <div className="mt-12 grid grid-cols-3 gap-4">
          {[
            { label: 'RAWX 解析', desc: '提取伪距、载波相位、多普勒' },
            { label: 'RINEX 3.04', desc: '生成标准观测文件格式' },
            { label: 'SNR 可视化', desc: '各卫星信噪比质量分析' },
          ].map((item) => (
            <div
              key={item.label}
              className="p-4 rounded-xl bg-[#0D1B2E] border border-[#1E3A5F] text-center"
            >
              <p className="text-white text-sm font-medium mb-1">{item.label}</p>
              <p className="text-[#5B8DB8] text-xs">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
