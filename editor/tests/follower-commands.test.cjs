'use strict';
// The Party Followers commands from the editor's side: what
// FollowerCommandEditor stores and the sentence each list line reads, how
// many followers every list offers (the game's own rule), Set Movement
// Route's follower targets, the formation pictures, the System 1 rows and
// the translations.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { followerWorld } = require('./helpers/follower-world.cjs');

const editorRoot = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(editorRoot, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
global.ReactorBattleData = require('../src/battle/BattleData.js');
const FollowerCommandEditor = require('../src/event/commands/FollowerCommandEditor.js');
const SetMovementRouteEditor = require('../src/event/commands/SetMovementRouteEditor.js');
global.SetMovementRouteEditor = SetMovementRouteEditor;
const EventCommandList = require('../src/event/EventCommandList.js');
const EventCommandPicker = require('../src/event/EventCommandPicker.js');
const F = FollowerCommandEditor;

test('the commands are plugin commands of RPGReactor and each line reads as a sentence', () => {
    for (const name of F.NAMES) {
        const built = F.build(name, {}, 2);
        assert.deepEqual([built.code, built.indent], [357, 2]);
        assert.deepEqual(built.parameters.slice(0, 3), ['RPGReactor', name, F.LABELS[name]]);
    }
    const context = { count: 3, actors: [null, { id: 1, name: 'Ren' }, { id: 2, name: 'Mira' }] };
    const formation = args => F.summary('ChangeFollowerFormation', args, context);
    assert.equal(formation({ formation: 'wedge', spacing: 2, straggle: 0 }), 'Followers walk in a wedge, 2 tiles apart');
    assert.equal(formation({ formation: 'file', spacing: 1 }), 'Followers walk in single file, 1 tile apart');
    assert.equal(formation({ formation: 'loose', spacing: 1, straggle: 40 }), 'Followers walk in a loose file, 1 tile apart, straggle 40%');
    assert.equal(formation({ formation: 'rank', spacing: 3 }), 'Followers walk side by side, 3 tiles apart');
    assert.equal(formation({ formation: 'column', spacing: 1 }), 'Followers walk in a column of two, 1 tile apart');
    assert.equal(formation({ formation: 'scattered', spacing: 2 }), 'Followers walk scattered, 2 tiles apart');
    assert.equal(formation({ formation: 'default' }), "Followers walk in the game's own formation");
    const orders = args => F.summary('FollowerOrders', args, context);
    assert.equal(orders({ who: 'follower', index: 2, order: 'stay' }), 'Follower 2 stays here');
    assert.equal(orders({ who: 'follower', index: 1, order: 'goto', x: 14, y: 9, wait: true }), 'Follower 1 goes to (14, 9) and waits');
    assert.equal(orders({ who: 'follower', index: 1, order: 'goto', x: 14, y: 9, direction: 4, wait: false }), 'Follower 1 goes to (14, 9), facing left');
    assert.equal(orders({ who: 'all', order: 'follow' }), 'All followers follow the leader');
    assert.equal(orders({ who: 'all', order: 'goto', x: 3, y: 4, direction: 8, wait: true }), 'All followers go to (3, 4), facing up and wait');
    assert.equal(orders({ who: 'all', order: 'come', wait: false }), 'All followers come to the leader');
    assert.equal(orders({ who: 'actor', actorId: 2, order: 'come', wait: true }), 'Mira comes to the leader and waits');
    assert.equal(orders({ who: 'actor', actorId: 7, order: 'hide' }), 'Actor 0007 is hidden');
    assert.equal(orders({ who: 'follower', index: 3, order: 'show' }), 'Follower 3 is shown');
    assert.equal(orders({ who: 'all', order: 'hide' }), 'All followers are hidden');
    assert.equal(orders({ who: 'follower', index: 6, order: 'follow' }), "Follower 6 (beyond the party's size) follows the leader");
});

test('a form keeps what it does not show, stores only what its choices need, and a new command starts sensibly', () => {
    assert.deepEqual(F.argsOf('ChangeFollowerFormation', null, F.formOf('ChangeFollowerFormation', null)), { formation: 'wedge', spacing: 1, straggle: 0 });
    assert.deepEqual(F.argsOf('ChangeFollowerFormation', { formation: 'rank', spacing: 3, straggle: 20, note: 'kept' }, { formation: 'default', spacing: 3, straggle: 20 }),
        { note: 'kept', formation: 'default' }, "the game's default stores no spacing");
    assert.deepEqual(F.formOf('ChangeFollowerFormation', { formation: 'default' }).formation, 'default');
    assert.deepEqual(F.formOf('ChangeFollowerFormation', { formation: 'rank', spacing: 9, straggle: 250 }), { formation: 'rank', spacing: 4, straggle: 100 });
    assert.deepEqual(F.argsOf('FollowerOrders', null, F.formOf('FollowerOrders', null)), { who: 'all', order: 'follow' });
    const stay = F.argsOf('FollowerOrders', { who: 'follower', index: 2, order: 'goto', x: 5, y: 6, direction: 2, wait: true },
        Object.assign(F.formOf('FollowerOrders', { who: 'follower', index: 2, order: 'goto', x: 5, y: 6, direction: 2, wait: true }), { order: 'stay' }));
    assert.deepEqual(stay, { who: 'follower', index: 2, order: 'stay' }, 'a tile and a wait belong to Go to a tile');
    // Opened and closed without a change: the same arguments, a follower beyond the party's size included.
    for (const args of [{ who: 'follower', index: 6, order: 'goto', x: 14, y: 9, direction: 8, wait: true }, { who: 'actor', actorId: 12, order: 'come', wait: false },
        { who: 'all', order: 'hide' }, { formation: 'scattered', spacing: 2, straggle: 35 }]) {
        const name = args.formation ? 'ChangeFollowerFormation' : 'FollowerOrders';
        assert.deepEqual(F.argsOf(name, args, F.formOf(name, args)), args);
        assert.deepEqual(F.build(name, args).parameters[3], args);
    }
});

test('how many followers the lists offer is the game\'s own answer for the same System.json', () => {
    // The game: the stock four, the battle settings' party size, and Database > System 1's Max Battle Members over both.
    const runtime = path.resolve(editorRoot, '..', 'runtime');
    const cases = [{}, { maxBattleMembers: 7 }, { maxBattleMembers: 2 }, { reactorBattle: { partySize: 6 } }, { reactorBattle: { partySize: 3 }, maxBattleMembers: 5 },
        { maxBattleMembers: 12 }, { maxBattleMembers: 1 }, { maxBattleMembers: 0 }, { maxBattleMembers: '7' }, { reactorBattle: { partySize: 150 } }];
    for (const system of cases) {
        const w = followerWorld({ party: [1, 2], system: { reactorBattle: { partySize: 0 } } });
        for (const file of ['reactor_battle_data.js', 'reactor_battle_presentation.js']) vm.runInContext(fs.readFileSync(path.join(runtime, file), 'utf8'), w, { filename: file });
        w.ReactorBattlePresentation.installPartyLimit();
        delete w.$dataSystem.reactorBattle;
        Object.assign(w.$dataSystem, plain(system));
        const inGame = new w.Game_Followers()._data.length;
        assert.equal(F.followerCount(system, []), inGame, `${JSON.stringify(system)}: ${inGame} followers in the game`);
        assert.equal(F.partySize(system, []), w.$gameParty.maxBattleMembers());
    }
    assert.equal(F.followerCount({ maxBattleMembers: 7 }, []), 6);
    assert.equal(F.followerCount(null, []), 3);
    // A party plugin's own limit, where nothing in the Database says otherwise.
    assert.equal(F.followerCount({}, [{ name: 'YEP_PartySystem', status: true, parameters: { 'Max Battle Members': '5' } }]), 4);
});

test('Set Movement Route offers Follower 1 to the last the party has, and keeps one beyond it', () => {
    const labels = targets => targets.map(target => target.label);
    const four = F.routeTargets(F.followerCount({}, []), -1);
    assert.deepEqual(labels(four), ['Follower 1', 'Follower 2', 'Follower 3']);
    assert.deepEqual(four.map(target => target.value), [1000001, 1000002, 1000003]);
    const seven = F.routeTargets(F.followerCount({ maxBattleMembers: 7 }, []), -1);
    assert.deepEqual(labels(seven), ['Follower 1', 'Follower 2', 'Follower 3', 'Follower 4', 'Follower 5', 'Follower 6'], 'Max Battle Members 7 offers Follower 6');
    // The number was lowered later: the command's follower is still listed, marked, under the id it has.
    const lowered = F.routeTargets(3, 1000006);
    assert.deepEqual(labels(lowered), ['Follower 1', 'Follower 2', 'Follower 3', "Follower 6 (beyond the party's size)"]);
    assert.equal(lowered[3].value, 1000006);
    // An id written the way plugins number followers stands for its place and is not rewritten.
    const plugin = F.routeTargets(3, -3);
    assert.deepEqual(plugin.map(target => target.value), [1000001, -3, 1000003]);
    assert.deepEqual([-1, 0, 5, -2, -4, 1000001, 1000012, 1000000].map(id => F.placeOfCharacterId(id)), [0, 0, 0, 1, 3, 1, 12, 0]);
    // The same numbers the game reads.
    const w = followerWorld({ party: [1, 2] });
    assert.equal(w.Game_Followers.CHARACTER_ID, F.CHARACTER_ID);
    for (const id of [-1, 0, 5, -2, -4, 1000001, 1000012, 1000000]) assert.equal(w.Game_Followers.placeOfCharacterId(id), F.placeOfCharacterId(id), `id ${id}`);
    // The dialog builds its list from that rule, and says in one line what a route does to a follower.
    const source = read('src/event/commands/SetMovementRouteEditor.js');
    assert.match(source, /FollowerCommandEditor\.routeTargets\(FollowerCommandEditor\.followerCount\(system, plugins\), this\.characterId\)/);
    assert.match(source, /A follower leaves the line for the route and stays where it ends until told to follow\./);
    assert.match(source, /\{ code: 45, reactor: 'moveto', label: 'Move to Tile\.\.\.' \}/);
    // A new Move to Tile opens on the route's last one; with none and no map event open, on (0, 0).
    const editor = Object.create(SetMovementRouteEditor.prototype);
    editor.projectController = {};
    editor.moveRoute = { list: [{ code: 1 }, SetMovementRouteEditor.routeCommand('moveto', { x: 4, y: 5 }), SetMovementRouteEditor.routeCommand('moveto', { x: 14, y: 9 }), { code: 3 }, { code: 0 }] };
    assert.deepEqual(editor._moveToStart(), { x: 14, y: 9 });
    editor.moveRoute = { list: [{ code: 1 }, { code: 0 }] };
    assert.deepEqual(editor._moveToStart(), { x: 0, y: 0 });
    // The formation tiles sit in one row at the dialog's width and wrap evenly in a narrower window.
    assert.match(read('src/event/commands/FollowerCommandEditor.js'), /class="fo-formations" style="display:grid;grid-template-columns:repeat\(auto-fit,minmax\(78px,1fr\)\);/);
    // A stock runtime: an id beyond every event is no character, and the command is left out.
    assert.match(fs.readFileSync(path.join(editorRoot, '..', 'runtime', 'reactor_objects_interpreter.js'), 'utf8'), /return \$gameMap\.event\(param > 0 \? param : this\._eventId\);/);
});

test('the event list names the followers and the steps, and the picker lists the commands under Party Followers', () => {
    const list = Object.create(EventCommandList.prototype);
    list.eventEditor = {};
    const info = command => list.getCommandInfo(command, { list: [] }, 0);
    const route = { repeat: false, skippable: false, wait: true, list: [{ code: 1 }, { code: 0 }] };
    assert.equal(info({ code: 205, indent: 0, parameters: [1000002, route] }).description, 'Follower 2 (1 command)');
    assert.equal(info({ code: 205, indent: 0, parameters: [-2, route] }).description, 'Follower 1 (1 command)');
    assert.equal(info({ code: 205, indent: 0, parameters: [1000009, route] }).description, "Follower 9 (beyond the party's size) (1 command)");
    assert.equal(info({ code: 205, indent: 0, parameters: [-1, route] }).description, 'Player (1 command)');
    assert.equal(info({ code: 505, indent: 0, parameters: [SetMovementRouteEditor.routeCommand('moveto', { x: 14, y: 9 })] }).description, 'Move to (14, 9)');
    assert.equal(info({ code: 505, indent: 0, parameters: [SetMovementRouteEditor.routeCommand('height', 2)] }).description, 'Set Height: 2', 'the other steps read as before');
    const wedge = info(F.build('ChangeFollowerFormation', { formation: 'wedge', spacing: 2 }));
    assert.deepEqual([wedge.name, wedge.description], ['Change Follower Formation', 'Followers walk in a wedge, 2 tiles apart']);
    const order = info(F.build('FollowerOrders', { who: 'follower', index: 2, order: 'stay' }));
    assert.deepEqual([order.name, order.description], ['Follower Orders', 'Follower 2 stays here']);
    // Each has a dialog of its own: no raw-argument triangle.
    const owner = { followerCommandEditor: {} };
    for (const name of F.NAMES) assert.ok(EventCommandList.prototype._reactorCommandEditor.call(owner, name), `${name} has its own dialog`);
    const data = new EventCommandPicker().commandData;
    const section = data.tab4.columns.flatMap(column => column.sections).find(entry => entry.title === 'Party Followers');
    assert.equal(data.tab4.name, 'Reactor');
    assert.deepEqual(section.commands, [{ name: 'Change Follower Formation', code: 357, reactor: 'ChangeFollowerFormation' }, { name: 'Follower Orders', code: 357, reactor: 'FollowerOrders' }]);
    assert.match(read('index.html'), /src\/event\/commands\/FollowerCommandEditor\.js/);
});

test('the formation pictures are the places the game walks by: a leader and three followers as dots', () => {
    const w = followerWorld({ party: [1, 2] });
    for (const formation of ['file', 'loose', 'rank', 'wedge', 'column']) {
        for (let count = 0; count <= 12; count++) {
            assert.deepEqual(F.places(formation, count), plain(w.Game_Followers.places(formation, count)), `${formation} for ${count}`);
        }
    }
    assert.deepEqual(F.FORMATIONS.map(([key]) => key), Array.from(w.Game_Followers.FORMATIONS), 'the same formations, in the same order');
    for (const [formation] of F.FORMATIONS) {
        const picture = F.picture(formation);
        assert.equal((picture.match(/<circle /g) || []).length, 4, `${formation}: four dots`);
        assert.match(picture, /^<svg class="follower-formation-picture" data-formation="/);
        // Every dot is inside the picture.
        for (const [, cx, cy] of picture.matchAll(/cx="([\d.]+)" cy="([\d.]+)"/g)) assert.ok(Number(cx) >= 4 && Number(cx) <= 52 && Number(cy) >= 4 && Number(cy) <= 52, `${formation}: ${cx},${cy}`);
    }
    assert.notEqual(F.picture('wedge'), F.picture('rank'));
    assert.match(F.picture('wedge'), /var\(--color-accent-bright\)/, "the theme's colours, light or dark");
});

test('Database > System 1: the party card stores the game\'s formation as reactorParty, and nothing for the stock file', () => {
    const DatabaseSystem1Editor = vm.runInNewContext(`${read('src/database/DatabaseSystem1Editor.js')}\nDatabaseSystem1Editor;`,
        { console, window: {}, FollowerCommandEditor, rrEscapeHtml: text => String(text) });
    const editor = Object.create(DatabaseSystem1Editor.prototype);
    editor.databaseManager = { mutationGeneration: 0 };
    const html = editor.followerFormationRows({ reactorParty: { formation: 'wedge', spacing: 2, straggle: 30 } });
    assert.match(html, /<option value="wedge" selected>Wedge<\/option>/);
    assert.match(html, /<option value="2" selected>2 tiles<\/option>/);
    assert.match(html, /id="system-follower-straggle"[^>]*value="30"/);
    assert.match(html, /data-formation="wedge"/, 'with its picture');
    assert.match(editor.followerFormationRows({}), /<option value="file" selected>Single file<\/option>/, 'absent settings read as a single file');
    // The controls write System.json.
    const controls = { '#system-follower-formation': { value: 'rank' }, '#system-follower-spacing': { value: '3' }, '#system-follower-straggle': { value: '45' }, '.system-follower-picture': { innerHTML: '' } };
    for (const control of Object.values(controls)) control.addEventListener = (type, handler) => { control.change = handler; };
    const container = { querySelector: selector => controls[selector] || null };
    const system = {};
    editor.wireFollowerFormation(container, system);
    controls['#system-follower-formation'].change();
    assert.deepEqual(plain(system.reactorParty), { formation: 'rank', spacing: 3, straggle: 45 });
    assert.equal(editor.databaseManager.mutationGeneration, 1, 'the Database knows it changed');
    assert.match(controls['.system-follower-picture'].innerHTML, /data-formation="rank"/);
    Object.assign(controls['#system-follower-formation'], { value: 'file' });
    Object.assign(controls['#system-follower-spacing'], { value: '1' });
    Object.assign(controls['#system-follower-straggle'], { value: '0' });
    controls['#system-follower-spacing'].change();
    assert.equal('reactorParty' in system, false, 'the stock walk stores nothing');
    // What it stores is what the game reads.
    const w = followerWorld({ party: [1, 2], system: { reactorParty: { formation: 'rank', spacing: 3, straggle: 45 } } });
    const inForce = w.$gamePlayer.followers().formation();
    assert.deepEqual([inForce.formation, inForce.spacing, inForce.straggle], ['rank', 3, 45]);
});

test('every word of the dialogs, the list lines and the route step is translated in every locale', () => {
    const context = vm.createContext({ window: {}, document: {}, navigator: { language: 'en' }, localStorage: { getItem: () => null, setItem() {} }, console });
    for (const file of ['src/I18nDeepTranslations.js', 'src/I18nReviewedTranslations.js', 'src/I18nManager.js']) vm.runInContext(read(file), context, { filename: file });
    const tables = vm.runInContext('({ text: RR_TEXT_TRANSLATIONS, languages: RR_LANGUAGES })', context);
    const locales = tables.languages.map(language => language.id).filter(id => id !== 'en');
    assert.equal(locales.length, 17);
    // The texts of the tables, and every literal the dialogs pass to their translator.
    const strings = new Set(['Party Followers', 'Change Follower Formation', 'Follower Orders', 'Move to Tile', 'Move to Tile...', 'Move to', 'Pick on the Map...', 'Pick a tile',
        'Walks there by the shortest open way. The route waits until it arrives.', 'A follower leaves the line for the route and stays where it ends until told to follow.',
        'Follower Formation', 'Spacing', 'Straggle', '1 tile', '{n} tiles', 'Follower {n}', "Follower {n} (beyond the party's size)", 'Actor {id}', ' and waits', ' and wait',
        "Followers walk in the game's own formation", ', straggle {p}%']);
    for (const [, label] of F.FORMATIONS.concat(F.ORDERS, F.FACINGS)) strings.add(label);
    for (const line of Object.values(F.FORMATION_LINES).concat(Object.values(F.FACING_LINES), ...Object.values(F.ORDER_LINES))) strings.add(line);
    for (const [, single, double] of read('src/event/commands/FollowerCommandEditor.js').matchAll(/(?<![\w.])t\((?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) {
        strings.add(single !== undefined ? single.replace(/\\'/g, "'") : double);
    }
    for (const [, hint] of read('src/event/commands/FollowerCommandEditor.js').matchAll(/(?:follow|stay|goto|come|hide|show): '([A-Z][^']+\.)'/g)) strings.add(hint);
    assert.ok(strings.size >= 70, `${strings.size} strings`);
    const holes = text => (text.match(/\{\w+\}/g) || []).sort().join(' ');
    const missing = [];
    for (const locale of locales) {
        for (const text of strings) {
            const translated = tables.text[locale] && tables.text[locale][text];
            if (!translated) missing.push(`${locale}: ${JSON.stringify(text)}`);
            else if (holes(translated) !== holes(text)) missing.push(`${locale}: ${JSON.stringify(text)} loses a field`);
        }
    }
    assert.deepEqual(missing, []);
    // A sentence in another language keeps its numbers.
    assert.equal(tables.text.de['Followers walk in a wedge, {n} apart'].replace('{n}', tables.text.de['{n} tiles'].replace('{n}', '2')), 'Begleiter gehen im Keil, Abstand 2 Felder');
});
