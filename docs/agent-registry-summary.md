# Agent Registry Summary

- version: 320
- updated_at: 2026-03-24T22:58:43.110Z
- last_upgrade_run: /Users/pkc/wdttgukji/runs/pass-runs/meta-run-20260325-075315

## Agents

### pipeline-architect

- role: architecture
- lanes: workflow, theme-independence, meta-review
- mutation_scope: workflow
- auto_upgrade: true
- fit_signals: contract_clarity, cross_lane_reuse, handoff_quality, theme-independence_coverage, theme-independence_handoff_quality
- upgrade_lanes: theme-independence

### world-data-researcher

- role: data
- lanes: content-pipeline
- mutation_scope: workflow
- auto_upgrade: true
- fit_signals: content-pipeline_coverage, content-pipeline_handoff_quality, raw_processed_integrity, source_coverage
- upgrade_lanes: content-pipeline

### content-planner

- role: content
- lanes: content-pipeline
- mutation_scope: workflow
- auto_upgrade: true
- fit_signals: content-pipeline_coverage, content-pipeline_handoff_quality, event_quality, schema_completeness, soul_coverage
- upgrade_lanes: content-pipeline

### koei-systems-designer

- role: systems-design
- lanes: engine-slice, design-surface, app-surface
- mutation_scope: workflow
- auto_upgrade: true
- fit_signals: app-surface_coverage, app-surface_handoff_quality, design-surface_coverage, design-surface_handoff_quality, engine-slice_coverage, engine-slice_handoff_quality, mechanic_coherence, reference_alignment
- upgrade_lanes: app-surface, design-surface, engine-slice

### map-art-director

- role: map-art
- lanes: design-surface, app-surface
- mutation_scope: workflow
- auto_upgrade: true
- fit_signals: app-surface_coverage, app-surface_handoff_quality, base_map_quality, design-surface_coverage, design-surface_handoff_quality, map_legibility
- upgrade_lanes: app-surface, design-surface

### ux-stage-director

- role: ux
- lanes: design-surface, app-surface
- mutation_scope: workflow
- auto_upgrade: true
- fit_signals: action_guidance, app-surface_coverage, app-surface_handoff_quality, design-surface_coverage, design-surface_handoff_quality, first_frame_fit, scene_clarity
- upgrade_lanes: app-surface, design-surface

### engine-integrator

- role: integration
- lanes: engine-slice, design-surface, app-surface, theme-independence
- mutation_scope: product-core
- auto_upgrade: true
- fit_signals: app-surface_coverage, app-surface_handoff_quality, boundary_cleanliness, design-surface_coverage, design-surface_handoff_quality, engine-slice_coverage, engine-slice_handoff_quality, playable_loop_integrity, theme-independence_coverage, theme-independence_handoff_quality
- upgrade_lanes: app-surface, design-surface, engine-slice, theme-independence

### balance-researcher

- role: balance
- lanes: autotest
- mutation_scope: workflow
- auto_upgrade: true
- fit_signals: anomaly_rate, autotest_coverage, autotest_handoff_quality, balance_score, drama_rate
- upgrade_lanes: autotest

### qa-persona-simulator

- role: qa
- lanes: autotest, engine-slice, design-surface, app-surface
- mutation_scope: workflow
- auto_upgrade: true
- fit_signals: app-surface_coverage, app-surface_handoff_quality, autotest_coverage, autotest_handoff_quality, bug_repro_clarity, design-surface_coverage, design-surface_handoff_quality, engine-slice_coverage, engine-slice_handoff_quality, gate_signal_quality, persona_coverage
- upgrade_lanes: app-surface, autotest, design-surface, engine-slice

### release-orchestrator

- role: delivery
- lanes: workflow, meta-review, all
- mutation_scope: workflow
- auto_upgrade: true
- fit_signals: closeout_quality, gate_visibility, handoff_quality
- upgrade_lanes: none

### theme-independence-specialist

- role: theme-specialist
- lanes: theme-independence
- mutation_scope: workflow
- auto_upgrade: true
- fit_signals: theme-independence_coverage, theme-independence_handoff_quality, lane_coverage, handoff_quality
- upgrade_lanes: theme-independence

### autotest-specialist

- role: autotest-specialist
- lanes: autotest
- mutation_scope: workflow
- auto_upgrade: true
- fit_signals: autotest_coverage, autotest_handoff_quality, lane_coverage, handoff_quality
- upgrade_lanes: autotest

### content-pipeline-specialist

- role: content-specialist
- lanes: content-pipeline
- mutation_scope: workflow
- auto_upgrade: true
- fit_signals: content-pipeline_coverage, content-pipeline_handoff_quality, lane_coverage, handoff_quality
- upgrade_lanes: content-pipeline


## Pending Agents

- none

