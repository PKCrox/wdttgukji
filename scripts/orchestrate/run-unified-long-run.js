#!/usr/bin/env node

import { spawn } from 'child_process';

const PRESETS = {
  '3h': {
    durationHours: 3,
    factoryHours: 1,
    gameHours: 2,
    goal: '3h unified durable run',
    factoryPasses: 10,
    gamePasses: 10,
  },
  overnight: {
    durationHours: 6,
    factoryHours: 2,
    gameHours: 4,
    goal: '6h overnight durable split long run',
    factoryPasses: 10,
    gamePasses: 10,
  },
  'factory-calibration': {
    durationHours: 4,
    factoryHours: 2,
    gameHours: 2,
    goal: '4h factory calibration split run',
    factoryPasses: 12,
    gamePasses: 8,
  },
  'game-push': {
    durationHours: 4,
    factoryHours: 1,
    gameHours: 3,
    goal: '4h game push split run',
    factoryPasses: 8,
    gamePasses: 12,
  },
  '7h': {
    durationHours: 7,
    factoryHours: 2,
    gameHours: 5,
    goal: '7h app-surface redesign marathon',
    factoryPasses: 10,
    gamePasses: 18,
    gameProfile: 'wdttgukji-redesign-campaign',
    env: {
      WDTT_CODEX_APP_SURFACE_MODE: 'redesign-campaign',
      WDTT_APP_SURFACE_REDESIGN_CAMPAIGN_FILE: 'scripts/orchestrate/app-surface-redesign-campaign.json',
    },
  },
  'redesign-marathon': {
    durationHours: 7,
    factoryHours: 2,
    gameHours: 5,
    goal: '7h app-surface redesign marathon',
    factoryPasses: 10,
    gamePasses: 18,
    gameProfile: 'wdttgukji-redesign-campaign',
    env: {
      WDTT_CODEX_APP_SURFACE_MODE: 'redesign-campaign',
      WDTT_APP_SURFACE_REDESIGN_CAMPAIGN_FILE: 'scripts/orchestrate/app-surface-redesign-campaign.json',
    },
  },
};

function parseArgs(argv) {
  const args = {
    durationHours: 6,
    goal: 'unified durable split long run',
    reviewInterval: 5,
    continueOnFailure: true,
    factoryHours: null,
    gameHours: null,
    factoryPasses: 10,
    gamePasses: 10,
    inlineWorkers: 4,
    factoryProfile: 'wdttgukji-diagnostic',
    gameProfile: 'wdttgukji-product-core',
    env: {},
    printOnly: false,
    preset: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--preset') args.preset = argv[++index] || null;
    else if (token === '--duration-hours') args.durationHours = Number(argv[++index] || 6);
    else if (token === '--goal') args.goal = argv[++index] || args.goal;
    else if (token === '--review-interval') args.reviewInterval = Number(argv[++index] || 5);
    else if (token === '--factory-hours') args.factoryHours = Number(argv[++index] || 0);
    else if (token === '--game-hours') args.gameHours = Number(argv[++index] || 0);
    else if (token === '--factory-passes') args.factoryPasses = Number(argv[++index] || 10);
    else if (token === '--game-passes') args.gamePasses = Number(argv[++index] || 10);
    else if (token === '--inline-workers') args.inlineWorkers = Number(argv[++index] || 4);
    else if (token === '--factory-profile') args.factoryProfile = argv[++index] || args.factoryProfile;
    else if (token === '--game-profile') args.gameProfile = argv[++index] || args.gameProfile;
    else if (token === '--continue-on-failure') args.continueOnFailure = true;
    else if (token === '--fail-fast') args.continueOnFailure = false;
    else if (token === '--print-only') args.printOnly = true;
  }

  if (args.preset) {
    const preset = PRESETS[args.preset];
    if (!preset) {
      throw new Error(`Unknown --preset value: ${args.preset}`);
    }
    args.durationHours = preset.durationHours;
    args.goal = preset.goal;
    args.factoryHours = preset.factoryHours;
    args.gameHours = preset.gameHours;
    args.factoryPasses = preset.factoryPasses;
    args.gamePasses = preset.gamePasses;
    if (preset.factoryProfile) args.factoryProfile = preset.factoryProfile;
    if (preset.gameProfile) args.gameProfile = preset.gameProfile;
    args.env = { ...(preset.env || {}) };
  }

  if (!Number.isFinite(args.durationHours) || args.durationHours <= 0) {
    throw new Error(`Invalid --duration-hours value: ${args.durationHours}`);
  }
  if (!Number.isFinite(args.reviewInterval) || args.reviewInterval < 1) {
    throw new Error(`Invalid --review-interval value: ${args.reviewInterval}`);
  }
  if (!Number.isFinite(args.factoryPasses) || args.factoryPasses < 1) {
    throw new Error(`Invalid --factory-passes value: ${args.factoryPasses}`);
  }
  if (!Number.isFinite(args.gamePasses) || args.gamePasses < 1) {
    throw new Error(`Invalid --game-passes value: ${args.gamePasses}`);
  }
  if (!Number.isFinite(args.inlineWorkers) || args.inlineWorkers < 1) {
    throw new Error(`Invalid --inline-workers value: ${args.inlineWorkers}`);
  }

  return args;
}

