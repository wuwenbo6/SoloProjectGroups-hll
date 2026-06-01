interface GrandMasterProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function GrandMaster({
  value,
  onChange,
  disabled = false,
}: GrandMasterProps) {
  const percentage = value * 100;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value) / 100;
    onChange(val);
  };

  return (
    <div className="flex flex-col items-center p-4 bg-console-panel border-l border-console-border">
      <div className="text-xs text-console-muted mb-2 uppercase tracking-wider font-medium">
        Grand Master
      </div>

      <div className="relative h-64 flex items-end justify-center">
        <div className="absolute bottom-0 w-4 bg-gradient-to-t from-console-border to-console-panel rounded-full h-full" />

        <div
          className="absolute bottom-0 w-6 bg-gradient-to-t from-console-accent/80 to-console-accent/30 rounded-full transition-all duration-75"
          style={{ height: `${percentage}%` }}
        />

        <input
          type="range"
          min={0}
          max={100}
          value={percentage}
          onChange={handleSliderChange}
          disabled={disabled}
          className="vertical-slider absolute bottom-0 cursor-pointer"
          style={{ height: '256px', width: '32px' }}
        />

        <div
          className="absolute z-20 w-8 h-10 pointer-events-none rounded-sm shadow-lg"
          style={{
            bottom: `calc(${percentage}% - 20px)`,
            background:
              'linear-gradient(180deg, #fbbf24 0%, #d97706 100%)',
            border: '2px solid #fef3c7',
          }}
        />
      </div>

      <div className="mt-3 font-mono text-lg font-bold text-console-accent">
        {Math.round(percentage)}%
      </div>
    </div>
  );
}
