import { useState, useEffect } from 'react'
import { FileText, CheckCircle, AlertCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { api, type Message } from '@/api/client'

export default function Messages() {
  const [messages, setMessages] = useState<Message[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const limit = 20

  useEffect(() => {
    loadMessages()
  }, [page])

  const loadMessages = async () => {
    try {
      const res = await api.getMessages(page, limit)
      setMessages(res.data || [])
      setTotal(res.total || 0)
    } catch (err) {
      console.error('Failed to load messages:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleMessage = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
            <CheckCircle className="w-3 h-3" />
            成功
          </span>
        )
      case 'partial':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
            <AlertCircle className="w-3 h-3" />
            部分成功
          </span>
        )
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
            <AlertCircle className="w-3 h-3" />
            失败
          </span>
        )
      default:
        return null
    }
  }

  const getReceivedViaBadge = (via: string) => {
    return via === 'tcp' ? (
      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">TCP</span>
    ) : (
      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">文件</span>
    )
  }

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('zh-CN')
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg text-slate-800">消息日志</h3>
          <span className="text-sm text-slate-500">共 {total} 条记录</span>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-slate-500">加载中...</div>
        ) : messages.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-500">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p>暂无消息记录</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {messages.map((msg) => (
                <div key={msg.id} className="border-b border-slate-100 last:border-b-0">
                  <div
                    className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => toggleMessage(msg.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                        <FileText className="w-5 h-5 text-slate-500" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-800">#{msg.id}</span>
                          <span className="text-slate-500">{msg.messageType}</span>
                          {getStatusBadge(msg.parseStatus)}
                          {getReceivedViaBadge(msg.receivedVia)}
                        </div>
                        <p className="text-sm text-slate-500 mt-1">
                          {msg.sendingApp} @ {msg.sendingFacility}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-slate-500">{formatDateTime(msg.receivedAt)}</span>
                      {expandedId === msg.id ? (
                        <ChevronUp className="w-5 h-5 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {expandedId === msg.id && (
                    <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
                      {msg.parseError && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-red-700 text-sm">
                            <AlertCircle className="w-4 h-4 inline mr-2" />
                            解析错误: {msg.parseError}
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-slate-700 mb-2">原始消息</p>
                        <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto font-mono leading-relaxed max-h-80 overflow-y-auto">
                          {msg.rawMessage || '暂无详细内容'}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  上一页
                </button>
                <span className="text-sm text-slate-600">
                  第 {page} / {totalPages} 页
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
