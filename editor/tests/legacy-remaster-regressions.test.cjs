'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const C=require('../src/legacy/LegacyCommands.js'),K=require('../src/legacy/LegacyConvert.js'),PF=require('../src/legacy/ProjectFiles.js');
const {runtimeSource}=require('./helpers/runtime-source.cjs');
const cmd=(code,parameters=[],string='')=>({code,parameters,string,indent:0});
const context=()=>({notes:{},actors:{},itemKind:id=>id===7?'weapons':'armors',itemType:id=>id===7?1:id===8?3:4});
function method(source,name){const a=source.indexOf(name+' = function');assert.ok(a>=0,name);const indent=/^[ \t]*/.exec(source.slice(source.lastIndexOf('\n',a)+1,a))[0];const b=source.indexOf('\n'+indent+'};',a);assert.ok(b>a,name);return source.slice(a,b+4+indent.length);}
function world(){
 const objects=runtimeSource('reactor_objects.js'),a=objects.indexOf('function Game_Timer()'),b=objects.indexOf('// Game_Message',a);
 const box={Math:Object.assign(Object.create(Math),{randomInt:()=>0}),Number,BattleManager:{abort(){box.aborts++;}},aborts:0,$gameMap:{rrHasTimerPages:()=>true,requestRefresh(){}},$gameParty:{inBattle:()=>box.inBattle,members:()=>Object.values(box.actors)},inBattle:false,actors:{},$gameActors:{actor:id=>box.actors[id]},$gamePlayer:{refresh(){box.refreshes++;}},refreshes:0,$dataWeapons:[], $dataArmors:[]};
 box.values={1:7,2:15};box.$gameVariables={value:id=>box.values[id]||0,setValue:(id,v)=>{box.values[id]=v;}};
 vm.createContext(box);vm.runInContext('function Game_Interpreter() {}\n'+objects.slice(a,b).replace(/\/\/[-]+\s*$/,'')+method(objects,'Game_Interpreter.prototype.command122')+method(objects,'Game_Interpreter.prototype.command319')+method(objects,'Game_Interpreter.prototype.gameDataOperand')+method(objects,'Game_Interpreter.prototype.operateVariable')+method(objects,'Game_Interpreter.prototype.rrChangeActorCharacter')+method(objects,'Game_Interpreter.prototype.rrChangeActorFace')+objects.slice(objects.indexOf('    const _operateVariable = Game_Interpreter.prototype.operateVariable;'),objects.indexOf('\n    };',objects.indexOf('    const _operateVariable = Game_Interpreter.prototype.operateVariable;'))+8),box);
 box.$dataSystem={rrLegacyVariableLimit:9999999};vm.runInContext('this.interpreter = new Game_Interpreter(); this.$gameTimer = new Game_Timer();',box);
 box.run=cs=>{const {list}=C.convertList(cs,context());for(const c of list){if(c.code===355)vm.runInContext('(function(){'+c.parameters[0]+'}).call(interpreter)',box);else if(c.code===319)box.interpreter.command319(c.parameters);else if(c.code===122)box.interpreter.command122(c.parameters);}};
 return box;
}

test('indirect variable operands retain game data and use legacy integer arithmetic',()=>{
 const w=world();w.$gameParty.gold=()=>42;w.$gameParty.numItems=()=>3;
 w.run([cmd(10220,[2,1,0,0,7,0])]);assert.equal(w.values[7],42,'gold operand was previously emitted as null');
 w.values[7]=-7;w.run([cmd(10220,[2,1,0,4,0,2])]);assert.equal(w.values[7],-3);
 w.run([cmd(10220,[2,1,0,4,0,0])]);assert.equal(w.values[7],-3,'divide by zero retains the value');
 w.run([cmd(10220,[2,1,0,5,0,0])]);assert.equal(w.values[7],0);
 w.values[7]=9999999;w.run([cmd(10220,[2,1,0,1,0,1])]);assert.equal(w.values[7],9999999);
});

