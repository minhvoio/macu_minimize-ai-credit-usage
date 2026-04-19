# Installation Guide

## For LLM Agents

Follow these steps exactly. Do not skip any step.

### Step 1: Check Prerequisites

Run these commands and verify:

```bash
node -v   # Must be >= 18.0.0
npm -v    # Must be available
```

If Node.js is missing or too old, stop and tell the user.

### Step 2: Install macu

```bash
npm install -g @minagents/macu
```

If the npm registry install fails, install from GitHub:

```bash
npm install -g github:minhvoio/macu_minimize-ai-credit-usage
```

> **Warning:** Do NOT use `bun install -g` from a GitHub URL. It creates `~/package.json` and `~/bun.lock` which break workspace detection in other tools (Next.js, Turborepo, etc.).

### Step 3: Verify Installation

```bash
which macu    # Should return a path
macu --help   # Should show usage
```

### Step 4: Ask the User Which AI Tool They Use

Before running the analysis, ask the user:

> Which AI coding tool are you using? (Claude Code / OpenCode / Codex)

Their answer determines the source flag:

- Claude Code -> `--source claude`
- OpenCode -> `--source opencode`
- Codex -> `--source codex`

### Step 5: Run the Analysis

Run macu scoped to the source they told you:

```bash
macu --source <their-source> --days 30
```

This produces a full analysis if data exists for that source. If you see "No AI tool data found", the user needs to run their AI tool at least once so there is usage history to read.

### Step 6: Present the Action Plan to the User

**Do NOT take any action yet.** Read the macu output and present a clear summary to the user. Extract and show them:

1. **How many tools they have** and how many are actually used
2. **MCP servers to remove entirely** (100% unused or rarely used) - list each server name and how many tools it has
3. **Individual tools to remove** (keep the server, drop specific tools) - list each with call count
4. **Projected savings** - tokens per message before vs after, percentage reduction
5. **Which config files will be edited** - show the exact file paths

Format it as a concise summary they can scan in 10 seconds. Example:

> **Your setup**: 101 tools loaded, 47 actively used, 54 candidates for removal.
>
> **MCP servers to remove entirely:**
> - `stitch` (2 tools, 2 total calls in 30 days)
> - `mcp-dblp` (6 tools, used once on a single day)
>
> **Individual tools to remove** (keep the server, drop these):
> - `linear-granthelp`: 7 active tools, 12 removable (e.g. list_projects: 2 calls, list_users: 3 calls)
>
> **Projected savings**: 30,300 tok/message -> 14,100 tok/message (54 tools removed, ~53% reduction)
>
> **Config files that will be edited:**
> - `~/.claude/settings.json`

### Step 7: Ask What to Do

Do NOT proceed without explicit approval. Ask:

> What would you like me to do?
> 1. **Apply all recommendations** - remove all unused servers + individual tools
> 2. **Remove full servers only** - just the MCP servers that are 100% unused
> 3. **Let me pick** - I'll tell you which ones to remove
> 4. **Skip** - just wanted to see the analysis, don't change anything

Wait for the user's answer. If they pick option 3, list each server and tool group and let them confirm individually.

### Step 8: Execute the Approved Changes

Only after the user approves:

1. **Back up the config files first** - copy each config to a `.bak` file before editing
2. **Edit the configs** - remove the approved MCP servers and/or individual tool entries
3. **Run macu again** to verify the changes took effect:

```bash
macu --source <their-source> --days 30
```

4. **Show the before/after comparison** - confirm the tool count dropped and projected savings match expectations

If something went wrong, restore from the `.bak` files.

### Step 9: Offer the Live Subscription Monitors (optional)

If the user picked Claude Code or Codex in Step 4, and they want to see live subscription usage (how much of the 5h / weekly window they've burned through, when it resets), point them at the companion repo. Skip this step entirely for OpenCode users.

Tell them:

> macu analyzes your tool-call history. If you also want live subscription usage bars, install the companion package `ai-usage-monitors` - it ships `cu` (Claude Code) and `cou` (Codex CLI).

**Install it:**

```bash
curl -fsSL https://raw.githubusercontent.com/minhvoio/ai-usage-monitors/main/install.sh | bash
```

Or:

```bash
npm install -g github:minhvoio/ai-usage-monitors
```

**After install, they run:**

- Claude Code user -> `cu` (macOS only, reads Keychain, Claude Code must be logged in)
- Codex user -> `cou` (macOS or Linux, reads `~/.codex/auth.json`, Codex CLI must be logged in)

Both require Python 3 and curl. Do not keep retrying inside macu if they fail - direct the user to the companion repo's README for troubleshooting: https://github.com/minhvoio/ai-usage-monitors

### Step 10: Understand What's Available

| Command | What it does |
|---------|-------------|
| `macu` | Full tool usage analysis with optimization recommendations |
| `macu --days N` | Analyze last N days (default: 180) |
| `macu --source opencode` | OpenCode data only |
| `macu --source claude` | Claude Code data only |
| `macu --source codex` | Codex data only |
| `macu --json` | Raw JSON output for scripting |

### Data Sources (auto-detected)

| Source | Format | Location |
|--------|--------|----------|
| OpenCode | SQLite | `~/.local/share/opencode/opencode.db` |
| Claude Code | JSONL | `~/.claude/projects/`, `~/.claude/transcripts/`, `~/.config/claude/projects/` |
| Codex | JSONL + SQLite | `~/.codex/sessions/`, `~/.codex/state_5.sqlite` |

No configuration needed. `macu` probes all locations and uses whatever is available.

### Troubleshooting

| Problem | Solution |
|---------|----------|
| `macu: command not found` | Check that npm global bin is in PATH: `npm config get prefix` then add `<prefix>/bin` to PATH |
| `No AI tool data found` | Run an AI tool first (OpenCode, Claude Code, or Codex) so there is usage data to analyze |
| `better-sqlite3 build fails` | Install build tools: `xcode-select --install` (macOS) or `apt install build-essential` (Linux) |
| `cu`/`cou` issues | See https://github.com/minhvoio/ai-usage-monitors |
