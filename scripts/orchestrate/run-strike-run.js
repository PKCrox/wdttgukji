#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_CONFIG_PATH = path.join(ROOT, 'scripts', 'orchestrate', 'strike-run.config.json');
const DEFAULT_RUNS_DIR = path.join(ROOT, 'runs', 'strike-runs');
const PERSISTENT_MEMORY_JSON_PATH = path.join(ROOT, 'scripts', 'orchestrate', 'strike-run.memory.json');
const PERSISTENT_MEMORY_MD_PATH = path.join(ROOT, 'docs', 'strike-run-memory.md');
const DEFAULT_MODEL = process.env.WDTT_CODEX_MODEL || 'gpt-5.4';
const DEFAULT_SPARK_MODEL = process.env.WDTT_SPARK_MODEL || 'gpt-5.3-codex-spark';

function timestampId(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function parseArgs(argv) {
  const args = {
    focus: null,
    durationMinutes: 90,
    checkpointMinutes: 25,
    model: DEFAULT_MODEL,
    sparkModel: DEFAULT_SPARK_MODEL,
    withSpark: true,
    continueOnFailure: false,
    goal: 'session-style app-surface strike run',
    configPath: DEFAULT_CONFIG_PATH,
    printOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--focus') args.focus = argv[++index] || null;
    else if (token === '--duration-minutes') args.durationMinutes = Number(argv[++index] || 90);
    else if (token === '--checkpoint-minutes') args.checkpointMinutes = Number(argv[++index] || 25);
    else if (token === '--model') args.model = argv[++index] || args.model;
    else if (token === '--spark-model') args.sparkModel = argv[++index] || args.sparkModel;
    else if (token === '--without-spark') args.withSpark = false;
    else if (token === '--continue-on-failure') args.continueOnFailure = true;
    else if (token === '--goal') args.goal = argv[++index] || args.goal;
    else if (token === '--config') args.configPath = path.resolve(argv[++index] || args.configPath);
    else if (token === '--print-only') args.printOnly = true;
  }

  if (!Number.isFinite(args.durationMinutes) || args.durationMinutes <= 0) {
    throw new Error(`Invalid --duration-minutes value: ${args.durationMinutes}`);
  }
  if (!Number.isFinite(args.checkpointMinutes) || args.checkpointMinutes <= 0) {
    throw new Error(`Invalid --checkpoint-minutes value: ${args.checkpointMinutes}`);
  }

  return args;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function runShell(command, cwd = ROOT) {
  return new Promise((resolve) => {
    const child = spawn('/bin/zsh', ['-lc', command], {
      cwd,
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
        command,
      });
    });
  });
}

async function runCodex(args, cwd = ROOT) {
  return new Promise((resolve) => {
    const child = spawn('codex', args, {
      cwd,
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
        args,
      });
    });
  });
}

function extractThreadId(stdout, fallback = null) {
  const lines = stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'thread.started' && parsed.thread_id) return parsed.thread_id;
    } catch {}
  }
  return fallback;
}

function extractUsage(stdout) {
  const lines = stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(lines[index]);
      const usage = parsed.usage || parsed.response?.usage || parsed.result?.usage || parsed.event?.usage;
      if (usage) {
        return {
          input_tokens: usage.input_tokens ?? usage.inputTokens ?? null,
          output_tokens: usage.output_tokens ?? usage.outputTokens ?? null,
          total_tokens: usage.total_tokens ?? usage.totalTokens ?? null,
        };
      }
    } catch {}
  }
  return { input_tokens: null, output_tokens: null, total_tokens: null };
}

function usageDelta(currentUsage, previousUsage) {
  const diff = (current, previous) => {
    if (!Number.isFinite(current)) return null;
    if (!Number.isFinite(previous)) return current;
    return Math.max(0, current - previous);
  };
  return {
    delta_input_tokens: diff(currentUsage.input_tokens, previousUsage?.input_tokens),
    delta_output_tokens: diff(currentUsage.output_tokens, previousUsage?.output_tokens),
    delta_total_tokens: diff(currentUsage.total_tokens, previousUsage?.total_tokens),
  };
}

