import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import Database from 'better-sqlite3';

const DB_PATH = join(homedir(), '.local', 'share', 'opencode', 'opencode.db');

export function probeOpenCode() {
  if (!existsSync(DB_PATH)) return { exists: false };

  try {
    const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    const row = db.prepare("SELECT COUNT(*) as cnt FROM part WHERE json_extract(data, '$.type') = 'tool'").get();
    const sessions = db.prepare('SELECT COUNT(*) as cnt FROM session').get();
    db.close();
    return { exists: row.cnt > 0, path: DB_PATH, toolCalls: row.cnt, sessions: sessions.cnt };
  } catch {
    return { exists: false };
  }
}

export function loadOpenCode(meta, days) {
  const db = new Database(meta.path, { readonly: true, fileMustExist: true });
  const cutoffMs = Date.now() - days * 86_400_000;

  const toolCalls = db.prepare(`
    SELECT
      json_extract(data, '$.tool')              AS tool,
      json_extract(data, '$.state.status')      AS status,
      time_created                               AS timestamp,
      COALESCE(length(json_extract(data, '$.state.input')), 0)  AS inputChars,
      COALESCE(length(json_extract(data, '$.state.output')), 0) AS outputChars,
      json_extract(data, '$.state.time.end') - json_extract(data, '$.state.time.start') AS durationMs
    FROM part
    WHERE json_extract(data, '$.type') = 'tool'
      AND json_extract(data, '$.tool') != 'invalid'
      AND time_created >= ?
    ORDER BY time_created ASC
  `).all(cutoffMs).map((r) => ({ ...r, source: 'opencode' }));

  const tokenSnapshots = db.prepare(`
    SELECT
      time_created                                    AS timestamp,
      COALESCE(json_extract(data, '$.tokens.input'), 0)         AS inputTokens,
      COALESCE(json_extract(data, '$.tokens.output'), 0)        AS outputTokens,
      COALESCE(json_extract(data, '$.tokens.cache.read'), 0)    AS cacheRead,
      COALESCE(json_extract(data, '$.tokens.cache.write'), 0)   AS cacheWrite,
      json_extract(data, '$.modelID')                AS model
    FROM message
    WHERE json_extract(data, '$.role') = 'assistant'
      AND time_created >= ?
    ORDER BY time_created ASC
  `).all(cutoffMs).map((r) => ({ ...r, source: 'opencode' }));

  const sessionCount = db.prepare(
    'SELECT COUNT(*) as cnt FROM session WHERE time_created >= ?'
  ).get(cutoffMs).cnt;

  db.close();

  return { toolCalls, tokenSnapshots, sessionCount };
}
