// Victor Engine Battle Motions notetags read into native sequences: the
// timing model (one frame per motion line, speed moves, waits), the subject
// grammar, the icon-run collapse into weapon steps, throws, graphics, and the
// whole Star Shift Rebellion database importing without an invalid record.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const B=require('../../runtime/reactor_battle_data.js'),V=require('../src/battle/VictorMotionImport.js');
const types=steps=>steps.map(s=>s.type+(s.duration?'('+s.duration+')':'')+(s.concurrent?'~':'')+(s.waitFor?'['+s.waitFor+']':''));

test('subjects follow Victor\'s grammar: groups, filters, numbered and other battlers',()=>{
 assert.deepEqual(V.subject('user'),{role:'user'});assert.deepEqual(V.subject('subjects'),{role:'subject'});
 assert.deepEqual(V.subject('all targets'),{role:'allTargets'});assert.deepEqual(V.subject('alive friends'),{role:'friends',filter:'alive'});
 assert.deepEqual(V.subject('random enemie'),{role:'enemies',filter:'random'});assert.deepEqual(V.subject('other actors'),{role:'actors',excludeUser:true});
 assert.deepEqual(V.subject('target 2'),{role:'target',targetIndex:1});assert.deepEqual(V.subject('actor 5'),{role:'actors',actorId:5});
 assert.deepEqual(V.subject('other party 1'),{role:'actors',memberIndex:0,excludeUser:true});
 assert.deepEqual(V.subject('all opponents',true),{role:'user'},'a reaction plays on its own battler only');
});

test('moves keep Victor\'s speed and front distance, and a wait for the move makes them blocking',()=>{
 const out=V.convertBlock(V.parseMotions('direction: user, up\nmotion: user, walk\nmove: user, to target, 6, -30 front\nwait: user, move\nmotion: user, reset'),{vertical:true});
 assert.deepEqual(out.notes,[]);
 const move=out.steps.find(s=>s.type==='move');
 assert.equal(move.anchor,'target');assert.equal(move.y,0.375,'48 px sprite height minus 30, below a target the battler faces up at');assert.equal(move.speed,2.4,'6 frames per 120 px is 2.4 per tile');
 assert.equal(move.concurrent,undefined,'the wait folds into the move');assert.deepEqual(types(out.steps),['direction','motion(1)','move(17)','motion(1)']);
 const side=V.convertBlock(V.parseMotions('move: user, to target, 12, front 80\nwait: user, move'),{vertical:false}).steps[0];
 assert.equal(side.x,-2.333,'a third of two 48 px widths plus the number');
 const back=V.convertBlock(V.parseMotions('move: user, backward, 15, 24\nwait: user, move')).steps[0];assert.equal(back.moveMode,'backward');assert.equal(back.x,0.5);assert.equal(back.duration,3,'0.5 tiles at 6 frames per tile');
 const snap=V.convertBlock(V.parseMotions('move: user, to home, 0')).steps[0];assert.equal(snap.speed||0,0);assert.equal(snap.duration,0);
});

test('a jump on the movement rides the move as an arc, and an unwaited move runs concurrently with a one-frame hold',()=>{
 const out=V.convertBlock(V.parseMotions('move: user, to home, 8\njump: user, 60, movement\nwait: user, move\nmotion: user, reset'));
 assert.deepEqual(types(out.steps),['move(22)','motion(1)']);assert.equal(out.steps[0].arc,1.25);
 const loose=V.convertBlock(V.parseMotions('move: user, to home, 12\nicon: user, clear, 2'));
 assert.deepEqual(types(loose.steps),['move(34)~','wait(1)','icon']);
 const later=V.convertBlock(V.parseMotions('move: user, forward, 15, 48\nwait: user, 5\nwait: user, move'));
 assert.deepEqual(types(later.steps),['move(6)~','wait(6)','wait[move]'],'a later wait for the move becomes a wait that the timeline resolves');
});

test('waits for a number, an animation and popups map onto blocking steps and completion flags',()=>{
 const out=V.convertBlock(V.parseMotions('animation: user, 110\nwait: user, animation\nwait: user, 8\nwait: user, popup\nwait: all targets, action'));
 assert.deepEqual(types(out.steps),['animation','wait(8)','wait[popup]']);assert.equal(out.steps[0].waitForCompletion,true);assert.equal(out.steps[0].animationId,110);
 const known=V.convertBlock(V.parseMotions('animation: user, 3\nmotion: user, walk\nwait: user, animation'),{animations:[null,null,null,{frames:[1,2,3,4,5]}]});
 assert.deepEqual(types(known.steps),['animation','motion(1)','wait(20)'],'a fixed animation waited for later becomes its length in frames');
});

