const test=require('node:test'),assert=require('node:assert/strict');
const B=require('../../runtime/reactor_battle_data.js');
test('starter sequences have exactly one effect cue and stable finite timing',()=>{for(const name of B.templates){const s=B.template(name);assert.deepEqual(B.validateSequence(s),[]);assert.ok(B.duration(s)>0);}});
test('sequence lookup respects explicit existing behavior and leaves absent bindings alone',()=>{
 const data=B.empty(),seq=[null,B.template()];const action={kind:'skills',itemId:1,isAttack:true,weaponIds:[4],battlerKind:'actors',battlerId:2};
 assert.equal(B.resolve(data,seq,action),null);data.weapons[4]={mode:'sequence',sequenceId:1};assert.equal(B.resolve(data,seq,action),seq[1]);
 data.skills[1]={mode:'existing'};assert.equal(B.resolve(data,seq,action),null);data.skills[1]={mode:'inherit'};assert.equal(B.resolve(data,seq,action),seq[1]);
 data.skills[1]={mode:'sequence',sequenceId:999};assert.equal(B.resolve(data,seq,action),null);
});
test('scrub is pure, playback and skip emit the impact once, cancellation never applies outstanding effects',()=>{
 const sequence=B.template(),context={homes:{user:{x:0,y:0,z:0},target:{x:8,y:0,z:0}},target:{x:8,y:0,z:0},direction:1};let impacts=0,cleanups=0;
 const snapshot=JSON.stringify(sequence);const result=B.evaluate(sequence,12,context);assert.ok(result.user.x>0&&result.user.x<8);assert.equal(JSON.stringify(sequence),snapshot);
 const adapter={context,cue:s=>{if(s.type==='impact')impacts++;},cleanup:()=>cleanups++};const player=new B.Player(sequence,adapter);player.update(5);player.skip();player.skip();assert.equal(impacts,1);assert.equal(cleanups,1);
 const cancelled=new B.Player(sequence,adapter);cancelled.cancel();cancelled.skip();assert.equal(impacts,1);assert.equal(cleanups,2);
});
test('invalid or duplicate impacts and unsupported schemas cannot be activated',()=>{const s=B.template();s.steps.push(B.step('impact'));assert.ok(B.validateSequence(s).length);assert.throws(()=>new B.Player(s,{}));assert.throws(()=>B.validateStore([null],{version:2}));});
test('room formation defaults cover new party slots and preserve legacy troop coordinates',()=>{const map={id:4,width:50,height:50},room=B.room(map);assert.equal(room.mapId,4);assert.equal(B.position(room,'actors',0).x,28.5);room.actors[0]={x:8,y:9,z:2,facing:45};assert.deepEqual(B.position(room,'actors',0),room.actors[0]);assert.equal(room.camera.x,24.5);});

test('current-target position keys affect the visible first target and leave the other targets home',()=>{
 const s=B.template();s.steps=[B.step('move',{role:'target',x:3,duration:10}),B.step('impact')];
 const context={homes:{user:{x:0,y:0,z:0},target:{x:8,y:0,z:0},target0:{x:8,y:0,z:0},target1:{x:9,y:1,z:0}}};
 const p=B.evaluate(s,10,context);assert.equal(p.target.x,11);assert.deepEqual(p.target0,p.target);assert.equal(p.target1.x,9);
});

