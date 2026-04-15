import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Empirically derived: 113,531 chars / 95 tools / ~4 chars per token ≈ 299
const TOKENS_PER_TOOL_DEF = 300;

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
  const rareThreshold = Math.max(5, Math.ceil(weeks));

  const active = sorted.filter((t) => t.calls > rareThreshold);
  const rarelyUsed = sorted.filter((t) => t.calls > 0 && t.calls <= rareThreshold);
  const unused = sorted.filter((t) => t.calls === 0);

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
  const mcpServers = detectRemovableMcpServers(removable);
  const configPaths = detectConfigPaths();

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
    groups: { active, rarelyUsed, unused },
    rareThreshold,
    mcpServers,
    configPaths,
  };
}

function detectRemovableMcpServers(removableTools) {
  const servers = {};
  for (const t of removableTools) {
    const sep = t.name.indexOf('_');
    if (sep === -1) continue;
    const prefix = t.name.slice(0, sep);
    if (!servers[prefix]) servers[prefix] = { name: prefix, tools: [], totalCalls: 0 };
    servers[prefix].tools.push(t.name);
    servers[prefix].totalCalls += t.calls;
  }
  return Object.values(servers).filter((s) => s.tools.length >= 2).sort((a, b) => a.totalCalls - b.totalCalls);
}

function detectConfigPaths() {
  const home = homedir();
  const candidates = [
    { source: 'OpenCode', path: join(home, '.config', 'opencode', 'opencode.json'), desc: 'MCP servers + plugins' },
    { source: 'Claude Code', path: join(home, '.claude', 'settings.json'), desc: 'permissions + MCP' },
    { source: 'Claude Code', path: '.mcp.json', desc: 'project-level MCP config' },
  ];
  return candidates.filter((c) => c.path.startsWith('/') ? existsSync(c.path) : true);
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
      action: 'Remove these tools/plugins from your config — they add overhead without providing value.',
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

  // 4. Duplicate tool groups (MCP prefix detection)
  const prefixes = {};
  for (const t of sorted) {
    const parts = t.name.split('_');
    if (parts.length >= 2) {
      const prefix = parts[0];
      if (!prefixes[prefix]) prefixes[prefix] = [];
      prefixes[prefix].push(t);
    }
  }
  for (const [prefix, tools] of Object.entries(prefixes)) {
    const totalCalls = tools.reduce((s, t) => s + t.calls, 0);
    if (tools.length >= 3 && totalCalls < 10) {
      recs.push({
        priority: 'medium',
        title: `MCP server "${prefix}" has ${tools.length} tools with only ${totalCalls} total calls`,
        impact: `Removing saves ~${fmt(tools.length * overhead.tokensPerToolDef)} tokens per message`,
        tools: tools.map((t) => `${t.name} (${t.calls} calls)`),
        action: `Consider removing the "${prefix}" MCP server entirely if these tools aren't essential.`,
      });
    }
  }

  // 5. Overall savings summary
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
