import React from 'react';
import { Info, Server, Cpu, Box, ArrowLeft, ArrowRight, Usb, Database, PlugZap, Activity, Network } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import type { GSDMLDevice, Module, Submodule, IOData, Slot, Subslot, VirtualModule, DiagnosticInfo, LLDPConfig, ChannelDiagnostic, LLDPPortConfig } from '../types/gsdml';

export const NodeDetails: React.FC = () => {
  const { selectedNodeId, moduleTree, parsedGSDML } = useAppStore();

  const findNode = (nodes: typeof moduleTree, id: string): (typeof moduleTree)[0] | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findNode(node.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const selectedNode = selectedNodeId ? findNode(moduleTree, selectedNodeId) : null;

  if (!selectedNode || !parsedGSDML) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8">
        <Info className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-sm text-center">选择左侧模块树中的节点<br />查看详细信息</p>
      </div>
    );
  }

  const getTypeIcon = () => {
    switch (selectedNode.type) {
      case 'device':
        return <Server className="w-5 h-5 text-[#165DFF]" />;
      case 'module':
        return <Cpu className="w-5 h-5 text-purple-500" />;
      case 'submodule':
        return <Box className="w-5 h-5 text-amber-500" />;
      case 'input':
        return <ArrowLeft className="w-5 h-5 text-green-500" />;
      case 'output':
        return <ArrowRight className="w-5 h-5 text-blue-500" />;
      case 'slot':
        return <PlugZap className="w-5 h-5 text-rose-500" />;
      case 'virtual':
        return <Database className="w-5 h-5 text-cyan-500" />;
      case 'diagnostic':
        return <Activity className="w-5 h-5 text-orange-500" />;
      case 'lldp':
        return <Network className="w-5 h-5 text-indigo-500" />;
      default:
        return <Info className="w-5 h-5 text-gray-400" />;
    }
  };

  const getTypeLabel = () => {
    switch (selectedNode.type) {
      case 'device':
        return '设备';
      case 'module':
        return '模块';
      case 'submodule':
        return '子模块';
      case 'input':
        return '输入数据';
      case 'output':
        return '输出数据';
      case 'slot':
        return '插槽';
      case 'virtual':
        return '虚拟模块';
      case 'diagnostic':
        return '诊断信息';
      case 'lldp':
        return 'LLDP配置';
      default:
        return '未知';
    }
  };

  const renderDeviceDetails = (data: GSDMLDevice) => (
    <div className="space-y-4">
      <DetailRow label="GSDML版本" value={data.gsdmlVersion} highlight />
      <DetailRow label="厂商标识" value={data.vendorId} />
      <DetailRow label="厂商名称" value={data.vendorName} />
      <DetailRow label="设备标识" value={data.deviceId} />
      <DetailRow label="产品标识" value={data.productId} />
      <DetailRow label="产品系列" value={data.familyName} />
      <DetailRow label="版本" value={data.version} />
      <DetailRow label="模块数量" value={String(data.modules.length)} />
      {data.slots && <DetailRow label="插槽数量" value={String(data.slots.length)} />}
      {data.virtualModules && <DetailRow label="虚拟模块数量" value={String(data.virtualModules.length)} />}
    </div>
  );

  const renderModuleDetails = (data: Module) => (
    <div className="space-y-4">
      <DetailRow label="模块ID" value={data.id} />
      <DetailRow label="模块名称" value={data.name} />
      {data.description && <DetailRow label="描述" value={data.description} />}
      {data.info?.category && <DetailRow label="类别" value={data.info.category} />}
      {data.isVirtual !== undefined && <DetailRow label="虚拟模块" value={data.isVirtual ? '是' : '否'} />}
      {data.submodules && <DetailRow label="子模块数量" value={String(data.submodules.length)} />}
      {data.ioData && <DetailRow label="IO数据点数量" value={String(data.ioData.length)} />}
      {data.allowedInSlots && data.allowedInSlots.length > 0 && (
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">允许插槽</label>
          <div className="mt-1 flex flex-wrap gap-1">
            {data.allowedInSlots.map((slotId) => (
              <span key={slotId} className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono">
                {slotId}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderSubmoduleDetails = (data: Submodule) => (
    <div className="space-y-4">
      <DetailRow label="子模块ID" value={data.id} />
      <DetailRow label="子模块名称" value={data.name} />
      {data.description && <DetailRow label="描述" value={data.description} />}
      {data.type && <DetailRow label="类型" value={data.type} />}
      {data.isVirtual !== undefined && <DetailRow label="虚拟" value={data.isVirtual ? '是' : '否'} />}
      {data.ioData && <DetailRow label="IO数据点数量" value={String(data.ioData.length)} />}
    </div>
  );

  const renderIODataDetails = (data: IOData) => (
    <div className="space-y-4">
      <DetailRow label="数据ID" value={data.id} />
      <DetailRow label="数据名称" value={data.name} />
      <DetailRow label="方向" value={data.direction === 'input' ? '输入 (Input)' : '输出 (Output)'} />
      <DetailRow label="长度" value={`${data.length} 位`} />
      {data.dataType && <DetailRow label="数据类型" value={data.dataType} />}
      {data.unit && <DetailRow label="单位" value={data.unit} />}
      {typeof data.byteOffset === 'number' && <DetailRow label="字节偏移" value={String(data.byteOffset)} />}
      {typeof data.bitOffset === 'number' && <DetailRow label="位偏移" value={String(data.bitOffset)} />}
    </div>
  );

  const renderSlotDetails = (data: Slot) => (
    <div className="space-y-4">
      <DetailRow label="插槽ID" value={data.id} />
      <DetailRow label="插槽编号" value={String(data.slotNumber)} />
      <DetailRow label="插槽名称" value={data.name} />
      {data.description && <DetailRow label="描述" value={data.description} />}
      {data.isFixed !== undefined && <DetailRow label="固定插槽" value={data.isFixed ? '是' : '否'} />}
      {data.isPlugable !== undefined && <DetailRow label="可插拔" value={data.isPlugable ? '是' : '否'} />}
      {data.allowedModules && data.allowedModules.length > 0 && (
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">允许模块</label>
          <div className="mt-1 flex flex-wrap gap-1">
            {data.allowedModules.map((modId) => (
              <span key={modId} className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-mono">
                {modId}
              </span>
            ))}
          </div>
        </div>
      )}
      {data.subslots && <DetailRow label="子插槽数量" value={String(data.subslots.length)} />}
    </div>
  );

  const renderVirtualModuleDetails = (data: VirtualModule) => (
    <div className="space-y-4">
      <DetailRow label="虚拟模块ID" value={data.id} />
      <DetailRow label="虚拟模块名称" value={data.name} />
      {data.description && <DetailRow label="描述" value={data.description} />}
      <DetailRow label="子模块数量" value={String(data.submodules.length)} />
      {data.ioData && <DetailRow label="IO数据点数量" value={String(data.ioData.length)} />}
    </div>
  );

  const renderDiagnosticDetails = (data: DiagnosticInfo) => (
    <div className="space-y-4">
      <DetailRow label="诊断ID" value={data.id} />
      <DetailRow label="诊断名称" value={data.name} />
      <DetailRow label="诊断类型" value={data.type} />
      <div>
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">严重程度</label>
        <p className={`mt-1 text-sm px-2 py-1 rounded inline-block ${
          data.severity === 'fault' ? 'bg-red-100 text-red-700' :
          data.severity === 'error' ? 'bg-orange-100 text-orange-700' :
          data.severity === 'warning' ? 'bg-yellow-100 text-yellow-700' :
          'bg-blue-100 text-blue-700'
        }`}>
          {data.severity}
        </p>
      </div>
      {data.description && <DetailRow label="描述" value={data.description} />}
      {data.helpText && <DetailRow label="帮助信息" value={data.helpText} />}
      {data.channelDiagnostics && data.channelDiagnostics.length > 0 && (
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">通道诊断 ({data.channelDiagnostics.length}个通道)</label>
          <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
            {data.channelDiagnostics.map((cd) => (
              <div key={cd.id} className="bg-gray-50 p-2 rounded text-xs">
                <div className="font-medium text-gray-700">{cd.channelName}</div>
                <div className="text-gray-500">通道 {cd.channelNumber} · {cd.type} · {cd.direction || 'N/A'}</div>
                <div className="mt-1 text-gray-400">支持 {cd.supportedCodes.length} 种诊断代码</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderChannelDiagnosticDetails = (data: ChannelDiagnostic) => (
    <div className="space-y-4">
      <DetailRow label="通道ID" value={data.id} />
      <DetailRow label="通道编号" value={String(data.channelNumber)} />
      <DetailRow label="通道名称" value={data.channelName} />
      <DetailRow label="通道类型" value={data.type} />
      {data.direction && <DetailRow label="方向" value={data.direction} />}
      <div>
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">支持的诊断代码</label>
        <div className="mt-2 space-y-2">
          {data.supportedCodes.map((code) => (
            <div key={code.code} className="bg-gray-50 p-2 rounded text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono font-medium">{code.code}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                  code.severity === 'fault' ? 'bg-red-100 text-red-700' :
                  code.severity === 'error' ? 'bg-orange-100 text-orange-700' :
                  code.severity === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-blue-100 text-blue-700'
                }`}>
                  {code.severity}
                </span>
              </div>
              <div className="font-medium text-gray-700 mt-1">{code.name}</div>
              <div className="text-gray-500">{code.description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderLLDPDetails = (data: LLDPConfig) => (
    <div className="space-y-4">
      <DetailRow label="LLDP状态" value={data.enabled ? '已启用' : '已禁用'} highlight={data.enabled} />
      <div className="border-t pt-3">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">设备信息</label>
        <div className="mt-2 space-y-2">
          <DetailRow label="Chassis ID" value={data.deviceInfo.chassisId} />
          <DetailRow label="Chassis ID类型" value={data.deviceInfo.chassisIdType} />
          {data.deviceInfo.systemName && <DetailRow label="系统名称" value={data.deviceInfo.systemName} />}
          {data.deviceInfo.systemDescription && <DetailRow label="系统描述" value={data.deviceInfo.systemDescription} />}
          {data.deviceInfo.systemCapabilities && data.deviceInfo.systemCapabilities.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-500">系统能力</label>
              <div className="mt-1 flex flex-wrap gap-1">
                {data.deviceInfo.systemCapabilities.map((cap) => (
                  <span key={cap} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {data.portConfigs && data.portConfigs.length > 0 && (
        <div className="border-t pt-3">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">端口配置 ({data.portConfigs.length}个端口)</label>
          <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
            {data.portConfigs.map((pc) => (
              <div key={pc.portId} className="bg-gray-50 p-2 rounded text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-700">{pc.portDescription || pc.portId}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                    pc.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {pc.enabled ? '启用' : '禁用'}
                  </span>
                </div>
                <div className="text-gray-500 mt-1">
                  类型: {pc.portIdType}
                  {pc.ttl && ` · TTL: ${pc.ttl}s`}
                  {pc.managementAddress && ` · 管理地址: ${pc.managementAddress}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderLLDPPortDetails = (data: LLDPPortConfig) => (
    <div className="space-y-4">
      <DetailRow label="端口ID" value={data.portId} />
      <DetailRow label="端口ID类型" value={data.portIdType} />
      {data.portDescription && <DetailRow label="端口描述" value={data.portDescription} />}
      <DetailRow label="状态" value={data.enabled ? '已启用' : '已禁用'} highlight={data.enabled} />
      {data.ttl && <DetailRow label="TTL" value={`${data.ttl} 秒`} />}
      {data.managementAddress && <DetailRow label="管理地址" value={data.managementAddress} />}
    </div>
  );

  const renderContent = () => {
    const data = selectedNode.data;
    if (!data) return null;

    switch (selectedNode.type) {
      case 'device':
        return renderDeviceDetails(data as GSDMLDevice);
      case 'module':
        return renderModuleDetails(data as Module);
      case 'submodule':
        return renderSubmoduleDetails(data as Submodule);
      case 'input':
      case 'output':
        return renderIODataDetails(data as IOData);
      case 'slot':
        return renderSlotDetails(data as Slot);
      case 'virtual':
        return renderVirtualModuleDetails(data as VirtualModule);
      case 'diagnostic':
        if ('channelNumber' in (data as object)) {
          return renderChannelDiagnosticDetails(data as ChannelDiagnostic);
        }
        return renderDiagnosticDetails(data as DiagnosticInfo);
      case 'lldp':
        if ('portId' in (data as object)) {
          return renderLLDPPortDetails(data as LLDPPortConfig);
        }
        return renderLLDPDetails(data as LLDPConfig);
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          {getTypeIcon()}
          <h3 className="text-sm font-semibold text-gray-900 truncate">{selectedNode.name}</h3>
        </div>
        <span className="text-xs text-gray-500 mt-1 inline-block">{getTypeLabel()}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{renderContent()}</div>
    </div>
  );
};

const DetailRow: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div>
    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
    <p
      className={`mt-1 text-sm font-mono px-2 py-1 rounded ${
        highlight ? 'bg-[#165DFF]/10 text-[#165DFF]' : 'bg-gray-50 text-gray-900'
      }`}
    >
      {value}
    </p>
  </div>
);
