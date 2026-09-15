/**
 * Starters for the BGM sequence list: ready shapes that fill Database > Music
 * Sequences or a map's own sequence with the project's tracks, so a sequence
 * can be heard before it is authored.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(editorRoot, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function loadEditorClass() {
    const context = { console, module: undefined };
    context.globalThis = context;
    vm.runInNewContext(read('src/utils/BgmSequenceEditor.js') + '\n;globalThis.__E = RRBgmSequenceEditor;', context);
    return context.__E;
}

const TRACKS = ['A', 'B', 'C', 'D', 'E'];

test('every starter is a valid sequence once its tracks come from the project', () => {
    const E = loadEditorClass();
    assert.deepEqual(plain(E.STARTERS.map(starter => starter.id)), ['intro-loop', 'playlist', 'battle', 'one-then-pause', 'layered']);
    for (const { id, label, hint } of E.STARTERS) {
        assert.ok(label && hint, `${id} says what it is`);
        const entries = E.starter(id, TRACKS);
        assert.ok(entries.length > 0, id);
        assert.equal(E.validate({ enabled: true, entries }, text => text), null, `${id} validates`);
        assert.deepEqual(plain(E.normalize({ enabled: true, entries }).entries), plain(entries), `${id} is already in the stored shape`);
    }
    assert.equal(E.starter('nope', TRACKS), null);
});

test('each starter uses the feature it is named for', () => {
    const E = loadEditorClass();
    const intro = E.starter('intro-loop', TRACKS);
    assert.deepEqual(plain(intro.map(entry => [entry.type, entry.name, entry.once, entry.fadeIn, entry.fadeOut])),
        [['track', 'A', true, 0, 2], ['track', 'B', false, 2, 0]], 'an intro once, fading out under a loop that fades in');
    assert.equal(E.starter('battle', TRACKS)[0].fadeOut, 2, 'the opening fades out under the bed rather than leaving a gap');

    const [playlist] = E.starter('playlist', TRACKS);
    assert.equal(playlist.duration, 0, 'plays through rather than on a clock');
    assert.equal(playlist.layers[0].order, 'shuffle');
    assert.deepEqual(plain(playlist.layers[0].pool.map(item => item.name)), ['A', 'B', 'C', 'D']);

    const battle = E.starter('battle', TRACKS);
    assert.deepEqual(plain(battle.map(entry => entry.type)), ['track', 'palette']);
    assert.equal(battle[0].once, true);
    assert.equal(battle[1].layers[0].order, 'random');
    assert.equal(battle[1].layers[0].pool.length, 3);

    const pause = E.starter('one-then-pause', TRACKS);
    assert.deepEqual(plain(pause.map(entry => entry.type)), ['palette', 'silence']);
    assert.equal(pause[0].single, true, 'one track, then the sequence moves on to the quiet');
    assert.ok(pause[1].duration > 0);

    const [layered] = E.starter('layered', TRACKS);
    assert.equal(layered.layers.length, 2);
    assert.ok(layered.layers[1].volume < layered.layers[0].volume, 'the second layer sits under the first');
    assert.ok(layered.layers[1].pool.some(item => item.type === 'silence'), 'and comes and goes');
});

test('fewer tracks than slots repeat, and with none the slots wait to be chosen', () => {
    const E = loadEditorClass();
    assert.deepEqual(plain(E.starter('playlist', ['Only'])[0].layers[0].pool.map(item => item.name)), ['Only', 'Only', 'Only', 'Only']);
    const empty = E.starter('battle', []);
    assert.equal(empty[0].name, '');
    assert.equal(E.validate({ enabled: true, entries: empty }, text => text), 'Entry 1: choose a track.');
});

test('choosing a starter fills the list, asks before replacing entries, and reports the edit', () => {
    const E = loadEditorClass();
    const handlers = {};
    const container = { innerHTML: '', addEventListener: (type, fn) => { handlers[type] = fn; }, contains: () => true };
    const asked = [];
    const edits = [];
    let answer = false;
    const editor = new E({
        container, tt: text => text, t: () => 'levels',
        listTracks: () => ['Town', 'Field'],
        confirm: message => { asked.push(message); return answer; },
        onEdit: value => edits.push(value)
    });
    editor.load({ enabled: true, entries: [] });
    assert.match(container.innerHTML, /<select class="bgm-seq-starters"/);
    assert.match(container.innerHTML, /<option value="" selected title="[^"]+">Starters…<\/option>/, 'the placeholder carries the explanation, so the trigger shows it on hover');
    assert.match(container.innerHTML, /<option value="battle" title="[^"]+">Battle: opening, then a random bed<\/option>/);

    const choose = value => handlers.change({ target: { value, dataset: {}, classList: { contains: name => name === 'bgm-seq-starters' } } });
    choose('intro-loop');
    assert.deepEqual(asked, [], 'an empty list is filled without asking');
    assert.deepEqual(plain(editor.value().entries.map(entry => entry.name)), ['Town', 'Field']);
    assert.equal(editor.value().enabled, true, 'switching the sequence on stays the host’s business');
    assert.equal(edits.length, 1);

    choose('playlist');
    assert.deepEqual(asked, ['Replace the entries in this list with the starter?']);
    assert.equal(editor.value().entries[0].type, 'track', 'declining keeps the list');
    assert.equal(edits.length, 1);

    answer = true;
    choose('playlist');
    assert.equal(editor.value().entries[0].type, 'palette');
    assert.equal(edits.length, 2);

    choose('');
    assert.equal(edits.length, 2, 'the placeholder does nothing');
});

test('both hosts hand the list their project’s BGM folder', () => {
    for (const file of ['src/ProjectController.js', 'src/database/DatabaseMusicSequenceEditor.js']) {
        const source = read(file);
        assert.match(source, /listTracks: \(\) => this\.bgmTrackNames\(\)/, file);
        assert.match(source, /bgmTrackNames\(\) \{/, file);
    }
});
