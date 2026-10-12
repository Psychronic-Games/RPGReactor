'use strict';
const assert = require('node:assert/strict');
const { runtimeSource } = require('./helpers/runtime-source.cjs');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const read = p => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf8');

test('the battle room is drawn once for the frame shown, not once per update, and without MSAA', () => {
    const core = runtimeSource('reactor_core.js'), presentation = read('runtime/reactor_battle_presentation.js'), room = read('runtime/reactor_battle_room.js');
    // The game loop runs its before-render hooks once, just before the frame is drawn.
    assert.match(core, /Graphics\._reactorBeforeRender = Graphics\._reactorBeforeRender \|\| new Set\(\);/);
    assert.match(core, /for \(const hook of this\._reactorBeforeRender\) \{\n\s+try \{ hook\(\); \} catch \(e\) \{[^\n]+\}\n\s+\}\n\s+this\._app\.render\(\);/);
    // An update marks the room; the hook renders and copies it; with no game loop it draws at once.
    assert.match(presentation, /ss\._reactorRoomDirty=true;if\(!\(typeof Graphics!=='undefined'&&Graphics\._reactorBeforeRender\)\)P\.flushRoom\(ss\);/);
    assert.match(presentation, /P\.flushRoom=function\(ss\)\{\n\s+const room=ss\._reactorRoom;if\(!room\|\|room\.disposed\|\|!ss\._reactorRoomDirty\|\|!ss\._reactorRoomSprite\)return;ss\._reactorRoomDirty=false;\n\s+room\.render\(\);/);
    assert.match(presentation, /Graphics\._reactorBeforeRender\.add\(\(\)=>\{const ss=[^\n]+if\(ss&&ss\._reactorRoom\)P\.flushRoom\(ss\);\}\);/);
    assert.doesNotMatch(presentation.slice(presentation.indexOf('P.updateRoom=function'), presentation.indexOf('P.flushRoom=function')), /room\.render\(\)/, 'no render in the update itself');
    assert.match(room, /new T\.WebGLRenderer\(\{ antialias: false, alpha: false, preserveDrawingBuffer: true \}\)/);
});

test('on the shared context the room draws into a target PIXI samples: no readback, no upload', () => {
    const presentation = read('runtime/reactor_battle_presentation.js'), room = read('runtime/reactor_battle_room.js');
    // The map's viewport lends its renderer when it shares PIXI's context; `battleRoomShared = false` keeps the copy.
    assert.match(room, /const viewport = R\.battleRoomShared !== false && R\.sharedContextAvailable\?\.\(\) \? R\.acquireViewport\?\.\(\) : null;/);
    assert.match(room, /if \(this\.view\) this\.renderer = this\.view\.renderer\(\);/);
    // A target of the room's size, its GL texture adopted by a PIXI source, flipped.
    assert.match(room, /this\.target=view\.createTarget\(width,height,1,\{samples:0\}\);/);
    assert.match(room, /R\.adoptGlTexture\(view\.pixi\(\),source,view\.targetHandle\(this\.target\)\);/);
    assert.match(room, /rotate:PIXI\.groupD8\.MIRROR_VERTICAL/);
    // Drawn into it with three's state forgotten first and PIXI's handed back after, effect passes too.
    assert.match(room, /this\.renderer\.resetState\(\);\n\s+try\{\n\s+R\.prepareWorldFrame\([^\n]+\n\s+this\.renderer\.setRenderTarget\(this\.target\);\n\s+R\.cacheUniformArrays\?\.\(this\.renderer\);\n\s+this\.renderer\.render\(this\.scene,this\.camera\);\n\s+\}finally\{this\.renderer\.setRenderTarget\(null\);this\.view\._resetPixi\(\);\}/);
    assert.equal((room.match(/G\.restoreDefault\(\);this\.releaseContext\(\);/g) || []).length, 2, 'both effect passes hand the context back');
    assert.match(room, /this\.effectContext \|\|= this\.view\?G\.forViewport\(this\.view\):G\.create\(this\.renderer,0\);/);
    // The viewport's renderer and effect context outlive the room; its target goes two frames later.
    assert.match(room, /if\(this\.view\)\{this\.releaseTarget\(\);this\.world\?\.destroy\(\);this\.view\._resetPixi\(\);\}/);
    assert.match(room, /if\(typeof requestAnimationFrame==='function'\)requestAnimationFrame\(\(\)=>requestAnimationFrame\(reap\)\);/);
    // The battle shows the texture itself; only a room on its own canvas is copied.
    assert.match(presentation, /const sprite=room\.texture\?new PIXI\.Sprite\(room\.texture\):new Sprite\(new Bitmap\(Graphics\.width,Graphics\.height\)\);/);
    assert.match(presentation, /if\(room\.texture\)\{if\(sprite\.texture!==room\.texture\)sprite\.texture=room\.texture;return;\}/);
});
