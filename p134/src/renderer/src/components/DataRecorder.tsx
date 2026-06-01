import { useState, useEffect } from 'react'
import {
  Card, Table, Button, Space, Typography, Select, Tag,
  Empty, Tooltip
} from 'antd'
import {
  HistoryOutlined, DeleteOutlined, ReloadOutlined,
  EyeOutlined
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { DataRecord, SlaveConfig, RegisterType } from '../../../preload'

const { Title, Text } = Typography
const { Option } = Select

const TYPE_LABELS: Record<RegisterType, string> = {
  holding: '保持寄存器',
  input: '输入寄存器',
  coil: '线圈',
  discrete: '离散输入'
}

const TYPE_COLORS: Record<RegisterType, string> = {
  holding: 'blue',
  input: 'cyan',
  coil: 'orange',
  discrete: 'purple'
}

const SOURCE_LABELS: Record<string, string> = {
  script: '脚本',
  master: '主站',
  ui: '界面'
}

const SOURCE_COLORS: Record<string, string> = {
  script: 'green',
  master: 'gold',
  ui: 'geekblue'
}

function DataRecorder({ slaves, selectedSlaveId, onSelectSlave }: {
  slaves: SlaveConfig[]
  selectedSlaveId: string | null
  onSelectSlave: (id: string) => void
}) {
  const [records, setRecords] = useState<DataRecord[]>([])
  const [filterType, setFilterType] = useState<RegisterType | 'all'>('all')
  const [filterSource, setFilterSource] = useState<string>('all')

  const loadHistory = async () => {
    if (!selectedSlaveId) return
    const data = await window.electronAPI.data.getHistory(selectedSlaveId)
    setRecords(data.reverse())
  }

  useEffect(() => {
    loadHistory()
    const interval = setInterval(loadHistory, 1000)
    return () => clearInterval(interval)
  }, [selectedSlaveId])

  const handleClear = async () => {
    if (!selectedSlaveId) return
    await window.electronAPI.data.clearHistory(selectedSlaveId)
    setRecords([])
  }

  const filteredRecords = records.filter(r => {
    if (filterType !== 'all' && r.type !== filterType) return false
    if (filterSource !== 'all' && r.source !== filterSource) return false
    return true
  })

  const columns: ColumnsType<DataRecord> = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (ts: number) => new Date(ts).toLocaleTimeString()
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: RegisterType) => (
        <Tag color={TYPE_COLORS[type]}>{TYPE_LABELS[type]}</Tag>
      )
    },
    {
      title: '地址',
      dataIndex: 'address',
      key: 'address',
      width: 100,
      render: (addr: number) => <Text code>{addr}</Text>
    },
    {
      title: '原值',
      dataIndex: 'oldValue',
      key: 'oldValue',
      width: 100,
      render: (val: number | boolean) => (
        typeof val === 'boolean' ? (val ? 'ON' : 'OFF') : val
      )
    },
    {
      title: '新值',
      dataIndex: 'newValue',
      key: 'newValue',
      width: 100,
      render: (val: number | boolean) => (
        <Text strong>
          {typeof val === 'boolean' ? (val ? 'ON' : 'OFF') : val}
        </Text>
      )
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 100,
      render: (source: string) => (
        <Tag color={SOURCE_COLORS[source] || 'default'}>
          {SOURCE_LABELS[source] || source}
        </Tag>
      )
    }
  ]

  return (
    <Card
      title={
        <Space>
          <HistoryOutlined />
          <Title level={5} style={{ margin: 0 }}>数据记录</Title>
        </Space>
      }
      extra={
        <Space>
          <Select
            placeholder="选择从站"
            style={{ width: 180 }}
            value={selectedSlaveId || undefined}
            onChange={onSelectSlave}
          >
            {slaves.map(slave => (
              <Option key={slave.id} value={slave.id}>
                {slave.name}
              </Option>
            ))}
          </Select>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadHistory}
          >
            刷新
          </Button>
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={handleClear}
            disabled={!selectedSlaveId}
          >
            清空
          </Button>
        </Space>
      }
    >
      <Space style={{ marginBottom: 16 }}>
        <Text type="secondary">筛选类型:</Text>
        <Select
          value={filterType}
          onChange={setFilterType}
          style={{ width: 140 }}
        >
          <Option value="all">全部</Option>
          <Option value="holding">保持寄存器</Option>
          <Option value="input">输入寄存器</Option>
          <Option value="coil">线圈</Option>
          <Option value="discrete">离散输入</Option>
        </Select>
        
        <Text type="secondary" style={{ marginLeft: 16 }}>筛选来源:</Text>
        <Select
          value={filterSource}
          onChange={setFilterSource}
          style={{ width: 120 }}
        >
          <Option value="all">全部</Option>
          <Option value="script">脚本</Option>
          <Option value="master">主站</Option>
          <Option value="ui">界面</Option>
        </Select>
      </Space>

      {selectedSlaveId ? (
        <Table
          columns={columns}
          dataSource={filteredRecords}
          rowKey={(r, i) => `${r.timestamp}-${r.type}-${r.address}-${i}`}
          pagination={{ pageSize: 20 }}
          scroll={{ y: 400 }}
        />
      ) : (
        <Empty
          image={<EyeOutlined style={{ fontSize: 48, color: '#ccc' }} />}
          description="请选择一个从站查看数据记录"
        />
      )}
    </Card>
  )
}

export default DataRecorder
