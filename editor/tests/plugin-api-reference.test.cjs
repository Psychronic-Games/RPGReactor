'use strict';
// docs/PLUGIN-API.md is written from the code (build-scripts/plugin-api-reference.cjs) and must match it: a function,
// command or editor member the code gains or loses shows here first. The other plugin pages name only what it has.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const Ref = require('../build-scripts/plugin-api-reference.cjs');
const docs = path.join(__dirname, '..', '..', 'docs');

test('the Plugin API Reference matches the code: run build-scripts/plugin-api-reference.cjs after changing what it reads', () => {
    assert.equal(fs.readFileSync(Ref.target, 'utf8'), Ref.render());
});

test('every RPGReactor command the runtime registers is in the reference, and nothing else', () => {
    const listed = Ref.commands().map(c => c.name).sort();
    assert.deepEqual(listed, [...Ref.registeredCommands()].sort());
    assert.ok(listed.length >= 38);
});

test('the plugin pages name only functions the reference has', () => {
    const known = new Set([...Ref.functions().map(f => f.call), ...Ref.steam().map(s => s.call.replace(/\(.*$/, ''))]);
    const owned = /^(Reactor3D|ReactorSteam|ReactorVehicles\.Drive|\$gameFight|character)\.\w+$/;
    for (const page of ['PLUGIN-DEVELOPMENT.md', 'PLUGIN-FIRST-PLUGIN.md', 'PLUGIN-GLOBALS.md', 'PLUGIN-PARAMETERS-AND-COMMANDS.md', 'STEAM-FOR-GAMES.md']) {
        const text = fs.readFileSync(path.join(docs, page), 'utf8');
        for (const m of text.matchAll(/`((?:Reactor3D|ReactorSteam|ReactorVehicles\.Drive|\$gameFight|character)\.\w+)\(/g)) {
            if (owned.test(m[1])) assert.ok(known.has(m[1]), `${page} names ${m[1]}, which the reference does not have`);
        }
    }
});

test('each editor plugin member the reference lists has a comment in EditorPlugins.js', () => {
    const editor = Ref.editorMembers();
    for (const m of [...editor.global, ...editor.context]) assert.ok(m.text.length > 10, m.name);
    assert.deepEqual(editor.events, ['projectOpened', 'mapLoaded', 'beforeSave', 'saved', 'playtest', 'projectClosing']);
});
