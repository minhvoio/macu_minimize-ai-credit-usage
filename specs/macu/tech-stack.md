# Tech Stack - macu

## Principle

Pick the runtime that matches the workload. macu is an offline analyzer that reads logs, computes aggregates, and prints a report. It runs occasionally, not in a hot path. Rewriting for theoretical speed wins is rejected; staying on the runtime where the ecosystem (npm, chalk, cli-table3, better-sqlite3) and the author's skillset already live is the correct call.

## Runtime

- Node.js 18 or newer. ESM only. All source files use the `.mjs` extension.
- npm for package management. Published under `@minagents/macu`.
- Plain JavaScript with JSDoc for contracts that matter (adapter return shape, `configSource` shape). No TypeScript.

## Test runner and file layout

- Today: ad-hoc smoke runs against real user data via `node bin/macu.mjs --days 60`.
- Programmatic contract: `--json` output. Treat shape changes as semver minor or major.
- When unit tests are introduced, they will use node's built-in `node --test` runner. Zero dependency, ESM-native, matches the runtime choice.

## I/O libraries

- `better-sqlite3` - synchronous native bindings to SQLite. Required for reading `opencode.db` and Codex `state_5.sqlite` without the async overhead of sqlite3. Matches the read-once-then-exit lifecycle.
- `chalk` v5 - ESM-only color library, zero dependencies. Isolated to `src/render.mjs`; no other file imports it. This isolation keeps the analysis engine testable with plain strings.
- `cli-table3` - table rendering. Works in ESM despite being CJS. Battle-tested.

## Data flow

```
detectSources() -> loadAll(sources, days) -> analyze(data, days) -> render(result)
     probe               adapter                normalize, enrich        print
     (fast)              (SQLite/JSONL)         (configSource)           (chalk)
```

Every source adapter returns the same normalized shape: `{ toolCalls[], tokenSnapshots[], sessionCount }`. The analyzer never learns which source a tool call came from beyond a `source: "opencode" | "claude-code" | "codex"` tag. The config-reader enriches each tool with a `configSource` descriptor that the renderer uses to build grouped, source-aware action steps.

## Dependencies to add

None at this stage. Any future addition requires explicit approval and must clear three filters: (a) the dependency is a direct contributor to correctness, not convenience; (b) it is ESM-native or known to work cleanly in ESM; (c) it has no transitive native-compile step beyond what better-sqlite3 already pays for.

## Runtime choice: why Node, not Rust

The temptation to rewrite CLIs in Rust for aesthetics is real. For macu the math does not hold.

- macu's runtime is dominated by SQLite I/O and JSONL parsing, both already using native C bindings via better-sqlite3. The JavaScript interpreter is not the bottleneck. Rewriting in Rust would hit the same C library through a different FFI and land on the same wall-clock time.
- A typical 60-day analysis of 93,000 tool calls runs in about 2 seconds end to end on the author's hardware. A Rust rewrite would plausibly reach 700ms. An on-demand CLI run once a week does not benefit from shaving 1.3 seconds.
- npm distribution is solved. `npx @minagents/macu` works on every machine with Node. A Rust binary needs per-platform release artefacts, a homebrew formula, and an install script; the distribution surface expands for no user-visible benefit.
- The rest of the author's tooling (skills, hooks, plugin scaffolds) lives in the Node and TypeScript ecosystem. Splitting macu out to Rust adds a second toolchain to maintain for one tool.
- Node 20 and newer ship Single Executable Applications (SEA). When static binary distribution becomes valuable, SEA produces one from the same source. That is an additive path, not a rewrite.
- AI agent hooks (Claude Code, OpenCode) speak JSON over stdin and stdout. Node handles that idiom with zero ceremony.

The right case for Rust is hot-path work: runtime proxies, every-tool-call filters, latency-sensitive codecs. macu is the opposite profile, so Rust stays out of scope.

## Determinism and reproducibility

- Pure functions wherever possible. The analyzer takes data in, returns a result object, never mutates input.
- No network calls. Everything runs against local files.
- Corrupt rows in SQLite or malformed JSONL lines are skipped silently by adapters. Skip counts are a candidate field for a future analysis pass but are not emitted today.
- Time-sensitive outputs (first seen, last seen, idle days) are computed from `Date.now()` at render time.

## Project conventions compliance

- Honour all rules in `AGENTS.md` at the repo root: ESM-only, chalk isolated to `render.mjs`, adapters self-contained, pure functions, no global state, adapters skip bad data silently.
- Honour the no-emdash writing rule enforced by the author's `no-emdash` PostToolUse hook in `private/minagents/.claude/hooks/no-emdash.sh`. No em-dash or en-dash appears in any file macu writes or ships.
- Source-aware removal syntax is verified against the upstream configs of OpenCode, oh-my-opencode, and Claude Code. When those projects change their disable syntax, `config-reader.mjs`'s hardcoded knowledge updates in the same release.

## Explicitly out of stack

- No TypeScript. JSDoc covers the contracts that matter; TS adds build cost for a pure-JS CLI that never grew one.
- No Rust rewrite. No performance justification at this workload profile; see the Runtime choice section above.
- No Bun global install. `bun install -g` writes to `~/package.json` and `~/bun.lock`, which breaks workspace detection in Next.js and other tools. Not acceptable as a default install path.
- No Electron or web UI. macu is a terminal tool; a GUI changes the product, not the plumbing.
- No cloud telemetry. User data stays local. Aggregate opt-in metrics would require a separate service and stay out of scope indefinitely.
- No config auto-apply. macu emits snippets; the user or the user's agent applies them. Writing to config files from the analyzer would collapse the agent-ux-audit gate that keeps users in control.
- No runtime hooks or proxies. That is a different product with a different risk profile. macu stays offline.
