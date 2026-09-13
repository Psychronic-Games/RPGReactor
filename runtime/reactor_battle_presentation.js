/* Opt-in battle rooms and sequence playback, installed after project plugins. */
(function(root) {
    'use strict';
    const B=root.ReactorBattleData, P={settings:B.empty(),sequences:[null],state:'idle',warnings:new Set()};
    const modelBitmapUpdates={actors:root.Sprite_Actor?.prototype.updateBitmap,enemies:root.Sprite_Enemy?.prototype.updateBitmap};
    root.ReactorBattlePresentation=P;
    P.warn=message=>{if(!P.warnings.has(String(message))){P.warnings.add(String(message));console.warn('Battle presentation:',message);}};
    P.json=async function(file,optional=false){
        if(Utils.isNwjs()){
            const fs=require('fs'),path=require('path');const name=path.join(path.dirname(process.mainModule.filename),file);
            if(optional&&!fs.existsSync(name))return null;
            return RRJson.read(fs,name);
        }
        const response=await fetch(file);if(optional&&response.status===404)return null;
        if(!response.ok)throw Error('Could not load '+file);return RRJson.parse(await response.arrayBuffer());
    };
    P.load=function(){
        if(P.state!=='idle')return;P.state='loading';
        // A battle test reads the Test_ copies the editor wrote from its unsaved database, when it wrote them.
        const testing=typeof DataManager.isBattleTest==='function'&&DataManager.isBattleTest();
        const battleFile=async name=>testing?(await P.json('data/Test_'+name,true))??P.json('data/'+name,true):P.json('data/'+name,true);
        Promise.all([battleFile('ActionSequences.json'),battleFile('BattlePresentation.json'),P.json('data/.BattlePresentation.pending.json',true)]).then(([sequences,settings,journal])=>{
            if(journal){if(journal.version!==1||!Array.isArray(journal.files))throw Error('Battle data recovery is required.');for(const entry of journal.files){if(entry.file==='ActionSequences.json')sequences=entry.previous?JSON.parse(entry.previous):null;if(entry.file==='BattlePresentation.json')settings=entry.previous?JSON.parse(entry.previous):null;}}
            for(const sequence of sequences||[])if(sequence)B.migrateSequence(sequence);if(settings)B.migrateSettings(settings);
            B.validateStore(sequences||[null],settings||B.empty());P.sequences=sequences||[null];P.settings=settings||B.empty();
        }).catch(P.warn).finally(()=>P.state='ready');
    };
    const dataReady=DataManager.isDatabaseLoaded;
    DataManager.isDatabaseLoaded=function(){P.load();return dataReady.call(this)&&P.state==='ready';};
    P.assets={
        image(kind,name){return new Promise((resolve,reject)=>{
            const bitmap=kind==='tilesets'?ImageManager.loadTileset(name):ImageManager.loadParallax(name);
            const start=Date.now();const check=()=>{if(bitmap.isError())reject(Error('Missing '+kind+'/'+name));else if(bitmap.isReady())resolve(bitmap);else if(Date.now()-start>15000)reject(Error('Timed out loading '+name));else setTimeout(check,30);};check();
        });},
        async model(spec){return {template:await Reactor3D.loadModel(spec.name,spec.ext,spec.file,spec.texture),sidecar:await Reactor3D.loadModelSidecar(spec.name)};},
        get screenHeight(){return Graphics.height;},get tileSize(){return $dataSystem.tileSize||48;},
        animation:id=>$dataAnimations[id],effectUrl:name=>EffectManager.makeUrl(name),playSe:se=>AudioManager.playSe(se),
        lightIsOn:light=>Reactor3D.lightIsOn(light),
        mediaUrl(file){const media=root.RPGReactorMediaSurfaces,isImage=media?.isImageFile(file),folder=isImage?'img/pictures':'movies';
            if(Utils.isNwjs()){const fs=require('fs'),path=require('path');if(!fs.existsSync(path.join(path.dirname(process.mainModule.filename),folder,file)))return '';}
            return media?(isImage?media.pictureUrl(file):media.movieUrl(file)):folder+'/'+file.split('/').map(encodeURIComponent).join('/');},
        warn:P.warn
    };
    P.sequence=function(subject,action){
        const sequence=B.resolve(P.settings,P.sequences,{kind:DataManager.isSkill(action.item())?'skills':'items',itemId:action.item().id,
            isAttack:action.isAttack(),weaponIds:subject.weapons?.().map(w=>w.id)||[],
            classId:subject.isActor()?subject.currentClass?.()?.id:0,magical:action.isMagical?.(),animationId:action.item().animationId>0?action.item().animationId:subject.attackAnimationId1?.()||0,
            battlerKind:subject.isActor()?'actors':'enemies',battlerId:subject.isActor()?subject.actorId():subject.enemyId()});
        if(sequence?.steps.some(s=>(s.type==='animation'||s.type==='projectile'&&s.iconSource==='animation')&&s.animationId>0&&!$dataAnimations[s.animationId])){P.warn('A sequence animation is missing; existing action behavior is retained.');return null;}try{return sequence?B.expandCalls(sequence,P.sequences):null;}catch(error){P.warn(error);return null;}
    };
    // Whether a battler is drawn from a character sheet (rows per facing) rather than a side-view sheet (mirrored to turn).
    P.usesSheet=sprite=>P.graphicFor?.(sprite?._battler||sprite?._actor||sprite?._enemy)?.type==='character';
    // The way a battler faces, as a yaw: the pose of a running sequence, the
    // last Face Direction it was given, else toward its opponents in flat
    // battles (a party along the bottom looks up) or its side for sprite sheets.
    P.spriteYaw=(sprite,target)=>{
        if(sprite._reactorRoomPosition?.facing!==undefined)return sprite._reactorRoomPosition.facing;
        if(sprite._rrSequenceFacing!==undefined)return sprite._rrSequenceFacing;
        if(sprite._rrFacingYaw!==undefined)return sprite._rrFacingYaw;
        const battler=sprite._battler||sprite._actor||sprite._enemy;
        if(P.usesSheet(sprite)){
            const ss=SceneManager._scene?._spriteset,others=(target?[target]:battler?.opponentsUnit?.().aliveMembers?.()||[]).map(b=>ss?.findTargetSprite?.(b)).filter(Boolean);
            if(others.length){const cx=others.reduce((a,s)=>a+s.x,0)/others.length,cy=others.reduce((a,s)=>a+s.y,0)/others.length;if(Math.abs(cx-sprite.x)>1e-3||Math.abs(cy-sprite.y)>1e-3)return B.facingToward({x:sprite.x,y:sprite.y},{x:cx,y:cy});}
        }
        if(sprite._rrFacing)return sprite._rrFacing*90;
        const ss=SceneManager._scene?._spriteset,dest=target&&ss?.findTargetSprite?.(target);
        return (dest?Math.sign(dest.x-sprite.x)||-1:(battler?.isActor?.()?-1:1))*90;
    };
    // Victor Battle Motions vocabulary that imported sequences lean on: an
    // action steps forward instead of walking up when it is friendly, self,
    // magical, or a ranged weapon attack (attack motion type missile).
    P.installActionRules=function(){
        if(!root.Game_Action||!root.Game_Battler)return;
        if(!Game_Battler.prototype.isRangedWeapon)Game_Battler.prototype.isRangedWeapon=function(){const weapon=this.weapons?.()?.[0],motion=weapon&&$dataSystem.attackMotions?.[weapon.wtypeId];return !!motion&&motion.type===2;};
        if(!Game_Action.prototype.isRanged)Game_Action.prototype.isRanged=function(){return (this.isPhysical()||this.isAttack())&&!!this.subject()?.isRangedWeapon?.();};
        if(!Game_Action.prototype.isStepForward)Game_Action.prototype.isStepForward=function(){return this.isForFriend()||this.isForUser()||this.isMagical()||this.isRanged();};
        // Victor Dual Wield asked this before a second swing; without that plugin there is never one.
        if(root.BattleManager&&!BattleManager.isSecondAttack)BattleManager.isSecondAttack=function(){return false;};
    };
    P.compatibility=function(){
        const names=(PluginManager._scripts||[]).join(' ');
        const unsupported=names.match(/VE_BattleMotions|YEP_BattleEngineCore|VisuMZ_1_BattleCore/i)||(root.Lecode?.S_TBS?.commandOn?['LeTBS']:null);
        return unsupported ? 'The active '+unsupported[0]+' battle engine needs a presentation adapter. Existing behavior is retained.' : '';
    };
    P.adapter=function(manager,subject,targets,stateOnly=false){
        const ss=manager._spriteset,room=ss?._reactorRoom;
        const visibleTargets=[...new Set(targets)],roles={user:ss?.findTargetSprite(subject)};
        visibleTargets.forEach((target,i)=>roles['target'+i]=ss?.findTargetSprite(target));
        roles.target=roles.target0;
        const homes={},saved=new Map();
        for(const [key,sprite] of Object.entries(roles))if(sprite){
            if(!saved.has(sprite))saved.set(sprite,{x:sprite.x,y:sprite.y,offsetX:sprite._offsetX,offsetY:sprite._offsetY,rotation:sprite.rotation,scaleX:sprite.scale?.x??1,scaleY:sprite.scale?.y??1,model:sprite._reactorBattler?.object,modelRotation:sprite._reactorBattler?.object?.rotation.clone(),modelScale:sprite._reactorBattler?.object?.scale.clone()});
            homes[key]=Object.assign({rotateX:0,rotateY:0,rotateZ:0,scale:1},room?{...sprite._reactorRoomPosition}:{x:sprite.x/48,y:sprite.y/48,z:0,facing:P.spriteYaw(sprite,targets[0]===sprite._battler?subject:targets[0])});
        }
        const camera=room?{...room.settings.camera}:null,cameraSource=room?.settings.cameraSource;
        homes.camera=room?{x:camera.x,y:camera.y,z:camera.z}: {x:0,y:0,z:0};
        // Where each battler's posed parts stand, so a pose step starts from
        // the last one and the motion after a pose brings the parts home.
        const media=[],poseState=new Map();
        const adapter={context:{homes,target:homes.target,direction:homes.target&&homes.user&&homes.target.x<homes.user.x?-1:1},
            cue(step,start){
                const chosen=step._chosen|| (step.role==='allTargets'?visibleTargets:step.role==='target'?[visibleTargets[step.targetIndex??0]]:[subject]);
                if(step.type==='impact'){
                    // Drain the original occurrence list exactly once, preserving repeats.
                    adapter.pendingImpact=true;adapter.resolveNext();
                }else if(step.type==='camera'&&room){Object.assign(room.settings.camera,room.cameraState());room.settings.cameraSource='custom';}
                else if(step.type==='sound'&&step.audio?.name){
                    const before=new Set(AudioManager._seBuffers||[]);AudioManager.playSe(step.audio);
                    const buffers=(AudioManager._seBuffers||[]).filter(b=>!before.has(b)),created=Date.now();
                    const ticket={isPlaying:()=>buffers.some(b=>!b.isError?.()&&(b.isReady?.()===false?Date.now()-created<15000:b.isPlaying())),cancel:()=>buffers.forEach(b=>b.stop())};
                    media.push(ticket);return ticket;
                }
                else if(step.type==='animation'&&step.animationId>0){
                    const tickets=[],flat=[];
                    for(const battler of chosen.filter(Boolean)){const ticket=room?.playAnimation(ss.findTargetSprite(battler)?._reactorRoomKey,step.animationId,step.animationTransform);if(ticket)tickets.push(ticket);else flat.push(battler);}
                    if(flat.length){
                        const before=new Set($gameTemp._animationQueue||[]);$gameTemp.requestAnimation(flat,step.animationId);
                        for(const request of ($gameTemp._animationQueue||[]).filter(r=>!before.has(r))){
                            const created=Date.now(),ticket={pending:true,sprites:[],transform:{...step.animationTransform},room,
                                isPlaying(){return this.pending?Date.now()-created<15000:this.sprites.some(s=>s.isPlaying());},
                                cancel(){this.pending=false;const i=$gameTemp._animationQueue.indexOf(request);if(i>=0){$gameTemp._animationQueue.splice(i,1);for(const b of request.targets)b.endAnimation?.();}for(const sprite of this.sprites)if(ss._animationSprites?.includes(sprite))ss.removeAnimation(sprite);}};
                            request._reactorSequenceMedia=ticket;tickets.push(ticket);
                        }
                    }
                    const ticket={isPlaying:()=>tickets.some(t=>t.isPlaying()),cancel:()=>tickets.forEach(t=>t.cancel?.())};media.push(ticket);return ticket;
                }
                else if(step.type==='motion')for(const battler of chosen.filter(Boolean)){
                    // A part pose is played by rules made for this step from
                    // where the battler's parts stand now; sheet battlers wait.
                    const sheetMotion=B.spriteMotionName(step),releasing=!B.hasPose(step)&&Object.keys(poseState.get(battler)||{}).length>0,actionName=releasing?'pose:'+step.id:B.motionActionName(step);
                    const sprite=ss.findTargetSprite(battler);sprite?.startMotion?.(sheetMotion==='idle'?'wait':['attack','punch'].includes(sheetMotion)?'thrust':sheetMotion==='run'?'walk':sheetMotion==='cast'?'spell':sheetMotion);if(sprite&&P.graphicFor(battler)){P.requestGraphicMotion(sprite,sheetMotion);if(step.motion==='attack'&&P.graphicFor(battler).showWeapon!==false)battler.performAttack?.();}
                    const posed=B.hasPose(step)?B.partPoseRules(step,poseState.get(battler)||{}):releasing?B.releasePoseRules(step,poseState.get(battler)||{}):null;if(posed)poseState.set(battler,posed.next);
                    const join=rules=>{if(!posed||!Array.isArray(rules))return;const kept=rules.filter(r=>r.name!==actionName);kept.push(...posed.rules);
                        // A release still plays the motion it names, under the release's own action.
                        if(releasing)kept.push(...B.releaseMotionRules({releases:{[step.id]:step.motion||'idle'},actions:{[step.id]:actionName}},step.id,rules));
                        rules.length=0;rules.push(...kept);};
                    const state=sprite?._reactorBattler;if(state){root.ReactorBattleRoomView.prepareMotions(state);join(state.rules);const rule=state.rules?.find(r=>r.trigger==='action'&&r.name.toLowerCase()===actionName?.toLowerCase());state.action=actionName==='idle'?null:{name:rule?.name||actionName,frame:state.frame};if(actionName==='idle'&&state.binding)state.binding.movingAt=undefined;}
                    const model=room?.models.get(sprite?._reactorRoomKey);if(model){join(model.rules);model.action=actionName==='idle'?null:{name:actionName,start:room.frame};if(actionName==='idle'&&model.binding)model.binding.movingAt=undefined;}
                }else if(step.type==='weapon'){
                    adapter.clearWeapon();if(step.visible===false)return;
                    const item=step.iconSource==='action'?manager._action.item():subject.weapons?.()[0];const icon=step.iconSource==='icon'?step.iconIndex||0:item?.iconIndex||0;
                    const graphic=new Sprite(ImageManager.loadSystem('IconSet')),size=ImageManager.iconWidth||32;graphic.setFrame(icon%16*size,Math.floor(icon/16)*size,size,size);graphic.anchor.set(.5,.5);ss._battleField.addChild(graphic);adapter.weapon={graphic,step};
                }else if(step.type==='projectile'){
                    adapter.clearProjectile();
                    const graphic=new Sprite(new Bitmap(step.size||8,step.size||8));graphic.bitmap.fillAll(step.color||'#ffcc55');graphic.anchor.set(.5,.5);
                    ss._battleField.addChild(graphic);adapter.projectile={graphic,start,duration:step.duration};
                }
            },
            pose(positions,frame){
                const posed=new Set();
                for(const [key,logical] of Object.entries(positions)){
                    const p=B.visualPose(logical);
                    if(key==='camera'){if(!stateOnly&&room)Object.assign(room.settings.camera,p);continue;}
                    const sprite=roles[key];if(!sprite||posed.has(sprite))continue;posed.add(sprite);sprite._rrSequenceFacing=p.facing;
                    if(room)sprite._reactorRoomPosition={...sprite._reactorRoomPosition,...p};
                    else{sprite._offsetX=p.x*48-sprite._homeX;sprite._offsetY=(p.y-p.z)*48-sprite._homeY;sprite.x=p.x*48;sprite.y=(p.y-p.z)*48;const old=saved.get(sprite);sprite.rotation=(old.rotation||0)+(old.model?0:(p.rotateZ||0)*Math.PI/180);if(old.model){old.model.rotation.set(old.modelRotation.x+(p.rotateX||0)*Math.PI/180,old.modelRotation.y+(p.rotateY||0)*Math.PI/180,old.modelRotation.z+(p.rotateZ||0)*Math.PI/180);old.model.scale.set(old.modelScale.x*(p.scaleX??1),old.modelScale.y*(p.scaleY??1),old.modelScale.z*(p.scaleZ??1));}const initialFacing=B.facingToward(homes[key],(key==='user'?homes.target:homes.user)||homes[key]),turn=!P.usesSheet(sprite)&&p.facing!==undefined&&Math.sign(p.facing)!==Math.sign(initialFacing)?-1:1;sprite.scale?.set(old.scaleX*turn*(p.scale??1)*(old.model?1:(p.scaleX??1)),old.scaleY*(p.scale??1)*(old.model?1:(p.scaleY??1)));}
                }
                const projectile=adapter.projectile;
                if(projectile){const a=roles.user,b=roles.target;if(a&&b){const t=Math.min(1,Math.max(0,(frame-projectile.start)/Math.max(1,projectile.duration)));projectile.graphic.x=a.x+(b.x-a.x)*t;projectile.graphic.y=a.y+(b.y-a.y)*t-48;projectile.graphic.visible=t<1;
                    if(room){const pa=a._reactorRoomPosition,pb=b._reactorRoomPosition;room.billboard('extra:projectile',projectile.graphic.bitmap.canvas,{x:0,y:0,width:projectile.graphic.bitmap.width,height:projectile.graphic.bitmap.height},{x:pa.x+(pb.x-pa.x)*t,y:pa.y+(pb.y-pa.y)*t,z:1},projectile.graphic.bitmap.height/48);const record=room.billboards.get('extra:projectile');if(record)record.object.visible=t<1;projectile.graphic.visible=false;}
                }}
                const weapon=adapter.weapon;if(weapon){const s=weapon.step,p=roles.user;weapon.graphic.x=p.x+(s.x??.5)*48;weapon.graphic.y=p.y-(s.z??1)*48+(s.y||0)*48;weapon.graphic.rotation=(s.rotation||0)*Math.PI/180;weapon.graphic.scale.set(s.scale||1);
                    if(room&&weapon.graphic.bitmap.isReady()){const home=p._reactorRoomPosition;room.billboard('extra:weapon',weapon.graphic.bitmap.canvas,weapon.graphic._frame,{x:home.x+(s.x??.5),y:home.y+(s.y||0),z:(home.z||0)+(s.z??1),rotateZ:s.rotation||0,scale:s.scale||1},.7);weapon.graphic.visible=false;}
                }
            },
            resolveNext(){if(manager._targets.length)manager.invokeAction(subject,manager._targets.shift());adapter.pendingImpact=manager._targets.length>0;},
            clearWeapon(){room?.remove('extra:weapon');const g=adapter.weapon?.graphic;if(g){g.removeFromParent();g.destroy();}adapter.weapon=null;},
            clearProjectile(){room?.remove('extra:projectile');const g=adapter.projectile?.graphic;if(g){g.removeFromParent();g.bitmap.destroy();g.destroy();}adapter.projectile=null;},
            cleanup(cancelled){
                if(cancelled)for(const ticket of media)ticket.cancel?.();
                if(!stateOnly)room?.endCinematicAction?.();
                for(const [sprite,old] of saved){if(old.model){old.model.rotation.copy(old.modelRotation);old.model.scale.copy(old.modelScale);}delete sprite._rrSequenceFacing;sprite.rotation=old.rotation;sprite.scale?.set(old.scaleX,old.scaleY);Object.assign(sprite,{x:old.x,y:old.y,_offsetX:old.offsetX,_offsetY:old.offsetY});if(room){const role=Object.keys(roles).find(k=>roles[k]===sprite);sprite._reactorRoomPosition={...homes[role]};}}
                if(!stateOnly&&room&&camera){Object.assign(room.settings.camera,camera);room.settings.cameraSource=cameraSource;}
                adapter.clearProjectile();adapter.clearWeapon();
                for(const sprite of saved.keys()){sprite.refreshMotion?.();if(sprite._reactorBattler){sprite._reactorBattler.action=null;const binding=sprite._reactorBattler.binding;if(binding){binding.latch={};binding.angles={};}}const model=room?.models.get(sprite._reactorRoomKey);if(model){model.action=null;if(model.binding){model.binding.latch={};model.binding.angles={};}}}
            }
        };adapter.owns=sprite=>saved.has(sprite);return P.extendAdapter(adapter,{manager,subject,targets,ss,room,roles,homes,saved,stateOnly});
    };
    P.sequenceVisuals=function({ss,room,subject,manager,targets}){
        const prefix='extra:sequence:'+(P._visualSerial=(P._visualSerial||0)+1)+':',held=new Map(),flights=[];let serial=0,time=0,closed=false;
        const point=(sprite,step,height)=>{
            if(!sprite)return null;
            const p=room?{...sprite._reactorRoomPosition}:{x:sprite.x/48,y:sprite.y/48,z:0,facing:P.spriteYaw(sprite,targets[0])};
            if(room)return room.attachmentPoint(sprite._reactorRoomKey,{...step,z:step.attachment&&step.attachment!=='offset'?(step.z||0):height??step.z},p);
            const main=sprite._mainSprite||sprite,model=sprite._reactorBattler,world=root.ReactorBattleRoomView?.attachmentWorld(model,step.attachment,step.bone);
            if(world&&model.camera){
                const projected=world.project(model.camera),size=model.size||main._frame?.width||48;
                const local={x:(projected.x+1)*size/2-(main.anchor?.x??.5)*size,y:(1-projected.y)*size/2-(main.anchor?.y??1)*size};
                if(main.toGlobal&&ss._battleField.toLocal){const screen=ss._battleField.toLocal(main.toGlobal(local));return {x:screen.x/48+(step.x||0)*Math.sign(p.facing||1),y:screen.y/48+(step.y||0),z:step.z||0};}
                return {x:p.x+local.x*(sprite.scale?.x||1)/48+(step.x||0)*Math.sign(p.facing||1),y:p.y+local.y*(sprite.scale?.y||1)/48+(step.y||0),z:step.z||0};
            }
            const width=(main._frame?.width||48)*Math.abs(sprite.scale?.x||1)*(main!==sprite?Math.abs(main.scale?.x||1):1)/48,heightPx=(main._frame?.height||96)*Math.abs(sprite.scale?.y||1)*(main!==sprite?Math.abs(main.scale?.y||1):1)/48;
            if(main!==sprite){p.x+=(main.x||0)*(sprite.scale?.x||1)/48;p.y+=(main.y||0)*(sprite.scale?.y||1)/48;}
            return B.attachmentPoint(p,{...step,z:step.attachment&&step.attachment!=='offset'?(step.z||0):height??step.z},width,heightPx);
        };
        const destroy=entry=>{entry.animation?.cancel?.();room?.remove(entry.key);if(!entry.graphic)return;entry.graphic.removeFromParent();entry.graphic.destroy();if(entry.owned)entry.graphic.bitmap.destroy();};
        // An animation projectile plays its animation on the carrier: in a room, anchored to the flying billboard; flat, as an animation sprite whose target is the carrier sprite.
        const flightAnimation=entry=>{
            const id=entry.step.animationId,data=root.$dataAnimations?.[id];if(!(id>0)||!data)return null;
            if(room)return room.playAnimation(entry.key,id,{})||null;
            const Kind=data.frames?root.Sprite_AnimationMV:root.Sprite_Animation;if(!Kind||!entry.graphic||!ss._effectsContainer)return null;
            const sprite=new Kind();sprite.targetObjects=[];sprite.setup([entry.graphic],data,false,0,null);ss._effectsContainer.addChild(sprite);ss._animationSprites.push(sprite);
            return {cancel(){if(ss._animationSprites?.includes(sprite))ss.removeAnimation(sprite);}};
        };
        const make=(step,battler)=>{
            let bitmap,owned=false,rect;
            if(room&&['weapon','projectile'].includes(step.type)&&step.weaponGraphic!=='sheet'&&root.Reactor3D?.databaseModelSpec){
                // A held or thrown thing bound to a 3D model is shown as that model.
                const source=step.iconSource||(step.type==='projectile'?'color':'weapon');let spec=null;
                if(source==='weapon'){const weapon=(battler?.weapons?.()||[])[Math.max(0,(step.equipIndex||1)-1)];spec=weapon&&root.Reactor3D.databaseModelSpec('weapons',weapon.id);}
                else if(source==='action'){const item=manager._action?.item?.();spec=item&&root.Reactor3D.databaseModelSpec(DataManager.isSkill(item)?'skills':'items',item.id);}
                else if(source==='model'&&step.model?.name)spec=root.Reactor3D.normalizeModelSpec(step.model);
                if(spec){const key=prefix+(serial++);room.addModel(key,spec,{x:0,y:0,z:0});return {key,model:true,step};}
            }
            if(step.weaponGraphic==='sheet'){
                const id=Math.max(1,step.weaponImageId||1),index=(id-1)%12;bitmap=ImageManager.loadSystem('Weapons'+Math.ceil(id/12));rect={x:(Math.floor(index/6)*3+Math.max(0,Math.min(2,(step.weaponFrame||1)-1)))*96,y:index%6*64,width:96,height:64};
            }else if(step.iconSource==='picture')bitmap=ImageManager.loadPicture(step.name);
            // A model with no room to stand in, and an animation's carrier, fly as a dot (the carrier's is clear).
            else if(step.type==='projectile'&&(!step.iconSource||['color','model','animation'].includes(step.iconSource))){const size=step.iconSource==='animation'?2:step.size||8;bitmap=new Bitmap(size,size);if(step.iconSource!=='animation')bitmap.fillAll(step.color||'#ffcc55');owned=true;}
            else{bitmap=ImageManager.loadSystem('IconSet');const size=ImageManager.iconWidth||32,index=B.visualIcon(step,step.sourceRole==='user'?subject:battler,manager._action?.item?.());rect={x:index%16*size,y:Math.floor(index/16)*size,width:size,height:size};}
            const graphic=new Sprite(bitmap);if(rect)graphic.setFrame(rect.x,rect.y,rect.width,rect.height);graphic.anchor.set(step.gripX??.5,step.gripY??.5);ss._battleField.addChild(graphic);
            return {key:prefix+(serial++),graphic,rect,owned,step};
        };
        const draw=(entry,p,rotation,visible=true)=>{
            const {graphic}=entry,step=entry.now||entry.step;
            if(entry.model){
                // The thing points where its holder faces: an authored front
                // face turns to the facing itself, a model without one keeps
                // the long-axis assumption of +90. Tilt tips it, Turn and Roll
                // finish the pose, all about its grip.
                const owner=entry.owner?._reactorRoomPosition,record=room?.models.get(entry.key);if(!p||!record)return;
                room.place(entry.key,B.heldPlacement(p,owner?.facing||0,{...step,rotation},record.spec));
                if(record.object)record.object.visible=visible;entry.point={...p};return;
            }
            if(!p||graphic.bitmap.isReady?.()===false){graphic.visible=false;return;}
            const rect=entry.rect||{x:0,y:0,width:graphic.bitmap.width,height:graphic.bitmap.height};if(!rect.width||!rect.height)return;
            if(room){room.sequenceBillboard(entry.key,graphic.bitmap.canvas,rect,p,{...step,rotation,visible});graphic.visible=false;}
            else{graphic.x=p.x*48;graphic.y=(p.y-(p.z||0))*48;graphic.rotation=rotation*Math.PI/180;graphic.scale.set(step.scale??1);graphic.visible=visible;}
            entry.point={...p};
        };
        const update=()=>{
            if(closed)return;
            for(const entry of held.values()){
                const tw=entry.tween;if(tw){const t=Math.min(1,(time-tw.start)/Math.max(1,tw.duration));entry.now={...entry.step,...B.heldPose(tw.from,tw.to,B.ease(t,tw.easing))};if(t>=1){entry.step=entry.now;delete entry.tween;}}
                const now=entry.now||entry.step;draw(entry,point(entry.owner,now),(now.rotation||0));
            }
            for(const entry of flights){
                entry.from||=point(entry.owner,entry.step,entry.step.startHeight??1);
                const to=point(entry.target,{attachment:'offset',x:0,y:0,z:entry.step.endHeight??1},entry.step.endHeight??1),t=Math.min(1,Math.max(0,(time-entry.start)/Math.max(1,entry.step.duration)));
                if(entry.from&&to)draw(entry,B.flightPoint(entry.from,to,t,entry.step.arc||0,entry.step.flight==='return'),(entry.step.rotation||0)+(time-entry.start)*(entry.step.spin||0),t<1);
                if(entry.from&&to&&entry.step.iconSource==='animation'&&entry.animation===undefined&&t<1)entry.animation=flightAnimation(entry);
            }
        };
        (ss._rrSequenceVisualUpdates||=new Set()).add(update);if(room)(room.sequenceVisualUpdates||=new Set()).add(update);
        return {held,flights,point,
            cue(step,start,chosen,destinations){
                if(!['weapon','projectile'].includes(step.type))return false;time=start;
                if(step.type==='weapon')for(const battler of chosen){const owner=ss.findTargetSprite(battler);if(!owner)continue;const old=held.get(owner),mode=B.weaponMode(step);
                    if(mode==='move'){if(old)old.tween={from:B.heldPose(old.now||old.step,old.now||old.step,1),to:B.heldPose(step,step,1),start,duration:step.duration,easing:step.easing};continue;}
                    if(old){destroy(old);held.delete(owner);}if(mode!=='hide')held.set(owner,{...make(step,battler),owner});}
                else{
                    const dest=step.destination||'target',recipients=destinations||(dest==='user'?[subject]:dest==='allTargets'?[...new Set(targets)]:dest==='subject'?[subject]:[targets[step.targetIndex||0]]);
                    for(const battler of chosen)for(const target of recipients){const owner=ss.findTargetSprite(battler),targetSprite=ss.findTargetSprite(target);if(owner&&targetSprite)flights.push({...make(step,battler),owner,target:targetSprite,start});}
                }return true;
            },
            pose(frame){time=frame;update();},
            cleanup(){closed=true;ss._rrSequenceVisualUpdates?.delete(update);room?.sequenceVisualUpdates?.delete(update);for(const entry of [...held.values(),...flights])destroy(entry);held.clear();flights.length=0;}
        };
    };
    P.extendAdapter=function(adapter,env){
        const {manager,subject,targets,ss,room,roles,homes,saved,stateOnly=false}=env;
        const visuals=P.sequenceVisuals(env);adapter.visuals=visuals;
        const original={cue:adapter.cue,pose:adapter.pose,cleanup:adapter.cleanup},effects=[],layers=new Map(),restore=[],audioSaved={};
        let selected=[],impactQueue=[],frame=0,formula=null,elements=null,rate=100;
        const action=manager._action,log=manager._logWindow||root.SceneManager?._scene?._logWindow;
        const all=()=>[...new Set([subject,...targets,...(root.$gameParty?.battleMembers?.()||[]),...(root.$gameTroop?.members?.()||[])])];
        const choose=step=>B.selectTargets(step,{user:subject,subject:step.callRole?B.selectTargets({role:step.callRole,filter:step.callFilter},{user:subject,targets,actors:root.$gameParty?.battleMembers?.(),enemies:root.$gameTroop?.members?.(),friends:subject.friendsUnit?.().members(),opponents:subject.opponentsUnit?.().members()})[0]:subject,subjects:step.callRole?B.selectTargets({role:step.callRole,filter:step.callFilter},{user:subject,targets,actors:root.$gameParty?.battleMembers?.(),enemies:root.$gameTroop?.members?.(),friends:subject.friendsUnit?.().members(),opponents:subject.opponentsUnit?.().members()}):[subject],targets,selected,
            actors:root.$gameParty?.battleMembers?.(),enemies:root.$gameTroop?.members?.(),friends:subject.friendsUnit?.().members(),opponents:subject.opponentsUnit?.().members(),moved:b=>ss.findTargetSprite(b)?.isMoving?.()});
        const expression=(code,target=selected[0]||targets[0],statement=false)=>Function('user','subject','target','a','b','v','action','item',statement?String(code):'return ('+String(code)+');')(subject,subject,target,subject,target,root.$gameVariables?._data||[],action,action?.item?.());
        adapter.condition=code=>{try{return !!expression(code);}catch(error){P.warn('Sequence condition: '+error.message);return false;}};
        const number=(value,target)=>{const n=typeof value==='number'?value:Number(expression(value??'0',target));if(!Number.isFinite(n))throw Error('Sequence expression must return a finite number.');return n;};
        const capture=sprite=>{
            if(!sprite)return null;
            if(!saved.has(sprite))saved.set(sprite,{x:sprite.x,y:sprite.y,offsetX:sprite._offsetX,offsetY:sprite._offsetY,rotation:sprite.rotation,scaleX:sprite.scale?.x??1,scaleY:sprite.scale?.y??1});
            if(!spriteKeys.has(sprite)){const key='extraBattler'+spriteKeys.size;spriteKeys.set(sprite,key);roles[key]=sprite;homes[key]=room?{...sprite._reactorRoomPosition}:{x:sprite.x/48,y:sprite.y/48,z:0};}
            if(!appearance.has(sprite)){const main=sprite._mainSprite||sprite;appearance.set(sprite,{opacity:sprite.opacity,tone:main.getColorTone?.(),blend:main.getBlendColor?.(),pose:sprite._rrHeldPose,motion:sprite._rrGraphicMotion,homeX:sprite._homeX,homeY:sprite._homeY});}
            return spriteKeys.get(sprite);
        };
        const appearance=new Map(),spriteKeys=new Map();for(const [key,sprite] of Object.entries(roles))if(sprite&&!spriteKeys.has(sprite))spriteKeys.set(sprite,key);
        const tween=(sprite,key,to,duration,start,apply,from)=>{effects.push({sprite,key,from,to,start,end:start+duration,apply});};
        const layerPrefix='extra:sequence-layer:'+(P._layerSerial=(P._layerSerial||0)+1)+':';
        const destroyLayer=(key,owners=[])=>{const entry=layers.get(key)||owners.map(o=>o?._rrLayers?.get(key)).find(Boolean);if(entry){if(entry.roomKey)room?.remove(entry.roomKey);entry.graphic.removeFromParent();entry.graphic.destroy();layers.delete(key);entry.owner?._rrLayers?.delete(key);}};
        const pending=()=>({blocking:true,isPlaying:()=>adapter.pendingImpact});
        const damageCall=target=>{
            const methods={};
            const override=(key,fn)=>{methods[key]={own:Object.hasOwn(action,key),value:action[key]};action[key]=fn;};
            if(action){
                if(formula!==null)override('evalDamageFormula',function(target){const sign=[3,4].includes(this.item().damage.type)?-1:1;return Math.max(0,number(formula,target))*sign;});
                if(elements)override('calcElementRate',target=>Math.max(...elements.map(id=>target.elementRate(id))));
                if(rate!==100){const make=action.makeDamageValue;override('makeDamageValue',function(...args){return Math.round(make.apply(this,args)*rate/100);});}
            }
            try{manager.invokeAction(subject,target);}finally{for(const [key,entry] of Object.entries(methods)){if(entry.own)action[key]=entry.value;else delete action[key];}}
        };
        adapter.resolveNext=()=>{
            if(impactQueue.length)damageCall(impactQueue.shift());
            adapter.pendingImpact=impactQueue.length>0;
        };
        adapter.cue=(raw,start)=>{
            frame=start;const step={...B.commandDefaults(raw.type),...raw},chosen=choose(step),sprites=chosen.map(b=>ss?.findTargetSprite(b)).filter(Boolean);
            for(const sprite of sprites)capture(sprite);
            raw._roles=sprites.map(s=>spriteKeys.get(s));raw._chosen=chosen;
            if(visuals.cue(step,start,chosen,step.type==='projectile'?choose({role:step.destination||'target',targetIndex:step.targetIndex,callRole:step.callRole,callFilter:step.callFilter}):null))return;
            if(['move','camera','direction'].includes(step.type)){const target=ss?.findTargetSprite(step.direction==='opponents'?subject.opponentsUnit?.().members()?.[0]:selected[0]||targets[0]);if(target)raw._target=room?{...target._reactorRoomPosition}:{x:target.x/48,y:target.y/48,z:0};}
            if(step.type==='impact'){
                rate=number(step.rate??100);
                if(adapter.hitPolicy==='authored'){impactQueue=chosen.slice();manager._targets=[];}
                else impactQueue=manager._targets.splice(0);
                adapter.pendingImpact=impactQueue.length>0;adapter.resolveNext();return pending();
            }
            if(step.type==='target'){selected=step.operation==='clear'?[]:chosen;return;}
            if(step.type==='clearTargets'){manager._targets=[];impactQueue=[];adapter.pendingImpact=false;return;}
            if(step.type==='formula'){formula=step.operation==='clear'?null:step.formula;return;}
            if(step.type==='element'){elements=step.operation==='clear'?null:String(step.elements).split(',').map(Number).filter(n=>Number.isInteger(n)&&n>=0);if(elements&&!elements.length)throw Error('Select at least one damage element.');return;}
            if(step.type==='eval'){expression(step.code,chosen[0],true);return;}
            if(step.type==='event'){
                const event=root.$dataCommonEvents?.[step.eventId];if(!event)throw Error('Missing common event #'+step.eventId);
                const interpreter=new Game_Interpreter();interpreter.setup(event.list);let ticks=0;
                return {blocking:true,isPlaying(){if(++ticks>18000)throw Error('Sequence common event exceeded five minutes.');interpreter.update();return interpreter.isRunning();},cancel(){interpreter.clear();}};
            }
            if(['hp','mp','tp','buff','state','kill'].includes(step.type)){
                for(const battler of chosen){battler.clearResult?.();
                    if(['hp','mp','tp'].includes(step.type)){const max=step.type==='hp'?battler.mhp:step.type==='mp'?battler.mmp:battler.maxTp();const value=number(step.amount,battler)*(step.percent==='percent'?max/100:1);battler['gain'+step.type.toUpperCase().replace('HP','Hp').replace('MP','Mp').replace('TP','Tp')](Math.round(value));}
                    if(step.type==='state')battler[step.operation==='remove'?'removeState':'addState'](step.stateId);
                    if(step.type==='buff'){const id=['mhp','mmp','atk','def','mat','mdf','agi','luk'].indexOf(step.param);battler[step.operation==='increase'?'addBuff':step.operation==='decrease'?'addDebuff':'removeBuff'](id,step.turns);}
                    if(step.type==='kill')battler.addState(battler.deathStateId());
                    if(step.show==='show'){battler.startDamagePopup?.();log?.displayActionResults?.(subject,battler);}
                }return;
            }
            if(step.type==='item'){const amount=number(step.amount);if(step.kind==='gold')$gameParty.gainGold(amount);else $gameParty.gainItem(({items:root.$dataItems,weapons:root.$dataWeapons,armors:root.$dataArmors})[step.kind]?.[step.itemId],amount);return;}
            if(step.type==='switch'){$gameSwitches.setValue(step.switchId,step.operation==='toggle'?!$gameSwitches.value(step.switchId):step.operation==='on');return;}
            if(step.type==='variable'){const a=$gameVariables.value(step.variableId),b=number(step.amount),v={set:()=>b,add:()=>a+b,subtract:()=>a-b,multiply:()=>a*b,divide:()=>b?a/b:0,modulo:()=>b?a%b:0}[step.operation]();$gameVariables.setValue(step.variableId,v);return;}
            if(['bgm','bgs','se'].includes(step.type)){
                const suffix=step.type==='bgm'?'Bgm':step.type==='bgs'?'Bgs':'Se',op=step.operation;
                if(op==='play')AudioManager['play'+suffix]({name:step.name,volume:step.volume,pitch:step.pitch,pan:step.pan});
                else if(op==='system')SoundManager.playSystemSound(step.soundId);
                else if(op==='save')audioSaved[suffix]=AudioManager['save'+suffix]?.();
                else if(op==='resume'&&audioSaved[suffix])AudioManager['replay'+suffix]?.(audioSaved[suffix]);
                else if(op==='fadeIn'||op==='fadeOut')AudioManager[op+suffix]?.(step.fade/60);
                else if(op==='stop')AudioManager['stop'+suffix]?.();return;
            }
            if(step.type==='movie'){Video.play('movies/'+step.name);return {blocking:true,isPlaying:()=>Video.isPlaying(),cancel:()=>Video._element?.pause()};}
            if(step.type==='battlestatus'||step.type==='battlelog'){
                const window=step.type==='battlelog'?log:SceneManager._scene?._statusWindow;if(!window)return;
                const visible=window.visible;restore.push(()=>window.visible=visible);
                if(step.operation==='text')window.addText?.(step.text);else if(step.operation==='clear')window.clear?.();else window.visible=step.operation==='show';return;
            }
            if(step.type==='battleback'){
                const a=ss._back1Sprite,b=ss._back2Sprite;if(!a||!b)return;
                if(!adapter._battleback){adapter._battleback=[a.bitmap,b.bitmap];restore.push(()=>{[a.bitmap,b.bitmap]=adapter._battleback;});}
                if(step.operation==='save')adapter._savedBattleback=[a.bitmap,b.bitmap];
                else if(step.operation==='restore')[a.bitmap,b.bitmap]=adapter._savedBattleback||adapter._battleback;
                else{a.bitmap=ImageManager.loadBattleback1(step.floor);b.bitmap=ImageManager.loadBattleback2(step.background);}return;
            }
            if(step.type==='flash'){$gameScreen.startFlash([step.red,step.green,step.blue,step.alpha],step.duration);return;}
            if(step.type==='shake'){$gameScreen.startShake(step.power,step.speed,step.duration);return;}
            if(step.type==='tint'&&step.space!=='battler'){
                if(step.space==='screen'){const old=$gameScreen.tone().slice();restore.push(()=>$gameScreen.startTint(old,0));$gameScreen.startTint([step.red,step.green,step.blue,step.gray],step.duration);}
                else{const sprite=step.space==='upper'?ss._back2Sprite:ss._back1Sprite;if(sprite){const tone=sprite.getColorTone();restore.push(()=>sprite.setColorTone(tone));tween(sprite,'tone',[step.red,step.green,step.blue,step.gray],step.duration,start,v=>sprite.setColorTone(v),tone);}}return;
            }
            if(['picture','icon','plane'].includes(step.type)){
                const owners=step.type==='plane'||step.space==='screen'?[null]:sprites;
                for(const owner of owners){const key=step.type+':'+step.index+':'+(owner?spriteKeys.get(owner):'screen');
                    if(step.operation==='clear'){destroyLayer(key,[owner]);continue;}
                    if(step.operation==='move'){const entry=layers.get(key);if(entry){for(const k of ['x','y','opacity'])tween(entry,k,step[k],step.duration,start,v=>entry[k]=v,entry[k]);}continue;}
                    destroyLayer(key,[owner]);let bitmap;
                    if(step.type==='icon')bitmap=ImageManager.loadSystem('IconSet');else bitmap=ImageManager.loadPicture(step.name);
                    const graphic=step.type==='plane'?new TilingSprite(bitmap):new Sprite(bitmap);graphic.anchor?.set(.5,.5);
                    if(step.type==='icon'){const battler=chosen[sprites.indexOf(owner)]||subject,item=step.source==='action'?action?.item():step.source==='equip'?battler.equips?.()[step.equipIndex-1]:step.source==='shield'?battler.armors?.()[0]:null,index=step.source==='icon'?step.iconIndex:item?.iconIndex||0,size=ImageManager.iconWidth||32;graphic.setFrame(index%16*size,Math.floor(index/16)*size,size,size);}
                    if(step.type==='plane')graphic.move(step.x,step.y,step.width,step.height);
                    // A picture or icon on a battler is a child of its sprite: it follows every move and fades with a collapse; one from a battler state or reaction stays put after the state ends (Victor's blood splatter on a fallen battler) until a clear or the end of the battle.
                    const host=owner&&!room&&typeof owner.addChild==='function'?owner:(ss._battleField||ss);if(step.layer==='below')host.addChildAt(graphic,0);else host.addChild(graphic);
                    const entry={graphic,owner,type:step.type,x:step.x,y:step.y,opacity:step.opacity,step,start,roomKey:layerPrefix+key,hosted:host===owner};
                    layers.set(key,entry);if(stateOnly&&owner)(owner._rrLayers||=new Map()).set(key,entry);
                }return;
            }
            if(step.type==='balloon'){
                for(const sprite of sprites){const balloon=new Sprite_Balloon();balloon.setup(sprite,step.balloonId);ss._battleField.addChild(balloon);effects.push({balloon});restore.push(()=>{balloon.removeFromParent();balloon.destroy();});}return;
            }
            if(['direction','home','jump','leap','float','fall','opacity','pose','tint','whiten'].includes(step.type)){
                for(const sprite of sprites){const main=sprite._mainSprite||sprite,key=capture(sprite),home=homes[key];
                    if(step.type==='home'){if(step.operation==='here'){home.x=sprite.x/48;home.y=sprite.y/48;}else if(step.operation==='position'){home.x=step.x;home.y=step.y;}else{const old=saved.get(sprite);home.x=old.x/48;home.y=old.y/48;}continue;}
                    if(step.type==='direction'){const target=step.direction==='opponents'?subject.opponentsUnit?.().members()?.[0]:selected[0]||targets[0],dest=ss.findTargetSprite(target),pose={x:sprite.x/48,y:sprite.y/48,facing:sprite._rrSequenceFacing??sprite._rrFacingYaw??P.spriteYaw(sprite,target)},yaw=B.directionYaw(step,pose,dest?{x:dest.x/48,y:dest.y/48}:null,{x:home.x,y:home.y}),rad=yaw*Math.PI/180,facing=Math.abs(Math.sin(rad))>=Math.abs(Math.cos(rad))?Math.sign(Math.sin(rad)):(sprite._rrFacing||-1);sprite._rrFacing=facing;sprite._rrFacingYaw=yaw;if(!P.usesSheet(sprite))effects.push({direction:sprite,facing});continue;}
                    if(step.type==='pose'){sprite._rrHeldPose=step.operation==='clear'?null:{motion:step.motion,frame:Math.max(0,step.frame-1)};continue;}
                    if(step.type==='opacity')tween(sprite,'opacity',Math.max(0,Math.min(255,step.opacity)),step.duration,start,v=>sprite.opacity=v,sprite.opacity);
                    else if(step.type==='tint')tween(sprite,'tone',[step.red,step.green,step.blue,step.gray],step.duration,start,v=>main.setColorTone?.(v),main.getColorTone?.()||[0,0,0,0]);
                    else if(step.type==='whiten'){main.setBlendColor?.([255,255,255,160]);tween(sprite,'whiten',0,Math.max(1,step.duration),start,v=>main.setBlendColor?.([255,255,255,v]),160);}
                    else{effects.push({lift:sprite,kind:step.type,height:step.height,start,end:start+Math.max(1,step.duration),from:sprite._rrLift||0});}
                }return;
            }
            if(step.type==='weapon'&&step.weaponGraphic==='sheet'){
                adapter.clearWeapon();if(step.visible===false)return;
                const id=Math.max(1,step.weaponImageId),index=(id-1)%12,graphic=new Sprite(ImageManager.loadSystem('Weapons'+Math.ceil(id/12)));graphic.setFrame((Math.floor(index/6)*3+Math.max(0,Math.min(2,step.weaponFrame-1)))*96,index%6*64,96,64);graphic.anchor.set(.5,.5);ss._battleField.addChild(graphic);adapter.weapon={graphic,step};return;
            }
            if(step.type==='motion'&&(step.motionIndex||step.motionFrames||step.motionSpeed||step.motionLoop&&step.motionLoop!=='default'))for(const sprite of sprites){sprite._rrMotionOverride={...(step.motionIndex?{index:step.motionIndex-1}:{}),...(step.motionFrames?{frames:step.motionFrames}:{}),...(step.motionSpeed?{speed:step.motionSpeed}:{}),...(step.motionLoop&&step.motionLoop!=='default'?{loop:step.motionLoop==='loop'?true:step.motionLoop==='hold'?'once':false}:{}),name:step.motion};}
            else if(step.type==='motion')for(const sprite of sprites)delete sprite._rrMotionOverride;
            if(step.type==='wait'&&step.waitFor&&step.waitFor!=='frames')return {blocking:true,isPlaying:()=>sprites.some(s=>step.waitFor==='move'?s.isMoving?.():step.waitFor==='animation'?s.isAnimationPlaying?.():step.waitFor==='popup'?s._damages?.length:step.waitFor==='effecting'?s.isEffecting?.():step.waitFor==='motion'?s._motion&&!s._motion.loop&&s._pattern<2:false)};
            if(step.type==='animation'&&step.animationSource&&step.animationSource!=='id'){const id=action?.item()?.animationId??0;raw={...raw,animationId:step.animationSource==='weapon'||id===-1?subject.attackAnimationId1?.()||0:Math.max(0,id)};}
            return original.cue(raw,start);
        };
        const updateRoomLayers=()=>{if(!room)return;for(const entry of layers.values()){
            const {graphic,owner,step}=entry;if(!owner||step.space==='screen'||graphic.bitmap?.isReady?.()===false)continue;
            const p=owner._reactorRoomPosition;if(!p)continue;
            const offset=new root.THREE.Vector3(entry.x/48,-entry.y/48,0).applyQuaternion(room.camera.quaternion),point={x:p.x+offset.x,y:p.y+offset.z,z:(p.z||0)+offset.y};
            const rect=graphic._frame?.width?graphic._frame:{x:0,y:0,width:graphic.bitmap.width,height:graphic.bitmap.height};
            room.sequenceBillboard(entry.roomKey,graphic.bitmap.canvas,rect,point,{scale:step.scale,rotation:step.angle+(frame-entry.start)*step.spin,opacity:entry.opacity/255});graphic.visible=false;
        }};
        if(room)(room.sequenceVisualUpdates||=new Set()).add(updateRoomLayers);
        adapter.pose=(positions,time)=>{
            frame=time;original.pose(positions,time);
            for(const effect of effects){
                if(effect.balloon){effect.balloon.update();continue;}
                if(effect.direction){const sprite=effect.direction,old=saved.get(sprite);sprite.scale.x=Math.abs(old.scaleX)*(effect.facing<0?1:-1);if(room)sprite._reactorRoomPosition.facing=effect.facing*90;continue;}
                const t=Math.min(1,Math.max(0,(time-effect.start)/Math.max(1,effect.end-effect.start)));
                if(effect.lift){const h=effect.kind==='jump'?effect.from+Math.sin(Math.PI*t)*effect.height:effect.kind==='leap'?effect.from+effect.height*(1-(1-t)*(1-t)):effect.kind==='float'?effect.from+effect.height*t:effect.from+(effect.height-effect.from)*t;effect.lift._rrLift=h;continue;}
                const v=Array.isArray(effect.to)?effect.to.map((n,i)=>effect.from[i]+(n-effect.from[i])*t):effect.from+(effect.to-effect.from)*t;effect.apply(v);
            }
            for(const sprite of appearance.keys())if(sprite._rrLift){if(room)sprite._reactorRoomPosition.z=(positions[spriteKeys.get(sprite)]?.z||0)+sprite._rrLift;else sprite.y-=sprite._rrLift*48;}
            visuals.pose(time);
            for(const entry of layers.values()){const {graphic,owner,step}=entry;graphic.opacity=entry.opacity;graphic.rotation=(step.angle+(time-entry.start)*step.spin)*Math.PI/180;graphic.scale?.set(step.scale);if(entry.type==='plane'){graphic.origin.x=(time-entry.start)*step.scrollX;graphic.origin.y=(time-entry.start)*step.scrollY;}else if(entry.hosted){graphic.x=entry.x;graphic.y=entry.y;}else{graphic.x=(owner?.x||0)+entry.x;graphic.y=(owner?.y||0)+entry.y;}}
        };
        adapter.cleanup=cancelled=>{try{original.cleanup(cancelled);}finally{
            visuals.cleanup();room?.sequenceVisualUpdates?.delete(updateRoomLayers);
            for(const fn of restore.reverse())fn();for(const key of [...layers.keys()])if(!(stateOnly&&layers.get(key).hosted))destroyLayer(key);
            for(const [sprite,old] of appearance){const main=sprite._mainSprite||sprite;
                // A dead enemy keeps what its collapse left (a few points of opacity, a blend colour): a reaction played over the collapse must not stand it back up.
                const gone=sprite._battler&&typeof sprite._battler.isDead==='function'&&sprite._battler.isDead()&&typeof sprite._battler.isEnemy==='function'&&sprite._battler.isEnemy();
                if(!gone){sprite.opacity=old.opacity;if(old.tone)main.setColorTone?.(old.tone);if(old.blend)main.setBlendColor?.(old.blend);}sprite._rrHeldPose=old.pose;sprite._rrGraphicMotion=old.motion;sprite._rrLift=0;delete sprite._rrFacing;delete sprite._rrMotionOverride;sprite._homeX=old.homeX;sprite._homeY=old.homeY;}
        }};
        return adapter;
    };
    /**
     * Where a battler stands on the screen: its foot point and the top of
     * its picture, in canvas pixels. A model in a room is projected through
     * the room's camera; a flat sprite is measured from its frame.
     */
    P.battlerScreenBox=function(battler){
        const ss=BattleManager._spriteset,sprite=ss?.findTargetSprite?.(battler);if(!sprite)return null;
        const room=ss._reactorRoom;
        if(room&&sprite._reactorRoomPosition){
            const foot=room.project(sprite._reactorRoomPosition),bounds=sprite._reactorRoomKey?room.bounds(sprite._reactorRoomKey):null;
            const toGlobal=p=>ss._reactorRoomSprite?.toGlobal?ss._reactorRoomSprite.toGlobal(new PIXI.Point(p.x,p.y)):{x:p.x,y:p.y};
            const f=toGlobal(foot),t=toGlobal({x:foot.x,y:bounds?bounds.y:foot.y-96});
            return {x:f.x,top:t.y,bottom:f.y};
        }
        const main=sprite._mainSprite||sprite,g=sprite.getGlobalPosition?sprite.getGlobalPosition(new PIXI.Point()):{x:sprite.x,y:sprite.y};
        const height=(main._frame?.height||main.height||96)*Math.abs(sprite.scale?.y||1)*(main!==sprite?Math.abs(main.scale?.y||1):1);
        return {x:g.x,top:g.y-height,bottom:g.y};
    };
    /**
     * With BattlePresentation.json's "commandWindow": "battler", the actor
     * command window stands above the actor whose turn it is, in a flat
     * battle or a 3D room, wherever a HUD plugin would have parked it. Set
     * after the window's own update, so a HUD that moves it every frame
     * (MOG_BattleHud slides it to the actor's box) is overruled every frame.
     */
    P.anchorCommandWindow=function(window){
        const actor=BattleManager.actor?.();if(!actor||!(window.visible||window.active))return;
        const box=P.battlerScreenBox(actor);if(!box||!Number.isFinite(box.x)||!Number.isFinite(box.top))return;
        const layerX=(Graphics.width-Graphics.boxWidth)/2,layerY=(Graphics.height-Graphics.boxHeight)/2;
        const x=Math.round(box.x-layerX-window.width/2),y=Math.round(box.top-layerY-window.height-8);
        window.x=Math.max(0,Math.min(Graphics.boxWidth-window.width,x));window.y=Math.max(0,Math.min(Graphics.boxHeight-window.height,y));
    };
    P.installCommandWindowAnchor=function(){
        if(typeof Window_ActorCommand==='undefined')return;
        const update=Window_ActorCommand.prototype.update;
        Window_ActorCommand.prototype.update=function(){update.call(this);if(P.settings?.commandWindow==='battler')P.anchorCommandWindow(this);};
    };
    /**
     * MOG_BattleHud's MZ port draws each actor's name on a bare Bitmap, which
     * MZ starts in sans-serif (MV started it in the game font), so the name
     * is the one label on the HUD in the wrong face. It also draws at one
     * size, so a long name runs past its box. The name takes the game font
     * and shrinks until it fits the layout box.
     */
    P.installMogHudNames=function(){
        const Hud=root.Battle_Hud;if(!Hud?.prototype?.refresh_name)return;
        const refresh=Hud.prototype.refresh_name;
        Hud.prototype.refresh_name=function(){
            const bitmap=this._name?.bitmap,name=this._battler?._name;
            if(bitmap&&name){
                if($gameSystem?.mainFontFace)bitmap.fontFace=$gameSystem.mainFontFace();
                // The box art frames its inside by about 14 px a side; the name, outline included, stays within that.
                const box=this._layout?.bitmap?.width||this._hud_size?.[0]||bitmap.width,outline=bitmap.outlineWidth||0;
                const base=Number(root.Moghunter?.bhud_name_font_size)||bitmap.fontSize||20,limit=Math.max(40,Math.min(bitmap.width,box-28)-2*outline);
                bitmap.fontSize=base;while(bitmap.fontSize>10&&bitmap.measureTextWidth(name)>limit)bitmap.fontSize--;
                // A centred name is centred on the box itself, not on a bitmap parked off its left edge.
                if(Number(root.Moghunter?.bhud_name_align)===1&&Number.isFinite(this._pos_x))this._name.x=this._pos_x+Math.round((box-bitmap.width)/2);
            }
            refresh.call(this);
        };
    };
    P.installPsychronicHud=function(){
        if(!(PluginManager._scripts||[]).some(name=>/PSYCHRONIC_ATB-MZ/i.test(name))||typeof Window_Base==='undefined')return;
        const initialize=Window_Base.prototype.initialize;
        const present=(folder,name)=>{
            if(!name)return false;if(!Utils.isNwjs())return true;
            const fs=require('fs'),path=require('path'),dir=path.join(path.dirname(process.mainModule.filename),'img',folder);
            const extensions=ImageManager._imageExtensions||['.png'];
            const names=extensions.some(ext=>name.toLowerCase().endsWith(ext))?[name,name+'.png']:extensions.map(ext=>name+ext);
            return names.some(file=>[file,file+'_',file.replace(/\.png$/i,'.rpgmvp')].some(candidate=>fs.existsSync(path.join(dir,candidate))));
        };
        Window_Base.prototype.initialize=function(...args){
            // The plugin keeps Window_ATBBar private. Its base initialization
            // is the point before it asks for icon assets; adapt this instance.
            if(this.loadBattlerIcon&&this.loadBackgroundIcon&&this.setEnemySpriteFrame&&!this._reactorHudAssets){
                this._reactorHudAssets=true;const icon=this.loadBattlerIcon,background=this.loadBackgroundIcon;
                this.loadBattlerIcon=function(battler,sprite){
                    const enemy=!battler.isActor(),data=enemy?$dataEnemies[battler.enemyId()]:$dataActors[battler.actorId()];
                    if(!enemy||/<atb icon:\s*\d+>/i.test(data.note||''))return icon.call(this,battler,sprite);
                    const spec=Reactor3D.databaseModelSpec('enemies',battler.enemyId());
                    if(spec){
                        const update=sprite.update;sprite.update=function(){update.call(this);const source=SceneManager._scene?._spriteset?.findTargetSprite(battler),bitmap=source?._reactorBattler?.bitmap;
                            if(bitmap?.isReady()&&bitmap.width>1){
                                this.bitmap=bitmap;this.setFrame(0,0,bitmap.width,bitmap.height);this.scale.set(32/bitmap.width,32/bitmap.height);
                                // Shared render targets have bottom-up rows. Frame changes
                                // rebuild each sprite texture, so derive its UV pose from
                                // the bitmap source rather than another sprite's frame.
                                const rotate=bitmap.baseTexture?.source?.__reactorExternal?PIXI.groupD8.MIRROR_VERTICAL:0;
                                if(this.texture&&this.texture.rotate!==rotate){
                                    this.texture.rotate=rotate;this.texture.updateUvs?.();
                                }
                            }
                        };return;
                    }
                    const folders=['sv_enemies','enemies','characters'],folder=folders.find(folder=>present(folder,data.battlerName));
                    if(folder){const bitmap=ImageManager.loadBitmap('img/'+folder+'/',data.battlerName);bitmap.addLoadListener(()=>this.setEnemySpriteFrame(sprite,bitmap,data.battlerName));}
                    else this.loadFallbackIcon(sprite,1);
                };
                this.loadBackgroundIcon=function(battler,sprite){const params=PluginManager.parameters('PSYCHRONIC_ATB-MZ'),name=params[battler.isActor()?'actorIconBackground':'enemyIconBackground'];if(!present('system',name)){sprite.visible=false;return;}return background.call(this,battler,sprite);};
            }
            return initialize.apply(this,args);
        };
    };
    P.installPartyLimit=function(){
        if (!root.Game_Party || P.partyLimitInstalled) return;
        P.partyLimitInstalled=true;
        const proto=Game_Party.prototype,previous=proto.maxBattleMembers,set=proto.setMaxBattleMembers;
        proto.maxBattleMembers=function(){
            const configured=B.configuredBattleMembers(root.$dataSystem);
            if (configured===null) return previous.call(this);
            return B.configuredBattleMembers({maxBattleMembers:this._reactorBattleMemberLimit}) ?? configured;
        };
        // Preserve scripted party-size changes and their save-game lifetime.
        proto.setMaxBattleMembers=function(max){
            const value=B.configuredBattleMembers({maxBattleMembers:Number(max)});
            if (B.configuredBattleMembers(root.$dataSystem)!==null && value!==null) this._reactorBattleMemberLimit=value;
            if (set) return set.call(this,max);
        };
    };
    P.installBattlebackLoading=function(){
        if(!root.ImageManager||P.battlebacksInstalled)return;P.battlebacksInstalled=true;
        for(const name of ['loadBattleback1','loadBattleback2']){
            const load=ImageManager[name];if(!load)continue;
            ImageManager[name]=function(...args){
                if(P._creatingBattleRoom||root.SceneManager?._scene?._reactorUsesBattleRoom){
                    // Keep the sprites plugins expect, without requesting an unused file.
                    if(!P._emptyBattleback?.width)P._emptyBattleback=new Bitmap(1,1);
                    return P._emptyBattleback;
                }
                return load.apply(this,args);
            };
        }
    };
    P.roomScreenPosition=function(sprite) {
        const ss=BattleManager._spriteset,room=ss?._reactorRoom;if(!room||!sprite._reactorRoomPosition)return null;
        const p=room.project(sprite._reactorRoomPosition);
        if(ss._reactorRoomSprite?.toGlobal&&sprite.parent?.toLocal)return sprite.parent.toLocal(ss._reactorRoomSprite.toGlobal(new PIXI.Point(p.x,p.y)));
        return {x:p.x-(ss._battleField?.x||0),y:p.y-(ss._battleField?.y||0)};
    };
    P.installRoomAnchors=function(){
        // A boss collapse lasts as many frames as the sprite's bitmap is tall; a room battler's sprite is a one-pixel stand-in, so it would end in one frame with the model left half-faded. The model's height on screen stands in for the picture's.
        if(root.Sprite_Enemy?.prototype.startBossCollapse){
            const boss=Sprite_Enemy.prototype.startBossCollapse;
            Sprite_Enemy.prototype.startBossCollapse=function(){boss.call(this);const bounds=this._reactorRoomKey&&this._reactorRoomBounds;if(bounds)this._effectDuration=Math.max(48,Math.round(bounds.height||0));};
        }
        for(const Class of [root.Sprite_Actor,root.Sprite_Enemy])if(Class){
            const position=Class.prototype.updatePosition;
            Class.prototype.updatePosition=function(...args){position?.apply(this,args);const p=P.roomScreenPosition(this);if(p){this.x=p.x;this.y=p.y;}};
        }
        if(root.Game_Enemy)for(const [method,axis] of [['screenX','x'],['screenY','y']]){
            const original=Game_Enemy.prototype[method];if(!original)continue;
            Game_Enemy.prototype[method]=function(){const sprite=BattleManager._spriteset?.findTargetSprite?.(this),p=sprite&&P.roomScreenPosition(sprite);return p?p[axis]:original.call(this);};
        }
        // MOG_BattleCursor keeps its sprite class inside a closure, so it is patched through the instances the spriteset creates: once, on their prototype.
        const patchCursor=proto=>{
            if(!proto||proto._reactorRoomAnchored||typeof proto.posX!=='function'||typeof proto.posY!=='function')return;proto._reactorRoomAnchored=true;
            const x=proto.posX,y=proto.posY;
            const anchor=cursor=>{
                const sprite=cursor._battlerSprite,bounds=sprite?._reactorRoomBounds,ss=BattleManager._spriteset;if(!bounds||!ss?._reactorRoom||!cursor.parent)return null;
                const px=cursor._align===3?bounds.x:cursor._align===4?bounds.x+bounds.width:bounds.x+bounds.width/2;
                // Above sits on the top of the head (the cursor picture hangs from that point), Center mid-body, Below at the feet.
                const py=cursor._align===0?bounds.y+bounds.height:cursor._align===2?bounds.y:bounds.y+bounds.height/2;
                return cursor.parent.toLocal(ss._reactorRoomSprite.toGlobal(new PIXI.Point(px,py)));
            };
            proto.posX=function(){const p=anchor(this);return p?p.x+this._position.xOffset+this._effect.waveX+this._battler._battleCursor.X_Offset:x.call(this);};
            proto.posY=function(){const p=anchor(this);return p?p.y+this._position.yOffset+this._effect.waveY+this._battler._battleCursor.Y_Offset:y.call(this);};
        };
        P.patchBattleCursors=spriteset=>{for(const child of spriteset?._sprtField2?.children||[])if(child&&child._battlerSprite&&typeof child.posX==='function')patchCursor(Object.getPrototypeOf(child));};
        if(root.BattleCursorSprite)patchCursor(BattleCursorSprite.prototype);
        const createCursor=root.Spriteset_Battle?.prototype.createBattleCursor;
        if(createCursor)Spriteset_Battle.prototype.createBattleCursor=function(){createCursor.call(this);P.patchBattleCursors(this);};
    };
    /**
     * What the engine does to a battler's sprite, done to its model: the
     * sprite's opacity, the blend colour a damage flash, an animation flash
     * or a collapse puts on it, the additive blend of a collapse, and gone
     * for good once a dead enemy has finished collapsing (the engine leaves
     * the sprite at a few points of opacity; a model that faint still reads
     * as standing there).
     */
    P.mirrorSpriteLook=function(sprite,battler,record){
        const object=record?.object;if(!object)return;
        const main=sprite._mainSprite||sprite,blend=main.getBlendColor?.()||[0,0,0,0],strength=Math.max(0,Math.min(1,(blend[3]||0)/255)),additive=sprite.blendMode===1||main.blendMode===1;
        const dead=typeof battler.isDead==='function'&&battler.isDead(),collapsed=dead&&!sprite._effectType&&sprite.opacity<32;
        object.visible=battler.isAppeared()&&sprite.visible!==false&&sprite.opacity>0&&!collapsed;
        const T=root.THREE,wanted=T?(additive?T.AdditiveBlending:T.NormalBlending):null;
        object.traverse(node=>{for(const material of Array.isArray(node.material)?node.material:[node.material]){if(!material)continue;
            material.userData||={};material.userData.rrOriginalOpacity??=material.opacity;
            material.opacity=material.userData.rrOriginalOpacity*sprite.opacity/255;
            if(sprite.opacity<255||additive)material.transparent=true;
            const tint=material.userData.rrBlend||(material.userData.rrBlend={value:{x:0,y:0,z:0,w:0}});
            tint.value.x=(blend[0]||0)/255;tint.value.y=(blend[1]||0)/255;tint.value.z=(blend[2]||0)/255;tint.value.w=strength;
            if(wanted!==null&&material.blending!==wanted)material.blending=wanted;
        }});
        // The engine shakes a boss as it collapses: the model shakes the same few pixels, across the screen.
        const shake=Number(sprite._shake)||0,room=root.BattleManager?._spriteset?._reactorRoom;
        if(T&&room?.camera&&object.position){const right=new T.Vector3().setFromMatrixColumn(room.camera.matrixWorld,0).normalize();
            const previous=object.userData.rrShake||0;if(previous)object.position.addScaledVector(object.userData.rrShakeAxis||right,-previous);
            if(shake){object.position.addScaledVector(right,shake/48);object.userData.rrShakeAxis=right;}object.userData.rrShake=shake?shake/48:0;}
    };
    P.publishRoomBounds=function(sprite,room,key){
        const bounds=room.bounds(key);if(!bounds)return;sprite._reactorRoomBounds=bounds;
        const p=P.roomScreenPosition(sprite);if(p){sprite.x=p.x;sprite.y=p.y;sprite._homeX=p.x;sprite._homeY=p.y;}
        // Publish projected dimensions without changing the source frame used
        // to draw a sprite sheet into the room's billboard texture.
        for(const node of new Set([sprite,sprite._mainSprite].filter(Boolean))){
            node._reactorRoomBounds=bounds;if(node._reactorRoomDimensions)continue;node._reactorRoomDimensions=true;
            for(const key of ['width','height']){let proto=node,descriptor;while(proto&&!descriptor){descriptor=Object.getOwnPropertyDescriptor(proto,key);proto=Object.getPrototypeOf(proto);}if(!descriptor?.get)continue;
                Object.defineProperty(node,key,{configurable:true,get(){return this._reactorRoomBounds?.[key]??descriptor.get.call(this);},set(value){descriptor.set?.call(this,value);}});
            }
        }
        if(sprite._stateIconSprite)sprite._stateIconSprite.y=bounds.y-room.project(sprite._reactorRoomPosition).y-20;
    };
    P.installSequenceAnimations=function(){
        if(!root.Spriteset_Base)return;
        const proto=Spriteset_Base.prototype,create=proto.createAnimation,busy=proto.isAnimationPlaying;
        proto.createAnimation=function(request){
            const ticket=request._reactorSequenceMedia;if(!ticket)return create.call(this,request);
            const before=new Set(this._animationSprites);
            try{return create.call(this,request);}finally{
                ticket.pending=false;ticket.sprites=this._animationSprites.filter(s=>!before.has(s));
                for(const sprite of ticket.sprites){
                    sprite._reactorSequenceMedia=ticket;
                    const t=ticket.transform,scale=t.scale??1;
                    sprite._animation={...sprite._animation,scale:(sprite._animation.scale??100)*scale};
                    const offset=()=>{
                        const points=(sprite.targetObjects||[]).map(b=>this.findTargetSprite(b)?._reactorRoomPosition).filter(Boolean);
                        if(ticket.room&&points.length){let x=0,y=0;for(const p of points){const a=ticket.room.project(p),b=ticket.room.project({x:p.x+(t.x||0),y:p.y+(t.y||0),z:(p.z||0)+(t.z||0)});x+=b.x-a.x;y+=b.y-a.y;}return {x:x/points.length,y:y/points.length};}
                        return {x:(t.x||0)*48,y:((t.y||0)-(t.z||0))*48};
                    };
                    if(sprite.targetPosition){const original=sprite.targetPosition;sprite.targetPosition=function(...args){const p=original.apply(this,args),d=offset();return {x:p.x+d.x,y:p.y+d.y};};}
                    else if(sprite.updatePosition){const original=sprite.updatePosition;sprite.updatePosition=function(...args){original.apply(this,args);const d=offset();this.x+=d.x;this.y+=d.y;};}
                    if(sprite.updateCellSprite){const original=sprite.updateCellSprite;sprite.updateCellSprite=function(cell,...args){original.call(this,cell,...args);cell.x*=scale;cell.y*=scale;cell.scale.x*=scale;cell.scale.y*=scale;};}
                }
            }
        };
        proto.isAnimationPlaying=function(){
            // The sequence player owns its waits. Ordinary/plugin animations
            // retain the original spriteset busy behavior.
            if(this._animationSprites?.some(s=>s._reactorSequenceMedia))return this._animationSprites.some(s=>!s._reactorSequenceMedia);
            return busy.call(this);
        };
    };
    P.battlerIdentity = battler => battler?.isActor?.()?{kind:'actors',id:battler.actorId(),classId:battler.currentClass?.()?.id||0}:{kind:'enemies',id:battler?.enemyId?.(),classId:0};
    P.graphicFor = battler => {
        if(!battler)return null;const {kind,id}=P.battlerIdentity(battler),config=P.settings[kind]?.[id]?.graphic;
        if(!config?.mode||config.mode==='auto'||config.mode==='model')return null;
        let graphic=B.graphic(P.settings,kind,id,battler.actor?.()||battler.enemy?.());
        if(graphic.type==='character'&&battler.isDead?.()&&graphic.damagedName)graphic={...graphic,name:graphic.damagedName,index:graphic.damagedIndex||0,direction:graphic.damagedDirection||2};
        const states=(battler.states?.()||[]).map(state=>({priority:state.priority,...P.settings.states?.[state.id]?.graphicMotion})).sort((a,b)=>(b.priority||0)-(a.priority||0));
        const state=states.find(state=>state.motion||state.index!==undefined),name=P.battlerState(battler,{}),speed=(graphic.motions?.[name]?.speed||graphic.speed||12)*states.reduce((n,state)=>n*(state.speedMultiplier||1),1);
        if(state||states.some(state=>state.speedMultiplier))graphic={...graphic,motions:{...graphic.motions,[name]:{...graphic.motions?.[name],...(state?{index:state.index??B.spriteMotions[state.motion]??1,frames:state.frames||undefined,direction:state.direction||undefined,loop:state.loop??true}:{}),speed:Math.max(1,state?.speed||speed)}}};
        return graphic;
    };
    P.requestGraphicMotion = (sprite,name) => {sprite._rrGraphicMotion={name,start:sprite._rrGraphicFrame||0};};
    // The engine asks an undecided side-view actor for 'walk' and a decided one for 'wait': the idle bob of a side-view sheet. On a character sheet those are the walk cycle, so a battler drawn from one stands still on them unless a sequence or battler state is the one asking.
    P.engineMotion = (sprite,name) => {
        if(name!=='walk'&&name!=='wait')return name;
        const battler=sprite._battler||sprite._actor||sprite._enemy;if(P.graphicFor(battler)?.type!=='character')return name;
        if(sprite._rrStatePlayer||root.BattleManager?._reactorSequence?.adapter?.owns?.(sprite))return name;
        return 'idle';
    };
    // Whether the project wrote a sequence for this battler's state (through its own binding, its class, or a state it is under).
    P.authoredState=(battler,state)=>{const identity=P.battlerIdentity?.(battler);if(!identity||!P.settings)return false;return !!B.resolveState(P.settings,P.sequences,identity.kind,identity.id,state,identity.classId,null,(battler.states?.()||[]).map(s=>s.id));};
    P.battlerState = (battler,sprite) => {
        if(battler.isDead?.())return 'dead';
        const index=battler.stateMotionIndex?.();if(index===2)return 'sleep';if(index===1)return 'abnormal';
        if(battler.isGuard?.()||battler.isGuardWaiting?.())return 'guard';
        if(battler.isChanting?.())return 'chant';
        if(battler.isDying?.())return 'dying';
        if(sprite.isMoving?.())return 'moving';
        if(battler.isInputting?.())return 'input';
        if(battler.isActing?.())return 'ready';
        return 'idle';
    };
    P.updateGraphicBitmap = (sprite,graphic,kind) => {
        const key=JSON.stringify(graphic),main=sprite._mainSprite||sprite;
        if(sprite._rrGraphicKey!==key){
            if(sprite._reactorBattler){root.Reactor3D?.releaseBattlerState?.(sprite._reactorBattler);sprite._reactorBattler=null;}
            sprite._rrGraphicBaseScale||={x:main.scale.x,y:main.scale.y,offsetY:main.y||0};
            sprite._rrGraphicKey=key;sprite._rrGraphicFrame=0;
            if(sprite._shadowSprite)sprite._shadowSprite.visible=!graphic.hideShadow;
            main.bitmap=graphic.name?ImageManager.loadBitmap('img/'+graphic.folder+'/',graphic.name):new Bitmap(1,1);
            const scale=Math.max(.1,Math.min(10,graphic.scale||1));
            // A side-view sheet drawn for an enemy is mirrored to face the party; a character sheet turns by row and is never mirrored.
            main.scale?.set(scale*(graphic.mirror?-1:1)*(kind==='enemies'&&graphic.type!=='static'&&graphic.type!=='character'?-1:1),scale);
            if(kind==='enemies'){sprite.initVisibility?.();sprite.setHue?.(sprite._enemy.battlerHue?.()||0);}
        }
    };
    P.updateGraphicFrame = (sprite,graphic) => {
        const main=sprite._mainSprite||sprite,bitmap=main.bitmap;if(!bitmap?.isReady?.()||!bitmap.width||!bitmap.height)return;
        const battler=sprite._actor||sprite._enemy,time=sprite._rrGraphicFrame||0;
        let motion=sprite._rrGraphicMotion;
        if(motion){const mapping=graphic.motions?.[motion.name]||{},length=(mapping.frames||graphic.frames||3)*(mapping.speed||graphic.speed||12);
            if(mapping.loop!==true&&mapping.loop!=='once'&&time-motion.start>=length&&!['idle','moving','walk','run','guard','chant','victory','dead'].includes(motion.name))sprite._rrGraphicMotion=motion=null;}
        const override=sprite._rrMotionOverride;if(override&&motion?.name===override.name)graphic={...graphic,motions:{...graphic.motions,[override.name]:{...graphic.motions?.[override.name],...override}}};
        const held=sprite._rrHeldPose,facingYaw=sprite._reactorRoomPosition?.facing??P.spriteYaw(sprite);
        const frame=B.graphicFrame(graphic,bitmap.width,bitmap.height,held?.motion||motion?.name||P.battlerState(battler,sprite),held?held.frame*(graphic.speed||12):motion?time-motion.start:time,facingYaw);
        if(main!==sprite)main.y=-(graphic.offsetY||0);
        main.setFrame(frame.x,frame.y,frame.width,frame.height);
        if(main!==sprite)sprite.setFrame(0,0,frame.width,frame.height);
    };
    P.installGraphics = () => {
        for(const [Class,kind] of [[root.Sprite_Actor,'actors'],[root.Sprite_Enemy,'enemies']])if(Class){
            const bitmap=Class.prototype.updateBitmap,frame=Class.prototype.updateFrame,update=Class.prototype.update,motion=Class.prototype.startMotion;
            Class.prototype.updateBitmap=function(...args){const g=P.graphicFor(this._actor||this._enemy);if(g){P.updateGraphicBitmap(this,g,kind);return;}if(this._rrGraphicKey){const main=this._mainSprite||this,old=this._rrGraphicBaseScale;if(old){main.scale.set(old.x,old.y);main.y=old.offsetY;}this._rrGraphicKey=null;this._rrGraphicBaseScale=null;this._battlerName='';}return bitmap?.apply(this,args);};
            Class.prototype.updateFrame=function(...args){const g=P.graphicFor(this._actor||this._enemy);if(g){P.updateGraphicFrame(this,g);return;}return frame?.apply(this,args);};
            Class.prototype.startMotion=function(name){P.requestGraphicMotion(this,P.engineMotion(this,name));return motion?.call(this,name);};
            Class.prototype.update=function(...args){this._rrGraphicFrame=(this._rrGraphicFrame||0)+1;const result=update?.apply(this,args);if(kind==='enemies'&&P.graphicFor(this._enemy)&&this._enemy?.isWeaponAnimationRequested?.()){if(P.graphicFor(this._enemy).showWeapon!==false){if(!this._rrWeaponSprite){this._rrWeaponSprite=new Sprite_Weapon();this.addChild(this._rrWeaponSprite);}this._rrWeaponSprite.setup(this._enemy.weaponImageId());}this._enemy.clearWeaponAnimation();}return result;};
        }
        if(root.Game_Enemy){
            const proto=Game_Enemy.prototype,weapons=proto.weapons,animation=proto.attackAnimationId1,perform=proto.performAttack;
            proto.weapons=function(){const g=P.settings.enemies?.[this.enemyId()]?.graphic;return g?.weaponIds?.length?g.weaponIds.map(id=>$dataWeapons[id]).filter(Boolean):weapons?.call(this)||[];};
            proto.attackAnimationId1=function(){return P.settings.enemies?.[this.enemyId()]?.graphic?.attackAnimationId||this.weapons()[0]?.animationId||animation?.call(this)||0;};
            proto.performAttack=function(){const g=P.settings.enemies?.[this.enemyId()]?.graphic;if(g?.mode&&g.mode!=='auto'){this.requestMotion?.('thrust');if(g.showWeapon!==false){const type=this.weapons()[0]?.wtypeId,motion=$dataSystem.attackMotions?.[type];if(motion)this.startWeaponAnimation?.(motion.weaponImageId);}return;}return perform?.call(this);};
        }
        // The stock side-view step (48 px forward while inputting or acting, back home after, the retreat on escape) belongs to sprite-sheet actors with no authored states. A battler drawn from a native graphic, or one whose input state is authored, is placed by its sequences alone.
        if(root.Sprite_Actor){const target=Sprite_Actor.prototype.updateTargetPosition;Sprite_Actor.prototype.updateTargetPosition=function(...args){const actor=this._actor;if(actor&&(P.graphicFor(actor)||P.authoredState(actor,'input')))return;return target?.apply(this,args);};}
        if(root.Sprite_Actor){const setup=Sprite_Actor.prototype.setupWeaponAnimation;Sprite_Actor.prototype.setupWeaponAnimation=function(){if(P.graphicFor(this._actor)?.showWeapon===false){this._actor.clearWeaponAnimation?.();return;}return setup?.call(this);};}
        if(root.Game_Actor){const visible=Game_Actor.prototype.isSpriteVisible;Game_Actor.prototype.isSpriteVisible=function(){const g=P.settings.actors?.[this.actorId()]?.graphic;return g?.mode&&g.mode!=='auto'?true:visible.call(this);};}
        for(const Class of [root.Game_Actor,root.Game_Enemy])if(Class){
            const methods={performDamage:'damage',performEvasion:'evade',performMagicEvasion:'magicEvade',performCollapse:'collapse',performVictory:'victory',performEscape:'escape'};
            for(const [method,name] of Object.entries(methods)){const prior=Class.prototype[method];Class.prototype[method]=function(...args){const result=prior?.apply(this,args),sprite=SceneManager._scene?._spriteset?.findTargetSprite(this);if(sprite)P.requestGraphicMotion(sprite,name);this._rrReaction=name;return result;};}
            const perform=Class.prototype.performAction;Class.prototype.performAction=function(action){const result=perform?.call(this,action),sprite=SceneManager._scene?._spriteset?.findTargetSprite(this);if(sprite)P.requestGraphicMotion(sprite,action.isAttack?.()?'attack':action.isGuard?.()?'guard':action.isItem?.()?'item':action.isMagical?.()?'cast':'skill');return result;};
        }
    };
    P.cancelStates=ss=>{for(const sprite of ss?.battlerSprites?.()||[]){sprite._rrStatePlayer?.cancel();sprite._rrStatePlayer=null;}};
    // Pictures a battler state left on its sprite go at the end of the battle.
    P.clearBattlerLayers=ss=>{for(const sprite of ss?.battlerSprites?.()||[]){for(const entry of sprite._rrLayers?.values()||[]){entry.graphic.removeFromParent();entry.graphic.destroy();}sprite._rrLayers=null;}};
    P.updateStates=ss=>{
        for(const sprite of ss.battlerSprites?.()||[]){
            const battler=sprite._battler||sprite._actor||sprite._enemy;if(!battler)continue;
            if(BattleManager._reactorSequence?.adapter.owns(sprite)){sprite._rrStatePlayer?.cancel();sprite._rrStatePlayer=null;continue;}
            const identity=P.battlerIdentity(battler),state=battler._rrReaction||(sprite._rrStatePlayer&&!['idle','moving','input','ready','chant','guard','abnormal','sleep','dying','dead'].includes(sprite._rrStateName)?sprite._rrStateName:!sprite._rrEntered?'entry':P.battlerState(battler,sprite));
            const reaction=!!battler._rrReaction||!sprite._rrEntered;sprite._rrEntered=true;
            if(battler._rrReaction)delete battler._rrReaction;
            if(state!==sprite._rrStateName||reaction){sprite._rrStatePlayer?.cancel();sprite._rrStatePlayer=null;sprite._rrStateName=state;sprite._rrStateFinished=false;}
            if(!sprite._rrStatePlayer&&!sprite._rrStateFinished){
                const action=BattleManager._action,item=action?.item?.(),binding=item?P.settings[DataManager.isSkill(item)?'skills':'items']?.[item.id]:null;const sequence=B.resolveState(P.settings,P.sequences,identity.kind,identity.id,state,identity.classId,binding,(battler.states?.()||[]).map(s=>s.id));
                if(sequence){const manager={_spriteset:ss,_targets:[],_logWindow:BattleManager._logWindow};sprite._rrStatePlayer=new B.Player(sequence,P.adapter(manager,battler,[],true));}
                else sprite._rrStateFinished=true;
            }
            const player=sprite._rrStatePlayer;if(player){try{player.update();}catch(error){P.warn(error);player.cancel();}if(player.done){sprite._rrStatePlayer=null;sprite._rrStateFinished=!['idle','moving','input','ready','chant','guard','abnormal','sleep','dying','dead'].includes(state);}}
        }
    };
    P.install=function(){
        if(P.installed)return;P.installed=true;P.installActionRules();P.installRoomAnchors();P.installSequenceAnimations();P.installBattlebackLoading();P.installPartyLimit();P.installRoomEvents?.();P.installPsychronicHud();P.installCommandWindowAnchor();P.installMogHudNames();
        for(const [Class,kind] of [[root.Sprite_Actor,'actors'],[root.Sprite_Enemy,'enemies']])if(Class){
            const updateBitmap=Class.prototype.updateBitmap;
            Class.prototype.updateBitmap=function(...args){
                const battler=this._actor||this._enemy;if(battler){
                    if(Reactor3D.isDatabaseSidecarReady&&!Reactor3D.isDatabaseSidecarReady()){const main=this._mainSprite||this;if(!main.bitmap)main.bitmap=new Bitmap(1,1);return;}
                    const spec=kind==='actors'?Reactor3D.actorSlotSpec(battler.actorId(),'battler'):Reactor3D.databaseModelSpec('enemies',battler.enemyId());
                    if(spec){const result=modelBitmapUpdates[kind].apply(this,args);if(this._reactorBattler?.ready)root.ReactorBattleRoomView.prepareMotions(this._reactorBattler);return result;}
                }
                return updateBitmap.apply(this,args);
            };
        }
        P.installGraphics();
        const escapeFail=BattleManager.onEscapeFailure;if(escapeFail)BattleManager.onEscapeFailure=function(...args){const result=escapeFail.apply(this,args);for(const actor of $gameParty.battleMembers())actor._rrReaction='escapeFail';return result;};
        const start=BattleManager.startAction,update=BattleManager.updateAction,end=BattleManager.endBattle;
        const beginCamera=manager=>{const ss=manager._spriteset;ss?._reactorRoom?.beginCinematicAction?.(ss.findTargetSprite(manager._subject)?._reactorRoomKey,(manager._targets||[]).map(b=>ss.findTargetSprite(b)?._reactorRoomKey).filter(Boolean));};
        const invoke=BattleManager.invokeAction,endAction=BattleManager.endAction;
        BattleManager.invokeAction=function(...args){this._spriteset?._reactorRoom?.cinematicImpact?.();return invoke.apply(this,args);};
        BattleManager.endAction=function(...args){try{return endAction.apply(this,args);}finally{this._spriteset?._reactorRoom?.endCinematicAction?.();}};
        const logStart=Window_BattleLog.prototype.startAction;
        Window_BattleLog.prototype.startAction=function(subject,action,targets){
            if(BattleManager._reactorStarting){this.displayAction(subject,action.item());return;}
            return logStart.call(this,subject,action,targets);
        };
        // PSYCHRONIC's action choice is the extension point; its remaining
        // battle rules and result resolver remain active.
        const choose=BattleManager.shouldUseActionSequence;
        if(choose)BattleManager.shouldUseActionSequence=function(action){return this._reactorStarting?false:choose.call(this,action);};
        BattleManager.startAction=function(){
            const subject=this._subject,action=subject?.currentAction();
            const sequence=action&&P.sequence(subject,action),problem=sequence&&P.compatibility();
            if(problem)P.warn(problem);
            if(!sequence||problem){const result=start.call(this);beginCamera(this);return result;}
            P.cancelStates(this._spriteset);this._reactorSequence?.cancel();this._reactorStarting=true;
            try{start.call(this);}finally{this._reactorStarting=false;}
            const adapter=P.adapter(this,subject,this._targets.slice());adapter.hitPolicy=sequence.hitPolicy;this._reactorSequence=new B.Player(sequence,adapter);beginCamera(this);
        };
        BattleManager.updateAction=function(){
            const player=this._reactorSequence;
            if(!player)return update.call(this);
            try{if(player.adapter.pendingImpact){player.adapter.resolveNext();return;}player.update(1);}catch(error){P.warn(error);player.cancel();}
            if(player.done&&!player.adapter.pendingImpact){this._reactorSequence=null;this.endAction();}
        };
        BattleManager.endBattle=function(...args){P.cancelStates(this._spriteset);this._spriteset?._reactorRoom?.endCinematicAction?.();this._reactorSequence?.cancel();this._reactorSequence=null;return end.apply(this,args);};
        const force=BattleManager.forceAction;
        BattleManager.forceAction=function(...args){this._spriteset?._reactorRoom?.endCinematicAction?.();if(this._reactorSequence){this._reactorSequence.cancel();this._targets=[];}this._reactorSequence=null;return force.apply(this,args);};
        const create=Scene_Battle.prototype.create,ready=Scene_Battle.prototype.isReady,terminate=Scene_Battle.prototype.terminate;
        Scene_Battle.prototype.create=function(){
            const config=P.settings.troops?.[$gameTroop._troopId];
            this._reactorUsesBattleRoom=config?.type==='room';
            const previous=P._creatingBattleRoom;P._creatingBattleRoom=this._reactorUsesBattleRoom;
            try{create.call(this);}finally{P._creatingBattleRoom=previous;}
            this._reactorRoomLoading=false;
            if(config?.type==='room'&&config.mapId>0){this._reactorRoomLoading=true;this._reactorRoomToken={};const token=this._reactorRoomToken;
                P.createRoom(this,config,token).catch(P.warn).finally(()=>{if(this._reactorRoomToken===token)this._reactorRoomLoading=false;});}
        };
        Scene_Battle.prototype.isReady=function(){return !this._reactorRoomLoading&&ready.call(this);};
        Scene_Battle.prototype.terminate=function(){P.cancelStates(this._spriteset);P.clearBattlerLayers(this._spriteset);this._reactorRoomToken=null;this._spriteset?._reactorRoom?.dispose();BattleManager._reactorSequence?.cancel();BattleManager._reactorSequence=null;return terminate.call(this);};
        const updateSprites=Spriteset_Battle.prototype.update;
        Spriteset_Battle.prototype.update=function(){updateSprites.call(this);P.updateStates(this);if(this._reactorRoom)P.updateRoom(this);else for(const update of this._rrSequenceVisualUpdates||[])update();};
        PluginManager.registerCommand('RPGReactor','BattleSequenceSkip',()=>{const player=BattleManager._reactorSequence;if(player){player.skip();while(player.adapter.pendingImpact)player.adapter.resolveNext();}});
        PluginManager.registerCommand('RPGReactor','BattleRoomCamera',function(args){const room=SceneManager._scene?._spriteset?._reactorRoom;if(room){Object.assign(room.settings.camera,room.cameraState());room.settings.cameraSource='custom';for(const key of ['x','y','z','yaw','pitch','distance'])if(args[key]!==undefined&&Number.isFinite(Number(args[key])))room.settings.camera[key]=Number(args[key]);}});
    };
    /**
     * The models a battle may throw or hold, asked for before the fight so
     * the first throw does not fly for its twenty frames while a 10 MB model
     * is still loading and never appears. Every model a sequence names
     * outright, every party weapon's bound model, and the bound model of
     * every skill and item the party can use; the loader caches templates,
     * so a model is read once for the whole game.
     */
    P.preloadBattleModels=function(){
        const R=root.Reactor3D;if(!R?.loadModel)return;
        const specs=[],seen=new Set();
        const add=spec=>{if(!spec?.name)return;const key=[spec.name,spec.ext,spec.file].join('|');if(seen.has(key))return;seen.add(key);specs.push(spec);};
        for(const sequence of P.sequences||[])for(const step of sequence?.steps||[])if(step&&['weapon','projectile'].includes(step.type)&&step.model?.name)add(R.normalizeModelSpec?R.normalizeModelSpec(step.model):step.model);
        if(R.databaseModelSpec){
            for(const actor of $gameParty?.battleMembers?.()||[]){
                for(const weapon of actor.weapons?.()||[])add(R.databaseModelSpec('weapons',weapon.id));
                for(const skill of actor.skills?.()||[])add(R.databaseModelSpec('skills',skill.id));
            }
            for(const item of $gameParty?.items?.()||[])add(R.databaseModelSpec('items',item.id));
        }
        for(const spec of specs)Promise.resolve(R.loadModel(spec.name,spec.ext,spec.file,spec.texture)).catch(P.warn);
    };
    P.createRoom=async function(scene,config,token){
        const map=await P.json('data/Map'+String(config.mapId).padStart(3,'0')+'.json');
        map.reactor3d=await P.json('data/Map'+String(config.mapId).padStart(3,'0')+'.r3d.json',true)||{};
        Reactor3D.ensureLoaded();const until=Date.now()+20000;while(!Reactor3D.isLoaded()){if(Date.now()>until)throw Error('3D libraries did not load');await new Promise(r=>setTimeout(r,30));}
        if(scene._reactorRoomToken!==token)return;
        const room=new ReactorBattleRoomView(map,$dataTilesets[map.tilesetId],JSON.parse(JSON.stringify(config)),P.assets);
        P.preloadBattleModels();
        try{await room.build();if(scene._reactorRoomToken!==token){room.dispose();return;}
            const ss=scene._spriteset;room.resize(Graphics.width,Graphics.height);
            const sprite=new Sprite(new Bitmap(Graphics.width,Graphics.height));ss._baseSprite.addChildAt(sprite,Math.max(0,ss._baseSprite.children.indexOf(ss._battleField)));
            ss._reactorRoom=room;ss._reactorRoomSprite=sprite;P.setupRoomEvents?.(room,ss);
            for(const bg of [ss._backgroundSprite,ss._back1Sprite,ss._back2Sprite])if(bg)bg.visible=false;
        }catch(error){room.dispose();const ss=scene._spriteset;if(ss?._reactorRoom===room){ss._reactorRoom=null;const sprite=ss._reactorRoomSprite;sprite?.removeFromParent();sprite?.bitmap?.destroy();sprite?.destroy();ss._reactorRoomSprite=null;}throw error;}
    };
    P.updateRoom=function(ss){
        const room=ss._reactorRoom;if(room.disposed)return;
        room.aim();const live=new Set();
        for(const sprite of ss.battlerSprites()){
            const battler=sprite._battler;if(!battler)continue;
            const actor=battler.isActor(),index=actor?$gameParty.battleMembers().indexOf(battler):battler.index();
            const key=(actor?'actor:':'enemy:')+index;live.add(key);
            sprite._reactorRoomKey=key;
            if(!sprite._reactorRoomPosition)sprite._reactorRoomPosition=B.position(room.settings,actor?'actors':'enemies',index);
            const p=sprite._reactorRoomPosition;
            const spec=actor?Reactor3D.actorSlotSpec(battler.actorId(),'battler'):Reactor3D.databaseModelSpec('enemies',battler.enemyId());
            const main=sprite._mainSprite||sprite;
            if(spec){if(room.billboards.has(key))room.remove(key);room.addModel(key,spec,p);room.place(key,p);}
            else {if(room.models.has(key))room.remove(key);}
            if(!spec&&main.bitmap?.isReady())room.billboard(key,main.bitmap.canvas,main._frame,{...p,flipX:actor?p.facing>0:p.facing<0},Math.max(.5,main._frame.height/48));
            const record=room.models.get(key)||room.billboards.get(key);
            if(record?.object)P.mirrorSpriteLook(sprite,battler,record);
            const projected=P.roomScreenPosition(sprite);if(projected){sprite.x=projected.x;sprite.y=projected.y;}
            if(main.texture)main.texture=PIXI.Texture.EMPTY;
        }
        for(const key of [...room.models.keys(),...room.billboards.keys()])if(!key.startsWith('prop:')&&!key.startsWith('event:')&&!key.startsWith('extra:')&&!live.has(key))room.remove(key);
        P.updateRoomEvents?.(room);room.render();for(const sprite of ss.battlerSprites())if(sprite._reactorRoomKey)P.publishRoomBounds(sprite,room,sprite._reactorRoomKey);const bitmap=ss._reactorRoomSprite.bitmap;bitmap.context.drawImage(room.renderer.domElement,0,0);bitmap.baseTexture.update();
    };
})(globalThis);
