import FileUpload from '../components/FileUpload';
import CurveChart from '../components/CurveChart';
import ParameterPanel from '../components/ParameterPanel';
import SampleDataButton from '../components/SampleDataButton';
import ModelSelector from '../components/ModelSelector';
import ErrorMessage from '../components/ErrorMessage';
import { Cpu } from 'lucide-react';
import { useFitStore } from '../store/useFitStore';
import { MODEL_LABELS, MODEL_DESCRIPTIONS, ModelType } from '../../shared/types';

const MODEL_FORMULAS: Record<ModelType, { formula: string; params: { name: string; desc: string }[] }> = {
  diode: {
    formula: 'I = IS × (e^(V/(N×Vt)) - 1)',
    params: [
      { name: 'IS', desc: '反向饱和电流' },
      { name: 'N', desc: '发射系数 (理想因子)' },
    ]
  },
  bjt: {
    formula: 'IC = IS × (e^(VBE/(NF×Vt)) - 1) × (1 + VCE/VAF)',
    params: [
      { name: 'IS', desc: '传输饱和电流' },
      { name: 'BF', desc: '正向电流增益' },
      { name: 'NF', desc: '正向发射系数' },
      { name: 'VAF', desc: '正向Early电压' },
    ]
  },
  mosfet: {
    formula: 'ID = KP/2 × (VGS - VTO)² × (1 + LAMBDA×VDS)',
    params: [
      { name: 'KP', desc: '跨导参数' },
      { name: 'VTO', desc: '阈值电压' },
      { name: 'LAMBDA', desc: '沟道长度调制系数' },
    ]
  },
};

function Home() {
  const modelType = useFitStore(s => s.modelType);
  const formulaInfo = MODEL_FORMULAS[modelType];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-slate-700 to-slate-900 rounded-xl flex items-center justify-center">
                <Cpu className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">SPICE 参数拟合工具</h1>
                <p className="text-sm text-slate-500">多模型 V/I 曲线参数提取</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-6 text-white shadow-xl">
            <h2 className="text-2xl font-bold mb-2">SPICE 模型参数拟合</h2>
            <p className="text-slate-300 max-w-2xl">
              上传实测的 V/I 曲线数据，选择器件模型，使用 Levenberg-Marquardt 算法自动拟合并提取 SPICE 模型参数，
              可视化展示实测数据与拟合曲线的对比结果，并可导出 SPICE .MODEL 语句。
            </p>
          </div>
        </div>

        <ErrorMessage />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">选择模型</h3>
              <ModelSelector />
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">数据上传</h3>
              <FileUpload />
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">快速体验</h3>
              <p className="text-sm text-slate-500 mb-4">
                点击下方按钮加载{MODEL_LABELS[modelType]}示例数据，快速体验拟合功能。
              </p>
              <SampleDataButton />
            </div>

            <ParameterPanel />
          </div>

          <div className="lg:col-span-2">
            <CurveChart />
            
            <div className="mt-6 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">
                {MODEL_LABELS[modelType]} 模型公式
              </h3>
              <div className="bg-slate-50 rounded-lg p-4 font-mono text-center">
                <p className="text-lg text-slate-700" dangerouslySetInnerHTML={{ __html: formulaInfo.formula.replace(/e\^/g, 'e<sup>').replace(/\)/g, '</sup>)') }} />
                <p className="text-sm text-slate-500 mt-2">
                  其中 Vt = kT/q ≈ 25.85 mV (300K)
                </p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                {formulaInfo.params.map(p => (
                  <div key={p.name} className="p-3 bg-slate-50 rounded-lg">
                    <p className="font-semibold text-slate-700">{p.name}</p>
                    <p className="text-slate-500">{p.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-slate-500 text-sm">
            SPICE 参数拟合工具 · 基于 Levenberg-Marquardt 算法 · 支持二极管 / BJT / MOSFET
          </p>
        </div>
      </footer>
    </div>
  );
}

export default Home;
