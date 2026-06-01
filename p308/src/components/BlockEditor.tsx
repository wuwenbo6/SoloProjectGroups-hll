import React from 'react'
import { useCard } from '../hooks/useCard'
import { bytesToHex, parseValueBlock } from '../utils/hex'
import { FileEdit, Upload, Download } from 'lucide-react'

export function BlockEditor() {
  const {
    selectedSector,
    selectedBlock,
    sectors,
    writeData,
    setWriteData,
    readBlock,
    writeBlock,
    setSelectedBlock
  } = useCard()

  if (selectedSector === null) {
    return (
      <div className="bg-cyber-card border border-cyber-border rounded-lg p-4 flex items-center justify-center h-48">
        <span className="text-cyber-muted font-mono text-sm">Select a sector to view block data</span>
      </div>
    )
  }

  const sector = sectors[selectedSector]
  if (!sector) return null

  const sectorAuthenticated = sector.authenticated

  return (
    <div className="bg-cyber-card border border-cyber-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        <FileEdit size={14} className="text-cyber-accent" />
        <span className="text-xs font-mono text-cyber-accent uppercase tracking-wider">
          Sector {selectedSector} - Block Data
        </span>
        {sectorAuthenticated && (
          <span className="text-xs bg-cyber-accent/10 text-cyber-accent px-2 py-0.5 rounded border border-cyber-accent/30 ml-auto">
            Key {sector.authenticatedWith}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {sector.blocks.map((block) => {
          const isSelected = selectedBlock === block.blockNumber
          const blockAddr = `0x${block.blockNumber.toString(16).padStart(2, '0').toUpperCase()}`
          const hexData = bytesToHex(block.data)
          const asciiData = block.data
            .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
            .join('')

          return (
            <div
              key={block.blockNumber}
              onClick={() => setSelectedBlock(block.blockNumber)}
              className={`rounded-lg p-3 cursor-pointer border transition-all ${
                isSelected
                  ? 'border-cyber-accent bg-cyber-accent/5 shadow-neon'
                  : 'border-cyber-border bg-cyber-surface hover:border-cyber-accent/30'
              }`}
            >
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-mono text-cyber-muted w-12">
                  Block {block.blockNumber}
                </span>
                <span className="text-xs font-mono text-cyber-accent/60">{blockAddr}</span>
                {block.isTrailer && (
                  <span className="text-xs bg-yellow-500/10 text-yellow-400 px-1.5 py-0.5 rounded border border-yellow-500/30">
                    TRAILER
                  </span>
                )}
                {block.isReadOnly && (
                  <span className="text-xs bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded border border-red-500/30">
                    READONLY
                  </span>
                )}
                {block.isValueBlock && (
                  <span className="text-xs bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/30">
                    VALUE
                  </span>
                )}
                {!sectorAuthenticated && !block.isReadOnly && (
                  <span className="text-xs bg-cyber-border text-cyber-muted px-1.5 py-0.5 rounded">
                    LOCKED
                  </span>
                )}
              </div>

              <div className="font-mono text-xs flex gap-4">
                <span className={`${sectorAuthenticated ? 'text-gray-300' : 'text-cyber-muted'}`}>
                  {sectorAuthenticated ? hexData : 'XX XX XX XX XX XX XX XX XX XX XX XX XX XX XX XX'}
                </span>
              </div>

              {sectorAuthenticated && block.isTrailer && (
                <div className="mt-1 text-xs font-mono flex gap-2">
                  <span className="text-red-400">
                    Key A: {bytesToHex(block.data.slice(0, 6))}
                  </span>
                  <span className="text-yellow-400">
                    Access: {bytesToHex(block.data.slice(6, 10))}
                  </span>
                  <span className="text-cyan-400">
                    Key B: {bytesToHex(block.data.slice(10, 16))}
                  </span>
                </div>
              )}

              {sectorAuthenticated && block.isValueBlock && (
                <div className="mt-1 text-xs font-mono">
                  {(() => {
                    const vbInfo = parseValueBlock(block.data)
                    if (vbInfo.valid) {
                      return (
                        <div className="flex gap-3">
                          <span className="text-purple-400">
                            Value: {vbInfo.value} (0x{vbInfo.value?.toString(16).padStart(8, '0').toUpperCase()})
                          </span>
                          <span className="text-purple-300">
                            Addr: 0x{vbInfo.address?.toString(16).padStart(2, '0').toUpperCase()}
                          </span>
                        </div>
                      )
                    }
                    return (
                      <span className="text-red-400">
                        Invalid Value Block: {vbInfo.error}
                      </span>
                    )
                  })()}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {selectedBlock !== null && sectorAuthenticated && (
        <div className="mt-4 pt-4 border-t border-cyber-border">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono text-cyber-muted">
              Write to Block {selectedBlock}:
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={writeData}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^0-9a-fA-F\s]/g, '')
                setWriteData(cleaned)
              }}
              placeholder="00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00"
              className="flex-1 bg-cyber-surface border border-cyber-border rounded-lg px-3 py-2 text-xs font-mono text-cyber-accent focus:border-cyber-accent focus:outline-none focus:shadow-neon transition-all placeholder:text-cyber-muted/50"
            />
            <button
              onClick={() => readBlock(selectedBlock)}
              className="flex items-center gap-1 px-3 py-2 bg-cyan-500/10 border border-cyan-500/40 rounded-lg text-cyan-400 text-xs font-mono hover:bg-cyan-500/20 transition-all"
            >
              <Download size={12} />
              Read
            </button>
            <button
              onClick={() => writeBlock(selectedBlock)}
              className="flex items-center gap-1 px-3 py-2 bg-cyber-accent/10 border border-cyber-accent/40 rounded-lg text-cyber-accent text-xs font-mono hover:bg-cyber-accent/20 hover:shadow-neon transition-all"
            >
              <Upload size={12} />
              Write
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
