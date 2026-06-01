import { useState, useEffect, useCallback } from 'react'
import { Layout, Tabs, Typography, Space, Button, message } from 'antd'
import { 
  DatabaseOutlined, SettingOutlined, WarningOutlined, ExperimentOutlined, 
  PlusOutlined, CodeOutlined, HistoryOutlined, SaveOutlined 
} from '@ant-design/icons'
import SlaveList from './components/SlaveList'
import RegisterConfig from './components/RegisterConfig'
import ExceptionConfig from './components/ExceptionConfig'
import MasterTester from './components/MasterTester'
import ScriptEditor from './components/ScriptEditor'
import DataRecorder from './components/DataRecorder'
import ConfigManager from './components/ConfigManager'
import SlaveFormModal from './components/SlaveFormModal'
import type { SlaveConfig } from '../../preload'

const { Header, Content } = Layout
const { Title } = Typography

function App() {
  const [slaves, setSlaves] = useState<SlaveConfig[]>([])
  const [selectedSlaveId, setSelectedSlaveId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingSlave, setEditingSlave] = useState<SlaveConfig | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [apiReady, setApiReady] = useState(false)

  useEffect(() => {
    const checkAPI = () => {
      if (window.electronAPI) {
        setApiReady(true)
        console.log('electronAPI is ready')
      } else {
        setTimeout(checkAPI, 100)
      }
    }
    checkAPI()
  }, [])

  const loadSlaves = useCallback(async () => {
    if (!window.electronAPI) {
      console.error('electronAPI not available')
      return
    }
    const data = await window.electronAPI.slave.list()
    setSlaves(data)
    if (!selectedSlaveId && data.length > 0) {
      setSelectedSlaveId(data[0].id)
    }
  }, [selectedSlaveId])

  useEffect(() => {
    if (apiReady) {
      loadSlaves()
    }
  }, [apiReady, loadSlaves, refreshKey])

  const handleAddSlave = () => {
    setEditingSlave(null)
    setModalOpen(true)
  }

  const handleEditSlave = (slave: SlaveConfig) => {
    setEditingSlave(slave)
    setModalOpen(true)
  }

  const handleSlaveSaved = () => {
    setRefreshKey(k => k + 1)
    message.success('从站配置已保存')
  }

  const handleSlaveDeleted = () => {
    setRefreshKey(k => k + 1)
    setSelectedSlaveId(null)
    message.success('从站已删除')
  }

  const handleSlaveStatusChanged = () => {
    setRefreshKey(k => k + 1)
  }

  const selectedSlave = slaves.find(s => s.id === selectedSlaveId)

  const tabItems = [
    {
      key: 'slaves',
      label: (
        <Space>
          <DatabaseOutlined />
          从站列表
        </Space>
      ),
      children: (
        <SlaveList
          slaves={slaves}
          onAdd={handleAddSlave}
          onEdit={handleEditSlave}
          onSelect={setSelectedSlaveId}
          selectedId={selectedSlaveId}
          onStatusChanged={handleSlaveStatusChanged}
          onDeleted={handleSlaveDeleted}
        />
      )
    },
    {
      key: 'registers',
      label: (
        <Space>
          <SettingOutlined />
          寄存器配置
        </Space>
      ),
      children: selectedSlaveId ? (
        <RegisterConfig slaveId={selectedSlaveId} slaveName={selectedSlave?.name || ''} />
      ) : (
        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
          请先选择一个从站
        </div>
      )
    },
    {
      key: 'exceptions',
      label: (
        <Space>
          <WarningOutlined />
          异常配置
        </Space>
      ),
      children: selectedSlaveId ? (
        <ExceptionConfig slaveId={selectedSlaveId} slaveName={selectedSlave?.name || ''} />
      ) : (
        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
          请先选择一个从站
        </div>
      )
    },
    {
      key: 'tester',
      label: (
        <Space>
          <ExperimentOutlined />
          主站测试
        </Space>
      ),
      children: <MasterTester />
    },
    {
      key: 'scripts',
      label: (
        <Space>
          <CodeOutlined />
          Lua脚本
        </Space>
      ),
      children: <ScriptEditor slaves={slaves} />
    },
    {
      key: 'data',
      label: (
        <Space>
          <HistoryOutlined />
          数据记录
        </Space>
      ),
      children: (
        <DataRecorder
          slaves={slaves}
          selectedSlaveId={selectedSlaveId}
          onSelectSlave={setSelectedSlaveId}
        />
      )
    },
    {
      key: 'config',
      label: (
        <Space>
          <SaveOutlined />
          配置管理
        </Space>
      ),
      children: (
        <ConfigManager onRefresh={() => setRefreshKey(k => k + 1)} />
      )
    }
  ]

  if (!apiReady) {
    return (
      <div style={{ 
        height: '100%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 16
      }}>
        <div>正在初始化应用...</div>
      </div>
    )
  }

  return (
    <Layout style={{ height: '100%' }}>
      <Header style={{ 
        background: '#fff', 
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px'
      }}>
        <Title level={4} style={{ margin: 0 }}>MODBUS 从站模拟器</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddSlave}>
          添加从站
        </Button>
      </Header>
      <Content style={{ padding: '16px', overflow: 'auto' }}>
        <Tabs
          items={tabItems}
          size="large"
          onChange={(key) => {
          }}
        />
      </Content>
      
      <SlaveFormModal
        open={modalOpen}
        slave={editingSlave}
        onCancel={() => setModalOpen(false)}
        onSaved={() => {
          handleSlaveSaved()
          setModalOpen(false)
        }}
      />
    </Layout>
  )
}

export default App
