#!/usr/bin/env node
// ponytail — shared configuration resolver
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
const VALID_MODES = ['off', 'lite', 'full', 'ultra', 'review'];
const RUNTIME_MODES = ['off', 'lite', 'full', 'ultra'];

function normalizeMode(mode) {
  if (typeof mode !== 'string') return null;
  const normalized = mode.trim().toLowerCase();
  return RUNTIME_MODES.includes(normalized) ? normalized : null;
}

function normalizeConfigMode(mode) {
  if (typeof mode !== 'string') return null;
  const normalized = mode.trim().toLowerCase();
  return VALID_MODES.includes(normalized) ? normalized : null;
}

function normalizePersistedMode(mode) {
  return normalizeMode(mode) || normalizeConfigMode(mode);
}

// "stop ponytail" / "normal mode" turn ponytail off, but only as a standalone
// command. Matching the phrase anywhere in the message turned it off mid-task
// for ordinary requests like "add a normal mode toggle" — so require the whole
// message to be the command, ignoring case and trailing punctuation.
function isDeactivationCommand(text) {
  const t = String(text || '').trim().toLowerCase().replace(/[.!?\s]+$/, '');
  return t === 'stop ponytail' || t === 'normal mode';
}

// ponytail: only embed the plugin install path in a statusline shell command when
// it's made of ordinary path characters. An allowlist beats escaping every shell's
// metacharacters; a hostile clone path (quotes, &, $, backtick, ;, etc.) falls back
// to manual setup instead. Allows : \ / for normal Windows and POSIX paths. Full
// per-shell escaper only if a real need appears.
function isShellSafe(p) {
  return typeof p === 'string' && /^[A-Za-z0-9 _.\-:/\\~]+$/.test(p);
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

// Strip the UTF-8 BOM some editors prepend on Windows, it breaks JSON.parse.
function readConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8').replace(/^\uFEFF/, ''));
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

function getDefaultMode() {
  // ponytail: a default must be a runtime level (off/lite/full/ultra); review is
  // a session-only mode, never a valid default. Validate against RUNTIME_MODES
  // so a stray env var or config can't make review the default.
  const envMode = process.env.PONYTAIL_DEFAULT_MODE;
  if (envMode && RUNTIME_MODES.includes(envMode.toLowerCase())) {
    return envMode.toLowerCase();
  }

  const configMode = readConfig().defaultMode;
  if (typeof configMode === 'string' && RUNTIME_MODES.includes(configMode.toLowerCase())) {
    return configMode.toLowerCase();
  }

  return DEFAULT_MODE;
}

// Hide the status-bar indicator while keeping ponytail active.
// PONYTAIL_HIDE_STATUS=1 (or any truthy value; 0/false/empty mean "don't hide")
// takes precedence, else config.hideStatus === true. Also suppresses the
// statusline setup nudge: someone who hid the badge does not want to be sold it.
function getHideStatus() {
  const env = process.env.PONYTAIL_HIDE_STATUS;
  if (env !== undefined) {
    const v = env.trim().toLowerCase();
    return v !== '' && v !== '0' && v !== 'false' && v !== 'no';
  }
  return readConfig().hideStatus === true;
}

function writeDefaultMode(mode) {
  // ponytail: only a runtime level can be a default; review is session-only.
  const normalized = normalizeMode(mode);
  if (!normalized) return null;

  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const config = readConfig();
  config.defaultMode = normalized;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  return normalized;
}

module.exports = {
  DEFAULT_MODE,
  getClaudeDir,
  getDefaultMode,
  getHideStatus,
  isDeactivationCommand,
  isShellSafe,
  normalizeMode,
  normalizePersistedMode,
  writeDefaultMode,
};
