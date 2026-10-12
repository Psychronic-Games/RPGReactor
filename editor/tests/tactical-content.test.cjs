'use strict';
// The Demo's tactical content (scratchpad/tactical-content, applied by
// scratchpad/tactical/apply-demo.cjs): the merge into a copy of the Demo
// keeps every record that was there, names only things that exist, writes
// battle settings the tactical and the action runtime read (as the record's
// own `rrBattle`, none as a tag in its Note), formulas that evaluate at every
// level, and changes nothing on a second run. The generator lives in the
// gitignored scratchpad: without it (a fresh clone) the tests skip.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const repo = path.resolve(__dirname, '../..');
const generator = path.join(repo, 'scratchpad/tactical-content');
const demo = path.join(repo, 'template/Demo');
const missing = [path.join(generator, 'build.cjs'), path.join(generator, 'make-copy.cjs'), path.join(demo, 'data/System.json'), path.join(demo, '3d/Weapons')].filter(file => !fs.existsSync(file));
const skip = missing.length ? 'the tactical content generator or the Demo is not on disk here' : false;

const TABLES = ['Skills', 'Items', 'Weapons', 'Armors', 'States', 'Classes', 'Actors', 'Enemies', 'Troops'];
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));

let cached = null;
/** A copy of the Demo with the content applied, what the Demo held before, and the build's own account. */
function applied() {
    if (cached) return cached;
    const { makeCopy } = require(path.join(generator, 'make-copy.cjs'));
    const { apply } = require(path.join(generator, 'apply.cjs'));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-tactical-'));
    const project = makeCopy(path.join(dir, 'Demo'), { light: true });
    const before = {};
    for (const name of TABLES) before[name] = json(path.join(project, 'data', name + '.json'));
    const result = apply(project, { log: () => {} });
    const data = name => json(path.join(project, 'data', name + '.json'));
    cached = { dir, project, before, result, data, content: require(path.join(generator, 'content.cjs')), formula: require(path.join(generator, 'formula.cjs')) };
    return cached;
}
test.after(() => { if (cached) fs.rmSync(cached.dir, { recursive: true, force: true }); });

/** The names this content gives its records, by table. */
function ownNames(content) {
    return { Skills: content.SKILLS, Items: content.ITEMS, Weapons: content.WEAPONS, Armors: content.ARMORS, States: content.STATES, Classes: content.CLASSES, Actors: content.ACTORS, Enemies: content.ENEMIES, Troops: content.TROOPS };
}

/** The alpha channel of an 8-bit RGBA PNG, row by row. */
function pngAlpha(file) {
    const png = fs.readFileSync(file);
    let offset = 8, width = 0, height = 0, type = 0;
    const idat = [];
    while (offset < png.length) {
        const length = png.readUInt32BE(offset), kind = png.toString('ascii', offset + 4, offset + 8);
        if (kind === 'IHDR') { width = png.readUInt32BE(offset + 8); height = png.readUInt32BE(offset + 12); type = png[offset + 17]; assert.equal(png[offset + 16], 8); assert.equal(png[offset + 20], 0); }
        if (kind === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length));
        offset += 12 + length;
    }
    assert.equal(type, 6, 'the icon sheet is RGBA');
    const raw = zlib.inflateSync(Buffer.concat(idat)), stride = width * 4, alpha = new Uint8Array(width * height);
    let previous = new Uint8Array(stride);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)], line = new Uint8Array(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
        for (let x = 0; x < stride; x++) {
            const a = x >= 4 ? line[x - 4] : 0, b = previous[x], c = x >= 4 ? previous[x - 4] : 0;
            if (filter === 1) line[x] = (line[x] + a) & 255;
            else if (filter === 2) line[x] = (line[x] + b) & 255;
            else if (filter === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
            else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
        }
        for (let x = 0; x < width; x++) alpha[y * width + x] = line[x * 4 + 3];
        previous = line;
    }
    return { width, height, alpha };
}

