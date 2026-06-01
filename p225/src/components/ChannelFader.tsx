import { useState, useCallback, useRef, useEffect } from 'react';

interface ChannelFaderProps {
  channel: number;
  value: number;
  onChange: (channel: number, value: number) => void;
  disabled?: boolean;
}

export function ChannelFader({
  channel,
  value,
  onChange,
  disabled = false,
}: ChannelFaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setEditValue(String(value));
    }
  }, [value, isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value);
      onChange(channel, val);
    },
    [channel, onChange]
  );

  const handleValueClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleEditBlur = useCallback(() => {
    const val = Math.max(0, Math.min(255, Math.floor(Number(editValue) || 0)));
    onChange(channel, val);
    setIsEditing(false);
  }, [channel, editValue, onChange]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleEditBlur();
      } else if (e.key === 'Escape') {
        setEditValue(String(value));
        setIsEditing(false);
      }
    },
    [handleEditBlur, value]
  );

  const percentage = (value / 255) * 100;
  const isActive = value > 0;

  return (
    <div className="flex flex-col items-center gap-1 px-1 py-2 group">
      {isEditing ? (
        <input
          ref={inputRef}
          type="number"
          min={0}
          max={255}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleEditBlur}
          onKeyDown={handleEditKeyDown}
          className="w-10 h-6 text-center font-mono text-xs bg-console-panel border border-console-accent rounded text-console-text outline-none"
        />
      ) : (
        <div
          onClick={handleValueClick}
          className={`w-10 h-6 flex items-center justify-center font-mono text-xs rounded cursor-pointer transition-colors ${
            isActive
              ? 'bg-console-accent/20 text-console-accent'
              : 'bg-console-panel text-console-muted hover:text-console-text'
          }`}
        >
          {value}
        </div>
      )}

      <div className="relative h-48 flex items-end justify-center">
        <div
          className="absolute bottom-0 w-1 bg-gradient-to-t from-console-border to-console-panel rounded-full"
          style={{ height: '100%' }}
        />

        <div
          className="absolute bottom-0 w-3 bg-gradient-to-t from-console-accent/80 to-console-accent/20 rounded-full transition-all duration-75"
          style={{ height: `${percentage}%` }}
        />

        <input
          type="range"
          min={0}
          max={255}
          value={value}
          onChange={handleSliderChange}
          disabled={disabled}
          className="vertical-slider relative z-10 opacity-0 hover:opacity-100"
          style={{ position: 'absolute', bottom: 0 }}
        />

        <div
          className="absolute z-20 w-5 h-6 pointer-events-none rounded-sm shadow-lg"
          style={{
            bottom: `calc(${percentage}% - 12px)`,
            background:
              'linear-gradient(180deg, #fbbf24 0%, #d97706 100%)',
            border: '2px solid #fef3c7',
          }}
        />
      </div>

      <div
        className={`font-mono text-[10px] ${
          isActive ? 'text-console-accent' : 'text-console-muted'
        }`}
      >
        {channel.toString().padStart(3, '0')}
      </div>
    </div>
  );
}
