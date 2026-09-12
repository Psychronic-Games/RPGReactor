/* Shared database controls for opt-in battle presentation. All edits stay in the database working copy. */
class BattlePresentationEditor {
    constructor(parent) { this.parent=parent;this.db=parent.databaseManager;this.views=new Set(); }
    message(source, params) { return {source, params}; }
    text(value) { const {source,params}=typeof value==='object'?value:{source:String(value)};return window.I18n?I18n.formatText(source,params):source.replace(/\{(\w+)\}/g,(token,key)=>params?.[key]??token); }
    setText(element,value,raw=false) {
        if(raw){element.setAttribute('data-rr-i18n-skip','');element.textContent=String(value);return;}
        const {source,params}=typeof value==='object'?value:{source:String(value)};
        element.setAttribute('data-i18n-text-source',source);
        if(params)element.setAttribute('data-i18n-text-params',JSON.stringify(params));else element.removeAttribute('data-i18n-text-params');
        element.textContent=this.text(value);
    }
    cameraLabel(mode) { return {fixed:'Free Camera',isometric:'Isometric',thirdPerson:'Third Person',firstPerson:'First Person',topDown:'Top Down',cinematic:'Cinematic Cuts'}[mode]||mode; }
    changed() { this.db.mutationGeneration++;this.parent.updateStatus(this.text('Modified')); }
    settings() { return this.db.data.battlePresentation ||= ReactorBattleData.empty(); }
    element(tag,classes,text,raw=false) { const e=document.createElement(tag);e.className=classes||'';if(text!==undefined)this.setText(e,text,raw);return e; }
    select(options,value,onChange) {const s=this.element('select','database-field-value');for(const [id,name,raw] of options){const o=this.element('option','',name,raw);o.value=id;s.append(o);}s.value=String(value);s.onchange=()=>onChange(s.value);return s;}
    field(host,label,input) {const row=this.element('label','rr-battle-field');row.append(this.element('span','',label),input);host.append(row);return input;}
    number(host,label,value,change,step=.1) {const input=this.element('input','database-field-value');input.type='number';input.step=step;input.value=value;input.onchange=()=>{if(Number.isFinite(input.valueAsNumber))change(input.valueAsNumber);};return this.field(host,label,input);}
    button(label,fn,raw=false) {const b=this.element('button','rr-btn-secondary',label,raw);b.type='button';b.onclick=fn;return b;}
    section(title) {const panel=this.element('div','database-section');panel.append(this.element('div','database-section-header',title));const body=this.element('div','database-section-content');panel.append(body);return {panel,body};}
    preserveDisclosures(host) {
        const keys=()=>{const counts=new Map();return [...host.querySelectorAll('details')].map(details=>{const title=details.querySelector('summary')?.getAttribute('data-i18n-text-source')||'',index=counts.get(title)||0;counts.set(title,index+1);return [title+':'+index,details];});};
        const states=new Map(keys().map(([key,details])=>[key,details.open]));
        return ()=>{for(const [key,details] of keys())if(states.has(key))details.open=states.get(key);};
    }
    assignment(container,kind,record) {
        if(!['skills','items','weapons','actors','enemies','classes'].includes(kind))return;
        const B=ReactorBattleData,settings=this.settings();
        const {panel,body}=this.section('Action Sequences');panel.dataset.sequenceAssignment=kind;
        const value=()=>settings[kind]?.[record.id]||{mode:'inherit'};
        const set=binding=>{settings[kind]||={};settings[kind][record.id]=binding;this.changed();};
        const renderBinding=(host,get,put,unarmed=false)=>{
            const selected=get(),options=[['inherit','Follow Lower-Priority Defaults'],['existing','Use Engine / Plugin Action'],['phases','Assign Each Action Phase'],
                ...(this.db.data.actionSequences||[]).filter(s=>s&&B.purpose(s)==='action').map(s=>['sequence:'+s.id,s.name||'#'+s.id,true])];
            if(selected.mode==='sequence'&&!this.db.data.actionSequences?.[selected.sequenceId])options.push(['sequence:'+selected.sequenceId,this.message('Missing Sequence #{id}',{id:selected.sequenceId})]);
            const row=this.element('div','rr-battle-assignment-controls');host.append(row);
            let open;const pick=this.select(options,selected.mode==='sequence'?'sequence:'+selected.sequenceId:selected.mode||'inherit',id=>{
                put({...get(),mode:id.startsWith('sequence:')?'sequence':id,...(id.startsWith('sequence:')?{sequenceId:Number(id.slice(9))}:{})});draw();
            });pick.setAttribute('aria-label',this.text('Action Sequences'));row.append(pick);
            const openSequence=id=>{const sequence=this.db.data.actionSequences?.[id];if(sequence){this.parent.openDatabase('actionSequences');this.parent.showDatabaseDetail(sequence,'actionSequences');}};
            if(selected.mode==='sequence')row.append(this.button('Open Sequence',()=>openSequence(selected.sequenceId)));
            const hint=selected.mode==='sequence'?'This complete sequence controls the entire action, including movement, impact and return.':selected.mode==='existing'?'Stops inheritance here and uses the engine or enabled battle plugin for the whole action.':selected.mode==='phases'?'Runs Prepare → Movement → Execute → Return → Finish. Execute calls Effect at the impact cue. Each phase can inherit independently.':
                ['actors','enemies'].includes(kind)?(unarmed?'Falls back to the actor’s normal action assignment.':'Uses the engine or enabled battle plugin when no higher-priority assignment applies.'):
                kind==='classes'?'Falls back to the actor’s assignment.':kind==='weapons'?'Falls back to the class and actor assignments.':'Uses the weapon (normal attacks), then class, then actor or enemy assignment.';
            const explanation=this.element('details','rr-battle-assignment-help');explanation.append(this.element('summary','','Help'),this.element('p','rr-battle-help',hint));host.append(explanation);
            if(selected.mode==='phases')for(const [phase,label,help] of B.actionPhases){const p=this.element('p','rr-battle-help');p.append(this.element('strong','',label),document.createTextNode(' — '+this.text(help)));explanation.append(p);}
            if(selected.mode!=='phases')return;
            const list=this.element('div','rr-battle-phase-list');host.append(list);
            for(const [phase,label,help] of B.actionPhases){
                const binding=get().phases?.[phase]||{mode:'inherit'},line=this.element('div','rr-battle-phase-row');list.append(line);
                const caption=this.element('div','rr-battle-phase-caption');caption.title=this.text(help);caption.append(this.element('span','rr-battle-phase-number',String(B.actionPhases.findIndex(p=>p[0]===phase)+1),true),this.element('strong','',label));line.append(caption);
                const choices=[['inherit','Follow Lower-Priority Phase'],['existing','Use Built-in Phase'],...(this.db.data.actionSequences||[]).filter(s=>s&&B.purpose(s)===phase).map(s=>['sequence:'+s.id,s.name||'#'+s.id,true])];
                if(binding.mode==='sequence'&&!choices.some(o=>o[0]==='sequence:'+binding.sequenceId))choices.push(['sequence:'+binding.sequenceId,this.message('Missing or Incompatible Sequence #{id}',{id:binding.sequenceId})]);
                const controls=this.element('div','rr-battle-assignment-controls');line.append(controls);
                controls.append(this.select(choices,binding.mode==='sequence'?'sequence:'+binding.sequenceId:binding.mode,id=>{
                    const next=id.startsWith('sequence:')?{mode:'sequence',sequenceId:Number(id.slice(9))}:{mode:id};put({...get(),phases:{...get().phases,[phase]:next}});draw();
                }));
                controls.querySelector('select').setAttribute('aria-label',this.text(label));
                if(binding.mode==='sequence')controls.append(this.button('Open Sequence',()=>openSequence(binding.sequenceId)));
                else controls.append(this.button('Create Phase',()=>{
                    const records=this.db.data.actionSequences||=[null],id=records.length;
                    records.push({...B.defaultPhase(phase,{isAttack:kind==='weapons'||unarmed}),id,name:(record.name||'#'+record.id)+' — '+this.text(label)});
                    put({...get(),phases:{...get().phases,[phase]:{mode:'sequence',sequenceId:id}}});openSequence(id);
                }));
            }
        };
        const draw=()=>{const restore=this.preserveDisclosures(body);body.replaceChildren();renderBinding(body,value,set);
            if(kind==='actors'){
                const details=this.element('details','rr-battle-motion-details');details.append(this.element('summary','','Unarmed Attack Override'));const inner=this.element('div');details.append(inner);body.append(details);
                renderBinding(inner,()=>value().unarmed||{mode:'inherit'},binding=>set({...value(),unarmed:binding}),true);
            }
            if(['actors','enemies','classes','skills','items'].includes(kind)){
                const details=this.element('details','rr-battle-motion-details');details.append(this.element('summary','','Battler States and Reactions'));body.append(details);
                details.append(this.element('p','rr-battle-help','These sequences animate the battler’s state or reaction. They do not apply action damage. Idle and moving sequences repeat while that state remains active.'));
                for(const [state,label] of B.battlerStates.filter(([state])=>!['skills','items'].includes(kind)||['damage','evade','magicEvade','collapse'].includes(state))){
                    const binding=value().states?.[state]||{mode:'inherit'},options=[['inherit','Follow Battler Defaults'],['existing','Use Built-in Motion'],...(this.db.data.actionSequences||[]).filter(s=>s&&B.purpose(s)==='motion').map(s=>['sequence:'+s.id,s.name||'#'+s.id,true])];
                    const row=this.element('div','rr-battle-phase-row');details.append(row);row.append(this.element('strong','',label));const controls=this.element('div','rr-battle-assignment-controls');row.append(controls);controls.append(this.select(options,binding.mode==='sequence'?'sequence:'+binding.sequenceId:binding.mode,id=>{
                        set({...value(),states:{...value().states,[state]:id.startsWith('sequence:')?{mode:'sequence',sequenceId:Number(id.slice(9))}:{mode:id}}});draw();
                    }));
                    controls.querySelector('select').setAttribute('aria-label',this.text(label));
                    controls.append(this.button(binding.mode==='sequence'?'Open Sequence':'Create Motion',()=>{
                        let id=binding.sequenceId;
                        if(binding.mode!=='sequence'){const records=this.db.data.actionSequences||=[null];id=records.length;records.push({id,version:1,purpose:'motion',name:(record.name||'#'+record.id)+' — '+this.text(label),steps:[B.step('motion',{motion:state,duration:60})]});set({...value(),states:{...value().states,[state]:{mode:'sequence',sequenceId:id}}});}
                        const sequence=this.db.data.actionSequences[id];if(sequence){this.parent.openDatabase('actionSequences');this.parent.showDatabaseDetail(sequence,'actionSequences');}
                    }));
                }
            }
            restore();
        };draw();
        const layout=container.firstElementChild||container;
        if(layout!==container){layout.style.height='auto';layout.style.minHeight='100%';}
        panel.style.flexShrink='0';layout.append(panel);
    }
    battlerGraphic(container,kind,record) {
        if(!['actors','enemies'].includes(kind))return;
        const B=ReactorBattleData,settings=this.settings(),{panel,body}=this.section('Battler Graphic');panel.classList.add('rr-battler-graphic-card');
        const get=()=>settings[kind]?.[record.id]?.graphic||{mode:'auto'};
        const set=value=>{settings[kind]||={};settings[kind][record.id]={...settings[kind][record.id],graphic:value};this.changed();};
        const model=()=>RRDatabase3DBindings.get(this.parent.currentProject.path,kind,record.id,kind==='actors'?'battler':undefined);
        let generation=0;
        const draw=()=>{
            const restore=this.preserveDisclosures(body),token=++generation,g=get(),resolved=B.graphic(settings,kind,record.id,record,model());body.replaceChildren();
            const explicit=g.mode&&g.mode!=='auto',legacy=kind==='actors'?[container.querySelectorAll('.database-actor-images .graphic-preview-box')[2]]:[container.querySelector('#enemy-battler-preview-'+record.id),container.querySelector('.enemy-image-controls'),container.querySelector('.rr-3d-binding-row')];
            for(const node of legacy.filter(Boolean)){if(node.dataset.rrLegacyDisplay===undefined)node.dataset.rrLegacyDisplay=node.style.display;node.style.display=explicit?'none':node.dataset.rrLegacyDisplay;}
            this.field(body,'Graphic Type',this.select(B.graphicModes,g.mode||'auto',mode=>{set({...g,mode});draw();}));
            const controls=this.element('div','rr-battle-assignment-controls');body.append(controls);
            controls.append(this.element('span','rr-battle-graphic-name',resolved.type==='model'?resolved.model?.name||this.text('No Model Selected'):resolved.name||this.text('No Image Selected'),true));
            if(g.mode&&g.mode!=='auto')controls.append(this.button(resolved.type==='model'?'Choose Model…':'Choose Image…',()=>{
                const commit=change=>{if(!panel.isConnected||token!==generation)return;set({...get(),...change});draw();};
                if(resolved.type==='model'){
                    new ModelGraphicPicker({getCurrentProject:()=>this.parent.currentProject,mapEditor3D:window.reactor?.mapEditor3D}).show(resolved.model,result=>commit({model:result}));
                }else{
                    const path=require('path'),folder=path.join(this.parent.currentProject.path,'img',resolved.folder),files=RRAssetFiles.listNames(folder,['.png']);
                    this.parent.showImagePicker(this.text('Choose Battler Graphic'),files,(name,index)=>commit({name,index:index||0}),file=>RRAssetFiles.urlFor(folder,file,['.png']),resolved.name,
                        {allowNone:true,...(resolved.type==='character'?{sheetType:'character',currentIndex:g.index||0}:{})});
                }
            }));
            if(g.mode==='auto')body.append(this.element('p','rr-battle-help','Uses the existing battler image, 3D binding or enabled battle plugin. Choose an explicit type to override it without changing the map character or face.'));
            else if(resolved.type!=='model'){
                const basic=this.element('div','rr-battle-graphic-options');body.append(basic);
                const options=this.element('details','rr-battle-motion-details');options.append(this.element('summary','','Advanced'));body.append(options);
                const dimensions=this.element('div','rr-battle-graphic-options');options.append(dimensions);
                this.number(basic,'Scale',g.scale||1,value=>{set({...get(),scale:Math.max(.1,Math.min(10,value))});draw();},.1);
                this.number(dimensions,'Vertical Offset (pixels)',g.offsetY||0,value=>{set({...get(),offsetY:value});draw();},1);
                const mirror=this.element('input');mirror.type='checkbox';mirror.checked=!!g.mirror;mirror.onchange=()=>{set({...get(),mirror:mirror.checked});draw();};this.field(basic,'Mirror',mirror);
                for(const [key,label,def] of [['hideShadow','Hide Shadow',false],['showWeapon','Show Weapon Motion',true]]){const box=this.element('input');box.type='checkbox';box.checked=g[key]??def;box.onchange=()=>set({...get(),[key]:box.checked});this.field(dimensions,label,box);}
                if(kind==='enemies'){
                    this.field(dimensions,'Attack Animation',this.select([[0,'Use Weapon Animation'],...(this.db.data.animations||[]).filter(Boolean).map(a=>[a.id,a.name,true])],g.attackAnimationId||0,v=>set({...get(),attackAnimationId:Number(v)})));
                    for(let slot=0;slot<2;slot++)this.field(dimensions,this.message('Weapon {n}',{n:slot+1}),this.select([[0,'None'],...(this.db.data.weapons||[]).filter(Boolean).map(w=>[w.id,w.name,true])],g.weaponIds?.[slot]||0,v=>{const ids=[...(get().weaponIds||[0,0])];ids[slot]=Number(v);set({...get(),weaponIds:ids});}));
                }
                if(resolved.type==='character'){
                    const name=this.element('input','database-field-value');name.value=g.damagedName||'';name.onchange=()=>set({...get(),damagedName:name.value});this.field(options,'Defeated Character File',name);
                    this.number(dimensions,'Defeated Character Index (1–8)',(g.damagedIndex||0)+1,v=>set({...get(),damagedIndex:Math.max(0,Math.min(7,Math.round(v)-1))}),1);
                    this.field(dimensions,'Defeated Direction',this.select([[2,'Down'],[4,'Left'],[6,'Right'],[8,'Up']],g.damagedDirection||2,v=>set({...get(),damagedDirection:Number(v)})));
                }
                if(['sv','character'].includes(resolved.type)){
                    this.number(dimensions,'Frames per Motion',g.frames||3,value=>{set({...get(),frames:Math.max(1,Math.min(60,Math.round(value)))});draw();},1);
                    this.number(dimensions,'Frames per Step',g.speed||12,value=>set({...get(),speed:Math.max(1,Math.round(value))}),1);
                    if(resolved.type==='sv'){
                        this.number(dimensions,'Motion Columns',g.motionColumns||3,value=>{set({...get(),motionColumns:Math.max(1,Math.min(32,Math.round(value)))});draw();},1);
                        this.number(dimensions,'Motion Rows',g.motionRows||6,value=>{set({...get(),motionRows:Math.max(1,Math.min(32,Math.round(value)))});draw();},1);
                    }
                    const details=this.element('details','rr-battle-motion-details');details.append(this.element('summary','','Sprite Motion Mapping'));body.append(details);
                    for(const [motion,label] of [...B.battlerStates,['walk','Walk'],['run','Run'],['punch','Punch'],['cast','Cast'],['return','Return'],['attack','Attack'],['thrust','Thrust'],['swing','Swing'],['missile','Missile'],['skill','Skill'],['item','Item']]){
                        const m=g.motions?.[motion]||{},row=this.element('div','rr-battle-sprite-motion');details.append(row);row.append(this.element('strong','',label));
                        const update=patch=>set({...get(),motions:{...get().motions,[motion]:{...get().motions?.[motion],...patch}}});
                        if(resolved.type==='sv')this.number(row,'Motion Index',(m.index??B.spriteMotions[motion]??1)+1,v=>update({index:Math.max(0,Math.round(v)-1)}),1);
                        else this.field(row,'Direction',this.select([[2,'Down'],[4,'Left'],[6,'Right'],[8,'Up']],m.direction||4,v=>update({direction:Number(v)})));
                        this.number(row,'Frames',m.frames||g.frames||3,v=>update({frames:Math.max(1,Math.min(g.frames||3,Math.round(v)))}),1);
                        this.number(row,'Speed',m.speed||g.speed||12,v=>update({speed:Math.max(1,Math.round(v))}),1);
                        this.field(row,'Playback',this.select([['default','Default'],['loop','Loop'],['once','Hold Last Frame'],['play','Play Once']],m.loop===undefined?'default':m.loop===true?'loop':m.loop==='once'?'once':'play',v=>update({loop:v==='default'?undefined:v==='loop'?true:v==='once'?'once':false})));
                    }
                }
            }
            restore();
            const preview=this.element('canvas','rr-battler-graphic-preview');preview.width=240;preview.height=180;body.insertBefore(preview,body.children[2]||null);
            if(resolved.type==='model'&&resolved.model){Promise.resolve(RRDatabase3DBindings.modelThumbnail(this.parent.reactor3dEditor,resolved.model)).then(url=>{if(token!==generation||!preview.isConnected||!url)return;const image=new Image();image.onload=()=>{if(token===generation){const scale=Math.min(240/image.width,180/image.height);preview.getContext('2d').drawImage(image,(240-image.width*scale)/2,(180-image.height*scale)/2,image.width*scale,image.height*scale);}};image.src=url;}).catch(console.warn);}
            else if(resolved.name){const image=new Image();image.onload=()=>{if(token!==generation||!preview.isConnected)return;const f=B.graphicFrame(resolved,image.width,image.height),c=preview.getContext('2d'),scale=Math.min(220/f.width,160/f.height);c.imageSmoothingEnabled=false;c.save();c.translate(120,90-(resolved.offsetY||0));c.scale(resolved.mirror?-1:1,1);c.drawImage(image,f.x,f.y,f.width,f.height,-f.width*scale/2,-f.height*scale/2,f.width*scale,f.height*scale);c.restore();};image.src=RRAssetFiles.urlFor(require('path').join(this.parent.currentProject.path,'img',resolved.folder),resolved.name,['.png']);}
        };draw();
        const layout=container.firstElementChild||container;layout.append(panel);panel.style.marginTop='16px';panel.style.flexShrink='0';
    }
    stateGraphic(container,record){
        const settings=this.settings(),{panel,body}=this.section('Battler Motion Override');
        const get=()=>settings.states?.[record.id]?.graphicMotion||{};
        const set=patch=>{settings.states||={};settings.states[record.id]={...settings.states[record.id],graphicMotion:{...get(),...patch}};this.changed();};
        this.field(body,'Motion',this.select([['','Use Normal State Motion'],...Object.keys(ReactorBattleData.spriteMotions).map(v=>[v,v])],get().motion||'',v=>set({motion:v})));
        this.number(body,'Idle Speed Multiplier',get().speedMultiplier||1,v=>set({speedMultiplier:Math.max(.1,v)}),.1);
        const details=this.element('details','rr-battle-motion-details');details.append(this.element('summary','','Advanced'));const advanced=this.element('div','rr-battle-graphic-options');details.append(advanced);body.append(details);
        this.number(advanced,'Motion Priority',get().priority??record.priority??50,v=>set({priority:Math.round(v)}),1);
        this.number(advanced,'Custom Motion Index (0 = named motion)',get().index===undefined?0:get().index+1,v=>set({index:v>0?Math.round(v)-1:undefined}),1);
        this.number(advanced,'Motion Frames (0 = graphic default)',get().frames||0,v=>set({frames:Math.max(0,Math.round(v))}),1);
        this.field(advanced,'Direction',this.select([[0,'Use Graphic Direction'],[2,'Down'],[4,'Left'],[6,'Right'],[8,'Up']],get().direction||0,v=>set({direction:Number(v)})));
        this.field(advanced,'Playback',this.select([['loop','Loop'],['once','Hold Last Frame'],['play','Play Once']],get().loop===false?'play':get().loop==='once'?'once':'loop',v=>set({loop:v==='loop'?true:v==='once'?'once':false})));
        this.number(advanced,'Motion Speed (0 = graphic default)',get().speed||0,v=>set({speed:Math.max(0,Math.round(v))}),1);
        body.append(this.element('p','rr-battle-help','When multiple states apply, the highest-priority state with an override controls the battler.'));
        (container.firstElementChild||container).append(panel);panel.style.marginTop='16px';
    }
    roomPanel(troopEditor) {
        const {panel,body}=this.section('Battle Scene'),id=troopEditor.currentTroopId;
        const settings=this.settings();let config=settings.troops[id]||{type:'battleback'};
        const details=this.element('div','rr-battle-room-settings');
        const type=this.select([['battleback','Battleback'],['room','Battle Room']],config.type||'battleback',value=>{
            config={...config,type:value};settings.troops[id]=config;this.changed();draw();troopEditor.loadAndRenderCanvas?.();
        });body.append(type,details);
        const draw=()=>{
            details.replaceChildren();if(config.type!=='room')return;
            const maps=(this.parent.currentProject.maps||this.db.data.mapInfos||[]).filter(Boolean);
            details.append(this.select([['0','Choose Map…'],...maps.map(m=>[m.id,m.name,true])],config.mapId||0,async value=>{
                const project=this.parent.currentProject,map=await this.readMap(Number(value));if(!map||this.parent.currentProject!==project||!panel.isConnected)return;
                config=ReactorBattleData.room(map);settings.troops[id]=config;this.changed();draw();troopEditor.loadAndRenderCanvas?.();
            }));
            const setup=this.button('Set Up Room',()=>this.roomDialog(config,troopEditor));setup.disabled=!config.mapId;details.append(setup);
            if(config.mapId)this.readMap(config.mapId).then(map=>{if(!details.isConnected||config.type!=='room')return;for(const event of map.events.filter(Boolean)){
                this.field(details,this.message('Room Event: {name}',{name:event.name}),this.select([['called','Called Only'],['enter','On Room Enter'],['parallel','Parallel During Battle']],config.eventModes?.[event.id]||'called',mode=>{config.eventModes||={};config.eventModes[event.id]=mode;this.changed();}));
                details.append(this.button(this.message('Add Call to Troop Page: {name}',{name:event.name}),()=>{const page=troopEditor.currentTroop.pages[troopEditor.currentBattlePageIndex];if(!page)return;page.list.splice(Math.max(0,page.list.length-1),0,{code:357,indent:0,parameters:['RPGReactor','BattleRoomEvent','Call Battle Room Event',{eventId:String(event.id)}]});troopEditor.persistTroop();const list=document.getElementById('battle-command-list');if(list)troopEditor.renderCommandList(list,page);}));
            }}).catch(error=>details.append(this.element('p','rr-battle-help',error.message)));
            details.append(this.element('p','rr-battle-help','Troop events and the battle HUD remain part of this battle. Room positions are separate from battleback positions.'));
        };draw();return panel;
    }
    async readMap(id) {
        if(!id)return null;const fs=require('fs'),path=require('path'),dir=path.join(this.parent.currentProject.path,'data');
        const map=RRJson.parse(fs.readFileSync(path.join(dir,'Map'+String(id).padStart(3,'0')+'.json')));map.id=id;
        const file=path.join(dir,'Map'+String(id).padStart(3,'0')+'.r3d.json');map.reactor3d=fs.existsSync(file)?RRJson.parse(fs.readFileSync(file)):{};return map;
    }
    async assets() {
        const pc=window.reactor.projectController;await pc.mapEditor3D.ensureLibraries();
        if (!window.ReactorBattleRoomView) {
            const host=window.RPGReactorWebHost;
            if(host?.mode==='web')await pc.mapEditor3D.injectScriptUrl(host.assetUrl(host.projectRoot+'/js/reactor_battle_room.js'),'reactor_battle_room.js');
            else {const file=require('path').join(window.reactor.projectManager.getRuntimePath(),'reactor_battle_room.js');await pc.mapEditor3D.injectScript(require('fs').readFileSync(file,'utf8'),file);}
        }
        const project=this.parent.currentProject,editor=this.parent.reactor3dEditor,fs=require('fs'),path=require('path');
        editor.projectController={getCurrentProject:()=>project,mapEditor3D:pc.mapEditor3D};
        return {
            tileSize:this.db.getSystem()?.tileSize||48,screenHeight:this.db.getSystem()?.advanced?.screenHeight||624,
            muteMedia:true,mediaUrl:file=>{const image=/\.(png|jpe?g|webp)$/i.test(file),absolute=path.join(project.path,image?'img/pictures':'movies',file);return fs.existsSync(absolute)?RRAssetFiles.toUrl(absolute):'';},
            animation:id=>this.db.data.animations[id],effectUrl:name=>'file://'+path.join(project.path,'effects',name+'.efkefc'),
            image:(kind,name)=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve({image:img,width:img.naturalWidth,height:img.naturalHeight,isReady:()=>true,addLoadListener:fn=>fn()});img.onerror=()=>reject(Error('Missing '+kind+'/'+name));img.src=RRAssetFiles.imageUrlFor(path.join(project.path,'img',kind),name);}),
            model:async spec=>{
                const template=await editor._loadTemplate({name:spec.name,ext:spec.ext,file:spec.file,texture:spec.texture});
                const file=path.join(project.path,'3d',spec.name,'model.json');
                return {template,sidecar:fs.existsSync(file)?RRJson.parse(fs.readFileSync(file)):{}};
            },warn:console.warn
        };
    }
    async loadRoomCast(view,draft,troopEditor,assets) {
        const project=this.parent.currentProject;
        const cast=[];
        for(const side of ['actors','enemies'])for(let i=0;i<(side==='actors'?this.db.getMaxBattleMembers():troopEditor.currentTroop.members.length);i++){
            if(view.disposed||this.parent.currentProject!==project)return cast;
            const id=side==='actors'?this.db.getSystem()?.partyMembers?.[i]:troopEditor.currentTroop.members[i]?.enemyId;
            const item=side==='actors'?this.db.getActor(id):this.db.getEnemy(id);if(!item)continue;
            const graphic=ReactorBattleData.graphic(this.settings(),side,id,item,RRDatabase3DBindings.get(project.path,side,id,side==='actors'?'battler':undefined)),spec=graphic.type==='model'?graphic.model:null,key='cast:'+side+':'+i;
            if(spec){await view.addModel(key,spec,ReactorBattleData.position(draft,side,i));cast.push({key,side,index:i});}
            else if(graphic.name){try{const bitmap=await assets.image(graphic.folder,graphic.name),frame=ReactorBattleData.graphicFrame(graphic,bitmap.width,bitmap.height);cast.push({key,side,index:i,bitmap,frame,graphic});}catch(error){console.warn(error);}}
        }
        return cast;
    }
    drawRoomCast(view,settings,cast) {
        for(const item of cast){
            const p=ReactorBattleData.position(settings,item.side,item.index);
            if(item.bitmap)view.billboard(item.key,item.bitmap.image,item.frame,{...p,flipX:item.side==='actors'?p.facing>0:p.facing<0},Math.max(.2,item.frame.height/48)*(item.graphic?.scale||1));
            else view.place(item.key,p);
        }
    }
    async previewTroop(troopEditor) {
        troopEditor._roomPreviewCleanup?.();
        const canvas=troopEditor.canvas,ctx=troopEditor.ctx,project=this.parent.currentProject;
        const config=this.settings().troops[troopEditor.currentTroopId];
        let signature=JSON.stringify([config,troopEditor.currentTroop.members]);
        let view,raf=0,disposed=false,stopPlacement=()=>{};
        const cleanup=()=>{disposed=true;stopPlacement();cancelAnimationFrame(raf);view?.dispose();this.views.delete(cleanup);
            if(troopEditor._roomPreviewCleanup===cleanup){troopEditor._roomPreviewCleanup=null;troopEditor._roomPreviewActive=false;troopEditor._renderRoomPreview=null;troopEditor._roomPreviewView=null;}};
        troopEditor._roomPreviewCleanup=cleanup;troopEditor._roomPreviewActive=true;this.views.add(cleanup);
        troopEditor.enemySpriteBounds=[];
        const current=()=>!disposed&&canvas.isConnected&&this.parent.currentProject===project;
        const message=text=>{ctx.fillStyle='#171a21';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#ddd';ctx.font='18px sans-serif';ctx.fillText(this.text(text),20,32);};
        message('Loading…');
        troopEditor._renderRoomPreview=()=>{
            if(current()&&signature!==JSON.stringify([this.settings().troops[troopEditor.currentTroopId],troopEditor.currentTroop.members]))troopEditor.loadAndRenderCanvas();
        };
        try{
            if(!config?.mapId){message('Choose a Battle Room map.');return;}
            const map=await this.readMap(config.mapId),assets=await this.assets();if(!current())return;
            const settings=JSON.parse(JSON.stringify(config));
            view=new ReactorBattleRoomView(map,this.db.getTileset(map.tilesetId),settings,assets);await view.build();if(!current()){view.dispose();return;}
            const cast=await this.loadRoomCast(view,settings,troopEditor,assets);if(!current()){view.dispose();return;}
            troopEditor._roomPreviewView=view;view.resize(canvas.width,canvas.height);
            let drag=null;
            const pointer=e=>{const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*view.width/r.width,y:(e.clientY-r.top)*view.height/r.height};};
            const down=e=>{
                if(e.button!==0||!current())return;
                const at=pointer(e);let selected=null,distance=Infinity;
                for(let i=0;i<troopEditor.currentTroop.members.length;i++){
                    const p=view.project(ReactorBattleData.position(settings,'enemies',i)),bounds=view.bounds('cast:enemies:'+i),d=Math.hypot(at.x-p.x,at.y-p.y);
                    if((d<18*view.width/canvas.clientWidth||bounds&&at.x>=bounds.x&&at.x<=bounds.x+bounds.width&&at.y>=bounds.y&&at.y<=bounds.y+bounds.height)&&d<distance){selected=i;distance=d;}
                }
                if(selected===null)return;e.preventDefault();canvas.focus({preventScroll:true});
                const start=ReactorBattleData.position(settings,'enemies',selected),hit=view.pick(at.x,at.y,start.z||0);if(!hit)return;
                drag={index:selected,start,hit,changed:false};view.cameraFollowFrozen=true;canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';troopEditor.selectedMemberIndex=selected;troopEditor.highlightMemberRow(selected);
            };
            const move=e=>{
                if(!drag)return;const at=pointer(e),hit=view.pick(at.x,at.y,drag.start.z||0);if(!hit)return;
                const p={...drag.start,x:Math.round((drag.start.x+hit.x-drag.hit.x)*100)/100,y:Math.round((drag.start.y+hit.y-drag.hit.y)*100)/100};
                settings.enemies[drag.index]=p;drag.changed=true;
            };
            const up=e=>{if(!drag)return;const held=drag;drag=null;view.cameraFollowFrozen=false;view.cameraFollowResume=true;canvas.style.cursor='';
                if(e.type==='pointercancel')settings.enemies[held.index]=held.start;
                else if(held.changed){config.enemies||=[];config.enemies[held.index]={...settings.enemies[held.index]};signature=JSON.stringify([config,troopEditor.currentTroop.members]);this.changed();}
                if(e.pointerId!==undefined&&canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
            };
            for(const [type,fn] of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up],['lostpointercapture',up]])canvas.addEventListener(type,fn);
            stopPlacement=()=>{for(const [type,fn] of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up],['lostpointercapture',up]])canvas.removeEventListener(type,fn);canvas.style.cursor='';};
            const draw=()=>{if(!current()){cleanup();return;}
                // The setup dialog owns the visible renderer while open.
                if(!document.querySelector('.rr-battle-room-modal')){
                    this.drawRoomCast(view,settings,cast);
                    for(const item of cast)if(item.side==='enemies'){const record=view.models.get(item.key)||view.billboards.get(item.key);if(record?.object)record.object.visible=!troopEditor.currentTroop.members[item.index]?.hidden;}
                    view.render();ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(view.renderer.domElement,0,0,canvas.width,canvas.height);
                    for(let i=0;i<troopEditor.currentTroop.members.length;i++){
                        const p=view.project(ReactorBattleData.position(settings,'enemies',i));if(!p.visible)continue;
                        const scale=canvas.width/Math.max(1,canvas.clientWidth);ctx.fillStyle=i===troopEditor.selectedMemberIndex?'#ffcc33':'#ff6680';ctx.beginPath();ctx.arc(p.x,p.y,5*scale,0,Math.PI*2);ctx.fill();ctx.font=(12*scale)+'px sans-serif';ctx.fillText('E'+(i+1),p.x+9*scale,p.y+4*scale);
                    }
                    if(troopEditor.showBattleUI){const setup=troopEditor.battleUISetup||troopEditor.refreshBattleUISetup();if(setup)troopEditor.drawBattleUIOverlay(ctx,setup);}
                }
                raf=requestAnimationFrame(draw);
            };draw();
        }catch(error){view?.dispose();if(current())message('Room preview: '+error.message);}
    }
    cameraNavigation(view,changed) {
        // Reuse the map editor's orbit, pan, zoom and timed flight conventions.
        const navigation={camera:view.camera,flyKeys:new Set(),flyFast:false,flying(){return this.flyKeys.size>0;},zoomAnchor(){return null;}};
        navigation.begin=()=>{
            if(view.settings.cameraSource!=='custom')return false;
            const camera=view.camera,forward=camera.getWorldDirection(new THREE.Vector3());
            const distance=view.effectiveCamera?.distance||8;
            const focus=camera.position.clone().addScaledVector(forward,distance);
            navigation.view={target:{x:focus.x-.5,y:focus.y,z:focus.z-.5},distance,
                yaw:Math.atan2(forward.x,-forward.z)*180/Math.PI,pitch:Math.asin(-forward.y)*180/Math.PI};
            view.cameraFollowFrozen=false;view.cameraFollowResume=false;
            return true;
        };
        navigation.applyCamera=()=>{
            const c=navigation.view;
            Object.assign(view.settings.camera,{mode:view.settings.camera.mode==='cinematic'?'cinematic':'fixed',x:c.target.x,y:c.target.z,z:c.target.y,yaw:c.yaw,pitch:c.pitch,distance:c.distance,fov:view.camera.fov||view.effectiveCamera.fov});
            view.aim();changed();
        };
        for(const name of ['orbit','pan','zoom','stepFly'])navigation[name]=(...args)=>MapEditor3D.prototype[name].apply(navigation,args);
        return navigation;
    }
    async roomDialog(config,troopEditor) {
        const draft=JSON.parse(JSON.stringify(config)),{panel,body}=this.section('Battle Room Setup');
        const modal=this.element('div','rr-battle-room-modal');panel.classList.add('rr-battle-room-dialog');modal.append(panel);document.body.append(modal);
        const workspace=this.element('div','rr-battle-workspace'),stage=this.element('div','rr-battle-stage'),inspector=this.element('div','rr-battle-inspector');workspace.append(stage,inspector);body.append(workspace);
        const message=this.element('p','','Loading…');stage.append(message);
        let view,raf=0,stopNavigation=()=>{},refreshLanguage=()=>{},selected={side:'actors',index:0},dragging=false;
        const cleanup=()=>{cancelAnimationFrame(raf);stopNavigation();window.removeEventListener('rr-language-changed',refreshLanguage);view?.dispose();modal.remove();this.views.delete(cleanup);};this.views.add(cleanup);
        const footer=this.element('div','rr-battle-toolbar');footer.append(this.button('Cancel',cleanup),this.button('Apply',()=>{Object.assign(config,draft);this.changed();cleanup();troopEditor.loadAndRenderCanvas?.();}));body.append(footer);
        try{
            const map=await this.readMap(config.mapId),assets=await this.assets();if(!modal.isConnected)return;
            view=new ReactorBattleRoomView(map,this.db.getTileset(map.tilesetId),draft,assets);await view.build();if(!modal.isConnected){view.dispose();return;}
            stage.replaceChildren(view.renderer.domElement);const overlay=this.element('canvas','rr-battle-markers');stage.append(overlay);overlay.tabIndex=0;
            const navigationHint=this.element('div','rr-battle-navigation-hint');stage.append(navigationHint);
            const actorCount=this.db.getMaxBattleMembers();
            const count=side=>side==='actors'?actorCount:troopEditor.currentTroop.members.length;
            // Camera navigation changes framing, never the implied formation.
            const materializeFormation=()=>{for(const side of ['actors','enemies'])for(let i=0;i<count(side);i++){
                draft[side]||=[];draft[side][i]||=ReactorBattleData.position(draft,side,i);
            }};
            materializeFormation();
            const position=()=>{draft[selected.side]||=[];return draft[selected.side][selected.index]||=ReactorBattleData.position(draft,selected.side,selected.index);};
            const cast=await this.loadRoomCast(view,draft,troopEditor,assets);
            if(!modal.isConnected){view.dispose();return;}
            const drawInspector=()=>{
                this.setText(navigationHint,draft.cameraSource==='custom'?'Drag empty space to orbit · Ctrl-drag to orbit over markers · Shift or right-drag to pan · Scroll to zoom · WASD move · Q/E height':'Use Map Camera · Choose Override for This Troop to navigate the camera');
                inspector.replaceChildren();this.field(inspector,'Selection',this.select([...Array(count('actors'))].map((_,i)=>['actors:'+i,this.message('Party Slot {n}',{n:i+1})]).concat([...Array(count('enemies'))].map((_,i)=>['enemies:'+i,this.message('Enemy {n}',{n:i+1})])),selected.side+':'+selected.index,value=>{const [side,index]=value.split(':');selected={side,index:Number(index)};drawInspector();}));
                for(const key of ['x','y','z','facing'])this.number(inspector,key==='facing'?'Facing':key.toUpperCase(),position()[key],value=>position()[key]=value,key==='facing'?1:.1);
                inspector.append(this.element('h4','','Camera'));
                this.field(inspector,'Camera Settings',this.select([['map','Use Map Camera'],['custom','Override for This Troop']],draft.cameraSource||'custom',value=>{if(value==='custom')Object.assign(draft.camera,view.effectiveCamera||view.cameraState(),{mode:'fixed'});draft.cameraSource=value;drawInspector();}));
                const effective=view.cameraState();
                if(draft.cameraSource==='map')inspector.append(this.element('p','rr-battle-help',this.message('Map camera: {mode}. Third/first person follows party slot 1.',{mode:this.text(this.cameraLabel(effective.mode))})));
                else this.field(inspector,'Mode',this.select([...Object.keys(Reactor3D.Camera.MODES).map(m=>[m,this.cameraLabel(m)]),['cinematic','Cinematic Cuts']],draft.camera.mode||'fixed',mode=>{const defaults=Reactor3D.Camera.MODES[mode]||{yaw:45,pitch:35,fov:40,distance:24};Object.assign(draft.camera,{mode,yaw:defaults.yaw,pitch:defaults.pitch,fov:defaults.fov,distance:defaults.distance||24});drawInspector();}));
                if(draft.cameraSource==='custom'&&draft.camera.mode==='cinematic')inspector.append(this.element('p','rr-battle-help','Sweeps toward the acting battler, then the target at impact. Eases back to this overview after the action.'));
                for(const key of ['x','y','z','yaw','pitch','distance','fov']){
                    const input=this.number(inspector,({yaw:'Yaw',pitch:'Pitch',distance:'Distance',fov:'Field of View'})[key]||key.toUpperCase(),draft.cameraSource==='map'?effective[key]:draft.camera[key]??effective[key],value=>draft.camera[key]=key==='distance'?Math.max(.5,value):key==='fov'?Math.max(5,Math.min(150,value)):key==='pitch'?Math.max(-89,Math.min(89,value)):value);
                    input.dataset.cameraField=key;input.disabled=draft.cameraSource==='map'&&['yaw','pitch','distance','fov'].includes(key);
                }
                inspector.append(this.button('Reset Formation',()=>{draft.actors=[];draft.enemies=[];materializeFormation();drawInspector();}));
                inspector.append(this.element('p','rr-battle-help','Drag a marker to place it. Z sets height; camera controls change the view.'));
            };drawInspector();refreshLanguage=drawInspector;window.addEventListener('rr-language-changed',refreshLanguage);
            const syncCameraFields=()=>{
                const mode=[...inspector.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='fixed'));
                if(mode)mode.value=draft.camera.mode;
                for(const input of inspector.querySelectorAll('[data-camera-field]'))if(document.activeElement!==input)input.value=Math.round(draft.camera[input.dataset.cameraField]*1000)/1000;
            };
            const navigation=this.cameraNavigation(view,syncCameraFields);
            let cameraDrag=null;
            const stopFly=()=>{navigation.flyKeys.clear();navigation._flewAt=null;};
            window.addEventListener('blur',stopFly);overlay.onblur=stopFly;
            stopNavigation=()=>{stopFly();window.removeEventListener('blur',stopFly);};
            overlay.onkeydown=e=>{
                const key=MapEditor3D.FLY_KEYS()[e.key.toLowerCase()];
                if(!key||e.ctrlKey||e.altKey||e.metaKey||draft.cameraSource!=='custom'||dragging)return;
                e.preventDefault();e.stopPropagation();
                if(!navigation.flying()){if(!navigation.begin())return;navigation._flewAt=null;}
                navigation.flyKeys.add(key);navigation.flyFast=e.shiftKey;
            };
            overlay.onkeyup=e=>{const key=MapEditor3D.FLY_KEYS()[e.key.toLowerCase()];if(key){e.preventDefault();e.stopPropagation();navigation.flyKeys.delete(key);}navigation.flyFast=e.shiftKey;};
            overlay.oncontextmenu=e=>e.preventDefault();
            overlay.onwheel=e=>{e.preventDefault();e.stopPropagation();if(!dragging&&navigation.begin())navigation.zoom(e.deltaY);};
            overlay.onpointerdown=e=>{
                if(![0,1,2].includes(e.button))return;
                overlay.focus({preventScroll:true});stopFly();
                const rect=overlay.getBoundingClientRect(),x=(e.clientX-rect.left)*view.width/rect.width,y=(e.clientY-rect.top)*view.height/rect.height;
                let nearest=null,dist=20;
                if(e.button===0&&!e.ctrlKey&&!e.shiftKey)for(const side of ['actors','enemies'])for(let i=0;i<count(side);i++){
                    const p=view.project(ReactorBattleData.position(draft,side,i)),d=Math.hypot(p.x-x,p.y-y);if(d<dist){dist=d;nearest={side,index:i};}
                }
                if(nearest){selected=nearest;dragging=true;view.cameraFollowFrozen=true;drawInspector();}
                else if(navigation.begin())cameraDrag={x:e.clientX,y:e.clientY,pan:e.button!==0||e.shiftKey};
                else return;
                e.preventDefault();e.stopPropagation();overlay.setPointerCapture(e.pointerId);
            };
            overlay.onpointermove=e=>{
                if(cameraDrag){const dx=e.clientX-cameraDrag.x,dy=e.clientY-cameraDrag.y;cameraDrag.x=e.clientX;cameraDrag.y=e.clientY;navigation[cameraDrag.pan?'pan':'orbit'](dx,dy);return;}
                if(navigation.flying()){navigation.orbit(e.movementX,e.movementY);return;}
                if(!dragging)return;
                const r=overlay.getBoundingClientRect(),p=view.pick((e.clientX-r.left)*view.width/r.width,(e.clientY-r.top)*view.height/r.height);
                if(p)Object.assign(position(),{x:Math.round(p.x*10)/10,y:Math.round(p.y*10)/10});
            };
            const endDrag=()=>{cameraDrag=null;if(!dragging)return;dragging=false;view.cameraFollowFrozen=false;view.cameraFollowResume=true;drawInspector();};
            overlay.onpointerup=endDrag;overlay.onpointercancel=endDrag;overlay.onlostpointercapture=endDrag;
            const draw=(now=performance.now())=>{if(!modal.isConnected){cleanup();return;}
                const width=Math.max(1,stage.clientWidth),height=Math.max(1,stage.clientHeight);
                if(view.width!==width||view.height!==height){view.resize(width,height);overlay.width=width;overlay.height=height;}
                navigation.stepFly(now);this.drawRoomCast(view,draft,cast);view.render();const ctx=overlay.getContext('2d');ctx.clearRect(0,0,width,height);
                for(const side of ['actors','enemies'])for(let i=0;i<count(side);i++){const p=view.project(ReactorBattleData.position(draft,side,i));ctx.fillStyle=side==='actors'?'#55aaff':'#ff6677';ctx.beginPath();ctx.arc(p.x,p.y,selected.side===side&&selected.index===i?10:7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='12px sans-serif';ctx.fillText((side==='actors'?'A':'E')+(i+1),p.x+12,p.y+4);}raf=requestAnimationFrame(draw);};draw();
        }catch(error){message.textContent=String(error.message||error);stage.replaceChildren(message);}
    }
    dispose() { for(const cleanup of [...this.views])cleanup(); }
}
