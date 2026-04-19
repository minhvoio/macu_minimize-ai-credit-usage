#!/bin/bash
set -e

BOLD="\033[1m"
DIM="\033[2m"
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
MAGENTA="\033[35m"
RESET="\033[0m"

ASK_COMPANION="auto"
for arg in "$@"; do
  case "$arg" in
    -y|--yes)           ASK_COMPANION="yes" ;;
    --no-companion)     ASK_COMPANION="no" ;;
    --with-companion)   ASK_COMPANION="yes" ;;
  esac
done
[ "${INSTALL_COMPANION:-}" = "yes" ] && ASK_COMPANION="yes"
[ "${INSTALL_COMPANION:-}" = "no" ]  && ASK_COMPANION="no"

echo ""
echo -e "${CYAN}${BOLD}  macu${RESET}${DIM} - Minimize AI Credit Usage${RESET}"
echo -e "${DIM}  ────────────────────────────────────────${RESET}"
echo ""

# ── Prerequisites ─────────────────────────────────────

if ! command -v node &>/dev/null; then
  echo -e "${RED}  ✗ Node.js not found.${RESET} Install it: https://nodejs.org"
  exit 1
fi

NODE_MAJOR=$(node -v | cut -d. -f1 | tr -d 'v')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo -e "${RED}  ✗ Node.js >= 18 required.${RESET} Found: $(node -v)"
  exit 1
fi

if ! command -v npm &>/dev/null; then
  echo -e "${RED}  ✗ npm not found.${RESET}"
  exit 1
fi

echo -e "${GREEN}  ✓${RESET} Node.js $(node -v)"
echo -e "${GREEN}  ✓${RESET} npm $(npm -v)"

# ── Install macu ──────────────────────────────────────

echo ""
echo -e "${BOLD}  Installing macu...${RESET}"

npm install -g @minagents/macu 2>/dev/null || {
  echo -e "${YELLOW}  npm registry install failed. Installing from GitHub...${RESET}"
  npm install -g github:minhvoio/macu_minimize-ai-credit-usage 2>/dev/null || {
    echo -e "${RED}  ✗ Installation failed.${RESET}"
    echo -e "${DIM}  Try manually: npm install -g @minagents/macu${RESET}"
    exit 1
  }
}

if command -v macu &>/dev/null; then
  echo -e "${GREEN}  ✓${RESET} macu installed → $(which macu)"
else
  echo -e "${RED}  ✗ macu not found in PATH after install.${RESET}"
  exit 1
fi

# ── Companion: ai-usage-monitors (cu + cou) ───────────

NPM_PREFIX=$(npm config get prefix 2>/dev/null || echo "")
COMPANION_INSTALLED="no"
if [ -n "$NPM_PREFIX" ] && [ -L "$NPM_PREFIX/bin/cou" ] && [ -L "$NPM_PREFIX/bin/cu" ]; then
  COMPANION_INSTALLED="yes"
fi

if [ "$COMPANION_INSTALLED" = "yes" ]; then
  echo ""
  echo -e "${DIM}  Companion already installed: cu + cou in npm global prefix.${RESET}"
