import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useKconfigStore } from '@/store/kconfigStore';
import { ConfigTreeRow } from './ConfigTreeRow';
import { FileWarning } from 'lucide-react';

const ROW_HEIGHT = 34;
const OVERSCAN = 8;

export function ConfigTree() {
  const loaded = useKconfigStore((s) => s.loaded);
  const tree = useKconfigStore((s) => s.tree);
  const expandedNodes = useKconfigStore((s) => s.expandedNodes);
  const searchQuery = useKconfigStore((s) => s.searchQuery);
  const values = useKconfigStore((s) => s.values);
  const diffResult = useKconfigStore((s) => s.diffResult);
  const diffFilter = useKconfigStore((s) => s.diffFilter);
  const showDiffOnly = useKconfigStore((s) => s.showDiffOnly);
  const getFlatItems = useKconfigStore((s) => s.getFlatItems);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  const flatItems = useMemo(
    () => getFlatItems(),
    [tree, expandedNodes, searchQuery, values, diffResult, diffFilter, showDiffOnly]
  );

  const totalCount = flatItems.length;
  const totalHeight = totalCount * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    totalCount - 1,
    Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN
  );
  const visibleItems = flatItems.slice(startIndex, endIndex + 1);

  const handleScroll = useCallback(() => {
    if (containerRef.current) setScrollTop(containerRef.current.scrollTop);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerHeight(entry.contentRect.height);
    });
    observer.observe(el);
    setContainerHeight(el.clientHeight);
    return () => observer.disconnect();
  }, []);

  if (!loaded) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <FileWarning className="w-16 h-16 mb-4 opacity-50" />
        <p className="text-lg font-mono">No Kconfig loaded</p>
        <p className="text-sm mt-2">Upload a Kconfig file or load a sample</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full overflow-y-auto" onScroll={handleScroll}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleItems.map((item, idx) => (
          <ConfigTreeRow
            key={item.nodeId}
            node={item.node}
            level={item.level}
            top={(startIndex + idx) * ROW_HEIGHT}
          />
        ))}
      </div>
    </div>
  );
}
