'use strict';
// One route for whatever changes a model's material after it is made (runtime/reactor_3d.js, Reactor3D.touchMaterial):
// every writer stamps the material in the block of its write, so a reader that draws a copy of it (Reactor3D.StillParts'
// groups by colour) lets go the update it changes. This scans runtime/*.js for writes of the kinds found on 2026-11-11
// and fails on one that neither stamps nor is on the list below with its reason.
//
// How a writer is found: a line that writes a material's colour, a flag or picture of it, one of the uniform holders in
// its userData, or the material of a mesh (PATTERNS). How it counts as stamped: `touchMaterial(` on that line, in the
// AFTER lines below it or the BEFORE lines above it (a block, not a parsed function: the battle files are written
// several statements to a line). What this cannot see: a holder's `.value` changed through a name taken far from the
// write and not listed in PATTERNS; StillParts compares the holders' values themselves each update for that reason.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const runtime = path.resolve(__dirname, '..', '..', 'runtime');
const AFTER = 20, BEFORE = 8;

// A name a material goes by, or `.material` of something.
const RECEIVER = String.raw`(?:\b(?:mat|material|m|own|twin|caster|cutout|[A-Za-z]+Material|[A-Za-z]+Mat)|\.material(?:s?\[\w+\])?)`;
const HOLDERS = 'rr(?:Blend|Dissolve|CutBody|FightStump|Shine|Look|Emissive)';
const PATTERNS = [
    // Its colour, changed in place or replaced.
    ['colour', new RegExp(RECEIVER + String.raw`\.color\.(?:set|setRGB|setHex|setHSL|setScalar|setStyle|copy|lerp|lerpColors|multiply|multiplyScalar|add|offsetHSL|fromArray)\(`)],
    ['colour', new RegExp(RECEIVER + String.raw`\.color\s*=(?!=)`)],
    // What decides how it draws.
    ['flag', new RegExp(RECEIVER + String.raw`\.(?:opacity|transparent|depthWrite|depthTest|alphaTest|blending|side|visible|colorWrite|vertexColors|wireframe|polygonOffset|emissiveIntensity)\s*=(?!=)`)],
    ['picture', new RegExp(RECEIVER + String.raw`\.(?:map|alphaMap)\s*=(?!=)`)],
    // A uniform holder in its userData: made or replaced, or its value changed where it is taken.
    ['holder', new RegExp(String.raw`userData\??\.` + HOLDERS + String.raw`\s*=(?!=)`)],
    ['holder', new RegExp(String.raw`userData\??\.` + HOLDERS + String.raw`\b[^;]*?\.(?:value|vector|a|b|albedo)(?:\.[xyzw]|\.value)?\s*=(?!=)`)],
    ['holder', new RegExp(String.raw`userData\??\.` + HOLDERS + String.raw`\.(?:set|copy|setRGB|multiplyScalar)\w*\(`)],
    // The names the holders are taken under by the writers found.
    ['holder', /\b(?:tint|mark)\.value(?:\.[xyzw])?\s*=(?!=)/],
    ['holder', /\bshine\.(?:vector|tint)\.(?:set|copy)\w*\(|\bshine\.albedo\.value\s*=(?!=)/],
    ['holder', /\bslot\.[ab]\.(?:fromArray|set|copy)\(/],
    ['holder', /of prop\.uniforms\) uniform\.value\s*=(?!=)/],
    // The material a mesh draws with.
    ['swap', /\b(?:child|object|node|mesh|part|stand|laid\[i\]|list\[i\]|swapped\[i\])\.material\s*=(?!=)/]
];

// Writes that do not stamp, each with why. `has` is a piece of the line; an entry that matches nothing fails the test.
const EXEMPT = [
    // --- A material while it is made (nothing has drawn it or copied it yet) ---
    ['reactor_3d_models.js', 'material.transparent = true;', 'made: an FBX material with an alpha'],
    ['reactor_3d_models.js', 'material.opacity = def.opacity < 1', 'made: an FBX material with an alpha'],
    ['reactor_3d_models.js', 'material.alphaTest = def.alpha', 'made: an FBX material with an alpha'],
    ['reactor_3d_models.js', 'material.depthWrite = false;', 'made: an FBX material with an alpha'],
    ['reactor_3d_models.js', 'material.alphaMap = loadMap', 'made: an FBX material with an alpha'],
    ['reactor_3d_models.js', 'mat.alphaTest = def.alphaCutoff', 'made: a GLB material'],
    ['reactor_3d_models.js', 'mat.map = map; }', 'made: a GLB material'],
    ['reactor_3d_models.js', 'mat.userData.rrEmissive = new THREE.Color(emissive[0]', 'made: a GLB material'],
    ['reactor_3d_models.js', 'material.vertexColors = true;', 'made: a GLB primitive with vertex colours'],
    ['reactor_3d_models.js', 'material.userData.rrEmissive = new THREE.Color(1, 1, 1)', 'made: a merged character\'s material (LayeredParts)'],
    ['reactor_3d_models.js', 'child.material = Array.isArray(child.material)\n', 'made: an instance\'s materials at its clone (cloneModelTemplate)'],
    ['reactor_3d_models.js', 'm.color.setRGB(1, 1, 1);', 'made: the copy a group by colour draws with (StillParts.colourMaterial), white before anything draws it'],
    ['reactor_3d_models.js', 'm.vertexColors = true;', 'made: the copy a group by colour draws with (StillParts.colourMaterial)'],
    // --- A holder made at its neutral value where it is first asked for (absent and neutral draw the same) ---
    ['reactor_3d_lighting.js', 'const blend = material.userData.rrBlend || (material.userData.rrBlend = { value: { x: 0, y: 0, z: 0, w: 0 } });', 'neutral holder made at compile'],
    ['reactor_3d_lighting.js', 'shader.uniforms.rrFightStump = material.userData.rrFightStump || (material.userData.rrFightStump = { value: 1e9 });', 'neutral holder made at compile'],
    ['reactor_3d_lighting.js', 'shader.uniforms.rrCutBody = material.userData.rrCutBody || (material.userData.rrCutBody = { value: 0 });', 'neutral holder made at compile'],
    ['reactor_3d_lighting.js', 'const dissolve = material.userData.rrDissolve || (material.userData.rrDissolve = { value: -1e9 });', 'neutral holder made at compile'],
    ['reactor_fight_tactical.js', 'prop.uniforms.push(material.userData.rrFightStump || (material.userData.rrFightStump = { value: 1e9 }));', 'neutral holder made where a prop is first cut'],
    // --- Changed for one draw and put back before it returns: no update sees it ---
    ['reactor_3d.js', 'laid[i].material = laid[i + 1];', 'DepthFirst: the depth pass\'s own material, put back after the pass'],
    ['reactor_3d.js', 'laid[i].material = this.material(laid[i + 1].side);', 'DepthFirst: the depth pass\'s own material, put back after the pass'],
    ['reactor_3d_lighting.js', 'object.material = twins; }', 'HalfLight: the unlit twins for the first half, put back after it'],
    ['reactor_3d_lighting.js', 'object.material = this.twin(material);', 'HalfLight: the unlit twin for the first half, put back after it'],
    ['reactor_3d_lighting.js', 'list[i].material = list[i + 1];', 'HalfLight: the materials put back'],
    ['reactor_3d_lighting.js', 'for (const m of forward) m.visible = false;', 'HalfLight: a half\'s materials hidden for the other half\'s draw'],
    ['reactor_3d_lighting.js', 'for (const m of materials) m.visible = true;', 'HalfLight: shown again'],
    ['reactor_3d_lighting.js', 'for (const m of materials) m.visible = false;', 'HalfLight: a half\'s materials hidden for the other half\'s draw'],
    ['reactor_3d_lighting.js', 'for (const m of split.forward) m.visible = true;', 'HalfLight: shown again'],
    ['reactor_3d_lighting.js', 'for (const m of split.deferred) m.visible = false;', 'HalfLight: a half\'s materials hidden for the other half\'s draw'],
    ['reactor_3d_lighting.js', 'for (const m of split.deferred) m.visible = true;', 'HalfLight: shown again'],
    ['reactor_3d_lighting.js', 'if (sentinelMaterial) sentinelMaterial.visible = false;', 'HalfLight: the sentinel\'s own material'],
    ['reactor_3d_lighting.js', 'finally { if (sentinelMaterial) sentinelMaterial.visible = true;', 'HalfLight: the sentinel\'s own material'],
    ['reactor_3d_lighting.js', 'split.sentinel.material.visible = true;', 'HalfLight: the sentinel\'s own material'],
    ['reactor_3d_lighting.js', 'for (const m of pieces) m.side = Reactor3D.SUN_CASTER_SIDE;', 'the sun\'s shadow draw: a building\'s pieces turned for it, put back after'],
    ['reactor_3d_lighting.js', 'pieces.forEach((m, i) => { m.side = sides[i]; });', 'the sun\'s shadow draw: put back'],
    ['reactor_3d_lighting.js', 'child.material = caster;', 'a shadow draw: the caster\'s depth material, put back after'],
    ['reactor_3d_lighting.js', 'stand.material = caster;', 'a shadow stand-in\'s own mesh, never in the view'],
    ['reactor_3d_lighting.js', 'swapped[i].material = swapped[i + 1];', 'a shadow draw: the materials put back'],
    ['reactor_3d_lighting.js', 'cutout.alphaTest = first.alphaTest;', 'a shadow draw\'s own depth material'],
    ['reactor_3d_lighting.js', 'cutout.map = first.map || null;', 'a shadow draw\'s own depth material'],
    ['reactor_3d_lighting.js', 'caster.map = map;', 'a shadow draw\'s own depth material'],
    ['reactor_3d_lighting.js', 'caster.alphaTest = source.alphaTest;', 'a shadow draw\'s own depth material'],
    // --- Not a model's material: the world's, a light's, a billboard's, a plane's own ---
    ['reactor_3d.js', "if (piece === \"floor\" && this._roomFloorLook && this._roomFloorLook.tint) material.color.set(", 'a room\'s floor'],
    ['reactor_3d.js', 'material.opacity = group.underlay ? 0.6 : 1;', 'a tile chunk'],
    ['reactor_3d.js', 'mesh.material.color.setRGB(sky[0], sky[1], sky[2]);', 'the sky'],
    ['reactor_3d.js', 'dot.material.color.setRGB(', 'a light\'s glow'],
    ['reactor_3d.js', 'dot.material.opacity = ', 'a light\'s glow'],
    ['reactor_3d.js', 'core.material.color.setRGB(', 'a light\'s core'],
    ['reactor_3d.js', 'core.material.opacity = ', 'a light\'s core'],
    ['reactor_3d.js', 'material.map = map;', 'the merged light cores\' own material'],
    ['reactor_3d.js', 'material.visible = false;', 'the merged light cores\' own material'],
    ['reactor_3d.js', 'record.material.visible = true;', 'the merged light cores\' own material'],
    ['reactor_3d.js', 'mesh.material.opacity = (1 - phase) * 0.5;', 'a ring effect\'s own material'],
    ['reactor_3d_surround.js', 'haze.material.color.setRGB(', 'the horizon\'s haze'],
    ['reactor_3d_world.js', 'm.visible = false;', 'a batched chunk\'s mesh (m is a mesh)'],
    ['reactor_3d_world.js', 'm.visible = true;', 'a batched chunk\'s mesh (m is a mesh)'],
    ['reactor_3d_world.js', 'ripple.mesh.material.opacity = ', 'a ripple\'s own material'],
    ['reactor_3d_models.js', 'material.map = view;', 'a character billboard\'s own material (not __reactorModel)'],
    ['reactor_3d_models.js', 'holder.object.material.polygonOffset = biased;', 'a character billboard\'s own material (not __reactorModel)'],
    ['reactor_media_surfaces.js', 'this.threeMaterial.opacity = descriptor.opacity;', 'a media surface\'s own plane'],
    ['reactor_media_surfaces.js', 'this.threeMaterial.transparent = descriptor.opacity < 1;', 'a media surface\'s own plane'],
    ['reactor_media_surfaces.js', 'this.threeMaterial.depthWrite = descriptor.opacity >= 1;', 'a media surface\'s own plane'],
    ['reactor_battle_room.js', 'record.object.material.opacity=step.opacity??1;', 'a battle picture\'s own plane'],
    ['reactor_battle_room.js', 'shadow.material.opacity = .55', 'a battler\'s blob shadow'],
    ['reactor_battle_room.js', 'r.object.material.depthTest=false;r.object.material.depthWrite=false;', 'a battle picture\'s own plane'],
    ['reactor_battle_room.js', 'plane.material.transparent=true;plane.material.opacity=surface.opacity;', 'a battle surface\'s own plane'],
    ['reactor_battle_room.js', 'plane.material.depthTest=surface.layer<5;', 'a battle surface\'s own plane'],
    ['reactor_battle_room.js', 'plane.material.map=media.texture;', 'a battle surface\'s own plane']
];

function sources() {
    return fs.readdirSync(runtime).filter(name => name.endsWith('.js')).sort().map(name => [name, fs.readFileSync(path.join(runtime, name), 'utf8')]);
}

/** The writers in `text` that neither stamp nor are exempt: [{ file, line, kind, text }]. `used` collects the exemptions met. */
function unstamped(file, text, exempt, used) {
    const lines = text.split('\n'), found = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i], trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
        // (A shader's text in a string is not a write.)
        if (/^["'`]/.test(trimmed)) continue;
        let kind = null;
        for (const [name, pattern] of PATTERNS) if (pattern.test(line)) { kind = name; break; }
        if (!kind) continue;
        let stamped = false;
        for (let k = Math.max(0, i - BEFORE); k <= Math.min(lines.length - 1, i + AFTER) && !stamped; k++) stamped = lines[k].includes('touchMaterial');
        if (stamped) continue;
        const withBreak = line + '\n';
        const pass = exempt.find(([name, has]) => name === file && withBreak.includes(has));
        if (pass) { if (used) used.add(pass); continue; }
        found.push({ file, line: i + 1, kind, text: trimmed.slice(0, 160) });
    }
    return found;
}

test('every write to a model material in runtime/ stamps it or is listed with its reason', () => {
    const used = new Set(), found = [];
    for (const [file, text] of sources()) found.push(...unstamped(file, text, EXEMPT, used));
    assert.deepEqual(found.map(f => `${f.file}:${f.line} [${f.kind}] ${f.text}`), [],
        'a material is written without Reactor3D.touchMaterial(material) in the same block; stamp it, or list it in EXEMPT with why it needs none');
    const stale = EXEMPT.filter(entry => !used.has(entry)).map(([file, has]) => `${file}: ${has.trim()}`);
    assert.deepEqual(stale, [], 'an exemption matches no line any more: remove it');
    for (const [, , why] of EXEMPT) assert.ok(why && why.length > 3, 'every exemption says why');
});

test('a writer added without the stamp is found (the negative case)', () => {
    // Made up: each kind of write, alone.
    const cases = {
        colour: 'function f(material) {\n    material.color.setRGB(1, 0, 0);\n}\n',
        flag: 'function f(holder) {\n    holder.object.material.opacity = 0.5;\n}\n',
        picture: 'function f(mat, map) {\n    mat.map = map;\n}\n',
        holder: 'function f(material) {\n    material.userData.rrDissolve.value = 3;\n}\n',
        swap: 'function f(child, other) {\n    child.material = other;\n}\n'
    };
    for (const kind of Object.keys(cases)) {
        const found = unstamped('made-up.js', cases[kind], EXEMPT, null);
        assert.equal(found.length, 1, kind + ' write without a stamp is reported');
        assert.equal(found[0].kind, kind);
        assert.equal(found[0].line, 2);
        const stamped = cases[kind].replace('\n}\n', '\n    Reactor3D.touchMaterial(material);\n}\n');
        assert.deepEqual(unstamped('made-up.js', stamped, EXEMPT, null), [], kind + ' write with a stamp passes');
    }
    // A real one: the model flash with its stamps taken out is reported, at its two writes.
    const file = 'reactor_3d_models.js', text = fs.readFileSync(path.join(runtime, file), 'utf8');
    const start = text.indexOf('Reactor3D.updateModelFlash = function'), end = text.indexOf('\n};', start);
    assert.ok(start > 0 && end > start);
    const body = text.slice(start, end);
    assert.ok(body.includes('Reactor3D.touchMaterial(mat);'), 'the flash stamps what it colours');
    assert.deepEqual(unstamped(file, body, EXEMPT, null), [], 'as written, the flash passes');
    const bare = body.split('\n').filter(line => !line.includes('touchMaterial')).join('\n');
    const found = unstamped(file, bare, EXEMPT, null);
    assert.equal(found.length, 2, 'the flash without its stamps: ' + JSON.stringify(found));
    assert.ok(found.every(f => f.kind === 'colour'));
    // And a holder's value changed by a battle's line, as reactor_battle_room.js writes its dissolve.
    const room = "record.object?.traverse(node => { for (const m of [node.material].flat().filter(Boolean)) { const u = m.userData?.rrDissolve || (m.userData = m.userData || {}, m.userData.rrDissolve = { value: -1e9 }); u.value = front; } });\n";
    assert.equal(unstamped('made-up.js', room, EXEMPT, null).length, 1);
});

test('the stamp counts up on the material and changes nothing else', () => {
    require(path.join(runtime, 'libs', 'three.js'));
    const Reactor3D = require(path.join(runtime, 'reactor_3d.js'));
    const THREE = global.THREE;
    const material = new THREE.MeshBasicMaterial({ color: 0x336699 });
    const version = material.version, colour = material.color.getHex();
    assert.equal(material.userData.rrStamp, undefined);
    assert.equal(Reactor3D.touchMaterial(material), material);
    assert.equal(material.userData.rrStamp, 1);
    Reactor3D.touchMaterial([material, null, material]);
    assert.equal(material.userData.rrStamp, 3);
    assert.equal(material.version, version);
    assert.equal(material.color.getHex(), colour);
    assert.equal(Reactor3D.touchMaterial(null), null);
});
