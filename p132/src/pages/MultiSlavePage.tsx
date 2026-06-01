
import React, { useState } from 'react';
import {
  Card,
  Button,
  Space,
  Typography,
  List,
  Input,
  Modal,
  message,
  Popconfirm,
  Tag,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
  ExportOutlined,
  EditOutlined,
  FileZipOutlined,
  MergeCellsOutlined,
} from '@ant-design/icons';
import { useMultiSlaveStore, useEsiStore } from '../store/useEsiStore';
import { EsiConfig, defaultEsiConfig } from '../types';
import { exportMultiSlaveProject, exportSlaveAsZip } from '../services/zipExportService';

const { Title, Text } = Typography;

const MultiSlavePage: React.FC = () => {
  const { project, activeSlaveId, addSlave, removeSlave, setActiveSlave, setProjectName, setProjectDescription } = useMultiSlaveStore();
  const { loadConfig, resetConfig } = useEsiStore();
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState(project.name);

  const handleAddSlave = () => {
    addSlave();
    message.success('已添加新从站');
  };

  const handleDeleteSlave = (id: string) => {
    removeSlave(id);
    message.success('从站已删除');
  };

  const handleSelectSlave = (id: string) => {
    const slave = project.slaves.find((s) => s.id === id);
    if (slave) {
      loadConfig(slave);
      setActiveSlave(id);
      message.info(`已加载从站: ${slave.slaveInfo.slaveName}`);
    }
  };

  const handleExportSingle = async (config: EsiConfig) => {
    try {
      await exportSlaveAsZip(config);
      message.success('已导出单从站ZIP');
    } catch (err) {
      message.error('导出失败');
    }
  };

  const handleExportAll = async () => {
    if (project.slaves.length === 0) {
      message.warning('没有从站可导出');
      return;
    }
    try {
      await exportMultiSlaveProject(project);
      message.success('已导出多从站ZIP');
    } catch (err) {
      message.error('导出失败');
    }
  };

  const handleMergeSlaves = () => {
    if (project.slaves.length < 2) {
      message.warning('至少需要2个从站才能合并');
      return;
    }
    Modal.confirm({
      title: '合并从站配置',
      content: '将所有从站的PDO和CoE参数合并到第一个从站，其他从站将被移除。此操作不可撤销。',
      okText: '确认合并',
      cancelText: '取消',
      onOk: () => {
        const [first, ...rest] = project.slaves;
        const mergedConfig: EsiConfig = {
          ...first,
          txPdO: [...first.txPdO],
          rxPdO: [...first.rxPdO],
          coeParameters: [...first.coeParameters],
        };
        
        rest.forEach((slave) => {
          slave.txPdO.forEach((entry) => {
            const exists = mergedConfig.txPdO.some(
              (e) => e.index === entry.index && e.subIndex === entry.subIndex
            );
            if (!exists) mergedConfig.txPdO.push({ ...entry });
          });
          
          slave.rxPdO.forEach((entry) => {
            const exists = mergedConfig.rxPdO.some(
              (e) => e.index === entry.index && e.subIndex === entry.subIndex
            );
            if (!exists) mergedConfig.rxPdO.push({ ...entry });
          });
          
          slave.coeParameters.forEach((param) => {
            const exists = mergedConfig.coeParameters.some(
              (p) => p.index === param.index && p.subIndex === param.subIndex
            );
            if (!exists) mergedConfig.coeParameters.push({ ...param });
          });
        });
        
        removeSlave(rest[0].id);
        loadConfig(mergedConfig);
        message.success('已合并从站配置');
      },
    });
  };

  const handleSaveCurrentToSlave = () => {
    const { config } = useEsiStore.getState();
    if (activeSlaveId) {
      const { updateSlave } = useMultiSlaveStore.getState();
      updateSlave(activeSlaveId, config);
      message.success('已保存当前配置到从站');
    }
  };

  return (
    <div className="p-6">
      <Card
        className="mb-4"
        title={
          <div>
            {editingName ? (
              <Input
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onPressEnter={() => {
                  setProjectName(tempName);
                  setEditingName(false);
                }}
                onBlur={() => {
                  setProjectName(tempName);
                  setEditingName(false);
                }}
                style={{ width: 300 }}
                autoFocus
              />
            ) : (
              <div
                onClick={() => {
                  setTempName(project.name);
                  setEditingName(true);
                }}
                className="cursor-pointer hover:text-blue-500"
              >
                <Title level={4} className="mb-0">
                  {project.name}
                </Title>
              </div>
            )}
            <Text type="secondary" className="text-sm">
              多从站管理 - 管理多个EtherCAT从站配置
            </Text>
          </div>
        }
        extra={
          <Space>
            <Button
              icon={<MergeCellsOutlined />}
              onClick={handleMergeSlaves}
              disabled={project.slaves.length < 2}
            >
              合并从站
            </Button>
            <Button
              type="primary"
              icon={<FileZipOutlined />}
              onClick={handleExportAll}
              disabled={project.slaves.length === 0}
            >
              导出全部ZIP
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" size="middle" className="w-full">
          <Input.TextArea
            rows={2}
            placeholder="项目描述（可选）"
            value={project.description}
            onChange={(e) => setProjectDescription(e.target.value)}
          />
          
          <div className="flex justify-between items-center">
            <Text>
              从站数量: <Tag color="blue">{project.slaves.length}</Tag>
            </Text>
            <Space>
              {activeSlaveId && (
                <Button onClick={handleSaveCurrentToSlave}>
                  保存当前配置到从站
                </Button>
              )}
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddSlave}
              >
                添加从站
              </Button>
            </Space>
          </div>
        </Space>
      </Card>

      <Card
        title={
          <div>
            <Title level={5} className="mb-0">
              从站列表
            </Title>
            <Text type="secondary" className="text-xs">
              点击从站可加载其配置进行编辑
            </Text>
          </div>
        }
      >
        {project.slaves.length === 0 ? (
          <div className="text-center py-8">
            <Text type="secondary">暂无从站，点击"添加从站"开始配置</Text>
          </div>
        ) : (
          <List
            dataSource={project.slaves}
            renderItem={(slave, index) => (
              <List.Item
                key={slave.id}
                className={activeSlaveId === slave.id ? 'bg-blue-50 rounded' : 'hover:bg-gray-50 rounded'}
                style={{
                  border: activeSlaveId === slave.id ? '1px solid #1890ff' : '1px solid #f0f0f0',
                  borderRadius: 8,
                  marginBottom: 8,
                  padding: 16,
                }}
              >
                <div className="w-full">
                  <div className="flex justify-between items-start">
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => handleSelectSlave(slave.id)}
                    >
                      <div className="flex items-center gap-2">
                        <Tag color={activeSlaveId === slave.id ? 'blue' : 'default'}>
                          #{index + 1}
                        </Tag>
                        <Text strong>{slave.slaveInfo.slaveName}</Text>
                        {activeSlaveId === slave.id && (
                          <Tag color="green">当前编辑中</Tag>
                        )}
                      </div>
                      <Space size="small" className="mt-2" wrap>
                        <Tag color="default">
                          VID: {slave.slaveInfo.vendorId}
                        </Tag>
                        <Tag color="default">
                          PID: {slave.slaveInfo.productCode}
                        </Tag>
                        <Tag color="green">
                          TxPDO: {slave.txPdO.length}
                        </Tag>
                        <Tag color="orange">
                          RxPDO: {slave.rxPdO.length}
                        </Tag>
                        <Tag color="purple">
                          CoE: {slave.coeParameters.length}
                        </Tag>
                      </Space>
                    </div>
                    <Space>
                      <Tooltip title="导出此从站">
                        <Button
                          icon={<ExportOutlined />}
                          size="small"
                          onClick={() => handleExportSingle(slave)}
                        />
                      </Tooltip>
                      <Popconfirm
                        title="确定删除此从站？"
                        onConfirm={() => handleDeleteSlave(slave.id)}
                      >
                        <Button
                          icon={<DeleteOutlined />}
                          size="small"
                          danger
                        />
                      </Popconfirm>
                    </Space>
                  </div>
                </div>
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  );
};

export default MultiSlavePage;
