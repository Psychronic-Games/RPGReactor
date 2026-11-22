#!/usr/bin/env node
'use strict';
/**
 * Writes docs/PLUGIN-API.md, the Plugin API Reference, from the code itself:
 *   - the functions meant for game plugins (FUNCTIONS below): each one's parameters and the comment above it in
 *     runtime/, and ReactorSteam's from the list at the head of reactor_steam.js;
 *   - RPG Reactor's own plugin commands (plugin "RPGReactor"): build-scripts/plugin-api-commands.json, each one
 *     checked against the runtime's registrations;
 *   - the editor plugin interface (ReactorEditor and a plugin's context) from src/EditorPlugins.js, with the
 *     comment above each member.
 *
 *   node editor/build-scripts/plugin-api-reference.cjs           write it
 *   node editor/build-scripts/plugin-api-reference.cjs --check   exit 1 if the checked-in page differs
 *
 * A function, command or member it cannot find, or one with nothing to say about it, is an error: the page cannot
 * name what the code does not have, and the code cannot gain something the page leaves out (tests/plugin-api-reference).
 */
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..', '..');
const runtimeDir = path.join(repo, 'runtime');
const target = path.join(repo, 'docs', 'PLUGIN-API.md');
const commandsFile = path.join(__dirname, 'plugin-api-commands.json');

/**
 * The functions a game plugin may call (made official by the owner, 2026-11-12 and since): how a plugin writes the
 * call, where it is defined (the text that starts its definition), and a description where the code has no comment.
 */
const FUNCTIONS = [
    { group: 'Lighting on a 3D map', call: 'Reactor3D.setMapAmbient', def: 'Reactor3D.setMapAmbient = function(', file: 'reactor_3d_lighting.js' },
    { group: 'Lighting on a 3D map', call: 'Reactor3D.switchLight', def: 'Reactor3D.switchLight = function(', file: 'reactor_3d_lighting.js' },
    { group: 'Lighting on a 3D map', call: 'Reactor3D.transformLight', def: 'Reactor3D.transformLight = function(', file: 'reactor_3d_lighting.js' },
    { group: '3D models', call: 'Reactor3D.transformModel', def: 'Reactor3D.transformModel = function(', file: 'reactor_3d_models.js' },
    { group: '3D models', call: 'Reactor3D.playModelAnimation', def: 'Reactor3D.playModelAnimation = function(', file: 'reactor_3d_models.js' },
    { group: 'Ground', call: 'Reactor3D.deriveElevation', def: 'Reactor3D.deriveElevation = function(', file: 'reactor_3d.js' },
    { group: 'Ground', call: 'Reactor3D.stairAt', def: 'Reactor3D.stairAt = function(', file: 'reactor_3d_world.js', summary: 'Whether a stair piece stands on the cell x, y of a map.' },
    { group: 'Characters', call: 'character.reactorIsWalking', def: 'Game_Character.prototype.reactorIsWalking = function(', file: 'reactor_objects_map.js' },
    { group: 'Vehicles', call: 'ReactorVehicles.Drive.state', def: 'Drive.state = function(', file: 'reactor_vehicles_drive.js' },
    { group: 'Battles on the map', call: '$gameFight.commandVehicleAttack', def: 'Game_Fight.prototype.commandVehicleAttack = function(', file: 'reactor_vehicles_mount.js' }
];

/** ReactorSteam calls whose line in reactor_steam.js's head is shared with another, or says nothing. */
const STEAM_TEXT = { isUnlocked: 'whether an achievement is unlocked', stat: 'an integer stat\'s value', setStat: 'set an integer stat' };

/** The context members and ReactorEditor members, in the order the page lists them. */
const EDITOR_CONTEXT = ['name', 'parameters', 'addMenuItem', 'addToolbarButton', 'addPanel', 'file', 'on', 'onDispose', 'notify'];
const EDITOR_GLOBAL = ['plugin', 'version', 'events', 'project', 'database', 'currentMap'];

const fail = message => { throw new Error(message); };
const read = file => fs.readFileSync(file, 'utf8');