test('legacy equipment targets the right type, including party, variable actor and all slots',()=>{
 const w=world(),calls=[];w.actors[3]={changeEquipById:(...args)=>calls.push([3,...args]),equips:()=>[1,2,3,4,5],changeEquip:(slot,item)=>calls.push([3,'slot',slot,item])};w.actors[4]={changeEquipById:(...args)=>calls.push([4,...args])};
 w.run([cmd(10450,[1,3,0,0,7]),cmd(10450,[1,3,0,0,8]),cmd(10450,[1,3,1,3,0])]);assert.deepEqual(calls,[[3,1,7],[3,4,8],[3,3,0]]);
 calls.length=0;w.run([cmd(10450,[0,0,1,0,0])]);assert.deepEqual(calls,[[3,1,0],[4,1,0]]);
 calls.length=0;w.values[2]=3;w.run([cmd(10450,[2,2,1,5,0])]);assert.equal(calls.length,5);assert.ok(calls.every(c=>c[0]===3&&c[1]==='slot'&&c[3]===null));
 calls.length=0;w.$dataArmors[8]={etypeId:4};w.values[1]=8;w.run([cmd(10450,[2,2,0,1,1])]);assert.deepEqual(calls,[[3,4,8]]);
});

test('changing a portrait preserves the current costume and vice versa',()=>{
 const w=world(),a=w.actors[1]={character:'old',face:'old',setCharacterImage(n,i){this.character=n;this.characterIndex=i;},setFaceImage(n,i){this.face=n;this.faceIndex=i;}};
 w.run([cmd(10630,[1,3,0],'Sub\\Costume.bmp'),cmd(10640,[1,2],'NewFace.png')]);assert.equal(a.character,'Sub/!Costume');assert.equal(a.face,'NewFace');assert.equal(w.refreshes,1);
 w.run([cmd(10630,[1,0,0],'Final')]);assert.equal(a.face,'NewFace');assert.equal(a.character,'!Final');
 assert.equal(K.charsetName('Sub\\$Hero.bmp'),'Sub/!Hero');
});

test('timer set and start in separate event lists retain the value at set time',()=>{
 const w=world();w.values[2]=70;w.run([cmd(10230,[0,1,2,0,0])]);assert.equal(w.$gameTimer.isWorking(),false);assert.equal(w.$gameTimer.seconds(),70);
 w.values[2]=1;w.run([cmd(10230,[1,0,0,1,0])]);assert.equal(w.$gameTimer.seconds(),70);assert.equal(w.$gameTimer._rrVisible,true);
 for(let i=0;i<60;i++)w.$gameTimer.update(true);assert.equal(w.$gameTimer.seconds(),69);
 w.run([cmd(10230,[2,0,0,0,0])]);const remaining=w.$gameTimer.frames();for(let i=0;i<60;i++)w.$gameTimer.update(true);assert.equal(w.$gameTimer.frames(),remaining);
 w.run([cmd(10230,[1,0,0,0,0])]);assert.equal(w.$gameTimer.frames(),remaining);assert.equal(w.$gameTimer._rrVisible,false);
});

test('two timers run independently, pause as configured in battle, and survive saved-game serialization',()=>{
 const w=world();w.run([cmd(10230,[0,0,30,0,0]),cmd(10230,[1,0,0,0,0]),cmd(10230,[0,0,5,0,0,1]),cmd(10230,[1,0,0,1,1,1])]);
 w.inBattle=true;for(let i=0;i<60;i++)w.$gameTimer.update(true);assert.equal(w.$gameTimer.seconds(),30);assert.equal(w.$gameTimer.rrTimer(1).seconds(),4);
 const io=runtimeSource('reactor_core.js'),start=io.indexOf('function JsonEx()'),end=io.indexOf('//-----------------------------------------------------------------------------',start);
 w.window=w;vm.runInContext(io.slice(start,end),w);vm.runInContext('$gameTimer=JsonEx.parse(JsonEx.stringify($gameTimer))',w);
 assert.equal(w.$gameTimer.rrTimer(1).seconds(),4);assert.equal(w.$gameTimer.rrTimer(1).isWorking(),true);
 w.inBattle=false;for(let i=0;i<60;i++)w.$gameTimer.update(true);assert.equal(w.$gameTimer.seconds(),29);assert.equal(w.$gameTimer.rrTimer(1).seconds(),3);
 w.run([cmd(10220,[0,9,9,0,7,9])]);assert.equal(w.values[9],3);
 const condition=C.convertList([cmd(12010,[10,3,1])],context()).list[0].parameters[1];assert.equal(vm.runInContext(condition,w),true);
});

test('timer page conditions keep both thresholds; unmodified MZ timers retain their behavior',()=>{
 const p=K.eventPage({condition:{flags:0x60,timer_sec:5,timer2_sec:3}},{});assert.equal(p.conditions.rrTimerSec,5);assert.equal(p.conditions.rrTimer2Sec,3);
 const w=world();w.$gameTimer.start(60);for(let i=0;i<60;i++)w.$gameTimer.update(true);assert.equal(w.aborts,1);assert.equal(w.$gameTimer.isWorking(),true);
 w.run([cmd(10230,[0,0,1,0,0]),cmd(10230,[1,0,0,0,0])]);for(let i=0;i<60;i++)w.$gameTimer.update(true);assert.equal(w.$gameTimer.isWorking(),false);assert.equal(w.aborts,1,'a map timer does not abort a battle');
});