test('a run of icon lines at changing offsets and angles becomes a weapon Show and tweened Moves, and its clear hides it',()=>{
 const note='motion: user, 1, 1, 120\nicon: user, equip 1, 2, 23, -23, 255, 120\nwait: user, 1\nicon: user, equip 1, 2, 23, -25, 255, 100\nwait: user, 1\nicon: user, equip 1, 2, 23, -28, 255, 80\nwait: user, 1\nicon: user, equip 1, 2, 21, -30, 255, 60\nwait: user, 1\nicon: user, equip 1, 2, 20, -32, 255, 40\nwait: user, 5\nse: play, blaster_05, 100, 150, 0\naction: all targets, effect\nwait: user, 40\nicon: user, clear, 2';
 const out=V.convertBlock(V.parseMotions(note));
 assert.deepEqual(types(out.steps),['motion(1)','weapon','weapon(4)','wait(5)','se','effect','wait(40)','weapon']);
 const [,show,move,,,,,hide]=out.steps;
 assert.equal(show.mode,'show');assert.equal(show.iconSource,'weapon');assert.equal(show.attachment,'offset');assert.equal(show.x,0.479);assert.equal(show.z,0.479);assert.equal(show.rotation,120);
 assert.equal(move.mode,'move');assert.equal(move.rotation,40);assert.equal(move.easing,'linear');assert.equal(move.x,0.417);assert.equal(move.z,0.667);
 assert.equal(hide.mode,'hide');assert.equal(hide.visible,false);
 assert.equal(out.steps[0].motionIndex,1);assert.equal(out.steps[0].motionFrames,1);assert.equal(out.steps[0].motionSpeed,120);
 // A flip-book of different icons at one spot stays icons.
 const book=V.convertBlock(V.parseMotions('icon: user, icon 347, 2, 0, -170, 255, 0\nwait: user, 2\nicon: user, icon 348, 2, 0, -170, 255, 0\nwait: user, 2\nicon: user, clear, 2'));
 assert.deepEqual(types(book.steps),['icon','wait(2)','icon','wait(2)','icon']);assert.equal(book.steps[0].iconIndex,347);assert.equal(book.steps[0].layer,'below');
});

test('a record becomes one phased sequence with Victor\'s effect, throws fly before the effect, and states become reactions',()=>{
 const record={id:1,name:'G1 — Railgun \\i[315]',note:'<throw object: before>\n image: icon 404\n duration: 15\n arc: 0\n start: 22, -10\n</throw object>\n<action sequence: movement>\ndirection: user, up\nmove: user, to target, 6, 100 front\nwait: user, move\n</action sequence>\n<action sequence: execute>\nse: play, blaster_05\naction: all targets, effect\nwait: user, 10\n</action sequence>\n<action sequence: damage>\nmotion: subject, damage\nanimation: subject, 138\nmove: subject, backward, 15, 24\nwait: subject, move\n</action sequence>'};
 const out=V.convertRecord(record,{vertical:true});
 assert.deepEqual(Object.keys(out.phases).sort(),['effect','execute','movement']);
 assert.deepEqual(types(out.phases.execute),['se','projectile(15)','effect','wait(10)']);assert.equal(out.phases.execute[1].iconIndex,404);assert.equal(out.phases.execute[1].x,0.458);
 assert.deepEqual(types(out.phases.effect),['animation','impact','wait[popup]']);assert.equal(out.phases.effect[0].waitForCompletion,true);
 assert.ok(out.states.damage.every(s=>s.role==='user'));assert.equal(out.states.damage[1].animationId,138);
 const sequence=V.sequenceFromPhases(out.phases,'G1');assert.deepEqual(B.validateSequence(sequence),[]);assert.deepEqual(B.sequencePhases(sequence),['movement','execute','effect']);
 assert.deepEqual(B.validateSequence(V.stateSequence(out.states.damage,'G1 · damage')),[]);
 // Stray ends and a missing end are forgiven the way Victor forgave them.
 const stray=V.convertBlock(V.parseMotions('wait: user, 5\naction: all targets, effect\nend'));assert.deepEqual(types(stray.steps),['wait(5)','effect']);
 const open=V.convertBlock(V.parseMotions('if: action.isStepForward()\nmove: user, forward, 15, 48\nwait: user, move'));assert.equal(open.steps.at(-1).type,'end');
});

