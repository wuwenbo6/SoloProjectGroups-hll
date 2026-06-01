import type { Cell } from '@/types';

interface SCriterionPanelProps {
  cells: Cell[];
}

export function SCriterionPanel({ cells }: SCriterionPanelProps) {
  const servingCell = cells.find((c) => c.is_serving);
  const neighborCells = cells.filter((c) => !c.is_serving);
  const allCells = servingCell ? [servingCell, ...neighborCells] : neighborCells;
  const maxSrxlev = Math.max(...allCells.map((c) => Math.abs(c.s_rxlev)), 10);

  return (
    <div className="bg-bg-secondary/40 rounded-lg border border-bg-tertiary p-4">
      <h3 className="text-sm font-display font-semibold text-text-primary mb-3 flex items-center gap-2">
        <span className="w-1 h-4 bg-accent-primary rounded-full" />
        S Criterion Calculation
      </h3>

      <div className="bg-bg-tertiary/50 rounded-lg p-4 mb-4">
        <div className="font-mono text-center">
          <div className="text-text-secondary text-xs mb-2">Formula</div>
          <div className="text-lg text-text-primary font-display">
            S<sub>rxlev</sub> = Q<sub>rxlevmeas</sub> - (Q<sub>rxlevmin</sub> + Q<sub>rxlevminoffset</sub>) - P<sub>compensation</sub>
          </div>
          <div className="text-text-muted text-xs mt-2">
            Condition: S<sub>rxlev</sub> {'>'} 0 &nbsp;→&nbsp; Cell is eligible for camping
          </div>
        </div>
      </div>

      {servingCell && (
        <div className="mb-4 p-3 bg-accent-primary/10 rounded-lg border border-accent-primary/30">
          <div className="text-xs text-text-secondary mb-2">Serving Cell (PCI {servingCell.pci})</div>
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div>
              <div className="text-text-muted">Q<sub>rxlevmeas</sub></div>
              <div className="font-mono font-semibold text-text-primary">{servingCell.rsrp.toFixed(1)}</div>
            </div>
            <div>
              <div className="text-text-muted">Q<sub>rxlevmin</sub></div>
              <div className="font-mono font-semibold text-text-primary">{servingCell.q_rxlevmin}</div>
            </div>
            <div>
              <div className="text-text-muted">Q<sub>rxlevminoffset</sub></div>
              <div className="font-mono font-semibold text-text-primary">{servingCell.q_rxlevminoffset}</div>
            </div>
            <div>
              <div className="text-text-muted">S<sub>rxlev</sub></div>
              <div className="font-mono font-bold text-accent-primary">{servingCell.s_rxlev.toFixed(1)}</div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="text-xs text-text-secondary mb-2">Neighbor Cells S<sub>rxlev</sub> Comparison</div>
        {neighborCells.map((cell) => (
          <div key={cell.pci} className="flex items-center gap-3">
            <div className="w-16 text-xs text-text-secondary font-mono">PCI {cell.pci}</div>
            <div className="flex-1 h-6 bg-bg-tertiary rounded-full overflow-hidden relative">
              <div className="absolute inset-y-0 left-1/2 w-px bg-text-muted/30" />
              <div
                className={`h-full transition-all duration-300 ${
                  cell.s_rxlev > 0 ? 'bg-accent-primary' : 'bg-accent-warning'
                }`}
                style={{
                  width: `${(Math.abs(cell.s_rxlev) / maxSrxlev) * 45}%`,
                  marginLeft: cell.s_rxlev >= 0 ? '50%' : `${50 - (Math.abs(cell.s_rxlev) / maxSrxlev) * 45}%`,
                }}
              />
            </div>
            <div
              className={`w-20 text-right font-mono font-semibold text-sm ${
                cell.s_rxlev > 0 ? 'text-accent-primary' : 'text-accent-warning'
              }`}
            >
              {cell.s_rxlev >= 0 ? '+' : ''}{cell.s_rxlev.toFixed(1)} dB
            </div>
            <div className="w-16 text-center">
              {cell.s_rxlev > 0 ? (
                <span className="text-[10px] px-2 py-0.5 bg-accent-primary/20 text-accent-primary rounded font-semibold">
                  OK
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 bg-accent-warning/20 text-accent-warning rounded font-semibold">
                  FAIL
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-bg-tertiary">
        <div className="flex justify-between text-[10px] text-text-muted">
          <span>Fail (S &lt; 0)</span>
          <span>0 dB</span>
          <span>Pass (S &gt; 0)</span>
        </div>
      </div>
    </div>
  );
}
