/* Shared, side-effect-free battle presentation data and timeline evaluation. */
(function(root) {
    'use strict';
    const B = {};
    const copy = value => JSON.parse(JSON.stringify(value));
    const number = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
    B.VERSION = 1;
    B.configuredBattleMembers = system => {
        const n = system?.maxBattleMembers;
        return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
    };
    B.maxBattleMembers = (system, plugins = []) => {
        const configured = B.configuredBattleMembers(system);
        if (configured !== null) return configured;
        let limit = 4;
        // Match the last enabled known party-size override, without executing plugins.
        const keys = { PSYCHRONIC_PartySystemMZ: 'maxBattleMembers', MOG_BattleHud: 'Max Battle Members', YEP_PartySystem: 'Max Battle Members' };
        for (const plugin of plugins) if (plugin?.status === true && keys[plugin.name]) {
            const n = Number(plugin.parameters?.[keys[plugin.name]]);
            if (Number.isInteger(n) && n >= 1 && n <= 99) limit = n;
        }
        return limit;
    };
    B.empty = () => ({ version: 1, troops: {}, skills: {}, items: {}, weapons: {}, actors: {}, enemies: {}, classes: {} });
    B.types = ['move', 'motion', 'sound', 'animation', 'projectile', 'weapon', 'impact', 'wait', 'camera', 'effect'];
    B.actionPhases = [
        ['prepare', 'Prepare', 'Before moving: ready the battler or begin casting.'],
        ['movement', 'Movement', 'Approach the target or step forward.'],
        ['execute', 'Execute / Attack', 'Perform the attack and call the Effect phase at contact.'],
        ['effect', 'Effect / Impact', 'Show the target effect and apply the action exactly once.'],
        ['return', 'Return', 'Move the battler back home.'],
        ['finish', 'Finish / Cleanup', 'Finish the action before automatic pose and camera cleanup.']
    ];
    B.battlerStates = [
        ['idle','Idle'], ['moving','Moving'], ['input','Choosing Command'], ['ready','Ready'],
        ['chant','Chant / Cast'], ['guard','Guard'], ['damage','Damage'], ['evade','Evade'],
        ['abnormal','Abnormal Status'], ['sleep','Sleep'], ['dying','Low HP'], ['dead','Defeated'],
        ['entry','Battle Entry'], ['victory','Victory'], ['escape','Escape'], ['escapeFail','Escape Failed'], ['magicEvade','Magic Evade'], ['collapse','Collapse']
    ];
    B.purposes = [['action','Complete Action'], ...B.actionPhases.map(([id,label])=>[id,label]), ['motion','Battler State / Reaction'], ['routine','Reusable Routine']];
    B.purpose = sequence => sequence?.purpose || 'action';
    B.graphicModes = [['auto','Use Existing Graphic'],['sv','SV Battler Sheet'],['character','Character Set'],['static','Static Battler Image'],['model','3D Model']];
    B.spriteMotions = {idle:1,walk:0,moving:0,run:0,wait:1,ready:1,input:0,chant:2,guard:3,damage:4,evade:5,
        attack:6,punch:6,thrust:6,swing:7,missile:8,cast:9,spell:9,skill:10,item:11,escape:12,victory:16,abnormal:14,sleep:15,dying:13,dead:17,entry:0,return:12,magicEvade:5,collapse:17,escapeFail:12};
    B.graphic = (settings,kind,id,record,legacyModel) => {
        const config=settings?.[kind]?.[id]?.graphic||{mode:'auto'};
        if(config.mode==='model')return {...config,type:'model',model:config.model||legacyModel};
        if(!config.mode||config.mode==='auto')return legacyModel?{type:'model',model:legacyModel}:{type:kind==='actors'?'sv':'static',name:record?.battlerName||'',folder:kind==='actors'?'sv_actors':'enemies',scale:1};
        return {...config,type:config.mode,name:config.name||'',folder:config.mode==='sv'?'sv_actors':config.mode==='character'?'characters':config.folder||'enemies'};
    };
    B.graphicFrame = (graphic,width,height,motion='idle',frame=0) => {
        if(graphic.type==='static')return {x:0,y:0,width,height};
        const setup=graphic.motions?.[motion]||{},speed=Math.max(1,setup.speed||graphic.speed||12);
        const frames=Math.min(graphic.frames||3,Math.max(1,setup.frames||graphic.frames||3)),tick=Math.floor(Math.max(0,frame)/speed);
        const loop=setup.loop??(!['damage','attack','punch','thrust','swing','missile','cast','spell','skill','item','entry'].includes(motion));
        const pattern=loop==='once'?Math.min(frames-1,tick):loop===false?Math.min(frames-1,tick):tick%frames;
        if(graphic.type==='character'){
            const big=/^[!]*\$/.test(graphic.name||''),columns=big?1:4,rows=big?1:2,index=big?0:Math.max(0,Math.min(7,graphic.index||0));
            const w=width/(columns*(graphic.frames||3)),h=height/(rows*4),direction=setup.direction||graphic.direction||4;
            return {x:((index%4)*(graphic.frames||3)+pattern)*w,y:(Math.floor(index/4)*4+(direction/2-1))*h,width:w,height:h};
        }
        const columns=graphic.motionColumns||3,rows=graphic.motionRows||6,total=columns*rows;
        const index=Math.max(0,Math.min(total-1,setup.index??(/^\d+$/.test(String(motion))?Math.max(0,Number(motion)-1):B.spriteMotions[motion]??1)));
        const w=width/(columns*(graphic.frames||3)),h=height/rows;
        return {x:(Math.floor(index/rows)*(graphic.frames||3)+pattern)*w,y:(index%rows)*h,width:w,height:h};
    };
    B.resolveState = (settings,sequences,kind,id,state,classId=0,actionBinding=null) => {
        for(const entry of [actionBinding,kind==='actors'?settings?.classes?.[classId]:null,settings?.[kind]?.[id]]){
            const binding=entry?.states?.[state];if(!binding||binding.mode==='inherit')continue;
            if(binding.mode==='existing')return null;
            const sequence=sequences?.[binding.sequenceId];return sequence&&B.purpose(sequence)==='motion'&&!B.validateSequence(sequence).length?sequence:null;
        }
        return null;
    };
    // Field definitions drive both the inspector and validation. Values are data,
    // never interpreted as plugin notetags.
    const field=(key,label,type,value,options)=>({key,label,type,value,options});
    const n=(k,l,v=0)=>field(k,l,'number',v), text=(k,l,v='')=>field(k,l,'text',v),
        pick=(k,l,options,value=options[0])=>field(k,l,'select',value,options),
        script=(k,l,v='0')=>field(k,l,'script',v);
    const op=options=>pick('operation','Operation',options);
    const rgba=[n('red','Red'),n('green','Green'),n('blue','Blue'),n('alpha','Alpha',160)];
    const audio=[op(['play','fadeIn','fadeOut','stop','save','resume']),text('name','Audio File'),n('volume','Volume',90),n('pitch','Pitch',100),n('pan','Pan'),n('fade','Fade (frames)',60)];
    const visual=[op(['show','move','clear']),n('index','Layer ID',1),text('name','Picture File'),n('x','X (pixels)'),n('y','Y (pixels)'),n('opacity','Opacity',255),n('angle','Angle (degrees)'),n('spin','Spin (degrees/frame)'),n('scale','Scale',1),pick('layer','Layer',['above','below']),pick('space','Position',['battler','screen'])];
    B.commands={
        action:{label:'Call Sequence',fields:[n('sequenceId','Sequence ID',1)]},
        target:{label:'Select Targets',fields:[op(['select','clear'])]},
        clearTargets:{label:'Clear Pending Targets',fields:[]},
        branch:{label:'If',fields:[script('condition','Condition','true')]},
        elseIf:{label:'Else If',fields:[script('condition','Condition','true')]},
        else:{label:'Else',fields:[]},end:{label:'End If',fields:[]},
        eval:{label:'Run Script',fields:[script('code','JavaScript','')]},
        event:{label:'Common Event',fields:[n('eventId','Common Event ID',1)]},
        formula:{label:'Damage Formula',fields:[op(['set','clear']),script('formula','Formula','a.atk * 4 - b.def * 2')]},
        element:{label:'Damage Elements',fields:[op(['set','clear']),text('elements','Element IDs (comma separated)','1')]},
        hp:{label:'Change HP',fields:[script('amount','Change','-100'),pick('percent','Unit',['points','percent']),pick('show','Feedback',['show','silent'])]},
        mp:{label:'Change MP',fields:[script('amount','Change','-10'),pick('percent','Unit',['points','percent']),pick('show','Feedback',['show','silent'])]},
        tp:{label:'Change TP',fields:[script('amount','Change','10'),pick('percent','Unit',['points','percent']),pick('show','Feedback',['show','silent'])]},
        buff:{label:'Change Buff',fields:[op(['increase','decrease','remove']),pick('param','Parameter',['mhp','mmp','atk','def','mat','mdf','agi','luk'],'atk'),n('turns','Turns',3),pick('show','Feedback',['show','silent'])]},
        state:{label:'Change State',fields:[op(['add','remove']),n('stateId','State ID',1),pick('show','Feedback',['show','silent'])]},
        kill:{label:'Defeat Battler',fields:[]},
        item:{label:'Change Inventory',fields:[pick('kind','Inventory',['items','weapons','armors','gold']),n('itemId','Database ID',1),script('amount','Amount','1')]},
        switch:{label:'Control Switch',fields:[n('switchId','Switch ID',1),op(['on','off','toggle'])]},
        variable:{label:'Control Variable',fields:[n('variableId','Variable ID',1),op(['set','add','subtract','multiply','divide','modulo']),script('amount','Value','0')]},
        direction:{label:'Face Direction',fields:[pick('direction','Facing',['left','right','behind','targets','opponents','home','position']),n('position','X (pixels)')]},
        home:{label:'Set Home Position',fields:[op(['here','position','restore']),n('x','X (tiles)'),n('y','Y (tiles)')]},
        jump:{label:'Jump',fields:[n('height','Height (tiles)',2)]},
        leap:{label:'Leap',fields:[n('height','Height (tiles)',2)]},
        float:{label:'Float',fields:[n('height','Height (tiles)',1)]},
        fall:{label:'Fall',fields:[n('height','Landing Height (tiles)',0)]},
        opacity:{label:'Battler Opacity',fields:[n('opacity','Opacity',255)]},
        pose:{label:'Hold Sprite Pose',fields:[op(['hold','clear']),text('motion','Motion','idle'),n('frame','Frame (1 based)',1)]},
        flash:{label:'Screen Flash',fields:rgba},
        tint:{label:'Color Tone',fields:[pick('space','Affects',['battler','screen','upper','lower']),...rgba.slice(0,3),n('gray','Gray')]},
        shake:{label:'Screen Shake',fields:[n('power','Power',5),n('speed','Speed',5)]},
        whiten:{label:'Whiten Battler',fields:[]},
        balloon:{label:'Balloon',fields:[n('balloonId','Balloon ID',1)]},
        picture:{label:'Picture',fields:visual},
        icon:{label:'Icon',fields:[...visual.filter(f=>f.key!=='name'),pick('source','Icon Source',['icon','equip','shield','action']),n('iconIndex','Icon Index'),n('equipIndex','Equipment Slot (1 based)',1)]},
        plane:{label:'Scrolling Plane',fields:[...visual.filter(f=>f.key!=='space'),n('width','Width (pixels)',816),n('height','Height (pixels)',624),n('scrollX','Scroll X (pixels/frame)'),n('scrollY','Scroll Y (pixels/frame)')]},
        movie:{label:'Play Movie',fields:[text('name','Movie File')]},
        battleback:{label:'Battle Background',fields:[op(['change','save','restore']),text('floor','Floor File'),text('background','Background File')]},
        battlestatus:{label:'Battle Status Window',fields:[op(['show','hide'])]},
        battlelog:{label:'Battle Log',fields:[op(['text','show','hide','clear']),text('text','Message')]},
        bgm:{label:'Background Music',fields:audio},bgs:{label:'Background Sound',fields:audio},
        se:{label:'Sound Effect / System Sound',fields:[op(['play','system','stop']),text('name','Audio File'),n('volume','Volume',90),n('pitch','Pitch',100),n('pan','Pan'),n('soundId','System Sound Index',0)]}
    };
    B.extraFields={
        motion:[n('motionIndex','Custom Motion Index (0 = named motion)'),n('motionFrames','Motion Frames (0 = graphic default)'),n('motionSpeed','Motion Speed (0 = graphic default)'),pick('motionLoop','Motion Playback',['default','loop','once','hold'])],
        weapon:[pick('weaponGraphic','Graphic',['icon','sheet']),n('weaponImageId','Weapon Sheet Image ID',1),n('weaponFrame','Weapon Frame (1–3)',1)],
        move:[pick('moveMode','Movement',['anchor','forward','backward','position'])]
    };
    B.types.push(...Object.keys(B.commands));
    B.commandDefaults = type => Object.fromEntries([...(B.commands[type]?.fields||[]),...(B.extraFields[type]||[])].map(f=>[f.key,f.value]));
    const attachments=[pick('attachment','Attach To',['offset','rightHand','leftHand','center']),text('bone','Model Bone (optional)'),n('gripX','Grip X (0–1)',.5),n('gripY','Grip Y (0–1)',.5)];
    B.extraFields.weapon.push(...attachments,n('equipIndex','Equipment Slot (1 based)',1));
    B.extraFields.projectile=[pick('iconSource','Projectile Graphic',['color','action','weapon','icon','picture']),n('iconIndex','Icon Index'),text('name','Picture File'),
        pick('destination','Destination',['target','allTargets','user','subject']),pick('sourceRole','Graphic Owner',['battler','user']),...attachments,n('equipIndex','Equipment Slot (1 based)',1),
        n('startHeight','Launch Height (tiles)',1),n('endHeight','Arrival Height (tiles)',1),n('arc','Arc Height (tiles)'),n('spin','Spin (degrees/frame)'),n('rotation','Rotation (degrees)'),n('scale','Scale',1),pick('flight','Flight',['oneWay','return'])];
    // Positions are in logical tiles in both flat battles and battle rooms.
    B.attachmentPoint=(pose,step,width=1,height=2)=>{
        const facing=Math.sign(pose.facing)||1,hand=step.attachment==='leftHand'?-1:1;
        if(!step.attachment||step.attachment==='offset')return {x:pose.x+(step.x||0),y:pose.y+(step.y||0),z:(pose.z||0)+(step.z??1)};
        return {x:pose.x+(step.attachment==='center'?0:width*.22*facing*hand)+(step.x||0)*facing,y:pose.y+(step.y||0),z:(pose.z||0)+height*(step.attachment==='center'?.5:.6)+(step.z||0)};
    };
    B.flightPoint=(from,to,progress,arc=0,returning=false)=>{
        const t=Math.max(0,Math.min(1,progress)),u=returning?(t<=.5?t*2:(1-t)*2):t;
        return {x:from.x+(to.x-from.x)*u,y:from.y+(to.y-from.y)*u,z:(from.z||0)+((to.z||0)-(from.z||0))*u+4*arc*u*(1-u)};
    };
    B.visualIcon=(step,battler,item)=>{
        const source=step.iconSource||'weapon',equipment=battler?.equips?.()||battler?.weapons?.()||[];
        return Math.max(0,Math.floor(source==='icon'?step.iconIndex||0:(source==='action'?item:equipment[Math.max(0,(step.equipIndex||1)-1)])?.iconIndex||0));
    };
    B.optionLabel=value=>({allTargets:'All Targets',fadeIn:'Fade In',fadeOut:'Fade Out',elseIf:'Else If',mhp:'Max HP',mmp:'Max MP',atk:'Attack',def:'Defense',mat:'Magic Attack',mdf:'Magic Defense',agi:'Agility',luk:'Luck',hp:'HP',mp:'MP',tp:'TP',bgm:'BGM',bgs:'BGS',se:'SE'}[value]||String(value).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase()));
    B.targetGroups=['user','subject','target','allTargets','actors','enemies','battlers','friends','opponents'];
    B.targetFilters=['all','alive','dead','active','inactive','movable','moved','other','random'];
    B.selectTargets=(step,context)=>{
        const group=step.role||'user',user=context.user,subject=context.subject||user;
        let list=group==='user'?[user]:group==='subject'?(context.subjects||[subject]):group==='target'?(context.selected?.length?context.selected:[[...new Set(context.targets||[])][step.targetIndex||0]]):group==='allTargets'?context.targets:
            group==='actors'?context.actors:group==='enemies'?context.enemies:group==='battlers'?[...(context.actors||[]),...(context.enemies||[])]:group==='friends'?context.friends:context.opponents;
        list=[...new Set((list||[]).filter(Boolean))];
        const filter=step.filter||'all';
        list=list.filter(b=>filter==='alive'?b.isAlive?.():filter==='dead'?b.isDead?.():filter==='active'?b.isAppeared?.():filter==='inactive'?!b.isAppeared?.():filter==='movable'?b.canMove?.():filter==='moved'?context.moved?.(b):filter==='other'?b!==user:true);
        if(step.excludeUser)list=list.filter(b=>b!==user);
        if(step.actorId)list=list.filter(b=>b.actorId?.()===step.actorId);
        if(step.memberIndex!==undefined)list=list.slice(step.memberIndex,step.memberIndex+1);
        if(filter==='random'&&list.length)list=[list[Math.floor((context.random||Math.random)()*list.length)]];
        return list;
    };
    B.expandCalls=(sequence,sequences,stack=[])=>{
        if(stack.length>16||stack.includes(sequence))throw Error('Recursive sequence call.');
        const steps=[];
        for(const step of sequence.steps||[]){
            if(step.type!=='action')steps.push(copy(step));
            else{
                const called=sequences?.[step.sequenceId];if(!called)throw Error('Missing called sequence #'+step.sequenceId);
                if(B.purpose(called)!=='routine')throw Error('Call Sequence requires a Reusable Routine.');
                steps.push(...B.expandCalls(called,sequences,[...stack,sequence]).steps.map(s=>({...s,callRole:step.role,callFilter:step.filter})));
                if(step.duration)steps.push(B.step('wait',{duration:step.duration}));
            }
            if(steps.length>4096)throw Error('Expanded sequence exceeds 4096 steps.');
        }
        return {...sequence,expanded:true,steps:steps.map((s,i)=>({...s,id:'expanded-'+i}))};
    };
    B.roles = B.targetGroups;
    B.templates = ['Unarmed Punch', 'Melee Strike', 'Projectile Shot', 'Cast on Target', 'Heal', 'Self Buff', 'Use Item', 'Throw Item', 'Throw Weapon', 'Boomerang'];
    B.step = (type, extra = {}) => Object.assign({ id: 'step-' + Math.random().toString(36).slice(2), type,
        duration: ['impact','sound','animation','effect'].includes(type)||B.commands[type]&&!['jump','leap','float','fall','opacity','flash','tint','shake','whiten','picture','plane'].includes(type) ? 0 : 20, role: 'user', anchor: 'home', x: 0, y: 0, z: 0, easing: 'smooth' }, B.commandDefaults(type), extra);
    B.basicSteps = ['Run to Target', 'Punch', 'Return Home'];
    B.basic = name => name === 'Run to Target' ? [
        B.step('motion', {motion:'run',duration:0}),
        B.step('move', {anchor:'approach',x:-1.2,duration:30,easing:'linear',face:'movement'})
    ] : name === 'Return Home' ? [
        B.step('motion', {motion:'run',duration:0}),
        B.step('move', {duration:30,easing:'linear',face:'movement'}),
        B.step('motion', {motion:'idle',duration:0}),
        B.step('move', {duration:0,face:'home'})
    ] : [B.step('motion', {motion:'punch',duration:16}),
        B.step('impact', {role:'allTargets'}), B.step('wait', {duration:20})];
    B.template = (name = 'Melee Strike', id = 1) => {
        if (name === 'Unarmed Punch') return {id,version:1,name,note:'Run into range, punch on frame 46, then return home.',steps:[...B.basic('Run to Target'),...B.basic('Punch'),...B.basic('Return Home')]};
        if(['Use Item','Throw Item','Throw Weapon','Boomerang'].includes(name)){
            const source=['Throw Weapon','Boomerang'].includes(name)?'weapon':'action',held={attachment:'rightHand',iconSource:source,x:0,y:0,z:0,duration:0};
            const steps=[B.step('weapon',held),B.step('motion',{motion:'item',duration:12})];
            if(name!=='Use Item')steps.push(B.step('weapon',{visible:false,duration:0}),B.step('projectile',{iconSource:source,destination:'allTargets',attachment:'rightHand',arc:name==='Throw Item'?1.25:.6,spin:name==='Throw Item'?0:15,duration:30}));
            steps.push(B.step('animation',{animationSource:'action',role:'allTargets',animationId:0,duration:0}),B.step('impact',{role:'allTargets'}));
            if(name==='Boomerang')steps.push(B.step('projectile',{role:'allTargets',destination:'user',iconSource:'weapon',attachment:'center',arc:.6,spin:15,duration:30,sourceRole:'user'}),B.step('weapon',held));
            steps.push(B.step('wait',{duration:12}),B.step('weapon',{visible:false,duration:0}),B.step('motion',{motion:'idle',duration:0}));
            return {id,version:1,name,note:'',steps};
        }
        const steps = [];
        if (name === 'Melee Strike') steps.push(B.step('move', { anchor: 'target', x: -1.5, duration: 24 }));
        if(['Melee Strike','Projectile Shot'].includes(name))steps.push(B.step('weapon',{duration:0,x:0,z:0,attachment:'rightHand',iconSource:'weapon'}));
        steps.push(B.step('motion', { motion: name === 'Melee Strike' || name === 'Projectile Shot' ? 'attack' : 'cast', duration: 18 }));
        if (name === 'Projectile Shot') steps.push(B.step('projectile', { duration: 24, color: '#ffcc55', size: 8 }));
        steps.push(B.step('animation', { role: name === 'Self Buff' ? 'user' : 'allTargets', animationSource:'action', animationId: 0, duration: 12 }));
        steps.push(B.step('impact', { role: 'allTargets' }));
        steps.push(B.step('wait', { duration: 18 }));
        if (name === 'Melee Strike') steps.push(B.step('move', { duration: 24 }));
        if(['Melee Strike','Projectile Shot'].includes(name))steps.push(B.step('weapon',{duration:0,visible:false}));
        steps.push(B.step('motion', { motion: 'idle', duration: 8 }));
        return { id, version: 1, name, note: '', steps };
    };
    B.starterSequences=()=>[
        ...B.templates.map((name,i)=>({...B.template(name,i+1),starterKey:'action:'+name})),
        ...['Run to Target','Return Home','Punch'].map(name=>({version:1,name,purpose:name==='Punch'?'action':'routine',starterKey:'routine:'+name,steps:B.basic(name)})),
        ...[['Hold Equipped Item',{iconSource:'weapon',attachment:'rightHand'}],['Hold Action Item',{iconSource:'action',attachment:'rightHand'}],['Clear Held Item',{visible:false}]].map(([name,props])=>({version:1,name,purpose:'routine',starterKey:'routine:'+name,steps:[B.step('weapon',{...props,duration:0})]}))
    ];
    B.addStarters=records=>{
        const added=[];for(const starter of B.starterSequences())if(!records.some(record=>record&&(record.starterKey===starter.starterKey||record.name===starter.name&&B.purpose(record)===B.purpose(starter)))){
            const record={...starter,id:Math.max(1,records.length)};records[record.id]=record;added.push(record);
        }return added;
    };
    B.validateSequence = sequence => {
        const errors = [];
        if (!sequence || sequence.version !== 1 || !Array.isArray(sequence.steps)) return ['Unsupported action sequence format.'];
        if (sequence.steps.length > (sequence.expanded?4096:256)) errors.push('A sequence can contain at most 256 steps.');
        const purpose = B.purpose(sequence);
        if (!B.purposes.some(([id])=>id===purpose)) errors.push('Choose a valid sequence purpose.');
        let impacts = 0, effectCalls = 0, duration = 0;
        const ids = new Set();
        for (const step of sequence.steps) {
            if (!step || !B.types.includes(step.type)) { errors.push('Unknown step type.'); continue; }
            if (!step.id || ids.has(step.id)) errors.push('Every step needs a unique ID.');
            ids.add(step.id);
            if (!Number.isInteger(step.duration) || step.duration < 0 || step.duration > 3600) errors.push('Step duration must be 0–3600 frames.');
            duration += step.duration || 0;
            if (step.type === 'impact') impacts++;
            if (step.type === 'effect') effectCalls++;
            if (purpose === 'motion' && (!['motion','move','sound','animation','wait'].includes(step.type) || step.role !== 'user' || step.type === 'move' && step.anchor !== 'home')) errors.push('Battler state sequences may affect only the user and cannot apply damage or move the camera.');
            if(step.type==='animation'&&(!Number.isInteger(step.animationId??0)||(step.animationId??0)<0))errors.push('Choose a valid animation.');
            if(step.waitForCompletion!==undefined&&typeof step.waitForCompletion!=='boolean')errors.push('Wait for completion must be enabled or disabled.');
            if(step.animationTransform!==undefined){const t=step.animationTransform;if(!t||typeof t!=='object'||Array.isArray(t)||Object.entries(t).some(([k,v])=>!['x','y','z','scale'].includes(k)||!Number.isFinite(v)||(k==='scale'?(v<.01||v>100):Math.abs(v)>1000)))errors.push('Choose finite animation offsets and a scale between 0.01 and 100.');}
            if(step.type==='sound'&&step.audio){const a=step.audio;if(typeof a.name!=='string'||[['volume',0,100],['pitch',50,150],['pan',-100,100]].some(([k,min,max])=>!Number.isFinite(a[k])||a[k]<min||a[k]>max))errors.push('Sound requires volume 0–100, pitch 50–150 and pan −100–100.');}
            if(['weapon','projectile'].includes(step.type)&&['gripX','gripY'].some(k=>step[k]!==undefined&&(step[k]<0||step[k]>1)))errors.push('Grip coordinates must be between 0 and 1.');
            if(step.type==='projectile'&&step.iconSource==='picture'&&!step.name)errors.push('No file selected');
            if(step.type==='projectile'&&(!/^#[0-9a-f]{6}$/i.test(step.color||'#ffcc55')||!Number.isFinite(step.size??8)||(step.size??8)<1||(step.size??8)>512))errors.push('Choose a projectile color and size between 1 and 512.');
            if (!B.roles.includes(step.role)) errors.push('Unknown battler role.');
            if(step.targetIndex!==undefined&&(!Number.isInteger(step.targetIndex)||step.targetIndex<0||step.targetIndex>98))errors.push('Choose a valid target number.');
            if(step.transform!==undefined){
                const t=step.transform;
                if(!t||typeof t!=='object'||Array.isArray(t)||Object.entries(t).some(([key,value])=>!B.transformKeys.includes(key)||!Number.isFinite(value)||(key.startsWith('scale')?(value<.01||value>100):Math.abs(value)>(key.startsWith('rotate')?3600:1000))))errors.push('Choose finite transform values and scales between 0.01 and 100.');
            }
            if (['move','camera'].includes(step.type)) {
                if (!['home','target','approach'].includes(step.anchor)) errors.push('Unknown position anchor.');
                if (step.face !== undefined && !['home','movement','target'].includes(step.face)) errors.push('Unknown facing mode.');
                if (!['linear','smooth'].includes(step.easing)) errors.push('Unknown easing.');
                if(['rotateX','rotateY','rotateZ'].some(k=>step[k]!==undefined&&(!Number.isFinite(step[k])||Math.abs(step[k])>3600))||step.scale!==undefined&&(!Number.isFinite(step.scale)||step.scale<.01||step.scale>100))errors.push('Choose finite rotations and a scale between 0.01 and 100.');
                if (['x','y','z'].some(key => !Number.isFinite(step[key]) || Math.abs(step[key]) > 1000)) errors.push('Positions must be finite and within 1000 units.');
            }
        }
        if (['action','effect'].includes(purpose) && sequence.hitPolicy !== 'authored' && impacts !== 1 && !sequence.steps.some(s=>s.type==='action')) errors.push('Include exactly one Apply Action Effect step; skill repeats determine the number of hits.');
        if (!['action','effect','routine'].includes(purpose) && impacts) errors.push('Apply Action Effect belongs in a Complete Action or Effect phase.');
        if (purpose === 'execute' && (sequence.hitPolicy==='authored'?effectCalls<1:effectCalls!==1)) errors.push('Include exactly one Play Effect Phase step in Execute.');
        if (purpose !== 'execute' && effectCalls) errors.push('Play Effect Phase belongs in Execute.');
        if (duration > 18000) errors.push('A sequence can last at most five minutes.');
        const branches=[];
        for(const step of sequence.steps){
            if(step.type==='branch')branches.push(false);
            if(['else','elseIf'].includes(step.type)){if(!branches.length||branches.at(-1))errors.push('Else / Else If must follow an open If, before Else.');if(step.type==='else'&&branches.length)branches[branches.length-1]=true;}
            if(step.type==='end'){if(!branches.length)errors.push('End If has no matching If.');else branches.pop();}
            for(const f of [...(B.commands[step.type]?.fields||[]),...(B.extraFields[step.type]||[])]){const value=step[f.key]??f.value;if(f.type==='number'&&!Number.isFinite(value))errors.push('Command values must be finite numbers.');if(f.type==='select'&&!f.options.includes(value))errors.push('Choose a valid command option.');}
            if((step.type==='movie'||['bgm','bgs','se'].includes(step.type)&&(step.operation||'play')==='play'||['picture','plane'].includes(step.type)&&(step.operation||'show')==='show')&&!step.name)errors.push('No file selected');
            if(step.filter&&!B.targetFilters.includes(step.filter))errors.push('Choose a valid target filter.');
        }
        if(branches.length)errors.push('Close every If with End If.');
        return [...new Set(errors)];
    };
    B.validateStore = (sequences, settings) => {
        if (!Array.isArray(sequences) || (sequences.length && sequences[0] !== null)) throw Error('ActionSequences.json must be a database array starting with null.');
        for (let i = 1; i < sequences.length; i++) {
            const s = sequences[i];
            if (s && (s.id !== i || s.version !== 1 || !Array.isArray(s.steps))) throw Error('Unsupported ActionSequences.json entry #' + i);
        }
        if (!settings || settings.version !== 1 || Array.isArray(settings)) throw Error('Unsupported BattlePresentation.json format.');
        for (const key of ['troops','skills','items','weapons','actors','enemies','classes','states']) {
            if (settings[key] && (typeof settings[key] !== 'object' || Array.isArray(settings[key]))) throw Error('Invalid battle presentation section: ' + key);
        }
        return true;
    };
    B.timeline = sequence => {
        let frame = 0;
        return (sequence.steps || []).map(step => { const start = frame; frame += Math.max(0, number(step.duration)); return { step, start, end: frame }; });
    };
    B.duration = sequence => B.timeline(sequence).at(-1)?.end || 0;
    B.choices = (settings, {kind,itemId,isAttack,weaponIds=[],battlerKind,battlerId,classId}) => {
        const result=[{kind,id:itemId,binding:settings?.[kind]?.[itemId]}];
        if(isAttack)for(const id of weaponIds)result.push({kind:'weapons',id,binding:settings?.weapons?.[id]});
        if(isAttack&&!weaponIds.length&&battlerKind==='actors')result.push({kind:'actors',id:battlerId,slot:'unarmed',binding:settings?.actors?.[battlerId]?.unarmed});
        if(battlerKind==='actors'&&classId)result.push({kind:'classes',id:classId,binding:settings?.classes?.[classId]});
        result.push({kind:battlerKind,id:battlerId,binding:settings?.[battlerKind]?.[battlerId]});
        return result.filter(c=>c.binding);
    };
    B.defaultPhase = (phase, context = {}) => {
        const motion=context.isAttack?'attack':context.magical?'cast':'attack';
        const steps={
            prepare:[B.step('wait',{duration:0})],
            movement:context.isAttack?B.basic('Run to Target'):[B.step('move',{x:.3,duration:12})],
            execute:[B.step('motion',{motion,duration:18}),B.step('effect',{duration:0,role:'allTargets'})],
            effect:[B.step('animation',{animationId:Math.max(0,context.animationId||0),role:'allTargets',duration:0}),B.step('impact',{role:'allTargets',duration:0})],
            return:B.basic('Return Home'),
            finish:[B.step('motion',{motion:'idle',duration:0})]
        };
        return {id:0,version:1,purpose:phase,name:phase,steps:steps[phase]||[]};
    };
    B.resolvePresentation = (settings, sequences, context) => {
        const choices=B.choices(settings,context);
        const first=choices.find(c=>c.binding.mode&&c.binding.mode!=='inherit');
        if(!first||first.binding.mode==='existing')return {mode:'existing',source:first||null,sequence:null};
        if(first.binding.mode==='sequence'){
            const sequence=sequences?.[first.binding.sequenceId];
            const valid=sequence&&B.purpose(sequence)==='action'&&!B.validateSequence(sequence).length;
            return {mode:'sequence',source:first,sequence:valid?sequence:null,missing:!valid};
        }
        if(first.binding.mode!=='phases')return {mode:'existing',sequence:null};
        const phases=B.actionPhases.map(([phase])=>{
            const choice=choices.find(c=>c.binding.mode==='phases'&&c.binding.phases?.[phase]?.mode&&c.binding.phases[phase].mode!=='inherit');
            const binding=choice?.binding.phases[phase];
            const explicit=binding?.mode==='sequence';
            const sequence=explicit?sequences?.[binding.sequenceId]:B.defaultPhase(phase,context);
            const valid=sequence&&B.purpose(sequence)===phase&&!B.validateSequence(sequence).length;
            return {phase,source:choice||null,sequence:valid?sequence:null,missing:!valid};
        });
        if(phases.some(p=>p.missing))return {mode:'phases',source:first,phases,sequence:null,missing:true};
        const steps=[],effect=phases.find(p=>p.phase==='effect').sequence;
        for(const entry of phases){
            if(entry.phase==='effect')continue;
            for(const step of entry.sequence.steps){
                const source=step.type==='effect'?effect.steps:[step];
                for(const s of source)steps.push({...copy(s),id:'phase-'+steps.length,phase:step.type==='effect'?'effect':entry.phase});
                if(step.type==='effect'&&step.duration)steps.push(B.step('wait',{id:'phase-'+steps.length,duration:step.duration,phase:'execute'}));
            }
        }
        const sequence={id:0,version:1,name:'Resolved Action Phases',hitPolicy:effect.hitPolicy||'once',steps};
        return {mode:'phases',source:first,phases,sequence:B.validateSequence(sequence).length?null:sequence};
    };
    B.resolve = (settings,sequences,context) => B.resolvePresentation(settings,sequences,context).sequence;
    B.references = (settings, id, sequences=[]) => {
        const result = [];
        for(const kind of ['skills','items','weapons','actors','enemies','classes'])for(const [recordId,value] of Object.entries(settings?.[kind]||{})){
            const add=(binding,slot)=>{if(binding?.mode==='sequence'&&binding.sequenceId===id)result.push({kind,id:Number(recordId),...(slot?{slot}: {})});};
            add(value);add(value.unarmed,'unarmed');
            for(const [phase,binding] of Object.entries(value.phases||{}))add(binding,phase);
            for(const [phase,binding] of Object.entries(value.unarmed?.phases||{}))add(binding,'unarmed.'+phase);
            for(const [state,binding] of Object.entries(value.states||{}))add(binding,state);
        }
        for(const sequence of sequences||[])if(sequence?.steps?.some(step=>step.type==='action'&&step.sequenceId===id))result.push({kind:'actionSequences',id:sequence.id,slot:'Call Sequence'});
        return result;
    };
    B.room = (map, previous = {}) => Object.assign({ type: 'room', mapId: map.id, cameraSource: 'map',
        projection: map.reactor3d?.mode === '3d' || /<3d>/i.test(map.note||'') ? '3d' : '2d',
        camera: { x: map.width / 2 - .5, y: map.height / 2 - .5, z: 0, yaw: 0, pitch: 45, distance: 24 },
        actors: [], enemies: [], eventModes: {} }, copy(previous), { type: 'room', mapId: map.id });
    B.facingToward = (from,to) => Math.atan2(to.x-from.x,to.y-from.y)*180/Math.PI;
    B.position = (room, side, index) => {
        const saved = room[side]?.[index];
        const c = room.camera;
        return Object.assign({ x: c.x + (side === 'actors' ? 4 : -4), y: c.y + (index - 1.5) * 2,
            z: 0, facing: side === 'actors' ? -90 : 90 }, saved || {});
    };
    B.transformKeys = ['x','y','z','rotateX','rotateY','rotateZ','scale','scaleX','scaleY','scaleZ'];
    B.transform = value => Object.fromEntries(B.transformKeys.map(k=>[k,value?.[k]??(k.startsWith('scale')?1:0)]));
    B.roleKey = step => step.role==='target'&&step.targetIndex!==undefined?'target'+step.targetIndex:step.role;
    // Model offsets are layered over travel; a motion without an override
    // restores this layer, leaving the battler's movement keys untouched.
    B.visualPose = pose => {
        if(!pose?.transform)return pose;
        const t=B.transform(pose.transform),p={...pose};delete p.transform;
        for(const k of ['x','y','z','rotateX','rotateY','rotateZ'])p[k]=(pose[k]||0)+t[k];
        for(const k of ['scale','scaleX','scaleY','scaleZ'])p[k]=(pose[k]??1)*t[k];
        return p;
    };
    B.evaluate = (sequence, frame, context) => {
        const homes = context.homes, defaultTarget = context.target || homes.target || { x: 0, y: 0, z: 0 };
        const result = copy(homes);
        for (const { step, start, end } of (sequence._timeline||B.timeline(sequence))) {
            if (start > frame) break;
            const target=step._target||defaultTarget;
            if (!['move','camera','motion'].includes(step.type)) continue;
            const role = step.type === 'camera' ? 'camera' : B.roleKey(step);
            const roles = step._roles || (role === 'allTargets' ? Object.keys(homes).filter(k => k.startsWith('target') && (k!=='target'||!homes.target0)) : [role]);
            for (const key of roles) {
                const home = homes[key]; if (!home) continue;
                const from = result[key];
                if(step.type==='motion') {
                    if(step.transform||from.transform){
                        const a=B.transform(from.transform),b=B.transform(step.transform),t=end===start?1:Math.max(0,Math.min(1,(frame-start)/(end-start)));
                        result[key].transform=Object.fromEntries(B.transformKeys.map(k=>[k,a[k]+(b[k]-a[k])*t]));
                    }
                    if(key==='target'&&result.target0)result.target0=copy(result.target);
                    if(key==='target0'&&result.target)result.target=copy(result.target0);
                    continue;
                }
                const anchor = ['target','approach'].includes(step.anchor) ? target : home;
                let t = end === start ? 1 : Math.max(0, Math.min(1, (frame - start) / (end - start)));
                if (step.easing === 'smooth') t = t * t * (3 - 2 * t);
                const direction = context.direction || 1;
                let dx=step.x*direction,dy=step.y;
                if(step.anchor==='approach') {
                    const start=homes.user||home,vx=target.x-start.x,vy=target.y-start.y,length=Math.hypot(vx,vy);
                    const ux=length>1e-6?vx/length:direction,uy=length>1e-6?vy/length:0;
                    dx=step.x*ux-step.y*uy;dy=step.x*uy+step.y*ux;
                }
                let goal={x:anchor.x+dx,y:anchor.y+dy,z:anchor.z+step.z};
                if(step.moveMode==='position')goal={x:step.x,y:step.y,z:step.z};
                if(['forward','backward'].includes(step.moveMode)){const sign=(step.moveMode==='backward'?-1:1)*Math.sign(from.facing||context.direction||1);goal={x:from.x+step.x*sign,y:from.y+step.y,z:from.z+step.z};}
                result[key] = { ...from, x: from.x + (goal.x - from.x) * t,
                    y: from.y + (goal.y - from.y) * t, z: from.z + (goal.z - from.z) * t };
                for(const property of ['rotateX','rotateY','rotateZ','scale']){const baseline=home[property]??(property==='scale'?1:0),previous=from[property]??baseline,goal=step[property]??baseline;result[key][property]=previous+(goal-previous)*t;}
                if(from.facing!==undefined||home.facing!==undefined)result[key].facing=from.facing??home.facing;
                if(step.face==='home')result[key].facing=home.facing??B.facingToward(home,target);
                else if(step.face==='target')result[key].facing=B.facingToward(result[key],target);
                else if(step.face==='movement'&&Math.hypot(goal.x-from.x,goal.y-from.y)>1e-6)result[key].facing=B.facingToward(from,goal);
                if(key==='target'&&result.target0)result.target0={...result.target};
                if(key==='target0'&&result.target)result.target={...result.target0};
            }
        }
        return result;
    };
    B.previewPlan=(sequence,sequences)=>{
        const expanded=B.expandCalls(sequence,sequences),steps=[],branches=[];
        for(const step of expanded.steps){const active=branches.every(b=>b.active);
            if(step.type==='branch'){const matched=active&&(step.previewResult??true);branches.push({parent:active,active:matched,matched});}
            else if(step.type==='else'||step.type==='elseIf'){const b=branches.at(-1);if(b){b.active=b.parent&&!b.matched&&(step.type==='else'||(step.previewResult??true));b.matched||=b.active;}}
            else if(step.type==='end')branches.pop();else if(active)steps.push(step);
        }
        return {...expanded,steps};
    };
    B.previewVisuals=(sequence,frame,context)=>{
        const poses=B.evaluate(sequence,frame,context),layers=new Map(),opacity={},tones={},held={},trace=[];let flash=null,screenTone=null,shake=null;
        const keys=step=>step.role==='user'||step.role==='subject'?['user']:step.role==='target'?['target'+(step.targetIndex||0)]:step.role==='friends'||step.role==='actors'?['user']:step.role==='battlers'?Object.keys(poses).filter(k=>k==='user'||/^target[0-9]+$/.test(k)):Object.keys(poses).filter(k=>/^target[0-9]+$/.test(k));
        for(const cue of B.timeline(sequence)){if(cue.start>frame)break;const step={...B.commandDefaults(cue.step.type),...cue.step},t=cue.end===cue.start?1:Math.min(1,(frame-cue.start)/(cue.end-cue.start));
            if(B.commands[step.type])trace.push({label:B.commands[step.type].label,step,start:cue.start});
            if(step.type==='flash'&&frame<=cue.end)flash=[step.red,step.green,step.blue,step.alpha*(1-t)];
            if(step.type==='shake'&&frame<=cue.end)shake=Math.sin((frame-cue.start)*step.speed*.1)*step.power;
            if(step.type==='tint'&&step.space!=='battler')screenTone=[step.red,step.green,step.blue,step.gray];
            for(const key of keys(step)){const p=poses[key];if(!p)continue;
                if(step.type==='jump')p.z+=(frame<cue.end?Math.sin(Math.PI*t)*step.height:0);
                if(step.type==='leap')p.z+=step.height*(1-(1-t)*(1-t));
                if(step.type==='float')p.z+=step.height*t;
                if(step.type==='fall')p.z+=(step.height-p.z)*t;
                if(step.type==='opacity')opacity[key]=(255+(step.opacity-255)*t)/255;
                if(step.type==='tint'&&step.space==='battler')tones[key]=[step.red,step.green,step.blue,step.gray];
                if(step.type==='pose')held[key]=step.operation==='clear'?null:{name:step.motion,frame:step.frame-1};
                if(step.type==='direction')p.facing=step.direction==='right'?90:step.direction==='left'?-90:step.direction==='behind'?-(p.facing||-90):B.facingToward(p,poses.target||poses.user);
            }
            if(['picture','plane','icon','balloon'].includes(step.type)){
                const owners=step.space==='screen'||step.type==='plane'?['screen']:keys(step);
                for(const owner of owners){const key=step.type+':'+owner+':'+(step.index||0),prior=layers.get(key);
                    if(step.operation==='clear')layers.delete(key);else if(step.operation==='move'&&prior)layers.set(key,{...prior,step:{...prior.step,x:prior.step.x+(step.x-prior.step.x)*t,y:prior.step.y+(step.y-prior.step.y)*t,opacity:prior.step.opacity+(step.opacity-prior.step.opacity)*t}});else layers.set(key,{step,owner,start:cue.start});}
            }
        }
        if(poses.target0)poses.target={...poses.target0};
        return {poses,opacity,tones,held,layers:[...layers.values()],flash,screenTone,shake,trace};
    };
    B.Player = class {
        constructor(sequence, adapter) {
            const errors = B.validateSequence(sequence); if (errors.length) throw Error(errors.join(' '));
            this.sequence = copy(sequence); this.adapter = adapter; this.frame = -1; this.done = false;
            this.timeline = B.timeline(this.sequence); this.duration = B.duration(sequence); this.cursor = 0; this.waiting = null; this.executed=[]; this.branches=[];
        }
        update(delta = 1) {
            if (this.done) return;
            if (this.waiting?.isPlaying()) return;
            this.waiting = null;
            let frame = Math.min(this.duration, Math.max(0, this.frame) + Math.max(0, delta));
            while (this.cursor < this.timeline.length && this.timeline[this.cursor].start <= frame) {
                const cue = this.timeline[this.cursor++];
                const step=cue.step,active=this.branches.every(b=>b.active);
                if(step.type==='branch'){const matched=active&&!!this.adapter.condition?.(step.condition);this.branches.push({parent:active,active:matched,matched});}
                else if(step.type==='elseIf'||step.type==='else'){const b=this.branches.at(-1);b.active=b.parent&&!b.matched&&(step.type==='else'||!!this.adapter.condition?.(step.condition));b.matched||=b.active;}
                else if(step.type==='end')this.branches.pop();
                else if(active){this.executed.push(cue);}
                if(!active||['branch','elseIf','else','end'].includes(step.type)){
                    const removed=cue.end-cue.start;for(let i=this.cursor;i<this.timeline.length;i++){this.timeline[i].start-=removed;this.timeline[i].end-=removed;}this.duration-=removed;frame=Math.min(frame,this.duration);continue;
                }
                const media = this.adapter.cue?.(cue.step, cue.start);
                if ((!this.skipping && cue.step.waitForCompletion || media?.blocking) && media?.isPlaying()) {
                    this.waiting = media; this.frame = cue.start;
                    this.pose(this.frame); return;
                }
            }
            this.frame = frame; this.pose(frame);
            if (frame >= this.duration) this.finish();
        }
        pose(frame) {
            // A blocking cue can share a timestamp with later moves or motions.
            // Evaluate only dispatched cues until the media has completed.
            const sequence = {...this.sequence, steps:this.executed.map(c=>c.step),_timeline:this.executed};
            this.adapter.pose?.(B.evaluate(sequence, frame, this.adapter.context), frame);
        }
        finish(cancelled = false) { if (!this.done) { this.done = true; this.adapter.cleanup?.(cancelled); } }
        skip() { this.waiting = null; this.skipping = true; this.update(this.duration + 1); }
        cancel() { this.waiting?.cancel?.(); this.waiting = null; this.finish(true); }

    };
    root.ReactorBattleData = B;
    if (typeof module !== 'undefined' && module.exports) module.exports = B;
})(globalThis);