test('simulated attack uses authored attack, defense and spirit factors',()=>{
 const w=world(),a=w.actors[1]={def:100,mat:80,hp:100,gainHp(n){this.hp+=n;}};w.run([cmd(10500,[1,1,50,40,100,0,1,9])]);assert.equal(a.hp,70);assert.equal(w.values[9],30);
});

test('all engine imports repair nested audio, tile/title names, vehicles and generated script assets',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rr-remaster-refs-'));try{
  const write=(name,data)=>{const p=path.join(dir,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,data);};
  for(const p of ['audio/bgm/Sub/Fanfare.ogg','img/tilesets/Inside.png','img/titles2/Frame.png','img/characters/Sub/!Hero.png','img/faces/Face.png','img/pictures/Sub/Plate.png','movies/Sub/Intro.webm'])write(p,'fixture');
  const data={title2Name:'frame',tilesetNames:['','inside'],list:[{code:323,parameters:[0,'Sub\\!hero',0]},{code:140,parameters:[0,{name:'sub\\fanfare'}]},{code:249,parameters:[{name:'sub\\fanfare'}]},{code:261,parameters:['sub\\intro']},...C.convertList([cmd(10630,[1,0,0],'Sub/hero'),cmd(10640,[1,0],'face'),cmd(10130,[0],'face')],context()).list,{code:355,parameters:['$gameScreen.showPicture($gameVariables.value(1), "sub/plate", 1)']},{code:355,parameters:['this.rrMakePic?.(4, "sub/plate", 0, 0)']} ]};
  write('data/System.json',JSON.stringify(data));assert.equal(PF.copyAcrossAudio(dir),1);assert.ok(PF.matchFileCase(dir)>=8);const r=JSON.parse(fs.readFileSync(path.join(dir,'data/System.json')));
  assert.equal(r.title2Name,'Frame');assert.equal(r.tilesetNames[1],'Inside');assert.equal(r.list[0].parameters[1],'Sub/!Hero');assert.ok(r.list.some(c=>c.code===355&&c.parameters[0].includes('"Face"')));assert.deepEqual(PF.missingList(dir),[]);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('RTP dependency discovery includes events, autonomous routes and forced routes',()=>{
 const RM=require('../src/legacy/RtpManager.js');const sound='Blow6',raw=[35,sound.length,...Buffer.from(sound),100,100,50];
 const db={encoding:'windows-1252',system:{},commonevents:[null,{event_commands:[cmd(11550,[],'CommonHit.wav')]}]};
 const maps={1:{events:[null,{pages:[{character_name:'Hero',move_route:{move_commands:[{code:35,parameter_string:'Step.wav'}]},event_commands:[cmd(11330,[10001,6,0,1,...raw]),cmd(10130,[],'Faces')]}]}]}};
 const refs=RM.referencedNames(db,null,()=>false,maps);assert.ok(refs.Sound.includes('CommonHit'));assert.ok(refs.Sound.includes('Step'));assert.ok(refs.Sound.includes('Blow6'));assert.ok(refs.CharSet.includes('Hero'));assert.ok(refs.FaceSet.includes('Faces'));
});

test('nested movies, including MP4, are scheduled for the WebM path used by the runtime',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rr-remaster-movies-'));try{fs.mkdirSync(path.join(dir,'movies/Sub'),{recursive:true});for(const n of ['Intro.mp4','Done.WEBM','Done.avi','Sub/Cutscene.AVI'])fs.writeFileSync(path.join(dir,'movies',n),'');assert.deepEqual(require('../src/legacy/LegacyMedia.js').pendingMovies(dir).sort(),['Intro.mp4','Sub/Cutscene.AVI']);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('loose RGSS source files resolve Windows separators as archive files do',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rr-remaster-rgss-path-'));try{fs.mkdirSync(path.join(dir,'Graphics/Sub'),{recursive:true});fs.writeFileSync(path.join(dir,'Graphics/Sub/Thing.png'),'image');const source=require('../src/legacy/RgssImporter.js').source(dir);assert.equal(source.read('graphics\\sub\\thing.PNG').toString(),'image');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('legacy page item conditions find equipped weapons/armor while MZ keeps inventory-only checks',()=>{
 const w=world(),source=runtimeSource('reactor_objects_map.js');w.$dataItems=[];w.$dataWeapons[7]={id:7};w.$gameParty.hasItem=(item,includeEquip)=>item===w.$dataWeapons[7]&&includeEquip;
 vm.runInContext('function Game_Event() {}\n'+method(source,'Game_Event.prototype.meetsConditions'),w);
 const page=K.eventPage({condition:{flags:8,item_id:7}},{});assert.equal(new w.Game_Event().meetsConditions(page),true);delete page.conditions.rrLegacyItem;assert.equal(new w.Game_Event().meetsConditions(page),false);
});

test('import file copies are writable and replace read-only previous imports without changing the source',()=>{
 const E=require('../src/legacy/EditorPaths.js'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'rr-import-copy-'));try{
 const source=path.join(dir,'source.wav'),dest=path.join(dir,'dest.wav');fs.writeFileSync(source,'unchanged source');fs.chmodSync(source,0o444);E.copyFile(source,dest);assert.equal(fs.readFileSync(dest,'utf8'),'unchanged source');assert.ok(fs.statSync(dest).mode&0o200);
 fs.chmodSync(dest,0o444);E.copyFile(source,dest);assert.ok(fs.statSync(dest).mode&0o200);assert.equal(fs.statSync(source).mode&0o777,0o444);
 assert.throws(()=>E.copyFile(path.join(dir,'missing'),dest));assert.equal(fs.readFileSync(dest,'utf8'),'unchanged source');assert.ok(!fs.readdirSync(dir).some(n=>n.includes('.part-')));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('missing source maps are reported without changing authored event destinations',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rr-import-map-refs-'));try{fs.mkdirSync(path.join(dir,'data'));const map={events:[null,{pages:[{list:[{code:201,parameters:[0,9,1,1]},{code:201,parameters:[1,8,1,1]},{code:201,parameters:[0,1,1,1]}]}]}]};const file=path.join(dir,'data/Map001.json');fs.writeFileSync(file,JSON.stringify(map));const before=fs.readFileSync(file,'utf8'),refs=PF.missingMapReferences(dir);assert.equal(refs.length,1);assert.match(refs[0],/Map001.json.*map 9/);assert.equal(fs.readFileSync(file,'utf8'),before);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('repeat imports refresh derived images/music/movies while preserving authored alternatives',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rr-import-media-refresh-'));try{
 for(const file of ['img/pictures/Old.PNG','img/pictures/Authored.png','audio/bgm/Song.ogg','audio/bgm/Keep.ogg','movies/Sub/Intro.webm']){const p=path.join(dir,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,'old');}
 assert.equal(PF.refreshConvertedMedia(dir,['img/pictures/old.jpg','img/pictures/Authored.jpg','img/pictures/Authored.png','audio/bgm/Song.mid','audio/bgm/Keep.mid','audio/bgm/Keep.ogg','movies/Sub/Intro.mp4']),3);
 assert.equal(fs.existsSync(path.join(dir,'img/pictures/Old.PNG')),false);assert.equal(fs.readFileSync(path.join(dir,'img/pictures/Authored.png'),'utf8'),'old');assert.equal(fs.existsSync(path.join(dir,'audio/bgm/Song.ogg')),false);assert.ok(fs.existsSync(path.join(dir,'audio/bgm/Keep.ogg')));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('timer branches compare the stored value while stopped, as RPG_RT does',()=>{
 const w=world();w.$gameTimer.rrLegacyControl(0,0,70,false,false);assert.equal(w.$gameTimer.isWorking(),false);
 const expr=C.convertList([cmd(12010,[2,60,0])],context()).list[0].parameters;assert.equal(expr[0],12);assert.equal(vm.runInContext(expr[1],w),true);
 w.$gameTimer.rrLegacyControl(0,0,0,false,false);const expired=C.convertList([cmd(12010,[2,1,1])],context()).list[0].parameters;assert.equal(vm.runInContext(expired[1],w),true);
});

test('a stale equipment id does not remove an unrelated weapon',()=>{
 const ctx=context();ctx.itemType=()=>0;const result=C.convertList([cmd(10450,[1,3,0,0,999])],ctx);assert.equal(result.list.filter(c=>c.code!==0).length,0);assert.equal(result.notes.invalidEquipment,1);
});

test('untranslated damage formulas are visible in the import report',()=>{
 const Report=require('../src/LegacyReportDialog.js');const rows=Report.summarize({approximations:{rubyFormula:5}});assert.ok(rows.some(([label,value])=>/Damage formulas/.test(label)&&value==='5'));
});
