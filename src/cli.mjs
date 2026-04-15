import { detectSources, loadAll } from './sources/index.mjs';
import { analyze } from './analyze.mjs';
import { render } from './render.mjs';

const HELP = `
macu — Minimize AI Credit Usage

Usage:
  macu              Full analysis (auto-detects data sources)
  macu --days N     Analyze last N days (default: 180)
  macu --source X   Only analyze a specific source (opencode|claude|codex)
  macu --json       Output raw JSON instead of terminal UI
  macu --help       Show this help

Examples:
  macu                    # analyze everything found on this machine
  macu --days 30          # last 30 days only
  macu --source opencode  # OpenCode only
`.trim();

export async function run(argv) {
  const flags = parseFlags(argv);

  if (flags.help) {
    console.log(HELP);
    return;
  }

  const days = flags.days ? parseInt(flags.days, 10) : 180;
  const sourceFilter = flags.source || null;

  const detected = detectSources();

  if (detected.length === 0) {
    console.error(
      'No AI tool data found. macu supports: OpenCode, Claude Code, Codex.\n' +
      'Run one of these tools first so there is usage data to analyze.'
    );
    process.exit(1);
  }

  const sources = sourceFilter
    ? detected.filter((s) => s.name.toLowerCase().startsWith(sourceFilter.toLowerCase()))
    : detected;

  if (sources.length === 0) {
    console.error(`No data source matching "${sourceFilter}". Detected: ${detected.map((s) => s.name).join(', ')}`);
    process.exit(1);
  }

  const data = loadAll(sources, days);
  const result = analyze(data, days);

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  render(result, sources.map((s) => s.name));
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') flags.help = true;
    else if (arg === '--json') flags.json = true;
    else if (arg === '--days' && argv[i + 1]) flags.days = argv[++i];
    else if (arg === '--source' && argv[i + 1]) flags.source = argv[++i];
  }
  return flags;
}
