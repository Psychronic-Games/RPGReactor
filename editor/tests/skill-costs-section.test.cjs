const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const api = require(path.join(editorRoot, 'src', 'database', 'SkillCostsSection.js'));
const { createDocument } = require('./helpers/card-dom.cjs');

// ---------------------------------------------------------------- helpers

// Cost code written for these tests in the shape a Skills and States Core
// cost type has: the skill's own tags matched on `note`, the battler's rate
// and flat tags kept in variables, a division on the way.
const code = lines => JSON.stringify(lines.join('\n'));
const head = ['const user = this;', 'const skill = arguments[0];', 'let cost = 0;', 'const note = skill.note;'];
const flatLine = word => `if (note.match(/<${word} COST:[ ](\\d+)>/i)) { cost += Number(RegExp.$1); }`;
const percentLine = word => `if (note.match(/<${word} COST:[ ](\\d+)([%％])>/i)) { cost += Math.ceil(Number(RegExp.$1) * user.mhp / 100); }`;
const tail = word => [
    `if (note.match(/<JS ${word} COST>\\s*([\\s\\S]*)\\s*<\\/JS ${word} COST>/i)) { eval(String(RegExp.$1)); }`,
    `const rateNote = /<${word} COST:[ ](\\d+\\.?\\d*)([%％])>/i;`,
    `const flatNote = /<${word} COST:[ ]([\\+\\-]\\d+)>/i;`,
    'cost = cost / 2 * 2; // halves, then doubles',
    `if (note.match(/<${word} COST MAX:[ ](\\d+)>/i)) { cost = Math.min(cost, Number(RegExp.$1)); }`,
    `if (note.match(/<${word} COST MIN:[ ](\\d+)>/i)) { cost = Math.max(cost, Number(RegExp.$1)); }`,
    'return Math.round(cost);'
];
const struct = (name, lines, icon = 0) => JSON.stringify({ 'Name:str': name, 'Icon:num': String(icon), 'CalcJS:func': code(lines) });

const HP = struct('HP', head.concat(flatLine('HP'), percentLine('HP'), tail('HP')));
const MP = struct('MP', head.concat('cost = Math.floor(skill.mpCost * user.mcr);', percentLine('MP'), tail('MP')));
const TP = struct('TP', head.concat('cost = skill.tpCost;', percentLine('TP'), tail('TP')));
const GOLD = struct('Gold', head.concat(flatLine('GOLD'), percentLine('GOLD'), tail('GOLD')), 314);
const BP = struct('BP', head.concat(flatLine('BP'), tail('BP')), 77);
const ITEMS = struct('Item Cost', ['const note = arguments[0].note;', 'const cost = { items: {}, weapons: {}, armors: {} };'].concat(
    [['ITEM', '$dataItems', 'items'], ['WEAPON', '$dataWeapons', 'weapons'], ['ARMOR', '$dataArmors', 'armors']].flatMap(([word, data, key]) => [
        `{ const notetag = /<${word} COST:[ ](\\d+)[ ](.*)>/gi; const matches = note.match(notetag);`,
        '  if (matches) for (const each of matches) { each.match(notetag);',
        `    const name = String(RegExp.$2).toUpperCase().trim(); const entry = ${data}.find(obj => obj && obj.name.toUpperCase().trim() === name);`,
        `    if (entry) cost.${key}[entry.id] = Number(RegExp.$1); } }`,
        `{ const rate = /<${word} COST:[ ](\\d+)([%％])[ ](.*)>/gi; }`
    ]), 'return cost;'));
const ODD = struct('Charge', head.concat('if (note.match(/<CHARGES? (\\d+) OF (\\d+)>/i)) { cost = Number(RegExp.$1); }', 'return cost;'));
const DECIMAL = struct('Rage', head.concat(flatLine('RAGE'), 'if (note.match(/<RAGE COST:[ ](\\d+\\.?\\d*)([%％])>/i)) { cost += 1; }', 'return cost;'));
const SILENT = struct('Luck', head.concat('cost = user.luk;', 'return cost;'));

const manifest = (structs, status = true) => [
    { name: 'Other', status: true, description: '', parameters: {} },
    { name: 'VisuMZ_1_SkillsStatesCore', status, description: '', parameters: { 'Costs:arraystruct': JSON.stringify(structs) } }
];
const ALL = [HP, MP, TP, GOLD, BP, ITEMS, ODD, DECIMAL, SILENT];
const types = structs => api.costTypes(manifest(structs));
const typeOf = (structs, name) => types(structs).find(type => type.name === name);

