import React, { useMemo } from 'react';
import { Info, Package, Cpu, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import { useTLPStore } from '@/store/tlpStore';
import { toHexDump, toHexString } from '@/utils/tlpParser';

export const TLPDetail: React.FC = () => {
  const { selectedTLP, modifiedTLPs, getCurrentTLPData } = useTLPStore();

  const currentData = useMemo(() => {
    if (!selectedTLP) return null;
    return getCurrentTLPData(selectedTLP);
  }, [selectedTLP, getCurrentTLPData]);

  const modified = useMemo(() => {
    return selectedTLP ? modifiedTLPs.has(selectedTLP.index) : false;
  }, [selectedTLP, modifiedTLPs]);

  if (!selectedTLP || !currentData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8">
        <Info className="w-12 h-12 mb-4 text-slate-600" />
        <p>选择一个TLP查看详情</p>
      </div>
    );
  }

  const header = selectedTLP.header;
  const hexDump = toHexDump(currentData, 16);

  const headerFields = [
    { label: 'TLP类型', value: header.type },
    { label: '类型码', value: `0x${header.typeCode.toString(16).padStart(2, '0')}` },
    { label: '格式', value: `0x${header.format.toString(16)}` },
    { label: '长度', value: `${header.length} DW (${header.length * 4} 字节)` },
    { label: '传输类', value: `TC${header.trafficClass}` },
    { label: '属性', value: `0x${header.attr?.toString(16).padStart(2, '0')}` },
  ];

  const idFields = [
    { label: '请求者ID', value: header.requesterId !== undefined ? `0x${header.requesterId.toString(16).padStart(4, '0')}` : '-' },
    { label: '完成者ID', value: header.completerId !== undefined ? `0x${header.completerId.toString(16).padStart(4, '0')}` : '-' },
    { label: 'Tag', value: header.tag !== undefined ? `0x${header.tag.toString(16).padStart(2, '0')}` : '-' },
  ];

  const addressFields = [
    { label: '地址', value: header.address !== undefined ? `0x${header.address.toString(16).toUpperCase().padStart(8, '0')}` : '-' },
    { label: '低位地址', value: header.lowerAddress !== undefined ? `0x${header.lowerAddress.toString(16).padStart(2, '0')}` : '-' },
  ];

  const completionFields = [
    { label: '完成状态', value: header.status || '-' },
    { label: '字节计数', value: header.byteCount !== undefined ? header.byteCount : '-' },
  ];

  const beFields = [
    { label: '首DW BE', value: header.firstDWBE !== undefined ? `0x${header.firstDWBE.toString(16).padStart(1, '0')}` : '-' },
    { label: '末DW BE', value: header.lastDWBE !== undefined ? `0x${header.lastDWBE.toString(16).padStart(1, '0')}` : '-' },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <Package className="w-5 h-5 text-cyan-400" />
          <h3 className="text-lg font-semibold text-slate-200">
            TLP #{selectedTLP.index}
          </h3>
          {modified && (
            <span className="px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400 rounded border border-amber-500/50">
              已修改
            </span>
          )}
        </div>
        <span className="text-xs text-slate-500">
          {currentData.length} 字节
        </span>
      </div>

      <div className="flex-1 overflow-auto space-y-4 pr-2">
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-slate-400 flex items-center gap-2">
            <Cpu className="w-4 h-4" />
            头部信息
          </h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {headerFields.map((field) => (
              <div key={field.label} className="bg-slate-800/50 rounded p-2">
                <span className="text-slate-500 block mb-1">{field.label}</span>
                <span className="text-slate-200 font-mono">{field.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-medium text-slate-400">ID 信息</h4>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {idFields.map((field) => (
              <div key={field.label} className="bg-slate-800/50 rounded p-2">
                <span className="text-slate-500 block mb-1">{field.label}</span>
                <span className="text-slate-200 font-mono">{field.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-medium text-slate-400">地址信息</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {addressFields.map((field) => (
              <div key={field.label} className="bg-slate-800/50 rounded p-2">
                <span className="text-slate-500 block mb-1">{field.label}</span>
                <span className="text-cyan-400 font-mono">{field.value}</span>
              </div>
            ))}
          </div>
        </div>

        {(header.statusCode !== undefined || header.byteCount !== undefined) && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-slate-400">完成信息</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {completionFields.map((field) => (
                <div key={field.label} className="bg-slate-800/50 rounded p-2">
                  <span className="text-slate-500 block mb-1">{field.label}</span>
                  <span className={header.statusCode !== undefined && header.statusCode !== 0 ? 'text-red-400 font-mono' : 'text-emerald-400 font-mono'}>
                    {field.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(header.firstDWBE !== undefined || header.lastDWBE !== undefined) && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-slate-400">字节使能</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {beFields.map((field) => (
                <div key={field.label} className="bg-slate-800/50 rounded p-2">
                  <span className="text-slate-500 block mb-1">{field.label}</span>
                  <span className="text-slate-200 font-mono">{field.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedTLP.ecrc && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-slate-400 flex items-center gap-2">
              {selectedTLP.ecrc.hasECRC ? (
                selectedTLP.ecrc.valid ? (
                  <><ShieldCheck className="w-4 h-4 text-emerald-400" /> ECRC 校验</>
                ) : (
                  <><ShieldAlert className="w-4 h-4 text-red-400" /> ECRC 校验</>
                )
              ) : (
                <><ShieldX className="w-4 h-4 text-slate-500" /> ECRC</>
              )}
            </h4>
            <div className="bg-slate-800/50 rounded p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">ECRC 存在</span>
                <span className={selectedTLP.ecrc.hasECRC ? 'text-emerald-400 font-mono' : 'text-slate-400 font-mono'}>
                  {selectedTLP.ecrc.hasECRC ? '是 (TD=1)' : '否 (TD=0)'}
                </span>
              </div>
              {selectedTLP.ecrc.hasECRC && (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">预期值</span>
                    <span className="text-slate-200 font-mono">
                      0x{selectedTLP.ecrc.expected?.toString(16).padStart(8, '0').toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">实际值</span>
                    <span className={selectedTLP.ecrc.valid ? 'text-emerald-400 font-mono' : 'text-red-400 font-mono'}>
                      0x{selectedTLP.ecrc.actual?.toString(16).padStart(8, '0').toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">校验结果</span>
                    <span className={selectedTLP.ecrc.valid ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>
                      {selectedTLP.ecrc.valid ? '✓ 校验通过' : '✗ 校验失败'}
                    </span>
                  </div>
                  {selectedTLP.ecrc.position !== undefined && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">ECRC位置</span>
                      <span className="text-slate-200 font-mono">
                        偏移 {selectedTLP.ecrc.position}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {selectedTLP.payload && selectedTLP.payload.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-slate-400">
              数据载荷 ({selectedTLP.payload.length} 字节)
            </h4>
            <pre className="bg-slate-800/50 rounded p-3 text-xs font-mono text-slate-300 overflow-auto">
              {toHexString(selectedTLP.payload, ' ')}
            </pre>
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-sm font-medium text-slate-400">原始数据</h4>
          <pre className="bg-slate-800/50 rounded p-3 text-xs font-mono text-slate-300 overflow-auto whitespace-pre">
            {hexDump}
          </pre>
        </div>
      </div>
    </div>
  );
};
