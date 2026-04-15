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
npm install -g macu
```

If the npm registry install fails (package not yet published), install from GitHub:

```bash
npm install -g github:minhvoio/macu_minimize-ai-credit-usage
```

### Step 3: Verify Installation

```bash
which macu    # Should return a path
macu --help   # Should show usage
```

Both commands (`macu` and `cu`) are installed together from the same package.

### Step 4: Test

```bash
macu --source opencode --days 30
```

This should produce a full analysis if OpenCode data exists on the machine.

### Step 5: Optional - Claude Usage Monitor (cu)

The `cu` command shows live Claude Code subscription usage (5h/weekly limits with colored bars).

**Requirements:**
- macOS only (reads credentials from macOS Keychain)
- Claude Code must be logged in (`claude` CLI)
- Python 3 and curl must be available

**Test:**

```bash
cu
```

Expected output: colored bars showing 5h limit, weekly limit, and reset timers.

If `cu` fails with "No Claude Code credentials found", the user needs to log in to Claude Code first.

### Step 6: Understand What's Available

| Command | What it does |
|---------|-------------|
| `macu` | Full tool usage analysis with optimization recommendations |
| `macu --days N` | Analyze last N days (default: 180) |
| `macu --source opencode` | OpenCode data only |
| `macu --source claude` | Claude Code data only |
| `macu --source codex` | Codex data only |
| `macu --json` | Raw JSON output for scripting |
| `cu` | Live Claude Code usage limits (macOS only) |
| `cu --json` | Usage limits as JSON |

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
| `cu: No Claude Code credentials` | Log in to Claude Code: run `claude` and complete login |
| `cu: Python 3 not found` | Install Python 3: `brew install python3` (macOS) |
| `better-sqlite3 build fails` | Install build tools: `xcode-select --install` (macOS) or `apt install build-essential` (Linux) |
