// The parameter names the editor shows are the project's own Terms, spelled
// as the Terms page spells them; only the exact stock spelling falls back to
// the editor's translated default.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

require(path.resolve(__dirname, '..', 'src', 'utils', 'ParamNames.js'));
const translate = text => `t(${text})`;

test('an untouched slot is the translated default', () => {
    const terms = ['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck', 'Hit Rate', 'Evasion Rate'];
    assert.deepEqual(globalThis.rrParamNames(translate, terms).slice(0, 2), ['t(Max HP)', 't(Max MP)']);
    assert.deepEqual(globalThis.rrHitEvasionNames(['Hit', 'Evasion'], translate, terms), ['t(Hit)', 't(Evasion)']);
    assert.equal(globalThis.rrParamTermName(2, 'Attack', translate, []), 't(Attack)', 'no terms at all is the default');
    assert.equal(globalThis.rrParamTermName(2, 'Attack', translate, ['', '', '  ']), 't(Attack)', 'a blank slot is the default');
});

test('a renamed slot is shown as the project wrote it, casing included', () => {
    const terms = ['MAX HP', 'max mp', 'Strength', 'Defense', 'M.Attack', 'Spirit', 'agility', 'Luck'];
    assert.deepEqual(globalThis.rrParamNames(translate, terms),
        ['MAX HP', 'max mp', 'Strength', 't(Defense)', 't(M.Attack)', 'Spirit', 'agility', 't(Luck)']);
});
