const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const runtime = path.resolve(__dirname, '../../runtime');
const source = fs.readFileSync(path.join(runtime, 'reactor_hdr_overlay.js'), 'utf8');
const side = {version:1, gradeInput:'hdr', grade:'vec3 tmOut = hdr / (hdr + vec3(1.0));', fallback:'Twin',
    bloom:{intensity:0.675,radiusScale:2.4,sizes:[0.3,1,2,10,30,64],tints:[0.3465,0.138,0.1176,0.066,0.066,0.061]}};

function environment(metadata = side, floats = true) {
    const loads = [], fetches = [], warnings = [], drawn = [], calls = [];
    let lost = false, next = 1;
    const constants = new Map();
    const gl = new Proxy({
        isContextLost: () => lost,
        getExtension: name => !floats ? null : name === 'OES_texture_half_float' ? {HALF_FLOAT_OES:0x8d61} : {},
        checkFramebufferStatus() { return gl.FRAMEBUFFER_COMPLETE; },
        getShaderParameter: () => true,
        getProgramParameter(_p, name) { return name === gl.ACTIVE_UNIFORMS ? 0 : true; },
    }, {get(o,k) {
        if (k in o) return o[k];
        if (/^[A-Z0-9_]+$/.test(k)) {if(!constants.has(k))constants.set(k,next++);return constants.get(k);}
        return (...args) => {calls.push([k,...args]); return /^create/.test(k) ? {} : undefined;};
    }});
    const c = {AbortController, setTimeout, clearTimeout, performance,
        Graphics:{_effekseerGL:gl,_effekseerCanvas:{width:128,height:72},
            settleEffekseerState(){},effekseer:{beginDraw(){},endDraw(){},drawHandle(h){drawn.push(h.name);}}},
        EffectManager:{makeUrl:n=>'effects/'+n+'.efkefc',load:n=>{loads.push(n);return n;}},
        fetch:async url=>{fetches.push(url);return metadata === null ? {status:404} : {status:200,ok:true,json:async()=>metadata};},
        console:{warn:(...args)=>warnings.push(args.join(' ')),info(){}}};
    c.window=c;vm.runInNewContext(source,c);
    const api=c.ReactorHdrOverlay;
    function sprite(name='Nested/Effect-hdr',label='Ordinary') {
        const s={_animation:{name:label,effectName:name,id:1},_effect:name,_playing:true,_frameIndex:15,
            _handle:{name,stop(){this.stopped=true;}},
            setProjectionMatrix(){},setCameraMatrix(){},setViewport(){},resetViewport(){}};
        api.setup(s,s._animation);return s;
    }
    async function ready(s){await api.cache.get(s._animation.effectName).promise;}
    return {c,api,gl,sprite,ready,loads,fetches,warnings,drawn,calls,setLost:v=>lost=v};
}

