'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {copyWebForgeAssets}=require('../build-scripts/web-forge-assets.cjs'),root=path.resolve(__dirname,'..');
test('web editor carries body, clothing, expression data and every browser worker import, including licenses',()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'rr-forge-assets-'));try{copyWebForgeAssets(root,out,path.resolve(root,'../runtime'));
 for(const name of ['human.json','human.bin','eye-brown.png','clothes.json','clothes.bin','expressions.json','expressions.bin','outfits/carol.json','outfits/carol.bin','outfits/carol.jpg','LICENSE.md','clothes/LICENSE.md']){const rel='src/forge/Character3D/data/'+name;assert.ok(Buffer.compare(fs.readFileSync(path.join(root,rel)),fs.readFileSync(path.join(out,rel)))===0,rel+' bytes');}
 const imports=[];vm.runInNewContext(fs.readFileSync(path.join(out,'src/forge/Character3D/CharacterPreviewBrowserEntry.js'),'utf8'),{importScripts(...files){imports.push(...files);},self:{},Map,Set});
 for(const file of imports)assert.ok(fs.existsSync(path.resolve(out,'src/forge/Character3D',file)),file+' shipped');
 assert.ok(fs.existsSync(path.join(out,'src/forge/Character3D/data/reactor_3d_motions.bin')));
 assert.ok(!fs.existsSync(path.join(out,'src/forge/Character3D/CharacterPreviewWorker.cjs')),'Node-only worker is excluded');
 }finally{fs.rmSync(out,{recursive:true,force:true});}
});
test('a bundled preview client resolves its worker under the editor base, including hosted subdirectories',()=>{
 let requested;const worker={postMessage(){},terminate(){}};const ctx={document:{currentScript:{src:'https://example.test/demo/web/editor.bundle.js'},baseURI:'https://example.test/demo/'},URL,Map,Set,setTimeout,clearTimeout,window:{Worker:function(url){requested=url;return worker;}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'src/forge/Character3D/CharacterPreviewBrowser.js'),'utf8'),ctx);
 const client=new ctx.window.RRCharacterPreviewWorker.PreviewWorker();client._start();assert.equal(requested,'https://example.test/demo/src/forge/Character3D/CharacterPreviewBrowserEntry.js');client.dispose();
});
test('web authoring preloads synchronous data consumers once per body pack even when a require shim exists',async()=>{
 const calls=[],ctx={require(){throw Error('No Node');},RRCharacterClothes:{async preload(pack,base){calls.push(['clothes',base]);pack._clothes={};}},RRCharacterExpressions:{async preload(pack,base){calls.push(['expressions',base]);pack._expressionUnits={};}},RRCharacterPoses:{ready:()=>false,async loadAsync(url){calls.push(['poses',url]);return true;}},Map,Set};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'src/forge/Character3D/HumanTargets.js'),'utf8'),ctx);vm.runInContext(fs.readFileSync(path.join(root,'src/forge/Character3D/HumanBody.js'),'utf8'),ctx);
 const pack={};await ctx.RRHumanBody.prepareAuthoring(pack,'data-root');await ctx.RRHumanBody.prepareAuthoring(pack,'data-root');assert.equal(calls.filter(c=>c[0]!=='poses').length,2);assert.ok(calls.filter(c=>c[0]!=='poses').every(c=>c[1]==='data-root'));assert.ok(calls.some(c=>c[0]==='poses'&&c[1]==='data-root/reactor_3d_motions.bin'));
});
test('body fetch errors retain the missing asset and HTTP status, and a later load can retry',async()=>{
 const ctx={Map,Set,fetch:async url=>({ok:false,status:404,json(){throw Error('should not parse an error page');},arrayBuffer(){throw Error('should not parse an error page');}})};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'src/forge/Character3D/HumanTargets.js'),'utf8'),ctx);vm.runInContext(fs.readFileSync(path.join(root,'src/forge/Character3D/HumanBody.js'),'utf8'),ctx);
 await assert.rejects(ctx.RRHumanBody.loadPack(),/Character body asset failed \(404\).*human.json/);
 ctx.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,'src/forge/Character3D/data/human.json'),'utf8')),arrayBuffer:async()=>{const b=fs.readFileSync(path.join(root,'src/forge/Character3D/data/human.bin'));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}});
 assert.ok((await ctx.RRHumanBody.loadPack()).vertexCount>10000);
});
