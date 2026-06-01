export interface PluginMetadata {
  name: string;
  version: string;
  description: string;
  author: string;
  email?: string;
  about?: string;
  category?: string;
  icon?: string;
  qgisMinimumVersion: string;
  qgisMaximumVersion?: string;
  homepage?: string;
  tracker?: string;
  repository?: string;
  license?: string;
  deprecated?: boolean;
  experimental?: boolean;
  dependencies?: string[];
  changelog?: string;
  tags?: string[];
}

export interface ParsedPlugin {
  metadata: PluginMetadata;
  filename: string;
  fileSize: number;
  md5Hash: string;
  iconPath?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
  };
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

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}
