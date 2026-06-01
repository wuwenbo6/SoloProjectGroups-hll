
import React from 'react';
import { Card, Tag, Button, Space } from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { CoEParameter, CoEAccessType } from '../../types';

interface CoEParameterCardProps {
  parameter: CoEParameter;
  onEdit: () => void;
  onDelete: () => void;
}

const CoEParameterCard: React.FC<CoEParameterCardProps> = ({
  parameter,
  onEdit,
  onDelete,
}) => {
  const getAccessTypeColor = (accessType: CoEAccessType): string => {
    switch (accessType) {
      case CoEAccessType.RO: return 'green';
      case CoEAccessType.RW: return 'blue';
      case CoEAccessType.WO: return 'orange';
      case CoEAccessType.CONST: return 'purple';
      default: return 'default';
    }
  };

  const getDataTypeColor = (dataType: string): string => {
    if (dataType.includes('INT')) return 'cyan';
    if (dataType.includes('UINT')) return 'geekblue';
    if (dataType.includes('FLOAT')) return 'purple';
    if (dataType === 'BOOL') return 'orange';
    if (dataType === 'STRING') return 'magenta';
    return 'default';
  };

  return (
    <Card
      size="small"
      className="mb-2 hover:shadow-md transition-shadow"
      title={
        <div className="flex items-center justify-between">
          <div className="font-medium text-gray-800 truncate">
            {parameter.name}
          </div>
          <Space>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={onEdit}
            />
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={onDelete}
            />
          </Space>
        </div>
      }
    >
      <Space direction="vertical" size="small" className="w-full">
        <Space size="small" wrap>
          <Tag color="default" className="text-xs">
            0x{parameter.index.toString(16).padStart(4, '0').toUpperCase()}:
            {parameter.subIndex.toString(16).padStart(2, '0').toUpperCase()}
          </Tag>
          <Tag color={getDataTypeColor(parameter.dataType)} className="text-xs">
            {parameter.dataType}
          </Tag>
          <Tag color={getAccessTypeColor(parameter.accessType)} className="text-xs">
            {parameter.accessType}
          </Tag>
          {parameter.pdoMapping && (
            <Tag color="gold" className="text-xs">PDO</Tag>
          )}
        </Space>
        {parameter.description && (
          <div className="text-xs text-gray-400">
            {parameter.description}
          </div>
        )}
        {parameter.defaultValue !== undefined && parameter.defaultValue !== '' && (
          <div className="text-xs text-gray-500">
            默认值: {parameter.defaultValue}
          </div>
        )}
      </Space>
    </Card>
  );
};

export default CoEParameterCard;
