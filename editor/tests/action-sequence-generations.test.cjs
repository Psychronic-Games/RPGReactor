// Every generation of saved action-sequence data must keep loading and
// resolving: whole actions with no phase marks (before 2026-09-11), the
// per-phase assignment shape with phase-purpose sequences (2026-09-11),
// and phased sequences with one pick per record (2026-09-12). The first
// test reads the real files of every bundled project; the rest pin each
// shape and the phase-placement rules of the resolver.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const B=require('../../runtime/reactor_battle_data.js');
const root=path.resolve(__dirname,'../..'),templates=path.join(root,'template');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const tagged=(steps,phase)=>steps.map(s=>({...s,phase}));
const phases=steps=>steps.map(B.stepPhase);
const impacts=sequence=>sequence.steps.filter(s=>s.type==='impact').length;
const attack=extra=>({kind:'skills',itemId:1,isAttack:true,weaponIds:[],classId:0,battlerKind:'actors',battlerId:1,...extra});

test('every bundled project\'s sequences and assignments load, validate and resolve without a missing phase',()=>{
 // The bundled projects plus a snapshot of Star Shift Rebellion's battle files from before the Victor import (2026-09-13): the older generations must keep loading whatever the live projects move on to.
 const fixtures=path.join(__dirname,'fixtures'),corpus=[...fs.readdirSync(templates).filter(name=>fs.existsSync(path.join(templates,name,'data/ActionSequences.json'))).map(name=>[name,path.join(templates,name,'data')]),...fs.readdirSync(fixtures).filter(name=>fs.existsSync(path.join(fixtures,name,'ActionSequences.json'))).map(name=>['fixture '+name,path.join(fixtures,name)])];
 // Only the Demo is tracked; Star Shift Rebellion joins the corpus on a machine that has it. The fixture is the older generation on CI.
 assert.ok(corpus.length>=2,'expected the Demo and the fixture to carry ActionSequences.json');
 const seen={unphased:0,phased:0,phasePurpose:0,phasesBinding:0,sequenceBinding:0,resolved:0};
 for(const [name,data] of corpus){
  const sequences=read(path.join(data,'ActionSequences.json'));
  const settings=fs.existsSync(path.join(data,'BattlePresentation.json'))?read(path.join(data,'BattlePresentation.json')):B.empty();
  assert.equal(B.validateStore(sequences,settings),true,name);
  for(const sequence of sequences.slice(1)){if(!sequence)continue;assert.deepEqual(B.validateSequence(sequence),[],name+' #'+sequence.id+' '+sequence.name);
   const purpose=B.purpose(sequence);if(purpose==='action')seen[B.isPhased(sequence)?'phased':'unphased']++;else if(B.isPhase(purpose))seen.phasePurpose++;}
  const contexts=[];
  for(const [kind,table] of Object.entries(settings))if(['skills','items','weapons','actors','enemies','classes'].includes(kind))for(const [id,binding] of Object.entries(table||{})){
   if(!binding||typeof binding!=='object')continue;
   if(binding.mode==='phases')seen.phasesBinding++;if(binding.mode==='sequence')seen.sequenceBinding++;
   const recordId=Number(id);
   if(kind==='skills'||kind==='items')contexts.push({label:kind+' '+id,context:attack({kind,itemId:recordId})});
   else if(kind==='weapons')contexts.push({label:'weapon '+id,context:attack({weaponIds:[recordId]})});
   else if(kind==='classes')contexts.push({label:'class '+id,context:attack({classId:recordId})});
   else contexts.push({label:kind+' '+id,context:attack({battlerKind:kind,battlerId:recordId})});
  }
  for(const {label,context} of contexts){
   const resolved=B.resolvePresentation(settings,sequences,context);
   assert.equal(!!resolved.missing,false,name+': '+label+' resolves to a missing sequence');
   if(resolved.mode==='existing')continue;
   assert.ok(resolved.sequence,name+': '+label+' resolved to nothing');assert.deepEqual(B.validateSequence(resolved.sequence),[],name+': '+label);
   assert.equal(resolved.sequence.hitPolicy==='authored'||B.mostAlong(resolved.sequence.steps,s=>s.type==='impact')===1||resolved.sequence.steps.some(s=>s.type==='action'),true,name+': '+label+' must land exactly once along any branch');
   seen.resolved++;
  }
  for(const [stateId,entry] of Object.entries(settings.states||{}))if(entry?.reaction?.mode==='sequence')assert.ok(B.resolveState(settings,sequences,'actors',1,'idle',0,null,[Number(stateId)]),name+': state '+stateId+' reaction');
 }
 // The corpus must actually contain each generation, or this test proves nothing.
 assert.ok(seen.unphased>0,'an older whole action (Star Shift Rebellion)');assert.ok(seen.phased>0,'a phased sequence (Demo)');
 assert.ok(seen.phasePurpose>0,'a phase-purpose sequence (Star Shift Rebellion #17)');assert.ok(seen.phasesBinding>0,'a per-phase assignment');assert.ok(seen.sequenceBinding>0);assert.ok(seen.resolved>0);
});

