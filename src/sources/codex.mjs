import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import Database from 'better-sqlite3';

const CODEX_DIR = join(homedir(), '.codex');
const SESSIONS_DIR = join(CODEX_DIR, 'sessions');
const STATE_DB = join(CODEX_DIR, 'state_5.sqlite');

export function probeCodex() {
  if (!existsSync(SESSIONS_DIR)) return { exists: false };

  let fileCount = 0;
  try {
    const walk = (d) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(join(d, entry.name));
        else if (entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl')) fileCount++;
      }
    };
    walk(SESSIONS_DIR);
  } catch { /* ignore */ }

  return {
    exists: fileCount > 0,
    sessionsDir: SESSIONS_DIR,
    stateDb: existsSync(STATE_DB) ? STATE_DB : null,
    fileCount,
  };
}

export function loadCodex(meta, days) {
  const cutoffMs = Date.now() - days * 86_400_000;
  const toolCalls = [];
  const tokenSnapshots = [];
  const sessionIds = new Set();

  // Parse rollout JSONL files
  const files = findRolloutFiles(meta.sessionsDir);
  for (const filePath of files) {
    try {
      const stat = statSync(filePath);
      if (stat.mtimeMs < cutoffMs) continue;
    } catch { continue; }

    parseRolloutFile(filePath, cutoffMs, toolCalls, tokenSnapshots, sessionIds);
  }

  // Supplement with state DB for session count and token totals
  let dbSessionCount = 0;
  if (meta.stateDb) {
    try {
      const db = new Database(meta.stateDb, { readonly: true, fileMustExist: true });
      const row = db.prepare(
        'SELECT COUNT(*) as cnt FROM threads WHERE created_at >= ?'
      ).get(new Date(cutoffMs).toISOString());
      dbSessionCount = row?.cnt || 0;
      db.close();
    } catch { /* state DB optional */ }
  }

  return {
    toolCalls,
    tokenSnapshots,
    sessionCount: Math.max(sessionIds.size, dbSessionCount),
  };
}

function parseRolloutFile(filePath, cutoffMs, toolCalls, tokenSnapshots, sessionIds) {
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch { return; }

  // Track latest cumulative token counts per file (Codex reports cumulative)
  let prevTokens = null;

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;

    let entry;
    try { entry = JSON.parse(line); } catch { continue; }

    const ts = parseTimestamp(entry.timestamp);
    if (!ts || ts < cutoffMs) continue;

    if (entry.session_id) sessionIds.add(entry.session_id);

    // Tool calls: function_call events
    if (entry.type === 'response_item' && entry.payload?.type === 'function_call') {
      toolCalls.push({
        tool: entry.payload.name || 'unknown',
        timestamp: ts,
        status: entry.payload.status === 'completed' ? 'completed' : (entry.payload.status || 'unknown'),
        inputChars: (entry.payload.arguments || '').length,
        outputChars: (entry.payload.output || '').length,
        source: 'codex',
      });
    }

    // Token snapshots: cumulative counts — compute delta
    if (entry.type === 'event_msg' && entry.payload?.type === 'token_count') {
      const info = entry.payload.info?.total_token_usage;
      if (info) {
        const snap = {
          timestamp: ts,
          inputTokens: info.input_tokens || 0,
          outputTokens: info.output_tokens || 0,
          cacheRead: info.cached_input_tokens || 0,
          cacheWrite: 0,
          model: null,
          source: 'codex',
        };

        // Codex reports cumulative totals — convert to per-step delta
        if (prevTokens) {
          snap.inputTokens = Math.max(0, snap.inputTokens - prevTokens.inputTokens);
          snap.outputTokens = Math.max(0, snap.outputTokens - prevTokens.outputTokens);
        }
        prevTokens = {
          inputTokens: info.input_tokens || 0,
          outputTokens: info.output_tokens || 0,
        };

        tokenSnapshots.push(snap);
      }
    }
  }
}

function parseTimestamp(ts) {
  if (!ts) return null;
  if (typeof ts === 'number') return ts > 1e12 ? ts : ts * 1000; // handle seconds vs ms
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d.getTime();
}

function findRolloutFiles(dir) {
  const files = [];
  try {
    const walk = (d) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl')) files.push(full);
      }
    };
    walk(dir);
  } catch { /* ignore */ }
  return files;
}
