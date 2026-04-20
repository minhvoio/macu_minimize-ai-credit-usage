/**
 * config-reader.mjs - Map tool names to the config files that declare them.
 *
 * Given a tool name observed in usage data, resolve:
 *   - WHICH config file owns the registration (opencode.json / oh-my-openagent.json / claude settings)
 *   - WHAT kind of entry it is (direct MCP / plugin built-in MCP / plugin tool / Claude plugin MCP)
 *   - WHAT JSON snippet the user should merge to disable it
 *
 * This module is pure data. It reads config files at startup, then resolves synchronously.
 *
 * Sources verified from live source code (Apr 2026):
 *   - sst/opencode config/config.ts L659-669 (tools -> permission sugar)
 *   - sst/opencode config/config.ts L176-191 (mcp.<name>.enabled:false)
 *   - code-yeongyu/oh-my-openagent shared/disabled-tools.ts (filterDisabledTools)
 *   - code-yeongyu/oh-my-openagent plugin-handlers/mcp-config-handler.ts (disabled_mcps)
 *   - code.claude.com/docs/en/permissions (mcp__server__tool format)
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ── Hardcoded knowledge of the plugin ecosystem ───────────────────────────

// oh-my-opencode plugin built-in MCPs (registered by createBuiltinMcps() in the plugin).
// Disabled via "disabled_mcps" in oh-my-openagent.json (hard-deletes from merged MCP map).
const OH_MY_BUILTIN_MCPS = new Set(['context7', 'websearch', 'grep_app']);

// Claude Code plugin MCP servers that register tool families with the server's name as prefix.
// Disabled via "permissions": { "deny": ["mcp__<name>__*"] } in ~/.claude/settings.json.
const CLAUDE_PLUGIN_MCPS = new Set(['oh-my-claudecode']);

// oh-my-opencode plugin NATIVE tools (registered as OpenCode tools, not as MCP).
// Their tool names start with these prefixes and live in the plugin's tool-registry.
// Disabled via "disabled_tools": [...] in oh-my-openagent.json (full tool names, not prefix).
const OH_MY_PLUGIN_TOOL_PREFIXES = new Set([
  'lsp',         // lsp_diagnostics, lsp_rename, lsp_symbols, lsp_goto_definition, ...
  'session',     // session_read, session_search, session_info, session_list
  'ast',         // ast_grep_search, ast_grep_replace
  'background',  // background_output, background_cancel
  'skill',       // skill_mcp
  'look',        // look_at
  'interactive', // interactive_bash
]);

// Host-native tool prefixes (OpenCode / Claude Code / Codex built-ins).
// Cannot be disabled through any config - they are the host program's own tools.
const HOST_NATIVE_PREFIXES = new Set([
  'shell',   // Codex: shell command exec
  'exec',    // Codex: exec command
  'update',  // Codex: update_plan
  'wait',    // Codex: wait_agent
  'spawn',   // Codex: spawn_agent
  'apply',   // Claude Code: apply_patch
  'write',   // Codex: write_stdin (host built-in; OpenCode "write" has no underscore)
]);

// Known multi-word MCP names. extractMcpPrefix() in analyze.mjs splits at the FIRST
// underscore, so "grep_app_searchGitHub" would yield prefix "grep" instead of "grep_app".
// This list re-joins such names before resolution.
const MULTI_WORD_PREFIXES = ['grep_app'];

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Load all relevant config files once. Returns a context object used by resolveConfigSource.
 * Never throws - missing / malformed configs yield empty sets.
 */
export function loadConfigContext() {
  const home = homedir();
  const opencodePath = join(home, '.config', 'opencode', 'opencode.json');

  // oh-my-openagent.json is the canonical name; oh-my-opencode.json is the legacy name.
  const ohMyCurrent = join(home, '.config', 'opencode', 'oh-my-openagent.json');
  const ohMyLegacy = join(home, '.config', 'opencode', 'oh-my-opencode.json');
  const ohMyPath = existsSync(ohMyCurrent)
    ? ohMyCurrent
    : existsSync(ohMyLegacy)
      ? ohMyLegacy
      : ohMyCurrent; // default to modern path even if absent - used as display hint

  const claudePath = join(home, '.claude', 'settings.json');

  const opencodeCfg = readJsonSafe(opencodePath) ?? {};
  const ohMyCfg = readJsonSafe(ohMyPath) ?? {};

  return {
    paths: {
      opencode: opencodePath,
      ohMyOpencode: ohMyPath,
      claude: claudePath,
    },
    exists: {
      opencode: existsSync(opencodePath),
      ohMyOpencode: existsSync(ohMyPath),
      claude: existsSync(claudePath),
    },
    opencodeMcpServers: new Set(Object.keys(opencodeCfg.mcp ?? {})),
    ohMyDisabledTools: new Set(ohMyCfg.disabled_tools ?? []),
    ohMyDisabledMcps: new Set(ohMyCfg.disabled_mcps ?? []),
  };
}

