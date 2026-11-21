# Wiring cache-tax

No settings hooks, permissions or `settings.json` edits are needed beyond loading the mod.

Load it in every session by adding its folder, as an absolute path, to `CLAUDE_CODE_PLUGIN_DIRS`
in the `env` block of `~/.claude/settings.json` (path-list separator `:` on macOS and Linux;
append to any existing value):

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "/absolute/path/to/mods/cache-tax"
  }
}
```

It is headless-safe: under `claude -p` / SDK runs (e.g. CI pipelines) it only records turns to its store.

Handoff documents go to `~/.claude/handoffs/` and hold conversation content: if `~/.claude` is
under version control, add `handoffs/` to its `.gitignore`.

Optional settings (defaults shown), same file:

```json
{
  "pluginConfigs": {
    "cache-tax": {
      "options": {
        "cacheLifetimeMinutes": 60,
        "safetyMarginMinutes": 5,
        "warnTokenThreshold": 20000,
        "keepWarmMaxRefreshes": 6,
        "keepWarmDefault": false,
        "autoHandoff": true,
        "lowContextPercent": 5
      }
    }
  }
}
```