test('a second run changes nothing', { skip }, () => {
    const { project } = applied();
    const { build } = require(path.join(generator, 'build.cjs'));
    assert.deepEqual(Object.keys(build(project).files), []);
});

test('every record the Demo had keeps its id and, unless the plan names it, every field', { skip }, () => {
    const { before, data, content } = applied();
    const own = ownNames(content);
    const planned = { Classes: Object.values(content.DEMO.classes), Actors: Object.values(content.DEMO.actors) };
    for (const name of TABLES) {
        const now = data(name), mine = new Set(own[name].map(record => record.name));
        assert.ok(now.length >= before[name].length, name + ' lost records');
        for (let id = 1; id < before[name].length; id++) {
            const was = before[name][id];
            if (!was || mine.has(was.name)) continue;
            assert.equal(now[id].id, was.id);
            assert.equal(now[id].name, was.name);
            if (!(planned[name] || []).includes(id)) { assert.deepEqual(now[id], was, `${name} ${id} ${was.name} changed`); continue; }
            if (name === 'Classes') {
                assert.deepEqual(now[id].params, was.params);
                for (const learning of was.learnings) assert.ok(now[id].learnings.some(l => l.skillId === learning.skillId && l.level === learning.level), `class ${id} forgot a skill`);
                for (const trait of was.traits) assert.ok(now[id].traits.some(t => t.code === trait.code && t.dataId === trait.dataId && t.value === trait.value), `class ${id} lost a trait`);
                // Its Note keeps every line but its battle tags, which are its own settings now; it plays as it did, plus what it gains.
                const T = require('../src/database/TacticsSection.js');
                assert.equal(now[id].note, T.convert('class', was).note, `class ${id}: the Note`);
                assert.deepEqual(T.convert('class', now[id]).moved, [], `class ${id}: no battle tag left in its Note`);
                const played = T.recordTactics(was) || {}, plays = T.recordTactics(now[id]) || {};
                for (const key of Object.keys(played)) assert.deepEqual(plays[key], played[key], `class ${id}: ${key}`);
            } else {
                const changed = Object.keys(was).filter(key => JSON.stringify(was[key]) !== JSON.stringify(now[id][key]));
                assert.deepEqual(changed.filter(key => !['classId', 'equips', 'initialLevel'].includes(key)), [], `actor ${id} changed more than its role`);
            }
        }
        // Each of the content's records is there exactly once.
        for (const record of own[name]) assert.equal(now.filter(r => r && r.name === record.name).length, 1, `${name}: ${record.name}`);
    }
});

