#!/usr/bin/env node
/** Real GPU checks for legacy buffer textures. Use codex-check on an isolated display. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {WebDriverClient}=require('./webdriver-client.cjs');
const root=path.resolve(__dirname,'../../..'),out=path.resolve(process.argv.find(a=>a.startsWith('--out='))?.slice(6)||'scratchpad/hendrix-pixi-audit-20261029'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'rr-pixi-buffer-'));
fs.mkdirSync(out,{recursive:true});if(process.argv.includes('--baseline')){fs.mkdirSync(path.join(temp,'libs'));fs.copyFileSync(path.join(root,'runtime/libs/pixi.js'),path.join(temp,'libs/pixi.js'));fs.copyFileSync(path.join(out,'baseline-pixi-compat.js'),path.join(temp,'libs/pixi_compat.js'));}else fs.symlinkSync(path.join(root,'runtime/libs'),path.join(temp,'libs'));
fs.writeFileSync(path.join(temp,'package.json'),JSON.stringify({name:'reactor-buffer-compat-check',main:'index.html',window:{width:640,height:480},'chromium-args':'--no-sandbox --force-high-performance-gpu --use-gl=angle --use-angle=gl'}));
fs.writeFileSync(path.join(temp,'index.html'),`<!doctype html><body><script>window.__errors=[];addEventListener('error',e=>__errors.push(String(e.error?.stack||e.message)));</script><script src="libs/pixi.js"></script><script src="libs/pixi_compat.js"></script><script>window.ready=(async()=>{window.renderer=await PIXI.autoDetectRenderer({width:8,height:4,preference:'webgl',backgroundAlpha:0,antialias:false});document.body.appendChild(renderer.canvas);renderer.canvas.style.cssText='width:512px;height:256px;image-rendering:pixelated';return true;})();</script>`);
const driver=new WebDriverClient(path.join(root,'nwjs-linux/chromedriver'));
(async()=>{try{
 await driver.start();await driver.createSession({browserName:'chrome','goog:chromeOptions':{args:[`nwapp=${temp}`,`user-data-dir=${temp}/profile`,'no-first-run','mute-audio','js-flags=--max-old-space-size=1024']}});
 await driver.executeAsync('const done=arguments[arguments.length-1];window.ready.then(done,e=>done(String(e.stack)));');
 const report=await driver.execute(`const P=PIXI,r=renderer,reports=[];
 const sample=target=>{const canvas=r.extract.canvas({target}),d=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;return{width:canvas.width,height:canvas.height,pixels:Array.from(d)};};
 const target=P.RenderTexture.create({width:4,height:1}),stage=new P.Container();const patch=new P.Sprite(P.Texture.WHITE);patch.width=2;patch.height=1;patch.alpha=0.5;patch.tint=0x2080ff;stage.addChild(patch);r.render({container:stage,target,clear:true});
 const before=sample(target),white=new P.Sprite(P.Texture.WHITE);white.width=4;white.height=1;white.blendMode=P.BLEND_MODES.SRC_IN;r.render({container:white,target,clear:false});reports.push({case:'source-in',mode:P.BLEND_MODES.SRC_IN,blend:r.state.blendMode,map:r.state.blendModesMap['source-in'],before,after:sample(target),gl:r.gl.getError()});white.destroy();stage.destroy({children:true});target.destroy(true);
 const canvas=document.createElement('canvas');canvas.width=2;canvas.height=1;const ctx=canvas.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,1,1);ctx.fillStyle='#0000ff';ctx.fillRect(1,0,1,1);const base=new P.BaseTexture(canvas),tex=new P.Texture(base,new P.Rectangle(0,0,1,1)),sprite=new P.Sprite(tex),row=new P.Container();row.addChild(sprite);r.render({container:row});const first=sample(row);tex.frame=new P.Rectangle(1,0,1,1);tex._updateID++;r.render({container:row});reports.push({case:'frame',first,after:sample(row),revision:tex._updateID,gl:r.gl.getError()});
 let unloaded=0;base.source.on('unload',()=>unloaded++);let error=null;try{base.dispose();r.render({container:row});}catch(e){error=String(e);}reports.push({case:'dispose',error,unloaded,valid:base.valid,destroyed:base.source.destroyed,after:sample(row),gl:r.gl.getError()});row.destroy({children:true});tex.destroy();base.destroy();
 const parent=new P.Sprite(P.Texture.fromBuffer(new Uint8Array([255,0,0,255,255,0,0,255]),2,1));parent._render=function(){};const child=new P.Sprite(P.Texture.WHITE);child.width=1;child.height=1;child.x=1;child.tint=0x0000ff;parent.addChild(child);const group=new P.Container();group.addChild(parent);r.render({container:group});reports.push({case:'empty-render',after:sample(group),gl:r.gl.getError()});group.destroy({children:true});
 return{reports,errors:__errors};`);
 report.logs=await driver.sessionRequest('POST','/log',{type:'browser'});fs.writeFileSync(path.join(out,'contracts.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 if(!process.argv.includes('--baseline')){
  assert.equal(report.errors.length,0);for(const c of report.reports)assert.equal(c.gl,0,c.case);
  const [mask,frame,dispose,empty]=report.reports;assert.equal(mask.mode,'source-in');assert.deepEqual(mask.after.pixels.filter((_,i)=>i%4===3),mask.before.pixels.filter((_,i)=>i%4===3));assert.ok(Math.abs(mask.after.pixels[0]-mask.before.pixels[3])<=1);assert.ok(Math.abs(mask.after.pixels[4]-mask.before.pixels[7])<=1);assert.equal(mask.after.pixels[8],0);
  assert.deepEqual(frame.first.pixels,[255,0,0,255]);assert.deepEqual(frame.after.pixels,[0,0,255,255]);assert.ok(Number.isFinite(frame.revision));assert.equal(dispose.error,null);assert.equal(dispose.unloaded,1);assert.equal(dispose.valid,true);assert.equal(dispose.destroyed,false);assert.deepEqual(dispose.after.pixels,[0,0,255,255]);assert.deepEqual(empty.after.pixels,[0,0,0,0,0,0,255,255]);
 }
 }finally{await driver.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
