import { useEffect, useRef, useState } from 'react';
import { Server, Network } from 'lucide-react';
import { OAMState, PDUData } from '../types';
import { StatusIndicator } from './StatusIndicator';
import { getStatusColor, getStatusBorderColor } from '../utils/formatters';

interface TopologyViewProps {
  state: OAMState;
  latestPdu: PDUData | null;
}

export function TopologyView({ state, latestPdu }: TopologyViewProps) {
  const [pduAnimation, setPduAnimation] = useState(false);
  const pduTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (latestPdu) {
      setPduAnimation(true);
      if (pduTimeoutRef.current) {
        clearTimeout(pduTimeoutRef.current);
      }
      pduTimeoutRef.current = window.setTimeout(() => {
        setPduAnimation(false);
      }, 1000);
    }
    return () => {
      if (pduTimeoutRef.current) {
        clearTimeout(pduTimeoutRef.current);
      }
    };
  }, [latestPdu?.id]);

  const nodeA = state.nodes[0];
  const nodeB = state.nodes[1];

  const isLinkUp = state.link_status === 'up';
  const isLinkFault = state.link_status === 'fault';

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-200">网络拓扑</h2>
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-400">OAM 链路</span>
        </div>
      </div>

      <div className="flex-1 bg-slate-900/50 rounded-2xl border border-slate-700/50 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <svg className="w-full h-full">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#334155" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <div className="relative h-full flex items-center justify-around px-12">
          <div className={`flex flex-col items-center gap-3 transition-all duration-500 ${state.local_state === 'FAULT_DETECTED' ? 'animate-pulse' : ''}`}>
            <div className={`relative w-28 h-28 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border-2 ${getStatusBorderColor(nodeA.mode)} flex items-center justify-center shadow-xl transition-all duration-300 hover:scale-105`}>
              <Server className={`w-12 h-12 ${getStatusColor(nodeA.mode)}`} />
              <div className="absolute -top-2 -right-2">
                <StatusIndicator status={nodeA.mode} size="md" />
              </div>
              {state.local_state === 'SEND_DISCOVERY' || state.local_state === 'SEND_INFO' || state.local_state === 'SEND_RESPONSE' ? (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
                  <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full animate-pulse">
                    发送中
                  </span>
                </div>
              ) : null}
            </div>
            <div className="text-center">
              <div className="font-semibold text-slate-200">{nodeA.name}</div>
              <div className="text-xs text-slate-500 font-mono mt-1">{nodeA.mac_address}</div>
              <div className="text-xs text-slate-400 mt-1">状态: {state.local_state}</div>
            </div>
          </div>

          <div className="flex-1 relative mx-8">
            <svg className="w-full h-20" viewBox="0 0 300 80">
              <line
                x1="0"
                y1="40"
                x2="300"
                y2="40"
                stroke={isLinkFault ? '#ef4444' : isLinkUp ? '#22c55e' : '#64748b'}
                strokeWidth="4"
                strokeLinecap="round"
                className={isLinkFault ? 'animate-pulse' : ''}
              />

              {isLinkUp && !isLinkFault && (
                <>
                  <circle cx="50" cy="40" r="4" fill="#22c55e" className="animate-ping" />
                  <circle cx="150" cy="40" r="4" fill="#22c55e" className="animate-ping" style={{ animationDelay: '0.3s' }} />
                  <circle cx="250" cy="40" r="4" fill="#22c55e" className="animate-ping" style={{ animationDelay: '0.6s' }} />
                </>
              )}

              {pduAnimation && latestPdu && (
                <g>
                  <circle
                    cx="150"
                    cy="40"
                    r="8"
                    fill="#3b82f6"
                    className="animate-ping"
                  />
                  <circle
                    cx="150"
                    cy="40"
                    r="5"
                    fill="#60a5fa"
                  />
                </g>
              )}

              {isLinkFault && (
                <g transform="translate(150, 40)">
                  <line x1="-10" y1="-10" x2="10" y2="10" stroke="#ef4444" strokeWidth="3" />
                  <line x1="10" y1="-10" x2="-10" y2="10" stroke="#ef4444" strokeWidth="3" />
                </g>
              )}
            </svg>

            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 text-center">
              <StatusIndicator
                status={state.link_status}
                label={
                  state.link_status === 'up' ? '链路正常' :
                  state.link_status === 'fault' ? '链路故障' : '链路断开'
                }
                size="sm"
              />
            </div>
          </div>

          <div className={`flex flex-col items-center gap-3 transition-all duration-500 ${state.remote_state === 'FAULT_DETECTED' ? 'animate-pulse' : ''}`}>
            <div className={`relative w-28 h-28 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border-2 ${getStatusBorderColor(nodeB.mode)} flex items-center justify-center shadow-xl transition-all duration-300 hover:scale-105`}>
              <Server className={`w-12 h-12 ${getStatusColor(nodeB.mode)}`} />
              <div className="absolute -top-2 -right-2">
                <StatusIndicator status={nodeB.mode} size="md" />
              </div>
              {state.remote_state === 'SEND_DISCOVERY' || state.remote_state === 'SEND_INFO' || state.remote_state === 'SEND_RESPONSE' ? (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
                  <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full animate-pulse">
                    发送中
                  </span>
                </div>
              ) : null}
            </div>
            <div className="text-center">
              <div className="font-semibold text-slate-200">{nodeB.name}</div>
              <div className="text-xs text-slate-500 font-mono mt-1">{nodeB.mac_address}</div>
              <div className="text-xs text-slate-400 mt-1">状态: {state.remote_state}</div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-4 left-4 right-4 flex justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span>主动模式 (Active)</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <span>被动模式 (Passive)</span>
          </div>
        </div>
      </div>

      {latestPdu && (
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">最近 PDU</span>
            <span className={`font-mono ${latestPdu.direction === 'sent' ? 'text-cyan-400' : 'text-purple-400'}`}>
              {latestPdu.direction === 'sent' ? '发送' : '接收'}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm font-medium text-slate-200">
              {latestPdu.type.toUpperCase()}
            </span>
            <span className="text-xs text-slate-500 font-mono">
              {latestPdu.source_mac} → {latestPdu.dest_mac}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
