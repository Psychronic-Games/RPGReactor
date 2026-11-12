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
    // A refresh with no update never poses the room again (`render`): it draws the same update's picture (`renderBetween`).
    assert.match(presentation, /P\.flushRoom=function\(ss\)\{\n\s+const room=ss\._reactorRoom;if\(!room\|\|room\.disposed\|\|!ss\._reactorRoomSprite\)return;\n[^\n]+\n\s+if\(!ss\._reactorRoomDirty\)\{if\(room\.renderBetween\?\.\(\)\)P\.showRoomPass\(ss\._reactorRoomSprite,room\);return;\}\n\s+ss\._reactorRoomDirty=false;\n\s+room\.render\(\);/);
    const between = room.slice(room.indexOf('renderBetween(){'), room.indexOf('pacedNow(){'));
    assert.match(between, /if\(!this\.drawsBetween\(\)\)return false;this\.drawPaced\(\);return true;/);
    assert.doesNotMatch(room.slice(room.indexOf('drawPaced(){'), room.indexOf('drawsBetween(){')), /this\.frame\+\+|this\.render\(\)|prepareWorldFrame/, 'a draw between updates advances nothing');
    assert.match(presentation, /Graphics\._reactorBeforeRender\.add\(\(\)=>\{const ss=[^\n]+if\(ss&&ss\._reactorRoom\)P\.flushRoom\(ss\);\}\);/);
    assert.doesNotMatch(presentation.slice(presentation.indexOf('P.updateRoom=function'), presentation.indexOf('P.flushRoom=function')), /room\.render\(\)/, 'no render in the update itself');
    assert.match(room, /new T\.WebGLRenderer\(\{ antialias: false, alpha: false, preserveDrawingBuffer: true \}\)/);
});

test('on the shared context the room draws into a target PIXI samples: no readback, no upload', () => {
    const presentation = read('runtime/reactor_battle_presentation.js'), room = read('runtime/reactor_battle_room.js');
    // The map's viewport lends its renderer when it shares PIXI's context; `battleRoomShared = false` keeps the copy.
    assert.match(room, /const viewport = R\.battleRoomShared !== false && R\.sharedContextAvailable\?\.\(\) \? R\.acquireViewport\?\.\(\) : null;/);
    assert.match(room, /if \(this\.view\) this\.renderer = this\.view\.renderer\(\);/);
    // The room is the view's guest: its picture goes through the map's own passes (the view's scale, the sharpening
    // enlargement, the colour draw), into a pass of the view's whose GL texture a PIXI source adopts, flipped.
    const r3d = read('runtime/reactor_3d.js');
    assert.match(r3d, /Reactor3D\.Viewport\.prototype\.renderGuest = function\(scene, camera\) \{\n\s+if \(!this\._shared \|\| !scene \|\| !camera\) return false;[\s\S]*?this\.resize\(\);\n\s+return this\.render\(Reactor3D\.GUEST_SLOT, scene, camera\);/);
    assert.match(room, /const view=this\.view,sprite=view\.passSprite\(root\.Reactor3D\.GUEST_SLOT\);/);
    assert.match(r3d, /Reactor3D\.adoptGlTexture\(this\._pixi, source, handle\);\n\s+const texture = new PIXI\.Texture\(flip \? \{ source, rotate: PIXI\.groupD8\.MIRROR_VERTICAL/);
    // Its shadow rows and reflections with three's state forgotten first and PIXI's handed back after, effect passes too.
    assert.match(room, /this\.renderer\.resetState\(\);\n[\s\S]{0,600}?this\.capturePace\(\);\n\s+try\{R\.prepareWorldFrame\([^\n]+\}\n\s+finally\{this\.renderer\.setRenderTarget\(null\);this\.view\._resetPixi\(\);\}\n\s+this\.drawPaced\(\);/);
    assert.match(room, /try\{this\.view\.renderGuest\(this\.scene,this\.camera\);\}finally\{if\(blended\)this\.restorePace\(\);\}/, 'what a draw between updates moved is put back');
    // Lit from its own uniforms: the map's light split, which reads the map's, leaves the room's scene alone.
    assert.match(room, /this\.scene\.userData\.rrOwnLights = true;/);
    assert.match(read('runtime/reactor_3d_lighting.js'), /if \(scene\.userData && scene\.userData\.rrOwnLights\) return null;/);
    assert.equal((room.match(/G\.restoreDefault\(\);this\.releaseContext\(\);/g) || []).length, 2, 'both effect passes hand the context back');
    assert.match(room, /this\.effectContext \|\|= this\.view\?G\.forViewport\(this\.view\):G\.create\(this\.renderer,0\);/);
    // The viewport's renderer and effect context outlive the room; its pass goes two frames later.
    assert.match(room, /if\(this\.view\)\{this\.releaseTarget\(\);this\.world\?\.destroy\(\);this\.view\._resetPixi\(\);\}/);
    assert.match(room, /releaseTarget\(\) \{ if\(this\.view\)this\.view\.releaseSlot\(root\.Reactor3D\.GUEST_SLOT\); \}/);
    assert.match(r3d.slice(r3d.indexOf('Reactor3D.Viewport.prototype.releaseSlot'), r3d.indexOf('Reactor3D.Viewport.prototype._renderUpscaled')), /requestAnimationFrame\(function\(\) \{ requestAnimationFrame\(reap\); \}\)/);
    // The battle shows the view's pass sprite itself; only a room on its own canvas is copied.
    assert.match(presentation, /const sprite=room\.view\?new PIXI\.Container\(\):new Sprite\(new Bitmap\(Graphics\.width,Graphics\.height\)\);/);
    assert.match(presentation, /if\(room\.view\)\{P\.showRoomPass\(sprite,room\);return;\}/);
    // And the sprite goes before the pass it shows does.
    assert.match(presentation, /holder\._rrPass\.destroy\(\);holder\._rrPass=null;holder\._rrPassGeneration=-1;\}\}this\._spriteset\?\._reactorRoom\?\.dispose\(\);/);
});
