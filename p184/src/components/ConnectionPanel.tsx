import { useState } from 'react';
import { Plug, Zap } from 'lucide-react';
import { useGrpcStore } from '@/store/grpcStore';
import { connect, getServices } from '@/utils/api';

export default function ConnectionPanel() {
  const {
    address,
    tls,
    setAddress,
    setTLS,
    setServices,
    setError,
    setLoading,
    setServiceMethods,
    toggleService,
    reset,
    services,
  } = useGrpcStore();
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    if (!address.trim()) {
      setError('请输入 gRPC 服务地址');
      return;
    }

    setIsConnecting(true);
    setLoading(true);
    setError(null);
    reset();

    try {
      const svcs = await connect(address, tls);
      setServices(svcs);

      for (const svc of svcs) {
        try {
          const methods = await getServices(address, tls, svc);
          setServiceMethods(svc, methods);
          toggleService(svc);
        } catch {
          // ignore
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '连接失败');
    } finally {
      setIsConnecting(false);
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConnect();
    }
  };

  return (
    <div className="p-4 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">gRPC 动态调用平台</h1>
          <p className="text-xs text-[var(--text-secondary)]">通过 Server Reflection 发现并调用任意 gRPC 服务</p>
        </div>
      </div>

      <div className="flex gap-2 items-center">
        <div className="flex-1 relative">
          <Plug className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="host:port (例如: localhost:50051)"
            className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] text-sm focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20 transition-all"
          />
        </div>

        <label className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg cursor-pointer hover:border-teal-400/50 transition-colors">
          <input
            type="checkbox"
            checked={tls}
            onChange={(e) => setTLS(e.target.checked)}
            className="w-4 h-4 accent-teal-400"
          />
          <span className="text-sm text-[var(--text-secondary)]">TLS</span>
        </label>

        <button
          onClick={handleConnect}
          disabled={isConnecting}
          className="px-6 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-medium rounded-lg hover:from-teal-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-teal-500/20 hover:shadow-teal-400/30 flex items-center gap-2"
        >
          {isConnecting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              连接中...
            </>
          ) : (
            <>
              <Plug className="w-4 h-4" />
              连接
            </>
          )}
        </button>

        {services.length > 0 && (
          <span className="text-xs text-teal-400 font-medium px-2 py-1 bg-teal-400/10 rounded-full">
            {services.length} 个服务
          </span>
        )}
      </div>
    </div>
  );
}
