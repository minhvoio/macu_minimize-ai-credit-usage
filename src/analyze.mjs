import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { loadConfigContext, resolveConfigSource } from './config-reader.mjs';

// Empirically derived: 113,531 chars / 95 tools / ~4 chars per token ≈ 299
const TOKENS_PER_TOOL_DEF = 300;

// Tools installed within this window are too new to classify as "rarely used"
const NEW_TOOL_GRACE_DAYS = 14;

// Cap threshold so long observation windows don't set unreasonably high bars.
// 26 = ~6 months of weekly usage. Beyond this, 1 call/2 weeks is enough to be "active".
const MAX_RARE_THRESHOLD = 26;

// Built-in tool prefixes that are NOT MCP servers. When a tool name splits on
// its first underscore, if the prefix is in this set, skip it in MCP grouping.
// These are OpenCode/Claude Code/Codex native tools that happen to use
// underscore naming (lsp_diagnostics, session_read, ast_grep_search, etc.).
// Trade-off: a hypothetical MCP server named "lsp" or "session" would be
// silently ignored. Acceptable because these names are reserved by host tools.
const BUILTIN_PREFIXES = new Set([
  // OpenCode / Claude Code
  'lsp',        // lsp_diagnostics, lsp_rename, lsp_symbols, ...
  'session',    // session_read, session_info, session_list, ...
  'ast',        // ast_grep_search, ast_grep_replace
  'background', // background_output, background_cancel
  'grep',       // grep_app_searchGitHub
  'websearch',  // websearch_web_search_exa
  'skill',      // skill_mcp
  'look',       // look_at
  'interactive', // interactive_bash
  'apply',      // apply_patch (Claude Code built-in)
  // Codex
  'shell',      // shell_command
  'exec',       // exec_command
  'update',     // update_plan
  'wait',       // wait_agent
  'spawn',      // spawn_agent
  'write',      // write_stdin (Codex) - note: OpenCode "write" has no underscore
]);

export function analyze(data, days) {
  const toolStats = buildToolStats(data.toolCalls);
  const sorted = Object.values(toolStats)
    .sort((a, b) => b.calls - a.calls)
    .map((t) => ({ ...t, sources: [...t.sources] }));

  const totalCalls = data.toolCalls.length;
  const totalInputTokens = data.tokenSnapshots.reduce((s, t) => s + t.inputTokens, 0);
  const totalOutputTokens = data.tokenSnapshots.reduce((s, t) => s + t.outputTokens, 0);
  const totalMessages = data.tokenSnapshots.length;

  const earliest = totalCalls > 0 ? data.toolCalls[0].timestamp : Date.now();
  const latest = totalCalls > 0 ? data.toolCalls[totalCalls - 1].timestamp : Date.now();
  const spanDays = Math.max(1, Math.ceil((latest - earliest) / 86_400_000));

  // "Rarely used" = less than ~1 call per week over the observed period
  const weeks = Math.max(1, spanDays / 7);
  const rareThreshold = Math.min(MAX_RARE_THRESHOLD, Math.max(5, Math.ceil(weeks)));

  // Temporal metadata: mark tools as "new" or "abandoned"
  const now = Date.now();
  const graceCutoffMs = NEW_TOOL_GRACE_DAYS * 86_400_000;
  for (const t of sorted) {
    t.toolAgeDays = Math.round((now - t.firstSeen) / 86_400_000);
    t.daysSinceLastUsed = Math.round((now - t.lastSeen) / 86_400_000);
    t.isNew = (now - t.firstSeen) < graceCutoffMs;
  }

  const active = sorted.filter((t) => t.calls >= rareThreshold);
  const newTools = sorted.filter((t) => t.isNew && t.calls > 0 && t.calls < rareThreshold);
  const rarelyUsed = sorted.filter((t) => !t.isNew && t.calls > 0 && t.calls < rareThreshold);
  const unused = sorted.filter((t) => t.calls === 0 && !t.isNew);

  // New tools are excluded from removable: not enough data to judge yet
  const removable = [...unused, ...rarelyUsed];
  const totalTools = sorted.length;
  const afterToolCount = totalTools - removable.length;

  const overhead = {
    before: { tools: totalTools, tokensPerMsg: totalTools * TOKENS_PER_TOOL_DEF },
    after: { tools: afterToolCount, tokensPerMsg: afterToolCount * TOKENS_PER_TOOL_DEF },
    savingsPerMsg: removable.length * TOKENS_PER_TOOL_DEF,
    totalSavings: removable.length * TOKENS_PER_TOOL_DEF * totalMessages,
    tokensPerToolDef: TOKENS_PER_TOOL_DEF,
  };

  const recommendations = buildRecommendations(sorted, rarelyUsed, unused, overhead, totalMessages);
  const mcpServers = detectRemovableMcpServers(sorted, rareThreshold);
  const configPaths = detectConfigPaths();

  // Enrich each tool with its ConfigSource (which config file declares it, how to disable it).
  // This runs after all other analysis so the shape of existing fields is untouched.
  const configCtx = loadConfigContext();
  for (const t of sorted) {
    const rawPrefix = extractMcpPrefix(t.name);
    t.configSource = resolveConfigSource(t.name, rawPrefix, configCtx);
  }

  return {
    tools: sorted,
    totalCalls,
    totalInputTokens,
    totalOutputTokens,
    totalMessages,
    sessionCount: data.sessionCount,
    earliest,
    latest,
    spanDays,
    overhead,
    recommendations,
    groups: { active, rarelyUsed, unused, newTools },
    rareThreshold,
    mcpServers,
    configPaths,
  };
}

