import { Wifi, WifiOff, Settings, Monitor } from 'lucide-react';
import { useState } from 'react';
import type { ArtNetConfig } from '../../shared/types';

interface ConnectionStatusProps {
  connected: boolean;
  config: ArtNetConfig | null;
  onConfigChange: (config: Partial<ArtNetConfig>) => void;
}

export function ConnectionStatus({
  connected,
  config,
  onConfigChange,
}: ConnectionStatusProps) {
  const [showConfig, setShowConfig] = useState(false);
  const [tempIp, setTempIp] = useState(config?.targetIp || '');
  const [tempPort, setTempPort] = useState(config?.targetPort || 6454);
  const [tempNet, setTempNet] = useState(config?.net ?? 0);
  const [tempSwitch, setTempSwitch] = useState(config?.switch_ ?? 0);
  const [tempUniverse, setTempUniverse] = useState(config?.universe ?? 0);

  const isBroadcast = config?.targetIp === '255.255.255.255' || config?.targetIp?.endsWith('.255');

  const handleApply = () => {
    onConfigChange({
      targetIp: tempIp,
      targetPort: tempPort,
      net: tempNet,
      switch_: tempSwitch,
      universe: tempUniverse,
    });
    setShowConfig(false);
  };

  return (
    <div className="flex items-center gap-4 p-3 bg-console-panel border-b border-console-border">
      <div className="flex items-center gap-2">
        <div
          className={`w-3 h-3 rounded-full ${
            connected
              ? 'bg-console-active connected-indicator'
              : 'bg-console-warning'
          }`}
        />
        <span className="text-sm font-medium">
          {connected ? (
            <span className="text-console-active flex items-center gap-1.5">
              <Wifi size={16} />
              已连接
            </span>
          ) : (
            <span className="text-console-warning flex items-center gap-1.5">
              <WifiOff size={16} />
              未连接
            </span>
          )}
        </span>
      </div>

      {config && (
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-1.5 text-console-muted">
            <Monitor size={14} className={isBroadcast ? 'text-console-warning' : 'text-console-active'} />
            <span className="text-console-text font-mono">{config.targetIp}</span>
            <span>:</span>
            <span className="text-console-text font-mono">{config.targetPort}</span>
            {isBroadcast && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-console-warning/20 text-console-warning">
                广播
              </span>
            )}
          </div>
          <div className="h-4 w-px bg-console-border" />
          <div className="flex items-center gap-1.5 text-console-muted text-xs font-mono">
            <span>Net:<span className="text-console-text ml-0.5">{config.net}</span></span>
            <span>Sw:<span className="text-console-text ml-0.5">{config.switch_}</span></span>
            <span>Uni:<span className="text-console-text ml-0.5">{config.universe}</span></span>
          </div>
        </div>
      )}

      <div className="relative ml-auto">
        <button
          onClick={() => {
            setTempIp(config?.targetIp || '');
            setTempPort(config?.targetPort || 6454);
            setTempNet(config?.net ?? 0);
            setTempSwitch(config?.switch_ ?? 0);
            setTempUniverse(config?.universe ?? 0);
            setShowConfig(!showConfig);
          }}
          className="p-2 rounded hover:bg-console-border transition-colors text-console-muted hover:text-console-text"
        >
          <Settings size={18} />
        </button>

        {showConfig && (
          <div className="absolute right-0 top-full mt-2 w-80 p-4 bg-console-panel border border-console-border rounded-lg shadow-xl z-50">
            <h4 className="text-sm font-semibold mb-3 text-console-text">Art-Net 配置</h4>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-console-muted mb-1">
                  目标 IP
                  <span className="ml-2 text-console-muted/60">(255.255.255.255 = 广播)</span>
                </label>
                <input
                  type="text"
                  value={tempIp}
                  onChange={(e) => setTempIp(e.target.value)}
                  placeholder="255.255.255.255"
                  className="w-full px-3 py-2 bg-console-bg border border-console-border rounded text-sm font-mono text-console-text focus:outline-none focus:border-console-accent"
                />
              </div>

              <div>
                <label className="block text-xs text-console-muted mb-1">端口</label>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={tempPort}
                  onChange={(e) => setTempPort(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-console-bg border border-console-border rounded text-sm font-mono text-console-text focus:outline-none focus:border-console-accent"
                />
              </div>

              <div className="bg-console-bg p-3 rounded-lg border border-console-border">
                <label className="block text-xs text-console-muted mb-2 font-semibold uppercase tracking-wider">
                  端口地址 (Port Address)
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-console-muted mb-1">
                      Net <span className="text-console-muted/60">(0-127)</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={127}
                      value={tempNet}
                      onChange={(e) => setTempNet(Math.max(0, Math.min(127, Number(e.target.value))))}
                      className="w-full px-2 py-1.5 bg-console-panel border border-console-border rounded text-sm font-mono text-console-text text-center focus:outline-none focus:border-console-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-console-muted mb-1">
                      Switch <span className="text-console-muted/60">(0-15)</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={15}
                      value={tempSwitch}
                      onChange={(e) => setTempSwitch(Math.max(0, Math.min(15, Number(e.target.value))))}
                      className="w-full px-2 py-1.5 bg-console-panel border border-console-border rounded text-sm font-mono text-console-text text-center focus:outline-none focus:border-console-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-console-muted mb-1">
                      Universe <span className="text-console-muted/60">(0-15)</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={15}
                      value={tempUniverse}
                      onChange={(e) => setTempUniverse(Math.max(0, Math.min(15, Number(e.target.value))))}
                      className="w-full px-2 py-1.5 bg-console-panel border border-console-border rounded text-sm font-mono text-console-text text-center focus:outline-none focus:border-console-accent"
                    />
                  </div>
                </div>
                <div className="mt-2 text-xs text-console-muted font-mono text-center">
                  端口地址 = {(tempNet << 8) | (tempSwitch << 4) | tempUniverse}
                  <span className="text-console-muted/60 ml-1">
                    (0x{((tempNet << 8) | (tempSwitch << 4) | tempUniverse).toString(16).toUpperCase().padStart(4, '0')})
                  </span>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowConfig(false)}
                  className="flex-1 px-3 py-2 text-sm rounded bg-console-border text-console-text hover:bg-console-border/80 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleApply}
                  className="flex-1 px-3 py-2 text-sm rounded bg-console-accent text-black font-medium hover:bg-console-accentHover transition-colors"
                >
                  应用
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
