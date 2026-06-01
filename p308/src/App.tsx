import React, { useEffect } from 'react'
import { useCard } from './hooks/useCard'
import { SectorGrid } from './components/SectorGrid'
import { BlockEditor } from './components/BlockEditor'
import { AuthPanel } from './components/AuthPanel'
import { ReaderStatus } from './components/ReaderStatus'
import { OperationLog } from './components/OperationLog'
import { KeyManager } from './components/KeyManager'
import { Cpu, RotateCcw, Shield, Zap, Download, Upload } from 'lucide-react'

export default function App() {
  const { connectReader, refreshCardData, resetCard, readerInfo, sectors, exportDump, importDump } = useCard()

  useEffect(() => {
    connectReader()
  }, [])

  const authCount = sectors.filter((s) => s.authenticated).length
  const totalBlocks = sectors.reduce((acc, s) => {
    return acc + s.blocks.filter((b) => b.data.some((d) => d !== 0)).length
  }, 0)

  return (
    <div className="min-h-screen bg-cyber-bg text-gray-200 font-ui">
      <header className="border-b border-cyber-border bg-cyber-dim/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Cpu size={24} className="text-cyber-accent" />
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-cyber-accent rounded-full animate-pulse-glow" />
            </div>
            <div>
              <h1 className="text-lg font-bold font-mono text-gray-100 tracking-tight">
                MIFARE Classic 1K
              </h1>
              <p className="text-xs text-cyber-muted font-mono">Card Simulator</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-xs font-mono">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyber-surface border border-cyber-border">
                <Shield size={12} className={authCount > 0 ? 'text-cyber-accent' : 'text-cyber-muted'} />
                <span className="text-cyber-muted">Auth:</span>
                <span className={authCount > 0 ? 'text-cyber-accent' : 'text-cyber-muted'}>
                  {authCount}/16
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyber-surface border border-cyber-border">
                <Zap size={12} className="text-cyan-400" />
                <span className="text-cyber-muted">Data:</span>
                <span className="text-cyan-400">{totalBlocks} blocks</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={importDump}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono hover:bg-cyan-500/20 transition-all"
              >
                <Upload size={12} />
                Import Dump
              </button>
              <button
                onClick={exportDump}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyber-accent/10 border border-cyber-accent/30 text-cyber-accent text-xs font-mono hover:bg-cyber-accent/20 hover:shadow-neon transition-all"
              >
                <Download size={12} />
                Export Dump
              </button>
              <button
                onClick={resetCard}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyber-danger/10 border border-cyber-danger/30 text-cyber-danger text-xs font-mono hover:bg-cyber-danger/20 hover:shadow-neon-danger transition-all"
              >
                <RotateCcw size={12} />
                Reset
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-3 space-y-4">
            <ReaderStatus />
            <AuthPanel />
          </div>

          <div className="col-span-12 lg:col-span-4">
            <SectorGrid />
          </div>

          <div className="col-span-12 lg:col-span-5">
            <BlockEditor />
          </div>

          <div className="col-span-12">
            <OperationLog />
          </div>
        </div>
      </main>

      <KeyManager />

      <footer className="border-t border-cyber-border py-3 mt-6">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-xs text-cyber-muted font-mono">
          <span>MIFARE Classic 1K Simulator v1.0</span>
          <span>16 Sectors · 64 Blocks · 1024 Bytes</span>
        </div>
      </footer>
    </div>
  )
}