test('battle presentation save rolls back a failed pair and recovers an interrupted transaction',()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
 const Manager=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/DatabaseManager.js'),'utf8')+'\nDatabaseManager',{require,RRJson:require('../src/utils/JsonFiles.js'),nw:{},console:{error(){}},ReactorBattleData:B});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rr-sequence-save-'));fs.mkdirSync(path.join(dir,'data'));
 try{
  const manager=new Manager();manager.data.actionSequences=[null,B.template()];manager.data.battlePresentation=B.empty();manager.data.battlePresentation.skills[1]={mode:'sequence',sequenceId:1};
  assert.equal(manager.saveBattlePresentation(dir),true);const file=path.join(dir,'data/ActionSequences.json'),bindings=path.join(dir,'data/BattlePresentation.json'),previous=fs.readFileSync(file,'utf8'),oldBindings=fs.readFileSync(bindings,'utf8');
  manager.data.actionSequences[1].name='New';const write=manager._writeFileAtomic;let failed=false;manager._writeFileAtomic=function(fs,dest,...args){if(dest===bindings&&!failed){failed=true;throw Error('disk failure');}return write.call(this,fs,dest,...args);};
  assert.equal(manager.saveBattlePresentation(dir),false);assert.equal(fs.readFileSync(file,'utf8'),previous);assert.equal(fs.readFileSync(bindings,'utf8'),oldBindings);
  fs.writeFileSync(path.join(dir,'data/.BattlePresentation.pending.json'),JSON.stringify({version:1,files:[{file:'ActionSequences.json',previous},{file:'BattlePresentation.json',previous:oldBindings}]}));fs.writeFileSync(file,'[]');manager.recoverBattlePresentation(dir);assert.equal(fs.readFileSync(file,'utf8'),previous);
  assert.equal(manager.changeMaximum('actionSequences',0,B.template()),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('newer battle schemas cannot replace a loaded working copy or be saved over',async()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
 const Manager=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/DatabaseManager.js'),'utf8')+'\nDatabaseManager',{require,RRJson:require('../src/utils/JsonFiles.js'),nw:{},console:{error(){}},ReactorBattleData:B});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rr-sequence-schema-'));fs.mkdirSync(path.join(dir,'data'));
 try{const manager=new Manager(),old=manager.data;fs.writeFileSync(path.join(dir,'data/BattlePresentation.json'),'{"version":99}');assert.equal(await manager.loadAllData(dir),false);assert.equal(manager.data,old);manager.data.battlePresentation={version:99};assert.equal(manager.saveBattlePresentation(dir),false);assert.equal(fs.readFileSync(path.join(dir,'data/BattlePresentation.json'),'utf8'),'{"version":99}');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('runtime ownership preserves the original start/resolver, spaces repeats, and cancels a forced action cleanly',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
 let costs=0,logs=0,ended=0,legacyUpdates=0;const resolved=[];
 const item={id:1},target={isActor:()=>false,enemyId:()=>1},action={item:()=>item,isAttack:()=>true};
 const subject={isActor:()=>true,actorId:()=>1,currentAction:()=>action,weapons:()=>[]};
 const sprite=(x)=>({x,y:200,_homeX:x,_homeY:200,_offsetX:0,_offsetY:0,rotation:.1,scale:{x:1,y:1,set(x,y=x){this.x=x;this.y=y;}}});
 const userSprite=sprite(100),targetSprite=sprite(400);
 function Log(){}Log.prototype.startAction=function(){logs++;};Log.prototype.displayAction=function(){};
 function Scene(){}Scene.prototype.create=function(){};Scene.prototype.isReady=()=>true;Scene.prototype.terminate=function(){};
 function Sprites(){}Sprites.prototype.update=function(){};
 const manager={_subject:subject,_spriteset:{findTargetSprite:b=>b===subject?userSprite:targetSprite},_logWindow:new Log(),startAction(){costs++;this._action=action;this._targets=[target,target];this._logWindow.startAction(subject,action,this._targets);},updateAction(){legacyUpdates++;if(this._targets.length)this.invokeAction(subject,this._targets.shift());else this.endAction();},invokeAction(a,b){resolved.push([a,b]);},endAction(){ended++;},endBattle(){},forceAction(){this.forced=true;}};
 const context={ReactorBattleData:B,DataManager:{isDatabaseLoaded:()=>true,isSkill:()=>true},BattleManager:manager,Window_BattleLog:Log,Scene_Battle:Scene,Spriteset_Battle:Sprites,PluginManager:{_scripts:[],registerCommand(){}},$dataAnimations:[null],console:{warn(){}},SceneManager:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../runtime/reactor_battle_presentation.js'),'utf8'),context);const P=context.ReactorBattlePresentation;P.install();
 manager.startAction();assert.equal(costs,1);assert.equal(logs,1);assert.equal(manager._reactorSequence,undefined);manager.updateAction();assert.equal(legacyUpdates,1);
 const seq=B.template();seq.steps=seq.steps.filter(s=>['move','impact','wait'].includes(s.type));P.sequences=[null,seq];P.settings.skills[1]={mode:'sequence',sequenceId:1};resolved.length=0;
 manager.startAction();assert.equal(costs,2);assert.equal(logs,1);let guard=500,previous=0;while(manager._reactorSequence&&guard--){manager.updateAction();assert.ok(resolved.length-previous<=1,'one resolver invocation per available battle update');previous=resolved.length;}assert.ok(guard>0);assert.equal(resolved.length,2);assert.ok(resolved.every(([a,b])=>a===subject&&b===target));assert.equal(userSprite.x,100);assert.equal(userSprite.rotation,.1);assert.equal(ended,1);
 manager.startAction();manager.updateAction();assert.notEqual(userSprite.x,100);const count=resolved.length;manager.forceAction(subject);assert.equal(manager._reactorSequence,null);assert.equal(manager._targets.length,0);assert.equal(userSprite.x,100);assert.equal(resolved.length,count);
 context.PluginManager._scripts=['VE_BattleMotions'];manager.startAction();assert.equal(manager._reactorSequence,null);assert.equal(logs,2,'an unsupported sequencer retains the existing start path');
});

test('camera inheritance uses the map presets without mutating exploration mouse look',()=>{
 const R=require('../../runtime/reactor_3d.js'),View=require('../../runtime/reactor_battle_room.js'),previous=global.Reactor3D;global.Reactor3D=R;
 try{const map={id:4,width:50,height:50,reactor3d:{mode:'3d',camera:{mode:'isometric',yaw:60}}},settings=B.room(map),view=new View(map,{},settings,{tileSize:48,screenHeight:624});view.camera={};const look=JSON.stringify(R.Camera.look),camera=view.cameraState();assert.equal(camera.yaw,60);assert.equal(camera.pitch,35.264);assert.equal(camera.fov,15);map.reactor3d.camera={mode:'thirdPerson'};settings.actors=[{x:12,y:14,z:2,facing:90}];const third=view.cameraState();assert.equal(third.x,12);assert.equal(third.y,14);assert.equal(third.z,3);assert.equal(third.yaw,90);assert.equal(third.distance,8);assert.equal(JSON.stringify(R.Camera.look),look);settings.cameraSource='custom';Object.assign(settings.camera,{mode:'fixed',pitch:42,yaw:13,fov:40,distance:25});assert.equal(view.cameraState().yaw,13);}finally{global.Reactor3D=previous;}
});

test('unarmed actors use their default, weapon attacks override it, and skill overrides remain explicit',()=>{
 const data=B.empty(),sequences=[null,B.template('Melee Strike',1),B.template('Projectile Shot',2),B.template('Cast on Target',3)];
 data.actors[1]={mode:'sequence',sequenceId:1};data.weapons[2]={mode:'sequence',sequenceId:2};
 const action={kind:'skills',itemId:1,isAttack:true,weaponIds:[],battlerKind:'actors',battlerId:1};assert.equal(B.resolve(data,sequences,action),sequences[1]);
 action.weaponIds=[2];assert.equal(B.resolve(data,sequences,action),sequences[2],'a starter provides every phase, so the weapon owns the whole action');
 // A weapon sequence that marks only some phases takes those over; the actor's sequence still supplies the rest (here the run-up).
 const partial={...sequences[2],id:4,phases:['execute'],steps:sequences[2].steps.filter(s=>s.phase==='execute')};sequences[4]=partial;data.weapons[2]={mode:'sequence',sequenceId:4};
 const armed=B.resolvePresentation(data,sequences,action);assert.equal(armed.phases.find(p=>p.phase==='execute').source.kind,'weapons');assert.equal(armed.phases.find(p=>p.phase==='movement').source.kind,'actors');assert.equal(armed.sequence.steps.filter(s=>s.type==='projectile').length,1);assert.equal(armed.sequence.steps.filter(s=>s.type==='impact').length,1);assert.ok(armed.sequence.steps.some(s=>s.phase==='movement'&&s.type==='move'),'the actor\'s run-up leads in');
 data.weapons[2]={mode:'sequence',sequenceId:2};
 data.skills[1]={mode:'sequence',sequenceId:3};assert.equal(B.resolve(data,sequences,action),sequences[3]);data.skills[1]={mode:'existing'};assert.equal(B.resolve(data,sequences,action),null);
});

test('Psychronic ATB icons use a selected 3D enemy and never request its obsolete 2D fallback',()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'rr-hud-assets-'));
 try{
  const requested=[];function Base(){}Base.prototype.initialize=function(){};
  const context={ReactorBattleData:B,DataManager:{isDatabaseLoaded:()=>true},Window_Base:Base,PluginManager:{_scripts:['PSYCHRONIC_ATB-MZ'],parameters:()=>({enemyIconBackground:'missing-background'})},Utils:{isNwjs:()=>true},require,process:{mainModule:{filename:path.join(dir,'index.html')}},ImageManager:{_imageExtensions:['.png'],loadBitmap:(folder,name)=>{requested.push(folder+name);return {addLoadListener(fn){fn();}};}},Reactor3D:{databaseModelSpec:()=>({name:'ActualModel'})},$dataEnemies:[null,{note:'',battlerName:'MissingOldBattler'}],console:{warn(){}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../runtime/reactor_battle_presentation.js'),'utf8'),context);context.ReactorBattlePresentation.installPsychronicHud();
  const hud={loadBattlerIcon(){requested.push('obsolete');},loadBackgroundIcon(){requested.push('missing-background');},setEnemySpriteFrame(){},loadFallbackIcon(){}};Base.prototype.initialize.call(hud);
  const enemy={isActor:()=>false,enemyId:()=>1},sprite={update(){}};hud.loadBattlerIcon(enemy,sprite);hud.loadBackgroundIcon(enemy,sprite);assert.deepEqual(requested,[]);assert.equal(sprite.visible,false);
  context.PIXI={groupD8:{MIRROR_VERTICAL:8}};const bitmap={isReady:()=>true,width:192,height:192,baseTexture:{source:{__reactorExternal:true}}},source={_reactorBattler:{bitmap},texture:{rotate:8}};context.SceneManager={_scene:{_spriteset:{findTargetSprite:()=>source}}};
  sprite.scale={set(){}};sprite.texture={rotate:0,updateUvs(){this.updated=true;}};sprite.setFrame=()=>{sprite.texture.rotate=0;};sprite.update();assert.equal(sprite.bitmap,bitmap);assert.equal(sprite.texture.rotate,8);assert.equal(sprite.texture.updated,true);
  bitmap.baseTexture.source.__reactorExternal=false;sprite.update();assert.equal(sprite.texture.rotate,0,'canvas fallback restores ordinary texture orientation');

 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('normal and mirrored preview formations face their opponent and model yaw uses radians',()=>{
 const R=require('../../runtime/reactor_3d.js'),View=require('../../runtime/reactor_battle_room.js'),previous=global.Reactor3D;global.Reactor3D=R;
 try{for(const [from,to,expected] of [[{x:3,y:5},{x:11,y:5},90],[{x:11,y:5},{x:3,y:5},-90]]){
  assert.equal(B.facingToward(from,to),expected);const view=new View({}, {}, {}, {}),object={position:{set(){}},scale:{set(){}},rotation:{set(x,y,z){Object.assign(this,{x,y,z});}}};view.models.set('battler',{object,spec:{},scale:1});view.place('battler',{...from,z:0,facing:B.facingToward(from,to)});assert.equal(object.rotation.y,expected*Math.PI/180);
 }const room=B.room({id:1,width:20,height:20});assert.equal(B.position(room,'actors',0).facing,-90);assert.equal(B.position(room,'enemies',0).facing,90);}finally{global.Reactor3D=previous;}
});

test('loading battler frames cannot allocate a zero-size room texture',()=>{
 const View=require('../../runtime/reactor_battle_room.js'),view=new View({}, {}, {}, {});
 const existing={object:{visible:true}};view.billboards.set('loading',existing);
 for(const [width,height] of [[1/9,1/6],[0,48],[-1,48],[NaN,48],[48,Infinity]]){
  view.billboard('new',{}, {x:0,y:0,width,height},{x:0,y:0});
  view.billboard('loading',{}, {x:0,y:0,width,height},{x:0,y:0});
  assert.equal(view.billboards.has('new'),false);assert.equal(existing.object.visible,false);
 }
});

test('database party limits override known plugin defaults without changing legacy projects',()=>{
 const plugins=[{name:'MOG_BattleHud',status:true,parameters:{'Max Battle Members':'6'}},{name:'PSYCHRONIC_PartySystemMZ',status:true,parameters:{maxBattleMembers:'7'}}];
 assert.equal(B.maxBattleMembers({},plugins),7);assert.equal(B.maxBattleMembers({maxBattleMembers:5},plugins),5);
 assert.equal(B.maxBattleMembers({},[]),4);plugins[1].status=false;assert.equal(B.maxBattleMembers({},plugins),6);
 for(const value of [0,100,3.5,null,'7',NaN])assert.equal(B.configuredBattleMembers({maxBattleMembers:value}),null);
 assert.equal(B.maxBattleMembers({maxBattleMembers:1},plugins),1);
});

test('party runtime keeps plugin behavior unless the database opts in and preserves scripted changes',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
 function Party(){}Party.prototype.maxBattleMembers=function(){return this._legacyLimit||7;};Party.prototype.setMaxBattleMembers=function(n){this._legacyLimit=n;};
 const context={ReactorBattleData:B,Game_Party:Party,$dataSystem:{},DataManager:{isDatabaseLoaded:()=>true},console};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../runtime/reactor_battle_presentation.js'),'utf8'),context);
 context.ReactorBattlePresentation.installPartyLimit();const party=new Party();assert.equal(party.maxBattleMembers(),7);
 context.$dataSystem.maxBattleMembers=5;assert.equal(party.maxBattleMembers(),5);party.setMaxBattleMembers(6);assert.equal(party.maxBattleMembers(),6);
 const loaded=Object.assign(new Party(),JSON.parse(JSON.stringify(party)));assert.equal(loaded.maxBattleMembers(),6);
 delete context.$dataSystem.maxBattleMembers;assert.equal(party.maxBattleMembers(),6);assert.equal(new Party().maxBattleMembers(),7);
});

test('marker dragging freezes the camera ray and release eases back without overshoot',()=>{
 const View=require('../../runtime/reactor_battle_room.js'),view=new View({}, {}, {}, {});
 const home={mode:'thirdPerson',x:0,y:0,z:1,yaw:170};view.effectiveCamera={...home};view.cameraFollowFrozen=true;
 const moved={...home,x:8,y:5,yaw:-170};assert.deepEqual(view.followCamera(moved),home);
 view.cameraFollowFrozen=false;view.cameraFollowResume=true;let previous=0;
 for(let frame=0;frame<100;frame++){view.effectiveCamera=view.followCamera(moved);assert.ok(view.effectiveCamera.x>=previous);assert.ok(view.effectiveCamera.x<=8);previous=view.effectiveCamera.x;}
 assert.equal(view.effectiveCamera.x,8);assert.equal(view.cameraFollowResume,false);
 // Runtime follow remains exact outside an editor drag.
 assert.deepEqual(view.followCamera({...moved,x:20}),{...moved,x:20});
});

test('room battlebacks keep valid empty bitmaps without requesting files, and ordinary battles retain their loaders',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),requests=[];
 const context={ReactorBattleData:B,DataManager:{isDatabaseLoaded:()=>true},SceneManager:{_scene:{}},Bitmap:class{constructor(w,h){this.width=w;this.height=h;}},ImageManager:{loadBattleback1(name){requests.push(['lower',name]);return name;},loadBattleback2(name){requests.push(['upper',name]);return name;}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../runtime/reactor_battle_presentation.js'),'utf8'),context);const P=context.ReactorBattlePresentation;P.installBattlebackLoading();
 P._creatingBattleRoom=true;
 assert.equal(context.ImageManager.loadBattleback1('missing-lower').width,1);assert.equal(context.ImageManager.loadBattleback2('missing-upper').height,1);assert.deepEqual(requests,[]);
 P._creatingBattleRoom=false;context.SceneManager._scene._reactorUsesBattleRoom=true;assert.equal(context.ImageManager.loadBattleback1('late-plugin-request').width,1);assert.deepEqual(requests,[]);
 context.SceneManager._scene={};assert.equal(context.ImageManager.loadBattleback1('Forest'),'Forest');assert.equal(context.ImageManager.loadBattleback2('Mountains'),'Mountains');assert.deepEqual(requests,[['lower','Forest'],['upper','Mountains']]);
});

test('room props preserve map directions and degree rotations without applying their scale twice',()=>{
 const R=require('../../runtime/reactor_3d.js'),View=require('../../runtime/reactor_battle_room.js'),previous=global.Reactor3D;global.Reactor3D=R;
 try {
  for(const [direction,turn] of [[2,0],[4,-Math.PI/2],[6,Math.PI/2],[8,Math.PI]]) {
   const prop={name:'Computer',x:20,y:23,z:1,direction,yaw:30,pitch:15,roll:-20,size:3,scale:1.5};
   const object={position:{set(x,y,z){Object.assign(this,{x,y,z});}},scale:{set(x,y,z){Object.assign(this,{x,y,z});}},rotation:{set(x,y,z){Object.assign(this,{x,y,z});}}};
   const view=new View({}, {}, {}, {});view.models.set('prop:1',{spec:prop,scale:2.25,object});view.place('prop:1',prop);
   assert.ok(Math.abs(object.rotation.y-(turn+Math.PI/6))<1e-12);
   assert.equal(object.rotation.x,Math.PI/12);assert.equal(object.rotation.z,-20*Math.PI/180);
   assert.deepEqual([object.scale.x,object.scale.y,object.scale.z],[2.25,2.25,2.25]);
   assert.deepEqual([object.position.x,object.position.y,object.position.z],[20.5,1,23.5]);
  }
 }finally{global.Reactor3D=previous;}
});

test('unarmed assignment applies only to an unequipped normal attack and stays reference-protected',()=>{
 const settings=B.empty(),sequences=[null,B.template('Unarmed Punch')];settings.actors[1]={mode:'inherit',unarmed:{mode:'sequence',sequenceId:1}};
 const request={kind:'skills',itemId:1,isAttack:true,weaponIds:[],battlerKind:'actors',battlerId:1};
 assert.equal(B.resolve(settings,sequences,request),sequences[1]);assert.equal(B.resolve(settings,sequences,{...request,weaponIds:[2]}),null);assert.equal(B.resolve(settings,sequences,{...request,isAttack:false,itemId:9}),null);
 settings.skills[1]={mode:'existing'};assert.equal(B.resolve(settings,sequences,request),null);assert.deepEqual(B.references(settings,1),[{kind:'actors',id:1,slot:'unarmed'}]);
});
test('unarmed punch approaches diagonal and mirrored targets, strikes once, and returns to its original facing',()=>{
 const sequence=B.template('Unarmed Punch');assert.deepEqual(B.validateSequence(sequence),[]);
 for(const target of [{x:10,y:8,z:0},{x:-10,y:8,z:0},{x:0,y:10,z:0}]) {
  const home={x:0,y:0,z:0,facing:90},context={homes:{user:home,target},target,direction:target.x<0?-1:1};
  const near=B.evaluate(sequence,30,context).user;assert.ok(Math.abs(Math.hypot(near.x-target.x,near.y-target.y)-1.2)<1e-9);assert.equal(near.facing,B.facingToward(home,target));
  let hits=0,hitPosition;const player=new B.Player(sequence,{context,cue:step=>{if(step.type==='impact'){hits++;hitPosition=B.evaluate(sequence,46,context).user;}},pose(){}});
  while(!player.done)player.update();assert.equal(hits,1);assert.deepEqual(hitPosition,near);
  const end=B.evaluate(sequence,B.duration(sequence),context).user;assert.equal(end.x,home.x);assert.equal(end.y,home.y);assert.equal(end.facing,home.facing);
 }
});

test('facing keys persist across moves for legacy battlers without saved facing',()=>{
 const sequence={steps:[B.step('move',{x:2,face:'movement',duration:10}),B.step('move',{x:3,duration:10}),B.step('impact')]};
 const context={homes:{user:{x:0,y:0,z:0},target:{x:8,y:0,z:0}}};
 assert.equal(B.evaluate(sequence,20,context).user.facing,90);
});

test('motion transforms layer over movement, scrub deterministically and reset with the next motion',()=>{
 const sequence={version:1,steps:[B.step('move',{x:4,duration:10}),B.step('motion',{duration:10,transform:{x:2,z:1,rotateY:90,scale:2,scaleX:.5,scaleY:1.5,scaleZ:.8}}),B.step('wait',{duration:10}),B.step('motion',{duration:0,motion:'idle'}),B.step('impact')]};
 const context={homes:{user:{x:1,y:2,z:0},target:{x:9,y:2,z:0}}},before=JSON.stringify(sequence);
 assert.deepEqual(B.validateSequence(sequence),[]);
 const logical=B.evaluate(sequence,20,context).user,visual=B.visualPose(logical);assert.equal(logical.x,5);assert.equal(visual.x,7);assert.equal(visual.z,1);assert.equal(visual.rotateY,90);assert.equal(visual.scale,2);assert.equal(visual.scaleX,.5);assert.equal(visual.scaleY,1.5);assert.equal(visual.scaleZ,.8);
 assert.equal(B.visualPose(B.evaluate(sequence,15,context).user).x,6);assert.deepEqual(B.visualPose(B.evaluate(sequence,20,context).user),visual);assert.equal(B.visualPose(B.evaluate(sequence,30,context).user).x,5);assert.equal(JSON.stringify(sequence),before);
 sequence.steps[1].transform.scaleY=0;assert.ok(B.validateSequence(sequence).length);
});
test('numbered target motion and movement leave other targets untouched and tolerate absent target slots',()=>{
 const sequence={version:1,steps:[B.step('move',{role:'target',targetIndex:1,x:2,duration:10}),B.step('motion',{role:'target',targetIndex:1,duration:0,transform:{z:1,rotateX:30}}),B.step('impact')]};
 const homes={user:{x:0,y:0,z:0},target:{x:5,y:0,z:0},target0:{x:5,y:0,z:0},target1:{x:5,y:2,z:0}};
 const result=B.evaluate(sequence,10,{homes});assert.deepEqual(result.target0,homes.target0);assert.deepEqual(result.target,homes.target);assert.equal(B.visualPose(result.target1).x,7);assert.equal(B.visualPose(result.target1).z,1);
 delete homes.target1;assert.doesNotThrow(()=>B.evaluate(sequence,10,{homes}));
});

test('runtime motion transforms restore room proportions and numbered targets ignore repeated hit occurrences',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
 const context={ReactorBattleData:B,DataManager:{isDatabaseLoaded(){return true;}}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../runtime/reactor_battle_presentation.js'),'utf8'),context);
 const subject={},a={},b={},make=(x,y)=>({x:x*48,y:y*48,scale:{x:1,y:1,set(){}},_reactorRoomPosition:{x,y,z:0,facing:-90},startMotion(name){this.motion=name;}}),actor=make(1,2),enemyA=make(8,2),enemyB=make(8,4),sprites=new Map([[subject,actor],[a,enemyA],[b,enemyB]]),room={settings:{camera:{x:0,y:0,z:0}},models:new Map(),remove(){}};
 const manager={_spriteset:{_reactorRoom:room,findTargetSprite:b=>sprites.get(b)},_targets:[a,a,b]};const adapter=context.ReactorBattlePresentation.adapter(manager,subject,[a,a,b]);
 assert.equal(adapter.context.homes.target1.y,4);assert.equal(adapter.context.homes.target2,undefined);
 adapter.cue({type:'motion',role:'target',targetIndex:1,motion:'punch'});assert.equal(enemyB.motion,'thrust');assert.equal(enemyA.motion,undefined);
 adapter.pose({user:{x:1,y:2,z:0,transform:{x:2,scaleY:1.5,scaleZ:2}}},1);assert.equal(actor._reactorRoomPosition.x,3);assert.equal(actor._reactorRoomPosition.scaleY,1.5);
 adapter.cleanup();assert.equal(actor._reactorRoomPosition.x,1);assert.equal(actor._reactorRoomPosition.scaleY,undefined);assert.equal(actor._reactorRoomPosition.scaleZ,undefined);
});

test('cinematic camera eases between sweeping actor/group shots and the saved overview',()=>{
 const R=require('../../runtime/reactor_3d.js'),View=require('../../runtime/reactor_battle_room.js'),previousR=global.Reactor3D,previousB=global.ReactorBattleData;global.Reactor3D=R;global.ReactorBattleData=B;
 try{
  const settings=B.room({id:1,width:50,height:50});settings.cameraSource='custom';settings.camera.mode='cinematic';settings.camera.fov=40;
  const view=new View({reactor3d:{camera:{mode:'isometric'}}},{},settings,{});view.camera={isOrthographicCamera:false};view.width=960;view.height=540;
  view.models.set('user',{position:{x:30,y:20,z:0},spec:{size:2}});view.models.set('target0',{position:{x:20,y:18,z:0},spec:{size:2}});view.models.set('target1',{position:{x:20,y:22,z:0},spec:{size:2}});
  const saved=JSON.stringify(settings),overview=view.cameraState();view.beginCinematicAction('user',['target0','target0','target1']);assert.deepEqual(view.cameraState(),overview,'Action start does not jump');assert.equal(view.cinematicShot.targets.length,2);
  view.frame=15;const halfway=view.cameraState();assert.ok(halfway.x>Math.min(overview.x,30)&&halfway.x<Math.max(overview.x,30));assert.deepEqual(view.cameraState(),halfway,'Reading the camera does not advance time');
  const settle=to=>{let c;for(let f=view.frame;f<=to;f++){view.frame=f;c=view.cameraState();}return c;};
  const actor=settle(90);assert.ok(Math.abs(actor.x-30)<.05,'the actor shot settles on the user: '+actor.x);const sweep=settle(130);assert.ok(sweep.yaw>actor.yaw&&sweep.yaw-actor.yaw<6,'the sweep keeps turning: '+(sweep.yaw-actor.yaw));
  view.cinematicImpact();assert.deepEqual(view.cameraState(),sweep,'Impact starts at the current shot');const impactHalf=settle(view.frame+16);assert.ok(impactHalf.x>20&&impactHalf.x<30,'half way to the targets: '+impactHalf.x);const start=view.cinematicShot.start;view.cinematicImpact();assert.equal(view.cinematicShot.start,start,'Repeated hits do not restart the transition');
  const impact=settle(view.frame+120);assert.ok(Math.abs(impact.x-20)<.05&&Math.abs(impact.y-20)<.05,'the impact shot settles on the targets: '+impact.x+','+impact.y);assert.notEqual(actor.yaw,impact.yaw);
  view.endCinematicAction();assert.deepEqual(view.cameraState(),impact,'Return starts at the current shot');const mid=settle(view.frame+20);assert.notDeepEqual(mid,overview);view.endCinematicAction();const back=settle(view.frame+60);assert.deepEqual(back,overview,'Returns exactly to the saved overview');assert.equal(JSON.stringify(settings),saved);
  view.beginCinematicAction('user',['target0']);view.frame+=10;settings.camera.mode='fixed';assert.deepEqual(view.cameraState(),overview,'Manual camera bypasses the cinematic transition');
  settings.cameraSource='map';const inherited=view.cameraState();view.beginCinematicAction('user',['target0']);assert.equal(view.cinematicShot,null);assert.deepEqual(view.cameraState(),inherited);
  // Shortest-arc interpolation near the wrap point avoids a full revolution.
  view.cinematicTransition={from:{...overview,yaw:179},start:0,duration:30};view.frame=15;assert.equal(view.cinematicBlend({...overview,yaw:-179}).yaw,180);
 }finally{global.Reactor3D=previousR;global.ReactorBattleData=previousB;}
});

test('media cues default to concurrent playback while saved frame waits remain intact',()=>{
 for(const type of ['sound','animation']){assert.equal(B.step(type).duration,0);assert.equal(B.step(type,{duration:20}).duration,20);}
 const seq={version:1,steps:[B.step('sound'),B.step('impact')]};let hits=0;
 const p=new B.Player(seq,{context:{homes:{}},cue:s=>s.type==='impact'?hits++:{isPlaying:()=>true}});p.update();assert.equal(hits,1);assert.equal(p.done,true);
});
test('completion waits hold later same-frame cues and pose until the owned media finishes',()=>{
 let active=true,hits=0;const sequence={version:1,steps:[B.step('sound',{waitForCompletion:true,duration:3}),B.step('motion',{duration:0,transform:{x:2}}),B.step('impact')]};
 let pose;const p=new B.Player(sequence,{context:{homes:{user:{x:0,y:0,z:0}}},cue:s=>s.type==='sound'?{isPlaying:()=>active}:s.type==='impact'?hits++:null,pose:v=>pose=v});
 // The clock keeps counting while the sound plays (a concurrent move would keep travelling), but the cues behind the sound wait for it: they shift by the frames it held.
 p.update(10);assert.equal(p.frame,0);assert.equal(hits,0);assert.equal(pose.user.transform,undefined);p.update(10);assert.equal(p.frame,0);assert.equal(p.held,10,'the update that starts the wait counts nothing; the next holds ten frames');
 active=false;p.update(1);assert.equal(p.frame,11);assert.equal(hits,0);assert.equal(p.duration,13);p.update(2);assert.equal(hits,1);assert.equal(pose.user.transform.x,2);p.update(10);assert.equal(hits,1);
});
test('skip crosses blocking zero-duration media once; cancellation never emits its pending impact',()=>{
 const sequence={version:1,steps:[B.step('animation',{waitForCompletion:true}),B.step('sound',{waitForCompletion:true}),B.step('impact')]};
 let hits=0,cancelled;const adapter={context:{homes:{}},cue:s=>s.type==='impact'?hits++:{isPlaying:()=>true},cleanup:value=>cancelled=value};
 const p=new B.Player(sequence,adapter);p.update();p.skip();p.skip();assert.equal(hits,1);assert.equal(cancelled,false);
 const q=new B.Player(sequence,adapter);q.update();q.cancel();q.skip();assert.equal(hits,1);assert.equal(cancelled,true);
});
test('animation transform and completion fields validate without changing old sequence schemas',()=>{
 const s=B.template();s.steps.push(B.step('animation',{animationTransform:{x:1,y:-2,z:.5,scale:2},waitForCompletion:true}));assert.deepEqual(B.validateSequence(s),[]);
 s.steps.at(-1).animationTransform.scale=0;assert.ok(B.validateSequence(s).length);s.steps.at(-1).animationTransform={x:Infinity};assert.ok(B.validateSequence(s).length);
});

test('the stock input side-step is left to sprite-sheet actors with no authored states',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
 let stepped=0;function Actor(){}Actor.prototype.updateTargetPosition=function(){stepped++;};Actor.prototype.setupWeaponAnimation=function(){};
 const context={ReactorBattleData:B,DataManager:{isDatabaseLoaded:()=>true},BattleManager:{},Window_BattleLog:function(){},Scene_Battle:function(){},Spriteset_Battle:function(){},PluginManager:{_scripts:[],registerCommand(){}},Sprite_Actor:Actor,$dataAnimations:[null],console:{warn(){}},SceneManager:{}};
 for(const k of ['Window_BattleLog','Scene_Battle','Spriteset_Battle'])context[k].prototype={};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../runtime/reactor_battle_presentation.js'),'utf8'),context);const P=context.ReactorBattlePresentation;P.install();
 P.settings=B.empty();P.sequences=[null,{id:1,version:1,purpose:'motion',name:'input',steps:[B.step('motion',{motion:'walk',duration:0})]}];
 const actor=id=>({isActor:()=>true,actorId:()=>id,currentClass:()=>({id:1}),states:()=>[],battlerName:'Actor1'});
 const sprite=id=>Object.assign(new Actor(),{_actor:actor(id)});
 sprite(1).updateTargetPosition();assert.equal(stepped,1,'a plain sprite-sheet actor still steps');
 P.settings.actors[2]={graphic:{mode:'character',name:'$Hero',index:0}};sprite(2).updateTargetPosition();assert.equal(stepped,1,'a character-sheet actor is placed by its sequences');
 P.settings.actors[3]={states:{input:{mode:'sequence',sequenceId:1}}};sprite(3).updateTargetPosition();assert.equal(stepped,1,'an authored input state owns the input pose');
 P.settings.classes[1]={states:{input:{mode:'sequence',sequenceId:1}}};sprite(4).updateTargetPosition();assert.equal(stepped,1,'through the class as well');
});


test('a room model wears its sprite\'s opacity, blend colour and collapse, and goes once a dead enemy has collapsed',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
 const context={ReactorBattleData:B,DataManager:{isDatabaseLoaded(){return true;}},THREE:{AdditiveBlending:2,NormalBlending:1}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../runtime/reactor_battle_presentation.js'),'utf8'),context);
 const P=context.ReactorBattlePresentation;
 const material={opacity:.8,transparent:false,blending:1,userData:{}},mesh={material,children:[]},object={visible:true,children:[mesh],traverse(fn){fn(this);fn(mesh);}};
 const battler={isAppeared:()=>true,isDead:()=>false},sprite={opacity:255,visible:true,blendMode:0,getBlendColor:()=>[255,255,255,128]};
 P.mirrorSpriteLook(sprite,battler,{object});
 assert.equal(object.visible,true);assert.equal(material.opacity,.8,'full sprite opacity keeps the material\'s own');
 assert.deepEqual({...material.userData.rrBlend.value},{x:1,y:1,z:1,w:128/255},'a white half flash reaches the shader');
 // Collapse: red additive, fading.
 sprite.blendMode=1;sprite.opacity=64;sprite._effectType='collapse';sprite.getBlendColor=()=>[255,128,128,128];battler.isDead=()=>true;
 P.mirrorSpriteLook(sprite,battler,{object});
 assert.equal(object.visible,true,'still there while collapsing');assert.equal(material.blending,2,'additive while collapsing');assert.ok(Math.abs(material.opacity-.8*64/255)<1e-9);assert.equal(material.transparent,true);
 // Collapsed: the engine leaves a few points of opacity; the model is gone.
 sprite._effectType=null;sprite.opacity=7;
 P.mirrorSpriteLook(sprite,battler,{object});
 assert.equal(object.visible,false,'a collapsed enemy\'s model is hidden');
 // Alive again at full opacity: back to normal.
 battler.isDead=()=>false;sprite.opacity=255;sprite.blendMode=0;sprite.getBlendColor=()=>[0,0,0,0];
 P.mirrorSpriteLook(sprite,battler,{object});
 assert.equal(object.visible,true);assert.equal(material.blending,1);assert.equal(material.userData.rrBlend.value.w,0);
});


test('a boss collapse on a room battler lasts the model\'s screen height in frames, not the placeholder bitmap\'s one pixel',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
 function Enemy(){this.bitmap={height:1};}Enemy.prototype.startBossCollapse=function(){this._effectDuration=this.bitmap.height;this._appeared=false;};Enemy.prototype.updatePosition=function(){};
 Enemy.prototype.startParticleCollapse=function(preset){this._particlePreset=preset;this._effectDuration=180;};Enemy.prototype.startCollapse=function(){this._effectDuration=32;this._appeared=false;};
 const context={ReactorBattleData:B,DataManager:{isDatabaseLoaded(){return true;}},Sprite_Enemy:Enemy,Scene_Battle:{prototype:{}},Spriteset_Battle:{prototype:{}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../runtime/reactor_battle_presentation.js'),'utf8'),context);
 try{context.ReactorBattlePresentation.installRoomAnchors();}catch(error){/* the rest of the installer wants a fuller scene; the collapse wrap is first */}
 const flat=new Enemy();flat.startBossCollapse();assert.equal(flat._effectDuration,1,'a flat battle keeps the engine\'s rule');
 const room=new Enemy();room._reactorRoomKey='enemy:0';room._reactorRoomBounds={x:0,y:0,width:120,height:310};room.startBossCollapse();assert.equal(room._effectDuration,310);
 const small=new Enemy();small._reactorRoomKey='enemy:1';small._reactorRoomBounds={x:0,y:0,width:10,height:12};small.startBossCollapse();assert.equal(small._effectDuration,48,'never shorter than the normal collapse and a half');
 // Ash and Ember shred the sprite's bitmap; a room model takes the standard fade instead.
 const ashFlat=new Enemy();ashFlat._effectType='ashCollapse';ashFlat.startParticleCollapse('ash');assert.equal(ashFlat._particlePreset,'ash','a flat battle dissolves the sprite');
 const ashRoom=new Enemy();ashRoom._reactorRoomKey='enemy:2';ashRoom._effectType='emberCollapse';ashRoom.startParticleCollapse('ember');assert.equal(ashRoom._particlePreset,undefined,'a room battler never shreds its stand-in');assert.equal(ashRoom._effectType,'collapse');assert.equal(ashRoom._effectDuration,32);
});


test('the battle room asks for every model a sequence may throw or a party member holds before the fight',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
 const asked=[];
 const context={ReactorBattleData:B,DataManager:{isDatabaseLoaded(){return true;}},Reactor3D:{loadModel:(name,ext,file)=>{asked.push(name+ext);return Promise.resolve(null);},normalizeModelSpec:s=>({...s}),databaseModelSpec:(kind,id)=>kind==='weapons'&&id===49?{name:'Weapons/Pistol',ext:'.glb',file:'pistol'}:kind==='skills'&&id===7?{name:'Skills/Orb',ext:'.glb',file:'orb'}:null},
  $gameParty:{battleMembers:()=>[{weapons:()=>[{id:49},{id:1}],skills:()=>[{id:7},{id:8}]}],items:()=>[]}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../runtime/reactor_battle_presentation.js'),'utf8'),context);
 const P=context.ReactorBattlePresentation;
 P.sequences=[null,{id:1,version:1,name:'Shot',steps:[B.step('projectile',{iconSource:'model',model:{name:'Animations/Black Hole',ext:'.glb',file:'black hole'}}),B.step('projectile',{iconSource:'model',model:{name:'Animations/Black Hole',ext:'.glb',file:'black hole'}}),B.step('weapon',{iconSource:'icon'})]}];
 P.preloadBattleModels();
 assert.deepEqual(asked.sort(),['Animations/Black Hole.glb','Skills/Orb.glb','Weapons/Pistol.glb'],'each model once: the thrown one, the party weapon, the known skill');
});

test('BattlePresentation.json "startMessages": false skips the emerge and preemptive lines',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');let shown=0;
 const context={ReactorBattleData:B,DataManager:{isDatabaseLoaded:()=>true},BattleManager:{displayStartMessages(){shown++;}},Window_BattleLog:function(){},Scene_Battle:function(){},Spriteset_Battle:function(){},PluginManager:{_scripts:[],registerCommand(){}},$dataAnimations:[null],console:{warn(){}},SceneManager:{}};
 for(const k of ['Window_BattleLog','Scene_Battle','Spriteset_Battle'])context[k].prototype={};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../runtime/reactor_battle_presentation.js'),'utf8'),context);const P=context.ReactorBattlePresentation;P.install();
 P.settings=B.empty();context.BattleManager.displayStartMessages();assert.equal(shown,1,'on by default');
 P.settings.startMessages=false;context.BattleManager.displayStartMessages();assert.equal(shown,1,'off when the project says so');
 delete P.settings.startMessages;context.BattleManager.displayStartMessages();assert.equal(shown,2);
});

test('a told cinematic focus frames the weighted centre of the action and glides after it, then lapses',()=>{
 const R=require('../../runtime/reactor_3d.js'),View=require('../../runtime/reactor_battle_room.js'),previousR=global.Reactor3D,previousB=global.ReactorBattleData;global.Reactor3D=R;global.ReactorBattleData=B;
 try{
  const settings=B.room({id:1,width:50,height:50});settings.cameraSource='custom';settings.camera.mode='cinematic';settings.camera.fov=40;
  const view=new View({reactor3d:{camera:{mode:'isometric'}}},{},settings,{});view.camera={isOrthographicCamera:false};view.width=960;view.height=540;
  view.models.set('user',{position:{x:30,y:20,z:0},spec:{size:2}});view.models.set('target0',{position:{x:10,y:20,z:0},spec:{size:2}});
  const settle=to=>{let c;for(let f=view.frame+1;f<=to;f++){view.frame=f;c=view.cameraState();}return c;};
  view.beginCinematicAction('user',['target0']);const actor=settle(140);assert.ok(Math.abs(actor.x-30)<.05,'without a report the actor shot frames the user: '+actor.x);
  const report=()=>view.setCinematicFocus([{x:24,y:20,z:1,weight:2,height:1},{x:10,y:20,key:'target0',weight:1}],{yawOffset:35});report();view.frame++;
  const first=view.cameraState();assert.ok(first.x<actor.x&&first.x>(24*2+10)/3,'the first report starts the glide toward the focus: '+first.x);assert.deepEqual(view.cameraState(),first,'one step per frame');
  let held;for(let i=0;i<120;i++){report();view.frame++;held=view.cameraState();}
  assert.ok(Math.abs(held.x-(24*2+10)/3)<.05,'a held report is reached: '+held.x);assert.ok(Math.abs(held.yaw-(actor.yaw-45+35))<6,'the told yaw offset replaces the actor shot offset (the slow sweep adds a few degrees): '+held.yaw+' vs '+actor.yaw);
  assert.ok(held.distance>actor.distance,'the shot widens to keep the target in frame');
  view.setCinematicFocus([{x:14,y:20,z:1,weight:2,height:1},{x:10,y:20,key:'target0',weight:1}],{yawOffset:35});view.frame++;
  const second=view.cameraState();assert.ok(second.x<held.x&&second.x>(14*2+10)/3,'the camera glides toward the moved focus rather than jumping: '+second.x);
  const lapsed=settle(view.frame+150);assert.ok(Math.abs(lapsed.x-30)<.05,'a report older than its hold lapses back to the actor shot: '+lapsed.x);
  view.setCinematicFocus([],{});assert.equal(view.cinematicShot.focus,null);
  // The eye stays inside the room: clamped near a wall, free in the middle, and under the ceiling when it looks down.
  view.map.width=50;view.map.height=50;view.map.reactor3d.room={height:25};
  assert.equal(view.distanceInsideRoom({x:47,y:47,z:1,yaw:-45,pitch:20,distance:30}),3,'a shot in a corner cannot stand back through the wall');
  assert.equal(view.distanceInsideRoom({x:25,y:25,z:1,yaw:-45,pitch:20,distance:30}),30,'room to stand back in the middle');
  assert.ok(Math.abs(view.distanceInsideRoom({x:25,y:25,z:1,yaw:0,pitch:89,distance:60})-23.5)<.1,'a near-vertical shot stops under the ceiling');
  view.endCinematicAction();assert.equal(view.cinematicTrack,null);
 }finally{global.Reactor3D=previousR;global.ReactorBattleData=previousB;}
});

test('a room tells how far a carved part must turn to face a point, from the part pivots in the model frame',()=>{
 const path=require('node:path'),R=require('../../runtime/reactor_3d.js'),View=require('../../runtime/reactor_battle_room.js'),previousR=global.Reactor3D,previousB=global.ReactorBattleData;global.Reactor3D=R;global.ReactorBattleData=B;global.self=global;global.window=global;require(path.join(__dirname,'../../runtime/libs/three.js'));const THREE=global.THREE;
 try{
  const settings=B.room({id:1,width:50,height:50});const view=new View({reactor3d:{}},{},settings,{});
  const object=new THREE.Group(),root=new THREE.Group();object.add(root);object.position.set(10.5,0,10.5);object.updateMatrixWorld(true);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());root.add(mesh);
  // The gun sits +x of the turret pivot: the turret rests pointing east.
  const binding={root,meshes:[{mesh,parts:[{name:'Gun',pivot:[2,1,0]},{name:'Turret',pivot:[0,1,0]}],baseQuaternion:new THREE.Quaternion()}]};
  view.models.set('t',{object,binding,position:{x:10,y:10,z:0},rules:[]});
  assert.ok(Math.abs(view.aimTurn('t','Turret',{x:20,y:10}))<1e-6,'a target due east needs no turn');
  assert.ok(Math.abs(view.aimTurn('t','Turret',{x:10,y:20})-(-90))<1e-6,'a target due south is a quarter turn one way: '+view.aimTurn('t','Turret',{x:10,y:20}));
  assert.ok(Math.abs(view.aimTurn('t','Turret',{x:10,y:0})-90)<1e-6,'due north the other');
  object.rotation.y=Math.PI/2;object.updateMatrixWorld(true);
  assert.ok(Math.abs(view.aimTurn('t','Turret',{x:20,y:10})-(90))<1e-6||Math.abs(view.aimTurn('t','Turret',{x:20,y:10})-(-90))<1e-6,'the answer follows the model\'s own turn');
  assert.equal(view.aimTurn('t','Nothing',{x:1,y:1}),0,'an unknown part turns nothing');
 }finally{global.Reactor3D=previousR;global.ReactorBattleData=previousB;}
});

test('a held model is read by its shape: long axis, tip, grip and which way its bulk hangs; a reach lands a hand on a point',()=>{
 const path=require('node:path'),R=require('../../runtime/reactor_3d.js'),View=require('../../runtime/reactor_battle_room.js'),previousR=global.Reactor3D,previousB=global.ReactorBattleData;global.Reactor3D=R;global.ReactorBattleData=B;global.self=global;global.window=global;require(path.join(__dirname,'../../runtime/libs/three.js'));const THREE=global.THREE;
 try{
  // A sword along +Y: a thin blade from y 0.3 to 3, a wide guard at y 0.2, a grip below it; the bulk hangs to -Z below the guard.
  const sword=new THREE.Group();const add=(w,h,d,y,z=0)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d,2,12,2),new THREE.MeshBasicMaterial());m.position.set(0,y,z);sword.add(m);};
  add(.16,2.7,.04,1.9);add(.6,.08,.12,.42);add(.1,.7,.1,0);add(.14,.06,.3,.42,-.15);
  const shape=R.heldShape(sword);
  assert.deepEqual(shape.axis,[0,1,0],'the blade runs up the long axis toward the tip');assert.ok(shape.base[1]<.5,'the handle end is the bottom: '+shape.base[1]);assert.ok(shape.grip<.25,'the grip is just under the guard: '+shape.grip);assert.ok(shape.up[2]>.9,'the bulk hangs to -Z so up is +Z');
  // A two-bone arm: shoulder → elbow → hand, straight along +X; the hand reaches a point within its length.
  const settings=B.room({id:1,width:50,height:50});const view=new View({reactor3d:{}},{},settings,{});
  const body=new THREE.Group(),upper=new THREE.Group(),fore=new THREE.Group(),hand=new THREE.Group();upper.name='RightArm';fore.name='RightForeArm';hand.name='RightHand';body.add(upper);upper.add(fore);fore.add(hand);upper.position.set(0,1.4,0);fore.position.set(.5,0,0);hand.position.set(.4,0,0);body.updateMatrixWorld(true);
  view.models.set('a',{object:body,position:{x:0,y:0,z:0},rules:[],binding:{root:body,meshes:[]}});
  const target=new THREE.Vector3(.3,1.0,.5);assert.equal(view.reachArm('a','right',target),true);
  const reached=hand.getWorldPosition(new THREE.Vector3());assert.ok(reached.distanceTo(target)<1e-3,'the hand lands on the point: '+reached.toArray().map(n=>n.toFixed(3)));
  const elbow=fore.getWorldPosition(new THREE.Vector3());assert.ok(Math.abs(elbow.distanceTo(upper.getWorldPosition(new THREE.Vector3()))-.5)<1e-6,'the upper arm keeps its length');
  const far=new THREE.Vector3(5,1.4,0);view.reachArm('a','right',far);assert.ok(Math.abs(hand.getWorldPosition(new THREE.Vector3()).x-.9)<1e-3,'a point out of reach straightens the arm toward it');
 }finally{global.Reactor3D=previousR;global.ReactorBattleData=previousB;}
});

