import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Claude Code stores JSONL in two locations (legacy + new)
const TRANSCRIPT_DIR = join(homedir(), '.claude', 'transcripts');
const PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const CONFIG_PROJECTS_DIR = join(homedir(), '.config', 'claude', 'projects');

export function probeClaudeCode() {
  const dirs = [TRANSCRIPT_DIR, PROJECTS_DIR, CONFIG_PROJECTS_DIR];
  const foundDirs = dirs.filter((d) => existsSync(d));
  if (foundDirs.length === 0) return { exists: false };

  // Quick check: count JSONL files
  let fileCount = 0;
  for (const dir of foundDirs) {
    fileCount += countJsonlFiles(dir);
  }

  return {
    exists: fileCount > 0,
    dirs: foundDirs,
    fileCount,
  };
}

export function loadClaudeCode(meta, days) {
  const cutoffMs = Date.now() - days * 86_400_000;
  const toolCalls = [];
  const tokenSnapshots = [];
  const sessionIds = new Set();

  for (const dir of meta.dirs) {
    const files = findJsonlFiles(dir);
    for (const filePath of files) {
      // Skip files older than cutoff by checking mtime first
      try {
        const stat = statSync(filePath);
        if (stat.mtimeMs < cutoffMs) continue;
      } catch { continue; }

      parseJsonlFileSync(filePath, cutoffMs, toolCalls, tokenSnapshots, sessionIds);
    }
  }

  return {
    toolCalls,
    tokenSnapshots,
    sessionCount: sessionIds.size,
  };
}

function parseJsonlFileSync(filePath, cutoffMs, toolCalls, tokenSnapshots, sessionIds) {
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch { return; }

  const lines = content.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;

    let entry;
    try {
      entry = JSON.parse(line);
    } catch { continue; }

    const ts = parseTimestamp(entry.timestamp);
    if (!ts || ts < cutoffMs) continue;

    if (entry.sessionId) sessionIds.add(entry.sessionId);

    // Extract tool_use from assistant message content
    if (entry.type === 'assistant' && entry.message?.content) {
      const msgContent = entry.message.content;
      if (Array.isArray(msgContent)) {
        for (const block of msgContent) {
          if (block.type === 'tool_use') {
            toolCalls.push({
              tool: block.name,
              timestamp: ts,
              status: 'completed',
              inputChars: JSON.stringify(block.input || {}).length,
              outputChars: 0, // output comes in tool_result, harder to pair
              source: 'claude-code',
            });
          }
        }
      }

      // Token data lives on the assistant message
      const usage = entry.message?.usage;
      if (usage) {
        tokenSnapshots.push({
          timestamp: ts,
          inputTokens: usage.input_tokens || 0,
          outputTokens: usage.output_tokens || 0,
          cacheRead: usage.cache_read_input_tokens || 0,
          cacheWrite: usage.cache_creation_input_tokens || 0,
          model: entry.message.model || null,
          source: 'claude-code',
        });
      }
    }

    // Standalone tool_use events (transcript format)
    if (entry.type === 'tool_use' && entry.tool_name) {
      toolCalls.push({
        tool: entry.tool_name,
        timestamp: ts,
        status: 'completed',
        inputChars: JSON.stringify(entry.tool_input || {}).length,
        outputChars: 0,
        source: 'claude-code',
      });
    }
  }
}

function parseTimestamp(ts) {
  if (!ts) return null;
  if (typeof ts === 'number') return ts;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d.getTime();
}

function countJsonlFiles(dir) {
  let count = 0;
  try {
    const walk = (d) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(join(d, entry.name));
        else if (entry.name.endsWith('.jsonl')) count++;
      }
    };
    walk(dir);
  } catch { /* ignore permission errors */ }
  return count;
}

function findJsonlFiles(dir) {
  const files = [];
  try {
    const walk = (d) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.jsonl')) files.push(full);
      }
    };
    walk(dir);
  } catch { /* ignore permission errors */ }
  return files;
}
