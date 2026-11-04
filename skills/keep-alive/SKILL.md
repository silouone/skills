---
name: keep-alive
description: "Keep this session's prompt cache warm for N hours while you're away — a scheduled one-token ping, so the next prompt doesn't re-read the whole context uncached."
disable-model-invocation: true
argument-hint: "HOURS | status | stop"
---

# Keep-alive

The session itself never expires — you can `--resume` it days later. What expires is the **prompt cache**: after about an hour idle, the next prompt re-reads the whole context uncached (slow, and on a rate-limited plan, expensive). This skill pings the session just before that happens, for as long as you ask.

How a ping works, all in [`scripts/keep_alive.py`](scripts/keep_alive.py):

- A macOS **launchd** job checks every 5 min (no sleep loop). Once the session has been idle `--every` minutes (default 55), it runs `claude -p --resume <id> --fork-session --model <same> "Reply with a single period."`
- `--fork-session` resumes a **copy**: the real transcript gets nothing, and the copy's file is deleted after the ping. The copy starts with the same content as the session, so the ping reads the same cache, and each read restarts the cache's lifetime.
- Every ping checks its own usage. If it read **< 50 %** of its input from cache, the cache was already cold: the job stops and posts a macOS notification instead of paying for cold re-reads. Errors stop it the same way.
- Real activity in the session counts as a touch, so no pings fire while you're working.
- The ping turns the spoken recap off (`HIGGS_TTS_ENABLED=0`).

**Runtime:** Claude Code on macOS only. It needs `claude` on `PATH`, `launchctl` and `CLAUDE_CODE_SESSION_ID` (Claude Code sets it in the shell). Codex has no equivalent: no headless resume-and-fork of the current session.

## Steps

`S` is this skill's `scripts/keep_alive.py`. Run it with `python3`.

1. **Parse `$ARGUMENTS`.**
   - A number → hours. Go to step 2.
   - `status` → run `python3 S status`, show the output, done.
   - `stop` → run `python3 S stop`, show the output, done.
   - Empty or anything else → reply `Usage: /keep-alive HOURS | status | stop  (e.g. /keep-alive 3)`, done.
   *Done when:* exactly one branch has run.
2. **Start.** Run `python3 S start <hours>`, and add `--every <min>` only if the user gave one. Show its output as is.
   *Done when:* the output has a `keep-alive on for …` line, or the script's `keep-alive: …` error has been reported to the user word for word. Don't retry or work around a failure.
3. **Report the cost.** Tell the user, in one line, that each ping re-reads the current context from cache (about as many tokens as the context holds). Pinging is only worth it if they come back before the pings add up to more than one cold re-read. Also: the Mac must stay awake, because a sleeping Mac runs no timers.
   *Done when:* that line has been said.

## Reference

- `python3 S status`: every running keep-alive, with time left, ping count and the last ping's cache share.
- `python3 S stop --all`: stop every keep-alive. A keep-alive also stops on its own at the deadline, on a cold ping or on an error.
- Per-session state, a log of every ping's usage, and the launchd plist: `~/.claude/keep-alive/<session>.{json,log}` and `~/Library/LaunchAgents/com.claude.keep-alive.<session>.plist`.
- Tests for the pure parts: `python3 -m unittest discover -s skills/keep-alive/scripts`.
