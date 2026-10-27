'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test');
const {runtimeSource}=require('./helpers/runtime-source.cjs');
const C=require('../src/legacy/LegacyCommands.js'),K=require('../src/legacy/LegacyConvert.js'),L=require('../src/legacy/LcfReader.js');
function fixture(defaults=[20,19],inheritedFade=false){
 const state={snaps:0,bitmapDisposals:0,spriteDisposals:0,updates:0,native:0};
 function Scene() {this.children=[];this._fadeDuration=0;this._fadeOpacity=0;}
 Scene.prototype.addChild=function(s){this.children.push(s);s.parent=this;};Scene.prototype.removeChild=function(s){this.children.splice(this.children.indexOf(s),1);s.parent=null;};
 Scene.prototype.startFadeIn=function(n){this._fadeDuration=n;this._fadeSign=1;this._fadeOpacity=255;};Scene.prototype.startFadeOut=function(n){this._fadeDuration=n;this._fadeSign=-1;this._fadeOpacity=0;};
 Scene.prototype.update=function(){this.updateMain();};Scene.prototype.updateColorFilter=function(){};Scene.prototype.fadeInForTransfer=Scene.prototype.fadeOutForTransfer=function(){state.native++;};
 Scene.prototype.updateFade=function(){if(this._fadeDuration>0){this._fadeOpacity=this._fadeSign>0?this._fadeOpacity-this._fadeOpacity/this._fadeDuration:this._fadeOpacity+(255-this._fadeOpacity)/this._fadeDuration;this._fadeDuration--;}};
 Scene.prototype.updateMain=function(){state.updates++;};Scene.prototype.terminate=function(){};
 if(inheritedFade){Object.setPrototypeOf(Scene.prototype,{updateFade:Scene.prototype.updateFade});delete Scene.prototype.updateFade;}
 function Sprite(bitmap){this.bitmap=bitmap;this.scale={set:(x,y)=>{this.sx=x;this.sy=y;}};}Sprite.prototype.setFrame=function(x,y,w,h){this.frame={x,y,w,h};};Sprite.prototype.destroy=function(){state.spriteDisposals++;};
 const box={Bitmap:function(){this.fillAll=()=>{};this.destroy=()=>state.bitmapDisposals++;},$gameTemp:{},ImageManager:{isReady:()=>true,loadPicture:()=>{}},$gameScreen:{_pictures:[]},Scene_Map:Scene,Game_Interpreter:function(){},$dataSystem:{rrLegacyTransitions:defaults},$gameSystem:{},Graphics:{width:320,height:240},$gamePlayer:{screenX:()=>288,screenY:()=>220},SceneManager:{snap(){state.snaps++;return{destroy(){state.bitmapDisposals++;}};}},Sprite};
 const src=runtimeSource('reactor_screen_fx.js'),start=src.indexOf('    // Legacy teleport erase/show defaults'),end=src.indexOf('    // RPG Maker 2000/2003 panoramas',start);assert.ok(start>=0&&end>start);vm.runInNewContext(src.slice(start,end),box);
 return{box,state,scene:new Scene()};
}
const sunset=path.join(__dirname,'../..','template/Sunset over Imdahl');
test('Sunset imports its authored no-erase/cut-show defaults',{skip:!fs.existsSync(path.join(sunset,'RPG_RT.LDB'))&&'Sunset over Imdahl is not on disk'},()=>{
 const db=L.readDatabase(fs.readFileSync(path.join(sunset,'RPG_RT.LDB'))),tree=L.readMapTree(fs.readFileSync(path.join(sunset,'RPG_RT.LMT')));
 const out=K.systemJson({advanced:{},sounds:[]},db,tree,{});assert.deepEqual(out.rrLegacyTransitions,[20,19]);
});
test('Change Screen Transitions is preserved and saved with the game',()=>{
 const {list}=C.convertList([{code:10690,parameters:[0,16],string:'',indent:0}],{actors:{},notes:{}});assert.match(list[0].parameters[0],/rrChangeScreenTransition\(0, 16\)/);
 const{box,scene}=fixture();vm.runInNewContext(list[0].parameters[0],Object.assign(Object.create(box),box,{rrChangeScreenTransition:box.Game_Interpreter.prototype.rrChangeScreenTransition}));
 assert.equal(box.$gameSystem._rrLegacyTransitions[0],16);assert.deepEqual(JSON.parse(JSON.stringify(box.$gameSystem))._rrLegacyTransitions,[16]);
});
test('None and Cut transfers do not run MZ black fades; native projects retain their transfer path',()=>{
 const{scene,state,box}=fixture();scene.fadeOutForTransfer();assert.equal(scene._fadeDuration,0);assert.equal(scene._fadeOpacity,0);scene.fadeInForTransfer();scene.update();scene.update();assert.equal(scene._fadeDuration,1);assert.equal(scene._fadeOpacity,0);assert.equal(state.native,0);
 delete box.$dataSystem.rrLegacyTransitions;scene.fadeInForTransfer();assert.equal(state.native,1);
});
test('authored fades pause map logic for35ticks and resume once the transfer reveals the scene',()=>{
 const{scene,state}=fixture([0,0]);scene._rrStartLegacyTransfer(true,0);assert.equal(scene._fadeDuration,35);for(let i=0;i<35;i++){scene.updateMain();scene.updateFade();}assert.equal(state.updates,0);scene.updateMain();assert.equal(state.updates,1);assert.equal(scene._fadeOpacity,0);
});
test('zoom transfer crops toward the player over41ticks and disposes its frozen image',()=>{
 const{scene,state}=fixture([16,19]);scene.fadeOutForTransfer();assert.equal(state.snaps,1);let lastWidth=321;for(let i=0;i<40;i++){const z=scene._rrTransferZoom;assert.ok(z.sprite.frame.w<=lastWidth);assert.ok(z.sprite.frame.x+z.sprite.frame.w<=320);assert.ok(z.sprite.frame.y+z.sprite.frame.h<=240);lastWidth=z.sprite.frame.w;scene.updateMain();scene.updateFade();}assert.ok(lastWidth<20);assert.equal(state.updates,0);scene.updateFade();assert.ok(scene._rrTransferZoom,'last outgoing crop remains until scene replacement');assert.equal(state.bitmapDisposals,0);assert.ok(scene._rrTransferZoom.sprite.frame.w<20);scene.terminate();assert.equal(state.bitmapDisposals,1);assert.equal(state.spriteDisposals,1);
});
test('an interrupted zoom releases its snapshot when its map scene terminates',()=>{
 const{scene,state}=fixture([16,16]);scene._rrStartLegacyTransfer(true,16);assert.ok(scene._rrTransferZoom.sprite.frame.w<20);scene.terminate();assert.equal(state.bitmapDisposals,1);assert.equal(state.spriteDisposals,1);
});