function detectRemovableMcpServers(allTools, rareThreshold) {
  const servers = {};
  for (const t of allTools) {
    const prefix = extractMcpPrefix(t.name);
    if (!prefix) continue;
    if (BUILTIN_PREFIXES.has(prefix)) continue;
    if (!servers[prefix]) {
      servers[prefix] = { name: prefix, tools: [], totalCalls: 0, activeCount: 0, removableTools: [] };
    }
    const s = servers[prefix];
    s.tools.push(t.name);
    s.totalCalls += t.calls;
    if (t.calls >= rareThreshold || t.isNew) {
      // New tools protect the server from premature removal
      s.activeCount++;
    } else {
      s.removableTools.push({ name: t.name, calls: t.calls });
    }
  }

  const candidates = Object.values(servers);
  const fullyRemovable = candidates
    .filter((s) => s.activeCount === 0)
    .sort((a, b) => a.totalCalls - b.totalCalls);
  const partial = candidates
    .filter((s) => s.activeCount > 0 && s.removableTools.length > 0)
    .sort((a, b) => b.removableTools.length - a.removableTools.length);

  return { fullyRemovable, partial };
}

/**
 * Extract MCP server prefix from a tool name.
 * Handles two conventions:
 *   - Single underscore: "linear-granthelp_get_ticket" → "linear-granthelp"
 *   - Codex double underscore: "mcp__omx_code_intel__lsp_diagnostics" → "omx_code_intel"
 * Returns null for tools with no underscore (orphans like "bash", "shell").
 *
 * Exported so the config-reader can use the same canonical prefix extraction.
 * NOTE: some MCP names contain underscores (e.g. "grep_app"). This function
 * still splits at the first underscore; callers should use refinePrefix() from
 * config-reader.mjs to re-join known multi-word names.
 */
export function extractMcpPrefix(name) {
  // Codex convention: mcp__<server>__<tool>
  if (name.startsWith('mcp__')) {
    const rest = name.slice(5); // after "mcp__"
    const sep = rest.indexOf('__');
    return sep !== -1 ? rest.slice(0, sep) : null;
  }
  // OpenCode / Claude Code convention: <server>_<tool>
  const sep = name.indexOf('_');
  return sep !== -1 ? name.slice(0, sep) : null;
}

