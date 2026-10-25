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
test('3D scene effects do not enter the overlay',()=>{
    const e=environment(),s={_effectContext:{}};e.api.setup(s,{effectName:'Scene'});
    assert.equal(s._hdrEntry,undefined);assert.equal(e.fetches.length,0);
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
test('a grade compilation failure selects the safe twin',async()=>{
    const e=environment(),s=e.sprite();await e.ready(s);let shaders=0;
    e.gl.getShaderParameter=()=>++shaders<=4; // downsample and blur compile; the grade fails
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
