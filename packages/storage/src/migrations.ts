export const MIGRATION_001 = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS provider (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  base_url TEXT,
  auth_ref TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  data_use_policy TEXT NOT NULL DEFAULT 'unknown',
  max_concurrency INTEGER NOT NULL DEFAULT 4,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS model (
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  tier TEXT NOT NULL CHECK(tier IN ('free','rate_limited_free','paid','disabled','unavailable')),
  tier_source TEXT NOT NULL,
  context_length INTEGER NOT NULL,
  modality TEXT NOT NULL DEFAULT 'text->text',
  supports_tools INTEGER NOT NULL DEFAULT 0,
  supports_vision INTEGER NOT NULL DEFAULT 0,
  tool_probe_passed INTEGER,
  price_in REAL NOT NULL DEFAULT 0,
  price_out REAL NOT NULL DEFAULT 0,
  avg_latency_ms INTEGER NOT NULL DEFAULT 0,
  last_validated_at INTEGER NOT NULL,
  PRIMARY KEY(provider_id, model_id),
  FOREIGN KEY(provider_id) REFERENCES provider(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS model_override (
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  tier TEXT NOT NULL CHECK(tier IN ('free','rate_limited_free','paid','disabled','unavailable')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(provider_id, model_id)
);

CREATE TABLE IF NOT EXISTS agent_definition (
  name TEXT PRIMARY KEY,
  system_prompt TEXT NOT NULL,
  allowed_tools TEXT NOT NULL,
  preferred_model_ref TEXT NOT NULL,
  fallback_policy TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  summary TEXT
);

CREATE TABLE IF NOT EXISTS message (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(session_id) REFERENCES session(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_run (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  plan_approved_at INTEGER,
  status TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES session(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_node (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  agent TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  depends_on TEXT NOT NULL DEFAULT '[]',
  model_used TEXT,
  substitutions TEXT NOT NULL DEFAULT '[]',
  started_at INTEGER,
  ended_at INTEGER,
  FOREIGN KEY(run_id) REFERENCES task_run(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tool_call_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  args TEXT NOT NULL,
  result_summary TEXT,
  approved_by_user INTEGER NOT NULL DEFAULT 0,
  ts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_local (
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  date TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  active_minutes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(provider_id, model_id, date)
);

CREATE TABLE IF NOT EXISTS project_memory (
  project_path TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(project_path, key)
);
`;

export const MIGRATION_002 = `
ALTER TABLE task_node ADD COLUMN iterations INTEGER NOT NULL DEFAULT 0;
`;

export const MIGRATION_003 = `
CREATE TABLE IF NOT EXISTS provider_health (
  provider_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('healthy', 'degraded', 'unreachable', 'unknown', 'auth_failed', 'rate_limited')),
  latency_ms INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  total_checks INTEGER NOT NULL DEFAULT 0,
  last_checked_at INTEGER NOT NULL,
  last_success_at INTEGER,
  last_error TEXT,
  FOREIGN KEY(provider_id) REFERENCES provider(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS undo_batch (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  description TEXT NOT NULL,
  applied_at INTEGER NOT NULL,
  reverted_at INTEGER,
  git_commit_sha TEXT
);

CREATE TABLE IF NOT EXISTS undo_file (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  original_content TEXT,
  new_content TEXT,
  hunks_applied TEXT,
  FOREIGN KEY(batch_id) REFERENCES undo_batch(id) ON DELETE CASCADE
);
`;

export const MIGRATIONS = [
  { version: 1, sql: MIGRATION_001 },
  { version: 2, sql: MIGRATION_002 },
  { version: 3, sql: MIGRATION_003 },
];

