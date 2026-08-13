# ponytail-ponytail

Lazy senior dev mode for Claude Code. The best code is the code you never wrote.

A ponytail of [ponytail](https://github.com/DietrichGebert/ponytail): the same
ruleset and the same hooks, with everything that is not Claude Code deleted.

## What was cut

Upstream ships one repo that targets 13 hosts (Cursor, Windsurf, Cline, Kiro,
Qoder, OpenCode, OpenClaw, Codex, Copilot, Gemini CLI, Devin, Grok, Hermes, pi,
plus an MCP server). That is 159 files: 12,366 lines of text and 11 image
assets. Claude Code reads seven of those paths.

| Removed | Why |
|---|---|
| 13 host directories, `pi-extension/`, `ponytail-mcp/`, 6 root manifests | other hosts |
| `benchmarks/`, `examples/`, `docs/`, `assets/`, two translated READMEs | not loaded at runtime |
| `scripts/` | `check-rule-copies.js` and `check-versions.js` existed to keep the 13 copies in sync; the others are npm and OpenClaw publishing |
| `commands/*.toml` | Gemini CLI format, Claude Code ignores it; the skills already register the slash commands |
| `package.json` | the hooks are dependency-free CommonJS, `node --test` runs without it |
| 12 of 15 test files | they covered the deleted hosts |
| `getFallbackInstructions` (33 lines) | a second copy of the ruleset as a string literal, for an npm install path that does not exist here. `skills/` and `hooks/` ship together in a plugin |
| the `isCopilot` / `isCodex` / `isQoder` branches in the hooks | one host, one state directory, one output envelope |
| `ponytail-gain` skill | it printed benchmark medians from `benchmarks/`, which is gone. `/ponytail-debt` and `/ponytail-audit` give the real per-repo numbers |

Result: 23 files, 1,618 lines. 496 of JS across six hooks, 336 of skill
Markdown, 495 of tests, and the rest manifests, README and CI.

Two things changed rather than shrank:

- The `/ponytail` command parser now sees through the plugin namespace, so
  `/ponytail-ponytail:ponytail ultra` (what tab completion inserts) switches the
  mode. Upstream compared against a hardcoded `/ponytail:ponytail`, which stops
  matching the moment the plugin is renamed.
- `PONYTAIL_HIDE_STATUS` now suppresses the statusline setup nudge. The flag was
  read only by the pi extension upstream, so in a Claude Code install it did
  nothing.

## Install

```
/plugin marketplace add dukex/ponytail-ponytail
/plugin install ponytail-ponytail
```

Restart, or run `/reload-plugins`. Ponytail activates on every session start.

Do not install this alongside upstream ponytail. Both inject a full ruleset on
`SessionStart` and both write the same `~/.claude/.ponytail-active` flag.

Installing copies the repo to `~/.claude/plugins/cache/<name>/<name>/<version>/`,
and that cache is keyed by version. Editing the repo changes nothing for an
installed plugin until you bump `version` in `plugin.json`; `claude plugin
update` reports "already at the latest version" and copies nothing. Bump, then
update, then restart.

## Use

| Level | Trigger | Behaviour |
|---|---|---|
| lite | `/ponytail lite` | build what was asked, name the lazier alternative in one line |
| full | `/ponytail` | the ladder enforced: YAGNI, stdlib, native, one line, minimum. Default |
| ultra | `/ponytail ultra` | YAGNI extremist, challenges the requirement before building |

The level sticks until changed or session end. `stop ponytail`, `normal mode`,
or `/ponytail off` reverts. `/ponytail default ultra` persists the level to
config so new sessions start there.

| Skill | Does |
|---|---|
| `/ponytail` | lazy mode itself |
| `/ponytail-review` | over-engineering review of a diff, one line per finding |
| `/ponytail-audit` | the same review across the whole repo, ranked |
| `/ponytail-debt` | harvests every `ponytail:` shortcut comment into a ledger |
| `/ponytail-help` | reference card |

Subagents get the ruleset too, via `SubagentStart`. Scope it with a regex if you
only want some of them:

```bash
export PONYTAIL_SUBAGENT_MATCHER='general|plan'
```

## Statusline badge

The plugin ships a script that prints `[PONYTAIL]` or `[PONYTAIL:ULTRA]` while
ponytail is active. On first session it offers to wire itself up. Manually, in
`~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash \"$HOME/.claude/plugins/ponytail-ponytail/hooks/ponytail-statusline.sh\""
  }
}
```

Windows uses `powershell -ExecutionPolicy Bypass -File "...\ponytail-statusline.ps1"`.
Set `PONYTAIL_HIDE_STATUS=1` to skip the badge and the setup offer.

## Configure

Resolution order: environment variable, then config file, then `full`.

```bash
export PONYTAIL_DEFAULT_MODE=ultra   # off | lite | full | ultra
```

`~/.config/ponytail/config.json` (`%APPDATA%\ponytail\config.json` on Windows):

```json
{ "defaultMode": "lite", "hideStatus": false }
```

`review` is a session mode only, never a valid default.

## Layout

```
.claude-plugin/plugin.json         manifest
.claude-plugin/marketplace.json    so `/plugin marketplace add` works
hooks/hooks.json                   SessionStart, SubagentStart, UserPromptSubmit
                                   (auto-loaded by name, never named in the manifest)
hooks/ponytail-activate.js         writes the flag, injects the ruleset
hooks/ponytail-mode-tracker.js     parses /ponytail commands
hooks/ponytail-subagent.js         injects into Task-spawned agents
hooks/ponytail-instructions.js     reads SKILL.md, filters it to the active level
hooks/ponytail-config.js           mode resolution and persistence
hooks/ponytail-runtime.js          flag file and hook output envelope
hooks/ponytail-statusline.{sh,ps1} the badge
skills/*/SKILL.md                  the ruleset and the five slash commands
tests/*.test.js                    node --test, no framework
```

`skills/ponytail/SKILL.md` is the ruleset. The hooks read it at session start and
strip the intensity rows that do not match the active level, so editing that file
changes behaviour with no code change.

## Tests

```bash
node --test "tests/*.test.js"
```

## Credit

Ruleset, hooks and skills by [Dietrich Gebert](https://github.com/DietrichGebert),
MIT licensed, from ponytail 4.9.0. This fork only deletes.