test('an older whole action is handed back by reference, and plays the same after its phases are migrated',()=>{
 const whole={...B.templateSteps('Melee Strike',1)};assert.equal(B.isPhased(whole),false);assert.deepEqual(B.sequencePhases(whole),B.phaseIds());
 const settings=B.empty(),sequences=[null,whole];settings.skills[1]={mode:'sequence',sequenceId:1};
 assert.equal(B.resolve(settings,sequences,attack()),whole,'unphased whole action by reference');
 const before=whole.steps.map(s=>s.type);
 assert.equal(B.migratePhases(whole),true);assert.equal(B.migratePhases(whole),false,'migration runs once');
 assert.deepEqual(whole.phases,B.phaseIds());assert.ok(whole.steps.every(s=>s.phase==='execute'));
 assert.equal(B.resolve(settings,sequences,attack()),whole,'still by reference once phased');
 assert.deepEqual(whole.steps.map(s=>s.type),before);assert.deepEqual(B.validateSequence(whole),[]);
 // Beneath a partial sequence it contributes only what it marks: everything sits in Execute, so a phase it does not fill stays empty.
 const partial={id:2,version:1,name:'Movement only',phases:['movement'],steps:tagged(B.basic('Run to Target'),'movement')};sequences[2]=partial;
 settings.skills[1]={mode:'sequence',sequenceId:2};settings.actors[1]={mode:'sequence',sequenceId:1};
 const resolved=B.resolvePresentation(settings,sequences,attack());
 assert.equal(resolved.phases.find(p=>p.phase==='movement').sequence,partial);assert.equal(resolved.phases.find(p=>p.phase==='execute').sequence,whole);
 assert.equal(resolved.phases.find(p=>p.phase==='return').steps.length,0,'the older whole action leaves Return empty');
 assert.equal(impacts(resolved.sequence),1);assert.deepEqual(B.validateSequence(resolved.sequence),[]);
});

test('per-phase assignments in the older shape still pick their phases, and the unarmed slot still answers an empty hand',()=>{
 const prepare={id:17,version:1,purpose:'prepare',name:'Terran — Prepare',steps:[B.step('motion',{motion:'chant',duration:8})]};
 const settings=B.empty(),sequences=[null,...B.actionPhases.map(([p],i)=>({...B.defaultPhase(p,{isAttack:true}),id:i+1}))];sequences[17]=prepare;
 settings.classes[1]={mode:'phases',phases:{prepare:{mode:'sequence',sequenceId:17}}};settings.actors[1]={mode:'inherit'};
 const resolved=B.resolvePresentation(settings,sequences,attack({classId:1}));
 assert.equal(resolved.mode,'phases');assert.equal(resolved.missing,undefined);assert.equal(resolved.phases[0].sequence,prepare);
 assert.equal(resolved.sequence.steps[0].motion,'chant');assert.deepEqual(phases(resolved.sequence.steps).slice(0,1),['prepare']);
 assert.deepEqual([...new Set(phases(resolved.sequence.steps))],['prepare','movement','execute','return','finish']);
 assert.equal(impacts(resolved.sequence),1);assert.equal(resolved.sequence.hitPolicy,'once');
 // A per-phase pick of the wrong purpose is a missing phase, not a silent default.
 settings.classes[1].phases.prepare.sequenceId=3;assert.equal(B.resolvePresentation(settings,sequences,attack({classId:1})).missing,true);
 // A per-phase pick that is not a sequence falls back to the built-in phase.
 settings.classes[1].phases.prepare={mode:'builtin'};assert.equal(B.resolvePresentation(settings,sequences,attack({classId:1})).phases[0].source.kind,'classes');
 // The actor's older unarmed override answers only a bare-handed normal attack.
 const punch={...B.templateSteps('Unarmed Punch',20)};sequences[20]=punch;settings.actors[1]={unarmed:{mode:'sequence',sequenceId:20}};settings.classes={};
 assert.equal(B.resolve(settings,sequences,attack()),punch);assert.equal(B.resolve(settings,sequences,attack({weaponIds:[5]})),null,'a weapon in hand ignores the unarmed slot');
 assert.equal(B.resolve(settings,sequences,attack({isAttack:false})),null,'a skill is not an unarmed attack');
});

