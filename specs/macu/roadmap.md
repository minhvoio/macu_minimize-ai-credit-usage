# Roadmap - macu

Sequencing rationale: Phase 1 is a pure display fix that resolves a recurring UX complaint without touching the analysis engine. Phase 2 introduces a new signal (output size) that was always present in the data but never rendered. Phase 3 makes macu temporal by adding state so users can see savings accumulate. Phase 4 adds discovery of optimization opportunities outside macu's disable-based model. Each phase is visibly demoable and ships independently.

---

## Phase 1 - Action plan clarity

**Goal:** Make every flag in the Action Plan self-explanatory so a user can judge correctness in two seconds without re-running the analysis.

**Deliverables**

- Server-context header per `opencode-mcp` group, summarising total calls, active tool count, and server health before listing flagged tools.
- Idle-days based confidence signal on every flagged tool: `high` when 21 or more days idle, `high-very-cold` when 35 or more days, `LOW` when 7 or fewer days idle with recent use documented.
- Two-tier snippet output per mixed-confidence group: a conservative snippet containing only high-confidence flags with its projected savings, and an aggressive snippet containing all flags with its savings.
- README Action Plan example updated to reflect the new format.
- Version bump to 1.2.0, republished to `@minagents/macu` on npm.

**Demo**

Run `node bin/macu.mjs --days 60` against the author's own data and scroll to the Action Plan. The `linear-granthelp` step shows a header like `[Server linear-granthelp - 594 total calls, 9 active tools, healthy]` before any flags. Each flagged tool in that step carries an explicit confidence tag: `list_users (6 calls, 25d idle, high confidence)` versus `get_my_issues (6 calls, 4d idle, LOW confidence)`. Two JSON snippets appear side by side: conservative (4 tools, roughly 1,200 tokens per message saved) and aggressive (6 tools, roughly 1,800 tokens per message saved). A flag without a confidence tag is a rendering bug.

**Exit criteria**

- `node bin/macu.mjs --days 60` prints a non-empty server-context header for every `opencode-mcp` group in the Action Plan.
- Every flagged tool in the Action Plan carries a confidence label.
- Every group with at least one LOW-confidence flag and at least one high-confidence flag renders both a conservative and an aggressive snippet.
- `npm view @minagents/macu@1.2.0` returns a record with the new version and the updated README.

---

## Phase 2 - Output-size awareness

**Goal:** Surface tools whose aggregate output volume is large, so users can decide whether to filter, trim, or replace them independent of the disable recommendation.

**Deliverables**

- A new "Heavy Output" section in the report that lists the top five tools by the metric `calls * avgOutputChars`, with each entry showing total volume, per-call average, and a short note on why high-volume outputs matter for context budget.
- Per-tool enrichment in `analyze.mjs` with `avgOutputChars` and `totalOutputChars` fields on the `ToolStatEntry` shape. These values already exist on the underlying tool-call records; the analyzer computes and surfaces them.
- `--json` output includes the new fields for downstream tooling.
- Docs section in the README that names the three levers users have for heavy-output tools: disable, filter at the shell level, or move the work to a lighter tool.

**Demo**

Run `node bin/macu.mjs --days 60`. The new "Heavy Output" section appears between Recommendations and Action Plan. It lists five tools with their aggregate output volume, for example: `session_read - 10,922 chars per call, 62 calls, 677KB total; context7_query-docs - 4,200 chars per call, 118 calls, 495KB total`. Each entry carries a one-line note naming the tradeoff. The section never overlaps with the Action Plan's removal recommendations; heavy-output tools the user still uses are surfaced as informational only.

**Exit criteria**

- `node bin/macu.mjs --json --days 60 | jq '.tools[0] | {avgOutputChars, totalOutputChars}'` returns non-null numbers for every tool with recorded output.
- The "Heavy Output" section appears in the terminal report whenever at least one tool has `totalOutputChars > 100000`.
- The section never recommends disabling; all disable recommendations remain in the Action Plan.

