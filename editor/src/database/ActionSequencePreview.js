/* Preview-only formation and shared model gizmos for the sequence editor. */
class ActionSequencePreview {
    constructor(editor) {
        this.editor=editor;this.mode='step';this.selection='user';this.tool='move';this.placements={};this.distance=14;this.hold=null;
        this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(editor.canvas);
        this.bindPointer();
    }
    disposeGizmos(){if(this.rings)RRPoseRings3D.dispose(this.rings);if(this.arrows)RRAxisArrows3D.dispose(this.arrows);this.rings=this.arrows=null;this.hold=null;}
    dispose(){this.observer.disconnect();this.disposeGizmos();}
    resize(){const e=this.editor,c=e.canvas,r=c.getBoundingClientRect();if(!r.width||!r.height)return;
        const ratio=Math.min(2,Math.max(1,window.devicePixelRatio||1))*1.5;
        const width=Math.min(2560,Math.round(r.width*ratio)),height=Math.max(1,Math.round(width*r.height/r.width));
        if(c.width!==width||c.height!==height){c.width=width;c.height=height;}
        if(e.preview&&(e.preview.width!==width||e.preview.height!==height))e.preview.resize(width,height);
    }
    toolbar(host){const e=this.editor,U=e.ui,row=U.element('div','rr-sequence-tools');host.append(row);
        this.modeSelect=U.select([['step','Edit Step'],['formation','Arrange Preview']],this.mode,v=>{this.mode=v;e.stepPlayback=null;e.playing=false;if(v==='formation')e.frame=0;e.drawInspector();});row.append(this.modeSelect);
        this.selectionSelect=U.select([],this.selection,v=>{this.selection=v;e.playing=false;if(this.mode==='step'){const s=e.sequence.steps[e.selected];if(s&&(s.role!=='allTargets'||v==='user')){e.edit(()=>{s.role=v==='user'?'user':'target';s.targetIndex=v==='user'?undefined:Number(v.slice(6));});}}e.drawInspector();});row.append(this.selectionSelect);this.targetsChanged();
        this.toolSelect=U.select([['move','Move'],['rotate','Rotate']],this.tool,v=>this.setTool(v));row.append(this.toolSelect);
        row.append(U.button('Zoom In',()=>this.zoom(.8)),U.button('Zoom Out',()=>this.zoom(1.25)),U.button('Reset View',()=>this.resetView()));
        // Zoomed in, the room's centre is not where the work is: following keeps the edited battler in frame.
        const follow=U.button('Frame Battler',()=>{this.follow=!this.follow;follow.setAttribute('aria-pressed',String(this.follow));e.savePrefs?.();});follow.setAttribute('aria-pressed',String(!!this.follow));follow.title=U.text('Keep the selected battler in the middle of the view');row.append(follow);this.followButton=follow;
    }
    zoom(factor){this.distance=Math.max(2,Math.min(50,this.distance*factor));this.editor.savePrefs?.();}
    /**
     * The camera pose for this frame: the sequence's, centred on the active
     * battler while following, then the authoring view's own orbit and pan
     * on top. None of it reaches the game: the room's camera stays as authored.
     */
    cameraPose(poses){const camera={...poses.camera};if(this.follow){const p=poses[this.activeKey()];if(p){camera.x=p.x;camera.y=p.y;}}
        camera.x+=this.pan?.x||0;camera.y+=this.pan?.y||0;
        // The orbit stands in for the scene's own angle, and gives it back on Reset View.
        const base=this.editor.baseCamera;if(this.orbit&&Number.isFinite(this.orbit.yaw))camera.yaw=this.orbit.yaw;else if(base)camera.yaw=base.yaw;if(this.orbit&&Number.isFinite(this.orbit.pitch))camera.pitch=this.orbit.pitch;else if(base)camera.pitch=base.pitch;return camera;}
    resetView(){this.distance=14;this.orbit=null;this.pan={x:0,y:0};this.editor.savePrefs?.();}
    /** Right-drag orbits, middle-drag (or Shift + right-drag) pans, the wheel zooms: the same hands as the map editor. */
    startCameraDrag(event){const view=this.editor.preview;if(!view)return false;const state=view.cameraState?.()||{};
        this.cameraDrag={x:event.clientX,y:event.clientY,yaw:this.orbit?.yaw??state.yaw??0,pitch:this.orbit?.pitch??state.pitch??25,pan:{...(this.pan||{x:0,y:0})},mode:event.button===1||event.shiftKey?'pan':'orbit'};return true;}
    moveCameraDrag(event){const d=this.cameraDrag;if(!d)return;const dx=event.clientX-d.x,dy=event.clientY-d.y;
        if(d.mode==='orbit'){this.orbit={yaw:d.yaw+dx*.4,pitch:Math.max(2,Math.min(89,d.pitch+dy*.3))};return;}
        // Pan in the view's own plane: a tile per so many pixels, scaled by how far out the view stands.
        const yaw=(this.orbit?.yaw??d.yaw)*Math.PI/180,k=this.distance/500,rx=Math.cos(yaw),ry=-Math.sin(yaw);
        this.pan={x:d.pan.x-(dx*rx+dy*ry)*k,y:d.pan.y-(dx*-ry+dy*rx)*k};}
    endCameraDrag(){if(!this.cameraDrag)return;this.cameraDrag=null;this.editor.savePrefs?.();}
    targetsChanged(){const e=this.editor,select=this.selectionSelect;if(!select)return;
        select.replaceChildren();for(const [key,label] of [['user','User'],...Array.from({length:e.targetCount},(_,i)=>['target'+i,e.ui.message('Target {n}',{n:i+1})])]){const o=e.ui.element('option','',label);o.value=key;select.append(o);}
        if(![...select.options].some(o=>o.value===this.selection))this.selection='user';select.value=this.selection;
    }
    homes(base){const homes=base.homes;for(const key of ['user',...Array.from({length:this.editor.targetCount},(_,i)=>'target'+i)]){
        if(this.placements[key])Object.assign(homes[key],this.placements[key]);
    }homes.target={...homes.target0};base.target=homes.target;base.direction=homes.target.x<homes.user.x?-1:1;return base;}
    inspectFormation(){const e=this.editor,U=e.ui,host=e.inspector;host.replaceChildren();e.setInspectorTitle('Preview Formation');
        const key=this.selection,position=e.previewContext().homes[key];if(!position)return;
        host.append(U.element('p','rr-battle-help','Arrange test battlers here. Battle formations are set in Troops.'));
        const group=U.element('div','rr-sequence-numbers');host.append(group);
        for(const k of ['x','y','z','facing']){const input=U.number(group,k==='facing'?'Facing':k.toUpperCase(),position[k]||0,v=>{this.placements[key]={...position,...this.placements[key],[k]:Math.max(-1000,Math.min(1000,v))};},k==='facing'?1:.1);input.dataset.formationField=k;}
        host.append(U.button('Reset Formation',()=>{this.placements={};e.drawInspector();}));
    }
    setTool(tool){
        this.tool=tool;if(this.toolSelect)this.toolSelect.value=tool;
        for(const button of this.editor.inspector.querySelectorAll('[data-transform-tool]'))button.setAttribute('aria-pressed',String(button.dataset.transformTool===tool));
    }
    showTransformPose(step){
        const e=this.editor;e.playing=false;e.stepPlayback=null;e.asOfStep=true;this.transformPose=step;
        e.frame=ReactorBattleData.timeline(e.sequence)[e.selected].end;
    }
    /**
     * A tabbed card of slider rows — Offset, Rotate, Scale — the one control
     * for placing anything in the preview, so a held item, a motion's model
     * offset and a move step all read the same way. `spec.rows(tab)` lists a
     * tab's rows as {key,axis,label,min,max,step,reset}; `spec.get(key)`
     * reads a value; `spec.set(key,value,live)` writes one (the card takes
     * one undo step per drag); `spec.reset(tab)` clears a tab; `spec.tool(tab)`
     * names the viewport tool a tab goes with; `spec.shown()` puts the
     * preview on the frame the values show; `spec.extra(tab,host)` adds
     * controls under a tab; `spec.hint(tab)` is the line at the foot.
     */
    transformCard(host,spec){const e=this.editor,U=e.ui;
        const card=U.element('div','rr-transform-card');card.dataset.transformCard=spec.id;host.append(card);
        const tabs=U.element('div','rr-transform-card-tabs');card.append(tabs);const body=U.element('div','rr-transform-card-body');card.append(body);
        this.cardTabs||={};let tab=spec.tabs.some(t=>t.id===this.cardTabs[spec.id])?this.cardTabs[spec.id]:(spec.initialTab||spec.tabs[0].id);
        const draw=()=>{
            tabs.replaceChildren();for(const t of spec.tabs){const b=U.button(t.label,()=>{tab=this.cardTabs[spec.id]=t.id;draw();if(spec.tool)this.setTool(spec.tool(t.id));spec.shown?.();e.paint();});b.dataset.cardTab=t.id;b.classList.toggle('primary',t.id===tab);b.setAttribute('aria-pressed',String(t.id===tab));tabs.append(b);}
            body.replaceChildren();for(const row of spec.rows(tab))this.cardRow(body,row,spec);
            spec.extra?.(tab,body);
            const foot=U.element('div','rr-transform-card-foot');body.append(foot);
            if(spec.hint){const hint=spec.hint(tab);if(hint)foot.append(U.element('span','rr-battle-help',hint));}
            if(spec.reset){const reset=U.button('Reset',()=>{e.pushUndo();spec.reset(tab);spec.shown?.();draw();this.syncCards();e.paint();});reset.classList.add('rr-transform-card-reset');foot.append(reset);}
        };
        draw();if(spec.tool)this.setTool(spec.tool(tab));
        const sync=()=>{if(!card.isConnected)return false;for(const input of card.querySelectorAll('[data-card-key]')){const value=spec.get(input.dataset.cardKey);if(!Number.isFinite(value)||document.activeElement===input)continue;const text=String(Math.round(value*1000)/1000);if(input.type==='range'){input.min=Math.min(Number(input.min),value);input.max=Math.max(Number(input.max),value);}if(String(input.value)!==text)input.value=text;}return true;};
        (this.cardSyncs||=[]).push(sync);return card;
    }
    cardRow(host,row,spec){const e=this.editor,U=e.ui,axis=row.axis||'';
        const line=U.element('div','rr-sequence-transform-row');line.style.setProperty('--transform-axis-color',({X:'#e5484d',Y:'#46a758',Z:'#3e63dd'})[axis]||'var(--color-accent)');host.append(line);
        const tag=U.element('span','rr-sequence-transform-axis',axis||'·',true);tag.title=U.text(row.label);line.append(tag);
        const value=Number(spec.get(row.key))||0,slider=U.element('input');slider.type='range';slider.min=Math.min(row.min,value);slider.max=Math.max(row.max,value);slider.step=row.step;slider.value=value;slider.dataset.cardKey=row.key;slider.title=U.text(row.label)+' · '+U.text('Double-click to reset');
        const input=U.element('input','database-field-value');input.type='number';input.step=row.step;input.value=Math.round(value*1000)/1000;input.dataset.cardKey=row.key;input.dataset.noStepper='';
        const label=U.text(row.label);slider.setAttribute('aria-label',label);input.setAttribute('aria-label',label);input.title=label;line.append(slider,input);
        let editing=false;
        const apply=(source,live)=>{const v=source.valueAsNumber;if(!Number.isFinite(v))return;if(!editing){e.pushUndo();editing=true;}spec.set(row.key,v,live);spec.shown?.();this.syncCards();e.paint();};
        slider.oninput=()=>apply(slider,true);slider.onchange=()=>{apply(slider,false);editing=false;};
        input.onchange=()=>{apply(input,false);editing=false;};
        for(const control of [slider,input]){control.onblur=()=>{editing=false;};control.onpointercancel=()=>{editing=false;};}
        slider.ondblclick=()=>{slider.value=row.reset??0;apply(slider,false);editing=false;};
    }
    /** Every live card reads its values back; cards no longer on screen are dropped. */
    syncCards(){this.cardSyncs=(this.cardSyncs||[]).filter(sync=>sync());}
    syncTransformFields(){this.syncCards();}
    transformFields(step,change,host=this.editor.inspector){const e=this.editor,U=e.ui,B=ReactorBattleData;
        const enabled=U.element('input');enabled.type='checkbox';enabled.checked=!!step.transform;
        U.field(host,'Override Transform',enabled);enabled.onchange=()=>{change('transform',enabled.checked?B.transform():undefined);if(enabled.checked){this.setTool('rotate');this.showTransformPose(step);}else this.transformPose=null;e.drawInspector();e.paint();};
        if(!step.transform){host.append(U.element('p','rr-battle-help','Enable to offset, rotate or reshape this motion.'));return;}
        const t=()=>B.transform(step.transform);
        this.freeScale=!!this.freeScale||['scaleX','scaleY','scaleZ'].some(k=>t()[k]!==1);
        const row=(key,axis,label,min,max,step,reset)=>({key,axis,label,min,max,step,reset});
        this.transformCard(host,{id:'motion',initialTab:'rotate',
            tabs:[{id:'offset',label:'Offset'},{id:'rotate',label:'Rotate'},{id:'scale',label:'Scale'}],
            tool:tab=>tab==='rotate'?'rotate':'move',shown:()=>this.showTransformPose(step),
            rows:tab=>tab==='offset'?['x','y','z'].map(k=>row(k,k.toUpperCase(),U.message('{axis} (tiles)',{axis:k.toUpperCase()}),-5,5,.01,0))
                :tab==='rotate'?['rotateX','rotateY','rotateZ'].map(k=>row(k,k.slice(-1),U.message('Turn {axis} (degrees)',{axis:k.slice(-1)}),-180,180,.1,0))
                :[row('scale','S','Scale',.01,4,.01,1),...(this.freeScale?['scaleX','scaleY','scaleZ'].map(k=>row(k,k.slice(-1),U.message('Scale {axis}',{axis:k.slice(-1)}),.01,4,.01,1)):[])],
            get:key=>t()[key],
            set:(key,value)=>{if(e.sequence.steps[e.selected]!==step||!step.transform)return;const scale=key.startsWith('scale');step.transform={...step.transform,[key]:Math.max(scale?.01:-1000,Math.min(scale?100:1000,value))};U.changed();e.validate();},
            reset:tab=>{const next={...step.transform};for(const key of B.transformKeys)if((tab==='offset'&&['x','y','z'].includes(key))||(tab==='rotate'&&key.startsWith('rotate'))||(tab==='scale'&&key.startsWith('scale')))next[key]=key.startsWith('scale')?1:0;step.transform=next;U.changed();e.validate();},
            extra:(tab,body)=>{if(tab!=='scale')return;const proportional=U.element('input');proportional.type='checkbox';proportional.checked=!this.freeScale;U.field(body,'Proportional',proportional);proportional.onchange=()=>{this.freeScale=!proportional.checked;if(proportional.checked){e.pushUndo();step.transform={...step.transform,scaleX:1,scaleY:1,scaleZ:1};U.changed();}this.showTransformPose(step);e.drawInspector();e.paint();};},
            hint:tab=>tab==='offset'?'Drag the arrows in the preview, or slide.':tab==='rotate'?'Drag the rings in the preview, or slide.':'Scales the model for this motion only.'
        });
    }
    activeKey(){const s=this.editor.sequence.steps[this.editor.selected];return this.mode==='formation'?this.selection:s?.role==='user'?'user':s?.role==='allTargets'?this.selection==='user'?'target0':this.selection:'target'+(s?.targetIndex??0);}
    /** The flat 2D layout: height is drawn as a shift up the screen, and one ring turns things in the screen plane. */
    flat(){return this.editor.preview?.settings?.projection==='2d';}
    editable(){const s=this.editor.sequence.steps[this.editor.selected];return this.mode==='formation'||s?.type==='move'||(s?.type==='motion'&&!!s.transform)||this.heldStep(s)||this.poseStep(s)||this.flightStep(s);}
    /** A projectile step: its arrows sit where the thing launches from. */
    flightStep(s){return !!s&&s.type==='projectile';}
    flightPoint(key,step,pose){const view=this.editor.preview;if(!view||!pose)return null;const full={...ReactorBattleData.commandDefaults('projectile'),...step};return view.attachmentPoint(key,{...full,z:full.attachment&&full.attachment!=='offset'?(full.z||0):full.startHeight??1},pose);}
    /** A motion step posing parts: its gizmos sit on the chosen part. */
    poseStep(s){return !!s&&s.type==='motion'&&ReactorBattleData.hasPose(s);}
    /** The rig part named `part` on the previewed model of `key`: its mesh or bone, and the world point it turns about. */
    partPivot(key,part){const view=this.editor.preview;const record=view?.models.get(key);if(!record?.binding||!part)return null;const wanted=String(part).toLowerCase();
        for(const entry of record.binding.meshes){const match=(entry.parts||[]).find(p=>String(p.name).toLowerCase()===wanted);if(!match)continue;entry.mesh.updateWorldMatrix(true,false);
            const point=Reactor3D.isRigJoint(entry.mesh)?entry.mesh.getWorldPosition(new THREE.Vector3()):entry.mesh.localToWorld(new THREE.Vector3(...(match.pivot||[0,0,0])));return {entry,point};}
        return null;}
    /** The part under a click on the model: a carved part's mesh, or the rig bone whose limb the hit lies on. */
    partAt(key,event){const e=this.editor,view=e.preview,record=view?.models.get(key);if(!record?.object)return null;const rect=e.canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),view.camera);
        // A skinned mesh's preset sphere describes its rest geometry, not where the bones put the
        // vertices, so it turns the ray away; a sphere that cannot miss lets three test the skinned triangles.
        const skinned=[];record.object.traverse(o=>{if(o.isSkinnedMesh)skinned.push([o,o.boundingSphere]);});for(const [o] of skinned)o.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1e6);
        let hit;try{hit=ray.intersectObject(record.object,true)[0];}finally{for(const [o,sphere] of skinned)o.boundingSphere=sphere;}
        if(!hit)return null;
        for(let node=hit.object;node&&node!==record.object;node=node.parent)if(node.userData?.parts?.length&&!Reactor3D.isRigJoint(node))return node.userData.parts[0].name;
        // A bone's limb runs from its origin to each child bone; the hit belongs to the limb it lies closest to.
        let best=null,gap=Infinity;const origin=new THREE.Vector3(),end=new THREE.Vector3(),line=new THREE.Line3(),nearest=new THREE.Vector3();
        const segment=()=>{d=Math.min(d,line.closestPointToPoint(hit.point,true,nearest).distanceTo(hit.point));};let d=0;
        for(const entry of record.binding?.meshes||[]){if(!Reactor3D.isRigJoint(entry.mesh))continue;entry.mesh.getWorldPosition(origin);d=origin.distanceTo(hit.point);let leaf=true;
            for(const child of entry.mesh.children){if(!Reactor3D.isRigJoint(child))continue;leaf=false;line.set(origin,child.getWorldPosition(end));segment();}
            // A leaf's limb runs to the tail the rig gave it: the head above its bone, the hand past the wrist.
            const tail=leaf?entry.mesh.userData?.__reactorBoneTail:null;if(tail){line.set(origin,record.binding.root.localToWorld(end.fromArray(tail)));segment();}
            // A child wins a tie with its parent: the point where a limb meets the next belongs to the next.
            if(d<gap-1e-6||Math.abs(d-gap)<=1e-6&&best&&entry.mesh.parent&&record.binding.meshes.some(e=>e.mesh===entry.mesh.parent&&e.parts[0]?.name===best)){gap=d;best=entry.parts[0]?.name||null;}}
        return best;}
    /** A weapon step that shows or moves something: its gizmos sit on the held thing. */
    heldStep(s){return !!s&&s.type==='weapon'&&ReactorBattleData.weaponMode(s)!=='hide';}
    /** Where the held thing is at this step: a Move step keeps the Show step's hand and grip and only changes the pose keys. */
    heldPoint(key,step,pose){const view=this.editor.preview;if(!view||!pose)return null;const B=ReactorBattleData,base=this.editor.heldBase?.(step)||{},own=Object.fromEntries(Object.entries(step).filter(([k])=>B.heldKeys.includes(k))),full={...B.commandDefaults('weapon'),...base,...own};return view.attachmentPoint(key,full,pose);}
    sync(poses){const e=this.editor,view=e.preview;if(!view)return;const key=this.activeKey(),p=poses[key];
        this.selectionSelect.value=this.mode==='formation'?this.selection:key;
        if(!this.rings){this.rings=RRPoseRings3D.create(THREE,.8,'sequence-rings');this.arrows=RRAxisArrows3D.create(THREE,1.3,'sequence-arrows',{x:0xe5484d,y:0x3e63dd,z:0x46a758});view.scene.add(this.rings.root,this.arrows.root);}
        const s=e.sequence.steps[e.selected],posing=this.mode==='step'&&this.poseStep(s),combined=this.mode==='step'&&s?.type==='motion'&&!posing,held=this.mode==='step'&&this.heldStep(s)?this.heldPoint(key,s,p):null,flight=this.mode==='step'&&this.flightStep(s)?this.flightPoint(key,s,p):null;
        const pivot=posing&&e.posePartName?this.partPivot(key,e.posePartName):null;
        // The gizmos sit where the thing is drawn: in the flat layout height lifts a sprite up the screen, so the anchor is lifted the same way.
        const flat=this.flat(),lift=e.liftPose(view),lifted=lift(held||flight||(p?{x:p.x,y:p.y,z:(p.z||0)+.8}:null));
        const visible=!!p&&this.editable()&&!e.playing&&(!posing||!!pivot),at=pivot?{x:pivot.point.x,y:pivot.point.y,z:pivot.point.z}:lifted?{x:lifted.x+.5,y:lifted.z,z:lifted.y+.5}:{x:.5,y:0,z:.5};
        const yaw=held?(p?.facing||0)+(s.rotateY||0):flight?(p?.facing||0):(p?.facing||0)+(p?.rotateY||0),pitch=held||posing||flight?(held?-(s.rotation||0):0):(p?.rotateX||0);
        // Flat: the height arrow points up the screen, the depth arrow down it.
        this.arrows.y.group.rotation.x=flat?-Math.PI/2:0;
        // Part rings are smaller than a battler's; picking reads the radius, so it scales with them.
        if(this.rings){this.rings.baseRadius||=this.rings.radius;const scale=posing?.55:1;this.rings.root.scale.setScalar(scale);this.rings.radius=this.rings.baseRadius*scale;}
        RRPoseRings3D.sync(this.rings,at,yaw,pitch,visible&&(combined||this.tool==='rotate'));
        this.rings.pitch.group.visible=this.rings.roll.group.visible=this.mode!=='formation'&&!flat;
        // A projectile only turns about its own axis: one ring. Flat: the one ring facing the viewer turns things in the screen plane.
        this.rings.yaw.group.visible=flat||!flight;if(flight&&!flat)this.rings.pitch.group.visible=false;
        RRAxisArrows3D.sync(this.arrows,at,visible&&(combined||this.tool==='move'));view.scene.updateMatrixWorld(true);
    }
    point(event,height=0){const e=this.editor,view=e.preview;if(!view)return null;const rect=e.canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),view.camera);const p=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-height),new THREE.Vector3());return p?{x:p.x-.5,y:p.z-.5+(this.flat()?height:0),z:height}:null;}
    poses(){const e=this.editor;return Object.fromEntries(Object.entries((this.mode==='formation'?e.previewContext().homes:ReactorBattleData.evaluate(e.previewSequence(),e.frame,e.previewContext()))).map(([k,p])=>[k,ReactorBattleData.visualPose(p)]));}
    pickBattler(event){const e=this.editor,rect=e.canvas.getBoundingClientRect(),poses=this.poses(),keys=['user',...Array.from({length:e.targetCount},(_,i)=>'target'+i)];
        const lift=e.liftPose(e.preview),markers=keys.filter(key=>poses[key]).map(key=>{const p=e.preview.project(lift(poses[key]));return {key,distance:Math.hypot(event.clientX-rect.left-p.x/e.canvas.width*rect.width,event.clientY-rect.top-p.y/e.canvas.height*rect.height)};}).sort((a,b)=>a.distance-b.distance);
        if(markers[0]?.distance<14)return markers[0].key;
        const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),e.preview.camera);
        // The battler the step already belongs to wins where sprites overlap, and its drawn weapon or projectile is a handle for it too.
        const active=this.activeKey(),step=e.sequence.steps[e.selected],extra=this.mode==='step'&&step?['extra:held:'+active,'extra:flight:'+step.id]:[];
        const hits=[];for(const key of [...keys,...extra]){const object=(e.preview.models.get(key)||e.preview.billboards.get(key))?.object;if(object?.visible){const hit=ray.intersectObject(object,true)[0];if(hit)hits.push({key:key.startsWith('extra:')?active:key,distance:hit.distance});}}
        return hits.sort((a,b)=>(a.key===active?-1:b.key===active?1:0)||a.distance-b.distance)[0]?.key;
    }
    writePosition(point,hold){const e=this.editor,step=e.sequence.steps[e.selected],round=v=>Math.round(v*100)/100;
        // A field the drag did not move keeps its exact value; only moved fields are rounded to the hundredth.
        const shift=(base,delta,fallback=0)=>Math.abs(delta)<1e-6?(base??fallback):round((base??fallback)+delta);
        if(this.mode==='formation'){this.placements[hold.key]={...hold.home,x:round(point.x),y:round(point.y),z:round(point.z)};return;}
        if(this.heldStep(step)){const sign=Math.sign(hold.pose?.facing||1)||1;step.x=shift(hold.step.x,(point.x-hold.position.x)*sign);step.y=shift(hold.step.y,point.y-hold.position.y);step.z=shift(hold.step.z,point.z-hold.position.z);}
        else if(this.flightStep(step)){const sign=Math.sign(hold.pose?.facing||1)||1,heightKey=(step.attachment||'offset')==='offset'?'startHeight':'z';step.x=shift(hold.step.x,(point.x-hold.position.x)*sign);step.y=shift(hold.step.y,point.y-hold.position.y);step[heightKey]=shift(hold.step[heightKey],point.z-hold.position.z,heightKey==='startHeight'?1:0);}
        else if(step.type==='motion'){step.transform={...ReactorBattleData.transform(step.transform),x:shift(hold.transform.x,point.x-hold.position.x),y:shift(hold.transform.y,point.y-hold.position.y),z:shift(hold.transform.z,point.z-hold.position.z)};}
        else {const context=e.previewContext(),home=context.homes[hold.key],anchor=['target','approach'].includes(step.anchor)?context.target:home;
            const visual=ReactorBattleData.transform(ReactorBattleData.evaluate(e.previewSequence(),e.frame,context)[hold.key]?.transform),dx=point.x-visual.x-anchor.x,dy=point.y-visual.y-anchor.y;
            if(step.anchor==='approach'){const vx=context.target.x-context.homes.user.x,vy=context.target.y-context.homes.user.y,len=Math.hypot(vx,vy),ux=len>1e-6?vx/len:context.direction,uy=len>1e-6?vy/len:0;step.x=round(dx*ux+dy*uy);step.y=round(-dx*uy+dy*ux);}else{step.x=round(dx/context.direction);step.y=round(dy);}step.z=round(point.z-visual.z-anchor.z);
        }
        e.ui.changed();e.validate();
    }
    bindPointer(){const e=this.editor,c=e.canvas,U=e.ui;
        c.onwheel=event=>{event.preventDefault();this.zoom(Math.exp(event.deltaY*.001));};
        c.oncontextmenu=event=>event.preventDefault();
        c.title=U.text('Left-drag the gizmos or a battler. Right-drag orbits, middle-drag or Shift + right-drag pans, scroll zooms.');
        c.onpointerdown=event=>{if((event.button===2||event.button===1)&&e.preview){if(this.startCameraDrag(event)){c.setPointerCapture(event.pointerId);event.preventDefault();}return;}
            if(event.button!==0||!e.preview)return;e.playing=false;
            const rect=c.getBoundingClientRect(),s=e.sequence.steps[e.selected],key=this.activeKey();let p=this.poses()[key];
            const arrowHit=RRAxisArrows3D.pick(THREE,this.arrows,e.preview.camera,rect,event.clientX,event.clientY);
            const heldNow=this.mode==='step'&&this.heldStep(s),posing=this.mode==='step'&&this.poseStep(s),flying=this.mode==='step'&&this.flightStep(s);
            const partEntry=posing?(s.parts||[]).find(x=>x.part===e.posePartName):null,partPose=ReactorBattleData.partPose(partEntry);
            const ringHit=RRPoseRings3D.pick(THREE,this.rings,e.preview.camera,rect,event.clientX,event.clientY,this.flat()&&!posing?{yaw:heldNow||flying?-(s.rotation||0):this.mode==='formation'?(p?.facing||0):-(ReactorBattleData.transform(s?.transform).rotateZ||0)}:posing?{yaw:partPose.rotate[1],pitch:partPose.rotate[0],roll:partPose.rotate[2]}:heldNow?{yaw:(p?.facing||0)+(s.rotateY||0),pitch:-(s.rotation||0),roll:s.rotateZ||0}:flying?{yaw:p?.facing||0,pitch:0,roll:s.rotation||0}:{yaw:(p?.facing||0)+(p?.rotateY||0),pitch:p?.rotateX||0,roll:p?.rotateZ||0});
            // Both gizmos stay available for motion overrides. The selected
            // tool decides which handle wins where their screen targets overlap.
            const ring=this.tool==='move'&&arrowHit?null:ringHit,arrow=ring?null:arrowHit;
            // A click on a rigged part of the model picks that part; the gizmos then move it. On a
            // Motion step that still plays a clip, this turns the step into a pose of that part.
            if(this.mode==='step'&&s?.type==='motion'&&!ring&&!arrow){const part=this.partAt(key,event);if(part){e.pickPosePart(part);return;}if(posing)return;}
            const hit=ring||arrow?key:this.pickBattler(event);if(!hit)return;
            if(hit!==key){this.selection=hit;if(this.mode==='step'&&s&&(s.role!=='allTargets'||hit==='user')){e.edit(()=>{s.role=hit==='user'?'user':'target';s.targetIndex=hit==='user'?undefined:Number(hit.slice(6));});}e.drawInspector();}
            if(!this.editable())return;
            if(this.mode==='step'){if(s.type==='motion')this.showTransformPose(s);else if(flying)e.showFlightFrame(s);else {e.stepPlayback=null;e.playing=false;e.asOfStep=true;e.frame=ReactorBattleData.timeline(e.sequence)[e.selected].end;}e.paint();}
            p=this.poses()[hit];const pivot=posing?this.partPivot(hit,e.posePartName):null,anchor=heldNow?(this.heldPoint(hit,s,p)||p):flying?(this.flightPoint(hit,s,p)||p):pivot?{x:pivot.point.x-.5,y:pivot.point.z-.5,z:pivot.point.y}:p,point=this.point(event,anchor.z);if(!point&&!ring&&!arrow)return;
            this.hold={downX:event.clientX,downY:event.clientY,key:hit,ring,arrow,position:posing&&pivot?{x:pivot.point.x-.5,y:pivot.point.z-.5,z:pivot.point.y}:{...anchor},pose:{...p},point,home:{...e.previewContext().homes[hit]},transform:ReactorBattleData.transform(s?.transform),step:{...s},part:posing?{name:e.posePartName,from:partPose,object:e.preview.models.get(hit)?.object}:null};
            if(ring)RRPoseRings3D.emphasize(this.rings,ring.axis,true);if(arrow)RRAxisArrows3D.emphasize(this.arrows,arrow.axis,true);c.setPointerCapture(event.pointerId);event.preventDefault();
        };
        c.onpointermove=event=>{if(this.cameraDrag){this.moveCameraDrag(event);e.paint();return;}const h=this.hold;if(!h)return;const s=e.sequence.steps[e.selected];
            // The first movement of a drag is the edit; a click that never moves changes nothing and leaves no undo entry.
            if(!h.pushed){if(Math.hypot(event.clientX-h.downX,event.clientY-h.downY)<2)return;h.pushed=true;if(this.mode==='step')e.pushUndo();}
            if(h.ring){const value=RRPoseRings3D.drag(THREE,h.ring,e.preview.camera,c.getBoundingClientRect(),event.clientX,event.clientY);if(value===null)return;
                const delta=value-h.ring.startValue,key={yaw:'rotateY',pitch:'rotateX',roll:'rotateZ'}[h.ring.axis];
                if(this.mode==='formation')this.placements[h.key]={...h.home,facing:h.home.facing+delta};
                // Flat: the ring seen face-on turns the thing in the screen plane, clockwise for a positive value as the game draws it.
                else if(this.flat()&&!h.part){const turn=Math.round(-delta*10)/10;if(this.heldStep(s)||this.flightStep(s))s.rotation=Math.round(((h.step.rotation||0)+turn)*10)/10;else if(s.type==='motion')s.transform={...ReactorBattleData.transform(s.transform),rotateZ:h.transform.rotateZ+turn};else s.rotateZ=(h.step.rotateZ||0)+turn;}
                else if(h.part){const entry=e.posePartEntry(h.part.name);if(!entry)return;const rotate=h.part.from.rotate.slice();rotate[{pitch:0,yaw:1,roll:2}[h.ring.axis]]+=delta;entry.rotate=rotate.map(v=>Math.round(v*10)/10);}
                else if(this.heldStep(s)){const heldKey={yaw:'rotateY',pitch:'rotation',roll:'rotateZ'}[h.ring.axis];s[heldKey]=Math.round(((h.step[heldKey]||0)+(heldKey==='rotation'?-delta:delta))*10)/10;}
                else if(this.flightStep(s)){if(h.ring.axis==='roll')s.rotation=Math.round(((h.step.rotation||0)+delta)*10)/10;}
                else if(s.type==='motion')s.transform={...ReactorBattleData.transform(s.transform),[key]:h.transform[key]+delta};else s[key]=(h.step[key]||0)+delta;
                if(this.mode==='step')e.ui.changed();
            }else{let point;if(h.arrow){const axis={x:'x',y:'z',z:'y'}[h.arrow.axis];point={...h.position,[axis]:h.position[axis]+h.arrow.travel(event.clientX,event.clientY)};}else{const now=this.point(event,h.position.z);if(!now)return;point={...h.position,x:h.position.x+now.x-h.point.x,y:h.position.y+now.y-h.point.y};}
                if(h.part){const entry=e.posePartEntry(h.part.name);if(!entry)return;
                    // The drag is in world tiles; a part slides in its model's own frame.
                    const world=new THREE.Vector3(point.x-h.position.x,point.z-h.position.z,point.y-h.position.y);if(h.part.object)world.applyQuaternion(h.part.object.getWorldQuaternion(new THREE.Quaternion()).invert());
                    entry.move=[0,1,2].map(i=>Math.round((h.part.from.move[i]+[world.x,world.y,world.z][i])*100)/100);}
                else this.writePosition(point,h);}
            if(h.part){e.ui.changed();e.showPoseFrame?.();}
            if(this.mode==='step'&&(s.type==='motion'||this.heldStep(s)||this.flightStep(s)||s.type==='move')){this.syncCards();e.validate();}else {const top=e.inspector.scrollTop;e.drawInspector();e.inspector.scrollTop=top;}e.paint();
        };
        const release=()=>{this.endCameraDrag();this.hold=null;RRPoseRings3D.emphasize(this.rings,null,false);RRAxisArrows3D.emphasize(this.arrows,null,false);e.validate();};c.onpointerup=release;c.onpointercancel=release;c.onlostpointercapture=release;
    }
}
