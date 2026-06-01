export interface Patient {
  id: number
  patientId: string
  lastName: string
  firstName: string
  birthDate: string
  sex: string
  createdAt: string
  orderCount?: number
  lastTestDate?: string
}

export interface Order {
  id: number
  patientId: number
  messageId: number
  orderNumber: string
  procedureCode: string
  procedureName: string
  orderingProvider: string
  observationDateTime: string
  createdAt: string
  messageReceivedAt?: string
}

export interface Observation {
  id: number
  orderId: number
  setValueType: string
  observationIdentifier: string
  observationName: string
  observationValue: string
  units: string
  referenceRange: string
  abnormalFlag: string
  resultStatus: string
  createdAt: string
}

export interface Message {
  id: number
  rawMessage?: string
  messageType: string
  sendingApp: string
  sendingFacility: string
  parseStatus: 'success' | 'partial' | 'failed'
  parseError: string | null
  receivedAt: string
  receivedVia: 'tcp' | 'file'
}

export interface DashboardStats {
  todayMessageCount: number
  patientCount: number
  abnormalResultCount: number
  pendingReviewCount: number
}

export interface SystemStatus {
  tcpServer: {
    running: boolean
    port: number
    connections: number
  }
  database: {
    connected: boolean
    messageCount: number
    patientCount: number
    orderCount: number
    observationCount: number
  }
  dashboard: DashboardStats
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  total?: number
  page?: number
  limit?: number
}

const API_BASE = '/api'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  })
  const data = await response.json()
  if (!data.success) {
    throw new Error(data.error || 'API request failed')
  }
  return data
}

export const api = {
  getPatients: (search?: string) =>
    request<ApiResponse<Patient[]>>(`/patients${search ? `?search=${encodeURIComponent(search)}` : ''}`),

  getPatient: (id: number) =>
    request<ApiResponse<Patient>>(`/patients/${id}`),

  getPatientOrders: (patientId: number) =>
    request<ApiResponse<Order[]>>(`/patients/${patientId}/orders`),

  getOrderObservations: (orderId: number) =>
    request<ApiResponse<Observation[]>>(`/orders/${orderId}/observations`),

  getMessages: (page = 1, limit = 20) =>
    request<ApiResponse<Message[]>>(`/messages?page=${page}&limit=${limit}`),

  getMessage: (id: number) =>
    request<ApiResponse<Message>>(`/messages/${id}`),

  uploadHL7File: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return fetch(`${API_BASE}/messages/upload`, {
      method: 'POST',
      body: formData,
    }).then(res => res.json())
  },

  sendRawMessage: (message: string) =>
    request<ApiResponse<any>>('/messages/raw', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  getStatus: () =>
    request<SystemStatus>('/status'),

  getStats: () =>
    request<ApiResponse<DashboardStats>>('/status/stats'),
}
