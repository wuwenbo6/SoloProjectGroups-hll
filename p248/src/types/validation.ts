export interface RuleResult {
  id: string;
  category: string;
  severity: "error" | "warning" | "info";
  status: "pass" | "fail" | "not_applicable";
  description: string;
  detail?: string;
  xpath?: string;
  suggestion?: string;
}

export interface ValidationSummary {
  total: number;
  passed: number;
  warnings: number;
  errors: number;
}

export interface ValidationResult {
  status: "success" | "error";
  filename: string;
  fileSize: number;
  mpdType: "static" | "dynamic";
  profiles: string[];
  summary: ValidationSummary;
  rules: RuleResult[];
  xmlSource: string;
}

export interface HlsConversionResult {
  master: string;
  playlists: Record<string, string>;
  video_variants: Array<{
    bandwidth: number;
    resolution: string;
    codecs: string;
    playlist: string;
    frame_rate: string;
  }>;
  audio_groups: Record<string, Array<{
    bandwidth: number;
    codecs: string;
    playlist: string;
    language: string;
  }>>;
}

export interface RuleReference {
  id: string;
  category: string;
  severity: string;
  description: string;
  spec_ref: string;
  check: string;
}
