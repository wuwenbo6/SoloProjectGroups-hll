import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload as UploadIcon, Database, FileText, CheckCircle } from 'lucide-react'
import { uploadDatabase } from '@/lib/api'
import { useDatabaseStore } from '@/store/useDatabaseStore'

export default function Upload() {
  const navigate = useNavigate()
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { setDatabases, setCurrentDatabase, setTables } = useDatabaseStore()

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)
      setSuccess(null)

      const validExts = ['.db', '.sqlite', '.sqlite3']
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
      if (!validExts.includes(ext)) {
        setError('仅支持 .db, .sqlite, .sqlite3 格式的文件')
        return
      }

      if (file.size > 50 * 1024 * 1024) {
        setError('文件大小不能超过 50MB')
        return
      }

      setUploading(true)
      try {
        const result = await uploadDatabase(file)
        setSuccess(`上传成功！发现 ${result.tableCount} 个表`)
        setCurrentDatabase(result.databaseId, result.fileName)
        setTables(result.tables)

        setTimeout(() => {
          navigate('/browse')
        }, 800)
      } catch (err) {
        setError(err instanceof Error ? err.message : '上传失败')
      } finally {
        setUploading(false)
      }
    },
    [navigate, setCurrentDatabase, setTables],
  )

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-4">
            <Database size={40} className="text-[#58a6ff]" />
            <h1 className="text-3xl font-bold text-[#c9d1d9]">SQLite 浏览器</h1>
          </div>
          <p className="text-[#8b949e]">上传 SQLite 数据库文件，在线浏览数据、执行 SQL 查询、导出 CSV</p>
        </div>

        <div
          className={`relative border-2 border-dashed rounded-xl p-16 text-center transition-all duration-200 cursor-pointer ${
            isDragging
              ? 'border-[#58a6ff] bg-[#58a6ff10] scale-[1.02]'
              : 'border-[#30363d] hover:border-[#58a6ff] hover:bg-[#161b22]'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClick}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".db,.sqlite,.sqlite3"
            className="hidden"
            onChange={handleInputChange}
          />

          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 border-3 border-[#58a6ff] border-t-transparent rounded-full animate-spin" />
              <p className="text-[#c9d1d9] font-medium">上传中...</p>
              <p className="text-sm text-[#8b949e]">正在解析数据库文件</p>
            </div>
          ) : success ? (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle size={48} className="text-[#3fb950]" />
              <p className="text-[#3fb950] font-medium">{success}</p>
              <p className="text-sm text-[#8b949e]">正在跳转...</p>
            </div>
          ) : (
            <>
              <UploadIcon size={48} className="text-[#8b949e] mx-auto mb-4" />
              <p className="text-[#c9d1d9] font-medium mb-2">
                拖拽文件到此处，或点击选择文件
              </p>
              <p className="text-sm text-[#8b949e]">
                支持 .db, .sqlite, .sqlite3 格式，最大 50MB
              </p>
            </>
          )}
        </div>

        {error && (
          <div className="mt-4 p-4 bg-[#f8514920] border border-[#f8514940] rounded-lg text-[#f85149] text-sm">
            {error}
          </div>
        )}

        <div className="mt-10 grid grid-cols-3 gap-6">
          <FeatureCard
            icon={<Database size={24} />}
            title="浏览数据"
            desc="查看表结构和数据内容"
          />
          <FeatureCard
            icon={<FileText size={24} />}
            title="SQL 查询"
            desc="执行自定义 SQL 语句"
          />
          <FeatureCard
            icon={<CheckCircle size={24} />}
            title="导出 CSV"
            desc="将结果导出为 CSV 文件"
          />
        </div>
      </div>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode
  title: string
  desc: string
}) {
  return (
    <div className="p-4 bg-[#161b22] rounded-lg border border-[#30363d] text-center">
      <div className="text-[#58a6ff] flex justify-center mb-2">{icon}</div>
      <h3 className="text-sm font-medium text-[#c9d1d9] mb-1">{title}</h3>
      <p className="text-xs text-[#8b949e]">{desc}</p>
    </div>
  )
}
