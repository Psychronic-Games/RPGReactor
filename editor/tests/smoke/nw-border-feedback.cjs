#!/usr/bin/env node
'use strict';
// Native border approach/crossing regression, on a disposable Demo copy.
// Default: Forest Road -> Open Fields -> Forest Road, then west toward
// North Haven. A short return to Forest Road's east edge misses the failure.
// --uncapped exercises spare-refresh captures; --chain visits all eastern
// maps and returns; --trace captures exact failing draw/sampler attachments.
// Run through codex-check on the isolated display in perf/headless-display.sh.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const { WebDriverClient } = require('./webdriver-client.cjs');
const option = (name, fallback) => process.argv.slice(2).find(a => a.startsWith('--' + name + '='))?.slice(name.length + 3) || fallback;
const out = path.resolve(option('out', path.join(os.tmpdir(), 'rr-border-feedback')));
const from = Number(option('from', '8')), row = Number(option('row', '38'));
const mapName = id => 'Map' + String(id).padStart(3, '0');
const sourceMap = JSON.parse(fs.readFileSync(path.join(root, 'template/Demo/data', mapName(from) + '.json')));
const sourceSide = JSON.parse(fs.readFileSync(path.join(root, 'template/Demo/data', mapName(from) + '.r3d.json')));
const to = sourceSide.surround.neighbors.east.map, width = sourceMap.width;
fs.mkdirSync(out, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-border-feedback-'));
const project = path.join(temp, 'Demo'), demo = path.join(root, 'template/Demo');
fs.mkdirSync(project);
for (const name of ['index.html', 'package.json', 'project.rpgreactor']) fs.copyFileSync(path.join(demo, name), path.join(project, name));
for (const name of ['data', 'js', 'icon', 'css']) fs.cpSync(path.join(demo, name), path.join(project, name), { recursive: true });
for (const name of ['img', '3d', 'audio', 'effects', 'fonts', 'movies']) if (fs.existsSync(path.join(demo, name))) fs.symlinkSync(path.join(demo, name), path.join(project, name));
for (const name of fs.readdirSync(path.join(root, 'runtime'))) if (name.endsWith('.js') && name !== 'reactor_plugins.js') fs.copyFileSync(path.join(root, 'runtime', name), path.join(project, 'js', name));
const file = path.join(project, 'data/System.json'), system = JSON.parse(fs.readFileSync(file));
Object.assign(system, { startMapId: from, startX: Number(option('start-x', String(width - 20))), startY: row, rrSkipTitle: false });
fs.writeFileSync(file, JSON.stringify(system));
if (option('camera', '')) {
    for (const id of [from, to]) {
        const file = path.join(project, 'data', mapName(id) + '.r3d.json'), side = JSON.parse(fs.readFileSync(file));
        side.camera = { ...side.camera, mode: option('camera', '') };
        fs.writeFileSync(file, JSON.stringify(side));
    }
}
const driver = new WebDriverClient(path.join(root, 'nwjs-linux/chromedriver'));
const cdp = (cmd, params = {}) => driver.sessionRequest('POST', '/goog/cdp/execute', { cmd, params });
const pause = ms => driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(()=>done(true),arguments[0]);', [ms]);
async function key(type, key, code) {
    await cdp('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
}
async function snapshot(label) {
    const state = await driver.execute(`
        const ss=SceneManager._scene?._spriteset,v=ss?._reactor3d,N=Reactor3D.Neighbors;
        return {map:$gameMap.mapId(),x:$gamePlayer._realX,y:$gamePlayer._realY,revision:RPG_REACTOR_RUNTIME_REVISION,gpu:Graphics.gpuDescription,
            glErrors:window.__borderGL,errors:window.__borderErrors,world:Graphics.worldFrameCount,neighbors:Object.values(v?.scene?._neighborBodies||{}).map(b=>({map:b.mapId,stage:b.stage,settle:b.settle})),gl:v?.viewport.renderer().getContext().getError()};`);
    const logs = await driver.sessionRequest('POST', '/log', { type: 'browser' });
    const report = { label, ...state, logs };
    fs.writeFileSync(path.join(out, label + '.json'), JSON.stringify(report, null, 2));
    console.log(label, JSON.stringify({ map: state.map, x: state.x, gpu: state.gpu, glErrors: state.glErrors?.length, warnings: logs.filter(l => /feedback|GL_INVALID|INVALID_OPERATION/i.test(l.message)).slice(0, 2) }));
    return report;
}
(async () => { try {
    await driver.start();
    await driver.createSession({ browserName: 'chrome', 'goog:chromeOptions': { args: [`nwapp=${project}`, `user-data-dir=${path.join(temp, 'profile')}`, 'no-first-run', 'mute-audio', 'disable-backgrounding-occluded-windows', 'disable-renderer-backgrounding', 'disable-background-timer-throttling', 'js-flags=--max-old-space-size=1024', ...(process.argv.includes('--uncapped') ? ['disable-gpu-vsync', 'disable-frame-rate-limit'] : [])] } });
    await driver.setScriptTimeout(120000);
    await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
    await driver.waitForScript('return !!window.$dataSystem && !!window.SceneManager?._scene && DataManager.isDatabaseLoaded() && ConfigManager.isLoaded() && SceneManager._scene.isStarted() && !(SceneManager._scene instanceof Scene_Boot) && !SceneManager.isSceneChanging();', [], { timeout: 120000 });
    await driver.execute(`
        window.__borderGL=[];window.__borderErrors=[];addEventListener('error',e=>__borderErrors.push(String(e.error?.stack||e.message)));
        SceneManager.isGameActive=()=>true;Reactor3D.Quality.enabled=false;if(arguments[0])Reactor3D.gpuTierOverride=arguments[0];DataManager.setupNewGame();$gameSystem.disableEncounter();SceneManager.goto(Scene_Map);
    `, [option('tier', '')]);
    await driver.waitForScript(`const v=SceneManager._scene?._spriteset?._reactor3d;return !!v&&!v.arrival&&!v.warming&&SceneManager._scene._fadeDuration===0;`, [], { timeout: 120000 });
    await driver.execute(`
        for(const e of $gameMap.events())if(e.page()?.trigger>=3)e.erase();$gameMap._interpreter.clear();$gamePlayer.setThrough(true);$gamePlayer.setMoveSpeed(arguments[1]);
        const renderer=SceneManager._scene._spriteset._reactor3d.viewport.renderer(),gl=renderer.getContext(),render=renderer.render;
        if(arguments[0]){const direct=renderer.renderBufferDirect;
            renderer.renderBufferDirect=function(camera,scene,geometry,material,object){const before=window.__borderOwner;window.__borderOwner={object:object.name,type:object.type,material:material.name,water:!!material.__reactorWater,reflect:material.userData?.rrWaterLook?.x,reflects:!!material.__reactorReflects,hook:String(material.onBeforeRender).slice(0,600),envIsTarget:renderer.properties.get(material).uniforms?.rrEnvMap?.value===this.getRenderTarget()?.texture};try{return direct.apply(this,arguments);}finally{window.__borderOwner=before;}};
        }
        renderer.render=function(scene,camera){const prev=window.__borderPass,target=this.getRenderTarget();
            window.__borderPass={scene:scene.name,target:target?[target.width,target.height,target.texture?.name]:null,override:scene.overrideMaterial?.type};
            try{return render.apply(this,arguments);}finally{const error=gl.getError();if(error&&__borderGL.length<30)__borderGL.push({error,...window.__borderPass,map:$gameMap.mapId(),x:$gamePlayer._realX,stack:String(new Error().stack)});window.__borderPass=prev;}
        };
        if(arguments[0])for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){const original=gl[name];gl[name]=function(){const result=original.apply(this,arguments),error=this.getError();if(error&&__borderGL.length<30){const attachments=[],samplers=[],program=this.getParameter(this.CURRENT_PROGRAM),active=this.getParameter(this.ACTIVE_TEXTURE);
            if(this.getParameter(this.DRAW_FRAMEBUFFER_BINDING))for(const attachment of [this.COLOR_ATTACHMENT0,this.DEPTH_ATTACHMENT,this.STENCIL_ATTACHMENT])if(this.getFramebufferAttachmentParameter(this.DRAW_FRAMEBUFFER,attachment,this.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE)===this.TEXTURE)attachments.push({attachment,texture:this.getFramebufferAttachmentParameter(this.DRAW_FRAMEBUFFER,attachment,this.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME)});
            const targets=new Map([[this.SAMPLER_2D,[this.TEXTURE_2D,this.TEXTURE_BINDING_2D]],[this.SAMPLER_2D_SHADOW,[this.TEXTURE_2D,this.TEXTURE_BINDING_2D]],[this.SAMPLER_CUBE,[this.TEXTURE_CUBE_MAP,this.TEXTURE_BINDING_CUBE_MAP]],[this.SAMPLER_3D,[this.TEXTURE_3D,this.TEXTURE_BINDING_3D]]]);
            if(program)for(let i=0;i<this.getProgramParameter(program,this.ACTIVE_UNIFORMS);i++){const uniform=this.getActiveUniform(program,i),binding=targets.get(uniform.type);if(!binding)continue;const value=this.getUniform(program,this.getUniformLocation(program,uniform.name));for(const unit of typeof value==='number'?[value]:value){this.activeTexture(this.TEXTURE0+unit);const texture=this.getParameter(binding[1]);const match=attachments.filter(a=>a.texture===texture).map(a=>a.attachment);if(match.length)samplers.push({name:uniform.name,unit,attachments:match});}}
            this.activeTexture(active);__borderGL.push({error,draw:name,...window.__borderPass,owner:window.__borderOwner,samplers,map:$gameMap.mapId(),x:$gamePlayer._realX,stack:String(new Error().stack)});
        }return result;};}
    `, [process.argv.includes('--trace'), Number(option('speed', '4'))]);
    const reports = [];
    await pause(2000); reports.push(await snapshot('approach-start'));
    await key('keyDown', 'ArrowRight', 39);
    await driver.waitForScript('return $gameMap.mapId()===arguments[0]&&$gamePlayer._realX>=arguments[2]-6||$gameMap.mapId()===arguments[1];', [from, to, width], { timeout: 60000 });
    await key('keyUp', 'ArrowRight', 39); reports.push(await snapshot('near-east-edge'));
    if (process.argv.includes('--quality-cycle')) {
        for (const quality of ['medium', 'low', 'high', 'auto']) {
            await driver.execute('Reactor3D.Quality.enabled=true;ConfigManager.graphicsQuality=arguments[0];', [quality]);
            await pause(750);
            reports.push(await snapshot('quality-' + quality));
        }
    }
    await pause(2000);
    await key('keyDown', 'ArrowRight', 39);
    await driver.waitForScript('return $gameMap.mapId()===arguments[0]&&$gamePlayer._realX>=3&&!SceneManager.isSceneChanging();', [to], { timeout: 60000 });
    await key('keyUp', 'ArrowRight', 39); await pause(1500); reports.push(await snapshot('next-map'));
    if (process.argv.includes('--chain')) {
        const route = [from, to];
        let current = to;
        while (true) {
            const side = JSON.parse(fs.readFileSync(path.join(project, 'data', mapName(current) + '.r3d.json')));
            const next = side.surround?.neighbors?.east?.map;
            if (!next) break;
            await key('keyDown', 'ArrowRight', 39);
            await driver.waitForScript('return $gameMap.mapId()===arguments[0]&&$gamePlayer._realX>=4&&!SceneManager.isSceneChanging();', [next], { timeout: 60000 });
            await key('keyUp', 'ArrowRight', 39); await pause(1500); reports.push(await snapshot('chain-east-' + next));
            route.push(next); current = next;
        }
        for (let i = route.length - 2; i >= 1; i--) {
            const previous = route[i], map = JSON.parse(fs.readFileSync(path.join(project, 'data', mapName(previous) + '.json')));
            await key('keyDown', 'ArrowLeft', 37);
            await driver.waitForScript('return $gameMap.mapId()===arguments[0]&&$gamePlayer._realX<=arguments[1]-4&&!SceneManager.isSceneChanging();', [previous, map.width], { timeout: 60000 });
            await key('keyUp', 'ArrowLeft', 37); await pause(1500); reports.push(await snapshot('chain-west-' + previous));
        }
    }
    await key('keyDown', 'ArrowLeft', 37);
    await driver.waitForScript('return $gameMap.mapId()===arguments[0]&&$gamePlayer._realX<=arguments[1]&&!SceneManager.isSceneChanging();', [from, Number(option('return-x', from === 8 ? '4' : String(width - 4)))], { timeout: 60000 });
    await key('keyUp', 'ArrowLeft', 37); await pause(1500); reports.push(await snapshot('return'));
    fs.writeFileSync(path.join(out, 'return.png'), Buffer.from(await driver.sessionRequest('GET', '/screenshot'), 'base64'));
    for (const report of reports) {
        assert.equal(report.gl, 0, report.label);
        assert.equal(report.glErrors.length, 0, JSON.stringify(report.glErrors.slice(0, 2)));
        assert.deepEqual(report.errors, []);
        const warnings = report.logs.filter(l => /feedback|GL_INVALID|INVALID_OPERATION/i.test(l.message));
        assert.equal(warnings.length, 0, warnings.slice(0, 2).map(l => l.message).join('\n'));
    }
} finally { try { await driver.close(); } finally { fs.rmSync(temp, { recursive: true, force: true }); } } })().catch(error => { console.error(error); process.exitCode = 1; });
