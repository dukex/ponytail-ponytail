#!/usr/bin/env node
// Hook behaviour checks. SessionStart and UserPromptSubmit assert raw stdout;
// SubagentStart asserts the hookSpecificOutput JSON form, since raw stdout is
// dropped for that event.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');

const {
  DEFAULT_MODE,
  getDefaultMode,
  writeDefaultMode,
} = require('../hooks/ponytail-config');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ponytail-hooks-'));
// Runs on normal exit and on assertion-throw exit; force makes it idempotent.
process.on('exit', () => fs.rmSync(temp, { recursive: true, force: true }));

// USERPROFILE alongside HOME: os.homedir() reads USERPROFILE on Windows, HOME on POSIX.
function run(script, env, input = '') {
  return spawnSync(process.execPath, [path.join(root, 'hooks', script)], {
    env: { ...process.env, ...env },
    input,
    encoding: 'utf8',
  });
}

// A value leaked from the dev or CI shell would steer the default-dir
// assertions off the path under test.
delete process.env.CLAUDE_CONFIG_DIR;
delete process.env.PONYTAIL_DEFAULT_MODE;

let result;
let output;

// --- SessionStart -----------------------------------------------------------

const home = path.join(temp, 'home');
fs.mkdirSync(home, { recursive: true });
const claudeEnv = { HOME: home, USERPROFILE: home, PONYTAIL_DEFAULT_MODE: 'full' };

result = run('ponytail-activate.js', claudeEnv);
assert.equal(result.status, 0, result.stderr);
assert.equal(fs.readFileSync(path.join(home, '.claude', '.ponytail-active'), 'utf8'), 'full');
assert.match(result.stdout, /PONYTAIL MODE ACTIVE — level: full/);

// The header carries the active level and the SKILL.md body follows it, minus
// frontmatter. A body that failed to load degrades to the header alone, which
// is silent enough to be worth asserting against.
result = run('ponytail-activate.js', { ...claudeEnv, HOME: path.join(temp, 'lite-home'), USERPROFILE: path.join(temp, 'lite-home'), PONYTAIL_DEFAULT_MODE: 'lite' });
assert.equal(result.status, 0, result.stderr);
assert.match(result.stdout, /PONYTAIL MODE ACTIVE — level: lite/);
assert.match(result.stdout, /No unrequested abstractions/, 'the ruleset body must reach the session');
assert.doesNotMatch(result.stdout, /^description:/m, 'SKILL.md frontmatter must be stripped');

// off skips activation entirely: no flag file, no ruleset.
const offHome = path.join(temp, 'off-home');
result = run('ponytail-activate.js', { HOME: offHome, USERPROFILE: offHome, PONYTAIL_DEFAULT_MODE: 'off' });
assert.equal(result.status, 0, result.stderr);
assert.equal(fs.existsSync(path.join(offHome, '.claude', '.ponytail-active')), false);
assert.doesNotMatch(result.stdout, /PONYTAIL MODE ACTIVE/);

// CLAUDE_CONFIG_DIR overrides ~/.claude for the flag file.
const home2 = path.join(temp, 'home2');
fs.mkdirSync(home2, { recursive: true });
const customConfigDir = path.join(temp, 'custom-claude');
result = run('ponytail-activate.js', {
  HOME: home2,
  USERPROFILE: home2,
  CLAUDE_CONFIG_DIR: customConfigDir,
  PONYTAIL_DEFAULT_MODE: 'lite',
});
assert.equal(result.status, 0, result.stderr);
assert.equal(fs.readFileSync(path.join(customConfigDir, '.ponytail-active'), 'utf8'), 'lite');
assert.equal(
  fs.existsSync(path.join(home2, '.claude', '.ponytail-active')),
  false,
  'flag must not land in ~/.claude when CLAUDE_CONFIG_DIR is set',
);

// --- UserPromptSubmit -------------------------------------------------------

const trackHome = path.join(temp, 'track-home');
const trackFlag = path.join(trackHome, '.claude', '.ponytail-active');
const trackEnv = {
  HOME: trackHome,
  USERPROFILE: trackHome,
  XDG_CONFIG_HOME: path.join(trackHome, '.config'),
  PONYTAIL_DEFAULT_MODE: 'full',
};

