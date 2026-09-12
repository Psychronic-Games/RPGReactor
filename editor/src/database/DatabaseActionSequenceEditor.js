/* Built-in sequence authoring: steps and timeline are views of the same data. */
class DatabaseActionSequenceEditor {
    constructor(parent) {this.parent=parent;this.ui=parent.battlePresentationEditor;this.db=parent.databaseManager;}
    dispose(){this.clearPreviewMedia();this.audioContext?.close().catch(()=>{});this.audioContext=null;if(this.stepLanguageChanged)window.removeEventListener('rr-language-changed',this.stepLanguageChanged);this.stepLanguageChanged=null;this.endStepDrag();if(this.stepMenu&&this.parent._databaseActionMenu===this.stepMenu)this.parent.closeDatabaseActionMenu();this.stepMenu=null;this.controls?.dispose();this.controls=null;cancelAnimationFrame(this.raf);this.raf=0;this.playing=false;this.grid?.geometry.dispose();this.grid?.material.dispose();this.grid=null;this.preview?.dispose();this.preview=null;for(const audio of this.sounds||[])audio.pause();this.sounds=[];this.generation=(this.generation||0)+1;}
    show(container,sequence){
        this.dispose();this.stepPlayback=null;this.sequence=sequence;this.selected=0;this.frame=0;this.undo=[];this.redo=[];this.disclosures=new Map();this.cast={user:1,target:1};this.castKinds={user:'actors',target:'enemies'};this.mirrored=false;this.images={};this.targetCount=1;this.sampleWeapon=0;
        const prefs=this.loadPrefs();
        const U=this.ui,B=ReactorBattleData;this.host=U.element('div','rr-sequence-editor');container.append(this.host);
        const toolbar=U.element('div','rr-battle-toolbar rr-sequence-header');this.host.append(toolbar);
        const name=U.element('input','database-field-value');name.value=sequence.name;name.setAttribute('aria-label','Name');name.onchange=()=>{this.edit(()=>sequence.name=name.value);this.parent._activeDatabaseList?.refresh();};toolbar.append(name);
        // An older whole action shows its steps under Execute with every phase provided; saved with the next edit.
        B.migratePhases(sequence);
        const impact=U.field(toolbar,'Hits',U.select([['once','Hits: the skill decides (one Apply Action Effect)'],['authored','Hits: each Apply Action Effect lands once']],sequence.hitPolicy||'once',value=>this.edit(()=>sequence.hitPolicy=value)));impact.setAttribute('aria-label',U.text('Hits'));impact.title=U.text('How many times the action hits: the skill’s own repeat count through one Apply Action Effect, or exactly one hit per Apply Action Effect step you place.');
        toolbar.append(U.button('Undo',()=>this.history(this.undo,this.redo)),U.button('Redo',()=>this.history(this.redo,this.undo)));
        // What the preview stands in for: the skill or item being used, the
        // weapon in hand and the projection. Preview only, remembered.
        this.previewProjection||='3d';
        const sampleActions=[...(this.db.data.items||[]).filter(Boolean).map(r=>['items:'+r.id,U.message('Item: {name}',{name:r.name})]),...(this.db.data.skills||[]).filter(Boolean).map(r=>['skills:'+r.id,U.message('Skill: {name}',{name:r.name})])];const assigned=B.references(this.ui.settings(),sequence.id,this.db.data.actionSequences).find(r=>['skills','items'].includes(r.kind)),itemAction=sequence.steps.some(s=>s.iconSource==='action');this.sampleAction=sampleActions.some(([id])=>id===prefs.sampleAction)?prefs.sampleAction:assigned?assigned.kind+':'+assigned.id:sampleActions.find(([id])=>id.startsWith(itemAction?'items:':'skills:'))?.[0]||sampleActions[0]?.[0]||'skills:1';
        const weaponChoices=[['','Equipped'],...(this.db.data.weapons||[]).filter(w=>w&&w.name).map(w=>[w.id,w.name,true])];
        const workspace=U.element('div','rr-battle-workspace');this.host.append(workspace);const center=U.element('div','rr-sequence-center');workspace.append(center);const inspectorCard=U.section('Battler Motion');inspectorCard.panel.classList.add('rr-sequence-inspector-card');this.inspectorHeader=inspectorCard.panel.querySelector('.database-section-header');this.inspector=inspectorCard.body;this.inspector.classList.add('rr-battle-inspector');workspace.append(inspectorCard.panel);
        // One grid for the preview's cast and stand-ins: two aligned rows of four, not three toolbars.
        const cast=U.element('div','rr-sequence-preview-grid rr-sequence-cast');cast.dataset.sequenceCast='';center.append(cast);
        const actors=this.db.getActors(),enemies=this.db.getEnemies();
        // The remembered cast stands only while those records still exist.
        const exists=role=>this.castKinds[role]==='actors'?this.db.getActor(this.cast[role]):this.db.getEnemy(this.cast[role]);
        if(!exists('user')){this.castKinds.user='actors';this.cast.user=actors[0]?.id;}if(!exists('target')){this.castKinds.target='enemies';this.cast.target=enemies[0]?.id;}
        const choices=actors.map(a=>['actors:'+a.id,U.message('Actor: {name}',{name:a.name})]).concat(enemies.map(e=>['enemies:'+e.id,U.message('Enemy: {name}',{name:e.name})]));
        const castHint=U.text('Preview cast only. In battle, whichever battler uses this sequence plays it.');
        for(const role of ['user','target']){const select=U.field(cast,role==='user'?'User':'Target',U.select(choices,this.castKinds[role]+':'+this.cast[role],value=>{const [kind,id]=value.split(':');this.castKinds[role]=kind;this.cast[role]=Number(id);this.savePrefs();this.loadCast();}));select.title=castHint;select.parentElement.title=castHint;}
        U.field(cast,'Skill / Item',U.select(sampleActions,this.sampleAction,value=>{this.clearPreviewMedia();this.sampleAction=value;this.frame=0;this.playing=false;this.savePrefs();}));
        U.field(cast,'Weapon in Hand',U.select(weaponChoices,this.sampleWeapon||'',value=>{this.sampleWeapon=Number(value)||0;this.weaponModels={};this.savePrefs();this.drawInspector();this.paint();}));
        U.field(cast,'Targets',U.select([[1,'1'],[2,'2'],[3,'3'],[4,'4']],this.targetCount,value=>{this.targetCount=Number(value);this.savePrefs();this.controls.targetsChanged();this.drawInspector();}));
        const mirror=U.element('input');mirror.type='checkbox';mirror.checked=!!this.mirrored;mirror.onchange=()=>{this.mirrored=mirror.checked;this.savePrefs();};U.field(cast,'Swap Sides',mirror).parentElement.classList.add('rr-sequence-preview-check');
        // Scenery: the plain grid, a battleback pair, or a troop's battle room.
        this.scene||={kind:'grid'};const path=require('path'),projectPath=this.parent.currentProject.path;
        const floors=RRAssetFiles.listNames(path.join(projectPath,'img/battlebacks1'),['.png']),walls=RRAssetFiles.listNames(path.join(projectPath,'img/battlebacks2'),['.png']);
        const rooms=Object.entries(U.settings().troops||{}).filter(([,t])=>t?.type==='room'&&t.mapId).map(([id])=>[ 'troop:'+id,U.message('Room: {name}',{name:this.db.data.troops?.[id]?.name||'#'+id})]);
        const sceneChoices=[['grid','Grid'],...(floors.length||walls.length?[['battleback','Battleback']]:[]),...rooms];
        const sceneValue=this.scene.kind==='troop'?'troop:'+this.scene.id:this.scene.kind;
        U.field(cast,'Scene',U.select(sceneChoices,sceneChoices.some(c=>c[0]===sceneValue)?sceneValue:'grid',value=>{this.scene=value.startsWith('troop:')?{kind:'troop',id:Number(value.slice(6))}:{kind:value,floor:this.scene.floor,wall:this.scene.wall};backdrop.style.display=value==='battleback'?'':'none';this.savePrefs();this.loadCast();}));
        U.field(cast,'Projection',U.select([['3d','3D',true],['2d','2D',true]],this.previewProjection,value=>{this.previewProjection=value;this.savePrefs();this.loadCast();}));
        const backdrop=U.element('div','rr-sequence-backdrop');cast.append(backdrop);backdrop.style.display=this.scene.kind==='battleback'?'':'none';
        U.field(backdrop,'Floor',U.select([['','None'],...floors.map(f=>[f,f,true])],this.scene.floor||'',value=>{this.scene.floor=value;this.savePrefs();this.loadCast();}));
        U.field(backdrop,'Wall',U.select([['','None'],...walls.map(f=>[f,f,true])],this.scene.wall||'',value=>{this.scene.wall=value;this.savePrefs();this.loadCast();}));
        const castHelp=U.element('p','rr-battle-help rr-sequence-cast-help','Preview only, remembered per sequence. In battle, whichever battler uses this sequence plays it.');cast.append(castHelp);
        this.stage=U.element('div','rr-sequence-stage');
        this.canvas=U.element('canvas','rr-sequence-preview');this.canvas.width=720;this.canvas.height=340;this.stage.append(this.canvas);
        this.controls=new ActionSequencePreview(this);if(prefs.distance>0)this.controls.distance=prefs.distance;this.controls.follow=!!prefs.follow;this.controls.orbit=prefs.orbit;this.controls.pan=prefs.pan||{x:0,y:0};this.controls.toolbar(center);center.append(this.stage);
        const playback=U.element('div','rr-battle-toolbar rr-sequence-playback');center.append(playback);
        playback.append(U.button('Play Step',()=>this.playStep()),U.button('Play / Pause',()=>{this.controls.transformPose=null;this.stepPlayback=null;this.asOfStep=false;if(!this.playing&&this.frame>=B.duration(sequence)){this.clearPreviewMedia();this.frame=0;}this.playing=!this.playing;}),U.button('Reset',()=>{this.clearPreviewMedia();this.controls.transformPose=null;this.stepPlayback=null;this.asOfStep=false;this.playing=false;this.frame=0;}),U.button('Previous Frame',()=>{this.controls.transformPose=null;this.stepPlayback=null;this.asOfStep=false;this.playing=false;this.frame=Math.max(0,this.frame-1);}),U.button('Next Frame',()=>{this.controls.transformPose=null;this.stepPlayback=null;this.asOfStep=false;this.playing=false;this.frame=Math.min(B.duration(sequence),this.frame+1);}));
        this.loop=false;const loop=U.element('input');loop.type='checkbox';loop.onchange=()=>this.loop=loop.checked;U.field(playback,'Loop',loop);
        this.speed=1;U.field(playback,'Speed',U.select([[.25,'¼×'],[.5,'½×'],[1,'1×'],[2,'2×']],1,value=>this.speed=Number(value)));
        this.scrub=U.element('input','rr-sequence-scrub');this.scrub.type='range';this.scrub.min=0;this.scrub.step=1;this.scrub.oninput=()=>{this.clearPreviewMedia();this.controls.transformPose=null;this.stepPlayback=null;this.asOfStep=false;this.frame=Number(this.scrub.value);this.playing=false;};center.append(this.scrub);
        this.time=U.element('span','rr-battle-help');center.append(this.time);
        const timeline=U.section('Action Steps');timeline.panel.classList.add('rr-sequence-timeline-card');workspace.prepend(timeline.panel);
        const modes=U.element('div','rr-battle-toolbar rr-sequence-step-modes');
        // Starters replace every step with a ready-made sequence; Phases adds a section or sorts the steps into them. Menus, so nothing is preselected.
        const starters=U.button('Starters…',event=>this.showStarterMenu(event.currentTarget));starters.title=U.text('Replace all steps with a starter sequence');modes.append(starters);
        const phasesButton=U.button('Phases…',event=>this.showPhaseMenu(event.currentTarget));phasesButton.title=U.text('Add a phase section, or sort the steps into phases automatically');phasesButton.dataset.sequencePhases='';modes.append(phasesButton);this.phasesButton=phasesButton;timeline.body.append(modes);
        this.steps=U.element('div','rr-sequence-steps rr-accent-scrollbar');timeline.body.append(this.steps);this.stepLanguageChanged=()=>{this.groupStepChoices();this.drawSteps();this.drawInspector();this.validate();this.updateReferences();};window.addEventListener('rr-language-changed',this.stepLanguageChanged);
        const add=U.element('div','rr-battle-toolbar');this.stepType=U.select([...B.basicSteps.map(t=>['basic:'+t,t]),...B.types.map(t=>[t,this.label(t)])],'basic:Run to Target',()=>{});const addButton=U.button('Add Step',()=>this.insertSteps(this.newSteps()));add.append(this.stepType,addButton);timeline.body.append(add);this.groupStepChoices();
        this.bindStepEditing(timeline.panel,addButton);
        this.validation=U.element('p','rr-battle-help');this.host.append(this.validation);
        const footer=U.element('div','rr-battle-toolbar rr-sequence-footer');this.host.append(footer);
        const kind=U.field(footer,'Used As',U.select(B.kinds,['motion','routine'].includes(B.purpose(sequence))?B.purpose(sequence):'action',value=>{this.edit(()=>{sequence.purpose=value;if(value==='action')B.migratePhases(sequence);});this.updateReferences();this.drawSteps();this.drawInspector();this.phasesButton.hidden=value!=='action';}));kind.title=U.text('Used As');
        this.references=U.element('p','rr-battle-help');footer.append(this.references);this.updateReferences();this.phasesButton.hidden=B.purpose(sequence)!=='action';
        this.refresh();this.loadCast();let last=performance.now();
        const tick=now=>{if(!this.host.isConnected)return;
            const dt=Math.min(100,now-last);last=now;
            for(const audio of this.sounds){if(!this.playing&&!audio.paused)audio.pause();else if(this.playing&&audio.paused&&!audio.ended)audio.play().catch(()=>{});}
            for(const entry of this.animationLayers||[]){entry.layer.paused=!this.playing;entry.layer.speed=this.speed;}
            if(this.playing)this.advancePreview(dt/1000*60*this.speed);
            if(this.preview)this.preview.effectsDelta=dt/1000*60*this.speed;
            this.paint();this.raf=requestAnimationFrame(tick);
        };this.raf=requestAnimationFrame(tick);

    }
    /** Preview choices live with the project, per sequence, and outlive a restart; nothing here reaches the game. */
    prefsKey(){const path=this.parent.currentProject?.path;return path&&typeof localStorage!=='undefined'?'rrSequencePreview:'+path:null;}
    readPrefs(){const key=this.prefsKey();if(!key)return {};try{const all=JSON.parse(localStorage.getItem(key)||'{}');return all&&typeof all==='object'?all:{};}catch(error){return {};}}
    loadPrefs(){
        const all=this.readPrefs(),shared=all.shared||{},mine=all.sequences?.[this.sequence.id]||{};
        if(['3d','2d'].includes(shared.projection))this.previewProjection=shared.projection;
        if(shared.scene&&typeof shared.scene==='object'&&shared.scene.kind)this.scene=JSON.parse(JSON.stringify(shared.scene));
        for(const role of ['user','target']){const kind=mine.castKinds?.[role],id=Number(mine.cast?.[role]);if(['actors','enemies'].includes(kind)&&id>0){this.castKinds[role]=kind;this.cast[role]=id;}}
        if([1,2,3,4].includes(mine.targetCount))this.targetCount=mine.targetCount;
        this.mirrored=!!mine.mirrored;if(Number(mine.sampleWeapon)>0&&this.db.getWeapon(Number(mine.sampleWeapon)))this.sampleWeapon=Number(mine.sampleWeapon);
        const orbit=shared.orbit&&Number.isFinite(shared.orbit.yaw)&&Number.isFinite(shared.orbit.pitch)?{yaw:shared.orbit.yaw,pitch:shared.orbit.pitch}:null,pan=shared.pan&&Number.isFinite(shared.pan.x)&&Number.isFinite(shared.pan.y)?{x:shared.pan.x,y:shared.pan.y}:null;
        return {sampleAction:typeof mine.sampleAction==='string'?mine.sampleAction:null,distance:Number(shared.distance)||0,follow:!!shared.follow,orbit,pan};
    }
    savePrefs(){
        const key=this.prefsKey();if(!key||!this.sequence)return;const all=this.readPrefs();
        all.shared={projection:this.previewProjection,scene:this.scene,distance:this.controls?.distance,follow:!!this.controls?.follow,orbit:this.controls?.orbit||null,pan:this.controls?.pan||null};
        (all.sequences||={})[this.sequence.id]={castKinds:{...this.castKinds},cast:{...this.cast},targetCount:this.targetCount,mirrored:!!this.mirrored,sampleWeapon:this.sampleWeapon||0,sampleAction:this.sampleAction};
        try{localStorage.setItem(key,JSON.stringify(all));}catch(error){/* storage refused: the choices still stand for this session */}
    }
    showStarterMenu(anchor){
        const B=ReactorBattleData,U=this.ui,sequence=this.sequence,host=this.host,rect=anchor.getBoundingClientRect(),purpose=B.purpose(sequence);
        const apply=steps=>{if(this.host!==host||!host.isConnected)return;this.edit(()=>sequence.steps=steps);this.selected=0;this.drawSteps();this.drawInspector();this.selectStep(0);this.revealStep();};
        const items=purpose==='action'?B.templates.map(name=>({label:U.text(name),action:()=>apply(B.template(name).steps)}))
            :purpose==='motion'?[{label:U.text('Idle motion'),action:()=>apply([B.step('motion',{motion:'idle',duration:60})])}]
            :[{label:U.text('Default for this phase'),action:()=>apply(B.defaultPhase(purpose,{isAttack:true}).steps)}];
        this.parent.showDatabaseActionMenu(rect.left,rect.bottom+2,items);this.stepMenu=this.parent._databaseActionMenu;
    }
    /** Phase sections an action sequence does not yet provide, and the automatic sort. */
    showPhaseMenu(anchor){
        const B=ReactorBattleData,U=this.ui,sequence=this.sequence,host=this.host,rect=anchor.getBoundingClientRect(),provided=B.sequencePhases(sequence);
        const items=B.actionPhases.filter(([id])=>!provided.includes(id)).map(([id,label,help])=>({label:U.text(U.message('Add {phase}',{phase:U.text(label)})),action:()=>{if(this.host!==host||!host.isConnected)return;this.edit(()=>{sequence.phases=B.phaseIds().filter(p=>provided.includes(p)||p===id);});this.drawSteps();}}));
        items.push({separator:true},{label:U.text('Sort steps into phases automatically'),action:()=>{if(this.host!==host||!host.isConnected)return;this.edit(()=>{sequence.steps=B.autoPhases(sequence.steps);sequence.phases=B.phaseIds().filter(p=>provided.includes(p)||sequence.steps.some(s=>B.stepPhase(s)===p));});this.drawSteps();this.drawInspector();}});
        this.parent.showDatabaseActionMenu(rect.left,rect.bottom+2,items);this.stepMenu=this.parent._databaseActionMenu;
    }
    /** Take a provided-but-empty phase away: it inherits again. */
    inheritPhase(phase){const B=ReactorBattleData,sequence=this.sequence;if(B.phaseSteps(sequence,phase).length)return;this.edit(()=>{sequence.phases=B.sequencePhases(sequence).filter(p=>p!==phase);});this.drawSteps();}
    updateReferences(){const refs=ReactorBattleData.references(this.ui.settings(),this.sequence.id,this.db.data.actionSequences);this.ui.setText(this.references,refs.length?this.ui.message('Used by: {records}',{records:refs.map(r=>(window.I18n?.tDbType(r.kind)||r.kind)+' #'+r.id+(r.slot?' · '+r.slot:'')).join(', ')}):'Assign this sequence from a skill, item, weapon, actor or enemy. Previewing never applies damage or changes game state.');}
    motionLabels(){return {...Object.fromEntries(ReactorBattleData.battlerStates),return:'Return',thrust:'Thrust',swing:'Swing',missile:'Missile',skill:'Skill',item:'Item',idle:'Idle',run:'Run',walk:'Walk',punch:'Punch',attack:'Attack',cast:'Cast',guard:'Guard',damage:'Damage',evade:'Evade',victory:'Victory',escape:'Escape'};}
    label(type){return {move:'Move / Position Key',motion:'Battler Motion',sound:'Play Sound',animation:'Show Animation',projectile:'Projectile',weapon:'Weapon',impact:'Apply Action Effect',effect:'Play Effect Phase',wait:'Wait',camera:'Camera Key'}[type]||ReactorBattleData.commands[type]?.label||type;}
    pushUndo(){this.undo.push(JSON.stringify(this.sequence));if(this.undo.length>100)this.undo.shift();this.redo=[];}
    edit(fn){this.clearPreviewMedia();this.stepPlayback=null;this.playing=false;this.pushUndo();fn();this.ui.changed();this.validate();}
    history(from,to){if(!from.length)return;this.clearPreviewMedia();this.stepPlayback=null;this.playing=false;to.push(JSON.stringify(this.sequence));const next=JSON.parse(from.pop());for(const key of Object.keys(this.sequence))delete this.sequence[key];Object.assign(this.sequence,next);this.selected=Math.min(this.selected,this.sequence.steps.length-1);if(this.controls?.transformPose){const step=this.sequence.steps[this.selected];this.controls.transformPose=step?.type==='motion'&&step.transform?step:null;if(this.controls.transformPose)this.controls.showTransformPose(step);}this.ui.changed();this.refresh();}
    validate(){const B=ReactorBattleData,errors=B.validateSequence(this.sequence);try{B.expandCalls(this.sequence,this.db.data.actionSequences);}catch(error){errors.push(error.message);}
        if(this.validation){let ready=this.ui.text(this.sequence.hitPolicy==='authored'?'Ready. Each impact applies one hit to its selected battlers. Skill repeats are not added.':'Ready to use. Apply Action Effect uses the skill’s existing targeting, damage and repeats.');
            if(B.purpose(this.sequence)==='action'){const missing=B.phaseIds().filter(p=>!B.sequencePhases(this.sequence).includes(p));if(missing.length)ready+=' '+this.ui.text(this.ui.message('{phases}: not in this sequence, so they come from the next level down or the built-in action.',{phases:missing.map(p=>this.ui.text(B.actionPhases.find(([id])=>id===p)[1])).join(', ')}));}
            this.validation.textContent=errors.map(error=>this.ui.text(error)).join(' ')||ready;}
        this.updateStepDescriptions();}
    refresh(){this.drawSteps();this.drawInspector();this.validate();}
    previewSequence(){
        let index=this.stepPlayback?.index??this.previewWaitIndex;
        const selected=this.sequence.steps[this.selected];
        // A selected step is shown as of that step: nothing that starts on the
        // same frame but comes later in the list has happened yet, so a
        // weapon shown by the next step is not already in the hand.
        if(index===undefined&&!this.playing&&selected&&(this.asOfStep||this.controls?.transformPose===selected||ReactorBattleData.hasPose(selected))&&this.frame===ReactorBattleData.timeline(this.sequence)[this.selected].end)index=this.selected;
        const sequence=index===undefined?this.sequence:{...this.sequence,steps:this.sequence.steps.slice(0,index+1)};
        if(sequence.steps.some(s=>['action','branch'].includes(s.type)))try{return ReactorBattleData.previewPlan(sequence,this.db.data.actionSequences);}catch(error){return sequence;}return sequence;
    }
    playStep(){
        const cue=ReactorBattleData.timeline(this.sequence)[this.selected];if(!cue)return;
        this.selectStep(this.selected);
        for(const sound of this.sounds||[])sound.pause();this.sounds=[];
        if(this.preview){for(const play of this.preview.effectPlays.values())this.preview.stopEffect(play);this.preview.effectPlays.clear();}
        // Instant motion cues need a short viewing interval to show their clip.
        this.stepPlayback={index:this.selected,start:cue.start,end:cue.end>cue.start?cue.end:cue.start+(cue.step.type==='motion'?60:1)};
        this.frame=cue.start;this.playing=true;this.paint();
    }
    selectStep(index){
        const cue=ReactorBattleData.timeline(this.sequence)[index];if(!cue)return;
        this.clearPreviewMedia();this.stepPlayback=null;if(this.selected!==index)this.posePartName=null;this.selected=index;this.frame=['move','motion'].includes(cue.step.type)||cue.step.type==='weapon'&&ReactorBattleData.weaponMode(cue.step)==='move'?cue.end:cue.start;this.asOfStep=true;this.controls.mode='step';this.controls.modeSelect.value='step';this.controls.freeScale=false;this.controls.transformPose=cue.step.type==='motion'&&cue.step.transform?cue.step:null;if(this.controls.transformPose)this.controls.setTool('rotate');this.playing=false;this.updateStepSelection();this.drawInspector();this.validate();
    }
    revealStep(){const row=this.stepRows()[this.selected];(row||this.steps).focus({preventScroll:true});row?.scrollIntoView({block:'nearest',inline:'nearest'});}
    newSteps(value=this.stepType.value,phase){const B=ReactorBattleData;const made=value.startsWith('basic:')?B.basic(value.slice(6)):[B.step(value,value==='weapon'?{duration:0,x:0,z:0,attachment:'rightHand'}:{})];
        if(B.purpose(this.sequence)!=='action')return made;const at=phase||B.stepPhase(this.sequence.steps[this.selected]||{phase:B.sequencePhases(this.sequence)[0]});return made.map(step=>({...step,phase:at}));}
    /** Where a new step goes to join a phase section: after that phase's last step, or at the end. */
    phaseInsertIndex(phase){const B=ReactorBattleData,steps=this.sequence.steps;let index=-1;steps.forEach((step,i)=>{if(B.stepPhase(step)===phase)index=i;});return index>=0?index+1:steps.length;}
    insertSteps(records,index=this.selected+1){
        if(!records?.length)return false;
        if(this.sequence.steps.length+records.length>256){this.parent.updateStatus(this.ui.text('A sequence can contain at most 256 steps.'));return false;}
        const copies=JSON.parse(JSON.stringify(records)).map(step=>({...step,id:ReactorBattleData.step(step.type).id}));index=Math.max(0,Math.min(this.sequence.steps.length,index));
        this.edit(()=>this.sequence.steps.splice(index,0,...copies));this.selected=index;this.refresh();this.selectStep(index);this.revealStep();return true;
    }
    deleteStep(index=this.selected){if(!this.sequence.steps[index])return false;this.edit(()=>this.sequence.steps.splice(index,1));this.selected=Math.min(Math.max(0,index-1),this.sequence.steps.length-1);this.refresh();this.selectStep(this.selected);this.revealStep();return true;}
    queueStepClipboard(action){this.stepClipboardQueue=(this.stepClipboardQueue||Promise.resolve()).catch(()=>false).then(action).catch(error=>{console.warn('Action step clipboard:',error);return false;});return this.stepClipboardQueue;}
    copyStep(cut=false){
        const sequence=this.sequence,host=this.host,step=sequence.steps[this.selected];if(!step)return Promise.resolve(false);
        const snapshot=JSON.stringify(step),payload={version:1,steps:[JSON.parse(snapshot)]};
        return this.queueStepClipboard(async()=>{
            const ok=await ReactorClipboard.write('actionSequenceSteps',payload);
            if(this.host!==host||this.sequence!==sequence||!host.isConnected)return ok;
            if(!ok){this.parent.updateStatus(window.I18n?.t('db.clipboardWriteFailed')||'Could not write data to the clipboard.');return false;}
            if(cut){const index=sequence.steps.indexOf(step);if(index>=0&&JSON.stringify(step)===snapshot)this.deleteStep(index);}
            return true;
        });
    }
    pasteStep(){
        const sequence=this.sequence,host=this.host,index=this.selected,anchor=sequence.steps[index]?.id;
        return this.queueStepClipboard(async()=>{
            const payload=(await ReactorClipboard.read('actionSequenceSteps'))?.payload;
            if(this.host!==host||this.sequence!==sequence||!host.isConnected)return false;
            if(payload?.version!==1||!Array.isArray(payload.steps)||!payload.steps.length||payload.steps.length>256)return false;
            const B=ReactorBattleData,probe={version:1,steps:payload.steps};
            // Clipboard fragments need not contain the sequence's impact cue.
            const errors=B.validateSequence(probe).filter(message=>!message.startsWith('Include exactly one Apply Action Effect'));
            if(errors.length){this.parent.updateStatus(errors.map(t=>this.ui.text(t)).join(' '));return false;}
            const found=sequence.steps.findIndex(s=>s.id===anchor),at=found>=0?found+1:Math.max(0,Math.min(index,sequence.steps.length));
            return this.insertSteps(payload.steps,at);
        });
    }
    stepContextMenu(event){
        if(event.target.closest('input,textarea,select,[contenteditable]'))return;
        event.preventDefault();event.stopPropagation();const row=event.target.closest('[data-step-id]');if(row)this.selectStep(this.stepRows().indexOf(row));
        const host=this.host,exists=!!this.sequence.steps[this.selected],run=fn=>()=>{if(this.host===host&&host.isConnected)fn();},[cutKey,copyKey,pasteKey]=['Ctrl+X','Ctrl+C','Ctrl+V'];
        this.parent.showDatabaseActionMenu(event.clientX,event.clientY,[
            {label:this.ui.text('Play Step'),enabled:exists,action:run(()=>this.playStep())},
            {separator:true},
            {label:this.ui.text('Cut'),shortcut:cutKey,enabled:exists,action:run(()=>this.copyStep(true))},
            {label:this.ui.text('Copy'),shortcut:copyKey,enabled:exists,action:run(()=>this.copyStep())},
            {label:this.ui.text('Paste'),shortcut:pasteKey,action:run(()=>this.pasteStep())},
            {separator:true},
            {label:this.ui.text('Add Step'),action:run(()=>this.insertSteps(this.newSteps()))},
            {label:this.ui.text('Duplicate'),enabled:exists,action:run(()=>this.insertSteps([this.sequence.steps[this.selected]]))},
            {label:this.ui.text('Delete'),shortcut:'Delete',enabled:exists,action:run(()=>this.deleteStep())}
        ]);this.stepMenu=this.parent._databaseActionMenu;(row||this.steps).focus({preventScroll:true});
    }
    bindStepEditing(card,addButton){
        this.steps.tabIndex=0;card.oncontextmenu=event=>this.stepContextMenu(event);
        this.host.addEventListener('keydown',event=>{
            if(event.target.closest('input,textarea,select,[contenteditable]')||event.isComposing)return;
            const key=event.key.toLowerCase(),mod=event.ctrlKey||event.metaKey;let action;
            if(mod&&key==='c')action=()=>this.copyStep();else if(mod&&key==='x')action=()=>this.copyStep(true);else if(mod&&key==='v')action=()=>this.pasteStep();
            else if(mod&&key==='z')action=()=>this.history(event.shiftKey?this.redo:this.undo,event.shiftKey?this.undo:this.redo);
            else if(mod&&key==='y')action=()=>this.history(this.redo,this.undo);
            else if((key==='delete'||key==='backspace')&&this.steps.contains(event.target))action=()=>this.deleteStep();
            else if((key==='arrowdown'||key==='arrowup')&&this.steps.contains(event.target))action=()=>{this.selectStep(Math.max(0,Math.min(this.sequence.steps.length-1,this.selected+(key==='arrowdown'?1:-1))));this.revealStep();};
            if(action){event.preventDefault();event.stopPropagation();action();}
        });
        addButton.draggable=true;addButton.title=this.ui.text('Drag into the step list, or click to add below the selected step.');
        addButton.ondragstart=event=>this.startStepDrag(event,{kind:'add',value:this.stepType.value});addButton.ondragend=()=>this.endStepDrag();
        this.steps.ondragover=event=>{if(!this.stepDrag)return;event.preventDefault();event.dataTransfer.dropEffect=this.stepDrag.kind==='add'?'copy':'move';this.stepDragPoint={clientX:event.clientX,clientY:event.clientY};this.updateStepDrop();};
        this.steps.ondragleave=event=>{if(!this.steps.contains(event.relatedTarget)){this.stepDragPoint=null;this.clearStepDrop();}};
        this.steps.ondrop=event=>{
            if(!this.stepDrag)return;event.preventDefault();event.stopPropagation();const drag=this.stepDrag,slot=this.stepDropIndex,phase=this.stepDropPhase;this.endStepDrag();if(slot==null)return;
            if(drag.kind==='add'){this.insertSteps(this.newSteps(drag.value,phase||undefined),slot);return;}
            const from=this.sequence.steps.findIndex(step=>step.id===drag.id);if(from<0)return;const to=slot-(from<slot?1:0);const moved=this.sequence.steps[from];if(to===from&&(!phase||moved.phase===phase))return;
            this.edit(()=>{const [step]=this.sequence.steps.splice(from,1);if(phase)step.phase=phase;this.sequence.steps.splice(to,0,step);});this.selected=to;this.refresh();this.selectStep(to);this.revealStep();
        };
    }
    startStepDrag(event,drag){
        this.endStepDrag();this.stepDrag=drag;event.dataTransfer.setData('application/x-rpg-reactor-action-step',JSON.stringify(drag));event.dataTransfer.effectAllowed=drag.kind==='add'?'copy':'move';
        const tick=()=>{if(!this.stepDrag)return;if(this.stepDragPoint){const r=this.steps.getBoundingClientRect(),pos=this.stepDragPoint.clientY,amount=pos<r.top+28?-8:pos>r.bottom-28?8:0;if(amount){this.steps.scrollTop+=amount;this.updateStepDrop();}}this.stepDragRaf=requestAnimationFrame(tick);};this.stepDragRaf=requestAnimationFrame(tick);
    }
    stepRows(){return this.steps?[...this.steps.querySelectorAll('[data-step-id]')]:[];}
    clearStepDrop(){for(const row of this.steps?.children||[])row.classList.remove('drop-before','drop-after','drop-into');this.steps?.classList.remove('drop-empty');this.stepDropIndex=null;this.stepDropPhase=null;}
    updateStepDrop(){
        this.clearStepDrop();const point=this.stepDragPoint;if(!point)return;const B=ReactorBattleData,children=[...this.steps.children],rows=this.stepRows();
        // The slot is the first row the pointer is above; the phase is the section that slot falls in.
        let index=rows.findIndex(row=>{const r=row.getBoundingClientRect();return point.clientY<(r.top+r.bottom)/2;});if(index<0)index=rows.length;this.stepDropIndex=index;
        const target=rows[index]||null;let phase=null;
        for(const child of children){if(child===target)break;if(child.dataset.phaseHead)phase=child.dataset.phaseHead;}
        if(!target){const last=[...children].reverse().find(c=>c.dataset.phaseHead);const below=[...children].reverse().find(c=>c.dataset.stepId);if(last&&(!below||children.indexOf(last)>children.indexOf(below)))phase=last.dataset.phaseHead;}
        this.stepDropPhase=B.purpose(this.sequence)==='action'?(phase||(target?B.stepPhase(this.sequence.steps[index]):B.stepPhase(this.sequence.steps.at(-1)||{}))):null;
        if(!rows.length){const head=[...children].find(c=>c.dataset.phaseHead===this.stepDropPhase);if(head)head.classList.add('drop-into');else this.steps.classList.add('drop-empty');}
        else if(index===rows.length){const head=[...children].reverse().find(c=>c.dataset.phaseHead===this.stepDropPhase&&children.indexOf(c)>children.indexOf(rows.at(-1)));if(head)head.classList.add('drop-into');else rows.at(-1).classList.add('drop-after');}
        else rows[index].classList.add('drop-before');
    }
    endStepDrag(){cancelAnimationFrame(this.stepDragRaf);this.stepDrag=null;this.stepDragPoint=null;this.clearStepDrop();}
    updateStepSelection(){for(const [i,button] of this.stepRows().entries()){button.classList.toggle('selected',i===this.selected);button.setAttribute('aria-pressed',String(i===this.selected));}}
    stepDescription(step,index){
        const t=value=>this.ui.text(value),number=value=>String(Math.round((Number(value)||0)*100)/100),coords=value=>['x','y','z'].map(k=>k.toUpperCase()+' '+number(value[k])).join(', ');
        const role=step.role==='user'?t('User'):step.role==='allTargets'?t('All Targets'):step.targetIndex===undefined?t('Current Target'):t('Target {n}').replace('{n}',step.targetIndex+1);
        const motionLabel=name=>t(this.motionLabels()[name]||name);
        let title=t(this.label(step.type)),details=[];
        if(step.type==='motion'&&ReactorBattleData.hasPose(step)){
            const names=(step.parts||[]).map(p=>t(ReactorBattleData.partLabel(p.part)));title=role+': '+t('Pose')+(names.length?' ('+names.join(', ')+')':'');details.push(t(step.resetPose?'From rest':'Custom Pose'));if(step.transform)details.push(t('Model Transform'));
        }else if(step.type==='motion'){
            title=role+': '+motionLabel(step.motion||'idle');details.push(t('Battler Motion'));if(step.transform)details.push(t('Model Transform'));
        }else if(step.type==='move'||step.type==='camera'){
            let motion='';const key=step.role==='target'&&step.targetIndex===undefined?'target0':ReactorBattleData.roleKey(step);
            if(step.type==='move'&&key!=='allTargets')for(const prior of this.sequence.steps.slice(0,index)){
                const priorKey=prior.role==='target'&&prior.targetIndex===undefined?'target0':ReactorBattleData.roleKey(prior);
                if(prior.type==='motion'&&(priorKey===key||key.startsWith('target')&&priorKey==='allTargets'))motion=prior.motion||'idle';
            }
            const home=step.anchor==='home',zero=['x','y','z'].every(k=>!Number(step[k])),verb=['run','walk'].includes(motion)?motionLabel(motion):t('Move');
            title=step.type==='camera'?t('Camera')+' → '+t(home?'Home':'Target'):role+': '+(home&&zero?t('Return Home'):verb+' → '+t(home?'Home':'Target'));
            if(home&&zero&&['run','walk'].includes(motion))details.push(motionLabel(motion));
            if(step.anchor==='approach'){details.push(t('Approach Target'),t('Stop Short (tiles)')+': '+number(-step.x));if(step.y||step.z)details.push('Y '+number(step.y)+', Z '+number(step.z));}
            else if(!zero)details.push(t('Position Offset')+': '+coords(step));
            if(step.face==='home')details.push(t('Home Facing'));else if(step.face==='target')details.push(t('Facing')+': '+t('Target'));
            if(['rotateX','rotateY','rotateZ'].some(k=>step[k]))details.push(t('Rotation')+': '+['X','Y','Z'].map(a=>a+' '+number(step['rotate'+a])+'°').join(', '));
            if(step.scale!==undefined&&step.scale!==1)details.push(t('Scale')+': '+number(step.scale)+'×');
        }else if(step.type==='sound'){
            title=t('Play Sound')+': '+(step.audio?.name||t('None'));details.push('SE');
        }else if(step.type==='animation'){
            const animation=step.animationId?this.db?.getAnimation?.(step.animationId):null;
            title=role+': '+(animation?.name||(step.animationId?t('Animation')+' #'+step.animationId:t('None')));details.push(t('Show Animation'));
        }else if(step.type==='weapon'){
            const mode=ReactorBattleData.weaponMode(step);title=t(mode==='hide'?'Hide':mode==='move'?'Move':'Show')+': '+t('Weapon');
            if(mode==='show')details.push(step.iconSource==='icon'?t('Icon')+' #'+(step.iconIndex||0):t(step.iconSource==='action'?'Skill / Item':'Equipped Weapon'));
            if(mode==='move')details.push(t('Rotation')+': '+number(step.rotation||0)+'°');
        }else if(step.type==='projectile'){
            const dest={allTargets:'All Targets',user:'User',subject:'Subject'}[step.destination]||'Current Target',source=step.iconSource||'color';title=t('Projectile')+': '+role+' → '+t(dest);
            details.push(source==='color'?(step.color||'#ffcc55'):source==='model'?(step.model?.name||t('3D Model')):source==='animation'?(this.db?.getAnimation?.(step.animationId)?.name||t('Animation')):source==='picture'?(step.name||t('Picture')):source==='icon'?t('Icon'):source==='action'?t('Skill / Item'):t('Weapon'));
        }else if(step.type==='impact')details.push(t('All Targets'));
        else if(step.type==='wait')details.push(number(step.duration)+'f');
        if(['sound','animation'].includes(step.type)){if(step.waitForCompletion)details.push(t(step.type==='sound'?'Wait for Sound':'Wait for Animation'));if(step.duration)details.push(t('Wait')+': '+step.duration+'f');if(step.animationTransform){details.push(t('Position Offset')+': '+coords(step.animationTransform),t('Scale')+': '+number(step.animationTransform.scale??1)+'×');}}
        return {title,details};
    }
    updateStepDescriptions(){
        if(!this.steps)return;
        const timeline=ReactorBattleData.timeline(this.sequence);
        for(const [i,row] of this.stepRows().entries()){
            const cue=timeline[i],heading=row.querySelector('.rr-sequence-step-title'),detail=row.querySelector('.rr-sequence-step-detail');if(!cue||!heading||!detail)continue;
            const summary=this.stepDescription(cue.step,i),title=(i+1)+'. '+summary.title,description=[...summary.details,cue.start+'–'+cue.end+'f'].join(' · ');
            if(heading.textContent!==title)heading.textContent=title;if(detail.textContent!==description)detail.textContent=description;
            row.title=title+'\n'+description;row.setAttribute('aria-label',title+'. '+description);
        }
    }
    /** A phase section head: which phase the steps below it belong to, with a way to add a step there or let an empty phase inherit again. */
    phaseHead(phase,count){const U=this.ui,B=ReactorBattleData,[,label,help]=B.actionPhases.find(([id])=>id===phase),head=U.element('div','rr-sequence-phase-head');head.dataset.phaseHead=phase;head.title=U.text(help);
        head.append(U.element('span','rr-sequence-phase-number',String(B.phaseIds().indexOf(phase)+1),true),U.element('span','rr-sequence-phase-label',label));
        const tag=U.element('span','rr-sequence-phase-count',count?U.message('{n} steps',{n:count}):'No steps');head.append(tag);
        const add=U.button('+',()=>{this.insertSteps(this.newSteps(this.stepType.value,phase),this.phaseInsertIndex(phase));},true);add.classList.add('rr-sequence-phase-add');add.title=U.text('Add a step to this phase');add.setAttribute('aria-label',U.text('Add a step to this phase'));head.append(add);
        if(!count){const inherit=U.button('Remove',()=>this.inheritPhase(phase));inherit.classList.add('rr-sequence-phase-inherit');inherit.title=U.text('Remove this empty phase; it then comes from the next level down, or the built-in action');head.append(inherit);}
        return head;}
    drawSteps(){const U=this.ui,B=ReactorBattleData,top=this.steps.scrollTop,focused=this.steps.contains(document.activeElement)?document.activeElement.dataset.stepId:null;this.steps.replaceChildren();
        const phased=B.purpose(this.sequence)==='action',counts={};if(phased)for(const step of this.sequence.steps)counts[B.stepPhase(step)]=(counts[B.stepPhase(step)]||0)+1;
        // Empty provided phases keep their place in the order: Prepare above the first step, Finish after the last.
        const provided=phased?B.sequencePhases(this.sequence):[],order=B.phaseIds(),placed=new Set();
        const emptyBefore=phase=>{for(const p of provided){if(order.indexOf(p)>=order.indexOf(phase))break;if(!counts[p]&&!placed.has(p)){placed.add(p);this.steps.append(this.phaseHead(p,0));}}};
        let current=null;
        B.timeline(this.sequence).forEach(({step},i)=>{
            if(phased){const phase=B.stepPhase(step);if(phase!==current){emptyBefore(phase);current=phase;this.steps.append(this.phaseHead(phase,counts[phase]));}}
            const button=U.button('',()=>this.selectStep(i));button.dataset.rrI18nSkip='';button.append(U.element('span','rr-sequence-step-title'),U.element('span','rr-sequence-step-detail'));button.dataset.stepId=step.id;
            button.draggable=true;button.ondragstart=e=>this.startStepDrag(e,{kind:'move',id:step.id});button.ondragend=()=>this.endStepDrag();this.steps.append(button);});
        // Provided phases with no steps yet still show, so a step can be dropped into them or they can be let go.
        if(phased)for(const phase of provided)if(!counts[phase]&&!placed.has(phase)){placed.add(phase);this.steps.append(this.phaseHead(phase,0));}
        this.updateStepDescriptions();this.updateStepSelection();this.steps.scrollTop=top;if(focused)this.stepRows().find(b=>b.dataset.stepId===focused)?.focus({preventScroll:true});}
    pickAnimation(step){
        const project=this.parent.currentProject,host=this.host,sequence=this.sequence;
        if(!project?.path||typeof AnimationPickerModal==='undefined')return;
        this.playing=false;for(const sound of this.sounds||[])sound.pause();
        AnimationPickerModal.open({
            databaseManager:this.db,projectPath:project.path,currentId:step.animationId||0,allowNormalAttack:false,
            onPick:value=>{
                const id=Number(value);
                if(!Number.isInteger(id)||id<0||this.host!==host||!host.isConnected||this.parent.currentProject!==project||this.sequence!==sequence||sequence.steps[this.selected]!==step)return;
                if(id===(step.animationId||0))return;
                this.edit(()=>step.animationId=id);this.drawInspector();
            }
        });
    }
    pickSound(step){
        const project=this.parent.currentProject,host=this.host,sequence=this.sequence;
        if(!project?.path||typeof RRAudioPickerModal==='undefined')return;
        const audio={name:'',volume:90,pitch:100,pan:0,...step.audio};
        this.playing=false;for(const sound of this.sounds||[])sound.pause();
        RRAudioPickerModal.open({
            title:'Select Sound Effect',folderLabel:'SE',
            files:RRAssetFiles.listUnique(require('path').join(project.path,'audio','se'),RRAssetFiles.AUDIO_EXTENSIONS),
            selected:audio.name,levels:{volume:audio.volume,pitch:audio.pitch,pan:audio.pan},loopDefault:false,zIndex:22000,
            onOk:result=>{
                if(!result||this.host!==host||!host.isConnected||this.parent.currentProject!==project||this.sequence!==sequence||sequence.steps[this.selected]!==step)return;
                const next={...audio,...result};if(JSON.stringify(next)===JSON.stringify(step.audio))return;
                this.edit(()=>step.audio=next);this.drawInspector();
            }
        });
    }
    groupStepChoices(){
        const U=this.ui,select=this.stepType,chosen=select.value,groups=[
            ['Templates',ReactorBattleData.basicSteps.map(name=>'basic:'+name)],
            ['Movement',['move','motion','jump','leap','float','fall','home','direction','pose']],
            ['Action',['impact','effect','animation','weapon','projectile','wait','action']],
            ['Targets',['target','clearTargets']],
            ['Audio',['sound','bgm','bgs','se','movie']],
            ['Visual Effects',['camera','balloon','opacity','whiten','flash','tint','shake','picture','icon','plane','battleback','battlestatus','battlelog']],
            ['Game Data',['hp','mp','tp','buff','state','kill','item','switch','variable','formula','element']],
            ['Logic',['branch','elseIf','else','end','event','eval']]
        ];
        const options=new Map([...select.options].map(option=>[option.value,option]));select.replaceChildren();
        for(const [label,values] of groups){const group=U.element('optgroup');group.label=U.text(label);for(const value of values)if(options.has(value))group.append(options.get(value));select.append(group);}select.value=chosen;
    }
    /** Names of the action poses and clips the previewed model of `role` can play. */
    modelActionRules(role){
        const record=this.preview?.models?.get?.(role==='user'?'user':'target0');
        const rules=record?.rules||[];
        return [...new Set(rules.filter(r=>r&&r.trigger==='action'&&r.name&&r.name.trim()).map(r=>r.name.trim()))];
    }
    openModelPoses(spec){
        this.parent.openDatabase('reactor3d');
        const editor=this.parent.reactor3dEditor,entry=editor?.listModels?.().find(m=>m.name===spec.name);
        if(entry)editor.selectModel(entry);
    }
    inspectorFold(title,key,open=false){
        const U=this.ui,details=U.element('details','rr-sequence-disclosure'),id=this.sequence.steps[this.selected]?.id+':'+key;
        details.dataset.disclosureKey=id;details.open=this.disclosures?.get(id)??open;details.append(U.element('summary','',title));const body=U.element('div','rr-sequence-disclosure-body');details.append(body);
        details.ontoggle=()=>{if(!details.isConnected)return;this.disclosures||=new Map();this.disclosures.set(id,details.open);};this.inspector.append(details);return body;
    }
    setInspectorTitle(title){this.inspectorHeader.setAttribute('data-i18n-text-source',title);this.inspectorHeader.textContent=this.ui.text(title);}
    drawInspector(){if(this.controls?.mode==='formation'){this.controls.inspectFormation();return;}const U=this.ui,step=this.sequence.steps[this.selected];for(const details of this.inspector.querySelectorAll('[data-disclosure-key]'))this.disclosures.set(details.dataset.disclosureKey,details.open);this.inspector.replaceChildren();this.setInspectorTitle(step?this.label(step.type):'Action Steps');if(!step)return;
        const change=(key,value)=>{this.edit(()=>step[key]=value);if(['name','weaponImageId','weaponGraphic'].includes(key))this.loadSequenceImages();};
        U.number(this.inspector,['sound','animation'].includes(step.type)?'Wait (frames)':'Duration (frames)',step.duration,v=>change('duration',Math.max(0,Math.min(3600,Math.round(v)))),1);
        U.field(this.inspector,'Battler',U.select([['user','User'],['target','Current Target'],['allTargets','All Targets'],...ReactorBattleData.targetGroups.filter(v=>!['user','target','allTargets'].includes(v)).map(v=>[v,ReactorBattleData.optionLabel(v)]),...Array.from({length:Math.max(this.targetCount,(step.targetIndex??0)+1)},(_,i)=>['target'+i,U.message('Target {n}',{n:i+1})])],ReactorBattleData.roleKey(step),v=>{this.edit(()=>{step.role=v.startsWith('target')&&v!=='target'?'target':v;step.targetIndex=v.startsWith('target')&&v!=='target'?Number(v.slice(6)):undefined;});this.drawInspector();}));
        const B=ReactorBattleData,advanced=this.inspectorFold('Advanced','advanced');const advancedDetails=advanced.parentElement;advancedDetails.remove();
        // Changing a step's phase moves it into that section, after the section's last step.
        if(B.purpose(this.sequence)==='action')U.field(this.inspector,'Phase',U.select(B.actionPhases.map(([id,label])=>[id,label]),B.stepPhase(step),v=>{if(v===B.stepPhase(step))return;this.edit(()=>{const steps=this.sequence.steps,from=steps.indexOf(step);steps.splice(from,1);step.phase=v;const to=this.phaseInsertIndex(v);steps.splice(to,0,step);this.selected=to;});this.refresh();this.selectStep(this.selected);this.revealStep();}));
        if(!['user','target','allTargets','subject'].includes(step.role)){
            U.field(advanced,'Target Filter',U.select(B.targetFilters.map(v=>[v,B.optionLabel(v)]),step.filter||'all',value=>change('filter',value)));
            U.number(advanced,'Group Member (0 = all)',step.memberIndex===undefined?0:step.memberIndex+1,value=>change('memberIndex',value>0?Math.floor(value)-1:undefined),1);
        }
        for(const field of [...(B.commands[step.type]?.fields||[]),...(B.extraFields[step.type]||[])]){
            const value=step[field.key]??field.value;
            const secondary=((B.extraFields[step.type]||[]).includes(field)&&!['weaponGraphic','attachment','iconSource','destination','arc','flight'].includes(field.key))||[...(['picture','icon','plane'].includes(step.type)?[]:['index']),'angle','spin','scale','layer','space',...(step.type==='opacity'?[]:['opacity']),'volume','pitch','pan','show','equipIndex','scrollX','scrollY'].includes(field.key);
            const fieldHost=secondary?advanced:this.inspector;
            // An operation only exposes the fields it actually consumes.
            const operation=step.operation||B.commandDefaults(step.type).operation;
            if(['bgm','bgs'].includes(step.type)&&field.key!=='operation'&&!(operation==='play'&&['name','volume','pitch','pan'].includes(field.key))&&!(['fadeIn','fadeOut'].includes(operation)&&field.key==='fade'))continue;
            if(step.type==='se'&&field.key!=='operation'&&!(operation==='play'&&['name','volume','pitch','pan'].includes(field.key))&&!(operation==='system'&&field.key==='soundId'))continue;
            if(['formula','element'].includes(step.type)&&operation==='clear'&&field.key!=='operation')continue;
            if(step.type==='battleback'&&operation!=='change'&&field.key!=='operation')continue;
            if(['picture','plane','icon'].includes(step.type)&&operation==='clear'&&!['operation','index'].includes(field.key))continue;
            if(step.type==='pose'&&operation==='clear'&&field.key!=='operation')continue;
            if(step.type==='battlelog'&&operation!=='text'&&field.key==='text')continue;
            if(step.type==='weapon'&&(field.key==='mode'||step.weaponGraphic!=='sheet'&&['weaponImageId','weaponFrame'].includes(field.key)))continue;
            if(step.type==='weapon'&&ReactorBattleData.weaponMode(step)!=='show'&&['weaponGraphic','attachment','bone','gripX','gripY','equipIndex'].includes(field.key))continue;
            // The Held By choice above stands in for a model's grip; the raw number stays for icons.
            if(step.type==='weapon'&&field.key==='gripY'&&this.weaponModelSpec(step,B.roleKey(step).startsWith('target')?'target0':'user'))continue;
            // The projectile panel below owns everything but the rarely touched Advanced rows.
            if(step.type==='projectile'&&!['sourceRole','bone','gripX','gripY','equipIndex'].includes(field.key))continue;
            if(['weapon','projectile'].includes(step.type)&&field.key==='bone'&&!['rightHand','leftHand'].includes(step.attachment))continue;
            if(['weapon','projectile'].includes(step.type)&&['gripX','gripY'].includes(field.key)&&(step.weaponGraphic==='sheet'||this.weaponModelSpec(step,B.roleKey(step).startsWith('target')?'target0':'user')))continue;
            if(['weapon','projectile'].includes(step.type)&&field.key==='equipIndex'&&(step.iconSource||(step.type==='projectile'?'color':'weapon'))!=='weapon')continue;
            if(step.type==='motion'&&['motionIndex','motionFrames','motionSpeed','motionLoop'].includes(field.key)&&(B.hasPose(step)||this.models?.[step.role==='user'||step.role==='subject'?'user':'target']))continue;
            const folder=field.key==='name'?(step.type==='projectile'&&step.iconSource==='picture'?'img/pictures':(['bgm','bgs','se'].includes(step.type)?'audio/'+step.type:['picture','plane'].includes(step.type)?'img/pictures':step.type==='movie'?'movies':null)):field.key==='floor'?'img/battlebacks1':field.key==='background'?'img/battlebacks2':null;
            if(folder){const path=require('path'),extensions=folder.startsWith('audio')?RRAssetFiles.AUDIO_EXTENSIONS:folder==='movies'?['.webm','.mp4']:['.png','.webp'];const files=RRAssetFiles.listNames(path.join(this.parent.currentProject.path,folder),extensions);U.field(fieldHost,field.label,U.select([['','None'],...files.map(name=>[name,name,true])],value,v=>{change(field.key,v);if(['operation','weaponGraphic','source','iconSource','attachment'].includes(field.key))this.drawInspector();}));}
            else if(field.key==='sequenceId')U.field(fieldHost,field.label,U.select((this.db.data.actionSequences||[]).filter(s=>s&&B.purpose(s)==='routine'&&s.id!==this.sequence.id).map(s=>[s.id,s.name||'#'+s.id,true]),value,v=>change(field.key,Number(v))));
            else if(field.type==='number')U.number(fieldHost,field.label,value,v=>change(field.key,v),1);
            else if(field.type==='select')U.field(fieldHost,field.label,U.select(field.options.map(v=>[v,B.optionLabel(v)]),value,v=>{change(field.key,v);if(['operation','weaponGraphic','source','iconSource','attachment'].includes(field.key))this.drawInspector();}));
            else{const input=U.element(field.type==='script'?'textarea':'input','database-field-value');input.value=value;input.onchange=()=>change(field.key,input.value);U.field(fieldHost,field.label,input);}
        }
        if(['branch','elseIf'].includes(step.type)){const input=U.element('input');input.type='checkbox';input.checked=step.previewResult??true;input.onchange=()=>change('previewResult',input.checked);U.field(advanced,'Preview Condition Result',input);}
        if(step.type==='impact'){const input=U.element('input','database-field-value');input.value=step.rate??'100';input.onchange=()=>change('rate',input.value);U.field(this.inspector,'Damage Rate (%) / Expression',input);}
        if(step.type==='wait')U.field(this.inspector,'Wait Until',U.select(['frames','move','motion','popup','animation','effecting'].map(v=>[v,v]),step.waitFor||'frames',v=>change('waitFor',v)));
        if(step.type==='animation')U.field(this.inspector,'Animation Source',U.select([['id','Selected Animation'],['action','Current Action'],['weapon','Weapon Attack']],step.animationSource||'id',v=>{change('animationSource',v);this.drawInspector();}));
        if(['move','camera'].includes(step.type)){
            U.field(this.inspector,'Relative To',U.select([['home','Home'],['target','Target'],['approach','Approach Target']],step.anchor,v=>{change('anchor',v);this.drawInspector();}));
            // One card for where the step ends: its offset, and for a
            // battler the turn and scale that run over the same frames.
            const approach=()=>step.anchor==='approach',atEnd=()=>{this.stepPlayback=null;this.playing=false;this.asOfStep=true;this.frame=ReactorBattleData.timeline(this.sequence)[this.selected].end;};
            const row=(key,axis,label,min,max,stepSize,reset)=>({key,axis,label,min,max,step:stepSize,reset});
            this.controls.transformCard(this.inspector,{id:'move',
                tabs:step.type==='move'?[{id:'offset',label:'Offset'},{id:'rotate',label:'Rotate'},{id:'scale',label:'Scale'}]:[{id:'offset',label:'Offset'}],
                tool:tab=>tab==='rotate'?'rotate':'move',shown:atEnd,
                rows:tab=>tab==='offset'?[row('x','X',approach()?'Stop Short (tiles)':U.message('{axis} (tiles)',{axis:'X'}),-6,6,.05,0),row('y','Y',U.message('{axis} (tiles)',{axis:'Y'}),-6,6,.05,0),row('z','Z',U.message('{axis} (tiles)',{axis:'Z'}),-3,6,.05,0)]
                    :tab==='rotate'?['rotateX','rotateY','rotateZ'].map(k=>row(k,k.slice(-1),U.message('Turn {axis} (degrees)',{axis:k.slice(-1)}),-360,360,5,0))
                    :[row('scale','S','Scale',.1,4,.01,1)],
                get:key=>key==='x'&&approach()?-(step.x||0):key==='scale'?step.scale??1:step[key]||0,
                set:(key,value)=>{if(this.sequence.steps[this.selected]!==step)return;step[key]=key==='x'&&approach()?-value:key==='scale'?Math.max(.01,Math.min(100,value)):value;U.changed();this.validate();},
                reset:tab=>{for(const key of tab==='offset'?['x','y','z']:tab==='rotate'?['rotateX','rotateY','rotateZ']:['scale'])step[key]=key==='scale'?1:0;U.changed();this.validate();},
                hint:tab=>tab==='offset'?'Drag the arrows in the preview, or slide.':tab==='rotate'?'Turns run over this step’s frames with its easing, from the previous pose. Backflip: raise Z and turn X by −360 in one step; 2D sprites only turn on Z.':'Scales the battler over this step’s frames.'
            });
            U.field(this.inspector,'Easing',U.select([['smooth','Smooth'],['linear','Linear']],step.easing,v=>change('easing',v)));
            if(step.type==='move')U.field(advanced,'Facing',U.select([['','Keep Facing'],['movement','Direction of Travel'],['target','Target'],['home','Home Facing']],step.face||'',v=>change('face',v||undefined)));
        }
        if(step.type==='motion'){
            const role=step.role==='user'||step.role==='subject'?'user':'target',spec=this.models?.[role],modelRules=this.modelActionRules(role);
            const select=U.element('select','database-field-value'),addGroup=(label,entries)=>{if(!entries.length)return;const group=U.element('optgroup');group.label=U.text(label);for(const [id,name,raw] of entries){const o=U.element('option','',name,raw);o.value=id;group.append(o);}select.append(group);};
            const known=new Set(Object.keys(this.motionLabels())),modelSet=new Set(modelRules.map(n=>n.toLowerCase()));
            // A model's own poses come first and take the names they share with sprite motions.
            if(spec)addGroup('Custom',[[B.POSE_MOTION,'Pose Parts']]);
            addGroup(spec?U.message('Model Poses and Clips: {name}',{name:spec.name}):'Model Poses and Clips',modelRules.map(name=>[name,name,true]));
            addGroup('Sprite Motions',Object.entries(this.motionLabels()).filter(([id])=>!modelSet.has(id.toLowerCase())));
            if(step.motion&&step.motion!==B.POSE_MOTION&&!known.has(step.motion)&&!modelSet.has(step.motion.toLowerCase()))addGroup('Other',[[step.motion,step.motion,true]]);
            select.value=step.motion||'idle';select.onchange=()=>{this.edit(()=>{step.motion=select.value;if(select.value===B.POSE_MOTION)step.parts||=[];else {delete step.parts;delete step.resetPose;}});this.drawInspector();if(select.value===B.POSE_MOTION)this.openFold(step.id+':pose');this.showPoseFrame();this.paint();};U.field(this.inspector,'Motion',select);
            if(spec){const edit=U.button('Edit Model Poses…',()=>this.openModelPoses(spec));edit.classList.add('rr-sequence-edit-poses');this.inspector.append(edit);
                this.inspector.append(U.element('p','rr-battle-help','Poses and clips are rigged per part in Database › 3D Models and play here by name over this step’s frames.'));
                this.drawPoseParts(step,role,this.inspectorFold('Pose Parts','pose',B.hasPose(step)));}
            else this.inspector.append(U.element('p','rr-battle-help','Sprite motions pick a row of the battler sheet. Give the battler a 3D model to pose its parts.'));
            const transform=this.inspectorFold('Whole Model','transform',!!step.transform);this.controls.transformFields(step,change,transform);
        }
        if(step.type==='animation'){
            if(!step.animationSource||step.animationSource==='id'){
            const label=AnimationPickerModal.label(this.db.getAnimations(),step.animationId||0),picker=U.button(label,()=>this.pickAnimation(step),true);picker.classList.add('rr-sequence-animation-picker');picker.dataset.sequenceAnimationPicker='';picker.title=label;picker.setAttribute('data-rr-i18n-skip','');
            U.field(this.inspector,'Animation',picker);
            }
            for(const key of ['x','y','z','scale'])U.number(advanced,key==='scale'?'Scale':U.message('{axis} (tiles)',{axis:key.toUpperCase()}),step.animationTransform?.[key]??(key==='scale'?1:0),v=>change('animationTransform',{...step.animationTransform,[key]:Math.max(key==='scale'?.01:-1000,Math.min(key==='scale'?100:1000,v))}));
        }
        if(step.type==='sound'){
            const group=U.element('div','rr-sequence-sound-field'),name=U.element('input','database-field-value');name.readOnly=true;name.value=step.audio?.name||U.text('None');name.title=name.value;name.dataset.sequenceSoundName='';
            const picker=U.button('Choose Sound…',()=>this.pickSound(step));picker.dataset.sequenceSoundPicker='';group.append(name,picker);U.field(this.inspector,'Sound',group);
            const a={volume:90,pitch:100,pan:0,...step.audio},summary=U.element('div','rr-battle-help');summary.dataset.sequenceSoundProperties='';summary.textContent=U.text('Volume')+': '+a.volume+'% · '+U.text('Pitch')+': '+a.pitch+'% · '+U.text('Pan')+': '+a.pan;this.inspector.append(summary);
        }
        if(['sound','animation'].includes(step.type)){
            const wait=U.element('input');wait.type='checkbox';wait.checked=!!step.waitForCompletion;wait.dataset.sequenceWaitCompletion='';wait.onchange=()=>change('waitForCompletion',wait.checked);U.field(this.inspector,step.type==='sound'?'Wait for Sound':'Wait for Animation',wait);
        }
        if(step.type==='weapon'){
            const mode=B.weaponMode(step);
            U.field(this.inspector,'Weapon',U.select([['show','Show'],['move','Move'],['hide','Hide']],mode,v=>{this.edit(()=>{step.mode=v;delete step.visible;});this.drawInspector();}));
            if(mode==='show'){
                if(step.weaponGraphic!=='sheet')U.field(this.inspector,'Graphic',U.select([['weapon','Equipped Weapon (icon or 3D model)'],['action','Skill / Item'],['icon','Choose Icon']],step.iconSource||'weapon',v=>{change('iconSource',v);this.drawInspector();}));
                if(step.weaponGraphic!=='sheet'&&step.iconSource==='icon')this.inspector.append(U.button('Choose Icon…',()=>this.parent.showIconPicker(step.iconIndex||0,id=>change('iconIndex',id),require('path').join(this.parent.currentProject.path,'img','system','IconSet.png'))));
            }
            if(mode!=='hide'){
                const showPose=()=>{this.stepPlayback=null;this.playing=false;this.asOfStep=true;this.frame=ReactorBattleData.timeline(this.sequence)[this.selected].end;};
                const spec=this.weaponModelSpec(step,B.roleKey(step).startsWith('target')?'target0':'user');
                // A model is held by its middle, its base (a sword's grip) or its top.
                if(spec&&mode==='show')U.field(this.inspector,'Held By',U.select([['0.5','Middle'],['0','Base'],['1','Top']],String(step.gripY??.5),v=>{change('gripY',Number(v));showPose();this.paint();}));
                const row=(key,axis,label,min,max,stepSize,reset)=>({key,axis,label,min,max,step:stepSize,reset});
                this.controls.transformCard(this.inspector,{id:'held',
                    tabs:[{id:'offset',label:'Offset'},{id:'rotate',label:'Rotate'},{id:'scale',label:'Scale'}],
                    tool:tab=>tab==='rotate'?'rotate':'move',shown:showPose,
                    rows:tab=>tab==='offset'?['x','y','z'].map(k=>row(k,k.toUpperCase(),U.message('{axis} (tiles)',{axis:k.toUpperCase()}),-2,2,.01,0))
                        :tab==='rotate'?[row('rotation','X','Tilt (degrees)',-180,180,1,0),row('rotateY','Y','Turn (degrees)',-180,180,1,0),row('rotateZ','Z','Roll (degrees)',-180,180,1,0)]
                        :[row('scale','S','Scale',.1,4,.01,1)],
                    get:key=>step[key]??(key==='scale'?1:0),
                    set:(key,value)=>{if(this.sequence.steps[this.selected]!==step)return;step[key]=key==='scale'?Math.max(.01,value):Math.round(value*100)/100;U.changed();this.validate();},
                    reset:tab=>{for(const key of tab==='offset'?['x','y','z']:tab==='rotate'?['rotation','rotateY','rotateZ']:['scale'])step[key]=key==='scale'?1:0;U.changed();this.validate();},
                    hint:tab=>tab==='offset'?'Drag the arrows in the preview, or slide. X is forward of the hand.':tab==='rotate'?'Drag the rings in the preview, or slide. Tilt raises the tip; Turn and Roll only turn a 3D model.':spec?'The size comes from the item’s 3D model binding; Scale multiplies it.':'Scale multiplies the icon.'
                });
                if(mode==='move'){U.field(this.inspector,'Easing',U.select([['smooth','Smooth'],['linear','Linear']],step.easing||'smooth',v=>change('easing',v)));this.inspector.append(U.element('p','rr-battle-help','Moves the shown weapon from where it is to this offset, rotation and scale over the step’s frames.'));}
                else this.inspector.append(U.element('p','rr-battle-help','Show once, then add Move steps to swing or raise it; a bound 3D model is held in place of the icon.'));
            }
        }
        if(step.type==='projectile')this.drawProjectile(step,change);
        const globalTypes=['sound','bgm','bgs','se','movie','battleback','battlestatus','battlelog','flash','shake','branch','elseIf','else','end','switch','variable','item','formula','element','eval','event','camera','plane','clearTargets'];
        if(globalTypes.includes(step.type)){const field=[...this.inspector.children].find(row=>row.firstElementChild?.getAttribute('data-i18n-text-source')==='Battler');field?.remove();}
        if(['branch','elseIf','else','end','switch','variable','item','formula','element','eval','event','clearTargets','target'].includes(step.type)){const row=[...this.inspector.children].find(row=>row.firstElementChild?.getAttribute('data-i18n-text-source')==='Duration (frames)');if(row)advanced.prepend(row);}
        if(advanced.children.length)this.inspector.append(advancedDetails);
        const actions=U.element('div','rr-battle-toolbar');actions.append(U.button('Duplicate',()=>this.insertSteps([step])),U.button('Delete',()=>this.deleteStep()));this.inspector.append(actions);
    }
    previewContext(){const homes={user:{x:this.mirrored?11:3,y:5.5,z:0},target:{x:this.mirrored?3:11,y:5.5,z:0},camera:{x:7.5,y:5,z:0}};for(let i=0;i<this.targetCount;i++)homes['target'+i]={x:homes.target.x,y:5.5+(i%2?-1:1)*Math.ceil(i/2)*2,z:0};
        if(this.sceneHomes){const sh=this.sceneHomes;homes.user={...sh.user};homes.camera={...sh.camera};for(let i=0;i<this.targetCount;i++)homes['target'+i]={...sh['target'+i]};homes.target={...sh.target0};if(this.mirrored){const swap=homes.user;homes.user={...homes.target0,facing:undefined};for(let i=0;i<this.targetCount;i++)homes['target'+i]={...swap,y:swap.y+(i%2?-1:1)*Math.ceil(i/2)*2,facing:undefined};homes.target={...homes.target0};}}homes.user.facing=ReactorBattleData.facingToward(homes.user,homes.target);homes.target.facing=ReactorBattleData.facingToward(homes.target,homes.user);for(let i=0;i<this.targetCount;i++)homes['target'+i].facing=homes.target.facing;return this.controls.homes({homes,target:homes.target,direction:this.mirrored?-1:1});}
    async loadCast(){
        this.clearPreviewMedia();
        const generation=++this.generation,project=this.parent.currentProject;
        this.controls?.disposeGizmos();this.grid?.geometry.dispose();this.grid?.material.dispose();this.grid=null;this.backdropTexture?.dispose();this.backdropTexture=null;this.preview?.dispose();this.preview=null;this.images={};this.models={};this.sequencePictures={};this.weaponSheets={};this.weaponModels={};
        try {
            const assets={...await this.ui.assets(),playSe:se=>this.playPreviewSound(se)};if(this.generation!==generation)return;
            let map={id:0,width:18,height:12,tilesetId:1,data:Array(18*12*6).fill(0),events:[],reactor3d:{}},tileset={id:1,tilesetNames:[],flags:[]},settings=ReactorBattleData.room(map);
            settings.projection=this.previewProjection||'3d';settings.cameraSource='custom';settings.camera={x:7.5,y:5,z:1,yaw:0,pitch:25,distance:19};this.baseCamera={yaw:0,pitch:25};
            this.sceneHomes=null;const scene=this.scene||{kind:'grid'};
            if(scene.kind==='troop'){
                const troop=this.ui.settings().troops?.[scene.id];
                if(troop?.type==='room'&&troop.mapId){
                    map=await this.ui.readMap(troop.mapId);tileset=this.db.getTileset(map.tilesetId)||tileset;
                    settings=JSON.parse(JSON.stringify(troop));settings.projection=this.previewProjection||'3d';
                    const homes={user:ReactorBattleData.position(troop,'actors',0)};for(let i=0;i<4;i++)homes['target'+i]=ReactorBattleData.position(troop,'enemies',i);
                    homes.camera={...troop.camera};this.sceneHomes=homes;this.controls.distance=troop.camera?.distance||this.controls.distance;this.baseCamera={yaw:Number(settings.camera?.yaw)||0,pitch:Number(settings.camera?.pitch)||25};
                }
            }
            if(this.generation!==generation)return;
            const view=new ReactorBattleRoomView(map,tileset,settings,assets);await view.build();
            if(this.generation!==generation){view.dispose();return;}this.preview=view;this.controls.resize();
            this.iconSet=await assets.image('system','IconSet');if(this.generation!==generation){view.dispose();return;}
            for(const step of this.sequence.steps)if(['picture','plane'].includes(step.type)&&step.name)try{this.sequencePictures[step.name]=await assets.image('pictures',step.name);}catch(error){console.warn(error);}
            if(scene.kind==='battleback'&&(scene.floor||scene.wall)){
                // Composited like the engine's battleback pair: floor first, wall over it.
                const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=740;const ctx=canvas.getContext('2d');
                for(const [folder,name] of [['battlebacks1',scene.floor],['battlebacks2',scene.wall]])if(name)try{const bitmap=await assets.image(folder,name);ctx.drawImage(bitmap.image||bitmap.canvas,0,0,canvas.width,canvas.height);}catch(error){console.warn(error);}
                if(this.generation!==generation){view.dispose();return;}
                const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;view.scene.background=texture;this.backdropTexture=texture;
            }
            if(scene.kind==='grid'){const grid=new THREE.GridHelper(30,30,0x667080,0x303743);grid.position.set(8,0,5);view.scene.add(grid);this.grid=grid;}
            for(const role of ['user','target']){
                const actor=this.castKinds[role]==='actors',id=this.cast[role],record=actor?this.db.getActor(id):this.db.getEnemy(id);if(!record)continue;
                const graphic=ReactorBattleData.graphic(this.ui.settings(),actor?'actors':'enemies',id,record,RRDatabase3DBindings.get(project.path,actor?'actors':'enemies',id,actor?'battler':undefined)),spec=graphic.type==='model'?graphic.model:null;
                if(spec){this.models[role]=spec;const keys=role==='user'?['user']:['target0','target1','target2','target3'];await Promise.all(keys.map(key=>view.addModel(key,Reactor3D.normalizeModelSpec(spec),{x:0,y:0,z:0})));}
                else if(graphic.name){const bitmap=await assets.image(graphic.folder,graphic.name);this.images[role]={bitmap,actor,graphic};}
                if(this.generation!==generation){view.dispose();return;}
            }
        }catch(error){console.warn('Sequence preview:',error);if(this.generation===generation)this.ui.setText(this.validation,this.ui.message('Preview could not load: {error}',{error:error.message}));}
    }
    clearPreviewMedia(){
        for(const audio of this.sounds||[]){audio.pause();audio._rrRelease?.();}this.sounds=[];
        for(const entry of this.animationLayers||[])entry.layer.dispose();this.animationLayers=[];
        for(const ticket of this.flightAnimations?.values()||[])ticket?.cancel?.();this.flightAnimations?.clear();
        if(this.preview)for(const play of [...this.preview.effectPlays.values()])if(play.transient){this.preview.stopEffect(play);this.preview.effectPlays.delete(play.id);}
        this.previewTickets=[];this.previewFired=new Set();this.previewWait=null;this.previewWaitIndex=undefined;this.previewLastFrame=undefined;
    }
    playPreviewSound(se){
        if(!se?.name)return null;
        const folder=require('path').join(this.parent.currentProject.path,'audio','se'),url=RRAssetFiles.urlFor(folder,se.name,RRAssetFiles.AUDIO_EXTENSIONS);
        if(!url)return null;
        const audio=new Audio(url),created=Date.now();let finished=false;
        audio.volume=Math.max(0,Math.min(1,(se.volume??90)/100));audio.playbackRate=Math.max(.5,Math.min(1.5,(se.pitch??100)/100));audio.preservesPitch=false;
        try{const C=window.AudioContext||window.webkitAudioContext;if(C){this.audioContext||=new C();this.audioContext.resume().catch(()=>{});const source=this.audioContext.createMediaElementSource(audio),pan=this.audioContext.createStereoPanner();pan.pan.value=Math.max(-1,Math.min(1,(se.pan||0)/100));source.connect(pan);pan.connect(this.audioContext.destination);audio._rrRelease=()=>{source.disconnect();pan.disconnect();};}}catch(error){console.warn('Sequence audio pan:',error);}
        this.sounds.push(audio);
        const finish=()=>{if(finished)return;finished=true;audio.pause();audio._rrRelease?.();const i=this.sounds.indexOf(audio);if(i>=0)this.sounds.splice(i,1);};
        audio.onended=finish;audio.onerror=finish;audio.play().catch(finish);
        return {isPlaying:()=>{if(!finished&&audio.readyState<2&&Date.now()-created>15000)finish();return !finished&&!audio.ended&&!audio.error;},cancel:finish};
    }
    previewDuration(){try{return ReactorBattleData.duration(ReactorBattleData.previewPlan(this.sequence,this.db.data.actionSequences));}catch{return ReactorBattleData.duration(this.sequence);}}
    advancePreview(delta){
        const B=ReactorBattleData,end=this.stepPlayback?.end??this.previewDuration();
        if(this.previewLastFrame!==undefined&&this.frame!==this.previewLastFrame)this.clearPreviewMedia();
        if(this.previewWait?.isPlaying()){this.previewLastFrame=this.frame;return;}
        this.previewWait=null;this.previewWaitIndex=undefined;
        const before=this.frame,after=Math.min(end,before+delta);this.frame=after;this.previewCues(before,after);
        this.previewLastFrame=this.frame;
        if(this.frame>=end&&!this.previewWait&&!this.previewTickets.some(t=>t.isPlaying())&&!this.sounds.length){
            if(this.loop&&!this.stepPlayback){this.clearPreviewMedia();this.frame=0;}else this.playing=false;
        }
    }
    previewAnimationId(step){
        if(!step.animationSource||step.animationSource==='id')return step.animationId||0;
        const weapon=this.previewBattler('user').equips()[0],attack=weapon?.animationId||1;
        return step.animationSource==='weapon'?attack:this.previewAction()?.animationId>0?this.previewAction().animationId:this.previewAction()?.animationId===-1?attack:0;
    }
    previewCues(before,after){
        this.previewFired||=new Set();this.previewTickets||=[];
        for(const [index,cue] of ReactorBattleData.timeline(this.previewSequence()).entries())if((!this.stepPlayback||index===this.stepPlayback.index)&&!this.previewFired.has(cue.step.id)&&cue.start>=before&&cue.start<=after){
            this.previewFired.add(cue.step.id);const tickets=[];
            const animationId=cue.step.type==='animation'?this.previewAnimationId(cue.step):0;
            if(animationId){
                const keys=cue.step.role==='user'?['user']:cue.step.role==='target'?['target'+(cue.step.targetIndex??0)]:Array.from({length:this.targetCount},(_,i)=>'target'+i);
                for(const key of keys){const ticket=this.preview?.playAnimation(key,animationId,cue.step.animationTransform);if(ticket)tickets.push(ticket);else {
                    const animation=this.db.getAnimation(animationId);
                    if(animation?.frames?.length&&typeof RRAnimationPreviewLayer!=='undefined'){
                        const layer=new RRAnimationPreviewLayer(this.stage),entry={layer,key,transform:{...cue.step.animationTransform}},scale=entry.transform.scale??1;
                        layer.play(animation,this.parent.currentProject.path,{transform:{scale},onSound:se=>this.playPreviewSound(se)});this.animationLayers.push(entry);
                        const created=Date.now();tickets.push({isPlaying:()=>layer.active&&(layer.mv.ready||Date.now()-created<15000),cancel:()=>layer.dispose()});
                    }
                }}
            }
            if(cue.step.type==='sound'){const ticket=this.playPreviewSound(cue.step.audio);if(ticket)tickets.push(ticket);}
            const ticket={isPlaying:()=>tickets.some(t=>t.isPlaying())};this.previewTickets.push(ticket);
            if(cue.step.waitForCompletion&&ticket.isPlaying()){this.previewWait=ticket;this.previewWaitIndex=index;this.frame=cue.start;break;}
        }
    }
    motionFor(role,frame=this.frame){
        let result={name:'idle',start:0};for(const cue of ReactorBattleData.timeline(this.previewSequence())){if(cue.start>frame)break;if(cue.step.type==='motion'&&(ReactorBattleData.roleKey(cue.step)===role||role==='target0'&&ReactorBattleData.roleKey(cue.step)==='target'||role.startsWith('target')&&cue.step.role==='allTargets'))result={name:ReactorBattleData.motionActionName(cue.step,this._posePlan)||'idle',start:cue.start};}return result;
    }
    paintSequenceLayers(ctx,visuals,poses,view,width,height){
        for(const layer of visuals.layers){const {step,owner,start}=layer,p=owner==='screen'?{x:0,y:0}:poses[owner]?view.project(poses[owner]):null;if(!p)continue;
            const bitmap=step.type==='icon'?this.iconSet:this.sequencePictures?.[step.name];
            if(!bitmap){if(step.type==='balloon'&&this.frame-start<76){ctx.save();ctx.font='24px sans-serif';ctx.fillStyle='#fff';ctx.fillText(['','!','?','♪','♥','⚡','…'][step.balloonId]||'!',p.x,p.y-80);ctx.restore();}continue;}
            const image=bitmap.image||bitmap.canvas;ctx.save();ctx.globalAlpha=(step.opacity??255)/255;ctx.translate(p.x+(step.x||0),p.y+(step.y||0));ctx.rotate(((step.angle||0)+(this.frame-start)*(step.spin||0))*Math.PI/180);ctx.scale(step.scale||1,step.scale||1);
            if(step.type==='icon'){const size=window.RRIconPicker?.sizeOf(this.db.getSystem())||32,index=step.iconIndex||0;ctx.drawImage(image,index%16*size,Math.floor(index/16)*size,size,size,-size/2,-size/2,size,size);}
            else if(step.type==='plane'){const pattern=ctx.createPattern(image,'repeat');ctx.translate(-(this.frame-start)*(step.scrollX||0),-(this.frame-start)*(step.scrollY||0));ctx.fillStyle=pattern;ctx.fillRect(0,0,step.width||width,step.height||height);}
            else ctx.drawImage(image,-bitmap.width/2,-bitmap.height/2);ctx.restore();
        }
        if(visuals.screenTone){const [r,g,b]=visuals.screenTone;ctx.save();ctx.globalAlpha=.25;ctx.fillStyle=`rgb(${Math.max(0,128+r)},${Math.max(0,128+g)},${Math.max(0,128+b)})`;ctx.fillRect(0,0,width,height);ctx.restore();}
        if(visuals.flash){const [r,g,b,a]=visuals.flash;ctx.save();ctx.globalAlpha=a/255;ctx.fillStyle=`rgb(${r},${g},${b})`;ctx.fillRect(0,0,width,height);ctx.restore();}
        const trace=visuals.trace.at(-1);if(trace){ctx.save();ctx.fillStyle='rgba(0,0,0,.75)';ctx.fillRect(8,height-30,width-16,24);ctx.fillStyle='#fff';ctx.font='12px sans-serif';ctx.fillText(this.ui.text(trace.label)+' · '+this.ui.text('Preview: game commands are not executed'),16,height-14);ctx.restore();}
    }
    async loadSequenceImages(){
        const generation=this.generation,view=this.preview;if(!view)return;this.sequencePictures||={};this.weaponSheets||={};
        for(const step of this.sequence.steps){
            const picture=(['picture','plane'].includes(step.type)||step.type==='projectile'&&step.iconSource==='picture')&&step.name;
            const sheet=step.type==='weapon'&&step.weaponGraphic==='sheet'?'Weapons'+Math.ceil((step.weaponImageId||1)/12):null;
            try{if(picture&&!this.sequencePictures[picture]){const image=await view.assets.image('pictures',picture);if(generation!==this.generation)return;this.sequencePictures[picture]=image;}if(sheet&&!this.weaponSheets[sheet]){const image=await view.assets.image('system',sheet);if(generation!==this.generation)return;this.weaponSheets[sheet]=image;}}catch(error){console.warn(error);}
        }
    }
    /** The Projectile step: what flies, where it is thrown, and a Start / Arrive / Look card whose Start arrows sit on the launch point in the preview. */
    drawProjectile(step,change){const U=this.ui,B=ReactorBattleData,host=this.inspector,source=step.iconSource||'color',project=this.parent.currentProject;
        U.field(host,'Projectile',U.select([['color','Colored Dot'],['action','Skill / Item (icon or 3D model)'],['weapon','Equipped Weapon (icon or 3D model)'],['icon','Choose Icon'],['picture','Picture'],['model','3D Model'],['animation','Animation']],source,v=>{change('iconSource',v);this.weaponModels={};this.drawInspector();this.loadSequenceImages();this.paint();}));
        if(source==='color'){const color=U.element('input');color.type='color';color.value=step.color||'#ffcc55';color.onchange=()=>change('color',color.value);U.field(host,'Color',color);U.number(host,'Size (pixels)',step.size||8,v=>change('size',Math.max(1,v)),1);}
        if(source==='icon')host.append(U.button('Choose Icon…',()=>this.parent.showIconPicker(step.iconIndex||0,id=>change('iconIndex',id),require('path').join(project.path,'img','system','IconSet.png'))));
        if(source==='picture'){const files=RRAssetFiles.listNames(require('path').join(project.path,'img','pictures'),['.png','.webp']);U.field(host,'Picture File',U.select([['','None'],...files.map(name=>[name,name,true])],step.name||'',v=>{change('name',v);this.loadSequenceImages();}));}
        if(source==='model'){const models=typeof ModelGraphicPicker!=='undefined'?ModelGraphicPicker.listModels(project.path):[];
            U.field(host,'3D Model',U.select([['','None'],...models.map(m=>[m.name,m.name,true])],step.model?.name||'',v=>{const m=models.find(x=>x.name===v);change('model',m?{name:m.name,file:m.file,ext:m.ext,texture:m.texture||''}:undefined);this.weaponModels={};this.paint();}));
            if(!models.length)host.append(U.element('p','rr-battle-help','No 3D models in this project yet. Import one in Database › 3D Models.'));}
        if(source==='animation'){const animation=step.animationId?this.db.getAnimation(step.animationId):null;const pick=U.button(animation?.name||'Choose Animation…',()=>this.pickAnimation(step));if(animation)pick.dataset.rrI18nSkip='';U.field(host,'Animation',pick);}
        U.field(host,'Thrown To',U.select([['target','Current Target'],['allTargets','All Targets'],['user','User'],['subject','Subject']],step.destination||'target',v=>{change('destination',v);this.drawSteps();this.updateStepSelection();}));
        U.field(host,'Flight',U.select([['oneWay','One Way'],['return','Return']],step.flight||'oneWay',v=>change('flight',v)));
        U.field(host,'Starts From',U.select([['rightHand','Right Hand'],['leftHand','Left Hand'],['center','Body'],['offset','Position Offset']],step.attachment||'offset',v=>{change('attachment',v);this.drawInspector();this.paint();}));
        const row=(key,axis,label,min,max,stepSize,reset)=>({key,axis,label,min,max,step:stepSize,reset}),heightKey=()=>(step.attachment||'offset')==='offset'?'startHeight':'z',unit=key=>key==='scale'||['startHeight','endHeight'].includes(key)?1:0;
        this.controls.transformCard(host,{id:'flight',initialTab:'start',
            tabs:[{id:'start',label:'Start'},{id:'arrive',label:'Arrive'},{id:'look',label:'Look'}],
            tool:tab=>tab==='look'?'rotate':'move',
            // Start and Look show the launch; Arrive shows the flight halfway, where the arc and landing height read.
            shown:()=>{const cue=B.timeline(this.sequence)[this.selected];if(!cue)return;this.stepPlayback=null;this.playing=false;this.asOfStep=false;this.frame=(this.controls.cardTabs?.flight||'start')==='arrive'?cue.start+Math.round((step.duration||0)/2):cue.start;},
            rows:tab=>tab==='start'?[row('x','X','X (tiles)',-2,2,.01,0),row('y','Y','Y (tiles)',-2,2,.01,0),row(heightKey(),'Z','Height (tiles)',-1,3,.01,unit(heightKey()))]
                :tab==='arrive'?[row('endHeight','Z','Arrival Height (tiles)',-1,3,.01,1),row('arc','·','Arc Height (tiles)',-2,4,.01,0)]
                :[row('rotation','·','Rotation (degrees)',-180,180,1,0),row('spin','·','Spin (degrees/frame)',-45,45,.5,0),row('scale','S','Scale',.1,4,.01,1)],
            get:key=>step[key]??unit(key),
            set:(key,value)=>{if(this.sequence.steps[this.selected]!==step)return;step[key]=key==='scale'?Math.max(.01,value):Math.round(value*100)/100;U.changed();this.validate();},
            reset:tab=>{for(const key of tab==='start'?['x','y',heightKey()]:tab==='arrive'?['endHeight','arc']:['rotation','spin','scale'])step[key]=unit(key);U.changed();this.validate();},
            hint:tab=>tab==='start'?(heightKey()==='z'?'Drag the arrows in the preview, or slide. From the hand: X is forward of the thrower, Z is up.':'Drag the arrows in the preview, or slide. From the thrower’s feet: X is forward, Z is height.'):tab==='arrive'?'Where it lands on the target, and how high the arc rises on the way.':'Turn and spin the picture; scale the picture or model.'
        });
    }
    /** The Pose Parts section of a rigged Motion step: pick a part (click it on the model, or choose it here), then bend, slide or resize it on a card or by dragging its gizmos in the preview. Picking a part on a step that plays a clip turns the step into a pose. */
    drawPoseParts(step,role,host){const U=this.ui,B=ReactorBattleData;host.classList.add('rr-pose-parts');
        const parts=this.modelParts(role),posed=step.parts||[],posing=B.hasPose(step);
        if(!posed.some(p=>p.part===this.posePartName))this.posePartName=posed[0]?.part||null;
        host.append(U.element('p','rr-battle-help',posing?'Click a part on the model, or pick one below. Drag its rings to bend it, or slide. The pose is reached over this step’s frames and kept until a later step moves that part.':'Click a part on the model in the preview, or choose one here, to bend, slide or resize just that part. This step then holds that pose instead of playing a motion.'));
        const picker=U.element('div','rr-pose-part-picker'),choices=parts.filter(p=>!posed.some(x=>x.part===p.name));
        const select=U.select([['',U.text('Choose a part…')],...choices.map(p=>[p.name,p.label,!B.humanoidJoints[p.name]])],'',()=>{});select.setAttribute('aria-label',U.text('Part'));
        const add=U.button('Add Part',()=>{if(select.value)this.pickPosePart(select.value);});picker.append(select,add);host.append(picker);
        if(!parts.length)host.append(U.element('p','rr-battle-help','This model has no rig or carved parts yet. Rig it in Database › 3D Models first.'));
        const list=U.element('div','rr-pose-part-list');host.append(list);
        for(const entry of posed){const row=U.element('div','rr-pose-part-row'+(entry.part===this.posePartName?' selected':''));const pick=U.button(B.partLabel(entry.part),()=>{this.posePartName=entry.part;this.controls.setTool('rotate');this.drawInspector();this.showPoseFrame();this.paint();},true);pick.classList.add('rr-pose-part-name');pick.setAttribute('aria-pressed',String(entry.part===this.posePartName));
            const remove=U.button('×',()=>{this.edit(()=>step.parts=step.parts.filter(p=>p!==entry));if(this.posePartName===entry.part)this.posePartName=null;this.drawInspector();this.showPoseFrame();this.paint();},true);remove.classList.add('rr-pose-part-remove');remove.title=U.text('Remove');remove.setAttribute('aria-label',U.text('Remove'));row.append(pick,remove);list.append(row);}
        if(!posing)return;
        const reset=U.element('input');reset.type='checkbox';reset.checked=!!step.resetPose;reset.onchange=()=>{this.edit(()=>step.resetPose=reset.checked||undefined);this.showPoseFrame();this.paint();};U.field(host,'Start from rest',reset);
        const entry=posed.find(p=>p.part===this.posePartName);if(!entry)return;
        const info=parts.find(p=>p.name===entry.part),hinge=info?.hinge??null,axes=['X','Y','Z'];
        const row=(key,axis,label,min,max,stepSize,reset)=>({key,axis,label,min,max,step:stepSize,reset});
        const get=key=>{const [field,index]=key.split('.');return B.partPose(entry)[field][Number(index)];};
        this.controls.transformCard(host,{id:'part',
            tabs:[{id:'rotate',label:'Rotate'},{id:'offset',label:'Offset'},{id:'scale',label:'Scale'}],
            tool:tab=>tab==='offset'?'move':'rotate',shown:()=>this.showPoseFrame(),
            rows:tab=>tab==='rotate'?[...(hinge!==null?[row('rotate.'+hinge,axes[hinge],U.message('Bend ({axis})',{axis:axes[hinge]}),-160,160,1,0)]:[]),...[0,1,2].filter(i=>i!==hinge).map(i=>row('rotate.'+i,axes[i],U.message('Turn {axis} (degrees)',{axis:axes[i]}),-180,180,1,0))]
                // Offsets are named the way the rest of the editor names them: Z is up, Y is depth. The part's own frame keeps Y up, so the middle value is Z.
                :tab==='offset'?[[0,'X'],[2,'Y'],[1,'Z']].map(([i,axis])=>row('move.'+i,axis,U.message('{axis} (tiles)',{axis}),-1,1,.01,0))
                :[0,1,2].map(i=>row('resize.'+i,axes[i],U.message('Scale {axis}',{axis:axes[i]}),.2,3,.01,1)),
            get,
            set:(key,value)=>{const live=this.posePartEntry(entry.part);if(!live)return;const [field,index]=key.split('.'),pose=B.partPose(live);pose[field][Number(index)]=Math.round(value*100)/100;Object.assign(live,pose);U.changed();this.validate();},
            reset:tab=>{const live=this.posePartEntry(entry.part);if(!live)return;const field=tab==='rotate'?'rotate':tab==='offset'?'move':'resize';live[field]=field==='resize'?[1,1,1]:[0,0,0];U.changed();this.validate();},
            hint:tab=>tab==='rotate'?(hinge!==null?'A hinge: Bend is the joint; the other turns twist it.':'Drag the rings in the preview, or slide.'):tab==='offset'?'Slides the part in the model’s own frame.':'Resizes the part about its pivot.'
        });
    }
    /** The pose steps' rules, rebuilt when they change, joined to each previewed model's own rules. */
    ensurePoseRules(view){
        const B=ReactorBattleData,sequence=this.previewSequence(),key=JSON.stringify(sequence.steps.filter(s=>s.type==='motion').map(s=>[s.id,s.duration,s.role,s.targetIndex,s.motion,s.resetPose,s.parts]));
        if(this._poseRulesKey!==key){this._poseRulesKey=key;this._posePlan=B.posePlan(sequence);this._poseRules=Object.values(this._posePlan.rules).flat();}
        for(const record of view.models.values()){if(!record.binding||!Array.isArray(record.rules))continue;if(record._poseRulesKey===key)continue;record._baseRules||=record.rules;
            // A release step plays this model's own rules for the motion it names, under the release's action.
            const releases=Object.keys(this._posePlan.releases).flatMap(id=>B.releaseMotionRules(this._posePlan,id,record._baseRules));
            record.rules=record._baseRules.concat(this._poseRules,releases);record._poseRulesKey=key;}
    }
    /** Where a limb points from a joint to its child, in the model's frame: a file joint's own frame is turned by its skeleton. */
    limbDirection(record,joint,child){if(!child.userData?.__reactorClipBone&&!joint.userData?.__reactorClipBone)return [child.position.x,child.position.y,child.position.z];const root=record.binding.root;root.updateWorldMatrix(true,true);const a=root.worldToLocal(joint.getWorldPosition(new THREE.Vector3())),b=root.worldToLocal(child.getWorldPosition(new THREE.Vector3()));return [b.x-a.x,b.y-a.y,b.z-a.z];}
    /** The parts the previewed model of `role` can pose: rig bones first, then carved parts, with what kind of joint each is. */
    modelParts(role){
        const B=ReactorBattleData,record=this.preview?.models?.get?.(role==='user'?'user':'target0'),list=[],seen=new Set();
        for(const entry of record?.binding?.meshes||[])for(const part of entry.parts||[]){const name=String(part.name||'');if(!name||seen.has(name.toLowerCase()))continue;seen.add(name.toLowerCase());
            const joint=B.humanoidJoints[name],child=Reactor3D.isRigJoint(entry.mesh)?entry.mesh.children.find(c=>Reactor3D.isRigJoint(c)):null,direction=child?this.limbDirection(record,entry.mesh,child):null;
            list.push({name,label:B.partLabel(name),kind:joint?.kind||'ball',rig:!!joint||Reactor3D.isRigJoint(entry.mesh),hinge:joint?.kind==='hinge'?B.hingeAxis(direction):null});}
        return list.sort((a,b)=>(b.rig-a.rig)||a.label.localeCompare(b.label));
    }
    /** The Show step a held-item step builds on: itself for a Show, else the last Show for the same battler before it. */
    heldBase(step){const B=ReactorBattleData,steps=this.sequence.steps,index=steps.indexOf(step);if(!step||step.type!=='weapon')return null;if(B.weaponMode(step)==='show')return step;const role=B.roleKey(step);let base=null;for(let i=0;i<index;i++){const s=steps[i];if(s.type==='weapon'&&B.roleKey(s)===role&&B.weaponMode(s)==='show')base=s;}return base;}
    posePartEntry(name){const step=this.sequence.steps[this.selected];return (step?.parts||[]).find(p=>p.part===name)||null;}
    showPoseFrame(){this.stepPlayback=null;this.playing=false;this.asOfStep=true;this.frame=ReactorBattleData.timeline(this.sequence)[this.selected].end;}
    /** A part chosen by clicking the model joins the pose if it is new, and becomes the one the gizmos move. */
    pickPosePart(name){const B=ReactorBattleData,step=this.sequence.steps[this.selected];if(!step||step.type!=='motion')return;if(!this.posePartEntry(name))this.edit(()=>{if(!B.hasPose(step))step.motion=B.POSE_MOTION;step.parts||=[];step.parts.push({part:name,...B.poseRest()});});this.posePartName=name;this.drawInspector();this.openFold(step.id+':pose');this.showPoseFrame();this.paint();}
    /** Unfolds an inspector section after a redraw, so a pick or a choice shows the section it filled. */
    openFold(key){const details=this.inspector?.querySelector?.('[data-disclosure-key="'+String(key).replace(/["\\]/g,'\\$&')+'"]');if(details&&!details.open)details.open=true;}
    previewBattler(key){
        const role=key==='user'?'user':'target',actor=this.castKinds[role]==='actors',record=actor?this.db.getActor(this.cast[role]):this.db.getEnemy(this.cast[role]),graphic=this.ui.settings()[actor?'actors':'enemies']?.[record?.id]?.graphic;
        const dual=[...(record?.traits||[]),...(actor?this.db.getClass(record?.classId)?.traits||[]:[])].some(t=>t.code===55&&t.dataId===1);
        const sample=this.sampleWeapon?this.db.getWeapon(this.sampleWeapon):null;
        return {equips:()=>{const list=actor?(record?.equips||[]).map((id,i)=>i===0||i===1&&dual?this.db.getWeapon(id):this.db.getArmor(id)):(graphic?.weaponIds||[]).map(id=>this.db.getWeapon(id));if(sample)list[0]=sample;return list;}};
    }
    previewAction(){const [kind,id]=String(this.sampleAction||'skills:1').split(':');return this.db.data[kind]?.[Number(id)];}
    previewRoles(step,poses){return step.role==='allTargets'?Object.keys(poses).filter(k=>/^target\d+$/.test(k)):step.role==='target'?['target'+(step.targetIndex||0)]:['user'];}
    /** The 3D model bound to the previewed battler's equipped weapon, for a weapon step that shows the equipped icon. */
    weaponModelSpec(step,key){
        if(step.weaponGraphic==='sheet'||typeof RRDatabase3DBindings==='undefined')return null;
        const source=step.iconSource||(step.type==='projectile'?'color':'weapon');let section,id;
        if(source==='model')return step.model?.name?step.model:null;
        if(source==='weapon'){const role=key==='user'?'user':'target';section='weapons';id=this.sampleWeapon||(this.castKinds[role]==='actors'?this.db.getActor(this.cast[role])?.equips?.[Math.max(0,(step.equipIndex||1)-1)]:this.ui.settings().enemies?.[this.cast[role]]?.graphic?.weaponIds?.[Math.max(0,(step.equipIndex||1)-1)]);}
        else if(source==='action'&&this.sampleAction){[section,id]=this.sampleAction.split(':');id=Number(id);}
        else return null;
        if(!id)return null;const cacheKey=section+':'+id;this.weaponModels||={};
        if(!(cacheKey in this.weaponModels))try{this.weaponModels[cacheKey]=RRDatabase3DBindings.get(this.parent.currentProject.path,section,id);}catch(error){this.weaponModels[cacheKey]=null;}
        return this.weaponModels[cacheKey];
    }
    previewPropImage(step,key){
        const B=ReactorBattleData;
        if(step.weaponGraphic==='sheet'){const id=step.weaponImageId||1,index=(id-1)%12,bitmap=this.weaponSheets?.['Weapons'+Math.ceil(id/12)];return bitmap?{source:bitmap.image||bitmap.canvas,frame:{x:(Math.floor(index/6)*3+(step.weaponFrame||1)-1)*96,y:index%6*64,width:96,height:64}}:null;}
        if(step.iconSource==='picture'){const bitmap=this.sequencePictures?.[step.name];return bitmap?{source:bitmap.image||bitmap.canvas,frame:{x:0,y:0,width:bitmap.width,height:bitmap.height}}:null;}
        if(step.type==='projectile'&&step.iconSource==='animation'){const source=document.createElement('canvas');source.width=source.height=2;return {source,frame:{x:0,y:0,width:2,height:2}};}
        if(step.type==='projectile'&&(!step.iconSource||['color','model'].includes(step.iconSource))){
            const source=document.createElement('canvas');source.width=source.height=step.size||8;source.getContext('2d').fillStyle=step.color||'#ffcc55';source.getContext('2d').fillRect(0,0,source.width,source.height);return {source,frame:{x:0,y:0,width:source.width,height:source.height}};
        }
        if(!this.iconSet)return null;const size=window.RRIconPicker?.sizeOf(this.db.getSystem())||32,index=B.visualIcon(step,this.previewBattler(step.sourceRole==='user'?'user':key),this.previewAction());
        return {source:this.iconSet.image||this.iconSet.canvas,frame:{x:index%16*size,y:Math.floor(index/16)*size,width:size,height:size}};
    }
    paintProps(poses,view,context){
        const B=ReactorBattleData,sequence=this.previewSequence(),held=new Map(),active=[],live=new Set();
        for(const cue of B.timeline(sequence)){if(cue.start>this.frame)break;const step={...B.commandDefaults(cue.step.type),...cue.step};
            if(step.type==='weapon')for(const key of this.previewRoles(step,poses)){const mode=B.weaponMode(step),prev=held.get(key);
                if(mode==='hide')held.set(key,null);
                else if(mode==='move'){if(prev){const t=cue.end===cue.start?1:Math.min(1,(this.frame-cue.start)/(cue.end-cue.start));held.set(key,{...prev,...B.heldPose(prev,step,B.ease(t,step.easing))});}}
                else held.set(key,step);}
            if(step.type==='projectile'&&this.frame<cue.end)active.push({...cue,step});
        }
        const draw=(id,step,key,p)=>{
            const spec=['weapon','projectile'].includes(step.type)?this.weaponModelSpec(step,key):null;
            if(spec&&p){live.add(id);const record=view.models.get(id);if(!record)view.addModel(id,Reactor3D.normalizeModelSpec(spec),{x:p.x,y:p.y,z:p.z});
                view.place(id,B.heldPlacement(p,poses[key]?.facing||0,step,spec));if(record?.object)record.object.visible=step.visible!==false;return;}
            const img=this.previewPropImage(step,key);if(!img||!p)return;live.add(id);view.sequenceBillboard(id,img.source,img.frame,p,step);
            // An animation projectile plays its animation on the carrier once per flight; the carrier moving moves the animation.
            if(step.type==='projectile'&&step.iconSource==='animation'&&step.animationId>0){this.flightAnimations||=new Map();if(!this.flightAnimations.has(id))this.flightAnimations.set(id,view.playAnimation(id,step.animationId,{})||null);}};
        for(const [key,step] of held)if(step&&poses[key])draw('extra:held:'+key,step,key,view.attachmentPoint(key,step,poses[key]));
        for(const cue of active){const step=cue.step,t=(this.frame-cue.start)/Math.max(1,step.duration),startPoses=B.previewVisuals(sequence,cue.start,context).poses;
            const destinations=step.destination==='allTargets'?Object.keys(poses).filter(k=>/^target\d+$/.test(k)):step.destination==='user'||step.destination==='subject'?['user']:['target'+(step.targetIndex||0)];
            for(const key of this.previewRoles(step,poses))for(const target of destinations){if(!poses[target]||!startPoses[key])continue;
                const start={...startPoses[key],facing:startPoses[key].facing??B.facingToward(startPoses[key],startPoses[target])},record=view.models.get(key),previous=record?.position;
                if(record?.binding){const motion=this.motionFor(key,cue.start),rule=record.rules.find(r=>r.trigger==='action'&&r.name.toLowerCase()===motion.name.toLowerCase());view.place(key,start);Reactor3D.applyModelAnimation(record.binding,record.rules,{frame:cue.start,moving:false,scale:record.scale,action:{name:rule?.name||motion.name,frame:motion.start},seek:true});}
                const from=view.attachmentPoint(key,{...step,z:step.attachment&&step.attachment!=='offset'?(step.z||0):step.startHeight??1},start);
                if(previous){view.place(key,previous);const motion=this.motionFor(key),rule=record.rules.find(r=>r.trigger==='action'&&r.name.toLowerCase()===motion.name.toLowerCase());Reactor3D.applyModelAnimation(record.binding,record.rules,{frame:this.frame,moving:false,scale:record.scale,action:{name:rule?.name||motion.name,frame:motion.start},seek:true});}
                const to={...poses[target],z:(poses[target].z||0)+(step.endHeight??1)},p=B.flightPoint(from,to,t,step.arc||0,step.flight==='return');
                draw('extra:flight:'+cue.step.id+':'+key+':'+target,{...step,rotation:(step.rotation||0)+(this.frame-cue.start)*(step.spin||0)},key,p);
            }
        }
        for(const key of [...view.billboards.keys()])if((key.startsWith('extra:held:')||key.startsWith('extra:flight:'))&&!live.has(key))view.remove(key);
        for(const [key,ticket] of this.flightAnimations||[])if(!live.has(key)){ticket?.cancel?.();this.flightAnimations.delete(key);}
        // A held or thrown model stays loaded but is only seen while its step is current; scrubbing back before Show hides it.
        for(const [key,record] of view.models)if((key.startsWith('extra:held:')||key.startsWith('extra:flight:'))&&!live.has(key)&&record.object)record.object.visible=false;
    }
    paint(){this.controls.resize();const B=ReactorBattleData,ctx=this.canvas.getContext('2d'),context=this.previewContext(),width=this.canvas.width,height=this.canvas.height,visuals=B.previewVisuals(this.previewSequence(),this.frame,context),poses=Object.fromEntries(Object.entries((this.controls.mode==='formation'?context.homes:visuals.poses)).map(([k,p])=>[k,B.visualPose(p)]));
        ctx.fillStyle='#15171c';ctx.fillRect(0,0,width,height);
        const view=this.preview;
        if(view){
            const camera=this.controls.cameraPose(poses);Object.assign(view.settings.camera,camera,{z:(camera.z||0)+1,distance:this.controls.distance});
            this.ensurePoseRules(view);
            for(const key of ['user','target0','target1','target2','target3']){
                const role=key==='user'?'user':'target',p=poses[key],image=this.images[role],motion=this.controls.mode==='formation'?{name:'idle',start:0}:this.motionFor(key);
                if(image&&p){const {bitmap,actor,graphic}=image,held=visuals.held[key],facingYaw=p.facing??B.facingToward(p,role==='user'?poses.target:poses.user),frame=B.graphicFrame(graphic,bitmap.width,bitmap.height,held?.name||motion.name,held?held.frame*(graphic.speed||12):Math.max(0,this.frame-motion.start),facingYaw);
                    view.billboard(key,bitmap.image,frame,{...p,flipX:(actor?p.facing>0:p.facing<0)!==!!graphic.mirror},Math.max(.2,frame.height/48)*(graphic.scale||1));
                }
                const record=view.models.get(key)||view.billboards.get(key);if(record?.object){record.object.visible=!!p;record.object.traverse?.(object=>{for(const material of Array.isArray(object.material)?object.material:[object.material])if(material){material.transparent=true;material.opacity=visuals.opacity[key]??1;}});if(p){view.place(key,{...p,facing:p.facing??B.facingToward(p,role==='user'?poses.target:poses.user)});record.action=motion.name==='idle'?null:{name:motion.name,start:motion.start};if(motion.name==='idle'&&record.binding)record.binding.movingAt=undefined;}}
            }
            view.sequenceVisualUpdates=new Set([()=>this.paintProps(poses,view,context)]);
            this.controls.sync(poses);view.seekAnimations=true;view.effectsPaused=!this.playing;view.frame=this.frame-1;view.render();ctx.drawImage(view.renderer.domElement,visuals.shake||0,0,width,height);this.paintSequenceLayers(ctx,visuals,poses,view,width,height);
            for(const entry of [...this.animationLayers||[]]){
                const {layer,key,transform:t}=entry,p=poses[key];if(!layer.active){layer.dispose();this.animationLayers.splice(this.animationLayers.indexOf(entry),1);continue;}
                if(p){const a=view.project({x:p.x+(t.x||0),y:p.y+(t.y||0),z:p.z+1.25+(t.z||0)}),b=view.project({...p,z:p.z+1}),c=view.project(p),ratio=this.canvas.clientWidth/width;layer.moveTo(a.x*ratio,a.y*ratio,Math.max(64,Math.hypot(b.x-c.x,b.y-c.y)*8*ratio));layer.setSpan(2.5);}
            }
            for(const key of ['user',...Array.from({length:this.targetCount},(_,i)=>'target'+i)]){const p=view.project(poses[key]);ctx.fillStyle=key===this.controls.activeKey()?'#ffcc33':key==='user'?'#55aaff':'#ff6680';ctx.beginPath();ctx.arc(p.x,p.y,5*width/Math.max(1,this.canvas.clientWidth),0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font=Math.round(12*width/Math.max(1,this.canvas.clientWidth))+'px sans-serif';ctx.textAlign='center';ctx.fillText((key==='user'?this.ui.text('User'):this.ui.text(this.ui.message('Target {n}',{n:Number(key.slice(6))+1}))),p.x,p.y+(key==='user'?20:38)*width/Math.max(1,this.canvas.clientWidth));ctx.textAlign='left';}
        }else{ctx.fillStyle='#ddd';ctx.font='14px sans-serif';ctx.fillText('Loading preview…',20,30);}
        this.scrub.max=Math.max(B.duration(this.sequence),this.stepPlayback?.end||0);this.scrub.value=this.frame;const elapsed=this.frame-(this.stepPlayback?.start||0),duration=this.stepPlayback?this.stepPlayback.end-this.stepPlayback.start:B.duration(this.sequence);this.time.textContent=this.ui.text(this.ui.message('{frame} / {duration} frames · {seconds}s',{frame:Math.round(elapsed),duration,seconds:(elapsed/60).toFixed(2)}));
    }
}
