/* A battle-owned map viewport. No exploration globals or live map events are replaced. */
(function(root) {
    'use strict';
    class BattleRoomView {
        constructor(map, tileset, settings, assets) {
            this.map = map; this.tileset = tileset; this.settings = settings; this.assets = assets;
            this.models = new Map(); this.billboards = new Map(); this.disposed = false; this.frame = 0; this.effectPlays = new Map();
        }
        async build() {
            const R = root.Reactor3D, T = root.THREE;
            const sheets = await Promise.all(this.tileset.tilesetNames.map(name => name ? this.assets.image('tilesets', name) : null));
            const parallaxes = new Map();
            const names = new Set([this.map.parallaxName, ...R.parallaxGroundLayers(this.map).map(p => p.name)]);
            const room = R.roomFor(this.map);
            if (room) for (const value of [room.floor, room.walls, room.ceiling]) if (typeof value === 'string') names.add(value);
            await Promise.all([...names].filter(Boolean).map(async name => parallaxes.set(name, await this.assets.image('parallaxes', name))));
            if (this.disposed) return false;
            // Geometry's published map caches are legacy lookup accelerators.
            // Preserve them while building our own scene, whose data stays local.
            const keys = ['_surface','_facade','_eventProps','BILLBOARD_TILT'];
            const saved = keys.map(key => R[key]);
            try {
                this.world = new R.MapScene(this.map, sheets, { flags: this.tileset.flags, tilesetId: this.tileset.id,
                    tileSize: this.assets.tileSize || 48, loadParallax: name => parallaxes.get(name) });
            } finally { keys.forEach((key, i) => R[key] = saved[i]); }
            this.world.setPass('all'); this.scene = this.world.scene();
            this.scene.background = new T.Color(0x171a21);
            this.camera = this.settings.projection === '2d' ? new T.OrthographicCamera(-12,12,7,-7,.1,2000) : R.createCamera({ fov: 40 });
            this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
            this.renderer.setPixelRatio(1); this.resize(960, 540);
            this.uniforms = {
                rrLightCount: {value:0}, rrAmbient:{value:new Float32Array([1,1,1])},
                rrLightPos:{value:new Float32Array(R.SHADER_LIGHTS*4)}, rrLightColor:{value:new Float32Array(R.SHADER_LIGHTS*4)},
                rrLightAim:{value:new Float32Array(R.SHADER_LIGHTS*4)}, rrLightShadow:{value:new Float32Array(R.SHADER_LIGHTS).fill(-1)},
                rrLightGridEnabled:{value:0}
            };
            this.light(this.scene);
            await Promise.all(R.mapProps(this.map).map(prop => this.addModel('prop:'+prop.id, prop, prop)));
            this.buildMapMedia();
            this.render(); return true;
        }
        light(object) {
            const R = root.Reactor3D, uniforms = this.uniforms;
            object.traverse(node => {
                for (const material of [node.material].flat().filter(Boolean)) {
                    if (material.__battleRoomLight) continue;
                    R.litMaterial(material);
                    const compile = material.onBeforeCompile, key = material.customProgramCacheKey;
                    material.onBeforeCompile = function(shader, renderer) { compile.call(this, shader, renderer); Object.assign(shader.uniforms, uniforms); };
                    material.customProgramCacheKey = function() { return key.call(this) + '|battle-room'; };
                    material.__battleRoomLight = true; material.needsUpdate = true;
                }
            });
        }
        static prepareMotions(record) {
            if (!record?.binding || record._battleMotionsReady) return;
            record._battleMotionsReady=true;
            const R=root.Reactor3D,T=root.THREE,binding=record.binding;
            record.rules=record.rules.slice();binding.clips=binding.clips.slice();
            const has=name=>record.rules.some(r=>r.trigger==='action'&&r.name.toLowerCase()===name);
            const attackFallback=()=>{const punch=record.rules.find(r=>r.trigger==='action'&&r.name.toLowerCase()==='punch');if(punch&&!has('attack'))record.rules.push({...punch,name:'attack'});};attackFallback();
            for(const [name,trigger] of [['run','dashing'],['walk','walking']]) {
                const rule=record.rules.find(r=>r.type==='clip'&&r.trigger===trigger)||record.rules.find(r=>r.type==='clip'&&r.trigger==='moving');
                if(rule&&!has(name))record.rules.push({...rule,name,trigger:'action',repeat:true});
            }
            if(has('punch')&&has('item'))return;
            // Build one short jab for an available humanoid skeleton. Authored
            // Punch action rules win; these tracks live on this instance only.
            const bones=new Set();record.object.traverse(node=>{if(node.isSkinnedMesh)for(const bone of node.skeleton.bones)bones.add(bone);});
            const find=names=>[...bones].find(b=>names.some(name=>b.name.toLowerCase().replace(/^.*[:|]/,'')===name.toLowerCase()));
            const arm=find(['RightArm','RightUpperArm']),fore=find(['RightForeArm','RightLowerArm']),hand=find(['RightHand']);
            if(!arm||!fore||!hand||fore.parent!==arm||hand.parent!==fore)return;
            record.object.updateMatrixWorld(true);
            const worldQ=node=>node.getWorldQuaternion(new T.Quaternion());
            const rootQ=worldQ(record.object),armParent=worldQ(arm.parent),restArm=worldQ(arm),restFore=worldQ(fore);
            const direction=(a,b)=>b.getWorldPosition(new T.Vector3()).sub(a.getWorldPosition(new T.Vector3())).normalize();
            const upperDir=direction(arm,fore),lowerDir=direction(fore,hand);
            const pose=(upper,lower)=>{
                const aq=new T.Quaternion().setFromUnitVectors(upperDir,new T.Vector3(...upper).normalize().applyQuaternion(rootQ)).multiply(restArm);
                const fq=new T.Quaternion().setFromUnitVectors(lowerDir,new T.Vector3(...lower).normalize().applyQuaternion(rootQ)).multiply(restFore);
                return [armParent.clone().invert().multiply(aq),aq.clone().invert().multiply(fq)];
            };
            const windup=pose([0,-.8,.45],[0,.55,.8]),contact=pose([0,-.12,1],[0,-.02,1]);
            const times=[0,8/60,16/60,20/60,36/60],rest=[arm.quaternion.clone(),fore.quaternion.clone()];
            const add=(name,clipName,times,poses)=>{
                if(has(name))return;
                const tracks=[arm,fore].map((bone,i)=>new T.QuaternionKeyframeTrack(bone.uuid+'.quaternion',times,poses.map(p=>p[i]).flatMap(q=>q.toArray())));
                const clip=new T.AnimationClip(clipName,times.at(-1),tracks);binding.clips.push(clip);
                if(!binding.mixer)binding.mixer=new T.AnimationMixer(binding.root);
                record.rules.push(...R.readModelAnimationRules({animations:[{type:'clip',trigger:'action',name,clip:clip.name}]}));
            };
            add('punch','__reactor_unarmed_punch',times,[rest,windup,contact,contact,rest]);
            // The item starter releases at frame 12. Authored item motions win.
            const raised=pose([0,-.4,.8],[0,.9,.25]),release=pose([0,-.1,1],[0,.05,1]);
            add('item','__reactor_item_toss',[0,6/60,12/60,24/60],[rest,raised,release,rest]);attackFallback();
        }
        async addModel(key, spec, position) {
            const R = root.Reactor3D;
            if(this.disposed)return;const existing=this.models.get(key);if(existing){if(['name','ext','file','texture','size','scale'].every(k=>existing.spec[k]===spec[k]))return;this.remove(key);}
            const record = { spec, position: {...position}, object:null };
            this.models.set(key, record);
            try {
                const {template, sidecar} = await this.assets.model(spec);
                if (this.disposed || this.models.get(key) !== record || !template) return;
                const object = R.cloneModelTemplate(template);
                R.applyModelTransform(object, R.readModelTransform(sidecar));
                const rig = R.readModelRig(sidecar);
                if (rig) R.applyModelRig(object, rig);
                else { R.carveModelParts(object, R.readModelParts(sidecar)); R.applyPivotOverrides(object, R.readModelPivots(sidecar)); }
                const e = template.userData.glbSize || {x:1,y:1,z:1};
                record.extent = e;
                record.scale = (spec.size || 2) * (spec.scale || 1) / Math.max(e.x,e.y,e.z,.001);
                object.scale.setScalar(record.scale);
                record.object = object; record.binding = R.prepareModelInstance(object, object.__reactorClips);
                record.rules = R.readModelAnimationRules(sidecar); record.effects = R.readModelEffects(sidecar);
                record.chosenEffects=new Set(R.propEffectList(spec));record.media=new Map();
                if(key.startsWith('prop:')){record.sequence=R.propAnimationList(spec);record.sequenceIndex=0;record.animationStart=this.frame;record.animationFrame=this.frame;}
                if (!key.startsWith('prop:') && !key.startsWith('event:')) BattleRoomView.prepareMotions(record);
                this.light(object); this.scene.add(object); this.place(key, position);
            } catch (error) { record.error = String(error); this.assets.warn?.(error); }
        }
        place(key, position) {
            const record = this.models.get(key) || this.billboards.get(key);
            if (!record) return;
            record.moving=Math.hypot((record.position?.x||0)-position.x,(record.position?.y||0)-position.y)>.001;
            record.position = {...record.position, ...position};
            if (record.object) {
                const p = record.position;
                record.object.position.set(p.x + .5, (p.z || 0) + (record.billboard ? record.height/2 : 0), p.y + .5);
                if (!record.billboard && key.startsWith('prop:')) {
                    // Props store map direction and degree rotations; battler poses
                    // instead combine a normalized model with sequence-facing keys.
                    const R = root.Reactor3D, spec = R.normalizeModelSpec(R.propModelSpec(record.spec));
                    R.applyEventModelPose(record.object, spec, p.direction || 2);
                    const stretch = spec.stretch || [1, 1, 1];
                    record.object.scale.set(...stretch.map(axis => axis * record.scale));
                } else if (!record.billboard) {
                    root.Reactor3D.applyEventModelPose(record.object,
                    {...record.spec,pitch:(record.spec.pitch||0)+(p.rotateX||0)*Math.PI/180,roll:(record.spec.roll||0)+(p.rotateZ||0)*Math.PI/180,yaw:(record.spec.yaw||0)+((p.facing||0)+(p.rotateY||0))*Math.PI/180},2,{preview:true,faceYaw:((p.facing||0)+(p.rotateY||0))*Math.PI/180});
                    record.object.scale.set(...['scaleX','scaleY','scaleZ'].map((axis,i)=>record.scale*(p.scale??1)*(p[axis]??1)*(record.spec.stretch?.[i]??1)));
                    // A held thing turns about its grip, not its feet: a
                    // model stands on its origin, so the point `pivotY` of
                    // the way up it (0 the base, .5 the middle) is brought
                    // to the placed position after the turn.
                    if (p.pivotY !== undefined && record.extent) {
                        const T = root.THREE, lift = (record.extent.y || 0) * Math.max(0, Math.min(1, p.pivotY)) * record.object.scale.y;
                        record.object.position.sub(new T.Vector3(0, lift, 0).applyQuaternion(record.object.quaternion));
                    }
                }
            }
        }
        billboard(key, source, frame, position, height = 2) {
            const T = root.THREE; let r = this.billboards.get(key);
            // Loading battlers may expose a fraction of their 1px placeholder.
            // Canvas dimensions truncate to integers; never upload a zero-size frame.
            const width = Math.floor(frame?.width), heightPx = Math.floor(frame?.height);
            if (!source || !Number.isFinite(width) || !Number.isFinite(heightPx) || width < 1 || heightPx < 1) {
                if (r) r.object.visible = false;
                return;
            }
            if (!r) {
                const canvas = document.createElement('canvas');
                canvas.width = width; canvas.height = heightPx;
                const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
                texture.generateMipmaps = false; texture.minFilter = T.LinearFilter;
                const material = new T.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.1,side:T.DoubleSide});
                const object = new T.Mesh(new T.PlaneGeometry(1,1),material);
                r = {object,texture,canvas,billboard:true,height}; this.billboards.set(key,r); this.scene.add(object);
            }
            r.object.visible = true;
            if (r.canvas.width !== width || r.canvas.height !== heightPx) { r.canvas.width=width;r.canvas.height=heightPx; }
            const ctx = r.canvas.getContext('2d');ctx.clearRect(0,0,r.canvas.width,r.canvas.height);
            ctx.drawImage(source,frame.x,frame.y,frame.width,frame.height,0,0,width,heightPx);r.texture.needsUpdate=true;
            r.height=height;r.object.scale.set(height*frame.width/frame.height*(position.scale??1)*(position.scaleX??1)*(position.flipX?-1:1),height*(position.scale??1)*(position.scaleY??1),1);
            this.place(key,position);r.object.quaternion.copy(this.camera.quaternion);
        }
        static attachmentWorld(record, attachment, boneName) {
            if(!record?.object||(!boneName&&!['rightHand','leftHand'].includes(attachment)))return null;
            const name=boneName||attachment,cache=record.attachmentBones||=(new Map());
            if(!cache.has(name)){
                const normalize=value=>String(value).toLowerCase().replace(/^.*[:|]/,'').replace(/[^a-z0-9]/g,'');
                const wanted=boneName?[normalize(boneName)]:attachment==='leftHand'?['lefthand','handl','lhand']:['righthand','handr','rhand'];let found=null,any=null;
                // A rigged model keeps the file's own skeleton beside the rig
                // that actually moves it; the rig's bone is the hand that moves.
                record.object.traverse(node=>{if(!wanted.includes(normalize(node.name)))return;if(!any)any=node;if(!found&&(node.userData?.__reactorRigBone||node.userData?.parts?.length))found=node;});cache.set(name,found||any);
            }
            const bone=cache.get(name);if(!bone)return null;
            record.object.updateMatrixWorld(true);return bone.getWorldPosition(new root.THREE.Vector3());
        }
        attachmentPoint(key, step, pose) {
            const record=this.models.get(key)||this.billboards.get(key),p=pose||record?.position||{x:0,y:0,z:0},world=BattleRoomView.attachmentWorld(record,step.attachment,step.bone);
            if(world)return {x:world.x-.5+(step.x||0)*Math.sign(p.facing||1),y:world.z-.5+(step.y||0),z:world.y+(step.z||0)};
            const height=record?.billboard?record.height*(p.scale||1):(record?.spec?.size||2)*(p.scale||1),width=record?.billboard?height*record.canvas.width/record.canvas.height:height*.5;
            return root.ReactorBattleData.attachmentPoint(p,step,width,height);
        }
        sequenceBillboard(key,source,frame,point,step={}) {
            const scale=step.scale??1,height=frame.height/48*scale,width=frame.width/48*scale;
            this.billboard(key,source,frame,{x:point.x,y:point.y,z:point.z-height/2,rotateZ:-(step.rotation||0),flipX:!!step.flipX},height);
            const record=this.billboards.get(key);if(!record)return;
            const q=this.camera.quaternion.clone().multiply(new root.THREE.Quaternion().setFromAxisAngle(new root.THREE.Vector3(0,0,1),-(step.rotation||0)*Math.PI/180));
            const offset=new root.THREE.Vector3((.5-(step.gripX??.5))*width,((step.gripY??.5)-.5)*height,0).applyQuaternion(q);record.object.position.add(offset);
            record.object.material.opacity=step.opacity??1;record.object.visible=step.visible!==false;
        }
        remove(key) {
            const r = this.models.get(key) || this.billboards.get(key); if (!r) return;
            for (const [id, play] of this.effectPlays) if (play.owner === r) { this.stopEffect(play); this.effectPlays.delete(id); }
            for(const media of r.media?.values()||[])this.stopMedia(media);
            this.models.delete(key);this.billboards.delete(key);
            r.object?.removeFromParent();r.binding?.mixer?.stopAllAction?.();
            r.object?.traverse(node => {for(const m of [node.material].flat().filter(Boolean))m.dispose();});
            if(r.billboard){r.object.geometry.dispose();r.texture.dispose();}
        }
        resize(width,height) { this.width=width;this.height=height;this.renderer?.setSize(width,height,false); if(this.camera){this.camera.aspect=width/height;this.camera.updateProjectionMatrix();} }
        cinematicEnabled(){return this.settings.cameraSource==='custom'&&this.settings.camera?.mode==='cinematic';}
        beginCinematicAction(user,targets){
            if(!this.cinematicEnabled()||!user){this.cinematicShot=null;this.cinematicTransition=null;return;}
            const position=key=>(this.models.get(key)||this.billboards.get(key))?.position;
            const a=position(user),b=position(targets[0]);if(!a)return;
            this.cinematicTransition={from:this.cameraState(),start:this.frame,duration:30};
            this.cinematicShot={phase:'actor',start:this.frame,user,targets:[...new Set(targets)],yaw:b?root.ReactorBattleData.facingToward(a,b):a.facing||0};
        }
        cinematicImpact(){
            if(!this.cinematicShot||this.cinematicShot.phase==='impact')return;
            this.cinematicTransition={from:this.cameraState(),start:this.frame,duration:24};
            this.cinematicShot.phase='impact';this.cinematicShot.start=this.frame;
        }
        endCinematicAction(){
            if(!this.cinematicShot)return;
            this.cinematicTransition=this.cinematicEnabled()?{from:this.cameraState(),start:this.frame,duration:42}:null;
            this.cinematicShot=null;
        }
        cinematicBlend(target){
            const transition=this.cinematicTransition;if(!transition)return target;
            const t=Math.max(0,Math.min(1,(this.frame-transition.start)/transition.duration));
            if(t===1)return target;
            const ease=t*t*(3-2*t),from=transition.from,result={...target};
            for(const key of ['x','y','z','pitch','distance','fov'])result[key]=from[key]+(target[key]-from[key])*ease;
            // Interpolate the short arc across +/-180, never spin around the room.
            const arc=((target.yaw-from.yaw)%360+540)%360-180;
            result.yaw=from.yaw+arc*ease;
            return result;
        }
        cinematicCamera(base){
            if(!this.cinematicEnabled()){this.cinematicTransition=null;return base;}
            const shot=this.cinematicShot;if(!shot)return this.cinematicBlend(base);
            const record=key=>this.models.get(key)||this.billboards.get(key),user=record(shot.user);
            const targets=shot.targets.map(record).filter(r=>r?.position),focus=shot.phase==='impact'&&targets.length?targets:[user];
            if(!focus[0]?.position)return this.cinematicBlend(base);
            // Frame the whole affected group for area attacks; repeated hits
            // don't flick through a different camera once per resolver call.
            const points=focus.map(r=>r.position),x=points.reduce((n,p)=>n+p.x,0)/points.length,y=points.reduce((n,p)=>n+p.y,0)/points.length;
            const span=Math.max(0,...points.map(p=>Math.hypot(p.x-x,p.y-y)*2));
            const height=Math.max(2,...focus.map(r=>r.spec?(r.spec.size||2)*(r.spec.scale||1)*(r.position.scale||1)*(r.position.scaleY||1):r.height||2));
            const aspect=Math.max(.4,this.width/this.height),distance=Math.max(5,(height+span/Math.min(1,aspect))/(2*Math.tan(base.fov*Math.PI/360))*1.3);
            // A restrained orbit keeps both shots on the same side of the action.
            // Bound the sweep so a long-running action cannot circle the room.
            const age=Math.max(0,this.frame-shot.start),sweep=18*(1-Math.exp(-age/120));
            return this.cinematicBlend({...base,mode:'fixed',x,y,z:points.reduce((n,p)=>n+(p.z||0),0)/points.length+height*.5,yaw:shot.yaw+(shot.phase==='impact'?100:60)+sweep,pitch:20,distance});
        }
        cameraState() {
            const Camera=root.Reactor3D.Camera,stored=this.settings.camera;
            const inherited=this.settings.cameraSource==='map';
            const normal=Camera.normalizeState(inherited?this.map.reactor3d?.camera:stored.mode==='cinematic'?{...stored,mode:'fixed'}:stored),defaults=Camera.MODES[normal.mode];
            const c={...stored,mode:normal.mode,pitch:normal.pitch??defaults.pitch,yaw:normal.yaw??defaults.yaw,fov:normal.fov??defaults.fov};
            c.distance=normal.distance??defaults.distance??((this.assets.screenHeight||624)/(2*(this.assets.tileSize||48)*Math.tan(c.fov*Math.PI/360)));
            if(this.camera.isOrthographicCamera&&inherited)c.distance=normal.distance??(this.assets.screenHeight||624)/(this.assets.tileSize||48);
            if(['thirdPerson','firstPerson'].includes(c.mode)){
                const anchor=this.models.get('actor:0')?.position||this.billboards.get('actor:0')?.position||this.models.get('cast:actors:0')?.position||this.billboards.get('cast:actors:0')?.position||this.settings.actors?.[0]||root.ReactorBattleData?.position(this.settings,'actors',0)||stored;
                c.x=anchor.x;c.y=anchor.y;c.z=(anchor.z||0)+(defaults.lift||0);c.yaw+=(anchor.facing||0);
            }
            return this.cinematicCamera(c);
        }
        aim() {
            const c=this.followCamera(this.cameraState());this.effectiveCamera=c;
            if (this.camera.isOrthographicCamera) {
                const span=Math.max(1,c.distance||24),aspect=this.width/this.height;
                Object.assign(this.camera,{left:-span*aspect/2,right:span*aspect/2,top:span/2,bottom:-span/2});this.camera.updateProjectionMatrix();
            }else if(this.camera.fov!==c.fov){this.camera.fov=c.fov;this.camera.updateProjectionMatrix();}
            if(c.mode==='firstPerson'){
                const yaw=c.yaw*Math.PI/180,pitch=c.pitch*Math.PI/180;
                this.camera.position.set(c.x+.5,c.z||0,c.y+.5);this.camera.lookAt(c.x+.5+Math.sin(yaw)*Math.cos(pitch),(c.z||0)-Math.sin(pitch),c.y+.5+Math.cos(yaw)*Math.cos(pitch));
            }else root.Reactor3D.aimCamera(this.camera,{x:c.x,y:c.z||0,z:c.y},{yaw:c.yaw,pitch:this.camera.isOrthographicCamera?89.99:c.pitch,distance:c.distance});
            this.camera.updateMatrixWorld(true);
        }
        followCamera(target) {
            const previous=this.effectiveCamera;
            // Marker picking must use a stationary camera throughout a drag.
            // Following the dragged marker changes the ray and feeds movement back into itself.
            if (this.cameraFollowFrozen && previous) return {...previous};
            if (!this.cameraFollowResume || target.mode!=='thirdPerson' || previous?.mode!==target.mode) {
                this.cameraFollowResume=false;
                return target;
            }
            const next={...target};
            for (const key of ['x','y','z']) {
                const delta=target[key]-previous[key];
                next[key]=Math.abs(delta)<.001?target[key]:previous[key]+delta*.18;
            }
            const arc=((target.yaw-previous.yaw+540)%360+360)%360-180;
            next.yaw=Math.abs(arc)<.05?target.yaw:previous.yaw+arc*.18;
            if (['x','y','z','yaw'].every(key=>next[key]===target[key])) this.cameraFollowResume=false;
            return next;
        }
        project(position) {
            const p=new root.THREE.Vector3(position.x+.5,position.z||0,position.y+.5).project(this.camera);
            return {x:(p.x+1)*this.width/2,y:(1-p.y)*this.height/2,visible:p.z>=-1&&p.z<=1};
        }
        bounds(key) {
            const record=this.models.get(key)||this.billboards.get(key),object=record?.object,T=root.THREE;if(!object)return null;
            const box=new T.Box3().setFromObject(object);if(box.isEmpty())return null;
            let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
            for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
                const p=new T.Vector3(x,y,z).project(this.camera);if(p.z< -1||p.z>1)return null;
                const sx=(p.x+1)*this.width/2,sy=(1-p.y)*this.height/2;left=Math.min(left,sx);right=Math.max(right,sx);top=Math.min(top,sy);bottom=Math.max(bottom,sy);
            }
            return {x:left,y:top,width:right-left,height:bottom-top};
        }
        pick(x,y,height=0) {
            const T=root.THREE, ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(x/this.width*2-1,1-y/this.height*2),this.camera);
            const point=ray.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),-height),new T.Vector3());
            return point ? {x:point.x-.5,y:point.z-.5,z:0}:null;
        }
        render() {
            if(this.disposed||!this.renderer)return;
            const R=root.Reactor3D;this.frame++;this.aim();for(const r of this.billboards.values()){r.object.quaternion.copy(this.camera.quaternion);r.object.rotateZ((r.position?.rotateZ||0)*Math.PI/180);}this.world.setAnimationFrame(Math.floor(this.frame/30));
            const lights=this.roomLights();let lightSeed=1000;
            for(const r of this.models.values())if(r.object){
                const motion=r.action?.name,rule=r.rules.find(rule=>rule.trigger==='action'&&rule.name.toLowerCase()===motion?.toLowerCase());
                const action=r.sequence?.length?this.propAction(r):r.action?{name:rule?.name||motion,frame:r.action.start}:null;
                if(r.binding&&r.rules.length)R.applyModelAnimation(r.binding,r.rules,{frame:r.sequence?.length?r.animationFrame:this.frame,moving:!!r.moving,dashing:motion==='run',distance:0,scale:r.scale,action,seek:!!this.seekAnimations});
                r.object.updateMatrixWorld(true);
                for(const e of r.effects||[])if(e.type==='light' && this.effectActive(r,e)){
                    const light=R.effectLight(r.object,e);if(light){Object.assign(light,R.animateLight(e.light,this.frame,++lightSeed,light.radius,light.intensity));lights.push(light);}
                }
                this.updateMedia(r);
            }
            if(this.mapMedia)this.updateMedia(this.mapMedia);
            const a=this.map.reactor3d?.lighting||{};
            R.packLightUniforms(lights,{intensity:a.ambient??1,colour:R.parseColour(a.ambientColour??'#ffffff')},this.uniforms);
            this.updateEffects();
            for(const update of this.sequenceVisualUpdates||[])update();
            this.renderer.render(this.scene,this.camera);
        }
        effectActive(record,effect) {
            if(record.chosenEffects?.has(effect.name))return true;
            return effect.trigger==='always'||effect.trigger==='idle'&&!record.moving||['moving','walking','dashing'].includes(effect.trigger)&&!!record.moving&&(effect.trigger!=='dashing'||record.action?.name==='run');
        }
        propAction(record) {
            const R=root.Reactor3D;
            record.animationFrame+=(this.frame-(record.animationRealFrame??this.frame))*(record.spec.animationSpeed??100)/100;record.animationRealFrame=this.frame;
            let name=record.sequence[record.sequenceIndex];if(!name)return null;
            const rule=record.rules.find(rule=>rule.trigger==='action'&&rule.name===name),duration=rule?R.modelRuleDuration(rule,record.binding?.clips):0;
            if(!rule||record.animationFrame-record.animationStart>=duration){
                record.sequenceIndex++;if(record.sequenceIndex>=record.sequence.length&&record.spec.repeat)record.sequenceIndex=0;
                record.animationStart=record.animationFrame;name=record.sequence[record.sequenceIndex];
            }
            return name?{name,frame:record.animationStart}:null;
        }
        roomLights() {
            const R=root.Reactor3D;
            return R.readMapLights(this.map).flatMap((light,index)=>{
                if(light.on===false||this.assets.lightIsOn&&!this.assets.lightIsOn(light))return [];
                const animated=R.animateLight(light,this.frame,index,light.radius,light.intensity);
                const result={...light,...animated,colour:light.color,yaw:-light.yaw};
                if(light.attach){
                    const record=light.attach.player?(this.models.get('actor:0')||this.billboards.get('actor:0')):(this.models.get('event:'+light.attach.event)||this.billboards.get('event:'+light.attach.event));
                    if(!record)return [];result.x+=record.position.x+.5;result.y+=record.position.y+.5;result.height+=(record.position.z||0);
                    if(light.followFacing)result.yaw-=record.position.facing||0;
                }
                return [result];
            });
        }
        buildMapMedia() {
            const T=root.THREE, rows=this.map.reactor3d?.mediaSurfaces;
            if(!Array.isArray(rows)||!rows.length)return;
            const effects=rows.flatMap(raw=>{
                if(!raw||typeof raw!=='object')return [];
                const file=String(raw.movie||raw.file||'');
                if(!file||file.startsWith('/')||file.includes('\\')||file.split('/').includes('..')||!/\.(png|jpe?g|webp|mp4|webm|ogv)$/i.test(file))return [];
                const number=(key,fallback)=>Number.isFinite(Number(raw[key]))?Number(raw[key]):fallback;
                const bool=(key,fallback)=>raw[key]==null?fallback:raw[key]===true||raw[key]==='true';
                let worldCorners=raw.worldCorners;
                try{if(typeof worldCorners==='string')worldCorners=JSON.parse(worldCorners);}catch(_){worldCorners=null;}
                if(!Array.isArray(worldCorners)||worldCorners.length!==4||worldCorners.some(p=>!Number.isFinite(p?.x)||!Number.isFinite(p?.y)))worldCorners=null;
                const surface={worldCorners,x:number('x',0),y:number('y',0),z:number('z',0),width:Math.max(1,number('width',320)),height:Math.max(1,number('height',180)),
                    scaleX:number('scaleX',1),scaleY:number('scaleY',1),rotationX:number('rotationX',0),rotationY:number('rotationY',0),rotationZ:number('rotationZ',0),
                    depth:number('depth',0),layer:number('layer',3),opacity:Math.max(0,Math.min(1,number('opacity',255)/255)),cullingDistance:number('cullingDistance',0),scanlines:Math.max(0,Math.min(1,number('scanlines',0)))};
                return [{type:'video',trigger:'always',surface,video:{file,loop:bool('loop',true),audio:!bool('muted',true),volume:number('volume',100),playbackRate:number('playbackRate',1)}}];
            });
            const object=new T.Group();this.scene.add(object);this.mapMedia={object,effects,media:new Map()};
        }
        // Battle previews also run in the editor, without the game media manager.
        applyMediaCorners(geometry,corners,width,height) {
            const p=geometry.getAttribute('position');
            [0,1,3,2].forEach((c,i)=>p.setXYZ(i,corners[c].x*width,-corners[c].y*height,0));
            p.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
        }
        updateMapMediaPlane(media, surface) {
            const R=root.Reactor3D,T=root.THREE,tile=this.assets.tileSize||48,plane=media.plane;
            plane.position.set(surface.x+.5,R.elevationAt(this.map,Math.round(surface.x),Math.round(surface.y))+surface.z+surface.height/tile*Math.abs(surface.scaleY)/2,surface.y+.5+surface.depth);
            plane.rotation.set(surface.rotationX*Math.PI/180,surface.rotationY*Math.PI/180,surface.rotationZ*Math.PI/180,'XYZ');
            plane.scale.set(surface.width/tile*surface.scaleX,surface.height/tile*surface.scaleY,1);
            if(surface.worldCorners && media.worldCorners!==surface.worldCorners){
                this.applyMediaCorners(plane.geometry,surface.worldCorners,1,1);
                if(media.scanline)this.applyMediaCorners(media.scanline.mesh.geometry,surface.worldCorners,1,1);
                media.worldCorners=surface.worldCorners;
            }
            plane.material.transparent=true;plane.material.opacity=surface.opacity;
            plane.material.depthTest=surface.layer<5;plane.material.depthWrite=surface.layer<5;plane.renderOrder=surface.layer>=5?10000:0;
            plane.visible=!!media.texture&&(!surface.cullingDistance||this.camera.position.distanceTo(plane.position)<=surface.cullingDistance);
            if(surface.scanlines && !media.scanline){
                const canvas=document.createElement('canvas');canvas.width=2;canvas.height=4;
                const ctx=canvas.getContext('2d');ctx.fillStyle='rgba(0,0,0,'+(surface.scanlines*.5)+')';ctx.fillRect(0,0,2,2);
                const texture=new T.CanvasTexture(canvas);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(surface.width/2,surface.height/4);texture.generateMipmaps=false;texture.minFilter=T.NearestFilter;texture.magFilter=T.NearestFilter;
                const mesh=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({map:texture,side:T.DoubleSide,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,toneMapped:false,opacity:surface.opacity}));
                if(surface.worldCorners)this.applyMediaCorners(mesh.geometry,surface.worldCorners,1,1);
                plane.add(mesh);media.scanline={mesh,texture};
            }
        }
        updateMedia(record) {
            const R=root.Reactor3D,T=root.THREE;record.media||=new Map();
            for(const [index,effect] of (record.effects||[]).entries()){
                if(effect.type!=='video'||!effect.video?.file)continue;
                const active=this.effectActive(record,effect);let media=record.media.get(index);
                if(!active){if(media){this.stopMedia(media);record.media.delete(index);}continue;}
                if(!media){
                    const image=/\.(png|jpe?g|webp)$/i.test(effect.video.file),url=this.assets.mediaUrl?.(effect.video.file);
                    media={};record.media.set(index,media);if(!url){media.failed=true;this.assets.warn?.('Missing room media: '+effect.video.file);continue;}
                    const element=image?new Image():document.createElement('video');media.element=element;
                    const plane=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({side:T.DoubleSide,toneMapped:false}));
                    media.plane=plane;plane.visible=false;plane.userData.__reactorOverlay=true;record.object.add(plane);
                    const ready=()=>{if(media.disposed||media.failed||!(image?element.naturalWidth:element.videoWidth))return;
                        if(!media.texture){media.texture=image?new T.Texture(element):new T.VideoTexture(element);media.texture.colorSpace=T.SRGBColorSpace;media.texture.generateMipmaps=false;media.texture.minFilter=T.LinearFilter;media.texture.needsUpdate=true;plane.material.map=media.texture;plane.material.needsUpdate=true;}
                        plane.visible=true;
                    };
                    const failed=error=>{if(media.disposed||media.failed)return;media.failed=true;plane.visible=false;media.clearGesture?.();element.pause?.();this.assets.warn?.('Could not play room media: '+effect.video.file+(error?.message?' ('+error.message+')':''));};
                    media.fail=failed;
                    element.onerror=failed;
                    if(image)element.onload=ready;
                    else {element.onloadeddata=ready;element.loop=effect.video.loop!==false;element.muted=this.assets.muteMedia===true||!effect.video.audio;element.volume=Math.max(0,Math.min(1,(effect.video.volume??100)/100));element.defaultMuted=element.muted;element.preload='auto';element.playsInline=true;element.playbackRate=Math.max(.05,Math.min(16,effect.video.playbackRate||1));}
                    element.src=url;if(!image)this.playMedia(media);
                }
                if(media.failed||!media.plane)continue;
                if(effect.surface){this.updateMapMediaPlane(media,effect.surface);continue;}
                const world=R.effectAnchorWorld(record.object,effect,new T.Vector3());if(!world)continue;
                media.plane.position.copy(record.object.worldToLocal(world.clone()));
                const rotate=effect.rotate||[0,0,0];media.plane.rotation.set(...rotate.map(v=>v*Math.PI/180),'YXZ');
                const pose=R.effectAnchorQuaternion(record.object,effect,new T.Quaternion()),turn=record.object.getWorldQuaternion(new T.Quaternion());
                media.plane.quaternion.premultiply(turn.clone().invert().multiply(pose).multiply(turn));
                const size=R.videoEffectSize(effect,record.object.userData.glbSize),axes=R.scaleAxes(effect.scale);media.plane.scale.set(size[0]*axes[0],size[1]*axes[1],1);
            }
        }
        playMedia(media) {
            if(media.disposed||media.failed||media.playPending)return;
            const clearGesture=()=>{
                if(!media.retryGesture)return;
                for(const type of ['pointerdown','keydown','touchend'])document.removeEventListener(type,media.retryGesture,true);
                media.retryGesture=null;
            };
            media.clearGesture=clearGesture;
            const rejected=error=>{
                media.playPending=false;
                if(media.disposed||media.failed)return;
                // Autoplay may be denied by the browser/iframe. A pause or load
                // can also interrupt startup. Neither makes the media invalid.
                if(error?.name==='NotAllowedError'||error?.name==='AbortError'){
                    if(!media.retryGesture){
                        media.retryGesture=()=>this.playMedia(media);
                        for(const type of ['pointerdown','keydown','touchend'])document.addEventListener(type,media.retryGesture,true);
                    }
                    return;
                }
                media.fail(error);
            };
            media.playPending=true;
            try {
                const promise=media.element.play();
                Promise.resolve(promise).then(()=>{media.playPending=false;clearGesture();},rejected);
            } catch(error) {rejected(error);}
        }
        stopMedia(media) {
            if(media.disposed)return;media.disposed=true;media.clearGesture?.();
            const element=media.element;if(element){element.onload=element.onerror=element.onloadeddata=null;element.pause?.();element.removeAttribute?.('src');element.load?.();}
            if(media.scanline){media.scanline.mesh.geometry.dispose();media.scanline.mesh.material.dispose();media.scanline.texture.dispose();}
            media.plane?.removeFromParent();media.plane?.geometry.dispose();media.plane?.material.dispose();media.texture?.dispose();
        }
        updateEffects() {
            const R=root.Reactor3D,T=root.THREE,G=R.GpuEffects;
            if (!root.effekseer || !this.assets.animation || !this.assets.effectUrl) return;
            // A room owns one native context and a bounded set of render targets.
            for (const [key,r] of this.models) if(r.object) for(const [index,e] of (r.effects||[]).entries()) {
                if (!e.animation || !this.effectActive(r,e)) {const old=this.effectPlays.get(key+':'+index);if(old){this.stopEffect(old);this.effectPlays.delete(old.id);}continue;}
                const id=key+':'+index;if(this.effectPlays.has(id)||this.effectPlays.size>=16)continue;
                this.queueEffect(id,r,e);
            }
            const entry=this.effectContext;if(!entry||entry.disposed)return;
            try {
                entry.context._makeContextCurrent();if(!this.effectsPaused)entry.context.update(this.effectsDelta??1);
                for(const play of this.effectPlays.values()) {
                    if(play.failed || play.pending && Date.now()-play.createdAt>15000){this.stopEffect(play);this.effectPlays.delete(play.id);continue;}
                    if(play.pending)continue;
                    if(play.transient&&!this.effectsPaused){
                        const next=(play.age??0)+(this.effectsDelta??1);
                        for(const timing of play.animation.soundTimings||[])if(timing.frame>=(play.age??0)&&timing.frame<next&&timing.se?.name)this.assets.playSe?.(timing.se);
                        play.age=next;
                    }
                    if(!play.handle?.exists) {
                        if(play.started&&!play.effect.loop){if(play.transient){if(play.age>Math.max(0,...(play.animation.soundTimings||[]).map(t=>t.frame))){this.stopEffect(play);this.effectPlays.delete(play.id);}else if(play.quad)play.quad.mesh.visible=false;}else if(play.quad)play.quad.mesh.visible=false;continue;}
                        play.handle=entry.context.play(play.native,0,0,0);play.started=true;
                    }
                    const h=play.handle;if(!h)continue;
                    const e=play.effect,a=play.animation,o=play.owner.object;
                    if(!R.effectAnchorWorld(o,e,play.world))continue;
                    if(play.offset){play.world.x+=play.offset.x||0;play.world.y+=play.offset.z||0;play.world.z+=play.offset.y||0;}
                    // The effect is sized to what it rides: a model's span, or two tiles (a battler's height) for a billboard such as a sprite or a projectile's carrier, which has no model size at all.
                    const axes=R.scaleAxes(e.scale),unit=(play.span||R.modelSpanTiles(o)||2)/26*((a.scale||100)/100),rotate=e.rotate||[0,0,0],rotation=a.rotation||{};
                    h.setSpeed?.((a.speed??100)/100);h.setLocation(play.world.x,play.world.y,play.world.z);h.setScale(...axes.map(v=>v*unit));
                    h.setRotation((rotate[0]+(rotation.x||0))*Math.PI/180,(rotate[1]+(rotation.y||0))*Math.PI/180+o.rotation.y,(rotate[2]+(rotation.z||0))*Math.PI/180);
                    if(!play.quad){const canvas=document.createElement('canvas');canvas.width=canvas.height=4;play.quad=R.EffekseerScene.quadFor(canvas);this.scene.add(play.quad.mesh);}
                    const target=G.draw(entry,play,this.width,this.height,{x:0,y:0,width:this.width,height:this.height},this.camera.projectionMatrix.elements,this.camera.matrixWorldInverse.elements,h);
                    if(target){G.bindQuad(play.quad,target);const u=play.quad.material.uniforms;u.resolution.value.set(this.width,this.height);u.rectMin.value.set(0,0);u.rectSize.value.set(1,1);R.EffekseerScene.standQuad(play.quad.mesh,play.world,this.camera);play.quad.mesh.visible=true;}
                    entry.context._makeContextCurrent();
                }
            } finally { G.restoreDefault();this.renderer.resetState(); }
        }
        queueEffect(id,owner,effect,transient=false) {
            const R=root.Reactor3D,G=R.GpuEffects,animation=this.assets.animation?.(effect.animation);
            if(!root.effekseer||!animation?.effectName||this.effectPlays.size>=16)return false;
            this.effectContext ||= G.create(this.renderer,0);const entry=this.effectContext;if(!entry)return false;
            const play={id,owner,effect,animation,world:new THREE.Vector3(),pending:true,transient,createdAt:Date.now(),age:0};this.effectPlays.set(id,play);entry.loading++;
            try {
                entry.context._makeContextCurrent();
                play.native=entry.context.loadEffect(this.assets.effectUrl(animation.effectName),1,()=>{play.pending=false;G.loaded(entry);},()=>{play.failed=true;play.pending=false;G.loaded(entry);this.assets.warn?.('Missing room effect: '+animation.effectName);});
            }catch(error){play.failed=true;G.loaded(entry);this.assets.warn?.(error);}
            finally{G.restoreDefault();this.renderer.resetState();}
            return true;
        }
        playAnimation(key,animationId,transform={}) {
            const owner=this.models.get(key)||this.billboards.get(key);if(!owner?.object)return false;
            const id='cue:'+(this.cueId=(this.cueId||0)+1);
            if(!this.queueEffect(id,owner,{animation:animationId,anchor:{part:'',offset:[0,.5,0]},scale:transform.scale??1,rotate:[0,0,0],loop:false},true))return false;
            const play=this.effectPlays.get(id);play.offset={...transform};if(transform.span>0)play.span=transform.span;
            return {isPlaying:()=>!this.disposed&&this.effectPlays.has(id)&&!play.failed&&(!play.pending||Date.now()-play.createdAt<15000),
                cancel:()=>{if(this.effectPlays.has(id)){this.stopEffect(play);this.effectPlays.delete(id);}}};
        }
        stopEffect(play) {
            const R=root.Reactor3D;
            try {if(play.handle&&this.effectContext&&!this.effectContext.disposed){this.effectContext.context._makeContextCurrent();play.handle.stop();}}
            finally {R.GpuEffects.restoreDefault();}
            if(play.quad){play.quad.mesh.removeFromParent();play.quad.mesh.geometry.dispose();play.quad.material.dispose();play.quad.texture.dispose();}
            play._gpuEffectTarget?.dispose();play._gpuColourTarget?.dispose();
        }
        dispose() {
            if(this.disposed)return;this.disposed=true;this.cinematicShot=null;this.cinematicTransition=null;
            for(const interpreter of this.interpreters||[])interpreter.terminate();
            if(root.$gameTroop?._interpreter?._reactorRoom===this)delete root.$gameTroop._interpreter._reactorRoom;
            for(const sprite of this.eventSprites?.values()||[]){sprite.removeFromParent();sprite.destroy();}
            this.interpreters=[];this.events?.clear();
            for(const balloon of this.balloons||[]){balloon._roomCharacter?.endBalloon();balloon.removeFromParent();balloon.destroy();}this.balloons=[];
            if(this.mapMedia){for(const media of this.mapMedia.media.values())this.stopMedia(media);this.mapMedia.object.removeFromParent();this.mapMedia=null;}
            for(const key of [...this.models.keys(),...this.billboards.keys()])this.remove(key);
            for(const play of this.effectPlays.values())this.stopEffect(play);this.effectPlays.clear();
            root.Reactor3D.GpuEffects.release(this.effectContext);
            this.world?.destroy();this.renderer?.dispose();this.renderer?.forceContextLoss();
        }
    }
    root.ReactorBattleRoomView=BattleRoomView;
    if(typeof module!=='undefined'&&module.exports)module.exports=BattleRoomView;
})(globalThis);
