#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const RUNS_DIR = path.join(ROOT, 'runs', 'strike-runs');

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function latestRunDir() {
  const entries = await fs.readdir(RUNS_DIR, { withFileTypes: true }).catch(() => []);
  const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  if (!dirs.length) return null;
  return path.join(RUNS_DIR, dirs.at(-1));
}

async function main() {
  const runDir = process.argv[2] ? path.resolve(process.argv[2]) : await latestRunDir();
  if (!runDir) {
    console.log(JSON.stringify({ status: 'missing', reason: 'no strike run found' }, null, 2));
    return;
  }

  const state = await readJson(path.join(runDir, 'state.json'));
  const checkpoints = (state.checkpoints || []).slice(-3).map((checkpoint) => ({
    iteration: checkpoint.iteration,
    completed_at: checkpoint.completed_at,
    lead_ok: checkpoint.lead?.ok ?? null,
    lead_summary: checkpoint.lead?.summary || '',
    failed_checks: (checkpoint.checks || []).filter((check) => !check.ok).map((check) => check.command),
    spark_tasks: (checkpoint.spark_results || []).map((task) => ({
      task_id: task.taskId,
      ok: task.ok,
      summary: task.summary,
    })),
  }));

  console.log(JSON.stringify({
    run_dir: runDir,
    run_id: state.run_id,
    status: state.status,
    focus_id: state.focus_id,
    screen: state.screen,
    goal: state.goal,
    completed_iterations: state.completed_iterations,
    total_iterations: state.total_iterations,
    current_iteration: state.current_iteration ?? null,
    current_step: state.current_step ?? null,
    current_task_id: state.current_task_id ?? null,
    latest_feedback: state.checkpoints?.length ? state.checkpoints.at(-1)?.feedback || [] : [],
    deadline_at: state.deadline_at,
    worktree_guard: state.worktree_guard,
    recent_checkpoints: checkpoints,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
