#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { loadRedesignCampaign, deriveRedesignCampaignContext } from '../lib/app-surface-redesign-campaign.js';

const ROOT = process.cwd();
const GENERATED_DIR = path.join(ROOT, 'scripts', 'orchestrate', 'generated');
const DEFAULT_SESSION_PATH = path.join(GENERATED_DIR, 'codex-app-surface-session.json');
const DEFAULT_MODEL = 'gpt-5.4';
const PLAYER_SURFACE_REDESIGN_BRIEF_PATH = path.join(ROOT, 'docs', 'player-surface-redesign-brief.md');
const PLAYER_SURFACE_WIREFRAME_CONTRACT_PATH = path.join(ROOT, 'docs', 'player-surface-wireframe-contract.md');
const APP_SURFACE_LONG_RUN_GUARDRAILS_PATH = path.join(ROOT, 'docs', 'app-surface-long-run-guardrails.md');
const APP_SURFACE_REDESIGN_CAMPAIGN_DOC_PATH = path.join(ROOT, 'docs', 'app-surface-redesign-campaign.md');
const DEFAULT_APP_SURFACE_REDESIGN_CAMPAIGN_PATH = path.join(ROOT, 'scripts', 'orchestrate', 'app-surface-redesign-campaign.json');

function parseArgs(argv) {
  const args = {
    runDir: null,
    passJson: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--run-dir') args.runDir = argv[++index] || null;
    else if (token === '--pass-json') args.passJson = argv[++index] || null;
  }

  if (!args.runDir) throw new Error('--run-dir is required');
  if (!args.passJson) throw new Error('--pass-json is required');
  return args;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJsonIfExists(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function readTextIfExists(filePath, fallback = '') {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

function deriveRouteMetadata({ passRecord, runtimeState, factorySummary, session }) {
  const topAxis = runtimeState.primaryFocusAxis || runtimeState.topUrgencyLane || factorySummary.primaryFocusAxis || factorySummary.topUrgencyLane || session?.primary_focus_axis || session?.top_urgency_lane || (runtimeState.persistentBoostAxes || [])[0] || passRecord.candidate.axis;
  const routeSource = runtimeState.routeSource || factorySummary.routeSource || session?.route_source || 'n/a';
  const routeContextOrigin = (() => {
    if (runtimeState.routeContextOrigin) return runtimeState.routeContextOrigin;
    if (factorySummary.routeContextOrigin) return factorySummary.routeContextOrigin;
    if (session?.route_context_origin) return session.route_context_origin;
    if (routeSource === 'agent-routing-state') return 'agent-routing-state';
    if (routeSource === 'runtime-state') return 'runtime-state';
    if (routeSource === 'factory-summary') return 'factory-summary';
    return 'derived';
  })();
  const routeConfidence = runtimeState.routeConfidence || factorySummary.routeConfidence || session?.route_confidence || 'n/a';
  const topUrgencyLane = runtimeState.topUrgencyLane || factorySummary.topUrgencyLane || session?.top_urgency_lane || 'n/a';
  const topUrgencyValue = runtimeState.topUrgencyValue ?? factorySummary.topUrgencyValue ?? session?.top_urgency_value ?? 'n/a';
  const topUrgencyTieCount = runtimeState.topUrgencyTieCount ?? factorySummary.topUrgencyTieCount ?? session?.top_urgency_tie_count ?? 0;
  const routeConfidenceText = runtimeState.routeConfidenceText
    || factorySummary.routeConfidenceText
    || session?.route_confidence_text
    || (routeConfidence === 'tied' ? `tied (${topUrgencyTieCount}-way tie)` : routeConfidence);
  const topUrgencyTie = runtimeState.topUrgencyTieText
    || factorySummary.topUrgencyTieText
    || session?.top_urgency_tie_text
    || (Array.isArray(runtimeState.topUrgencyTie) && runtimeState.topUrgencyTie.length
    ? runtimeState.topUrgencyTie.join(', ')
    : Array.isArray(factorySummary.topUrgencyTie) && factorySummary.topUrgencyTie.length
      ? factorySummary.topUrgencyTie.join(', ')
    : Array.isArray(session?.top_urgency_tie) && session.top_urgency_tie.length
      ? session.top_urgency_tie.join(', ')
      : 'none');
  const urgencySnapshot = runtimeState.urgencySnapshot || factorySummary.urgencySnapshot || session?.urgency_snapshot || 'n/a';
  const baseRouteSummary = runtimeState.routeSummary
    || factorySummary.routeSummary
    || session?.route_summary
    || `top urgency lane: ${topUrgencyLane} (${topUrgencyValue}) · tie ${topUrgencyTie} · tie count ${topUrgencyTieCount} · ${routeConfidenceText} · ${routeSource} · origin ${routeContextOrigin}`;
  const routeSummary = baseRouteSummary.includes('· origin ') ? baseRouteSummary : `${baseRouteSummary} · origin ${routeContextOrigin}`;
  const focusAlignment = runtimeState.focusAlignment
    || factorySummary.focusAlignment
    || session?.focus_alignment
    || (topAxis === passRecord.candidate.axis
      ? 'aligned'
      : `boosted toward ${topAxis}`);
  return {
    topAxis,
    routeSource,
    routeContextOrigin,
    routeConfidence,
    routeConfidenceText,
    topUrgencyLane,
    topUrgencyValue,
    topUrgencyTie,
    topUrgencyTieCount,
    urgencySnapshot,
    routeSummary,
    focusAlignment,
  };
}

function buildPrompt({
  runDir,
  passRecord,
  runtimeState,
  factorySummary,
  session,
  redesignCampaignPath,
  redesignCampaignDocPath,
  redesignCampaignContext,
  playerSurfaceRedesignBriefPath,
  playerSurfaceWireframeContractPath,
  appSurfaceLongRunGuardrailsPath,
}) {
  const {
    topAxis,
    routeSource,
    routeContextOrigin,
    routeConfidence,
    routeConfidenceText,
    topUrgencyLane,
    topUrgencyValue,
    topUrgencyTie,
    topUrgencyTieCount,
    urgencySnapshot,
    routeSummary,
    focusAlignment,
  } = deriveRouteMetadata({ passRecord, runtimeState, factorySummary, session });
  const featureMode = process.env.WDTT_CODEX_APP_SURFACE_MODE || 'feature';
  const campaignFocus = redesignCampaignContext?.focus;
  return [
    'Run the wdttgukji app-surface redesign lane for this pass.',
    'Product stage: player-surface structural redesign. Do not spend this pass on tiny polish if a flow or frame problem remains.',
    'This lane is in redesign campaign mode. Treat weak existing compositions as disposable and prefer structural replacement over incremental nudging.',
    `Current durable run dir: ${runDir}`,
    `Current pass json: ${path.join(runDir, `pass-${String(passRecord.index).padStart(3, '0')}.json`)}`,
    `Top runtime boost axis: ${topAxis}`,
    `Route source: ${routeSource}`,
    `Route context origin: ${routeContextOrigin}`,
    `Route confidence raw: ${routeConfidence}`,
    `Route confidence: ${routeConfidenceText}`,
    `Route summary: ${routeSummary}`,
    `Focus alignment: ${focusAlignment}`,
    `Urgency snapshot: ${urgencySnapshot}`,
    `Top urgency lane: ${topUrgencyLane}`,
    `Top urgency tie count: ${topUrgencyTieCount}`,
    `Top urgency tie: ${topUrgencyTie}`,
    `Top urgency value: ${topUrgencyValue}`,
    `App surface mode: ${featureMode}`,
    `Redesign campaign file: ${redesignCampaignPath}`,
    `Redesign campaign doc: ${redesignCampaignDocPath}`,
    `Redesign focus id: ${redesignCampaignContext?.focusId || 'n/a'}`,
    `Redesign focus label: ${redesignCampaignContext?.focusLabel || 'n/a'}`,
    `Redesign screen: ${campaignFocus?.screen || 'n/a'}`,
    `Redesign execution mode: ${redesignCampaignContext?.executionMode || 'n/a'}`,
    `Redesign thread policy: ${redesignCampaignContext?.threadPolicy || 'n/a'}`,
    `Redesign reason: ${redesignCampaignContext?.reason || 'n/a'}`,
    `Redesign repeat count: ${redesignCampaignContext?.repeatCount ?? 0}`,
    `Redesign variant slot: ${redesignCampaignContext?.variantSlot || 'n/a'}`,
    `Redesign variant brief: ${redesignCampaignContext?.variantBrief || 'n/a'}`,
    'Read and obey these player-surface contracts before editing:',
    `- ${playerSurfaceRedesignBriefPath}`,
    `- ${playerSurfaceWireframeContractPath}`,
    `- ${appSurfaceLongRunGuardrailsPath}`,
    `- ${redesignCampaignDocPath}`,
    'Non-negotiable player-surface rules for this pass:',
    '- Player-visible UI must not expose generated/factory/lane/urgency/agent-routing-state text.',
    '- Treat the product as three screens with separate responsibilities: start screen, battlefield hub, command sheet.',
    '- Optimize for the first 10 minutes of play: city comprehension, action selection, and turn commitment.',
    '- Prefer one coherent structural improvement to one screen or transition over scattered polish across many screens.',
    '- If a generated fragment or runtime meta block is currently in the player surface, removing or relocating it is valid product work.',
    '- Produce a visibly different composition for the focused screen. Do not merely reshuffle spacing or wording.',
    '- If the current shell is the bottleneck, replace it rather than protecting it.',
    '- Stay inside the focused screen boundary unless a small glue change is needed for playability.',
    ...(campaignFocus ? [`Focused screen objective: ${campaignFocus.objective}`] : []),
    ...(campaignFocus?.ownedPaths?.length ? [`Focused owned paths: ${campaignFocus.ownedPaths.join(', ')}`] : []),
    ...(campaignFocus?.successSignals?.length ? ['Focus success signals:', ...campaignFocus.successSignals.map((item) => `- ${item}`)] : []),
    ...(campaignFocus?.hardRules?.length ? ['Focus hard rules:', ...campaignFocus.hardRules.map((item) => `- ${item}`)] : []),
    'Task:',
    '- Make one concrete, bounded but structural improvement to the focused screen, not just bookkeeping.',
    '- Prefer structural player-surface work over tiny polish while the product is still failing the first-frame/first-action contract.',
    '- Large but bounded feature work is allowed if it fits inside the app-surface contract and stays shippable in one pass.',
    '- Good targets include: map interaction upgrades, selection/command flow, war-room summary rails, action-panel decision UX, keyboard-first controls, or tactical overlays.',
    '- Prefer real changes in public/js/app.js, public/js/action-panel.js, public/js/map-renderer.js, public/index.html, public/css/style.css, or public/js/presentation-meta.js.',
    '- You may also update generated app-surface files under public/js/generated, public/css/generated, public/fragments/generated if helpful.',
    '- Stay within the app-surface contract and do not touch unrelated services or directories.',
    '- Preserve the existing Korean strategy-game tone and current visual language.',
    '- If you choose feature-sized work, keep it coherent: wire UI, state handling, and styling together instead of leaving a dead shell.',
    '- End the pass with a screenshot-detectable structural delta, not just internal cleanup.',
    'Verification:',
    '- Run node --check public/js/app.js',
    '- Run node --check public/js/action-panel.js',
    '- Run node --check public/js/map-renderer.js if you change it',
    '- Do not run npm run qa:slice inside this Codex hook; the outer durable lane already runs that gate and sandboxed re-runs can fail with listen EPERM.',
    'Finish by briefly listing changed files and the verification result.',
  ].join('\n');
}

function runCodex(args, cwd) {
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
      });
    });
  });
}