result = run('ponytail-mode-tracker.js', trackEnv, JSON.stringify({ prompt: '/ponytail lite' }));
assert.equal(result.status, 0, result.stderr);
assert.equal(fs.readFileSync(trackFlag, 'utf8'), 'lite');
assert.match(result.stdout, /PONYTAIL MODE CHANGED — level: lite/);

// Bare /ponytail reports the active level without resetting it to the default.
result = run('ponytail-mode-tracker.js', trackEnv, JSON.stringify({ prompt: '/ponytail' }));
assert.equal(result.status, 0, result.stderr);
assert.equal(fs.readFileSync(trackFlag, 'utf8'), 'lite');
assert.match(result.stdout, /PONYTAIL MODE ACTIVE — level: lite/);

// Claude Code namespaces plugin skills as /<plugin>:<skill>, and tab completion
// inserts that form, so the tracker has to see through the prefix.
result = run('ponytail-mode-tracker.js', trackEnv, JSON.stringify({ prompt: '/ponytail-ponytail:ponytail ultra' }));
assert.equal(result.status, 0, result.stderr);
assert.equal(fs.readFileSync(trackFlag, 'utf8'), 'ultra');
assert.match(result.stdout, /PONYTAIL MODE CHANGED — level: ultra/);

result = run('ponytail-mode-tracker.js', trackEnv, JSON.stringify({ prompt: '/ponytail-ponytail:ponytail-review' }));
assert.equal(result.status, 0, result.stderr);
assert.equal(fs.readFileSync(trackFlag, 'utf8'), 'review');

// The one-shot skills share the /ponytail prefix but must not touch the mode.
fs.writeFileSync(trackFlag, 'full');
for (const oneShot of ['/ponytail-audit', '/ponytail-debt', '/ponytail-help src/']) {
  result = run('ponytail-mode-tracker.js', trackEnv, JSON.stringify({ prompt: oneShot }));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(trackFlag, 'utf8'), 'full', `${oneShot} must leave the mode alone`);
}

// /ponytail off and the deactivation phrases clear the flag.
result = run('ponytail-mode-tracker.js', trackEnv, JSON.stringify({ prompt: '/ponytail off' }));
assert.equal(result.status, 0, result.stderr);
assert.equal(fs.existsSync(trackFlag), false);
assert.match(result.stdout, /PONYTAIL MODE OFF/);

fs.writeFileSync(trackFlag, 'full');
result = run('ponytail-mode-tracker.js', trackEnv, JSON.stringify({ prompt: 'normal mode' }));
assert.equal(result.status, 0, result.stderr);
assert.equal(fs.existsSync(trackFlag), false);
assert.match(result.stdout, /PONYTAIL MODE OFF/);

// A request that merely mentions "normal mode" must not deactivate ponytail.
fs.writeFileSync(trackFlag, 'full');
result = run(
  'ponytail-mode-tracker.js',
  trackEnv,
  JSON.stringify({ prompt: 'add a normal mode toggle next to dark mode' }),
);
assert.equal(result.status, 0, result.stderr);
assert.equal(
  fs.readFileSync(trackFlag, 'utf8'),
  'full',
  'incidental "normal mode" in a request must not turn ponytail off',
);

// --- /ponytail default ------------------------------------------------------

// `/ponytail default <mode>` persists the default so it survives a restart,
// while a plain switch stays session-scoped and never touches config.
const defHome = path.join(temp, 'default-cmd-home');
const defEnv = { HOME: defHome, USERPROFILE: defHome, XDG_CONFIG_HOME: path.join(defHome, '.config') };
const defConfig = path.join(defHome, '.config', 'ponytail', 'config.json');
const defFlag = path.join(defHome, '.claude', '.ponytail-active');

result = run('ponytail-mode-tracker.js', defEnv, JSON.stringify({ prompt: '/ponytail default lite' }));
assert.equal(result.status, 0, result.stderr);
assert.equal(JSON.parse(fs.readFileSync(defConfig, 'utf8')).defaultMode, 'lite', '/ponytail default must persist the default');
assert.equal(fs.existsSync(defFlag), false, '/ponytail default must not change the session mode');

