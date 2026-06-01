import { CHANNEL_COUNT } from '../../shared/types';

interface GroupNavigationProps {
  activeGroup: number;
  onGroupChange: (group: number) => void;
  channels: number[];
  groupSize?: number;
}

export function GroupNavigation({
  activeGroup,
  onGroupChange,
  channels,
  groupSize = 32,
}: GroupNavigationProps) {
  const groupCount = Math.ceil(CHANNEL_COUNT / groupSize);
  const groups = Array.from({ length: groupCount }, (_, i) => i);

  const getGroupActiveChannels = (group: number) => {
    const start = group * groupSize;
    const end = Math.min(start + groupSize, CHANNEL_COUNT);
    let active = 0;
    for (let i = start; i < end; i++) {
      if (channels[i] > 0) active++;
    }
    return active;
  };

  return (
    <div className="flex flex-wrap gap-1 p-3 bg-console-panel border-b border-console-border">
      {groups.map((group) => {
        const startChannel = group * groupSize + 1;
        const endChannel = Math.min(startChannel + groupSize - 1, CHANNEL_COUNT);
        const activeCount = getGroupActiveChannels(group);

        return (
          <button
            key={group}
            onClick={() => onGroupChange(group)}
            className={`px-3 py-1.5 rounded text-sm font-mono transition-all ${
              activeGroup === group
                ? 'bg-console-accent text-black font-bold shadow-lg shadow-console-accent/30'
                : 'bg-console-bg text-console-muted hover:bg-console-border hover:text-console-text'
            }`}
          >
            <span>{startChannel}-{endChannel}</span>
            {activeCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded bg-console-active/20 text-console-active">
                {activeCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
