import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';

const SCHEMA_PATH = path.join(process.cwd(), 'scripts', 'orchestrate', 'runtime', 'schema.sql');

export class RuntimeStore {
  constructor(config) {
    this.config = config;
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: 10,
    });
  }

  async close() {
    await this.pool.end();
  }

  async ensureSchema() {
    const sql = await fs.readFile(SCHEMA_PATH, 'utf8');
    await this.pool.query(sql);
  }

  async createRun({ runId, goal, profile, requestedPasses, runDir, policySnapshot, metadata }) {
    await this.pool.query(
      `INSERT INTO runs (id, goal, profile, status, requested_passes, run_dir, policy_snapshot, metadata)
       VALUES ($1, $2, $3, 'running', $4, $5, $6::jsonb, $7::jsonb)`,
      [runId, goal, profile, requestedPasses, runDir, JSON.stringify(policySnapshot), JSON.stringify(metadata || {})]
    );
  }

  async createPolicySnapshot({ runId, version, scope, policy }) {
    await this.pool.query(
      `INSERT INTO policy_snapshots (id, run_id, version, scope, policy)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [randomUUID(), runId, version, scope, JSON.stringify(policy)]
    );
  }

  async createPass({ runId, index, candidate, rankingSnapshot, metadata }) {
    const passId = randomUUID();
    await this.pool.query(
      `INSERT INTO passes (id, run_id, index, candidate_id, candidate_label, axis, status, ranking_snapshot, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, 'running', $7::jsonb, $8::jsonb)`,
      [passId, runId, index, candidate.id, candidate.label, candidate.axis, JSON.stringify(rankingSnapshot || []), JSON.stringify(metadata || {})]
    );
    return passId;
  }

  async insertTasks({ runId, passId, tasks }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const task of tasks) {
        await client.query(
          `INSERT INTO tasks (
            id, run_id, pass_id, task_key, label, phase, pattern, command, mutation_scope,
            touches_app_surface, automation_level, allow_failure, order_index,
            dependency_count, remaining_dependencies, metadata
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10, $11, $12, $13,
            $14, $15, $16::jsonb
          )`,
          [
            task.id,
            runId,
            passId,
            task.taskKey,
            task.label,
            task.phase,
            task.pattern,
            task.command,
            task.mutationScope,
            task.touchesAppSurface,
            task.automationLevel,
            task.allowFailure,
            task.orderIndex,
            task.dependsOn.length,
            task.dependsOn.length,
            JSON.stringify(task.metadata || {}),
          ]
        );
        for (const dependencyId of task.dependsOn) {
          await client.query(
            `INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES ($1, $2)`,
            [task.id, dependencyId]
          );
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getReadyTaskIds(passId) {
    const result = await this.pool.query(
      `SELECT id
       FROM tasks
       WHERE pass_id = $1
         AND status = 'pending'
         AND remaining_dependencies = 0
       ORDER BY order_index, task_key`,
      [passId]
    );
    return result.rows.map((row) => row.id);
  }

  async markTasksQueued(taskIds) {
    if (!taskIds.length) return [];
    const result = await this.pool.query(
      `UPDATE tasks
       SET status = 'queued'
       WHERE id = ANY($1::uuid[])
         AND status = 'pending'
       RETURNING id`,
      [taskIds]
    );
    return result.rows.map((row) => row.id);
  }

  async claimTask(taskId, workerId, leaseSeconds) {
    const result = await this.pool.query(
      `WITH claimed AS (
        UPDATE tasks
        SET status = 'running',
            lease_owner = $2,
            lease_expires_at = NOW() + (($3::text || ' seconds')::interval),
            started_at = COALESCE(started_at, NOW())
        WHERE id = $1
          AND status = 'queued'
          AND remaining_dependencies = 0
          AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
        RETURNING *
      )
      SELECT
        claimed.*,
        passes.index AS pass_index,
        runs.run_dir
      FROM claimed
      JOIN passes ON passes.id = claimed.pass_id
      JOIN runs ON runs.id = claimed.run_id`,
      [taskId, workerId, leaseSeconds]
    );
    return result.rows[0] || null;
  }

  async startAttempt(taskId, workerId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const next = await client.query(
        `SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next_attempt
         FROM task_attempts
         WHERE task_id = $1`,
        [taskId]
      );
      const attemptNumber = Number(next.rows[0]?.next_attempt || 1);
      const attemptId = randomUUID();
      await client.query(
        `INSERT INTO task_attempts (id, task_id, attempt_number, worker_id, status)
         VALUES ($1, $2, $3, $4, 'running')`,
        [attemptId, taskId, attemptNumber, workerId]
      );
      await client.query('COMMIT');
      return { attemptId, attemptNumber };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async finishAttempt({ attemptId, status, exitCode, stdoutPath, stderrPath, error }) {
    await this.pool.query(
      `UPDATE task_attempts
       SET status = $2,
           completed_at = NOW(),
           exit_code = $3,
           stdout_path = $4,
           stderr_path = $5,
           error = $6
       WHERE id = $1`,
      [attemptId, status, exitCode, stdoutPath, stderrPath, error || null]
    );
  }

  async recordArtifact({ runId, passId, taskId, kind, filePath, metadata }) {
    await this.pool.query(
      `INSERT INTO artifacts (id, run_id, pass_id, task_id, kind, path, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [randomUUID(), runId, passId || null, taskId || null, kind, filePath, JSON.stringify(metadata || {})]
    );
  }

  async finalizeTask({ taskId, status, exitCode, stdoutPath, stderrPath, workerId }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const taskResult = await client.query(
        `UPDATE tasks
         SET status = $2,
             completed_at = NOW(),
             exit_code = $3,
             stdout_path = $4,
             stderr_path = $5,
             lease_owner = $6,
             lease_expires_at = NULL
         WHERE id = $1
         RETURNING id, run_id, pass_id, allow_failure`,
        [taskId, status, exitCode, stdoutPath || null, stderrPath || null, workerId]
      );
      const task = taskResult.rows[0];

      if (stdoutPath) {
        await client.query(
          `INSERT INTO artifacts (id, run_id, pass_id, task_id, kind, path, metadata)
           VALUES ($1, $2, $3, $4, 'stdout-log', $5, '{}'::jsonb)`,
          [randomUUID(), task.run_id, task.pass_id, task.id, stdoutPath]
        );
      }
      if (stderrPath) {
        await client.query(
          `INSERT INTO artifacts (id, run_id, pass_id, task_id, kind, path, metadata)
           VALUES ($1, $2, $3, $4, 'stderr-log', $5, '{}'::jsonb)`,
          [randomUUID(), task.run_id, task.pass_id, task.id, stderrPath]
        );
      }

      let readyIds = [];
      if (status === 'completed' || status === 'soft-failed') {
        const released = await client.query(
          `WITH dependents AS (
            SELECT task_id
            FROM task_dependencies
            WHERE depends_on_task_id = $1
          ),
          decremented AS (
            UPDATE tasks
            SET remaining_dependencies = GREATEST(remaining_dependencies - 1, 0)
            WHERE id IN (SELECT task_id FROM dependents)
            RETURNING id, remaining_dependencies, status
          )
          SELECT id
          FROM decremented
          WHERE remaining_dependencies = 0
            AND status = 'pending'`,
          [taskId]
        );
        readyIds = released.rows.map((row) => row.id);
      }

      await client.query('COMMIT');
      return {
        task,
        readyIds,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getPassOverview(passId) {
    const result = await this.pool.query(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE status = 'soft-failed')::int AS soft_failed,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
        COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
        COUNT(*) FILTER (WHERE status = 'running')::int AS running,
        COUNT(*) FILTER (WHERE status IN ('pending', 'queued'))::int AS pending
       FROM tasks
       WHERE pass_id = $1`,
      [passId]
    );
    return result.rows[0];
  }

  async cancelPendingPassTasks(passId) {
    await this.pool.query(
      `UPDATE tasks
       SET status = 'cancelled',
           completed_at = NOW(),
           lease_owner = NULL,
           lease_expires_at = NULL
       WHERE pass_id = $1
         AND status IN ('pending', 'queued')`,
      [passId]
    );
  }

  async updatePassStatus({ passId, status, reprioritized }) {
    await this.pool.query(
      `UPDATE passes
       SET status = $2,
           reprioritized = $3::jsonb,
           completed_at = NOW()
       WHERE id = $1`,
      [passId, status, JSON.stringify(reprioritized || {})]
    );
  }

  async recordReview({ runId, afterPass, review }) {
    await this.pool.query(
      `INSERT INTO reviews (id, run_id, after_pass, review)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [randomUUID(), runId, afterPass, JSON.stringify(review)]
    );
  }

  async updateRunStatus({ runId, status }) {
    await this.pool.query(
      `UPDATE runs
       SET status = $2,
           completed_at = CASE WHEN $2 IN ('completed', 'failed') THEN NOW() ELSE completed_at END
       WHERE id = $1`,
      [runId, status]
    );
  }

  async getRunExport(runId) {
    const [run, passes, tasks, reviews] = await Promise.all([
      this.pool.query(`SELECT * FROM runs WHERE id = $1`, [runId]),
      this.pool.query(`SELECT * FROM passes WHERE run_id = $1 ORDER BY index`, [runId]),
      this.pool.query(`SELECT * FROM tasks WHERE run_id = $1 ORDER BY pass_id, order_index, task_key`, [runId]),
      this.pool.query(`SELECT * FROM reviews WHERE run_id = $1 ORDER BY after_pass`, [runId]),
    ]);

    return {
      run: run.rows[0] || null,
      passes: passes.rows,
      tasks: tasks.rows,
      reviews: reviews.rows,
    };
  }
}