else
  echo ""
  echo -e "${MAGENTA}${BOLD}  ━━━ Companion tool: ai-usage-monitors ━━━${RESET}"
  echo ""
  echo -e "${DIM}  macu finds historical waste. The companion shows LIVE usage:${RESET}"
  echo -e "${DIM}  how much of your 5h/weekly window you've already burned through.${RESET}"
  echo ""
  echo -e "${DIM}    \$ cu${RESET}"
  echo -e "${BOLD}    Claude Code Usage${RESET}${DIM}  -  now${RESET}"
  echo -e "    ${BOLD}5h limit${RESET}   ${GREEN}██████████${DIM}░░░░░░░░░░${RESET}  ${YELLOW}51.0%${RESET}  resets in ${YELLOW}2h46m${RESET}"
  echo -e "    ${BOLD}Weekly${RESET}     ${GREEN}████${DIM}░░░░░░░░░░░░░░░░${RESET}  ${GREEN}21.0%${RESET}  resets in ${GREEN}5d20h${RESET}"
  echo ""
  echo -e "${DIM}    \$ cou${RESET}"
  echo -e "${BOLD}    Codex CLI Usage${RESET}${DIM}  (team / premium)${RESET}"
  echo -e "    ${BOLD}5h window${RESET}  ${GREEN}██${DIM}░░░░░░░░░░░░░░░░░░${RESET}  ${GREEN} 8.5%${RESET}  resets in ${GREEN}4h12m${RESET}"
  echo -e "    ${BOLD}7d window${RESET}  ${GREEN}█${DIM}░░░░░░░░░░░░░░░░░░░${RESET}  ${GREEN} 3.2%${RESET}  resets in ${GREEN}5d18h${RESET}"
  echo ""

  if [ "$ASK_COMPANION" = "auto" ]; then
    if { exec 3< /dev/tty; } 2>/dev/null; then
      printf "  ${BOLD}Install cu + cou too?${RESET} ${DIM}[Y/n]${RESET} "
      read -r answer <&3 || answer=""
      exec 3<&-
      case "$answer" in
        n|N|no|NO) ASK_COMPANION="no" ;;
        *)         ASK_COMPANION="yes" ;;
      esac
    else
      echo -e "${DIM}  Non-interactive install (piped). Skipping companion prompt.${RESET}"
      echo -e "${DIM}  Install cu + cou later:${RESET}"
      echo -e "${DIM}    curl -fsSL https://raw.githubusercontent.com/minhvoio/ai-usage-monitors/main/install.sh | bash${RESET}"
      echo -e "${DIM}  Or rerun this with --yes to install both at once.${RESET}"
      ASK_COMPANION="no"
    fi
  fi

  if [ "$ASK_COMPANION" = "yes" ]; then
    echo ""
    echo -e "${BOLD}  Installing ai-usage-monitors...${RESET}"

    if ! command -v python3 &>/dev/null; then
      echo -e "${YELLOW}  ⚠${RESET} Python 3 not found. cu/cou need Python 3 to run."
      echo -e "${DIM}    macOS: brew install python3${RESET}"
      echo -e "${DIM}    Linux: apt install python3${RESET}"
    fi

    npm install -g github:minhvoio/ai-usage-monitors 2>/dev/null || {
      echo -e "${RED}  ✗ Companion install failed.${RESET}"
      echo -e "${DIM}  Try manually: npm install -g github:minhvoio/ai-usage-monitors${RESET}"
    }

    if [ -L "$NPM_PREFIX/bin/cu" ]; then
      echo -e "${GREEN}  ✓${RESET} cu  → $NPM_PREFIX/bin/cu"
    fi
    if [ -L "$NPM_PREFIX/bin/cou" ]; then
      echo -e "${GREEN}  ✓${RESET} cou → $NPM_PREFIX/bin/cou"
    fi

    if [ "$(uname)" != "Darwin" ]; then
      echo -e "${DIM}  Note: cu is macOS-only (reads Keychain). cou works here.${RESET}"
    fi

    case ":$PATH:" in
      *":$NPM_PREFIX/bin:"*) ;;
      *) echo -e "${YELLOW}  ⚠${RESET} $NPM_PREFIX/bin is not in PATH. Add it so cu/cou can be found."
         echo -e "${DIM}     Also, on macOS /usr/bin/cu (a built-in modem tool) may shadow ours${RESET}"
         echo -e "${DIM}     if npm prefix comes later in PATH. Put it first.${RESET}" ;;
    esac
  else
    echo -e "${DIM}  Skipped. Install later:${RESET}"
    echo -e "${DIM}    curl -fsSL https://raw.githubusercontent.com/minhvoio/ai-usage-monitors/main/install.sh | bash${RESET}"
  fi
fi

# ── Done ──────────────────────────────────────────────

echo ""
echo -e "${DIM}  ────────────────────────────────────────${RESET}"
echo -e "${GREEN}${BOLD}  Done.${RESET} Run:"
echo ""
echo -e "    ${CYAN}macu${RESET}          Analyze tool usage + optimize tokens"
echo -e "    ${CYAN}macu --days 30${RESET} Last 30 days only"
if [ -n "$NPM_PREFIX" ] && [ -L "$NPM_PREFIX/bin/cu" ]; then
  echo -e "    ${CYAN}cu${RESET}            Live Claude Code subscription usage"
fi
if [ -n "$NPM_PREFIX" ] && [ -L "$NPM_PREFIX/bin/cou" ]; then
  echo -e "    ${CYAN}cou${RESET}           Live Codex CLI subscription usage"
fi
echo ""
