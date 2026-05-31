import { useState } from 'react';
import { Palette, Layers, ChevronDown, ChevronUp } from 'lucide-react';
import { useSceneStore } from '../store/useSceneStore';
import type { MaterialConfig } from '../../shared/types';

export function MaterialEditor() {
  const { currentScene, selectedMaterial, setSelectedMaterial, updateMaterial } = useSceneStore();
  const [expanded, setExpanded] = useState(true);

  const materials = currentScene?.materials || [];

  const handleMaterialChange = (id: string, field: keyof MaterialConfig, value: number | string) => {
    updateMaterial(id, { [field]: value });
  };

  return (
    <div className="w-72 bg-[#0d0d14] border-r border-cyan-500/20 flex flex-col h-full">
      <div 
        className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/20 cursor-pointer hover:bg-cyan-500/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-white">材质编辑器</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </div>

      {expanded && (
        <div className="flex-1 overflow-y-auto">
          {materials.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Layers className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-xs text-gray-500">加载模型后可编辑材质</p>
            </div>
          ) : (
            <div className="divide-y divide-cyan-500/10">
              {materials.map((material) => (
                <MaterialItem
                  key={material.id}
                  material={material}
                  isSelected={selectedMaterial?.id === material.id}
                  onSelect={() => setSelectedMaterial(material)}
                  onChange={(field, value) => handleMaterialChange(material.id, field, value)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface MaterialItemProps {
  material: MaterialConfig;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (field: keyof MaterialConfig, value: number | string) => void;
}

function MaterialItem({ material, isSelected, onSelect, onChange }: MaterialItemProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`${isSelected ? 'bg-cyan-500/10' : ''}`}>
      <div 
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-cyan-500/5 transition-colors"
        onClick={() => { onSelect(); setExpanded(!expanded); }}
      >
        <div className="flex items-center gap-3">
          <div 
            className="w-6 h-6 rounded-full border-2 border-gray-600"
            style={{ backgroundColor: material.color }}
          />
          <span className="text-sm text-white truncate max-w-32">{material.name}</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-400">颜色</label>
              <input
                type="color"
                value={material.color}
                onChange={(e) => onChange('color', e.target.value)}
                className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-400">金属度</label>
              <span className="text-xs text-cyan-400 font-mono w-12 text-right">
                {material.metalness.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={material.metalness}
              onChange={(e) => onChange('metalness', parseFloat(e.target.value))}
              className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-cyan-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-400">粗糙度</label>
              <span className="text-xs text-cyan-400 font-mono w-12 text-right">
                {material.roughness.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={material.roughness}
              onChange={(e) => onChange('roughness', parseFloat(e.target.value))}
              className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-orange-500"
            />
          </div>
        </div>
      )}
    </div>
  );
}
