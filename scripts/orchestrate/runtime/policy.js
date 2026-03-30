export const DEFAULT_MUTATION_POLICY = {
  mode: 'product-core',
  allowAppSurface: false,
  allowWorkflowMutation: true,
  allowProductCoreMutation: true,
  allowFullMutation: false,
  requireHumanReviewFor: ['app-surface', 'theme-boundary', 'policy-upgrade'],
  appSurfaceContractVersion: 2,
  appSurfaceManagedPaths: [
    'public/js/app.js',
    'public/js/action-panel.js',
    'public/js/map-renderer.js',
    'public/js/sidebar.js',
    'public/js/presentation-meta.js',
    'public/index.html',
    'public/css/style.css',
    'public/assets/maps/',
    'public/js/generated/',
    'public/css/generated/',
    'public/fragments/generated/',
  ],
};

const MUTATION_WEIGHT = {
  none: 0,
  workflow: 1,
  'product-core': 2,
  full: 3,
};

export function resolveMutationPolicy(env = process.env) {
  const mode = env.WDTT_RUNTIME_MUTATION_MODE || DEFAULT_MUTATION_POLICY.mode;
  return {
    ...DEFAULT_MUTATION_POLICY,
    mode,
    allowAppSurface: env.WDTT_RUNTIME_ALLOW_APP_SURFACE === 'true'
      ? true
      : DEFAULT_MUTATION_POLICY.allowAppSurface,
    allowFullMutation: mode === 'full',
  };
}

export function validateAppSurfaceTask(task, policy) {
  if (!task.touches_app_surface) return { ok: true };
  const managedAreas = task.metadata?.managedSurfaceAreas || [];
  const contractVersion = task.metadata?.appSurfaceContractVersion || null;

  if (!managedAreas.length) {
    return { ok: false, reason: 'missing managedSurfaceAreas metadata' };
  }
  if (contractVersion !== policy.appSurfaceContractVersion) {
    return {
      ok: false,
      reason: `app surface contract mismatch: task=${contractVersion} policy=${policy.appSurfaceContractVersion}`,
    };
  }
  const allManaged = managedAreas.every((area) =>
    policy.appSurfaceManagedPaths.some((prefix) => area.startsWith(prefix))
  );
  if (!allManaged) {
    return { ok: false, reason: 'managedSurfaceAreas contains non-contract path' };
  }

  return { ok: true };
}

export function isTaskAllowedByPolicy(task, policy) {
  if (task.touches_app_surface && !policy.allowAppSurface) return false;
  if (task.touches_app_surface && task.mutation_scope !== 'full') return false;
  const appSurfaceValidation = validateAppSurfaceTask(task, policy);
  if (!appSurfaceValidation.ok) return false;
  const taskWeight = MUTATION_WEIGHT[task.mutation_scope] ?? 0;
  const policyWeight = MUTATION_WEIGHT[policy.mode] ?? 0;
  if (taskWeight > policyWeight) return false;
  if (task.mutation_scope === 'workflow') return !!policy.allowWorkflowMutation;
  if (task.mutation_scope === 'product-core') return !!policy.allowProductCoreMutation;
  if (task.mutation_scope === 'full') return !!policy.allowFullMutation;
  return true;
}