/** The comment directly above line `index` (a /** *\/ block or // lines), as plain text; '' when there is none. */
function commentAbove(lines, index) {
    let j = index - 1;
    const out = [];
    if (j >= 0 && /\*\/\s*$/.test(lines[j])) {
        for (; j >= 0; j--) {
            out.unshift(lines[j]);
            if (/^\s*\/\*/.test(lines[j])) break;
        }
    } else {
        while (j >= 0 && /^\s*\/\//.test(lines[j])) out.unshift(lines[j--]);
    }
    return out.map(line => line.replace(/^\s*(\/\*\*?|\*\/|\*(?!\/)|\/\/)\s?/, '').replace(/\s*\*\/\s*$/, ''))
        .filter(line => !/^[-=*/\s]{4,}$/.test(line)).join(' ').replace(/\s+/g, ' ').trim();
}

/** A definition's parameters, as written after `function(`. */
function paramsAt(line, def) {
    const rest = line.slice(line.indexOf(def) + def.length);
    return rest.slice(0, rest.indexOf(')')).trim();
}

function functions() {
    return FUNCTIONS.map(entry => {
        const file = path.join(runtimeDir, entry.file);
        const lines = read(file).split('\n');
        const index = lines.findIndex(line => line.includes(entry.def));
        if (index < 0) fail(`${entry.call}: no "${entry.def}" in runtime/${entry.file}`);
        const text = commentAbove(lines, index) || entry.summary || '';
        if (!text) fail(`${entry.call}: no comment above it in runtime/${entry.file}, and no summary given`);
        return Object.assign({}, entry, { params: paramsAt(lines[index], entry.def), text });
    });
}

/** ReactorSteam's calls for games, from the list at the head of reactor_steam.js, each checked to exist. */
function steam() {
    const source = read(path.join(runtimeDir, 'reactor_steam.js'));
    const out = [];
    for (const line of source.split('\n')) {
        const m = line.match(/^\/\/\s+(ReactorSteam\.\w+\([^)]*\)(?:\s*\/\s*\w+\([^)]*\))?)\s*(.*)$/);
        if (!m) continue;
        for (const call of m[1].split(/\s*\/\s*/)) {
            const name = call.match(/^(?:ReactorSteam\.)?(\w+)/)[1];
            if (!new RegExp(`ReactorSteam\\.${name} = function\\(`).test(source)) fail(`ReactorSteam.${name}: named in reactor_steam.js's head, not defined`);
            out.push({ call: 'ReactorSteam.' + call.replace(/^ReactorSteam\./, ''), text: STEAM_TEXT[name] || m[2].trim() });
        }
    }
    if (!out.length) fail('reactor_steam.js: no ReactorSteam calls listed in its head');
    return out;
}

