# turn-receipt — wiring

Nothing in `settings.json` is required to try it. Pick one:

## A. One session (try it tomorrow)

```bash
claude --plugin-dir ~/.claude/mods/turn-receipt
```

## B. Every session (needs the person's approval; back up settings first)

```bash
cp ~/.claude/settings.json ~/.claude/settings.json.bak-turn-receipt
```

Add the folder to the `env` block of `~/.claude/settings.json`. `CLAUDE_CODE_PLUGIN_DIRS` is one
variable shared by every mod, separated by `:` on macOS. If other mods are already listed, append this folder;
do not replace them:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/turn-receipt"
  }
}
```

Example with other mods: `"~/.claude/mods/cache-tax:~/.claude/mods/turn-receipt"`.

Headless runs (`claude -p`, SDK, CI pipelines) load it too and it does nothing there: no git calls,
no appended rows, no status, no timer.

## Not part of this wiring (separate human decision)

Trimming the "Ordered Tool Calls" and "Git Diff Reporting" sections of
`output-styles/observable-tools-diffs-tts.md` (active via `"outputStyle": "Observable: Tools + Diffs + TTS"`).
Do it only after the receipt has proven itself in real sessions. See README.md, "Follow-up".
