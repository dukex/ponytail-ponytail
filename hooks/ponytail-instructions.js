#!/usr/bin/env node
// ponytail — builds the ruleset injected into the session.

const fs = require('fs');
const path = require('path');
const { DEFAULT_MODE, VALID_MODES, normalizeMode } = require('./ponytail-config');

const SKILL_PATH = path.join(__dirname, '..', 'skills', 'ponytail', 'SKILL.md');

function getPonytailInstructions(mode) {
  const effectiveMode = normalizeMode(mode, VALID_MODES) || DEFAULT_MODE;
  const header = 'PONYTAIL MODE ACTIVE — level: ' + effectiveMode;

  if (effectiveMode === 'review') {
    return header + '. Behavior defined by the ponytail-review skill.';
  }

  try {
    const body = fs.readFileSync(SKILL_PATH, 'utf8').replace(/^---[\s\S]*?---\s*/, '');
    return header + '\n\n' + body;
  } catch (e) {
    // Broken install only: skills/ ships alongside hooks/. The header alone
    // still tells the model ponytail is on.
    return header;
  }
}

module.exports = { getPonytailInstructions };
