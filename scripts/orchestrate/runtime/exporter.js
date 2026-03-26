import fs from 'fs/promises';
import path from 'path';

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export async function exportRunArtifacts(store, runId) {
  const snapshot = await store.getRunExport(runId);
  if (!snapshot.run) {
    throw new Error(`Run not found for export: ${runId}`);
  }

  const runDir = snapshot.run.run_dir;
  const passMap = new Map(snapshot.passes.map((entry) => [entry.id, entry]));
  const tasksByPass = snapshot.tasks.reduce((acc, task) => {
    if (!acc[task.pass_id]) acc[task.pass_id] = [];
    acc[task.pass_id].push(task);
    return acc;
  }, {});

  const state = {
    run_id: snapshot.run.id,
    goal: snapshot.run.goal,
    profile: snapshot.run.profile,
    status: snapshot.run.status,
    created_at: snapshot.run.created_at,
    completed_at: snapshot.run.completed_at,
    requested_passes: snapshot.run.requested_passes,
    metadata: snapshot.run.metadata,
    policy_snapshot: snapshot.run.policy_snapshot,
    reviews: snapshot.reviews.map((entry) => entry.review),
    passes: snapshot.passes.map((entry) => ({
      index: entry.index,
      status: entry.status,
      candidate: {
        id: entry.candidate_id,
        label: entry.candidate_label,
        axis: entry.axis,
      },
      reprioritized: entry.reprioritized,
      tasks: (tasksByPass[entry.id] || []).map((task) => ({
        id: task.id,
        task_key: task.task_key,
        phase: task.phase,
        status: task.status,
        command: task.command,
        mutation_scope: task.mutation_scope,
        touches_app_surface: task.touches_app_surface,
        stdout_path: task.stdout_path,
        stderr_path: task.stderr_path,
      })),
    })),
  };

  const summary = {
    run_id: snapshot.run.id,
    goal: snapshot.run.goal,
    profile: snapshot.run.profile,
    status: snapshot.run.status,
    requested_passes: snapshot.run.requested_passes,
    completed_passes: snapshot.passes.filter((entry) => entry.status === 'completed').length,
    failed_passes: snapshot.passes.filter((entry) => entry.status === 'failed').length,
    review_count: snapshot.reviews.length,
    run_dir: runDir,
  };

  await writeJson(path.join(runDir, 'state.json'), state);
  await writeJson(path.join(runDir, 'summary.json'), summary);

  for (const pass of snapshot.passes) {
    const passTasks = tasksByPass[pass.id] || [];
    await writeJson(path.join(runDir, `pass-${String(pass.index).padStart(3, '0')}.json`), {
      index: pass.index,
      status: pass.status,
      candidate: {
        id: pass.candidate_id,
        label: pass.candidate_label,
        axis: pass.axis,
      },
      ranking_snapshot: pass.ranking_snapshot,
      reprioritized: pass.reprioritized,
      tasks: passTasks.map((task) => ({
        id: task.id,
        task_key: task.task_key,
        phase: task.phase,
        command: task.command,
        status: task.status,
        allow_failure: task.allow_failure,
        mutation_scope: task.mutation_scope,
        touches_app_surface: task.touches_app_surface,
        stdout_path: task.stdout_path,
        stderr_path: task.stderr_path,
      })),
    });
  }

  for (const review of snapshot.reviews) {
    await writeJson(
      path.join(runDir, `checkpoint-review-${String(review.after_pass).padStart(3, '0')}.json`),
      review.review
    );
  }

  return { runDir, summary, passCount: snapshot.passes.length };
}
