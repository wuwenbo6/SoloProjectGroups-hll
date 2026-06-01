import React from 'react'
import { useCard } from '../hooks/useCard'
import { ShieldCheck, Lock, Grid3x3 } from 'lucide-react'

export function SectorGrid() {
  const { sectors, selectedSector, setSelectedSector } = useCard()

  return (
    <div className="bg-cyber-card border border-cyber-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        <Grid3x3 size={14} className="text-cyber-accent" />
        <span className="text-xs font-mono text-cyber-accent uppercase tracking-wider">Sectors</span>
        <span className="text-xs text-cyber-muted ml-auto font-mono">0-15</span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {sectors.map((sector) => {
          const isSelected = selectedSector === sector.sectorNumber
          const isAuth = sector.authenticated

          return (
            <button
              key={sector.sectorNumber}
              onClick={() => setSelectedSector(sector.sectorNumber)}
              className={`relative p-3 rounded-lg border transition-all text-left group ${
                isSelected
                  ? isAuth
                    ? 'border-cyber-accent bg-cyber-accent/10 shadow-neon'
                    : 'border-cyan-500 bg-cyan-500/10 shadow-[0_0_10px_rgba(0,200,255,0.3)]'
                  : 'border-cyber-border bg-cyber-surface hover:border-cyber-accent/40'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-mono font-bold text-gray-200">
                  S{sector.sectorNumber.toString().padStart(2, '0')}
                </span>
                {isAuth ? (
                  <ShieldCheck
                    size={12}
                    className={
                      sector.authenticatedWith === 'A'
                        ? 'text-cyber-accent'
                        : 'text-cyan-400'
                    }
                  />
                ) : (
                  <Lock size={12} className="text-cyber-muted" />
                )}
              </div>

              <div className="text-xs font-mono text-cyber-muted">
                {isAuth ? (
                  <span className={sector.authenticatedWith === 'A' ? 'text-cyber-accent' : 'text-cyan-400'}>
                    Key {sector.authenticatedWith}
                  </span>
                ) : (
                  <span>Locked</span>
                )}
              </div>

              <div className="mt-1 flex gap-0.5">
                {sector.blocks.map((block) => {
                  const hasData = block.data.some((b) => b !== 0)
                  return (
                    <div
                      key={block.blockNumber}
                      className={`w-3 h-1.5 rounded-sm ${
                        block.isTrailer
                          ? 'bg-yellow-500/60'
                          : block.isReadOnly
                            ? 'bg-red-500/60'
                            : hasData && isAuth
                              ? 'bg-cyber-accent/60'
                              : 'bg-cyber-border'
                      }`}
                      title={`Block ${block.blockNumber}`}
                    />
                  )
                })}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
