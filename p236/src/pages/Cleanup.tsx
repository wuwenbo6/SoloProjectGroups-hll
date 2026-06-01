import { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/store/useAppStore'
import {
  Trash2,
  Search,
  ArrowUpDown,
  ChevronDown,
  FileWarning,
  Loader2,
  CheckSquare,
  Square,
  X,
  FlaskConical,
  Archive,
  Download,
} from 'lucide-react'
import ConfirmModal from '@/components/ConfirmModal'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatDate(isoStr: string): string {
  if (!isoStr) return '-'
  try {
    return new Date(isoStr).toLocaleString('zh-CN')
  } catch {
    return isoStr
  }
}

type SortField = 'days_inactive' | 'bytes' | 'last_modified' | 'name' | 'container'
type SortOrder = 'asc' | 'desc'

export default function Cleanup() {
  const {
    coldObjects,
    coldObjectsTotal,
    coldObjectsPage,
    coldObjectsPageSize,
    selectedObjects,
    deleting,
    archiving,
    scanStatus,
    fetchColdObjects,
    deleteObjects,
    cleanupAll,
    archiveObjects,
    archiveAll,
    exportCsv,
    toggleSelectObject,
    selectAll,
    clearSelection,
    setConfirmModal,
  } = useAppStore()

  const [containerFilter, setContainerFilter] = useState('')
  const [sortBy, setSortBy] = useState<SortField>('days_inactive')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const loadData = useCallback(
    (page = coldObjectsPage) => {
      fetchColdObjects({
        container: containerFilter || undefined,
        sort_by: sortBy,
        order: sortOrder,
        page,
        page_size: coldObjectsPageSize,
        search: search || undefined,
      })
    },
    [containerFilter, sortBy, sortOrder, coldObjectsPage, coldObjectsPageSize, search, fetchColdObjects]
  )

  useEffect(() => {
    loadData(1)
  }, [containerFilter, sortBy, sortOrder, search])

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
  }

  const handleSearch = () => {
    setSearch(searchInput)
  }

  const handleSelectAll = () => {
    if (selectedObjects.size === coldObjects.length) {
      clearSelection()
    } else {
      selectAll(coldObjects.map((o) => `${o.container}/${o.name}`))
    }
  }

  const handleDeleteSelected = () => {
    const objects = Array.from(selectedObjects).map((key) => {
      const [container, ...rest] = key.split('/')
      return { container, name: rest.join('/') }
    })
    setConfirmModal(
      '删除选中对象',
      `确认删除 ${objects.length} 个对象？此操作不可撤销。`,
      () => {
        deleteObjects(objects).then(() => clearSelection())
      }
    )
  }

  const handleArchiveSelected = () => {
    const objects = Array.from(selectedObjects).map((key) => {
      const [container, ...rest] = key.split('/')
      return { container, name: rest.join('/') }
    })
    setConfirmModal(
      '归档选中对象',
      `确认将 ${objects.length} 个对象归档到冷存储容器 _cold_archive？原容器中的对象将被移除。`,
      () => {
        archiveObjects(objects).then(() => clearSelection())
      }
    )
  }

  const handleCleanupAll = () => {
    setConfirmModal(
      '清理全部冷数据',
      `确认删除全部 ${coldObjectsTotal} 个冷数据对象？此操作不可撤销。`,
      () => {
        cleanupAll()
      }
    )
  }

  const handleArchiveAll = () => {
    setConfirmModal(
      '归档全部冷数据',
      `确认将全部 ${coldObjectsTotal} 个冷数据对象归档到冷存储容器 _cold_archive？原容器中的对象将被移除。`,
      () => {
        archiveAll()
      }
    )
  }

  const handleDeleteSingle = (container: string, name: string) => {
    setConfirmModal(
      '删除对象',
      `确认删除 ${container}/${name}？此操作不可撤销。`,
      () => {
        deleteObjects([{ container, name }])
      }
    )
  }

  const handleArchiveSingle = (container: string, name: string) => {
    setConfirmModal(
      '归档对象',
      `确认将 ${container}/${name} 归档到冷存储容器 _cold_archive？`,
      () => {
        archiveObjects([{ container, name }])
      }
    )
  }

  const handleExportCsv = () => {
    exportCsv({
      container: containerFilter || undefined,
      search: search || undefined,
    })
  }

  const totalPages = Math.ceil(coldObjectsTotal / coldObjectsPageSize)

  const containerSet = new Set(coldObjects.map((o) => o.container))

  const isOperating = deleting || archiving

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <ConfirmModal />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">清理列表</h2>
          <p className="text-sm text-zinc-500 mt-1">
            共 {coldObjectsTotal} 个超过 90 天未访问的冷数据对象
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCsv}
            disabled={coldObjectsTotal === 0}
            className="btn-outline flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            导出 CSV
          </button>
          <button
            onClick={handleArchiveAll}
            disabled={isOperating || coldObjectsTotal === 0}
            className="btn-primary flex items-center gap-2"
          >
            {archiving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                归档中...
              </>
            ) : (
              <>
                <Archive className="w-4 h-4" />
                一键归档全部
              </>
            )}
          </button>
          <button
            onClick={handleCleanupAll}
            disabled={isOperating || coldObjectsTotal === 0}
            className="btn-danger flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            一键清理全部
          </button>
        </div>
      </div>

      <div className="card">
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-3 flex-wrap">
          <div className="relative">
            <select
              value={containerFilter}
              onChange={(e) => setContainerFilter(e.target.value)}
              className="appearance-none input-field pr-8 min-w-[180px]"
            >
              <option value="">全部容器</option>
              {Array.from(containerSet).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
          </div>

          <div className="relative flex-1 max-w-sm">
            <input
              type="text"
              className="input-field pl-9"
              placeholder="搜索对象名称..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            {searchInput && (
              <button
                onClick={() => {
                  setSearchInput('')
                  setSearch('')
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button onClick={handleSearch} className="btn-secondary text-sm">
            搜索
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-xs font-medium text-zinc-500 border-b border-zinc-100">
                <th className="px-5 py-3 text-left w-10">
                  <button onClick={handleSelectAll} className="text-zinc-400 hover:text-brand-600 transition-colors">
                    {selectedObjects.size === coldObjects.length && coldObjects.length > 0 ? (
                      <CheckSquare className="w-4.5 h-4.5" />
                    ) : (
                      <Square className="w-4.5 h-4.5" />
                    )}
                  </button>
                </th>
                <th className="px-3 py-3 text-left">
                  <button onClick={() => handleSort('container')} className="flex items-center gap-1 hover:text-zinc-700 transition-colors">
                    容器
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-3 py-3 text-left">
                  <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-zinc-700 transition-colors">
                    对象名称
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-3 py-3 text-right">
                  <button onClick={() => handleSort('bytes')} className="flex items-center gap-1 ml-auto hover:text-zinc-700 transition-colors">
                    大小
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-3 py-3 text-right">
                  <button onClick={() => handleSort('last_modified')} className="flex items-center gap-1 ml-auto hover:text-zinc-700 transition-colors">
                    最后修改
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-3 py-3 text-right">时间来源</th>
                <th className="px-3 py-3 text-right">
                  <button onClick={() => handleSort('days_inactive')} className="flex items-center gap-1 ml-auto hover:text-zinc-700 transition-colors">
                    未访问天数
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="px-3 py-3 text-center w-24">操作</th>
              </tr>
            </thead>
            <tbody>
              {coldObjects.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-zinc-400">
                      <FileWarning className="w-10 h-10" />
                      <p className="text-sm">暂无冷数据对象</p>
                      <p className="text-xs">请先在概览页执行扫描</p>
                    </div>
                  </td>
                </tr>
              ) : (
                coldObjects.map((obj) => {
                  const key = `${obj.container}/${obj.name}`
                  const isSelected = selectedObjects.has(key)
                  return (
                    <tr
                      key={key}
                      className={`border-b border-zinc-50 transition-colors ${
                        isSelected ? 'bg-brand-50/50' : 'hover:bg-zinc-50/80'
                      }`}
                    >
                      <td className="px-5 py-3">
                        <button
                          onClick={() => toggleSelectObject(key)}
                          className="text-zinc-400 hover:text-brand-600 transition-colors"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4.5 h-4.5 text-brand-600" />
                          ) : (
                            <Square className="w-4.5 h-4.5" />
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded">
                          <FlaskConical className="w-3 h-3" />
                          {obj.container}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-sm text-zinc-800 font-mono break-all">
                          {obj.name}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className="text-sm font-mono text-zinc-600">
                          {formatBytes(obj.bytes)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className="text-xs text-zinc-500">
                          {formatDate(obj.last_modified)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded ${
                          obj.time_source === 'meta'
                            ? 'bg-brand-50 text-brand-700'
                            : obj.time_source === 'timestamp'
                            ? 'bg-zinc-100 text-zinc-600'
                            : 'bg-danger-50 text-danger-600'
                        }`}>
                          {obj.time_source === 'meta'
                            ? 'Access-Time'
                            : obj.time_source === 'timestamp'
                            ? 'X-Timestamp'
                            : '未知'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span
                          className={`text-sm font-mono font-semibold ${
                            obj.days_inactive >= 180
                              ? 'text-danger-600'
                              : obj.days_inactive >= 90
                              ? 'text-warn-500'
                              : 'text-zinc-600'
                          }`}
                        >
                          {obj.days_inactive} 天
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleArchiveSingle(obj.container, obj.name)}
                            disabled={isOperating}
                            className="p-1.5 text-zinc-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all duration-200"
                            title="归档到冷存储"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteSingle(obj.container, obj.name)}
                            disabled={isOperating}
                            className="p-1.5 text-zinc-400 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-all duration-200"
                            title="删除此对象"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {coldObjectsTotal > 0 && (
          <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-between">
            <div className="text-xs text-zinc-500">
              第 {coldObjectsPage}/{totalPages} 页，共 {coldObjectsTotal} 条
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => loadData(coldObjectsPage - 1)}
                disabled={coldObjectsPage <= 1}
                className="btn-outline text-xs px-3 py-1.5 disabled:opacity-40"
              >
                上一页
              </button>
              <button
                onClick={() => loadData(coldObjectsPage + 1)}
                disabled={coldObjectsPage >= totalPages}
                className="btn-outline text-xs px-3 py-1.5 disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedObjects.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white px-6 py-3.5 rounded-2xl shadow-2xl flex items-center gap-4 animate-fade-in z-40">
          <span className="text-sm">
            已选择 <span className="font-mono font-bold text-brand-400">{selectedObjects.size}</span> 个对象
          </span>
          <div className="w-px h-5 bg-zinc-700" />
          <button onClick={clearSelection} className="text-xs text-zinc-400 hover:text-white transition-colors">
            取消选择
          </button>
          <button
            onClick={handleArchiveSelected}
            disabled={isOperating}
            className="btn-primary text-sm flex items-center gap-2 px-4 py-2"
          >
            {archiving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                归档中...
              </>
            ) : (
              <>
                <Archive className="w-3.5 h-3.5" />
                归档选中
              </>
            )}
          </button>
          <button
            onClick={handleDeleteSelected}
            disabled={isOperating}
            className="btn-danger text-sm flex items-center gap-2 px-4 py-2"
          >
            {deleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                删除中...
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                删除选中
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
