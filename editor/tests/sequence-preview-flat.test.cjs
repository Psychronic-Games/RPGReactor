// The Action Sequences preview in the flat (2D) projection draws what the
// flat battle draws: a held picture turned as its step says, actors in front
// of enemies, and MV animations at game pixel scale on the battler's head,
// middle or feet.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = p => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf8');

test('a sequence billboard keeps its turn when placed after the facing pass', () => {
    const room = read('runtime/reactor_battle_room.js');
    assert.match(room, /this\.place\(key,position\);r\.object\.quaternion\.copy\(this\.camera\.quaternion\);r\.object\.rotateZ\(\(position\.rotateZ\|\|0\)\*Math\.PI\/180\);/);
});

test('flat projection stacks pictures by kind, then by how low they stand, extras on top', () => {
    const room = read('runtime/reactor_battle_room.js');
    assert.match(room, /const flat=this\.settings\?\.projection==='2d';/);
    assert.match(room, /const standing=r=>\(r\.position\?\.layer\|\|0\)\*1e5\+\(r\.position\?\.y\|\|0\)\*1000;/);
    assert.match(room, /r\.object\.renderOrder=String\(key\)\.startsWith\('extra:'\)\?\(owner\?standing\(owner\)-1:1e6\+\(r\.position\?\.y\|\|0\)\*1000\):standing\(r\);/);
    assert.match(room, /r\.object\.material\.depthTest=false;r\.object\.material\.depthWrite=false;/);
    // The game marks an actor's room position with its layer; the editor marks its cast the same way.
    assert.match(read('runtime/reactor_battle_presentation.js'), /\{\.\.\.B\.position\(room\.settings,actor\?'actors':'enemies',index\),layer:actor\?1:0\}/);
    assert.match(read('editor/src/database/DatabaseActionSequenceEditor.js'), /!!graphic\.mirror,layer:actor\?1:0\},Math\.max\(\.2,frame\.height\/48\)/);
});

test('a flat animation is a game pixel per cell pixel, lifted to its position on the battler', () => {
    const editor = read('editor/src/database/DatabaseActionSequenceEditor.js');
    assert.match(editor, /anchorZ=flat\?\(entry\.position===0\?pictureHeight:entry\.position===2\?0:pictureHeight\/2\):1\.25,lift=this\.liftPose\(view\)/);
    assert.match(editor, /const a=view\.project\(lift\(\{x:p\.x\+\(t\.x\|\|0\),y:p\.y\+\(t\.y\|\|0\),z:\(p\.z\|\|0\)\+anchorZ\+\(t\.z\|\|0\)\}\)\),b=view\.project\(lift\(\{\.\.\.p,z:\(p\.z\|\|0\)\+1\}\)\),c=view\.project\(lift\(p\)\)/);
    assert.match(editor, /layer\.setSpan\(flat\?layer\.screenHeight\/48:2\.5\)/);
    assert.match(editor, /entry=\{layer,key,position:animation\.position,transform:/);
});
