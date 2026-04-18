---
status: awaiting_human_verify
trigger: "remove the shadow, replace the name to be Heatmap and base the system on the basis of dependancies"
created: 2026-04-19T02:05:00+05:30
updated: 2026-04-19T02:07:00+05:30
---

## Current Focus

hypothesis: legend styling/text and heat score calculation are both in GraphView and can be updated in one patch
test: user verifies heatmap card styling/title and dependency-only score behavior
expecting: no legend shadow, title is Heatmap, and score system is dependency-based
next_action: await user confirmation

## Symptoms

expected: no legend shadow, title reads Heatmap, score based on dependencies
actual: legend still has shadow, title says Risk Heatmap, score uses dependents + outgoing edges
errors: visual and scoring mismatch with requested behavior
reproduction: open dashboard graph and inspect heatmap legend/colors
started: current request

## Eliminated

## Evidence

- timestamp: 2026-04-19T02:06:30+05:30
	checked: GraphView heatmap computation and legend rendering
	found: removed legend shadow class, renamed title from Risk Heatmap to Heatmap, and changed score from dependents+outgoing to outgoing dependencies only
	implication: requested visual and scoring behavior is implemented

- timestamp: 2026-04-19T02:06:55+05:30
	checked: frontend production build
	found: build succeeded without compile errors
	implication: changes are stable

## Resolution

root_cause:
	heatmap legend styling/text and scoring formula still reflected prior risk model
fix:
	updated legend card style/title and switched heat score calculation to dependency-only basis
verification:
	npm run build succeeded
files_changed: ["src/components/GraphView.tsx"]
