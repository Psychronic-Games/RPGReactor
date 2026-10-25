'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const dir = path.resolve(__dirname, '../src/forge/Character3D');
const load = name => require(path.join(dir, name + '.js'));
const Body = load('HumanBody'), Model = load('CharacterModel'), Cloth = load('CharacterCloth'), Poses = load('CharacterPoses');

// Each boot has an open cuff. Horizontal rays in both directions avoid treating that opening,
// or a ray landing on a shared triangle edge, as a hole in the foot shell.
function encloses(P, I, point) {
    const hits = [];
    for (let k = 0; k < I.length; k += 3) {
        const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3;
        const ay = P[a + 1], az = P[a + 2], by = P[b + 1], bz = P[b + 2], cy = P[c + 1], cz = P[c + 2];
        if (point[1] < Math.min(ay, by, cy) || point[1] > Math.max(ay, by, cy) || point[2] < Math.min(az, bz, cz) || point[2] > Math.max(az, bz, cz)) continue;
        const det = (by - cy) * (az - cz) + (cz - bz) * (ay - cy);
        if (Math.abs(det) < 1e-12) continue;
        const u = ((by - cy) * (point[2] - cz) + (cz - bz) * (point[1] - cy)) / det;
        const v = ((cy - ay) * (point[2] - cz) + (az - cz) * (point[1] - cy)) / det;
        if (u < 0 || v < 0 || u + v > 1) continue;
        const t = P[c] + u * (P[a] - P[c]) + v * (P[b] - P[c]) - point[0];
        if (Math.abs(t) > 1e-5 && !hits.some(other => Math.abs(other - t) < 1e-5)) hits.push(t);
    }
    return hits.filter(t => t > 0).length % 2 === 1 || hits.filter(t => t < 0).length % 2 === 1;
}

test('power armor boots enclose the posed heel, toes and ankle through every walking frame', async () => {
    const pack = await Body.loadPack();
    for (const body of [{ gender: 1 }, { gender: 0 }, { gender: 1, extreme: true, weight: 3, muscle: 2 }]) {
        for (const bulk of [0.6, 1.1]) {
            const result = Model.build(pack, Object.assign({}, body, { outfit: [{ id: 'powerarmor', bulk }, { id: 'powerhelm' }] }), {}, { quality: 'preview', skinSize: 64 });
            const suit = result.parts.find(p => p.name === 'Power armor undersuit');
            const boot = result.parts.find(p => p.name === 'Power armor' && /^shoes/.test(p.texture || ''));
            assert.ok(suit && boot, 'undersuit and armored boots are present');
            const triangles = [[], []], feet = [[], []];
            for (let i = 0; i < boot.index.length; i += 3) {
                const side = boot.positions[boot.index[i] * 3] > 0 ? 0 : 1;
                triangles[side].push(boot.index[i], boot.index[i + 1], boot.index[i + 2]);
            }
            for (let v = 0; v < suit.positions.length / 3; v++) {
                const side = suit.positions[v * 3] > 0 ? 0 : 1, prefix = side ? 'Right' : 'Left';
                let weight = 0;
                for (let k = 0; k < 4; k++) if ([prefix + 'Foot', prefix + 'ToeBase'].includes(result.bones[suit.joints[v * 4 + k]].name)) weight += suit.weights[v * 4 + k];
                if (weight > 0.5) feet[side].push(v);
            }
            assert.ok(feet.every(ids => ids.length > 100), 'both actual foot meshes are checked');
            const clip = Poses.clip(result.bones, 'walk', result.parts.find(p => p.name === 'Body'));
            for (let frame = 0; frame < clip.times.length; frame++) {
                const pose = Cloth.pose(result.bones, clip, clip.times[frame]);
                const P = Cloth.skin(boot, result.bones, pose), S = Cloth.skin(suit, result.bones, pose);
                for (let side = 0; side < 2; side++) for (const v of feet[side]) {
                    assert.ok(encloses(P, triangles[side], S.subarray(v * 3, v * 3 + 3)), `${JSON.stringify(body)}, bulk ${bulk}, frame ${frame}, side ${side}: foot vertex ${v} escapes its own boot`);
                }
            }
        }
    }
});

test('choosing flexible footwear preserves the original foot bindings under power armor',async()=>{
    const pack=await Body.loadPack(),same=[];
    for(const feet of [null,'magboots','boots']){
        const result=Model.build(pack,{gender:1,outfit:[{id:'powerarmor'},...(feet?[{id:feet}]:[])]},{},{static:true,quality:'preview',skinSize:64,atlasSize:64});
        const suit=result.parts.find(p=>p.name==='Power armor undersuit'),body=result.built.parts.find(p=>p.name==='Body');
        same.push(suit.joints.every((q,i)=>q===body.joints[i])&&suit.weights.every((q,i)=>q===body.weights[i]));
    }
    assert.ok(!same[0]&&!same[1],'hard boots and their lining retain a rigid foot');
    assert.ok(same[2],'flexible boots keep the original underlying articulation');
});
