/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module 'lucide-react' {
  export const LayoutDashboard: React.FC<{ className?: string }>;
  export const FileSpreadsheet: React.FC<{ className?: string }>;
  export const Network: React.FC<{ className?: string }>;
  export const Settings: React.FC<{ className?: string }>;
  export const Server: React.FC<{ className?: string }>;
  export const Power: React.FC<{ className?: string }>;
  export const Database: React.FC<{ className?: string }>;
  export const Activity: React.FC<{ className?: string }>;
  export const Play: React.FC<{ className?: string }>;
  export const Square: React.FC<{ className?: string }>;
  export const RefreshCw: React.FC<{ className?: string }>;
  export const Clock: React.FC<{ className?: string }>;
  export const Users: React.FC<{ className?: string }>;
  export const Layers: React.FC<{ className?: string }>;
  export const Upload: React.FC<{ className?: string }>;
  export const Download: React.FC<{ className?: string }>;
  export const Plus: React.FC<{ className?: string }>;
  export const Trash2: React.FC<{ className?: string }>;
  export const Edit3: React.FC<{ className?: string }>;
  export const Save: React.FC<{ className?: string }>;
  export const X: React.FC<{ className?: string }>;
  export const AlertCircle: React.FC<{ className?: string }>;
  export const Check: React.FC<{ className?: string }>;
  export const Search: React.FC<{ className?: string }>;
  export const ChevronRight: React.FC<{ className?: string }>;
  export const ChevronDown: React.FC<{ className?: string }>;
  export const Folder: React.FC<{ className?: string }>;
  export const Hash: React.FC<{ className?: string }>;
  export const Box: React.FC<{ className?: string }>;
  export const Copy: React.FC<{ className?: string }>;
}