test('a late plugin replacing the parent fade still reaches the legacy map wrapper',()=>{
 const{scene,box}=fixture([16,19],true);let called=0;
 Object.getPrototypeOf(box.Scene_Map.prototype).updateFade=function(){called++;this._fadeDuration--;};
 scene._rrStartLegacyTransfer(true,16);scene.updateFade();assert.equal(called,1);assert.equal(scene._fadeDuration,40);
});

test('legacy camera uses whole-tile centring so panorama and fixed roof share the authored crop',()=>{
 function Player(){}Player.prototype.centerX=()=>9.5;Player.prototype.centerY=()=>7;
 const box={Game_Player:Player,$dataSystem:{rrLegacyParallax:true},$gameMap:{screenTileX:()=>20,screenTileY:()=>15}};
 const src=runtimeSource('reactor_objects.js'),start=src.indexOf('    // The old camera centres a whole tile'),end=src.indexOf('    // 2000/2003 panning:',start);assert.ok(start>=0&&end>start);vm.runInNewContext(src.slice(start,end),box);
 const player=new Player();assert.equal(player.centerX(),9);assert.equal(player.centerY(),7);
 const displayX=20-player.centerX(),panoramaCrop=displayX*16,roofCenter=320-panoramaCrop;
 assert.equal(panoramaCrop,176,'original40tile map crop at playerX20');assert.equal(roofCenter,144,'map-fixed640px roof stays over the same ground');assert.equal((20+.5)*16-panoramaCrop,152,'original player screenX');
 box.$dataSystem.rrLegacyParallax=false;assert.equal(player.centerX(),9.5);
});

test('cut reveal holds the previous image until incoming picture requests are ready, without blocking their startup',()=>{
 const{scene,state,box}=fixture();let ready=false,requested=0;box.ImageManager.isReady=()=>ready;box.ImageManager.loadPicture=()=>requested++;box.$gameScreen._pictures=[{name:()=>"New roof"}];
 scene.fadeInForTransfer();scene.update();assert.equal(state.updates,1);assert.equal(requested,1);assert.ok(scene._rrTransferLoadGuard);
 scene.update();assert.equal(state.updates,1,'loading freezes logic only after first event batch ran');assert.ok(scene._rrTransferLoadGuard);
 ready=true;scene.update();assert.equal(scene._rrTransferLoadGuard,null);assert.equal(scene._fadeDuration,1);assert.equal(state.bitmapDisposals,1);assert.equal(state.updates,2);
});
test('a map transfer clears stale camera return speed while retaining its authored lock',()=>{
 function Map(){}Map.prototype.setup=function(id){this.id=id;};const box={Game_Map:Map,$dataSystem:{rrLegacyParallax:true}};
 const src=runtimeSource('reactor_objects.js'),start=src.indexOf('    // A transfer resets an unfinished camera return'),end=src.indexOf('    // The old camera centres',start);vm.runInNewContext(src.slice(start,end),box);
 const m=new Map();m._rrPanReturn=2;m._rrPanLocked=true;m.setup(9);assert.equal(m._rrPanReturn,0);assert.equal(m._rrPanLocked,true);assert.equal(m.id,9);
});

test('an immediate chained teleport cancels its pending incoming reveal without replacing the outgoing zoom',()=>{const{scene,state}=fixture([16,19]);scene.fadeInForTransfer();scene.update();assert.ok(scene._rrTransferLoadGuard);const original=scene.updateMain;scene.updateMain=function(){original.call(this);this.fadeOutForTransfer();};scene.update();assert.equal(scene._rrPendingTransferShow,undefined);assert.ok(scene._rrTransferZoom);assert.equal(scene._fadeDuration,41);assert.equal(scene._rrTransferLoadGuard,null);assert.equal(state.bitmapDisposals,1);scene.terminate();assert.equal(state.bitmapDisposals,2);});