/**
 * Resolve a tool name to its ConfigSource descriptor.
 *
 * @param {string} toolName - the full tool name as it appears in usage data
 * @param {string|null} rawPrefix - result of extractMcpPrefix(toolName), may need refinement
 * @param {object} ctx - result of loadConfigContext()
 * @returns {ConfigSource}
 *
 * ConfigSource shape:
 * {
 *   kind: string,              // see KINDS below
 *   label: string,             // short column label for the timeline table
 *   configFile: string|null,   // absolute path, or null for non-config-backed tools
 *   configFileLabel: string|null, // display-friendly path (tilde-abbreviated)
 *   serverKey: string|null,    // MCP server name, if applicable
 *   removable: boolean,        // can this be disabled through config?
 *   removalFormat: string|null,// see FORMATS below
 * }
 *
 * KINDS:
 *   - "opencode-mcp"        - direct MCP entry in opencode.json (mcp.<serverKey>)
 *   - "oh-my-builtin-mcp"   - MCP registered by oh-my-opencode plugin (context7, websearch, grep_app)
 *   - "oh-my-plugin-tool"   - native plugin tool (lsp_*, session_*, ast_*, ...)
 *   - "claude-plugin-mcp"   - Claude Code plugin MCP (oh-my-claudecode)
 *   - "host-native"         - host program's built-in tool, not removable
 *   - "removed"             - tool's source is no longer declared anywhere (historical data)
 *   - "unknown"             - unrecognized tool with an unknown source
 *
 * FORMATS (what snippet to emit for removal):
 *   - "mcp-entry"        - { "mcp": { "<name>": { "enabled": false } } }
 *   - "opencode-tools"   - { "tools": { "<fullToolName>": false, ... } }  (per-tool deny in opencode.json)
 *   - "disabled_mcps"    - { "disabled_mcps": [ "<name>" ] }
 *   - "disabled_tools"   - { "disabled_tools": [ "<fullToolName>", ... ] }
 *   - "permissions.deny" - { "permissions": { "deny": [ "mcp__<name>__*" ] } }
 */
export function resolveConfigSource(toolName, rawPrefix, ctx) {
  const prefix = refinePrefix(toolName, rawPrefix);

  // 1. Claude Code plugin MCP (oh-my-claudecode_t_*)
  if (prefix && CLAUDE_PLUGIN_MCPS.has(prefix)) {
    return {
      kind: 'claude-plugin-mcp',
      label: 'claude settings',
      configFile: ctx.paths.claude,
      configFileLabel: tildePath(ctx.paths.claude),
      serverKey: prefix,
      removable: true,
      removalFormat: 'permissions.deny',
    };
  }

  // 2. Direct opencode.json MCP server (user-declared in mcp.*)
  if (prefix && ctx.opencodeMcpServers.has(prefix)) {
    return {
      kind: 'opencode-mcp',
      label: 'opencode.json',
      configFile: ctx.paths.opencode,
      configFileLabel: tildePath(ctx.paths.opencode),
      serverKey: prefix,
      removable: true,
      removalFormat: 'mcp-entry',
    };
  }

  // 3. oh-my-opencode built-in MCP (plugin-provided, not in user's opencode.json)
  if (prefix && OH_MY_BUILTIN_MCPS.has(prefix)) {
    return {
      kind: 'oh-my-builtin-mcp',
      label: 'oh-my-openagent',
      configFile: ctx.paths.ohMyOpencode,
      configFileLabel: tildePath(ctx.paths.ohMyOpencode),
      serverKey: prefix,
      removable: true,
      removalFormat: 'disabled_mcps',
    };
  }

  // 4. oh-my-opencode plugin-native tool (bare lsp_*, session_*, etc.)
  if (prefix && OH_MY_PLUGIN_TOOL_PREFIXES.has(prefix)) {
    return {
      kind: 'oh-my-plugin-tool',
      label: 'oh-my-openagent',
      configFile: ctx.paths.ohMyOpencode,
      configFileLabel: tildePath(ctx.paths.ohMyOpencode),
      serverKey: null,
      removable: true,
      removalFormat: 'disabled_tools',
    };
  }

  // 5. Host-native tool (prefix is a reserved host built-in family, or no prefix at all)
  if (!prefix || HOST_NATIVE_PREFIXES.has(prefix)) {
    return {
      kind: 'host-native',
      label: 'built-in',
      configFile: null,
      configFileLabel: null,
      serverKey: null,
      removable: false,
      removalFormat: null,
    };
  }

  // 6. Prefix exists but matches nothing in any current config.
  //    Almost always means: the MCP server used to be declared in opencode.json but has
  //    been removed since. The usage data still carries old tool calls.
  return {
    kind: 'removed',
    label: 'removed',
    configFile: null,
    configFileLabel: null,
    serverKey: prefix,
    removable: false,
    removalFormat: null,
  };
}

