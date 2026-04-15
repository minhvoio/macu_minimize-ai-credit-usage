#!/bin/bash
set -e

BOLD="\033[1m"
DIM="\033[2m"
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

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

npm install -g macu 2>/dev/null || {
  echo -e "${YELLOW}  npm registry install failed. Installing from GitHub...${RESET}"
  npm install -g github:minhvoio/macu_minimize-ai-credit-usage 2>/dev/null || {
    echo -e "${RED}  ✗ Installation failed.${RESET}"
    echo -e "${DIM}  Try manually: npm install -g github:minhvoio/macu_minimize-ai-credit-usage${RESET}"
    exit 1
  }
}

if command -v macu &>/dev/null; then
  echo -e "${GREEN}  ✓${RESET} macu installed → $(which macu)"
else
  echo -e "${RED}  ✗ macu not found in PATH after install.${RESET}"
  exit 1
fi

# ── Optional: Claude Usage (cu) ───────────────────────

echo ""
echo -e "${BOLD}  Optional: Claude Code Usage Monitor${RESET}"
echo -e "${DIM}  The ${RESET}cu${DIM} command shows live Claude Code subscription limits${RESET}"
echo -e "${DIM}  (5h/weekly utilization with colored bars and reset timers).${RESET}"
echo -e "${DIM}  Requires: macOS + Claude Code logged in.${RESET}"
echo ""

if [ "$(uname)" != "Darwin" ]; then
  echo -e "${DIM}  Skipped - cu requires macOS (detected: $(uname)).${RESET}"
else
  if command -v cu &>/dev/null; then
    echo -e "${GREEN}  ✓${RESET} cu already installed → $(which cu)"
  else
    # cu is bundled with macu, should already be linked
    if command -v cu &>/dev/null; then
      echo -e "${GREEN}  ✓${RESET} cu installed → $(which cu)"
    else
      echo -e "${YELLOW}  ℹ${RESET} cu is bundled with macu but may need Python 3 + curl."
      echo -e "${DIM}    Test it: cu${RESET}"
    fi
  fi

  # Verify Python 3 for cu
  if command -v python3 &>/dev/null; then
    echo -e "${GREEN}  ✓${RESET} Python 3 available (needed by cu)"
  else
    echo -e "${YELLOW}  ⚠${RESET} Python 3 not found - cu will not work without it."
  fi
fi

# ── Done ──────────────────────────────────────────────

echo ""
echo -e "${DIM}  ────────────────────────────────────────${RESET}"
echo -e "${GREEN}${BOLD}  Done.${RESET} Run:"
echo ""
echo -e "    ${CYAN}macu${RESET}          Analyze tool usage + optimize tokens"
echo -e "    ${CYAN}macu --days 30${RESET} Last 30 days only"
echo -e "    ${CYAN}cu${RESET}            Claude Code usage limits (macOS)"
echo ""
