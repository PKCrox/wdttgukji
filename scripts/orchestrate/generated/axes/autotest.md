# autotest artifact

- updated_at: 2026-03-27T18:19:24.426Z
- candidate: AI persona autotest and balance loop
- pass_index: 10
- run_dir: `/Users/pkcmini/wdttgukji/runs/durable-runtime/durable-run-20260328-031501-3518506e`
- route_source: agent-routing-state
- route_context_origin: agent-routing-state
- urgency_snapshot: app-surface:0, autotest:0, content-pipeline:0
- top_urgency_lane: app-surface
- top_urgency_value: 0
- top_urgency_tie: app-surface, autotest, content-pipeline, design-surface, engine-slice, theme-independence
- top_urgency_tie_text: app-surface, autotest, content-pipeline, design-surface, engine-slice, theme-independence (0)
- top_urgency_tie_count: 6
- primary_focus_axis: theme-independence
- focus_alignment: boosted toward theme-independence
- route_confidence: tied
- route_confidence_raw: tied
- route_confidence_text: tied (6-way tie)
- route_summary: top urgency lane: app-surface (0) · tie app-surface, autotest, content-pipeline, design-surface, engine-slice, theme-independence (0) · tied (6-way tie) · agent-routing-state · origin agent-routing-state

```json
{
  "lane": "autotest",
  "runFile": "scripts/balance/runs/1774635563842.json",
  "balanceScore": 0.587,
  "summary": {
    "n": 200,
    "winDistribution": {
      "wei": 79.5
    },
    "avgTurns": 232.1,
    "stdTurns": 115,
    "avgReversals": 0.07,
    "dramaRate": 0.015,
    "avgEventReach": 37,
    "stalemateRate": 20.5,
    "earlyElimRate": 0,
    "anomalyRate": 20.5
  },
  "components": {
    "winKL": 0.5059,
    "pacingDev": 0.5316,
    "dramaPenalty": 0.985,
    "anomaly": 0.205
  },
  "route_context": {
    "route_context_origin": "agent-routing-state",
    "route_source": "agent-routing-state",
    "urgency_snapshot": "app-surface:0, autotest:0, content-pipeline:0",
    "top_urgency_lane": "app-surface",
    "top_urgency_value": 0,
    "top_urgency_tie": [
      "app-surface",
      "autotest",
      "content-pipeline",
      "design-surface",
      "engine-slice",
      "theme-independence"
    ],
    "top_urgency_tie_text": "app-surface, autotest, content-pipeline, design-surface, engine-slice, theme-independence (0)",
    "top_urgency_tie_count": 6,
    "primary_focus_axis": "theme-independence",
    "focus_alignment": "boosted toward theme-independence",
    "route_confidence": "tied",
    "route_confidence_raw": "tied",
    "route_confidence_text": "tied (6-way tie)",
    "route_summary": "top urgency lane: app-surface (0) · tie app-surface, autotest, content-pipeline, design-surface, engine-slice, theme-independence (0) · tied (6-way tie) · agent-routing-state · origin agent-routing-state"
  }
}
```

