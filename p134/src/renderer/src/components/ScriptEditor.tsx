import { useState, useEffect } from 'react'
import {
  Card, Table, Button, Modal, Input, Select, Space, message, Typography,
  Form, Popconfirm
} from 'antd'
import {
  PlayCircleOutlined, PauseCircleOutlined, PlusOutlined,
  EditOutlined, DeleteOutlined, CodeOutlined
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { ScriptConfig, SlaveConfig } from '../../../preload'

const { Title, Text } = Typography
const { TextArea } = Input
const { Option } = Select

const DEFAULT_SCRIPT = `-- MODBUS 从站 Lua 脚本示例
-- 可用 API:
-- modbus.get_register(type, address) - 获取寄存器值
-- modbus.set_register(type, address, value) - 设置寄存器值
-- modbus.sleep(ms) - 休眠(毫秒)
-- modbus.log(msg) - 输出日志

local counter = 0

-- update 函数会每100ms自动调用
function update()
  counter = counter + 1
  
  -- 示例: 模拟温度传感器, 保持寄存器0在20-30之间波动
  local temp = 25 + math.sin(counter * 0.1) * 5
  modbus.set_register("holding", 0, math.floor(temp * 100))
  
  -- 示例: 线圈0每秒翻转一次
  if counter % 10 == 0 then
    local current = modbus.get_register("coil", 0)
    modbus.set_register("coil", 0, not current)
  end
end

-- 初始化
modbus.log("脚本已启动")
`

function ScriptEditor({ slaves }: { slaves: SlaveConfig[] }) {
  const [scripts, setScripts] = useState<ScriptConfig[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingScript, setEditingScript] = useState<ScriptConfig | null>(null)
  const [form] = Form.useForm()

  const loadScripts = async () => {
    const data = await window.electronAPI.script.list()
    setScripts(data)
  }

  useEffect(() => {
    loadScripts()
  }, [])

  const handleAdd = () => {
    setEditingScript(null)
    form.resetFields()
    form.setFieldsValue({ code: DEFAULT_SCRIPT })
    setModalOpen(true)
  }

  const handleEdit = (script: ScriptConfig) => {
    setEditingScript(script)
    form.setFieldsValue(script)
    setModalOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      
      if (editingScript) {
        await window.electronAPI.script.update(editingScript.id, values)
        message.success('脚本已更新')
      } else {
        await window.electronAPI.script.create(values.slaveId, values.name, values.code)
        message.success('脚本已创建')
      }
      
      setModalOpen(false)
      loadScripts()
    } catch (e) {
      console.error(e)
    }
  }

  const handleDelete = async (id: string) => {
    await window.electronAPI.script.delete(id)
    message.success('脚本已删除')
    loadScripts()
  }

  const handleStart = async (id: string) => {
    const success = await window.electronAPI.script.start(id)
    if (success) {
      message.success('脚本已启动')
      loadScripts()
    } else {
      message.error('脚本启动失败')
    }
  }

  const handleStop = async (id: string) => {
    await window.electronAPI.script.stop(id)
    message.success('脚本已停止')
    loadScripts()
  }

  const columns: ColumnsType<ScriptConfig> = [
    {
      title: '脚本名称',
      dataIndex: 'name',
      key: 'name',
      width: 200
    },
    {
      title: '关联从站',
      dataIndex: 'slaveId',
      key: 'slaveId',
      width: 200,
      render: (slaveId) => {
        const slave = slaves.find(s => s.id === slaveId)
        return slave ? slave.name : '未知从站'
      }
    },
    {
      title: '状态',
      dataIndex: 'isRunning',
      key: 'isRunning',
      width: 100,
      render: (running) => (
        <Text type={running ? 'success' : 'secondary'}>
          {running ? '运行中' : '已停止'}
        </Text>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 250,
      render: (_, script) => (
        <Space>
          {script.isRunning ? (
            <Button
              type="text"
              icon={<PauseCircleOutlined />}
              onClick={() => handleStop(script.id)}
            >
              停止
            </Button>
          ) : (
            <Button
              type="text"
              icon={<PlayCircleOutlined />}
              onClick={() => handleStart(script.id)}
              disabled={slaves.find(s => s.id === script.slaveId)?.isRunning === false}
            >
              启动
            </Button>
          )}
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleEdit(script)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description="确定要删除这个脚本吗?"
            onConfirm={() => handleDelete(script.id)}
            okText="是"
            cancelText="否"
          >
            <Button type="text" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <Card
      title={
        <Space>
          <CodeOutlined />
          <Title level={5} style={{ margin: 0 }}>Lua 脚本管理</Title>
        </Space>
      }
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新建脚本
        </Button>
      }
    >
      <Table
        columns={columns}
        dataSource={scripts}
        rowKey="id"
        pagination={false}
      />

      <Modal
        title={editingScript ? '编辑脚本' : '新建脚本'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={800}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="脚本名称"
            rules={[{ required: true, message: '请输入脚本名称' }]}
          >
            <Input placeholder="例如: 温度模拟" />
          </Form.Item>
          <Form.Item
            name="slaveId"
            label="关联从站"
            rules={[{ required: true, message: '请选择从站' }]}
          >
            <Select placeholder="选择从站">
              {slaves.map(slave => (
                <Option key={slave.id} value={slave.id}>
                  {slave.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="code"
            label="Lua 代码"
            rules={[{ required: true, message: '请输入代码' }]}
          >
            <TextArea
              rows={20}
              placeholder="输入 Lua 代码"
              style={{ fontFamily: 'monospace' }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}

export default ScriptEditor