test('a hit recoil goes back, springs forward past home and settles, smaller on a big model',()=>{
 const R=require('../../runtime/reactor_3d.js'),View=require('../../runtime/reactor_battle_room.js'),previousR=global.Reactor3D,previousB=global.ReactorBattleData;global.Reactor3D=R;global.ReactorBattleData=B;
 try{
  const back=[0,2,4,6].map(t=>View.recoilOffset(t,2));assert.ok(back[0]===0&&back[1]>0&&back[2]>back[1]&&back[3]>back[2],'pushed back over the first frames: '+back);
  assert.ok(View.recoilOffset(6,2)>.39,'a tile-sized model goes back four tenths');
  const spring=[10,12,14].map(t=>View.recoilOffset(t,2));assert.ok(spring.some(v=>v<0),'then springs past home: '+spring);
  assert.ok(Math.abs(View.recoilOffset(17.99,2))<.05&&View.recoilOffset(18,2)===null,'and settles');
  assert.ok(View.recoilOffset(6,15)<View.recoilOffset(6,2)/3,'a tank barely moves');
  const settings=B.room({id:1,width:50,height:50});const view=new View({reactor3d:{}},{},settings,{});
  view.models.set('t',{position:{x:10,y:10,z:0,facing:90},spec:{size:2},object:{position:{x:10.5,y:0,z:10.5},updateMatrixWorld(){}}});
  view.startRecoil('t',{x:4,y:10});assert.ok(view.models.get('t').recoil.dx>.99,'away from the attacker to the west is east');
  view.frame=6;view.applyRecoil(view.models.get('t'));assert.ok(view.models.get('t').object.position.x>10.85,'the object is pushed, the record is not: '+view.models.get('t').object.position.x);assert.equal(view.models.get('t').position.x,10);
  view.startRecoil('t',null);assert.ok(Math.abs(view.models.get('t').recoil.dx+1)<1e-9,'no attacker: straight back from a facing of 90 is west');
 }finally{global.Reactor3D=previousR;global.ReactorBattleData=previousB;}
});

