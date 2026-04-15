# macu — Minimize AI Credit Usage

## My story

I was paying for Claude Code and burning through my 5-hour limit in 1.5 hours.

I'd open a new session, send a few messages, ask Claude to help me with one task — and somehow I was already at 40% of my window. It didn't match the work I was actually doing.

So I pulled my usage data. 50 days. 830 sessions. **33,000 tool calls.** And I found it.

Every single message I sent was carrying **95 MCP tool definitions** in the request body. Linear. Slack. LSP. Custom plugins I'd installed months ago and forgotten. All 95 of them, loaded fresh into the context on every single request.

But when I counted what I actually used? **35 tools.** The other 60 were dead weight — adding ~9,000 tokens of overhead to every message before I even typed a word.

**That was 32% of my input budget, gone, forever, on tools I never called.**

Over the full 50 days that came out to roughly **465 million wasted tokens.** On one account.

If I had been paying API rates for that overhead, the bill would have been:

- **~$1,395** at Claude Sonnet input pricing ($3 / million tokens)
- **~$6,975** at Claude Opus input pricing ($15 / million tokens)

On a subscription it doesn't hit your credit card directly — but it IS the reason your plan's window feels smaller than it should. You're shipping $1,000+ of worthless tool definitions inside every plan cycle.

So I built `macu` to find this waste in anyone's setup and make it easy to clean up.

## What `macu` does

It reads your actual tool-call history from Claude Code, OpenCode, or Codex — then shows you:

- Which tools you actually use (the 35 that earn their keep)
- Which tools are silent overhead (the 60 costing you money for nothing)
- A copy-pasteable action plan your AI agent can execute in the same session

Same AI. Same workflow. Just without the dead weight in every request.

## Who should use it

- You use **Claude Code**, **OpenCode**, or **Codex**
- You've installed MCP servers or plugins over time (Linear, Slack, GitHub, LSP, custom ones)
- You feel like you hit rate limits faster than the work you're doing justifies

If you have zero MCP plugins installed, this tool has nothing to find.

---

## Installation

### For LLM Agents

Paste this to your agent (Claude Code, OpenCode, Codex, Cursor, etc.):

```
Install macu and run it to optimize my tool usage. Follow the guide:
https://raw.githubusercontent.com/minhvoio/macu_minimize-ai-credit-usage/main/docs/guide/installation.md
```

Or fetch the guide directly:

```bash
curl -s https://raw.githubusercontent.com/minhvoio/macu_minimize-ai-credit-usage/main/docs/guide/installation.md
```

### For Humans

```bash
curl -fsSL https://raw.githubusercontent.com/minhvoio/macu_minimize-ai-credit-usage/main/install.sh | bash
```

Or: `npm install -g macu`

> **Note:** `macu` is designed to run inside an AI coding session. You can run it from your terminal to see the analysis, but the optimization step (editing configs, removing MCP servers) is meant to be executed by your AI agent. If you ran `macu` outside a session, paste the output to your agent and ask it to apply the action plan.

---

## Usage

Run this inside your AI agent session:

```bash
macu                    # analyze + action plan for the agent to execute
macu --days 30          # last 30 days only
macu --source opencode  # OpenCode only
macu --source claude    # Claude Code only
macu --source codex     # Codex only
macu --json             # raw JSON for scripting
```

The agent reads the output, follows the action plan, edits your configs, then runs `macu` again to verify savings.

### Optional: `cu` — Claude Code Usage Monitor

Live subscription limits with colored bars. Ships with macu, works on macOS.

```bash
cu                      # 5h/weekly utilization + reset timers
cu --json               # JSON output
```

Requires: macOS, Python 3, Claude Code logged in. See [installation guide](./docs/guide/installation.md#step-5-optional--claude-usage-monitor-cu).

---

## What It Shows

| Section | What you get |
|---------|-------------|
| **Tool Frequency** | Bar chart of most-called tools with call counts and percentages |
| **Activity Timeline** | Table with first/last seen dates for every tool |
| **Unused Tools** | Tools with 0 calls — pure dead weight in your context |
| **Rarely Used Tools** | Less than ~1 call/week — candidates for removal |
| **Recommendations** | Prioritized actions: which tools/plugins/MCP servers to cut |
| **Before vs After** | Token savings chart showing impact of applying recommendations |

```
  Before   ████████████████████████████████████████  28,500 tok (95 tools)
  After    ██████████████████████████                19,500 tok (35 tools)
  Savings  ██████████████                             9,000 tok (32%)
```

---

## Supported Sources

| Source | Format | Auto-detected Location |
|--------|--------|----------------------|
| **OpenCode** | SQLite | `~/.local/share/opencode/opencode.db` |
| **Claude Code** | JSONL | `~/.claude/projects/`, `~/.claude/transcripts/`, `~/.config/claude/projects/` |
| **Codex** | JSONL + SQLite | `~/.codex/sessions/`, `~/.codex/state_5.sqlite` |

Zero configuration. `macu` probes all locations and merges whatever it finds.

---

## How It Works

```
detect sources → load data → normalize → analyze → render
     ↓              ↓            ↓          ↓         ↓
  probe()       adapter()    ToolCall    analyze()  render()
                             TokenSnap
```

1. **Detect** — Probes known data locations for each AI tool
2. **Extract** — Reads tool call history via source-specific adapters (SQLite queries, JSONL parsing)
3. **Normalize** — Every adapter returns the same shape: `{ toolCalls, tokenSnapshots, sessionCount }`
4. **Analyze** — Frequency, recency, token overhead, MCP server grouping, recommendations
5. **Render** — Charts, tables, and recommendations in the terminal

---

## Adding New Sources

Each adapter is one file in `src/sources/`. Two exports:

```javascript
export function probeMyTool()          // → { exists: boolean, ...meta }
export function loadMyTool(meta, days) // → { toolCalls, tokenSnapshots, sessionCount }
```

Register in `src/sources/index.mjs`. Run `macu --source mytool`. Done.

See [AGENTS.md](./AGENTS.md) for the full adapter interface, data model, and conventions.

---

## Background: The Discovery

This tool was born from a billing investigation.

After noticing unexpectedly high token usage on an Anthropic Team subscription, a deep audit of the OpenCode SQLite database (32,848 tool calls across 50 days) revealed:

- **95 MCP tools** were loaded, but only **35 were ever called**
- **60 duplicate/unused tools** added **37,531 chars** (~9,000 tokens) of overhead to **every single API request**
- Over 50 days and 830 sessions, this wasted **hundreds of millions of tokens**

The root cause: every API call to Anthropic includes ALL tool definitions in the request body. More tools = more tokens burned before you even type a word.

---

## Commands

| Command | Description |
|---------|------------|
| `macu` | Full tool usage analysis with optimization recommendations |
| `macu --days N` | Analyze last N days (default: 180) |
| `macu --source X` | Only analyze one source (`opencode`, `claude`, `codex`) |
| `macu --json` | Raw JSON output (pipe to `jq`, feed to scripts) |
| `macu --help` | Show help |
| `cu` | Live Claude Code subscription usage (macOS only) |
| `cu --json` | Claude usage as JSON |

---

## Requirements

- **Node.js ≥ 18** (for `macu`)
- **Python 3 + macOS** (for `cu` only — optional)
- At least one AI tool with usage history

---

## License

MIT