test('actor and enemy graphics follow Victor\'s charset mode and sprite motion setups',()=>{
 const actor={id:1,characterName:'$Hero',characterIndex:0,note:'<hide shadows>'},enemy={id:1,battlerName:'!$Robot-004',note:"<sprite motion: '!$Robot-004'>\nidle: index: 1, loop: true, speed: 6\n</sprite motion>\n<charset index: 3>"};
 const a=V.actorGraphic(actor);assert.equal(a.mode,'character');assert.equal(a.name,'$Hero');assert.equal(a.hideShadow,true);assert.deepEqual(a.motions.idle,{loop:false,speed:9999});
 const e=V.enemyGraphic(enemy);assert.equal(e.name,'!$Robot-004');assert.equal(e.index,3);assert.deepEqual(e.motions.idle,{loop:true,speed:6,index:0});
 assert.equal(V.enemyGraphic({id:2,battlerName:'Slime',note:''}),null,'a static battler stays static');
 const walk=t=>B.graphicFrame({type:'character',name:'!$Robot-004',frames:3,motions:e.motions},144,192,'idle',t,0).x;assert.deepEqual([walk(0),walk(6),walk(12),walk(18),walk(24)],[0,48,96,48,0],'a looping sheet walks 0,1,2,1');
 const still=B.graphicFrame({type:'character',name:'$Hero',frames:3,motions:a.motions},144,192,'idle',500,180);assert.equal(still.x,48,'a still sheet stands on its middle column');assert.equal(still.y,144,'facing up picks the top row');
});

test('the whole Star Shift Rebellion database imports into valid, resolvable sequences',()=>{
 const dir=path.join(__dirname,'../../template/Star Shift Rebellion/data'),read=name=>JSON.parse(fs.readFileSync(path.join(dir,name+'.json'),'utf8'));
 const data={actors:read('Actors'),classes:read('Classes'),enemies:read('Enemies'),weapons:read('Weapons'),armors:read('Armors'),skills:read('Skills'),items:read('Items'),animations:read('Animations'),system:read('System')};
 const {sequences,settings,report}=V.importDatabase(data,{vertical:true,animations:data.animations});
 assert.ok(report.records>900,'records '+report.records);assert.ok(report.sequences>200&&report.sequences<400,'shared sequences '+report.sequences);
 // Like records share: every pistol takes the one Pistol choreography, and the sixty-odd throwable items whose throw shows their own icon share one sequence.
 const pistols=data.weapons.filter(w=>w&&w.wtypeId===10&&settings.weapons[w.id]?.mode==='sequence'),pistolSeq=new Set(pistols.map(w=>settings.weapons[w.id].sequenceId));assert.ok(pistols.length>10);assert.equal(pistolSeq.size,1,'one sequence for the pistol type');assert.match(sequences[[...pistolSeq][0]].name,/^Pistol attack \u00b7 \d+ weapons$/);
 const itemSeqs=Object.values(settings.items).filter(b=>b.mode==='sequence').map(b=>b.sequenceId),medkit=itemSeqs.filter(id=>id===settings.items[2].sequenceId).length;assert.ok(medkit>50,'Med Kit-style items share: '+medkit);assert.equal(sequences[settings.items[2].sequenceId].steps.find(st=>st.type==='projectile').iconSource,'action');
 assert.equal(new Set(itemSeqs).size<25,true,'items collapse to a few choreographies: '+new Set(itemSeqs).size);
 for(const s of sequences.slice(1))assert.deepEqual(B.validateSequence(s),[],s.id+' '+s.name);
 assert.equal(B.validateStore(sequences,settings),true);
 const unsupported=report.notes.filter(n=>/not supported/.test(n));assert.deepEqual(unsupported,[],'every motion the notes use is understood');
 // A weapon attack by a charset actor resolves with the weapon's execute, the actor's movement and Victor's effect.
 const actor=settings.actors[1],weapon=settings.weapons[1];assert.equal(actor.graphic.mode,'character');assert.equal(weapon.mode,'sequence');
 const resolved=B.resolvePresentation(settings,sequences,{kind:'skills',itemId:1,isAttack:true,weaponIds:[1],classId:4,battlerKind:'actors',battlerId:1});
 assert.equal(resolved.missing,undefined);assert.equal(resolved.phases.find(p=>p.phase==='execute').source.kind,'weapons');assert.equal(resolved.phases.find(p=>p.phase==='return').source.kind,'weapons','the railgun brings its own return');assert.equal(resolved.phases.find(p=>p.phase==='finish').source.kind,'actors');
 assert.equal(resolved.sequence.steps.filter(s=>s.type==='impact').length,1);assert.ok(resolved.sequence.steps.some(s=>s.type==='projectile'));
 assert.ok(settings.actors[1].states.damage&&settings.actors[1].states.entry&&settings.enemies[1].states.damage);
 assert.equal(settings.enemies[1].graphic.name,'!$Robot-004');
});
