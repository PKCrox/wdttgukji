function totalScore(scores) {
  return (scores.playerHarm || 0)
    + (scores.visibility || 0)
    + (scores.leverage || 0)
    + (scores.confidence || 0)
    + (scores.gatePressure || 0);
}

function summarizeCounts(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function maxStreak(values) {
  let best = 0;
  let current = 0;
  let previous = null;
  for (const value of values) {
    if (value === previous) current += 1;
    else current = 1;
    previous = value;
    best = Math.max(best, current);
  }
  return best;
}

function getRecentPasses(state, count = 2) {
  return state.passes.slice(Math.max(0, state.passes.length - count));
}

function getRemainingPasses(state) {
  return Math.max(0, state.requested_passes - state.passes.length);
}

function getUnseenRequiredAxes(profile, state) {
  const seen = new Set(state.passes.map((entry) => entry.candidate.axis));
  return (profile.requiredAxes || []).filter((axis) => !seen.has(axis));
}

function getAxisCounts(state) {
  return state.passes.reduce((acc, entry) => {
    acc[entry.candidate.axis] = (acc[entry.candidate.axis] || 0) + 1;
    return acc;
  }, {});
}

function baseScoreCandidate(candidate, state) {
  const completedCount = state.completedCounts[candidate.id] || 0;
  const failedCount = state.failedCounts[candidate.id] || 0;
  const recentPasses = getRecentPasses(state, 2);
  const sameCandidateRecent = recentPasses.filter((entry) => entry.candidate.id === candidate.id).length;
  const sameAxisRecent = recentPasses.filter((entry) => entry.candidate.axis === candidate.axis).length;
  const completionPenalty = candidate.repeatable ? completedCount * 0.75 : completedCount * 4;
  const repetitionPenalty = (sameCandidateRecent * 3.5) + (sameAxisRecent * 1.5);
  return totalScore(candidate.scores) - completionPenalty - repetitionPenalty - (failedCount * 2);
}

export function chooseCandidate(profile, state, options = {}) {
  const unseenRequiredAxes = getUnseenRequiredAxes(profile, state);
  const remainingPasses = getRemainingPasses(state);
  const axisCounts = getAxisCounts(state);
  const targetAxisCounts = profile.targetAxisCounts || {};
  const reviewBoostAxes = state.reviewHints?.boostAxes || [];
  const persistentBoostAxes = state.runtimeHints?.persistentBoostAxes || [];
  const laneUrgency = state.agentRoutingHints?.laneUrgency || {};
  const totalAxisDeficit = Object.entries(targetAxisCounts)
    .reduce((acc, [axis, target]) => acc + Math.max(0, target - (axisCounts[axis] || 0)), 0);

  const ranked = profile.candidates
    .map((candidate) => {
      const eligible = options.dryRun || candidate.commands.length > 0 || (options.includeHybrid && candidate.automationLevel === 'hybrid');
      const unseenAxis = unseenRequiredAxes.includes(candidate.axis);
      const seenCandidate = !!state.completedCounts[candidate.id];
      const currentAxisCount = axisCounts[candidate.axis] || 0;
      const targetAxisCount = targetAxisCounts[candidate.axis] || 0;
      const axisDeficit = Math.max(0, targetAxisCount - currentAxisCount);
      const axisSurplus = Math.max(0, currentAxisCount - targetAxisCount);
      let score = baseScoreCandidate(candidate, state);

      if (unseenAxis) score += 3.5;
      if (!seenCandidate) score += 1.5;
      if (unseenAxis && remainingPasses <= unseenRequiredAxes.length) score += 6;
      if (axisDeficit > 0) score += axisDeficit * 2.5;
      if (axisDeficit > 0 && remainingPasses <= totalAxisDeficit + unseenRequiredAxes.length) score += 4.5;
      if (axisDeficit > 0 && remainingPasses <= unseenRequiredAxes.length + 2) score += 2;
      if (axisSurplus > 0) score -= axisSurplus * 4;
      if (targetAxisCount > 0 && currentAxisCount >= targetAxisCount) score -= 2;
      if (reviewBoostAxes.includes(candidate.axis)) score += 2;
      if (persistentBoostAxes.includes(candidate.axis)) score += 1;
      if ((laneUrgency[candidate.axis] || 0) > 0) score += Math.min(3, laneUrgency[candidate.axis]);

      return { candidate, score, eligible };
    })
    .filter((entry) => entry.eligible)
    .sort((a, b) => b.score - a.score || a.candidate.label.localeCompare(b.candidate.label, 'ko'));

  return {
    chosen: ranked[0]?.candidate || null,
    ranked,
  };
}

export function buildCheckpointReview(profile, state, uptoPass) {
  const consideredPasses = state.passes.filter((entry) => entry.index <= uptoPass);
  const axes = consideredPasses.map((entry) => entry.candidate.axis);
  const candidates = consideredPasses.map((entry) => entry.candidate.id);
  const axisCounts = summarizeCounts(axes);
  const candidateCounts = summarizeCounts(candidates);
  const targetAxisCounts = profile.targetAxisCounts || {};
  const expectedByNow = Object.fromEntries(
    Object.entries(targetAxisCounts).map(([axis, target]) => [axis, Number(((target * uptoPass) / state.requested_passes).toFixed(2))])
  );
  const paceDeficits = Object.entries(expectedByNow)
    .map(([axis, expected]) => ({
      axis,
      expected,
      actual: axisCounts[axis] || 0,
      deficit: Number(Math.max(0, expected - (axisCounts[axis] || 0)).toFixed(2)),
    }))
    .filter((entry) => entry.deficit > 0);
  const boostAxes = paceDeficits
    .sort((a, b) => b.deficit - a.deficit || a.axis.localeCompare(b.axis, 'ko'))
    .map((entry) => entry.axis);

  return {
    review_after_pass: uptoPass,
    axis_counts: axisCounts,
    candidate_counts: candidateCounts,
    axis_max_streak: maxStreak(axes),
    candidate_max_streak: maxStreak(candidates),
    target_axis_counts: targetAxisCounts,
    expected_by_now: expectedByNow,
    pace_deficits: paceDeficits,
    boost_axes: boostAxes,
    feedback: boostAxes.length
      ? [`Intermediate review recommends boosting: ${boostAxes.join(', ')}`]
      : ['Intermediate review is on pace.'],
  };
}

export function summarizePass(passRecord, ranked) {
  const successfulCommands = passRecord.commands.filter((entry) => entry.ok).length;
  const failedCommands = passRecord.commands.filter((entry) => !entry.ok && !entry.allowFailure).length;
  const softFailedCommands = passRecord.commands.filter((entry) => !entry.ok && entry.allowFailure).length;
  const nextPassCandidates = ranked.slice(0, 3).map(({ candidate, score }) => ({
    label: candidate.label,
    axis: candidate.axis,
    score,
  }));
  const winnerScore = nextPassCandidates[0]?.score ?? null;
  const runnerUpScore = nextPassCandidates[1]?.score ?? null;
  const scoreGap = winnerScore != null && runnerUpScore != null ? Number((winnerScore - runnerUpScore).toFixed(2)) : null;

  return {
    dominant_bottleneck: passRecord.candidate.axis,
    next_pass_candidates: nextPassCandidates,
    chosen_next_pass: nextPassCandidates[0]?.label || null,
    winner_score: winnerScore,
    runner_up_score: runnerUpScore,
    score_gap: scoreGap,
    selection_confidence: scoreGap == null
      ? 'insufficient-data'
      : scoreGap >= 3
        ? 'clear'
        : scoreGap >= 1
          ? 'moderate'
          : 'tight',
    why_not_others: nextPassCandidates.slice(1).map((entry) =>
      `${entry.label} scored lower than ${nextPassCandidates[0]?.label || 'the chosen pass'}`
    ),
    command_summary: {
      successfulCommands,
      failedCommands,
      softFailedCommands,
    },
  };
}