test('metadata gates startup, caches success, and does not allocate for ordinary effects',async()=>{
    const e=environment(null), a=e.sprite('Plain'), b=e.sprite('Plain');
    assert.equal(e.api.canStart(a),false);await e.ready(a);
    assert.equal(e.api.canStart(a),true);assert.equal(e.api.canStart(b),true);
    assert.equal(e.fetches.length,1);assert.equal(e.calls.length,0);
});
test('on the desktop an effect with no sidecar on disk is not fetched and warns of nothing',async()=>{
    // NW.js rejects a fetch of a missing file instead of answering 404: every ordinary effect warned.
    const e=environment(side);e.c.Utils={localAssetExists:url=>url==='effects/Plain.hdr.json'?false:null};
    const a=e.sprite('Plain');await e.ready(a);
    assert.equal(e.fetches.length,0);assert.deepEqual(e.warnings,[]);assert.equal(e.api.canStart(a),true);
    const b=e.sprite('Nested/Effect-hdr');await e.ready(b);
    assert.deepEqual(e.fetches,['effects/Nested/Effect-hdr.hdr.json'],'one it cannot tell about is fetched');
});
test('missing float support loads a relative safe twin',async()=>{
    const e=environment(side,false),s=e.sprite();await e.ready(s);
    assert.equal(e.api.canStart(s),true);assert.equal(s._effect,'Nested/Twin');assert.equal(s._hdrActive,false);
});
test('missing metadata on an HDR filename fails closed',async()=>{
    const e=environment(null),s=e.sprite();await e.ready(s);
    assert.equal(e.api.canStart(s),false);assert.equal(s._playing,false);
});
test('invalid metadata fails closed',async()=>{
    const e=environment({...side,bloom:{...side.bloom,radiusScale:-1}}),s=e.sprite();await e.ready(s);
    assert.equal(e.api.canStart(s),false);assert.equal(s._playing,false);
});
test('3D scene effects do not enter the overlay',async()=>{
    const e=environment(null),s={_effectContext:{},_animation:{effectName:'Scene'},_playing:true};
    e.api.setup(s,s._animation);await e.ready(s);
    assert.equal(e.api.canStart(s),true);assert.equal(s._hdrActive,false);assert.equal(e.calls.length,0,'no HDR targets for it');
});
test('two same-grade HDR animations share one accumulation and grade pass',async()=>{
    const e=environment(),a=e.sprite(),b=e.sprite();await e.ready(a);
    e.api.canStart(a);e.api.canStart(b);e.api.render({},[a,b]);
    assert.equal(e.api.stats.draws,2);assert.equal(e.api.stats.groups,1);assert.equal(e.drawn.length,2);
    const allocations=e.api.stats.allocations;
    e.api.render({},[a,b]);assert.equal(e.api.stats.allocations,allocations);
});
test('distinct grades composite separately',async()=>{
    const e=environment(),a=e.sprite(),b=e.sprite('Other-hdr');await e.ready(a);await e.ready(b);
    e.api.cache.get('Other-hdr').sidecar={...side,grade:'vec3 tmOut = hdr * 0.1;'};
    e.api.canStart(a);e.api.canStart(b);e.api.render({},[a,b]);assert.equal(e.api.stats.groups,2);
});
test('zero intensity skips all nineteen bloom passes',async()=>{
    const e=environment(),s=e.sprite();await e.ready(s);
    e.api.configure({bloomIntensity:0});e.api.canStart(s);e.api.render({},[s]);
    assert.equal(e.calls.filter(c=>c[0]==='drawArrays').length,1,'only the final grade/composite draws');
});
test('a bloom threshold runs the setup pass once, at level log2(radiusScale) (2.4 -> the first downsample)',async()=>{
    const e=environment({...side,bloom:{...side.bloom,threshold:0.15}}),s=e.sprite();await e.ready(s);
    e.api.canStart(s);e.api.render({},[s]);
    assert.deepEqual(e.calls.filter(c=>c[0]==='uniform1f'&&c[2]===0.15).length,1);
    assert.equal(e.calls.filter(c=>c[0]==='drawArrays').length,20,'7 downsamples (1 setup), 12 blurs, 1 grade');
});
test('an effect drawn at the game size thresholds at full resolution before the first downsample',async()=>{
    const e=environment({...side,bloom:{...side.bloom,radiusScale:1,threshold:0.15}}),s=e.sprite();await e.ready(s);
    e.api.canStart(s);e.api.render({},[s]);
    assert.equal(e.calls.filter(c=>c[0]==='uniform1f'&&c[2]===0.15).length,1);
    assert.equal(e.calls.filter(c=>c[0]==='drawArrays').length,21,'1 full-resolution setup, 7 downsamples, 12 blurs, 1 grade');
});
test('without a threshold every downsample is a plain average',async()=>{
    const e=environment(),s=e.sprite();await e.ready(s);e.api.canStart(s);e.api.render({},[s]);
    assert.equal(e.calls.filter(c=>c[0]==='uniform1f'&&c[2]===0.15).length,0);
    assert.equal(e.calls.filter(c=>c[0]==='drawArrays').length,20);
});
test('a Unity bloom prefilter takes the setup pass with its clamp, threshold and knee',async()=>{
    const e=environment({...side,bloom:{...side.bloom,radiusScale:1,prefilter:{threshold:0.674,knee:0.464,clamp:0.8}}}),s=e.sprite();await e.ready(s);
    e.api.canStart(s);e.api.render({},[s]);
    for(const v of [0.674,0.464,0.8])assert.equal(e.calls.filter(c=>c[0]==='uniform1f'&&c[2]===v).length,1,'one '+v);
    assert.equal(e.calls.filter(c=>c[0]==='uniform1f'&&c[2]===1).length,1,'the Unity switch set once');
    assert.equal(e.calls.filter(c=>c[0]==='drawArrays').length,21,'1 full-resolution setup, 7 downsamples, 12 blurs, 1 grade');
});
test('a caller that passes no prefilter (an older editor preview) still gets the sidecar\'s',async()=>{
    const e=environment(),pre={threshold:0.674,knee:0.464,clamp:0.8};
    const R=e.c.ReactorHdrRenderer.create(e.gl);assert.ok(R.ensure(128,72));R.begin();
    R.post({bloom:0.65,bloomScale:1},{...side,bloom:{...side.bloom,radiusScale:1,prefilter:pre}});
    for(const v of [0.674,0.464,0.8])assert.equal(e.calls.filter(c=>c[0]==='uniform1f'&&c[2]===v).length,1,'one '+v);
});
test('a prefilter without a clamp uses Unity\'s default 65472',async()=>{
    const e=environment({...side,bloom:{...side.bloom,prefilter:{threshold:0.9,knee:0.45}}}),s=e.sprite();await e.ready(s);
    e.api.canStart(s);e.api.render({},[s]);
    assert.equal(e.calls.filter(c=>c[0]==='uniform1f'&&c[2]===65472).length,1);
    assert.equal(e.calls.filter(c=>c[0]==='drawArrays').length,20,'7 downsamples (1 setup), 12 blurs, 1 grade');
});
test('an invalid bloom prefilter fails closed',async()=>{
    for(const prefilter of [{threshold:'0.9',knee:0.45},{threshold:0.9,knee:-1},{threshold:0.9,knee:0.45,clamp:0},null]){
        const e=environment({...side,bloom:{...side.bloom,prefilter}}),s=e.sprite();await e.ready(s);
        assert.equal(e.api.canStart(s),false,JSON.stringify(prefilter));assert.equal(s._playing,false);
    }
});
test('a non-numeric bloom threshold fails closed',async()=>{
    const e=environment({...side,bloom:{...side.bloom,threshold:'0.15'}}),s=e.sprite();await e.ready(s);
    assert.equal(e.api.canStart(s),false);assert.equal(s._playing,false);
});
test('a grade compilation failure selects the safe twin',async()=>{
    const e=environment(),s=e.sprite();await e.ready(s);let shaders=0;
    e.gl.getShaderParameter=()=>++shaders<=6; // downsample, setup and blur compile; the grade fails
    assert.equal(e.api.canStart(s),true);assert.equal(s._hdrActive,false);assert.equal(s._effect,'Nested/Twin');
    assert.ok(e.calls.some(c=>c[0]==='deleteProgram'));
});
test('resize and context restoration recreate targets',async()=>{
    const e=environment(),a=e.sprite();await e.ready(a);e.api.canStart(a);
    assert.equal(e.api.stats.allocations,1);
    e.c.Graphics._effekseerCanvas.width=130;e.api.render({},[a]);assert.equal(e.api.stats.allocations,2);
    e.setLost(true);e.api.contextLost();e.api.render({},[a]);
    assert.equal(a._handle.stopped,true);assert.equal(a._hdrActive,false);assert.equal(a._playing,false);
    const waiting=e.sprite();await e.ready(waiting);assert.equal(e.api.canStart(waiting),false);
    e.setLost(false);e.api.contextRestored();const b=e.sprite();await e.ready(b);e.api.canStart(b);
    assert.equal(b._hdrActive,true);assert.equal(e.api.stats.allocations,3);
});
test('ordinary draws retain order and HDR groups follow them',()=>{
    const text=fs.readFileSync(path.join(runtime,'reactor_sprites.js'),'utf8');
    const body=text.slice(text.indexOf('Sprite_Animation.renderActive ='),text.indexOf('Sprite_Animation.prototype._render ='));
    const order=[];const hdr={_hdrActive:true};const plain=n=>({_doEffekseerDraw(){order.push(n);}});
    const c={Graphics:{},Sprite_Animation:{_pendingRenders:[plain('first'),hdr,plain('second')]},
        ReactorHdrOverlay:{render(_r,list){assert.equal(list[0],hdr);order.push('hdr');}}};c.window=c;
    vm.runInNewContext(body,c);c.Sprite_Animation.renderActive({});
    assert.deepEqual(order,['first','second','hdr']);assert.equal(c.Sprite_Animation._pendingRenders.length,0);
});
test('native upgrade skips old plugin script and preserves its parameters',()=>{
    const text=fs.readFileSync(path.join(runtime,'reactor_managers.js'),'utf8');
    const body=text.slice(text.indexOf('PluginManager.setup ='),text.indexOf('PluginManager.parameters ='));
    const e=environment();let loaded=0;
    e.c.PluginManager={_scripts:[],loadScript(){loaded++;},setParameters(){}};
    e.c.Utils={extractFileName:n=>n};vm.runInNewContext(body,e.c);
    e.c.PluginManager.setup([{name:'ReactorHdrOverlay',status:true,parameters:{bloomIntensity:'0.5'}}]);
    assert.equal(loaded,0);assert.equal(e.api.native,true);
});
test('native module is included before sprites and project plugin setup',()=>{
    const text=fs.readFileSync(path.join(runtime,'reactor_main.js'),'utf8');
    assert.ok(text.indexOf('js/reactor_hdr_overlay.js')<text.indexOf('js/reactor_sprites.js'));
    assert.ok(text.indexOf('js/reactor_hdr_overlay.js')<text.indexOf('js/reactor_plugins.js'));
});
test('Graphics context events invalidate the native resources',()=>{
    const text=fs.readFileSync(path.join(runtime,'reactor_core.js'),'utf8');
    const start=text.indexOf('Graphics._listenEffekseerStateResets =');
    const body=text.slice(start,text.indexOf('\n};',start)+3);
    const listeners={};let prevented=false,invalidated=false;
    const c={Graphics:{_effekseerCanvas:{addEventListener:(name,fn)=>(listeners[name]||(listeners[name]=[])).push(fn)}},
        window:{addEventListener(){}},document:{addEventListener(){}},
        ReactorHdrOverlay:{contextLost(){invalidated=true;}}};
    vm.runInNewContext(body,c);c.Graphics._listenEffekseerStateResets();
    const event={preventDefault(){prevented=true;}};
    for(const fn of listeners.webglcontextlost)fn(event);
    assert.equal(prevented,true);assert.equal(invalidated,true);
});
test('an in-scene sprite is chosen against the scene renderer and takes its twin from the scene layer',async()=>{
    // No float targets: the twin, loaded into the scene's context, not the overlay's.
    const e=environment(side,false),sceneLoads=[];
    e.c.Graphics._app={renderer:{gl:e.gl}};e.c.Graphics.width=128;e.c.Graphics.height=72;
    e.c.Sprite_Animation={SceneLayer:{load:n=>{sceneLoads.push(n);return 'scene:'+n;},guard:fn=>fn(e.gl,{})}};
    const s=e.sprite();s._effekseerInScene=true;await e.ready(s);
    assert.equal(e.api.canStart(s),true);assert.equal(s._hdrActive,false);
    assert.equal(s._effect,'scene:Nested/Twin');assert.deepEqual(sceneLoads,['Nested/Twin']);assert.deepEqual(e.loads,[]);
    // Float targets: HDR, drawn by the scene layer, nothing loaded.
    const f=environment(side,true);
    f.c.Graphics._app={renderer:{gl:f.gl}};f.c.Graphics.width=128;f.c.Graphics.height=72;
    f.c.Sprite_Animation={SceneLayer:{load:()=>{throw Error('no load');},guard:fn=>fn(f.gl,{})}};
    const t=f.sprite();t._effekseerInScene=true;await f.ready(t);
    assert.equal(f.api.canStart(t),true);assert.equal(t._hdrActive,true);
    // An overlay context loss leaves in-scene animations playing.
    f.api.contextLost();assert.equal(t._hdrActive,true);assert.notEqual(t._playing,false);
    // A failed in-scene pass hands it to the twin, through the scene layer.
    const twins=[];f.c.Sprite_Animation.SceneLayer.load=n=>{twins.push(n);return 'scene:'+n;};
    f.api.scene.fallBack(t);assert.equal(t._hdrActive,false);assert.equal(t._effect,'scene:Nested/Twin');assert.equal(t._handle.stopped,true);
});
test('the composite lands in the framebuffer the caller names',()=>{
    const e=environment(),R=e.c.ReactorHdrRenderer.create(e.gl,{});
    assert.equal(R.ensure(16,16),true);
    e.calls.length=0;
    R.post({bloom:0,bloomScale:1,framebuffer:'pixi-target'},side,{x:3,y:4,w:16,h:16});
    const draws=e.calls.map((c,i)=>[c,i]).filter(([c])=>c[0]==='drawArrays');
    const before=e.calls.slice(0,draws.at(-1)[1]);
    assert.equal(before.filter(c=>c[0]==='bindFramebuffer').at(-1)[2],'pixi-target');
    assert.deepEqual(before.filter(c=>c[0]==='viewport').at(-1).slice(1),[3,4,16,16]);
    e.calls.length=0;R.post({bloom:0,bloomScale:1},side);
    assert.equal(e.calls.filter(c=>c[0]==='bindFramebuffer').at(-1)[2],null,'unnamed: the default framebuffer, as before');
});

