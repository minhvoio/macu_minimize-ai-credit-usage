import { execSync } from 'child_process';
import { platform } from 'os';
import chalk from 'chalk';
import Table from 'cli-table3';
import { buildRemovalSnippet, groupByConfigTarget } from './config-reader.mjs';

const BAR_WIDTH = 40;
const TOP_N = 15;

export function render(result, sourceNames) {
  console.log('');
  renderHeader();
  renderSourceSummary(result, sourceNames);
  renderFrequencyChart(result);
  renderTimeline(result);
  renderUnused(result);
  renderRecommendations(result);
  renderSavingsChart(result);
  renderNextSteps(result);
  promptCopyIfTTY(result);
}

// ── Header ────────────────────────────────────────────────

function renderHeader() {
  const border = chalk.dim('─'.repeat(60));
  console.log(border);
  console.log(
    chalk.bold.cyan('  macu') +
    chalk.dim(' - Minimize AI Credit Usage')
  );
  console.log(border);
  console.log('');
  console.log(chalk.dim('  How it works: every message to your AI loads ALL configured'));
  console.log(chalk.dim('  tool definitions (~100-2500 tokens each, avg ~300). Tools you'));
  console.log(chalk.dim('  never call are silent overhead - macu finds them so you can'));
  console.log(chalk.dim('  remove them. Token estimates below are approximate.'));
  console.log('');
}

// ── Source Summary ────────────────────────────────────────

function renderSourceSummary(result, sourceNames) {
  const sources = sourceNames.join(', ');
  const from = fmtDate(result.earliest);
  const to = fmtDate(result.latest);

  console.log(chalk.dim('  Source    ') + sources);
  console.log(chalk.dim('  Period    ') + `${from}${to} (${result.spanDays} days)`);
  console.log(chalk.dim('  Sessions  ') + fmt(result.sessionCount));
  console.log(chalk.dim('  Messages  ') + fmt(result.totalMessages));
  console.log(chalk.dim('  Tool calls') + `  ${fmt(result.totalCalls)} across ${result.tools.length} unique tools`);

  const totalTokens = result.totalInputTokens + result.totalOutputTokens;
  if (totalTokens > 0) {
    console.log(chalk.dim('  Tokens    ') + `${fmt(totalTokens)} (${fmt(result.totalInputTokens)} in / ${fmt(result.totalOutputTokens)} out)`);
  }
  console.log('');
}

// ── Frequency Bar Chart ──────────────────────────────────

function renderFrequencyChart(result) {
  sectionHeader('Most Used Tools');

  const top = result.tools.slice(0, TOP_N);
  if (top.length === 0) {
    console.log(chalk.dim('  No tool calls found.'));
    console.log('');
    return;
  }

  const maxCalls = top[0].calls;
  const maxNameLen = Math.max(...top.map((t) => t.name.length), 4);

  for (const tool of top) {
    const pct = result.totalCalls > 0 ? (tool.calls / result.totalCalls) * 100 : 0;
    const barLen = Math.max(1, Math.round((tool.calls / maxCalls) * BAR_WIDTH));
    const bar = renderBar(barLen, BAR_WIDTH, pct);
    const name = tool.name.padEnd(maxNameLen);
    const calls = fmt(tool.calls).padStart(8);
    const pctStr = chalk.dim(`(${pct.toFixed(1)}%)`);

    console.log(`  ${chalk.white(name)}  ${bar} ${calls} ${pctStr}`);
  }

  if (result.tools.length > TOP_N) {
    console.log(chalk.dim(`  ... ${result.tools.length - TOP_N} more tools`));
  }
  console.log('');
}

function renderBar(filled, total, pct) {
  // Color gradient: green (low usage) → cyan (medium) → yellow (high)
  let color;
  if (pct > 20) color = chalk.yellow;
  else if (pct > 10) color = chalk.cyan;
  else color = chalk.green;

  const bar = color('█'.repeat(filled)) + chalk.dim('░'.repeat(total - filled));
  return bar;
}

// ── Activity Timeline Table ──────────────────────────────

