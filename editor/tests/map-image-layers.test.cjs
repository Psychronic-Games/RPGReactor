'use strict';
// The Image Layers tool (editor/src/MapImageLayersEditor.js and MapImageLayersManager.js): what Add makes, which
// settings a layer shows, the words of the list and the panel, the list's order, edits with undo, and that a map
// nobody edited keeps its layers as they were. The game's own rules are tested in image-layers-runtime.test.cjs;
// here they are the real module, called by the tool.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(editorRoot, file), 'utf8');
const R = require('../../runtime/reactor_image_layers.js');
const M = require('../src/MapImageLayersEditor.js');
const Manager = require('../src/MapImageLayersManager.js');
const Popup = require('../src/utils/MaterialPopup.js');
const History = require('../src/utils/MapHistory.js');
const mini = require('./helpers/mini-dom.cjs');
// A sentence marks the names it quotes as pieces of their own (see the test of right-to-left languages); here the
// words are compared without the marks.
const plain = value => (Array.isArray(value) ? value.map(plain) : M.plain(value));

const system = { switches: ['', 'Night', ''], variables: ['', 'Chapter', '', 'Season'] };
const names = M.namesFrom(system);
// What an import of a parallax-mapped game writes, and what the owner made with the old card.
const imported = () => ({ name: '43_Ground', layer: 'ground', variable: 19, variantName: '43-%1_Ground', opacity: 200, blendMode: 1 });
const owners = () => ({ name: 'Space-01', layer: 'over' });

test('each thing Add makes is a layer the game accepts and draws; a 3D map is offered only what it draws', () => {
    assert.deepEqual(M.choices(false).map(c => c.key), ['painted', 'fog', 'far', 'overlay', 'solid']);
    const made = Object.fromEntries(M.choices(false).map(c => [c.key, M.make(c.key, 'Picture')]));
    for (const [key, layer] of Object.entries(made)) {
        assert.deepEqual(R.write(R.normalize(layer)), layer, `${key} is in the game's stored form`);
        assert.equal(layer.name, 'Picture');
        assert.equal(R.drawn(R.normalize(layer), false), true, `${key} is drawn on a 2D map`);
    }
    assert.deepEqual(made.painted, { name: 'Picture', layer: 'ground' });
    assert.deepEqual(made.solid, { name: 'Picture', layer: 'same' });
    assert.deepEqual(made.overlay, { name: 'Picture', layer: 'over', fit: 'fill' });
    const fog = R.normalize(made.fog), far = R.normalize(made.far);
    assert.deepEqual([fog.layer, fog.fit], ['over', 'repeat']);
    assert.ok(fog.drift[0] !== 0 || fog.drift[1] !== 0, 'fog drifts as made');
    assert.ok(fog.opacity > 0 && fog.opacity < 255, 'fog is part see-through as made');
    assert.deepEqual([far.layer, far.fit], ['back', 'repeat']);
    assert.ok(far.follow > 0 && far.follow < 1, 'a far background moves slower than the map');
    assert.deepEqual([far.repeat, fog.repeat], ['x', 'both'], 'a far background starts as a strip that repeats across only; fog repeats both ways');
    assert.deepEqual(made.far, { name: 'Picture', layer: 'back', fit: 'repeat', repeat: 'x', follow: 0.5 });
    assert.deepEqual(M.choices(true).map(c => c.key), ['fog', 'overlay']);
    for (const choice of M.choices(true)) assert.equal(R.drawnOn3D(R.normalize(M.make(choice.key, 'Picture'))), true);
    for (const choice of M.choices(false)) assert.ok(choice.label && choice.hint, 'every choice says what it makes');
    assert.match(M.choices(false)[0].hint, /parallax mapping/);
});

test('the settings rows are the ones that apply to the layer', () => {
    const rows = (layer, is3D) => M.rows(layer, is3D).join(' ');
    assert.equal(rows({ name: 'A', layer: 'ground' }), 'picture depth placement opacity blend shown versions');
    assert.equal(rows({ name: 'A', layer: 'over', fit: 'repeat' }), 'picture depth placement repeats drift follow opacity blend shown versions');
    assert.equal(rows({ name: 'A', layer: 'back', fit: 'repeat', repeat: 'x' }), 'picture depth placement repeats drift follow opacity blend shown versions');
    assert.equal(rows({ name: 'A', layer: 'over', fit: 'fill' }), 'picture depth placement opacity blend shown versions');
    assert.equal(rows({ name: 'A', layer: 'same' }), 'picture depth placement solid opacity blend shown versions');
    assert.equal(rows({ name: 'A', layer: 'over', switch: 1 }), 'picture depth placement opacity blend shown fade versions');
    assert.equal(rows({ name: 'A', layer: 'over', when: { variable: 1, op: '=', value: 2 } }), 'picture depth placement opacity blend shown fade versions');
    // A 3D map draws a repeating layer on the screen: how far it follows the map has nothing to say.
    assert.equal(rows({ name: 'A', layer: 'over', fit: 'repeat' }, true), 'picture depth placement repeats drift opacity blend shown versions');
    // Same as Characters takes a picture locked to the map and nothing else.
    assert.deepEqual(R.FITS.map(fit => M.fitAllowed('same', fit)), [true, false, false]);
    assert.deepEqual(R.FITS.map(fit => M.fitAllowed('over', fit)), [true, true, true]);
});

test('a row of the list says what the layer is and the conditions it is shown under, in words', () => {
    assert.equal(M.describe({ name: 'Fog', layer: 'over', fit: 'repeat' }), 'Above Characters, Repeating');
    assert.equal(M.describe({ name: 'Town' }), 'Below Characters, Locked to the map');
    assert.equal(M.describe({ name: 'Sky', layer: 'back', fit: 'fill' }), 'Behind the map, Fills the screen');
    assert.equal(M.describe({ name: 'Trees', layer: 'same' }), 'Same as Characters, Locked to the map');
    const words = layer => plain(M.conditionWords(layer, names));
    assert.deepEqual(words({ name: 'A' }), [], 'always shown: nothing to say');
    assert.deepEqual(words({ name: 'A', switch: 1 }), ['While Night is ON']);
    assert.deepEqual(words({ name: 'A', switch: 2 }), ['While Switch 0002 is ON'], 'an unnamed switch goes by its number');
    assert.deepEqual(words({ name: 'A', when: { variable: 1, op: '>=', value: 3 } }), ['While Chapter is at least 3']);
    assert.deepEqual(words({ name: 'A', when: { variable: 1, op: '<=', value: 3 } }), ['While Chapter is at most 3']);
    assert.deepEqual(words({ name: 'A', when: { variable: 2, op: '=', value: 5 } }), ['While Variable 0002 is 5']);
    assert.deepEqual(words({ name: 'A', switch: 1, when: { variable: 1, op: '>=', value: 3 } }), ['While Night is ON', 'While Chapter is at least 3']);
    // The numbered versions variable is not a condition: it never shows up as one.
    assert.deepEqual(words(imported()), []);
    const row = M.rowLines({ name: 'Fog', layer: 'over', fit: 'repeat', switch: 1 }, names, false);
    assert.deepEqual({ title: row.title, lines: plain(row.lines), warning: row.warning }, { title: 'Fog', lines: ['Above Characters, Repeating', 'While Night is ON'], warning: '' });
    // What a picker field shows: the ID and the name, never a bare number.
    assert.equal(names.switchLabel(1), '0001: Night');
    assert.equal(names.variableLabel(3), '0003: Season');
    assert.equal(names.variableLabel(12), '0012: Variable 0012');
});

test('a variable test is written only when one is set, and reads back', () => {
    const base = [{ name: 'Light', layer: 'over' }];
    const withWhen = M.change(base, 0, { when: { variable: 1, op: '>=', value: 3 } });
    assert.deepEqual(withWhen[0], { name: 'Light', layer: 'over', when: { variable: 1, op: '>=', value: 3 } });
    assert.deepEqual(R.normalize(withWhen[0]).when, { variable: 1, op: '>=', value: 3 });
    assert.equal(R.shown(R.normalize(withWhen[0]), false, 3), true);
    assert.equal(R.shown(R.normalize(withWhen[0]), false, 2), false);
    const faded = M.change(withWhen, 0, { fade: 0.5 });
    assert.equal(faded[0].fade, 0.5);
    const cleared = M.change(faded, 0, { when: null });
    assert.deepEqual(cleared[0], { name: 'Light', layer: 'over' }, 'no test, no fade left in the file');
    assert.equal('when' in M.change(base, 0, { opacity: 128 })[0], false);
    // A switch and a test together, as an event page's conditions.
    const both = M.change(withWhen, 0, { switch: 1 });
    assert.deepEqual([R.shown(R.normalize(both[0]), true, 3), R.shown(R.normalize(both[0]), true, 2), R.shown(R.normalize(both[0]), false, 3)], [true, false, false]);
});

test('the pictures a variable chooses are rows: each says "When it is N show P", and every other value shows the layer\'s own', () => {
    const layer = { name: 'Town', layer: 'ground', variable: 3, versions: { 2: 'Town_winter', 1: 'Town_night', 10: 'Town_flood' } };
    assert.deepEqual(M.versionRows(layer), [{ value: 1, name: 'Town_night' }, { value: 2, name: 'Town_winter' }, { value: 10, name: 'Town_flood' }], 'lowest value first, as numbers');
    assert.deepEqual(M.versionRows({ name: 'Town', layer: 'ground' }), []);
    // The sentence each row shows, whole and in the pieces the panel lays its two controls into.
    assert.deepEqual(M.versionRows(layer).map(row => plain(M.versionWords(row.value, row.name))),
        ['When it is 1 show Town_night', 'When it is 2 show Town_winter', 'When it is 10 show Town_flood']);
    assert.deepEqual(M.versionParts(), [{ text: 'When it is' }, { slot: 'value' }, { text: 'show' }, { slot: 'picture' }]);
    assert.equal(M.versionWords(2, 'Town_winter'), 'When it is 2 show \u2066Town_winter\u2069', 'the picture\'s name is marked as a file name');
    // What the panel says of every other value, and of a list with no row yet.
    assert.equal(plain(M.versionsRest(layer)), 'Any other value shows the layer\'s own picture, Town.');
    assert.equal(plain(M.versionsRest({ name: 'Town', layer: 'ground', variable: 3 })), 'No picture is listed yet: the layer shows its own picture, Town.');
    assert.equal(plain(M.versionsRest(imported())), 'Any other value shows the layer\'s own picture, 43_Ground.');
    // What it is for, in one line, before a variable is chosen: no file name, no rule.
    assert.equal(M.versionsIntro(), 'For day and night, seasons, or a bridge that breaks. It never hides the layer.');
    // The rows are what the game shows.
    for (const row of M.versionRows(layer)) assert.equal(R.pictureName(R.normalize(layer), row.value), row.name);
    assert.equal(R.pictureName(R.normalize(layer), 4), 'Town');
});

test('the sentence each row shows, in every language: the number, then the picture last; a comma after the number is a piece set against it', () => {
    // The catalog as the editor loads it, into an object of this test's own.
    const context = {};
    new Function('globalThis', read('src/I18nDeepTranslations.js'))(context);
    const words = context.RR_DEEP_TEXT_TRANSLATIONS;
    const locales = ['ja', 'es', 'zh-Hant', 'zh-Hans', 'ru', 'pt', 'de', 'fr', 'el', 'ko', 'ar', 'it', 'pl', 'id', 'vi', 'th', 'tr'];
    const shape = {};
    try {
        for (const locale of locales) {
            assert.ok(words[locale]['When it is {value} show {picture}'], locale);
            global.I18n = { tText: text => words[locale][text] || text, t: key => key };
            const parts = M.versionParts();
            assert.deepEqual(parts.filter(part => part.slot).map(part => part.slot), ['value', 'picture'], locale);
            assert.equal(parts[parts.length - 1].slot, 'picture', `${locale}: the picture has the line under the words`);
            for (const part of parts) if (!part.slot) assert.ok(part.text && part.text === part.text.trim() && (part.mark || !/^[,;:.]/.test(part.text)), `${locale}: ${JSON.stringify(part)}`);
            shape[locale] = parts.map(part => (part.slot ? `[${part.slot}]` : part.mark ? `<${part.text}>` : part.text)).join(' ');
        }
    } finally { delete global.I18n; }
    assert.equal(shape.es, 'Cuando vale [value] <,> mostrar [picture]');
    assert.equal(shape.fr, 'Quand elle vaut [value] <,> afficher [picture]');
    assert.equal(shape.de, 'Bei [value] zeige [picture]');
    assert.equal(shape.ja, '値が [value] のとき表示： [picture]', 'a colon before the picture ends its words and is left with them');
    assert.deepEqual(locales.filter(locale => shape[locale].includes('<')), ['es', 'pt', 'fr', 'el', 'it', 'pl', 'id']);
    // The panel sets the piece against the number field: no gap before a comma.
    assert.match(read('css/styles.css'), /\.rr-image-layer-version-word\.is-mark \{ margin-inline-start: -4px; \}/);
});

test('Add gives the next number; a row is re-pictured, renumbered and removed; an empty list leaves the file', () => {
    const start = [{ name: 'Town', layer: 'ground', variable: 3 }];
    assert.equal(M.nextValue(start[0]), 1);
    const one = M.change(start, 0, M.setVersion(start[0], M.nextValue(start[0]), 'Town_night'));
    assert.deepEqual(one[0], { name: 'Town', layer: 'ground', variable: 3, versions: { 1: 'Town_night' } });
    const two = M.change(one, 0, M.setVersion(one[0], M.nextValue(one[0]), 'Town_winter'));
    assert.deepEqual(two[0].versions, { 1: 'Town_night', 2: 'Town_winter' });
    assert.equal(M.nextValue({ name: 'T', variable: 1, versions: { 2: 'a', 7: 'b' } }), 8, 'one more than the highest');
    assert.equal(M.nextValue({ name: 'T', variable: 1, versions: { 0: 'a' } }), 1);
    // Another picture for a row that is there.
    assert.deepEqual(M.change(two, 0, M.setVersion(two[0], 2, 'Town_snow'))[0].versions, { 1: 'Town_night', 2: 'Town_snow' });
    // A free number is taken; the arrows of the field step over a number another row has; a typed number that is taken is refused.
    assert.deepEqual(M.moveVersion(two[0], 1, 5), { value: 5, patch: { versions: { 2: 'Town_winter', 5: 'Town_night' } } });
    assert.deepEqual(M.moveVersion(two[0], 1, 2, true), { value: 3, patch: { versions: { 2: 'Town_winter', 3: 'Town_night' } } }, 'one step up from 1 goes past 2 to 3');
    assert.deepEqual(M.moveVersion(two[0], 2, 1, true), { value: 0, patch: { versions: { 0: 'Town_winter', 1: 'Town_night' } } }, 'one step down from 2 goes past 1 to 0');
    assert.deepEqual(M.moveVersion({ name: 'T', variable: 1, versions: { 0: 'a', 1: 'b' } }, 1, 0, true), { value: -1, patch: { versions: { 0: 'a', '-1': 'b' } } }, 'past 0 to -1: a variable holds negative numbers too');
    assert.deepEqual(M.moveVersion({ name: 'T', variable: 1, versions: { '-3': 'a', 1: 'b' } }, -3, -4, true).value, -4);
    assert.deepEqual(M.moveVersion({ name: 'T', variable: 1, versions: { '-3': 'a', 1: 'b' } }, 1, -7).value, -7, 'a negative number typed is taken');
    // A variable's range ends at 99999999 either way: a number typed past it is the limit, and no arrow steps beyond.
    assert.deepEqual([M.versionValue(' 12 '), M.versionValue('-3.6'), M.versionValue('1e12'), M.versionValue('-1e12')], [12, -4, 99999999, -99999999]);
    assert.ok([M.versionValue(''), M.versionValue('x'), M.versionValue('-')].every(Number.isNaN));
    assert.equal(M.moveVersion(two[0], 1, 1e12).value, 99999999);
    assert.equal(M.moveVersion({ name: 'T', variable: 1, versions: { 99999998: 'a', 99999999: 'b' } }, 99999998, 99999999, true), null, 'nothing free above the limit');
    assert.equal(M.moveVersion(two[0], 2, 1), null, 'typed onto the number next to it: refused like any other, never moved somewhere the author did not type');
    assert.equal(M.moveVersion(two[0], 1, 2, false), null);
    assert.equal(M.moveVersion({ name: 'T', variable: 1, versions: { 1: 'a', 2: 'b', 9: 'c' } }, 9, 2), null, 'typed onto another row\'s number: refused');
    assert.equal(M.moveVersion({ name: 'T', variable: 1, versions: { 1: 'a', 2: 'b', 9: 'c' } }, 9, 2, true), null, 'an arrow never jumps more than its own step would');
    assert.equal(M.moveVersion(two[0], 2, 2), null, 'the same number is no change');
    assert.equal(M.moveVersion(two[0], 4, 5), null, 'no such row');
    // Removed row by row; the last one takes the list out of the file, the variable stays.
    const less = M.change(two, 0, M.removeVersion(two[0], 1));
    assert.deepEqual(less[0], { name: 'Town', layer: 'ground', variable: 3, versions: { 2: 'Town_winter' } });
    const none = M.change(less, 0, M.removeVersion(less[0], 2));
    assert.deepEqual(none[0], { name: 'Town', layer: 'ground', variable: 3 });
    assert.equal(JSON.stringify(none[0]), '{"name":"Town","layer":"ground","variable":3}', 'no empty list is written');
    // Without the variable nothing chooses a picture: the rows go with it.
    assert.deepEqual(M.change(two, 0, { variable: 0 })[0], { name: 'Town', layer: 'ground' });
    // Rows name their pictures themselves: another picture for the layer leaves them as they are.
    assert.deepEqual(M.change(two, 0, { name: 'City' })[0], { name: 'City', layer: 'ground', variable: 3, versions: { 1: 'Town_night', 2: 'Town_winter' } });
    // A new layer with a variable follows no name rule: only its rows change the picture.
    const made = M.change([M.make('painted', 'Deck_ground')], 0, { variable: 3 });
    assert.deepEqual(made[0], { name: 'Deck_ground', layer: 'ground', variable: 3 });
    assert.deepEqual([1, 2].map(value => R.pictureName(R.normalize(made[0]), value)), ['Deck_ground', 'Deck_ground']);
});