/**
 * Build the exact JSON snippet the user should merge into their config.
 *
 * @param {ConfigSource} source - result of resolveConfigSource()
 * @param {string[]} toolNames - full tool names (used only when removalFormat === 'disabled_tools')
 * @returns {string|null} pretty-printed JSON, or null if not removable
 */
export function buildRemovalSnippet(source, toolNames = []) {
  if (!source.removable) return null;
  switch (source.removalFormat) {
    case 'mcp-entry':
      return JSON.stringify(
        { mcp: { [source.serverKey]: { enabled: false } } },
        null,
        2,
      );
    case 'opencode-tools': {
      const tools = {};
      for (const n of [...toolNames].sort()) tools[n] = false;
      return JSON.stringify({ tools }, null, 2);
    }
    case 'disabled_mcps':
      return JSON.stringify({ disabled_mcps: [source.serverKey] }, null, 2);
    case 'disabled_tools':
      return JSON.stringify({ disabled_tools: [...toolNames].sort() }, null, 2);
    case 'permissions.deny':
      return JSON.stringify(
        { permissions: { deny: [`mcp__${source.serverKey}__*`] } },
        null,
        2,
      );
    default:
      return null;
  }
}

/**
 * Group a list of { tool, source } pairs by their configFile + removalFormat.
 * Returns one group per unique (configFile, removalFormat) pair, preserving insertion order.
 * Non-removable entries (host-native, removed, unknown) are returned in separate groups.
 */
export function groupByConfigTarget(entries) {
  const removable = new Map();
  const removed = [];
  const hostNative = [];
  const unknown = [];

  for (const entry of entries) {
    const src = entry.source;
    if (src.kind === 'removed') { removed.push(entry); continue; }
    if (src.kind === 'host-native') { hostNative.push(entry); continue; }
    if (src.kind === 'unknown') { unknown.push(entry); continue; }

    const key = `${src.configFile}::${src.removalFormat}`;
    if (!removable.has(key)) {
      removable.set(key, {
        configFile: src.configFile,
        configFileLabel: src.configFileLabel,
        removalFormat: src.removalFormat,
        kind: src.kind,
        entries: [],
      });
    }
    removable.get(key).entries.push(entry);
  }

  return {
    removable: [...removable.values()],
    removed,
    hostNative,
    unknown,
  };
}

// ── Internals ─────────────────────────────────────────────────────────────

/**
 * extractMcpPrefix() in analyze.mjs splits at the FIRST underscore. Some MCP names
 * contain underscores (e.g. "grep_app"). Re-join those known multi-word names.
 */
export function refinePrefix(toolName, rawPrefix) {
  for (const known of MULTI_WORD_PREFIXES) {
    if (toolName.startsWith(known + '_')) return known;
  }
  return rawPrefix;
}

function readJsonSafe(path) {
  try {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function tildePath(absolutePath) {
  const home = homedir();
  if (absolutePath.startsWith(home)) {
    return '~' + absolutePath.slice(home.length);
  }
  return absolutePath;
}
