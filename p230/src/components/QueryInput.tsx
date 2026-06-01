import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, ChevronDown } from 'lucide-react';
import { RecordType } from '../types';

interface QueryInputProps {
  onSubmit: (domain: string, recordType: RecordType) => void;
  isLoading: boolean;
}

const RECORD_TYPES: { value: RecordType; label: string }[] = [
  { value: 'A', label: 'A' },
  { value: 'AAAA', label: 'AAAA' },
  { value: 'NS', label: 'NS' },
  { value: 'TXT', label: 'TXT' },
  { value: 'MX', label: 'MX' },
  { value: 'SOA', label: 'SOA' },
  { value: 'CNAME', label: 'CNAME' },
];

export default function QueryInput({ onSubmit, isLoading }: QueryInputProps) {
  const [domain, setDomain] = useState('');
  const [recordType, setRecordType] = useState<RecordType>('A');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (domain.trim() && !isLoading) {
      onSubmit(domain.trim(), recordType);
    }
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      onSubmit={handleSubmit}
      className="w-full max-w-3xl mx-auto"
    >
      <div className="flex flex-col sm:flex-row gap-4 p-2 bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl">
        <div className="flex-1 relative">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <Search className="w-5 h-5 text-slate-400" />
          </div>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="输入域名，例如：example.com"
            disabled={isLoading}
            className="w-full pl-12 pr-4 py-4 bg-slate-900/80 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-300 font-mono text-lg"
          />
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            disabled={isLoading}
            className="w-full sm:w-32 px-4 py-4 bg-slate-900/80 border border-slate-600/50 rounded-xl text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all duration-300 flex items-center justify-between gap-2"
          >
            <span>{recordType}</span>
            <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {isDropdownOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full mt-2 w-full bg-slate-800 border border-slate-600/50 rounded-xl overflow-hidden shadow-xl z-50"
            >
              {RECORD_TYPES.map((type, index) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => {
                    setRecordType(type.value);
                    setIsDropdownOpen(false);
                  }}
                  className={`w-full px-4 py-3 text-left transition-colors duration-200 ${
                    recordType === type.value
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'text-slate-300 hover:bg-slate-700/50'
                  }`}
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  {type.label}
                </button>
              ))}
            </motion.div>
          )}
        </div>

        <motion.button
          type="submit"
          disabled={isLoading || !domain.trim()}
          whileHover={{ scale: isLoading || !domain.trim() ? 1 : 1.02 }}
          whileTap={{ scale: isLoading || !domain.trim() ? 1 : 0.98 }}
          className="px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-slate-600 disabled:to-slate-600 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 disabled:shadow-none disabled:cursor-not-allowed flex items-center justify-center gap-2 min-w-[140px]"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>验证中...</span>
            </>
          ) : (
            <>
              <Search className="w-5 h-5" />
              <span>验证</span>
            </>
          )}
        </motion.button>
      </div>
    </motion.form>
  );
}