test('an imported layer says its name pattern and the files it names, and List the pictures turns them into rows', () => {
    const files = ['43_Ground', '43-1_Ground', '43-2_Ground', '43-02_Ground', '43-10_Ground', '43-x_Ground', 'Other'];
    const layer = imported();
    assert.equal(plain(M.importWords(layer)), 'From an import: while the variable is N, the layer shows 43-N_Ground.');
    assert.equal(M.importWords({ name: 'Town', layer: 'ground', variable: 2 }), null, 'a layer with no pattern is no import');
    assert.equal(M.importWords({ name: 'Town', layer: 'ground' }), null);
    const hits = M.found(layer, files);
    assert.equal(hits.imported, true);
    assert.deepEqual(hits.files, [{ value: 1, name: '43-1_Ground' }, { value: 2, name: '43-2_Ground' }, { value: 10, name: '43-10_Ground' }], 'every number, in order; "02" is not a number the game asks for');
    assert.equal(plain(hits.words), 'In img/parallaxes now: 43-1_Ground, 43-2_Ground, 43-10_Ground.');
    assert.equal(plain(M.found(layer, ['43_Ground']).words), 'None of these numbered pictures is in img/parallaxes yet.');
    assert.equal(M.found({ name: 'Town', layer: 'ground' }, files), null, 'no variable: nothing to find');
    // The button: every file a row, the pattern taken out, the rest of the layer as it was.
    const patch = M.listed(layer, files);
    assert.deepEqual(patch, { versions: { 1: '43-1_Ground', 2: '43-2_Ground', 10: '43-10_Ground' }, variantName: '' });
    const after = M.change([layer], 0, patch, layer)[0];
    assert.deepEqual(after, { name: '43_Ground', layer: 'ground', variable: 19, versions: { 1: '43-1_Ground', 2: '43-2_Ground', 10: '43-10_Ground' }, opacity: 200, blendMode: 1 });
    // The game shows the same picture as before at every value that has a file.
    for (const value of [0, 1, 2, 10]) assert.equal(R.pictureName(R.normalize(after), value), R.pictureName(R.normalize(layer), value));
    assert.equal(R.pictureName(R.normalize(after), 3), '43_Ground', 'a value with no file showed the layer\'s own picture before, and does now');
    assert.equal(M.importWords(after), null, 'the rows are all the layer shows');
    assert.deepEqual(M.found(after, files), { imported: false, files: [], words: '' });
    assert.equal(M.listed(layer, ['43_Ground']), null, 'no file: nothing to list');
    // A row the author already made stays; only files that are not rows yet are listed and offered.
    const mixed = Object.assign(imported(), { versions: { 2: 'Flooded' } });
    assert.deepEqual(M.found(mixed, files).files.map(hit => hit.value), [1, 10]);
    assert.deepEqual(M.listed(mixed, files).versions, { 1: '43-1_Ground', 2: 'Flooded', 10: '43-10_Ground' });
    // An imported layer keeps its pattern through other edits and while its picture is the one it was loaded with.
    const kept = M.change([imported()], 0, { opacity: 128 }, imported());
    assert.equal(kept[0].variantName, '43-%1_Ground');
    const renamed = M.change(kept, 0, { name: 'Other' }, imported());
    assert.equal('variantName' in renamed[0], false, 'the pattern names the versions of the picture it came with');
    assert.equal(R.pictureName(R.normalize(renamed[0]), 1), 'Other');
    const custom = { name: 'Town', layer: 'ground', variable: 2, variantName: 'Town_v%1' };
    const back = M.change(M.change([custom], 0, { name: 'Else' }, custom), 0, { name: 'Town' }, custom);
    assert.equal(back[0].variantName, 'Town_v%1', 'the loaded pattern returns with the loaded picture');
    const again = M.change(M.change([custom], 0, { variable: 0 }, custom), 0, { variable: 2 }, custom);
    assert.equal(again[0].variantName, 'Town_v%1', 'and with the variable turned on again');
    // A pattern that asks for the number twice, and one with characters a pattern language would read.
    assert.deepEqual(M.matching('%1/x.y-%1', ['2/x.y-2', '2/x.y-3', '2/xzy-2']), [{ value: 2, name: '2/x.y-2' }]);
    assert.deepEqual(M.matching('no number', ['no number']), []);
    // A hand-made layer with no row yet: pictures numbered after its own are found and offered, never applied by themselves.
    const hand = { name: '7_Ground', layer: 'ground', variable: 3 };
    const offered = M.found(hand, ['7_Ground', '7-1_Ground', '7-2_Ground', 'Other']);
    assert.deepEqual([offered.imported, offered.files.map(hit => hit.name), plain(offered.words)], [false, ['7-1_Ground', '7-2_Ground'], 'Found in img/parallaxes: 7-1_Ground, 7-2_Ground.']);
    assert.deepEqual(M.found({ name: 'Town', layer: 'ground', variable: 3 }, ['Town', 'Town-1']).files, [{ value: 1, name: 'Town-1' }]);
    assert.equal(R.pictureName(R.normalize(hand), 1), '7_Ground', 'until they are listed the game shows the layer\'s own picture');
    assert.deepEqual(M.listed(hand, ['7-1_Ground', '7-2_Ground']), { versions: { 1: '7-1_Ground', 2: '7-2_Ground' }, variantName: '' });
    assert.deepEqual(M.found(Object.assign({}, hand, { versions: { 5: 'X' } }), ['7-1_Ground']).files, [], 'once the author lists pictures, nothing more is offered by name');
});

test('the pictures the map can show while the tool is open: the layer\'s own, then each value that has one', () => {
    const choices = (layer, files) => M.lookChoices(layer, files).map(choice => ({ value: choice.value, label: plain(choice.label) }));
    assert.deepEqual(choices({ name: 'Town', layer: 'ground', variable: 3, versions: { 2: 'Town_winter', 1: 'Town_night' } }, []),
        [{ value: 0, label: 'The layer\'s own picture: Town' }, { value: 1, label: '1: Town_night' }, { value: 2, label: '2: Town_winter' }]);
    assert.deepEqual(choices(imported(), ['43-1_Ground', '43-3_Ground']).map(choice => choice.label),
        ['The layer\'s own picture: 43_Ground', '1: 43-1_Ground', '3: 43-3_Ground'], 'an import\'s files are there to look at before they are rows');
    // A row at 0 is what play starts with; the layer's own picture, which every unlisted value shows, is still there to look at.
    const dawn = { name: 'Town', layer: 'ground', variable: 3, versions: { 0: 'Dawn', 1: 'Night' } };
    assert.deepEqual(choices(dawn, []), [{ value: null, label: 'The layer\'s own picture: Town' }, { value: 0, label: '0: Dawn' }, { value: 1, label: '1: Night' }]);
    assert.equal(R.pictureName(R.normalize(dawn), null), 'Town', 'the game\'s own rule names the picture of that choice');
    // A row for a negative number is looked at like any other, in its place by number.
    assert.deepEqual(choices({ name: 'Town', layer: 'ground', variable: 3, versions: { '-3': 'Deep', 2: 'Day' } }, []).map(choice => [choice.value, choice.label]),
        [[0, 'The layer\'s own picture: Town'], [-3, '-3: Deep'], [2, '2: Day']]);
    const session = new M.Session(), looked = { rrImageLayers: [dawn] };
    session.bind(looked);
    const id = session.idOf(dawn);
    assert.equal(session.lookAt(dawn), 0, 'the start of play until the author looks at something else');
    for (const [given, kept] of [[null, null], [-3, -3], ['2', 2], [0, 0], ['x', 0], [2.9, 2]]) { session.setLookAt(id, given); assert.equal(session.lookAt(dawn), kept, String(given)); }
    assert.equal(session.looking.size, 1);
    session.setLookAt(id, 0);
    assert.equal(session.looking.size, 0, 'the start of play is not kept as a look');
    // In the list a file name is marked as one left-to-right piece, so "7_Ground" is not shown as "Ground_7" in a right-to-left language.
    assert.deepEqual(M.lookChoices({ name: '7_Ground', layer: 'ground', variable: 3, versions: { 1: '7-1_Ground' } }, []).map(choice => choice.label),
        ['The layer\'s own picture: \u20667_Ground\u2069', '1: \u20667-1_Ground\u2069']);
    assert.deepEqual(M.lookChoices({ name: 'Town', layer: 'ground', variable: 3 }, ['Town-1']).length, 1, 'nothing listed: only the layer\'s own picture');
});

test('Repeats: across and down, across only, down only; a layer scrolls only where it repeats', () => {
    assert.deepEqual(R.REPEATS.map(M.repeatLabel), ['Across and down', 'Across only', 'Down only']);
    // The row's label is a keyed word: the plain phrase "Repeats" is a count of repetitions in other parts of the editor.
    assert.equal(M.repeatsLabel(), 'Repeats');
    assert.doesNotMatch(read('src/MapImageLayersManager.js') + read('src/MapImageLayersEditor.js'), /tt\('Repeats'\)/);
    const words = read('src/I18nManager.js');
    for (const locale of ['en', 'ja', 'de', 'ar', 'tr']) assert.match(words, new RegExp(`RR_I18N_STRINGS\\["${locale}"\\], \\{"menu\\.imageLayers": "[^"]+", "imageLayers\\.repeats": "[^"]+"\\}`), locale);
    for (const repeat of R.REPEATS) assert.ok(M.repeatHint(repeat).length > 20, repeat);
    assert.match(M.repeatHint('x'), /mountain/);
    assert.match(M.repeatHint('y'), /rain/);
    assert.equal(M.scrollHint('both'), 'Pixels per second, right and down. Negative numbers go left and up.');
    assert.equal(M.scrollHint('x'), 'Pixels per second to the right. A negative number goes left.');
    assert.equal(M.scrollHint('y'), 'Pixels per second downward. A negative number goes up.');
    const fog = [{ name: 'Fog', layer: 'over', fit: 'repeat', drift: [12, 4] }];
    const across = M.change(fog, 0, { repeat: 'x' });
    assert.deepEqual(across[0], { name: 'Fog', layer: 'over', fit: 'repeat', repeat: 'x', drift: [12, 0] }, 'the speed down the screen is not kept: the layer does not scroll that way');
    assert.deepEqual(M.change(fog, 0, { repeat: 'y' })[0], { name: 'Fog', layer: 'over', fit: 'repeat', repeat: 'y', drift: [0, 4] });
    assert.deepEqual(M.change(across, 0, { repeat: 'both' })[0], { name: 'Fog', layer: 'over', fit: 'repeat', drift: [12, 0] }, 'both ways is the default and leaves the file');
    assert.deepEqual(M.change(across, 0, { fit: 'fill' })[0], { name: 'Fog', layer: 'over', fit: 'fill' }, 'a layer that no longer repeats has no direction');
    assert.deepEqual(M.change(across, 0, { layer: 'same' })[0], { name: 'Fog', layer: 'same' });
    assert.deepEqual(M.change(across, 0, { drift: [12, 9] })[0].drift, [12, 0], 'a speed set for the other direction does not reach the file');
    assert.match(M.fitHint('repeat'), /can scroll/);
});

test('a picture locked to the map says the map\'s size, and warns with both sizes when its own differs', () => {
    const map = { width: 1920, height: 1440 };
    assert.deepEqual(M.sizeNote({ name: 'Town', layer: 'ground' }, { width: 1024, height: 768 }, map),
        { warning: true, text: 'This picture is 1024 × 768. The map is 1920 × 1440.' });
    assert.deepEqual(M.sizeNote({ name: 'Town', layer: 'ground' }, { width: 1920, height: 1440 }, map),
        { warning: false, text: 'The map is 1920 × 1440 pixels.' });
    assert.deepEqual(M.sizeNote({ name: 'Town', layer: 'same' }, null, map), { warning: false, text: 'The map is 1920 × 1440 pixels.' }, 'before the picture is read: the size it must have');
    assert.equal(M.sizeNote({ name: 'Fog', layer: 'over', fit: 'repeat' }, { width: 256, height: 256 }, map), null);
    assert.equal(M.sizeNote({ name: 'Dark', layer: 'over', fit: 'fill' }, { width: 816, height: 624 }, map), null);
});

test('on a 3D map a layer it does not draw says so, with what to change', () => {
    assert.equal(M.note3D(owners(), false), null, 'a 2D map draws it');
    const note = M.note3D(owners(), true);
    assert.equal(note.row, 'Not drawn on a 3D map');
    assert.equal(note.text, 'A 3D map shows layers placed on the screen, above characters. Set Placement to Repeating or Fills the screen, and Depth to Above Characters.');
    assert.equal(M.rowLines(owners(), names, true).warning, 'Not drawn on a 3D map');
    assert.equal(M.note3D({ name: 'Fog', layer: 'over', fit: 'repeat' }, true), null);
    assert.equal(M.note3D({ name: 'Dark', layer: 'over', fit: 'fill' }, true), null);
    assert.ok(M.note3D({ name: 'Dark', layer: 'ground', fit: 'fill' }, true), 'on the screen but not above characters');
    // Doing what the note says makes the 3D map draw it.
    const fixed = M.change([owners()], 0, { fit: 'fill' });
    assert.equal(M.note3D(fixed[0], true), null);
});

test('the list shows the top layer first: depth, then stored order; a row moves among rows of its own depth', () => {
    const layers = [
        { name: 'fog', layer: 'over', fit: 'repeat' },      // 0
        { name: 'ground', layer: 'ground' },                // 1
        { name: 'sky', layer: 'back', fit: 'repeat' },      // 2
        { name: 'trees', layer: 'same' },                   // 3
        { name: 'vignette', layer: 'over', fit: 'fill' },   // 4
        { name: 'paths', layer: 'ground' }                  // 5
    ];
    const listed = order => order.map(index => layers[index].name);
    assert.deepEqual(listed(M.order(layers)), ['vignette', 'fog', 'trees', 'paths', 'ground', 'sky']);
    // The list is the game's stacking order turned upside down.
    const byDepth = layers.map((layer, index) => ({ index, depth: R.depth(R.normalize(layer), index) })).sort((a, b) => a.depth - b.depth).map(e => e.index);
    assert.deepEqual(M.order(layers).slice().reverse(), byDepth);
    assert.deepEqual([M.canMove(layers, 4, -1), M.canMove(layers, 4, 1)], [false, true], 'the top row only moves down');
    assert.deepEqual([M.canMove(layers, 0, -1), M.canMove(layers, 0, 1)], [true, false], 'the row under it is a different depth');
    assert.deepEqual([M.canMove(layers, 3, -1), M.canMove(layers, 3, 1)], [false, false], 'alone at its depth');
    assert.deepEqual([M.canMove(layers, 2, -1), M.canMove(layers, 2, 1)], [false, false]);
    const moved = M.move(layers, 4, 1);
    assert.deepEqual(moved.map(l => l.name), ['vignette', 'ground', 'sky', 'trees', 'fog', 'paths'], 'the two layers swap places in the file');
    assert.deepEqual(M.order(moved).map(index => moved[index].name), ['fog', 'vignette', 'trees', 'paths', 'ground', 'sky']);
    assert.equal(moved[1], layers[1], 'the others are the objects they were');
    assert.equal(M.move(layers, 3, 1), layers, 'a row that cannot move leaves the list as it is');
    assert.deepEqual(M.order(M.move(layers, 1, -1)).map(index => M.move(layers, 1, -1)[index].name), ['vignette', 'fog', 'trees', 'ground', 'paths', 'sky']);
    // A depth of its own (z, set in the file) sorts by that depth.
    assert.deepEqual(M.order([{ name: 'a', layer: 'over' }, { name: 'b', layer: 'ground', z: 20 }]), [1, 0]);
    assert.deepEqual(M.order([]), []);
});

