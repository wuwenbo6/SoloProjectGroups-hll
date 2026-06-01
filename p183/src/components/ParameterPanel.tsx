import React, { useCallback } from 'react';
import { Zap, Activity, Target, TrendingUp, Copy, Check, Download } from 'lucide-react';
import { useFitStore } from '../store/useFitStore';
import { DiodeParameters, BJTParameters, MOSFETParameters, ModelType } from '../../shared/types';

const formatScientific = (value: number): string => {
  if (value === 0) return '0';
  if (Math.abs(value) >= 1000 || Math.abs(value) < 0.01) {
    return value.toExponential(4);
  }
  return value.toFixed(6);
};

const formatPercentage = (value: number): string => {
  return (value * 100).toFixed(4);
};

interface ParamRowProps {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  sublabel: string;
  value: string;
}

const ParamRow: React.FC<ParamRowProps> = ({ icon, iconBg, iconColor, label, sublabel, value }) => (
  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
    <div className="flex items-center space-x-3">
      <div className={`w-10 h-10 ${iconBg} rounded-lg flex items-center justify-center`}>
        <span className={iconColor}>{icon}</span>
      </div>
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-xs text-slate-400">{sublabel}</p>
      </div>
    </div>
    <p className="text-xl font-mono font-semibold text-slate-800">{value}</p>
  </div>
);

function DiodeParams({ params }: { params: DiodeParameters }) {
  return (
    <>
      <ParamRow
        icon={<Zap className="w-5 h-5" />}
        iconBg="bg-emerald-100"
        iconColor="text-emerald-600"
        label="反向饱和电流 IS"
        sublabel="Saturation Current"
        value={`${formatScientific(params.IS)} A`}
      />
      <ParamRow
        icon={<Activity className="w-5 h-5" />}
        iconBg="bg-blue-100"
        iconColor="text-blue-600"
        label="发射系数 N"
        sublabel="Emission Coefficient"
        value={params.N.toFixed(4)}
      />
    </>
  );
}

function BJTParams({ params }: { params: BJTParameters }) {
  return (
    <>
      <ParamRow
        icon={<Zap className="w-5 h-5" />}
        iconBg="bg-emerald-100"
        iconColor="text-emerald-600"
        label="传输饱和电流 IS"
        sublabel="Transport Saturation Current"
        value={`${formatScientific(params.IS)} A`}
      />
      <ParamRow
        icon={<Activity className="w-5 h-5" />}
        iconBg="bg-blue-100"
        iconColor="text-blue-600"
        label="正向电流增益 BF"
        sublabel="Forward Current Gain"
        value={params.BF.toFixed(2)}
      />
      <ParamRow
        icon={<Target className="w-5 h-5" />}
        iconBg="bg-amber-100"
        iconColor="text-amber-600"
        label="正向发射系数 NF"
        sublabel="Forward Emission Coefficient"
        value={params.NF.toFixed(4)}
      />
      {params.VAF !== undefined && (
        <ParamRow
          icon={<TrendingUp className="w-5 h-5" />}
          iconBg="bg-purple-100"
          iconColor="text-purple-600"
          label="正向Early电压 VAF"
          sublabel="Forward Early Voltage"
          value={`${formatScientific(params.VAF)} V`}
        />
      )}
    </>
  );
}

function MOSFETParams({ params }: { params: MOSFETParameters }) {
  return (
    <>
      <ParamRow
        icon={<Activity className="w-5 h-5" />}
        iconBg="bg-emerald-100"
        iconColor="text-emerald-600"
        label="跨导参数 KP"
        sublabel="Transconductance Parameter"
        value={`${formatScientific(params.KP)} A/V²`}
      />
      <ParamRow
        icon={<Target className="w-5 h-5" />}
        iconBg="bg-blue-100"
        iconColor="text-blue-600"
        label="阈值电压 VTO"
        sublabel="Threshold Voltage"
        value={`${params.VTO.toFixed(4)} V`}
      />
      {params.LAMBDA !== undefined && (
        <ParamRow
          icon={<TrendingUp className="w-5 h-5" />}
          iconBg="bg-amber-100"
          iconColor="text-amber-600"
          label="沟道长度调制 LAMBDA"
          sublabel="Channel Length Modulation"
          value={params.LAMBDA.toFixed(6)}
        />
      )}
    </>
  );
}

function renderParams(modelType: ModelType, parameters: DiodeParameters | BJTParameters | MOSFETParameters) {
  switch (modelType) {
    case 'diode':
      return <DiodeParams params={parameters as DiodeParameters} />;
    case 'bjt':
      return <BJTParams params={parameters as BJTParameters} />;
    case 'mosfet':
      return <MOSFETParams params={parameters as MOSFETParameters} />;
  }
}

const ParameterPanel: React.FC = () => {
  const { parameters, statistics, modelType, spiceStatement } = useFitStore();
  const [copied, setCopied] = React.useState(false);

  const handleCopySpice = useCallback(() => {
    if (spiceStatement) {
      navigator.clipboard.writeText(spiceStatement);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [spiceStatement]);

  const handleDownloadSpice = useCallback(() => {
    if (spiceStatement) {
      const blob = new Blob([spiceStatement], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `spice_model_${modelType}.mod`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, [spiceStatement, modelType]);

  if (!parameters) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">拟合参数结果</h3>
        <div className="h-48 flex items-center justify-center text-slate-400">
          <div className="text-center">
            <Zap className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p>上传数据后显示拟合结果</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-800 mb-6">拟合参数结果</h3>

      <div className="space-y-4">
        {renderParams(modelType, parameters)}

        {statistics && (
          <div className="border-t border-slate-200 pt-4 mt-4">
            <p className="text-sm font-medium text-slate-600 mb-3">拟合优度</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-amber-50 rounded-lg">
                <div className="flex items-center space-x-2 mb-1">
                  <Target className="w-4 h-4 text-amber-600" />
                  <p className="text-xs text-slate-500">R²</p>
                </div>
                <p className="text-lg font-mono font-semibold text-slate-800">
                  {formatPercentage(statistics.rSquared)}%
                </p>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg">
                <div className="flex items-center space-x-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-purple-600" />
                  <p className="text-xs text-slate-500">RMSE</p>
                </div>
                <p className="text-lg font-mono font-semibold text-slate-800">
                  {formatScientific(statistics.rmse)}
                </p>
              </div>
            </div>
          </div>
        )}

        {spiceStatement && (
          <div className="border-t border-slate-200 pt-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-slate-600">SPICE 模型语句</p>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleCopySpice}
                  className="flex items-center space-x-1 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? '已复制' : '复制'}</span>
                </button>
                <button
                  onClick={handleDownloadSpice}
                  className="flex items-center space-x-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>导出</span>
                </button>
              </div>
            </div>
            <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm font-mono text-emerald-400 whitespace-pre">{spiceStatement}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ParameterPanel;
