#!/usr/bin/env node
// ponytail — SessionStart activation hook
//
// Runs on every session start:
//   1. Writes flag file at $CLAUDE_CONFIG_DIR/.ponytail-active (defaults to
//      ~/.claude; the statusline script reads this)
//   2. Emits the ponytail ruleset as hidden SessionStart context
//   3. Detects missing statusline config and emits a one-time setup nudge

const fs = require('fs');
const path = require('path');
const { getClaudeDir, getDefaultMode, getHideStatus, isShellSafe } = require('./ponytail-config');
const { getPonytailInstructions } = require('./ponytail-instructions');
const { clearMode, setMode, writeHookOutput } = require('./ponytail-runtime');

const claudeDir = getClaudeDir();
const settingsPath = path.join(claudeDir, 'settings.json');
const mode = getDefaultMode();

// "off" mode — skip activation entirely, don't write the flag or emit rules.
if (mode === 'off') {
  clearMode();
  writeHookOutput('SessionStart', 'OK');
  process.exit(0);
}

try {
  setMode(mode);
} catch (e) {
  // Silent fail — the flag is best-effort, don't block the hook.
}

let output = getPonytailInstructions(mode);

// Nudge at most once, and never when the user has hidden the badge. The flag
// file marks that the offer was already made (and implicitly declined);
// repeating it every session start turns a helpful hint into a nag.
const nudgeFlagPath = path.join(claudeDir, '.ponytail-statusline-nudged');
if (!getHideStatus()) try {
  let hasStatusline = false;
  if (fs.existsSync(settingsPath)) {
    // Strip the UTF-8 BOM some editors prepend on Windows (breaks JSON.parse).
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8').replace(/^\uFEFF/, ''));
    hasStatusline = Boolean(settings.statusLine);
  }

  if (!hasStatusline && !fs.existsSync(nudgeFlagPath)) {
    try { fs.mkdirSync(claudeDir, { recursive: true }); fs.writeFileSync(nudgeFlagPath, ''); } catch (e) {}
    const isWindows = process.platform === 'win32';
    const scriptName = isWindows ? 'ponytail-statusline.ps1' : 'ponytail-statusline.sh';
    const scriptPath = path.join(__dirname, scriptName);
    if (isShellSafe(scriptPath)) {
      const command = isWindows
        ? `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`
        : `bash "${scriptPath}"`;
      output += '\n\n' +
        'STATUSLINE SETUP NEEDED: The ponytail plugin includes a statusline badge showing active mode ' +
        '(e.g. [PONYTAIL], [PONYTAIL:ULTRA]). It is not configured yet. ' +
        'To enable, add this to ' + settingsPath + ': ' +
        '"statusLine": { "type": "command", "command": ' + JSON.stringify(command) + ' } ' +
        'Proactively offer to set this up for the user on first interaction.';
    } else {
      // ponytail: install path has shell metacharacters — don't embed it in a
      // command snippet; have the agent wire it up by hand instead.
      output += '\n\n' +
        'STATUSLINE SETUP NEEDED: The ponytail plugin includes a statusline badge showing active mode. ' +
        'Its install path contains characters unsafe to embed in a shell command, so configure it manually: ' +
        'add a statusLine command of type "command" that runs ' + scriptName +
        " from the plugin's hooks directory to " + settingsPath + ', quoting/escaping the path for your shell. ' +
        'Proactively offer to set this up for the user on first interaction.';
    }
  }
} catch (e) {
  // Silent fail — don't block session start over statusline detection.
}

try {
  writeHookOutput('SessionStart', output);
} catch (e) {
  // Silent fail — stdout closed/EPIPE at hook exit must not surface as a failure.
}
