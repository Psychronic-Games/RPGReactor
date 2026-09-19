// The actor's third preview box is titled for the slot, "Battler", whatever
// kind of graphic it holds; the Graphic Type dropdown beneath it names the
// kind. Three code paths used to retitle it: the stock box ("SV Battler"), a
// 3D binding ("Battler Model") and an explicit graphic (the mode's own name).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = (...parts) => fs.readFileSync(path.resolve(__dirname, '..', 'src', ...parts), 'utf8');

test('every path titles the battler box "Battler"', () => {
    assert.match(read('DatabaseEditorUI.js'), /svLabel\.textContent = tt\('Battler'\);/);
    assert.match(read('database', 'DatabaseActorEditor.js'), /\{ slot: 'battler', label: 'Battler' \}/);
    const presentation = read('battle', 'BattlePresentationEditor.js');
    assert.match(presentation, /this\.setText\(api\.label,'Battler'\);/);
    assert.doesNotMatch(presentation, /setText\(api\.label,\(B\.graphicModes/);
    // The dropdown still carries the kind.
    assert.match(presentation, /typeSelect\.setAttribute\('aria-label',this\.text\('Graphic Type'\)\)/);
});

test('"Battler" is translated in every locale', () => {
    const manager = read('I18nManager.js');
    const count = (manager.match(/Object\.assign\(RR_TEXT_TRANSLATIONS\["[a-zA-Z-]+"\], \{"Battler": /g) || []).length;
    assert.equal(count, 17);
});