test('animations, sounds, icons, sequences, models and variants named by the content all exist', { skip }, () => {
    const { project, data, content, result } = applied();
    const animations = data('Animations'), sequences = data('ActionSequences'), presentation = data('BattlePresentation'), bindings = data('Database.r3d');
    const effects = new Set(fs.readdirSync(path.join(demo, 'effects')).map(file => file.replace(/\.[^.]+$/, '')));
    const sounds = new Set(fs.readdirSync(path.join(demo, 'audio/se')).map(file => file.replace(/\.[^.]+$/, '')));
    const sheet = pngAlpha(path.join(demo, 'img/system/IconSet.png'));
    const iconDrawn = index => {
        const x0 = (index % 16) * 32, y0 = Math.floor(index / 16) * 32;
        if (y0 + 32 > sheet.height) return false;
        for (let y = y0; y < y0 + 32; y++) for (let x = x0; x < x0 + 32; x++) if (sheet.alpha[y * sheet.width + x] > 16) return true;
        return false;
    };
    const B = require('../src/battle/BattleData.js');
    const own = ownNames(content);
    for (const [name, group] of [['Skills', 'skills'], ['Items', 'items'], ['Weapons', 'weapons']]) {
        const table = data(name);
        for (const entry of own[name]) {
            const record = table.find(r => r && r.name === entry.name);
            assert.ok(iconDrawn(record.iconIndex), `${entry.name}: icon ${record.iconIndex} is an empty cell`);
            if (record.animationId > 0) {
                const animation = animations[record.animationId];
                assert.ok(animation && animation.name, `${entry.name}: animation ${record.animationId}`);
                if (animation.effectName) assert.ok(effects.has(animation.effectName), `${entry.name}: effect ${animation.effectName}`);
                for (const timing of animation.soundTimings || []) if (timing.se && timing.se.name) assert.ok(sounds.has(timing.se.name), `${entry.name}: sound ${timing.se.name}`);
            }
            const assigned = presentation[group][String(record.id)];
            if (entry.seq || name === 'Weapons') {
                assert.equal(assigned.mode, 'sequence');
                const sequence = sequences[assigned.sequenceId];
                assert.ok(sequence && sequence.id === assigned.sequenceId, `${entry.name}: sequence ${assigned.sequenceId}`);
                assert.deepEqual(B.validateSequence(sequence), [], `${entry.name}: ${sequence.name}`);
                assert.equal(B.purpose(sequence), 'action');
            }
        }
    }
    for (const name of ['Armors', 'States']) for (const entry of own[name]) {
        const record = data(name).find(r => r && r.name === entry.name);
        assert.ok(iconDrawn(record.iconIndex), `${entry.name}: icon ${record.iconIndex} is an empty cell`);
    }
    // The new sequences: valid, and every sound on disk.
    for (const id of Object.values(result.ids.sequences)) {
        assert.deepEqual(B.validateSequence(sequences[id]), []);
        for (const step of sequences[id].steps) if (step.type === 'sound') assert.ok(sounds.has(step.audio.name), `${sequences[id].name}: ${step.audio.name}`);
    }
    // Every bound model has its file, and the variant it wears is in the model's sidecar.
    const checkSpec = (spec, label) => {
        assert.ok(fs.existsSync(path.join(demo, '3d', spec.name, 'source', spec.file + spec.ext)), `${label}: ${spec.name}/source/${spec.file}${spec.ext}`);
        const sidecar = json(path.join(project, '3d', spec.name, 'model.json'));
        assert.ok((sidecar.variants || []).some(v => v.name === spec.variant), `${label}: no variant "${spec.variant}" on ${spec.name}`);
    };
    for (const w of content.WEAPONS) checkSpec(bindings.weapons[String(result.ids.weapons[w.key])], w.name);
    for (const e of content.ENEMIES) checkSpec(bindings.enemies[String(result.ids.enemies[e.key])], e.name);
    for (const a of content.ACTORS) { checkSpec(bindings.actors[String(result.ids.actors[a.key])].character, a.name); checkSpec(bindings.actors[String(result.ids.actors[a.key])].battler, a.name); }
    // Class skills, enemy actions, attack skills, states in effects, equipment: every id names a record.
    const skills = data('Skills'), states = data('States'), weapons = data('Weapons'), armors = data('Armors'), classes = data('Classes'), system = data('System');
    for (const record of data('Classes').filter(Boolean)) for (const learning of record.learnings) assert.ok(skills[learning.skillId] && skills[learning.skillId].name, `class ${record.name} learns ${learning.skillId}`);
    for (const entry of own.Enemies) for (const action of data('Enemies').find(r => r && r.name === entry.name).actions) assert.ok(skills[action.skillId].name);
    for (const table of [skills, data('Items')]) for (const record of table.filter(Boolean)) for (const effect of record.effects || []) if (effect.code === 21 || effect.code === 22) assert.ok(effect.dataId === 0 || states[effect.dataId], `${record.name}: state ${effect.dataId}`);
    for (const entry of own.Weapons) {
        const record = weapons.find(r => r && r.name === entry.name);
        assert.ok(system.weaponTypes[record.wtypeId], `${entry.name}: weapon type`);
        for (const trait of record.traits) { if (trait.code === 35) assert.ok(skills[trait.dataId].name); if (trait.code === 32) assert.ok(states[trait.dataId].name); }
    }
    for (const record of data('Actors').filter(Boolean)) {
        assert.ok(classes[record.classId] && classes[record.classId].name, `${record.name}: class`);
        record.equips.forEach((id, slot) => { if (id) assert.ok((slot === 0 ? weapons : armors)[id], `${record.name}: equipment ${id}`); });
    }
});

