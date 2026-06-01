
import React, { useMemo, useState } from 'react';
import {
  Card,
  Form,
  Input,
  Row,
  Col,
  Button,
  Space,
  Typography,
  message,
  Tabs,
} from 'antd';
import {
  DownloadOutlined,
  CopyOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useEsiStore } from '../store/useEsiStore';
import { generateEsiXml, copyToClipboard, downloadEsiFile } from '../utils/esiGenerator';

const { Title, Paragraph } = Typography;
const { TextArea } = Input;

const EsiGeneratorPage: React.FC = () => {
  const [form] = Form.useForm();
  const { config, setSlaveInfo, setConfigName } = useEsiStore();
  const [activeTab, setActiveTab] = useState<string>('form');

  const xmlContent = useMemo(() => generateEsiXml(config), [config]);

  const handleValuesChange = (changedValues: any) => {
    if ('name' in changedValues) {
      setConfigName(changedValues.name);
    }
    setSlaveInfo(changedValues);
  };

  const handleDownload = () => {
    try {
      downloadEsiFile(config);
      message.success('ESI文件下载成功！');
    } catch (err) {
      message.error('下载失败，请重试');
    }
  };

  const handleCopy = async () => {
    const success = await copyToClipboard(xmlContent);
    if (success) {
      message.success('XML已复制到剪贴板！');
    } else {
      message.error('复制失败，请重试');
    }
  };

  const tabItems = [
    {
      key: 'form',
      label: '基本信息',
      icon: <EyeOutlined />,
      children: (
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            name: config.name,
            ...config.slaveInfo,
          }}
          onValuesChange={handleValuesChange}
        >
          <Form.Item
            name="name"
            label="配置名称"
            rules={[{ required: true, message: '请输入配置名称' }]}
          >
            <Input placeholder="例如: 我的EtherCAT从站配置" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="vendorId"
                label="厂商ID (Vendor ID)"
                rules={[
                  { required: true, message: '请输入厂商ID' },
                  {
                    pattern: /^0x[0-9A-Fa-f]{8}$/,
                    message: '格式应为0x开头的8位十六进制数',
                  },
                ]}
              >
                <Input placeholder="0x00000001" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="productCode"
                label="产品代码 (Product Code)"
                rules={[
                  { required: true, message: '请输入产品代码' },
                  {
                    pattern: /^0x[0-9A-Fa-f]{8}$/,
                    message: '格式应为0x开头的8位十六进制数',
                  },
                ]}
              >
                <Input placeholder="0x00000001" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="revisionNo"
                label="版本号 (Revision No.)"
                rules={[
                  { required: true, message: '请输入版本号' },
                  {
                    pattern: /^0x[0-9A-Fa-f]{8}$/,
                    message: '格式应为0x开头的8位十六进制数',
                  },
                ]}
              >
                <Input placeholder="0x00010000" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="slaveName"
                label="从站名称"
                rules={[{ required: true, message: '请输入从站名称' }]}
              >
                <Input placeholder="EtherCAT Slave" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="vendorName"
                label="厂商名称"
                rules={[{ required: true, message: '请输入厂商名称' }]}
              >
                <Input placeholder="例如: Beckhoff" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="productName"
                label="产品名称"
                rules={[{ required: true, message: '请输入产品名称' }]}
              >
                <Input placeholder="例如: EL1008" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      ),
    },
    {
      key: 'preview',
      label: 'XML预览',
      icon: <EyeOutlined />,
      children: (
        <div className="rounded-lg overflow-hidden border border-gray-200">
          <SyntaxHighlighter
            language="xml"
            style={oneDark}
            showLineNumbers
            customStyle={{
              margin: 0,
              borderRadius: '0 0 8px 8px',
              maxHeight: '500px',
            }}
          >
            {xmlContent}
          </SyntaxHighlighter>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <Title level={3} className="mb-2">
          ESI生成器
        </Title>
        <Paragraph type="secondary" className="mb-0">
          配置从站基本信息，生成符合ETG标准的ESI（EtherCAT Slave Information）XML文件。
        </Paragraph>
      </Card>

      <Row gutter={16}>
        <Col xs={24} xl={14}>
          <Card
            title="ESI配置"
            extra={
              <Space>
                <Button
                  icon={<CopyOutlined />}
                  onClick={handleCopy}
                >
                  复制XML
                </Button>
                <Button
                  type="primary"
                  icon={<DownloadOutlined />}
                  onClick={handleDownload}
                >
                  下载ESI文件
                </Button>
              </Space>
            }
          >
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={tabItems}
            />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card title="配置摘要">
            <div className="space-y-4">
              <div>
                <div className="text-sm text-gray-500 mb-1">PDO统计</div>
                <Row gutter={16}>
                  <Col span={12}>
                    <div className="bg-blue-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {config.txPdO.length}
                      </div>
                      <div className="text-xs text-blue-500">TxPDO条目</div>
                    </div>
                  </Col>
                  <Col span={12}>
                    <div className="bg-green-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {config.rxPdO.length}
                      </div>
                      <div className="text-xs text-green-500">RxPDO条目</div>
                    </div>
                  </Col>
                </Row>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">数据大小</div>
                <Row gutter={16}>
                  <Col span={12}>
                    <div className="bg-blue-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {Math.ceil(
                          config.txPdO.reduce((sum, e) => sum + e.bitLength, 0) /
                            8
                        )}
                      </div>
                      <div className="text-xs text-blue-500">TxPDO (字节)</div>
                    </div>
                  </Col>
                  <Col span={12}>
                    <div className="bg-green-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {Math.ceil(
                          config.rxPdO.reduce((sum, e) => sum + e.bitLength, 0) /
                            8
                        )}
                      </div>
                      <div className="text-xs text-green-500">RxPDO (字节)</div>
                    </div>
                  </Col>
                </Row>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">XML大小</div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xl font-bold text-gray-700">
                    {(xmlContent.length / 1024).toFixed(2)} KB
                  </div>
                  <div className="text-xs text-gray-500">
                    {xmlContent.split('\n').length} 行
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default EsiGeneratorPage;