const tick = () => new Promise(resolve => setTimeout(resolve, 5));

/** A Skills page small enough for the card: the Note, the MP and TP fields, each kept the way the page keeps them. */
function page(record, structs, extra = {}) {
    const { document } = createDocument();
    const detail = document.createElement('div');
    detail.id = 'database-detail';
    detail.innerHTML = `<input type="number" data-field="mpCost" data-skill-id="${record.id}" value="${record.mpCost || 0}">`
        + `<input type="number" data-field="tpCost" data-skill-id="${record.id}" value="${record.tpCost || 0}">`
        + `<textarea data-field="note" data-skill-id="${record.id}"></textarea>`;
    document.body.appendChild(detail);
    const manager = {
        saves: 0,
        getSkill: () => record,
        updateSkill() { this.saves++; },
        getSystem: () => extra.system || {},
        getItems: () => extra.items || [null, { id: 1, name: 'Potion', iconIndex: 176 }, { id: 2, name: 'Ether', iconIndex: 177 }, { id: 3, name: 'potion', iconIndex: 1 }],
        getWeapons: () => [null, { id: 1, name: 'Sword', iconIndex: 97 }],
        getArmors: () => [null, { id: 1, name: 'Shield', iconIndex: 128 }]
    };
    const note = detail.querySelector('textarea');
    note.value = String(record.note || '').replace(/\r\n?/g, '\n');
    for (const field of detail.querySelectorAll('[data-skill-id]')) {
        field.addEventListener('change', () => {
            const name = field.dataset.field;
            // A browser's textarea gives every line end as a line feed.
            record[name] = name === 'note' ? field.value.replace(/\r\n?/g, '\n') : parseInt(field.value) || 0;
            manager.updateSkill(record.id, record);
        });
    }
    globalThis.document = document;
    let section;
    try { section = api.createSection({ record, databaseManager: manager, manifest: manifest(structs) }); } finally { delete globalThis.document; }
    if (section) detail.appendChild(section);
    const line = name => section.querySelectorAll('tbody tr').filter(row => row.querySelector('td[data-rr-i18n-skip]')?.textContent.trim() === name);
    const field = (row, name) => row.querySelector(`[data-cost-field="${name}"]`);
    // What a row says on the line under it, '' while that line is hidden.
    const said = row => { const flags = section.querySelector(`tr[data-flags-at="${row.dataset.at}"]`); return flags.hidden ? '' : flags.textContent; };
    return { document, detail, section, manager, note, line, field, said, mp: detail.querySelector('[data-field="mpCost"]') };
}

// -------------------------------------------------------------- discovery

test('no card without an enabled Skills and States Core that defines cost types', () => {
    assert.deepEqual(api.costTypes(null), []);
    assert.deepEqual(api.costTypes([]), []);
    assert.deepEqual(api.costTypes(manifest(ALL, false)), [], 'disabled');
    assert.deepEqual(api.costTypes([{ name: 'VisuMZ_1_SkillsStatesCore', status: true, parameters: {} }]), [], 'no parameter');
    assert.deepEqual(api.costTypes([{ name: 'VisuMZ_1_SkillsStatesCore', status: true, parameters: { 'Costs:arraystruct': '[{broken' } }]), [], 'malformed');
    assert.deepEqual(api.costTypes(manifest([SILENT])), [], 'a cost that reads nothing from the Note');
    assert.equal(api.createSection({ record: { id: 1, note: '' }, manifest: manifest(ALL) }), null, 'no document');
    const { document } = createDocument();
    globalThis.document = document;
    try {
        assert.equal(api.createSection({ record: { id: 1, note: '' }, manifest: manifest(ALL, false) }), null);
        assert.equal(api.createSection({ record: { id: 1, note: '' }, manifest: [] }), null);
        assert.equal(api.createSection({ record: { id: 1, note: '' }, manifest: null }), null);
    } finally { delete globalThis.document; }
});

test('patterns are found by their opening bracket, and a division is not one', () => {
    const found = api.tagLiterals('const a = b / 2; if (note.match(/<X COST:[ ](\\d+)>/i)) { c = d / e; } // </done>\nconst r = /<X COST:[ ]([/]+)>/gi;');
    assert.deepEqual(found.map(each => each.source), ['<X COST:[ ](\\d+)>', '<X COST:[ ]([/]+)>']);
    assert.deepEqual(found.map(each => [each.onNote, each.global]), [[true, false], [false, true]]);
    assert.deepEqual(api.tagLiterals('x = /<(unclosed/i'), [], 'a pattern that does not compile is left out');
});