function extractThreadId(stdout, fallback) {
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
  return {
    input_tokens: null,
    output_tokens: null,
    total_tokens: null,
  };
}

function computeUsageDelta(currentUsage, previousUsage) {
  const diff = (current, previous) => {
    if (!Number.isFinite(current)) return null;
    if (!Number.isFinite(previous)) return current;
    return Math.max(0, current - previous);
  };

  const deltaInput = diff(currentUsage.input_tokens, previousUsage?.input_tokens);
  const deltaOutput = diff(currentUsage.output_tokens, previousUsage?.output_tokens);
  const deltaTotal = Number.isFinite(currentUsage.total_tokens)
    ? diff(currentUsage.total_tokens, previousUsage?.total_tokens)
    : (Number.isFinite(deltaInput) || Number.isFinite(deltaOutput)
      ? (deltaInput ?? 0) + (deltaOutput ?? 0)
      : null);

  return {
    delta_input_tokens: deltaInput,
    delta_output_tokens: deltaOutput,
    delta_total_tokens: deltaTotal,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const enabled = process.env.WDTT_CODEX_AGENT_ENABLED === 'true';
  if (!enabled) {
    console.log(JSON.stringify({ status: 'skipped', reason: 'WDTT_CODEX_AGENT_ENABLED=false' }, null, 2));
    return;
  }

  const passRecord = JSON.parse(await fs.readFile(args.passJson, 'utf8'));
  const runtimeState = await readJsonIfExists(path.join(GENERATED_DIR, 'runtime-state.json'), {});
  const factorySummary = await readJsonIfExists(path.join(GENERATED_DIR, 'factory-runtime-summary.json'), {});
  const sessionPath = process.env.WDTT_CODEX_SESSION_FILE || DEFAULT_SESSION_PATH;
  const session = await readJsonIfExists(sessionPath, null);
  const routeMeta = deriveRouteMetadata({ passRecord, runtimeState, factorySummary, session });
  const codexDir = path.join(args.runDir, 'codex');
  await ensureDir(codexDir);
  const lastMessagePath = path.join(codexDir, `pass-${String(passRecord.index).padStart(3, '0')}-last-message.txt`);
  const usagePath = path.join(codexDir, `pass-${String(passRecord.index).padStart(3, '0')}-usage.json`);
  const transcriptPath = path.join(codexDir, `pass-${String(passRecord.index).padStart(3, '0')}-codex.jsonl`);
  const playerSurfaceRedesignBrief = await readTextIfExists(PLAYER_SURFACE_REDESIGN_BRIEF_PATH);
  const playerSurfaceWireframeContract = await readTextIfExists(PLAYER_SURFACE_WIREFRAME_CONTRACT_PATH);
  const appSurfaceLongRunGuardrails = await readTextIfExists(APP_SURFACE_LONG_RUN_GUARDRAILS_PATH);
  const redesignCampaignPath = process.env.WDTT_APP_SURFACE_REDESIGN_CAMPAIGN_FILE || DEFAULT_APP_SURFACE_REDESIGN_CAMPAIGN_PATH;
  const redesignCampaign = await loadRedesignCampaign(redesignCampaignPath);
  const redesignCampaignContext = deriveRedesignCampaignContext({
    campaign: redesignCampaign,
    passRecord,
    session,
  });
  const missingContracts = [
    !playerSurfaceRedesignBrief ? PLAYER_SURFACE_REDESIGN_BRIEF_PATH : null,
    !playerSurfaceWireframeContract ? PLAYER_SURFACE_WIREFRAME_CONTRACT_PATH : null,
    !appSurfaceLongRunGuardrails ? APP_SURFACE_LONG_RUN_GUARDRAILS_PATH : null,
    !(await readTextIfExists(APP_SURFACE_REDESIGN_CAMPAIGN_DOC_PATH)) ? APP_SURFACE_REDESIGN_CAMPAIGN_DOC_PATH : null,
  ].filter(Boolean);
  const prompt = buildPrompt({
    runDir: args.runDir,
    passRecord,
    runtimeState,
    factorySummary,
    session,
    redesignCampaignPath,
    redesignCampaignDocPath: APP_SURFACE_REDESIGN_CAMPAIGN_DOC_PATH,
    redesignCampaignContext,
    playerSurfaceRedesignBriefPath: PLAYER_SURFACE_REDESIGN_BRIEF_PATH,
    playerSurfaceWireframeContractPath: PLAYER_SURFACE_WIREFRAME_CONTRACT_PATH,
    appSurfaceLongRunGuardrailsPath: APP_SURFACE_LONG_RUN_GUARDRAILS_PATH,
  });
  const model = process.env.WDTT_CODEX_MODEL || DEFAULT_MODEL;
  const shouldResumeThread = !!session?.thread_id && redesignCampaignContext.threadPolicy !== 'fresh-thread';

  const codexArgs = shouldResumeThread
    ? ['exec', 'resume', session.thread_id, '--json', '-o', lastMessagePath, prompt]
    : ['exec', '--json', '--full-auto', '-C', ROOT, '-o', lastMessagePath, prompt];
  if (model) {
    const insertAt = shouldResumeThread ? 3 : 2;
    codexArgs.splice(insertAt, 0, '--model', model);
  }

  const result = await runCodex(codexArgs, ROOT);
  const threadId = extractThreadId(result.stdout, shouldResumeThread ? session?.thread_id || null : null);
  const usage = extractUsage(result.stdout);
  const usageDelta = computeUsageDelta(usage, session?.last_usage || null);
  await ensureDir(path.dirname(sessionPath));
  await fs.writeFile(transcriptPath, result.stdout, 'utf8');
  await fs.writeFile(usagePath, `${JSON.stringify({
    model,
    thread_id: threadId,
    resumed: shouldResumeThread,
    pass_index: passRecord.index,
    candidate_id: passRecord.candidate.id,
    candidate_axis: passRecord.candidate.axis,
    campaign_id: redesignCampaignContext.campaignId,
    campaign_focus_id: redesignCampaignContext.focusId,
    campaign_focus_label: redesignCampaignContext.focusLabel,
    campaign_execution_mode: redesignCampaignContext.executionMode,
    campaign_variant_slot: redesignCampaignContext.variantSlot,
    campaign_thread_policy: redesignCampaignContext.threadPolicy,
    ...usage,
    ...usageDelta,
    updated_at: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8');
  if (threadId) {
    await fs.writeFile(sessionPath, `${JSON.stringify({
      thread_id: threadId,
      model,
      updated_at: new Date().toISOString(),
      last_run_dir: args.runDir,
      last_pass_index: passRecord.index,
      primary_focus_axis: runtimeState.primaryFocusAxis || factorySummary.primaryFocusAxis || null,
      focus_alignment: routeMeta.focusAlignment,
      route_source: runtimeState.routeSource || factorySummary.routeSource || null,
      route_context_origin: routeMeta.routeContextOrigin,
      route_confidence: runtimeState.routeConfidence || factorySummary.routeConfidence || null,
      route_confidence_raw: runtimeState.routeConfidence || factorySummary.routeConfidence || null,
      route_confidence_text: routeMeta.routeConfidenceText,
      route_summary: routeMeta.routeSummary,
      urgency_snapshot: runtimeState.urgencySnapshot || factorySummary.urgencySnapshot || routeMeta.urgencySnapshot,
      top_urgency_lane: runtimeState.topUrgencyLane || factorySummary.topUrgencyLane || null,
      top_urgency_tie: runtimeState.topUrgencyTie || factorySummary.topUrgencyTie || [],
      top_urgency_tie_text: runtimeState.topUrgencyTieText || factorySummary.topUrgencyTieText || 'none',
      top_urgency_tie_count: runtimeState.topUrgencyTieCount ?? factorySummary.topUrgencyTieCount ?? 0,
      top_urgency_value: runtimeState.topUrgencyValue ?? factorySummary.topUrgencyValue ?? null,
      product_stage: 'player-surface-structural-redesign',
      campaign_id: redesignCampaignContext.campaignId,
      campaign_focus_id: redesignCampaignContext.focusId,
      campaign_focus_label: redesignCampaignContext.focusLabel,
      campaign_focus_repeat_count: redesignCampaignContext.repeatCount,
      campaign_variant_index: redesignCampaignContext.variantIndex,
      campaign_variant_slot: redesignCampaignContext.variantSlot,
      campaign_execution_mode: redesignCampaignContext.executionMode,
      campaign_thread_policy: redesignCampaignContext.threadPolicy,
      campaign_reason: redesignCampaignContext.reason,
      campaign_next_focus_id: redesignCampaignContext.focusId,
      player_surface_contracts: {
        redesign_brief_path: PLAYER_SURFACE_REDESIGN_BRIEF_PATH,
        wireframe_contract_path: PLAYER_SURFACE_WIREFRAME_CONTRACT_PATH,
        long_run_guardrails_path: APP_SURFACE_LONG_RUN_GUARDRAILS_PATH,
        redesign_campaign_doc_path: APP_SURFACE_REDESIGN_CAMPAIGN_DOC_PATH,
        redesign_campaign_file_path: redesignCampaignPath,
      },
      last_usage: usage,
    }, null, 2)}\n`, 'utf8');
  }

  if (!result.ok) {
    console.error(result.stderr || result.stdout);
    process.exit(result.code || 1);
  }

  console.log(JSON.stringify({
    status: 'completed',
    code: result.code,
    thread_id: threadId,
    model,
    primary_focus_axis: runtimeState.primaryFocusAxis || factorySummary.primaryFocusAxis || null,
    focus_alignment: routeMeta.focusAlignment,
    route_source: runtimeState.routeSource || factorySummary.routeSource || null,
    route_context_origin: routeMeta.routeContextOrigin,
    route_summary: routeMeta.routeSummary,
    route_confidence_raw: runtimeState.routeConfidence || factorySummary.routeConfidence || null,
    route_confidence_text: routeMeta.routeConfidenceText,
    urgency_snapshot: runtimeState.urgencySnapshot || factorySummary.urgencySnapshot || routeMeta.urgencySnapshot,
    top_urgency_lane: runtimeState.topUrgencyLane || factorySummary.topUrgencyLane || null,
    top_urgency_value: runtimeState.topUrgencyValue ?? factorySummary.topUrgencyValue ?? null,
    top_urgency_tie: runtimeState.topUrgencyTie || factorySummary.topUrgencyTie || [],
    top_urgency_tie_text: runtimeState.topUrgencyTieText || factorySummary.topUrgencyTieText || 'none',
    top_urgency_tie_count: runtimeState.topUrgencyTieCount ?? factorySummary.topUrgencyTieCount ?? 0,
    session_path: sessionPath,
    last_message_path: lastMessagePath,
    usage_path: usagePath,
    transcript_path: transcriptPath,
    product_stage: 'player-surface-structural-redesign',
    campaign: {
      id: redesignCampaignContext.campaignId,
      focus_id: redesignCampaignContext.focusId,
      focus_label: redesignCampaignContext.focusLabel,
      execution_mode: redesignCampaignContext.executionMode,
      variant_slot: redesignCampaignContext.variantSlot,
      thread_policy: redesignCampaignContext.threadPolicy,
      repeat_count: redesignCampaignContext.repeatCount,
      reason: redesignCampaignContext.reason,
      campaign_file_path: redesignCampaignPath,
      campaign_doc_path: APP_SURFACE_REDESIGN_CAMPAIGN_DOC_PATH,
    },
    player_surface_contracts: {
      redesign_brief_path: PLAYER_SURFACE_REDESIGN_BRIEF_PATH,
      wireframe_contract_path: PLAYER_SURFACE_WIREFRAME_CONTRACT_PATH,
      long_run_guardrails_path: APP_SURFACE_LONG_RUN_GUARDRAILS_PATH,
      redesign_campaign_doc_path: APP_SURFACE_REDESIGN_CAMPAIGN_DOC_PATH,
      redesign_campaign_file_path: redesignCampaignPath,
      missing_contracts: missingContracts,
    },
    usage,
    usage_delta: usageDelta,
    resumed: shouldResumeThread,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