function renderTimeline(result) {
  sectionHeader('Tool Activity Timeline');

  const table = new Table({
    head: [
      chalk.dim('Tool'),
      chalk.dim('First Seen'),
      chalk.dim('Last Seen'),
      chalk.dim('Calls'),
      chalk.dim('Avg/Day'),
      chalk.dim('Config'),
      chalk.dim('Client'),
    ],
    style: { head: [], border: ['dim'] },
    colWidths: [26, 14, 14, 10, 10, 18, 13],
  });

  for (const tool of result.tools) {
    const daySpan = Math.max(1, (tool.lastSeen - tool.firstSeen) / 86_400_000);
    const avgPerDay = (tool.calls / daySpan).toFixed(1);

    let callsStr;
    if (tool.calls === 0) callsStr = chalk.red('0');
    else if (tool.isNew && tool.calls < result.rareThreshold) callsStr = chalk.blue(fmt(tool.calls));
    else if (tool.calls < result.rareThreshold) callsStr = chalk.yellow(fmt(tool.calls));
    else callsStr = chalk.green(fmt(tool.calls));

    const configLabel = formatConfigLabel(tool.configSource);
    const clientLabel = (tool.sources || []).join(', ');

    table.push([
      tool.name.length > 24 ? tool.name.slice(0, 23) + '…' : tool.name,
      fmtDate(tool.firstSeen),
      fmtDate(tool.lastSeen),
      callsStr,
      avgPerDay,
      configLabel,
      clientLabel,
    ]);
  }

  console.log(table.toString());
  console.log('');
}

// ── Unused / Rarely Used ─────────────────────────────────

function renderUnused(result) {
  const { rarelyUsed, unused, newTools = [] } = result.groups;
  if (unused.length === 0 && rarelyUsed.length === 0 && newTools.length === 0) return;

  sectionHeader('Unused & Rarely Used Tools');

  if (unused.length > 0) {
    console.log(chalk.red(`  ${unused.length} tool${unused.length > 1 ? 's' : ''} with 0 calls:`));
    for (const t of unused) {
      console.log(chalk.dim(`    • ${t.name}`));
    }
    console.log('');
  }

  if (rarelyUsed.length > 0) {
    console.log(chalk.yellow(`  ${rarelyUsed.length} tool${rarelyUsed.length > 1 ? 's' : ''} with <${result.rareThreshold} calls:`));
    for (const t of rarelyUsed) {
      const age = t.daysSinceLastUsed > 14
        ? chalk.dim(` -- idle ${t.daysSinceLastUsed}d`)
        : '';
      console.log(chalk.dim(`    • ${t.name}`) + chalk.dim(` (${t.calls} calls, last used ${fmtDate(t.lastSeen)})`) + age);
    }
    console.log('');
  }

  if (newTools.length > 0) {
    console.log(chalk.blue(`  ${newTools.length} recently added (installed <14 days ago, not enough data yet):`));
    for (const t of newTools) {
      console.log(chalk.dim(`    • ${t.name}`) + chalk.dim(` (${t.calls} calls, added ${t.toolAgeDays}d ago)`));
    }
    console.log('');
  }
}

// ── Recommendations ──────────────────────────────────────

function renderRecommendations(result) {
  if (result.recommendations.length === 0) return;

  sectionHeader('Recommendations');

  for (let i = 0; i < result.recommendations.length; i++) {
    const rec = result.recommendations[i];
    const icon = rec.priority === 'high' ? chalk.red('!!') :
                 rec.priority === 'medium' ? chalk.yellow(' !') :
                 rec.priority === 'info' ? chalk.cyan(' i') :
                 chalk.dim(' ·');

    console.log(`  ${icon} ${chalk.bold(rec.title)}`);
    console.log(`     ${chalk.dim(rec.impact)}`);

    if (rec.tools.length > 0 && rec.tools.length <= 8) {
      for (const t of rec.tools) {
        console.log(chalk.dim(`       • ${t}`));
      }
    } else if (rec.tools.length > 8) {
      for (const t of rec.tools.slice(0, 5)) {
        console.log(chalk.dim(`       • ${t}`));
      }
      console.log(chalk.dim(`       ... and ${rec.tools.length - 5} more`));
    }

    if (rec.action) {
      console.log(`     ${chalk.dim('→')} ${rec.action}`);
    }
    console.log('');
  }
}

