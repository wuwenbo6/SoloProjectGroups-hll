import { useEffect, useRef, useState } from 'react';
import type { ReselectionLog } from '@/types';
import { Signal, CheckCircle, RefreshCw, Download, ChevronDown } from 'lucide-react';

interface LogPanelProps {
  logs: ReselectionLog[];
}

export function LogPanel({ logs }: LogPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleExportCSV = () => {
    window.open('/api/logs/export/csv', '_blank');
    setExportMenuOpen(false);
  };

  const handleExportJSON = () => {
    window.open('/api/logs/export/json', '_blank');
    setExportMenuOpen(false);
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'measurement':
        return <Signal className="w-3.5 h-3.5 text-accent-info" />;
      case 's_criterion':
        return <CheckCircle className="w-3.5 h-3.5 text-accent-primary" />;
      case 'reselection':
        return <RefreshCw className="w-3.5 h-3.5 text-accent-warning" />;
      default:
        return null;
    }
  };

  const getEventLabel = (type: string) => {
    switch (type) {
      case 'measurement':
        return 'MEASUREMENT';
      case 's_criterion':
        return 'S-CRITERION';
      case 'reselection':
        return 'RESELECTION';
      default:
        return type;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'measurement':
        return 'bg-accent-info/10 text-accent-info border-accent-info/30';
      case 's_criterion':
        return 'bg-accent-primary/10 text-accent-primary border-accent-primary/30';
      case 'reselection':
        return 'bg-accent-warning/10 text-accent-warning border-accent-warning/30';
      default:
        return 'bg-bg-tertiary text-text-primary';
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('en-US', { hour12: false });
  };

  return (
    <div className="bg-bg-secondary/40 rounded-lg border border-bg-tertiary p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-display font-semibold text-text-primary flex items-center gap-2">
          <span className="w-1 h-4 bg-accent-primary rounded-full" />
          Reselection Decision Log
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary">
            {logs.length} events
          </span>
          <div className="relative">
            <button
              onClick={() => setExportMenuOpen(!exportMenuOpen)}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-bg-tertiary hover:bg-bg-tertiary/70 text-text-primary rounded transition-all"
              disabled={logs.length === 0}
            >
              <Download className="w-3.5 h-3.5" />
              Export
              <ChevronDown className={`w-3 h-3 transition-transform ${exportMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-bg-secondary border border-bg-tertiary rounded-lg shadow-xl overflow-hidden z-50 min-w-[120px]">
                <button
                  onClick={handleExportCSV}
                  className="w-full text-left px-3 py-2 text-xs text-text-primary hover:bg-bg-tertiary transition-all flex items-center gap-2"
                >
                  <span className="text-accent-info">📄</span>
                  Export CSV
                </button>
                <button
                  onClick={handleExportJSON}
                  className="w-full text-left px-3 py-2 text-xs text-text-primary hover:bg-bg-tertiary transition-all flex items-center gap-2"
                >
                  <span className="text-accent-primary">{`{`}</span>
                  Export JSON
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-2 min-h-[200px] max-h-[300px]"
      >
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted text-sm">
            <RefreshCw className="w-8 h-8 mb-2 opacity-30" />
            <p>No events yet. Start simulation to begin.</p>
          </div>
        ) : (
          logs.map((log, index) => (
            <div
              key={index}
              className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                log.event_type === 'reselection'
                  ? 'bg-accent-warning/10 border-accent-warning/30'
                  : 'bg-bg-tertiary/30 border-bg-tertiary hover:bg-bg-tertiary/50'
              }`}
            >
              <div className="mt-0.5">{getEventIcon(log.event_type)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-semibold border ${getEventColor(
                      log.event_type
                    )}`}
                  >
                    {getEventLabel(log.event_type)}
                  </span>
                  <span className="text-xs text-text-muted">Step {log.step}</span>
                  <span className="text-xs text-text-muted ml-auto">
                    {formatTime(log.timestamp)}
                  </span>
                </div>
                {log.event_type === 'measurement' && (
                  <p className="text-xs text-text-primary">
                    Serving cell PCI {log.source_pci}:{' '}
                    <span className="font-mono text-accent-info">
                      RSRP {log.details.rsrp_source?.toFixed(1)} dBm
                    </span>
                    , R<sub>s</sub> ={' '}
                    <span className="font-mono text-accent-primary">
                      {log.details.r_s?.toFixed(1)} dB
                    </span>
                  </p>
                )}
                {log.event_type === 's_criterion' && (
                  <p className="text-xs text-text-primary">
                    PCI {log.source_pci} → PCI {log.target_pci}:{' '}
                    <span className="font-mono text-accent-info">
                      RSRP {log.details.rsrp_target?.toFixed(1)} dBm
                    </span>
                    , S<sub>rxlev</sub> ={' '}
                    <span
                      className={`font-mono font-semibold ${
                        (log.details.s_rxlev_target ?? 0) > 0
                          ? 'text-accent-primary'
                          : 'text-accent-warning'
                      }`}
                    >
                      {log.details.s_rxlev_target?.toFixed(1)} dB
                    </span>
                    , R<sub>n</sub> ={' '}
                    <span className="font-mono text-accent-info">
                      {log.details.r_n?.toFixed(1)} dB
                    </span>
                  </p>
                )}
                {log.event_type === 'reselection' && (
                  <p className="text-xs text-text-primary">
                    <span className="font-semibold text-accent-warning">
                      Cell Reselection!
                    </span>{' '}
                    PCI {log.source_pci} → PCI {log.target_pci}
                    <br />
                    <span className="text-text-secondary">
                      RSRP: {log.details.rsrp_source?.toFixed(1)} →{' '}
                      {log.details.rsrp_target?.toFixed(1)} dBm | R:{' '}
                      {log.details.r_s?.toFixed(1)} → {log.details.r_n?.toFixed(1)} dB
                    </span>
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
