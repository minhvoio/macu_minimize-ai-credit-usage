#!/usr/bin/env python3
"""claude-usage - Show Claude Code OAuth usage limits with colored terminal bars.

Reads credentials from macOS Keychain, calls the Anthropic OAuth usage API,
and displays 5h/weekly utilization with colored progress bars.

Requires: macOS, Python 3, curl, Claude Code logged in.
"""

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

HOME = Path.home()

# Cache (shared with OMC HUD if present)
CACHE_DIR = HOME / ".claude" / "plugins" / "oh-my-claudecode"
CACHE_FILE = CACHE_DIR / ".usage-cache.json"
CACHE_TTL_MS = 90_000

# API
API_TIMEOUT_S = 10
KEYCHAIN_SVC = "Claude Code-credentials"

# Terminal colors
RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
RED = "\033[31m"
CYAN = "\033[36m"


# ── Credentials ───────────────────────────────────────────


def read_keychain_credentials():
    """Read OAuth credentials from macOS Keychain."""
    try:
        result = subprocess.run(
            ["/usr/bin/security", "find-generic-password", "-s", KEYCHAIN_SVC, "-w"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        raw = result.stdout.strip()
        if not raw:
            return None
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return None
        creds = parsed.get("claudeAiOauth", parsed)
        access_token = creds.get("accessToken", "")
        if not access_token:
            return None
        return {
            "accessToken": access_token,
            "expiresAt": creds.get("expiresAt"),
            "refreshToken": creds.get("refreshToken"),
            "source": "keychain",
        }
    except Exception:
        return None


def is_token_expired(creds):
    exp = creds.get("expiresAt")
    if exp is None:
        return False
    return exp <= datetime.now(timezone.utc).timestamp() * 1000


def refresh_access_token(refresh_token):
    """Refresh an expired OAuth access token using the refresh token."""
    client_id = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
    body = (
        f"grant_type=refresh_token&refresh_token={refresh_token}&client_id={client_id}"
    )
    try:
        result = subprocess.run(
            [
                "curl",
                "-s",
                "--max-time",
                str(API_TIMEOUT_S),
                "-X",
                "POST",
                "https://platform.claude.com/v1/oauth/token",
                "-H",
                "Content-Type: application/x-www-form-urlencoded",
                "-d",
                body,
            ],
            capture_output=True,
            text=True,
            timeout=API_TIMEOUT_S + 2,
        )
        if result.returncode == 0 and result.stdout.strip():
            parsed = json.loads(result.stdout.strip())
            if parsed.get("access_token"):
                return {
                    "accessToken": parsed["access_token"],
                    "refreshToken": parsed.get("refresh_token", refresh_token),
                    "expiresAt": (
                        int(datetime.now(timezone.utc).timestamp() * 1000)
                        + parsed.get("expires_in", 3600) * 1000
                    ),
                }
    except Exception:
        pass
    return None


# ── API ───────────────────────────────────────────────────


def fetch_usage(access_token):
    """Call the Anthropic OAuth usage API using curl (avoids SSL issues on macOS)."""
    try:
        result = subprocess.run(
            [
                "curl",
                "-s",
                "--max-time",
                str(API_TIMEOUT_S),
                "https://api.anthropic.com/api/oauth/usage",
                "-H",
                f"Authorization: Bearer {access_token}",
                "-H",
                "anthropic-beta: oauth-2025-04-20",
            ],
            capture_output=True,
            text=True,
            timeout=API_TIMEOUT_S + 2,
        )
        if result.returncode == 0 and result.stdout.strip():
            return json.loads(result.stdout.strip())
    except Exception:
        pass
    return None


# ── Parsing ───────────────────────────────────────────────


def clamp(v):
    if v is None:
        return None
    return min(100.0, max(0.0, float(v)))


def parse_usage(raw):
    fh = raw.get("five_hour") or {}
    sd = raw.get("seven_day") or {}
    sn = raw.get("seven_day_sonnet") or {}
    op = raw.get("seven_day_opus") or {}
    ex = raw.get("extra_usage") or {}

    return {
        "fiveHourPercent": clamp(fh.get("utilization")),
        "fiveHourResetsAt": fh.get("resets_at"),
        "weeklyPercent": clamp(sd.get("utilization"))
        if sd.get("utilization") is not None
        else None,
        "weeklyResetsAt": sd.get("resets_at"),
        "sonnetWeeklyPercent": clamp(sn.get("utilization"))
        if sn.get("utilization") is not None
        else None,
        "sonnetWeeklyResetsAt": sn.get("resets_at"),
        "opusWeeklyPercent": clamp(op.get("utilization"))
        if op.get("utilization") is not None
        else None,
        "opusWeeklyResetsAt": op.get("resets_at"),
        "extraUsedCredits": ex.get("used_credits"),
        "extraMonthlyLimit": ex.get("monthly_limit"),
        "extraEnabled": ex.get("is_enabled"),
    }


# ── Cache ─────────────────────────────────────────────────


def read_cache():
    try:
        if CACHE_FILE.exists():
            return json.loads(CACHE_FILE.read_text())
    except Exception:
        pass
    return None


def is_cache_valid(cache, token_prefix=None):
    if not cache or cache.get("error"):
        return False
    if (
        token_prefix
        and cache.get("tokenPrefix")
        and cache["tokenPrefix"] != token_prefix
    ):
        return False
    age_ms = datetime.now(timezone.utc).timestamp() * 1000 - cache.get("timestamp", 0)
    return age_ms < CACHE_TTL_MS


def write_cache(data, token_prefix=None):
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        entry = {
            "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
            "data": data,
            "error": False,
            "source": "anthropic",
            "tokenPrefix": token_prefix,
            "lastSuccessAt": int(datetime.now(timezone.utc).timestamp() * 1000),
        }
        with open(CACHE_FILE, "w") as f:
            json.dump(entry, f, indent=2)
    except Exception:
        pass


# ── Rendering ─────────────────────────────────────────────


def bar(pct, width=20):
    if pct is None:
        return DIM + "░" * width + RESET
    filled = round(pct / 100 * width)
    return GREEN + "█" * filled + DIM + "░" * (width - filled) + RESET


def pct_color(pct):
    if pct is None:
        return DIM
    if pct >= 90:
        return RED
    if pct >= 70:
        return YELLOW
    return GREEN


def time_until(reset_at):
    if not reset_at:
        return "?"
    try:
        dt = datetime.fromisoformat(
            reset_at.replace("Z", "+00:00").replace("+00:00", "")
        ).replace(tzinfo=None)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        diff = dt - now
        if diff.total_seconds() <= 0:
            return "reset now"
        minutes = int(diff.total_seconds() // 60)
        h, m = divmod(minutes, 60)
        d = h // 24
        h = h % 24
        if d > 0:
            return f"{d}d{h}h"
        return f"{h}h{m:02d}m"
    except Exception:
        return "?"


def format_limits(data, account_label=None):
    fh_pct = data.get("fiveHourPercent", 0) or 0
    sd_pct = data.get("weeklyPercent")

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    label_str = f"  ({BOLD}{account_label}{RESET})" if account_label else ""

    print()
    print(f"  {BOLD}Claude Code Usage{RESET}{label_str}  -  {now_str}")
    print(f"  {'─' * 55}")

    # 5-hour limit
    fh_reset = time_until(data.get("fiveHourResetsAt") or "")
    fh_c = pct_color(fh_pct)
    print(
        f"  {BOLD}5h limit{RESET}   {bar(fh_pct, 20)}  "
        f"{fh_c}{fh_pct:>5.1f}%{RESET}  resets in {fh_c}{fh_reset}{RESET}"
    )

    # Weekly limit
    if sd_pct is not None:
        wk_reset = time_until(data.get("weeklyResetsAt") or "")
        wk_c = pct_color(sd_pct)
        print(
            f"  {BOLD}Weekly{RESET}     {bar(sd_pct, 20)}  "
            f"{wk_c}{sd_pct:>5.1f}%{RESET}  resets in {wk_c}{wk_reset}{RESET}"
        )

    # Sonnet weekly
    sn_pct = data.get("sonnetWeeklyPercent")
    if sn_pct is not None:
        sn_reset = time_until(data.get("sonnetWeeklyResetsAt") or "")
        sn_c = pct_color(sn_pct)
        print(
            f"  {BOLD}Sonnet wk{RESET}  {bar(sn_pct, 20)}  "
            f"{sn_c}{sn_pct:>5.1f}%{RESET}  resets in {sn_c}{sn_reset}{RESET}"
        )

    # Opus weekly
    op_pct = data.get("opusWeeklyPercent")
    if op_pct is not None:
        op_reset = time_until(data.get("opusWeeklyResetsAt") or "")
        op_c = pct_color(op_pct)
        print(
            f"  {BOLD}Opus wk{RESET}    {bar(op_pct, 20)}  "
            f"{op_c}{op_pct:>5.1f}%{RESET}  resets in {op_c}{op_reset}{RESET}"
        )

    # Extra credits
    ex_en = data.get("extraEnabled")
    ex_cred = data.get("extraUsedCredits")
    if ex_en and ex_cred is not None:
        print(f"  {BOLD}Extra crd{RESET}  {DIM}{ex_cred:>8.1f} credits used{RESET}")

    print()


# ── Main ──────────────────────────────────────────────────


def main():
    args = sys.argv[1:]
    as_json = "--json" in args

    # Read credentials from keychain
    creds = read_keychain_credentials()
    if not creds or not creds.get("accessToken"):
        print("Error: No Claude Code credentials found.", file=sys.stderr)
        print("Make sure Claude Code is logged in (run: claude)", file=sys.stderr)
        sys.exit(1)

    # Check token expiration
    if is_token_expired(creds):
        if creds.get("refreshToken"):
            refreshed = refresh_access_token(creds["refreshToken"])
            if refreshed:
                creds.update(refreshed)
            else:
                print(
                    "Error: Token expired and refresh failed. Re-login to Claude Code.",
                    file=sys.stderr,
                )
                sys.exit(1)

    token_prefix = (creds.get("accessToken") or "")[:16]

    # Try cache first
    cache = read_cache()
    if (
        cache
        and is_cache_valid(cache, token_prefix)
        and not cache.get("error")
        and cache.get("data")
    ):
        data = cache["data"]
        if as_json:
            print(json.dumps(data))
        else:
            format_limits(data)
        return

    # Fetch fresh
    raw = fetch_usage(creds["accessToken"])
    if not raw:
        if cache and cache.get("data"):
            data = cache["data"]
            sys.stderr.write("[stale] ")
            if as_json:
                print(json.dumps(data))
            else:
                format_limits(data)
        else:
            print("Error: Could not reach Anthropic API.", file=sys.stderr)
            sys.exit(1)
        return

    data = parse_usage(raw)
    write_cache(data, token_prefix)

    if as_json:
        print(json.dumps(data))
    else:
        format_limits(data)


if __name__ == "__main__":
    main()