test('each cost type offers the forms its own patterns read back', () => {
    const shape = type => [type.type, type.word, Object.keys(type.forms).sort().join(','), type.native];
    assert.deepEqual(shape(typeOf(ALL, 'HP')), ['scalar', 'HP', 'flat,js,max,min,percent', '']);
    assert.deepEqual(shape(typeOf(ALL, 'MP')), ['scalar', 'MP', 'js,max,min,percent', 'mpCost']);
    assert.deepEqual(shape(typeOf(ALL, 'TP')), ['scalar', 'TP', 'js,max,min,percent', 'tpCost']);
    assert.deepEqual(shape(typeOf(ALL, 'Gold')), ['scalar', 'Gold', 'flat,js,max,min,percent', '']);
    assert.deepEqual(shape(typeOf(ALL, 'BP')), ['scalar', 'BP', 'flat,js,max,min', ''], 'no percent pattern, no percent');
    assert.deepEqual(shape(typeOf(ALL, 'Rage')), ['scalar', 'Rage', 'flat', ''], 'a percent that takes decimals is not taken for the skill\'s own');
    assert.equal(typeOf(ALL, 'Charge').type, 'other');
    assert.equal(typeOf(ALL, 'Luck'), undefined);
    const items = typeOf(ALL, 'Item Cost');
    assert.equal(items.type, 'items');
    assert.deepEqual(items.items.map(each => each.kind), ['item', 'weapon', 'armor']);
    assert.equal(typeOf(ALL, 'Gold').icon, 314);
    // What the card writes is what the type's own pattern reads.
    for (const type of types(ALL).filter(each => each.type === 'scalar')) {
        for (const kind of ['flat', 'percent', 'max', 'min']) {
            if (!type.forms[kind]) continue;
            assert.equal(type.forms[kind].regex.exec(api.formatTag(type.word, kind, 42))[1], '42', `${type.name} ${kind}`);
        }
    }
});

// ------------------------------------------------------------ note edits

test('reading takes the first tag of each form and counts the rest', () => {
    const gold = typeOf(ALL, 'Gold');
    const state = api.read(gold, 'a\n<gold cost: 30>\n<Gold Cost: 5%>\n<GOLD COST: 99>\n<Gold Cost Max: 500>\n<JS Gold Cost>\ncost += 1;\n</JS Gold Cost>', {});
    assert.deepEqual(state.flat, { value: 30, count: 2 });
    assert.deepEqual(state.percent, { value: 5, count: 1 });
    assert.deepEqual(state.max, { value: 500, count: 1 });
    assert.equal(state.min, null);
    assert.equal(state.js, true);
    const mp = api.read(typeOf(ALL, 'MP'), '<MP Cost: 12>', { mpCost: 7 });
    assert.equal(mp.native, 7);
    assert.equal(mp.override, true, 'the plugin copies a flat MP tag over the field');
    assert.equal(api.read(typeOf(ALL, 'MP'), '<MP Cost: 12%>', { mpCost: 7 }).override, false);
    assert.equal(api.tagCount(typeOf(ALL, 'Charge'), '<Charge 1 of 3> text <charges 2 of 3>'), 2);
});