test('a map nobody edited keeps its layers byte for byte, and an edit rewrites only the layer changed', () => {
    const map = { width: 20, height: 15, rrImageLayers: [imported(), owners(), { name: 'Odd', layer: 'ground', plugin: { keep: true } }] };
    const before = JSON.stringify(map);
    const stored = map.rrImageLayers, first = stored[0];
    const session = new M.Session();
    session.bind(map);
    const ids = session.layers().map(layer => session.idOf(layer));
    M.order(session.layers()); M.rowLines(first, names, true); M.rows(first, false);
    M.versionRows(first); M.found(first, ['43-1_Ground']); M.lookChoices(first, ['43-1_Ground']); M.importWords(first); M.versionsRest(first);
    session.setHidden(ids[0], true);
    session.setLookAt(ids[0], 2);
    assert.equal(JSON.stringify(map), before, 'looking, listing and hiding write nothing');
    assert.equal(map.rrImageLayers, stored);
    assert.equal(session.canUndo(), false, 'the eye is not a step');
    assert.equal(session.isHidden(first), true);
    assert.equal(session.lookAt(first), 2);
    // The stored form of each layer is what the runtime would write back.
    for (const layer of stored) assert.equal(JSON.stringify(R.write(R.normalize(layer))), JSON.stringify(layer));
    // The plain round trip other tools read through.
    M.load(stored);
    assert.deepEqual(M.read(), stored);
    assert.equal(JSON.stringify(M.read()), JSON.stringify(stored));
    // One edit: the layer changed is written again, the others are the very objects they were.
    session.change(ids[1], { opacity: 128 });
    assert.deepEqual(map.rrImageLayers[1], { name: 'Space-01', layer: 'over', opacity: 128 });
    assert.equal(map.rrImageLayers[0], first);
    assert.equal(map.rrImageLayers[2], stored[2]);
    assert.deepEqual(M.change(stored, 2, { opacity: 10 })[2], { name: 'Odd', layer: 'ground', opacity: 10, plugin: { keep: true } }, 'a field the tool does not know stays');
    assert.equal(session.isHidden(map.rrImageLayers[0]), true, 'the eye follows the layer');
    session.undo();
    assert.equal(JSON.stringify(map), before, 'undone: byte for byte again');
    assert.equal(map.rrImageLayers, stored);
});

test('undo and redo take back and repeat an add, a change, a reorder and a remove', () => {
    const map = { width: 21, height: 15 };
    const session = new M.Session();
    session.bind(map);
    const snap = () => JSON.stringify(map.rrImageLayers);
    const states = [snap()];
    const fog = session.add(M.make('fog', 'Fog_tile')); states.push(snap());
    const dark = session.add(M.make('overlay', 'Vignette')); states.push(snap());
    assert.ok(fog && dark && fog !== dark);
    session.change(fog, { blendMode: 3 }); states.push(snap());
    assert.equal(session.layer(fog).blendMode, 3, 'the layer keeps its number through the change');
    assert.equal(session.move(dark, 1), true); states.push(snap());
    assert.deepEqual(map.rrImageLayers.map(l => l.name), ['Vignette', 'Fog_tile']);
    assert.equal(session.move(dark, 1), false, 'already the lowest of its depth: no step');
    session.remove(fog); states.push(snap());
    assert.deepEqual(map.rrImageLayers.map(l => l.name), ['Vignette']);
    assert.equal(session.undoStack.length, 5);
    for (let i = states.length - 2; i >= 0; i--) { assert.equal(session.undo(), true); assert.equal(snap(), states[i]); }
    assert.equal('rrImageLayers' in map, false, 'back to a map with no layers: the field is gone, as it was');
    assert.equal(session.undo(), false);
    for (let i = 1; i < states.length; i++) { assert.equal(session.redo(), true); assert.equal(snap(), states[i]); }
    assert.equal(session.redo(), false);
    assert.equal(session.indexOf(fog), -1);
    session.undo();
    assert.equal(session.layer(fog).name, 'Fog_tile', 'the layer that comes back is the one that left');
    // A new step drops what could be redone.
    session.undo(); session.change(dark, { opacity: 99 });
    assert.equal(session.canRedo(), false);
    // A drag is one step however many changes it makes.
    const steps = session.undoStack.length;
    for (const opacity of [90, 80, 70]) session.change(dark, { opacity }, 'opacity');
    assert.equal(session.undoStack.length, steps + 1);
    session.endGesture();
    session.change(dark, { opacity: 60 }, 'opacity');
    assert.equal(session.undoStack.length, steps + 2);
    // Removing the last layer of a map stored with an empty list leaves that list, not a hole.
    const empty = { rrImageLayers: [] }, held = empty.rrImageLayers, other = new M.Session();
    other.bind(empty);
    const id = other.add(M.make('painted', 'Town'));
    other.remove(id);
    assert.equal(empty.rrImageLayers, held);
    // Another map starts with no steps.
    session.bind({ width: 5, height: 5 });
    assert.deepEqual([session.canUndo(), session.canRedo(), session.hidden.size], [false, false, 0]);
});

test('the tool takes its steps into the map\'s one undo history', () => {
    const history = new History();
    const tiles = { undoStack: [], redoStack: [], undo() { this.redoStack.push(this.undoStack.pop()); }, redo() { this.undoStack.push(this.redoStack.pop()); }, canUndo() { return this.undoStack.length > 0; }, canRedo() { return this.redoStack.length > 0; } };
    history.register('tiles', { object: tiles });
    const map = {}, session = new M.Session();
    session.bind(map);
    history.register('imageLayers', { object: session, label: () => 'Image Layer' });
    let stepped = 0;
    session.onStep = () => { stepped++; };
    const id = session.add(M.make('fog', 'Fog'));
    tiles.undoStack.push('stroke');
    session.change(id, { opacity: 50 });
    assert.deepEqual(history.undoList, ['imageLayers', 'tiles', 'imageLayers']);
    tiles.undo();               // any tool's undo takes back the last thing done: the opacity
    assert.equal(R.normalize(map.rrImageLayers[0]).opacity, R.normalize(M.make('fog', 'Fog')).opacity);
    session.undo();             // then the tile stroke, though asked of the image layers
    assert.deepEqual(tiles.undoStack, []);
    session.undo();
    assert.equal('rrImageLayers' in map, false);
    assert.equal(stepped, 2);
    history.redo(); history.redo(); history.redo();
    assert.equal(R.normalize(map.rrImageLayers[0]).opacity, 50);
    history.mapChanged();
    assert.equal(session.canUndo(), false);
});

test('a positive drift moves the picture right and down, as the panel says', () => {
    const spec = R.normalize({ name: 'Fog', layer: 'over', fit: 'repeat', drift: [10, 5] });
    const start = R.origin(spec, 0, 0, 0, 48, 48), later = R.origin(spec, 1, 0, 0, 48, 48);
    // The origin is the picture pixel at the view's top left: it falls as the picture slides right and down.
    assert.deepEqual([later.x - start.x, later.y - start.y], [-10, -5]);
    assert.match(M.scrollHint('both'), /right and down\. Negative numbers go left and up\./);
    // The panel takes the words under Scroll Speed from the directions the layer repeats in.
    assert.match(read('src/MapImageLayersManager.js'), /this\._hint\(M\.scrollHint\(record\.repeat\)\)/);
});

// A manager with no window: the panel and the views are off, the edits and the passage answer are real.
// `view` gives the flat map view its five containers, `folder` a pictures folder (see fakeFiles).
function makeManager(map, options = {}) {
    global.RRMapImageLayers = M;
    const tm = { currentMap: map, TILE_WIDTH: 48, TILE_HEIGHT: 48, renders: 0, requestRender() { this.renders++; }, refreshPassage() {} };
    if (options.view) {
        tm.layers = {};
        for (const name of ['imageBack', 'imageGround', 'imageSame', 'imageOver', 'imageMarks']) tm.layers[name] = fakeContainer(name);
        tm.container = { x: 0, y: 0, scale: { x: 1 } };
        tm.app = { renderer: { screen: { width: 860, height: 720 } } };
        tm._mapLoadGeneration = 1;
    }
    const manager = new Manager({ tilemapManager: tm, parallaxFolder: () => options.folder || null }, { getSystem: () => system });
    manager.session.bind(map);
    if (options.is3D) manager.is3DMap = () => true;
    return { manager, tm };
}

const fakePoint = () => ({ x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } });
const fakeContainer = (name) => ({
    name, children: [], destroyed: false,
    addChild(node) { node.parent = this; this.children.push(node); return node; },
    removeChild(node) { this.children = this.children.filter(other => other !== node); node.parent = null; },
    removeChildren() { const all = this.children; this.children = []; for (const node of all) node.parent = null; return all; }
});

// The drawing library as far as the flat view uses it: sprites that remember what they were given. `log` counts.
function fakePixi(log) {
    class Node {
        constructor() { this.parent = null; this.destroyed = false; this.position = fakePoint(); this.tilePosition = fakePoint(); }
        destroy() { this.destroyed = true; log.destroyed++; }
    }
    class Sprite extends Node { constructor(texture) { super(); this.kind = 'sprite'; this.texture = texture; log.made++; } }
    class TilingSprite extends Node { constructor({ texture, width, height }) { super(); this.kind = 'tiling'; this.texture = texture; this.width = width; this.height = height; log.made++; } }
    class Graphics extends Node {
        constructor() { super(); this.rects = []; }
        rect(x, y, w, h) { this.rects.push([x, y, w, h]); return this; }
        fill() { return this; }
        stroke() { return this; }
    }
    const load = async (url) => { log.loads.push(url); return { url, width: 256, height: 256, source: { style: {}, resource: null } }; };
    return { Sprite, TilingSprite, Graphics, Assets: { load } };
}

// img/parallaxes: the names in it, and counts of how often the disk is asked.
function fakeFiles(names, log) {
    return {
        listImageReferences: () => { log.listings++; return names.slice(); },
        imageUrlFor: (folder, name) => { log.lookups++; return names.includes(name) ? `file:///${folder}/${name}.png` : ''; }
    };
}
const newLog = () => ({ made: 0, destroyed: 0, loads: [], listings: 0, lookups: 0 });
const pictureOf = node => node.texture.url.split('/').pop().replace('.png', '');

// A page small enough to run the panel in: tests/helpers/mini-dom.cjs and the few things the panel needs beyond it
// (markup given as text, the last child, a property set on a style, an element put in another's place).
function makePage() {
    const unescape = text => String(text).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const create = (tag) => {
        const el = mini.createElement(tag);
        el.style.setProperty = function (name, value) { this[name] = value; };
        Object.defineProperty(el, 'lastChild', { get() { return this.childNodes[this.childNodes.length - 1] || null; } });
        Object.defineProperty(el, 'firstElementChild', { get() { return this.children[0] || null; } });
        Object.defineProperty(el, 'innerHTML', { get() { return ''; }, set(html) { this.replaceChildren(); parse(String(html), this); } });
        el.replaceWith = function (other) { const parent = this.parentNode; parent.insertBefore(other, this); parent.removeChild(this); };
        return el;
    };
    function parse(html, into) {
        const open = [into];
        for (const m of html.matchAll(/<\/[a-z0-9]+>|<([a-z0-9]+)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/gi)) {
            const top = open[open.length - 1];
            if (m[1]) {
                const el = create(m[1]);
                for (const a of m[2].matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) {
                    const value = unescape(a[2] || '');
                    if (a[1] === 'class') el.className = value.trim(); else if (a[1] === 'style') el.style.cssText = value; else el.setAttribute(a[1], value);
                }
                top.appendChild(el);
                if (!m[3]) open.push(el);
            } else if (m[4]) top.append(unescape(m[4]));
            else if (open.length > 1) open.pop();
        }
    }
    const document = create('document');
    document.body = create('body');
    document.documentElement = create('html');
    document.appendChild(document.documentElement);
    document.documentElement.appendChild(document.body);
    document.createElement = create;
    document.getElementById = (id) => document.body.querySelectorAll('div').find(el => el.id === id) || null;
    return document;
}

// The editor around the tool, as far as the tool reaches into it: a page, the dock, the map's one undo history,
// the picture grid, the switch and variable window, and a folder of pictures. Returns what a test looks at.
function makeEditor(map, options = {}) {
    const log = newLog(), document = makePage(), pickers = [], images = [];
    const dock = document.createElement('div');
    document.body.append(dock);
    global.document = document;
    global.window = { innerWidth: 1600, innerHeight: 1000, addEventListener() {}, removeEventListener() {} };
    global.requestAnimationFrame = () => 1;
    global.cancelAnimationFrame = () => {};
    global.ReactorImageLayers = R;
    global.RRMaterialPopup = Popup;
    global.PIXI = fakePixi(log);
    global.RRAssetFiles = fakeFiles(options.files || [], log);
    global.SwitchVariablePicker = class { constructor() { pickers.push(this); } show(kind, id, callback) { Object.assign(this, { kind, id, callback }); } };
    global.Image = class { constructor() { this.naturalWidth = 640; this.naturalHeight = 480; images.push(this); } };
    const claimed = [];
    global.reactor = {
        mapHistory: new History(),
        claimMapTool: owner => claimed.push(owner),
        releaseMapTool: owner => claimed.push('release ' + owner),
        mapSideDock: () => dock,
        dockMapPanel: panel => { dock.append(panel); return true; },
        undockMapPanel: panel => panel.remove(),
        uiManager: { updateUndoRedoButtons() {}, updateStatus() {} }
    };
    const made = makeManager(map, { view: true, folder: 'F', is3D: options.is3D });
    const focused = () => (document.activeElement ? document.activeElement.getAttribute('data-focus') : null);
    const key = (target, name) => target.fire('keydown', { key: name, preventDefault() {}, stopPropagation() {} });
    // A mouse button going down and coming up, as the page hears it; and one turn of the timers, in which the
    // panel draws what it put off.
    const press = () => document.fire('mousedown');
    const release = () => document.fire('mouseup');
    const settled = () => new Promise(resolve => setTimeout(resolve, 0));
    return Object.assign(made, { log, document, dock, pickers, images, claimed, focused, key, press, release, settled, panel: () => made.manager.panel });
}

test('the tool\'s edits land on the map: add, change, move, remove, and the eye that is never saved', () => {
    const map = { width: 21, height: 15, rrImageLayers: [owners()] };
    const { manager } = makeManager(map);
    const fog = manager.addLayer('fog', 'Fog_tile');
    assert.equal(manager.selectedId, fog, 'the layer just made is the one in hand');
    assert.deepEqual(map.rrImageLayers.map(l => l.name), ['Space-01', 'Fog_tile']);
    assert.equal(manager.addLayer('fog', ''), 0, 'no picture chosen: no layer');
    manager.edit({ opacity: 100 }, 'opacity'); manager.edit({ opacity: 90 }, 'opacity');
    assert.equal(map.rrImageLayers[1].opacity, 90);
    assert.equal(manager.session.undoStack.length, 2, 'one step for the add, one for the drag');
    manager.commit({ fit: 'fill' });
    assert.equal('drift' in map.rrImageLayers[1], false, 'a layer that no longer repeats keeps no drift');
    manager.commit({ layer: 'same' });
    assert.equal(R.normalize(map.rrImageLayers[1]).fit, 'map', 'Same as Characters is locked to the map');
    manager.commit({ layer: 'over' });
    assert.equal(manager.moveLayer(fog, 1), true);
    assert.deepEqual(map.rrImageLayers.map(l => l.name), ['Fog_tile', 'Space-01']);
    const stored = JSON.stringify(map.rrImageLayers), steps = manager.session.undoStack.length;
    manager.setHidden(fog, true);
    assert.equal(JSON.stringify(map.rrImageLayers), stored);
    assert.equal(manager.session.undoStack.length, steps);
    assert.equal(manager.removeLayer(fog), true);
    assert.deepEqual(map.rrImageLayers, [owners()]);
    assert.notEqual(manager.selectedId, fog, 'the selection moves to a layer that is there');
    assert.equal(manager.session.layer(manager.selectedId).name, 'Space-01');
});

