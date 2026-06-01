import { ChevronRight, ChevronDown, Server, GitBranch } from 'lucide-react';
import { useGrpcStore } from '@/store/grpcStore';
import { getSchema } from '@/utils/api';
import { MethodInfo } from '@/utils/api';

export default function ServiceTree() {
  const {
    services,
    expandedServices,
    selectedMethod,
    serviceMethods,
    address,
    tls,
    toggleService,
    selectMethod,
    setRequestJson,
    setSchema,
    setError,
    setLoading,
  } = useGrpcStore();

  const handleMethodClick = async (method: MethodInfo) => {
    selectMethod(method);
    setLoading(true);
    setError(null);

    try {
      const schema = await getSchema(address, tls, method.fullMethod);
      setSchema(schema);
      setRequestJson(schema.template);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取方法签名失败');
    } finally {
      setLoading(false);
    }
  };

  const getMethodTypeLabel = (method: MethodInfo) => {
    if (method.isClientStreaming && method.isServerStreaming) {
      return <span className="text-xs text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded">BIDI</span>;
    }
    if (method.isClientStreaming) {
      return <span className="text-xs text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded">CS</span>;
    }
    if (method.isServerStreaming) {
      return <span className="text-xs text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded">SS</span>;
    }
    return <span className="text-xs text-teal-400 bg-teal-400/10 px-1.5 py-0.5 rounded">UNARY</span>;
  };

  if (services.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-secondary)] p-8">
        <Server className="w-16 h-16 mb-4 opacity-30" />
        <p className="text-sm">暂无服务</p>
        <p className="text-xs mt-1">连接 gRPC 服务以发现可用方法</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-2">
      {services.map((service) => {
        const methods = serviceMethods[service] || [];
        const isExpanded = expandedServices.has(service);
        const shortName = service.split('.').pop() || service;

        return (
          <div key={service} className="mb-1">
            <button
              onClick={() => toggleService(service)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-left group"
            >
              <span className="text-[var(--text-secondary)] transition-transform">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </span>
              <Server className="w-4 h-4 text-teal-400" />
              <span className="text-sm font-medium text-[var(--text-primary)] truncate">{shortName}</span>
              {methods.length > 0 && (
                <span className="ml-auto text-xs text-[var(--text-secondary)]">{methods.length}</span>
              )}
            </button>

            {isExpanded && methods.length > 0 && (
              <div className="ml-4 mt-1 space-y-0.5 border-l border-[var(--border-color)]">
                {methods.map((method) => {
                  const isSelected = selectedMethod?.fullMethod === method.fullMethod;
                  return (
                    <button
                      key={method.fullMethod}
                      onClick={() => handleMethodClick(method)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-r-lg text-left transition-all ${
                        isSelected
                          ? 'bg-teal-500/20 border-l-2 border-teal-400 ml-[-2px]'
                          : 'hover:bg-[var(--bg-tertiary)]'
                      }`}
                    >
                      <GitBranch className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                      <span className={`text-sm truncate flex-1 ${
                        isSelected ? 'text-teal-400 font-medium' : 'text-[var(--text-primary)]'
                      }`}>
                        {method.name}
                      </span>
                      {getMethodTypeLabel(method)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
