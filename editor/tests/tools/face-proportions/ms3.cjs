const root=process.argv[2],dir=root+'/src/forge/Character3D/',fs=require('fs');global.THREE=require(root+'/tests/helpers/three.cjs');globalThis.RR_DEFAULT_PICTURES={atlas:256,picture:256,skin:64,prop:512};
if(process.argv[4]==='raw')globalThis.RR_NO_JAW=true;
(async()=>{const Body=require(dir+'HumanBody.js');for(const n of ['HumanTargets','CharacterOutfit','CharacterAtlas','CharacterWardrobe','CharacterProps','CharacterSpecies','CharacterSkin','CharacterHair'])require(dir+n+'.js');
const M=require(dir+'CharacterModel.js');const pack=await Body.loadPack();const HF=Body.headFields(pack);
const out={};for(const [n,g] of [['F',0],['M',1]]){const b=M.build(pack,{gender:g},{}, {quality:'preview',skinSize:32,atlasSize:64});
 const S=b.built?b.built.shaped:null,e=[...HF.eyeIds];
 const pts=[];for(const nm of ['Body','Head skin']){const p=b.parts.find(q=>q.name===nm),P=p.positions,I=p.index;for(let t=0;t<I.length;t+=3){const a=I[t]*3,c=I[t+1]*3,d=I[t+2]*3;if(P[a+1]<1.2)continue;for(const [u,v,w] of [[1/3,1/3,1/3],[1,0,0],[.5,.5,0],[.5,0,.5],[0,.5,.5],[.6,.2,.2],[.2,.6,.2],[.2,.2,.6]])pts.push(+(P[a]*u+P[c]*v+P[d]*w).toFixed(4),+(P[a+1]*u+P[c+1]*v+P[d+1]*w).toFixed(4),+(P[a+2]*u+P[c+2]*v+P[d+2]*w).toFixed(4));}}
 const eye=b.parts.find(q=>q.name==='Eyes').positions;let ey=0;for(let i=1;i<eye.length;i+=3)ey+=eye[i]/(eye.length/3);
 const h=b.parts.find(q=>q.name==='Head skin').positions;let chin=9;for(let i=0;i<h.length;i+=3)if(Math.abs(h[i])<.012&&h[i+2]>.02&&h[i+1]<chin)chin=h[i+1];let tip=-9;for(let i=0;i<h.length;i+=3)if(h[i+2]>tip)tip=h[i+2];
 out[n]={pts,ey,chin,tip};}
fs.writeFileSync(process.argv[3],JSON.stringify(out));console.log('ok');})().catch(e=>console.log(e.stack.slice(0,400)));
