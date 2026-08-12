#!/usr/bin/env node
// ponytail — session state and hook output

const fs = require('fs');
const path = require('path');
const { getClaudeDir } = require('./ponytail-config');

const statePath = path.join(getClaudeDir(), '.ponytail-active');

function setMode(mode) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, mode);
}

function clearMode() {
  try { fs.unlinkSync(statePath); } catch (e) {}
}

// Live mode written by activate/mode-tracker. Absent flag = ponytail off.
function readMode() {
  try {
    return fs.readFileSync(statePath, 'utf8').trim() || null;
  } catch (e) {
    return null;
  }
}

// SessionStart and UserPromptSubmit accept raw stdout as added context, but
// SubagentStart drops it unless it arrives in the hookSpecificOutput JSON form.
function writeHookOutput(event, context = '') {
  if (event === 'SubagentStart') {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: event, additionalContext: context },
    }));
    return;
  }
  process.stdout.write(context);
}

module.exports = { clearMode, readMode, setMode, writeHookOutput };
