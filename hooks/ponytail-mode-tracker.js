#!/usr/bin/env node
// ponytail — UserPromptSubmit hook to track which ponytail mode is active.
// Inspects the prompt for /ponytail commands and writes the mode to the flag file.

const {
  getDefaultMode,
  isDeactivationCommand,
  normalizeMode,
  writeDefaultMode,
} = require('./ponytail-config');
const { clearMode, readMode, setMode, writeHookOutput } = require('./ponytail-runtime');

// The optional group absorbs the /<plugin>: namespace tab completion inserts.
// The lookahead makes the skill name a whole token, so /ponytail-audit and the
// other one-shot skills share the prefix without touching the mode.
const COMMAND = /^[/@$](?:[\w-]+:)?(ponytail-review|ponytail)(?=\s|$)/;

let input = '';
let done = false;

function finish() {
  if (done) return;
  done = true;
  try {
    // Strip the UTF-8 BOM some shells prepend when piping (breaks JSON.parse).
    const data = JSON.parse(input.replace(/^\uFEFF/, ''));
    const prompt = (data.prompt || '').trim().toLowerCase();
    const command = prompt.match(COMMAND);

    if (command) {
      const args = prompt.slice(command[0].length).trim().split(/\s+/).filter(Boolean);
      let mode = null;
      let isReportOnly = false;

      if (command[1] === 'ponytail-review') {
        mode = 'review';
      } else if (args[0] === 'default') {
        // `/ponytail default <mode>` persists the default so it survives a
        // restart. Plain switches stay session-scoped ("sticks until session
        // end"), so this is the only path that writes config. review is not a
        // valid default, and normalizeMode already rejects it.
        const dmode = normalizeMode(args[1]);
        if (dmode) {
          writeDefaultMode(dmode);
          writeHookOutput('UserPromptSubmit', 'PONYTAIL DEFAULT SET — new sessions start in ' + dmode + '.');
        }
        return;
      } else if (args.length === 0) {
        isReportOnly = true;
        mode = readMode() || getDefaultMode();
      } else {
        mode = normalizeMode(args[0]) || getDefaultMode();
      }

      if (isReportOnly) {
        writeHookOutput('UserPromptSubmit', 'PONYTAIL MODE ACTIVE — level: ' + mode);
      } else if (mode === 'off') {
        clearMode();
        writeHookOutput('UserPromptSubmit', 'PONYTAIL MODE OFF');
      } else {
        setMode(mode);
        writeHookOutput('UserPromptSubmit', 'PONYTAIL MODE CHANGED — level: ' + mode);
      }
      return;
    }

    if (isDeactivationCommand(prompt)) {
      clearMode();
      writeHookOutput('UserPromptSubmit', 'PONYTAIL MODE OFF');
    }
  } catch (e) {
    // Silent fail
  }
}

process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', finish);

// Never hang the session. On Windows, Claude Code runs this hook through a
// PowerShell `if {}` wrapper that can swallow the piped prompt JSON, so stdin
// 'end' never fires and the hook blocks forever, freezing the session. On error,
// or after a short fallback, process whatever arrived and exit. unref() keeps the
// timer from adding latency to the normal path, where 'end' fires first.
process.stdin.on('error', () => { finish(); process.exit(0); });
setTimeout(() => { finish(); process.exit(0); }, 1000).unref();