// ── Before / After Savings Chart ─────────────────────────

function renderSavingsChart(result) {
  const { overhead } = result;
  if (overhead.savingsPerMsg === 0) {
    sectionHeader('Token Overhead');
    console.log(`  All ${overhead.before.tools} tools are actively used. No optimization needed.`);
    console.log('');
    return;
  }

  sectionHeader('Projected Token Overhead');

  console.log(chalk.dim('  How much of your context budget is spent just loading tool definitions:'));
  console.log('');

  const maxTokens = overhead.before.tokensPerMsg;
  const scale = BAR_WIDTH / maxTokens;
  const beforeLen = Math.round(overhead.before.tokensPerMsg * scale);
  const afterLen = Math.round(overhead.after.tokensPerMsg * scale);

  const beforeBar = chalk.red('█'.repeat(beforeLen)) + chalk.dim('░'.repeat(BAR_WIDTH - beforeLen));
  const afterBar = chalk.green('█'.repeat(afterLen)) + chalk.dim('░'.repeat(BAR_WIDTH - afterLen));

  const pct = Math.round((overhead.savingsPerMsg / overhead.before.tokensPerMsg) * 100);

  console.log(`  ${chalk.dim('Now      ')} ${beforeBar}  ${chalk.red(fmt(overhead.before.tokensPerMsg))} tok ${chalk.dim(`- ${overhead.before.tools} tools loaded`)}`);
  console.log(`  ${chalk.dim('Optimized')} ${afterBar}  ${chalk.green(fmt(overhead.after.tokensPerMsg))} tok ${chalk.dim(`- ${overhead.after.tools} tools loaded`)}`);
  console.log('');
  console.log(`  ${chalk.bold.cyan('→ Estimated savings: ')}${chalk.bold.cyan('~' + fmt(overhead.savingsPerMsg) + ' tokens per message')} ${chalk.bold.cyan(`(${pct}% reduction)`)}`);
  console.log(chalk.dim(`    Based on avg ~${overhead.tokensPerToolDef} tokens/tool. Actual tool sizes vary (100-2500 tokens).`));
  console.log('');

  if (result.totalMessages > 0) {
    const tokensPerM = 1_000_000;
    const totalStr = overhead.totalSavings > tokensPerM
      ? `${fmt(overhead.totalSavings)} tokens (≈ ${(overhead.totalSavings / tokensPerM).toFixed(1)}M)`
      : `${fmt(overhead.totalSavings)} tokens`;
    console.log(chalk.dim(`  Applied retroactively to your ${fmt(result.totalMessages)} messages over ${result.spanDays} days,`));
    console.log(chalk.dim(`  this would have saved roughly `) + chalk.white(totalStr) + chalk.dim('.'));
  }
  console.log('');
}

// ── Next Steps (CTA) ─────────────────────────────────────

