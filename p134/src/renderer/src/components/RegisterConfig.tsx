import { useState, useEffect, useCallback } from 'react'
import { Tabs, Table, InputNumber, Switch, Space, Button, Input, message, Row, Col, Card, Typography } from 'antd'
import { ReloadOutlined, SyncOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { RegisterType } from '../../../preload'

const { Text } = Typography

interface RegisterConfigProps {
  slaveId: string
  slaveName: string
}

interface RegisterRow {
  key: number
  address: number
  hex: string
  decimal: number | boolean
}

function RegisterConfig({ slaveId, slaveName }: RegisterConfigProps) {
  const [activeTab, setActiveTab] = useState<RegisterType>('holding')
  const [registers, setRegisters] = useState<{
    holding: [number, number][]
    input: [number, number][]
    coil: [number, boolean][]
    discrete: [number, boolean][]
  } | null>(null)
  const [batchStart, setBatchStart] = useState(0)
  const [batchValues, setBatchValues] = useState('')
  const [loading, setLoading] = useState(false)

  const loadRegisters = useCallback(async () => {
    setLoading(true)
    const data = await window.electronAPI.slave.getRegisters(slaveId)
    setRegisters(data)
    setLoading(false)
  }, [slaveId])

  useEffect(() => {
    loadRegisters()
  }, [loadRegisters])

  const handleValueChange = async (type: RegisterType, address: number, value: number | boolean) => {
    const success = await window.electronAPI.slave.updateRegister(slaveId, type, address, value)
    if (success) {
      loadRegisters()
    } else {
      message.error('更新失败')
    }
  }

  const handleBatchUpdate = async () => {
    if (!batchValues.trim()) {
      message.warning('请输入要写入的值')
      return
    }

    const valuesStr = batchValues.split(/[,\s]+/).filter(v => v.trim() !== '')
    
    let values: (number | boolean)[]
    if (activeTab === 'coil' || activeTab === 'discrete') {
      values = valuesStr.map(v => v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'on')
    } else {
      values = valuesStr.map(v => {
        if (v.startsWith('0x') || v.startsWith('0X')) {
          return parseInt(v, 16)
        }
        return parseInt(v, 10)
      }).filter(v => !isNaN(v))
    }

    if (values.length === 0) {
      message.warning('没有有效的值')
      return
    }

    const success = await window.electronAPI.slave.batchUpdateRegisters(slaveId, activeTab, batchStart, values)
    if (success) {
      message.success(`成功写入 ${values.length} 个值`)
      setBatchValues('')
      loadRegisters()
    } else {
      message.error('批量写入失败')
    }
  }

  const getColumns = (type: RegisterType): ColumnsType<RegisterRow> => {
    const isBoolean = type === 'coil' || type === 'discrete'
    
    return [
      {
        title: '地址',
        dataIndex: 'address',
        key: 'address',
        width: 100,
        render: (addr) => (
          <Space direction="vertical" size={0}>
            <Text strong>{addr}</Text>
            <Text type="secondary" style={{ fontSize: 11 }}>0x{addr.toString(16).toUpperCase().padStart(4, '0')}</Text>
          </Space>
        )
      },
      {
        title: '值',
        dataIndex: 'decimal',
        key: 'decimal',
        width: 200,
        render: (value, record) => {
          if (isBoolean) {
            return (
              <Switch
                checked={value as boolean}
                onChange={(checked) => handleValueChange(type, record.address, checked)}
              />
            )
          }
          return (
            <InputNumber
              className="register-input"
              min={0}
              max={65535}
              value={value as number}
              onChange={(val) => val !== null && handleValueChange(type, record.address, val)}
            />
          )
        }
      },
      {
        title: '十六进制',
        dataIndex: 'hex',
        key: 'hex',
        width: 120,
        render: (_, record) => {
          if (isBoolean) {
            return (record.decimal as boolean) ? '0xFF00' : '0x0000'
          }
          return `0x${(record.decimal as number).toString(16).toUpperCase().padStart(4, '0')}`
        }
      },
      {
        title: '二进制',
        key: 'binary',
        render: (_, record) => {
          if (isBoolean) {
            return (record.decimal as boolean) ? '1' : '0'
          }
          return (record.decimal as number).toString(2).padStart(16, '0')
        }
      }
    ]
  }

  const getTableData = (type: RegisterType): RegisterRow[] => {
    if (!registers) return []
    
    const data = registers[type]
    return data.map(([addr, value]) => ({
      key: addr,
      address: addr,
      hex: '',
      decimal: value
    }))
  }

  const tabItems = [
    {
      key: 'holding',
      label: '保持寄存器 (Holding)',
      children: (
        <Table
          className="register-table"
          size="small"
          columns={getColumns('holding')}
          dataSource={getTableData('holding')}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          loading={loading}
          scroll={{ y: 400 }}
        />
      )
    },
    {
      key: 'input',
      label: '输入寄存器 (Input)',
      children: (
        <Table
          className="register-table"
          size="small"
          columns={getColumns('input')}
          dataSource={getTableData('input')}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          loading={loading}
          scroll={{ y: 400 }}
        />
      )
    },
    {
      key: 'coil',
      label: '线圈 (Coil)',
      children: (
        <Table
          className="register-table"
          size="small"
          columns={getColumns('coil')}
          dataSource={getTableData('coil')}
          pagination={{ pageSize: 50, showSizeChanger: true }}
          loading={loading}
          scroll={{ y: 400 }}
        />
      )
    },
    {
      key: 'discrete',
      label: '离散输入 (Discrete)',
      children: (
        <Table
          className="register-table"
          size="small"
          columns={getColumns('discrete')}
          dataSource={getTableData('discrete')}
          pagination={{ pageSize: 50, showSizeChanger: true }}
          loading={loading}
          scroll={{ y: 400 }}
        />
      )
    }
  ]

  return (
    <div>
      <Card 
        size="small" 
        style={{ marginBottom: 16 }}
        title={
          <Space>
            <span>寄存器配置 - {slaveName}</span>
            <Button 
              type="text" 
              icon={<ReloadOutlined />} 
              onClick={loadRegisters}
              size="small"
            >
              刷新
            </Button>
          </Space>
        }
      >
        <Row gutter={16} align="middle">
          <Col span={4}>
            <Text strong>起始地址:</Text>
          </Col>
          <Col span={6}>
            <InputNumber
              min={0}
              max={65535}
              value={batchStart}
              onChange={(val) => val !== null && setBatchStart(val)}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={4}>
            <Text strong>写入值:</Text>
          </Col>
          <Col span={6}>
            <Input
              placeholder="多个值用逗号或空格分隔"
              value={batchValues}
              onChange={(e) => setBatchValues(e.target.value)}
            />
          </Col>
          <Col span={4}>
            <Button 
              type="primary" 
              icon={<SyncOutlined />}
              onClick={handleBatchUpdate}
              block
            >
              批量写入
            </Button>
          </Col>
        </Row>
        <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
          提示: 数值支持十进制和十六进制(0x开头)，线圈/离散输入支持 0/1, true/false, on/off
        </div>
      </Card>

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as RegisterType)}
        items={tabItems}
      />
    </div>
  )
}

export default RegisterConfig
