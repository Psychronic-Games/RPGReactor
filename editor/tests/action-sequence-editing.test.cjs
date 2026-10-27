const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const B=require('../../runtime/reactor_battle_data.js');
function editor(clipboard){const C=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/database/DatabaseActionSequenceEditor.js'),'utf8')+'\nDatabaseActionSequenceEditor',{ReactorBattleData:B,ReactorClipboard:clipboard,window:{},console});const e=Object.create(C.prototype);e.sequence=B.template();e.selected=0;e.host={isConnected:true};e.parent={updateStatus(){}};e.ui={text:s=>s};return e;}
test('cut never deletes a step when the clipboard write fails or the step changed while writing',async()=>{
 let done;const e=editor({write:()=>new Promise(r=>done=r)});let deleted=0;e.deleteStep=()=>deleted++;
 let pending=e.copyStep(true);await Promise.resolve();await Promise.resolve();done(false);assert.equal(await pending,false);assert.equal(deleted,0);
 pending=e.copyStep(true);await Promise.resolve();await Promise.resolve();e.sequence.steps[0].duration++;done(true);assert.equal(await pending,true);assert.equal(deleted,0);
});
test('an asynchronous paste cannot write into a different sequence panel',async()=>{
 let done;const e=editor({read:()=>new Promise(r=>done=r)});let inserts=0;e.insertSteps=()=>inserts++;
 const pending=e.pasteStep();await Promise.resolve();await Promise.resolve();e.host={isConnected:true};e.sequence=B.template('Heal');done({payload:{version:1,steps:[B.step('wait')]}});assert.equal(await pending,false);assert.equal(inserts,0);
});
test('paste uses the captured insertion anchor and rejects unrelated or malformed data',async()=>{
 let payload={version:1,steps:[B.step('wait')]};const e=editor({read:async()=>({payload})});let at=-1;e.insertSteps=(rows,index)=>{at=index;return true;};
 e.selected=2;const pending=e.pasteStep();e.selected=5;assert.equal(await pending,true);assert.equal(at,3);
 payload={version:1,steps:[B.step('move',{x:Infinity})]};assert.equal(await e.pasteStep(),false);
});

test('editing a motion transform previews its final pose before any following instantaneous motion',()=>{
 const e=editor({});e.sequence={id:1,name:'Pose boundary',steps:[B.step('motion',{duration:10,transform:{x:2,rotateY:45}}),B.step('motion',{duration:0}),B.step('impact')]};
 e.selected=0;e.frame=10;e.controls={transformPose:e.sequence.steps[0]};e.playing=false;
 const context={homes:{user:{x:0,y:0,z:0}},direction:1};
 assert.equal(B.evaluate(e.previewSequence(),10,context).user.transform.x,2);
 assert.equal(B.evaluate(e.previewSequence(),10,context).user.transform.rotateY,45);
 e.playing=true;assert.equal(B.evaluate(e.previewSequence(),10,context).user.transform.x,0,'Full playback still advances to the next motion');
 e.playing=false;e.controls.transformPose=null;assert.equal(e.previewSequence(),e.sequence,'Ordinary scrubbing retains the full sequence');
});

test('a Move: Weapon step anchors its gizmo on the Show step it moves and previews at its end',()=>{
 const e=editor({});const show=B.step('weapon',{mode:'show',attachment:'rightHand',x:.5,rotation:-30}),move=B.step('weapon',{mode:'move',duration:6,x:.1});
 e.sequence={id:1,name:'Draw',steps:[B.step('motion',{duration:0}),show,move,B.step('wait',{duration:4})]};
 assert.equal(e.heldBase(show),show);assert.equal(e.heldBase(move),show,'A move keeps the hand and grip of the weapon it moves');
 assert.equal(e.heldBase(B.step('weapon',{visible:false})),null);
 e.clearPreviewMedia=()=>{};e.updateStepSelection=()=>{};e.drawInspector=()=>{};e.validate=()=>{};e.controls={modeSelect:{},setTool(){}};
 const cues=B.timeline(e.sequence);e.selectStep(2);assert.equal(e.frame,cues[2].end,'Selecting a weapon move shows where the move ends, under the gizmo');assert.equal(cues[2].end-cues[2].start,6);
 e.selectStep(1);assert.equal(e.frame,cues[1].start,'Showing a weapon previews at its own frame');
});

test('picking a rigged part on a Motion step that plays a clip turns the step into a pose of that part',()=>{
 const e=editor({});const step=B.step('motion',{motion:'missile',duration:8});e.sequence={id:1,name:'Aim',steps:[step]};e.selected=0;
 e.drawInspector=()=>{};e.paint=()=>{};e.showPoseFrame=()=>{};e.edit=fn=>fn();
 e.pickPosePart('RightUpperArm');
 assert.equal(step.motion,B.POSE_MOTION);assert.equal(step.parts.map(p=>p.part).join(),'RightUpperArm');assert.equal(e.posePartName,'RightUpperArm');
 e.pickPosePart('RightForeArm');assert.equal(step.parts.map(p=>p.part).join(),'RightUpperArm,RightForeArm','A second pick adds a part, the first stays');
 e.pickPosePart('RightUpperArm');assert.equal(step.parts.length,2,'Picking a posed part again only selects it');assert.equal(e.posePartName,'RightUpperArm');
 const wait=B.step('wait');e.sequence.steps.push(wait);e.selected=1;e.pickPosePart('Head');assert.equal(wait.parts,undefined,'Only Motion steps pose parts');
});

test('a projectile can be a 3D model or an animation, and validation asks for the missing pick',()=>{
 assert.ok(B.extraFields.projectile.find(f=>f.key==='iconSource').options.includes('model'));
 assert.ok(B.extraFields.projectile.find(f=>f.key==='iconSource').options.includes('animation'));
 const seq=id=>({...B.template('Projectile Shot'),steps:[B.step('projectile',{iconSource:id,duration:8})]});
 assert.ok(B.validateSequence(seq('model')).some(e=>/3D model/.test(e)),'a model projectile needs a model');
 assert.ok(B.validateSequence(seq('animation')).some(e=>/animation/.test(e)),'an animation projectile needs an animation');
 const good=seq('model');good.steps[0].model={name:'Weapons/Graviton Pistol',file:'Graviton_Pistol',ext:'.glb'};assert.ok(!B.validateSequence(good).some(e=>/3D model/.test(e)));
 const anim=seq('animation');anim.steps[0].animationId=1;assert.ok(!B.validateSequence(anim).some(e=>/animation/.test(e)));
});

test('the step picker asks which step to add and inserts the choice where it was opened',()=>{
 const dom=require('./helpers/mini-dom.cjs');
 const context=dom.createContext({ReactorBattleData:B,ReactorClipboard:{},RRKeyboardNavigation:{modal:(overlay,{onEscape})=>({entered:null,enter(el){el.focus();},leave(){},dispose(){this.disposed=true;},escape:onEscape})}});
 vm.createContext(context);const C=vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/database/DatabaseActionSequenceEditor.js'),'utf8')+'\nDatabaseActionSequenceEditor',context);
 const e=Object.create(C.prototype);e.sequence=B.template();e.selected=1;e.host={isConnected:true};e.parent={updateStatus(){}};
 const U={text:s=>s,element(tag,classes,text){const el=context.document.createElement(tag);el.className=classes||'';if(text!==undefined)el.textContent=text;return el;},button(label,fn){const b=U.element('button','rr-btn-secondary',label);b.type='button';b.onclick=fn;return b;}};e.ui=U;
 const inserted=[];e.insertSteps=(records,index)=>{inserted.push({records,index});return true;};
 const overlay=e.showStepPicker();
 assert.equal(overlay.parentNode===context.document.body,true,'the picker is a modal over the page');
 const items=overlay.querySelectorAll('.rr-step-picker-item');
 assert.ok(items.length>=B.types.length+B.basicSteps.length-1,'every step type and template is offered');
 const groups=overlay.querySelectorAll('.rr-step-picker-group');assert.ok(groups.length>=6,'steps are grouped');
 assert.ok(!items.some(item=>item.dataset.stepValue==='effect'),'the retired effect step is not offered');
 const values=items.map(item=>item.dataset.stepValue);assert.equal(new Set(values).size,values.length,'each capability is offered once');
 assert.ok(!values.includes('se')&&values.includes('se:system')&&values.includes('se:stop'),'the sound effect command appears only for what Play Sound cannot do');
 assert.ok(groups.every(group=>group.querySelector('.rr-step-picker-head')),'every group has a header bar');
 assert.ok(items.find(item=>item.dataset.stepValue==='leap').title,'look-alike steps carry a hint as a tooltip');
 const search=overlay.querySelector('.rr-step-picker-search');assert.equal(context.document.activeElement===search,true,'typing filters at once');
 search.value='proj';search.fire('input');
 const shown=items.filter(item=>!item.hidden);assert.deepEqual(shown.map(item=>item.dataset.stepValue),['projectile']);
 assert.ok(groups.filter(group=>!group.hidden).length===1,'groups with no matching step fold away');
 search.value='zzz';search.fire('input');assert.equal(overlay.querySelector('.rr-step-picker-empty').hidden,false);
 search.value='';search.fire('input');assert.equal(overlay.querySelector('.rr-step-picker-empty').hidden,true);
 items.find(item=>item.dataset.stepValue==='wait').onclick();
 assert.equal(overlay.parentNode===null,true,'choosing closes the picker');
 assert.equal(inserted.length,1);assert.equal(inserted[0].index,2,'the step lands below the selected one');assert.equal(inserted[0].records[0].type,'wait');
 // A phase head opens the picker for its own phase and slot; a template expands into its steps.
 const second=e.showStepPicker({phase:'finish',index:0});
 second.querySelectorAll('.rr-step-picker-item').find(item=>item.dataset.stepValue==='basic:Run to Target').onclick();
 assert.equal(inserted[1].index,0);assert.ok(inserted[1].records.length>1,'a template adds all of its steps');assert.ok(inserted[1].records.every(step=>step.phase==='finish'),'the steps belong to the phase whose + was clicked');
 // A folded entry starts the step on the operation it names.
 const sounds=e.showStepPicker();sounds.querySelectorAll('.rr-step-picker-item').find(item=>item.dataset.stepValue==='se:system').onclick();assert.equal(inserted[2].records[0].type,'se');assert.equal(inserted[2].records[0].operation,'system');
 // Escape closes without adding anything.
 const third=e.showStepPicker();third.querySelector('.rr-modal-close').fire('click');assert.equal(third.parentNode===null,true);assert.equal(inserted.length,3);
});

test('a phase head\'s buttons wrap together under a long name instead of running out of the step list', () => {
    const fs = require('node:fs'), path = require('node:path');
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');
    const editor = fs.readFileSync(path.join(__dirname, '..', 'src', 'database', 'DatabaseActionSequenceEditor.js'), 'utf8');
    assert.match(css, /\.rr-sequence-phase-head \{ display:flex;flex-wrap:wrap;/);
    assert.match(css, /\.rr-sequence-phase-actions \{ display:flex;gap:6px;margin-inline-start:auto; \}/);
    assert.match(editor, /const actions=U\.element\('span','rr-sequence-phase-actions'\);actions\.append\(add\);head\.append\(actions\);/);
    assert.match(editor, /inherit\.classList\.add\('rr-sequence-phase-inherit'\);.{0,200}actions\.append\(inherit\);/);
});

test('a pose step moves the weapon in the hand: a concurrent weapon move rides it over the same frames',()=>{
 const e=editor({});
 const show=B.step('weapon',{mode:'show',attachment:'rightHand',x:.5,z:.2,rotation:-30}),raise=B.step('weapon',{mode:'move',duration:4,x:.4,z:.6,rotation:20,rotateY:0,rotateZ:0,y:0,scale:1});
 const pose=B.step('motion',{motion:B.POSE_MOTION,duration:8,parts:[{part:'RightUpperArm',rotate:[-60,0,0]}]}),hide=B.step('weapon',{visible:false,duration:0}),after=B.step('motion',{motion:'idle',duration:6});
 e.sequence={version:1,id:1,name:'Swing',steps:[B.step('motion',{motion:'idle',duration:0}),show,raise,pose,hide,after]};
 // What is in hand as each step begins.
 assert.equal(e.heldStateBefore(1,'user'),null,'nothing before the weapon is shown');
 assert.equal(e.heldStateBefore(2,'user').x,.5);
 const before=e.heldStateBefore(3,'user');assert.deepEqual([before.x,before.z,before.rotation],[.4,.6,20],'a Move since the Show is laid over it');
 assert.equal(e.heldStateBefore(5,'user'),null,'and nothing once it is hidden');
 assert.equal(e.poseWeaponStep(pose),null);
 assert.equal(e.ensurePoseWeaponStep(after),null,'no weapon in hand: nothing to move');
 // Made for the pose: just before it, concurrent, as long as the pose, starting as the weapon already is.
 const errorsBefore=[...B.validateSequence(e.sequence)];
 e.selected=3;const rider=e.ensurePoseWeaponStep(pose);
 assert.equal(e.sequence.steps.indexOf(rider),3);assert.equal(e.sequence.steps.indexOf(pose),4);assert.equal(e.selected,4,'the pose stays the selected step');
 assert.equal(B.weaponMode(rider),'move');assert.equal(rider.concurrent,true);assert.equal(rider.duration,8);assert.equal(rider.withStep,pose.id);
 assert.deepEqual(B.heldKeys.map(k=>rider[k]),[.4,0,.6,20,0,0,1],'every held key, so the move changes nothing until one is edited');
 assert.equal(e.poseWeaponStep(pose),rider);assert.equal(e.ensurePoseWeaponStep(pose),rider,'made once');
 assert.deepEqual([...B.validateSequence(e.sequence)],errorsBefore,'ordinary steps: the rider adds nothing the game would refuse');
 const cues=B.timeline(e.sequence);
 assert.equal(cues[3].start,cues[4].start,'the weapon and the limbs start on the same frame');assert.equal(cues[3].end,cues[4].end,'and arrive together');
 assert.equal(cues[5].start,cues[4].end,'the next step waits for the pose, not twice as long');
 // The weapon's own state after the pose is what the rider says.
 rider.rotation=95;assert.equal(e.heldStateBefore(5,'user').rotation,95);
 // Deleting the pose takes the rider with it; an unrelated weapon step before a motion is left alone.
 e.edit=fn=>fn();e.refresh=()=>{};e.selectStep=()=>{};e.revealStep=()=>{};
 assert.equal(e.deleteStep(4),true);assert.ok(!e.sequence.steps.includes(rider)&&!e.sequence.steps.includes(pose));assert.equal(e.sequence.steps.length,5);
 assert.equal(e.poseWeaponStep(after),null,'the Hide before the next motion is not its rider');
 e.deleteStep(e.sequence.steps.indexOf(after));assert.ok(e.sequence.steps.includes(hide),'so deleting that motion keeps the Hide');
});

test('the sequence editor keeps the stage clear: the preview cast folds away, the wheel zooms, a drag on nothing turns the view',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/database/DatabaseActionSequenceEditor.js'),'utf8'),preview=fs.readFileSync(path.join(__dirname,'../src/database/ActionSequencePreview.js'),'utf8');
 assert.match(source,/castFold\.open=!!prefs\.castOpen/,'the cast is folded unless it was left open');
 assert.match(source,/castFold\.append\(cast\)/);
 assert.doesNotMatch(preview,/U\.button\('Zoom In'/,'no zoom buttons: the wheel zooms');
 assert.match(preview,/const hit=ring\|\|arrow\?key:this\.pickBattler\(event\);if\(!hit\)\{turnView\(\);return;\}/,'a press on nothing turns the view');
 // What a weapon or a motion step needs is in view; the rest waits under Advanced.
 assert.match(source,/U\.field\(advanced,'Phase'/);
 assert.match(source,/U\.field\(advanced,'Graphic'/);
 assert.match(source,/U\.field\(this\.inspector,'Held By'/);
 assert.match(source,/U\.field\(this\.inspector,'Held With'/);
 assert.match(source,/U\.field\(this\.inspector,'Aim'/);
 assert.match(source,/advanced\.append\(edit\)/,'Edit Model Poses is an advanced route');
});

test('a click picks a part of a posed skinned model: neither its rest sphere nor its rest box turns the ray away',()=>{
 const preview=fs.readFileSync(path.join(__dirname,'../src/database/ActionSequencePreview.js'),'utf8');
 // three tests a skinned mesh's ray against boundingSphere, then boundingBox when it is not null; both describe the rest pose.
 assert.match(preview,/skinned\.push\(\[o,o\.boundingSphere,o\.boundingBox\]\)/);
 assert.match(preview,/o\.boundingSphere=new THREE\.Sphere\(new THREE\.Vector3\(\),1e6\);o\.boundingBox=null;/);
 assert.match(preview,/finally\{for\(const \[o,sphere,box\] of skinned\)\{o\.boundingSphere=sphere;o\.boundingBox=box;\}\}/,'and both are put back');
});

test('a record that uses the sequence previews it as that record uses it: its skill or item, its weapon\'s attack, its battler',()=>{
 const e=editor({});e.sequence={id:35,name:'Sniper Shot',steps:[]};e.db={data:{skills:[null,{id:1,name:'Attack',animationId:-1},{id:2,name:'Headshot',animationId:129}],items:[],weapons:[null,{id:1,name:'Rifle',animationId:111}],actors:[null,{id:1,name:'Fleagus'}],enemies:[],states:[]}};
 e.cast={user:2,target:1};e.castKinds={user:'enemies',target:'enemies'};e.sampleAction='skills:1';e.sampleWeapon=0;
 const calls=[];for(const name of ['clearPreviewMedia','savePrefs','castSummarize','updateReferences','drawInspector','loadCast','paint'])e[name]=()=>calls.push(name);
 e.sampleActionSelect={value:''};e.sampleWeaponSelect={value:''};e.castSelects={user:{value:''}};
 e.previewAs({kind:'skills',id:2});assert.equal(e.sampleAction,'skills:2');assert.equal(e.sampleActionSelect.value,'skills:2');assert.ok(e.previewingAs({kind:'skills',id:2}));assert.equal(e.frame,0);
 e.previewAs({kind:'weapons',id:1});assert.equal(e.sampleAction,'skills:1','A weapon previews its attack');assert.equal(e.sampleWeapon,1);assert.equal(e.sampleWeaponSelect.value,'1');
 assert.ok(!e.previewingAs({kind:'skills',id:2}),'Only the record previewed is lit');
 calls.length=0;e.previewAs({kind:'actors',id:1});assert.deepEqual([e.castKinds.user,e.cast.user],['actors',1]);assert.equal(e.castSelects.user.value,'actors:1');assert.ok(calls.includes('loadCast'),'A new user is loaded');
 assert.equal(e.previewAsChoice({kind:'states',id:4}),null,'A state reaction has nothing the preview can stand in for');
 assert.equal(e.previewAsChoice({kind:'skills',id:99}),null,'A missing record is not offered');
});