test('every battle setting the content writes is the record\'s own, one the tactical or the action runtime reads, and none is left as a tag', { skip }, () => {
    const { data, content, formula } = applied();
    const { fightWorld } = require('./helpers/fight-world.cjs');
    const T = require('../src/database/TacticsSection.js');
    const F = fightWorld({ tactical: true, action: true }).ReactorFight;
    const kinds = { Skills: 'skill', Items: 'item', Weapons: 'weapon', Armors: 'armor', States: 'state', Classes: 'class', Enemies: 'enemy' };
    const TACTICAL = ['range', 'area', 'los', 'move', 'jump', 'ai'], ACTION = ['fireRate', 'magazine', 'reload', 'spread', 'projectile', 'combo'];
    const read = record => { const out = {}; for (const from of [F.recordTactics(record), F.Action.settings(record)]) for (const [key, value] of Object.entries(from || {})) if (value !== null) out[key] = JSON.parse(JSON.stringify(value)); return out; };
    const own = ownNames(content);
    let set = 0;
    for (const name of Object.keys(kinds)) {
        for (const entry of own[name]) {
            const record = data(name).find(r => r && r.name === entry.name);
            // Nothing of a battle is said in the Note: no tag of the cards, and nothing a conversion would still move.
            assert.doesNotMatch(record.note, /<\s*(range|area|los|move|jump|ai|fire\s*rate|magazine|reload|spread|projectile|combo|cooldown|unit\s*character)\s*:/i, `${entry.name}: a tag in its Note`);
            assert.deepEqual(T.convert(kinds[name], record).moved, [], entry.name);
            // What the tables say of it, as tags, is what the record sets and what the game reads from it.
            const said = name === 'Weapons' ? [formula.WEAPON_CLASSES[entry.class].tags, entry.action].filter(Boolean).join('\n')
                : name === 'Armors' ? (entry.tags != null ? entry.tags : ((entry.class && formula.ARMOR_CLASSES[entry.class].tags) || ''))
                : name === 'Classes' ? (formula.ROLES[entry.role].move !== 4 ? `<move: ${formula.ROLES[entry.role].move}>` : '')
                : name === 'Enemies' ? [formula.ENEMY_ROLES[entry.role].move !== 4 ? `<move: ${formula.ENEMY_ROLES[entry.role].move}>` : '', entry.ai !== 'aggressive' ? `<ai: ${entry.ai}>` : ''].filter(Boolean).join('\n')
                : entry.tags || '';
            assert.deepEqual(read(record), read({ note: said }), `${entry.name}: plays as ${JSON.stringify(said)}`);
            if (!said) { assert.equal('rrBattle' in record, false, `${entry.name}: nothing to set, no rrBattle`); continue; }
            set++;
            const keys = Object.keys(record.rrBattle);
            assert.deepEqual(keys.slice().sort(), Object.keys(read(record)).sort(), `${entry.name}: every key of ${JSON.stringify(record.rrBattle)} is read`);
            for (const key of keys) assert.ok(TACTICAL.includes(key) || (ACTION.includes(key) && name === 'Weapons'), `${entry.name}: ${key} (how a weapon fires belongs on weapons)`);
        }
    }
    assert.ok(set > 20);
    // The sniper rifle, the shotgun and a grenade, read back as the directive describes them.
    const tactics = (table, name) => F.recordTactics(data(table).find(r => r && r.name === name));
    const sniper = tactics('Weapons', 'Brass Marksman Rifle');
    assert.deepEqual({ ...sniper.range }, { min: 4, max: 12 });
    assert.equal(sniper.move, -1);
    const shotgun = tactics('Weapons', 'Scattergun');
    assert.deepEqual([{ ...shotgun.range }, { ...shotgun.area }], [{ min: 1, max: 3 }, { shape: 'cone', size: 3 }]);
    const grenade = tactics('Items', 'Incendiary Grenade');
    assert.deepEqual([{ ...grenade.area }, grenade.los], [{ shape: 'circle', size: 1 }, false]);
    // In real time: the marksman rifle is slow with a small magazine, the scattergun spreads, the autocannon's shells fly, the knife chains four.
    const act = name => F.Action.settings(data('Weapons').find(r => r && r.name === name));
    assert.ok(act('Brass Marksman Rifle').fireRate < 1 && act('Brass Marksman Rifle').magazine <= 5);
    assert.ok(act('Scattergun').spread >= 9);
    assert.equal(act('Autocannon').projectile, 'bolt');
    assert.equal(act('Combat Knife').combo, 4);
    // As the records hold them.
    assert.deepEqual(data('Weapons').find(r => r && r.name === 'Scattergun').rrBattle, { range: { min: 1, max: 3 }, area: { shape: 'cone', size: 3 }, fireRate: 1, magazine: 4, reload: 2.4, spread: 12 });
    assert.deepEqual(data('Items').find(r => r && r.name === 'Incendiary Grenade').rrBattle.los, false);
    // Records with nothing to set are left to the defaults: most weapons set nothing.
    const pistol = data('Weapons').find(r => r && r.name === 'Service Pistol');
    assert.deepEqual([pistol.note, 'rrBattle' in pistol], ['', false]);
});