test('a room model dissolves for Ash and Ember: shards off its surface in its colours, the model eaten from the feet up, gone at the end', async () => {
    const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');const THREE=await import('three'),scope={THREE,ReactorBattleData:B};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../runtime/reactor_battle_room.js'),'utf8'),scope);
    const Room=scope.ReactorBattleRoomView,view=Object.create(Room.prototype);view.models=new Map();view.billboards=new Map();view.scene=new THREE.Scene();view.frame=100;view.height=624;view.camera=new THREE.PerspectiveCamera(40,1,.1,100);
    const material=new THREE.MeshStandardMaterial({color:0x3060c0});material.userData.rrDissolve={value:-1e9};
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),material);mesh.position.set(5.5,1,3.5);const object=new THREE.Group();object.add(mesh);view.scene.add(object);
    const record={object,spec:{size:2},position:{x:5,y:3},shadow:{visible:true,material:{opacity:.55}}};view.models.set('enemy:0',record);
    assert.equal(view.startDissolve('missing','ash'),0,'no model, no dissolve');
    const frames=view.startDissolve('enemy:0','ember');
    assert.ok(frames>100&&frames<140,`lasts about two seconds (${frames})`);
    const d=record.dissolve;assert.ok(d.points&&d.sparks,'ember has shards and sparks');
    const pos=d.points.geometry.getAttribute('position'),col=d.points.geometry.getAttribute('color'),delay=d.points.geometry.getAttribute('aDelay');
    assert.ok(pos.count>=1200,`enough shards (${pos.count})`);
    let inside=0;for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);if(x>=4.99&&x<=6.01&&y>=-.01&&y<=2.01&&z>=2.99&&z<=4.01)inside++;}
    assert.equal(inside,pos.count,'every shard lies on the model');
    assert.ok(Math.abs(col.getX(0)-material.color.r)<1e-6&&Math.abs(col.getZ(0)-material.color.b)<1e-6,'shards take the material colour when no texture can be read');
    let low=Infinity,high=-Infinity;for(let i=0;i<delay.count;i++){low=Math.min(low,delay.getX(i));high=Math.max(high,delay.getX(i));}
    assert.ok(low>=0&&high<=51,'release runs from the feet over the wave');
    assert.equal(view.startDissolve('enemy:0','ash'),frames,'asked twice, one dissolve');
    // Wisp is a third kind in 2D; without a preset of its own here it would fall back to Ash and dissolve grey.
    const wisp=Room.DISSOLVE.wisp;assert.ok(wisp,'the room knows Wisp');
    assert.ok(wisp.tint[1]>wisp.tint[0]&&wisp.tint[1]>wisp.tint[2],'its shards are green, not fire');
    assert.ok(wisp.spark.peak<1&&wisp.spark.core===0,'its sparks never saturate and have no opaque core, so they accumulate into a glow');
    assert.ok(wisp.spark.life>Room.DISSOLVE.ember.spark.life&&wisp.spark.size>Room.DISSOLVE.ember.spark.size,'and live longer and larger than embers');
    assert.equal(Room.DISSOLVE.ash.spark,null,'ash strikes no sparks');
    // Shatter is a break, not a dissolve: it throws its shards outward from the middle and lets them fall.
    const shatter=Room.DISSOLVE.shatter;assert.ok(shatter,'the room knows Shatter');
    assert.ok(shatter.burst>0&&shatter.gravity>0,'it bursts outward and falls');
    assert.equal(shatter.shrink,0,'its shards keep their size');
    assert.equal(shatter.hard,1,'and are cut as sharp fragments');
    assert.ok(shatter.waveSpread<Room.DISSOLVE.ash.waveSpread/3,'it breaks at once rather than climbing');
    assert.ok(!Room.DISSOLVE.ember.burst&&!Room.DISSOLVE.wisp.burst,'the dissolves do not burst');
    // A shattering model still runs the same clock and frees itself.
    const other={object:new THREE.Group(),spec:{size:2},position:{x:1,y:1}};
    const m2=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshStandardMaterial());m2.position.set(1.5,1,1.5);other.object.add(m2);view.scene.add(other.object);view.models.set('enemy:1',other);
    view.frame=500;const sf=view.startDissolve('enemy:1','shatter');assert.ok(sf>0,'it runs');
    const sd=other.dissolve,sdelay=sd.points.geometry.getAttribute('aDelay');
    let maxDelay=0;for(let i=0;i<sdelay.count;i++)maxDelay=Math.max(maxDelay,sdelay.getX(i));
    assert.ok(maxDelay<=shatter.waveSpread+1,'every shard leaves within the short wave');
    view.frame=500+sf;view.updateDissolve(other);assert.equal(other.object.visible,false,'and the model is gone at the end');
    // The front rises with the frames.
    assert.ok(material.userData.rrDissolve.value<0.2,'the front starts at the feet');
    view.frame=100+22;view.updateDissolve(record);const half=material.userData.rrDissolve.value;assert.ok(half>.8&&half<1.3,`half way up at half the wave (${half.toFixed(2)})`);
    assert.equal(d.points.material.uniforms.uTime.value,22);assert.ok(record.dissolveShadow<.6&&record.dissolveShadow>.4,'the floor shadow fades with the wave');
    view.frame=100+frames;view.updateDissolve(record);
    assert.equal(d.done,true);assert.equal(object.visible,false,'the model is gone');assert.equal(d.points,null,'the shards are freed');assert.equal(view.scene.children.filter(c=>c.isPoints).length,0);
});