function resolveFocus(config, requested) {
  const normalizeFocus = (focus) => {
    if (!focus) return null;
    return {
      ...focus,
      playerFacingForbiddenTerms: Array.from(new Set([
        ...(config.sharedPlayerFacingForbiddenTerms || []),
        ...(focus.playerFacingForbiddenTerms || []),
      ])),
    };
  };
  if (!requested) {
    return normalizeFocus(config.focuses.find((focus) => focus.id === config.defaultFocusId) || config.focuses[0]);
  }
  return normalizeFocus(config.focuses.find((focus) => focus.id === requested || focus.screen === requested || focus.label === requested));
}

function buildSparkPrompt({ focus, task, iteration, runDir }) {
  const screenContractLines = focus.screenContract
    ? [
        `Primary actor: ${focus.screenContract.primaryActor || 'n/a'}`,
        `Structural goal: ${focus.screenContract.structuralGoal || 'n/a'}`,
        'Screen contract:',
        ...(focus.screenContract.collapseRules || []).map((item) => `- ${item}`),
      ]
    : [];
  const forbiddenLines = focus.playerFacingForbiddenTerms?.length
    ? [
        'Never introduce these player-visible terms:',
        ...focus.playerFacingForbiddenTerms.map((item) => `- ${item}`),
      ]
    : [];
  const qaLines = focus.qaExpectations?.length
    ? [
        'QA expectations to preserve:',
        ...focus.qaExpectations.map((item) => `- ${item}`),
      ]
    : [];
  return [
    'Use the spark-assignment contract.',
    'You are a bounded implementation worker inside a strike run.',
    'This is not a product-ownership task. Do not redesign the whole screen and do not touch lead-owned files.',
    `Strike run dir: ${runDir}`,
    `Focus: ${focus.label}`,
    `Iteration: ${iteration}`,
    `Task: ${task.label}`,
    `Focus objective: ${focus.objective}`,
    `Owned paths: ${task.ownedPaths.join(', ')}`,
    `Lead-owned paths: ${focus.leadOwnedPaths.join(', ')}`,
    ...screenContractLines,
    ...forbiddenLines,
    ...qaLines,
    'Rules:',
    '- Stay strictly inside owned paths.',
    '- Do not touch index.html, src/scenes/*.js, src/screens/*.js, or src/utils/*.js unless they are explicitly owned by this task. They are not in this task.',
    '- Finish one coherent implementation slice with verification, not half a shell.',
    '- If the task expands or needs cross-system redesign, stop and explain the blocker instead of improvising.',
    '- Treat any visible copy as player-facing product language, not ops language.',
    'Done criteria:',
    ...task.doneCriteria.map((item) => `- ${item}`),
    'Verification commands:',
    ...task.verificationCommands.map((item) => `- ${item}`),
    'Finish by listing changed files and what is still unproven.',
  ].join('\n');
}

