
import React, { useState, useEffect, useRef } from 'react';
import {
  Card,
  Button,
  Space,
  Typography,
  List,
  Tag,
  Modal,
  Form,
  Input,
  message,
  Popconfirm,
  Row,
  Col,
  Statistic,
  Empty,
  Spin,
  Tooltip,
  Upload,
} from 'antd';
import {
  SaveOutlined,
  FolderOpenOutlined,
  DeleteOutlined,
  DownloadOutlined,
  UploadOutlined,
  PlusOutlined,
  DatabaseOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { ConfigTemplate } from '../types';
import { useEsiStore } from '../store/useEsiStore';
import {
  getAllTemplates,
  saveTemplate,
  deleteTemplate,
  exportTemplates,
  importTemplates,
  downloadTemplateFile,
  createSampleTemplates,
} from '../services/templateService';

const { Title, Paragraph, Text } = Typography;
const { TextArea } = Input;

const TemplateManagerPage: React.FC = () => {
  const navigate = useNavigate();
  const { config, loadTemplate } = useEsiStore();
  const [templates, setTemplates] = useState<ConfigTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [saveForm] = Form.useForm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadTemplates();
    initSampleData();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await getAllTemplates();
      setTemplates(data);
    } catch (err) {
      message.error('加载模板失败');
    } finally {
      setLoading(false);
    }
  };

  const initSampleData = async () => {
    try {
      await createSampleTemplates();
      await loadTemplates();
    } catch (err) {
      console.error('Failed to create sample templates:', err);
    }
  };

  const handleSaveTemplate = async () => {
    try {
      const values = await saveForm.validateFields();
      setSaving(true);
      await saveTemplate(values.name, values.description, config);
      message.success('模板保存成功！');
      setSaveModalOpen(false);
      saveForm.resetFields();
      await loadTemplates();
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleLoadTemplate = (template: ConfigTemplate) => {
    loadTemplate(template);
    message.success(`已加载模板: ${template.name}`);
    navigate('/');
  };

  const handleDeleteTemplate = async (id: string, name: string) => {
    try {
      await deleteTemplate(id);
      message.success(`已删除模板: ${name}`);
      await loadTemplates();
    } catch (err) {
      message.error('删除失败');
    }
  };

  const handleExportAll = async () => {
    try {
      const json = await exportTemplates();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `esi-templates-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      message.success('导出成功！');
    } catch (err) {
      message.error('导出失败');
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const imported = await importTemplates(text);
      message.success(`成功导入 ${imported.length} 个模板！`);
      await loadTemplates();
    } catch (err) {
      message.error('导入失败，请检查文件格式');
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <Title level={3} className="mb-2">
          模板管理
        </Title>
        <Paragraph type="secondary" className="mb-0">
          管理您的EtherCAT配置模板，支持保存、加载、导入和导出操作。
          模板数据保存在浏览器本地IndexedDB数据库中。
        </Paragraph>
      </Card>

      <Card
        title={
          <div className="flex items-center gap-2">
            <DatabaseOutlined />
            <span>模板库</span>
          </div>
        }
        extra={
          <Space>
            <Button
              icon={<SaveOutlined />}
              onClick={() => setSaveModalOpen(true)}
            >
              保存当前配置
            </Button>
            <Button icon={<UploadOutlined />} onClick={handleImportClick}>
              导入
            </Button>
            <Button icon={<DownloadOutlined />} onClick={handleExportAll}>
              导出全部
            </Button>
          </Space>
        }
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spin size="large" />
          </div>
        ) : templates.length === 0 ? (
          <Empty
            description="暂无模板"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setSaveModalOpen(true)}
            >
              创建第一个模板
            </Button>
          </Empty>
        ) : (
          <Row gutter={[16, 16]}>
            {templates.map((template) => (
              <Col xs={24} md={12} lg={8} key={template.id}>
                <Card
                  size="small"
                  hoverable
                  className="h-full"
                  title={
                    <div className="flex items-center gap-2">
                      <SettingOutlined className="text-blue-500" />
                      <span className="font-medium truncate">
                        {template.name}
                      </span>
                    </div>
                  }
                  extra={
                    <Space size="small">
                      <Tooltip title="加载模板">
                        <Button
                          type="text"
                          size="small"
                          icon={<FolderOpenOutlined />}
                          onClick={() => handleLoadTemplate(template)}
                        />
                      </Tooltip>
                      <Popconfirm
                        title="确定删除此模板？"
                        description="删除后无法恢复"
                        onConfirm={() =>
                          handleDeleteTemplate(template.id, template.name)
                        }
                        okText="确定"
                        cancelText="取消"
                      >
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                        />
                      </Popconfirm>
                    </Space>
                  }
                >
                  <div className="space-y-2">
                    <Text type="secondary" className="text-xs">
                      {template.description || '暂无描述'}
                    </Text>
                    <div className="flex gap-2">
                      <Tag color="blue" className="text-xs">
                        Tx: {template.config.txPdO.length}
                      </Tag>
                      <Tag color="green" className="text-xs">
                        Rx: {template.config.rxPdO.length}
                      </Tag>
                    </div>
                    <div className="text-xs text-gray-400">
                      更新于: {formatDate(template.updatedAt)}
                    </div>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Card>

      <Row gutter={16}>
        <Col span={8}>
          <Card>
            <Statistic
              title="模板总数"
              value={templates.length}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="当前配置PDO数"
              value={config.txPdO.length + config.rxPdO.length}
              prefix={<SettingOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="存储空间"
              value="IndexedDB"
              valueStyle={{ fontSize: '16px' }}
            />
          </Card>
        </Col>
      </Row>

      <Modal
        title="保存为模板"
        open={saveModalOpen}
        onOk={handleSaveTemplate}
        onCancel={() => {
          setSaveModalOpen(false);
          saveForm.resetFields();
        }}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
      >
        <Form form={saveForm} layout="vertical">
          <Form.Item
            name="name"
            label="模板名称"
            rules={[{ required: true, message: '请输入模板名称' }]}
          >
            <Input placeholder="例如: 数字IO模块配置" />
          </Form.Item>
          <Form.Item name="description" label="模板描述">
            <TextArea rows={3} placeholder="描述此模板的用途..." />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="导入模板"
        open={importing}
        footer={null}
        closable={false}
      >
        <div className="text-center py-8">
          <Spin size="large" />
          <div className="mt-4">正在导入...</div>
        </div>
      </Modal>
    </div>
  );
};

export default TemplateManagerPage;
