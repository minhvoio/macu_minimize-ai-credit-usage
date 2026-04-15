import { execSync } from 'child_process';
import { platform } from 'os';
import chalk from 'chalk';
import Table from 'cli-table3';

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
    chalk.dim(' — Minimize AI Credit Usage')
  );
  console.log(border);
  console.log('');
  console.log(chalk.dim('  How it works: every message to your AI loads ALL configured'));
  console.log(chalk.dim('  tool definitions (~300 tokens each). Tools you never call are'));
  console.log(chalk.dim('  silent overhead — macu finds them so you can remove them.'));
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
      chalk.dim('Source'),
    ],
    style: { head: [], border: ['dim'] },
    colWidths: [26, 14, 14, 10, 10, 14],
  });

  for (const tool of result.tools) {
    const daySpan = Math.max(1, (tool.lastSeen - tool.firstSeen) / 86_400_000);
    const avgPerDay = (tool.calls / daySpan).toFixed(1);

    let callsStr;
    if (tool.calls === 0) callsStr = chalk.red('0');
    else if (tool.calls <= result.rareThreshold) callsStr = chalk.yellow(fmt(tool.calls));
    else callsStr = chalk.green(fmt(tool.calls));

    table.push([
      tool.name.length > 24 ? tool.name.slice(0, 23) + '…' : tool.name,
      fmtDate(tool.firstSeen),
      fmtDate(tool.lastSeen),
      callsStr,
      avgPerDay,
      tool.sources.join(', '),
    ]);
  }

  console.log(table.toString());
  console.log('');
}

// ── Unused / Rarely Used ─────────────────────────────────

