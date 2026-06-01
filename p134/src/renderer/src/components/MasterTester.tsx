import { useState } from 'react'
import { 
  Card, Form, Input, InputNumber, Select, Radio, Row, Col, Button, Space, 
  Typography, message, Alert, Divider, Table
} from 'antd'
import { 
  PlayCircleOutlined, DatabaseOutlined, ThunderboltOutlined,
  ExperimentOutlined
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { MasterConfig, SlaveProtocol } from '../../../preload'

const { Text, Title } = Typography

type FunctionCode = '03' | '04' | '01' | '02' | '06' | '10' | '05'

interface TestResult {
  id: number
  timestamp: string
  functionCode: string
  functionName: string
  success: boolean
  result: string
  duration: number
}

const FUNCTION_CODE_INFO: Record<FunctionCode, { name: string; description: string; isWrite: boolean }> = {
  '01': { name: '读线圈', description: 'Read Coils', isWrite: false },
  '02': { name: '读离散输入', description: 'Read Discrete Inputs', isWrite: false },
  '03': { name: '读保持寄存器', description: 'Read Holding Registers', isWrite: false },
  '04': { name: '读输入寄存器', description: 'Read Input Registers', isWrite: false },
  '05': { name: '写单个线圈', description: 'Write Single Coil', isWrite: true },
  '06': { name: '写单个寄存器', description: 'Write Single Register', isWrite: true },
  '10': { name: '写多个寄存器', description: 'Write Multiple Registers', isWrite: true }
}

function MasterTester() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<TestResult[]>([])
  const [resultId, setResultId] = useState(0)

  const protocol = Form.useWatch('protocol', form) as SlaveProtocol
  const functionCode = Form.useWatch('functionCode', form) as FunctionCode

  const handleExecute = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)
      const startTime = Date.now()

      const config: MasterConfig = {
        protocol: values.protocol,
        unitId: values.unitId,
        timeout: values.timeout
      }

      if (values.protocol === 'tcp') {
        config.tcpHost = values.tcpHost
        config.tcpPort = values.tcpPort
      } else {
        config.serialPort = values.serialPort
        config.baudRate = values.baudRate
        config.parity = values.parity
        config.stopBits = values.stopBits
        config.dataBits = values.dataBits
      }

      const address = values.address
      let result: any
      let success = true
      let resultStr = ''

      try {
        switch (values.functionCode) {
          case '03':
            result = await window.electronAPI.master.readHoldingRegisters(config, address, values.length)
            resultStr = `数据: [${result.data.join(', ')}]`
            break
          case '04':
            result = await window.electronAPI.master.readInputRegisters(config, address, values.length)
            resultStr = `数据: [${result.data.join(', ')}]`
            break
          case '01':
            result = await window.electronAPI.master.readCoils(config, address, values.length)
            resultStr = `数据: [${result.data.map((v: boolean) => v ? '1' : '0').join(', ')}]`
            break
          case '02':
            result = await window.electronAPI.master.readDiscreteInputs(config, address, values.length)
            resultStr = `数据: [${result.data.map((v: boolean) => v ? '1' : '0').join(', ')}]`
            break
          case '06':
            result = await window.electronAPI.master.writeSingleRegister(config, address, values.writeValue)
            resultStr = `地址: ${result.address}, 值: ${result.value} (0x${result.value.toString(16).toUpperCase()})`
            break
          case '10':
            const writeValues = values.writeValues
              .split(/[,\s]+/)
              .filter((v: string) => v.trim() !== '')
              .map((v: string) => {
                if (v.startsWith('0x') || v.startsWith('0X')) {
                  return parseInt(v, 16)
                }
                return parseInt(v, 10)
              })
              .filter((v: number) => !isNaN(v))
            result = await window.electronAPI.master.writeMultipleRegisters(config, address, writeValues)
            resultStr = `起始地址: ${result.address}, 数量: ${result.length}`
            break
          case '05':
            result = await window.electronAPI.master.writeSingleCoil(config, address, values.writeCoilValue)
            resultStr = `地址: ${result.address}, 值: ${result.value}`
            break
        }
        message.success('执行成功')
      } catch (error: any) {
        success = false
        resultStr = `错误: ${error.message || String(error)}`
        message.error('执行失败')
      }

      const duration = Date.now() - startTime
      const funcInfo = FUNCTION_CODE_INFO[values.functionCode]

      setResults(prev => [{
        id: resultId,
        timestamp: new Date().toLocaleTimeString(),
        functionCode: `0x${values.functionCode}`,
        functionName: funcInfo.name,
        success,
        result: resultStr,
        duration
      }, ...prev])
      setResultId(prev => prev + 1)

    } catch (e) {
      console.error('Validation failed:', e)
    } finally {
      setLoading(false)
    }
  }

  const isWrite = functionCode ? FUNCTION_CODE_INFO[functionCode]?.isWrite : false
  const isCoil = functionCode === '05'

  const resultColumns: ColumnsType<TestResult> = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 100
    },
    {
      title: '功能码',
      dataIndex: 'functionCode',
      key: 'functionCode',
      width: 80,
      render: (code) => <Text code>{code}</Text>
    },
    {
      title: '功能',
      dataIndex: 'functionName',
      key: 'functionName',
      width: 120
    },
    {
      title: '状态',
      dataIndex: 'success',
      key: 'success',
      width: 80,
      render: (success) => (
        <Text type={success ? 'success' : 'danger'}>
          {success ? '成功' : '失败'}
        </Text>
      )
    },
    {
      title: '结果',
      dataIndex: 'result',
      key: 'result',
      ellipsis: true,
      render: (text, record) => (
        <div className={`test-result ${!record.success ? 'test-error' : ''}`}>
          {text}
        </div>
      )
    },
    {
      title: '耗时',
      dataIndex: 'duration',
      key: 'duration',
      width: 80,
      render: (ms) => `${ms}ms`
    }
  ]

  return (
    <div>
      <Row gutter={16}>
        <Col span={10}>
          <Card 
            size="small" 
            title={
              <Space>
                <ExperimentOutlined />
                主站测试配置
              </Space>
            }
          >
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                protocol: 'tcp',
                functionCode: '03',
                unitId: 1,
                tcpHost: '127.0.0.1',
                tcpPort: 502,
                serialPort: '/dev/ttyUSB0',
                baudRate: 9600,
                parity: 'none',
                stopBits: 1,
                dataBits: 8,
                timeout: 5000,
                address: 0,
                length: 10,
                writeValue: 0,
                writeValues: '',
                writeCoilValue: false
              }}
            >
              <Form.Item
                name="protocol"
                label="通信协议"
              >
                <Radio.Group>
                  <Radio.Button value="tcp">TCP/IP</Radio.Button>
                  <Radio.Button value="rtu">RTU</Radio.Button>
                </Radio.Group>
              </Form.Item>

              {protocol === 'tcp' && (
                <Row gutter={16}>
                  <Col span={16}>
                    <Form.Item
                      name="tcpHost"
                      label="主机地址"
                      rules={[{ required: true, message: '请输入主机地址' }]}
                    >
                      <Input
                        style={{ width: '100%' }}
                        placeholder="127.0.0.1"
                      />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item
                      name="tcpPort"
                      label="端口"
                      rules={[{ required: true, message: '请输入端口' }]}
                    >
                      <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>
              )}

              {protocol === 'rtu' && (
                <>
                  <Form.Item
                    name="serialPort"
                    label="串口"
                    rules={[{ required: true, message: '请选择串口' }]}
                  >
                    <Select
                      allowClear
                      options={[
                        { value: '/dev/ttyUSB0', label: '/dev/ttyUSB0' },
                        { value: '/dev/ttyUSB1', label: '/dev/ttyUSB1' },
                        { value: 'COM1', label: 'COM1' },
                        { value: 'COM2', label: 'COM2' },
                        { value: 'COM3', label: 'COM3' }
                      ]}
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
                        label="校验"
                        rules={[{ required: true, message: '请选择校验位' }]}
                      >
                        <Select
                          options={[
                            { value: 'none', label: '无' },
                            { value: 'even', label: '偶' },
                            { value: 'odd', label: '奇' }
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

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="unitId"
                    label="站地址"
                    rules={[{ required: true, message: '请输入站地址' }]}
                  >
                    <InputNumber min={1} max={247} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="timeout"
                    label="超时 (ms)"
                    rules={[{ required: true, message: '请输入超时时间' }]}
                  >
                    <InputNumber min={100} max={30000} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              <Divider orientation="left">功能码</Divider>

              <Form.Item
                name="functionCode"
                label="功能码"
                rules={[{ required: true, message: '请选择功能码' }]}
              >
                <Radio.Group>
                  {Object.entries(FUNCTION_CODE_INFO).map(([code, info]) => (
                    <Radio.Button key={code} value={code}>
                      <Space size={4}>
                        {info.isWrite ? <ThunderboltOutlined /> : <DatabaseOutlined />}
                        0x{code}
                      </Space>
                    </Radio.Button>
                  ))}
                </Radio.Group>
              </Form.Item>

              {functionCode && (
                <Alert
                  type={isWrite ? 'warning' : 'info'}
                  showIcon
                  message={`0x${functionCode} - ${FUNCTION_CODE_INFO[functionCode].name}`}
                  description={FUNCTION_CODE_INFO[functionCode].description}
                  style={{ marginBottom: 16 }}
                />
              )}

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="address"
                    label="起始地址"
                    rules={[{ required: true, message: '请输入起始地址' }]}
                  >
                    <InputNumber min={0} max={65535} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                {!isWrite && (
                  <Col span={12}>
                    <Form.Item
                      name="length"
                      label="数量"
                      rules={[{ required: true, message: '请输入读取数量' }]}
                    >
                      <InputNumber min={1} max={125} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                )}
              </Row>

              {isWrite && (
                <>
                  {isCoil ? (
                    <Form.Item
                      name="writeCoilValue"
                      label="线圈值"
                      rules={[{ required: true, message: '请选择线圈值' }]}
                    >
                      <Radio.Group>
                        <Radio.Button value={true}>ON (0xFF00)</Radio.Button>
                        <Radio.Button value={false}>OFF (0x0000)</Radio.Button>
                      </Radio.Group>
                    </Form.Item>
                  ) : functionCode === '06' ? (
                    <Form.Item
                      name="writeValue"
                      label="写入值"
                      rules={[{ required: true, message: '请输入写入值' }]}
                    >
                      <InputNumber min={0} max={65535} style={{ width: '100%' }} />
                    </Form.Item>
                  ) : (
                    <Form.Item
                      name="writeValues"
                      label="写入值 (多个)"
                      rules={[{ required: true, message: '请输入写入值' }]}
                      extra="多个值用逗号或空格分隔，支持十进制和十六进制(0x开头)"
                    >
                      <Input
                        style={{ width: '100%' }}
                        placeholder="例如: 100, 200, 0x100"
                      />
                    </Form.Item>
                  )}
                </>
              )}

              <Button
                type="primary"
                size="large"
                icon={<PlayCircleOutlined />}
                onClick={handleExecute}
                loading={loading}
                block
              >
                执行
              </Button>
            </Form>
          </Card>
        </Col>

        <Col span={14}>
          <Card
            size="small"
            title={
              <Space>
                <Title level={5} style={{ margin: 0 }}>测试结果</Title>
                <Text type="secondary">({results.length} 条记录)</Text>
              </Space>
            }
            extra={
              <Button size="small" onClick={() => setResults([])}>
                清空
              </Button>
            }
          >
            <Table
              size="small"
              columns={resultColumns}
              dataSource={results}
              rowKey="id"
              pagination={{ pageSize: 10 }}
              scroll={{ y: 500 }}
              locale={{ emptyText: '暂无测试记录，请执行测试' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default MasterTester