---

## Phase 3 - Savings over time

**Goal:** Let users and their agents see realized savings after they act on a previous Action Plan, by comparing the current usage profile to a saved baseline.

**Deliverables**

- `macu snapshot` subcommand that writes the current analysis result to `~/.local/share/macu/snapshots/<ISO-timestamp>.json`.
- `macu gain` subcommand that loads the most recent snapshot, re-runs analysis against current data, and prints a delta report: tools removed, tokens saved per message, cumulative messages since the snapshot, total tokens saved.
- Tracking database at `~/.local/share/macu/tracking.db` (SQLite) that records snapshot metadata and aggregated per-day savings deltas. 90-day automatic cleanup.
- README section on the snapshot-then-gain workflow, with the recommended flow: run macu, act on the Action Plan, run `macu snapshot` to lock in the baseline, re-run `macu gain` weekly.

**Demo**

Run `node bin/macu.mjs snapshot` to lock in a baseline. Apply one recommendation from a fresh Action Plan (disable one rarely-used MCP tool). Wait at least one day of usage. Run `node bin/macu.mjs gain`. The terminal prints a report: `Baseline: Apr 21, 2026 (117 tools). Today: Apr 28, 2026 (116 tools). Change: -1 tool. Tokens saved per message: roughly 300. Messages sent since baseline: 4,100. Estimated total savings: roughly 1.2M tokens.` Each number is computed deterministically from the snapshot file and the current usage data, not estimated.

**Exit criteria**

- `macu snapshot` writes a non-empty JSON file under `~/.local/share/macu/snapshots/`.
- `macu gain` returns exit code 0 when at least one snapshot exists and prints a non-empty delta report.
- `macu gain --json` produces a stable-shaped object with fields `baselineDate`, `currentDate`, `toolsBefore`, `toolsAfter`, `tokensSavedPerMsg`, `messagesSinceBaseline`, `estimatedTotalSavings`.
- Deleting `~/.local/share/macu/` resets state cleanly; macu handles "no snapshot" by prompting the user to run `macu snapshot` first.

---

## Phase 4 - Missed-opportunity discovery

**Goal:** Identify optimization surfaces outside macu's disable-based model, so the user can see the full picture of where tokens go beyond tool-definition overhead.

**Deliverables**

- `macu discover` subcommand that runs analysis with a different lens: group tool calls by category (file operations, shell commands, MCP lookups, web fetches), report total token volume per category, and flag the top two categories for user attention.
- Per-category advice strings in the report that name the lever users have for that category without prescribing a specific external product. Example: for shell-heavy workflows the advice names "shell output filtering" as a concept without citing tools.
- README "Beyond macu" section that names the three orthogonal optimization surfaces macu does not address: tool-output compression, context caching, and prompt compression. Each paragraph stays neutral; no product names, no URLs.

**Demo**

Run `node bin/macu.mjs discover --days 60`. The terminal prints a category breakdown: `file ops 45% of output tokens; shell 22%; MCP lookups 18%; web 8%; other 7%`. Below the breakdown, a flagged row for each top-two category names the concept that would address it (for example, `shell output filtering would reduce the 22%`). The section contains no product names and no external links.

**Exit criteria**

- `macu discover` prints a category breakdown summing to 100%, with an "other" bucket covering the long tail.
- Every category in the breakdown shows a total-token figure computed from actual tool-call outputs.
- The report contains zero brand names, zero URLs, and zero imperative recommendations. It informs, it does not prescribe.

---

## Post-roadmap (deferred)

- Node 20 Single Executable Application as an additional distribution target alongside npm.
- Additional source adapters as new AI clients emerge. Candidates: Cursor, Windsurf, Cline.
- Per-project analysis mode that scopes analysis to one project's working directory rather than the whole account history.
- A `--as-of <iso-date>` flag for deterministic snapshot comparisons across machines.
- Skill pack for AI agents that teaches them to interpret macu's `--json` output and apply Action Plans automatically.
