#!/usr/bin/env node
/** Serial default catalog audit. Run with codex-check; retain only bounded numeric records. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const W=require('../../src/forge/Character3D/CharacterWardrobe.js'),G=require('../../src/forge/Props/GarmentProp.js');
globalThis.RR_CYBERWEAR_STRICT=true;globalThis.RR_DETAILS_STRICT=true;
(async()=>{
    await G.prepare();const rows=[],cache={atlasSize:Number(process.argv.find(a=>a.startsWith('--atlas-size='))?.slice(13)||2048)};
    assert.ok(Number.isInteger(cache.atlasSize)&&cache.atlasSize>=64&&cache.atlasSize<=2048,'bounded atlas size');
    const wanted=process.argv.find(a=>a.startsWith('--ids='))?.slice(6).split(',');
    for(const g of W.GARMENTS.filter(g=>G.supports(g.id)&&(!wanted||wanted.includes(g.id)))) {
        const start=performance.now(),r=G.build({garment:{id:g.id}},cache);
        assert.ok(r.parts.length,g.id+' has geometry');assert.ok(r.triangles>0&&r.triangles<250000,g.id+' bounded geometry');
        for(const p of r.parts) {
            for(const key of ['positions','normals','weights'])assert.ok(p[key].every(Number.isFinite),g.id+' finite '+key);
            for(const key of ['texture','normalTexture','metallicRoughnessTexture','emissiveTexture'])if(p[key])assert.ok(r.textures[p[key]],g.id+' '+key);
            for(let v=0;v<p.positions.length/3;v++) {
                let sum=0;for(let k=0;k<4;k++){assert.ok(p.joints[v*4+k]<r.bones.length,g.id+' joint');sum+=p.weights[v*4+k];}
                assert.ok(Math.abs(sum-1)<.001,g.id+' normalized weights');
            }
        }
        const signature=crypto.createHash('sha256');for(const p of r.parts)for(const key of ['positions','normals','index','joints','weights'])if(p[key])signature.update(Buffer.from(p[key].buffer,p[key].byteOffset,p[key].byteLength));
        rows.push({id:g.id,signature:signature.digest('hex'),parts:r.parts.length,triangles:r.triangles,textures:Object.keys(r.textures).length,ms:Math.round(performance.now()-start)});
        if(rows.length%25===0)console.log('Checked '+rows.length+' garments');
    }
    const requested=process.argv.find(a=>a.startsWith('--out='))?.slice(6);
    const out=requested?path.resolve(requested):path.resolve(__dirname,'../../../scratchpad/forge-wearables-hair-20261029/catalog.json');fs.mkdirSync(path.dirname(out),{recursive:true});const finalRows=process.argv.includes('--merge')&&fs.existsSync(out)?JSON.parse(fs.readFileSync(out)).map(r=>rows.find(n=>n.id===r.id)||r):rows;fs.writeFileSync(out,JSON.stringify(finalRows,null,2));
    console.log('Passed '+rows.length+' garment defaults');
})().catch(e=>{console.error(e);process.exitCode=1;});
