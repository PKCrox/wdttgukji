CREATE TABLE IF NOT EXISTS runs (
  id UUID PRIMARY KEY,
  goal TEXT NOT NULL,
  profile TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_passes INTEGER NOT NULL,
  run_dir TEXT NOT NULL,
  policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS passes (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  index INTEGER NOT NULL,
  candidate_id TEXT NOT NULL,
  candidate_label TEXT NOT NULL,
  axis TEXT NOT NULL,
  status TEXT NOT NULL,
  ranking_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  reprioritized JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (run_id, index)
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  pass_id UUID NOT NULL REFERENCES passes(id) ON DELETE CASCADE,
  task_key TEXT NOT NULL,
  label TEXT NOT NULL,
  phase TEXT NOT NULL,
  pattern TEXT NOT NULL,
  command TEXT NOT NULL,
  mutation_scope TEXT NOT NULL DEFAULT 'none',
  touches_app_surface BOOLEAN NOT NULL DEFAULT FALSE,
  automation_level TEXT NOT NULL DEFAULT 'scripted',
  allow_failure BOOLEAN NOT NULL DEFAULT FALSE,
  order_index INTEGER NOT NULL DEFAULT 0,
  dependency_count INTEGER NOT NULL DEFAULT 0,
  remaining_dependencies INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  exit_code INTEGER,
  stdout_path TEXT,
  stderr_path TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (pass_id, task_key)
);

CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_task_id)
);

CREATE TABLE IF NOT EXISTS task_attempts (
  id UUID PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  worker_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  exit_code INTEGER,
  stdout_path TEXT,
  stderr_path TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS artifacts (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  pass_id UUID REFERENCES passes(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  after_pass INTEGER NOT NULL,
  review JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS policy_snapshots (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  scope TEXT NOT NULL,
  policy JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, version, scope)
);

CREATE INDEX IF NOT EXISTS idx_passes_run_id ON passes(run_id);
CREATE INDEX IF NOT EXISTS idx_tasks_pass_id ON tasks(pass_id);
CREATE INDEX IF NOT EXISTS idx_tasks_run_status ON tasks(run_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_ready ON tasks(pass_id, status, remaining_dependencies, order_index);
CREATE INDEX IF NOT EXISTS idx_task_attempts_task_id ON task_attempts(task_id);
CREATE INDEX IF NOT EXISTS idx_reviews_run_id ON reviews(run_id);