test('companion validation refuses invalid fields and resolved aliases',()=>{
 const e=environment();
 for(const companion of ['', ' ',null,3,'Body.efkefc','Twin'])assert.throws(()=>e.c.ReactorHdrRenderer.valid({...side,companion}));
 for(const companionOccludes of [1,'true',null])assert.throws(()=>e.c.ReactorHdrRenderer.valid({...side,companionOccludes}));
 for(const companion of ['Effect-hdr','Nested/Effect-hdr','Nested/Twin'])assert.throws(()=>e.c.ReactorHdrRenderer.valid({...side,companion},'Nested/Effect-hdr'));
});
test('companion waits for metadata and loading and is stopped on fallback',async()=>{
 const e=environment({...side,companion:'Body'}),s=e.sprite();await e.ready(s);
 const entry={ready:false,sidecar:null};e.api.cache.set('Nested/Body',entry);
 const effect={isLoaded:false};e.c.EffectManager.load=n=>{e.loads.push(n);return effect;};
 assert.equal(e.api.canStart(s),false);entry.ready=true;assert.equal(e.api.canStart(s),false);
 effect.isLoaded=true;assert.equal(e.api.canStart(s),true);
 const h={stop(){this.stopped=true;}};s._companionHandle=h;e.api.scene.fallBack(s);
 assert.equal(h.stopped,true);assert.equal(s._companionEffect,null);assert.equal(s._hdrActive,false);
});
test('missing and HDR companions fall back; the twin loads no companion',async()=>{
 for(const failure of ['missing','hdr']){
  const e=environment({...side,companion:'Body'}),s=e.sprite();await e.ready(s);
  e.c.Utils={localAssetExists:url=>failure==='missing'&&url.endsWith('Body.efkefc')?false:null};
  e.api.cache.set('Nested/Body',{ready:true,sidecar:failure==='hdr'?side:null});
  e.api.canStart(s);assert.equal(s._hdrActive,false);assert.equal(s._effect,'Nested/Twin');assert.equal(e.warnings.length,1);
 }
 const e=environment({...side,companion:'Body'},false),s=e.sprite();await e.ready(s);e.api.canStart(s);
 assert.deepEqual(e.loads,['Nested/Twin']);
});
test('companion prepass precedes HDR light and restores colour writes',async()=>{
 const e=environment({...side,companion:'Body'}),s=e.sprite();await e.ready(s);
 e.api.cache.set('Nested/Body',{ready:true,sidecar:null});e.api.canStart(s);
 const h=s._companionHandle={name:'body',exists:true,stop(){this.stopped=true;}};
 e.api.render({},[s]);assert.deepEqual(e.drawn,['body',s._handle.name]);
 assert.ok(e.calls.some(c=>c[0]==='depthMask'&&c[1]===true));
 const masks=e.calls.filter(c=>c[0]==='colorMask'); const off=masks.findIndex(c=>c[1]===false); assert.ok(off>=0); assert.deepEqual(masks[off+1],['colorMask',true,true,true,true]);
 e.api.release(s);assert.equal(h.stopped,true);assert.equal(s._companionHandle,null);
});

