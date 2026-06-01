import { useState } from 'react'
import {
  Card, Button, Space, Typography, List, message, Upload,
  Descriptions, Tag, Modal
} from 'antd'
import {
  ExportOutlined, ImportOutlined, SaveOutlined,
  FileTextOutlined, InboxOutlined
} from '@ant-design/icons'
import type { UploadProps } from 'antd'
import type { SimulationConfig } from '../../../preload'

const { Title, Text, Paragraph } = Typography
const { Dragger } = Upload

function ConfigManager({ onRefresh }: { onRefresh: () => void }) {
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportedConfig, setExportedConfig] = useState<SimulationConfig | null>(null)

  const handleExport = async () => {
    const config = await window.electronAPI.config.export()
    setExportedConfig(config)
    setExportModalOpen(true)
  }

  const handleDownload = () => {
    if (!exportedConfig) return
    
    const blob = new Blob([JSON.stringify(exportedConfig, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `modbus-sim-config-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    message.success('配置文件已下载')
  }

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    accept: '.json',
    showUploadList: false,
    beforeUpload: async (file) => {
      try {
        const text = await file.text()
        const config = JSON.parse(text) as SimulationConfig
        
        if (!config.version || !config.slaves) {
          message.error('无效的配置文件格式')
          return false
        }
        
        const result = await window.electronAPI.config.import(config)
        message.success(`成功导入 ${result.slaves.length} 个从站和 ${result.scripts.length} 个脚本`)
        onRefresh()
      } catch (e) {
        console.error(e)
        message.error('导入失败: ' + (e as Error).message)
      }
      return false
    }
  }

  return (
    <>
      <Card
        title={
          <Space>
            <SaveOutlined />
            <Title level={5} style={{ margin: 0 }}>仿真配置管理</Title>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <Title level={5}>导出配置</Title>
            <Paragraph type="secondary">
              导出当前所有从站配置、寄存器值、非法地址配置和脚本，方便备份和分享。
            </Paragraph>
            <Button
              type="primary"
              icon={<ExportOutlined />}
              onClick={handleExport}
            >
              导出配置
            </Button>
          </div>

          <div style={{ padding: '24px', background: '#fafafa', borderRadius: 8 }}>
            <Title level={5}>导入配置</Title>
            <Paragraph type="secondary">
              从 JSON 文件导入配置，快速恢复仿真环境。
            </Paragraph>
            <Dragger {...uploadProps} style={{ background: '#fff' }}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽配置文件到此区域上传</p>
              <p className="ant-upload-hint">支持 .json 格式的配置文件</p>
            </Dragger>
          </div>

          <div>
            <Title level={5}>功能说明</Title>
            <List
              dataSource={[
                { icon: <FileTextOutlined />, title: '从站配置', desc: '保存所有从站的协议、地址、端口等配置信息' },
                { icon: <FileTextOutlined />, title: '寄存器数据', desc: '保存所有寄存器的当前值' },
                { icon: <FileTextOutlined />, title: '异常配置', desc: '保存非法地址配置' },
                { icon: <FileTextOutlined />, title: 'Lua脚本', desc: '保存所有自定义模拟脚本' }
              ]}
              renderItem={item => (
                <List.Item>
                  <List.Item.Meta
                    avatar={item.icon}
                    title={item.title}
                    description={item.desc}
                  />
                </List.Item>
              )}
            />
          </div>
        </Space>
      </Card>

      <Modal
        title="导出配置预览"
        open={exportModalOpen}
        onCancel={() => setExportModalOpen(false)}
        footer={
          <Space>
            <Button onClick={() => setExportModalOpen(false)}>关闭</Button>
            <Button type="primary" icon={<ExportOutlined />} onClick={handleDownload}>
              下载文件
            </Button>
          </Space>
        }
        width={700}
      >
        {exportedConfig && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="配置版本">
                {exportedConfig.version}
              </Descriptions.Item>
              <Descriptions.Item label="导出时间">
                {new Date(exportedConfig.exportedAt).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="从站数量">
                <Tag color="blue">{exportedConfig.slaves.length}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="脚本数量">
                <Tag color="green">{exportedConfig.scripts.length}</Tag>
              </Descriptions.Item>
            </Descriptions>
            
            <div>
              <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>从站列表:</Text>
              {exportedConfig.slaves.map((s, i) => (
                <Tag key={i} color="blue" style={{ marginBottom: 4 }}>
                  {s.config.name} ({s.config.protocol.toUpperCase()})
                </Tag>
              ))}
            </div>
            
            {exportedConfig.scripts.length > 0 && (
              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>脚本列表:</Text>
                {exportedConfig.scripts.map((s, i) => (
                  <Tag key={i} color="green" style={{ marginBottom: 4 }}>
                    {s.name}
                  </Tag>
                ))}
              </div>
            )}
          </Space>
        )}
      </Modal>
    </>
  )
}

export default ConfigManager
