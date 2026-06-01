
import React from 'react';
import { Card, Tag, Button, Space } from 'antd';
import { EditOutlined, DeleteOutlined, MenuOutlined } from '@ant-design/icons';
import { PdoEntry } from '../../types';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface PdoEntryCardProps {
  entry: PdoEntry;
  onEdit: () => void;
  onDelete: () => void;
  isDragging?: boolean;
}

const PdoEntryCard: React.FC<PdoEntryCardProps> = ({
  entry,
  onEdit,
  onDelete,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
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
      ref={setNodeRef}
      style={style}
      size="small"
      className="mb-2 cursor-move hover:shadow-md transition-shadow"
      actions={[
        <Button
          type="text"
          icon={<EditOutlined />}
          onClick={onEdit}
          size="small"
        />,
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={onDelete}
          size="small"
        />,
      ]}
    >
      <div className="flex items-center gap-2">
        <div {...attributes} {...listeners} className="cursor-grab text-gray-400">
            <MenuOutlined />
          </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-800 truncate">
            {entry.name}
          </div>
          <Space size="small" className="mt-1">
            <Tag color="default" className="text-xs">
              0x{entry.index.toString(16).padStart(4, '0').toUpperCase()}:
              {entry.subIndex.toString(16).padStart(2, '0').toUpperCase()}
            </Tag>
            <Tag color={getDataTypeColor(entry.dataType)} className="text-xs">
              {entry.dataType}
            </Tag>
            <Tag color="gray" className="text-xs">
              {entry.bitLength} bit
            </Tag>
          </Space>
        </div>
      </div>
    </Card>
  );
};

export default PdoEntryCard;
