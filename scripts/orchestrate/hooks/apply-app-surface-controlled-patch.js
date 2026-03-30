#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

const INDEX_PATH = path.join(process.cwd(), 'public', 'index.html');
const STYLE_PATH = path.join(process.cwd(), 'public', 'css', 'style.css');
const APP_JS_PATH = path.join(process.cwd(), 'public', 'js', 'app.js');
const ACTION_PANEL_PATH = path.join(process.cwd(), 'public', 'js', 'action-panel.js');
const GENERATED_META_PATH = path.join(process.cwd(), 'public', 'js', 'generated', 'app-surface-meta.js');
const RUNTIME_STATE_PATH = path.join(process.cwd(), 'scripts', 'orchestrate', 'generated', 'runtime-state.json');

function extractMetaValue(source, key) {
  const pattern = new RegExp(`${key}":\\s*"([^"]*)"`);
  return source.match(pattern)?.[1] || '';
}

async function main() {
  const [indexSource, styleSource, appJsSource, actionPanelSource, generatedMetaSource, runtimeStateSource] = await Promise.all([
    fs.readFile(INDEX_PATH, 'utf8'),
    fs.readFile(STYLE_PATH, 'utf8'),
    fs.readFile(APP_JS_PATH, 'utf8'),
    fs.readFile(ACTION_PANEL_PATH, 'utf8'),
    fs.readFile(GENERATED_META_PATH, 'utf8'),
    fs.readFile(RUNTIME_STATE_PATH, 'utf8').catch(() => '{}'),
  ]);

  const runId = extractMetaValue(generatedMetaSource, 'runId') || 'unknown-run';
  const summary = extractMetaValue(generatedMetaSource, 'summary') || 'generated surface active';
  const runtimeState = JSON.parse(runtimeStateSource);
  const topAxis = (runtimeState.persistentBoostAxes || [])[0] || 'engine-slice';

  const axisPalette = {
    autotest: {
      war: 'rgba(120, 198, 255, 0.28)',
      command: 'rgba(120, 198, 255, 0.22)',
    },
    'content-pipeline': {
      war: 'rgba(122, 214, 153, 0.28)',
      command: 'rgba(122, 214, 153, 0.22)',
    },
    'design-surface': {
      war: 'rgba(255, 177, 122, 0.28)',
      command: 'rgba(255, 177, 122, 0.22)',
    },
    'engine-slice': {
      war: 'rgba(216, 179, 106, 0.28)',
      command: 'rgba(216, 179, 106, 0.22)',
    },
  };
  const palette = axisPalette[topAxis] || axisPalette['engine-slice'];

  const headBlock = `<!-- APP_SURFACE_GENERATED_HEAD_START -->
  <meta name="wdttgukji-generated-run" content="${runId}">
  <meta name="wdttgukji-generated-summary" content="${summary}">
  <!-- APP_SURFACE_GENERATED_HEAD_END -->`;

  const bodyBlock = `<!-- APP_SURFACE_GENERATED_BODY_START -->
  <template id="generated-app-surface-stamp" data-run="${runId}" data-summary="${summary}"></template>
  <!-- APP_SURFACE_GENERATED_BODY_END -->`;

  const nextSource = indexSource
    .replace(/<!-- APP_SURFACE_GENERATED_HEAD_START -->[\s\S]*?<!-- APP_SURFACE_GENERATED_HEAD_END -->/, headBlock)
    .replace(/<!-- APP_SURFACE_GENERATED_BODY_START -->[\s\S]*?<!-- APP_SURFACE_GENERATED_BODY_END -->/, bodyBlock);

  const styleBlock = `/* APP_SURFACE_GENERATED_STYLE_START */
:root {
  --generated-war-room-accent: ${palette.war};
  --generated-command-accent: ${palette.command};
  --generated-slot-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
}

#generated-war-room-slot,
#generated-command-slot {
  display: block;
}

#generated-war-room-slot {
  margin: 0 0 12px;
}

#generated-command-slot {
  margin: 0 0 10px;
}

#generated-war-room-slot .factory-status-list span {
  border: 1px solid var(--generated-war-room-accent);
  box-shadow: var(--generated-slot-shadow);
}

#generated-command-slot .factory-status-card {
  border-color: var(--generated-command-accent);
  box-shadow: var(--generated-slot-shadow);
}
/* APP_SURFACE_GENERATED_STYLE_END */`;

  const nextStyleSource = styleSource.replace(
    /\/\* APP_SURFACE_GENERATED_STYLE_START \*\/[\s\S]*?\/\* APP_SURFACE_GENERATED_STYLE_END \*\//,
    styleBlock
  );

  const appBlock = `/* APP_SURFACE_GENERATED_APP_START */
const GENERATED_APP_SURFACE_RUNTIME = {
  warRoomPrefix: '공장 브리프',
  warRoomKickerSuffix: 'generated ${topAxis}',
  warRoomObjectiveSuffix: '현재 우선 축은 ${topAxis} 이며 generated runtime signal이 전장 브리프에 반영됩니다.',
};
/* APP_SURFACE_GENERATED_APP_END */`;

  const nextAppJsSource = appJsSource.replace(
    /\/\* APP_SURFACE_GENERATED_APP_START \*\/[\s\S]*?\/\* APP_SURFACE_GENERATED_APP_END \*\//,
    appBlock
  );

  const panelBlock = `/* APP_SURFACE_GENERATED_PANEL_START */
const GENERATED_COMMAND_PANEL_RUNTIME = {
  briefLabelSuffix: '${topAxis}',
  decisionLabelSuffix: '${topAxis}',
};
/* APP_SURFACE_GENERATED_PANEL_END */`;

  const nextActionPanelSource = actionPanelSource.replace(
    /\/\* APP_SURFACE_GENERATED_PANEL_START \*\/[\s\S]*?\/\* APP_SURFACE_GENERATED_PANEL_END \*\//,
    panelBlock
  );

  await fs.writeFile(INDEX_PATH, nextSource, 'utf8');
  await fs.writeFile(STYLE_PATH, nextStyleSource, 'utf8');
  await fs.writeFile(APP_JS_PATH, nextAppJsSource, 'utf8');
  await fs.writeFile(ACTION_PANEL_PATH, nextActionPanelSource, 'utf8');

  console.log(JSON.stringify({
    status: 'patched',
    target: INDEX_PATH,
    style_target: STYLE_PATH,
    app_target: APP_JS_PATH,
    action_panel_target: ACTION_PANEL_PATH,
    runId,
    summary,
    topAxis,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
