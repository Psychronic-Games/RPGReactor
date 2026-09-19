// An action sequence is named with its number wherever the editor names one:
// the assignment dropdown and status on a record's page (the list's own "Name
// #id" form), the sequence header, and Open Sequence selects it in the list.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const read = (...p) => fs.readFileSync(path.resolve(__dirname, '..', ...p), 'utf8');

test('assignments name a sequence with its number and select it when opened', () => {
    const source = read('src', 'battle', 'BattlePresentationEditor.js');
    assert.match(source, /const sequenceLabel=id=>\{const s=this\.db\.data\.actionSequences\?\.\[id\];return s\?`\$\{s\.name\|\|''\} #\$\{id\}`\.trim\(\):'#'\+id;\};/);
    assert.match(source, /'Sequence: \{name\}',\{name:sequenceLabel\(v\.sequenceId\)\}/);
    assert.match(source, /\.\.\.sequences\.map\(s=>\['sequence:'\+s\.id,sequenceLabel\(s\.id\),true\]\)/);
    assert.match(source, /this\.parent\.showDatabaseDetail\(sequence,'actionSequences'\);this\.parent\._activeDatabaseList\?\.reveal\?\.\(id\);/);
});

test('the sequence header carries the number beside the name', () => {
    assert.match(read('src', 'database', 'DatabaseActionSequenceEditor.js'), /const number=U\.element\('span','rr-sequence-id','#'\+sequence\.id,true\);.*toolbar\.append\(number\);/);
    assert.match(read('css', 'styles.css'), /\.rr-sequence-header > \.rr-sequence-id \{[^}]*font-variant-numeric:tabular-nums/);
    const count = (read('src', 'I18nManager.js').match(/\{"Sequence number": /g) || []).length;
    assert.equal(count, 17);
});
