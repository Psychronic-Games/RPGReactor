const root=process.argv[2],dir=root+'/src/forge/Character3D/',fs=require('fs');global.THREE=require(root+'/tests/helpers/three.cjs');globalThis.RR_DEFAULT_PICTURES={atlas:256,picture:256,skin:64,prop:512};
(async()=>{const Body=require(dir+'HumanBody.js');for(const n of ['HumanTargets','CharacterOutfit','CharacterAtlas','CharacterWardrobe','CharacterProps','CharacterSpecies','CharacterSkin','CharacterHair'])require(dir+n+'.js');
const M=require(dir+'CharacterModel.js'),W=require(dir+'CharacterWardrobe.js'),F=require(dir+'CharacterFit.js');const pack=await Body.loadPack();const base=JSON.parse(fs.readFileSync(process.argv[3])).recipe;
for(const [n,g] of [['ours_female',0],['ours_neutral',.5],['ours_male',1]]){const b=Body.build(pack,Body.normalizeRecipe({gender:g})),Bd=b.parts[0];fs.writeFileSync(process.argv[3].replace(/grey.json$/,'refs/'+n+'.bin'),Buffer.concat([Buffer.from(new Uint32Array([Bd.positions.length/3,Bd.index.length/3]).buffer),Buffer.from(Float32Array.from(Bd.positions).buffer),Buffer.from(Uint32Array.from(Bd.index).buffer)]));}
console.log('ok');
})().catch(e=>console.log(e.stack.slice(0,300)));