/** Every command registered under the plugin name "RPGReactor", by its name: written out, or through a constant. */
function registeredCommands() {
    const names = new Set();
    for (const file of fs.readdirSync(runtimeDir).filter(f => /^reactor_.*\.js$/.test(f))) {
        const source = read(path.join(runtimeDir, file));
        if (!source.includes('registerCommand')) continue;
        const consts = new Map();
        for (const m of source.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*"([A-Za-z0-9]+)"/g)) consts.set(m[1], m[2]);
        for (const m of source.matchAll(/(\w+(?:\.\w+)*)\s*=\s*"([A-Za-z0-9]+)"\s*;/g)) consts.set(m[1], m[2]);
        for (const m of source.matchAll(/registerCommand\(\s*([^,]+?)\s*,\s*([^,]+?)\s*,/g)) {
            const value = token => { const t = token.trim(); const q = t.match(/^["']([A-Za-z0-9]+)["']$/); if (q) return q[1]; return consts.get(t) || consts.get(t.replace(/^this\./, '')) || [...consts].find(([k]) => k.endsWith('.' + t.replace(/^this\./, '')))?.[1] || null; };
            if (value(m[1]) === 'RPGReactor') { const name = value(m[2]); if (name) names.add(name); }
        }
    }
    return names;
}

function commands() {
    const data = JSON.parse(read(commandsFile));
    const list = Array.isArray(data.commands) ? data.commands : fail('plugin-api-commands.json: no "commands"');
    const registered = registeredCommands();
    const listed = new Set(list.map(c => c.name));
    for (const name of registered) if (!listed.has(name)) fail(`RPGReactor command ${name} is registered in runtime/ but not in plugin-api-commands.json`);
    for (const c of list) {
        if (!registered.has(c.name)) fail(`RPGReactor command ${c.name} is in plugin-api-commands.json but not registered in runtime/`);
        if (!c.summary) fail(`RPGReactor command ${c.name}: no summary`);
        for (const arg of c.args || []) if (!arg.name || !arg.meaning) fail(`RPGReactor command ${c.name}: an argument without a name or meaning`);
    }
    return list;
}

/** A member of an object literal in EditorPlugins.js: its comment, and its parameters if it is a method. */
function editorMembers() {
    const source = read(path.join(repo, 'editor', 'src', 'EditorPlugins.js'));
    const lines = source.split('\n');
    const find = (name, from) => {
        const at = lines.findIndex((line, i) => i >= from && new RegExp(`^\\s+(get\\s+)?${name}(\\s*\\(|\\s*:|,\\s*$)`).test(line));
        if (at < 0) fail(`EditorPlugins.js: no member ${name}`);
        const text = commentAbove(lines, at);
        if (!text) fail(`EditorPlugins.js: ${name} has no comment above it`);
        const m = lines[at].match(/^\s+(get\s+)?\w+\s*\(([^)]*)\)/);
        return { name, method: !!m && !m[1], params: m && !m[1] ? m[2].trim() : null, text };
    };
    const contextAt = lines.findIndex(line => /const context = \{/.test(line));
    const globalAt = lines.findIndex(line => /const ReactorEditor = \{/.test(line));
    if (contextAt < 0 || globalAt < 0) fail('EditorPlugins.js: the context or ReactorEditor is not where it was');
    const events = (source.match(/const EVENTS = \[([^\]]*)\]/) || fail('EditorPlugins.js: no EVENTS'))[1].match(/'([^']+)'/g).map(s => s.slice(1, -1));
    return { context: EDITOR_CONTEXT.map(n => find(n, contextAt)), global: EDITOR_GLOBAL.map(n => find(n, globalAt)), events };
}

const code = s => '`' + s + '`';
const cell = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

function render() {
    const out = [];
    out.push('# Plugin API Reference', '');
    out.push('Everything RPG Reactor offers a plugin, written from the engine\'s own code: the functions meant for game plugins, RPG Reactor\'s plugin commands, and the editor plugin interface. [Writing Plugins](PLUGIN-DEVELOPMENT.md) shows how to use them; the [Engine API Reference](https://rpgreactor.org/docs/api) lists every function in the runtime.', '');
    out.push('<!-- Generated by editor/build-scripts/plugin-api-reference.cjs from runtime/, src/EditorPlugins.js and build-scripts/plugin-api-commands.json. Do not edit: change those and run it again. -->', '');

    out.push('## What a plugin is written for', '');
    out.push('A plugin\'s `@target` line, which the Plugin Manager shows beside its author:', '');
    out.push('| `@target` | What it is |', '|---|---|');
    out.push('| `Reactor` | A game plugin written for RPG Reactor (`RPGReactor` is the same) |');
    out.push('| `MZ Reactor` | A game plugin written for both RPG Maker MZ and RPG Reactor |');
    out.push('| `MZ` | An RPG Maker MZ plugin |');
    out.push('| `MV` | An RPG Maker MV plugin |');
    out.push('| `ReactorEditor` | An editor plugin |', '');

    out.push('## Functions for game plugins', '');
    let group = '';
    for (const f of functions()) {
        if (f.group !== group) { group = f.group; out.push('### ' + group, ''); }
        out.push(`- ${code(`${f.call}(${f.params})`)}: ${f.text} *(runtime/${f.file})*`);
        out.push('');
    }
    out.push('### Steam', '');
    out.push('For a game on Steam (Database › System 2 › Steam); every call does nothing without Steam. See [Steam for games](STEAM-FOR-GAMES.md).', '');
    for (const s of steam()) out.push(`- ${code(s.call)}${s.text ? ': ' + s.text : ''}`);
    out.push('');
    out.push('### Runtime events', '');
    out.push('`ReactorEvents.on(name, handler)` hears what happens in battles, on doors and in vehicles, without replacing a method. [Runtime Events](RUNTIME-EVENTS.md) lists every event and what it carries.', '');

    out.push('## RPG Reactor\'s plugin commands', '');
    out.push('RPG Reactor\'s own event commands are plugin commands of the plugin `RPGReactor`. Every argument arrives as text, as any plugin command\'s does. A plugin runs one as an event would:', '');
    out.push('```js', 'PluginManager.callCommand(interpreter, "RPGReactor", "LightSwitch", { target: "#village", state: "on" });', '```', '');
    let section = null;
    for (const c of commands()) {
        const sec = c.section || 'Not in the event command list';
        if (sec !== section) { section = sec; out.push('### ' + sec, ''); }
        out.push(`#### ${c.label} (${code(c.name)})`, '', c.summary, '');
        if (c.args && c.args.length) {
            out.push('| Argument | Type | Meaning |', '|---|---|---|');
            for (const a of c.args) out.push(`| ${code(a.name)} | ${cell(a.type || 'string')} | ${cell(a.meaning)} |`);
            out.push('');
        } else out.push('No arguments.', '');
    }

    const editor = editorMembers();
    out.push('## Editor plugins: `ReactorEditor`', '');
    out.push('An editor plugin (`@target ReactorEditor`, in a project\'s `js/editor-plugins/`) asks for its context once: `const plugin = ReactorEditor.plugin(\'MyPlugin\');`. What it adds through the context goes when the project closes. [Writing Plugins](PLUGIN-DEVELOPMENT.md#editor-plugins) has an example.', '');
    out.push('### `ReactorEditor`', '');
    for (const m of editor.global) out.push(`- ${code('ReactorEditor.' + m.name + (m.method ? `(${m.params})` : ''))}: ${m.text}`);
    out.push('');
    out.push('### A plugin\'s context', '');
    for (const m of editor.context) out.push(`- ${code('plugin.' + m.name + (m.method ? `(${m.params})` : ''))}: ${m.text}`);
    out.push('');
    out.push('### The editor\'s moments', '');
    out.push('`plugin.on(event, handler)` hears: ' + editor.events.map(code).join(', ') + '.', '');
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

if (require.main === module) {
    try {
        const page = render();
        if (process.argv.includes('--check')) {
            const now = fs.existsSync(target) ? read(target) : '';
            if (now !== page) { console.error('docs/PLUGIN-API.md is out of date: run node editor/build-scripts/plugin-api-reference.cjs'); process.exit(1); }
            console.log('docs/PLUGIN-API.md matches the code.');
        } else {
            fs.writeFileSync(target, page);
            console.log('Wrote docs/PLUGIN-API.md');
        }
    } catch (error) { console.error(error.message); process.exit(1); }
}

module.exports = { render, functions, steam, commands, registeredCommands, editorMembers, FUNCTIONS, target };
