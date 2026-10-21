'use strict';
// A model part's name as the editor shows it (editor/src/utils/PartNames.js): a name its file damaged is shown
// without the damage, and the stored name, which is the part's identity, is what every value still carries.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const RRPartNames = require('../src/utils/PartNames.js');
const root = path.join(__dirname, '..', '..');
const LOST = '�';

test('a whole name is shown as it is', () => {
    for (const name of ['Steering', 'Mesh_0009.rip', 'Mesh_0153.rip__0', 'DEF-Wheel.002', 'Vật Liệu.004', '']) assert.strictEqual(RRPartNames.readable(name), name);
    assert.strictEqual(RRPartNames.readable(null), '');
    assert.strictEqual(RRPartNames.readable(undefined), '');
});

test('the words an exporter damaged are left out, and what tells two parts apart is kept', () => {
    const lost = LOST.repeat(3);
    assert.strictEqual(RRPartNames.readable(`Mesh_0007.rip_V${lost}t Li${lost}u.004_0`), 'Mesh_0007.rip_004_0');
    assert.strictEqual(RRPartNames.readable(`Mesh_0007.rip_V${lost}t Li${lost}u.005_0`), 'Mesh_0007.rip_005_0');
    assert.strictEqual(RRPartNames.readable(`Mesh_0023.rip_V${lost}t Li${lost}u.021_0`), 'Mesh_0023.rip_021_0');
    assert.strictEqual(RRPartNames.readable(`Body_${LOST}${LOST}`), 'Body');
    assert.ok(!RRPartNames.readable(`V${LOST}t`).includes(LOST), 'nothing a font cannot draw is shown');
    assert.strictEqual(RRPartNames.readable(`V${LOST}t`), 'Vt', 'a name that is all damage keeps its letters');
    assert.strictEqual(RRPartNames.readable(LOST + LOST), LOST + LOST, 'and one with nothing else is left as it is rather than shown empty');
});

test('the Demo motorcycle is such a file: every damaged name of it reads, and no two read alike', () => {
    const file = path.join(root, 'template/Demo/3d/Vehicles/kawashaki_ninja_h2/source/kawashaki_ninja_h2.glb');
    if (!fs.existsSync(file)) return;
    const bytes = fs.readFileSync(file), json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
    const names = Array.from(new Set((json.nodes || []).map(node => node.name).filter(Boolean)));
    const damaged = names.filter(name => name.includes(LOST));
    assert.ok(damaged.length > 0, 'the file carries the damage');
    const shown = names.map(RRPartNames.readable);
    for (const label of shown) assert.ok(label && !label.includes(LOST), label);
    assert.strictEqual(new Set(shown).size, shown.length, 'each part still has a name of its own');
});

test('the Motion editor and the 3D Models page show the readable name and store the part\'s own', () => {
    const motion = fs.readFileSync(path.join(root, 'editor/src/database/MotionEditor.js'), 'utf8');
    assert.match(motion, /const partName = part => part === '' \? tt\('Whole model'\) : typeof RRPartNames !== 'undefined' \? RRPartNames\.readable\(part\) : part;/);
    assert.match(motion, /<option value="\$\{rrEscapeHtml\(p\)\}">\$\{rrEscapeHtml\(partName\(p\)\)\}<\/option>/, 'the value is the stored name');
    const models = fs.readFileSync(path.join(root, 'editor/src/database/Database3DEditor.js'), 'utf8');
    assert.match(models, /items: parts\.map\(name => \(\{ id: name, label: Database3DEditor\.partLabel\(name\) \}\)\)/);
    assert.match(models, /label\.textContent = Database3DEditor\.partLabel\(name\);/);
    const html = fs.readFileSync(path.join(root, 'editor/index.html'), 'utf8');
    assert.ok(html.indexOf('src/utils/PartNames.js') > 0 && html.indexOf('src/utils/PartNames.js') < html.indexOf('src/database/MotionEditor.js'));
});
