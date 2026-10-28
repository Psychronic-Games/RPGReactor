// Real Builder export, Database inspection and chibi regression on a disposable project.
// Run through codex-check on the headless display described in tests/perf/headless-display.sh.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { WebDriverClient } = require('./webdriver-client.cjs');
const root = path.resolve(__dirname, '../../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-builder-parity-'));
const evidence = path.resolve(process.env.RR_PARITY_EVIDENCE || temp);
const project = path.join(temp, 'Project');
fs.mkdirSync(project); fs.mkdirSync(evidence, { recursive: true });
fs.mkdirSync(path.join(project, 'data')); fs.writeFileSync(path.join(project, 'data/System.json'), '{}');
const recipe = JSON.parse(fs.readFileSync(path.join(root, 'template/Demo/3d/Actors/Rhea Voss/character.json'))).recipe;
let driver;
async function execute(script, ...args) {
    const result = await driver.executeAsync(`const done=arguments[arguments.length-1];(async()=>{${script}})().then(done,e=>done({auditError:String(e.stack)}));`, args);
    assert.ok(!result?.auditError, result?.auditError);
    return result;
}
async function launch(app, profile) {
    driver = new WebDriverClient(path.join(process.env.NWJS_SDK_ROOT || path.join(root, 'nwjs-linux'), 'chromedriver'));
    await driver.start();
    await driver.createSession({ browserName: 'chrome', 'goog:chromeOptions': { args: [
        `nwapp=${app}`, `user-data-dir=${path.join(temp, profile)}`, 'no-first-run', 'js-flags=--max-old-space-size=1024'
    ] }});
    await driver.setScriptTimeout(180000);
}
(async () => { try {
    await launch(path.join(root, 'editor'), 'editor-profile');
    await driver.waitForScript('return !!window.reactor?.forgeManager;', [], { timeout: 90000 });
    await execute(`
        window.__parityErrors=[];
        addEventListener('error',e=>__parityErrors.push(String(e.error?.stack||e.message)));
        addEventListener('unhandledrejection',e=>__parityErrors.push(String(e.reason?.stack||e.reason)));
        const pc=reactor.projectController;pc.currentProject={path:arguments[0]};
        await pc.mapEditor3D.ensureLibraries();
        // Exercise full materials on the Mesa headless display, including software GPUs.
        Character3DBuilder.weakGpu=()=>false;
        const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;z-index:99999;background:#252831';document.body.append(host);
        window.__builder=new Character3DBuilder();__builder.recipe=arguments[1];__builder.name='Rhea Voss';__builder.extreme=true;
        __builder._refreshThumbs=()=>{};__builder.renderInto(host,pc);
        return true;`, project, recipe);
    await driver.waitForScript('return !!__builder._result && __builder._view?.meshes.length>0;', [], { timeout: 120000 });
    const sheet = await execute(`
        const b=__builder,v=b._view,recipe=JSON.stringify(b.recipe),original=b._result;
        v.distance*=0.7;v.yaw=0.9;v.pitch=0.15;b._aim();
        const framing=JSON.stringify([v.distance,v.yaw,v.pitch,v.target.toArray()]);
        const render=v.renderer.render,samples=[],exposure=v.renderer.toneMappingExposure,size=v.renderer.getSize(new THREE.Vector2()).toArray();
        v.renderer.render=function(scene,camera){
            if(camera.isOrthographicCamera && scene===v.scene) samples.push({head:v.bones.find(n=>n.name==='Head').scale.x,leg:b._result.recipe.shapes.legLength});
            return render.call(this,scene,camera);
        };
        let result,queued=false;
        try { result=await RRCharacterSpriteSheet.render(b,{layout:'mz',frame:96,frames:6,elevation:10,style:'chibi',look:'smooth'},()=>{
            if(!queued){queued=true;b._queueRebuild();b._rebuild();}
        }); } finally {v.renderer.render=render;}
        // A deliberately queued rebuild may run while PNG encoding yields;
        // record restoration before allowing that legitimate editor update.
        const modelRestored=b._result===original;
        const framingRestored=JSON.stringify([v.distance,v.yaw,v.pitch,v.target.toArray()])===framing;
        require('fs').writeFileSync(require('path').join(arguments[0],'chibi.png'),await RRCharacterSpriteSheet.toPng(result));
        return {samples,recipeRestored:JSON.stringify(b.recipe)===recipe,modelRestored,
            framingRestored,
            exposureRestored:v.renderer.toneMappingExposure===exposure,sizeRestored:JSON.stringify(v.renderer.getSize(new THREE.Vector2()).toArray())===JSON.stringify(size),
            headAfter:v.bones.find(n=>n.name==='Head').scale.x,exporting:!!b._sheetExporting};`, evidence);
    assert.equal(sheet.samples.length, 24);
    assert.ok(sheet.samples.every(s => s.head > 1 && s.leg < -1), 'every direction and frame keeps its chibi body');
    for (const key of ['recipeRestored', 'modelRestored', 'exposureRestored', 'sizeRestored', 'framingRestored']) assert.equal(sheet[key], true, key);
    assert.equal(sheet.headAfter, 1); assert.equal(sheet.exporting, false);
    const interrupted = await execute(`
        const b=__builder;const original=b._result;
        let caught=false;try{await RRCharacterSpriteSheet.render(b,{layout:'mz',frame:48,frames:3,style:'chibi'},()=>{throw Error('intentional interruption');});}catch(e){caught=/intentional interruption/.test(e.message);}
        return {caught,restored:b._result===original,exporting:!!b._sheetExporting,head:b._view.bones.find(n=>n.name==='Head').scale.x};`);
    assert.equal(interrupted.caught, true); assert.equal(interrupted.restored, true);
    assert.equal(interrupted.exporting, false); assert.equal(interrupted.head, 1);
    const portrait = await execute(`
        const b=__builder,v=b._view,render=v.renderer.render,exposures=[];
        v.renderer.render=function(scene,camera){if(camera.isOrthographicCamera&&scene===v.scene)exposures.push(this.toneMappingExposure);return render.call(this,scene,camera);};
        let result;try{result=await RRCharacterSpriteSheet.render(b,{layout:'face',frame:144,style:'realistic'});}finally{v.renderer.render=render;}
        require('fs').writeFileSync(require('path').join(arguments[0],'faces.png'),await RRCharacterSpriteSheet.toPng(result));
        return {exposures,current:v.renderer.toneMappingExposure};`, evidence);
    assert.equal(portrait.exposures.length, 8); assert.ok(portrait.exposures.every(n => n === portrait.current));
    const inspection = await execute(`
        const b=__builder;await b.save();
        const fs=require('fs'),path=require('path'),file=path.join(b._project().path,'3d/Characters/Rhea Voss/source/Rhea Voss.glb');
        if(!fs.existsSync(file))throw Error('Export did not produce a GLB');
        const host=b.root;b.detach();host.innerHTML='';
        const e=window.__inspection=new Database3DEditor(reactor.databaseManager,reactor.projectController);
        e._fillThumbnails=()=>{};e.show(host);await e.selectModel(e.listModels().find(m=>m.name==='Characters/Rhea Voss'));
        await Database3DEditor.whenTexturesDecoded(e._template.userData.glbTextures,10000);
        const materials=[];e._object.traverse(n=>{if(n.material)materials.push(n.material);});
        e._renderer.render(e._scene,e._camera);
        fs.writeFileSync(path.join(arguments[0],'database.png'),Buffer.from(e._renderer.domElement.toDataURL('image/png').split(',')[1],'base64'));
        const r=e._detail.querySelector('.r3d-db-canvas').getBoundingClientRect();
        return {physical:materials.every(m=>m.isMeshPhysicalMaterial),normal:materials.filter(m=>m.normalMap).length,orm:materials.filter(m=>m.roughnessMap).length,
            decoded:e._template.userData.glbTextures.every(t=>t.image?.width>0),rect:{x:r.x,y:r.y,width:r.width,height:r.height},pan:{...e._viewGoal.pan},distance:e._viewGoal.distance};`, evidence);
    assert.equal(inspection.physical, true); assert.equal(inspection.decoded, true);
    assert.ok(inspection.normal > 0 && inspection.orm > 0);
    const { rect } = inspection, x = rect.x + rect.width * 0.7, y = rect.y + rect.height * 0.4;
    const cdp = (cmd, params) => driver.sessionRequest('POST', '/goog/cdp/execute', { cmd, params });
    for (const deltaY of [...Array(6).fill(-100), ...Array(6).fill(100)]) await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', clickCount: 1 });
    for (let i = 1; i <= 8; i++) await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x - i * 12, y, button: 'right', buttons: 2 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x - 96, y, button: 'right', clickCount: 1 });
    const camera = await driver.execute('return {pan:__inspection._viewGoal.pan,distance:__inspection._viewGoal.distance,yaw:__inspection._viewGoal.yaw,gl:__inspection._renderer.getContext().getError(),errors:__parityErrors};');
    assert.deepEqual(camera.pan, inspection.pan); assert.ok(Math.abs(camera.distance - inspection.distance) < 1e-7);
    assert.ok(Math.abs(camera.yaw - 30) > 1); assert.equal(camera.gl, 0); assert.deepEqual(camera.errors, []);
    fs.writeFileSync(path.join(evidence, 'report.json'), JSON.stringify({ sheet, interrupted, portrait, inspection, camera }, null, 2));
    // Leave the actual export with the evidence; a game audit can use these exact bytes.
    fs.cpSync(path.join(project, '3d/Characters/Rhea Voss'), path.join(evidence, 'Rhea Voss'), { recursive: true });
    console.log('Passed: all 24 chibi cells, interrupted export cleanup, portrait exposure, actual GLB export, PBR Database preview, zoom/rotate and decoded maps.');
    console.log(`Evidence: ${evidence}`);
} finally {
    await driver?.close();
    if (evidence !== temp) fs.rmSync(temp, { recursive: true, force: true });
} })().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
