import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, FileText, AlertTriangle, Clock, ChevronRight } from 'lucide-react'
import { api, type Patient, type DashboardStats } from '@/api/client'
import StatCard from '@/components/StatCard'
import SearchBar from '@/components/SearchBar'

export default function Dashboard() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [patients, setPatients] = useState<Patient[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [search])

  const loadData = async () => {
    try {
      const [patientsRes, statsRes] = await Promise.all([
        api.getPatients(search),
        api.getStats(),
      ])
      setPatients(patientsRes.data || [])
      setStats(statsRes.data || null)
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="今日消息"
          value={stats?.todayMessageCount || 0}
          icon={<FileText className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          title="患者总数"
          value={stats?.patientCount || 0}
          icon={<Users className="w-6 h-6" />}
          color="cyan"
        />
        <StatCard
          title="异常结果"
          value={stats?.abnormalResultCount || 0}
          icon={<AlertTriangle className="w-6 h-6" />}
          color="red"
        />
        <StatCard
          title="待审核"
          value={stats?.pendingReviewCount || 0}
          icon={<Clock className="w-6 h-6" />}
          color="green"
        />
      </div>

      <SearchBar
        value={search}
        onChange={setSearch}
        onFileUpload={() => loadData()}
      />

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="font-display font-semibold text-lg text-slate-800">患者列表</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  患者ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  姓名
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  性别
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  出生日期
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  检验次数
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  最近检验
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    加载中...
                  </td>
                </tr>
              ) : patients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    暂无患者数据，请上传HL7文件或通过TCP端口发送消息
                  </td>
                </tr>
              ) : (
                patients.map((patient) => (
                  <tr
                    key={patient.id}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/patient/${patient.id}`)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-mono text-sm text-slate-600">{patient.patientId}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-medium text-slate-800">
                        {patient.lastName}
                        {patient.firstName}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-slate-600">
                        {patient.sex === 'M' ? '男' : patient.sex === 'F' ? '女' : '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-600">
                      {formatDate(patient.birthDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {patient.orderCount || 0} 次
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-600">
                      {formatDate(patient.lastTestDate || '')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button className="text-medical-cyan hover:text-cyan-700 inline-flex items-center gap-1 font-medium">
                        查看详情
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