function buildLeadPrompt({ focus, iteration, runDir, sparkResults, previousLeadSummary, persistentFeedback }) {
  const sparkLines = sparkResults.length
    ? sparkResults.map((result) => `- ${result.taskId}: ${result.summary || 'no summary'}`)
    : ['- no spark sidecars executed for this iteration'];
  const feedbackLines = persistentFeedback?.length
    ? persistentFeedback.map((item) => `- ${item}`)
    : ['- no persisted checkpoint feedback yet'];
  const screenContractLines = focus.screenContract
    ? [
        `Primary actor: ${focus.screenContract.primaryActor || 'n/a'}`,
        `Structural goal: ${focus.screenContract.structuralGoal || 'n/a'}`,
        'Screen contract:',
        ...(focus.screenContract.collapseRules || []).map((item) => `- ${item}`),
      ]
    : [];
  const forbiddenLines = focus.playerFacingForbiddenTerms?.length
    ? [
        'Never introduce these player-visible terms:',
        ...focus.playerFacingForbiddenTerms.map((item) => `- ${item}`),
      ]
    : [];
  const qaLines = focus.qaExpectations?.length
    ? [
        'QA expectations to satisfy before the checkpoint closes:',
        ...focus.qaExpectations.map((item) => `- ${item}`),
      ]
    : [];

  return [
    'Run a strike-run iteration for wdttgukji.',
    'This is a session-style redesign loop, not a micro-pass. Stay on the same focus and keep momentum.',
    `Strike run dir: ${runDir}`,
    `Focus: ${focus.label}`,
    `Iteration: ${iteration}`,
    `Objective: ${focus.objective}`,
    `Lead-owned paths: ${focus.leadOwnedPaths.join(', ')}`,
    ...screenContractLines,
    ...forbiddenLines,
    ...qaLines,
    'Sidecar handoff summary:',
    ...sparkLines,
    'Persistent checkpoint feedback:',
    ...feedbackLines,
    previousLeadSummary ? `Previous lead summary:\n${previousLeadSummary}` : 'Previous lead summary: none',
    'Rules:',
    '- Treat weak existing composition as disposable if it blocks readability or action flow.',
    '- Do not stop after wording-only polish. Land one coherent structural chunk.',
    '- Stay inside the owned bundle for this focus.',
    '- You may read sidecar-owned files and adapt to them, but do not overwrite their scope unless integration requires a tiny glue edit.',
    '- Keep the result screenshot-detectable.',
    '- Player-facing copy must read like a game, not like a workflow or ops dashboard.',
    'Verification commands you should run when relevant:',
    ...focus.verificationCommands.map((item) => `- ${item}`),
    'Finish by listing changed files, the structural delta, and any remaining blocker.',
  ].join('\n');
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function collectWorktreeGuard() {
  const status = await runShell('git status --short', ROOT);
  const lines = status.stdout.split('\n').map((line) => line.trimEnd()).filter(Boolean);
  const tracked = lines.filter((line) => line[0] !== '?' || line[1] !== '?');
  const untracked = lines.filter((line) => line.startsWith('??'));
  return {
    dirty_tracked_count: tracked.length,
    dirty_untracked_count: untracked.length,
    sample: lines.slice(0, 20),
  };
}

function summarizeLastMessage(text) {
  const normalized = text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('###'));
  const compact = normalized.slice(0, 4).join(' | ');
  return compact.length > 420 ? `${compact.slice(0, 417)}...` : compact;
}

async function executeCodexTurn({ prompt, model, sessionPath, transcriptPath, lastMessagePath }) {
  const session = await readJson(sessionPath).catch(() => null);
  const shouldResume = !!session?.thread_id;
  const args = shouldResume
    ? ['exec', 'resume', session.thread_id, '--json', '-o', lastMessagePath, prompt]
    : ['exec', '--json', '--full-auto', '-C', ROOT, '-o', lastMessagePath, prompt];
  const insertAt = shouldResume ? 3 : 2;
  if (model) args.splice(insertAt, 0, '--model', model);

  const result = await runCodex(args, ROOT);
  await fs.writeFile(transcriptPath, result.stdout, 'utf8');
  const threadId = extractThreadId(result.stdout, session?.thread_id || null);
  const usage = extractUsage(result.stdout);
  await writeJson(sessionPath, {
    thread_id: threadId,
    model,
    last_usage: usage,
    updated_at: new Date().toISOString(),
  });
  return {
    ...result,
    threadId,
    usage,
    usageDelta: usageDelta(usage, session?.last_usage || null),
    lastMessage: await readTextIfExists(lastMessagePath),
  };
}

async function executeChecks(commands, iterationDir) {
  const results = [];
  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index];
    const result = await runShell(command, ROOT);
    const outputPath = path.join(iterationDir, `check-${pad(index + 1)}.log`);
    await fs.writeFile(outputPath, `${result.stdout}${result.stderr}`, 'utf8');
    results.push({
      command,
      ok: result.ok,
      code: result.code,
      output_path: outputPath,
    });
  }
  return results;
}

async function loadPersistentMemory() {
  return readJson(PERSISTENT_MEMORY_JSON_PATH).catch(() => ({
    version: 1,
    updated_at: null,
    focus_memory: {},
    recent_runs: [],
  }));
}

