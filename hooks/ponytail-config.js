#!/usr/bin/env node
// ponytail — mode resolution, session state, and hook output
//
// Resolution order for default mode:
//   1. PONYTAIL_DEFAULT_MODE environment variable
//   2. Config file defaultMode field:
//      - $XDG_CONFIG_HOME/ponytail/config.json (any platform, if set)
//      - ~/.config/ponytail/config.json (macOS / Linux fallback)
//      - %APPDATA%\ponytail\config.json (Windows fallback)
//   3. 'full'

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_MODE = 'full';
const RUNTIME_MODES = ['off', 'lite', 'full', 'ultra'];
// review is session-only: never a valid default, so it lives outside
// RUNTIME_MODES and callers have to opt into it by passing VALID_MODES.
const VALID_MODES = [...RUNTIME_MODES, 'review'];

function normalizeMode(mode, modes = RUNTIME_MODES) {
  if (typeof mode !== 'string') return null;
  const normalized = mode.trim().toLowerCase();
  return modes.includes(normalized) ? normalized : null;
}

// "stop ponytail" / "normal mode" turn ponytail off, but only as a standalone
// command. Matching the phrase anywhere in the message turned it off mid-task
// for ordinary requests like "add a normal mode toggle" — so require the whole
// message to be the command, ignoring case and trailing punctuation.
function isDeactivationCommand(text) {
  const t = String(text || '').trim().toLowerCase().replace(/[.!?\s]+$/, '');
  return t === 'stop ponytail' || t === 'normal mode';
}

function getConfigDir() {
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, 'ponytail');
  }
  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'ponytail'
    );
  }
  return path.join(os.homedir(), '.config', 'ponytail');
}

function getConfigPath() {
  return path.join(getConfigDir(), 'config.json');
}

// trim() also strips the UTF-8 BOM some Windows editors prepend (U+FEFF counts
// as whitespace in JS), which JSON.parse would otherwise reject.
function readConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8').trim());
    if (!config || typeof config !== 'object' || Array.isArray(config)) return {};
    return config;
  } catch (e) {
    return {};
  }
}

function getClaudeDir() {
  // ponytail: CLAUDE_CONFIG_DIR overrides ~/.claude, matching Claude Code.
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

// normalizeMode validates against RUNTIME_MODES, so a stray env var or config
// can't make the session-only review mode the default.
function getDefaultMode() {
  return normalizeMode(process.env.PONYTAIL_DEFAULT_MODE) ||
    normalizeMode(readConfig().defaultMode) ||
    DEFAULT_MODE;
}

function writeDefaultMode(mode) {
  const normalized = normalizeMode(mode);
  if (!normalized) return null;

  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const config = readConfig();
  config.defaultMode = normalized;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  return normalized;
}

function statePath() {
  return path.join(getClaudeDir(), '.ponytail-active');
}

function setMode(mode) {
  fs.mkdirSync(getClaudeDir(), { recursive: true });
  fs.writeFileSync(statePath(), mode);
}

function clearMode() {
  try { fs.unlinkSync(statePath()); } catch (e) {}
}

// Live mode written by activate/mode-tracker. Absent flag = ponytail off.
function readMode() {
  try {
    return fs.readFileSync(statePath(), 'utf8').trim() || null;
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

module.exports = {
  DEFAULT_MODE,
  VALID_MODES,
  clearMode,
  getClaudeDir,
  getDefaultMode,
  isDeactivationCommand,
  normalizeMode,
  readMode,
  setMode,
  writeDefaultMode,
  writeHookOutput,
};