function renderNextSteps(result) {
  const { overhead } = result;
  const removableCount = result.groups.unused.length + result.groups.rarelyUsed.length;

  if (removableCount === 0) {
    sectionHeader('Status');
    console.log(chalk.green('  ✓ All tools are actively used. Nothing to optimize.'));
    console.log('');
    return;
  }

  sectionHeader('Action Plan');

  console.log(chalk.dim('  Analysis complete - no changes have been made yet.'));
  console.log('');
  console.log(chalk.yellow('  ⚡ AI agent:') + chalk.dim(' read the steps below and execute them.'));
  console.log(chalk.dim('  🖥  Terminal: paste this output to your AI agent to apply the optimization.'));
  console.log('');

  // Build the list of removable tools (unused + rarelyUsed), each paired with its ConfigSource.
  // Refine opencode-mcp entries: if the server has any active tools remaining, switch
  // from whole-server disable to per-tool deny (so we don't nuke active tools).
  // New tools are intentionally excluded: not enough data yet.
  const removableTools = [
    ...result.groups.unused,
    ...result.groups.rarelyUsed,
  ].filter((t) => t.configSource);

  // Build set of server keys that STILL have at least one active or new tool.
  // These should use per-tool deny, not whole-server disable.
  const activeServersWithTools = new Set();
  for (const t of result.tools) {
    if (!t.configSource || !t.configSource.serverKey) continue;
    const isActive = t.calls >= result.rareThreshold || (t.isNew && t.calls > 0);
    if (isActive) activeServersWithTools.add(t.configSource.serverKey);
  }

  const removables = removableTools.map((t) => {
    const src = t.configSource;
    // Only rewrite opencode-mcp to per-tool deny when the server has other active tools.
    if (src.kind === 'opencode-mcp' && activeServersWithTools.has(src.serverKey)) {
      return {
        tool: t,
        source: { ...src, removalFormat: 'opencode-tools' },
      };
    }
    return { tool: t, source: src };
  });

  const grouped = groupByConfigTarget(removables);

  let step = 1;

  // One step per (configFile, removalFormat) group. This is the source-aware breakdown.
  for (const group of grouped.removable) {
    step = renderRemovalGroup(group, step);
  }

  // Historical data: tools whose source is no longer declared anywhere.
  // Informational only - no action needed.
  if (grouped.removed.length > 0) {
    console.log(`  ${chalk.bold(`${step}.`)} ${chalk.bold('Historical data')} ${chalk.dim('(no action needed)')}`);
    console.log(chalk.dim('     These tools appear in your usage history but their MCP server is'));
    console.log(chalk.dim('     no longer declared in any config file. They will not load anymore.'));
    console.log('');
    const byServer = new Map();
    for (const { tool, source } of grouped.removed) {
      const key = source.serverKey || tool.name;
      if (!byServer.has(key)) byServer.set(key, []);
      byServer.get(key).push(tool);
    }
    for (const [serverKey, tools] of byServer) {
      const totalCalls = tools.reduce((n, t) => n + t.calls, 0);
      console.log(chalk.dim(`     • "${serverKey}" - ${tools.length} tool${tools.length === 1 ? '' : 's'}, ${totalCalls} historical call${totalCalls === 1 ? '' : 's'}`));
    }
    step++;
    console.log('');
  }

  // Tools we could not classify. Rare.
  if (grouped.unknown.length > 0) {
    console.log(`  ${chalk.bold(`${step}.`)} ${chalk.bold('Unknown source')} ${chalk.dim('(manual investigation)')}`);
    console.log(chalk.dim('     macu could not determine which config file declares these. Try:'));
    console.log(chalk.dim('     grep the tool name in ~/.config/opencode/ and ~/.claude/ to locate it.'));
    for (const { tool } of grouped.unknown.slice(0, 6)) {
      console.log(`     ${chalk.yellow('?')} ${chalk.dim(tool.name)} ${chalk.dim(`(${tool.calls} calls)`)}`);
    }
    if (grouped.unknown.length > 6) {
      console.log(chalk.dim(`     ... and ${grouped.unknown.length - 6} more`));
    }
    step++;
    console.log('');
  }

  // Verify step: always last.
  console.log(`  ${chalk.bold(`${step}.`)} ${chalk.bold('Verify')}`);
  console.log(chalk.dim('     Run ') + chalk.cyan('macu') + chalk.dim(' again after cleanup to confirm savings.'));
  console.log('');

  const pct = Math.round((overhead.savingsPerMsg / overhead.before.tokensPerMsg) * 100);
  console.log(
    chalk.bold.green(`  Expected: `) +
    chalk.green(`${overhead.before.tools} → ${overhead.after.tools} tools, `) +
    chalk.bold.green(`~${fmt(overhead.savingsPerMsg)} tokens saved per message (${pct}%)`)
  );
  console.log('');
}

/**
 * Render a single removal group: one config file + one removal format = one step.
 * Emits the exact JSON snippet to merge and the list of tools covered.
 */
