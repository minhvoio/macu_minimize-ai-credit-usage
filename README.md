# macu — Minimize AI Credit Usage

Every AI message you send includes **all** tool definitions in the request body. With 95 MCP tools, that's **~28,000 tokens of overhead per request** — before you even type a word.

`macu` analyzes your AI coding tool usage and shows you exactly which tools to remove for maximum token savings.

## The Problem

AI coding assistants (Claude Code, OpenCode, Codex) load all configured tools into every API request. Each tool definition costs ~300 tokens. If you have 95 tools but only use 35, you're burning ~9,000 tokens per message on tools you never touch.

On a subscription plan, that's **32% of your input token budget wasted on dead weight.**

## Install

```bash
npm install -g macu
```

Or run directly:

```bash
npx macu
```

## Usage

```bash
macu                    # full analysis — auto-detects all data sources
macu --days 30          # analyze last 30 days only
macu --source opencode  # OpenCode data only
macu --source claude    # Claude Code data only
macu --source codex     # Codex data only
macu --json             # raw JSON output (pipe to jq, scripts, etc.)
```

## What It Shows

### Tool Usage Frequency
Bar chart of your most-called tools with call counts and percentages.

### Activity Timeline
Table with first/last seen dates for every tool — see at a glance what's active vs dormant.

### Unused & Rarely Used Tools
Tools with 0 calls or fewer than ~1 call/week. These are pure overhead.

### Optimization Recommendations
Prioritized list of actions: which tools to remove, which MCP servers to drop, which plugins to trim.

### Before vs After Token Savings
Visual comparison of token overhead per request — before and after applying recommendations.

```
  Before   ████████████████████████████████████████  28,500 tok (95 tools)
  After    ██████████████████████████                19,500 tok (35 tools)
  Savings  ██████████████                             9,000 tok (32%)
```

## Supported Sources

| Source | Data Format | Auto-detected Location |
|--------|-------------|----------------------|
| **OpenCode** | SQLite | `~/.local/share/opencode/opencode.db` |
| **Claude Code** | JSONL | `~/.claude/projects/`, `~/.claude/transcripts/` |
| **Codex** | JSONL + SQLite | `~/.codex/sessions/` |

`macu` auto-detects which sources exist on your machine and merges them into a single analysis. No configuration needed.

## How It Works

1. **Detect**: Probes known data locations for each AI tool
2. **Extract**: Reads tool call history using source-specific adapters (SQLite queries, JSONL parsing)
3. **Normalize**: Converts all data into a unified model (tool name, timestamp, token counts)
4. **Analyze**: Computes frequency, recency, token overhead, and generates recommendations
5. **Render**: Displays charts, tables, and recommendations in the terminal

## Background: The Discovery

This tool was born from a billing investigation. After noticing unexpectedly high token usage, a deep audit of the OpenCode SQLite database revealed:

- **95 MCP tools** were loaded, but only **35 were ever called**
- **60 duplicate/unused tools** added **37,531 chars** (~9,000 tokens) of overhead to every single API request
- Over 50 days and 830 sessions, this wasted **millions of tokens**

The full audit methodology and findings are documented in the [Tool Audit](https://github.com/minhvoio/macu_minimize-ai-credit-usage/blob/main/docs/TOOL-AUDIT.md) (coming soon).

## Requirements

- Node.js ≥ 18
- At least one supported AI tool with usage history

## Adding New Sources

See [AGENTS.md](./AGENTS.md) for the adapter interface. Each source needs:
- `probe()` — quick existence check
- `load(meta, days)` — return normalized `{ toolCalls, tokenSnapshots, sessionCount }`

## License

MIT