test('a partial sequence without a hit lands the built-in one after its Execute steps and before Return',()=>{
 const partial={id:1,version:1,name:'Swing and walk home',phases:['execute','return'],steps:[
  ...tagged([B.step('motion',{motion:'swing',duration:18}),B.step('wait',{duration:6})],'execute'),
  ...tagged(B.basic('Return Home'),'return')]};
 assert.deepEqual(B.validateSequence(partial),[],'Execute without an impact is valid; the built-in hit follows it');
 const settings=B.empty(),sequences=[null,partial];settings.skills[1]={mode:'sequence',sequenceId:1};
 const resolved=B.resolvePresentation(settings,sequences,attack());
 assert.equal(resolved.missing,undefined);assert.ok(resolved.sequence);
 const order=phases(resolved.sequence.steps),first=phase=>order.indexOf(phase),last=phase=>order.lastIndexOf(phase);
 const steps=resolved.sequence.steps,hit=steps.findIndex(s=>s.type==='impact'),swing=steps.findIndex(s=>s.motion==='swing');
 assert.ok(swing<hit&&steps[hit-1].type==='animation'&&steps[hit].phase==='execute','the built-in animation and hit follow the authored Execute steps, as Execute steps');
 assert.ok(hit<first('return'),'the hit lands before Return');
 assert.ok(last('movement')<first('execute')&&last('return')<first('finish'));
 assert.equal(impacts(resolved.sequence),1);assert.equal(steps.filter(s=>s.type==='animation').length,1,'the built-in hit brings the skill animation');
 assert.equal(resolved.sequence.hitPolicy,'once');assert.deepEqual(B.validateSequence(resolved.sequence),[]);
 assert.equal(resolved.phases.find(p=>p.phase==='return').sequence,partial);assert.equal(resolved.phases.find(p=>p.phase==='movement').source,null);
});

test('an Execute that lands its own impact gets no built-in hit, and the old Effect phase folds into Execute at its placeholder',()=>{
 const own={id:1,version:1,name:'Self-contained execute',phases:['execute'],steps:tagged([B.step('motion',{motion:'swing',duration:10}),B.step('impact',{role:'allTargets'}),B.step('wait',{duration:4})],'execute')};
 const settings=B.empty(),sequences=[null,own];settings.skills[1]={mode:'sequence',sequenceId:1};
 let resolved=B.resolvePresentation(settings,sequences,attack());
 assert.equal(impacts(resolved.sequence),1,'the authored impact is the only hit');assert.equal(resolved.sequence.steps.filter(s=>s.type==='animation').length,0,'the built-in hit is not added on top');
 assert.deepEqual(B.validateSequence(resolved.sequence),[]);
 // Older data: a Play Effect Phase placeholder in Execute and an Effect phase of its own. The fold puts the effect steps at the placeholder, as Execute steps, and the placeholder's own frames become a wait after them.
 const old={id:2,version:1,name:'Placeholder execute',phases:['execute','effect'],hitPolicy:'authored',steps:[...tagged([B.step('motion',{motion:'swing',duration:10}),{...B.step('wait',{duration:5,role:'allTargets'}),type:'effect'},B.step('wait',{duration:7})],'execute'),...tagged([B.step('flash',{duration:2}),B.step('impact',{role:'allTargets'}),B.step('impact',{role:'allTargets',rate:50})],'effect')]};
 assert.equal(B.migrateSequence(old),true);
 const types=old.steps.map(s=>s.type+':'+s.phase+(s.duration?'('+s.duration+')':''));
 assert.deepEqual(types,['motion:execute(10)','flash:execute(2)','impact:execute','impact:execute','wait:execute(5)','wait:execute(7)']);
 assert.deepEqual(old.phases,['execute']);assert.deepEqual(B.validateSequence(old),[]);
 sequences[2]=old;settings.skills[1]={mode:'inherit'};settings.weapons[4]={mode:'sequence',sequenceId:2};
 resolved=B.resolvePresentation(settings,sequences,attack({weaponIds:[4]}));
 assert.equal(resolved.sequence.hitPolicy,'authored');assert.equal(impacts(resolved.sequence),2);assert.deepEqual(B.validateSequence(resolved.sequence),[]);
 // A placeholder with no Effect steps of its own takes the built-in hit.
 const lone={id:3,version:1,name:'Lone placeholder',phases:['execute'],steps:tagged([B.step('motion',{motion:'swing',duration:10}),{...B.step('wait',{duration:0,role:'allTargets'}),type:'effect'}],'execute')};
 B.migrateSequence(lone);assert.deepEqual(lone.steps.map(s=>s.type),['motion','animation','impact']);assert.equal(lone.steps[1].animationSource,'action');
 // A per-phase pick of the old Effect phase is dropped.
 const legacy=B.empty();legacy.skills[1]={mode:'phases',phases:{effect:{mode:'sequence',sequenceId:3},execute:{mode:'inherit'}}};assert.equal(B.migrateSettings(legacy),true);assert.deepEqual(Object.keys(legacy.skills[1].phases),['execute']);
});