test('every formula gives a finite number at every level, and stats follow the tables', { skip }, () => {
    const { data, content, formula } = applied();
    const curve = data('Classes')[content.DEMO.classes.swordsman].params;
    const own = ownNames(content);
    const records = [].concat(own.Skills.map(e => data('Skills').find(r => r && r.name === e.name)), own.Items.map(e => data('Items').find(r => r && r.name === e.name))).filter(r => r.damage.type > 0);
    assert.ok(records.length > 30);
    for (let level = 1; level <= 99; level++) {
        const s = formula.statsAt(curve, level);
        const a = { mhp: s[0], mmp: s[1], atk: s[2] + 110, def: s[3], mat: s[4] + 110, mdf: s[5], agi: s[6], luk: s[7], hp: s[0], mp: s[1], tp: 50, level };
        const b = { mhp: s[0], mmp: s[1], atk: s[2], def: s[3] + 60, mat: s[4], mdf: s[5] + 60, agi: s[6], luk: s[7], hp: s[0], mp: s[1], tp: 0, level };
        for (const record of records) {
            const value = formula.evaluate(record.damage.formula, a, b);
            assert.ok(Number.isFinite(value) && value >= 0, `${record.name} at level ${level}: ${record.damage.formula} = ${value}`);
        }
        for (const role of Object.keys(formula.ENEMY_ROLES)) for (const value of formula.enemyParams(curve, role, level)) assert.ok(Number.isFinite(value) && value >= 0);
    }
    // One family: POWER * K - GUARD * K / 2, or a share of Max HP.
    const family = /^(a\.(atk|mat) \* [\d.]+ - b\.(def|mdf) \* [\d.]+|\(a\.atk \+ a\.mat\) \* [\d.]+ - \(b\.def \+ b\.mdf\) \* [\d.]+|\d+ \+ a\.(atk|mat) - b\.(def|mdf)|b\.mhp \* [\d.]+( \+ a\.mat \* [\d.]+)?)$/;
    for (const record of records) assert.match(record.damage.formula, family, record.name);
    // Weapons and armors carry exactly what their class and tier give.
    for (const w of content.WEAPONS) assert.deepEqual(data('Weapons').find(r => r && r.name === w.name).params, formula.weaponParams(w.class, w.tier));
    for (const armor of content.ARMORS.filter(a => a.class)) assert.deepEqual(data('Armors').find(r => r && r.name === armor.name).params, formula.armorParams(armor.class, armor.tier));
    for (const e of content.ENEMIES) assert.deepEqual(data('Enemies').find(r => r && r.name === e.name).params, formula.enemyParams(curve, e.role, content.ENEMY_LEVEL));
});

