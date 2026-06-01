import React from 'react'
import { useCard } from '../hooks/useCard'
import { Shield, ShieldCheck, Key, Zap, BookOpen, Search } from 'lucide-react'

export function AuthPanel() {
  const {
    authKey,
    authKeyType,
    setAuthKey,
    setAuthKeyType,
    authenticate,
    authenticateAllSectors,
    deauthenticate,
    selectedSector,
    sectors,
    setShowKeyManager,
    authenticateWithDictionary,
    addCurrentKeyToDictionary,
    keyEntries
  } = useCard()

  const handleAuthKeyChange = (value: string) => {
    const cleaned = value.replace(/[^0-9a-fA-F\s]/g, '')
    setAuthKey(cleaned)
  }

  const sectorKeys =
    selectedSector !== null
      ? keyEntries.filter((k) => k.sector === selectedSector)
      : []

  return (
    <div className="bg-cyber-card border border-cyber-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-cyber-accent" />
          <span className="text-xs font-mono text-cyber-accent uppercase tracking-wider">Authentication</span>
        </div>
        <button
          onClick={() => setShowKeyManager(true)}
          className="flex items-center gap-1 px-2 py-1 text-xs font-mono bg-purple-500/10 border border-purple-500/30 rounded-lg text-purple-400 hover:bg-purple-500/20 transition-all"
        >
          <BookOpen size={12} />
          Keys {keyEntries.length > 0 && `(${keyEntries.length})`}
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-cyber-muted font-mono mb-1 block">Key Type</label>
          <div className="flex gap-2">
            <button
              onClick={() => setAuthKeyType('A')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-mono border transition-all ${
                authKeyType === 'A'
                  ? 'bg-cyber-accent/15 border-cyber-accent text-cyber-accent shadow-neon'
                  : 'bg-cyber-surface border-cyber-border text-cyber-muted hover:border-cyber-accent/30'
              }`}
            >
              <div className="flex items-center justify-center gap-1">
                <Key size={12} />
                Key A
              </div>
            </button>
            <button
              onClick={() => setAuthKeyType('B')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-mono border transition-all ${
                authKeyType === 'B'
                  ? 'bg-cyan-500/15 border-cyan-500 text-cyan-400 shadow-[0_0_10px_rgba(0,200,255,0.3)]'
                  : 'bg-cyber-surface border-cyber-border text-cyber-muted hover:border-cyan-500/30'
              }`}
            >
              <div className="flex items-center justify-center gap-1">
                <Key size={12} />
                Key B
              </div>
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs text-cyber-muted font-mono mb-1 block">Key (6 bytes hex)</label>
          <input
            type="text"
            value={authKey}
            onChange={(e) => handleAuthKeyChange(e.target.value)}
            placeholder="FF FF FF FF FF FF"
            className="w-full bg-cyber-surface border border-cyber-border rounded-lg px-3 py-2 text-sm font-mono text-cyber-accent focus:border-cyber-accent focus:outline-none focus:shadow-neon transition-all placeholder:text-cyber-muted/50"
          />
        </div>

        {sectorKeys.length > 0 && selectedSector !== null && (
          <div>
            <label className="text-xs text-cyber-muted font-mono mb-1 block">
              Saved keys for Sector {selectedSector}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {sectorKeys.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => {
                    setAuthKey(
                      entry.key
                        .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
                        .join(' ')
                    )
                    setAuthKeyType(entry.keyType)
                  }}
                  className={`px-2 py-1 text-[10px] font-mono rounded border transition-all ${
                    authKeyType === entry.keyType &&
                    entry.key.every(
                      (b, i) =>
                        b ===
                        parseInt(authKey.replace(/\s+/g, '').substring(i * 2, i * 2 + 2), 16)
                    )
                      ? entry.keyType === 'A'
                        ? 'bg-cyber-accent/20 border-cyber-accent text-cyber-accent'
                        : 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                      : 'bg-cyber-surface border-cyber-border text-cyber-muted hover:border-cyber-accent/30'
                  }`}
                >
                  {entry.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => {
              if (selectedSector !== null) {
                authenticate(selectedSector)
              }
            }}
            disabled={selectedSector === null}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-cyber-accent/10 border border-cyber-accent/40 rounded-lg text-cyber-accent text-sm font-mono hover:bg-cyber-accent/20 hover:shadow-neon transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ShieldCheck size={12} />
            Auth Sector
          </button>
          <button
            onClick={authenticateAllSectors}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-cyan-500/10 border border-cyan-500/40 rounded-lg text-cyan-400 text-sm font-mono hover:bg-cyan-500/20 transition-all"
          >
            <Zap size={12} />
            Auth All
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => selectedSector !== null && authenticateWithDictionary(selectedSector)}
            disabled={selectedSector === null || sectorKeys.length === 0}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-orange-500/10 border border-orange-500/40 rounded-lg text-orange-400 text-sm font-mono hover:bg-orange-500/20 transition-all disabled:opacity-30"
          >
            <Search size={12} />
            Try Dictionary
          </button>
          <button
            onClick={addCurrentKeyToDictionary}
            disabled={selectedSector === null}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-purple-500/10 border border-purple-500/40 rounded-lg text-purple-400 text-sm font-mono hover:bg-purple-500/20 transition-all disabled:opacity-30"
          >
            <BookOpen size={12} />
            Save Key
          </button>
        </div>

        {selectedSector !== null && sectors[selectedSector] && (
          <div className="flex items-center gap-2 text-xs font-mono">
            {sectors[selectedSector].authenticated ? (
              <>
                <ShieldCheck size={12} className="text-cyber-accent" />
                <span className="text-cyber-accent">
                  Sector {selectedSector} authenticated (Key {sectors[selectedSector].authenticatedWith})
                </span>
                <button
                  onClick={() => deauthenticate(selectedSector)}
                  className="ml-auto text-cyber-danger hover:text-red-300 transition-colors"
                >
                  DEAUTH
                </button>
              </>
            ) : (
              <>
                <Shield size={12} className="text-cyber-muted" />
                <span className="text-cyber-muted">Sector {selectedSector} not authenticated</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
