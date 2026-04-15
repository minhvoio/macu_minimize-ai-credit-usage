# AGENTS.md - Guide for AI Agents

## What is this project?

`macu` (Minimize AI Credit Usage) is a Node.js CLI tool that analyzes usage data from AI coding assistants (Claude Code, OpenCode, Codex) to identify wasted tokens and recommend optimizations.

## Architecture

```
bin/macu.mjs            CLI entry point (shebang, delegates to src/cli.mjs)
src/cli.mjs             Argument parsing, orchestration
src/sources/index.mjs   Source registry, auto-detection, normalized data model
src/sources/opencode.mjs    OpenCode adapter (SQLite → normalized)
src/sources/claude-code.mjs Claude Code adapter (JSONL → normalized)
src/sources/codex.mjs       Codex adapter (JSONL + SQLite → normalized)
src/analyze.mjs         Source-agnostic analysis engine
src/render.mjs          Terminal rendering (charts, tables, colors)
```

## Data Flow

```
detect sources → load data → normalize → analyze → render
     ↓              ↓            ↓          ↓         ↓
  probe()       adapter()    ToolCall    analyze()  render()
                             TokenSnap
```

## Normalized Data Model

Every source adapter must return:

```javascript
{
  toolCalls: [{
    tool: string,       // tool name
    timestamp: number,  // unix ms
    status: string,     // "completed" | "failed" | "unknown"
    inputChars: number,
    outputChars: number,
    durationMs?: number,
    source: string,     // "opencode" | "claude-code" | "codex"
  }],
  tokenSnapshots: [{
    timestamp: number,
    inputTokens: number,
    outputTokens: number,
    cacheRead?: number,
    cacheWrite?: number,
    model?: string,
    source: string,
  }],
  sessionCount: number,
}
```

## Adding a New Source Adapter

1. Create `src/sources/<name>.mjs` exporting `probe<Name>()` and `load<Name>(meta, days)`
2. `probe` returns `{ exists: boolean, ...meta }` - quick check, no heavy I/O
3. `load` returns the normalized data model above
4. Register in `src/sources/index.mjs` SOURCES array
5. Test with `macu --source <name>`

## Data Source Locations

| Source | Format | Path |
|--------|--------|------|
| OpenCode | SQLite | `~/.local/share/opencode/opencode.db` |
| Claude Code | JSONL | `~/.claude/projects/`, `~/.claude/transcripts/`, `~/.config/claude/projects/` |
| Codex | JSONL + SQLite | `~/.codex/sessions/*/rollout-*.jsonl`, `~/.codex/state_5.sqlite` |

## Key Decisions

- **ESM only** (`"type": "module"`) - all imports use `.mjs` extension
- **better-sqlite3** for SQLite - fast, synchronous, native bindings
- **chalk v5** for colors - ESM-only, zero deps
- **cli-table3** for tables - battle-tested, CJS but works fine in ESM
- **No framework** for CLI args - hand-rolled flag parser (3 flags, no need for commander)
- **Token estimation**: ~300 tokens per tool definition (empirically derived from real audit data: 113,531 chars / 95 tools / 4 chars per token)

## Conventions

- Prefer pure functions, no global state
- Each source adapter is self-contained - no cross-adapter dependencies
- `render.mjs` is the only file that imports chalk - all other files return plain data
- Analysis is source-agnostic - it works on the normalized model only
- Error handling: adapters catch and skip bad data silently (corrupt JSONL lines, missing fields)

## Testing Locally

```bash
npm install
node bin/macu.mjs              # full analysis
node bin/macu.mjs --source opencode --days 30
node bin/macu.mjs --json | jq   # inspect raw output
```

## Common Tasks

- **Add new recommendation type**: edit `buildRecommendations()` in `src/analyze.mjs`
- **Change chart appearance**: edit `render.mjs` - all visual output is isolated there
- **Support new data source**: follow "Adding a New Source Adapter" above
- **Adjust token-per-tool estimate**: change `TOKENS_PER_TOOL_DEF` in `src/analyze.mjs`