test('the two battles use only commands that exist, and every unit, event and record they name is there', { skip }, () => {
    const { project, data, result } = applied();
    const FightCommandEditor = require('../src/event/commands/FightCommandEditor.js');
    const { fightWorld } = require('./helpers/fight-world.cjs');
    const F = fightWorld({ tactical: true }).ReactorFight;
    const maps = require(path.join(generator, 'maps.cjs'));
    const actors = data('Actors'), enemies = data('Enemies');
    const KNOWN = new Set([0, 101, 401, 102, 402, 404, 108, 111, 411, 412, 121, 126, 127, 128, 201, 214, 230, 314, 319, 357]);
    const check = (mapId, expectUnits) => {
        const map = json(path.join(project, 'data', 'Map' + String(mapId).padStart(3, '0') + '.json'));
        assert.equal(map.data.length, map.width * map.height * 6);
        const mine = map.events.filter(e => e && /<tactical: /.test(e.note));
        let units = 0, hooks = 0;
        for (const event of mine) {
            assert.ok(event.x >= 0 && event.x < map.width && event.y >= 0 && event.y < map.height);
            // No page is conditional alone: an event always has a page to show.
            assert.ok(event.pages.some(p => !p.rrFightHook && !Object.keys(p.conditions).some(key => /Valid$/.test(key) && p.conditions[key])), `${event.name} has no always-true page`);
            for (const page of event.pages) {
                if (page.rrFightHook) { hooks++; assert.ok(F.normalizeHook(page.rrFightHook), `${event.name}: hook`); }
                const spec = F.unitSpecOf({ note: event.note }, page.list);
                if (spec) { units++; assert.ok(spec.record === 'actor' ? actors[spec.id] && actors[spec.id].name : enemies[spec.id] && enemies[spec.id].name, `${event.name}: unit record`); }
                for (const command of page.list) {
                    assert.ok(KNOWN.has(command.code), `${event.name}: command ${command.code}`);
                    if (command.code !== 357) continue;
                    const [plugin, name, label, args] = command.parameters;
                    assert.equal(plugin, 'RPGReactor');
                    assert.ok(FightCommandEditor.NAMES.includes(name), name);
                    assert.equal(label, FightCommandEditor.LABELS[name]);
                    for (const key of ['eventId', 'unitEventId']) if (args[key] > 0) assert.ok(map.events[args[key]], `${event.name}: ${name} names event ${args[key]}`);
                    if (name === 'SpawnUnit') { assert.ok(enemies[args.id].name); assert.ok(args.x >= 0 && args.x < map.width && args.y >= 0 && args.y < map.height); }
                }
            }
        }
        assert.ok(units >= expectUnits, `map ${mapId}: ${units} units`);
        return { map, mine, hooks };
    };
    const raid = check(maps.NORTH_HAVEN.mapId, 9);
    assert.equal(raid.hooks, 3, 'two turn hooks and the side change');
    const names = raid.mine.flatMap(e => e.pages.flatMap(p => p.list.filter(c => c.code === 357).map(c => c.parameters[1])));
    for (const name of ['StartMapBattle', 'SpawnUnit', 'ChangeBattleGoal', 'ChangeUnitSide']) assert.ok(names.includes(name), name);
    // The raid's models: each unit page's model and variant are on the map's sidecar.
    const sidecar = json(path.join(project, 'data', 'Map' + String(maps.NORTH_HAVEN.mapId).padStart(3, '0') + '.r3d.json'));
    for (const key of ['vay', 'max', 'gruntA', 'gruntB', 'cutter', 'marksman', 'conscript', 'captain', 'rheaUnit']) assert.ok(sidecar.events[String(result.ids.events[key])]['1'].name, key);
    assert.ok(sidecar.events[String(result.ids.events.rhea)]['0'].name, 'Rhea is seen where she talks');
    // Rhea's menu: the raid, the two real-time skirmishes, the army drill, the 2D drill, and a way out.
    const rhea = raid.map.events[result.ids.events.rhea], menu = rhea.pages[0].list.find(c => c.code === 102).parameters[0];
    assert.deepEqual(menu, ['Defend the square', 'Skirmish in real time (Action)', 'Skirmish in first person', 'Army drill (Tactical)', 'Run the deck drill (2D)', 'Not now']);
    assert.ok(!/<unit\s*:/.test(rhea.note), 'the Rhea who talks is not a unit: her unit event is');
    const starts = rhea.pages[0].list.filter(c => c.code === 357 && c.parameters[1] === 'StartMapBattle').map(c => c.parameters[3]);
    assert.deepEqual(starts.map(a => a.mode), ['tactical', 'action', 'firstPerson', 'tactical']);
    for (const args of starts) assert.ok(args.canLose && args.wait && args.resultVariable > 0, 'every battle can be lost and hands its result back');
    assert.ok(!rhea.pages[0].list.some(c => c.code === 357 && c.parameters[1] === 'ChangeBattleMode'), "the game's own mode is never changed");
    // Every skirmish unit is spawned from the template that leaves when the skirmish is over, onto its own free cell.
    const spawns = rhea.pages[0].list.filter(c => c.code === 357 && c.parameters[1] === 'SpawnUnit').map(c => c.parameters[3]);
    const template = raid.map.events[result.ids.events.template];
    assert.equal(spawns.length, 3 + 3 + 40);
    const waves = raid.map.events[result.ids.events.director].pages.flatMap(p => p.list.filter(c => c.code === 357 && c.parameters[1] === 'SpawnUnit').map(c => c.parameters[3]));
    assert.equal(waves.length, 6);
    for (const args of spawns.concat(waves)) assert.equal(args.template, template.id);
    assert.equal(template.pages[0].trigger, 4);
    assert.equal(template.pages[0].list[0].code, 214);
    assert.equal(template.pages[1].conditions.switch1Id, data('System').switches.indexOf('Skirmish running'));
    const army = spawns.slice(6), cells = new Set(army.map(a => a.x + ',' + a.y));
    assert.equal(cells.size, 40, 'no two of the army share a cell');
    assert.equal(army.filter(a => a.team === 'ally').length, 20);
    assert.equal(army.filter(a => a.team === 'enemy').length, 20);
    for (const args of army.filter(a => a.team === 'ally')) assert.match(enemies[args.id].name, /^Militia /);
    const drill = check(result.ids.maps.drill, 8);
    assert.equal(drill.map.note, '<tactical: drill>');
    assert.ok(!fs.existsSync(path.join(project, 'data', 'Map' + String(result.ids.maps.drill).padStart(3, '0') + '.r3d.json')), 'the drill is a plain 2D map');
    assert.equal(data('MapInfos')[result.ids.maps.drill].name, maps.DRILL.name);
    // Cover stands on its own: no unit starts on a block.
    const blocked = new Set(maps.DRILL.cover.map(([x, y]) => x + ',' + y));
    for (const event of drill.mine) assert.ok(!blocked.has(event.x + ',' + event.y), event.name);
});

test('the apply step refuses a project an editor holds open', { skip }, () => {
    const { apply, editorHolding } = require(path.join(generator, 'apply.cjs'));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-tactical-lock-'));
    try {
        fs.mkdirSync(path.join(dir, 'data'));
        fs.writeFileSync(path.join(dir, 'data/System.json'), '{}');
        assert.equal(editorHolding(dir), '');
        fs.writeFileSync(path.join(dir, '.rpgreactor.lock'), JSON.stringify({ app: 'RPG Reactor', pid: process.pid, token: 'x' }));
        assert.match(editorHolding(dir), /has this project open/);
        assert.throws(() => apply(dir, { log: () => {} }), error => error.code === 'LOCKED');
        // A lock left by a process that is gone holds nothing.
        fs.writeFileSync(path.join(dir, '.rpgreactor.lock'), JSON.stringify({ app: 'RPG Reactor', pid: 2 ** 22 + 4321, token: 'x' }));
        assert.equal(editorHolding(dir), '');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
