import { useState, useEffect } from 'react'
import { Activity, Database, Server, CheckCircle, XCircle, HardDrive, Users, FileText, ClipboardList } from 'lucide-react'
import { api, type SystemStatus } from '@/api/client'

export default function Status() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStatus()
    const interval = setInterval(loadStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  const loadStatus = async () => {
    try {
      const res = await api.getStatus()
      setStatus(res)
    } catch (err) {
      console.error('Failed to load status:', err)
    } finally {
      setLoading(false)
    }
  }

  const StatusIndicator = ({ running }: { running: boolean }) => (
    <div className="flex items-center gap-2">
      <div
        className={`w-3 h-3 rounded-full ${running ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}
      />
      <span className={running ? 'text-emerald-700' : 'text-red-700'}>
        {running ? '运行中' : '已停止'}
      </span>
    </div>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">加载中...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-primary-700 to-primary-800">
            <div className="flex items-center gap-3 text-white">
              <Server className="w-6 h-6" />
              <h3 className="font-display font-semibold text-lg">HL7 TCP 服务器</h3>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-slate-100">
              <span className="text-slate-600">服务状态</span>
              <StatusIndicator running={status?.tcpServer.running || false} />
            </div>
            <div className="flex items-center justify-between py-3 border-b border-slate-100">
              <span className="text-slate-600">监听端口</span>
              <span className="font-mono text-slate-800 font-medium">{status?.tcpServer.port || '-'}</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-slate-600">当前连接数</span>
              <span className="font-medium text-slate-800">{status?.tcpServer.connections || 0}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-medical-cyan to-cyan-600">
            <div className="flex items-center gap-3 text-white">
              <Database className="w-6 h-6" />
              <h3 className="font-display font-semibold text-lg">数据库状态</h3>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-slate-100">
              <span className="text-slate-600">连接状态</span>
              <StatusIndicator running={status?.database.connected || false} />
            </div>
            <div className="flex items-center justify-between py-3 border-b border-slate-100">
              <span className="text-slate-600 flex items-center gap-2">
                <FileText className="w-4 h-4" /> 消息数
              </span>
              <span className="font-medium text-slate-800">{status?.database.messageCount || 0}</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-slate-100">
              <span className="text-slate-600 flex items-center gap-2">
                <Users className="w-4 h-4" /> 患者数
              </span>
              <span className="font-medium text-slate-800">{status?.database.patientCount || 0}</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-slate-600 flex items-center gap-2">
                <ClipboardList className="w-4 h-4" /> 检验订单
              </span>
              <span className="font-medium text-slate-800">{status?.database.orderCount || 0}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="font-display font-semibold text-lg text-slate-800 flex items-center gap-2">
            <Activity className="w-5 h-5 text-medical-cyan" />
            快速操作指南
          </h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 bg-slate-50 rounded-lg">
              <h4 className="font-medium text-slate-800 mb-2">通过 TCP 发送 HL7 消息</h4>
              <p className="text-sm text-slate-600 mb-3">使用 MLLP 协议发送 HL7 v2.x 消息到端口 2575</p>
              <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs font-mono overflow-x-auto">
                {`# 使用 netcat 发送测试
cat sample.hl7 | nc localhost 2575`}
              </pre>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg">
              <h4 className="font-medium text-slate-800 mb-2">通过文件上传 HL7 消息</h4>
              <p className="text-sm text-slate-600 mb-3">支持 .hl7、.txt、.dat 格式的文件上传</p>
              <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs font-mono overflow-x-auto">
                {`# 或通过 API 上传
curl -F "file=@test.hl7" http://localhost:3001/api/messages/upload`}
              </pre>
            </div>
          </div>

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-medium text-blue-800 mb-2">示例 HL7 消息格式</h4>
            <pre className="bg-blue-900 text-blue-100 p-3 rounded text-xs font-mono overflow-x-auto leading-relaxed">
              {`MSH|^~\\&|HIS|HOSPITAL|LIS|HOSPITAL|20240101120000||ORU^R01|MSG001|P|2.5
PID|1||P001||张三^小明||19850115|M|||北京市朝阳区
OBR|1||ORD001|001^血常规|||20240101080000
OBX|1|NM|WBC^白细胞计数||6.5|10^9/L|4.0-10.0||N|F
OBX|2|NM|RBC^红细胞计数||4.8|10^12/L|4.0-5.5||N|F
OBX|3|NM|HGB^血红蛋白||145|g/L|120-160||N|F`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}