function detectConfigPaths() {
  const home = homedir();
  const candidates = [
    { source: 'OpenCode', path: join(home, '.config', 'opencode', 'opencode.json'), desc: 'MCP servers + plugins' },
    { source: 'Claude Code', path: join(home, '.claude', 'settings.json'), desc: 'permissions + MCP' },
    { source: 'Claude Code', path: '.mcp.json', desc: 'project-level MCP config' },
  ];
  return candidates.filter((c) => existsSync(c.path));
}

// ── internal ──────────────────────────────────────────────

function buildToolStats(toolCalls) {
  const stats = {};
  for (const call of toolCalls) {
    const name = call.tool;
    if (!stats[name]) {
      stats[name] = {
        name,
        calls: 0,
        firstSeen: call.timestamp,
        lastSeen: call.timestamp,
        totalInputChars: 0,
        totalOutputChars: 0,
        totalDurationMs: 0,
        failedCalls: 0,
        sources: new Set(),
      };
    }
    const s = stats[name];
    s.calls++;
    if (call.timestamp < s.firstSeen) s.firstSeen = call.timestamp;
    if (call.timestamp > s.lastSeen) s.lastSeen = call.timestamp;
    s.totalInputChars += call.inputChars || 0;
    s.totalOutputChars += call.outputChars || 0;
    s.totalDurationMs += call.durationMs || 0;
    if (call.status === 'failed') s.failedCalls++;
    s.sources.add(call.source);
  }
  return stats;
}

function buildRecommendations(sorted, rarelyUsed, unused, overhead, totalMessages) {
  const recs = [];

  // 1. Remove unused tools
  if (unused.length > 0) {
    recs.push({
      priority: 'high',
      title: `Remove ${unused.length} unused tool${unused.length > 1 ? 's' : ''} (0 calls)`,
      impact: `Saves ~${fmt(unused.length * overhead.tokensPerToolDef)} tokens per message`,
      tools: unused.map((t) => t.name),
      action: 'Remove these tools/plugins from your config - they add overhead without providing value.',
    });
  }

  // 2. Remove rarely-used tools
  if (rarelyUsed.length > 0) {
    recs.push({
      priority: 'medium',
      title: `Consider removing ${rarelyUsed.length} rarely-used tool${rarelyUsed.length > 1 ? 's' : ''}`,
      impact: `Saves ~${fmt(rarelyUsed.length * overhead.tokensPerToolDef)} tokens per message`,
      tools: rarelyUsed.map((t) => `${t.name} (${t.calls} calls)`),
      action: 'These tools are used infrequently. If you can live without them, removing saves tokens on every request.',
    });
  }

  // 3. Heavy tools by output chars (potential output bloat)
  const heavyOutput = sorted
    .filter((t) => t.calls > 10 && t.totalOutputChars / t.calls > 10_000)
    .slice(0, 5);
  if (heavyOutput.length > 0) {
    recs.push({
      priority: 'low',
      title: 'Tools with large average output',
      impact: 'Large outputs consume output tokens and fill context faster',
      tools: heavyOutput.map((t) => `${t.name} (avg ${fmt(Math.round(t.totalOutputChars / t.calls))} chars/call)`),
      action: 'Consider if these tool outputs can be trimmed or summarized.',
    });
  }

  // 4. Overall savings summary
  if (overhead.savingsPerMsg > 0) {
    recs.push({
      priority: 'info',
      title: 'Projected savings',
      impact: `~${fmt(overhead.savingsPerMsg)} tokens/message, ~${fmt(overhead.totalSavings)} tokens total over ${totalMessages} messages`,
      tools: [],
      action: 'Apply the above recommendations to realize these savings.',
    });
  }

  return recs;
}

function fmt(n) {
  return n.toLocaleString('en-US');
}
