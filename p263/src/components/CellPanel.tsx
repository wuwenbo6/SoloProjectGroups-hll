import type { Cell } from '@/types';

interface CellPanelProps {
  cells: Cell[];
  servingPci: number;
}

function formatSign(value: number) {
  return value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

export function CellPanel({ cells, servingPci }: CellPanelProps) {
  const servingCell = cells.find((c) => c.is_serving);
  const neighborCells = cells.filter((c) => !c.is_serving);

  const getRsrpColor = (rsrp: number) => {
    if (rsrp >= -80) return 'text-accent-primary';
    if (rsrp >= -100) return 'text-accent-info';
    if (rsrp >= -120) return 'text-yellow-400';
    return 'text-accent-warning';
  };

  const getRsrpBgColor = (rsrp: number) => {
    if (rsrp >= -80) return 'bg-accent-primary/20';
    if (rsrp >= -100) return 'bg-accent-info/20';
    if (rsrp >= -120) return 'bg-yellow-400/20';
    return 'bg-accent-warning/20';
  };

  const CellCard = ({ cell }: { cell: Cell }) => (
    <div
      className={`rounded-lg border p-4 transition-all ${
        cell.is_serving
          ? 'border-accent-primary bg-bg-secondary/80 shadow-lg shadow-accent-primary/10'
          : 'border-bg-tertiary bg-bg-secondary/40 hover:border-accent-info/50'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${
              cell.is_serving ? 'bg-accent-primary animate-pulse' : 'bg-accent-info'
            }`}
          />
          <span className="font-display font-semibold text-text-primary">
            PCI {cell.pci}
          </span>
          {cell.is_serving && (
            <span className="text-[10px] px-2 py-0.5 bg-accent-primary/20 text-accent-primary rounded font-semibold">
              SERVING
            </span>
          )}
        </div>
        <div className={`text-xs px-2 py-1 rounded font-mono ${getRsrpBgColor(cell.rsrp)}`}>
          <span className={`font-display font-bold text-lg ${getRsrpColor(cell.rsrp)}`}>
            {cell.rsrp.toFixed(0)}
          </span>
          <span className="text-text-secondary ml-1">dBm</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex justify-between">
          <span className="text-text-secondary">EARFCN:</span>
          <span className="text-text-primary font-mono">{cell.earfcn}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">Q_rxlevmin:</span>
          <span className="text-text-primary font-mono">{cell.q_rxlevmin} dBm</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">Q_hyst:</span>
          <span className="text-text-primary font-mono">{cell.q_hyst} dB</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">Q_offset:</span>
          <span className="text-text-primary font-mono">{cell.q_offset} dB</span>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-bg-tertiary">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-text-secondary">S_rxlev:</span>
          <span
            className={`font-display font-bold ${
              cell.s_rxlev > 0 ? 'text-accent-primary' : 'text-accent-warning'
            }`}
          >
            {formatSign(cell.s_rxlev)} dB
          </span>
        </div>
        <div className="w-full h-2 bg-bg-tertiary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              cell.s_rxlev > 0 ? 'bg-accent-primary' : 'bg-accent-warning'
            }`}
            style={{
              width: `${Math.min(100, Math.max(0, (cell.s_rxlev / 100) * 100 + 20))}%`,
            }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-text-muted mt-1">
          <span>-40 dB</span>
          <span>0 dB</span>
          <span>60 dB</span>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-text-secondary">R value:</span>
        <span className="font-mono text-accent-info font-semibold">
          {formatSign(cell.r_value)} dB
        </span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-display font-semibold text-text-primary mb-2 flex items-center gap-2">
          <span className="w-1 h-4 bg-accent-primary rounded-full" />
          Serving Cell
        </h3>
        {servingCell && <CellCard cell={servingCell} />}
      </div>

      <div>
        <h3 className="text-sm font-display font-semibold text-text-primary mb-2 flex items-center gap-2">
          <span className="w-1 h-4 bg-accent-info rounded-full" />
          Neighbor Cells ({neighborCells.length})
        </h3>
        <div className="space-y-3">
          {neighborCells.map((cell) => (
            <CellCard key={cell.pci} cell={cell} />
          ))}
        </div>
      </div>
    </div>
  );
}