function renderRemovalGroup(group, step) {
  const headline = describeRemovalAction(group);
  const fileLabel = group.configFileLabel || group.configFile || 'config file';

  console.log(`  ${chalk.bold(`${step}.`)} ${chalk.bold(headline)}`);
  console.log(`     ${chalk.cyan('→')} Edit ${chalk.white(fileLabel)}`);
  console.log('');

  // Emit exact JSON snippet. For per-tool formats, collect all tool names in this group.
  const snippet = buildGroupSnippet(group);
  if (snippet) {
    for (const line of snippet.split('\n')) {
      console.log(chalk.dim('       ') + chalk.white(line));
    }
    console.log('');
  }

  // List tools covered by this group. Cap to keep output scannable.
  const tools = group.entries.map((e) => e.tool);
  const totalCalls = tools.reduce((n, t) => n + t.calls, 0);
  console.log(chalk.dim(`     Covers ${tools.length} tool${tools.length === 1 ? '' : 's'}, ${totalCalls} call${totalCalls === 1 ? '' : 's'}:`));
  for (const t of tools.slice(0, 8)) {
    const callStr = t.calls === 0 ? chalk.red('0') : chalk.yellow(String(t.calls));
    console.log(chalk.dim(`       • ${t.name} (${callStr}${chalk.dim(' calls)')}`));
  }
  if (tools.length > 8) {
    console.log(chalk.dim(`       ... and ${tools.length - 8} more`));
  }
  console.log('');
  return step + 1;
}

/**
 * Human-readable headline for a removal group, specific to the removal format.
 */
function describeRemovalAction(group) {
  switch (group.removalFormat) {
    case 'mcp-entry':
      return 'Disable entire MCP server in opencode.json';
    case 'opencode-tools':
      return 'Deny specific MCP tools in opencode.json';
    case 'disabled_mcps':
      return 'Disable built-in MCP via oh-my-openagent.json';
    case 'disabled_tools':
      return 'Disable plugin tools via oh-my-openagent.json';
    case 'permissions.deny':
      return 'Deny Claude Code plugin MCP in settings.json';
    default:
      return 'Edit config';
  }
}

/**
 * Build the exact JSON snippet for this group.
 *
 * For per-server formats (mcp-entry, disabled_mcps, permissions.deny) we may have
 * multiple servers in the same group (e.g. two opencode.json MCPs to disable at once).
 * We merge them into one snippet to give the agent a single atomic edit.
 */
function buildGroupSnippet(group) {
  const entries = group.entries;
  if (entries.length === 0) return null;

  switch (group.removalFormat) {
    case 'mcp-entry': {
      const mcp = {};
      for (const e of entries) {
        if (e.source.serverKey) mcp[e.source.serverKey] = { enabled: false };
      }
      return JSON.stringify({ mcp }, null, 2);
    }
    case 'opencode-tools': {
      const tools = {};
      for (const e of entries) tools[e.tool.name] = false;
      const sorted = {};
      for (const k of Object.keys(tools).sort()) sorted[k] = false;
      return JSON.stringify({ tools: sorted }, null, 2);
    }
    case 'disabled_mcps': {
      const names = new Set();
      for (const e of entries) if (e.source.serverKey) names.add(e.source.serverKey);
      return JSON.stringify({ disabled_mcps: [...names].sort() }, null, 2);
    }
    case 'disabled_tools': {
      const names = new Set();
      for (const e of entries) names.add(e.tool.name);
      return JSON.stringify({ disabled_tools: [...names].sort() }, null, 2);
    }
    case 'permissions.deny': {
      const deny = new Set();
      for (const e of entries) {
        if (e.source.serverKey) deny.add(`mcp__${e.source.serverKey}__*`);
      }
      return JSON.stringify(
        { permissions: { deny: [...deny].sort() } },
        null,
        2,
      );
    }
    default:
      // Fall back to single-entry snippet from config-reader.
      return buildRemovalSnippet(entries[0].source, [entries[0].tool.name]);
  }
}

/**
 * Short label for the Config column in the timeline table. Kept tight to fit 18 chars.
 */
function formatConfigLabel(source) {
  if (!source) return '';
  switch (source.kind) {
    case 'opencode-mcp':      return chalk.cyan('opencode.json');
    case 'oh-my-builtin-mcp': return chalk.cyan('oh-my-openagent');
    case 'oh-my-plugin-tool': return chalk.cyan('oh-my-openagent');
    case 'claude-plugin-mcp': return chalk.cyan('claude settings');
    case 'host-native':       return chalk.dim('built-in');
    case 'removed':           return chalk.red('removed');
    case 'unknown':           return chalk.yellow('unknown');
    default:                  return chalk.dim(source.label || '');
  }
}

// ── Helpers ──────────────────────────────────────────────

