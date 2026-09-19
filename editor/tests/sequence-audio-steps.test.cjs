// A Sound Effect, BGM or BGS command step in the sequence editor is chosen
// through the audio picker with its volume, pitch and pan, like every other
// sound in the editor, not a file dropdown with the levels under Advanced.
// And a sequence assigned to weapons previews holding the first of them.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'database', 'DatabaseActionSequenceEditor.js'), 'utf8');

test('audio command steps use the audio picker and hide their level rows', () => {
    assert.match(source, /if\(\['bgm','bgs','se'\]\.includes\(step\.type\)&&\['volume','pitch','pan'\]\.includes\(field\.key\)\)continue;/);
    assert.match(source, /if\(folder&&folder\.startsWith\('audio'\)\)\{[\s\S]*?U\.button\('Choose Sound…',\(\)=>this\.pickCommandAudio\(step\)\)/);
    // The remaining dropdown branch serves pictures and movies only.
    assert.match(source, /if\(folder\)\{const path=require\('path'\),extensions=folder==='movies'\?\['\.webm','\.mp4'\]:\['\.png','\.webp'\];/);
    const picker = source.slice(source.indexOf('pickCommandAudio(step){'), source.indexOf('pickSound(step){'));
    assert.match(picker, /title:kind==='se'\?'Select Sound Effect':kind==='bgm'\?'Select BGM':'Select BGS'/);
    assert.match(picker, /levels:\{volume:current\.volume,pitch:current\.pitch,pan:current\.pan\},loopDefault:kind!=='se'/);
    assert.match(picker, /Object\.assign\(step,\{name:next\.name,volume:next\.volume,pitch:next\.pitch,pan:next\.pan\}\)/);
    const manager = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'I18nManager.js'), 'utf8');
    assert.equal((manager.match(/\{"Select BGM": /g) || []).length, 17);
});

test('a weapon sequence previews holding its own weapon by default', () => {
    assert.match(source, /if\(!this\.sampleWeapon&&!this\.sampleWeaponChosen\)\{const assignedWeapon=B\.references\(this\.ui\.settings\(\),sequence\.id,this\.db\.data\.actionSequences\)\.find\(r=>r\.kind==='weapons'&&this\.db\.getWeapon\(r\.id\)\);if\(assignedWeapon\)this\.sampleWeapon=assignedWeapon\.id;\}/);
});

test('an explicit Equipped choice is remembered, and the animation step says what will play', () => {
    // Untouched preference: the sequence's own weapon. Chosen "Equipped": kept as such across a reopen.
    assert.match(source, /if\(!this\.sampleWeapon&&!this\.sampleWeaponChosen\)\{const assignedWeapon=/);
    assert.match(source, /this\.sampleWeapon=Number\(value\)\|\|0;this\.sampleWeaponChosen=true;/);
    assert.match(source, /sampleWeapon:this\.sampleWeapon\|\|\(this\.sampleWeaponChosen\?'equipped':0\)/);
    assert.match(source, /if\(mine\.sampleWeapon==='equipped'\)this\.sampleWeaponChosen=true;/);
    // The engine's rule, spelled out under an action or weapon animation source.
    assert.match(source, /const resolved=this\.previewAnimationId\(step\),animation=this\.db\.getAnimation\(resolved\)/);
    assert.match(source, /U\.message\('Plays \{animation\}, from \{weapon\}\.',\{animation:animationName,weapon:weapon\.name\}\)/);
    assert.match(source, /U\.message\('No weapon animation in hand: plays \{animation\}\.',\{animation:animationName\}\)/);
    const manager = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'I18nManager.js'), 'utf8');
    for (const phrase of ['Plays {animation}, the action’s own.', 'Plays {animation}, from {weapon}.', 'No weapon animation in hand: plays {animation}.']) {
        const count = (manager.match(new RegExp(`"${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}": `, 'g')) || []).length;
        assert.equal(count, 17, phrase);
    }
});
