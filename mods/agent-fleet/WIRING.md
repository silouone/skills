# Wiring agent-fleet

Loading the mod is all it needs: no settings hooks, permissions or `userConfig`.

To load it in every session, add its folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block
of `~/.claude/settings.json`. On macOS the separator is `:`, so append to any existing value,
e.g. alongside cache-tax:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/cache-tax:~/.claude/mods/agent-fleet"
  }
}
```

It is safe to load headless. Under `claude -p` / SDK runs (e.g. CI pipelines) it only records the
roster in `$.state`: no status line, toasts or pane, and `/fleet` still prints its table.
