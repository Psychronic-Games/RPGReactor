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
    /**
     * Action sequence assignments. Every record shows the same six phases, as
     * in Victor's Battle Motions: an assignment on a skill or item overrides
     * the weapon's, which overrides the class's, which overrides the actor's
     * or enemy's; a phase left inheriting keeps looking down that chain and
     * ends at the built-in behavior. An actor's own Execute is its unarmed
     * attack by default, so the old separate unarmed override folds into it.
     */
    assignment(container,kind,record) {
        if(!['skills','items','weapons','actors','enemies','classes'].includes(kind))return;
        const B=ReactorBattleData,settings=this.settings();
        const panel=this.element('details','database-section rr-battle-assignment-card');panel.dataset.sequenceAssignment=kind;
        const summary=this.element('summary','database-section-header');const title=this.element('span','','Action Sequences');const status=this.element('span','rr-battle-assignment-status');status.setAttribute('data-rr-i18n-skip','1');summary.append(title,status);panel.append(summary);
        const body=this.element('div','database-section-content');panel.append(body);
        const value=()=>settings[kind]?.[record.id]||{mode:'inherit'};
        const assignedCount=()=>{const v=value();if(v.mode==='sequence'||v.mode==='existing')return 1;return Object.values(v.phases||{}).filter(p=>p?.mode&&p.mode!=='inherit').length+Object.values(v.states||{}).filter(p=>p?.mode&&p.mode!=='inherit').length;};
        // A sequence is named as the Action Sequences list names it: its name, then its number.
        const sequenceLabel=id=>{const s=this.db.data.actionSequences?.[id];return s?`${s.name||''} #${id}`.trim():'#'+id;};
        const describe=()=>{const v=value(),count=assignedCount();status.textContent=v.mode==='sequence'?this.text(this.message('Sequence: {name}',{name:sequenceLabel(v.sequenceId)})):v.mode==='existing'?this.text('Engine / plugin action'):count?this.text(this.message('{n} assigned',{n:count})):this.text('Using defaults');};
        panel.open=assignedCount()>0;panel.ontoggle=()=>{this.assignmentOpen=panel.open;};if(this.assignmentOpen!==undefined)panel.open=this.assignmentOpen;
        const set=binding=>{settings[kind]||={};settings[kind][record.id]=binding;this.changed();};
        const openSequence=id=>{const sequence=this.db.data.actionSequences?.[id];if(sequence){this.parent.openDatabase('actionSequences');this.parent.showDatabaseDetail(sequence,'actionSequences');this.parent._activeDatabaseList?.reveal?.(id);}};
        const level=kind==='items'?'skills':kind==='enemies'?'actors':kind;
        const isAttack=['weapons','actors','enemies'].includes(kind);
        // Fold a legacy unarmed override into the actor's own phases.
        if(kind==='actors'&&value().unarmed){
            const {unarmed,...rest}=value();
            const main=rest.mode&&rest.mode!=='inherit';
            set(main||!unarmed.mode||unarmed.mode==='inherit'?rest:{...rest,mode:unarmed.mode,...(unarmed.sequenceId!==undefined?{sequenceId:unarmed.sequenceId}:{}),...(unarmed.phases?{phases:unarmed.phases}:{})});
        }
        const draw=()=>{
            const restore=this.preserveDisclosures(body);body.replaceChildren();describe();
            const current=value();
            // Priority line with this record's level highlighted.
            const chain=this.element('div','rr-battle-priority');
            B.priorityChain.forEach(([id,label],index)=>{
                if(index)chain.append(this.element('span','rr-battle-priority-arrow','›',true));
                const step=this.element('span','rr-battle-priority-step'+(id===level?' is-current':''),label);chain.append(step);
            });
            body.append(chain);
            body.append(this.element('p','rr-battle-help',
                kind==='skills'||kind==='items'?'The sequence chosen here plays whenever this action is used, ahead of the weapon, class and battler.':
                kind==='weapons'?'The sequence chosen here plays for normal attacks with this weapon, unless the attack skill has its own.':
                kind==='classes'?'The sequence chosen here is the default for the class’s actors when the action and weapon have none.':
                'The sequence chosen here is this battler’s default; a weapon, skill or item with its own takes over the phases it provides.'));
            // One choice: a sequence provides the phases it marks; the rest inherit down the chain.
            const row=this.element('div','rr-battle-phase-row rr-battle-whole-row');body.append(row);
            const caption=this.element('div','rr-battle-phase-caption');caption.append(this.element('strong','','Action Sequence'));row.append(caption);
            const sequences=(this.db.data.actionSequences||[]).filter(s=>s&&B.purpose(s)==='action');
            // "None" says where the action comes from instead, level by level down the chain.
            const noneLabel=kind==='skills'||kind==='items'?'None (the weapon, class or battler’s)':kind==='weapons'?'None (the class or battler’s)':kind==='classes'?'None (the battler’s own)':'None (the built-in action)';
            const options=[['inherit',noneLabel],['existing','Use Engine / Plugin Action'],...(current.mode==='phases'?[['phases','Per-phase assignments (older)']]:[]),...sequences.map(s=>['sequence:'+s.id,sequenceLabel(s.id),true])];
            if(current.mode==='sequence'&&!this.db.data.actionSequences?.[current.sequenceId])options.push(['sequence:'+current.sequenceId,this.message('Missing Sequence #{id}',{id:current.sequenceId})]);
            const controls=this.element('div','rr-battle-assignment-controls');row.append(controls);
            const pick=this.select(options,current.mode==='sequence'?'sequence:'+current.sequenceId:current.mode==='existing'?'existing':current.mode==='phases'?'phases':'inherit',id=>{
                const {sequenceId,...rest}=current;
                if(id.startsWith('sequence:'))set({...rest,mode:'sequence',sequenceId:Number(id.slice(9))});
                else if(id==='existing')set({...rest,mode:'existing'});
                else if(id==='phases')set(normalize({...rest,mode:'phases'}));
                else set({...rest,mode:'inherit'});
                draw();
            });pick.setAttribute('aria-label',this.text('Action Sequence'));controls.append(pick);
            if(current.mode==='sequence')controls.append(this.button('Open Sequence',()=>openSequence(current.sequenceId)));
            else controls.append(this.button('New Sequence',()=>{
                const records=this.db.data.actionSequences||=[null],id=records.length,steps=B.phaseIds().flatMap(phase=>B.defaultPhase(phase,{isAttack}).steps.map(step=>({...step,phase})));
                records.push({id,version:1,name:(record.name||'#'+record.id)+' — '+this.text('Action'),phases:B.phaseIds(),steps});
                set({...value(),mode:'sequence',sequenceId:id});openSequence(id);
            }));
            if(current.mode==='sequence'){
                const sequence=this.db.data.actionSequences?.[current.sequenceId],provided=sequence?B.sequencePhases(sequence):[],inherited=B.phaseIds().filter(p=>!provided.includes(p)),name=p=>this.text(B.actionPhases.find(([id])=>id===p)[1]);
                body.append(this.element('p','rr-battle-help',sequence?(inherited.length?this.message('Provides {provided}. {inherited} come from the next level down.',{provided:provided.map(name).join(', '),inherited:inherited.map(name).join(', ')}):'Provides every phase: this sequence is the whole action.'):'This sequence is missing.'));
            }else body.append(this.element('p','rr-battle-help',current.mode==='existing'?'Stops the lookup here and uses the engine or enabled battle plugin for the whole action.':current.mode==='phases'?'Each phase below is picked on its own from sequences made for that phase alone. Newer sequences mark their own phases; choose one above to switch.':
                kind==='actors'||kind==='enemies'?'No sequence of its own: the built-in action plays, unless a skill, item or weapon brings one.':kind==='classes'?'No sequence of its own: the battler’s own plays, else the built-in action.':'No sequence of its own: the next level down decides (class, then battler), else the built-in action.'));
            if(current.mode==='phases'){
            const list=this.element('div','rr-battle-phase-list');body.append(list);
            for(const [phase,label,help] of B.actionPhases){
                const binding=current.phases?.[phase]||{mode:'inherit'},line=this.element('div','rr-battle-phase-row');list.append(line);
                const cap=this.element('div','rr-battle-phase-caption');cap.append(this.element('span','rr-battle-phase-number',String(B.actionPhases.findIndex(p=>p[0]===phase)+1),true),this.element('strong','',label));line.append(cap);
                cap.title=this.text(help);line.classList.add('rr-battle-phase-compact');
                const choices=[['inherit','Inherit'],['existing','Built-in'],...(this.db.data.actionSequences||[]).filter(s=>s&&B.purpose(s)===phase).map(s=>['sequence:'+s.id,s.name||'#'+s.id,true])];
                if(binding.mode==='sequence'&&!choices.some(o=>o[0]==='sequence:'+binding.sequenceId))choices.push(['sequence:'+binding.sequenceId,this.message('Missing or Incompatible Sequence #{id}',{id:binding.sequenceId})]);
                const row=this.element('div','rr-battle-assignment-controls');line.append(row);
                row.append(this.select(choices,binding.mode==='sequence'?'sequence:'+binding.sequenceId:binding.mode,id=>{
                    const next=id.startsWith('sequence:')?{mode:'sequence',sequenceId:Number(id.slice(9))}:{mode:id};
                    set(normalize({...value(),mode:'phases',phases:{...value().phases,[phase]:next}}));draw();
                }));
                row.querySelector('select').setAttribute('aria-label',this.text(label));
                if(binding.mode==='sequence')row.append(this.button('Open Sequence',()=>openSequence(binding.sequenceId)));
            }
            }
            if(['actors','enemies','classes','skills','items'].includes(kind)){
                const details=this.element('details','rr-battle-motion-details');details.append(this.element('summary','','Reactions and Idle Motions'));body.append(details);
                details.append(this.element('p','rr-battle-help','Separate from the action phases above: how the battler stands, gets hit, evades, or falls. These never apply damage.'));
                for(const [state,label] of B.battlerStates.filter(([state])=>!['abnormal','sleep'].includes(state)&&(!['skills','items'].includes(kind)||['damage','evade','magicEvade','collapse'].includes(state)))){
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
        };
        // A phases binding with nothing assigned is the same as inheriting;
        // store it that way so a complete sequence lower in the chain still wins.
        const normalize=binding=>{
            const assigned=Object.values(binding.phases||{}).some(p=>p?.mode&&p.mode!=='inherit');
            const {sequenceId,...rest}=binding;
            return assigned?{...rest,mode:'phases'}:{...rest,mode:'inherit'};
        };
        draw();
        const layout=container.firstElementChild||container;
        if(layout!==container){layout.style.height='auto';layout.style.minHeight='100%';}
        panel.style.flexShrink='0';layout.append(panel);
    }
    /**
     * One battler control per record. The graphic type lives in the same box
     * (actors: the Images card's battler slot; enemies: the General card's
     * battler rows) as the file, preview and change button, and the sprite
     * options fold out beneath it. The default 2D type and the 3D type write
     * the record's own battler name and 3D binding; the other types are
     * stored in the battle presentation settings.
     */
    battlerGraphic(container,kind,record) {
        if(!['actors','enemies'].includes(kind))return;
        const B=ReactorBattleData,settings=this.settings(),project=this.parent.currentProject;
        if(!project?.path||typeof RRDatabase3DBindings==='undefined')return;
        const get=()=>settings[kind]?.[record.id]?.graphic||{mode:'auto'};
        const set=value=>{settings[kind]||={};settings[kind][record.id]={...settings[kind][record.id],graphic:value};this.changed();};
        const slot=kind==='actors'?'battler':undefined;
        const binding=()=>{try{return RRDatabase3DBindings.get(project.path,kind,record.id,slot);}catch(error){return null;}};
        const defaultMode=kind==='actors'?'sv':'static';
        const modes=[...B.graphicModes.filter(([m])=>m===defaultMode),...B.graphicModes.filter(([m])=>m!=='auto'&&m!==defaultMode)];

        // Hosts: the existing box or rows, plus where the options fold lives.
        let api,host,optionsHost,explicitPane,previewCanvas,nameTag,button,legacyButtonClick,restoreLegacy;
        if(kind==='actors'){
            const box=container.querySelectorAll('.database-actor-images .graphic-preview-box')[2];
            api=box?._rr3dSlot;if(!box||!api)return;
            host=box;optionsHost=box.closest('.database-section-content')||box.parentElement;
            button=api.button;legacyButtonClick=button.onclick;
            api.corner.style.display='none';
            explicitPane=this.element('div','rr-battler-explicit-pane');explicitPane.style.cssText='display:none;flex-direction:column;align-items:center;justify-content:center;height:176px;box-sizing:border-box;';
            previewCanvas=this.element('canvas','rr-battler-graphic-preview');previewCanvas.width=144;previewCanvas.height=144;previewCanvas.style.cssText='width:144px;height:144px;';
            nameTag=api.nameTag2d||this.element('div','rr-battler-graphic-name');
            explicitPane.append(previewCanvas);api.pane.parentNode.insertBefore(explicitPane,api.pane.nextSibling);
            restoreLegacy=()=>{box.dataset.rrExplicit='false';button.onclick=legacyButtonClick;explicitPane.style.display='none';api.sync();};
        }else{
            const preview=container.querySelector('#enemy-battler-preview-'+record.id);
            const general=preview?.closest('.database-section-content');
            const row=general?.querySelector('.rr-3d-binding-row');
            api=row?._rr3d;if(!preview||!api)return;
            host=general;optionsHost=general;
            api.checkLabel.style.display='none';
            button=general.querySelector('#enemy-change-battler-'+record.id);
            explicitPane=preview;
            restoreLegacy=()=>{
                host.dataset.rrExplicit='false';
                const value=general.querySelector('.enemy-image-controls .database-field-value');if(value)value.textContent=record.battlerName||this.text('(None)');
                if(button)this.setText(button,'Change...');
                api.sync();this.parent.enemyEditor?.loadBattlerPreview?.(record);
            };
        }

        let generation=0;
        const enemyRows=()=>kind==='enemies'?[...host.querySelectorAll('.enemy-image-controls')]:[];
        const optionsCard=this.element('details','rr-battle-motion-details rr-battler-graphic-card');optionsCard.append(this.element('summary','','Battler Options'));
        const optionsBody=this.element('div','rr-battler-graphic-options-body');optionsCard.append(optionsBody);optionsCard.style.display='none';
        if(kind==='actors')optionsHost.append(optionsCard);else host.insertBefore(optionsCard,(enemyRows()[1]||explicitPane).nextSibling);

        const typeSelect=this.select(modes,defaultMode,mode=>choose(mode));
        typeSelect.setAttribute('aria-label',this.text('Graphic Type'));typeSelect.classList.add('rr-battler-type');
        if(kind==='actors'){typeSelect.style.cssText='width:100%;margin:4px 0 0;';const bottomRow=button.parentNode;bottomRow.parentNode.insertBefore(typeSelect,bottomRow.nextSibling);}
        else{const line=this.element('label','rr-battle-field rr-battler-type-row');line.append(this.element('span','','Graphic Type'),typeSelect);const row=api.checkLabel.closest('.rr-3d-binding-row');row.parentNode.insertBefore(line,row);}

        const choose=mode=>{
            const g=get();
            if(mode==='model'){
                set({...g,mode:'auto'});
                if(binding()){draw();return;}
                api.openPicker();return;
            }
            if(mode===defaultMode){
                if(binding()&&!api.clear())return;
                set({...g,mode:'auto'});draw();return;
            }
            set({...g,mode});draw();
        };
        const pickImage=(resolved,commit)=>{
            const path=require('path'),folder=path.join(project.path,'img',resolved.folder),files=RRAssetFiles.listNames(folder,['.png']);
            this.parent.showImagePicker(this.text('Choose Battler Graphic'),files,(name,index)=>commit({name,index:index||0}),file=>RRAssetFiles.urlFor(folder,file,['.png']),resolved.name,
                {allowNone:true,...(resolved.type==='character'?{sheetType:'character',currentIndex:get().index||0}:{})});
        };
        const explicitChange=()=>{
            const token=generation,g=get(),resolved=B.graphic(settings,kind,record.id,record,binding());
            const commit=change=>{if(!host.isConnected||token!==generation)return;set({...get(),...change});draw();};
            if(resolved.type==='model')new ModelGraphicPicker({getCurrentProject:()=>project,mapEditor3D:window.reactor?.mapEditor3D}).show(resolved.model,result=>commit({model:result}));
            else pickImage(resolved,commit);
        };
        if(kind==='enemies'&&button)button.addEventListener('click',event=>{if(host.dataset.rrExplicit!=='true')return;event.stopImmediatePropagation();event.preventDefault();explicitChange();},true);

        const drawPreview=(resolved,token)=>{
            if(kind==='enemies'){
                explicitPane._battlerPreviewRequest={};explicitPane.dataset.model='';explicitPane.style.filter='';
                previewCanvas=this.element('canvas','rr-battler-graphic-preview');previewCanvas.width=240;previewCanvas.height=180;explicitPane.replaceChildren(previewCanvas);
            }else{
                previewCanvas.getContext('2d').clearRect(0,0,previewCanvas.width,previewCanvas.height);
                nameTag.textContent=resolved.type==='model'?resolved.model?.name||this.text('No Model Selected'):resolved.name||this.text('No Image Selected');nameTag.title=nameTag.textContent;
            }
            const W=previewCanvas.width,H=previewCanvas.height;
            if(resolved.type==='model'&&resolved.model){
                Promise.resolve(RRDatabase3DBindings.modelThumbnail(this.parent.reactor3dEditor,resolved.model)).then(url=>{if(token!==generation||!previewCanvas.isConnected||!url)return;const image=new Image();image.onload=()=>{if(token!==generation)return;const scale=Math.min(W/image.width,H/image.height);previewCanvas.getContext('2d').drawImage(image,(W-image.width*scale)/2,(H-image.height*scale)/2,image.width*scale,image.height*scale);};image.src=url;}).catch(console.warn);
            }else if(resolved.name){
                const image=new Image();image.onload=()=>{if(token!==generation||!previewCanvas.isConnected)return;const f=B.graphicFrame(resolved,image.width,image.height,'idle',0,kind==='actors'?-90:90),c=previewCanvas.getContext('2d'),scale=Math.min((W-20)/f.width,(H-20)/f.height);c.imageSmoothingEnabled=false;c.save();c.translate(W/2,H/2-(resolved.offsetY||0));c.scale(resolved.mirror?-1:1,1);c.drawImage(image,f.x,f.y,f.width,f.height,-f.width*scale/2,-f.height*scale/2,f.width*scale,f.height*scale);c.restore();};
                image.src=RRAssetFiles.urlFor(require('path').join(project.path,'img',resolved.folder),resolved.name,['.png']);
            }
        };

        const drawOptions=(g,resolved)=>{
            const restore=this.preserveDisclosures(optionsCard);optionsBody.replaceChildren();
            const basic=this.element('div','rr-battle-graphic-options');optionsBody.append(basic);
            const options=this.element('details','rr-battle-motion-details');options.append(this.element('summary','','Advanced'));optionsBody.append(options);
            const dimensions=this.element('div','rr-battle-graphic-options');options.append(dimensions);
            this.number(basic,'Scale',g.scale||1,value=>{set({...get(),scale:Math.max(.1,Math.min(10,value))});draw();},.1);
            this.number(dimensions,'Vertical Offset (pixels)',g.offsetY||0,value=>{set({...get(),offsetY:value});draw();},1);
            const mirror=this.element('input');mirror.type='checkbox';mirror.checked=!!g.mirror;mirror.onchange=()=>{set({...get(),mirror:mirror.checked});draw();};this.field(basic,'Mirror',mirror);
            // Sheet battlers only: whether the stock weapon swing draws with attack motions. Weapons in hand are the sequences' business.
            for(const [key,label,def] of [['showWeapon','Show Weapon Motion',true]]){const box=this.element('input');box.type='checkbox';box.checked=g[key]??def;box.onchange=()=>set({...get(),[key]:box.checked});this.field(dimensions,label,box);}
            if(kind==='enemies'){
                this.field(dimensions,'Attack Animation',this.select([[0,'Use Weapon Animation'],...(this.db.data.animations||[]).filter(Boolean).map(a=>[a.id,a.name,true])],g.attackAnimationId||0,v=>set({...get(),attackAnimationId:Number(v)})));
                for(let slot=0;slot<2;slot++)this.field(dimensions,this.message('Weapon {n}',{n:slot+1}),this.select([[0,'None'],...(this.db.data.weapons||[]).filter(Boolean).map(w=>[w.id,w.name,true])],g.weaponIds?.[slot]||0,v=>{const ids=[...(get().weaponIds||[0,0])];ids[slot]=Number(v);set({...get(),weaponIds:ids});}));
            }
            if(resolved.type==='character'){
                this.field(basic,'Facing',this.select([['auto','Face the Target'],[2,'Down'],[4,'Left'],[6,'Right'],[8,'Up']],g.direction||'auto',v=>{set({...get(),direction:v==='auto'?undefined:Number(v)});draw();}));
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
                const details=this.element('details','rr-battle-motion-details');details.append(this.element('summary','','Sprite Motion Mapping'));optionsBody.append(details);
                for(const [motion,label] of [...B.battlerStates,['walk','Walk'],['run','Run'],['punch','Punch'],['cast','Cast'],['return','Return'],['attack','Attack'],['thrust','Thrust'],['swing','Swing'],['missile','Missile'],['skill','Skill'],['item','Item']]){
                    const m=g.motions?.[motion]||{},row=this.element('div','rr-battle-sprite-motion');details.append(row);row.append(this.element('strong','',label));
                    const update=patch=>set({...get(),motions:{...get().motions,[motion]:{...get().motions?.[motion],...patch}}});
                    if(resolved.type==='sv')this.number(row,'Motion Index',(m.index??B.spriteMotions[motion]??1)+1,v=>update({index:Math.max(0,Math.round(v)-1)}),1);
                    else this.field(row,'Direction',this.select([[0,'Auto'],[2,'Down'],[4,'Left'],[6,'Right'],[8,'Up']],m.direction||0,v=>update({direction:Number(v)||undefined})));
                    this.number(row,'Frames',m.frames||g.frames||3,v=>update({frames:Math.max(1,Math.min(g.frames||3,Math.round(v)))}),1);
                    this.number(row,'Speed',m.speed||g.speed||12,v=>update({speed:Math.max(1,Math.round(v))}),1);
                    this.field(row,'Playback',this.select([['default','Default'],['loop','Loop'],['once','Hold Last Frame'],['play','Play Once']],m.loop===undefined?'default':m.loop===true?'loop':m.loop==='once'?'once':'play',v=>update({loop:v==='default'?undefined:v==='loop'?true:v==='once'?'once':false})));
                }
            }
            restore();
        };

        const draw=()=>{
            if(!host.isConnected)return;
            const token=++generation,g=get(),spec=binding(),explicit=!!g.mode&&g.mode!=='auto';
            const resolved=B.graphic(settings,kind,record.id,record,spec);
            typeSelect.value=explicit?g.mode:spec?'model':defaultMode;
            const wasExplicit=host.dataset.rrExplicit==='true';
            if(!explicit){
                optionsCard.style.display='none';
                if(wasExplicit)restoreLegacy();
                if(kind==='enemies'){for(const controls of enemyRows())controls.style.display=spec?'none':'';}
                return;
            }
            host.dataset.rrExplicit='true';
            if(kind==='actors'){
                api.canvasBox.style.display='none';api.pane.style.display='none';explicitPane.style.display='flex';
                if(api.nameTag2d)api.nameTag2d.style.display='';
                this.setText(api.label,'Battler');
                this.setText(button,resolved.type==='model'?'Change Model':'Change Image');
                button.onclick=explicitChange;
            }else{
                api.name.style.display='none';api.change.style.display='none';
                const [imageRow,hueRow]=enemyRows();
                if(imageRow){imageRow.style.display='';for(const input of imageRow.querySelectorAll('input,button'))input.disabled=false;const value=imageRow.querySelector('.database-field-value');if(value)value.textContent=resolved.type==='model'?resolved.model?.name||this.text('(None)'):resolved.name||this.text('(None)');}
                if(hueRow)hueRow.style.display='none';
                if(button)this.setText(button,resolved.type==='model'?'Change Model':'Change...');
            }
            drawPreview(resolved,token);
            optionsCard.style.display=resolved.type==='model'?'none':'';
            if(resolved.type!=='model')drawOptions(g,resolved);
        };
        api.afterSync=()=>draw();
        draw();
    }
    stateGraphic(container,record){
        const settings=this.settings(),{panel,body}=this.section('Battler Motion Override');
        const get=()=>settings.states?.[record.id]?.graphicMotion||{};
        const set=patch=>{settings.states||={};settings.states[record.id]={...settings.states[record.id],graphicMotion:{...get(),...patch}};this.changed();};
        // A state's own reaction sequence: what the battler does while afflicted (poison, sleep, a custom state).
        const B=ReactorBattleData,reaction=()=>settings.states?.[record.id]?.reaction||{mode:'inherit'};
        const setReaction=binding=>{settings.states||={};settings.states[record.id]={...settings.states[record.id],reaction:binding};this.changed();};
        const drawReaction=()=>{
            reactionRow.replaceChildren();const binding=reaction();
            const options=[['inherit','Use the Battler’s Motion'],...(this.db.data.actionSequences||[]).filter(s=>s&&B.purpose(s)==='motion').map(s=>['sequence:'+s.id,s.name||'#'+s.id,true])];
            if(binding.mode==='sequence'&&!this.db.data.actionSequences?.[binding.sequenceId])options.push(['sequence:'+binding.sequenceId,this.message('Missing Sequence #{id}',{id:binding.sequenceId})]);
            reactionRow.append(this.select(options,binding.mode==='sequence'?'sequence:'+binding.sequenceId:'inherit',id=>{setReaction(id.startsWith('sequence:')?{mode:'sequence',sequenceId:Number(id.slice(9))}:{mode:'inherit'});drawReaction();}));
            reactionRow.append(this.button(binding.mode==='sequence'?'Open Sequence':'Create Motion',()=>{
                let id=binding.sequenceId;
                if(binding.mode!=='sequence'){const records=this.db.data.actionSequences||=[null];id=records.length;records.push({id,version:1,purpose:'motion',name:(record.name||'#'+record.id)+' — '+this.text('Reaction'),steps:[B.step('motion',{motion:record.motion===2?'sleep':'abnormal',duration:60})]});setReaction({mode:'sequence',sequenceId:id});}
                const sequence=this.db.data.actionSequences[id];if(sequence){this.parent.openDatabase('actionSequences');this.parent.showDatabaseDetail(sequence,'actionSequences');}
            }));
        };
        const reactionRow=this.element('div','rr-battle-assignment-controls');
        this.field(body,'Reaction Sequence',reactionRow);drawReaction();
        body.append(this.element('p','rr-battle-help','Plays instead of the idle motion while this state is on the battler; the highest-priority state with a sequence wins. Poison, sleep and custom states each set their own here.'));
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
            // Actors come from the battle test party (the System's testBattlers), as a battle test would field them, not the starting party.
            const id=side==='actors'?(troopEditor.battleTestParty?troopEditor.battleTestParty(this.db.getSystem(),this.db.getMaxBattleMembers())[i]?.actor?.id:this.db.getSystem()?.partyMembers?.[i]):troopEditor.currentTroop.members[i]?.enemyId;
            const item=side==='actors'?this.db.getActor(id):this.db.getEnemy(id);if(!item)continue;
            const graphic=ReactorBattleData.graphic(this.settings(),side,id,item,RRDatabase3DBindings.get(project.path,side,id,side==='actors'?'battler':undefined)),spec=graphic.type==='model'?graphic.model:null,key='cast:'+side+':'+i;
            if(spec){await view.addModel(key,spec,ReactorBattleData.position(draft,side,i));cast.push({key,side,index:i});}
            else if(graphic.name){try{const bitmap=await assets.image(graphic.folder,graphic.name),frame=ReactorBattleData.graphicFrame(graphic,bitmap.width,bitmap.height,'idle',0,side==='actors'?-90:90);cast.push({key,side,index:i,bitmap,frame,graphic});}catch(error){console.warn(error);}}
        }
        return cast;
    }
    /**
     * How many 60ths of a second to advance a room preview.
     *
     * A battle room advances exactly one frame per `view.render()`, and in game
     * that is called from the engine's fixed 60 fps update. A preview driven
     * straight off requestAnimationFrame therefore runs at the monitor's rate:
     * idle clips, autotile animation, effects and dissolves all played 2.4x too
     * fast on a 144 Hz screen, and at half speed on 30 Hz. The sequence preview
     * already works in real elapsed frames (`dt/1000*60`); this is the same
     * conversion for a renderer that counts whole frames instead of taking a
     * delta. The cap keeps a backgrounded tab or a stalled load from being
     * repaid all at once.
     */
    roomFrameSteps(clock,now) {
        const step=1000/60;
        if(clock.last===undefined){clock.last=now;return 1;}
        clock.owed=Math.min((clock.owed||0)+(now-clock.last),step*4);
        clock.last=now;
        const steps=Math.floor(clock.owed/step);
        clock.owed-=steps*step;
        return steps;
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
        const party=()=>[this.db.getSystem()?.testBattlers,this.db.getSystem()?.partyMembers];let signature=JSON.stringify([config,troopEditor.currentTroop.members,party()]);
        let view,raf=0,disposed=false,stopPlacement=()=>{};
        const cleanup=()=>{disposed=true;stopPlacement();cancelAnimationFrame(raf);view?.dispose();this.views.delete(cleanup);
            if(troopEditor._roomPreviewCleanup===cleanup){troopEditor._roomPreviewCleanup=null;troopEditor._roomPreviewActive=false;troopEditor._renderRoomPreview=null;troopEditor._roomPreviewView=null;}};
        troopEditor._roomPreviewCleanup=cleanup;troopEditor._roomPreviewActive=true;this.views.add(cleanup);
        troopEditor.enemySpriteBounds=[];
        const current=()=>!disposed&&canvas.isConnected&&this.parent.currentProject===project;
        const message=text=>{ctx.fillStyle='#171a21';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#ddd';ctx.font='18px sans-serif';ctx.fillText(this.text(text),20,32);};
        message('Loading…');
        troopEditor._renderRoomPreview=()=>{
            if(current()&&signature!==JSON.stringify([this.settings().troops[troopEditor.currentTroopId],troopEditor.currentTroop.members,party()]))troopEditor.loadAndRenderCanvas();
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
            const clock={};
            const draw=(now=performance.now())=>{if(!current()){cleanup();return;}
                const steps=this.roomFrameSteps(clock,now);
                // The setup dialog owns the visible renderer while open.
                if(steps&&!document.querySelector('.rr-battle-room-modal')){
                    this.drawRoomCast(view,settings,cast);
                    for(const item of cast)if(item.side==='enemies'){const record=view.models.get(item.key)||view.billboards.get(item.key);if(record?.object)record.object.visible=!troopEditor.currentTroop.members[item.index]?.hidden;}
                    for(let step=0;step<steps;step++)view.render();
                    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(view.renderer.domElement,0,0,canvas.width,canvas.height);
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
            const clock={};
            const draw=(now=performance.now())=>{if(!modal.isConnected){cleanup();return;}
                const steps=this.roomFrameSteps(clock,now);
                if(!steps){raf=requestAnimationFrame(draw);return;}
                const width=Math.max(1,stage.clientWidth),height=Math.max(1,stage.clientHeight);
                if(view.width!==width||view.height!==height){view.resize(width,height);overlay.width=width;overlay.height=height;}
                navigation.stepFly(now);this.drawRoomCast(view,draft,cast);
                for(let step=0;step<steps;step++)view.render();
                const ctx=overlay.getContext('2d');ctx.clearRect(0,0,width,height);
                for(const side of ['actors','enemies'])for(let i=0;i<count(side);i++){const p=view.project(ReactorBattleData.position(draft,side,i));ctx.fillStyle=side==='actors'?'#55aaff':'#ff6677';ctx.beginPath();ctx.arc(p.x,p.y,selected.side===side&&selected.index===i?10:7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='12px sans-serif';ctx.fillText((side==='actors'?'A':'E')+(i+1),p.x+12,p.y+4);}raf=requestAnimationFrame(draw);};draw();
        }catch(error){message.textContent=String(error.message||error);stage.replaceChildren(message);}
    }
    dispose() { for(const cleanup of [...this.views])cleanup(); }
}
