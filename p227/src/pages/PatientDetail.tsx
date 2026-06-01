import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  User,
  Calendar,
  FileText,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
} from 'lucide-react'
import { api, type Order, type Observation, type Patient } from '@/api/client'

interface OrderWithObservations extends Order {
  observations?: Observation[]
  expanded?: boolean
}

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [orders, setOrders] = useState<OrderWithObservations[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id) {
      loadPatientData(parseInt(id))
    }
  }, [id])

  const loadPatientData = async (patientId: number) => {
    try {
      const [patientRes, ordersRes] = await Promise.all([
        api.getPatient(patientId),
        api.getPatientOrders(patientId),
      ])
      setPatient(patientRes.data || null)
      setOrders((ordersRes.data || []).map((o) => ({ ...o, expanded: false })))
    } catch (err) {
      console.error('Failed to load patient data:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleOrder = async (orderId: number) => {
    setOrders((prev) =>
      prev.map(async (order) => {
        if (order.id === orderId) {
          if (!order.observations) {
            const obsRes = await api.getOrderObservations(orderId)
            return { ...order, observations: obsRes.data, expanded: !order.expanded }
          }
          return { ...order, expanded: !order.expanded }
        }
        return order
      })
    )

    const order = orders.find((o) => o.id === orderId)
    if (order && !order.observations) {
      const obsRes = await api.getOrderObservations(orderId)
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, observations: obsRes.data, expanded: true } : o
        )
      )
    } else {
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, expanded: !o.expanded } : o))
      )
    }
  }

  const isAbnormal = (flag: string) => {
    return flag && flag !== '' && flag !== 'N'
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    const clean = dateStr.replace(/[^0-9]/g, '')
    if (clean.length < 8) return dateStr
    const year = clean.substring(0, 4)
    const month = clean.substring(4, 6)
    const day = clean.substring(6, 8)
    const hour = clean.length >= 10 ? clean.substring(8, 10) : ''
    const minute = clean.length >= 12 ? clean.substring(10, 12) : ''
    let result = `${year}-${month}-${day}`
    if (hour && minute) result += ` ${hour}:${minute}`
    return result
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">加载中...</div>
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">未找到患者信息</p>
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-800 mb-6 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        <span>返回患者列表</span>
      </button>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-start gap-6">
          <div className="w-20 h-20 bg-gradient-to-br from-primary-700 to-medical-cyan rounded-full flex items-center justify-center shadow-lg">
            <User className="w-10 h-10 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-2xl font-bold text-slate-800 mb-2">
              {patient.lastName}
              {patient.firstName}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-slate-500">患者ID</p>
                <p className="font-mono text-slate-800">{patient.patientId}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">性别</p>
                <p className="text-slate-800">
                  {patient.sex === 'M' ? '男' : patient.sex === 'F' ? '女' : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-500">出生日期</p>
                <p className="text-slate-800 flex items-center gap-1">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  {formatDate(patient.birthDate)}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-500">检验次数</p>
                <p className="text-slate-800 flex items-center gap-1">
                  <FileText className="w-4 h-4 text-slate-400" />
                  {orders.length} 次
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-display font-semibold text-lg text-slate-800">检验记录</h3>
        {orders.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
            <p className="text-slate-500">暂无检验记录</p>
          </div>
        ) : (
          orders.map((order) => (
            <div
              key={order.id}
              className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
            >
              <div
                className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => toggleOrder(order.id)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary-700" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">
                      {order.procedureName || order.procedureCode || '检验项目'}
                    </p>
                    <p className="text-sm text-slate-500">
                      申请时间: {formatDate(order.observationDateTime)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {order.observations?.some((o) => isAbnormal(o.abnormalFlag)) && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                      <AlertCircle className="w-4 h-4" />
                      含异常结果
                    </span>
                  )}
                  {order.expanded ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  )}
                </div>
              </div>

              {order.expanded && order.observations && (
                <div className="border-t border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                            项目名称
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">
                            结果
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                            单位
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                            参考范围
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
                            状态
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {order.observations.map((obs) => {
                          const abnormal = isAbnormal(obs.abnormalFlag)
                          return (
                            <tr key={obs.id} className={abnormal ? 'bg-red-50/50' : ''}>
                              <td className="px-6 py-4">
                                <span className="text-slate-800">
                                  {obs.observationName || obs.observationIdentifier}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <span
                                  className={`font-semibold ${abnormal ? 'text-red-600' : 'text-slate-800'}`}
                                >
                                  {obs.observationValue}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-slate-600">{obs.units || '-'}</td>
                              <td className="px-6 py-4 text-slate-500 text-sm">
                                {obs.referenceRange || '-'}
                              </td>
                              <td className="px-6 py-4">
                                {abnormal ? (
                                  <span className="inline-flex items-center gap-1 text-red-600">
                                    <AlertCircle className="w-4 h-4" />
                                    <span className="text-sm font-medium">
                                      {obs.abnormalFlag === 'H' ? '偏高' : obs.abnormalFlag === 'L' ? '偏低' : '异常'}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-emerald-600">
                                    <CheckCircle className="w-4 h-4" />
                                    <span className="text-sm font-medium">正常</span>
                                  </span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
