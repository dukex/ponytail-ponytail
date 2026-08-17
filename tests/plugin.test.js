#!/usr/bin/env node
// Manifest wiring: one plugin name in three places, and skill directories whose
// names have to match their frontmatter or the slash command never resolves.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const PLUGIN_NAME = 'ponytail-ponytail';

const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

// hooks/hooks.json auto-loads by name; naming it in manifest.hooks too makes
// Claude Code reject it as a duplicate and drop every hook.
test('plugin manifest names the plugin and leaves hooks to auto-discovery', () => {
  const manifest = read('.claude-plugin/plugin.json');
  assert.equal(manifest.name, PLUGIN_NAME);
  assert.equal(manifest.hooks, undefined, 'declaring the auto-loaded hooks/hooks.json double-loads it');
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