test('one fresh cast seed reaches both handles before transforms; either handle holds the animation open',()=>{
 const text=fs.readFileSync(path.join(runtime,'reactor_sprites.js'),'utf8');
 const extract=name=>{const a=text.indexOf('Sprite_Animation.prototype.'+name+' =');return text.slice(a,text.indexOf('\n};',a)+4);};
 const calls=[];let i=0;
 const handles=[0,1].map(n=>({exists:true,setRandomSeed(seed){calls.push(['seed',n,seed]);},setLocation(...v){calls.push(['location',n,...v]);},setRotation(...v){calls.push(['rotation',n,...v]);},setScale(...v){calls.push(['scale',n,...v]);},setSpeed(...v){calls.push(['speed',n,...v]);}}));
 const c={Sprite_Animation:function(){},Sprite:{prototype:{update(){}}},Graphics:{effekseer:{play(){calls.push(['play',i]);return handles[i++];}}},Math};
 for(const name of ['update','updateEffectGeometry','forEachEffectHandle','setRotation','checkEnd'])vm.runInNewContext(extract(name),c);
 const s=new c.Sprite_Animation();Object.assign(s,{_playing:true,_effect:{isLoaded:true},_companionEffect:{isLoaded:true},_hdrActive:true,_animation:{scale:125,speed:80,rotation:{x:10,y:20,z:30}},canStart:()=>true,reactor3DScale:()=>1,updateMain(){},updateFlash(){}});
 s.update();assert.deepEqual(calls.slice(0,4).map(x=>x[0]),['play','play','seed','seed']);assert.equal(calls[2][2],calls[3][2]);
 for(const method of ['location','rotation','scale','speed']){const pair=calls.filter(x=>x[0]===method);assert.equal(pair.length,2);assert.deepEqual(pair[0].slice(2),pair[1].slice(2));}
 s._frameIndex=20;s._maxTimingFrames=0;s._flashDuration=0;handles[0].exists=false;s.checkEnd();assert.equal(s._playing,true);handles[1].exists=false;s.checkEnd();assert.equal(s._playing,false);
});

