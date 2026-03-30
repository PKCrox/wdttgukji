import fs from 'fs/promises';

const DEFAULT_CAMPAIGN = {
  id: 'app-surface-redesign-campaign',
  version: 1,
  name: 'App Surface Redesign Campaign',
  defaultFocusId: 'battlefield-hub-reset',
  maxIncrementalPassesPerFocus: 2,
  variantSlots: ['A', 'B', 'C'],
  candidateFocusMap: {
    'app-surface-battlefield-reset': 'battlefield-hub-reset',
    'app-surface-command-reset': 'command-sheet-reset',
    'app-surface-start-reset': 'start-screen-reset',
  },
  focuses: [],
};

function normalizeCampaign(raw = {}) {
  const campaign = {
    ...DEFAULT_CAMPAIGN,
    ...raw,
  };
  campaign.variantSlots = Array.isArray(campaign.variantSlots) && campaign.variantSlots.length
    ? campaign.variantSlots
    : DEFAULT_CAMPAIGN.variantSlots;
  campaign.candidateFocusMap = {
    ...DEFAULT_CAMPAIGN.candidateFocusMap,
    ...(raw.candidateFocusMap || {}),
  };
  campaign.focuses = Array.isArray(raw.focuses) ? raw.focuses.map((focus) => ({
    ...focus,
    ownedPaths: Array.isArray(focus.ownedPaths) ? focus.ownedPaths : [],
    successSignals: Array.isArray(focus.successSignals) ? focus.successSignals : [],
    hardRules: Array.isArray(focus.hardRules) ? focus.hardRules : [],
    variantBriefs: focus.variantBriefs || {},
  })) : [];
  return campaign;
}

export async function loadRedesignCampaign(filePath) {
  if (!filePath) return normalizeCampaign();
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    return normalizeCampaign(parsed);
  } catch {
    return normalizeCampaign();
  }
}

function findFocus(campaign, focusId) {
  return campaign.focuses.find((focus) => focus.id === focusId) || campaign.focuses[0] || null;
}

export function deriveRedesignCampaignContext({ campaign, passRecord, session }) {
  const requestedFocusId = campaign.candidateFocusMap?.[passRecord?.candidate?.id]
    || session?.campaign_next_focus_id
    || campaign.defaultFocusId;
  const focus = findFocus(campaign, requestedFocusId);
  const focusId = focus?.id || campaign.defaultFocusId || 'battlefield-hub-reset';
  const previousFocusId = session?.campaign_focus_id || null;
  const previousRepeatCount = Number.isFinite(session?.campaign_focus_repeat_count)
    ? session.campaign_focus_repeat_count
    : 0;
  const previousVariantIndex = Number.isFinite(session?.campaign_variant_index)
    ? session.campaign_variant_index
    : -1;
  const sameFocus = previousFocusId === focusId;
  const repeatCount = sameFocus ? previousRepeatCount + 1 : 1;
  const variantSlots = Array.isArray(campaign.variantSlots) && campaign.variantSlots.length
    ? campaign.variantSlots
    : DEFAULT_CAMPAIGN.variantSlots;
  const variantIndex = sameFocus
    ? (previousVariantIndex + 1 + variantSlots.length) % variantSlots.length
    : 0;
  const variantSlot = variantSlots[variantIndex];
  const maxIncrementalPasses = focus?.maxIncrementalPasses || campaign.maxIncrementalPassesPerFocus || 2;
  const forceReplacement = repeatCount > maxIncrementalPasses;
  const threadPolicy = !sameFocus || forceReplacement ? 'fresh-thread' : 'resume-thread';
  const executionMode = forceReplacement
    ? 'replacement-pass'
    : sameFocus && repeatCount > 1
      ? 'variant-pass'
      : 'focus-pass';
  const reason = !sameFocus
    ? 'focus-changed'
    : forceReplacement
      ? 'stagnation-guard'
      : repeatCount > 1
        ? 'variant-rotation'
        : 'initial-focus';

  return {
    campaignId: campaign.id,
    focusId,
    focus,
    focusLabel: focus?.label || focusId,
    requestedFocusId,
    previousFocusId,
    sameFocus,
    repeatCount,
    variantIndex,
    variantSlot,
    variantBrief: focus?.variantBriefs?.[variantSlot] || '',
    maxIncrementalPasses,
    executionMode,
    threadPolicy,
    reason,
  };
}
