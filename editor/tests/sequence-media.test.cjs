const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const B=require('../../runtime/reactor_battle_data.js');
const read=name=>fs.readFileSync(path.join(__dirname,'../../runtime',name),'utf8');
test('room animations apply tile offsets and scale, fire authored sound cues once, pause and complete',()=>{
 const sounds=[],positions=[],scales=[];let life=0;
 const handle={get exists(){return life>0;},setLocation(...p){positions.push(p);},setScale(...s){scales.push(s);},setRotation(){},stop(){life=0;}};
 const context={_makeContextCurrent(){},update(){life=Math.max(0,life-1);},play(){life=4;return handle;}};
 const R={GpuEffects:{restoreDefault(){},draw(){return null;}},effectAnchorWorld(o,e,w){Object.assign(w,{x:10,y:20,z:30});return w;},scaleAxes:s=>[s,s,s],modelSpanTiles:()=>26};
 const scope={Reactor3D:R,effekseer:{},THREE:{},Date};vm.runInNewContext(read('reactor_battle_room.js'),scope);
 const view=Object.create(scope.ReactorBattleRoomView.prototype);Object.assign(view,{models:new Map(),effectPlays:new Map(),effectContext:{context},assets:{animation(){},effectUrl(){},playSe:se=>sounds.push(se.name)},renderer:{resetState(){}},camera:{projectionMatrix:{elements:[]},matrixWorldInverse:{elements:[]}}});
 const play={id:'cue',owner:{object:{rotation:{y:0}}},world:{},animation:{scale:50,soundTimings:[{frame:0,se:{name:'hit'}},{frame:2,se:{name:'echo'}}]},effect:{scale:2,loop:false},offset:{x:1,y:2,z:3},transient:true,age:0,quad:{mesh:{}},native:{}};
 view.effectPlays.set('cue',play);let stopped=0;view.stopEffect=()=>stopped++;
 view.updateEffects();assert.deepEqual(positions[0],[11,23,32]);assert.deepEqual(scales[0],[1,1,1]);assert.deepEqual(sounds,['hit']);
 view.effectsPaused=true;view.updateEffects();assert.equal(play.age,1);assert.deepEqual(sounds,['hit']);
 view.effectsPaused=false;view.updateEffects();view.updateEffects();assert.deepEqual(sounds,['hit','echo']);
 view.updateEffects();view.updateEffects();assert.equal(view.effectPlays.size,0);assert.equal(stopped,1);
});
test('flat animation instances own transforms and waits without mutating database records or blocking other steps',()=>{
 function Sprites() {this._animationSprites=[];}const record={scale:100};
 Sprites.prototype.createAnimation=function(request){this._animationSprites.push({_animation:record,targetObjects:request.targets,targetPosition:()=>({x:50,y:80}),isPlaying:()=>true});};
 Sprites.prototype.isAnimationPlaying=function(){return this._animationSprites.length>0;};
 const scope={ReactorBattleData:B,DataManager:{isDatabaseLoaded(){}},Spriteset_Base:Sprites};vm.runInNewContext(read('reactor_battle_presentation.js'),scope);scope.ReactorBattlePresentation.installSequenceAnimations();
 const ss=new Sprites(),ticket={pending:true,sprites:[],transform:{x:2,y:1,z:3,scale:1.5}};ss.findTargetSprite=()=>null;
 ss.createAnimation({targets:[],_reactorSequenceMedia:ticket});assert.equal(ticket.pending,false);assert.equal(ticket.sprites.length,1);assert.equal(ss.isAnimationPlaying(),false);assert.equal(record.scale,100);assert.equal(ticket.sprites[0]._animation.scale,150);assert.deepEqual({...ticket.sprites[0].targetPosition()},{x:146,y:-16});
 ss.createAnimation({targets:[]});assert.equal(ss.isAnimationPlaying(),true);assert.equal(ss._animationSprites[1]._animation,record);
});