function buildCheckpointFeedback({ focus, iteration, sparkResults, leadSummary, failedChecks }) {
  const notes = [];
  if (sparkResults.length) {
    notes.push(`spark slices completed: ${sparkResults.filter((item) => item.ok).map((item) => item.taskId).join(', ')}`);
  }
  if (leadSummary) {
    notes.push(`lead delta: ${leadSummary}`);
  }
  if (failedChecks.length) {
    notes.push(`failed checks: ${failedChecks.map((item) => item.command).join(', ')}`);
  } else {
    notes.push('checks passed at this checkpoint');
  }
  notes.push(`next push: keep ${focus.screen} focus and land another structural chunk before wording-only polish`);
  return notes;
}

async function persistCheckpointMemory({ runId, focus, goal, iteration, checkpoint, feedback }) {
  const memory = await loadPersistentMemory();
  const focusEntry = memory.focus_memory[focus.id] || {
    focus_id: focus.id,
    screen: focus.screen,
    last_run_id: null,
    last_iteration: 0,
    last_checkpoint_at: null,
    latest_feedback: [],
    latest_lead_summary: '',
    recurring_failed_checks: [],
  };

  focusEntry.last_run_id = runId;
  focusEntry.last_iteration = iteration;
  focusEntry.last_checkpoint_at = checkpoint.completed_at;
  focusEntry.latest_feedback = feedback;
  focusEntry.latest_lead_summary = checkpoint.lead?.summary || '';
  focusEntry.recurring_failed_checks = Array.from(new Set([
    ...(focusEntry.recurring_failed_checks || []),
    ...(checkpoint.checks || []).filter((check) => !check.ok).map((check) => check.command),
  ])).slice(-10);
  memory.focus_memory[focus.id] = focusEntry;

  memory.recent_runs = [
    {
      run_id: runId,
      focus_id: focus.id,
      goal,
      iteration,
      completed_at: checkpoint.completed_at,
      lead_summary: checkpoint.lead?.summary || '',
      failed_checks: (checkpoint.checks || []).filter((check) => !check.ok).map((check) => check.command),
    },
    ...(memory.recent_runs || []),
  ].slice(0, 20);
  memory.updated_at = new Date().toISOString();

  await ensureParentDir(PERSISTENT_MEMORY_JSON_PATH);
  await writeJson(PERSISTENT_MEMORY_JSON_PATH, memory);

  const mdLines = [
    '# Strike Run Memory',
    '',
    `updated_at: ${memory.updated_at}`,
    '',
    '## Focus Memory',
    '',
  ];

  for (const entry of Object.values(memory.focus_memory)) {
    mdLines.push(`### ${entry.focus_id}`);
    mdLines.push(`- screen: ${entry.screen}`);
    mdLines.push(`- last_run_id: ${entry.last_run_id}`);
    mdLines.push(`- last_iteration: ${entry.last_iteration}`);
    mdLines.push(`- last_checkpoint_at: ${entry.last_checkpoint_at}`);
    mdLines.push(`- latest_lead_summary: ${entry.latest_lead_summary || 'none'}`);
    mdLines.push(`- recurring_failed_checks: ${(entry.recurring_failed_checks || []).join(' | ') || 'none'}`);
    mdLines.push('- latest_feedback:');
    for (const line of entry.latest_feedback || []) {
      mdLines.push(`  - ${line}`);
    }
    mdLines.push('');
  }

  mdLines.push('## Recent Runs');
  mdLines.push('');
  for (const run of memory.recent_runs || []) {
    mdLines.push(`- ${run.completed_at} | ${run.run_id} | ${run.focus_id} | iter ${run.iteration} | failed_checks=${run.failed_checks.length}`);
    mdLines.push(`  lead: ${run.lead_summary || 'none'}`);
  }
  mdLines.push('');

  await ensureParentDir(PERSISTENT_MEMORY_MD_PATH);
  await fs.writeFile(PERSISTENT_MEMORY_MD_PATH, `${mdLines.join('\n')}\n`, 'utf8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = await readJson(args.configPath);
  const focus = resolveFocus(config, args.focus);
  if (!focus) {
    throw new Error(`Unknown focus: ${args.focus || '(default)'}`);
  }

  const totalIterations = Math.max(1, Math.ceil(args.durationMinutes / args.checkpointMinutes));
  const phasePlan = {
    focus_id: focus.id,
    screen: focus.screen,
    duration_minutes: args.durationMinutes,
    checkpoint_minutes: args.checkpointMinutes,
    total_iterations: totalIterations,
    with_spark: args.withSpark,
    lead_model: args.model,
    spark_model: args.sparkModel,
    goal: args.goal,
    lead_owned_paths: focus.leadOwnedPaths,
    spark_tasks: args.withSpark ? focus.sparkTasks : [],
    verification_commands: focus.verificationCommands,
    player_facing_forbidden_terms: focus.playerFacingForbiddenTerms || [],
    screen_contract: focus.screenContract || null,
    qa_expectations: focus.qaExpectations || [],
  };

  if (args.printOnly) {
    console.log(JSON.stringify(phasePlan, null, 2));
    return;
  }

  const runId = `strike-run-${timestampId()}`;
  const runDir = path.join(DEFAULT_RUNS_DIR, runId);
  const checkpointsDir = path.join(runDir, 'checkpoints');
  await ensureDir(checkpointsDir);

  const worktreeGuard = await collectWorktreeGuard();
  const statePath = path.join(runDir, 'state.json');
  const logPath = path.join(runDir, 'run.log');
  const startedAt = new Date();
  const deadlineAt = new Date(startedAt.getTime() + (args.durationMinutes * 60 * 1000));
  const state = {
    run_id: runId,
    status: 'running',
    started_at: startedAt.toISOString(),
    deadline_at: deadlineAt.toISOString(),
    focus_id: focus.id,
    screen: focus.screen,
    goal: args.goal,
    total_iterations: totalIterations,
    completed_iterations: 0,
    worktree_guard: worktreeGuard,
    lead_model: args.model,
    spark_model: args.withSpark ? args.sparkModel : null,
    current_iteration: 0,
    current_step: 'boot',
    current_task_id: null,
    checkpoints: [],
  };
  await writeJson(statePath, state);
  await fs.writeFile(logPath, `start ${startedAt.toISOString()} ${focus.id}\n`, 'utf8');

  let previousLeadSummary = '';
  const persistentMemory = await loadPersistentMemory();

  for (let iteration = 1; iteration <= totalIterations; iteration += 1) {
    const iterationDir = path.join(checkpointsDir, `iteration-${pad(iteration)}`);
    await ensureDir(iterationDir);
    state.current_iteration = iteration;
    state.current_step = 'spark';
    state.current_task_id = null;
    await writeJson(statePath, state);
    await fs.appendFile(logPath, `iteration ${iteration} start ${new Date().toISOString()}\n`, 'utf8');

    const sparkResults = [];
    if (args.withSpark) {
      for (const task of focus.sparkTasks || []) {
        const taskDir = path.join(iterationDir, task.id);
        await ensureDir(taskDir);
        state.current_task_id = task.id;
        await writeJson(statePath, state);
        await fs.appendFile(logPath, `spark ${iteration} ${task.id} start ${new Date().toISOString()}\n`, 'utf8');
        const sessionPath = path.join(taskDir, 'session.json');
        const transcriptPath = path.join(taskDir, 'codex.jsonl');
        const lastMessagePath = path.join(taskDir, 'last-message.txt');
        const prompt = buildSparkPrompt({ focus, task, iteration, runDir });
        const result = await executeCodexTurn({
          prompt,
          model: args.sparkModel,
          sessionPath,
          transcriptPath,
          lastMessagePath,
        });
        await writeJson(path.join(taskDir, 'result.json'), {
          ok: result.ok,
          code: result.code,
          thread_id: result.threadId,
          usage: result.usage,
          usage_delta: result.usageDelta,
        });
        if (!result.ok && !args.continueOnFailure) {
          throw new Error(`Spark task failed: ${task.id}`);
        }
        await fs.appendFile(logPath, `spark ${iteration} ${task.id} done ok=${result.ok} ${new Date().toISOString()}\n`, 'utf8');
        sparkResults.push({
          taskId: task.id,
          ok: result.ok,
          threadId: result.threadId,
          summary: summarizeLastMessage(result.lastMessage || ''),
        });
      }
    }

    const leadDir = path.join(iterationDir, 'lead');
    await ensureDir(leadDir);
    state.current_step = 'lead';
    state.current_task_id = 'lead';
    await writeJson(statePath, state);
    await fs.appendFile(logPath, `lead ${iteration} start ${new Date().toISOString()}\n`, 'utf8');
    const leadPrompt = buildLeadPrompt({
      focus,
      iteration,
      runDir,
      sparkResults,
      previousLeadSummary,
      persistentFeedback: persistentMemory.focus_memory?.[focus.id]?.latest_feedback || [],
    });
    const leadResult = await executeCodexTurn({
      prompt: leadPrompt,
      model: args.model,
      sessionPath: path.join(leadDir, 'session.json'),
      transcriptPath: path.join(leadDir, 'codex.jsonl'),
      lastMessagePath: path.join(leadDir, 'last-message.txt'),
    });
    await writeJson(path.join(leadDir, 'result.json'), {
      ok: leadResult.ok,
      code: leadResult.code,
      thread_id: leadResult.threadId,
      usage: leadResult.usage,
      usage_delta: leadResult.usageDelta,
    });
    previousLeadSummary = summarizeLastMessage(leadResult.lastMessage || '');
    if (!leadResult.ok && !args.continueOnFailure) {
      throw new Error(`Lead iteration failed: ${iteration}`);
    }
    await fs.appendFile(logPath, `lead ${iteration} done ok=${leadResult.ok} ${new Date().toISOString()}\n`, 'utf8');

    state.current_step = 'checks';
    state.current_task_id = 'checks';
    await writeJson(statePath, state);
    await fs.appendFile(logPath, `checks ${iteration} start ${new Date().toISOString()}\n`, 'utf8');
    const checks = await executeChecks(focus.verificationCommands, iterationDir);
    const failedChecks = checks.filter((check) => !check.ok);
    const checkpoint = {
      iteration,
      completed_at: new Date().toISOString(),
      spark_results: sparkResults,
      lead: {
        ok: leadResult.ok,
        thread_id: leadResult.threadId,
        summary: previousLeadSummary,
      },
      checks,
    };
    const feedback = buildCheckpointFeedback({
      focus,
      iteration,
      sparkResults,
      leadSummary: previousLeadSummary,
      failedChecks,
    });
    checkpoint.feedback = feedback;
    await fs.writeFile(path.join(iterationDir, 'checkpoint-feedback.md'), `${feedback.map((line) => `- ${line}`).join('\n')}\n`, 'utf8');
    state.checkpoints.push(checkpoint);
    state.completed_iterations = iteration;
    state.current_step = 'checkpoint-complete';
    state.current_task_id = null;
    await writeJson(statePath, state);
    await fs.appendFile(logPath, `checkpoint ${iteration} ${checkpoint.completed_at} checks_failed=${failedChecks.length}\n`, 'utf8');
    await persistCheckpointMemory({
      runId,
      focus,
      goal: args.goal,
      iteration,
      checkpoint,
      feedback,
    });
    persistentMemory.focus_memory = {
      ...(persistentMemory.focus_memory || {}),
      [focus.id]: {
        ...(persistentMemory.focus_memory?.[focus.id] || {}),
        latest_feedback: feedback,
      },
    };

    if (failedChecks.length && !args.continueOnFailure) {
      state.status = 'failed';
      state.failed_iteration = iteration;
      await writeJson(statePath, state);
      return;
    }
  }

  state.status = 'completed';
  state.current_step = 'done';
  state.current_task_id = null;
  state.completed_at = new Date().toISOString();
  await writeJson(statePath, state);
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