function resolvePhaseHours(args) {
  if (Number.isFinite(args.factoryHours) && args.factoryHours > 0 && Number.isFinite(args.gameHours) && args.gameHours > 0) {
    return {
      factoryHours: args.factoryHours,
      gameHours: args.gameHours,
    };
  }

  if (Number.isFinite(args.factoryHours) && args.factoryHours > 0) {
    return {
      factoryHours: args.factoryHours,
      gameHours: Math.max(1, args.durationHours - args.factoryHours),
    };
  }

  if (Number.isFinite(args.gameHours) && args.gameHours > 0) {
    return {
      gameHours: args.gameHours,
      factoryHours: Math.max(1, args.durationHours - args.gameHours),
    };
  }

  const factoryHours = Math.max(1, Math.round(args.durationHours / 3));
  const gameHours = Math.max(1, args.durationHours - factoryHours);
  return { factoryHours, gameHours };
}

function validatePhaseHours(args, phaseHours) {
  const total = phaseHours.factoryHours + phaseHours.gameHours;
  if (Math.abs(total - args.durationHours) > 1e-9) {
    throw new Error(
      `Factory/game phase hours must sum to duration-hours (${args.durationHours}); received ${phaseHours.factoryHours} + ${phaseHours.gameHours} = ${total}`
    );
  }
}

function buildCommand(args) {
  const phaseHours = resolvePhaseHours(args);
  validatePhaseHours(args, phaseHours);
  const command = [
    process.execPath,
    'scripts/orchestrate/long-runner.js',
    '--split-factory-game',
    '--runtime-mode', 'durable',
    '--duration-hours', String(args.durationHours),
    '--factory-hours', String(phaseHours.factoryHours),
    '--game-hours', String(phaseHours.gameHours),
    '--review-interval', String(args.reviewInterval),
    '--factory-passes', String(args.factoryPasses),
    '--game-passes', String(args.gamePasses),
    '--inline-workers', String(args.inlineWorkers),
    '--factory-profile', args.factoryProfile,
    '--game-profile', args.gameProfile,
    '--goal', args.goal,
  ];

  if (args.continueOnFailure) {
    command.push('--continue-on-failure');
  }

  return {
    command,
    phaseHours,
    env: {
      ...args.env,
    },
  };
}

function buildPreflight(args, phaseHours) {
  return {
    canonical_entry: 'split durable long-run only',
    split_factory_game: true,
    runtime_mode: 'durable',
    phase_hours_total: phaseHours.factoryHours + phaseHours.gameHours,
    phase_hours_match_duration: phaseHours.factoryHours + phaseHours.gameHours === args.durationHours,
    app_surface_policy: {
      requires_game_phase: true,
      factory_phase_allows_app_surface: false,
      game_phase_allows_app_surface: true,
      legacy_non_split_launch_is_not_canonical: true,
    },
    factory_phase: {
      hours: phaseHours.factoryHours,
      profile: args.factoryProfile,
      passes: args.factoryPasses,
      mutation_mode: 'product-core',
      allow_app_surface: false,
      codex_factory_enabled: true,
      codex_agent_enabled: false,
    },
    game_phase: {
      hours: phaseHours.gameHours,
      profile: args.gameProfile,
      passes: args.gamePasses,
      mutation_mode: 'full',
      allow_app_surface: true,
      codex_factory_enabled: false,
      codex_agent_enabled: true,
      app_surface_mode: args.env.WDTT_CODEX_APP_SURFACE_MODE || 'feature',
      redesign_campaign_file: args.env.WDTT_APP_SURFACE_REDESIGN_CAMPAIGN_FILE || null,
    },
    operator_notes: [
      'Use this launcher instead of legacy passes:long-run entrypoints when app-surface work matters.',
      'Factory phase improves orchestration/QA/runtime; game phase is the only split lane that can mutate app surface.',
      'Redesign presets pin the game phase to a screen-replacement campaign instead of generic app-surface polish.',
    ],
  };
}

function runCommand(command, envOverrides = {}) {
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...Object.fromEntries(Object.entries(envOverrides).filter(([, value]) => value !== undefined && value !== null && value !== '')),
      },
      stdio: 'inherit',
    });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { command, phaseHours, env } = buildCommand(args);
  const preflight = buildPreflight(args, phaseHours);
  const payload = {
    status: args.printOnly ? 'planned' : 'launching',
    preset: args.preset,
    duration_hours: args.durationHours,
    review_interval: args.reviewInterval,
    factory_hours: phaseHours.factoryHours,
    game_hours: phaseHours.gameHours,
    factory_passes: args.factoryPasses,
    game_passes: args.gamePasses,
    inline_workers: args.inlineWorkers,
    factory_profile: args.factoryProfile,
    game_profile: args.gameProfile,
    env_overrides: env,
    continue_on_failure: args.continueOnFailure,
    preflight,
    command,
    monitor_command: [
      process.execPath,
      'scripts/orchestrate/monitor-long-run.js',
    ],
  };

  console.log(JSON.stringify(payload, null, 2));

  if (args.printOnly) {
    return;
  }

  const code = await runCommand(command, env);
  process.exit(code);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
