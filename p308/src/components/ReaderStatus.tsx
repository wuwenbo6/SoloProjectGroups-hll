import React from 'react'
import { useCard } from '../hooks/useCard'
import { Wifi, WifiOff, Cpu, RefreshCw } from 'lucide-react'

export function ReaderStatus() {
  const { readerInfo, connectReader, disconnectReader, isConnecting, refreshCardData } = useCard()

  return (
    <div className="bg-cyber-card border border-cyber-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Cpu size={14} className="text-cyber-accent" />
          <span className="text-xs font-mono text-cyber-accent uppercase tracking-wider">Reader Status</span>
        </div>
        <button
          onClick={refreshCardData}
          className="p-1 rounded hover:bg-cyber-border transition-colors"
          title="Refresh"
        >
          <RefreshCw size={12} className="text-cyber-muted hover:text-cyber-accent" />
        </button>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div
          className={`w-3 h-3 rounded-full ${
            readerInfo.connected
              ? 'bg-cyber-accent shadow-neon animate-pulse-glow'
              : 'bg-cyber-danger shadow-neon-danger'
          }`}
        />
        <span className="font-mono text-sm">
          {readerInfo.connected ? readerInfo.name : 'Disconnected'}
        </span>
        {readerInfo.isVirtual && readerInfo.connected && (
          <span className="text-xs bg-cyber-surface text-cyber-accent px-2 py-0.5 rounded border border-cyber-accent/30">
            VIRTUAL
          </span>
        )}
      </div>

      <div className="flex gap-2">
        {!readerInfo.connected ? (
          <button
            onClick={connectReader}
            disabled={isConnecting}
            className="flex items-center gap-2 px-4 py-2 bg-cyber-accent/10 border border-cyber-accent/40 rounded-lg text-cyber-accent text-sm font-mono hover:bg-cyber-accent/20 hover:shadow-neon transition-all disabled:opacity-50"
          >
            <Wifi size={14} />
            {isConnecting ? 'Connecting...' : 'Connect'}
          </button>
        ) : (
          <button
            onClick={disconnectReader}
            className="flex items-center gap-2 px-4 py-2 bg-cyber-danger/10 border border-cyber-danger/40 rounded-lg text-cyber-danger text-sm font-mono hover:bg-cyber-danger/20 hover:shadow-neon-danger transition-all"
          >
            <WifiOff size={14} />
            Disconnect
          </button>
        )}
      </div>
    </div>
  )
}
