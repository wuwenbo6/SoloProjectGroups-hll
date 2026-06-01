import React, { useState } from 'react'
import { useCard } from '../hooks/useCard'
import { bytesToHex, hexToBytes } from '../utils/hex'
import { Key, Plus, Trash2, Upload, Download, BookOpen, X, Edit2, Check } from 'lucide-react'
import type { KeyEntry } from '../types'

export function KeyManager() {
  const {
    keyEntries,
    selectedSector,
    showKeyManager,
    setShowKeyManager,
    addKeyEntry,
    removeKeyEntry,
    updateKeyEntry,
    setAuthKey,
    setAuthKeyType,
    authenticateWithDictionary,
    authenticateAllWithDictionary,
    exportKeys,
    importKeys,
    addCurrentKeyToDictionary,
    addLog
  } = useCard()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [newKeyHex, setNewKeyHex] = useState('')

  if (!showKeyManager) return null

  const addNewKey = () => {
    const keyBytes = hexToBytes(newKeyHex)
    if (keyBytes.length !== 6) {
      addLog({ direction: 'error', message: 'Invalid key: must be 6 bytes' })
      return
    }
    if (selectedSector === null) {
      addLog({ direction: 'error', message: 'Select a sector first' })
      return
    }

    addKeyEntry({
      name: `Sector ${selectedSector} Key A`,
      sector: selectedSector,
      keyType: 'A',
      key: keyBytes
    })
    setNewKeyHex('')
    addLog({ direction: 'info', message: `Key added for sector ${selectedSector}` })
  }

  const startEditing = (entry: KeyEntry) => {
    setEditingId(entry.id)
    setEditName(entry.name)
  }

  const saveEditing = (id: string) => {
    updateKeyEntry(id, { name: editName })
    setEditingId(null)
    setEditName('')
  }

  const useKey = (entry: KeyEntry) => {
    setAuthKey(bytesToHex(entry.key))
    setAuthKeyType(entry.keyType)
    addLog({ direction: 'info', message: `Loaded key: ${entry.name}` })
  }

  const sectors = Array.from({ length: 16 }, (_, i) => i)
  const keysBySector = sectors.map((s) => keyEntries.filter((k) => k.sector === s))

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-cyber-card border border-cyber-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-cyber-border bg-cyber-surface">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-cyber-accent" />
            <h2 className="text-lg font-mono font-bold text-gray-100">Key Dictionary Manager</h2>
            <span className="text-xs text-cyber-muted font-mono ml-2">
              {keyEntries.length} entries
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={importKeys}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-cyan-400 hover:bg-cyan-500/20 transition-all"
            >
              <Upload size={12} />
              Import
            </button>
            <button
              onClick={exportKeys}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-purple-500/10 border border-purple-500/30 rounded-lg text-purple-400 hover:bg-purple-500/20 transition-all"
            >
              <Download size={12} />
              Export
            </button>
            <button
              onClick={addCurrentKeyToDictionary}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-cyber-accent/10 border border-cyber-accent/30 rounded-lg text-cyber-accent hover:bg-cyber-accent/20 hover:shadow-neon transition-all"
            >
              <Plus size={12} />
              Add Current
            </button>
            <button
              onClick={() => setShowKeyManager(false)}
              className="p-1.5 rounded-lg hover:bg-cyber-border transition-colors text-cyber-muted hover:text-gray-300"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-cyber-border flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Key size={14} className="text-cyber-accent" />
            <input
              type="text"
              value={newKeyHex}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^0-9a-fA-F\s]/g, '')
                setNewKeyHex(cleaned)
              }}
              placeholder="New key (6 bytes hex): FF FF FF FF FF FF"
              className="flex-1 bg-cyber-surface border border-cyber-border rounded-lg px-3 py-1.5 text-xs font-mono text-cyber-accent focus:border-cyber-accent focus:outline-none focus:shadow-neon transition-all placeholder:text-cyber-muted/50"
            />
            <span className="text-xs text-cyber-muted font-mono">
              Sector {selectedSector ?? 'None'}
            </span>
          </div>
          <button
            onClick={addNewKey}
            disabled={selectedSector === null}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-cyber-accent/10 border border-cyber-accent/30 rounded-lg text-cyber-accent hover:bg-cyber-accent/20 transition-all disabled:opacity-30"
          >
            <Plus size={12} />
            Add Key
          </button>
        </div>

        <div className="px-6 py-3 border-b border-cyber-border flex gap-2">
          <button
            onClick={() => selectedSector !== null && authenticateWithDictionary(selectedSector)}
            disabled={selectedSector === null}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-mono bg-orange-500/10 border border-orange-500/30 rounded-lg text-orange-400 hover:bg-orange-500/20 transition-all disabled:opacity-30"
          >
            <Key size={12} />
            Try on Sector {selectedSector ?? '?'}
          </button>
          <button
            onClick={authenticateAllWithDictionary}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-mono bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 hover:bg-red-500/20 transition-all"
          >
            <Key size={12} />
            Dictionary Attack All
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            {sectors.map((sectorIdx) => {
              const keys = keysBySector[sectorIdx]
              if (keys.length === 0) return null

              return (
                <div key={sectorIdx} className="bg-cyber-surface/50 rounded-lg border border-cyber-border overflow-hidden">
                  <div className="px-4 py-2 border-b border-cyber-border bg-cyber-dim/50">
                    <span className="text-xs font-mono text-cyber-accent font-bold">
                      Sector {sectorIdx.toString().padStart(2, '0')}
                    </span>
                    <span className="text-xs text-cyber-muted font-mono ml-2">
                      {keys.length} {keys.length === 1 ? 'key' : 'keys'}
                    </span>
                  </div>
                  <div className="p-2 space-y-1.5">
                    {keys.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cyber-card/50 border border-cyber-border/50 hover:border-cyber-accent/30 transition-all"
                      >
                        <div
                          className={`w-2 h-2 rounded-full ${
                            entry.keyType === 'A'
                              ? 'bg-cyber-accent shadow-[0_0_6px_rgba(0,255,136,0.5)]'
                              : 'bg-cyan-400 shadow-[0_0_6px_rgba(0,200,255,0.5)]'
                          }`}
                        />
                        {editingId === entry.id ? (
                          <>
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="flex-1 bg-cyber-surface border border-cyber-accent rounded px-2 py-0.5 text-xs font-mono text-gray-200 focus:outline-none"
                              autoFocus
                            />
                            <button
                              onClick={() => saveEditing(entry.id)}
                              className="p-1 rounded text-cyber-accent hover:bg-cyber-accent/10"
                            >
                              <Check size={12} />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="text-xs font-mono text-gray-300 min-w-24">
                              {entry.name}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                entry.keyType === 'A'
                                  ? 'bg-cyber-accent/10 text-cyber-accent'
                                  : 'bg-cyan-500/10 text-cyan-400'
                              }`}
                            >
                              Key {entry.keyType}
                            </span>
                            <span className="text-xs font-mono text-cyber-muted flex-1">
                              {bytesToHex(entry.key)}
                            </span>
                            <button
                              onClick={() => startEditing(entry)}
                              className="p-1 rounded text-cyber-muted hover:text-yellow-400 hover:bg-yellow-500/10 transition-all"
                              title="Rename"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              onClick={() => useKey(entry)}
                              className="p-1 rounded text-cyber-muted hover:text-cyber-accent hover:bg-cyber-accent/10 transition-all"
                              title="Use this key"
                            >
                              <Key size={12} />
                            </button>
                            <button
                              onClick={() => removeKeyEntry(entry.id)}
                              className="p-1 rounded text-cyber-muted hover:text-cyber-danger hover:bg-cyber-danger/10 transition-all"
                              title="Delete"
                            >
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

            {keyEntries.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-cyber-muted">
                <BookOpen size={48} className="mb-3 opacity-30" />
                <p className="text-sm font-mono">No keys in dictionary</p>
                <p className="text-xs font-mono mt-1">Add keys using the "Add Current" button</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
