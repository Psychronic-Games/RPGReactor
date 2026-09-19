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
    B.types = ['move', 'motion', 'sound', 'animation', 'projectile', 'weapon', 'impact', 'wait', 'camera'];
    B.actionPhases = [
        ['prepare', 'Prepare', 'Before moving: ready the battler or begin casting.'],
        ['movement', 'Movement', 'Approach the target or step forward.'],
        ['execute', 'Execute', 'Perform the action itself: its animation on the targets and one Apply Action Effect land the hit. A normal attack by default.'],
        ['return', 'Return', 'Move the battler back home.'],
        ['finish', 'Finish', 'Clean up after the return, before automatic pose and camera reset.']
    ];
    // Highest priority first: an assignment on a record overrides every level after it.
    B.priorityChain = [['skills', 'Skill / Item'], ['weapons', 'Weapon'], ['classes', 'Class'], ['actors', 'Actor / Enemy']];
    B.battlerStates = [
        ['idle','Idle'], ['moving','Moving'], ['input','Choosing Command'], ['ready','Ready'],
        ['chant','Chant / Cast'], ['guard','Guard'], ['damage','Damage'], ['evade','Evade'],
        ['abnormal','Abnormal Status'], ['sleep','Sleep'], ['dying','Low HP'], ['dead','Defeated'],
        ['entry','Battle Entry'], ['victory','Victory'], ['escape','Escape'], ['escapeFail','Escape Failed'], ['magicEvade','Magic Evade'], ['collapse','Collapse']
    ];
    B.purposes = [['action','Complete Action'], ...B.actionPhases.map(([id,label])=>[id,label]), ['motion','Battler State / Reaction'], ['routine','Reusable Routine']];
    B.purpose = sequence => sequence?.purpose || 'action';
    // The kinds a sequence is used as. Phases are no longer separate
    // sequences: an action sequence marks each step with the phase it
    // belongs to, and the phases it provides are exactly the ones a record
    // assigning it takes over; the rest inherit down the priority chain.
    B.kinds = [['action','Action (attacks, skills, items)'],['motion','Battler Motion (idle, states, reactions)'],['routine','Routine (called by other sequences)']];
    B.phaseIds = () => B.actionPhases.map(([id]) => id);
    B.isPhase = value => B.actionPhases.some(([id]) => id === value);
    B.stepPhase = step => (step && B.isPhase(step.phase)) ? step.phase : 'execute';
    // Marked steps, or an explicit list, say which phases a sequence provides.
    // An action sequence with neither is the older whole action: every phase,
    // all of its steps in Execute.
    B.isPhased = sequence => B.purpose(sequence) === 'action' && ((Array.isArray(sequence.phases) && sequence.phases.some(B.isPhase)) || (sequence.steps || []).some(step => step && B.isPhase(step.phase)));
    B.sequencePhases = sequence => {
        if (!sequence) return [];
        const purpose = B.purpose(sequence);
        if (B.isPhase(purpose)) return [purpose];
        if (purpose !== 'action') return [];
        if (!B.isPhased(sequence)) return B.phaseIds();
        const set = new Set((Array.isArray(sequence.phases) ? sequence.phases : []).filter(B.isPhase));
        for (const step of sequence.steps || []) if (step) set.add(B.stepPhase(step));
        return B.phaseIds().filter(id => set.has(id));
    };
    B.phaseSteps = (sequence, phase) => {
        const purpose = B.purpose(sequence);
        if (purpose === phase) return sequence.steps || [];
        if (purpose !== 'action') return [];
        if (!B.isPhased(sequence)) return phase === 'execute' ? (sequence.steps || []) : [];
        return (sequence.steps || []).filter(step => step && B.stepPhase(step) === phase);
    };
    // An older whole-action sequence becomes an explicit one: every step in
    // Execute, every phase provided (empty ones too), so it still owns the
    // whole action until its author moves steps into other phases.
    B.migratePhases = sequence => {
        if (!sequence || B.purpose(sequence) !== 'action' || B.isPhased(sequence)) return false;
        for (const step of sequence.steps || []) if (step) step.phase = 'execute';
        sequence.phases = B.phaseIds();
        return true;
    };
    // The built-in hit: the action's animation on the targets, then Apply Action Effect.
    B.builtinHit = (context = {}, role = 'allTargets', targetIndex) => [
        B.step('animation', { animationSource: 'action', animationId: Math.max(0, context.animationId || 0), role, targetIndex, duration: 0, waitForCompletion: true }),
        B.step('impact', { role, targetIndex, duration: 0 })
    ];
    // Effect used to be a phase of its own, called from Execute by a "Play
    // Effect Phase" step. It is part of Execute now: steps marked effect keep
    // their place as Execute steps, a placeholder takes the sequence's effect
    // steps at that moment (or the built-in hit when it had none), and its
    // own frames become a wait after them.
    B.foldEffectPhase = sequence => {
        if (!sequence || !Array.isArray(sequence.steps)) return false;
        let changed = false;
        if (sequence.purpose === 'effect') { sequence.purpose = 'execute'; changed = true; }
        const steps = sequence.steps.filter(Boolean), effectSteps = steps.filter(step => step.phase === 'effect');
        const placeholders = steps.filter(step => step.type === 'effect');
        if (placeholders.length) {
            const out = [];
            let first = true;
            for (const step of steps) {
                if (step.phase === 'effect' && effectSteps.length) continue;
                if (step.type !== 'effect') { out.push(step); continue; }
                const body = first ? (effectSteps.length ? effectSteps.map(s => ({ ...s, phase: 'execute' })) : B.builtinHit({}, step.role || 'allTargets', step.targetIndex)) : [];
                first = false;
                for (const s of body) out.push({ ...s, phase: 'execute' });
                if (step.duration > 0) out.push({ ...B.step('wait', { duration: step.duration }), phase: 'execute' });
            }
            sequence.steps = out;
            changed = true;
        } else if (effectSteps.length) {
            for (const step of effectSteps) step.phase = 'execute';
            changed = true;
        }
        if (Array.isArray(sequence.phases) && sequence.phases.includes('effect')) {
            const set = new Set(sequence.phases.filter(p => p !== 'effect'));
            if (sequence.steps.some(step => step && B.stepPhase(step) === 'execute')) set.add('execute');
            sequence.phases = B.phaseIds().filter(p => set.has(p));
            changed = true;
        }
        return changed;
    };
    B.migrateSequence = sequence => { const folded = B.foldEffectPhase(sequence), phased = B.migratePhases(sequence); return folded || phased; };
    // A per-phase pick of the old Effect phase has nothing to bind to.
    B.migrateSettings = settings => {
        let changed = false;
        for (const kind of ['skills','items','weapons','actors','enemies','classes']) for (const value of Object.values(settings?.[kind] || {})) {
            for (const holder of [value, value?.unarmed]) if (holder?.phases && Object.prototype.hasOwnProperty.call(holder.phases, 'effect')) { delete holder.phases.effect; changed = true; }
        }
        return changed;
    };
    // Where each step of a plain action belongs, read from what it does: the
    // approach is Movement, the walk home is Return, the idle after it is
    // Finish, everything else (the swing, the animation, the hit) Execute.
    B.autoPhases = steps => {
        const list = (steps || []).filter(Boolean), zero = step => ['x','y','z'].every(k => !Number(step[k]));
        const nextMove = i => list.slice(i + 1).find(step => step.type !== 'motion' && step.type !== 'direction');
        let impact = false, returned = false;
        return list.map((step, i) => {
            let phase = 'execute';
            const next = nextMove(i);
            if (step.type === 'impact') impact = true;
            else if (!impact && step.type === 'move' && (['target','approach'].includes(step.anchor) || !zero(step))) phase = 'movement';
            else if (!impact && step.type === 'motion' && ['walk','run'].includes(step.motion) && next?.type === 'move' && (['target','approach'].includes(next.anchor) || !zero(next))) phase = 'movement';
            else if (impact && step.type === 'move' && step.anchor === 'home' && zero(step) && !returned && step.duration > 0) { returned = true; phase = 'return'; }
            else if (impact && !returned && step.type === 'motion' && ['walk','run'].includes(step.motion) && next?.type === 'move' && next.anchor === 'home' && zero(next)) phase = 'return';
            else if (returned) phase = 'finish';
            return { ...step, phase };
        });
    };
    B.graphicModes = [['auto','Use Existing Graphic'],['sv','SV Battler Sheet'],['character','Character Set'],['static','Static Battler Image'],['model','3D Model']];
    B.spriteMotions = {idle:1,walk:0,moving:0,run:0,wait:1,ready:1,input:0,chant:2,guard:3,damage:4,evade:5,
        attack:6,punch:6,thrust:6,swing:7,missile:8,cast:9,spell:9,skill:10,item:11,escape:12,victory:16,abnormal:14,sleep:15,dying:13,dead:17,entry:0,return:12,magicEvade:5,collapse:17,escapeFail:12};
    B.graphic = (settings,kind,id,record,legacyModel) => {
        const config=settings?.[kind]?.[id]?.graphic||{mode:'auto'};
        if(config.mode==='model')return {...config,type:'model',model:config.model||legacyModel};
        if(!config.mode||config.mode==='auto')return legacyModel?{type:'model',model:legacyModel}:{type:kind==='actors'?'sv':'static',name:record?.battlerName||'',folder:kind==='actors'?'sv_actors':'enemies',scale:1};
        return {...config,type:config.mode,name:config.name||'',folder:config.mode==='sv'?'sv_actors':config.mode==='character'?(config.folder||'characters'):config.folder||'enemies'};
    };
    // Facing is a yaw in degrees: 0 faces +y (down the screen), 90 faces +x
    // (right), 180 faces -y (up), -90 faces -x (left). Character sheets pick
    // the matching row unless the graphic or motion names a direction.
    B.directionFromYaw = yaw => { const a=((Number(yaw)||0)%360+360)%360; return a<45||a>=315?2:a<135?6:a<225?8:4; };
    B.graphicFrame = (graphic,width,height,motion='idle',frame=0,facingYaw=-90) => {
        if(graphic.type==='static')return {x:0,y:0,width,height};
        const setup=graphic.motions?.[motion]||{},speed=Math.max(1,setup.speed||graphic.speed||12);
        const frames=Math.min(graphic.frames||3,Math.max(1,setup.frames||graphic.frames||3)),tick=Math.floor(Math.max(0,frame)/speed);
        const loop=setup.loop??(!['damage','attack','punch','thrust','swing','missile','cast','spell','skill','item','entry'].includes(motion));
        // A character sheet stands on its middle column and walks 0,1,2,1 like it does on the map.
        const sheet=graphic.type==='character'&&frames===3;
        const pattern=loop==='once'?Math.min(frames-1,tick):loop===false?(sheet?1:Math.min(frames-1,tick)):sheet?[0,1,2,1][tick%4]:tick%frames;
        if(graphic.type==='character'){
            const big=/^[!]*\$/.test(graphic.name||''),columns=big?1:4,rows=big?1:2,index=big?0:Math.max(0,Math.min(7,graphic.index||0));
            const chosen=setup.direction||graphic.direction,w=width/(columns*(graphic.frames||3)),h=height/(rows*4);
            const direction=chosen&&chosen!=='auto'?Number(chosen):B.directionFromYaw(facingYaw);
            return {x:((index%4)*(graphic.frames||3)+pattern)*w,y:(Math.floor(index/4)*4+(direction/2-1))*h,width:w,height:h};
        }
        const columns=graphic.motionColumns||3,rows=graphic.motionRows||6,total=columns*rows;
        const index=Math.max(0,Math.min(total-1,setup.index??(/^\d+$/.test(String(motion))?Math.max(0,Number(motion)-1):B.spriteMotions[motion]??1)));
        const w=width/(columns*(graphic.frames||3)),h=height/rows;
        return {x:(Math.floor(index/rows)*(graphic.frames||3)+pattern)*w,y:(index%rows)*h,width:w,height:h};
    };
    // States afflicting the battler (highest priority first) may carry their
    // own reaction sequence, which replaces the idle-type motions while present.
    B.resolveState = (settings,sequences,kind,id,state,classId=0,actionBinding=null,stateIds=[]) => {
        if(['idle','abnormal','sleep','dying','wait','ready'].includes(state))for(const stateId of stateIds){
            const binding=settings?.states?.[stateId]?.reaction;if(binding?.mode!=='sequence')continue;
            const sequence=sequences?.[binding.sequenceId];if(sequence&&B.purpose(sequence)==='motion'&&!B.validateSequence(sequence).length)return sequence;
        }
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
        direction:{label:'Face Direction',fields:[pick('direction','Facing',['left','right','up','down','behind','targets','opponents','home','position']),n('position','X (pixels)')]},
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
        se:{label:'Sound Effect',fields:[op(['play','system','stop']),text('name','Audio File'),n('volume','Volume',90),n('pitch','Pitch',100),n('pan','Pan'),n('soundId','System Sound Index',0)]}
    };
    B.extraFields={
        motion:[n('motionIndex','Custom Motion Index (0 = named motion)'),n('motionFrames','Motion Frames (0 = graphic default)'),n('motionSpeed','Motion Speed (0 = graphic default)'),pick('motionLoop','Motion Playback',['default','loop','once','hold'])],
        weapon:[pick('weaponGraphic','Drawn As',['icon','sheet']),n('weaponImageId','Weapon Sheet Image ID',1),n('weaponFrame','Weapon Frame (1–3)',1),pick('layer','Layer',['front','behind'])],
        move:[pick('moveMode','Movement',['anchor','forward','backward','position']),n('speed','Speed (frames per tile, 0 = use Duration)'),n('arc','Arc (jump height in tiles along the move)')]
    };
    B.types.push(...Object.keys(B.commands));
    B.commandDefaults = type => Object.fromEntries([...(B.commands[type]?.fields||[]),...(B.extraFields[type]||[])].map(f=>[f.key,f.value]));
    const attachments=[pick('attachment','Attach To',['offset','rightHand','leftHand','center']),text('bone','Bone Name (blank = the hand)'),n('gripX','Grip X (0 left – 1 right)',.5),n('gripY','Grip Y (0 base – 1 top)',.5)];
    B.extraFields.weapon.unshift(pick('mode','Weapon',['show','move','hide']));
    B.extraFields.weapon.push(...attachments,n('equipIndex','Equipment Slot (1 based)',1),pick('hands','Held With',['one','both']),pick('aim','Aim',['none','target']));
    // A weapon step shows the held thing, moves it (offset, rotation and
    // scale tween over the step's frames from where it was), or hides it.
    B.weaponMode=step=>step.visible===false?'hide':(step.mode||'show');
    B.ease=(t,easing)=>{t=Math.max(0,Math.min(1,t));return easing==='linear'?t:t*t*(3-2*t);};
    // Custom part poses on a Motion step: `parts` lists the rig parts the
    // step moves (by the model's part names, so the same pose plays on any
    // model rigged with those names) and where each ends up; the step's
    // duration is the time taken to get there, and the pose is kept until
    // a later step moves that part again. `resetPose` first sends every
    // part posed so far back to rest. The plan below turns the steps of a
    // sequence into the keyed pose rules the model animator already plays.
    B.POSE_MOTION='__pose';
    B.poseRest=()=>({rotate:[0,0,0],move:[0,0,0],resize:[1,1,1]});
    B.hasPose=step=>!!step&&step.type==='motion'&&(step.motion===B.POSE_MOTION||Array.isArray(step.parts)&&step.parts.length>0||!!step.resetPose);
    // The action a motion step plays: a pose step's own, a step that releases
    // a pose (the plan says which) its own too, else the named motion.
    B.motionActionName=(step,plan)=>plan?.actions?.[step.id]||(B.hasPose(step)?'pose:'+step.id:step.motion);
    // What a sprite-sheet battler plays for a step: a part pose has no sheet row, so it waits.
    B.spriteMotionName=step=>B.hasPose(step)?'idle':step.motion;
    B.partPose=value=>{const v3=(list,fill)=>[0,1,2].map(i=>Number.isFinite(Number(list?.[i]))?Number(list[i]):fill);return {rotate:v3(value?.rotate,0),move:v3(value?.move,0),resize:v3(value?.resize,1)};};
    // A part entry with `aim` ('target' or 'user') turns to face that battler when the step
    // plays: `aimOf(entry, step)` answers the turn in degrees about the part's up axis from
    // the live scene (the room knows where the part points and where the target stands).
    B.aimedParts=(step,aimOf)=>(step.parts||[]).map(entry=>entry&&entry.part&&entry.aim&&aimOf?{...entry,rotate:[0,Number(aimOf(entry,step))||0,0]}:entry);
    B.partPoseRules=(step,previous,aimOf)=>{
        const next={};if(!step.resetPose)Object.assign(next,previous);
        for(const entry of B.aimedParts(step,aimOf))if(entry&&entry.part)next[String(entry.part)]=B.partPose(entry);
        const rest=B.poseRest(),same=(a,b)=>['rotate','move','resize'].every(k=>a[k].every((v,i)=>v===b[k][i]));
        // A part the step lists at rest is still posed: it pins to rest while the pose stands, out from under a clip that would move it.
        const listed=new Set((step.parts||[]).filter(entry=>entry&&entry.part).map(entry=>String(entry.part)));
        const rules=[];
        for(const part of new Set([...Object.keys(previous||{}),...Object.keys(next)])){
            const from=previous?.[part]||rest,to=next[part]||rest;if(same(from,rest)&&same(to,rest)&&!listed.has(part))continue;
            rules.push({name:'pose:'+step.id,part,clip:'',rate:1,type:'pose',axis:'y',trigger:'action',speed:90,perTile:0,degrees:15,amount:.1,period:Math.max(1,Math.ceil((step.duration||0)/2)),cycles:1,phase:0,rotate:[0,0,0],move:[0,0,0],resize:[1,1,1],hold:false,stay:true,fromRest:true,instant:!(step.duration>0),repeat:false,keys:[{at:0,...from},{at:1,...to}],effects:[]});
        }
        for(const part of Object.keys(next))if(same(next[part],rest))delete next[part];
        return {rules,next};
    };
    // A motion after a pose brings the posed parts home over its own frames
    // (0 frames snaps), the way a Move step travels from the pose before it.
    B.releasePoseRules=(step,previous)=>B.partPoseRules({id:step.id,duration:step.duration,resetPose:true,parts:[]},previous);
    // The plan of a sequence's poses: `rules` per step id, `actions` naming
    // the action a step plays when it is not the plain motion name, and
    // `releases` naming the motion a release step still plays alongside.
    B.posePlan=(sequence,aimOf)=>{const state={},plan={rules:{},actions:{},releases:{}};
        for(const {step} of (sequence._timeline||B.timeline(sequence))){if(step.type!=='motion')continue;const key=B.roleKey(step),previous=state[key]||{};
            if(B.hasPose(step)){const {rules,next}=B.partPoseRules(step,previous,aimOf);plan.rules[step.id]=rules;plan.actions[step.id]='pose:'+step.id;state[key]=next;}
            else if(Object.keys(previous).length&&!step.keepPose){const {rules}=B.releasePoseRules(step,previous);plan.rules[step.id]=rules;plan.actions[step.id]='pose:'+step.id;plan.releases[step.id]=step.motion||'idle';state[key]={};}}
        return plan;};
    // The rules one model plays for a release step: the parts going home, and its own rules for the named motion under the same action name.
    B.releaseMotionRules=(plan,stepId,modelRules)=>{const motion=plan?.releases?.[stepId];if(!motion)return [];const wanted=String(motion).toLowerCase();return (modelRules||[]).filter(r=>r&&r.trigger==='action'&&!String(r.name).startsWith('pose:')&&String(r.name).toLowerCase()===wanted).map(r=>({...r,name:plan.actions[stepId]}));};
    // The humanoid rig's parts, as a person names them, and how each joint
    // moves: a hinge (elbow, knee) bends about one axis, a ball joint
    // (shoulder, hip, neck) turns freely.
    B.humanoidJoints={
        Hips:{label:'Hips',kind:'ball'},Spine:{label:'Spine',kind:'ball'},Chest:{label:'Chest',kind:'ball'},Neck:{label:'Neck',kind:'ball'},Head:{label:'Head',kind:'ball'},
        LeftUpperArm:{label:'Left Upper Arm',kind:'ball'},LeftLowerArm:{label:'Left Forearm (elbow)',kind:'hinge'},LeftHand:{label:'Left Hand',kind:'ball'},
        RightUpperArm:{label:'Right Upper Arm',kind:'ball'},RightLowerArm:{label:'Right Forearm (elbow)',kind:'hinge'},RightHand:{label:'Right Hand',kind:'ball'},
        LeftUpperLeg:{label:'Left Thigh',kind:'ball'},LeftLowerLeg:{label:'Left Shin (knee)',kind:'hinge'},LeftFoot:{label:'Left Foot',kind:'ball'},
        RightUpperLeg:{label:'Right Thigh',kind:'ball'},RightLowerLeg:{label:'Right Shin (knee)',kind:'hinge'},RightFoot:{label:'Right Foot',kind:'ball'}
    };
    B.partLabel=part=>B.humanoidJoints[part]?.label||String(part).replace(/[_.-]+/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2');
    // Which axis a hinge bends about: the limb's own direction rules it out,
    // and the model's side axis (X) is the pin unless the limb lies along it.
    B.hingeAxis=direction=>{const d=direction||[0,-1,0];return Math.abs(d[0])<.7?0:1;};
    B.heldKeys=['x','y','z','rotation','rotateY','rotateZ','scale'];
    B.heldPose=(from,to,e)=>Object.fromEntries(B.heldKeys.map(k=>{const a=from?.[k]??(k==='scale'?1:0),b=to?.[k]??(k==='scale'?1:0);return [k,a+(b-a)*e];}));
    // Where a held 3D model stands: at the attachment point, facing where its
    // holder faces (an authored front face turns to it; a model without one
    // keeps the +90 long-axis assumption), tipped by the step's Tilt, turned
    // and rolled by Turn and Roll, held at the grip fraction of its height.
    B.heldPlacement=(point,facing,step,spec)=>({x:point.x,y:point.y,z:point.z,facing:(facing||0)+(spec?.faces?.front?0:90),rotateX:-(step.rotation||0),rotateY:step.rotateY||0,rotateZ:step.rotateZ||0,scale:step.scale??1,pivotY:step.gripY??.5});
    B.extraFields.projectile=[pick('iconSource','Projectile Graphic',['color','action','weapon','icon','picture','model','animation']),n('iconIndex','Icon Index'),text('name','Picture File'),
        pick('destination','Destination',['target','allTargets','user','subject']),pick('sourceRole','Graphic Owner',['battler','user']),...attachments,n('equipIndex','Equipment Slot (1 based)',1),
        n('startHeight','Launch Height (tiles)',1),n('endHeight','Arrival Height (tiles)',1),n('arc','Arc Height (tiles)'),n('spin','Spin (degrees/frame)'),n('rotation','Rotation (degrees)'),n('scale','Scale',1),pick('flight','Flight',['oneWay','return'])];
    // Positions are in logical tiles in both flat battles and battle rooms.
    B.attachmentPoint=(pose,step,width=1,height=2)=>{
        const facing=Math.sign(pose.facing)||1,hand=step.attachment==='leftHand'?-1:1;
        if(!step.attachment||step.attachment==='offset')return {x:pose.x+(step.x||0),y:pose.y+(step.y||0),z:(pose.z||0)+(step.z??1)};
        // No bone to hold it: the hand is beside the body, a little forward, at wrist height.
        return {x:pose.x+(step.attachment==='center'?0:(width*.22*hand+width*.3)*facing)+(step.x||0)*facing,y:pose.y+(step.y||0),z:(pose.z||0)+height*(step.attachment==='center'?.5:.55)+(step.z||0)};
    };
    B.flightPoint=(from,to,progress,arc=0,returning=false)=>{
        const t=Math.max(0,Math.min(1,progress)),u=returning?(t<=.5?t*2:(1-t)*2):t;
        return {x:from.x+(to.x-from.x)*u,y:from.y+(to.y-from.y)*u,z:(from.z||0)+((to.z||0)-(from.z||0))*u+4*arc*u*(1-u)};
    };
    B.visualIcon=(step,battler,item)=>{
        const source=step.iconSource||'weapon',equipment=battler?.equips?.()||battler?.weapons?.()||[];
        return Math.max(0,Math.floor(source==='icon'?step.iconIndex||0:(source==='action'?item:equipment[Math.max(0,(step.equipIndex||1)-1)])?.iconIndex||0));
    };
    B.optionLabel=value=>({allTargets:'All Targets',fadeIn:'Fade In',fadeOut:'Fade Out',elseIf:'Else If',mhp:'Max HP',mmp:'Max MP',atk:'Attack',def:'Defense',mat:'Magic Attack',mdf:'Magic Defense',agi:'Agility',luk:'Luck',hp:'HP',mp:'MP',tp:'TP',bgm:'BGM',bgs:'BGS',se:'SE',front:'In front of the battler',behind:'Behind the battler'}[value]||String(value).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase()));
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
    B.templates = ['Unarmed Punch', 'Melee Strike', 'Projectile Shot', 'Cast on Target', 'Heal', 'Self Buff', 'Use Item', 'Throw Item', 'Throw Weapon', 'Boomerang', 'Item Toss', 'Sword Slash', 'Railgun Shot'];
    B.step = (type, extra = {}) => Object.assign({ id: 'step-' + Math.random().toString(36).slice(2), type,
        duration: ['impact','sound','animation'].includes(type)||B.commands[type]&&!['jump','leap','float','fall','opacity','flash','tint','shake','whiten','picture','plane'].includes(type) ? 0 : 20, role: 'user', anchor: 'home', x: 0, y: 0, z: 0, easing: 'smooth' }, B.commandDefaults(type), extra);
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
        // A starter is a whole action: it provides every phase, empty ones
        // included, so nothing below it in the chain leaks in until its
        // author lets a phase inherit.
        const built = B.templateSteps(name, id);
        built.steps = B.autoPhases(built.steps);
        built.phases = B.phaseIds();
        return built;
    };
    B.templateSteps = (name = 'Melee Strike', id = 1) => {
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
        // Ports of Star Shift Rebellion's Victor Battle Motions notetags, in
        // native steps: pixel offsets become tiles (48px), waits become step
        // durations, and the equipped icon keys stay in the hand.
        if (name === 'Item Toss') return {id,version:1,name,note:'Face the recipient, lob the item (its icon or 3D model) in a high arc, then apply it on arrival. Works for a med kit on an ally or a grenade at an enemy.',steps:[
            B.step('direction',{direction:'targets',duration:0}),
            B.step('weapon',{iconSource:'action',attachment:'rightHand',x:0,y:0,z:0,duration:0}),
            B.step('motion',{motion:'item',duration:12}),
            B.step('weapon',{visible:false,duration:0}),
            B.step('projectile',{iconSource:'action',destination:'allTargets',attachment:'rightHand',arc:1.4,spin:0,duration:50}),
            B.step('animation',{animationSource:'action',role:'allTargets',animationId:0,duration:0}),
            B.step('impact',{role:'allTargets'}),
            B.step('wait',{duration:12}),
            B.step('motion',{motion:'idle',duration:0})]};
        if (name === 'Sword Slash') {
            const swing=(x,z,rotation,duration,easing='linear')=>B.step('weapon',{mode:'move',x,y:0,z,rotation,duration,easing});
            return {id,version:1,name,note:'Walk to the target, raise the blade over the shoulder, sweep it down through the target, then walk home.',steps:[
                B.step('motion',{motion:'walk',duration:0}),
                B.step('move',{anchor:'approach',x:-.3,duration:12,easing:'linear',face:'movement'}),
                B.step('motion',{motion:'idle',duration:0}),
                B.step('weapon',{mode:'show',iconSource:'weapon',attachment:'rightHand',x:.7,y:0,z:.35,rotation:160,gripY:0,duration:0}),
                B.step('wait',{duration:30}),
                swing(.2,1.65,70,3),swing(-.2,.7,-30,3),
                B.step('animation',{animationSource:'action',role:'allTargets',animationId:0,duration:0}),
                B.step('impact',{role:'allTargets'}),
                B.step('wait',{duration:4}),
                B.step('weapon',{visible:false,duration:0}),
                B.step('motion',{motion:'walk',duration:0}),
                B.step('move',{duration:24,easing:'linear',face:'movement'}),
                B.step('motion',{motion:'idle',duration:0}),
                B.step('move',{duration:0,face:'home'})]};
        }
        if (name === 'Railgun Shot') {
            // A gun does not charge the target: one step forward, draw low,
            // raise to aim, fire, lower, holster, step back.
            const aim=(rotation,duration)=>B.step('weapon',{mode:'move',x:0,y:0,z:0,rotation,duration,easing:'smooth'});
            return {id,version:1,name,note:'Step forward, draw the gun low, raise it to aim over six frames, fire at the target, lower and holster it, then step back.',steps:[
                B.step('motion',{motion:'walk',duration:0}),
                B.step('move',{anchor:'home',x:1,duration:8,easing:'smooth',face:'target'}),
                B.step('motion',{motion:'missile',duration:0}),
                B.step('weapon',{mode:'show',iconSource:'weapon',attachment:'rightHand',x:0,y:0,z:0,rotation:-30,duration:0}),
                aim(0,6),
                B.step('wait',{duration:4}),
                B.step('projectile',{iconSource:'color',color:'#9fe0ff',size:6,destination:'allTargets',attachment:'rightHand',arc:0,spin:0,duration:8}),
                B.step('animation',{animationSource:'action',role:'allTargets',animationId:0,duration:0}),
                B.step('impact',{role:'allTargets'}),
                B.step('wait',{duration:16}),
                aim(-30,6),
                B.step('weapon',{visible:false,duration:0}),
                B.step('motion',{motion:'walk',duration:0}),
                B.step('move',{duration:8,easing:'smooth',face:'movement'}),
                B.step('motion',{motion:'idle',duration:0}),
                B.step('move',{duration:0,face:'home'})]};
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
    // The most steps of a kind that can run together: alternatives of an If count once, by their fullest branch.
    B.mostAlong = (steps, match) => {
        const stack=[];let current=0;
        for(const step of steps||[]){
            if(!step)continue;
            if(step.type==='branch'){stack.push({base:current,best:current});continue;}
            if((step.type==='elseIf'||step.type==='else')&&stack.length){const f=stack.at(-1);f.best=Math.max(f.best,current);current=f.base;continue;}
            if(step.type==='end'&&stack.length){const f=stack.pop();current=Math.max(f.best,current);continue;}
            if(match(step))current++;
        }
        while(stack.length){const f=stack.pop();current=Math.max(f.best,current);}
        return current;
    };
    B.validateSequence = sequence => {
        const errors = [];
        if (!sequence || sequence.version !== 1 || !Array.isArray(sequence.steps)) return ['Unsupported action sequence format.'];
        if (sequence.steps.length > (sequence.expanded?4096:256)) errors.push('A sequence can contain at most 256 steps.');
        const purpose = B.purpose(sequence);
        if (!B.purposes.some(([id])=>id===purpose)) errors.push('Choose a valid sequence purpose.');
        let impacts = 0, duration = 0;
        const ids = new Set();
        for (const step of sequence.steps) {
            if (!step || !B.types.includes(step.type)) { errors.push('Unknown step type.'); continue; }
            if (!step.id || ids.has(step.id)) errors.push('Every step needs a unique ID.');
            ids.add(step.id);
            if (!Number.isInteger(step.duration) || step.duration < 0 || step.duration > 3600) errors.push('Step duration must be 0–3600 frames.');
            duration += step.duration || 0;
            if (step.type === 'impact') impacts++;
            // A battler state or reaction moves, poses and decorates the battler it plays on, and nothing else: no damage, no other battlers, no camera.
            if (purpose === 'motion' && (['impact','action','target','clearTargets','formula','element','kill','camera','projectile','weapon'].includes(step.type) || !['user','subject'].includes(step.role) || step.type === 'move' && step.anchor !== 'home')) errors.push('Battler state sequences may affect only the user and cannot apply damage or move the camera.');
            if(step.type==='animation'&&(!Number.isInteger(step.animationId??0)||(step.animationId??0)<0))errors.push('Choose a valid animation.');
            if(step.waitForCompletion!==undefined&&typeof step.waitForCompletion!=='boolean')errors.push('Wait for completion must be enabled or disabled.');
            if(step.concurrent!==undefined&&typeof step.concurrent!=='boolean')errors.push('Concurrent must be enabled or disabled.');
            if(step.animationTransform!==undefined){const t=step.animationTransform;if(!t||typeof t!=='object'||Array.isArray(t)||Object.entries(t).some(([k,v])=>!['x','y','z','scale'].includes(k)||!Number.isFinite(v)||(k==='scale'?(v<.01||v>100):Math.abs(v)>1000)))errors.push('Choose finite animation offsets and a scale between 0.01 and 100.');}
            if(step.type==='sound'&&step.audio){const a=step.audio;if(typeof a.name!=='string'||[['volume',0,100],['pitch',50,150],['pan',-100,100]].some(([k,min,max])=>!Number.isFinite(a[k])||a[k]<min||a[k]>max))errors.push('Sound requires volume 0–100, pitch 50–150 and pan −100–100.');}
            if(['weapon','projectile'].includes(step.type)&&['gripX','gripY'].some(k=>step[k]!==undefined&&(step[k]<0||step[k]>1)))errors.push('Grip coordinates must be between 0 and 1.');
            if(step.type==='projectile'&&step.iconSource==='picture'&&!step.name)errors.push('No file selected');
            if(step.type==='projectile'&&step.iconSource==='model'&&!step.model?.name)errors.push('Choose a 3D model for the projectile.');
            if(step.type==='projectile'&&step.iconSource==='animation'&&!(step.animationId>0))errors.push('Choose an animation for the projectile.');
            if(step.type==='projectile'&&(!/^#[0-9a-f]{6}$/i.test(step.color||'#ffcc55')||!Number.isFinite(step.size??8)||(step.size??8)<1||(step.size??8)>512))errors.push('Choose a projectile color and size between 1 and 512.');
            if (!B.roles.includes(step.role)) errors.push('Unknown battler role.');
            if (step.type === 'motion' && step.parts !== undefined && (!Array.isArray(step.parts) || step.parts.some(entry => !entry || typeof entry.part !== 'string' || !entry.part))) errors.push('Pose parts must name a model part.');
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
        // Hits are counted along one path: an If with a hit in each branch lands once.
        impacts = B.mostAlong(sequence.steps, s => s.type === 'impact');
        const phased = purpose === 'action' && B.isPhased(sequence), provides = phased ? B.sequencePhases(sequence) : [];
        if (phased) {
            // A partial action needs no impact of its own (an Execute without
            // one gets the built-in hit after its last step); with one, it
            // lands exactly once unless the hits are authored.
            if (sequence.hitPolicy !== 'authored' && impacts > 1) errors.push('Include exactly one Apply Action Effect step; skill repeats determine the number of hits.');
        } else {
            if (purpose === 'action' && sequence.hitPolicy !== 'authored' && impacts !== 1 && !sequence.steps.some(s=>s.type==='action')) errors.push('Include exactly one Apply Action Effect step; skill repeats determine the number of hits.');
            if (purpose === 'execute' && sequence.hitPolicy !== 'authored' && impacts > 1) errors.push('Include exactly one Apply Action Effect step; skill repeats determine the number of hits.');
            if (!['action','execute','routine'].includes(purpose) && impacts) errors.push('Apply Action Effect belongs in a Complete Action or Execute phase.');
        }
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
    // Each cue runs from its start for its duration. A blocking step (the
    // default) holds the next step until it ends; a concurrent step lets the
    // next one begin on the same frame, so a jump can ride a move and a
    // second battler can act at once. A move with a speed takes as long as
    // its distance needs, which the context (home and target positions)
    // decides; without a context its duration stands in.
    B.stepAdvance = (step, duration = number(step.duration)) => step.concurrent ? 0 : Math.max(0, duration);
    B.timeline = (sequence, context) => {
        let frame = 0;
        const poses = context?.homes ? copy(context.homes) : null, target = context?.target || poses?.target || { x: 0, y: 0, z: 0 }, busy = {}, active = {};
        const travelling = ['move'], lifting = ['jump','leap','float','fall'];
        const cues = (sequence.steps || []).map(step => {
            let duration = Math.max(0, number(step.duration));
            const key = B.roleKey(step);
            const cue = { step };
            if (step.type === 'move' && poses) {
                // A move that starts while an earlier move of the same battler is still travelling cuts it there and sets off from that spot.
                const earlier = active[key], home = context.homes[key] || context.homes.user;
                let from = poses[key] || poses.user;
                if (earlier && frame < earlier.end) { const t = earlier.end > earlier.start ? (frame - earlier.start) / (earlier.end - earlier.start) : 1; from = { ...from, x: earlier.from.x + (earlier.goal.x - earlier.from.x) * t, y: earlier.from.y + (earlier.goal.y - earlier.from.y) * t, z: (earlier.from.z || 0) + ((earlier.goal.z || 0) - (earlier.from.z || 0)) * t }; earlier.cue.cut = frame; }
                if (from && home) {
                    const goal = B.moveGoal(step, from, home, target, context.homes, context.direction || 1);
                    if (number(step.speed) > 0) duration = Math.max(1, Math.round(number(step.speed) * Math.hypot(goal.x - from.x, goal.y - from.y)));
                    poses[key] = { ...from, ...goal };
                    active[key] = { start: frame, end: frame + duration, from, goal, cue };
                }
            }
            // A wait for a move or a jump lasts until the battler's travel or lift already under way has ended.
            if (step.type === 'wait' && (step.waitFor === 'move' || step.waitFor === 'jump')) {
                const keys = key === 'allTargets' ? Object.keys(busy).filter(k => k.startsWith('target')) : [key];
                const until = Math.max(0, ...keys.map(k => busy[k]?.[step.waitFor] || 0));
                duration = Math.max(duration, until - frame);
            }
            const start = frame, end = start + duration, advance = B.stepAdvance(step, duration);
            Object.assign(cue, { start, end, advance });
            if (travelling.includes(step.type) || lifting.includes(step.type)) {
                const kind = travelling.includes(step.type) ? 'move' : 'jump';
                for (const k of key === 'allTargets' ? Object.keys(context?.homes || { target: 1 }).filter(k => k.startsWith('target')) : [key]) (busy[k] ||= {})[kind] = Math.max(busy[k]?.[kind] || 0, end);
            }
            frame += advance;
            return cue;
        });
        const total = Math.max(frame, ...cues.map(cue => cue.cut ?? cue.end));
        return cues.map(cue => Object.assign(cue, { total }));
    };
    B.duration = (sequence, context) => { const cues = B.timeline(sequence, context); return cues.length ? cues[0].total : 0; };
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
            execute:[B.step('motion',{motion,duration:18}),...B.builtinHit(context)],
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
            // A whole sequence at the top of the chain must be a usable action;
            // one that is not stops the lookup, as it always has.
            const sequence=sequences?.[first.binding.sequenceId];
            if(!sequence||B.purpose(sequence)!=='action'||B.validateSequence(sequence).length)return {mode:'sequence',source:first,sequence:null,missing:true};
        }
        // Each phase comes from the first record down the chain whose
        // sequence provides it: a whole sequence for the phases it marks, an
        // older per-phase assignment for the phase it names, else the built-in
        // default. A record that stops at the engine ends the search there.
        const phases=B.actionPhases.map(([phase])=>{
            for(const choice of choices){
                const b=choice.binding;if(!b.mode||b.mode==='inherit')continue;
                if(b.mode==='existing')break;
                if(b.mode==='sequence'){
                    const sequence=sequences?.[b.sequenceId];
                    if(sequence&&B.purpose(sequence)==='action'&&B.sequencePhases(sequence).includes(phase))return {phase,source:choice,sequence,steps:B.phaseSteps(sequence,phase),missing:!!B.validateSequence(sequence).length};
                }else if(b.mode==='phases'){
                    const pb=b.phases?.[phase];if(!pb?.mode||pb.mode==='inherit')continue;
                    if(pb.mode==='sequence'){const sequence=sequences?.[pb.sequenceId];const valid=sequence&&B.purpose(sequence)===phase&&!B.validateSequence(sequence).length;return {phase,source:choice,sequence:valid?sequence:null,steps:valid?sequence.steps:[],missing:!valid};}
                    const fallback=B.defaultPhase(phase,context);return {phase,source:choice,sequence:fallback,steps:fallback.steps,missing:false};
                }
            }
            const fallback=B.defaultPhase(phase,context);return {phase,source:null,sequence:fallback,steps:fallback.steps,missing:false};
        });
        const mode=first.binding.mode==='sequence'?'sequence':'phases';
        if(phases.some(p=>p.missing))return {mode,source:first,phases,sequence:null,missing:true};
        // A sequence that lands the blow itself, with nothing but built-in
        // fillers around it, is the whole action as authored: hand it back.
        if(mode==='sequence'){const whole=sequences?.[first.binding.sequenceId],own=B.sequencePhases(whole);if(own.includes('execute')&&whole.steps.some(s=>s.type==='impact'||s.type==='action')&&phases.every(p=>p.sequence===whole||!p.source))return {mode,source:first,phases,sequence:whole};}
        // Phases from the same sequence play in that sequence's own order, so
        // an impact authored mid-swing still lands mid-swing.
        const steps=[],push=(step,phase)=>steps.push({...copy(step),id:'phase-'+steps.length,phase});
        for(let i=0;i<phases.length;i++){
            const entry=phases[i];
            // Coalesce the run of following phases this same sequence provides.
            const run=[entry];while(i+1<phases.length&&phases[i+1].sequence===entry.sequence&&entry.sequence?.id!==0)run.push(phases[++i]);
            const wanted=new Set(run.map(r=>r.phase));
            if(run.length>1)for(const step of entry.sequence.steps){const phase=B.stepPhase(step);if(wanted.has(phase))push(step,phase);}
            else for(const step of entry.steps)push(step,entry.phase);
        }
        // An Execute that lands no hit of its own gets the built-in one after its last step, before the return.
        if(!steps.some(s=>s.type==='impact'||s.type==='action')){
            let at=steps.map(s=>s.phase).lastIndexOf('execute');
            if(at>=0)at+=1;else{at=steps.findIndex(s=>['return','finish'].includes(s.phase));if(at<0)at=steps.length;}
            steps.splice(at,0,...B.builtinHit(context).map((step,k)=>({...step,id:'phase-hit-'+k,phase:'execute'})));
        }
        const hitSource=phases.find(p=>p.phase==='execute').sequence;
        const sequence={id:0,version:1,name:'Resolved Action Phases',hitPolicy:hitSource?.hitPolicy||'once',steps};
        return {mode,source:first,phases,sequence:B.validateSequence(sequence).length?null:sequence};
    };
    B.resolve = (settings,sequences,context) => B.resolvePresentation(settings,sequences,context).sequence;
    B.references = (settings, id, sequences=[]) => {
        const result = [];
        for(const [stateId,value] of Object.entries(settings?.states||{}))if(value?.reaction?.mode==='sequence'&&value.reaction.sequenceId===id)result.push({kind:'states',id:Number(stateId),slot:'reaction'});
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
    // The yaw a Face Direction step turns its battler to: a fixed way, about
    // face, or toward the targets, the home spot or a screen position.
    B.directionYaw = (step,pose,target,home) => {
        const current=pose.facing??-90;
        switch(step.direction){
            case 'right':return 90;case 'left':return -90;case 'up':return 180;case 'down':return 0;
            case 'behind':return ((current+180)%360+360)%360-180;
            case 'home':return home&&(home.x!==pose.x||home.y!==pose.y)?B.facingToward(pose,home):current;
            case 'position':return Math.sign(number(step.position)-pose.x*48)>=0?90:-90;
            default:return target&&(target.x!==pose.x||target.y!==pose.y)?B.facingToward(pose,target):current;
        }
    };
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
    // Where a move ends: an anchor (home, the target, or short of the target
    // along the approach), a screen position, or a step forward or backward
    // along the battler's facing. Facing is a yaw: a battler facing up or
    // down steps along y, one facing left or right along x, and the step's
    // second value is the sideways offset either way.
    B.moveGoal = (step, from, home, target, homes, direction = 1) => {
        const anchor = ['target','approach'].includes(step.anchor) ? target : home;
        let dx=number(step.x)*direction,dy=number(step.y);
        if(step.anchor==='approach') {
            const start=homes.user||home,vx=target.x-start.x,vy=target.y-start.y,length=Math.hypot(vx,vy);
            const ux=length>1e-6?vx/length:direction,uy=length>1e-6?vy/length:0;
            dx=number(step.x)*ux-number(step.y)*uy;dy=number(step.x)*uy+number(step.y)*ux;
        }
        let goal={x:anchor.x+dx,y:anchor.y+dy,z:(anchor.z||0)+number(step.z)};
        if(step.moveMode==='position')goal={x:number(step.x),y:number(step.y),z:number(step.z)};
        if(['forward','backward'].includes(step.moveMode)){
            const sign=step.moveMode==='backward'?-1:1,yaw=from.facing??(direction>0?90:-90),rad=yaw*Math.PI/180,sx=Math.sin(rad),sy=Math.cos(rad);
            goal=Math.abs(sx)>=Math.abs(sy)?{x:from.x+number(step.x)*sign*Math.sign(sx||direction),y:from.y+number(step.y),z:(from.z||0)+number(step.z)}
                :{x:from.x+number(step.y),y:from.y+number(step.x)*sign*Math.sign(sy),z:(from.z||0)+number(step.z)};
        }
        return goal;
    };
    B.evaluate = (sequence, frame, context) => {
        const homes = context.homes, defaultTarget = context.target || homes.target || { x: 0, y: 0, z: 0 };
        const result = copy(homes);
        for (const { step, start, end: fullEnd, cut } of (sequence._timeline||B.timeline(sequence, context))) {
            if (start > frame) break;
            // A move cut short by a later move of the same battler holds where that move took over.
            const end = fullEnd, clock = cut !== undefined ? Math.min(frame, cut) : frame;
            const target=step._target||defaultTarget;
            if (!['move','camera','motion','direction'].includes(step.type)) continue;
            const role = step.type === 'camera' ? 'camera' : B.roleKey(step);
            const roles = step._roles || (role === 'allTargets' ? Object.keys(homes).filter(k => k.startsWith('target') && (k!=='target'||!homes.target0)) : [role]);
            for (const key of roles) {
                const home = homes[key]; if (!home) continue;
                const from = result[key];
                if(step.type==='direction'){
                    // A turn is part of the pose, so the row a character sheet shows and the way a later step forward goes both follow it.
                    result[key].facing=B.directionYaw(step,from,key==='user'?target:(homes.user||target),home);
                    if(key==='target'&&result.target0)result.target0=copy(result.target);
                    if(key==='target0'&&result.target)result.target=copy(result.target0);
                    continue;
                }
                if(step.type==='motion') {
                    if(step.transform||from.transform){
                        const a=B.transform(from.transform),b=B.transform(step.transform),t=end===start?1:Math.max(0,Math.min(1,(frame-start)/(end-start)));
                        result[key].transform=Object.fromEntries(B.transformKeys.map(k=>[k,a[k]+(b[k]-a[k])*t]));
                    }
                    if(key==='target'&&result.target0)result.target0=copy(result.target);
                    if(key==='target0'&&result.target)result.target=copy(result.target0);
                    continue;
                }
                let t = end === start ? 1 : Math.max(0, Math.min(1, (clock - start) / (end - start)));
                if (step.easing === 'smooth') t = t * t * (3 - 2 * t);
                const goal = B.moveGoal(step, from, home, target, homes, context.direction || 1);
                // An arc lifts the battler along the move and sets it down at the end, a jump that rides the travel.
                const lift = step.type === 'move' && number(step.arc) && clock < end ? 4 * number(step.arc) * t * (1 - t) : 0;
                result[key] = { ...from, x: from.x + (goal.x - from.x) * t,
                    y: from.y + (goal.y - from.y) * t, z: from.z + (goal.z - from.z) * t + lift };
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
        for(const cue of B.timeline(sequence,context)){if(cue.start>frame)break;const step={...B.commandDefaults(cue.step.type),...cue.step},t=cue.end===cue.start?1:Math.min(1,(frame-cue.start)/(cue.end-cue.start));
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
                if(step.type==='direction')p.facing=B.directionYaw(step,p,poses.target||poses.user,poses.user);
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
            this.timeline = B.timeline(this.sequence, adapter?.context); this.duration = this.timeline.length ? this.timeline[0].total : 0; this.cursor = 0; this.waiting = null; this.executed=[]; this.branches=[];
        }
        update(delta = 1) {
            if (this.done) return;
            if (this.waiting) {
                // A blocking cue holds the steps after it, not the ones already
                // under way: the frames it holds for stretch the timeline behind
                // it, so a concurrent move keeps travelling through the wait
                // instead of freezing and snapping when the wait ends.
                if (this.waiting.isPlaying()) { this.held = (this.held || 0) + Math.max(0, delta); this.pose(this.frame + this.held); return; }
                const held = this.held || 0; this.held = 0; this.waiting = null;
                if (held) { for (let i = this.cursor; i < this.timeline.length; i++) { const c = this.timeline[i]; c.start += held; c.end += held; if (c.cut !== undefined) c.cut += held; } this.duration += held; this.frame += held; }
            }
            let frame = Math.min(this.duration, Math.max(0, this.frame) + Math.max(0, delta));
            while (this.cursor < this.timeline.length && this.timeline[this.cursor].start <= frame) {
                const cue = this.timeline[this.cursor++];
                const step=cue.step,active=this.branches.every(b=>b.active);
                if(step.type==='branch'){const matched=active&&!!this.adapter.condition?.(step.condition);this.branches.push({parent:active,active:matched,matched});}
                else if(step.type==='elseIf'||step.type==='else'){const b=this.branches.at(-1);b.active=b.parent&&!b.matched&&(step.type==='else'||!!this.adapter.condition?.(step.condition));b.matched||=b.active;}
                else if(step.type==='end')this.branches.pop();
                else if(active){this.executed.push(cue);
                    if(step.type==='wait'&&(step.waitFor==='move'||step.waitFor==='jump')){
                        // The wait lasts until the travel or lift already under way for that battler ends; only cues that actually ran count, so a skipped branch cannot stretch it.
                        const kinds=step.waitFor==='move'?['move']:['jump','leap','float','fall'],key=B.roleKey(step);
                        const until=Math.max(cue.start,...this.executed.filter(c=>c!==cue&&kinds.includes(c.step.type)&&(key==='allTargets'?B.roleKey(c.step).startsWith('target')||B.roleKey(c.step)==='allTargets':B.roleKey(c.step)===key)).map(c=>c.end));
                        const delta=until-cue.end;if(delta){cue.end=until;for(let i=this.cursor;i<this.timeline.length;i++){const c=this.timeline[i];c.start+=delta;c.end+=delta;if(c.cut!==undefined)c.cut+=delta;}this.duration+=delta;}
                    }
                }
                if(!active||['branch','elseIf','else','end'].includes(step.type)){
                    const removed=cue.advance??(cue.end-cue.start);for(let i=this.cursor;i<this.timeline.length;i++){const c=this.timeline[i];c.start-=removed;c.end-=removed;if(c.cut!==undefined)c.cut-=removed;}this.duration-=removed;frame=Math.min(frame,this.duration);continue;
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
