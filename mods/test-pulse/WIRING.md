# Wiring test-pulse

No settings hooks, permissions or `settings.json` edits are needed beyond loading the mod.

Load it in every session by adding its folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block
of `~/.claude/settings.json` (path-list separator `:` on macOS; append to any existing value,
e.g. `"~/.claude/mods/cache-tax:~/.claude/mods/test-pulse"`):

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/test-pulse"
  }
}
```

It is headless-safe: under `claude -p` / SDK runs (e.g. CI pipelines) it only records runs in session
state; no status line, toasts or pane. It has no `userConfig` options.
