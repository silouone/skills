# Wiring blast-radius

No settings hooks or permissions are needed beyond loading the mod. Keep the Python floor
(`hooks/pre_tool_use.py`) wired as it is: it still blocks first; this mod only asks about what
the floor lets through.

Load it in every session by adding its folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block
of `~/.claude/settings.json` (path-list separator `:` on macOS; append to any existing value,
e.g. after `~/.claude/mods/cache-tax`):

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/cache-tax:~/.claude/mods/blast-radius"
  }
}
```

Headless runs (`claude -p`, CI pipelines) are observe-only: nothing is asked or denied, matches
are logged to the plugin store (`blast-radius.log`). If an SDK host attaches a surface and the
mod starts denying there, turn it off for that process only:

```json
{ "env": { "BLAST_RADIUS": "off" } }
```

(set in the SDK run's environment, not in the global `settings.json`).
