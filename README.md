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

Then a second pass, with the plugin already Claude Code only:

| Removed | Why |
|---|---|
| the mode filter in `ponytail-instructions.js` (31 lines) | it stripped the intensity rows that did not match the active level: 4 lines out of 104. The header already names the level |
| the statusline setup nudge, `getHideStatus`, `isShellSafe` (~75 lines) | it detected a missing `statusLine`, wrote a "already offered" flag and carried a path allowlist so the snippet was safe to embed. The README below has the JSON |
| `PONYTAIL_SUBAGENT_MATCHER` (~95 lines with its tests) | the opt-in regex scoping was half of `ponytail-subagent.js` plus the whole stdin/timeout path. Without it the hook is synchronous in 8 lines |
| `ponytail-runtime.js` | four small functions in their own file, imported next to `ponytail-config` by every hook. Folded into it |
| `normalizeConfigMode` + `normalizePersistedMode` | since `VALID_MODES ⊃ RUNTIME_MODES` the second was exactly the first. Both collapse into `normalizeMode(mode, modes)` |
| `tests/hooks-windows.test.js` (91 lines) | it asserted that three identical commands in a static JSON file carry no POSIX shell syntax |

Result: 21 files, 1,230 lines. 309 of JS across five hooks, 336 of skill
Markdown, 289 of tests, and the rest manifests, README and CI.

One thing changed rather than shrank: the `/ponytail` command parser now sees
through the plugin namespace, so `/ponytail-ponytail:ponytail ultra` (what tab
completion inserts) switches the mode. Upstream compared against a hardcoded
`/ponytail:ponytail`, which stops matching the moment the plugin is renamed.

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

Every Task-spawned subagent gets the ruleset too, via `SubagentStart`.

## Statusline badge

The plugin ships a script that prints `[PONYTAIL]` or `[PONYTAIL:ULTRA]` while
ponytail is active. Wire it up in `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash \"$HOME/.claude/plugins/ponytail-ponytail/hooks/ponytail-statusline.sh\""
  }
}
```

Windows uses `powershell -ExecutionPolicy Bypass -File "...\ponytail-statusline.ps1"`.
Leave `statusLine` unset to skip the badge.

## Configure

Resolution order: environment variable, then config file, then `full`.

```bash
export PONYTAIL_DEFAULT_MODE=ultra   # off | lite | full | ultra
```

`~/.config/ponytail/config.json` (`%APPDATA%\ponytail\config.json` on Windows):

```json
{ "defaultMode": "lite" }
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
hooks/ponytail-instructions.js     reads SKILL.md, prefixes the active level
hooks/ponytail-config.js           mode resolution, flag file, hook output envelope
hooks/ponytail-statusline.{sh,ps1} the badge
skills/*/SKILL.md                  the ruleset and the five slash commands
tests/*.test.js                    node --test, no framework
```

`skills/ponytail/SKILL.md` is the ruleset. The hooks read it at session start, so
editing that file changes behaviour with no code change.

## Tests

```bash
node --test "tests/*.test.js"
```

## Credit

Ruleset, hooks and skills by [Dietrich Gebert](https://github.com/DietrichGebert),
MIT licensed, from ponytail 4.9.0. This fork only deletes.
