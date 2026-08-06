---
title: When should a page be held for review?
summary: Whenever a structured policy signal fires — low confidence, a declared contradiction, a schema breach, or a citation that does not check out.
type: query
createdAt: "2026-07-27T16:55:41.204Z"
---

# When should a page be held for review?

Whenever one of the policy signals fires, and the project has opted into that signal.

The codes are structured rather than free text so the queue can be sorted: `low-confidence`, `contradicted`, `schema-violating`, `provenance-violating`, plus the blanket `all` and the explicit `manual-review-requested`. Imports and connector fetches carry their own codes. See [[Held Reasons]]. ^[review-gates.md:26-39]

A candidate can carry several at once, and the queue shows all of them — "held for two independent reasons" is a different situation from "held because someone passed a flag". ^[review-gates.md:41-43]

Holding is cheap because the rendered body travels with the candidate, so approving is a file copy rather than a second model call. See [[Review Candidates]]. ^[review-gates.md:14-17]

## Sources

review-gates.md
