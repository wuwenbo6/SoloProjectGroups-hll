import { Table, Tag, Space, Button, Popconfirm, message, Switch } from 'antd'
import { EditOutlined, DeleteOutlined, PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { SlaveConfig } from '../../../preload'

interface SlaveListProps {
  slaves: SlaveConfig[]
  onAdd: () => void
  onEdit: (slave: SlaveConfig) => void
  onSelect: (id: string) => void
  selectedId: string | null
  onStatusChanged: () => void
  onDeleted: () => void
}

function SlaveList({ slaves, onEdit, onSelect, selectedId, onStatusChanged, onDeleted }: SlaveListProps) {

  const handleStart = async (id: string) => {
    const success = await window.electronAPI.slave.start(id)
    if (success) {
      message.success('从站已启动')
      onStatusChanged()
    } else {
      message.error('启动失败，请检查端口或串口配置')
    }
  }

  const handleStop = async (id: string) => {
    const success = await window.electronAPI.slave.stop(id)
    if (success) {
      message.success('从站已停止')
      onStatusChanged()
    } else {
      message.error('停止失败')
    }
  }

  const handleDelete = async (id: string) => {
    const success = await window.electronAPI.slave.delete(id)
    if (success) {
      onDeleted()
    } else {
      message.error('删除失败')
    }
  }

  const columns: ColumnsType<SlaveConfig> = [
    {
      title: '状态',
      key: 'status',
      width: 80,
      render: (_, record) => (
        <Switch
          checked={record.isRunning}
          checkedChildren={<PlayCircleOutlined />}
          unCheckedChildren={<PauseCircleOutlined />}
          onChange={(checked) => checked ? handleStart(record.id) : handleStop(record.id)}
        />
      )
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 150,
      render: (text) => <strong>{text}</strong>
    },
    {
      title: '协议',
      dataIndex: 'protocol',
      key: 'protocol',
      width: 80,
      render: (protocol) => (
        <Tag color={protocol === 'tcp' ? 'blue' : 'green'}>
          {protocol.toUpperCase()}
        </Tag>
      )
    },
    {
      title: '站地址',
      dataIndex: 'unitId',
      key: 'unitId',
      width: 80
    },
    {
      title: '连接信息',
      key: 'connection',
      width: 200,
      render: (_, record) => {
        if (record.protocol === 'tcp') {
          return <code>{record.tcpHost || '0.0.0.0'}:{record.tcpPort || 502}</code>
        } else {
          return (
            <Space direction="vertical" size={0}>
              <code>{record.serialPort || '/dev/ttyUSB0'}</code>
              <span style={{ fontSize: 12, color: '#999' }}>
                {record.baudRate || 9600} {record.parity || 'none'} {record.dataBits || 8}-{record.stopBits || 1}
              </span>
            </Space>
          )
        }
      }
    },
    {
      title: '响应延迟',
      dataIndex: 'responseDelay',
      key: 'responseDelay',
      width: 100,
      render: (delay) => `${delay}ms`
    },
    {
      title: '运行状态',
      key: 'runningStatus',
      width: 80,
      render: (_, record) => (
        <Tag color={record.isRunning ? 'success' : 'default'}>
          {record.isRunning ? '运行中' : '已停止'}
        </Tag>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => onEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个从站吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={slaves}
      size="middle"
      onRow={(record) => ({
        onClick: () => onSelect(record.id),
        style: {
          cursor: 'pointer',
          background: selectedId === record.id ? '#e6f7ff' : undefined
        }
      })}
      locale={{ emptyText: '暂无从站，请点击"添加从站"按钮创建' }}
      pagination={false}
    />
  )
}

export default SlaveList
