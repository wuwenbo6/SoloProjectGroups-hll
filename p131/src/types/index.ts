export interface Plugin {
  id: string;
  name: string;
  slug: string;
  description: string;
  author: string;
  email?: string;
  icon?: string;
  category?: Category;
  categoryId?: string;
  qgisMinVersion: string;
  qgisMaxVersion?: string;
  homepage?: string;
  tracker?: string;
  repository?: string;
  license?: string;
  deprecated: boolean;
  experimental: boolean;
  approved: boolean;
  downloads: number;
  averageRating: number;
  ratingCount: number;
  versions: PluginVersion[];
  dependencies: PluginDependency[];
  ratings: Rating[];
  tags?: string[];
  uploadedBy?: { name: string; email: string };
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  _count?: {
    plugins: number;
  };
}

export interface PluginVersion {
  id: string;
  pluginId: string;
  version: string;
  changelog?: string;
  filename: string;
  fileSize: number;
  md5Hash: string;
  createdAt: string;
}

export interface PluginDependency {
  id: string;
  pluginId: string;
  dependencyName: string;
  minVersion?: string;
  maxVersion?: string;
  optional: boolean;
}

export interface Rating {
  id: string;
  pluginId: string;
  userId: string;
  score: number;
  comment?: string;
  user?: { name: string; email: string };
  createdAt: string;
}

export interface RatingDistribution {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
}

export interface QgisServer {
  id: string;
  name: string;
  url: string;
  apiKey: string;
  description?: string;
  status: string;
  enabled: boolean;
  lastChecked?: string;
  updatedAt: string;
  createdAt: string;
  _count?: {
    serverPlugins: number;
    installedPlugins?: number;
  };
}

export interface ServerPlugin {
  id: string;
  serverId: string;
  pluginId: string;
  plugin: Plugin;
  installedVersion: string;
  enabled: boolean;
  installedAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  distribution?: RatingDistribution;
}

export interface PluginFilter {
  search?: string;
  category?: string;
  minRating?: number;
  qgisVersion?: string;
  deprecated?: boolean;
  experimental?: boolean;
  approved?: boolean;
  sortBy?: 'downloads' | 'rating' | 'name' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface ParsedPlugin {
  name: string;
  slug: string;
  version: string;
  description: string;
  author: string;
  email?: string;
  qgisMinVersion: string;
  qgisMaxVersion?: string;
  category?: string;
  icon?: string;
  homepage?: string;
  tracker?: string;
  repository?: string;
  license?: string;
  deprecated?: boolean;
  experimental?: boolean;
  changelog?: string;
  dependencies?: {
    dependencyName: string;
    minVersion?: string;
    maxVersion?: string;
    optional?: boolean;
  }[];
  filename: string;
  fileSize: number;
  md5Hash: string;
  iconPath?: string;
}
