import { useState, useEffect, useCallback } from 'react'
import { Tabs, Card, Space, Button, InputNumber, Tag, Typography, message, Alert } from 'antd'
import { PlusOutlined, CloseOutlined, WarningOutlined, ReloadOutlined } from '@ant-design/icons'
import type { RegisterType } from '../../../preload'

const { Text, Title } = Typography

interface ExceptionConfigProps {
  slaveId: string
  slaveName: string
}

function ExceptionConfig({ slaveId, slaveName }: ExceptionConfigProps) {
  const [activeTab, setActiveTab] = useState<RegisterType>('holding')
  const [illegalAddresses, setIllegalAddresses] = useState<{
    holding: number[]
    input: number[]
    coil: number[]
    discrete: number[]
  } | null>(null)
  const [newAddress, setNewAddress] = useState<number>(0)
  const [loading, setLoading] = useState(false)

  const loadIllegalAddresses = useCallback(async () => {
    setLoading(true)
    const data = await window.electronAPI.slave.getIllegalAddresses(slaveId)
    setIllegalAddresses(data)
    setLoading(false)
  }, [slaveId])

  useEffect(() => {
    loadIllegalAddresses()
  }, [loadIllegalAddresses])

  const handleAdd = async () => {
    const addresses = illegalAddresses?.[activeTab] || []
    if (addresses.includes(newAddress)) {
      message.warning('该地址已在非法地址列表中')
      return
    }

    const success = await window.electronAPI.slave.addIllegalAddress(slaveId, activeTab, newAddress)
    if (success) {
      message.success(`已添加地址 ${newAddress} 到非法地址列表`)
      loadIllegalAddresses()
    } else {
      message.error('添加失败')
    }
  }

  const handleRemove = async (address: number) => {
    const success = await window.electronAPI.slave.removeIllegalAddress(slaveId, activeTab, address)
    if (success) {
      message.success(`已从非法地址列表移除地址 ${address}`)
      loadIllegalAddresses()
    } else {
      message.error('移除失败')
    }
  }

  const getFunctionCode = (type: RegisterType): string => {
    switch (type) {
      case 'holding': return '0x03, 0x06, 0x10'
      case 'input': return '0x04'
      case 'coil': return '0x01, 0x05, 0x0F'
      case 'discrete': return '0x02'
    }
  }

  const tabItems = [
    {
      key: 'holding',
      label: '保持寄存器 (Holding)',
      children: (
        <div>
          <Alert
            message="功能说明"
            description={
              <div>
                <p>当主站访问以下地址的<strong>保持寄存器</strong>时，从站将返回 <Tag color="red">异常码 0x02 (非法数据地址)</Tag></p>
                <p>影响的功能码: <code>{getFunctionCode('holding')}</code></p>
              </div>
            }
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            style={{ marginBottom: 16 }}
          />
          {renderAddressList('holding')}
        </div>
      )
    },
    {
      key: 'input',
      label: '输入寄存器 (Input)',
      children: (
        <div>
          <Alert
            message="功能说明"
            description={
              <div>
                <p>当主站访问以下地址的<strong>输入寄存器</strong>时，从站将返回 <Tag color="red">异常码 0x02 (非法数据地址)</Tag></p>
                <p>影响的功能码: <code>{getFunctionCode('input')}</code></p>
              </div>
            }
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            style={{ marginBottom: 16 }}
          />
          {renderAddressList('input')}
        </div>
      )
    },
    {
      key: 'coil',
      label: '线圈 (Coil)',
      children: (
        <div>
          <Alert
            message="功能说明"
            description={
              <div>
                <p>当主站访问以下地址的<strong>线圈</strong>时，从站将返回 <Tag color="red">异常码 0x02 (非法数据地址)</Tag></p>
                <p>影响的功能码: <code>{getFunctionCode('coil')}</code></p>
              </div>
            }
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            style={{ marginBottom: 16 }}
          />
          {renderAddressList('coil')}
        </div>
      )
    },
    {
      key: 'discrete',
      label: '离散输入 (Discrete)',
      children: (
        <div>
          <Alert
            message="功能说明"
            description={
              <div>
                <p>当主站访问以下地址的<strong>离散输入</strong>时，从站将返回 <Tag color="red">异常码 0x02 (非法数据地址)</Tag></p>
                <p>影响的功能码: <code>{getFunctionCode('discrete')}</code></p>
              </div>
            }
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            style={{ marginBottom: 16 }}
          />
          {renderAddressList('discrete')}
        </div>
      )
    }
  ]

  function renderAddressList(type: RegisterType) {
    const addresses = illegalAddresses?.[type] || []
    
    return (
      <Card
        size="small"
        title={
          <Space>
            <Text strong>非法地址列表 ({addresses.length})</Text>
            <Button 
              type="text" 
              icon={<ReloadOutlined />} 
              onClick={loadIllegalAddresses}
              size="small"
            >
              刷新
            </Button>
          </Space>
        }
        extra={
          <Space>
            <InputNumber
              min={0}
              max={65535}
              value={newAddress}
              onChange={(val) => val !== null && setNewAddress(val)}
              placeholder="地址"
              addonBefore="地址"
            />
            <Button 
              type="primary" 
              icon={<PlusOutlined />}
              onClick={handleAdd}
            >
              添加
            </Button>
          </Space>
        }
      >
        {addresses.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>
            暂无非法地址配置
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {addresses.sort((a, b) => a - b).map(addr => (
              <div key={addr} className="illegal-address-item">
                <Space size={4}>
                  <Tag color="red">
                    <Text code>{addr}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      (0x{addr.toString(16).toUpperCase()})
                    </Text>
                  </Tag>
                  <Button
                    type="text"
                    size="small"
                    icon={<CloseOutlined />}
                    onClick={() => handleRemove(addr)}
                    danger
                    style={{ padding: 0 }}
                  />
                </Space>
              </div>
            ))}
          </div>
        )}
      </Card>
    )
  }

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space direction="vertical" size={0}>
          <Title level={5} style={{ margin: 0 }}>
            <WarningOutlined style={{ color: '#faad14', marginRight: 8 }} />
            异常配置 - {slaveName}
          </Title>
          <Text type="secondary">
            配置非法地址，当主站访问这些地址时，从站将返回 MODBUS 异常响应。
            异常码 0x02 表示 "Illegal Data Address"（非法数据地址）。
          </Text>
        </Space>
      </Card>

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as RegisterType)}
        items={tabItems}
      />
    </div>
  )
}

export default ExceptionConfig
