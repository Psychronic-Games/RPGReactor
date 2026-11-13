const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const B=require('../../runtime/reactor_battle_data.js');
const { runtimeSource } = require('./helpers/runtime-source.cjs');
const C=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/database/DatabaseActionSequenceEditor.js'),'utf8')+'\nDatabaseActionSequenceEditor',{ReactorBattleData:B,window:{},console});

// A Picture, Icon or Scrolling Plane step set to Move changes X, Y and Opacity in the game and
// nothing else, so its inspector does not offer Angle and Scale.
test('a Move step of a picture, an icon or a plane hides Angle and Scale and nothing else',()=>{
 for(const type of ['picture','icon','plane']){
  const shown=operation=>B.commands[type].fields.map(f=>f.key).filter(key=>!C.moveIgnores(type,operation,key));
  assert.deepEqual(shown('show'),B.commands[type].fields.map(f=>f.key),type+': Show offers every field');
  assert.deepEqual(B.commands[type].fields.map(f=>f.key).filter(key=>!shown('move').includes(key)),['angle','scale'],type+': Move hides Angle and Scale');
  for(const key of ['x','y','opacity'])assert.ok(shown('move').includes(key),type+': Move keeps '+key);
 }
 assert.equal(C.moveIgnores('weapon','move','angle'),false,'other steps are not touched');
});
test('the fields a Move keeps are the ones the game applies',()=>{
 assert.match(runtimeSource('reactor_battle_presentation.js'),/step\.operation==='move'\)\{const entry=layers\.get\(key\);if\(entry\)\{for\(const k of \['x','y','opacity'\]\)/);
});
test('the inspector asks before drawing a field',()=>{
 // The inspector is one long DOM-building method; this pins that the check is in its field loop.
 const source=fs.readFileSync(path.join(__dirname,'../src/database/DatabaseActionSequenceEditor.js'),'utf8');
 assert.match(source,/if\(DatabaseActionSequenceEditor\.moveIgnores\(step\.type,operation,field\.key\)\)continue;/);
});
