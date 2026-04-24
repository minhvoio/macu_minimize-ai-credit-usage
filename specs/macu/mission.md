# Mission - macu

## One-liner

macu is an agent-first CLI that reads usage history from AI coding assistants, identifies tool-definition overhead the user never exercises, and emits exact, source-aware config edits so an AI agent can apply them in the same session.

## Why this exists

1. Every message to Claude Code, OpenCode, or Codex ships ALL configured tool definitions in the request body. Tools the user never calls are silent overhead that eats 30-45% of the input token budget on a typical setup. macu quantifies that waste and produces the exact edits that remove it.
2. Users discover rate limits bite faster than their workload justifies and have no visibility into why. macu reads the user's own usage logs and shows which tools earn their keep versus which ones are dead weight, grounded in the user's real call history rather than a heuristic.
3. AI agents driving config changes need unambiguous instructions per config file. macu emits the correct JSON snippet for each platform (OpenCode, oh-my-openagent, Claude Code settings) so an agent can apply changes without guessing syntax or clobbering unrelated keys.

## Scope - what this IS

- Offline static analyzer. Reads existing usage logs on disk.
- Source-aware. Maps every tool to the config file that declares it, using a deterministic prefix-plus-config-file map.
- Action-plan producer. Emits exact JSON merge snippets per config file, grouped by tool family, with whole-server versus per-tool disable decisions made correctly so active tools are never killed.
- Multi-platform on the read side. Supports Claude Code (JSONL), OpenCode (SQLite), Codex (JSONL + SQLite) through a pluggable adapter registry.
- CLI-first, with a `--json` escape hatch for scripting and agent consumption.
- npm-distributed under the `@minagents` scope. Zero-install via `npx @minagents/macu`.

## Scope - what this is NOT

- Not a runtime proxy. macu never intercepts live LLM API calls or live tool invocations.
- Not a billing or cost analyzer. Dollar pricing is out of scope. Token savings are reported as counts, never as currency.
- Not a prompt compressor. macu does not modify prompts, system messages, or tool outputs.
- Not a config editor. macu reads configs to classify tools; it never writes to a config file directly. The user, or the user's agent, applies the edits.
- Not a long-running daemon. macu runs on demand, computes, prints, exits.

## Inputs

- `~/.local/share/opencode/opencode.db` - OpenCode SQLite history.
- `~/.claude/projects/`, `~/.claude/transcripts/`, `~/.config/claude/projects/` - Claude Code JSONL transcripts.
- `~/.codex/sessions/*/rollout-*.jsonl`, `~/.codex/state_5.sqlite` - Codex JSONL and SQLite.
- `~/.config/opencode/opencode.json` - OpenCode MCP server declarations.
- `~/.config/opencode/oh-my-openagent.json` - oh-my-opencode plugin disable lists.
- `~/.claude/settings.json` - Claude Code permissions.

## Output

- A terminal report with six sections: session summary, most-used tools bar chart, tool activity timeline table, projected token overhead before and after, recommendations, action plan.
- The action plan carries one step per (config file, removal format) pair, with the exact JSON snippet to merge. Historical tools (whose MCP server is no longer declared anywhere) are listed separately as informational only.
- `--json` flag emits the full analysis object, including per-tool `configSource` classification, for downstream tooling or agent consumption.

| Field | Example | Source |
|---|---|---|
| name | linear-granthelp_get_ticket | adapters |
| calls | 164 | adapters |
| firstSeen / lastSeen | unix ms | adapters |
| configSource.kind | opencode-mcp | config-reader |
| configSource.configFile | ~/.config/opencode/opencode.json | config-reader |
| configSource.removalFormat | mcp-entry | config-reader |

## Success criteria

1. macu runs end-to-end on a user's existing logs in under 5 seconds for a 60-day window covering 90,000 or more tool calls, verified by `time node bin/macu.mjs --days 60`.
2. Every flagged tool in the Action Plan carries a `configSource` that points to an actual config file the user owns, verified by running macu, opening each referenced file, and confirming the field named in the emitted snippet either exists or can be added without collision.
3. The Action Plan JSON snippets, if merged into their target files verbatim, disable the flagged tools without breaking unrelated config keys. Verified by running macu, applying the snippets, restarting the AI client, and observing the flagged tools disappear from the client's tool list.
4. macu distinguishes per-tool deny from whole-server disable when a server has active tools remaining, so accepting all Action Plan snippets never kills an actively-used tool.
5. Installation works via `npx @minagents/macu` with zero prior setup on a machine that has Node 18 or newer and at least one supported AI client installed.

## Non-goals

- Pricing integration with Anthropic, OpenAI, or any provider.
- Any runtime hook, proxy, shim, or output filter.
- Any edit or write to user config files.
- Support for AI clients that do not persist tool-call history locally.
- A GUI. Terminal only.
- Server-side telemetry. macu never phones home.
