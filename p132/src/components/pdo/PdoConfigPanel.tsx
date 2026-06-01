
import React, { useState } from 'react';
import { Card, Button, Space, Typography, Progress, Empty, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { PdoEntry, PdoType } from '../../types';
import { useEsiStore, usePdoTotalBits } from '../../store/useEsiStore';
import PdoEntryCard from './PdoEntryCard';
import PdoEntryModal from './PdoEntryModal';

const { Title, Text } = Typography;

interface PdoConfigPanelProps {
  type: PdoType;
  title: string;
  description: string;
  color: string;
}

const PdoConfigPanel: React.FC<PdoConfigPanelProps> = ({
  type,
  title,
  description,
  color,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PdoEntry | null>(null);
  const entries = useEsiStore((state) =>
    type === 'TxPDO' ? state.config.txPdO : state.config.rxPdO
  );
  const { addPdoEntry, removePdoEntry, updatePdoEntry, reorderPdoEntries } =
    useEsiStore();
  const totalBits = usePdoTotalBits(type);
  const maxBits = 128 * 8;
  const progressPercent = Math.min((totalBits / maxBits) * 100, 100);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = entries.findIndex((e) => e.id === active.id);
      const newIndex = entries.findIndex((e) => e.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderPdoEntries(type, oldIndex, newIndex);
      }
    }
  };

  const handleAdd = () => {
    setEditingEntry(null);
    setModalOpen(true);
  };

  const handleEdit = (entry: PdoEntry) => {
    setEditingEntry(entry);
    setModalOpen(true);
  };

  const handleDelete = (id: string) => {
    removePdoEntry(type, id);
  };

  const handleModalOk = (values: Omit<PdoEntry, 'id'>) => {
    let success = true;
    
    if (editingEntry) {
      success = updatePdoEntry(type, editingEntry.id, values);
    } else {
      success = addPdoEntry(type, values);
    }
    
    if (success) {
      setModalOpen(false);
      setEditingEntry(null);
    } else {
      message.error(`该索引 (0x${values.index.toString(16).padStart(4, '0').toUpperCase()}:${values.subIndex.toString(16).padStart(2, '0').toUpperCase()}) 已存在于${type}中，请使用不同的索引`);
    }
  };

  const handleModalCancel = () => {
    setModalOpen(false);
    setEditingEntry(null);
  };

  const getProgressStatus = () => {
    if (progressPercent > 90) return 'exception';
    if (progressPercent > 70) return 'normal';
    return 'success';
  };

  return (
    <Card
      className="h-full"
      title={
        <div className="flex items-center justify-between">
          <div>
            <Title level={4} className="mb-0" style={{ color }}>
              {title}
            </Title>
            <Text type="secondary" className="text-sm">
              {description}
            </Text>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
            style={{ backgroundColor: color }}
          >
            添加条目
          </Button>
        </div>
      }
      extra={
        <Space direction="vertical" size="small" className="w-48">
          <div className="text-sm text-gray-500">
            总大小: {totalBits} bit ({Math.ceil(totalBits / 8)} byte)
          </div>
          <Progress
            percent={Math.round(progressPercent)}
            size="small"
            status={getProgressStatus()}
            showInfo={false}
          />
        </Space>
      }
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
          {entries.length === 0 ? (
            <Empty
              description="暂无PDO条目"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            entries.map((entry) => (
              <PdoEntryCard
                key={entry.id}
                entry={entry}
                onEdit={() => handleEdit(entry)}
                onDelete={() => handleDelete(entry.id)}
              />
            ))
          )}
        </SortableContext>
      </DndContext>

      <PdoEntryModal
        open={modalOpen}
        entry={editingEntry}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
      />
    </Card>
  );
};

export default PdoConfigPanel;
