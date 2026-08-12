#!/usr/bin/env node
// The lifecycle hooks run through PowerShell on Windows, so the `command` field
// has to be shell-agnostic: plain `node`, no bash-only syntax. commandWindows is
// not part of the hooks schema the plugin marketplace validator accepts, so it is
// omitted; ${CLAUDE_PLUGIN_ROOT} expansion and `node` work everywhere.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const HOOKS_JSON = 'hooks/hooks.json';
// PowerShell 5.1 rejects these POSIX shell guards when a host runs `command`.
const POSIX_GUARD_SYNTAX = /\bcommand\s+-v\b|&&|\|\||>\/dev\/null|2>&1/;
// Pull the hooks/<script> a command launches, so we can check it exists.
const HOOK_SCRIPT = /hooks[\\/]([\w.-]+\.(?:js|mjs|cjs|ps1|sh))/;

// Read inside each case so a missing or malformed file fails as a clean
// assertion, not a load-time crash.
function commandHooks() {
  const config = JSON.parse(fs.readFileSync(path.join(root, HOOKS_JSON), 'utf8'));
  return Object.values(config.hooks)
    .flat()
    .flatMap((entry) => entry.hooks);
}

test('hooks.json omits commandWindows for marketplace validation', () => {
  for (const hook of commandHooks()) {
    assert.equal(
      hook.commandWindows,
      undefined,
      `hook must not use commandWindows (not supported by the marketplace validator): ${hook.command}`,
    );
  }
});

test('shared hook commands avoid POSIX-only guard syntax', () => {
  const commands = commandHooks().map((h) => h.command).filter(Boolean);
  assert.ok(commands.length > 0, 'expected at least one shared command entry');
  for (const cmd of commands) {
    assert.doesNotMatch(cmd, POSIX_GUARD_SYNTAX, `command uses POSIX-only guard syntax: ${cmd}`);
  }
});

// `exec` is a bash/zsh builtin with no PowerShell equivalent, and some hosts run
// `command` through PowerShell on Windows regardless. `exec node ...` then dies
// on its first token with CommandNotFoundException. Plain `node ...` runs in
// both. The wrapper-process pileup exec was meant to avoid is handled by each
// hook's stdin self-exit guard instead.
test('shared hook commands are shell-agnostic (no bash-only exec prefix)', () => {
  const commands = commandHooks().map((h) => h.command).filter(Boolean);
  assert.ok(commands.length > 0, 'expected at least one shared command entry');
  for (const cmd of commands) {
    assert.doesNotMatch(cmd, /(^|\s)exec\s/, `command must not use the bash-only 'exec' builtin: ${cmd}`);
    assert.match(cmd, /^node\s+/, `command must invoke node directly so it runs in both bash and PowerShell: ${cmd}`);
    assert.doesNotMatch(cmd, /;\s*exit 0$/, `command must not leave a shell wrapper waiting on node: ${cmd}`);
  }
});

test('every hook command points at a script that ships in hooks/', () => {
  for (const hook of commandHooks()) {
    const match = hook.command.match(HOOK_SCRIPT);
    assert.ok(match, `cannot find a hooks/ script in command: ${hook.command}`);
    assert.ok(
      fs.existsSync(path.join(root, 'hooks', match[1])),
      `command references a missing hook script: ${match[1]}`,
    );
  }
});

// On Windows the UserPromptSubmit hook runs inside a PowerShell `if {}` wrapper
// that can swallow the piped prompt JSON, so stdin 'end' never fires. The hook
// must never wait on stdin forever, that freezes the whole session.
test('ponytail-mode-tracker self-exits when stdin never closes (no freeze)', async () => {
  const hook = path.join(root, 'hooks', 'ponytail-mode-tracker.js');
  // stdin is a pipe we never write to or end, reproducing the deadlock.
  const child = spawn(process.execPath, [hook], { stdio: ['pipe', 'ignore', 'ignore'] });

  const code = await new Promise((resolve, reject) => {
    const guard = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('hook hung on open stdin, it would freeze the session'));
    }, 3000);
    child.on('exit', (c) => { clearTimeout(guard); resolve(c); });
    child.on('error', reject);
  });

  assert.equal(code, 0, 'hook must exit cleanly when stdin never closes');
});
