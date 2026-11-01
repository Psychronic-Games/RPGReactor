const root=process.argv[2],dir=root+'/src/forge/Character3D/',fs=require('fs');global.THREE=require(root+'/tests/helpers/three.cjs');globalThis.RR_DEFAULT_PICTURES={atlas:256,picture:256,skin:64,prop:512};
(async()=>{const Body=require(dir+'HumanBody.js');for(const n of ['HumanTargets','CharacterOutfit','CharacterAtlas','CharacterWardrobe','CharacterProps','CharacterSpecies','CharacterSkin','CharacterHair'])require(dir+n+'.js');
const M=require(dir+'CharacterModel.js');const pack=await Body.loadPack();const out={};
for(const [n,g] of [['F',0],['M',1]]){const b=M.build(pack,{gender:g},{}, {quality:'preview',skinSize:32,atlasSize:64});const tris=[];const eye=b.parts.find(p=>p.name==='Eyes');let ey=0;const Q=eye.positions;for(let i=1;i<Q.length;i+=3)ey+=Q[i]/(Q.length/3);
 for(const nm of ['Body','Head skin','Eyes']){const p=b.parts.find(q=>q.name===nm),P=p.positions,I=p.index;for(let t=0;t<I.length;t+=3){const a=I[t]*3,c=I[t+1]*3,d=I[t+2]*3;if(P[a+1]<ey-.32)continue;tris.push(+P[a].toFixed(4),+P[a+1].toFixed(4),+P[a+2].toFixed(4),+P[c].toFixed(4),+P[c+1].toFixed(4),+P[c+2].toFixed(4),+P[d].toFixed(4),+P[d+1].toFixed(4),+P[d+2].toFixed(4));}}
 out[n]={tris,ey};}
fs.writeFileSync(process.argv[3],JSON.stringify(out));console.log('ok');})().catch(e=>console.log(e.stack.slice(0,400)));
