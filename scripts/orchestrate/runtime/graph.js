import { randomUUID } from 'crypto';

const PHASE_ORDER = ['check', 'gate', 'report', 'edit'];

function chunkEntries(entries) {
  const chunks = [];
  let index = 0;
  while (index < entries.length) {
    const current = entries[index];
    if (current.parallelGroup) {
      const chunk = [current];
      index += 1;
      while (index < entries.length && entries[index].parallelGroup === current.parallelGroup) {
        chunk.push(entries[index]);
        index += 1;
      }
      chunks.push(chunk);
      continue;
    }

    chunks.push([current]);
    index += 1;
  }
  return chunks;
}

function createTaskDescriptor(entry, phase, index, candidate, mutationScope, touchesAppSurface) {
  return {
    id: randomUUID(),
    taskKey: `${phase}-${String(index + 1).padStart(2, '0')}`,
    label: `${candidate.label} :: ${phase} #${index + 1}`,
    phase,
    pattern: 'parallel',
    command: entry.run,
    allowFailure: !!entry.allowFailure,
    mutationScope,
    touchesAppSurface,
    automationLevel: candidate.automationLevel || 'scripted',
    orderIndex: (PHASE_ORDER.indexOf(phase) * 100) + index,
    parallelGroup: entry.parallelGroup || null,
    metadata: {
      axis: candidate.axis,
      candidateId: candidate.id,
      streams: candidate.streams || [],
      acceptanceSignals: candidate.acceptanceSignals || [],
      managedSurfaceAreas: entry.managedSurfaceAreas || candidate.managedSurfaceAreas || [],
      appSurfaceContractVersion: entry.appSurfaceContractVersion || candidate.appSurfaceContractVersion || null,
    },
  };
}

export function compilePassGraph(candidate) {
  const graphTasks = [];
  const lastChunkIdsByPhase = {};

  for (const phase of PHASE_ORDER) {
    const source = phase === 'edit' ? (candidate.editHooks || []) : (candidate.commands || []).filter((entry) => entry.phase === phase);
    const chunks = chunkEntries(source);
    let previousChunkIds = [];
    let sequenceIndex = 0;

    for (const chunk of chunks) {
      const chunkTasks = chunk.map((entry) => createTaskDescriptor(
        entry,
        phase,
        sequenceIndex++,
        candidate,
        phase === 'edit' ? (entry.mutationScope || candidate.hookMutationScope || 'workflow') : 'none',
        phase === 'edit' ? !!entry.touchesAppSurface : false
      ));

      const dependsOn = previousChunkIds.length ? [...previousChunkIds] : (() => {
        const phaseIndex = PHASE_ORDER.indexOf(phase);
        for (let i = phaseIndex - 1; i >= 0; i -= 1) {
          const previousPhase = PHASE_ORDER[i];
          if (lastChunkIdsByPhase[previousPhase]?.length) {
            return [...lastChunkIdsByPhase[previousPhase]];
          }
        }
        return [];
      })();

      for (const task of chunkTasks) {
        graphTasks.push({
          ...task,
          dependsOn,
        });
      }

      previousChunkIds = chunkTasks.map((task) => task.id);
    }

    lastChunkIdsByPhase[phase] = previousChunkIds;
  }

  return graphTasks;
}
