import { useEffect } from 'react'
import { Modal, Form, Input, InputNumber, Select, Radio, Row, Col, message } from 'antd'
import type { SlaveConfig, SlaveProtocol } from '../../../preload'

interface SlaveFormModalProps {
  open: boolean
  slave: SlaveConfig | null
  onCancel: () => void
  onSaved: () => void
}

function SlaveFormModal({ open, slave, onCancel, onSaved }: SlaveFormModalProps) {
  const [form] = Form.useForm()

  useEffect(() => {
    if (open) {
      if (slave) {
        form.setFieldsValue({
          name: slave.name,
          protocol: slave.protocol,
          unitId: slave.unitId,
          tcpHost: slave.tcpHost || '0.0.0.0',
          tcpPort: slave.tcpPort || 502,
          serialPort: slave.serialPort || '/dev/ttyUSB0',
          baudRate: slave.baudRate || 9600,
          parity: slave.parity || 'none',
          stopBits: slave.stopBits || 1,
          dataBits: slave.dataBits || 8,
          responseDelay: slave.responseDelay || 0
        })
      } else {
        form.resetFields()
        form.setFieldsValue({
          protocol: 'tcp',
          unitId: 1,
          tcpHost: '0.0.0.0',
          tcpPort: 502,
          serialPort: '/dev/ttyUSB0',
          baudRate: 9600,
          parity: 'none',
          stopBits: 1,
          dataBits: 8,
          responseDelay: 0
        })
      }
    }
  }, [open, slave, form])

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      
      if (slave) {
        await window.electronAPI.slave.update(slave.id, values)
      } else {
        await window.electronAPI.slave.add(values)
      }
      
      onSaved()
    } catch (e) {
      console.error('Validation failed:', e)
    }
  }

  const protocol = Form.useWatch('protocol', form) as SlaveProtocol

  return (
    <Modal
      title={slave ? '编辑从站' : '添加从站'}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText="保存"
      cancelText="取消"
      width={600}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          protocol: 'tcp',
          unitId: 1,
          tcpHost: '0.0.0.0',
          tcpPort: 502,
          serialPort: '/dev/ttyUSB0',
          baudRate: 9600,
          parity: 'none',
          stopBits: 1,
          dataBits: 8,
          responseDelay: 0
        }}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="name"
              label="从站名称"
              rules={[{ required: true, message: '请输入从站名称' }]}
            >
              <Input placeholder="例如：PLC-1" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="protocol"
              label="通信协议"
              rules={[{ required: true, message: '请选择协议' }]}
            >
              <Radio.Group>
                <Radio.Button value="tcp">TCP/IP</Radio.Button>
                <Radio.Button value="rtu">RTU</Radio.Button>
              </Radio.Group>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="unitId"
              label="站地址 (Unit ID)"
              rules={[{ required: true, message: '请输入站地址' }]}
            >
              <InputNumber min={1} max={247} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="responseDelay"
              label="响应延迟 (ms)"
              rules={[{ required: true, message: '请输入响应延迟' }]}
              tooltip="模拟设备响应延迟，用于测试超时场景"
            >
              <InputNumber min={0} max={10000} style={{ width: '100%' }} addonAfter="ms" />
            </Form.Item>
          </Col>
        </Row>

        {protocol === 'tcp' && (
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="tcpHost"
                label="绑定地址"
                rules={[{ required: true, message: '请输入绑定地址' }]}
              >
                <Input placeholder="0.0.0.0" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="tcpPort"
                label="端口号"
                rules={[{ required: true, message: '请输入端口号' }]}
              >
                <InputNumber min={1} max={65535} style={{ width: '100%' }} placeholder="502" />
              </Form.Item>
            </Col>
          </Row>
        )}

        {protocol === 'rtu' && (
          <>
            <Form.Item
              name="serialPort"
              label="串口名称"
              rules={[{ required: true, message: '请输入串口名称' }]}
            >
              <Select
                placeholder="选择或输入串口"
                allowClear
                options={[
                  { value: '/dev/ttyUSB0', label: '/dev/ttyUSB0' },
                  { value: '/dev/ttyUSB1', label: '/dev/ttyUSB1' },
                  { value: '/dev/ttyS0', label: '/dev/ttyS0' },
                  { value: 'COM1', label: 'COM1' },
                  { value: 'COM2', label: 'COM2' },
                  { value: 'COM3', label: 'COM3' }
                ]}
                style={{ width: '100%' }}
              />
            </Form.Item>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="baudRate"
                  label="波特率"
                  rules={[{ required: true, message: '请选择波特率' }]}
                >
                  <Select
                    options={[
                      { value: 1200, label: '1200' },
                      { value: 2400, label: '2400' },
                      { value: 4800, label: '4800' },
                      { value: 9600, label: '9600' },
                      { value: 19200, label: '19200' },
                      { value: 38400, label: '38400' },
                      { value: 57600, label: '57600' },
                      { value: 115200, label: '115200' }
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item
                  name="parity"
                  label="校验位"
                  rules={[{ required: true, message: '请选择校验位' }]}
                >
                  <Select
                    options={[
                      { value: 'none', label: '无' },
                      { value: 'even', label: '偶校验' },
                      { value: 'odd', label: '奇校验' }
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item
                  name="stopBits"
                  label="停止位"
                  rules={[{ required: true, message: '请选择停止位' }]}
                >
                  <Select
                    options={[
                      { value: 1, label: '1' },
                      { value: 2, label: '2' }
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              name="dataBits"
              label="数据位"
              rules={[{ required: true, message: '请选择数据位' }]}
            >
              <Radio.Group>
                <Radio.Button value={7}>7</Radio.Button>
                <Radio.Button value={8}>8</Radio.Button>
              </Radio.Group>
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  )
}

export default SlaveFormModal
