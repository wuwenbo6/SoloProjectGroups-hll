import { SlotCard } from './SlotCard';
import type { SlotStatus } from '@/types';

interface SlotGridProps {
  slots: SlotStatus[];
  selectedSlot: number | null;
  onSlotSelect: (slot: number) => void;
}

export function SlotGrid({ slots, selectedSlot, onSlotSelect }: SlotGridProps) {
  const columns = slots.length <= 12 ? 4 : slots.length <= 16 ? 4 : slots.length <= 24 ? 6 : 8;

  const gridCols = {
    4: 'grid-cols-4',
    6: 'grid-cols-6',
    8: 'grid-cols-8',
  }[columns] || 'grid-cols-6';

  return (
    <div className="bg-dark-100 rounded-2xl p-6 border border-dark-300">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">硬盘槽位</h2>
        <div className="flex items-center gap-4 text-xs text-dark-500">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-warning" />
            <span>定位</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-danger" />
            <span>错误</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-success" />
            <span>活动</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-dark-400" />
            <span>空闲</span>
          </div>
        </div>
      </div>

      <div className={`grid ${gridCols} gap-3`}>
        {slots.map((slot) => (
          <SlotCard
            key={slot.slot}
            slot={slot}
            selected={selectedSlot === slot.slot}
            onClick={() => onSlotSelect(slot.slot)}
          />
        ))}
      </div>
    </div>
  );
}