test('a value is changed where it stands, added on its own line, or removed with its line', () => {
    const gold = typeOf(ALL, 'Gold');
    assert.equal(api.setValue('', gold, 'flat', 100), '<Gold Cost: 100>');
    assert.equal(api.setValue('<Hide in Battle>', gold, 'flat', 100), '<Hide in Battle>\n<Gold Cost: 100>');
    assert.equal(api.setValue('a\r\nb', gold, 'percent', 5), 'a\r\nb\r\n<Gold Cost: 5%>', 'the note\'s own line ends');
    assert.equal(api.setValue('a\n', gold, 'max', 9), 'a\n<Gold Cost Max: 9>\n');
    assert.equal(api.setValue('x <gOLD   cost: 007> y\nz', gold, 'flat', 7), 'x <gOLD   cost: 007> y\nz\n<Gold Cost: 7>', 'a tag the pattern does not read is not the cost: it is left alone');
    assert.equal(api.setValue('x <gOLD cost: 30> y\nz', gold, 'flat', 45), 'x <gOLD cost: 45> y\nz', 'spelling and place kept');
    assert.equal(api.setValue('<Gold Cost: 30>', gold, 'flat', 30), '<Gold Cost: 30>');
    assert.equal(api.setValue('<Gold Cost: 030>', gold, 'flat', 30), '<Gold Cost: 30>', 'a changed spelling of the number is a change');
    assert.equal(api.setValue('a\r\n<Gold Cost: 30>\r\nb', gold, 'flat', 0), 'a\r\nb');
    assert.equal(api.setValue('a\r\n<Gold Cost: 30>', gold, 'flat', 0), 'a');
    assert.equal(api.setValue('<Gold Cost: 30>\nb', gold, 'flat', 0), 'b');
    assert.equal(api.setValue('a <Gold Cost: 30> b', gold, 'flat', 0), 'a  b', 'a tag among words leaves the words');
    assert.equal(api.setValue('<Gold Cost: 30>\n<Gold Cost: 40>\n<Gold Cost: 5%>', gold, 'flat', 0), '<Gold Cost: 5%>', 'every tag of the form goes, the other form stays');
    assert.equal(api.setValue('<Gold Cost: 30>', gold, 'flat', -4), '', 'below nothing is nothing');
    assert.equal(api.setValue('<Gold Cost: 30>', gold, 'flat', '12.9'), '<Gold Cost: 12>');
    const bp = typeOf(ALL, 'BP');
    assert.equal(api.setValue('<BP Cost: 1>', bp, 'percent', 5), '<BP Cost: 1>', 'a form the type does not read is never written');
});

test('changing the unit rewrites the one tag where it stood', () => {
    const gold = typeOf(ALL, 'Gold');
    assert.equal(api.convert('a\n<gold cost: 30>\nb', gold, 'flat', 'percent', 30), 'a\n<Gold Cost: 30%>\nb');
    assert.equal(api.convert('a\n<Gold Cost: 30%>\nb', gold, 'percent', 'flat', 30), 'a\n<Gold Cost: 30>\nb');
    assert.equal(api.convert('<Gold Cost: 30>\n<Gold Cost: 40>', gold, 'flat', 'percent', 30), '<Gold Cost: 30%>', 'no tag of the old unit is left');
    assert.equal(api.convert('<Gold Cost: 30>\n<Gold Cost: 5%>', gold, 'flat', 'percent', 30), '<Gold Cost: 30%>', 'a tag of the new unit takes the value');
});

test('writing back what was read changes nothing', () => {
    const notes = ['', 'plain', '<Gold Cost: 100>', 'a\r\n<HP Cost: 5%>\r\n<HP Cost: 20>\r\n', '<gold cost: 007>\n<Gold Cost Max: 1>\n<Gold Cost Max: 2>', '<BP Cost: 0>', '<MP Cost: 25%> <TP Cost Min: 3>'];
    for (const note of notes) {
        let out = note;
        for (const type of types(ALL).filter(each => each.type === 'scalar')) {
            const state = api.read(type, note, {});
            for (const kind of ['flat', 'percent', 'max', 'min']) if (state[kind] && state[kind].value > 0) out = api.setValue(out, type, kind, note.includes('007') ? '007' : state[kind].value);
        }
        assert.equal(out === note || note.includes('007'), true, JSON.stringify(note));
    }
});