test('all adapter termination paths stop and drop the companion',async()=>{
 for(const action of ['release','lost','sceneLost','fallback','failedRender']){
  const e=environment({...side,companion:'Body'}),s=e.sprite();await e.ready(s);e.api.cache.set('Nested/Body',{ready:true,sidecar:null});e.api.canStart(s);
  const h=s._companionHandle={exists:true,name:'body',stop(){this.stopped=true;}};
  if(action==='release')e.api.release(s);
  if(action==='lost')e.api.contextLost();
  if(action==='sceneLost'){s._effekseerInScene=true;e.api.scene.lost();}
  if(action==='fallback')e.api.scene.fallBack(s);
  if(action==='failedRender'){e.c.Graphics.effekseer.drawHandle=()=>{throw Error('draw failure');};e.api.render({},[s]);}
  assert.equal(h.stopped,true,action);assert.equal(s._companionHandle,null,action);assert.equal(s._companionEffect,null,action);
 }
});

test('a companion load callback selects the twin without raising a global load error',async()=>{
 const e=environment({...side,companion:'Body'}),s=e.sprite();await e.ready(s);e.api.cache.set('Nested/Body',{ready:true,sidecar:null});
 let failure; e.c.EffectManager.load=(name,onError)=>{if(onError){failure=onError;return {isLoaded:false};}return name;};
 assert.equal(e.api.canStart(s),false);failure('resource failed','effects/Nested/Body.efkefc');
 assert.equal(e.api.canStart(s),true);assert.equal(s._hdrActive,false);assert.equal(s._effect,'Nested/Twin');
});
test('EffectManager soft failures are local; ordinary failures retain their queue',()=>{
 const text=fs.readFileSync(path.join(runtime,'reactor_managers.js'),'utf8');
 const take=name=>{const a=text.indexOf('EffectManager.'+name+' =');return text.slice(a,text.indexOf('\n};',a)+4);};
 let callback,reported=0;
 const c={EffectManager:{_cache:{},_softLoadErrors:new Map(),onLoad(){},onError(){reported++;},makeUrl:n=>'effects/'+n+'.efkefc'},Graphics:{effekseer:{loadEffect(url,scale,loaded,failed){callback=failed;return {isLoaded:false};}}}};
 for(const name of ['load','startLoading'])vm.runInNewContext(take(name),c);
 let soft=0;c.EffectManager.load('Body',()=>soft++);callback('bad','body');assert.equal(soft,1);assert.equal(reported,0);assert.equal(Object.keys(c.EffectManager._cache).length,0);
 c.EffectManager.load('Ordinary');callback('bad','ordinary');assert.equal(reported,1);
});

