import { useState } from 'react';
import { Power, PowerOff } from 'lucide-react';

interface BlackoutButtonProps {
  active: boolean;
  onChange: (active: boolean) => void;
  disabled?: boolean;
}

export function BlackoutButton({
  active,
  onChange,
  disabled = false,
}: BlackoutButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleClick = () => {
    if (active) {
      onChange(false);
    } else {
      setShowConfirm(true);
    }
  };

  const handleConfirm = () => {
    onChange(true);
    setShowConfirm(false);
  };

  return (
    <div className="p-4 bg-console-panel border-t border-console-border">
      <div className="text-xs text-console-muted mb-2 uppercase tracking-wider font-medium text-center">
        黑场控制
      </div>

      <div className="relative">
        <button
          onClick={handleClick}
          disabled={disabled}
          className={`w-full py-4 px-6 rounded-lg font-bold text-lg flex items-center justify-center gap-3 transition-all ${
            active
              ? 'bg-console-warning text-white shadow-lg shadow-console-warning/50'
              : 'bg-console-border text-console-text hover:bg-console-warning hover:text-white hover:shadow-lg hover:shadow-console-warning/30'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {active ? (
            <>
              <Power size={24} />
              解除黑场
            </>
          ) : (
            <>
              <PowerOff size={24} />
              黑场
            </>
          )}
        </button>

        {showConfirm && (
          <div className="absolute inset-0 bg-console-panel border-2 border-console-warning rounded-lg flex items-center gap-2 p-2 z-10">
            <span className="text-xs text-console-text flex-1">
              确认全部通道归零？
            </span>
            <button
              onClick={() => setShowConfirm(false)}
              className="px-3 py-2 text-sm rounded bg-console-border text-console-text hover:bg-console-border/80"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              className="px-3 py-2 text-sm rounded bg-console-warning text-white font-medium hover:bg-console-warning/80"
            >
              确认
            </button>
          </div>
        )}
      </div>

      {active && (
        <div className="mt-2 text-center text-xs text-console-warning font-mono animate-pulse">
          BLACKOUT ACTIVE - 所有通道输出为 0
        </div>
      )}
    </div>
  );
}