function renderUnused(result) {
  const { rarelyUsed, unused } = result.groups;
  if (unused.length === 0 && rarelyUsed.length === 0) return;

  sectionHeader('Unused & Rarely Used Tools');

  if (unused.length > 0) {
    console.log(chalk.red(`  ${unused.length} tool${unused.length > 1 ? 's' : ''} with 0 calls:`));
    for (const t of unused) {
      console.log(chalk.dim(`    • ${t.name}`));
    }
    console.log('');
  }

  if (rarelyUsed.length > 0) {
    console.log(chalk.yellow(`  ${rarelyUsed.length} tool${rarelyUsed.length > 1 ? 's' : ''} with ≤${result.rareThreshold} calls:`));
    for (const t of rarelyUsed) {
      console.log(chalk.dim(`    • ${t.name}`) + chalk.dim(` (${t.calls} calls, last used ${fmtDate(t.lastSeen)})`));
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

  console.log(`  ${chalk.dim('Now      ')} ${beforeBar}  ${chalk.red(fmt(overhead.before.tokensPerMsg))} tok ${chalk.dim(`— ${overhead.before.tools} tools loaded`)}`);
  console.log(`  ${chalk.dim('Optimized')} ${afterBar}  ${chalk.green(fmt(overhead.after.tokensPerMsg))} tok ${chalk.dim(`— ${overhead.after.tools} tools loaded`)}`);
  console.log('');
  console.log(`  ${chalk.bold.cyan('→ You would save ')}${chalk.bold.cyan(fmt(overhead.savingsPerMsg) + ' tokens per message')} ${chalk.bold.cyan(`(${pct}% reduction)`)}`);
  console.log('');

  if (result.totalMessages > 0) {
    const tokensPerM = 1_000_000;
    const totalStr = overhead.totalSavings > tokensPerM
      ? `${fmt(overhead.totalSavings)} tokens (≈ ${(overhead.totalSavings / tokensPerM).toFixed(1)}M)`
      : `${fmt(overhead.totalSavings)} tokens`;
    console.log(chalk.dim(`  Applied retroactively to your ${fmt(result.totalMessages)} messages over ${result.spanDays} days,`));
    console.log(chalk.dim(`  this would have saved ~`) + chalk.white(totalStr) + chalk.dim('.'));
  }
  console.log('');
}

// ── Next Steps (CTA) ─────────────────────────────────────

function renderNextSteps(result) {
  const { overhead, mcpServers, configPaths } = result;
  const removableCount = result.groups.unused.length + result.groups.rarelyUsed.length;

  if (removableCount === 0) {
    sectionHeader('Status');
    console.log(chalk.green('  ✓ All tools are actively used. Nothing to optimize.'));
    console.log('');
    return;
  }

  sectionHeader('Action Plan');

  console.log(chalk.dim('  Analysis complete — no changes have been made yet.'));
  console.log('');
  console.log(chalk.yellow('  ⚡ AI agent:') + chalk.dim(' read the steps below and execute them.'));
  console.log(chalk.dim('  🖥  Terminal: paste this output to your AI agent to apply the optimization.'));
  console.log('');

  let step = 1;

  const { fullyRemovable = [], partial = [] } = mcpServers || {};

  if (fullyRemovable.length > 0) {
    console.log(`  ${chalk.bold(`${step}.`)} ${chalk.bold('MCP servers to remove entirely')} ${chalk.dim('(100% unused/rare)')}`);
    for (const srv of fullyRemovable.slice(0, 8)) {
      console.log(`     ${chalk.red('✗')} ${chalk.white(`"${srv.name}"`)} ${chalk.dim(`— ${srv.tools.length} tools, ${srv.totalCalls} total calls`)}`);
    }
    step++;
    console.log('');
  }

  if (partial.length > 0) {
    console.log(`  ${chalk.bold(`${step}.`)} ${chalk.bold('Individual tools to remove')} ${chalk.dim('(keep the server, drop these)')}`);
    for (const srv of partial.slice(0, 6)) {
      const kept = srv.activeCount;
      console.log(`     ${chalk.yellow('⚠')} ${chalk.white(`"${srv.name}"`)} ${chalk.dim(`— ${kept} active, ${srv.removableTools.length} removable`)}`);
      for (const t of srv.removableTools.slice(0, 4)) {
        console.log(chalk.dim(`        • ${t.name} (${t.calls} call${t.calls === 1 ? '' : 's'})`));
      }
      if (srv.removableTools.length > 4) {
        console.log(chalk.dim(`        ... and ${srv.removableTools.length - 4} more`));
      }
    }
    step++;
    console.log('');
  }

  if (result.groups.unused.length > 0) {
    const orphanUnused = result.groups.unused.filter((t) => t.name.indexOf('_') === -1);
    if (orphanUnused.length > 0) {
      console.log(`  ${chalk.bold(`${step}.`)} ${chalk.bold(`Other unused tools (0 calls)`)}`);
      for (const t of orphanUnused.slice(0, 6)) {
        console.log(`     ${chalk.red('✗')} ${chalk.dim(t.name)}`);
      }
      if (orphanUnused.length > 6) {
        console.log(chalk.dim(`     ... and ${orphanUnused.length - 6} more`));
      }
      step++;
      console.log('');
    }
  }

  if (configPaths.length > 0) {
    console.log(`  ${chalk.bold(`${step}.`)} ${chalk.bold('Config files to edit')}`);
    for (const cp of configPaths) {
      console.log(`     ${chalk.cyan('→')} ${cp.source}: ${chalk.white(cp.path)}`);
    }
    step++;
    console.log('');
  }

  console.log(`  ${chalk.bold(`${step}.`)} ${chalk.bold('Verify')}`);
  console.log(chalk.dim('     Run ') + chalk.cyan('macu') + chalk.dim(' again after cleanup to confirm savings'));
  console.log('');

  const pct = Math.round((overhead.savingsPerMsg / overhead.before.tokensPerMsg) * 100);
  console.log(
    chalk.bold.green(`  Expected: `) +
    chalk.green(`${overhead.before.tools} → ${overhead.after.tools} tools, `) +
    chalk.bold.green(`~${fmt(overhead.savingsPerMsg)} tokens saved per message (${pct}%)`)
  );
  console.log('');
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
  const { overhead, mcpServers, configPaths } = result;
  const pct = Math.round((overhead.savingsPerMsg / overhead.before.tokensPerMsg) * 100);

  let prompt = `I ran macu (Minimize AI Credit Usage) and it found ${overhead.before.tools - overhead.after.tools} tools that can be removed to save ~${fmt(overhead.savingsPerMsg)} tokens per message (${pct}% reduction).\n\n`;

  prompt += `Please apply these optimizations:\n\n`;

  if (mcpServers.length > 0) {
    prompt += `Remove these MCP servers (low/zero usage):\n`;
    for (const srv of mcpServers) {
      prompt += `- "${srv.name}" (${srv.tools.length} tools, ${srv.totalCalls} total calls)\n`;
    }
    prompt += `\n`;
  }

  if (configPaths.length > 0) {
    prompt += `Config files to edit:\n`;
    for (const cp of configPaths) {
      if (cp.path.startsWith('/')) {
        prompt += `- ${cp.source}: ${cp.path}\n`;
      }
    }
    prompt += `\n`;
  }

  prompt += `After removing, run \`macu\` again to verify the savings.\n`;
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
