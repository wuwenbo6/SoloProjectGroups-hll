
import React, { useState } from 'react';
import { Card, Button, Space, Typography, Empty, Input, Select, message } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useEsiStore } from '../store/useEsiStore';
import { CoEParameter, DataType, CoEAccessType } from '../types';
import CoEParameterModal from '../components/coe/CoEParameterModal';
import CoEParameterCard from '../components/coe/CoEParameterCard';

const { Title, Text } = Typography;
const { Option } = Select;

const CoEConfigPage: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingParameter, setEditingParameter] = useState<CoEParameter | null>(null);
  const [searchText, setSearchText] = useState('');
  const [dataTypeFilter, setDataTypeFilter] = useState<string | undefined>();
  const [accessTypeFilter, setAccessTypeFilter] = useState<string | undefined>();

  const { config, addCoEParameter, removeCoEParameter, updateCoEParameter } = useEsiStore();
  const { coeParameters } = config;

  const filteredParameters = coeParameters.filter((param) => {
    const matchesSearch =
      searchText === '' ||
      param.name.toLowerCase().includes(searchText.toLowerCase()) ||
      param.index.toString(16).includes(searchText.toLowerCase()) ||
      param.description.toLowerCase().includes(searchText.toLowerCase());
    
    const matchesDataType = !dataTypeFilter || param.dataType === dataTypeFilter;
    const matchesAccessType = !accessTypeFilter || param.accessType === accessTypeFilter;
    
    return matchesSearch && matchesDataType && matchesAccessType;
  });

  const handleAdd = () => {
    setEditingParameter(null);
    setModalOpen(true);
  };

  const handleEdit = (param: CoEParameter) => {
    setEditingParameter(param);
    setModalOpen(true);
  };

  const handleDelete = (id: string) => {
    removeCoEParameter(id);
    message.success('参数已删除');
  };

  const handleModalOk = (values: Omit<CoEParameter, 'id'>) => {
    let success = true;
    
    if (editingParameter) {
      success = updateCoEParameter(editingParameter.id, values);
    } else {
      success = addCoEParameter(values);
    }
    
    if (success) {
      setModalOpen(false);
      setEditingParameter(null);
      message.success(editingParameter ? '参数已更新' : '参数已添加');
    } else {
      message.error(`该索引 (0x${values.index.toString(16).padStart(4, '0').toUpperCase()}:${values.subIndex.toString(16).padStart(2, '0').toUpperCase()}) 已存在，请使用不同的索引`);
    }
  };

  const handleModalCancel = () => {
    setModalOpen(false);
    setEditingParameter(null);
  };

  return (
    <div className="p-6">
      <Card
        className="mb-4"
        title={
          <div>
            <Title level={4} className="mb-0">
              CoE 参数配置
            </Title>
            <Text type="secondary" className="text-sm">
              配置 CANopen over EtherCAT (CoE) 对象字典参数
            </Text>
          </div>
        }
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
          >
            添加参数
          </Button>
        }
      >
        <Space direction="vertical" size="middle" className="w-full">
          <Space>
            <Input
              placeholder="搜索参数..."
              prefix={<SearchOutlined />}
              allowClear
              style={{ width: 200 }}
              onChange={(e) => setSearchText(e.target.value)}
            />
            <Select
              placeholder="按数据类型筛选"
              allowClear
              style={{ width: 150 }}
              onChange={setDataTypeFilter}
            >
              {Object.values(DataType).map((type) => (
                <Option key={type} value={type}>
                  {type}
                </Option>
              ))}
            </Select>
            <Select
              placeholder="按访问类型筛选"
              allowClear
              style={{ width: 150 }}
              onChange={setAccessTypeFilter}
            >
              <Option value={CoEAccessType.RO}>只读 (ro)</Option>
              <Option value={CoEAccessType.RW}>读写 (rw)</Option>
              <Option value={CoEAccessType.WO}>只写 (wo)</Option>
              <Option value={CoEAccessType.CONST}>常量 (const)</Option>
            </Select>
          </Space>
          
          <div className="text-sm text-gray-500">
            共 {coeParameters.length} 个参数{searchText || dataTypeFilter || accessTypeFilter ? ` (筛选: ${filteredParameters.length})` : ''}
          </div>
        </Space>
      </Card>

      <Card>
        {filteredParameters.length === 0 ? (
          <Empty
            description={
              coeParameters.length === 0
                ? '暂无CoE参数，点击"添加参数"开始配置'
                : '未找到匹配的参数'
            }
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          filteredParameters.map((param) => (
            <CoEParameterCard
              key={param.id}
              parameter={param}
              onEdit={() => handleEdit(param)}
              onDelete={() => handleDelete(param.id)}
            />
          ))
        )}
      </Card>

      <CoEParameterModal
        open={modalOpen}
        parameter={editingParameter}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
      />
    </div>
  );
};

export default CoEConfigPage;