test('a resolved partial action plays through the battle manager: movement first, one hit per repeat, then home',()=>{
 const partial={id:1,version:1,name:'Swing and walk home',phases:['execute','return'],steps:[
  ...tagged([B.step('motion',{motion:'swing',duration:18})],'execute'),...tagged(B.basic('Return Home'),'return')]};
 const item={id:1,animationId:0},target={isActor:()=>false,enemyId:()=>1},action={item:()=>item,isAttack:()=>true};
 const subject={isActor:()=>true,actorId:()=>1,currentAction:()=>action,weapons:()=>[],attackAnimationId1:()=>0};
 const sprite=x=>({x,y:200,_homeX:x,_homeY:200,_offsetX:0,_offsetY:0,rotation:0,scale:{x:1,y:1,set(x,y=x){this.x=x;this.y=y;}},startMotion(name){this.motions=(this.motions||[]).concat(name);}});
 const userSprite=sprite(100),targetSprite=sprite(400),hits=[];
 function Log(){}Log.prototype.startAction=function(){};Log.prototype.displayAction=function(){};
 function Scene(){}Scene.prototype.create=function(){};Scene.prototype.isReady=()=>true;Scene.prototype.terminate=function(){};
 function Sprites(){}Sprites.prototype.update=function(){};
 const manager={_subject:subject,_spriteset:{findTargetSprite:b=>b===subject?userSprite:targetSprite},_logWindow:new Log(),
  startAction(){this._action=action;this._targets=[target,target,target];},updateAction(){},invokeAction(a,b){hits.push({x:userSprite.x,motion:userSprite.motions?.at(-1)});},endAction(){this.ended=(this.ended||0)+1;},forceAction(){}};
 const context={ReactorBattleData:B,DataManager:{isDatabaseLoaded:()=>true,isSkill:()=>true},BattleManager:manager,Window_BattleLog:Log,Scene_Battle:Scene,Spriteset_Battle:Sprites,PluginManager:{_scripts:[],registerCommand(){}},$dataAnimations:[null],console:{warn(){}},SceneManager:{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'runtime/reactor_battle_presentation.js'),'utf8'),context);const P=context.ReactorBattlePresentation;P.install();
 P.sequences=[null,partial];P.settings=B.empty();P.settings.skills[1]={mode:'sequence',sequenceId:1};
 manager.startAction();assert.ok(manager._reactorSequence,'the partial sequence resolves into a playable action');
 let guard=2000;while(manager._reactorSequence&&guard--)manager.updateAction();assert.ok(guard>0,'the action ends');
 assert.equal(hits.length,3,'one hit per repeat occurrence, from the built-in hit');
 assert.ok(hits.every(h=>h.x!==100),'the inherited Movement ran the user to the target before the hits');
 assert.equal(hits[0].motion,'swing','the authored Execute motion is on the battler at impact');
 assert.equal(userSprite.x,100,'Return brought the user home');assert.equal(manager.ended,1);
});
