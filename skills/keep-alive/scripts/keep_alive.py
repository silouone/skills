#!/usr/bin/env python3
"""keep-alive: keep a Claude Code session's prompt cache warm while you're away.

A launchd job ticks every few minutes. When the session has been idle for
`--every` minutes, it sends one headless ping that resumes a *fork* of the
session (so the real transcript is never touched):

    claude -p --resume <id> --fork-session --model <same> "Reply with a single period."

The fork shares the session's prompt prefix, so the ping is a cache read, and a
cache read restarts the cache's lifetime. Each ping's usage is checked: if it
read < 50% of its input from cache, the cache was already cold, so the job
stops and says so instead of paying for cold re-reads.

    keep_alive.py start HOURS [--every MIN] [--session ID]
    keep_alive.py status
    keep_alive.py stop [--session ID | --all]
    keep_alive.py ping ID        # what launchd runs; safe to run by hand
"""
from __future__ import annotations

import argparse
import json
import os
import plistlib
import shutil
import subprocess
import sys
import time
from pathlib import Path

PROMPT = "Reply with a single period."
MIN_SHARE = 0.5
TICK_MIN = 5
CLAUDE_DIR = Path(os.environ.get("CLAUDE_CONFIG_DIR", Path.home() / ".claude"))
STATE_DIR = CLAUDE_DIR / "keep-alive"
AGENTS_DIR = Path.home() / "Library" / "LaunchAgents"


# ---- pure -------------------------------------------------------------------

def label_of(session: str) -> str:
    return f"com.claude.keep-alive.{session}"


def is_due(now: float, last_touch: float, every_s: float) -> bool:
    """Ping once the cache has gone `every_s` without being read."""
    return now - last_touch >= every_s


def cache_share(usage: dict) -> float:
    """cache_read / (input + cache_read + cache_creation); 0 when nothing was sent."""
    read = usage.get("cache_read_input_tokens", 0)
    total = usage.get("input_tokens", 0) + read + usage.get("cache_creation_input_tokens", 0)
    return read / total if total else 0.0


def tick_s(every_min: float) -> int:
    return int(min(TICK_MIN, every_min) * 60)


def plist_for(session: str, script: str, python: str, every_min: float, log: str, path_env: str) -> dict:
    return {
        "Label": label_of(session),
        "ProgramArguments": [python, script, "ping", session],
        "StartInterval": tick_s(every_min),
        "RunAtLoad": False,
        "StandardOutPath": log,
        "StandardErrorPath": log,
        # No spoken recap from the ping's Stop hook (llm-voice-loop honours this).
        "EnvironmentVariables": {"PATH": path_env, "HOME": str(Path.home()), "HIGGS_TTS_ENABLED": "0"},
    }


def session_facts(lines) -> tuple[str | None, str | None]:
    """First cwd (where the session started, which --resume needs) and last real model."""
    cwd = model = None
    for line in lines:
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        cwd = cwd or entry.get("cwd")
        m = (entry.get("message") or {}).get("model") if isinstance(entry.get("message"), dict) else None
        if m and not m.startswith("<"):
            model = m
    return cwd, model


# ---- effects ----------------------------------------------------------------

def die(msg: str) -> None:
    sys.exit(f"keep-alive: {msg}")


def log(msg: str) -> None:
    print(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}", flush=True)


def notify(msg: str) -> None:
    subprocess.run(["osascript", "-e", f"display notification {json.dumps(msg)} with title \"keep-alive\""], check=False)


def state_path(session: str) -> Path:
    return STATE_DIR / f"{session}.json"


def plist_path(session: str) -> Path:
    return AGENTS_DIR / f"{label_of(session)}.plist"


def read_state(session: str) -> dict:
    p = state_path(session)
    if not p.exists():
        die(f"no keep-alive running for session {session}")
    return json.loads(p.read_text())


def write_state(state: dict) -> None:
    state_path(state["session"]).write_text(json.dumps(state, indent=2))


def find_transcript(session: str) -> Path:
    hits = list((CLAUDE_DIR / "projects").glob(f"*/{session}.jsonl"))
    if not hits:
        die(f"no transcript found for session {session} under {CLAUDE_DIR / 'projects'}")
    return hits[0]


def launchctl(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["launchctl", *args], capture_output=True, text=True)


def unload(session: str) -> None:
    plist_path(session).unlink(missing_ok=True)
    launchctl("bootout", f"gui/{os.getuid()}/{label_of(session)}")  # may kill this process: keep last


def stop(session: str, reason: str, notice: str | None = None) -> None:
    # Unload LAST: from inside a ping, bootout kills this very process.
    state_path(session).unlink(missing_ok=True)
    log(f"stopped: {reason}")
    if notice:
        notify(notice)
    unload(session)