function sectionHeader(title) {
  console.log(chalk.bold.cyan(`  ── ${title} `) + chalk.dim('─'.repeat(Math.max(0, 50 - title.length))));
  console.log('');
}

function fmtDate(ms) {
  const d = new Date(ms);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function fmt(n) {
  if (typeof n !== 'number') return String(n);
  return n.toLocaleString('en-US');
}

// ── Copy-to-clipboard prompt ─────────────────────────────

function promptCopyIfTTY(result) {
  const removableCount = result.groups.unused.length + result.groups.rarelyUsed.length;
  if (removableCount === 0) return;
  if (!process.stdout.isTTY || !process.stdin.isTTY) return;

  const prompt = buildAgentPrompt(result);

  console.log(chalk.dim('  ─────────────────────────────────────────────────────'));
  console.log(`  Press ${chalk.bold.cyan('c')} to copy optimization prompt to clipboard`);
  console.log(`  Press ${chalk.dim('any other key')} to exit`);
  console.log('');

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.once('data', (key) => {
    process.stdin.setRawMode(false);
    process.stdin.pause();

    if (key.toString() === 'c' || key.toString() === 'C') {
      const copied = copyToClipboard(prompt);
      if (copied) {
        console.log(chalk.green('  ✓ Copied to clipboard. Paste it to your AI agent.'));
      } else {
        console.log(chalk.yellow('  ⚠ Could not copy to clipboard. Prompt printed below:'));
        console.log('');
        console.log(prompt);
      }
    }

    console.log('');
    process.exit(0);
  });
}

function buildAgentPrompt(result) {
  const { overhead } = result;
  const pct = Math.round((overhead.savingsPerMsg / overhead.before.tokensPerMsg) * 100);

  // Build the same source-aware groups used by the Action Plan rendering.
  const removables = [
    ...result.groups.unused,
    ...result.groups.rarelyUsed,
  ]
    .filter((t) => t.configSource)
    .map((t) => ({ tool: t, source: t.configSource }));

  const grouped = groupByConfigTarget(removables);

  let prompt = `I ran macu (Minimize AI Credit Usage). It found ${overhead.before.tools - overhead.after.tools} tools that can be disabled to save ~${fmt(overhead.savingsPerMsg)} tokens per message (${pct}% reduction).\n\n`;
  prompt += `Apply the edits below. Each block shows the exact config file and JSON to merge.\n`;
  prompt += `Before editing: back up the file. After editing: run \`macu\` to verify.\n\n`;

  if (grouped.removable.length === 0) {
    prompt += `(No per-file edits needed - tools are all built-in or already removed.)\n`;
  }

  for (const group of grouped.removable) {
    prompt += `=== ${describeRemovalAction(group)} ===\n`;
    prompt += `File: ${group.configFileLabel || group.configFile}\n`;
    prompt += `Merge this JSON into the file (keep existing fields, add/extend arrays):\n`;
    const snippet = buildGroupSnippet(group);
    if (snippet) prompt += snippet + '\n';
    const tools = group.entries.map((e) => e.tool);
    const totalCalls = tools.reduce((n, t) => n + t.calls, 0);
    prompt += `Covers ${tools.length} tool(s), ${totalCalls} call(s): ${tools.map((t) => t.name).join(', ')}\n\n`;
  }

  if (grouped.removed.length > 0) {
    const serverKeys = new Set(grouped.removed.map((e) => e.source.serverKey).filter(Boolean));
    prompt += `Historical (no action needed): ${[...serverKeys].join(', ')} - these MCP servers are no longer declared in any config.\n\n`;
  }

  prompt += `Expected result: ${overhead.before.tools} → ${overhead.after.tools} tools, ~${fmt(overhead.savingsPerMsg)} tokens saved per message.`;
  return prompt;
}

function copyToClipboard(text) {
  try {
    const os = platform();
    if (os === 'darwin') {
      execSync('pbcopy', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
      return true;
    }
    if (os === 'linux') {
      try {
        execSync('xclip -selection clipboard', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
        return true;
      } catch {
        execSync('xsel --clipboard --input', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
        return true;
      }
    }
    if (os === 'win32') {
      execSync('clip', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
      return true;
    }
  } catch { /* clipboard unavailable */ }
  return false;
}
