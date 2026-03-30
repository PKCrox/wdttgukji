#!/usr/bin/env node

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { getRuntimeConfig, assertRuntimeConfig } from './config.js';
import { RuntimeStore } from './db.js';
import { RuntimeQueue } from './queue.js';
import { resolveMutationPolicy, isTaskAllowedByPolicy } from './policy.js';
import { exportRunArtifacts } from './exporter.js';

function parseArgs(argv) {
  const args = {
    workerId: `${os.hostname()}-${process.pid}`,
    once: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--worker-id') args.workerId = argv[++i] || args.workerId;
    else if (token === '--once') args.once = true;
  }

  return args;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function runCommand(command, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

function buildTaskCommand(task) {
  if (task.phase !== 'edit') return task.command;
  const hasRunDir = task.command.includes('--run-dir');
  const hasPassJson = task.command.includes('--pass-json');
  if (hasRunDir && hasPassJson) return task.command;
  const passJson = path.join(task.run_dir, `pass-${String(task.pass_index).padStart(3, '0')}.json`);
  let command = task.command;
  if (!hasRunDir) command += ` --run-dir ${task.run_dir}`;
  if (!hasPassJson) command += ` --pass-json ${passJson}`;
  return command;
}

async function writeTaskLog(baseDir, content) {
  await ensureDir(path.dirname(baseDir));
  await fs.writeFile(baseDir, content, 'utf8');
}

async function executeClaimedTask({ task, store, queue, config, workerId, policy }) {
  const attempt = await store.startAttempt(task.id, workerId);
  const taskDir = path.join(task.run_dir, 'tasks', `pass-${String(task.pass_index).padStart(3, '0')}`);
  const stdoutPath = path.join(taskDir, `${task.task_key}-${task.id}.stdout.log`);
  const stderrPath = path.join(taskDir, `${task.task_key}-${task.id}.stderr.log`);

  if (!isTaskAllowedByPolicy(task, policy)) {
    const message = `Blocked by mutation policy: ${task.mutation_scope} / app_surface=${task.touches_app_surface}`;
    await writeTaskLog(stdoutPath, '');
    await writeTaskLog(stderrPath, `${message}\n`);
    await store.finishAttempt({
      attemptId: attempt.attemptId,
      status: 'blocked',
      exitCode: 1,
      stdoutPath,
      stderrPath,
      error: message,
    });
    await store.finalizeTask({
      taskId: task.id,
      status: 'failed',
      exitCode: 1,
      stdoutPath,
      stderrPath,
      workerId,
    });
    return;
  }

  if (task.phase === 'edit') {
    await exportRunArtifacts(store, task.run_id);
  }

  const command = buildTaskCommand(task);
  const result = await runCommand(command, process.cwd());
  await writeTaskLog(stdoutPath, result.stdout);
  await writeTaskLog(stderrPath, result.stderr);

  const status = result.ok ? 'completed' : (task.allow_failure ? 'soft-failed' : 'failed');
  await store.finishAttempt({
    attemptId: attempt.attemptId,
    status,
    exitCode: result.code,
    stdoutPath,
    stderrPath,
      error: result.ok ? null : `Command exited with code ${result.code}`,
  });
  const finalized = await store.finalizeTask({
    taskId: task.id,
    status,
    exitCode: result.code,
    stdoutPath,
    stderrPath,
    workerId,
  });
  const queued = await store.markTasksQueued(finalized.readyIds);
  await queue.enqueueTasks(queued);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = getRuntimeConfig();
  assertRuntimeConfig(config);
  const policy = resolveMutationPolicy();
  const store = new RuntimeStore(config);
  const queue = new RuntimeQueue(config);

  await store.ensureSchema();
  await queue.connect();

  try {
    do {
      const taskId = await queue.dequeueTask(config.dequeueTimeoutSeconds);
      if (!taskId) continue;
      const task = await store.claimTask(taskId, args.workerId, config.leaseSeconds);
      if (!task) continue;
      await executeClaimedTask({
        task,
        store,
        queue,
        config,
        workerId: args.workerId,
        policy,
      });
    } while (!args.once);
  } finally {
    await queue.close();
    await store.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
