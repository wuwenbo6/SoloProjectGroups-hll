
import React, { useState, useMemo } from 'react';
import {
  Card,
  Input,
  Select,
  List,
  Tag,
  Button,
  Space,
  Typography,
  Divider,
  Tooltip,
  message,
} from 'antd';
import { SearchOutlined, PlusOutlined } from '@ant-design/icons';
import { ObjectDictionaryItem, DataType, PdoType } from '../../types';
import { objectDictionary } from '../../data/objectDictionary';
import { useEsiStore } from '../../store/useEsiStore';

const { Title, Text } = Typography;
const { Search } = Input;
const { Option } = Select;

const ObjectDictionarySelector: React.FC = () => {
  const [searchText, setSearchText] = useState('');
  const [dataTypeFilter, setDataTypeFilter] = useState<string | undefined>();
  const { addPdoEntry } = useEsiStore();

  const filteredItems = useMemo(() => {
    return objectDictionary.filter((item) => {
      const matchesSearch =
        searchText === '' ||
        item.name.toLowerCase().includes(searchText.toLowerCase()) ||
        item.index.toString(16).includes(searchText.toLowerCase()) ||
        item.description.toLowerCase().includes(searchText.toLowerCase());
      const matchesDataType =
        !dataTypeFilter || item.dataType === dataTypeFilter;
      return matchesSearch && matchesDataType;
    });
  }, [searchText, dataTypeFilter]);

  const handleAddToTxPDO = (item: ObjectDictionaryItem, type: PdoType) => {
    const success = addPdoEntry(type, {
      index: item.index,
      subIndex: item.subIndex,
      name: item.name,
      dataType: item.dataType,
      bitLength: item.dataType === 'BOOL' ? 1 :
                item.dataType.includes('8') ? 8 :
                item.dataType.includes('16') ? 16 :
                item.dataType.includes('32') ? 32 :
                item.dataType.includes('64') ? 64 : 16,
    });
    
    if (!success) {
      message.warning(`该对象 (0x${item.index.toString(16).padStart(4, '0').toUpperCase()}:${item.subIndex.toString(16).padStart(2, '0').toUpperCase()}) 已存在于${type}中`);
    }
  };

  const getDataTypeColor = (dataType: string): string => {
    if (dataType.includes('INT')) return 'blue';
    if (dataType.includes('UINT')) return 'green';
    if (dataType.includes('FLOAT')) return 'purple';
    if (dataType === 'BOOL') return 'orange';
    if (dataType === 'STRING') return 'cyan';
    return 'default';
  };

  return (
    <Card
      className="h-full"
      title={
        <div>
          <Title level={4} className="mb-0">
            对象字典
          </Title>
          <Text type="secondary" className="text-sm">
            从预定义对象中快速添加PDO条目
          </Text>
        </div>
      }
    >
      <Space direction="vertical" className="w-full" size="middle">
        <Search
          placeholder="搜索对象..."
          prefix={<SearchOutlined />}
          allowClear
          onChange={(e) => setSearchText(e.target.value)}
        />
        <Select
          placeholder="按数据类型筛选"
          allowClear
          className="w-full"
          onChange={setDataTypeFilter}
        >
          {Object.values(DataType).map((type) => (
            <Option key={type} value={type}>
              {type}
            </Option>
          ))}
        </Select>
      </Space>

      <Divider className="my-3" />

      <div className="max-h-[500px] overflow-y-auto pr-2">
        <List
          dataSource={filteredItems}
          locale={{ emptyText: '未找到匹配的对象' }}
          renderItem={(item) => (
            <List.Item
              key={`${item.index}-${item.subIndex}`}
              className="px-2 hover:bg-gray-50 rounded transition-colors"
            >
              <div className="w-full">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800">{item.name}</div>
                    <Space size="small" className="mt-1">
                      <Tag color="default" className="text-xs">
                        0x{item.index.toString(16).padStart(4, '0').toUpperCase()}:
                        {item.subIndex.toString(16).padStart(2, '0').toUpperCase()}
                      </Tag>
                      <Tag color={getDataTypeColor(item.dataType)} className="text-xs">
                        {item.dataType}
                      </Tag>
                    </Space>
                    <div className="text-xs text-gray-400 mt-1">
                      {item.description}
                    </div>
                  </div>
                  <Space size="small">
                    <Tooltip title="添加到TxPDO">
                      <Button
                        type="text"
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={() => handleAddToTxPDO(item, 'TxPDO')}
                      >
                        Tx
                      </Button>
                    </Tooltip>
                    <Tooltip title="添加到RxPDO">
                      <Button
                        type="text"
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={() => handleAddToTxPDO(item, 'RxPDO')}
                      >
                        Rx
                      </Button>
                    </Tooltip>
                  </Space>
                </div>
              </div>
            </List.Item>
          )}
        />
      </div>
    </Card>
  );
};

export default ObjectDictionarySelector;