test('room-selected prop motion queues advance at their authored speed and can repeat',()=>{
 const scope={Reactor3D:{modelRuleDuration:()=>10}};vm.runInNewContext(read('reactor_battle_room.js'),scope);
 const view=Object.create(scope.ReactorBattleRoomView.prototype),r={sequence:['Open','Close'],sequenceIndex:0,animationStart:0,animationFrame:0,animationRealFrame:0,spec:{animationSpeed:200,repeat:true},rules:[{trigger:'action',name:'Open'},{trigger:'action',name:'Close'}]};
 view.frame=0;assert.equal(view.propAction(r).name,'Open');view.frame=5;assert.equal(view.propAction(r).name,'Close');view.frame=10;assert.equal(view.propAction(r).name,'Open');r.spec.repeat=false;view.frame=15;view.propAction(r);view.frame=20;assert.equal(view.propAction(r),null);
});
test('MOG cursor uses projected room bounds and its own parent coordinates; ordinary battles retain plugin positioning',()=>{
 function Cursor(){}Cursor.prototype.posX=()=>999;Cursor.prototype.posY=()=>888;
 const ss={_reactorRoom:{},_reactorRoomSprite:{toGlobal:p=>({x:p.x+40,y:p.y+60})}};
 const scope={ReactorBattleData:B,DataManager:{isDatabaseLoaded(){}},BattleManager:{_spriteset:ss},BattleCursorSprite:Cursor,PIXI:{Point:class {constructor(x,y){this.x=x;this.y=y;}}}};vm.runInNewContext(read('reactor_battle_presentation.js'),scope);scope.ReactorBattlePresentation.installRoomAnchors();
 const c=new Cursor();Object.assign(c,{_battlerSprite:{_reactorRoomBounds:{x:100,y:120,width:80,height:200}},_align:2,parent:{toLocal:p=>({x:p.x-10,y:p.y-20})},_position:{xOffset:3,yOffset:4},_effect:{waveX:0,waveY:0},_battler:{_battleCursor:{X_Offset:1,Y_Offset:2}}});
 assert.equal(c.posX(),174);assert.equal(c.posY(),166);c._align=4;assert.equal(c.posX(),214);assert.equal(c.posY(),266);ss._reactorRoom=null;assert.equal(c.posX(),999);assert.equal(c.posY(),888);
});
function makeWaitHarness(anims=[]){
 const queue=[],animSprites=[],impacts=[],cleanups=[];
 function Sprite(){this.initialize();}
 Sprite.prototype.initialize=function(){this.x=0;this.y=0;this.opacity=255;this.rotation=0;this.visible=true;this.scale={x:1,y:1,set(x,y=x){this.x=x;this.y=y;}};this.children=[];};
 Sprite.prototype.setColorTone=function(){};Sprite.prototype.getColorTone=()=>[0,0,0,0];Sprite.prototype.setBlendColor=function(){};Sprite.prototype.getBlendColor=()=>[0,0,0,0];
 Sprite.prototype.destroy=function(){this.destroyed=true;};
 function Sprite_Battler(){this.initialize();}
 Sprite_Battler.prototype=Object.create(Sprite.prototype);Sprite_Battler.prototype.constructor=Sprite_Battler;
 Sprite_Battler.prototype.initialize=function(){Sprite.prototype.initialize.call(this);this._homeX=0;this._homeY=0;this._offsetX=0;this._offsetY=0;this._animationSprites=[];this._damages=[];};
 Sprite_Battler.prototype.isAnimationPlaying=function(){return this._animationSprites.length>0;};
 Sprite_Battler.prototype.isMoving=()=>false;Sprite_Battler.prototype.isEffecting=()=>false;Sprite_Battler.prototype.refreshMotion=()=>{};Sprite_Battler.prototype.startMotion=()=>{};
 const loadCallbacks=new Map();
 function Spriteset_Base(){}
 Spriteset_Base.prototype.createAnimation=function(request){
  const anim=scope.$dataAnimations[request.animationId];if(!anim)return;
  const eff=anim.effectName?{isError:false}:null;
  if(eff)scope.Sprite_Animation.SceneLayer.cache.set(anim.effectName,eff);
  const s={targetObjects:request.targets.slice(),_targets:request.targets.map(b=>this.findTargetSprite(b)).filter(Boolean),_animation:anim,_effect:eff,_bitmap1:anim._bitmap1||null,_bitmap2:anim._bitmap2||null,_remaining:anim._frames||10,destroyed:false,isPlaying(){return !this.destroyed&&this._remaining>0;},update(){if(this._remaining>0)this._remaining--;}};
  this._animationSprites.push(s);return s;
 };
 Spriteset_Base.prototype.isAnimationPlaying=function(){return this._animationSprites.some(s=>s.isPlaying());};
 Spriteset_Base.prototype.removeAnimation=function(s){s._remaining=0;s.destroyed=true;const i=this._animationSprites.indexOf(s);if(i>=0)this._animationSprites.splice(i,1);};
 const user={isActor:()=>true,actorId:()=>1,isEnemy:()=>false,isDead:()=>false,weapons:()=>[],attackAnimationId1:()=>1};
 const target={isActor:()=>false,enemyId:()=>11,isEnemy:()=>true,isDead:()=>target._hp<=0,_hp:100};
 const userSprite=new Sprite_Battler();userSprite._battler=user;userSprite._homeX=800;userSprite._homeY=480;userSprite.x=800;userSprite.y=480;
 const targetSprite=new Sprite_Battler();targetSprite._battler=target;targetSprite._homeX=480;targetSprite._homeY=480;targetSprite.x=480;targetSprite.y=480;
 const ss=new Spriteset_Base();ss._animationSprites=animSprites;ss._effectsContainer=new Sprite();ss._battleField=new Sprite();
 ss.findTargetSprite=b=>b===user?userSprite:b===target?targetSprite:null;
 const manager={_spriteset:ss,_subject:user,_targets:[target],_action:{item:()=>({id:1,animationId:1})},_logWindow:{_methods:[],displayActionResults(){}},invokeAction(){impacts.push(1);}};
 const scope={
  ReactorBattleData:B,Sprite,Sprite_Base:Sprite,Sprite_Battler,Spriteset_Base,Spriteset_Battle:Spriteset_Base,BattleManager:manager,
  DataManager:{isDatabaseLoaded:()=>true,isSkill:()=>true},PluginManager:{_scripts:[],registerCommand(){}},
  Window_BattleLog:function(){},Scene_Battle:function(){},SceneManager:{_scene:{_spriteset:ss}},
  Sprite_Animation:{SceneLayer:{cache:new Map(),load(name,fail){loadCallbacks.set(name,fail);}}},
  $dataAnimations:[null,...anims],
  $gameTemp:{_animationQueue:queue,requestAnimation(targets,animationId,mirror=false){queue.push({targets:targets.slice(),animationId,mirror});}},
  Date,
 };
 vm.runInNewContext(read('reactor_battle_presentation.js'),scope);scope.ReactorBattlePresentation.installSequenceAnimations();
 return {scope,ss,manager,user,target,targetSprite,queue,animSprites,impacts,loadCallbacks,pump(){while(queue.length)ss.createAnimation(queue.shift());},tickSprites(){for(const s of animSprites)s.update();}};
}
test('waitFor animation holds past mid-animation impact until sequence-owned animation completes',()=>{
 const h=makeWaitHarness([{id:1,effectName:'Pierce',_frames:40,soundTimings:[],flashTimings:[]}]);
 const seq={version:1,steps:[B.step('animation',{role:'allTargets',animationId:1,waitForCompletion:false,duration:0}),B.step('wait',{duration:10}),B.step('impact'),B.step('wait',{role:'allTargets',duration:0,waitFor:'animation'})]};
 const p=new h.scope.ReactorBattleData.Player(seq,h.scope.ReactorBattlePresentation.adapter(h.manager,h.user,[h.target]));
 let impactFrame=null,doneFrame=null;
 for(let f=0;f<80;f++){
  p.update(1);h.pump();
  if(h.impacts.length&&impactFrame===null)impactFrame=f;
  if(p.done){doneFrame=f;break;}
  h.tickSprites();
 }
 assert.equal(h.impacts.length,1);assert.equal(impactFrame,9);assert.equal(doneFrame,40);assert.equal(h.animSprites[0].isPlaying(),false);
});
test('waitFor animation terminates cleanly on cancel, missing data, Effekseer/MV load errors, and target death',()=>{
 // Cancel clears sequence wait and removes active sprite
 const c=makeWaitHarness([{id:1,effectName:'Slow',_frames:120,soundTimings:[],flashTimings:[]}]);
 const seq={version:1,steps:[B.step('animation',{role:'allTargets',animationId:1,waitForCompletion:false,duration:0}),B.step('wait',{role:'allTargets',duration:0,waitFor:'animation'}),B.step('impact')]};
 const pc=new c.scope.ReactorBattleData.Player(seq,c.scope.ReactorBattlePresentation.adapter(c.manager,c.user,[c.target]));
 pc.update(1);c.pump();assert.equal(c.animSprites.length,1);assert.equal(pc.done,false);
 pc.cancel();assert.equal(pc.done,true);assert.equal(c.animSprites.length,0);
 // Missing $dataAnimations record terminates wait without stalling
 const m=makeWaitHarness([]);
 const pm=new m.scope.ReactorBattleData.Player(seq,m.scope.ReactorBattlePresentation.adapter(m.manager,m.user,[m.target]));
 pm.update(1);m.pump();pm.update(1);assert.equal(pm.done,true);
 // Effekseer SceneLayer fail callback terminates wait immediately
 const e=makeWaitHarness([{id:1,effectName:'BrokenEff',_frames:120,soundTimings:[],flashTimings:[]}]);
 const pe=new e.scope.ReactorBattleData.Player(seq,e.scope.ReactorBattlePresentation.adapter(e.manager,e.user,[e.target]));
 pe.update(1);e.pump();assert.equal(pe.done,false);e.loadCallbacks.get('BrokenEff')();pe.update(1);assert.equal(pe.done,true);
 // MV bitmap load error terminates wait immediately
 const mv=makeWaitHarness([{id:1,frames:[[]],_bitmap1:{isError:()=>true},_frames:120,soundTimings:[],flashTimings:[]}]);
 const pmv=new mv.scope.ReactorBattleData.Player(seq,mv.scope.ReactorBattlePresentation.adapter(mv.manager,mv.user,[mv.target]));
 pmv.update(1);mv.pump();pmv.update(1);assert.equal(pmv.done,true);
 // Lethal impact: filter:'alive' stops waiting when target dies, while unfiltered waits for active impact animation then finishes
 const l1=makeWaitHarness([{id:1,effectName:'LethalEff',_frames:30,soundTimings:[],flashTimings:[]}]);
 const seqLethalFiltered={version:1,steps:[B.step('animation',{role:'allTargets',animationId:1,waitForCompletion:false,duration:0}),B.step('wait',{duration:5}),B.step('impact'),B.step('wait',{role:'allTargets',filter:'alive',duration:0,waitFor:'animation'})]};
 const ad1=l1.scope.ReactorBattlePresentation.adapter(l1.manager,l1.user,[l1.target]);
 const origInvoke=l1.manager.invokeAction;l1.manager.invokeAction=()=>{origInvoke();l1.target._hp=0;};
 const pl1=new l1.scope.ReactorBattleData.Player(seqLethalFiltered,ad1);
 let done1=null;for(let f=0;f<50;f++){pl1.update(1);l1.pump();if(pl1.done){done1=pl1.frame;break;}l1.tickSprites();}
 assert.equal(done1,5);
 const l2=makeWaitHarness([{id:1,effectName:'LethalEff',_frames:30,soundTimings:[],flashTimings:[]}]);
 const seqLethalUnfiltered={version:1,steps:[B.step('animation',{role:'allTargets',animationId:1,waitForCompletion:false,duration:0}),B.step('wait',{duration:5}),B.step('impact'),B.step('wait',{role:'allTargets',duration:0,waitFor:'animation'})]};
 l2.manager.invokeAction=()=>{l2.impacts.push(1);l2.target._hp=0;};
 const pl2=new l2.scope.ReactorBattleData.Player(seqLethalUnfiltered,l2.scope.ReactorBattlePresentation.adapter(l2.manager,l2.user,[l2.target]));
 let done2=null;for(let f=0;f<50;f++){pl2.update(1);l2.pump();if(pl2.done){done2=f;break;}l2.tickSprites();}
 assert.equal(done2,30);
});
