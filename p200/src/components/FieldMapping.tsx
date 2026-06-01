import React from 'react';
import { ChevronDown } from 'lucide-react';
import type { FieldMapping } from '../../shared/types';

interface FieldMappingProps {
  headers: string[];
  mapping: FieldMapping;
  onChange: (mapping: FieldMapping) => void;
}

const fieldLabels: Record<keyof FieldMapping, string> = {
  longitude: '经度',
  latitude: '纬度',
  rsrp: 'RSRP',
  sinr: 'SINR',
};

const fieldDescriptions: Record<keyof FieldMapping, string> = {
  longitude: '经度字段（如：lng, lon, longitude）',
  latitude: '纬度字段（如：lat, latitude）',
  rsrp: 'RSRP信号强度字段（如：rsrp, rsrp_dbm）',
  sinr: 'SINR信噪比字段（如：sinr, sinr_db）',
};

export const FieldMappingComponent: React.FC<FieldMappingProps> = ({ headers, mapping, onChange }) => {
  const handleChange = (field: keyof FieldMapping, value: string) => {
    onChange({ ...mapping, [field]: value });
  };

  return (
    <div className="card p-6 rounded-lg">
      <h3 className="text-lg font-semibold text-white mb-4">字段映射</h3>
      <p className="text-sm text-gray-400 mb-6">请选择CSV中对应的字段列</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {(Object.keys(mapping) as (keyof FieldMapping)[]).map((field) => (
          <div key={field} className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              {fieldLabels[field]}
            </label>
            <p className="text-xs text-gray-500">{fieldDescriptions[field]}</p>
            <div className="relative">
              <select
                value={mapping[field]}
                onChange={(e) => handleChange(field, e.target.value)}
                className="select-field w-full pr-10 appearance-none"
              >
                <option value="">请选择字段...</option>
                {headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
