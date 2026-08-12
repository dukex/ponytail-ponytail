#!/usr/bin/env node
// Manifest wiring. The upstream repo shipped 13 host manifests kept in sync by a
// script; here there is one plugin name in three places, and a skill directory
// whose name has to match its frontmatter or Claude Code will not resolve the
// slash command.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const PLUGIN_NAME = 'ponytail-ponytail';

const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

test('plugin manifest names the plugin and points at the hooks config', () => {
  const manifest = read('.claude-plugin/plugin.json');
  assert.equal(manifest.name, PLUGIN_NAME);
  assert.equal(manifest.hooks, './hooks/hooks.json', 'must not rely on root hooks auto-discovery');
  assert.ok(fs.existsSync(path.join(root, 'hooks', 'hooks.json')));
});

test('marketplace entry matches the plugin manifest', () => {
  const marketplace = read('.claude-plugin/marketplace.json');
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].name, PLUGIN_NAME);
  assert.equal(marketplace.plugins[0].source, './');
});

test('every skill directory matches its frontmatter name', () => {
  const skillsDir = path.join(root, 'skills');
  const dirs = fs.readdirSync(skillsDir);
  assert.ok(dirs.length > 0, 'expected at least one skill');
  for (const dir of dirs) {
    const body = fs.readFileSync(path.join(skillsDir, dir, 'SKILL.md'), 'utf8');
    const frontmatter = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    assert.ok(frontmatter, `${dir}/SKILL.md has no frontmatter`);
    const name = frontmatter[1].match(/^name:\s*(\S+)/m);
    assert.ok(name, `${dir}/SKILL.md has no name field`);
    assert.equal(name[1], dir, `${dir}/SKILL.md name must match its directory`);
    assert.match(frontmatter[1], /^description:/m, `${dir}/SKILL.md needs a description to be discoverable`);
  }
});

// The ruleset injected by the hooks is read straight from this file, so a rename
// or a missing intensity table silently degrades every session to the fallback.
test('the ponytail skill carries the intensity table the mode filter keys on', () => {
  const body = fs.readFileSync(path.join(root, 'skills', 'ponytail', 'SKILL.md'), 'utf8');
  for (const mode of ['lite', 'full', 'ultra']) {
    assert.match(body, new RegExp(`\\|\\s\\*\\*${mode}\\*\\*\\s\\|`), `missing the ${mode} intensity row`);
  }
});