test('item costs are read as the plugin reads them and written by name', () => {
    const items = typeOf(ALL, 'Item Cost');
    const note = '<Item Cost: 3 Potion>\ntext\n<weapon cost: 1 Sword>\n<Item Cost: 5 potion>\n<Armor Cost: 2 Nothing>';
    const found = api.readItems(items, note);
    assert.deepEqual(found.map(each => [each.kind, each.amount, each.name]), [['item', 3, 'Potion'], ['weapon', 1, 'Sword'], ['item', 5, 'potion'], ['armor', 2, 'Nothing']]);
    const list = [null, { id: 1, name: 'Potion' }, { id: 2, name: ' potion ' }];
    assert.deepEqual(api.resolveItem('POTION', list), { record: list[1], twins: 2 });
    assert.deepEqual(api.resolveItem('Nothing', list), { record: null, twins: 0 });
    assert.equal(api.setItem('', items, 'item', 'Ether', 2), '<Item Cost: 2 Ether>');
    assert.equal(api.setItem(note, items, 'item', 'POTION', 9), note.replace('5 potion', '9 potion'), 'the last tag of a name is the one the plugin keeps');
    assert.equal(api.setItem(note, items, 'item', 'Potion', 5), note);
    assert.equal(api.setItem(note, items, 'weapon', 'Sword', 0), note.replace('<weapon cost: 1 Sword>\n', ''));
    assert.equal(api.setItem(note, items, 'item', 'A>B', 1), note, 'a name a tag cannot hold is not written');
    assert.equal(api.setItemAmountAt(note, items, found[0].at, 4), note.replace('3 Potion', '4 Potion'));
    assert.equal(api.setItemAmountAt(note, items, found[3].at, 0), note.replace('\n<Armor Cost: 2 Nothing>', ''));
    assert.equal(api.removeItemAt(note, items, found[1].at), note.replace('<weapon cost: 1 Sword>\n', ''));
    assert.deepEqual(api.itemNames([null, { name: 'Potion', iconIndex: 4 }, { name: 'potion' }, { name: '' }, { name: 'A>B' }, { name: 'Ether' }]).map(each => each.name), ['Potion', 'Ether']);
});

// ---------------------------------------------------------------- the card

test('the card shows what the note sets and writes nothing by being shown', async () => {
    const record = { id: 4, mpCost: 12, tpCost: 0, note: 'keep\r\n<Gold Cost: 100>\r\n<HP Cost: 5%>\r\n<Item Cost: 3 Potion>' };
    const before = JSON.stringify(record);
    const { section, manager, line, field, note } = page(record, ALL);
    await tick();
    assert.ok(section);
    assert.equal(section.querySelector('.database-section-header').dataset.sectionKey, 'skill-costs');
    assert.match(section.querySelector('.rr-cost-native-note').textContent, /Value is the cost field under Invocation/, 'MP and TP are explained where they are listed');
    assert.equal(page({ id: 5, note: '' }, [BP]).section.querySelector('.rr-cost-native-note'), null, 'and not where neither is a cost type');
    assert.equal(field(line('Gold')[0], 'amount').value, '100');
    assert.equal(field(line('Gold')[0], 'unit').value, 'flat');
    assert.equal(field(line('HP')[0], 'amount').value, '5');
    assert.equal(field(line('HP')[0], 'unit').value, 'percent');
    assert.equal(field(line('MP')[0], 'amount').value, '12', 'MP shows the record\'s own field');
    assert.equal(field(line('BP')[0], 'unit'), null, 'one form, no unit to choose');
    assert.equal(field(line('BP')[0], 'max').value, '');
    assert.equal(field(line('Rage')[0], 'max'), null);
    assert.equal(line('Potion').length, 1, 'the item cost has a row of its own');
    assert.equal(line('Charge').length, 1);
    // Fields set to what they already show.
    for (const input of section.querySelectorAll('[data-cost-field]')) if (input.tagName !== 'BUTTON') input.choose(input.value);
    await tick();
    assert.equal(JSON.stringify(record), before);
    assert.equal(manager.saves, 0);
    assert.equal(note.value, 'keep\n<Gold Cost: 100>\n<HP Cost: 5%>\n<Item Cost: 3 Potion>');
});

test('a field of the card writes the tag through the Note, with the note\'s line ends', async () => {
    const record = { id: 4, mpCost: 0, tpCost: 0, note: 'keep\r\n<Gold Cost: 100>' };
    const { manager, line, field } = page(record, ALL);
    await tick();
    field(line('Gold')[0], 'amount').choose('250');
    assert.equal(record.note, 'keep\r\n<Gold Cost: 250>', 'the record keeps the line ends the page\'s field drops');
    assert.equal(manager.saves, 1);
    field(line('BP')[0], 'amount').choose('2');
    assert.equal(record.note, 'keep\r\n<Gold Cost: 250>\r\n<BP Cost: 2>');
    field(line('BP')[0], 'max').choose('3');
    assert.equal(record.note, 'keep\r\n<Gold Cost: 250>\r\n<BP Cost: 2>\r\n<BP Cost Max: 3>');
    field(line('Gold')[0], 'unit').choose('percent');
    assert.equal(record.note, 'keep\r\n<Gold Cost: 250%>\r\n<BP Cost: 2>\r\n<BP Cost Max: 3>');
    assert.equal(field(line('Gold')[0], 'unit').value, 'percent');
    field(line('Gold')[0], 'amount').choose('0');
    field(line('BP')[0], 'amount').choose('');
    field(line('BP')[0], 'max').choose('');
    assert.equal(record.note, 'keep');
});

