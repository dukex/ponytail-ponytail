#!/usr/bin/env node
// ponytail — SubagentStart hook
//
// SessionStart context is parent-thread only and never reaches subagents, so
// without this every Task-spawned agent runs ponytail-unaware. When ponytail
// mode is active, inject the same ruleset into each subagent.
//
// Synchronous and stdin-independent on purpose: on Windows, Claude Code runs
// this hook through a PowerShell `if {}` wrapper that can swallow the piped
// JSON, so stdin 'end' never fires and waiting on it would stall every
// subagent spawn.

const { readMode, writeHookOutput } = require('./ponytail-config');
const { getPonytailInstructions } = require('./ponytail-instructions');

const mode = readMode();

// Absent flag or off → ponytail isn't active; inject nothing.
if (mode && mode !== 'off') {
  try {
    writeHookOutput('SubagentStart', getPonytailInstructions(mode));
  } catch (e) {
    // Silent fail — a stdout error at hook exit must not surface as a failure.
  }
}
