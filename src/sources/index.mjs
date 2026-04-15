import { probeOpenCode, loadOpenCode } from './opencode.mjs';
import { probeClaudeCode, loadClaudeCode } from './claude-code.mjs';
import { probeCodex, loadCodex } from './codex.mjs';

/**
 * Normalized data model - every source adapter returns this shape.
 *
 * @typedef {Object} ToolCall
 * @property {string}  tool       - Tool name (e.g. "bash", "Read", "shell")
 * @property {number}  timestamp  - Unix ms
 * @property {string}  status     - "completed" | "failed" | "unknown"
 * @property {number}  inputChars - Approximate input size in chars
 * @property {number}  outputChars- Approximate output size in chars
 * @property {number}  [durationMs] - Execution time if available
 * @property {string}  source     - "opencode" | "claude-code" | "codex"
 *
 * @typedef {Object} TokenSnapshot
 * @property {number}  timestamp    - Unix ms
 * @property {number}  inputTokens  - Input tokens for this message/step
 * @property {number}  outputTokens - Output tokens
 * @property {number}  [cacheRead]  - Cache read tokens
 * @property {number}  [cacheWrite] - Cache write tokens
 * @property {string}  [model]      - Model ID
 * @property {string}  source       - "opencode" | "claude-code" | "codex"
 *
 * @typedef {Object} SourceData
 * @property {ToolCall[]}      toolCalls
 * @property {TokenSnapshot[]} tokenSnapshots
 * @property {number}          sessionCount
 */

const SOURCES = [
  { name: 'OpenCode',    probe: probeOpenCode,    load: loadOpenCode },
  { name: 'Claude Code', probe: probeClaudeCode,  load: loadClaudeCode },
  { name: 'Codex',       probe: probeCodex,       load: loadCodex },
];

/**
 * Detect which AI tool data sources exist on this machine.
 * Returns an array of { name, path, probe } objects for each found source.
 */
export function detectSources() {
  const found = [];
  for (const src of SOURCES) {
    const result = src.probe();
    if (result.exists) {
      found.push({ name: src.name, meta: result, load: src.load });
    }
  }
  return found;
}

/**
 * Load data from all detected sources, merge into a single SourceData.
 */
export function loadAll(sources, days) {
  const merged = { toolCalls: [], tokenSnapshots: [], sessionCount: 0 };

  for (const src of sources) {
    const data = src.load(src.meta, days);
    merged.toolCalls.push(...data.toolCalls);
    merged.tokenSnapshots.push(...data.tokenSnapshots);
    merged.sessionCount += data.sessionCount;
  }

  // Sort by timestamp
  merged.toolCalls.sort((a, b) => a.timestamp - b.timestamp);
  merged.tokenSnapshots.sort((a, b) => a.timestamp - b.timestamp);

  return merged;
}
