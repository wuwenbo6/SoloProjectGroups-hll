import { ChevronRight, Clock, Hash, Layers } from 'lucide-react';
import { useAppStore, useFilteredPackets } from '../store/useAppStore';
import type { PacketSummary } from '../../shared/types';
import { getPacketTypeColor, formatFileSize } from '../utils/formatters';

interface PacketRowProps {
  packet: PacketSummary;
  isSelected: boolean;
  onSelect: (packet: PacketSummary) => void;
}

function PacketRow({ packet, isSelected, onSelect }: PacketRowProps) {
  return (
    <tr
      onClick={() => onSelect(packet)}
      className={`
        cursor-pointer transition-all duration-200 border-b border-slate-800
        ${isSelected ? 'bg-blue-500/10' : 'hover:bg-slate-800/50'}
        ${packet.index % 2 === 0 ? 'bg-slate-900/30' : ''}
      `}
    >
      <td className="px-4 py-3">
        <span className="font-mono text-sm text-slate-500">
          {packet.index.toString().padStart(4, '0')}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={`
          inline-flex items-center px-2 py-1 rounded text-xs font-medium border
          ${getPacketTypeColor(packet.type)}
        `}>
          {packet.typeName}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-slate-600" />
          <span className="font-mono text-sm text-slate-300">
            {packet.timestamp}s
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-slate-600" />
          <span className="font-mono text-sm text-slate-300">
            {formatFileSize(packet.packetLength)}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 max-w-md truncate">
        <span className="text-sm text-slate-400">
          {packet.preview}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <ChevronRight className={`w-4 h-4 ml-auto transition-transform duration-200 ${isSelected ? 'rotate-90 text-blue-400' : 'text-slate-600'}`} />
      </td>
    </tr>
  );
}

export function PacketList() {
  const packets = useFilteredPackets();
  const { selectedPacket, setSelectedPacket, parseResult } = useAppStore();

  if (!parseResult) {
    return null;
  }

  if (packets.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <Hash className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No packets match the current filter</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              #
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              Type
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              Timestamp
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              Size
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              Preview
            </th>
            <th className="px-4 py-3 w-10"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {packets.map((packet) => (
            <PacketRow
              key={packet.index}
              packet={packet}
              isSelected={selectedPacket?.index === packet.index}
              onSelect={setSelectedPacket}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
