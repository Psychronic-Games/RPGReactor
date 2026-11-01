const root=process.argv[2],dir=root+'/src/forge/Character3D/',fs=require('fs');global.THREE=require(root+'/tests/helpers/three.cjs');globalThis.RR_DEFAULT_PICTURES={atlas:256,picture:256,skin:64,prop:512};
(async()=>{const Body=require(dir+'HumanBody.js');for(const n of ['HumanTargets','CharacterOutfit','CharacterAtlas','CharacterWardrobe','CharacterProps','CharacterSpecies','CharacterSkin','CharacterHair'])require(dir+n+'.js');
const M=require(dir+'CharacterModel.js'),W=require(dir+'CharacterWardrobe.js'),F=require(dir+'CharacterFit.js');const pack=await Body.loadPack();const base=JSON.parse(fs.readFileSync(process.argv[3])).recipe;
const out=process.argv[3].replace(/grey.json$/,'refs/jac/');fs.mkdirSync(out,{recursive:true});const keys=JSON.parse(process.argv[4]),extra=JSON.parse(process.argv[5]||'{}'),step=.3;
const dump=(n,g,sh)=>{const Bd=Body.build(pack,Body.normalizeRecipe({gender:g,shapes:sh})).parts[0];fs.writeFileSync(out+n+'.bin',Buffer.concat([Buffer.from(new Uint32Array([Bd.positions.length/3,Bd.index.length/3]).buffer),Buffer.from(Float32Array.from(Bd.positions).buffer),Buffer.from(Uint32Array.from(Bd.index).buffer)]));};
for(const [s,g] of [['F',0],['M',1]]){const base=extra[s]||{};dump(s+'_base',g,base);for(const k of keys)dump(s+'_'+k,g,{...base,[k]:(base[k]||0)+step});}
console.log('ok');
})().catch(e=>console.log(e.stack.slice(0,300)));
