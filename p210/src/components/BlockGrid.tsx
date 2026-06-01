import { cn } from '@/lib/utils';

interface BlockGridProps {
  currentBlock: number;
  totalBlocks: number;
  blockSize: number;
  completed?: boolean;
  failed?: boolean;
  lastAckedBlock?: number;
}

export function BlockGrid({ currentBlock, totalBlocks, blockSize, completed, failed, lastAckedBlock = -1 }: BlockGridProps) {
  const maxDisplay = 200;
  const displayBlocks = Math.min(totalBlocks, maxDisplay);
  const isTruncated = totalBlocks > maxDisplay;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-zinc-500">Block1 传输矩阵</p>
        <p className="text-xs text-zinc-600">
          {blockSize}B × {totalBlocks} 块
          {isTruncated && ` (显示前 ${maxDisplay} 块)`}
        </p>
      </div>
      <div className="flex flex-wrap gap-[3px]">
        {Array.from({ length: displayBlocks }, (_, i) => {
          const isAcked = completed ? true : i <= lastAckedBlock;
          const isCurrent = !completed && !failed && i === currentBlock;
          const isPending = !isAcked && !isCurrent;

          return (
            <div
              key={i}
              className={cn(
                'w-[14px] h-[14px] rounded-[3px] transition-all duration-200',
                isAcked && !failed && 'bg-teal-500/80 shadow-sm shadow-teal-500/20',
                isCurrent && !isAcked && 'bg-amber-400 shadow-sm shadow-amber-400/30 animate-pulse',
                isCurrent && isAcked && 'bg-amber-400 shadow-sm shadow-amber-400/30 animate-pulse',
                isPending && 'bg-zinc-800',
                failed && isAcked && i <= lastAckedBlock && 'bg-red-500/60',
              )}
              title={`Block ${i}: offset=${i * blockSize}, ${isAcked ? '已确认(M=0)' : isCurrent ? '传输中' : '待传输'}`}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-2">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-[3px] bg-teal-500/80" />
          <span className="text-[10px] text-zinc-500">已确认 (M=0)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-[3px] bg-amber-400 animate-pulse" />
          <span className="text-[10px] text-zinc-500">传输中</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-[3px] bg-zinc-800" />
          <span className="text-[10px] text-zinc-500">待传输</span>
        </div>
      </div>
    </div>
  );
}
