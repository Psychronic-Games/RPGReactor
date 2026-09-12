/* Built-in sequence authoring: steps and timeline are views of the same data. */
class DatabaseActionSequenceEditor {
    constructor(parent) {this.parent=parent;this.ui=parent.battlePresentationEditor;this.db=parent.databaseManager;}
    dispose(){this.clearPreviewMedia();this.audioContext?.close().catch(()=>{});this.audioContext=null;if(this.stepLanguageChanged)window.removeEventListener('rr-language-changed',this.stepLanguageChanged);this.stepLanguageChanged=null;this.endStepDrag();if(this.stepMenu&&this.parent._databaseActionMenu===this.stepMenu)this.parent.closeDatabaseActionMenu();this.stepMenu=null;this.controls?.dispose();this.controls=null;cancelAnimationFrame(this.raf);this.raf=0;this.playing=false;this.grid?.geometry.dispose();this.grid?.material.dispose();this.grid=null;this.preview?.dispose();this.preview=null;for(const audio of this.sounds||[])audio.pause();this.sounds=[];this.generation=(this.generation||0)+1;}
    show(container,sequence){
        this.dispose();this.stepPlayback=null;this.sequence=sequence;this.selected=0;this.frame=0;this.undo=[];this.redo=[];this.disclosures=new Map();this.cast={user:1,target:1};this.castKinds={user:'actors',target:'enemies'};this.mirrored=false;this.images={};
        const U=this.ui,B=ReactorBattleData;this.host=U.element('div','rr-sequence-editor');container.append(this.host);
        const toolbar=U.element('div','rr-battle-toolbar rr-sequence-header');this.host.append(toolbar);
        const name=U.element('input','database-field-value');name.value=sequence.name;name.setAttribute('aria-label','Name');name.onchange=()=>{this.edit(()=>sequence.name=name.value);this.parent._activeDatabaseList?.refresh();};toolbar.append(name);
        const purpose=U.field(toolbar,'Sequence Purpose',U.select(B.purposes,B.purpose(sequence),value=>{this.edit(()=>sequence.purpose=value);this.updateReferences();}));purpose.setAttribute('aria-label',U.text('Sequence Purpose'));purpose.title=U.text('Sequence Purpose');
        const sequenceDetails=U.element('details','rr-sequence-settings');sequenceDetails.append(U.element('summary','','Options'));const sequenceOptions=U.element('div','rr-sequence-settings-content');sequenceDetails.append(sequenceOptions);sequenceDetails.onkeydown=event=>{if(event.key==='Escape'){sequenceDetails.open=false;sequenceDetails.querySelector('summary').focus();event.stopPropagation();}};toolbar.append(sequenceDetails);
        U.field(sequenceOptions,'Impact Behavior',U.select([['once','One Impact · Skill Repeats'],['authored','Authored Hits · Each Impact Applies Once']],sequence.hitPolicy||'once',value=>this.edit(()=>sequence.hitPolicy=value)));
        this.previewProjection||='3d';U.field(sequenceOptions,'Projection',U.select([['3d','3D',true],['2d','2D',true]],this.previewProjection,value=>{this.previewProjection=value;this.loadCast();}));
        const sampleActions=[...(this.db.data.items||[]).filter(Boolean).map(r=>['items:'+r.id,U.message('Item: {name}',{name:r.name})]),...(this.db.data.skills||[]).filter(Boolean).map(r=>['skills:'+r.id,U.message('Skill: {name}',{name:r.name})])];const assigned=B.references(this.ui.settings(),sequence.id,this.db.data.actionSequences).find(r=>['skills','items'].includes(r.kind)),itemAction=sequence.steps.some(s=>s.iconSource==='action');this.sampleAction=assigned?assigned.kind+':'+assigned.id:sampleActions.find(([id])=>id.startsWith(itemAction?'items:':'skills:'))?.[0]||sampleActions[0]?.[0]||'skills:1';
        U.field(sequenceOptions,'Skill / Item',U.select(sampleActions,this.sampleAction,value=>{this.clearPreviewMedia();this.sampleAction=value;this.frame=0;this.playing=false;}));
        const template=U.select(B.templates.map(t=>[t,t]),B.templates.includes(sequence.name)?sequence.name:B.templates[0],()=>{});toolbar.append(template,U.button('Use Template',()=>{this.edit(()=>sequence.steps=B.purpose(sequence)==='action'?B.template(template.value).steps:B.purpose(sequence)==='motion'?[B.step('motion',{motion:'idle',duration:60})]:B.defaultPhase(B.purpose(sequence),{isAttack:true}).steps);this.selected=0;this.drawSteps();this.drawInspector();}));
        toolbar.append(U.button('Undo',()=>this.history(this.undo,this.redo)),U.button('Redo',()=>this.history(this.redo,this.undo)));
        const workspace=U.element('div','rr-battle-workspace');this.host.append(workspace);const center=U.element('div','rr-sequence-center');workspace.append(center);const inspectorCard=U.section('Battler Motion');inspectorCard.panel.classList.add('rr-sequence-inspector-card');this.inspectorHeader=inspectorCard.panel.querySelector('.database-section-header');this.inspector=inspectorCard.body;this.inspector.classList.add('rr-battle-inspector');workspace.append(inspectorCard.panel);
        const cast=U.element('div','rr-battle-toolbar rr-sequence-cast');center.append(cast);
        const actors=this.db.getActors(),enemies=this.db.getEnemies();
        this.cast.user=actors[0]?.id;this.cast.target=enemies[0]?.id;
        const choices=actors.map(a=>['actors:'+a.id,U.message('Actor: {name}',{name:a.name})]).concat(enemies.map(e=>['enemies:'+e.id,U.message('Enemy: {name}',{name:e.name})]));
        for(const role of ['user','target'])U.field(cast,role==='user'?'User':'Target',U.select(choices,this.castKinds[role]+':'+this.cast[role],value=>{const [kind,id]=value.split(':');this.castKinds[role]=kind;this.cast[role]=Number(id);this.loadCast();}));
        const mirror=U.element('input');mirror.type='checkbox';mirror.onchange=()=>this.mirrored=mirror.checked;U.field(cast,'Mirror Formation',mirror);
        this.targetCount=1;U.field(cast,'Targets',U.select([[1,'1'],[2,'2'],[3,'3'],[4,'4']],1,value=>{this.targetCount=Number(value);this.controls.targetsChanged();this.drawInspector();}));
        this.stage=U.element('div','rr-sequence-stage');
        this.canvas=U.element('canvas','rr-sequence-preview');this.canvas.width=720;this.canvas.height=340;this.stage.append(this.canvas);
        this.controls=new ActionSequencePreview(this);this.controls.toolbar(center);center.append(this.stage);
        const playback=U.element('div','rr-battle-toolbar rr-sequence-playback');center.append(playback);
        playback.append(U.button('Play Step',()=>this.playStep()),U.button('Play / Pause',()=>{this.controls.transformPose=null;this.stepPlayback=null;if(!this.playing&&this.frame>=B.duration(sequence)){this.clearPreviewMedia();this.frame=0;}this.playing=!this.playing;}),U.button('Reset',()=>{this.clearPreviewMedia();this.controls.transformPose=null;this.stepPlayback=null;this.playing=false;this.frame=0;}),U.button('Previous Frame',()=>{this.controls.transformPose=null;this.stepPlayback=null;this.playing=false;this.frame=Math.max(0,this.frame-1);}),U.button('Next Frame',()=>{this.controls.transformPose=null;this.stepPlayback=null;this.playing=false;this.frame=Math.min(B.duration(sequence),this.frame+1);}));
        this.loop=false;const loop=U.element('input');loop.type='checkbox';loop.onchange=()=>this.loop=loop.checked;U.field(playback,'Loop',loop);
        this.speed=1;U.field(playback,'Speed',U.select([[.25,'¼×'],[.5,'½×'],[1,'1×'],[2,'2×']],1,value=>this.speed=Number(value)));
        this.scrub=U.element('input','rr-sequence-scrub');this.scrub.type='range';this.scrub.min=0;this.scrub.step=1;this.scrub.oninput=()=>{this.clearPreviewMedia();this.controls.transformPose=null;this.stepPlayback=null;this.frame=Number(this.scrub.value);this.playing=false;};center.append(this.scrub);
        this.time=U.element('span','rr-battle-help');center.append(this.time);
        const timeline=U.section('Action Steps');timeline.panel.classList.add('rr-sequence-timeline-card');workspace.prepend(timeline.panel);
        const modes=U.element('div','rr-battle-toolbar rr-sequence-step-modes');modes.append(U.button('Steps',()=>{this.timelineMode=false;this.drawSteps();}),U.button('Timeline',()=>{this.timelineMode=true;this.drawSteps();}));timeline.body.append(modes);
        this.steps=U.element('div','rr-sequence-steps');timeline.body.append(this.steps);this.stepLanguageChanged=()=>{this.groupStepChoices();this.updateStepDescriptions();this.drawInspector();this.validate();this.updateReferences();};window.addEventListener('rr-language-changed',this.stepLanguageChanged);
        const add=U.element('div','rr-battle-toolbar');this.stepType=U.select([...B.basicSteps.map(t=>['basic:'+t,t]),...B.types.map(t=>[t,this.label(t)])],'basic:Run to Target',()=>{});const addButton=U.button('Add Step',()=>this.insertSteps(this.newSteps()));add.append(this.stepType,addButton);timeline.body.append(add);this.groupStepChoices();
        const quick=U.element('div','rr-sequence-quick-steps');for(const name of B.basicSteps){const button=U.button({'Run to Target':'Run','Punch':'Punch','Return Home':'Return'}[name],()=>this.insertSteps(B.basic(name)));button.title=U.text('Add Step')+': '+U.text(name);quick.append(button);}timeline.body.insertBefore(quick,this.steps);
        this.bindStepEditing(timeline.panel,addButton);
        this.validation=U.element('p','rr-battle-help');this.host.append(this.validation);
        this.references=U.element('p','rr-battle-help');this.host.append(this.references);this.updateReferences();
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
    updateReferences(){const refs=ReactorBattleData.references(this.ui.settings(),this.sequence.id,this.db.data.actionSequences);this.ui.setText(this.references,refs.length?this.ui.message('Used by: {records}',{records:refs.map(r=>(window.I18n?.tDbType(r.kind)||r.kind)+' #'+r.id+(r.slot?' · '+r.slot:'')).join(', ')}):'Assign this sequence from a skill, item, weapon, actor or enemy. Previewing never applies damage or changes game state.');}
    motionLabels(){return {...Object.fromEntries(ReactorBattleData.battlerStates),return:'Return',thrust:'Thrust',swing:'Swing',missile:'Missile',skill:'Skill',item:'Item',idle:'Idle',run:'Run',walk:'Walk',punch:'Punch',attack:'Attack',cast:'Cast',guard:'Guard',damage:'Damage',evade:'Evade',victory:'Victory',escape:'Escape'};}
    label(type){return {move:'Move / Position Key',motion:'Battler Motion',sound:'Play Sound',animation:'Show Animation',projectile:'Projectile',weapon:'Weapon Icon',impact:'Apply Action Effect',effect:'Play Effect Phase',wait:'Wait',camera:'Camera Key'}[type]||ReactorBattleData.commands[type]?.label||type;}
    pushUndo(){this.undo.push(JSON.stringify(this.sequence));if(this.undo.length>100)this.undo.shift();this.redo=[];}
    edit(fn){this.clearPreviewMedia();this.stepPlayback=null;this.playing=false;this.pushUndo();fn();this.ui.changed();this.validate();}
    history(from,to){if(!from.length)return;this.clearPreviewMedia();this.stepPlayback=null;this.playing=false;to.push(JSON.stringify(this.sequence));const next=JSON.parse(from.pop());for(const key of Object.keys(this.sequence))delete this.sequence[key];Object.assign(this.sequence,next);this.selected=Math.min(this.selected,this.sequence.steps.length-1);if(this.controls?.transformPose){const step=this.sequence.steps[this.selected];this.controls.transformPose=step?.type==='motion'&&step.transform?step:null;if(this.controls.transformPose)this.controls.showTransformPose(step);}this.ui.changed();this.refresh();}
    validate(){const errors=ReactorBattleData.validateSequence(this.sequence);try{ReactorBattleData.expandCalls(this.sequence,this.db.data.actionSequences);}catch(error){errors.push(error.message);}this.validation&&(this.validation.textContent=errors.map(error=>this.ui.text(error)).join(' ')||this.ui.text((this.sequence.hitPolicy==='authored'?'Ready. Each impact applies one hit to its selected battlers. Skill repeats are not added.':'Ready to use. Apply Action Effect uses the skill’s existing targeting, damage and repeats.')));this.updateStepDescriptions();}
    refresh(){this.drawSteps();this.drawInspector();this.validate();}
    previewSequence(){
        let index=this.stepPlayback?.index??this.previewWaitIndex;
        const selected=this.sequence.steps[this.selected];
        if(index===undefined&&!this.playing&&selected&&this.controls?.transformPose===selected&&this.frame===ReactorBattleData.timeline(this.sequence)[this.selected].end)index=this.selected;
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
        this.clearPreviewMedia();this.stepPlayback=null;this.selected=index;this.frame=['move','motion'].includes(cue.step.type)?cue.end:cue.start;this.controls.mode='step';this.controls.modeSelect.value='step';this.controls.freeScale=false;this.controls.transformPose=cue.step.type==='motion'&&cue.step.transform?cue.step:null;if(this.controls.transformPose)this.controls.setTool('rotate');this.playing=false;this.updateStepSelection();this.drawInspector();this.validate();
    }
    revealStep(){const row=this.steps.children[this.selected];(row||this.steps).focus({preventScroll:true});row?.scrollIntoView({block:'nearest',inline:'nearest'});}
    newSteps(value=this.stepType.value){const B=ReactorBattleData;return value.startsWith('basic:')?B.basic(value.slice(6)):[B.step(value,value==='weapon'?{duration:0,x:0,z:0,attachment:'rightHand'}:{})];}
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
        event.preventDefault();event.stopPropagation();const row=event.target.closest('[data-step-id]');if(row)this.selectStep([...this.steps.children].indexOf(row));
        const host=this.host,exists=!!this.sequence.steps[this.selected],run=fn=>()=>{if(this.host===host&&host.isConnected)fn();};
        this.parent.showDatabaseActionMenu(event.clientX,event.clientY,[
            {label:this.ui.text('Play Step'),enabled:exists,action:run(()=>this.playStep())},
            {separator:true},
            {label:this.ui.text('Cut'),shortcut:'Ctrl+X',enabled:exists,action:run(()=>this.copyStep(true))},
            {label:this.ui.text('Copy'),shortcut:'Ctrl+C',enabled:exists,action:run(()=>this.copyStep())},
            {label:this.ui.text('Paste'),shortcut:'Ctrl+V',action:run(()=>this.pasteStep())},
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
            if(!this.stepDrag)return;event.preventDefault();event.stopPropagation();const drag=this.stepDrag,slot=this.stepDropIndex;this.endStepDrag();if(slot==null)return;
            if(drag.kind==='add'){this.insertSteps(this.newSteps(drag.value),slot);return;}
            const from=this.sequence.steps.findIndex(step=>step.id===drag.id);if(from<0)return;const to=slot-(from<slot?1:0);if(to===from)return;
            this.edit(()=>this.sequence.steps.splice(to,0,this.sequence.steps.splice(from,1)[0]));this.selected=to;this.refresh();this.selectStep(to);this.revealStep();
        };
    }
    startStepDrag(event,drag){
        this.endStepDrag();this.stepDrag=drag;event.dataTransfer.setData('application/x-rpg-reactor-action-step',JSON.stringify(drag));event.dataTransfer.effectAllowed=drag.kind==='add'?'copy':'move';
        const tick=()=>{if(!this.stepDrag)return;if(this.stepDragPoint){const r=this.steps.getBoundingClientRect(),axis=this.timelineMode?'clientX':'clientY',pos=this.stepDragPoint[axis],near=this.timelineMode?r.left:r.top,far=this.timelineMode?r.right:r.bottom,amount=pos<near+28?-8:pos>far-28?8:0;if(amount){if(this.timelineMode)this.steps.scrollLeft+=amount;else this.steps.scrollTop+=amount;this.updateStepDrop();}}this.stepDragRaf=requestAnimationFrame(tick);};this.stepDragRaf=requestAnimationFrame(tick);
    }
    clearStepDrop(){for(const row of this.steps?.children||[])row.classList.remove('drop-before','drop-after');this.steps?.classList.remove('drop-empty');this.stepDropIndex=null;}
    updateStepDrop(){
        this.clearStepDrop();const point=this.stepDragPoint;if(!point)return;const rows=[...this.steps.children],axis=this.timelineMode?'clientX':'clientY';let index=rows.findIndex(row=>{const r=row.getBoundingClientRect();return point[axis]<(this.timelineMode?(r.left+r.right)/2:(r.top+r.bottom)/2);});if(index<0)index=rows.length;this.stepDropIndex=index;
        if(!rows.length)this.steps.classList.add('drop-empty');else if(index===rows.length)rows.at(-1).classList.add('drop-after');else rows[index].classList.add('drop-before');
    }
    endStepDrag(){cancelAnimationFrame(this.stepDragRaf);this.stepDrag=null;this.stepDragPoint=null;this.clearStepDrop();}
    updateStepSelection(){for(const [i,button] of [...this.steps.children].entries()){button.classList.toggle('selected',i===this.selected);button.setAttribute('aria-pressed',String(i===this.selected));}}
    stepDescription(step,index){
        const t=value=>this.ui.text(value),number=value=>String(Math.round((Number(value)||0)*100)/100),coords=value=>['x','y','z'].map(k=>k.toUpperCase()+' '+number(value[k])).join(', ');
        const role=step.role==='user'?t('User'):step.role==='allTargets'?t('All Targets'):step.targetIndex===undefined?t('Current Target'):t('Target {n}').replace('{n}',step.targetIndex+1);
        const motionLabel=name=>t(this.motionLabels()[name]||name);
        let title=t(this.label(step.type)),details=[];
        if(step.type==='motion'){
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
            title=t(step.visible===false?'Hide':'Show')+': '+t('Weapon Icon');
            if(step.visible!==false)details.push(step.iconSource==='icon'?t('Icon')+' #'+(step.iconIndex||0):t(step.iconSource==='action'?'Skill / Item':'Equipped Weapon'));
        }else if(step.type==='projectile'){
            title=t('Projectile')+': '+t('User')+' → '+t('Current Target');details.push(step.color||'#ffcc55');
        }else if(step.type==='impact')details.push(t('All Targets'));
        else if(step.type==='wait')details.push(number(step.duration)+'f');
        if(['sound','animation'].includes(step.type)){if(step.waitForCompletion)details.push(t(step.type==='sound'?'Wait for Sound':'Wait for Animation'));if(step.duration)details.push(t('Wait')+': '+step.duration+'f');if(step.animationTransform){details.push(t('Position Offset')+': '+coords(step.animationTransform),t('Scale')+': '+number(step.animationTransform.scale??1)+'×');}}
        return {title,details};
    }
    updateStepDescriptions(){
        if(!this.steps)return;
        const timeline=ReactorBattleData.timeline(this.sequence);
        for(const [i,row] of [...this.steps.children].entries()){
            const cue=timeline[i],heading=row.querySelector('.rr-sequence-step-title'),detail=row.querySelector('.rr-sequence-step-detail');if(!cue||!heading||!detail)continue;
            const summary=this.stepDescription(cue.step,i),title=(i+1)+'. '+summary.title,description=[...summary.details,cue.start+'–'+cue.end+'f'].join(' · ');
            if(heading.textContent!==title)heading.textContent=title;if(detail.textContent!==description)detail.textContent=description;
            row.title=title+'\n'+description;row.setAttribute('aria-label',title+'. '+description);if(this.timelineMode)row.style.flexGrow=String(Math.max(8,cue.step.duration));
        }
    }
    drawSteps(){const U=this.ui,top=this.steps.scrollTop,left=this.steps.scrollLeft,focused=this.steps.contains(document.activeElement)?document.activeElement.dataset.stepId:null;this.steps.replaceChildren();this.steps.classList.toggle('rr-sequence-timeline',!!this.timelineMode);
        ReactorBattleData.timeline(this.sequence).forEach(({step,start,end},i)=>{const button=U.button('',()=>this.selectStep(i));button.dataset.rrI18nSkip='';button.append(U.element('span','rr-sequence-step-title'),U.element('span','rr-sequence-step-detail'));button.dataset.stepId=step.id;if(this.timelineMode){button.style.flexGrow=String(Math.max(8,step.duration));button.style.flexBasis='80px';}
            button.draggable=true;button.ondragstart=e=>this.startStepDrag(e,{kind:'move',id:step.id});button.ondragend=()=>this.endStepDrag();this.steps.append(button);});this.updateStepDescriptions();this.updateStepSelection();this.steps.scrollTop=top;this.steps.scrollLeft=left;if(focused)[...this.steps.children].find(b=>b.dataset.stepId===focused)?.focus({preventScroll:true});}
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
            if(step.type==='weapon'&&step.weaponGraphic!=='sheet'&&['weaponImageId','weaponFrame'].includes(field.key))continue;
            if(step.type==='projectile'&&((field.key==='iconIndex'&&step.iconSource!=='icon')||(field.key==='name'&&step.iconSource!=='picture')))continue;
            if(['weapon','projectile'].includes(step.type)&&field.key==='bone'&&!['rightHand','leftHand'].includes(step.attachment))continue;
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
            for(const key of ['x','y','z'])U.number(this.inspector,step.anchor==='approach'&&key==='x'?'Stop Short (tiles)':U.message('{axis} (tiles)',{axis:key.toUpperCase()}),step.anchor==='approach'&&key==='x'?-step[key]:step[key],v=>change(key,step.anchor==='approach'&&key==='x'?-v:v));
            if(step.type==='move')U.field(advanced,'Facing',U.select([['','Keep Facing'],['movement','Direction of Travel'],['target','Target'],['home','Home Facing']],step.face||'',v=>change('face',v||undefined)));
            if(step.type==='move'){for(const key of ['rotateX','rotateY','rotateZ'])U.number(advanced,U.message('Rotation {axis} (degrees)',{axis:key.slice(-1)}),step[key]||0,v=>change(key,v),1);U.number(advanced,'Scale',step.scale??1,v=>change('scale',Math.max(.01,Math.min(100,v))));}
            U.field(advanced,'Easing',U.select([['smooth','Smooth'],['linear','Linear']],step.easing,v=>change('easing',v)));
        }
        if(step.type==='motion'){U.field(this.inspector,'Motion',U.select(Object.entries(this.motionLabels()),step.motion||'idle',v=>change('motion',v)));const transform=this.inspectorFold('Model Transform','transform',!!step.transform);this.controls.transformFields(step,change,transform);}
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
            U.field(this.inspector,'Display',U.select([['show','Show'],['hide','Hide']],step.visible===false?'hide':'show',v=>change('visible',v==='show')));
            if(step.weaponGraphic!=='sheet')U.field(this.inspector,'Icon',U.select([['weapon','Equipped Weapon'],['action','Skill / Item'],['icon','Choose Icon']],step.iconSource||'weapon',v=>{change('iconSource',v);this.drawInspector();}));
            if(step.weaponGraphic!=='sheet'&&step.iconSource==='icon')this.inspector.append(U.button('Choose Icon…',()=>this.parent.showIconPicker(step.iconIndex||0,id=>change('iconIndex',id),require('path').join(this.parent.currentProject.path,'img','system','IconSet.png'))));
            for(const key of ['x','y','z'])U.number(this.inspector,U.message('{axis} (tiles)',{axis:key.toUpperCase()}),step[key]??0,v=>change(key,v));
            U.number(advanced,'Rotation (degrees)',step.rotation||0,v=>change('rotation',v),1);U.number(advanced,'Scale',step.scale||1,v=>change('scale',Math.max(.01,v)));
        }
        if(step.type==='projectile'&&(!step.iconSource||step.iconSource==='color')){const color=U.element('input');color.type='color';color.value=step.color||'#ffcc55';color.onchange=()=>change('color',color.value);U.field(this.inspector,'Color',color);U.number(this.inspector,'Size (pixels)',step.size||8,v=>change('size',Math.max(1,v)),1);}
        const globalTypes=['sound','bgm','bgs','se','movie','battleback','battlestatus','battlelog','flash','shake','branch','elseIf','else','end','switch','variable','item','formula','element','eval','event','camera','plane','clearTargets'];
        if(globalTypes.includes(step.type)){const field=[...this.inspector.children].find(row=>row.firstElementChild?.getAttribute('data-i18n-text-source')==='Battler');field?.remove();}
        if(['branch','elseIf','else','end','switch','variable','item','formula','element','eval','event','clearTargets','target'].includes(step.type)){const row=[...this.inspector.children].find(row=>row.firstElementChild?.getAttribute('data-i18n-text-source')==='Duration (frames)');if(row)advanced.prepend(row);}
        if(advanced.children.length)this.inspector.append(advancedDetails);
        const actions=U.element('div','rr-battle-toolbar');actions.append(U.button('Duplicate',()=>this.insertSteps([step])),U.button('Delete',()=>this.deleteStep()));this.inspector.append(actions);
    }
    previewContext(){const homes={user:{x:this.mirrored?11:3,y:5.5,z:0},target:{x:this.mirrored?3:11,y:5.5,z:0},camera:{x:7.5,y:5,z:0}};for(let i=0;i<this.targetCount;i++)homes['target'+i]={x:homes.target.x,y:5.5+(i%2?-1:1)*Math.ceil(i/2)*2,z:0};homes.user.facing=ReactorBattleData.facingToward(homes.user,homes.target);homes.target.facing=ReactorBattleData.facingToward(homes.target,homes.user);for(let i=0;i<this.targetCount;i++)homes['target'+i].facing=homes.target.facing;return this.controls.homes({homes,target:homes.target,direction:this.mirrored?-1:1});}
    async loadCast(){
        this.clearPreviewMedia();
        const generation=++this.generation,project=this.parent.currentProject;
        this.controls?.disposeGizmos();this.grid?.geometry.dispose();this.grid?.material.dispose();this.grid=null;this.preview?.dispose();this.preview=null;this.images={};this.models={};this.sequencePictures={};this.weaponSheets={};
        try {
            const assets={...await this.ui.assets(),playSe:se=>this.playPreviewSound(se)};if(this.generation!==generation)return;
            const map={id:0,width:18,height:12,tilesetId:1,data:Array(18*12*6).fill(0),events:[],reactor3d:{}},settings=ReactorBattleData.room(map);
            settings.projection=this.previewProjection||'3d';settings.cameraSource='custom';settings.camera={x:7.5,y:5,z:1,yaw:0,pitch:25,distance:19};
            const view=new ReactorBattleRoomView(map,{id:1,tilesetNames:[],flags:[]},settings,assets);await view.build();
            if(this.generation!==generation){view.dispose();return;}this.preview=view;this.controls.resize();
            this.iconSet=await assets.image('system','IconSet');if(this.generation!==generation){view.dispose();return;}
            for(const step of this.sequence.steps)if(['picture','plane'].includes(step.type)&&step.name)try{this.sequencePictures[step.name]=await assets.image('pictures',step.name);}catch(error){console.warn(error);}
            const grid=new THREE.GridHelper(30,30,0x667080,0x303743);grid.position.set(8,0,5);view.scene.add(grid);this.grid=grid;
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
        let result={name:'idle',start:0};for(const cue of ReactorBattleData.timeline(this.previewSequence())){if(cue.start>frame)break;if(cue.step.type==='motion'&&(ReactorBattleData.roleKey(cue.step)===role||role==='target0'&&ReactorBattleData.roleKey(cue.step)==='target'||role.startsWith('target')&&cue.step.role==='allTargets'))result={name:cue.step.motion||'idle',start:cue.start};}return result;
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
    previewBattler(key){
        const role=key==='user'?'user':'target',actor=this.castKinds[role]==='actors',record=actor?this.db.getActor(this.cast[role]):this.db.getEnemy(this.cast[role]),graphic=this.ui.settings()[actor?'actors':'enemies']?.[record?.id]?.graphic;
        const dual=[...(record?.traits||[]),...(actor?this.db.getClass(record?.classId)?.traits||[]:[])].some(t=>t.code===55&&t.dataId===1);
        return {equips:()=>actor?(record?.equips||[]).map((id,i)=>i===0||i===1&&dual?this.db.getWeapon(id):this.db.getArmor(id)):(graphic?.weaponIds||[]).map(id=>this.db.getWeapon(id))};
    }
    previewAction(){const [kind,id]=String(this.sampleAction||'skills:1').split(':');return this.db.data[kind]?.[Number(id)];}
    previewRoles(step,poses){return step.role==='allTargets'?Object.keys(poses).filter(k=>/^target\d+$/.test(k)):step.role==='target'?['target'+(step.targetIndex||0)]:['user'];}
    previewPropImage(step,key){
        const B=ReactorBattleData;
        if(step.weaponGraphic==='sheet'){const id=step.weaponImageId||1,index=(id-1)%12,bitmap=this.weaponSheets?.['Weapons'+Math.ceil(id/12)];return bitmap?{source:bitmap.image||bitmap.canvas,frame:{x:(Math.floor(index/6)*3+(step.weaponFrame||1)-1)*96,y:index%6*64,width:96,height:64}}:null;}
        if(step.iconSource==='picture'){const bitmap=this.sequencePictures?.[step.name];return bitmap?{source:bitmap.image||bitmap.canvas,frame:{x:0,y:0,width:bitmap.width,height:bitmap.height}}:null;}
        if(step.type==='projectile'&&(!step.iconSource||step.iconSource==='color')){
            const source=document.createElement('canvas');source.width=source.height=step.size||8;source.getContext('2d').fillStyle=step.color||'#ffcc55';source.getContext('2d').fillRect(0,0,source.width,source.height);return {source,frame:{x:0,y:0,width:source.width,height:source.height}};
        }
        if(!this.iconSet)return null;const size=window.RRIconPicker?.sizeOf(this.db.getSystem())||32,index=B.visualIcon(step,this.previewBattler(step.sourceRole==='user'?'user':key),this.previewAction());
        return {source:this.iconSet.image||this.iconSet.canvas,frame:{x:index%16*size,y:Math.floor(index/16)*size,width:size,height:size}};
    }
    paintProps(poses,view,context){
        const B=ReactorBattleData,sequence=this.previewSequence(),held=new Map(),active=[],live=new Set();
        for(const cue of B.timeline(sequence)){if(cue.start>this.frame)break;const step={...B.commandDefaults(cue.step.type),...cue.step};
            if(step.type==='weapon')for(const key of this.previewRoles(step,poses))held.set(key,step.visible===false?null:step);
            if(step.type==='projectile'&&this.frame<cue.end)active.push({...cue,step});
        }
        const draw=(id,step,key,p)=>{const img=this.previewPropImage(step,key);if(!img||!p)return;live.add(id);view.sequenceBillboard(id,img.source,img.frame,p,step);};
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
    }
    paint(){this.controls.resize();const B=ReactorBattleData,ctx=this.canvas.getContext('2d'),context=this.previewContext(),width=this.canvas.width,height=this.canvas.height,visuals=B.previewVisuals(this.previewSequence(),this.frame,context),poses=Object.fromEntries(Object.entries((this.controls.mode==='formation'?context.homes:visuals.poses)).map(([k,p])=>[k,B.visualPose(p)]));
        ctx.fillStyle='#15171c';ctx.fillRect(0,0,width,height);
        const view=this.preview;
        if(view){
            const camera=poses.camera;Object.assign(view.settings.camera,camera,{z:(camera.z||0)+1,distance:this.controls.distance});
            for(const key of ['user','target0','target1','target2','target3']){
                const role=key==='user'?'user':'target',p=poses[key],image=this.images[role],motion=this.controls.mode==='formation'?{name:'idle',start:0}:this.motionFor(key);
                if(image&&p){const {bitmap,actor,graphic}=image,held=visuals.held[key],frame=B.graphicFrame(graphic,bitmap.width,bitmap.height,held?.name||motion.name,held?held.frame*(graphic.speed||12):Math.max(0,this.frame-motion.start));
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
            for(const key of ['user',...Array.from({length:this.targetCount},(_,i)=>'target'+i)]){const p=view.project(poses[key]);ctx.fillStyle=key===this.controls.activeKey()?'#ffcc33':key==='user'?'#55aaff':'#ff6680';ctx.beginPath();ctx.arc(p.x,p.y,5*width/Math.max(1,this.canvas.clientWidth),0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font=Math.round(12*width/Math.max(1,this.canvas.clientWidth))+'px sans-serif';ctx.textAlign='center';ctx.fillText(this.ui.text(key==='user'?'User':'Target '+(Number(key.slice(6))+1)),p.x,p.y+(key==='user'?20:38)*width/Math.max(1,this.canvas.clientWidth));ctx.textAlign='left';}
        }else{ctx.fillStyle='#ddd';ctx.font='14px sans-serif';ctx.fillText('Loading preview…',20,30);}
        this.scrub.max=Math.max(B.duration(this.sequence),this.stepPlayback?.end||0);this.scrub.value=this.frame;const elapsed=this.frame-(this.stepPlayback?.start||0),duration=this.stepPlayback?this.stepPlayback.end-this.stepPlayback.start:B.duration(this.sequence);this.time.textContent=this.ui.text(this.ui.message('{frame} / {duration} frames · {seconds}s',{frame:Math.round(elapsed),duration,seconds:(elapsed/60).toFixed(2)}));
    }
}
