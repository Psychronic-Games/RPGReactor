const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const metrics=require('../src/utils/TileMetrics.js');
require('../src/utils/AssetFiles.js');
const method=(file,name)=>fs.readFileSync(path.join(root,file),'utf8').match(new RegExp(name.replaceAll('.','\\.')+' = function\\([^]*?\\n};'))[0];

test('64px and 8px sizes are supported without accepting arbitrary cell sizes',()=>{
 for(const size of [64,48,32,24,16,8]) assert.equal(metrics.tileSizeOf({tileSize:size}),size);
 for(const size of [0,7,12,128,NaN]) assert.equal(metrics.tileSizeOf({tileSize:size}),48);
});

test('configured face cells retain four columns and support extended rows',()=>{
 const face=globalThis.RRFaceSheet;
 for(const size of [32,40,48,96,144,288]) {
  assert.deepEqual(face.metrics(size*3,{faceSize:size}),{columns:4,rows:3,count:12,faceSize:size});
  assert.deepEqual(face.sourceRect(9,size*3,{faceSize:size}),{x:size,y:size*2,width:size,height:size});
  assert.equal(face.sourceRect(12,size*3,{faceSize:size}),null);
 }
 assert.equal(face.metrics(288,{}).faceSize,144);
});

test('game boot removes stale package minimums before applying screen scale',()=>{
 const calls=[],scope={Scene_Boot:function(){},Utils:{isNwjs:()=>true},Graphics:{width:816,height:624},nw:{Window:{get:()=>({setMinimumSize:(w,h)=>calls.push(['min',w,h]),isFullscreen:false})}},window:{innerWidth:1280,innerHeight:720,moveBy:()=>{},resizeBy:(w,h)=>calls.push(['resize',w,h])}};
 vm.runInNewContext(method('runtime/reactor_scenes.js','Scene_Boot.prototype.adjustWindow'),scope);
 scope.Scene_Boot.prototype.screenScale=()=>1;
 new scope.Scene_Boot().adjustWindow();
 assert.deepEqual(calls,[['min',1,1],['resize',-464,-96]]);
 calls.length=0;scope.Scene_Boot.prototype.screenScale=()=>2;
 new scope.Scene_Boot().adjustWindow();
 assert.deepEqual(calls,[['min',1,1],['resize',352,528]]);
});

test('pixelated output renders the whole frame at game resolution',()=>{
 const scope={$dataSystem:{advanced:{pixelatedRendering:true}},Graphics:{_realScale:3,displayPixelRatio:()=>2,maxCanvasPixelRatio:4,upscaleFilter:'linear'}};
 vm.runInNewContext(method('runtime/reactor_core.js','Graphics.canvasPixelRatio')+'\n'+method('runtime/reactor_core.js','Graphics.upscaleFilterInUse'),scope);
 assert.equal(scope.Graphics.canvasPixelRatio(),1);
 assert.equal(scope.Graphics.upscaleFilterInUse(),'nearest');
 scope.$dataSystem.advanced.pixelatedRendering=false;
 assert.equal(scope.Graphics.canvasPixelRatio(),4);
 assert.equal(scope.Graphics.upscaleFilterInUse(),'linear');
});
