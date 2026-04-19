---
status: investigating
trigger: "check for problens"
created: 2026-04-19T00:00:00Z
updated: 2026-04-19T00:00:00Z
---

## Current Focus
hypothesis: The analysis pipeline is exhausting Groq quota via eager file enrichment, causing /chat to hit 429 and fall back.
test: Reduce enrichment calls, then re-run analyze/chat on a clean backend instance.
expecting: The chat route should return a model answer without hitting the fallback or 429.
next_action: Validate the reduced-enrichment backend on a fresh port and confirm the response is no longer rate-limited.

## Symptoms
expected: The AI assistant should answer the question with a model response.
actual: The UI shows "The assistant is temporarily unavailable. Next step: Verify backend API and Groq configuration, then retry."
errors: none shown in the screenshot
reproduction: Click the AI assistant / ask a question and the drawer returns the fallback message.
started: unknown

## Eliminated

## Evidence
- timestamp: 2026-04-19T01:03:13Z
	checked: backend health on ports 3001 and 3003
	found: port 3001 refused connections; port 3003 returned 200 OK with health JSON
	implication: the active backend is on port 3003, not the frontend default fallback port
- timestamp: 2026-04-19T01:03:13Z
	checked: live backend analyze/chat round-trip for the repo URL
	found: /analyze returned a graphId, but /chat returned fallback text mentioning GROQ_API_KEY configuration instead of a model answer
	implication: the backend process is handling requests but callGroq is failing at runtime inside that process
- timestamp: 2026-04-19T01:06:03Z
	checked: server log from chat route on a fresh backend instance
	found: [chat] Groq request failed Request failed with status code 429
	implication: the fallback is caused by Groq rate limiting, not a missing route or frontend-only issue
- timestamp: 2026-04-19T01:06:03Z
	checked: aiEnricher implementation
	found: analysis phase was making up to 30 Groq calls in batches of 4 before chat
	implication: eager enrichment can consume quota before the Ask AI request runs
- timestamp: 2026-04-19T01:06:03Z
	checked: analyze/chat round-trip after reducing enrichment to 6 nodes and stopping on 429
	found: chat returned a Groq-generated answer instead of the fallback on port 3012
	implication: lowering enrichment usage preserves enough quota for chat to work

## Resolution
root_cause: The analysis pipeline was overusing Groq by enriching too many files too quickly, which triggered 429 rate limits and caused the chat route to fall back.
fix: Reduced AI enrichment to a small top-node sample, slowed batching, stopped enrichment early on 429, and made the drawer show rate-limit-specific feedback.
verification: Backend build passed; a fresh backend instance on port 3012 completed analyze + chat successfully and returned a live Groq answer without the fallback.
files_changed: ["backend/src/index.ts", "backend/src/routes/analyze.ts", "backend/src/services/aiEnricher.ts", "src/components/AIDrawer.tsx"]
