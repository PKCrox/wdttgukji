# Factory Runtime Handoff

## Current State

- canonical long-run entry: `node scripts/orchestrate/run-unified-long-run.js --preset 3h`
- app-surface mutation is only allowed in split durable `game phase`
- factory phase owns orchestration, QA, routing, registry, and replay verification improvements

## Verified Replay Coverage

- `combat`: deterministic combat and duel replay
- `diplomacy`: deterministic alliance/peace/threaten/AI replay
- `event-engine`: deterministic trigger randomness, priority ordering, effect application, and territory edge-case replay
- `turn-loop`: deterministic executeTurnEvents/processPlayerChoice replay on a real scenario fixture
- `save-load`: round-trip + legacy recovery replay

## Operator Guarantees

- `run-factory-replay-suite.js` emits `failed_check_ids`, `failed_checks`, `failure_summary`, and `failure_excerpt`
- `materialize-replay-summary.js` compacts each replay suite result into a small operator digest artifact
- `run-codex-factory-agent.js` surfaces `replay_failure_ids` and `replay_failures` in both success and failure JSON
- `run-codex-factory-agent.js` also surfaces `replay_digest_path` and `replay_digest` in its final JSON
- `run-codex-factory-agent.js` also writes `factory_run_digest_path` and `factory_run_digest` so one compact pass summary points back to replay/candidate/session artifacts
- `factory_run_digest` also includes `route_tie_break` when urgency is tied, so the operator can see the preferred factory-safe lane and supporting artifacts
- when the factory queue is exhausted, `run-codex-factory-agent.js` also surfaces `factory_backlog_refresh_path` and a compact `factory_backlog_refresh` summary in candidate/run digests
- when the factory queue is exhausted and a refresh artifact exists, candidate/run digests upgrade `next_action` from a generic fallback to the top promoted reseed proposal
- `materialize-factory-backlog-refresh.js` writes `scripts/orchestrate/generated/factory-backlog-refresh.json` with small backlog reseed proposals grounded in routing, handoff, and current queue state
- `factory-backlog-refresh.json` now carries `top_proposed_item` and `queue_next_action`, so downstream digests can inherit one source-of-truth promotion target
- `run-codex-factory-agent.js` also rewrites exhausted `backlogSummary.summaryLines` from that same source, so future factory prompts carry the promoted next step instead of the stale generic fallback
- `materialize-factory-lane-follow-through-audit.js` writes a lane-specific generated audit so the top reseed proposal can be inspected as an artifact before it is promoted into the canonical backlog
- when a lane-specific audit already exists, `factory-backlog-refresh.json` and `factory_run_digest` both point at that audit path for the current top proposal
- when the top lane audit includes a ready backlog template, `factory-backlog-refresh.json` and downstream candidate/run digests also surface that item as `top_proposed_backlog_item`
- when diagnostic lanes tie, `factory-backlog-refresh.json` fans those lanes out into compact per-lane follow-through proposals using routing coverage and pending-agent signals
- when `theme-independence` becomes the top urgency lane, `materialize-factory-backlog-refresh.js` now emits `theme-boundary-coverage-audit` even without a tie so the exhausted queue can stay aligned to the active factory-safe route
- when `factory-backlog-refresh.json` was generated for an older run/pass, `run-codex-factory-agent.js` marks it stale and points the operator at the exact rerun command instead of promoting stale proposal lines into the current prompt
- when a top proposed lane audit was generated for another run/pass, `materialize-factory-backlog-refresh.js` now suppresses that stale audit path/template and emits a fresh `materialize-factory-lane-follow-through-audit.js` command instead
- `run-unified-long-run.js --print-only` exposes a preflight contract for split/durable/app-surface policy

## Worktree Rule

- long-run does not see chat text directly; it sees files in the shared worktree
- important decisions must be promoted into docs, backlog JSON, or generated runtime state
- dirty tracked files are common in this repo, so factory self-upgrade should prefer backlog items whose owned paths do not overlap dirty tracked files

## Player Surface Redesign Stage

- app-surface is now in a structural redesign phase, not a polish phase
- use [`docs/player-surface-redesign-brief.md`](./player-surface-redesign-brief.md) as the product thesis for player-facing UI work
- use [`docs/player-surface-wireframe-contract.md`](./player-surface-wireframe-contract.md) to keep start screen, battlefield hub, and command sheet responsibilities separate
- use [`docs/app-surface-long-run-guardrails.md`](./app-surface-long-run-guardrails.md) to block internal runtime/factory meta from leaking into player UI

## Next Direction

- use `scripts/orchestrate/factory-upgrade-backlog.json` as the canonical queue for future self-upgrade work
- prefer bounded QA/runtime/operator improvements before risky runtime-policy surgery
- if `factory_candidate_items` is empty and `safe_candidate_item_count` is `0`, treat the lane as queue-exhausted and refresh the backlog from new runtime/operator gaps before continuing
- queue refresh should start from `scripts/orchestrate/factory-upgrade-backlog.json`, `docs/factory-runtime-handoff.md`, `scripts/orchestrate/generated/agent-routing-state.json`, and `scripts/orchestrate/generated/factory-candidate-items.json`
- when queue exhaustion happens under a diagnostic tie, use the per-lane entries in `scripts/orchestrate/generated/factory-backlog-refresh.json` to choose the next safe reseed instead of inventing a freeform backlog item