test('bloom.intensityKeys play as straight lines between keys, held before the first and after the last',()=>{
 const e=environment(),f=e.c.ReactorHdrRenderer.bloomIntensity,b={intensity:1,intensityKeys:[[0,1.374],[66.4,2],[147.3,0.122]]};
 assert.equal(f(b,-5),1.374);assert.equal(f(b,0),1.374);assert.equal(f(b,66.4),2);assert.equal(f(b,400),0.122);
 assert.ok(Math.abs(f(b,33.2)-1.687)<1e-9);assert.ok(Math.abs(f(b,106.85)-1.061)<1e-9);
 assert.equal(f({intensity:0.675},50),0.675,'no keys: intensity');assert.equal(f(b,undefined),1.374,'no frame: frame 0');
});
test('a keyed intensity draws with the value at the sprite\'s effect frame',async()=>{
 const e=environment({...side,bloom:{...side.bloom,intensityKeys:[[0,2],[60,0.5]]}}),s=e.sprite();await e.ready(s);
 e.api.canStart(s);s._effectFrame=30;e.api.render({},[s]);
 const w=e.calls.filter(c=>c[0]==='uniform1fv').at(-1)[2];
 assert.deepEqual(Array.from(w).map(x=>+x.toFixed(9)),side.bloom.tints.map(t=>+(t*1.25).toFixed(9)));
});
test('same-grade animations at different keyed intensities bloom in separate passes; equal ones share one',async()=>{
 const keys=[[0,2],[60,0.5]],e=environment({...side,bloom:{...side.bloom,intensityKeys:keys}}),a=e.sprite(),b=e.sprite();await e.ready(a);
 e.api.canStart(a);e.api.canStart(b);a._effectFrame=10;b._effectFrame=10;e.api.render({},[a,b]);assert.equal(e.api.stats.groups,1);
 b._effectFrame=40;e.api.render({},[a,b]);assert.equal(e.api.stats.groups,3);
 assert.equal(e.api.scene.intensity(a),e.c.ReactorHdrRenderer.bloomIntensity({intensityKeys:keys},10));
});
const twoGrades={...side,gradeB:'vec3 tmOut = hdr * 0.5;',gradeKeys:[[10,0],[30,1]]};
test('gradeKeys weigh the second grade on the effect clock, clamped and held at the ends',()=>{
 const f=environment().c.ReactorHdrRenderer.gradeMix;
 assert.equal(f(twoGrades,0),0);assert.equal(f(twoGrades,20),0.5);assert.equal(f(twoGrades,90),1);assert.equal(f(side,20),0);
});
test('gradeB compiles both grades in their own functions and leaves a one-grade program as it was',()=>{
 const e=environment(),R=e.c.ReactorHdrRenderer.create(e.c.Graphics._effekseerGL);
 R.gradeProgram(twoGrades.grade,twoGrades.gradeB);R.gradeProgram(side.grade);
 const fs=e.calls.filter(c=>c[0]==='shaderSource'&&/uHdr/.test(c[2])).map(c=>c[2]);
 assert.match(fs[0],/vec3 rr_gradeA\(vec3 hdr\)\{\nvec3 tmOut = hdr \/ \(hdr \+ vec3\(1\.0\)\);\nreturn tmOut;/);
 assert.match(fs[0],/vec3 rr_gradeB\(vec3 hdr\)\{\nvec3 tmOut = hdr \* 0\.5;\nreturn tmOut;/);
 assert.match(fs[0],/mix\(rr_gradeA\(hdr\), rr_gradeB\(hdr\), uGradeMix\)/);
 assert.doesNotMatch(fs[1],/uGradeMix|rr_grade/);
});
test('invalid gradeB or gradeKeys fail closed',async()=>{
 for(const bad of [{gradeB:'vec3 x;',gradeKeys:[[0,1]]},{gradeB:twoGrades.gradeB},{gradeB:twoGrades.gradeB,gradeKeys:[]},{gradeB:twoGrades.gradeB,gradeKeys:[[0,2]]},{gradeKeys:[[0,1]]}]){
  const e=environment({...side,...bad}),s=e.sprite();await e.ready(s);
  assert.equal(e.api.canStart(s),false,JSON.stringify(bad));
 }
});
test('invalid bloom.intensityKeys fail closed',async()=>{
 for(const intensityKeys of [[],[[0,1],[0,2]],[[5,1],[2,2]],[[0,-1]],[[0,'1']],[[0,1,2]],{0:1},null]){
  const e=environment({...side,bloom:{...side.bloom,intensityKeys}}),s=e.sprite();await e.ready(s);
  assert.equal(e.api.canStart(s),false,JSON.stringify(intensityKeys));assert.equal(s._playing,false);
 }
});
test('the effect clock steps with each Effekseer update, at the animation\'s speed, and slow motion scales it',()=>{
 const sprites=fs.readFileSync(path.join(runtime,'reactor_sprites.js'),'utf8');
 assert.ok(sprites.includes('if (this._started) this._effectFrame += (globalThis.SceneManager?._effekseerStep ?? 1) * this._animation.speed / 100;'));
 assert.ok(fs.readFileSync(path.join(runtime,'reactor_fight_camera.js'),'utf8').includes('this._effekseerStep = (this._effekseerStep || 0) * scale;'));
 const managers=fs.readFileSync(path.join(runtime,'reactor_managers.js'),'utf8');
 const a=managers.indexOf('SceneManager.updateEffekseer = function'),body=managers.slice(a,managers.indexOf('\n};',a)+4);
 const c={Graphics:{effekseer:{update(){}}},SceneManager:{isGameActive:()=>true}};
 vm.runInNewContext(body,c);c.SceneManager.updateEffekseer();assert.equal(c.SceneManager._effekseerStep,1);
 c.SceneManager.isGameActive=()=>false;c.SceneManager.updateEffekseer();assert.equal(c.SceneManager._effekseerStep,0,'a paused game does not step effects');
});
test('an effect the 3D scene draws reads its sidecar and plays its twin, from the context it plays in',async()=>{
    const entry={context:{}},gpu=[];
    const anchored=e=>{const s=e.sprite();delete s._hdrEntry;s._effectContext=entry;e.api.setup(s,s._animation);return s;};
    const stub=e=>{e.c.Reactor3D={GpuEffects:{load:(x,n)=>{gpu.push([x===entry,n]);return 'gpu:'+n;}}};};
    // A GPU effect on a model.
    const e=environment();stub(e);const s=anchored(e);await e.ready(s);
    assert.equal(e.api.canStart(s),true);assert.equal(s._hdrActive,false);assert.equal(s._effect,'gpu:Nested/Twin');
    assert.deepEqual(gpu,[[true,'Nested/Twin']]);assert.deepEqual(e.loads,[],'not the overlay\'s context');assert.equal(e.calls.length,0,'no HDR targets for it');
    // Drawn by the 3D scene through the overlay's context: float targets would otherwise select HDR for a handle nothing grades.
    const o=environment(),t=o.sprite();t._reactorInScene=true;await o.ready(t);
    assert.equal(o.api.canStart(t),true);assert.equal(t._hdrActive,false);assert.equal(t._effect,'Nested/Twin');assert.deepEqual(o.loads,['Nested/Twin']);
});
test('a -hdr effect on a model without a sidecar is refused and says so; an ordinary one is untouched',async()=>{
    const entry={context:{}},e=environment(null);
    e.c.Reactor3D={GpuEffects:{load:()=>{throw Error('no load');}}};
    const s=e.sprite();delete s._hdrEntry;s._effectContext=entry;e.api.setup(s,s._animation);await e.ready(s);
    assert.equal(e.api.canStart(s),false);assert.equal(s._playing,false);assert.equal(s._hdrRefused,true);
    const p=e.sprite('Plain');delete p._hdrEntry;p._effectContext=entry;p._effect='gpu:Plain';e.api.setup(p,p._animation);await e.ready(p);
    assert.equal(e.api.canStart(p),true);assert.equal(p._effect,'gpu:Plain');assert.equal(p._hdrRefused,undefined);
});