test('MP is the record\'s own field as a value and a tag as a percent', async () => {
    const record = { id: 4, mpCost: 10, tpCost: 0, note: '' };
    const { line, field, mp, note, said } = page(record, ALL);
    await tick();
    assert.equal(said(line('MP')[0]), '');
    field(line('MP')[0], 'amount').choose('15');
    assert.equal(record.mpCost, 15);
    assert.equal(mp.value, '15');
    assert.equal(record.note, '');
    field(line('MP')[0], 'unit').choose('percent');
    assert.equal(record.note, '<MP Cost: 15%>');
    assert.equal(record.mpCost, 0);
    assert.equal(mp.value, '0');
    field(line('MP')[0], 'unit').choose('flat');
    assert.equal(record.note, '');
    assert.equal(record.mpCost, 15);
    // The page's own field changed by hand shows on the card.
    mp.choose('22');
    assert.equal(field(line('MP')[0], 'amount').value, '22');
    // Both at once: two rows, each its own.
    note.choose('<MP Cost: 5%>');
    assert.equal(line('MP').length, 2);
    assert.deepEqual(line('MP').map(row => field(row, 'amount').value), ['22', '5']);
    field(line('MP')[1], 'amount').choose('0');
    assert.equal(record.note, '');
    assert.equal(line('MP').length, 1);
    // A flat tag the plugin copies over the field is said so.
    note.choose('<MP Cost: 99>');
    assert.match(said(line('MP')[0]), /replaces the field/);
});

test('a pool the project turned off has no row unless the note still sets it', async () => {
    globalThis.ResourcePools = require(path.join(editorRoot, 'src', 'database', 'ResourcePools.js'));
    try {
        const off = page({ id: 4, mpCost: 0, tpCost: 0, note: '' }, ALL, { system: { rrPoolsOff: ['tp'] } });
        await tick();
        assert.equal(off.line('TP').length, 0);
        assert.equal(off.line('MP').length, 1);
        const set = page({ id: 4, mpCost: 0, tpCost: 0, note: '<TP Cost: 5%>' }, ALL, { system: { rrPoolsOff: ['tp'] } });
        await tick();
        assert.equal(set.line('TP').length, 1);
    } finally { delete globalThis.ResourcePools; }
});

test('item costs are added, changed and deleted from the card', async () => {
    const record = { id: 4, mpCost: 0, tpCost: 0, note: '<Item Cost: 3 Potion>\n<Item Cost: 1 Gone>' };
    const { section, line, field, said } = page(record, ALL);
    await tick();
    assert.match(said(line('Gone')[0]), /No record has this name/);
    assert.match(said(line('Potion')[0]), /Several records have this name/);
    const add = line('Item Cost')[0];
    assert.deepEqual(field(add, 'add-name').querySelectorAll('option').map(option => option.value), ['Potion', 'Ether']);
    field(add, 'add-kind').choose('weapon');
    assert.deepEqual(field(add, 'add-name').querySelectorAll('option').map(option => option.value), ['Sword']);
    field(add, 'add-amount').value = '2';
    field(add, 'add').click();
    assert.equal(record.note, '<Item Cost: 3 Potion>\n<Item Cost: 1 Gone>\n<Weapon Cost: 2 Sword>');
    field(line('Potion')[0], 'item').choose('7');
    assert.equal(record.note, '<Item Cost: 7 Potion>\n<Item Cost: 1 Gone>\n<Weapon Cost: 2 Sword>');
    field(line('Gone')[0], 'remove').click();
    assert.equal(record.note, '<Item Cost: 7 Potion>\n<Weapon Cost: 2 Sword>');
    assert.equal(section.querySelectorAll('[data-cost-field="remove"]').length, 2);
});

test('the Skills page loads and places the card', () => {
    const editor = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseSkillEditor.js'), 'utf8');
    assert.match(editor, /window\.RRSkillCosts\?\.createSection\(/);
    assert.ok(editor.indexOf('RRSkillCosts') > editor.indexOf('appendChild(invocationSection)'), 'after Invocation');
    const index = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    assert.ok(index.indexOf('src/database/SkillCostsSection.js') > 0);
    assert.ok(index.indexOf('src/database/SkillCostsSection.js') < index.indexOf('src/database/DatabaseSkillEditor.js'));
});