test('the passage overlay is told the tiles a Same as Characters picture blocks, by the game\'s rule; a 3D map is told nothing', () => {
    const map = { width: 3, height: 2, rrImageLayers: [{ name: 'Trees', layer: 'same' }, { name: 'Fog', layer: 'over', fit: 'repeat' }] };
    const { manager, tm } = makeManager(map);
    assert.equal(manager.solidTest(map), null, 'before the picture is read the map behaves as if the layer were not there');
    // The grid the game's own rule gives for a picture solid over the middle tile of the top row.
    const samples = R.SOLID.samples, alpha = new Uint8Array(map.width * samples * map.height * samples);
    for (let y = 0; y < samples; y++) for (let x = samples; x < samples * 2; x++) alpha[y * map.width * samples + x] = 255;
    manager._grids.set(manager._gridKey('Trees', tm), R.solidTiles(alpha, map.width, map.height));
    const solid = manager.solidTest(map);
    assert.deepEqual([solid(1, 0), solid(0, 0), solid(2, 0), solid(1, 1), solid(9, 9)], [true, false, false, false, false]);
    assert.equal(manager.solidTest({ width: 3, height: 2 }), null, 'another map');
    // A 3D map does not draw the layer, so it blocks nothing there, whatever its picture holds.
    const haven = makeManager(map, { is3D: true });
    haven.manager._grids.set(haven.manager._gridKey('Trees', haven.tm), R.solidTiles(alpha, map.width, map.height));
    assert.equal(haven.manager.solidTest(map), null);
    const flat = read('src/TilemapManager.js');
    assert.match(flat, /const imageSolid = [^\n]*mapImageLayersManager\?\.solidTest\(map\)/);
    assert.match(flat, /const blocked = imageSolid && imageSolid\(x, y\) \? 0x0f\s*: TilemapManager\.tilePassage\(/);
});

test('a repeating layer drifts in the editor only while the tool is open, and only when a shown layer drifts', () => {
    const map = { width: 21, height: 15, rrImageLayers: [M.make('fog', 'Fog_tile'), M.make('overlay', 'Vignette')] };
    const { manager } = makeManager(map);
    assert.equal(manager._drifts(), true);
    manager.session.setHidden(manager.session.idOf(map.rrImageLayers[0]), true);
    assert.equal(manager._drifts(), false, 'hidden by its eye');
    manager.session.setHidden(manager.session.idOf(map.rrImageLayers[0]), false);
    manager.selectedId = manager.session.idOf(map.rrImageLayers[0]);
    manager.edit({ drift: [0, 0] });
    assert.equal(manager._drifts(), false, 'nothing drifts: nothing runs');
    const still = { width: 21, height: 15, rrImageLayers: [{ name: 'Ground', layer: 'ground', fit: 'repeat', drift: [5, 0] }] };
    assert.equal(makeManager(still, { is3D: true }).manager._drifts(), false, 'a layer the 3D map does not draw');
    const source = read('src/MapImageLayersManager.js');
    assert.match(source, /const wanted = !!this\.panel && !document\.hidden && this\._drifts\(\);/);
    assert.equal((source.match(/requestAnimationFrame\(/g) || []).length, 2, 'one frame loop: started in one place, continued in one');
    // A frame of the preview moves what scrolls and looks at nothing else: no layer is read again, no file asked for.
    const frame = source.slice(source.indexOf('_onFrame(now) {'), source.indexOf('root.MapImageLayersManager = MapImageLayersManager;'));
    assert.doesNotMatch(frame, /_drifts\(|normalize\(|files\(|urlOf\(|_sizeOf\(/);
    const place = source.slice(source.indexOf('_placeScreen() {'), source.indexOf('// The drift preview'));
    assert.doesNotMatch(place, /files\(|urlOf\(|_sizeOf\(/);
});

test('screen layers lie where the game puts them on a map smaller than its screen, and over the part in view on a larger one', () => {
    const map = { width: 21, height: 15 }, size = { width: 1008, height: 720 };
    const { manager, tm } = makeManager(map);
    manager._shown = { width: 1920, height: 1080 };
    tm.container = { x: 0, y: 0, scale: { x: 1 } };
    tm.app = { renderer: { screen: { width: 860, height: 720 } } };
    const point = () => ({ x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } });
    const fill = { position: point(), width: 0, height: 0 };
    manager._placeFill(tm, fill, size);
    // The game centers a small map: its screen reaches past the map by half the difference on each side.
    assert.deepEqual([fill.position.x, fill.position.y, fill.width, fill.height], [-456, -180, 1920, 1080]);
    const fog = R.normalize({ name: 'Fog', layer: 'over', fit: 'repeat', follow: 0.5 }), texture = { width: 256, height: 256 };
    const node = () => ({ position: point(), tilePosition: point(), width: 0, height: 0 });
    const repeat = node();
    manager._placeRepeat(tm, repeat, fog, texture, size, false);
    assert.deepEqual([repeat.width, repeat.height, repeat.position.x, repeat.position.y], [1008, 720, 0, 0], 'both ways: it spans the map');
    // The game's own start for its camera at (-456, -180), seen from the map's corner.
    const game = R.origin(fog, 0, -456 / 48, -180 / 48, 48, 48, 256, 256);
    const mod = (value, by) => ((value % by) + by) % by;
    assert.equal(mod(repeat.tilePosition.x, 256), mod(-456 - game.x, 256));
    assert.equal(mod(repeat.tilePosition.y, 256), mod(-180 - game.y, 256));
    tm.container.x = -300;      // panning the editor does not move the game's camera on a map this small
    const again = node();
    manager._placeRepeat(tm, again, fog, texture, size, false);
    assert.deepEqual([again.tilePosition.x, again.tilePosition.y], [repeat.tilePosition.x, repeat.tilePosition.y]);
    // A map larger than the screen: the view stands for the screen, and a layer that follows by half slides half as far.
    const big = { width: 4800, height: 4800 };
    tm.container = { x: -960, y: -480, scale: { x: 2 } };      // the view's top left is at map pixel (480, 240)
    manager._placeFill(tm, fill, big);
    assert.deepEqual([fill.position.x, fill.position.y, fill.width, fill.height], [480, 240, 430, 360]);
    manager._placeRepeat(tm, repeat, fog, texture, big, false);
    assert.equal(mod(repeat.tilePosition.x, 256), mod(480 - R.origin(fog, 0, 10, 5, 48, 48, 256, 256).x, 256));
    assert.equal(mod(repeat.tilePosition.x, 256), 240, 'half of the scroll stays with the view');
    // On a 3D map a repeating layer is on the screen: it stays with the view however the map scrolls.
    manager._placeRepeat(tm, repeat, fog, texture, big, true);
    assert.deepEqual([repeat.tilePosition.x, repeat.tilePosition.y], [480, 240]);
    manager.clock = 2;
    const drift = R.normalize({ name: 'Fog', layer: 'over', fit: 'repeat', drift: [10, 5] });
    manager._placeRepeat(tm, repeat, drift, texture, big, true);
    assert.deepEqual([mod(repeat.tilePosition.x - 480, 256), mod(repeat.tilePosition.y - 240, 256)], [20, 10], 'two seconds of drift, right and down');
    // Across only: as wide as the map and as tall as its picture, lying where the game puts it for that camera.
    manager.clock = 0;
    const hills = R.normalize({ name: 'Hills', layer: 'back', fit: 'repeat', repeat: 'x', follow: 0.5 }), strip = { width: 512, height: 256 };
    const across = node();
    manager._placeRepeat(tm, across, hills, strip, big, false);
    const start = R.origin(hills, 0, 10, 5, 48, 48, 512, 256);
    assert.deepEqual([across.width, across.height], [4800, 256]);
    assert.deepEqual([across.position.x, across.position.y], [0, 240 - start.y], 'the camera is at map pixel 240 down; the strip follows by half, so it lies 120 above the view\'s top');
    assert.equal(across.position.y, 120);
    assert.deepEqual([mod(across.tilePosition.x, 512), across.tilePosition.y], [mod(480 - start.x, 512), 0]);
    // Down only: the same the other way round.
    const rain = R.normalize({ name: 'Rain', layer: 'over', fit: 'repeat', repeat: 'y', follow: 0, drift: [0, 100] });
    const down = node();
    manager.clock = 1;
    manager._placeRepeat(tm, down, rain, strip, big, false);
    assert.deepEqual([down.width, down.height, down.position.x, down.position.y], [512, 4800, 480, 0], 'follow 0: at the view\'s left edge');
    assert.deepEqual([down.tilePosition.x, mod(down.tilePosition.y - 240, 256)], [0, 100]);
    // A node that stands keeps its size: nothing is written to it again while the layer only scrolls.
    let writes = 0;
    const watched = node();
    for (const key of ['width', 'height']) { let value = 0; Object.defineProperty(watched, key, { get: () => value, set: next => { value = next; writes++; } }); }
    manager._placeRepeat(tm, watched, hills, strip, big, false);
    manager.clock = 2;
    manager._placeRepeat(tm, watched, hills, strip, big, false);
    assert.equal(writes, 2, 'its two sizes once');
    // On a small map the strip lies where the game's screen puts it: the screen reaches 180 above the map, the strip 90 below the screen's top.
    tm.container = { x: 0, y: 0, scale: { x: 1 } };
    manager.clock = 0;
    const small = node();
    manager._placeRepeat(tm, small, hills, strip, size, false);
    assert.deepEqual([small.position.y, small.height], [-90, 256]);
    // On a 3D map it lies on the screen: at the top of the view.
    tm.container = { x: -960, y: -480, scale: { x: 2 } };
    const flat3d = node();
    manager._placeRepeat(tm, flat3d, hills, strip, big, true);
    assert.deepEqual([flat3d.position.y, flat3d.tilePosition.x], [240, 480]);
});

test('Map Properties leaves the image layers exactly as they are on Save', () => {
    const project = read('src/ProjectController.js');
    assert.doesNotMatch(project, /rrImageLayers|RRMapImageLayersEditor|map-image-layers-section/);
    // What the dialog saves starts as every field the map has, the same values: the list is carried, not rebuilt.
    const carry = project.match(/const carried = \{\};\s*for \(const \[key, value\] of Object\.entries\(this\.currentEditingMap \|\| \{\}\)\) \{\s*if \(!key\.startsWith\('_'\)\) carried\[key\] = value;\s*\}/);
    assert.ok(carry, 'the save carries the map\'s own fields through');
    const layers = [imported(), owners()];
    const carried = new Function(`${carry[0]} return carried;`).call({ currentEditingMap: { width: 20, rrImageLayers: layers } });
    assert.equal(carried.rrImageLayers, layers);
    assert.match(project, /const mapData = \{\s*\.\.\.carried,/);
    const html = read('index.html');
    assert.doesNotMatch(html, /map-image-layers-section/);
});

test('Image Layers is a map tool: a toolbar button, a Tools entry, one map owner, its scripts, its own styles', () => {
    const html = read('index.html');
    assert.match(html, /<button class="tool-button" data-action="image-layers"[^>]*data-i18n-title="menu\.imageLayers"[^>]*><img src="images\/icon-image-layers\.svg" alt=""><\/button>/);
    assert.match(html, /<div class="html-menu-option" data-action="image-layers" data-i18n="menu\.imageLayers"/);
    assert.ok(html.indexOf('html-menu-option" data-action="media-surfaces"') < html.indexOf('html-menu-option" data-action="image-layers"'), 'beside Media Surfaces in Tools');
    assert.ok(fs.existsSync(path.join(editorRoot, 'images', 'icon-image-layers.svg')));
    const scripts = [...html.matchAll(/<script src="src\/([^"]+)"/g)].map(m => m[1]);
    assert.ok(scripts.indexOf('MapImageLayersEditor.js') >= 0 && scripts.indexOf('MapImageLayersEditor.js') < scripts.indexOf('MapImageLayersManager.js'));
    assert.ok(scripts.indexOf('MapImageLayersManager.js') < scripts.indexOf('main.js'));
    assert.ok(scripts.indexOf('utils/MaterialPopup.js') < scripts.indexOf('MapImageLayersManager.js'));
    const main = read('src/main.js');
    assert.match(main, /this\.mapImageLayersManager = new MapImageLayersManager\(this\.projectController, this\.databaseManager\);/);
    assert.match(main, /if \(owner !== 'imageLayers'\) this\.mapImageLayersManager\?\.close\(\);/);
    const ui = read('src/UIManager.js');
    assert.match(ui, /case 'image-layers':\s*window\.reactor\?\.mapImageLayersManager\?\.toggle\(\);/);
    // The Tools menu entry goes the way the toolbar button does.
    const menuSwitch = ui.slice(ui.indexOf('handleHtmlMenuAction(action) {'), ui.indexOf('setupNativeMenu() {'));
    assert.match(menuSwitch, /case 'image-layers':\s*this\.handleToolbarAction\(action\);/);
    const source = read('src/MapImageLayersManager.js');
    // The panel is one of the map's docked panels and wears the Lighting panel's cards.
    assert.match(source, /panel\.className = 'lighting-panel rr-accent-scrollbar rr-image-layers-panel';/);
    assert.match(source, /root\.reactor\?\.dockMapPanel\?\.\(panel\)/);
    assert.match(source, /root\.reactor\?\.claimMapTool\?\.\(TOOL\)/);
    assert.match(source, /new SwitchVariablePicker\(this\.databaseManager, this\.projectController\)/);
    // A repeating layer's own movement is called what RPG Maker calls a parallax's: its scroll speed.
    assert.match(source, /this\._row\(tt\('Scroll Speed'\)/);
    assert.match(read('src/MapImageLayersEditor.js'), /repeat: 'Repeats across the view and can scroll: fog, clouds, rain, a far background\.'/);
    // The picker field is the tool's own control in the look of the panel's lists, not a text box with dots.
    assert.doesNotMatch(source, /rr-variable-reference|'\.\.\.'/);
    assert.doesNotMatch(source, /MapEditor3D|mapEditor3D/, 'the 3D view is not reached into');
    // The game's rules come from the runtime file, loaded from the runtime folder.
    assert.match(source, /const RUNTIME_FILE = 'reactor_image_layers\.js';/);
    assert.match(source, /getRuntimePath\?\.\(\)/);
    const flat = read('src/TilemapManager.js');
    assert.match(flat, /for \(const name of \['imageBack', 'imageGround', 'imageSame', 'imageOver', 'imageMarks'\]\)/);
    const order = ['parallax', 'imageBack', 'ground', 'lower3', 'imageGround', 'imageSame', 'upper0', 'upper3', 'imageOver', 'imageMarks']
        .map(name => flat.indexOf(`this.container.addChild(this.layers.${name});`));
    assert.ok(order.every(at => at >= 0) && order.every((at, i) => i === 0 || at > order[i - 1]), 'drawn in the game\'s order');
    assert.match(flat, /renderImageLayers\(\) \{\s*this\.requestRender\(\);\s*const tool = [^\n]*mapImageLayersManager[^\n]*\n\s*return tool \? tool\.drawFlat\(this\) : Promise\.resolve\(\);/);
    // Its styles are its own: every rule of the block starts with the tool's prefix.
    const css = read('css/styles.css');
    const block = css.slice(css.indexOf('Image Layers tool (MapImageLayersManager.js)'), css.indexOf('/* End of the Image Layers tool. */'));
    const rules = block.slice(block.indexOf('*/') + 2).replace(/\/\*[\s\S]*?\*\//g, '').split('}').map(rule => rule.split('{')[0].trim()).filter(Boolean);
    assert.ok(rules.length > 30);
    for (const selectors of rules) for (const selector of selectors.split(',')) assert.match(selector.trim(), /^\.rr-image-layer/, selector);
    assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/, 'theme tokens only');
    assert.doesNotMatch(block.replace(/\/\*[\s\S]*?\*\//g, ''), /\b(?:rgba?|hsla?)\(/, 'no color written out, in any notation');
    // The row under the pointer is not the tone of the selected row (in a light theme the button hover tone is the selection's yellow).
    const hover = block.match(/\.rr-image-layer-item:hover \{([^}]*)\}/)[1];
    assert.doesNotMatch(hover, /--color-bg-button-hover|--color-bg-selected/);
    assert.match(hover, /--color-bg-hover/);
});

test('a null in the stored list has no row and breaks nothing; it keeps its place in the file', async () => {
    const fog = M.make('fog', 'Fog'), dark = M.make('overlay', 'Vignette');
    const layers = [fog, null, dark];
    assert.deepEqual(M.order(layers), [2, 0]);
    assert.deepEqual([M.canMove(layers, 2, 1), M.canMove(layers, 0, -1), M.canMove(layers, 0, 1)], [true, true, false]);
    assert.deepEqual(M.move(layers, 2, 1), [dark, null, fog], 'the two layers swap; the hole stays where it is');
    assert.deepEqual(M.remove(layers, 2), [fog, null]);
    const session = new M.Session();
    session.bind({ rrImageLayers: layers });
    assert.equal(session.count(), 2);
    assert.equal(session.indexOf(0), -1, 'no layer answers to no number, the hole least of all');
    assert.equal(session.change(0, { opacity: 1 }), false);
    // The panel itself, with such a list.
    const map = { width: 21, height: 15, rrImageLayers: [fog, null, dark, 'x', 7] };
    const { manager, panel, document } = makeEditor(map, { files: ['Fog', 'Vignette'] });
    assert.equal(await manager.open(), true);
    const rows = panel().querySelectorAll('.rr-image-layer-item');
    assert.deepEqual(rows.map(row => row.querySelector('.rr-image-layer-name').textContent), ['Vignette', 'Fog']);
    assert.equal(panel().querySelector('.rr-image-layer-list-card').querySelector('.lit-section-meta').textContent, '2');
    assert.equal(manager.session.layer(manager.selectedId), dark, 'the top layer is in hand');
    assert.ok(panel().querySelector('.rr-image-layer-settings'));
    await manager.drawFlat();
    assert.equal(manager.removeLayer(manager.session.idOf(dark)), true);
    assert.deepEqual(map.rrImageLayers, [fog, null, 'x', 7]);
    assert.equal(panel().querySelectorAll('.rr-image-layer-item').length, 1);
    manager.close();
    assert.equal(document.body.querySelectorAll('.rr-image-layers-panel').length, 0);
});

test('the flat view draws each layer in the container of its depth, with its opacity and blend; the eye and a 3D map leave layers out', async () => {
    const stored = () => [
        { name: 'Sky', layer: 'back', fit: 'repeat', follow: 0.5 },
        { name: 'Ground', layer: 'ground' },
        { name: 'Trees', layer: 'same' },
        { name: 'Fog', layer: 'over', opacity: 128, blendMode: 3, fit: 'repeat', drift: [12, 4] },
        { name: 'Vignette', layer: 'over', blendMode: 2, fit: 'fill' },
        null,
        { name: 'Light', layer: 'over', blendMode: 1 },
        { name: 'Gone', layer: 'over' }
    ];
    const files = ['Sky', 'Ground', 'Trees', 'Fog', 'Vignette', 'Light'];
    const map = { width: 21, height: 15, rrImageLayers: stored() };
    const { manager, tm } = makeEditor(map, { files });
    await manager.drawFlat(tm);
    const drawn = host => tm.layers[host].children.map(pictureOf);
    assert.deepEqual(['imageBack', 'imageGround', 'imageSame', 'imageOver'].map(drawn), [['Sky'], ['Ground'], ['Trees'], ['Fog', 'Vignette', 'Light']], 'a picture with no file draws nothing');
    const [fog, dark, light] = tm.layers.imageOver.children;
    assert.deepEqual([fog.kind, fog.alpha, fog.blendMode, fog.width, fog.height], ['tiling', 128 / 255, 'screen', 1008, 720]);
    assert.deepEqual([dark.kind, dark.alpha, dark.blendMode, typeof dark.onRender], ['sprite', 1, 'multiply', 'function']);
    assert.deepEqual([light.blendMode, light.onRender], ['add', undefined], 'a picture locked to the map lies on it and is placed once');
    assert.deepEqual([tm.layers.imageGround.children[0].alpha, tm.layers.imageGround.children[0].blendMode], [1, 'normal']);
    // The eye takes a layer off the map and writes nothing.
    const before = JSON.stringify(map.rrImageLayers);
    manager.session.setHidden(manager.session.idOf(map.rrImageLayers[3]), true);
    await manager.drawFlat(tm);
    assert.deepEqual(drawn('imageOver'), ['Vignette', 'Light']);
    assert.equal(fog.destroyed, true);
    assert.equal(JSON.stringify(map.rrImageLayers), before);
    // A 3D map draws what lies on the screen above the characters, and nothing else.
    const haven = makeEditor({ width: 21, height: 15, rrImageLayers: stored() }, { files, is3D: true });
    await haven.manager.drawFlat(haven.tm);
    assert.deepEqual(['imageBack', 'imageGround', 'imageSame', 'imageOver'].map(host => haven.tm.layers[host].children.map(pictureOf)), [[], [], [], ['Fog', 'Vignette']]);
});

test('a dragged slider sets the sprites that stand: nothing is built again and the disk is not asked', async () => {
    const map = { width: 21, height: 15, rrImageLayers: [{ name: 'Ground', layer: 'ground' }, M.make('fog', 'Fog'), M.make('overlay', 'Vignette'), { name: 'Late', layer: 'over' }] };
    const files = ['Ground', 'Fog', 'Vignette', 'Other'];
    const { manager, tm, log } = makeEditor(map, { files });
    await manager.drawFlat(tm);
    // A picture's address is found on the disk once per reading of the folder, however often it is asked for.
    const found = log.lookups;
    assert.equal(manager.urlOf('Fog'), 'file:///F/Fog.png');
    assert.equal(manager.urlOf('Fog'), manager.urlOf('Fog'));
    assert.equal(log.lookups, found);
    const fog = tm.layers.imageOver.children[0];
    const counts = () => [log.made, log.destroyed, log.loads.length, log.lookups];
    const built = counts();
    manager.selectedId = manager.session.idOf(map.rrImageLayers[1]);
    for (const opacity of [120, 100, 80]) { manager.edit({ opacity }, 'opacity'); await manager.drawFlat(tm); }
    manager.edit({ blendMode: 1 });
    manager.edit({ drift: [30, 0] });
    manager.edit({ follow: 0.25 });
    await manager.drawFlat(tm);
    assert.deepEqual(counts(), built, 'no sprite made, none destroyed, no picture loaded, no address looked up');
    assert.equal(tm.layers.imageOver.children[0], fog);
    assert.deepEqual([fog.alpha, fog.blendMode, fog.rrRecord.drift, fog.rrRecord.follow], [80 / 255, 'add', [30, 0], 0.25]);
    // A drag lasts longer than a reading of the folder is kept for: it reads nothing, and the folder is read again when it is over.
    manager._listing.at = -Infinity;
    const asked = [log.listings, log.lookups];
    manager.edit({ opacity: 60 }, 'opacity');
    await manager.drawFlat(tm);
    assert.deepEqual([log.listings, log.lookups], asked, 'the drag keeps the reading it began with');
    assert.equal(fog.alpha, 60 / 255);
    manager.session.endGesture();
    await manager.drawFlat(tm);
    assert.equal(log.listings, asked[0] + 1, 'the drag is over: the folder is read again');
    // What changes the picture, its kind or its container builds the view again.
    manager.edit({ name: 'Other' });
    await manager.drawFlat(tm);
    assert.equal(fog.destroyed, true);
    assert.deepEqual(tm.layers.imageOver.children.map(pictureOf), ['Other', 'Vignette']);
    const again = counts();
    manager.edit({ layer: 'back' });
    await manager.drawFlat(tm);
    assert.deepEqual([tm.layers.imageBack.children.map(pictureOf), tm.layers.imageOver.children.map(pictureOf)], [['Other'], ['Vignette']]);
    assert.ok(log.made > again[0]);
    // A picture that was missing is drawn once its file is in the folder.
    files.push('Late');
    manager._listing = null;
    await manager.drawFlat(tm);
    assert.deepEqual(tm.layers.imageOver.children.map(pictureOf), ['Vignette', 'Late']);
});

test('over the 3D view: the layers a 3D map draws, with opacity and the closest CSS blend; a scrolling layer asks the disk nothing', () => {
    const map = { width: 200, height: 200, rrImageLayers: [
        { name: 'Space', layer: 'over' },
        { name: 'Fog', layer: 'over', opacity: 128, blendMode: 3, fit: 'repeat', drift: [12, 4] },
        { name: 'Glow', layer: 'over', blendMode: 1, fit: 'fill' },
        { name: 'Shade', layer: 'over', blendMode: 2, fit: 'fill' },
        { name: 'Ground', layer: 'ground', fit: 'repeat' }
    ] };
    const { manager, document, log, images } = makeEditor(map, { files: ['Space', 'Fog', 'Glow', 'Shade', 'Ground'], is3D: true });
    const host = document.createElement('div'), input = document.createElement('div');
    host.id = 'canvas-container';
    host.clientWidth = 1632;
    host.append(input);
    document.body.append(host);
    manager.view3DSurface = () => input;
    manager.syncScreen();
    const laid = () => host.children.filter(el => el.classList.contains('rr-image-layer-screen'));
    assert.deepEqual(laid().map(el => el.style.backgroundImage), ['url("file:///F/Fog.png")', 'url("file:///F/Glow.png")', 'url("file:///F/Shade.png")']);
    assert.equal(host.children[host.children.length - 1], input, 'under the view\'s own input surface');
    assert.deepEqual(laid().map(el => el.style.mixBlendMode), ['screen', 'plus-lighter', 'multiply']);
    assert.deepEqual(laid().map(el => el.style.opacity), [String(128 / 255), '1', '1']);
    assert.deepEqual(laid().map(el => el.classList.contains('is-repeating')), [true, false, false]);
    // The picture's size arrives; from then on a frame of scrolling reads the layer's own entry.
    assert.equal(images.length, 1, 'only a repeating layer needs its picture\'s size');
    Object.assign(images[0], { naturalWidth: 256, naturalHeight: 128 });
    images[0].onload();
    const fog = laid()[0], asked = log.lookups + log.listings;
    assert.equal(fog.style.backgroundSize, '512px 256px', 'at the scale the game\'s 816 wide screen has in a view 1632 wide');
    assert.equal(fog.style.backgroundPosition, '0px 0px');
    manager.clock = 2;
    for (let frame = 0; frame < 60; frame++) manager._placeScreen();
    assert.equal(log.lookups + log.listings, asked);
    // Two seconds at 12 and 4 pixels a second, right and down, doubled by the view's scale.
    const start = R.origin(R.normalize(map.rrImageLayers[1]), 2, 0, 0, 1, 1, 256, 128);
    assert.equal(fog.style.backgroundPosition, `${-start.x * 2}px ${-start.y * 2}px`);
    // A setting changed keeps the elements; the eye takes one away.
    manager.selectedId = manager.session.idOf(map.rrImageLayers[1]);
    manager.session.change(manager.selectedId, { opacity: 64, blendMode: 0 });
    manager.syncScreen();
    assert.equal(laid()[0], fog);
    assert.deepEqual([fog.style.opacity, fog.style.mixBlendMode], [String(64 / 255), 'normal']);
    // A slider dragged over the 3D view asks the disk nothing, however long the drag lasts.
    manager._listing.at = -Infinity;
    const read = log.lookups + log.listings;
    manager.session.change(manager.selectedId, { opacity: 32 }, 'opacity');
    manager.syncScreen();
    assert.equal(log.lookups + log.listings, read);
    assert.equal(fog.style.opacity, String(32 / 255));
    manager.session.endGesture();
    manager.session.setHidden(manager.selectedId, true);
    manager.syncScreen();
    assert.deepEqual(laid().map(el => el.style.backgroundImage), ['url("file:///F/Glow.png")', 'url("file:///F/Shade.png")']);
    assert.equal(fog.parentNode, null);
});

test('over the 3D view a strip repeats across the top of the screen and a column down its left, each scrolling its own way', () => {
    const map = { width: 200, height: 200, rrImageLayers: [
        { name: 'Ridge', layer: 'over', fit: 'repeat', repeat: 'x', drift: [40, 7] },
        { name: 'Rain', layer: 'over', fit: 'repeat', repeat: 'y', drift: [9, 240] },
        { name: 'Fog', layer: 'over', fit: 'repeat', drift: [12, 4] }
    ] };
    const { manager, document, images } = makeEditor(map, { files: ['Ridge', 'Rain', 'Fog'], is3D: true });
    const host = document.createElement('div'), input = document.createElement('div');
    host.id = 'canvas-container';
    host.clientWidth = 1632;
    host.append(input);
    document.body.append(host);
    manager.view3DSurface = () => input;
    manager.syncScreen();
    const laid = () => host.children.filter(el => el.classList.contains('rr-image-layer-screen'));
    const classes = el => ['is-repeating', 'is-across', 'is-down'].filter(name => el.classList.contains(name));
    assert.deepEqual(laid().map(classes), [['is-repeating', 'is-across'], ['is-repeating', 'is-down'], ['is-repeating']]);
    for (const image of images) { Object.assign(image, { naturalWidth: 640, naturalHeight: 200 }); image.onload(); }
    manager.clock = 2;
    manager._placeScreen();
    const [ridge, rain, fog] = laid();
    // Two seconds, doubled by the view's scale: the strip has scrolled across and stands at the top; the column the other way.
    assert.deepEqual([ridge.style.backgroundSize, ridge.style.backgroundPosition], ['1280px 400px', `${-(640 - 80) * 2}px 0px`]);
    assert.deepEqual([rain.style.backgroundSize, rain.style.backgroundPosition], ['1280px 400px', `0px ${-(200 - 80) * 2}px`], '480 pixels down is 80 into the third picture');
    assert.equal(fog.style.backgroundPosition, `${-(640 - 24) * 2}px ${-(200 - 8) * 2}px`);
    // A direction changed keeps the element and changes how it repeats.
    manager.selectedId = manager.session.idOf(map.rrImageLayers[0]);
    manager.session.change(manager.selectedId, { repeat: 'both' });
    manager.syncScreen();
    assert.equal(laid()[0], ridge);
    assert.deepEqual(classes(ridge), ['is-repeating']);
    const css = read('css/styles.css');
    assert.match(css, /\.rr-image-layer-screen\.is-across \{ background-repeat: repeat-x; \}/);
    assert.match(css, /\.rr-image-layer-screen\.is-down \{ background-repeat: repeat-y; \}/);
});

test('the tiles a Same as Characters picture blocks are marked only while that layer is in hand and shown', async () => {
    const map = { width: 3, height: 2, rrImageLayers: [{ name: 'Trees', layer: 'same' }, M.make('fog', 'Fog')] };
    const { manager, tm } = makeEditor(map, { files: ['Trees', 'Fog'] });
    const samples = R.SOLID.samples, alpha = new Uint8Array(map.width * samples * map.height * samples);
    for (let y = 0; y < samples; y++) for (let x = samples; x < samples * 2; x++) alpha[y * map.width * samples + x] = 255;
    manager._grids.set(manager._gridKey('Trees', tm), R.solidTiles(alpha, map.width, map.height));
    const marks = () => tm.layers.imageMarks.children.flatMap(node => node.rects);
    const trees = manager.session.idOf(map.rrImageLayers[0]), fog = manager.session.idOf(map.rrImageLayers[1]);
    manager.selectedId = trees;
    manager._drawMarks();
    assert.deepEqual(marks(), [], 'the tool is closed');
    await manager.open();
    manager.select(fog);
    assert.deepEqual(marks(), [], 'another layer is in hand');
    manager.select(trees);
    assert.deepEqual(marks(), [[49, 1, 46, 46]], 'the one tile the picture is solid on');
    manager.setHidden(trees, true);
    assert.deepEqual(marks(), []);
    manager.setHidden(trees, false);
    assert.equal(marks().length, 1);
    manager.close();
    assert.deepEqual(marks(), []);
});

test('the tool opens as a step-taker of the map\'s history and closes leaving the map as play starts', async () => {
    const map = { width: 21, height: 15, rrImageLayers: [{ name: '7_Ground', layer: 'ground', variable: 3, versions: { 2: '7-2_Ground' } }, M.make('fog', 'Fog')] };
    const { manager, document, panel, claimed, focused } = makeEditor(map, { files: ['7_Ground', '7-2_Ground', 'Fog'] });
    assert.equal(await manager.open(), true);
    assert.deepEqual(claimed, ['imageLayers']);
    assert.equal(focused(), 'add', 'the keyboard starts in the panel, at Add Layer');
    const owner = reactor.mapHistory.owners.get('imageLayers');
    assert.equal(owner.object, manager.session);
    manager.selectedId = manager.session.idOf(map.rrImageLayers[1]);
    manager.edit({ opacity: 99 }, 'opacity');
    assert.deepEqual(reactor.mapHistory.undoList, ['imageLayers']);
    // An undo asked for in the middle of a drag closes the drag first.
    assert.equal(manager.session._gesture, 'opacity');
    reactor.mapHistory.settle();
    assert.equal(manager.session._gesture, null);
    // A version looked at, the scroll clock, an open menu: all of it ends with the tool.
    const ground = manager.session.idOf(map.rrImageLayers[0]);
    manager.session.setLookAt(ground, 2);
    await manager.drawFlat();
    assert.deepEqual(manager.tilemap().layers.imageGround.children.map(pictureOf), ['7-2_Ground']);
    manager.clock = 3;
    manager._openMenu(panel().querySelector('.rr-image-layer-add'));
    assert.equal(document.body.querySelectorAll('.rr-image-layer-menu').length, 1);
    assert.equal(document.listeners.mouseup.length, 1);
    assert.equal(document.listeners.click.length, 1);
    manager.close();
    assert.equal(manager.session.looking.size, 0);
    assert.equal(manager.clock, 0);
    assert.equal(manager._menu, null);
    assert.equal(document.body.querySelectorAll('.rr-image-layer-menu').length, 0);
    assert.equal(Popup.isOpen(), false);
    assert.deepEqual([document.listeners.mouseup.length, document.listeners.click.length], [0, 0], 'nothing is left listening');
    assert.deepEqual(claimed, ['imageLayers', 'release imageLayers']);
    await manager.drawFlat();
    assert.deepEqual(manager.tilemap().layers.imageGround.children.map(pictureOf), ['7_Ground'], 'the picture at the start of play');
});

test('Add offers a 3D map only what it draws; the picture grid takes the keyboard, and the new layer\'s row gets it back', async () => {
    const files = ['Deck_ground', 'Deck_ground-1', 'Deck_ground-2', 'Fog', 'It\'s "quoted"', 'Sky', 'Vignette'];
    const flat = makeEditor({ width: 21, height: 15 }, { files });
    await flat.manager.open();
    const choicesOf = (editor) => {
        editor.manager._openMenu(editor.panel().querySelector('.rr-image-layer-add'));
        const rows = editor.document.body.querySelectorAll('.rr-image-layer-menu-row');
        return { rows, keys: rows.map(row => row.dataset.choice) };
    };
    assert.deepEqual(choicesOf(flat).keys, ['painted', 'fog', 'far', 'overlay', 'solid']);
    flat.manager.close();
    const { manager, document, panel, focused, key } = makeEditor({ width: 200, height: 200 }, { files, is3D: true });
    await manager.open();
    const menu = choicesOf({ manager, document, panel });
    assert.deepEqual(menu.keys, ['fog', 'overlay']);
    const placed = [], place = manager._placeGrid.bind(manager);
    manager._placeGrid = (grid, anchor) => { placed.push(grid.className); return place(grid, anchor); };
    menu.rows[0].click();
    assert.equal(manager._menu, null);
    const grid = document.body.querySelector('.rr-material-popup');
    assert.ok(grid.classList.contains('rr-image-layer-grid'), 'wider tiles and whole names: numbered pictures can be told apart');
    assert.deepEqual(placed, ['rr-material-popup rr-image-layer-grid'], 'placed again once it has the size this tool gives it');
    const options = grid.querySelectorAll('.rr-material-option');
    assert.deepEqual(options.map(option => option.dataset.name), files);
    // A quote in a file's name does not end the address the grid writes between quotes.
    const quoted = options[4].querySelector('.rr-material-option-face').style.cssText;
    assert.match(quoted, /url\('file:\/\/\/F\/It%27s "quoted"\.png'\)/);
    // The first picture has the keys; arrows walk rows of five; Tab stops at one picture only.
    options.forEach((option, index) => { option.offsetTop = Math.floor(index / 5) * 70; });
    assert.equal(document.activeElement, options[0]);
    assert.deepEqual(options.map(option => option.tabIndex), [0, -1, -1, -1, -1, -1, -1]);
    key(grid, 'ArrowRight');
    assert.equal(document.activeElement, options[1]);
    key(grid, 'ArrowDown');
    assert.equal(document.activeElement, options[6]);
    key(grid, 'ArrowDown');
    assert.equal(document.activeElement, options[6], 'no row below');
    key(grid, 'ArrowUp');
    key(grid, 'ArrowLeft');
    assert.equal(document.activeElement, options[0]);
    key(grid, 'End');
    assert.equal(document.activeElement, options[6]);
    assert.deepEqual(options.map(option => option.tabIndex), [-1, -1, -1, -1, -1, -1, 0]);
    key(grid, 'Home');
    // Tab leaves the grid for the button it opened from.
    key(grid, 'Tab');
    assert.equal(Popup.isOpen(), false);
    assert.equal(focused(), 'add');
    // Chosen with Enter (a button's own click): the layer is on the map and its row has the keyboard.
    choicesOf({ manager, document, panel }).rows[0].click();
    document.body.querySelector('.rr-material-popup').querySelectorAll('.rr-material-option')[3].click();
    assert.deepEqual(manager.map().rrImageLayers, [M.make('fog', 'Fog')]);
    assert.equal(focused(), `pick-${manager.selectedId}`);
    // The layer's own picture: the grid opens on the picture in use, and the tile gets the keyboard back.
    panel().querySelector('[data-focus="picture"]').click();
    const own = document.body.querySelector('.rr-material-popup').querySelectorAll('.rr-material-option');
    assert.equal(document.activeElement, own[3]);
    own[5].click();
    assert.equal(manager.map().rrImageLayers[0].name, 'Sky');
    assert.equal(focused(), 'picture');
    manager.close();
});

test('the picture grid is placed again at the size this tool gives it: inside the window, its pictures scrolling when the room is short', () => {
    const { manager } = makeEditor({ width: 21, height: 15 }, {});
    const pictures = { style: {}, height: 470, getBoundingClientRect() { return { height: this.style.maxHeight ? Math.min(this.height, parseFloat(this.style.maxHeight)) : this.height }; } };
    const grid = { style: {}, querySelector: () => pictures, getBoundingClientRect: () => ({ width: 388, height: pictures.getBoundingClientRect().height + 48 }) };
    const place = (width, height, anchor) => {
        Object.assign(global.window, { innerWidth: width, innerHeight: height });
        pictures.style = {};
        grid.style = {};
        manager._placeGrid(grid, { getBoundingClientRect: () => anchor });
        return [grid.style.left, grid.style.top, pictures.style.maxHeight];
    };
    // Room for all of it under the button it opened from.
    assert.deepEqual(place(1600, 1000, { left: 1290, top: 208, bottom: 234 }), ['1204px', '238px', undefined]);
    // 1280 x 720: 486 px under the button. The grid ends 8 px above the window's edge and its pictures scroll.
    assert.deepEqual(place(1280, 720, { left: 971, top: 197, bottom: 222 }), ['884px', '226px', '438px']);
    // The opener low in the window: more room over it than under it, so the grid stands over it.
    assert.deepEqual(place(1280, 720, { left: 300, top: 600, bottom: 626 }), ['300px', '78px', undefined]);
    Object.assign(global.window, { innerWidth: 1600, innerHeight: 1000 });
});

test('a switch or a variable is chosen in the editor\'s own window; what is chosen lands in its field, and so does the keyboard', async () => {
    const map = { width: 21, height: 15, rrImageLayers: [M.make('fog', 'Fog')] };
    const { manager, panel, pickers, focused } = makeEditor(map, { files: ['Fog'] });
    await manager.open();
    const field = name => panel().querySelector(`[data-focus="${name}"]`);
    const label = name => field(name).querySelector('.rr-image-layer-reference-label');
    assert.equal(label('switch').textContent, 'None');
    assert.ok(field('switch').classList.contains('is-empty'));
    field('switch').click();
    assert.deepEqual([pickers.length, pickers[0].kind], [1, 'switch']);
    pickers[0].callback(1);
    assert.equal(map.rrImageLayers[0].switch, 1);
    assert.equal(label('switch').textContent, '0001: Night');
    assert.ok(label('switch').classList.contains('rr-image-layer-own'));
    assert.equal(focused(), 'switch');
    // The same switch again changes nothing and takes no step; the keyboard still comes back to the field.
    const steps = manager.session.undoStack.length;
    field('picture').focus();
    field('switch').click();
    pickers[1].callback(1);
    assert.equal(manager.session.undoStack.length, steps);
    assert.equal(focused(), 'switch');
    // Ticking the box of the variable condition opens the window; closed without a choice, nothing is set.
    const tick = name => { const box = field(name); box.checked = !box.checked; box.fire('change'); };
    tick('when-on');
    assert.equal(pickers[2].kind, 'variable');
    assert.equal(field('when-on').checked, false);
    pickers[2].callback(0);
    assert.equal('when' in map.rrImageLayers[0], false);
    tick('when-on');
    pickers[3].callback(3);
    assert.deepEqual(map.rrImageLayers[0].when, { variable: 3, op: '>=', value: 1 });
    assert.equal(label('when').textContent, '0003: Season');
    assert.equal(focused(), 'when');
    assert.ok(field('when-op') && field('when-value') && field('fade'), 'the test and the fade appear with the condition');
    // The words of the conditions: whole sentences, the field on a line of its own under them.
    const toggles = panel().querySelectorAll('.rr-image-layer-toggle').map(toggle => toggle.textContent);
    assert.deepEqual(toggles, ['While this switch is ON', 'While this variable', 'Variable']);
    const lines = panel().querySelectorAll('.rr-image-layer-condition');
    assert.deepEqual(lines.slice(0, 5).map(line => [line.classList.contains('is-under'), line.querySelectorAll('.rr-image-layer-reference').length]), [[false, 0], [true, 1], [false, 0], [true, 1], [true, 0]]);
    assert.equal(plain(panel().querySelector('.rr-image-layer-shown-meta').textContent), 'While Night is ON · While Season is at least 1');
    assert.ok(panel().querySelector('.rr-image-layer-shown-meta').classList.contains('is-sentence'), 'read whole, on its own line');
    // Clearing the box removes the condition.
    tick('switch-on');
    assert.equal('switch' in map.rrImageLayers[0], false);
    // Numbered versions: the same window.
    tick('versions-on');
    assert.equal(pickers[4].kind, 'variable');
    pickers[4].callback(1);
    assert.equal(map.rrImageLayers[0].variable, 1);
    assert.equal(focused(), 'versions');
    manager.close();
});

test('a number field: one visit or one held arrow is one undo step, an emptied field takes its number back, a step that changed nothing is not kept', async () => {
    const map = { width: 21, height: 15, rrImageLayers: [{ name: 'Sky', layer: 'back', fit: 'repeat', follow: 0.5 }] };
    const { manager, panel, document } = makeEditor(map, { files: ['Sky'] });
    await manager.open();
    const session = manager.session, field = name => panel().querySelector(`[data-focus="${name}"]`);
    const stored = () => R.normalize(map.rrImageLayers[0]);
    const set = (input, text) => { input.value = text; input.fire('input'); };
    // What the themed stepper does for each repeat of a held arrow: the value, an input and a change.
    const step = (input, text) => { set(input, text); input.fire('change'); };
    const follow = field('follow');
    assert.equal(follow.value, '50');
    for (const value of ['55', '60', '65', '70']) step(follow, value);
    assert.equal(stored().follow, 0.7);
    assert.equal(session.undoStack.length, 1, 'the held arrow is one step');
    document.fire('mouseup');
    step(follow, '75');
    assert.equal(session.undoStack.length, 2, 'the next press is the next step');
    follow.fire('blur');
    // Emptied and left: the number it had, not 0.
    set(follow, '');
    follow.fire('change');
    assert.equal(stored().follow, 0.75);
    assert.equal(follow.value, '75');
    assert.equal(session.undoStack.length, 2);
    // Past its limit: the limit, shown in the field.
    const right = field('drift-x');
    step(right, '5000');
    assert.deepEqual([stored().drift[0], right.value], [999, '999']);
    right.fire('keyup', { key: 'Enter' });
    assert.equal(session._gesture, null, 'Enter closes the step');
    // Typed, then taken back by the field's own undo before leaving it: no step that undoes nothing stays.
    const steps = session.undoStack.length, before = map.rrImageLayers;
    const down = field('drift-y');
    set(down, '7');
    assert.equal(session.undoStack.length, steps + 1);
    set(down, '0');
    assert.equal(session.undoStack.length, steps);
    assert.equal(map.rrImageLayers, before, 'the very list it had');
    assert.deepEqual(reactor.mapHistory.undoList.length, steps, 'the map\'s history forgot the step too');
    // The same value typed again is no step at all.
    set(down, '0');
    assert.equal(session.undoStack.length, steps);
    // The stepper gives the keyboard to the field it steps, after its first change: the field that loses the
    // keyboard then does not close this field's step.
    set(down, '5');
    right.fire('blur');
    set(down, '6');
    assert.equal(session.undoStack.length, steps + 1);
    down.fire('blur');
    set(down, '7');
    assert.equal(session.undoStack.length, steps + 2, 'its own blur does');
    manager.close();
});

test('Change the picture with a variable in the panel: a variable, rows with a number and a picture, Add, remove, and what every other value shows', async () => {
    const map = { width: 21, height: 15, rrImageLayers: [{ name: 'Town', layer: 'ground' }] };
    const files = ['Town', 'Town_night', 'Town_winter', 'Town_flood'];
    const { manager, panel, pickers, focused, document, settled } = makeEditor(map, { files });
    await manager.open();
    const field = name => panel().querySelector(`[data-focus="${name}"]`);
    const group = () => panel().querySelector('.rr-image-layer-versions-meta').parentNode.parentNode;
    const texts = selector => group().querySelectorAll(selector).map(el => plain(el.textContent));
    // Off: its name, what it is for in one line, and the variable field at None. No rows, no Add, nothing about file names.
    assert.equal(group().querySelector('.lit-group-title').children[0].textContent, 'Change the picture with a variable');
    assert.equal(panel().querySelector('.rr-image-layer-versions-meta').textContent, 'Off');
    assert.deepEqual(texts('.lit-note'), ['For day and night, seasons, or a bridge that breaks. It never hides the layer.']);
    assert.equal(field('versions').querySelector('.rr-image-layer-reference-label').textContent, 'None');
    assert.deepEqual([field('version-add'), group().querySelector('.rr-image-layer-version')], [null, null]);
    // A variable chosen with the editor's own window: the field names it, Add appears, and the panel says what is shown meanwhile.
    field('versions').click();
    assert.equal(pickers[0].kind, 'variable');
    pickers[0].callback(3);
    assert.equal(map.rrImageLayers[0].variable, 3);
    assert.equal(field('versions').querySelector('.rr-image-layer-reference-label').textContent, '0003: Season');
    assert.equal(field('version-add').textContent, '+ Add a picture');
    assert.deepEqual(texts('.rr-image-layer-version-rest'), ['No picture is listed yet: the layer shows its own picture, Town.']);
    assert.equal(field('look'), null, 'nothing to look at yet');
    // Add: the picture is chosen from the same grid as the layer's own picture; the row gets the next number.
    const pickFromGrid = (name) => { const option = document.body.querySelector('.rr-material-popup').querySelectorAll('.rr-material-option').find(candidate => candidate.dataset.name === name); if (option) option.click(); return !!option; };
    field('version-add').click();
    assert.ok(document.body.querySelector('.rr-material-popup').classList.contains('rr-image-layer-grid'));
    assert.ok(document.body.querySelector('.rr-material-popup').querySelector('.rr-material-options').classList.contains('rr-accent-scrollbar'), 'the pictures scroll under the editor\'s own scrollbar');
    // The layer is locked to the map: the grid says how large such a picture must be, for a row's picture as for the layer's own.
    const gridNote = () => document.body.querySelector('.rr-material-popup').querySelector('.rr-material-popup-note').textContent;
    assert.equal(gridNote(), 'A picture locked to the map must be as large as the map: 1008 × 720 pixels.');
    pickFromGrid('Town_night');
    assert.deepEqual(map.rrImageLayers[0], { name: 'Town', layer: 'ground', variable: 3, versions: { 1: 'Town_night' } });
    assert.equal(focused(), 'version-add', 'the keyboard is back on Add, for the next one');
    field('version-add').click(); pickFromGrid('Town_winter');
    field('version-add').click();
    assert.equal(pickFromGrid('Town_gone'), false, 'the grid offers the pictures of the folder and no other');
    assert.deepEqual(map.rrImageLayers[0].versions, { 1: 'Town_night', 2: 'Town_winter' });
    Popup.close();
    // Each row: its sentence around a number field and a picture button with the picture's own thumbnail and name.
    const rows = () => group().querySelectorAll('.rr-image-layer-version');
    assert.deepEqual(rows().map(row => row.title), ['When it is 1 show Town_night', 'When it is 2 show Town_winter']);
    const first = rows()[0];
    assert.deepEqual(first.querySelector('.rr-image-layer-version-words').children.map(child => (child.tagName === 'SPAN' ? child.textContent : `[${child.value}]`)), ['When it is', '[1]', 'show']);
    // The picture is the row's own second line, across the card; Remove stands at the end of the words' line and comes last for the keyboard.
    assert.deepEqual(first.children.map(child => child.className.split(' ').filter(name => /version-(words|picture|remove)$/.test(name))[0]),
        ['rr-image-layer-version-words', 'rr-image-layer-version-picture', 'rr-image-layer-version-remove']);
    assert.equal(first.children[1].querySelector('.rr-image-layer-version-name').textContent, 'Town_night');
    const sheet = read('css/styles.css');
    assert.match(sheet, /\.rr-image-layer-version \{ display: grid; grid-template-columns: minmax\(0, 1fr\) 20px;[^}]*padding-inline: 6px 3px;/, 'the wider inset at the side the row starts on, in either direction of writing');
    assert.match(sheet, /\.rr-image-layer-version-words \{ grid-area: 1 \/ 1;/);
    assert.match(sheet, /\.rr-image-layer-version-remove \{ grid-area: 1 \/ 2;/);
    assert.match(sheet, /\.rr-image-layer-version-picture \{ grid-area: 2 \/ 1 \/ 3 \/ -1; margin-inline-end: 3px;/, 'both columns: the same inset at both ends of the card');
    // The number field is as wide as its digits need, so a long number is read whole.
    assert.equal(first.querySelector('.rr-image-layer-version-value').style.width, '55px');
    // In a language that puts a comma after the number, the comma is a piece set against the field.
    try {
        global.I18n = { tText: text => (text === 'When it is {value} show {picture}' ? 'Cuando vale {value}, mostrar {picture}' : text), t: key => key };
        manager.render();
        assert.deepEqual(rows()[0].querySelector('.rr-image-layer-version-words').children.map(child => (child.tagName === 'SPAN' ? [child.textContent, child.classList.contains('is-mark')] : `[${child.value}]`)),
            [['Cuando vale', false], '[1]', [',', true], ['mostrar', false]]);
    } finally { delete global.I18n; }
    manager.render();
    const thumb = first.querySelector('.rr-image-layer-thumb');
    assert.equal(thumb.style['--rr-image-layer-picture'], 'url("file:///F/Town_night.png")');
    assert.ok(first.querySelector('.rr-image-layer-version-name').classList.contains('rr-image-layer-file'));
    assert.deepEqual(texts('.rr-image-layer-version-rest'), ['Any other value shows the layer\'s own picture, Town.']);
    // Another picture for a row, from the same grid, opened on the picture in use.
    field('version-picture-2').click();
    assert.equal(document.activeElement.dataset.name, 'Town_winter');
    assert.equal(gridNote(), 'A picture locked to the map must be as large as the map: 1008 × 720 pixels.');
    pickFromGrid('Town_flood');
    assert.deepEqual(map.rrImageLayers[0].versions, { 1: 'Town_night', 2: 'Town_flood' });
    assert.equal(focused(), 'version-picture-2');
    // A number typed is taken when the field is left or Enter is pressed, never while it is typed.
    const number = value => field(`version-${value}`);
    const second = number(2);
    second.focus();
    second.value = '1'; second.fire('input', { inputType: 'insertText' });
    assert.deepEqual(map.rrImageLayers[0].versions, { 1: 'Town_night', 2: 'Town_flood' }, 'half-typed: nothing changed');
    second.value = '12345678'; second.fire('input', { inputType: 'insertText' });
    assert.equal(second.style.width, '90px', 'the field grows with what is typed');
    second.value = '7'; second.fire('input', { inputType: 'insertText' }); second.fire('change');
    assert.deepEqual(map.rrImageLayers[0].versions, { 1: 'Town_night', 7: 'Town_flood' });
    // Taken where the row stands: the same field, picture and Remove, answering to the new number.
    assert.equal(number(7), second);
    assert.deepEqual([second.parentNode.parentNode.dataset.value, second.parentNode.parentNode.title, second.style.width], ['7', 'When it is 7 show Town_flood', '55px']);
    assert.ok(field('version-picture-7') && field('version-remove-7') && !field('version-picture-2') && !field('version-remove-2'));
    assert.equal(focused(), 'version-7', 'Enter leaves the keyboard in the field');
    await settled();
    assert.notEqual(number(7), second, 'the panel is drawn again once the key is over');
    assert.equal(focused(), 'version-7', 'and the keyboard is on the row\'s field as before');
    // Another row's number is refused: the field takes its own back and the row says why.
    const steps = manager.session.undoStack.length;
    number(7).value = '1'; number(7).fire('change');
    assert.deepEqual([map.rrImageLayers[0].versions, number(7).value, manager.session.undoStack.length], [{ 1: 'Town_night', 7: 'Town_flood' }, '7', steps]);
    const refused = () => panel().querySelectorAll('.rr-image-layer-version-refused').map(note => [note.parentNode.dataset.value, note.textContent, note.getAttribute('role')]);
    assert.deepEqual(refused(), [['7', 'Another row already shows a picture for 1.', 'status']]);
    number(7).value = '1'; number(7).fire('change');
    assert.equal(refused().length, 1, 'said once, not once per try');
    number(7).value = ''; number(7).fire('change');
    assert.equal(number(7).value, '7', 'emptied: the number it had');
    // The number next to another row's, typed: refused too. The same number from the field's arrow steps past that row.
    manager.commit(M.setVersion(map.rrImageLayers[0], 2, 'Town_winter'));
    number(2).value = '1'; number(2).fire('input', { inputType: 'insertText' }); number(2).fire('change');
    assert.deepEqual(map.rrImageLayers[0].versions, { 1: 'Town_night', 2: 'Town_winter', 7: 'Town_flood' }, 'typed 1 onto row 1: nothing moved');
    assert.equal(refused().filter(note => note[0] === '2').length, 1);
    const stepped = number(1);
    stepped.value = '2'; stepped.fire('input'); stepped.fire('change');
    assert.deepEqual(map.rrImageLayers[0].versions, { 2: 'Town_winter', 3: 'Town_night', 7: 'Town_flood' }, 'the arrow of row 1 goes past 2 to 3');
    assert.deepEqual([number(3), stepped.value], [stepped, '3'], 'the field shows the number it was given');
    number(3).value = '1'; number(3).fire('input', { inputType: 'insertText' }); number(3).fire('change');
    manager.commit(M.removeVersion(map.rrImageLayers[0], 2));
    assert.deepEqual(map.rrImageLayers[0].versions, { 1: 'Town_night', 7: 'Town_flood' });
    manager.render();
    assert.deepEqual(refused(), [], 'the panel drawn again says it no more');
    // A row whose picture has no file says so.
    manager.commit(M.setVersion(map.rrImageLayers[0], 9, 'Town_gone'));
    assert.deepEqual(rows().map(row => row.querySelectorAll('.rr-image-layer-version-problem').map(el => el.textContent)), [[], [], ['This picture is not in img/parallaxes.']]);
    // What the map shows while the tool is open, by picture; it follows a row that is renumbered and goes with one removed.
    assert.deepEqual(field('look').children.map(option => [option.value, plain(option.textContent)]), [['0', 'The layer\'s own picture: Town'], ['1', '1: Town_night'], ['7', '7: Town_flood'], ['9', '9: Town_gone']]);
    field('look').value = '7'; field('look').fire('change');
    assert.equal(manager.session.lookAt(map.rrImageLayers[0]), 7);
    // The list names pictures whole: its row is one column, label over list, as wide as the card.
    assert.ok(field('look').parentNode.parentNode.classList.contains('rr-image-layer-look'));
    assert.match(read('css/styles.css'), /\.rr-image-layers-panel \.rr-image-layer-look\.lit-row \{ grid-template-columns: minmax\(0, 1fr\);/);
    await manager.drawFlat();
    assert.deepEqual(manager.tilemap().layers.imageGround.children.map(pictureOf), ['Town_flood']);
    number(7).value = '4'; number(7).fire('change');
    assert.equal(manager.session.lookAt(map.rrImageLayers[0]), 4);
    await settled();
    assert.equal(field('look').value, '4');
    assert.deepEqual(rows().map(row => row.dataset.value), ['1', '4', '9'], 'drawn again in the order of the numbers');
    // Remove: the row goes, the keyboard goes to Add, and a look at it ends.
    field('version-remove-4').click();
    assert.deepEqual(map.rrImageLayers[0].versions, { 1: 'Town_night', 9: 'Town_gone' });
    assert.deepEqual([focused(), manager.session.lookAt(map.rrImageLayers[0])], ['version-add', 0]);
    // Each of these was one undo step.
    manager.session.undo();
    assert.deepEqual(map.rrImageLayers[0].versions, { 1: 'Town_night', 4: 'Town_flood', 9: 'Town_gone' });
    // A row at 0 is what play starts with: the list to look at still offers the layer's own picture, apart from it.
    manager.commit(M.setVersion(map.rrImageLayers[0], 0, 'Town_winter'));
    assert.deepEqual(field('look').children.map(option => [option.value, plain(option.textContent)]).slice(0, 3), [['own', 'The layer\'s own picture: Town'], ['0', '0: Town_winter'], ['1', '1: Town_night']]);
    assert.equal(field('look').value, '0', 'the start of play is what is shown until another is chosen');
    await manager.drawFlat();
    assert.deepEqual(manager.tilemap().layers.imageGround.children.map(pictureOf), ['Town_winter']);
    field('look').value = 'own'; field('look').fire('change');
    assert.equal(manager.session.lookAt(map.rrImageLayers[0]), null);
    await manager.drawFlat();
    assert.deepEqual(manager.tilemap().layers.imageGround.children.map(pictureOf), ['Town']);
    manager.render();
    assert.equal(field('look').value, 'own', 'the choice is kept when the panel is drawn again');
    // A row for a negative number: its field holds it, and it can be looked at.
    manager.commit(M.setVersion(map.rrImageLayers[0], -12, 'Town_flood'));
    assert.deepEqual([number(-12).value, number(-12).min, number(-12).style.width], ['-12', '-99999999', '55px']);
    field('look').value = '-12'; field('look').fire('change');
    await manager.drawFlat();
    assert.deepEqual(manager.tilemap().layers.imageGround.children.map(pictureOf), ['Town_flood']);
    // The box cleared: variable and rows leave the file together.
    const box = field('versions-on');
    box.checked = false; box.fire('change');
    assert.deepEqual(map.rrImageLayers[0], { name: 'Town', layer: 'ground' });
    manager.close();
});

test('a number typed and left by a click elsewhere: what was clicked is still there, the click lands, and the panel is drawn again after it', async () => {
    const map = { width: 21, height: 15, rrImageLayers: [
        { name: 'Fog', layer: 'over', fit: 'repeat', drift: [12, 4], when: { variable: 1, op: '>=', value: 2 } },
        { name: 'Town', layer: 'ground', variable: 3, versions: { 1: 'Town_night', 2: 'Town_winter' } }
    ] };
    const { manager, panel, document, focused, press, release, settled } = makeEditor(map, { files: ['Fog', 'Town', 'Town_night', 'Town_winter', 'Town_flood'] });
    await manager.open();
    const field = name => panel().querySelector(`[data-focus="${name}"]`);
    const town = () => map.rrImageLayers[1], rows = () => panel().querySelectorAll('.rr-image-layer-version');
    const listRow = name => panel().querySelectorAll('.rr-image-layer-pick').find(pick => pick.querySelector('.rr-image-layer-name').textContent === name);
    const gridOpen = () => !!document.body.querySelector('.rr-material-popup');
    const pickFromGrid = name => document.body.querySelector('.rr-material-popup').querySelectorAll('.rr-material-option').find(option => option.dataset.name === name).click();
    // What the browser does when a number is typed and another control is clicked: the button goes down, the
    // field is left and reports its number, the button comes up, and the click goes to the control that was
    // under the pointer when the button went down. A control taken off the page in between gets no click.
    const typeThenClick = (input, text, target) => {
        input.focus();
        input.value = text; input.fire('input', { inputType: 'insertText' });
        press();
        input.fire('change');
        const there = target.isConnected;
        release();
        if (there) { target.focus(); target.click(); }
        return there;
    };
    listRow('Town').click();

    // "+ Add a picture" after a row's number: the number is taken, the grid opens.
    const add = field('version-add'), one = field('version-1');
    assert.equal(typeThenClick(one, '5', add), true, 'Add is still on the page when the click arrives');
    assert.deepEqual(town().versions, { 2: 'Town_winter', 5: 'Town_night' });
    assert.equal(gridOpen(), true);
    assert.deepEqual([field('version-add'), field('version-5')], [add, one], 'nothing was put in the place of the button or the field');
    assert.deepEqual(rows().map(row => row.dataset.value), ['5', '2'], 'the row keeps its place while the grid is open');
    await settled();
    assert.equal(gridOpen(), true, 'the panel is not drawn again under the open grid');
    assert.equal(field('version-add'), add);
    pickFromGrid('Town_flood');
    assert.deepEqual(town().versions, { 2: 'Town_winter', 5: 'Town_night', 6: 'Town_flood' }, 'the new row gets the number after the one just typed');
    assert.deepEqual(rows().map(row => row.dataset.value), ['2', '5', '6'], 'drawn again, in order');
    assert.equal(focused(), 'version-add');
    assert.equal(manager._due, null, 'the panel drawn for the new row is the drawing that was put off');

    // The row's own picture after its number: the grid opens for the row, and the picture chosen is for its new number.
    const picture = field('version-picture-2');
    assert.equal(typeThenClick(field('version-2'), '9', picture), true);
    assert.equal(field('version-picture-9'), picture);
    assert.equal(gridOpen(), true);
    pickFromGrid('Town');
    assert.deepEqual(town().versions, { 5: 'Town_night', 6: 'Town_flood', 9: 'Town' });
    assert.equal(focused(), 'version-picture-9');

    // Another row's Remove after a number: that row goes, the number stays taken.
    assert.equal(typeThenClick(field('version-5'), '1', field('version-remove-6')), true);
    assert.deepEqual(town().versions, { 1: 'Town_night', 9: 'Town' });
    // The row's own Remove after its number: the renumbered row goes.
    assert.equal(typeThenClick(field('version-9'), '4', field('version-remove-9')), true);
    assert.deepEqual(town().versions, { 1: 'Town_night' });
    manager.commit(M.setVersion(town(), 2, 'Town_winter'));

    // Closed without a choice (Escape): the key coming up draws the panel that was put off.
    const two = field('version-2');
    typeThenClick(two, '8', field('version-add'));
    await settled();
    assert.equal(field('version-8'), two, 'put off while the grid is open');
    Popup.close();
    document.fire('keyup', { key: 'Escape' });
    await settled();
    assert.notEqual(field('version-8'), two);
    assert.deepEqual([town().versions, rows().map(row => row.dataset.value)], [{ 1: 'Town_night', 8: 'Town_winter' }, ['1', '8']]);

    // The same while the Add menu, a list of the panel or the switch and variable window is open over it.
    const waits = () => { manager._due = 'panel'; const before = field('version-add'); manager._settle(); return manager._due === 'panel' && field('version-add') === before; };
    manager._openMenu(field('add'));
    assert.equal(waits(), true, 'the Add menu');
    manager._closeMenu();
    for (const name of ['rr-shim-popup', 'switch-variable-picker-modal']) {
        const over = document.createElement('div');
        over.className = name;
        document.body.append(over);
        assert.equal(waits(), true, name);
        over.remove();
    }
    assert.equal(waits(), false, 'nothing open: drawn');

    // Tab: no button is down. The number is taken as the field is left, the keyboard lands where Tab sends
    // it, and the panel drawn again leaves it there.
    const eight = field('version-8');
    eight.focus();
    eight.value = '3'; eight.fire('input', { inputType: 'insertText' }); eight.fire('change');
    field('version-picture-3').focus();
    await settled();
    assert.equal(focused(), 'version-picture-3', 'not pulled back into the number field');
    assert.deepEqual(rows().map(row => row.dataset.value), ['1', '3']);

    // A held arrow of the field: every repeat steps the same field, on the page until the button comes up.
    const held = field('version-3'), steps = manager.session.undoStack.length;
    press();
    for (const text of ['4', '5', '6']) { held.value = text; held.fire('input'); held.fire('change'); held.focus(); }
    assert.deepEqual([field('version-6'), town().versions], [held, { 1: 'Town_night', 6: 'Town_winter' }]);
    assert.equal(manager.session.undoStack.length, steps + 1, 'the held arrow is one undo step');
    await settled();
    assert.equal(field('version-6'), held, 'nothing is drawn while the button is down');
    release();
    await settled();
    assert.notEqual(field('version-6'), held);
    assert.equal(focused(), 'version-6', 'the keyboard stays in the field that was stepped');
    // The next press is the next step, and a number typed before the keyboard leaves the field belongs to it,
    // as in the panel's other number fields. Enter ends the step; so does leaving the field.
    const again = field('version-6');
    again.value = '7'; again.fire('input'); again.fire('change');
    assert.equal(manager.session.undoStack.length, steps + 2);
    again.value = '8'; again.fire('input', { inputType: 'insertText' }); again.fire('change'); again.fire('keyup', { key: 'Enter' });
    assert.equal(manager.session.undoStack.length, steps + 2, 'the arrow and the number typed after it: one visit, one step');
    again.value = '9'; again.fire('input', { inputType: 'insertText' }); again.fire('change'); again.fire('blur');
    assert.deepEqual([manager.session.undoStack.length, town().versions], [steps + 3, { 1: 'Town_night', 9: 'Town_winter' }], 'after Enter: the next step');
    again.value = '2'; again.fire('input', { inputType: 'insertText' }); again.fire('change');
    assert.equal(manager.session.undoStack.length, steps + 4, 'the field was left in between: a step of its own');
    manager.session.undo();
    assert.deepEqual(town().versions, { 1: 'Town_night', 9: 'Town_winter' });
    await settled();

    // A number of the layer's settings, then another layer's row in the list: the row is the one that was
    // pressed, and one click selects it.
    listRow('Fog').click();
    const card = panel().querySelector('.rr-image-layer-list-card'), other = listRow('Town');
    assert.equal(typeThenClick(field('drift-x'), '30', other), true);
    assert.deepEqual(R.normalize(map.rrImageLayers[0]).drift, [30, 4]);
    assert.equal(manager.selectedId, manager.session.idOf(town()), 'selected by the first click');
    await settled();
    // The words that quote a number are written again where they stand: the list is the same list.
    listRow('Fog').click();
    const list = panel().querySelector('.rr-image-layer-list-card'), fog = listRow('Fog'), value = field('when-value');
    const lines = () => fog.querySelectorAll('.rr-image-layer-line').map(line => plain(line.textContent));
    assert.deepEqual(lines(), ['Above Characters, Repeating', 'While Chapter is at least 2']);
    value.focus();
    value.value = '5'; value.fire('input'); value.fire('change');
    assert.deepEqual(lines(), ['Above Characters, Repeating', 'While Chapter is at least 2'], 'not while the key is under way');
    await settled();
    assert.deepEqual(lines(), ['Above Characters, Repeating', 'While Chapter is at least 5']);
    assert.equal(fog.title, 'Fog\nAbove Characters, Repeating\nWhile Chapter is at least 5'.replace(/Chapter/g, '\u2068Chapter\u2069'));
    assert.equal(plain(panel().querySelector('.rr-image-layer-shown-meta').textContent), 'While Chapter is at least 5');
    assert.deepEqual([panel().querySelector('.rr-image-layer-list-card'), listRow('Fog'), field('when-value')], [list, fog, value], 'no card, row or field was replaced');
    assert.equal(focused(), 'when-value');
    assert.notEqual(card, null);

    // Closed with something still put off: nothing is drawn afterwards, and no timer is left.
    value.value = '6'; value.fire('input'); value.fire('change');
    manager.close();
    assert.deepEqual([manager._due, manager._settleTimer, manager._pressed], [null, null, false]);
    await settled();
    assert.equal(manager.panel, null);
});

test('an imported layer in the panel: its pattern in words, the files found, and one button that lists them', async () => {
    const map = { width: 21, height: 15, rrImageLayers: [imported()] };
    const { manager, panel, focused } = makeEditor(map, { files: ['43_Ground', '43-1_Ground', '43-2_Ground'] });
    await manager.open();
    const field = name => panel().querySelector(`[data-focus="${name}"]`);
    const box = () => panel().querySelector('.rr-image-layer-versions');
    assert.deepEqual(box().children.filter(child => child.tagName === 'DIV').map(child => plain(child.textContent)),
        ['From an import: while the variable is N, the layer shows 43-N_Ground.', 'In img/parallaxes now: 43-1_Ground, 43-2_Ground.']);
    assert.equal(field('version-listall').textContent, 'List the pictures');
    assert.equal(panel().querySelectorAll('.rr-image-layer-version').length, 0);
    // The files can be looked at before they are rows.
    assert.deepEqual(field('look').children.map(option => plain(option.textContent)), ['The layer\'s own picture: 43_Ground', '1: 43-1_Ground', '2: 43-2_Ground']);
    field('version-listall').click();
    assert.deepEqual(map.rrImageLayers[0], { name: '43_Ground', layer: 'ground', variable: 19, versions: { 1: '43-1_Ground', 2: '43-2_Ground' }, opacity: 200, blendMode: 1 });
    assert.equal(panel().querySelectorAll('.rr-image-layer-version').length, 2);
    assert.equal(box(), null, 'the rows say it all: nothing is left of the pattern');
    assert.equal(focused(), 'version-add');
    assert.equal(manager.session.undoStack.length, 1, 'one step');
    manager.session.undo();
    assert.deepEqual(map.rrImageLayers[0], imported(), 'undone: the import as it was');
    // None of the files is there: the panel says so and offers no button.
    manager.close();
    const bare = makeEditor({ width: 21, height: 15, rrImageLayers: [imported()] }, { files: ['43_Ground'] });
    await bare.manager.open();
    const lines = bare.panel().querySelector('.rr-image-layer-versions').children;
    assert.deepEqual(lines.map(child => plain(child.textContent)), ['From an import: while the variable is N, the layer shows 43-N_Ground.', 'None of these numbered pictures is in img/parallaxes yet.']);
    assert.ok(lines[1].classList.contains('rr-image-layer-warning'));
    assert.equal(bare.panel().querySelector('[data-focus="version-listall"]'), null);
    bare.manager.close();
});

test('Repeats in the panel: the list under Placement, and only the speed of a direction the layer repeats in', async () => {
    const map = { width: 21, height: 15, rrImageLayers: [M.make('fog', 'Fog')] };
    const { manager, panel } = makeEditor(map, { files: ['Fog'] });
    await manager.open();
    const field = name => panel().querySelector(`[data-focus="${name}"]`);
    const labels = () => panel().querySelectorAll('.rr-image-layer-label').map(label => label.textContent).filter(Boolean);
    assert.deepEqual(labels().slice(0, 6), ['Picture', 'Depth', 'Placement', 'Repeats', 'Scroll Speed', 'Moves with the map']);
    // A row with one list is marked as such: the list stands beside its label while the entry it shows fits, and
    // under the label at the card's width when a language's words are longer, so no entry is cut.
    const listRows = () => panel().querySelectorAll('.rr-image-layer-row').filter(row => row.classList.contains('is-list')).map(row => [row.querySelector('.rr-image-layer-label').textContent, row.querySelector('select').getAttribute('data-focus')]);
    assert.deepEqual(listRows(), [['Depth', 'depth'], ['Placement', 'placement'], ['Repeats', 'repeats'], ['Blend Mode', 'blend']]);
    const sheet = read('css/styles.css');
    assert.match(sheet, /\.rr-image-layers-panel \.rr-image-layer-row\.is-list \{ display: flex; flex-wrap: wrap;/);
    assert.match(sheet, /\.rr-image-layer-row\.is-list > \.rr-image-layer-label \{ flex: 0 0 108px;/, 'the label keeps the width of the label column');
    assert.match(sheet, /\.rr-image-layer-row\.is-list > \.rr-image-layer-field \{ flex: 1 1 auto; min-width: 0; \}/, 'the list is as wide as its entry asks, and wraps under the label when that is more than the row has');
    assert.deepEqual(field('repeats').children.map(option => [option.value, option.textContent]), [['both', 'Across and down'], ['x', 'Across only'], ['y', 'Down only']]);
    assert.deepEqual([field('repeats').value, !!field('drift-x'), !!field('drift-y')], ['both', true, true]);
    const hints = () => panel().querySelectorAll('.rr-image-layer-hint').map(hint => hint.textContent);
    assert.ok(hints().includes('Pixels per second, right and down. Negative numbers go left and up.'));
    field('repeats').value = 'x'; field('repeats').fire('change');
    assert.deepEqual(map.rrImageLayers[0], { name: 'Fog', layer: 'over', opacity: 128, fit: 'repeat', repeat: 'x', drift: [12, 0] });
    assert.deepEqual([field('repeats').value, !!field('drift-x'), !!field('drift-y')], ['x', true, false], 'across only: no speed down the screen');
    assert.ok(hints().includes(M.repeatHint('x')) && hints().includes('Pixels per second to the right. A negative number goes left.'));
    field('repeats').value = 'y'; field('repeats').fire('change');
    assert.deepEqual([map.rrImageLayers[0].repeat, map.rrImageLayers[0].drift, !!field('drift-x'), !!field('drift-y')], ['y', undefined, false, true]);
    // A layer that does not repeat has no such row; Same as Characters says how thick to draw what blocks.
    manager.commit({ fit: 'fill' });
    assert.equal(field('repeats'), null);
    manager.commit({ layer: 'same' });
    assert.ok(hints().some(hint => /at least 3 pixels thick/.test(hint)), 'where the author chooses Same as Characters');
    manager.close();
    // The scroll preview runs for a layer only while it scrolls where it repeats.
    const still = makeManager({ width: 21, height: 15, rrImageLayers: [{ name: 'Hills', layer: 'back', fit: 'repeat', repeat: 'x', drift: [0, 30] }] });
    assert.equal(still.manager._drifts(), false);
    const moving = makeManager({ width: 21, height: 15, rrImageLayers: [{ name: 'Rain', layer: 'over', fit: 'repeat', repeat: 'y', drift: [0, 30] }] });
    assert.equal(moving.manager._drifts(), true);
});

test('opened over the Build bar the tool leaves the bar up, and a click on the bar hands the map back first', async () => {
    const main = read('src/main.js');
    const claim = main.slice(main.indexOf('    claimMapTool(owner) {'), main.indexOf('    syncMapToolButtons() {'));
    const sync = main.slice(main.indexOf('    syncMapToolButtons() {'), main.indexOf('    releaseMapTool(owner) {'));
    const release = main.slice(main.indexOf('    releaseMapTool(owner) {'), main.indexOf('    registerMapHistory() {'));
    assert.match(claim, /else if \(this\.buildHotbar\?\.visible && owner === 'imageLayers'\) this\.buildHotbar\.render\(\);\s*else this\.buildHotbar\?\.hide\(false\);/, 'the bar stays up');
    assert.match(sync, /const underImageLayers = !!this\.buildHotbar\?\.visible && owner === 'imageLayers';/);
    assert.match(sync, /const on = tool === 'pieces' \? building \|\| underImageLayers : owner === tool;/, 'and its toolbar button stays lit');
    assert.match(release, /if \(this\.buildHotbar\?\.visible && owner === 'imageLayers'\) \{ this\.buildHotbar\.show\(\); return; \}/, 'closing the panel gives the map back to the bar');
    // Run as the editor runs them: the three functions against a bar that is up.
    const App = new Function(`return class { ${claim} ${sync} ${release} }`)();
    const calls = [], app = new App();
    global.document = { querySelector: () => null, querySelectorAll: () => [] };
    Object.assign(app, { mapTool: 'pieces', buildHotbar: { visible: true, render: () => calls.push('render'), hide: () => calls.push('hide'), show: () => calls.push('show') },
        mapImageLayersManager: { close: () => calls.push('close layers') }, pieceBuilderManager: { deactivate: () => calls.push('builder off') } });
    app.claimMapTool('imageLayers');
    assert.deepEqual(calls, ['builder off', 'render'], 'opened over the bar: the bar is drawn again, not hidden');
    calls.length = 0;
    app.releaseMapTool('imageLayers');
    assert.deepEqual(calls, ['show'], 'closed: the bar has the map');
    calls.length = 0;
    app.buildHotbar.visible = false;
    app.tilesetPaletteViewer = { currentLayer: 'A', selectLayer: layer => calls.push('paint ' + layer) };
    app.mapTool = 'imageLayers';
    app.releaseMapTool('imageLayers');
    assert.deepEqual(calls, ['paint A'], 'without the bar, closing goes back to painting as before');
    // A click on the bar while the tool holds the map closes the tool before the click reaches the bar's slot.
    const { manager, document, claimed } = makeEditor({ width: 21, height: 15 }, {});
    await manager.open();
    reactor.mapTool = 'imageLayers';
    const within = selector => ({ closest: wanted => (wanted === '#build-hotbar, #build-panel' && selector ? {} : null) });
    document.fire('click', { target: within(false) });
    assert.ok(manager.panel, 'a click elsewhere is nothing');
    reactor.mapTool = 'pieces';
    document.fire('click', { target: within(true) });
    assert.ok(manager.panel, 'the bar holds the map already: nothing to hand back');
    reactor.mapTool = 'imageLayers';
    document.fire('click', { target: within(true) });
    assert.equal(manager.panel, null);
    assert.deepEqual(claimed, ['imageLayers', 'release imageLayers']);
    delete reactor.mapTool;
});

test('what stops the tool is said in the editor\'s own dialog: no runtime file, no picture in the folder', async () => {
    const { manager, panel, claimed } = makeEditor({ width: 21, height: 15 }, { files: [] });
    const said = [];
    reactor.uiManager.showAlert = (title, text) => said.push([title, text]);
    const ensure = manager.ensureRuntime;
    manager.ensureRuntime = async () => false;
    assert.equal(await manager.open(), false);
    assert.deepEqual(said, [['menu.imageLayers', 'Image Layers needs the runtime file reactor_image_layers.js.']]);
    assert.deepEqual([manager.panel, claimed], [null, []], 'the map stays with the tool that had it');
    manager.ensureRuntime = ensure;
    await manager.open();
    manager._openMenu(panel().querySelector('.rr-image-layer-add'));
    document.body.querySelector('.rr-image-layer-menu-row').click();
    assert.deepEqual(said.slice(1), [['menu.imageLayers', 'Put pictures into the img/parallaxes folder of the project first.']]);
    assert.equal(Popup.isOpen(), false);
    // Without the editor's dialog helper the same words go through RRDialog.
    delete reactor.uiManager.showAlert;
    global.RRDialog = { alert: (text, options) => said.push([options.title, text, 'dialog']) };
    manager._alert('Words');
    assert.deepEqual(said.slice(-1), [['menu.imageLayers', 'Words', 'dialog']]);
    delete global.RRDialog;
    manager.close();
});

test('undo keeps at most 100 steps of the tool; another map starts with every eye open', () => {
    const map = {}, session = new M.Session();
    session.bind(map);
    const id = session.add(M.make('fog', 'Fog'));
    for (let opacity = 1; opacity <= 120; opacity++) session.change(id, { opacity });
    assert.equal(session.undoStack.length, 100);
    session.setHidden(id, true);
    session.setLookAt(id, 3);
    assert.deepEqual([session.hidden.size, session.looking.size], [1, 1]);
    session.bind({});
    assert.deepEqual([session.hidden.size, session.looking.size, session.undoStack.length], [0, 0, 0]);
});

test('a layer whose file gives it a depth of its own says so, and a depth chosen in the tool replaces it', () => {
    const layer = { name: 'Wide', layer: 'ground', z: 20 };
    assert.equal(M.describe(layer), 'Custom depth 20, Locked to the map');
    assert.equal(M.rowLines(layer, names, false).lines[0], 'Custom depth 20, Locked to the map');
    assert.equal(M.depthNote(layer), 'The map file gives this layer its own depth, 20. Choosing a depth here replaces it.');
    assert.equal(M.depthNote({ name: 'Wide', layer: 'ground' }), null);
    assert.equal(M.describe({ name: 'Wide', layer: 'ground', z: 0 }), 'Custom depth 0, Locked to the map');
    // Other edits keep it; the Depth list is the author's choice of depth, and it is what the game then draws.
    assert.equal(M.change([layer], 0, { opacity: 100 })[0].z, 20);
    const chosen = M.change([layer], 0, { layer: 'over' })[0];
    assert.deepEqual(chosen, { name: 'Wide', layer: 'over' });
    assert.equal(R.depth(R.normalize(chosen), 0), R.DEPTH.over);
});

test('each placement has a few words in the list it is chosen from, and one that the depth cannot take says why in one line', () => {
    for (const fit of R.FITS) {
        assert.ok(M.fitWords(fit).length > 0 && M.fitWords(fit).length <= 60, fit);
        assert.ok(M.fitHint(fit).length > 0);
    }
    assert.match(M.fitWords('repeat'), /scroll/);
    assert.equal(M.fitBlocked(), 'Same as Characters needs a picture locked to the map.');
    const source = read('src/MapImageLayersManager.js');
    assert.match(source, /allowed \? M\.fitWords\(fit\) : M\.fitBlocked\(\)/);
});

test('in a right-to-left language a picture\'s name keeps its characters in order, and an author\'s name reads as one piece', () => {
    const LRI = '\u2066', FSI = '\u2068', PDI = '\u2069';
    const layer = { name: '7_Ground', layer: 'ground', variable: 1, variantName: '7-%1_Ground' };
    const info = M.found(layer, ['7-1_Ground', '7-2_Ground']);
    assert.equal(info.words, `In img/parallaxes now: ${LRI}7-1_Ground${PDI}, ${LRI}7-2_Ground${PDI}.`);
    assert.deepEqual(info.files.map(hit => hit.name), ['7-1_Ground', '7-2_Ground'], 'the names themselves carry no marks');
    assert.equal(M.importWords(layer), `From an import: while the variable is N, the layer shows ${LRI}7-N_Ground${PDI}.`);
    assert.equal(M.versionsRest(layer), `Any other value shows the layer's own picture, ${LRI}7_Ground${PDI}.`);
    assert.equal(M.versionWords(1, '7-1_Ground'), `When it is 1 show ${LRI}7-1_Ground${PDI}`);
    assert.deepEqual(M.conditionWords({ name: 'A', switch: 1 }, names), [`While ${FSI}Night${PDI} is ON`]);
    assert.equal(M.plain(info.words), 'In img/parallaxes now: 7-1_Ground, 7-2_Ground.');
    // On the page each marked name is an element of its own: a picture's name left to right and unbroken.
    const { manager, document } = makeEditor({ width: 21, height: 15 }, {});
    const line = manager._say(document.createElement('div'), info.words);
    assert.deepEqual(line.childNodes.map(node => (node.tagName ? [node.tagName, node.getAttribute('dir'), node.className, node.textContent] : node.textContent)), [
        'In img/parallaxes now: ', ['BDI', 'ltr', 'rr-image-layer-word is-file', '7-1_Ground'], ', ', ['BDI', 'ltr', 'rr-image-layer-word is-file', '7-2_Ground'], '.'
    ]);
    assert.equal(line.textContent, 'In img/parallaxes now: 7-1_Ground, 7-2_Ground.');
    const words = manager._say(document.createElement('div'), M.conditionWords({ name: 'A', switch: 1 }, names)[0]);
    assert.deepEqual(words.children.map(node => [node.tagName, node.getAttribute('dir'), node.textContent]), [['BDI', null, 'Night']]);
    assert.equal(manager._say(document.createElement('div'), 'Always').childNodes.length, 1);
    // Where an element holds only a name, the element itself is set left to right at the side its row starts on.
    const css = read('css/styles.css');
    assert.match(css, /\.rr-image-layer-file \{ direction: ltr; unicode-bidi: isolate; \}/);
    assert.match(css, /\.rr-image-layer-own \{ unicode-bidi: plaintext; \}/);
    assert.match(css, /\.rr-image-layer-file:is\(\[dir="rtl"\] \*\), \.rr-image-layer-own:is\(\[dir="rtl"\] \*\) \{ text-align: right; \}/);
    assert.match(css, /\.rr-image-layer-grid \.rr-material-option-name \{[^}]*-webkit-line-clamp: 3;[^}]*direction: ltr;[^}]*overflow-wrap: anywhere;/);
});

test('the panel names a picture whole: in the list, on the tile and in the card\'s head; a picture\'s size arriving redraws one line only', async () => {
    const map = { width: 21, height: 15, rrImageLayers: [{ name: 'Deck_scenery_of_the_north_gate', layer: 'ground' }] };
    const { manager, panel, document, images } = makeEditor(map, { files: ['Deck_scenery_of_the_north_gate'] });
    await manager.open();
    const name = 'Deck_scenery_of_the_north_gate';
    const tile = panel().querySelector('[data-focus="picture"]');
    assert.equal(tile.title, name);
    for (const el of [panel().querySelector('.rr-image-layer-name'), tile.querySelector('.rr-material-tile-name'), panel().querySelector('.rr-image-layer-settings').parentNode.querySelector('.lit-section-meta')]) {
        assert.equal(el.textContent, name);
        assert.ok(el.classList.contains('rr-image-layer-file'));
    }
    const css = read('css/styles.css');
    assert.match(css, /\.rr-image-layer-tile \.rr-material-tile-name \{[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/);
    // The size line says the map's size until the picture has been read, then both sizes; an open menu stays open.
    const size = () => panel().querySelector('.rr-image-layer-size').textContent;
    assert.equal(size(), 'The map is 1008 × 720 pixels.');
    const add = panel().querySelector('.rr-image-layer-add');
    manager._openMenu(add);
    const menu = manager._menu, settings = panel().querySelector('.rr-image-layer-settings');
    assert.equal(images.length, 1);
    images[0].onload();
    assert.equal(size(), 'This picture is 640 × 480. The map is 1008 × 720.');
    assert.ok(panel().querySelector('.rr-image-layer-size').querySelector('.rr-image-layer-warning'));
    assert.equal(manager._menu, menu, 'the menu was not closed');
    assert.equal(panel().querySelector('.rr-image-layer-settings'), settings, 'the card was not drawn again');
    assert.equal(document.body.querySelectorAll('.rr-image-layer-menu').length, 1);
    manager.close();
});
