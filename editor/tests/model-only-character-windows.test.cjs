const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'reactor_windows.js'), 'utf8');
const marker = '// A character-slot actor binding needs no walking sheet on disk';

// Runs the window wrappers against stubs: actors 1 and 2 start on the stock
// "Actor1" sheet, actor 3 on its own; only the ids in `bound` have a model.
function sandbox(bound, ready = true) {
    const loaded = [];
    const drawn = [];
    const context = {
        loaded, drawn,
        Reactor3D: {
            isDatabaseSidecarReady: () => ready,
            databaseModelSpec: (section, id) => section === 'actors' && bound.includes(id) ? { name: 'm' } : null
        },
        $dataActors: [null,
            { id: 1, characterName: 'Actor1' },
            { id: 2, characterName: 'Actor1' },
            { id: 3, characterName: 'Hero' }],
        Window_StatusBase: function() {},
        Window_SavefileList: function() {},
        DataManager: {
            loadSavefileImages(info) { for (const c of info.characters) loaded.push(c[0]); }
        }
    };
    context.Window_StatusBase.prototype.drawActorCharacter = actor => drawn.push(actor.actorId());
    context.Window_SavefileList.prototype.drawPartyCharacters = info => {
        for (const c of info.characters) drawn.push(c[0]);
    };
    vm.runInNewContext(source.slice(source.indexOf(marker)), context);
    return context;
}

const actor = id => ({ actorId: () => id });

test('a model-bound actor draws no walking sheet in a status window', () => {
    const c = sandbox([1]);
    new c.Window_StatusBase().drawActorCharacter(actor(1), 0, 0);
    new c.Window_StatusBase().drawActorCharacter(actor(3), 0, 0);
    assert.deepEqual([...c.drawn], [3]);
});

test('save screens skip sheets that only model-bound actors start with', () => {
    const info = { characters: [['Actor1', 1], ['Hero', 0]] };
    let c = sandbox([1, 2]);
    c.DataManager.loadSavefileImages(info);
    new c.Window_SavefileList().drawPartyCharacters(info, 0, 0);
    assert.deepEqual([...c.loaded], ['Hero']);
    assert.deepEqual([...c.drawn], ['', 'Hero']);
    assert.equal(info.characters[0][0], 'Actor1', 'the save info itself is left as written');

    // One unbound actor still walks on the sheet, so it is still needed.
    c = sandbox([1]);
    c.DataManager.loadSavefileImages(info);
    assert.deepEqual([...c.loaded], ['Actor1', 'Hero']);

    // Before the bindings are known nothing is skipped.
    c = sandbox([1, 2], false);
    c.DataManager.loadSavefileImages(info);
    assert.deepEqual([...c.loaded], ['Actor1', 'Hero']);
});
