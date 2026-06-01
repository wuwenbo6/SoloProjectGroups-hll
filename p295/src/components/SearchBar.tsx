import { Search, X, Terminal } from 'lucide-react';
import { useLogStore } from '@/stores/logStore';
import { useCallback, useEffect, useRef } from 'react';

export default function SearchBar() {
  const { query, setQuery, searchLogs, fetchStats } = useLogStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = useCallback(() => {
    searchLogs(query, 1);
    fetchStats();
  }, [query, searchLogs, fetchStats]);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchLogs(query, 1);
      fetchStats();
    }, 300);
    return () => clearTimeout(timer);
  }, [query, searchLogs, fetchStats]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="relative group">
      <div className="absolute inset-0 bg-gelf-accent/5 rounded-lg blur-xl group-focus-within:bg-gelf-accent/10 transition-all duration-500" />
      <div className="relative flex items-center bg-gelf-surface border border-gelf-border rounded-lg overflow-hidden transition-all duration-300 group-focus-within:border-gelf-accent/50 group-focus-within:shadow-[0_0_15px_rgba(0,212,255,0.15)]">
        <div className="pl-4 text-gelf-muted">
          <Search size={18} />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索日志内容、主机名、消息..."
          className="w-full bg-transparent px-3 py-3 text-gelf-text font-mono text-sm focus:outline-none placeholder:text-gelf-muted/50"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              searchLogs('', 1);
            }}
            className="px-3 text-gelf-muted hover:text-gelf-text transition-colors"
          >
            <X size={16} />
          </button>
        )}
        <div className="pr-3 flex items-center gap-2">
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono text-gelf-muted bg-gelf-bg border border-gelf-border rounded">
            <Terminal size={10} /> ⌘K
          </kbd>
        </div>
      </div>
    </div>
  );
}
