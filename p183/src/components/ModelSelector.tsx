import React from 'react';
import { Cpu, Radio, Zap } from 'lucide-react';
import { useFitStore } from '../store/useFitStore';
import { MODEL_LABELS, MODEL_DESCRIPTIONS, ModelType } from '../../shared/types';

const MODEL_ICONS: Record<ModelType, React.ReactNode> = {
  diode: <Zap className="w-5 h-5" />,
  bjt: <Radio className="w-5 h-5" />,
  mosfet: <Cpu className="w-5 h-5" />,
};

const ModelSelector: React.FC = () => {
  const { modelType, setModelType } = useFitStore();

  const models: ModelType[] = ['diode', 'bjt', 'mosfet'];

  return (
    <div className="space-y-3">
      {models.map((type) => (
        <button
          key={type}
          onClick={() => setModelType(type)}
          className={`w-full flex items-center space-x-3 p-3 rounded-xl border-2 transition-all duration-200 ${
            modelType === type
              ? 'border-emerald-500 bg-emerald-50 shadow-sm'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            modelType === type
              ? 'bg-emerald-100 text-emerald-600'
              : 'bg-slate-100 text-slate-500'
          }`}>
            {MODEL_ICONS[type]}
          </div>
          <div className="flex-1 text-left">
            <p className={`font-medium ${
              modelType === type ? 'text-emerald-700' : 'text-slate-700'
            }`}>
              {MODEL_LABELS[type]}
            </p>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              {MODEL_DESCRIPTIONS[type]}
            </p>
          </div>
          {modelType === type && (
            <div className="w-3 h-3 bg-emerald-500 rounded-full flex-shrink-0" />
          )}
        </button>
      ))}
    </div>
  );
};

export default ModelSelector;
