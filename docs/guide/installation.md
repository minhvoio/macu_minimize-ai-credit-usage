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

Before testing, ask the user:

> Which AI coding tool are you using? (Claude Code / OpenCode / Codex)

Their answer determines the next step. Pick the matching flag:

- Claude Code → `--source claude`
- OpenCode → `--source opencode`
- Codex → `--source codex`

### Step 5: Test With Their Source

Run macu scoped to the source they told you:

```bash
macu --source <their-source> --days 30
```

This should produce a full analysis if data exists for that source. If you see "No AI tool data found", the user needs to run their AI tool at least once so there is usage history to read.

### Step 6: Offer the Live Subscription Monitors (optional)

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

- Claude Code user → `cu` (macOS only, reads Keychain, Claude Code must be logged in)
- Codex user → `cou` (macOS or Linux, reads `~/.codex/auth.json`, Codex CLI must be logged in)

Both require Python 3 and curl. Do not keep retrying inside macu if they fail - direct the user to the companion repo's README for troubleshooting: https://github.com/minhvoio/ai-usage-monitors

### Step 7: Understand What's Available

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
