# macu - Minimize AI Credit Usage

## My story

I was paying for Claude Code and burning through my 5-hour limit in just 1.5 hours.

I'd open a new session, send a few messages, ask Claude to help me with one task - and somehow I was already at 40% of my window. It didn't match the work I was actually doing.

So I asked Claude to figure out what was happening. It pulled 50 days of usage data - 830 sessions, **33,000 tool calls** - and broke down the token cost of every single message I sent.

That's when I saw it. Every message was carrying **95 MCP tool definitions** in the request body. Linear. Slack. LSP. Custom plugins I'd installed months ago and forgotten. All 95 of them, loaded fresh into the context on every single request.

But when I counted what I actually used? **35 tools.** The other 60 were dead weight - adding ~9,000 tokens of overhead to every message before I even typed a word.

**That was 32% of my input budget, gone, forever, on tools I never called.**

Over the full 50 days that came out to roughly **465 million wasted tokens.** On one account.

If I had been paying API rates for that overhead, the bill would have been:

- **~$1,395** at Claude Sonnet input pricing ($3 / million tokens)
- **~$6,975** at Claude Opus input pricing ($15 / million tokens)

On a subscription it doesn't hit your credit card directly - but it IS the reason your plan's window feels smaller than it should. You're shipping $1,000+ of worthless tool definitions inside every plan cycle.

So I built `macu` to find this waste in anyone's setup and make it easy to clean up.

## What `macu` does

It reads your actual tool-call history from Claude Code, OpenCode, or Codex - then shows you:

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

## What you'll see

Run `macu` and it prints the whole picture in one pass. This is real output from my own setup (120 tools, 88 days, ~52k messages):

**Summary:**

```
  Source    OpenCode, Claude Code, Codex
  Period    Jan 22, 2026 - Apr 19, 2026 (88 days)
  Sessions  2,223
  Messages  51,964
  Tool calls  92,218 across 120 unique tools
```

**Most used tools** (the ones earning their keep):

```
  read                      ████████████████████████████████████████   25,933 (28.1%)
  bash                      ██████████████████████████████░░░░░░░░░░   19,266 (20.9%)
  edit                      █████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░    8,421 (9.1%)
  grep                      ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░    7,682 (8.3%)
  todowrite                 ███████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    4,353 (4.7%)
  glob                      █████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    3,415 (3.7%)
  ... 114 more tools
```

**Unused & rarely used** (candidates for removal):

```
  54 tools with <13 calls:
    • linear-granthelp_list_issues    (12 calls, idle 24d)
    • linear-granthelp_list_teams     (12 calls, idle 23d)
    • mcp__mcp-dblp__add_bibtex_entry  (8 calls, idle 30d)
    • linear_save_issue                (6 calls, idle 38d)
    • update_plan                      (5 calls, idle 87d)
    • ... and 49 more
```

**Projected token overhead** (what this is costing you per message):

```
  Now       ████████████████████████████████████████  36,000 tok - 120 tools loaded
  Optimized ██████████████████████░░░░░░░░░░░░░░░░░░  19,800 tok -  66 tools loaded

  → Estimated savings: ~16,200 tokens per message (45% reduction)

  Applied retroactively to your 51,964 messages over 88 days,
  this would have saved roughly 841.9M tokens.
```

**Action plan** (your AI agent can execute this in the same session):

```
  1. MCP servers to remove entirely (100% unused/rare)
     ✗ "stitch"     - 2 tools,  2 total calls
     ✗ "vercel"     - 1 tool,   4 total calls

  2. Individual tools to remove (keep the server, drop these)
     ⚠ "linear-granthelp" - 5 active, 10 removable
        • linear-granthelp_list_issues (12 calls)
        • linear-granthelp_list_teams  (12 calls)
        ... and 8 more
     ⚠ "mcp-dblp" - 2 active, 4 removable

  3. Config files to edit
     → OpenCode:    ~/.config/opencode/opencode.json
     → Claude Code: ~/.claude/settings.json

  4. Verify
     Run macu again after cleanup to confirm savings

  Expected: 120 → 66 tools, ~16,200 tokens saved per message (45%)
```

When run in an interactive terminal, `macu` also offers to copy a ready-to-paste optimization prompt to your clipboard so you can hand it straight to your AI agent.

---

## Installation

### For LLM Agents

Paste this to your agent (Claude Code, OpenCode, etc.):

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

The installer will ask if you also want the companion tool [**ai-usage-monitors**](https://github.com/minhvoio/ai-usage-monitors) (`cu` / `cou` for live subscription usage bars). Skip the prompt:

```bash
# Install macu only (no prompt)
curl -fsSL https://raw.githubusercontent.com/minhvoio/macu_minimize-ai-credit-usage/main/install.sh | bash -s -- --no-companion

# Install both at once (no prompt)
curl -fsSL https://raw.githubusercontent.com/minhvoio/macu_minimize-ai-credit-usage/main/install.sh | bash -s -- --yes
```

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

---

## Supported Sources

| Source          | Format         | Auto-detected Location                                                        |
| --------------- | -------------- | ----------------------------------------------------------------------------- |
| **Claude Code** | JSONL          | `~/.claude/projects/`, `~/.claude/transcripts/`, `~/.config/claude/projects/` |
| **OpenCode**    | SQLite         | `~/.local/share/opencode/opencode.db`                                         |
| **Codex**       | JSONL + SQLite | `~/.codex/sessions/`, `~/.codex/state_5.sqlite`                               |

Zero configuration. `macu` probes all locations and merges whatever it finds.

---

## How It Works

```
detect sources → load data → normalize → analyze → render
     ↓              ↓            ↓          ↓         ↓
  probe()       adapter()    ToolCall    analyze()  render()
                             TokenSnap
```

1. **Detect** - Probes known data locations for each AI tool
2. **Extract** - Reads tool call history via source-specific adapters (SQLite queries, JSONL parsing)
3. **Normalize** - Every adapter returns the same shape: `{ toolCalls, tokenSnapshots, sessionCount }`
4. **Analyze** - Frequency, recency, token overhead, MCP server grouping, recommendations
5. **Render** - Charts, tables, and recommendations in the terminal

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

| Command           | Description                                                |
| ----------------- | ---------------------------------------------------------- |
| `macu`            | Full tool usage analysis with optimization recommendations |
| `macu --days N`   | Analyze last N days (default: 180)                         |
| `macu --source X` | Only analyze one source (`opencode`, `claude`, `codex`)    |
| `macu --json`     | Raw JSON output (pipe to `jq`, feed to scripts)            |
| `macu --help`     | Show help                                                  |

---

## Companion: live usage monitors (`cu` / `cou`)

`macu` finds **historical waste** (unused MCP tools bloating every request). Once you're done cleaning up, you'll want to track **live usage** too: how much of your 5-hour / weekly window you've already burned through, with reset timers.

That's what the companion repo [**ai-usage-monitors**](https://github.com/minhvoio/ai-usage-monitors) does:

- `cu` - Claude Code subscription usage (5h limit, weekly limit)
- `cou` - Codex CLI usage (5h window, 7d window, team / premium tiers)

Install it standalone:

```bash
curl -fsSL https://raw.githubusercontent.com/minhvoio/ai-usage-monitors/main/install.sh | bash
```

Or let macu's installer offer it at the end - it prompts `Install cu + cou too? [Y/n]` by default. Use both tools if you pay for Claude Code or Codex subscriptions.

---

## Requirements

- **Node.js ≥ 18**
- At least one AI tool with usage history

---

## License

MIT
