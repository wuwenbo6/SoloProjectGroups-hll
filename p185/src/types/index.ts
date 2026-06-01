export interface AvcRecord {
  id: string;
  timestamp: string;
  pid: string;
  comm: string;
  scontext: string;
  tcontext: string;
  tclass: string;
  permissions: string[];
  raw: string;
}

export interface SecurityContext {
  user: string;
  role: string;
  type: string;
  level?: string;
  full: string;
}

export interface TclassStats {
  tclass: string;
  count: number;
  percentage: number;
}

export interface ParseResult {
  records: AvcRecord[];
  stats: {
    totalRecords: number;
    uniqueSubjects: number;
    uniqueObjects: number;
    uniqueTclasses: number;
  };
  tclassDistribution: TclassStats[];
}

export interface ParseProgress {
  processedLines: number;
  foundRecords: number;
  isComplete: boolean;
}

export interface LogState {
  parseResult: ParseResult | null;
  isLoading: boolean;
  error: string | null;
  progress: ParseProgress;
  currentPage: number;
  pageSize: number;
  filterTclass: string;
  setParseResult: (result: ParseResult | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setProgress: (progress: ParseProgress) => void;
  setCurrentPage: (page: number) => void;
  setFilterTclass: (tclass: string) => void;
  clearData: () => void;
}

export function parseSecurityContext(context: string): SecurityContext {
  const parts = context.split(':');
  return {
    user: parts[0] || '',
    role: parts[1] || '',
    type: parts[2] || '',
    level: parts[3],
    full: context,
  };
}