test('Shatter is wired end to end: the trait, both emitters, and a mesh of triangles in a flat battle', () => {
    const fs = require('node:fs'), path = require('node:path');
    const read = file => fs.readFileSync(path.join(__dirname, '../../runtime', file), 'utf8');
    const objects = read('reactor_objects.js'), sprites = read('reactor_sprites.js');
    // The trait's eighth value reaches the sprite, which reaches the preset.
    assert.match(objects, /case 7:\s*\n\s*this\.requestEffect\("shatterCollapse"\)/, 'Collapse Effect 7 asks for the shatter');
    assert.match(sprites, /case "shatterCollapse":\s*\n\s*this\.startParticleCollapse\("shatter"\)/, 'and the sprite starts that preset');
    assert.match(sprites, /case "shatterCollapse":\s*\n\s*case "wispCollapse":/, 'and it updates with the other particle collapses');
    // Glass is polygons, so the flat battle builds a mesh rather than particles.
    assert.match(sprites, /createFragmentCollapse = function/, 'the mesh path exists');
    assert.match(sprites, /updateFragmentCollapse = function/, 'and moves its corners itself');
    assert.match(sprites, /preset\.fragments \? this\.createFragmentCollapse\(preset\) : this\.createParticleCollapse\(preset\)/, 'and a fragment preset takes it');
    assert.match(sprites, /new PIXI\.MeshGeometry\(/, 'one geometry for the whole break');
    // The preset itself: a break, not a dissolve.
    const preset = sprites.slice(sprites.indexOf('    shatter: {'), sprites.indexOf('    wisp: {'));
    assert.match(preset, /fragments: true/);
    assert.match(preset, /burst: [0-9.]+/, 'thrown outward');
    assert.match(preset, /settle: \d+/, 'and settling, so a landed shard stays where it fell');
    assert.match(preset, /buoyancy: -[0-9.]+/, 'a negative buoyancy is gravity');
    assert.ok(/shrink: 0\b/.test(preset), 'its shards keep their size');
});

test("an enemy can carry its own collapse sound, chosen beside the effect and stored with its presentation settings", () => {
    const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
    const editorRoot = path.resolve(__dirname, '..');
    const objects = fs.readFileSync(path.join(editorRoot, '../runtime/reactor_objects.js'), 'utf8');
    // Every collapse kind asks for the enemy's own sound before the engine's.
    assert.match(objects, /Game_Enemy\.prototype\.playCollapseSe = function/);
    for (const kind of ['collapse', 'bossCollapse', 'ashCollapse', 'emberCollapse', 'wispCollapse', 'shatterCollapse']) {
        const at = objects.indexOf(`this.requestEffect("${kind}")`);
        assert.ok(at > 0, kind);
        assert.match(objects.slice(at, at + 200), /this\.playCollapseSe\(/, `${kind} plays the chosen sound`);
    }
    assert.doesNotMatch(objects.slice(objects.indexOf('Game_Enemy.prototype.performCollapse')), /SoundManager\.playEnemyCollapse\(\);\n/, 'no kind reaches the engine sound directly');
    // The resolver itself: the enemy's entry wins, and its levels default.
    const source = objects.slice(objects.indexOf('Game_Enemy.prototype.playCollapseSe'), objects.indexOf('Game_Enemy.prototype.performCollapse'));
    const context = { globalThis: {}, AudioManager: { played: null, playSe(se) { this.played = se; } } };
    context.globalThis = context;
    vm.runInNewContext(`const Game_Enemy = { prototype: {} };\n${source}\nthis.play = Game_Enemy.prototype.playCollapseSe;`, context);
    const enemy = { enemyId: () => 3, playCollapseSe: context.play };
    let fellBack = false;
    enemy.playCollapseSe(() => { fellBack = true; });
    assert.equal(fellBack, true, 'no chosen sound falls back to the engine');
    context.ReactorBattlePresentation = { settings: { enemies: { 3: { collapseSe: { name: 'glass-01' } } } } };
    fellBack = false;
    enemy.playCollapseSe(() => { fellBack = true; });
    assert.equal(fellBack, false, 'a chosen sound replaces it');
    // Spread it out of the vm realm first: a cross-realm object fails strict deepEqual.
    assert.deepEqual({ ...context.AudioManager.played }, { name: 'glass-01', volume: 90, pitch: 100, pan: 0 }, 'with the usual levels when none were saved');

    // The editor offers it on the Enemies page only, and clears back to the default.
    const editor = fs.readFileSync(path.join(editorRoot, 'src/database/DatabaseTraitEditor.js'), 'utf8');
    assert.match(editor, /_collapseSoundHTML\(\) \{\s*\n\s*if \(this\.recordType !== 'enemies'\) return '';/);
    assert.match(editor, /RRAudioPickerModal\.open\(/, 'through the shared audio picker');
    assert.match(editor, /this\._saveCollapseSe\(this\.currentEntry\);/, 'saved with the trait');
    assert.match(editor, /delete section\[entry\.id\]\.collapseSe;/, 'and cleared when no sound is chosen');
    const enemies = fs.readFileSync(path.join(editorRoot, 'src/database/DatabaseEnemyEditor.js'), 'utf8');
    assert.equal((enemies.match(/\}, 'enemies'\);/g) || []).length, 2, 'both trait dialogs say which record they edit');
});

// The control shipped as a bare button in the dropdown's own column: it read as
// a greyed-out field, said nothing about sound, and its click died on a project
// path DatabaseCommonUI had copied before any project was open.
test('the collapse sound names itself, looks like a picker and opens above the trait dialog', () => {
    const fs = require('node:fs'), path = require('node:path');
    const editorRoot = path.resolve(__dirname, '..');
    const source = fs.readFileSync(path.join(editorRoot, 'src/database/DatabaseTraitEditor.js'), 'utf8');

    const prior = { escape: globalThis.rrEscapeHtml, help: globalThis.TraitHelp, window: globalThis.window };
    globalThis.rrEscapeHtml = require(path.join(editorRoot, 'src/utils/HtmlEscape.js'));
    globalThis.TraitHelp = require(path.join(editorRoot, 'src/database/TraitHelp.js'));
    if (!globalThis.window) globalThis.window = {};
    try {
        const TraitEditor = new Function(`${source}\nreturn DatabaseTraitEditor;`)();
        const render = recordType => {
            const editor = Object.create(TraitEditor.prototype);
            editor.recordType = recordType;
            editor._collapseSe = null;
            const container = { innerHTML: '', querySelectorAll: () => [], querySelector: () => null };
            editor.createOtherTab(container, { code: 63, dataId: 1, value: 0 });
            return container.innerHTML;
        };
        const html = render('enemies');
        assert.match(html, /rr-trait-subrow/, 'the sound is its own row, not a second control in the dropdown column');
        assert.match(html, /class="rr-trait-label">Collapse Sound</, 'and the row says what it is');
        assert.match(html, /class="collapse-se-button rr-btn-chip"/, 'drawn as a button, not as a filled-in field');
        assert.match(html, /class="collapse-se-icon"/, 'with a speaker beside the name');
        assert.match(html, /<span class="collapse-se-name">System default<\/span>/);
        assert.doesNotMatch(render('states'), /collapse-se-button/, 'only the record the runtime reads the sound from offers it');
    } finally {
        globalThis.rrEscapeHtml = prior.escape;
        globalThis.TraitHelp = prior.help;
        if (prior.window === undefined) delete globalThis.window; else globalThis.window = prior.window;
    }

    // Opened at the trait dialog's own z-index or below, the picker appears behind it.
    const zIndex = Number((source.match(/zIndex: (\d+),/) || [])[1]);
    const overlay = Number((fs.readFileSync(path.join(editorRoot, 'css/theme.css'), 'utf8')
        .match(/\.rr-modal-overlay \{[^}]*z-index: (\d+)/) || [])[1]);
    assert.ok(zIndex > overlay, `the picker (${zIndex}) has to sit above the trait dialog (${overlay})`);

    assert.match(source, /_projectPath\(\) \{/, 'the open project is asked for');
    assert.doesNotMatch(source, /const projectPath = this\.commonUI\?\.currentProject\?\.path;/,
        'never the copy taken before a project was open');
});

// A battle room advances one frame per view.render(), and in game that call
// comes from the engine's fixed 60 fps update. Both room previews called it
// once per requestAnimationFrame, so the room ran at the monitor's rate: 2.4x
// too fast on a 144 Hz screen, half speed on 30 Hz. Reported from the Troops
// page: "the speed of the stuff in the map seems tied to monitor Hz".
test('a room preview advances at 60 frames a second whatever the monitor does', () => {
    const fs = require('node:fs'), path = require('node:path');
    const editorRoot = path.resolve(__dirname, '..');
    const source = fs.readFileSync(path.join(editorRoot, 'src/battle/BattlePresentationEditor.js'), 'utf8');

    // The method alone: the file needs a DOM and three.js to load whole.
    const body = source.slice(source.indexOf('    roomFrameSteps(clock,now) {'));
    const roomFrameSteps = new Function(`return function ${body.slice(0, body.indexOf('\n    }') + 6).trim()}`)();

    const run = (hz, seconds) => {
        const clock = {};
        let stepped = 0;
        const frames = Math.round(hz * seconds);
        for (let i = 0; i <= frames; i++) stepped += roomFrameSteps(clock, (i * 1000) / hz);
        return stepped;
    };
    // One second of wall clock is 60 room frames at any refresh rate. The first
    // call seeds the clock and spends a frame, so a second is 60 either way.
    for (const hz of [30, 50, 60, 75, 120, 144, 165, 240]) {
        const stepped = run(hz, 1);
        assert.ok(Math.abs(stepped - 61) <= 1, `${hz} Hz advanced ${stepped} frames in a second`);
    }
    assert.equal(run(144, 5) > 295 && run(144, 5) < 306, true, 'and stays right over five seconds');

    // A stall is not repaid all at once: four frames is the most any one tick owes.
    const clock = {};
    roomFrameSteps(clock, 0);
    assert.equal(roomFrameSteps(clock, 5000), 4, 'a backgrounded tab does not fast-forward the room');

    // And both loops step the renderer rather than calling it once per frame.
    assert.equal((source.match(/for\(let step=0;step<steps;step\+\+\)view\.render\(\);/g) || []).length, 2,
        'the troop preview and the setup dialog both pace the room');
    assert.doesNotMatch(source, /this\.drawRoomCast\(view,draft,cast\);view\.render\(\);/, 'no unpaced render is left');
});
