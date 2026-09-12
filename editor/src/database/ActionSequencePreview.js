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
        this.modeSelect=U.select([['step','Step Transform'],['formation','Preview Formation']],this.mode,v=>{this.mode=v;e.stepPlayback=null;e.playing=false;if(v==='formation')e.frame=0;e.drawInspector();});row.append(this.modeSelect);
        this.selectionSelect=U.select([],this.selection,v=>{this.selection=v;e.playing=false;if(this.mode==='step'){const s=e.sequence.steps[e.selected];if(s&&(s.role!=='allTargets'||v==='user')){e.edit(()=>{s.role=v==='user'?'user':'target';s.targetIndex=v==='user'?undefined:Number(v.slice(6));});}}e.drawInspector();});row.append(this.selectionSelect);this.targetsChanged();
        this.toolSelect=U.select([['move','Move'],['rotate','Rotate']],this.tool,v=>this.setTool(v));row.append(this.toolSelect);
        row.append(U.button('Zoom In',()=>this.zoom(.8)),U.button('Zoom Out',()=>this.zoom(1.25)),U.button('Reset View',()=>{this.distance=14;}));
    }
    zoom(factor){this.distance=Math.max(4,Math.min(50,this.distance*factor));}
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
        const e=this.editor;e.playing=false;e.stepPlayback=null;this.transformPose=step;
        e.frame=ReactorBattleData.timeline(e.sequence)[e.selected].end;
    }
    transformFields(step,change,host=this.editor.inspector){const e=this.editor,U=e.ui;
        if(host===e.inspector)host.append(U.element('h4','','Model Transform'));
        const enabled=U.element('input');enabled.type='checkbox';enabled.checked=!!step.transform;
        U.field(host,'Override Transform',enabled);enabled.onchange=()=>{change('transform',enabled.checked?ReactorBattleData.transform():undefined);if(enabled.checked){this.setTool('rotate');this.showTransformPose(step);}else this.transformPose=null;e.drawInspector();e.paint();};
        if(!step.transform){host.append(U.element('p','rr-battle-help','Enable to offset, rotate or reshape this motion.'));return;}
        const tools=U.element('div','rr-sequence-transform-tools');host.append(tools);
        for(const [tool,label] of [['move','Move'],['rotate','Rotate']]){const button=U.button(label,()=>{this.setTool(tool);this.showTransformPose(step);e.paint();});button.dataset.transformTool=tool;button.setAttribute('aria-pressed',String(this.tool===tool));tools.append(button);}
        const t=ReactorBattleData.transform(step.transform);
        for(const [title,keys] of [['Position Offset',['x','y','z']],['Rotation',['rotateX','rotateY','rotateZ']]]){
            const group=U.element('div','rr-sequence-transform-fields');host.append(U.element('span','rr-sequence-transform-label',title),group);
            for(const key of keys)this.transformControl(group,step,key,title);
        }
        const proportional=U.element('input');proportional.type='checkbox';proportional.checked=!this.freeScale&&['scaleX','scaleY','scaleZ'].every(k=>t[k]===1);
        U.field(host,'Proportional',proportional);proportional.onchange=()=>{change('transform',{...step.transform,scaleX:1,scaleY:1,scaleZ:1});this.freeScale=!proportional.checked;this.showTransformPose(step);e.drawInspector();e.paint();};
        const group=U.element('div','rr-sequence-transform-fields');host.append(U.element('span','rr-sequence-transform-label','Scale'),group);
        this.transformControl(group,step,'scale','Scale');
        if(!proportional.checked)for(const key of ['scaleX','scaleY','scaleZ'])this.transformControl(group,step,key,'Scale');
        host.append(U.button('Reset Transform',()=>{change('transform',ReactorBattleData.transform());this.showTransformPose(step);e.drawInspector();e.paint();}));
    }
    transformControl(host,step,key,title){
        const e=this.editor,U=e.ui,isScale=key.startsWith('scale'),isRotation=key.startsWith('rotate'),axis=key==='scale'?'S':key.slice(-1).toUpperCase();
        const row=U.element('div','rr-sequence-transform-row');row.style.setProperty('--transform-axis-color',({X:'#e5484d',Y:'#46a758',Z:'#3e63dd'})[axis]||'var(--color-accent)');host.append(row);
        row.append(U.element('span','rr-sequence-transform-axis',axis));
        const slider=U.element('input');slider.type='range';slider.min=isScale?.01:isRotation?-180:-5;slider.max=isScale?4:isRotation?180:5;slider.step=isRotation?.1:.01;slider.dataset.transformSlider=key;slider.title=U.text('Double-click to reset');
        const input=U.element('input','database-field-value');input.type='number';input.step=slider.step;input.min=isScale?.01:isRotation?-3600:-1000;input.max=isScale?100:isRotation?3600:1000;input.dataset.transformField=key;
        const label=U.text(title)+' '+axis;slider.setAttribute('aria-label',label);input.setAttribute('aria-label',label);row.append(slider,input);
        let editing=false;
        const apply=source=>{
            if(e.sequence.steps[e.selected]!==step||!step.transform||!Number.isFinite(source.valueAsNumber))return;
            const value=Math.max(Number(input.min),Math.min(Number(input.max),source.valueAsNumber));
            if(value!==ReactorBattleData.transform(step.transform)[key]){
                if(!editing){e.pushUndo();editing=true;}
                step.transform={...step.transform,[key]:value};this.showTransformPose(step);U.changed();e.validate();
            }
            this.syncTransformFields(source);e.paint();
        };
        for(const control of [slider,input]){
            control.oninput=()=>apply(control);
            control.onchange=()=>{apply(control);editing=false;this.syncTransformFields();};
            control.onblur=()=>{editing=false;this.syncTransformFields();};
            control.onpointercancel=()=>{editing=false;};
        }
        slider.ondblclick=()=>{editing=false;slider.value=isScale?1:0;apply(slider);editing=false;};
        this.syncTransformFields();
    }
    syncTransformFields(source){
        const e=this.editor,t=ReactorBattleData.transform(e.sequence.steps[e.selected]?.transform);
        for(const input of e.inspector.querySelectorAll('[data-transform-field]'))if(input!==source)input.value=String(Math.round(t[input.dataset.transformField]*1000)/1000);
        for(const slider of e.inspector.querySelectorAll('[data-transform-slider]')){
            const value=t[slider.dataset.transformSlider];
            if(slider!==source){slider.min=Math.min(Number(slider.min),value);slider.max=Math.max(Number(slider.max),value);slider.value=value;}
        }
    }
    activeKey(){const s=this.editor.sequence.steps[this.editor.selected];return this.mode==='formation'?this.selection:s?.role==='user'?'user':s?.role==='allTargets'?this.selection==='user'?'target0':this.selection:'target'+(s?.targetIndex??0);}
    editable(){const s=this.editor.sequence.steps[this.editor.selected];return this.mode==='formation'||s?.type==='move'||(s?.type==='motion'&&!!s.transform);}
    sync(poses){const e=this.editor,view=e.preview;if(!view)return;const key=this.activeKey(),p=poses[key];
        this.selectionSelect.value=this.mode==='formation'?this.selection:key;
        if(!this.rings){this.rings=RRPoseRings3D.create(THREE,.8,'sequence-rings');this.arrows=RRAxisArrows3D.create(THREE,1.3,'sequence-arrows');view.scene.add(this.rings.root,this.arrows.root);}
        const combined=this.mode==='step'&&e.sequence.steps[e.selected]?.type==='motion';
        const visible=!!p&&this.editable()&&!e.playing,at={x:(p?.x||0)+.5,y:(p?.z||0)+.8,z:(p?.y||0)+.5};
        RRPoseRings3D.sync(this.rings,at,(p?.facing||0)+(p?.rotateY||0),p?.rotateX||0,visible&&(combined||this.tool==='rotate'));
        this.rings.pitch.group.visible=this.rings.roll.group.visible=this.mode!=='formation';
        RRAxisArrows3D.sync(this.arrows,at,visible&&(combined||this.tool==='move'));view.scene.updateMatrixWorld(true);
    }
    point(event,height=0){const e=this.editor,view=e.preview;if(!view)return null;const rect=e.canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),view.camera);const p=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-height),new THREE.Vector3());return p?{x:p.x-.5,y:p.z-.5,z:height}:null;}
    poses(){const e=this.editor;return Object.fromEntries(Object.entries((this.mode==='formation'?e.previewContext().homes:ReactorBattleData.evaluate(e.previewSequence(),e.frame,e.previewContext()))).map(([k,p])=>[k,ReactorBattleData.visualPose(p)]));}
    pickBattler(event){const e=this.editor,rect=e.canvas.getBoundingClientRect(),poses=this.poses(),keys=['user',...Array.from({length:e.targetCount},(_,i)=>'target'+i)];
        const markers=keys.map(key=>{const p=e.preview.project(poses[key]);return {key,distance:Math.hypot(event.clientX-rect.left-p.x/e.canvas.width*rect.width,event.clientY-rect.top-p.y/e.canvas.height*rect.height)};}).sort((a,b)=>a.distance-b.distance);
        if(markers[0]?.distance<14)return markers[0].key;
        const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),e.preview.camera);
        const hits=[];for(const key of keys){const object=(e.preview.models.get(key)||e.preview.billboards.get(key))?.object;if(object?.visible){const hit=ray.intersectObject(object,true)[0];if(hit)hits.push({key,distance:hit.distance});}}return hits.sort((a,b)=>a.distance-b.distance)[0]?.key;
    }
    writePosition(point,hold){const e=this.editor,step=e.sequence.steps[e.selected],round=v=>Math.round(v*100)/100;
        if(this.mode==='formation'){this.placements[hold.key]={...hold.home,x:round(point.x),y:round(point.y),z:round(point.z)};return;}
        if(step.type==='motion'){step.transform={...ReactorBattleData.transform(step.transform),x:round(hold.transform.x+point.x-hold.position.x),y:round(hold.transform.y+point.y-hold.position.y),z:round(hold.transform.z+point.z-hold.position.z)};}
        else {const context=e.previewContext(),home=context.homes[hold.key],anchor=['target','approach'].includes(step.anchor)?context.target:home;
            const visual=ReactorBattleData.transform(ReactorBattleData.evaluate(e.sequence,e.frame,context)[hold.key]?.transform),dx=point.x-visual.x-anchor.x,dy=point.y-visual.y-anchor.y;
            if(step.anchor==='approach'){const vx=context.target.x-context.homes.user.x,vy=context.target.y-context.homes.user.y,len=Math.hypot(vx,vy),ux=len>1e-6?vx/len:context.direction,uy=len>1e-6?vy/len:0;step.x=round(dx*ux+dy*uy);step.y=round(-dx*uy+dy*ux);}else{step.x=round(dx/context.direction);step.y=round(dy);}step.z=round(point.z-visual.z-anchor.z);
        }
        e.ui.changed();e.validate();
    }
    bindPointer(){const e=this.editor,c=e.canvas;
        c.onwheel=event=>{event.preventDefault();this.zoom(Math.exp(event.deltaY*.001));};
        c.onpointerdown=event=>{if(event.button!==0||!e.preview)return;e.playing=false;
            const rect=c.getBoundingClientRect(),s=e.sequence.steps[e.selected],key=this.activeKey();let p=this.poses()[key];
            const arrowHit=RRAxisArrows3D.pick(THREE,this.arrows,e.preview.camera,rect,event.clientX,event.clientY);
            const ringHit=RRPoseRings3D.pick(THREE,this.rings,e.preview.camera,rect,event.clientX,event.clientY,{yaw:(p?.facing||0)+(p?.rotateY||0),pitch:p?.rotateX||0,roll:p?.rotateZ||0});
            // Both gizmos stay available for motion overrides. The selected
            // tool decides which handle wins where their screen targets overlap.
            const ring=this.tool==='move'&&arrowHit?null:ringHit,arrow=ring?null:arrowHit;
            const hit=ring||arrow?key:this.pickBattler(event);if(!hit)return;
            if(hit!==key){this.selection=hit;if(this.mode==='step'&&s&&(s.role!=='allTargets'||hit==='user')){e.edit(()=>{s.role=hit==='user'?'user':'target';s.targetIndex=hit==='user'?undefined:Number(hit.slice(6));});}e.drawInspector();}
            if(!this.editable())return;
            if(this.mode==='step'){e.pushUndo();if(s.type==='motion')this.showTransformPose(s);else {e.stepPlayback=null;e.frame=ReactorBattleData.timeline(e.sequence)[e.selected].end;}e.paint();}
            p=this.poses()[hit];const point=this.point(event,p.z);if(!point&&!ring&&!arrow)return;
            this.hold={key:hit,ring,arrow,position:{...p},point,home:{...e.previewContext().homes[hit]},transform:ReactorBattleData.transform(s?.transform),step:{...s}};
            if(ring)RRPoseRings3D.emphasize(this.rings,ring.axis,true);if(arrow)RRAxisArrows3D.emphasize(this.arrows,arrow.axis,true);c.setPointerCapture(event.pointerId);event.preventDefault();
        };
        c.onpointermove=event=>{const h=this.hold;if(!h)return;const s=e.sequence.steps[e.selected];
            if(h.ring){const value=RRPoseRings3D.drag(THREE,h.ring,e.preview.camera,c.getBoundingClientRect(),event.clientX,event.clientY);if(value===null)return;
                const delta=value-h.ring.startValue,key={yaw:'rotateY',pitch:'rotateX',roll:'rotateZ'}[h.ring.axis];
                if(this.mode==='formation')this.placements[h.key]={...h.home,facing:h.home.facing+delta};
                else if(s.type==='motion')s.transform={...ReactorBattleData.transform(s.transform),[key]:h.transform[key]+delta};else s[key]=(h.step[key]||0)+delta;
                if(this.mode==='step')e.ui.changed();
            }else{let point;if(h.arrow){const axis={x:'x',y:'z',z:'y'}[h.arrow.axis];point={...h.position,[axis]:h.position[axis]+h.arrow.travel(event.clientX,event.clientY)};}else{const now=this.point(event,h.position.z);if(!now)return;point={...h.position,x:h.position.x+now.x-h.point.x,y:h.position.y+now.y-h.point.y};}this.writePosition(point,h);}
            if(this.mode==='step'&&s.type==='motion'){this.syncTransformFields();e.validate();}else {const top=e.inspector.scrollTop;e.drawInspector();e.inspector.scrollTop=top;}e.paint();
        };
        const release=()=>{this.hold=null;RRPoseRings3D.emphasize(this.rings,null,false);RRAxisArrows3D.emphasize(this.arrows,null,false);e.validate();};c.onpointerup=release;c.onpointercancel=release;c.onlostpointercapture=release;
    }
}
