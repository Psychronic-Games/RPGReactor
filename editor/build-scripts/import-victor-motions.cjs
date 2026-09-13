#!/usr/bin/env node
/*
 * Read a project's Victor Engine Battle Motions / Battler Graphic Setup
 * notetags into native action sequences, battler states and graphics.
 *
 *   node editor/build-scripts/import-victor-motions.cjs <project dir> [--vertical] [--distance=7] [--dry-run] [--report=file]
 *
 * Writes data/ActionSequences.json (existing records kept in place, imported
 * ones appended) and data/BattlePresentation.json (troops kept; the record
 * sections rebuilt from the notes). --vertical says the formation stands top
 * and bottom, so "front" of a target is a sprite height away.
 */
const fs = require('node:fs');
const path = require('node:path');
const V = require('../src/battle/VictorMotionImport.js');
const B = require('../../runtime/reactor_battle_data.js');

const args = process.argv.slice(2);
const project = args.find(a => !a.startsWith('--'));
if (!project) { console.error('usage: import-victor-motions.cjs <project dir> [--vertical] [--distance=N] [--dry-run] [--report=file]'); process.exit(2); }
const flag = name => args.includes('--' + name);
const option = (name, fallback) => { const hit = args.find(a => a.startsWith('--' + name + '=')); return hit ? hit.slice(name.length + 3) : fallback; };
const dataDir = path.join(project, 'data');
const read = name => { const file = path.join(dataDir, name + '.json'); return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; };

const data = { actors: read('Actors'), classes: read('Classes'), enemies: read('Enemies'), weapons: read('Weapons'), armors: read('Armors'), skills: read('Skills'), items: read('Items'), states: read('States'), animations: read('Animations'), system: read('System') };
const existingSequences = read('ActionSequences') || [null];
const existingSettings = read('BattlePresentation') || B.empty();
const imgDir = path.join(project, 'img'), listed = new Map();
const exists = (folder, name) => { if (!listed.has(folder)) { const dir = path.join(imgDir, folder); listed.set(folder, new Set(fs.existsSync(dir) ? fs.readdirSync(dir).map(f => f.replace(/\.[a-z0-9_]+$/i, '')) : [])); } return listed.get(folder).has(name); };
const { sequences, settings, report } = V.importDatabase(data, {
    existing: existingSequences, troops: existingSettings.troops || {}, vertical: flag('vertical'), distance: Number(option('distance', 7)), animations: data.animations, exists
});
// Records the notes said nothing about keep whatever the project already assigned (a room, a model graphic).
for (const kind of ['skills', 'items', 'weapons', 'actors', 'enemies', 'classes', 'states']) for (const [id, binding] of Object.entries(existingSettings[kind] || {})) if (!settings[kind][id]) settings[kind][id] = binding;
let invalid = 0;
for (const sequence of sequences) { if (!sequence) continue; const errors = B.validateSequence(sequence); if (errors.length) { invalid++; report.notes.push('sequence ' + sequence.id + ' ' + sequence.name + ': ' + errors.join(' ')); } }
B.validateStore(sequences, settings);
const summary = { project: path.basename(project), records: report.records, sequences: report.sequences, states: report.states, graphics: report.graphics, totalSequences: sequences.length - 1, invalid, notes: report.notes.length };
console.log(JSON.stringify(summary, null, 2));
if (option('report')) fs.writeFileSync(option('report'), report.notes.join('\n') + '\n');
else for (const note of report.notes.slice(0, 40)) console.log('  ' + note);
if (flag('dry-run')) process.exit(invalid ? 1 : 0);
fs.writeFileSync(path.join(dataDir, 'ActionSequences.json'), JSON.stringify(sequences));
fs.writeFileSync(path.join(dataDir, 'BattlePresentation.json'), JSON.stringify(settings));
console.log('wrote', path.join(dataDir, 'ActionSequences.json'), 'and BattlePresentation.json');
process.exit(invalid ? 1 : 0);
