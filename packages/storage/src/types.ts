import type { Tier } from '@flappycode/protocol';

export interface ProviderRecord {
  id: string;
  type: string;
  display_name: string;
  base_url?: string | null;
  auth_ref?: string | null;
  enabled: number; // 0 or 1
  data_use_policy?: string | null;
  max_concurrency: number;
  created_at: number;
}

export interface ModelRecord {
  provider_id: string;
  model_id: string;
  tier: Tier;
  tier_source: 'override' | 'community' | 'metadata' | 'rule';
  context_length: number;
  modality: string;
  supports_tools: number; // 0 or 1
  supports_vision: number; // 0 or 1
  tool_probe_passed?: number | null; // 0, 1, or null
  price_in: number;
  price_out: number;
  avg_latency_ms: number;
  last_validated_at: number;
}

export interface ModelOverrideRecord {
  provider_id: string;
  model_id: string;
  tier: Tier;
  created_at: number;
}

export interface SessionRecord {
  id: string;
  project_path: string;
  created_at: number;
  updated_at: number;
  summary?: string | null;
}

export interface MessageRecord {
  id: number;
  session_id: string;
  role: string;
  content: string;
  created_at: number;
}

export interface UsageRecord {
  provider_id: string;
  model_id: string;
  date: string; // YYYY-MM-DD
  requests: number;
  tokens_in: number;
  tokens_out: number;
  active_minutes: number;
}

export interface ProjectMemoryRecord {
  project_path: string;
  key: string;
  value: string;
  updated_at: number;
}