result = run('ponytail-mode-tracker.js', defEnv, JSON.stringify({ prompt: '/ponytail ultra' }));
assert.equal(result.status, 0, result.stderr);
assert.equal(fs.readFileSync(defFlag, 'utf8'), 'ultra', 'plain switch must set the session mode');
assert.equal(JSON.parse(fs.readFileSync(defConfig, 'utf8')).defaultMode, 'lite', 'plain switch must not persist the default');

// review is a session-only mode, never a valid default: the command is ignored.
result = run('ponytail-mode-tracker.js', defEnv, JSON.stringify({ prompt: '/ponytail default review' }));
assert.equal(result.status, 0, result.stderr);
assert.equal(JSON.parse(fs.readFileSync(defConfig, 'utf8')).defaultMode, 'lite', 'review must not be accepted as a default');

// --- SubagentStart ----------------------------------------------------------

// SessionStart context is parent-thread only and never reaches subagents, so
// without this hook every Task-spawned agent runs ponytail-unaware. Native
// Claude needs the hookSpecificOutput JSON form here or the context is dropped.
// run() passes empty stdin, which also covers the hook staying stdin-independent:
// on Windows the PowerShell wrapper can swallow the piped JSON, and waiting on
// it would stall every subagent spawn.
const subHome = path.join(temp, 'sub-home');
const subFlag = path.join(subHome, '.claude', '.ponytail-active');
fs.mkdirSync(path.dirname(subFlag), { recursive: true });
const subEnv = { HOME: subHome, USERPROFILE: subHome };

fs.writeFileSync(subFlag, 'full');
result = run('ponytail-subagent.js', subEnv);
assert.equal(result.status, 0, result.stderr);
output = JSON.parse(result.stdout);
assert.equal(output.hookSpecificOutput.hookEventName, 'SubagentStart');
assert.match(output.hookSpecificOutput.additionalContext, /PONYTAIL MODE ACTIVE — level: full/);

// No flag → ponytail off → inject nothing (empty stdout, no failure).
fs.unlinkSync(subFlag);
result = run('ponytail-subagent.js', subEnv);
assert.equal(result.status, 0, result.stderr);
assert.equal(result.stdout, '', 'SubagentStart must stay silent when ponytail is off');

// review reaches subagents as the short pointer, not the full ruleset.
fs.writeFileSync(subFlag, 'review');
result = run('ponytail-subagent.js', subEnv);
assert.equal(result.status, 0, result.stderr);
output = JSON.parse(result.stdout);
assert.match(output.hookSpecificOutput.additionalContext, /level: review\. Behavior defined by the ponytail-review skill\./);

// --- config -----------------------------------------------------------------

// writeDefaultMode must merge into existing config, not overwrite it.
const mergeHome = path.join(temp, 'merge-home');
const mergeConfigDir = path.join(mergeHome, '.config', 'ponytail');
fs.mkdirSync(mergeConfigDir, { recursive: true });
const mergeConfigPath = path.join(mergeConfigDir, 'config.json');
fs.writeFileSync(mergeConfigPath, JSON.stringify({ defaultMode: 'full', customSetting: 42 }, null, 2));

const prevXdg = process.env.XDG_CONFIG_HOME;
process.env.XDG_CONFIG_HOME = path.join(mergeHome, '.config');
try {
  writeDefaultMode('ultra');
  const merged = JSON.parse(fs.readFileSync(mergeConfigPath, 'utf8'));
  assert.equal(merged.defaultMode, 'ultra', 'writeDefaultMode must update defaultMode');
  assert.equal(merged.customSetting, 42, 'writeDefaultMode must preserve existing config fields');

  // review must be refused as a default by the config functions too, not only
  // by the mode-tracker command path.
  assert.equal(writeDefaultMode('review'), null, 'writeDefaultMode must refuse review as a default');
  assert.equal(
    JSON.parse(fs.readFileSync(mergeConfigPath, 'utf8')).defaultMode,
    'ultra',
    'a refused review write must leave the config unchanged',
  );

  fs.rmSync(mergeConfigPath);
  process.env.PONYTAIL_DEFAULT_MODE = 'review';
  assert.equal(getDefaultMode(), DEFAULT_MODE, 'PONYTAIL_DEFAULT_MODE=review must fall back to the built-in default');
} finally {
  if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = prevXdg;
  delete process.env.PONYTAIL_DEFAULT_MODE;
}

console.log('hook checks passed');
