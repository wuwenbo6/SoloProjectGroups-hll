import { Search, Upload } from 'lucide-react'
import { useState } from 'react'
import { api } from '@/api/client'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  onFileUpload?: (result: any) => void
}

export default function SearchBar({ value, onChange, onFileUpload }: SearchBarProps) {
  const [uploading, setUploading] = useState(false)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const result = await api.uploadHL7File(file)
      if (onFileUpload) {
        onFileUpload(result)
      }
    } catch (err) {
      console.error('Upload error:', err)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="flex gap-4 mb-6">
      <div className="flex-1 relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="搜索患者姓名、ID..."
          className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-medical-cyan/50 focus:border-medical-cyan transition-all"
        />
      </div>
      <label className="flex items-center gap-2 px-6 py-3 bg-primary-700 text-white rounded-xl cursor-pointer hover:bg-primary-800 transition-colors shadow-md hover:shadow-lg">
        <Upload className="w-5 h-5" />
        <span className="font-medium">{uploading ? '上传中...' : '上传HL7文件'}</span>
        <input
          type="file"
          accept=".hl7,.txt,.dat"
          className="hidden"
          onChange={handleFileUpload}
          disabled={uploading}
        />
      </label>
    </div>
  )
}
