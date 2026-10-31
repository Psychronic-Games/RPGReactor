#!/usr/bin/env node
/** Real GPU checks for legacy buffer textures. Use codex-check on an isolated display. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {WebDriverClient}=require('./webdriver-client.cjs');
const root=path.resolve(__dirname,'../../..'),out=path.resolve(process.argv.find(a=>a.startsWith('--out='))?.slice(6)||'scratchpad/pixi-buffer-20261029'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'rr-pixi-buffer-'));
fs.mkdirSync(out,{recursive:true});fs.symlinkSync(path.join(root,'runtime/libs'),path.join(temp,'libs'));
fs.writeFileSync(path.join(temp,'package.json'),JSON.stringify({name:'reactor-buffer-compat-check',main:'index.html',window:{width:640,height:480},'chromium-args':'--no-sandbox --force-high-performance-gpu --use-gl=angle --use-angle=gl'}));
fs.writeFileSync(path.join(temp,'index.html'),`<!doctype html><body><script>window.__errors=[];addEventListener('error',e=>__errors.push(String(e.error?.stack||e.message)));</script><script src="libs/pixi.js"></script><script src="libs/pixi_compat.js"></script><script>window.ready=(async()=>{window.renderer=await PIXI.autoDetectRenderer({width:8,height:4,preference:'webgl',backgroundAlpha:0,antialias:false});document.body.appendChild(renderer.canvas);renderer.canvas.style.cssText='width:512px;height:256px;image-rendering:pixelated';return true;})();</script>`);
const driver=new WebDriverClient(path.join(root,'nwjs-linux/chromedriver'));
(async()=>{try{
 await driver.start();await driver.createSession({browserName:'chrome','goog:chromeOptions':{args:[`nwapp=${temp}`,`user-data-dir=${temp}/profile`,'no-first-run','mute-audio','js-flags=--max-old-space-size=1024']}});
 await driver.executeAsync('const done=arguments[arguments.length-1];window.ready.then(done,e=>done(String(e.stack)));');
 const report=await driver.execute(`const P=PIXI,r=renderer,results=[];window.__bytes=new Uint8Array([255,0,0,255,0,255,0,128,0,0,255,255,255,255,0,255]);
 const draw=(label,texture,repeat=false)=>{const stage=new P.Container();const s=repeat?new P.TilingSprite({texture,width:8,height:4}):new P.Sprite(texture);stage.addChild(s);r.render({container:stage,clear:true});const canvas=r.extract.canvas({target:stage}),ctx=canvas.getContext('2d'),d=ctx.getImageData(0,0,canvas.width,canvas.height).data;const at=(x,y)=>Array.from(d.slice((y*canvas.width+x)*4,(y*canvas.width+x)*4+4));results.push({label,width:canvas.width,height:canvas.height,pixels:[at(0,0),at(1,0),at(0,1),at(1,1)],repeat:repeat?at(2,0):null,format:texture.source.format,alpha:texture.source.alphaMode,gl:r.gl.getError()});stage.destroy({children:true});};
 const t=P.Texture.fromBuffer(__bytes,2,2,{wrapMode:P.WRAP_MODES.REPEAT});draw('bytes-repeat',t,true);
 __bytes.set([0,255,255,255],0);t.baseTexture.resource.update();draw('updated',t);
 const f=P.Texture.fromBuffer(new Float32Array([1,0.25,0,1]),1,1);draw('float',f);
 const hi=P.Texture.fromBuffer(new Uint8Array([255,0,0,255,0,255,0,255,0,0,255,255,255,255,0,255]),2,2,{resolution:2});draw('resolution',hi);
 t.destroy(true);f.destroy(true);hi.destroy(true);return{results,errors:__errors};`);
 report.logs=await driver.sessionRequest('POST','/log',{type:'browser'});fs.writeFileSync(path.join(out,'gpu.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(out,'gpu.png'),Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));console.log(JSON.stringify(report));
 assert.equal(report.errors.length,0);for(const c of report.results)assert.equal(c.gl,0,c.label);
 const [bytes,updated,float,hi]=report.results;
 const expected=[[255,0,0,255],[0,128,0,128],[0,0,255,255],[255,255,0,255]];for(let p=0;p<4;p++)for(let c=0;c<4;c++)assert.ok(Math.abs(bytes.pixels[p][c]-expected[p][c])<=1,`byte pixel ${p} channel ${c}: ${bytes.pixels[p][c]}`);assert.deepEqual(bytes.repeat,[255,0,0,255]);
 assert.deepEqual(updated.pixels[0],[0,255,255,255]);assert.ok(Math.abs(float.pixels[0][1]-64)<=1);assert.equal(float.pixels[0][0],255);
 assert.deepEqual([hi.width,hi.height],[1,1]);assert.deepEqual(hi.pixels[0],[255,255,0,255]);
 assert.equal(report.logs.filter(l=>/GL_INVALID|INVALID_OPERATION|TypeError|ReferenceError/i.test(l.message)).length,0);
 }finally{await driver.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
