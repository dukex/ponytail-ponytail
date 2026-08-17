#!/usr/bin/env node
// ponytail — SessionStart activation hook
//
// Writes the flag file at $CLAUDE_CONFIG_DIR/.ponytail-active (defaults to
// ~/.claude; the statusline script reads it) and emits the ponytail ruleset as
// hidden SessionStart context.

const { clearMode, getDefaultMode, setMode, writeHookOutput } = require('./ponytail-config');
const { getPonytailInstructions } = require('./ponytail-instructions');

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

try {
  writeHookOutput('SessionStart', getPonytailInstructions(mode));
} catch (e) {
  // Silent fail — stdout closed/EPIPE at hook exit must not surface as a failure.
}