def start(hours: float, every_min: float, session: str) -> None:
    if hours <= 0:
        die(f"HOURS must be > 0 (got {hours})")
    if every_min < 1:
        die(f"--every must be >= 1 minute (got {every_min})")
    claude = shutil.which("claude")
    if claude is None:
        die("`claude` is not on PATH")
    transcript = find_transcript(session)
    with transcript.open() as f:
        cwd, model = session_facts(f)
    if cwd is None or model is None:
        die(f"could not read cwd/model from {transcript}")

    STATE_DIR.mkdir(parents=True, exist_ok=True)
    AGENTS_DIR.mkdir(parents=True, exist_ok=True)
    now = time.time()
    write_state({
        "session": session, "transcript": str(transcript), "cwd": cwd, "model": model,
        "claude": claude, "every_min": every_min, "deadline": now + hours * 3600,
        "last_ping": None, "pings": 0, "last_share": None,
    })
    unload(session)
    log_file = STATE_DIR / f"{session}.log"
    plist = plist_for(session, str(Path(__file__).resolve()), sys.executable, every_min, str(log_file),
                      os.environ.get("PATH", "/usr/bin:/bin"))
    with plist_path(session).open("wb") as f:
        plistlib.dump(plist, f)
    r = launchctl("bootstrap", f"gui/{os.getuid()}", str(plist_path(session)))
    if r.returncode != 0:
        state_path(session).unlink(missing_ok=True)
        die(f"launchctl bootstrap failed for {label_of(session)}: {r.stderr.strip()}")

    pings = int(hours * 60 // every_min)
    print(f"keep-alive on for {hours:g}h: session {session} ({model}, {cwd})")
    print(f"  a ping once the session has been idle {every_min:g} min (checked every {tick_s(every_min) // 60} min), ~{pings} pings max")
    print(f"  log: {log_file}")
    print("  stop: keep_alive.py stop   |   status: keep_alive.py status")


def ping(session: str) -> None:
    state = read_state(session)
    now = time.time()
    if now >= state["deadline"]:
        stop(session, f"duration reached after {state['pings']} pings",
             f"keep-alive done: {state['pings']} pings; the cache will now go cold")
        return
    transcript = Path(state["transcript"])
    if not transcript.exists():
        stop(session, f"transcript {transcript} is gone", "keep-alive stopped: session transcript is gone")
        return
    last_touch = max(transcript.stat().st_mtime, state["last_ping"] or 0)
    if not is_due(now, last_touch, state["every_min"] * 60):
        return

    r = subprocess.run(
        [state["claude"], "-p", "--resume", session, "--fork-session", "--model", state["model"],
         "--output-format", "json", PROMPT],
        cwd=state["cwd"], capture_output=True, text=True, timeout=300,
    )
    try:
        out = json.loads(r.stdout)
    except ValueError:
        stop(session, f"ping failed (exit {r.returncode}): {(r.stderr or r.stdout).strip()[-300:]}",
             "keep-alive stopped: ping failed (see log)")
        return

    fork = out.get("session_id")
    if fork and fork != session:
        (transcript.parent / f"{fork}.jsonl").unlink(missing_ok=True)

    share = cache_share(out.get("usage") or {})
    state.update(last_ping=time.time(), pings=state["pings"] + 1, last_share=share)
    write_state(state)
    log(f"ping {state['pings']}: cache share {share:.0%}, usage {json.dumps(out.get('usage'))}")

    if out.get("is_error") or share < MIN_SHARE:
        why = "ping returned an error" if out.get("is_error") else \
            f"ping read only {share:.0%} from cache (already cold; try a smaller --every)"
        stop(session, why, f"keep-alive stopped: {why}")


def status() -> None:
    states = sorted(STATE_DIR.glob("*.json")) if STATE_DIR.exists() else []
    if not states:
        print("keep-alive: nothing running")
        return
    for p in states:
        s = json.loads(p.read_text())
        loaded = launchctl("print", f"gui/{os.getuid()}/{label_of(s['session'])}").returncode == 0
        left = max(0, s["deadline"] - time.time()) / 60
        share = "-" if s["last_share"] is None else f"{s['last_share']:.0%}"
        print(f"{s['session']}  {'loaded' if loaded else 'NOT LOADED'}  {left:.0f} min left  "
              f"pings {s['pings']}  last share {share}  every {s['every_min']:g} min  {s['cwd']}")


def main(argv: list[str]) -> None:
    ap = argparse.ArgumentParser(prog="keep_alive.py", description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    env_session = os.environ.get("CLAUDE_CODE_SESSION_ID")

    s = sub.add_parser("start")
    s.add_argument("hours", type=float)
    s.add_argument("--every", type=float, default=55, help="idle minutes before a ping (default 55)")
    s.add_argument("--session", default=env_session)
    sub.add_parser("status")
    t = sub.add_parser("stop")
    t.add_argument("--session", default=env_session)
    t.add_argument("--all", action="store_true")
    p = sub.add_parser("ping")
    p.add_argument("session")

    a = ap.parse_args(argv)
    if a.cmd == "start":
        if not a.session:
            die("no session: run inside Claude Code (CLAUDE_CODE_SESSION_ID) or pass --session")
        start(a.hours, a.every, a.session)
    elif a.cmd == "status":
        status()
    elif a.cmd == "stop":
        targets = [p.stem for p in STATE_DIR.glob("*.json")] if a.all else [a.session]
        if not all(targets):
            die("no session: pass --session or --all")
        for sid in targets:
            stop(sid, "stopped by hand")
            print(f"keep-alive off: {sid}")
    else:
        ping(a.session)


if __name__ == "__main__":
    main(sys.argv[1:])
