import React, { useMemo, useState } from 'react';
import { Phone, Users, Database, Signal, ChevronUp, ChevronDown, Volume2, FolderOpen } from 'lucide-react';
import { useDmrStore } from '@/store/useDmrStore';
import { CALL_TYPE_COLORS, CALL_TYPE_LABELS } from '@/types';
import { formatTime, formatDuration, formatId } from '@/utils/format';
import type { TimeSlotOccupancy, DmrSlot, CallType } from '@/types';

type SortField = 'startTime' | 'duration' | 'slot' | 'callType' | 'talkgroupId';
type SortOrder = 'asc' | 'desc';

export const CallList: React.FC = () => {
  const { result, selectedCallType, selectedSlot } = useDmrStore();
  const [sortField, setSortField] = useState<SortField>('startTime');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const filteredCalls = useMemo(() => {
    if (!result) return [];

    let calls = [...result.timeSlots];

    if (selectedCallType !== 'all') {
      calls = calls.filter((c) => c.callType === selectedCallType);
    }
    if (selectedSlot !== 'all') {
      calls = calls.filter((c) => c.slot === selectedSlot);
    }

    calls.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'startTime':
          cmp = a.startTime - b.startTime;
          break;
        case 'duration':
          cmp = a.duration - b.duration;
          break;
        case 'slot':
          cmp = a.slot - b.slot;
          break;
        case 'callType':
          cmp = a.callType.localeCompare(b.callType);
          break;
        case 'talkgroupId':
          cmp = (a.talkgroupId || 0) - (b.talkgroupId || 0);
          break;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return calls;
  }, [result, selectedCallType, selectedSlot, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  if (!result) {
    return (
      <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-200 mb-4">呼叫详情列表</h2>
        <div className="h-64 flex items-center justify-center text-gray-500">
          导入并分析文件后显示呼叫详情
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-200">呼叫详情列表</h2>
        <span className="text-sm text-gray-500">
          共 {filteredCalls.length} 条呼叫记录
        </span>
      </div>

      <div className="overflow-auto max-h-96 rounded-lg border border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-700/50 sticky top-0">
            <tr>
              <SortableHeader
                label="时隙"
                field="slot"
                currentField={sortField}
                order={sortOrder}
                onClick={handleSort}
                className="w-16"
              />
              <SortableHeader
                label="类型"
                field="callType"
                currentField={sortField}
                order={sortOrder}
                onClick={handleSort}
              />
              <SortableHeader
                label="通话组"
                field="talkgroupId"
                currentField={sortField}
                order={sortOrder}
                onClick={handleSort}
                className="w-24"
              />
              <SortableHeader
                label="开始时间"
                field="startTime"
                currentField={sortField}
                order={sortOrder}
                onClick={handleSort}
              />
              <SortableHeader
                label="时长"
                field="duration"
                currentField={sortField}
                order={sortOrder}
                onClick={handleSort}
              />
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                源 ID
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                语音文件
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50">
            {filteredCalls.map((call, index) => (
              <CallRow key={index} call={call} />
            ))}
          </tbody>
        </table>

        {filteredCalls.length === 0 && (
          <div className="py-12 text-center text-gray-500">
            没有匹配的呼叫记录
          </div>
        )}
      </div>
    </div>
  );
};

interface SortableHeaderProps {
  label: string;
  field: SortField;
  currentField: SortField;
  order: SortOrder;
  onClick: (field: SortField) => void;
  className?: string;
}

const SortableHeader: React.FC<SortableHeaderProps> = ({
  label,
  field,
  currentField,
  order,
  onClick,
  className = '',
}) => {
  const isActive = currentField === field;

  return (
    <th
      className={`px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-300 select-none ${className}`}
      onClick={() => onClick(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {isActive && (
          order === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        )}
      </div>
    </th>
  );
};

const CallRow: React.FC<{ call: TimeSlotOccupancy }> = ({ call }) => {
  const getCallIcon = (type: CallType) => {
    switch (type) {
      case 'group_voice':
      case 'private_voice':
        return <Phone className="w-4 h-4" />;
      case 'group_data':
      case 'private_data':
        return <Database className="w-4 h-4" />;
      case 'csbk':
        return <Signal className="w-4 h-4" />;
      default:
        return <Users className="w-4 h-4" />;
    }
  };

  return (
    <tr className="hover:bg-gray-700/30 transition-colors">
      <td className="px-4 py-3">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-700 text-xs font-mono text-cyan-400">
          {call.slot}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div
            className="p-1.5 rounded-md"
            style={{ backgroundColor: `${CALL_TYPE_COLORS[call.callType]}20` }}
          >
            <span style={{ color: CALL_TYPE_COLORS[call.callType] }}>
              {getCallIcon(call.callType)}
            </span>
          </div>
          <span className="text-gray-300">{CALL_TYPE_LABELS[call.callType]}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        {call.talkgroupId ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-purple-900/30 text-purple-300 font-mono text-xs">
            <Users className="w-3 h-3" />
            TG{call.talkgroupId}
          </span>
        ) : (
          <span className="text-gray-600 text-xs">-</span>
        )}
      </td>
      <td className="px-4 py-3 font-mono text-gray-400">
        {formatTime(call.startTime)}
      </td>
      <td className="px-4 py-3 font-mono text-gray-400">
        {formatDuration(call.duration)}
      </td>
      <td className="px-4 py-3 font-mono text-gray-400">
        {formatId(call.sourceId)}
      </td>
      <td className="px-4 py-3">
        {call.voiceFile ? (
          <button
            onClick={() => window.electronAPI.openVoiceFile(call.voiceFile!)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-900/30 text-green-400 hover:bg-green-900/50 transition-colors text-xs"
          >
            <Volume2 className="w-3 h-3" />
            播放
          </button>
        ) : (
          <span className="text-gray-600 text-xs">-</span>
        )}
      </td>
    </tr>
  );
};
