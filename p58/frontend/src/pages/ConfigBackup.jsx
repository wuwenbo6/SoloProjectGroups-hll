import { useState, useEffect, useRef } from 'react'
import { DatabaseBackup, Download, Upload, Trash2, FileJson, Clock } from 'lucide-react'
import axios from 'axios'

export default function ConfigBackup() {
  const [backups, setBackups] = useState([])
  const [includePasswords, setIncludePasswords] = useState(false)
  const [overwriteOnImport, setOverwriteOnImport] = useState(false)
  const [importResults, setImportResults] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    loadBackups()
  }, [])

  const loadBackups = async () => {
    try {
      const res = await axios.get('/api/config/backups')
      setBackups(res.data.backups)
    } catch (err) {
      console.error('Failed to load backups:', err)
    }
  }

  const exportConfig = async () => {
    try {
      const res = await axios.get('/api/config/export', {
        params: { include_passwords: includePasswords },
        responseType: 'blob'
      })
      
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `config_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  const createBackup = async () => {
    try {
      await axios.post('/api/config/backup')
      loadBackups()
    } catch (err) {
      console.error('Backup failed:', err)
    }
  }

  const deleteBackup = async (fileName) => {
    if (confirm('确定要删除这个备份吗？')) {
      try {
        await axios.delete(`/api/config/backups/${fileName}`)
        loadBackups()
      } catch (err) {
        console.error('Delete failed:', err)
      }
    }
  }

  const handleFileSelect = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)
    formData.append('overwrite', overwriteOnImport ? 'true' : 'false')

    try {
      const res = await axios.post('/api/config/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setImportResults(res.data.result)
      loadBackups()
    } catch (err) {
      console.error('Import failed:', err)
      alert('导入失败: ' + err.response?.data?.error)
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleString('zh-CN')
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold flex items-center gap-2 mb-6">
        <DatabaseBackup size={28} />
        配置备份
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold mb-4">导出配置</h3>
            
            <div className="space-y-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includePasswords}
                  onChange={(e) => setIncludePasswords(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm">包含密码（不安全）</span>
              </label>

              <button
                onClick={exportConfig}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                <Download size={18} />
                下载配置文件
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold mb-4">导入配置</h3>
            
            <div className="space-y-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={overwriteOnImport}
                  onChange={(e) => setOverwriteOnImport(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm">覆盖已存在的设备</span>
              </label>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
              >
                <Upload size={18} />
                选择文件导入
              </button>
            </div>

            {importResults && (
              <div className="mt-4 p-3 bg-gray-50 rounded text-sm">
                <div className="font-medium mb-2">导入结果:</div>
                <div>摄像头: 导入 {importResults.cameras.imported}, 跳过 {importResults.cameras.skipped}</div>
                <div>录像计划: 导入 {importResults.schedules.imported}, 跳过 {importResults.schedules.skipped}</div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-4 py-3 border-b flex justify-between items-center">
            <h3 className="font-semibold">备份列表</h3>
            <button
              onClick={createBackup}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              创建备份
            </button>
          </div>
          
          <div className="divide-y">
            {backups.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <FileJson size={48} className="mx-auto mb-2 opacity-50" />
                暂无备份
              </div>
            ) : (
              backups.map((backup) => (
                <div key={backup.fileName} className="p-4 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <FileJson size={32} className="text-blue-500" />
                    <div>
                      <div className="font-medium text-sm">{backup.fileName}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-2">
                        <Clock size={12} />
                        {formatDate(backup.createdAt)}
                        <span>•</span>
                        {formatSize(backup.size)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => deleteBackup(backup.fileName)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
