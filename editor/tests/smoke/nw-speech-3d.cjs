// Face landmark card, precision controls, live arrows and sidecar roundtrip.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { WebDriverClient } = require('./webdriver-client.cjs');
const root = path.resolve(__dirname, '../../..'), source = path.join(root, 'template/Demo');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-face-points-')), project = path.join(temp, 'Demo');
const model = '3d/Actors/Psychronic-Mascot';
const original = fs.readFileSync(path.join(source, model, 'model.json'));
const driver = new WebDriverClient(path.join(process.env.NWJS_SDK_ROOT || path.join(root, 'nwjs-linux'), 'chromedriver'));
(async () => {
    try {
        fs.mkdirSync(project);
        for (const name of ['project.rpgreactor', 'package.json', 'index.html']) fs.copyFileSync(path.join(source, name), path.join(project, name));
        fs.cpSync(path.join(source, 'data'), path.join(project, 'data'), { recursive: true });
        for (const name of ['js', 'img', 'effects', 'audio', 'fonts', 'css', 'icon']) {
            if (fs.existsSync(path.join(source, name))) fs.symlinkSync(path.join(source, name), path.join(project, name), 'junction');
        }
        fs.mkdirSync(path.join(project, model), { recursive: true });
        for (const name of fs.readdirSync(path.join(source, model))) {
            const from = path.join(source, model, name), to = path.join(project, model, name);
            if (fs.statSync(from).isDirectory()) fs.symlinkSync(from, to, 'junction');
            else fs.copyFileSync(from, to);
        }
        await driver.start();
        await driver.createSession({ browserName: 'chrome', 'goog:chromeOptions': { args: [
            `nwapp=${path.join(root, 'editor')}`, `user-data-dir=${path.join(temp, 'profile')}`, 'no-first-run'
        ] } });
        await driver.setScriptTimeout(60000);
        await driver.waitForScript('return !!window.reactor?.databaseEditorUI;', [], { timeout: 90000 });
        assert.equal(await driver.executeAsync(`
            const done = arguments[arguments.length - 1], project = arguments[0];
            window.__faceErrors = [];
            window.addEventListener('error', event => __faceErrors.push(String(event.error || event.message)));
            window.addEventListener('unhandledrejection', event => __faceErrors.push(String(event.reason)));
            (async () => {
                const p = await reactor.projectManager.loadProject(project);
                await reactor.databaseManager.loadAllData(project);
                reactor.projectController.currentProject = p;
                reactor.projectController.projectLoaded = true;
                reactor.openDatabase('reactor3d');
                nw.Window.get().resizeTo(1280, 720);
                window.__faceEditor = reactor.databaseEditorUI.reactor3dEditor;
                return true;
            })().then(done, e => done(String(e.stack)));
        `, [project]), true);
        await driver.waitForScript('return __faceEditor._object && !__faceEditor._loadingPreview;', [], { timeout: 60000 });
        await driver.waitForScript("return getComputedStyle(document.getElementById('splash-screen')).display === 'none';", [], { timeout: 15000 });
        const diagnostic = await driver.execute(`
            const e = __faceEditor; e.setTool('face');
            const o = e._object, rest = o.__reactorLandmarkRest;
            const driver = Reactor3D.Speech.prepare(o); driver.apply(1);
            const meshes = [];
            o.traverse(m => { if (!m.isMesh || m.userData.__reactorOverlay) return;
                let maxDelta = 0, changed = 0;
                const p = m.geometry.attributes.position, morph = m.geometry.morphAttributes.position?.at(-1);
                if (morph) for (let i=0;i<p.count;i++) {
                    const a = new THREE.Vector3().fromBufferAttribute(p,i), b = new THREE.Vector3().fromBufferAttribute(morph,i);
                    const d = m.geometry.morphTargetsRelative ? b.length() : a.distanceTo(b);
                    if (d>1e-6) changed++; maxDelta=Math.max(maxDelta,d);
                }
                meshes.push({ name:m.name, vertices:p.count, skinned:!!m.isSkinnedMesh,
                    morphNames:m.morphTargetDictionary, influences:m.morphTargetInfluences, changed,maxDelta,
                    jaw:m.skeleton?.bones.filter(b=>/jaw|mouth/i.test(b.name)).map(b=>b.name) });
            });
            return { size:o.userData.glbSize, points:rest?.points, kind:driver.kind, meshes };
        `, [path.join(root, 'runtime/reactor_3d_speech.js')]);
        assert.equal(diagnostic.kind, 'lipMorph');
        assert.ok(diagnostic.meshes.some(m => m.changed > 0));
        const markers = await driver.execute(`
            const e = __faceEditor;
            const sizes = Object.fromEntries(Object.entries(e._rigMarkerMeshes).map(([k,m])=>[k,m.geometry.parameters.radius]));
            return { sizes, ratio:sizes.upperLip / Math.max(e._template.userData.glbSize.x,e._template.userData.glbSize.y,e._template.userData.glbSize.z) };
        `);
        assert.ok(markers.ratio < 0.003); assert.ok(markers.sizes.upperLip < markers.sizes.mouth);
        const previewed = await driver.execute(`
            const e=__faceEditor;Reactor3D.Speech.prepare(e._object).dispose();
            const pick=e._detail.querySelector('.r3d-face-point');pick.value='mouth';pick.dispatchEvent(new Event('change',{bubbles:true}));
            const originalGeometry=e._object.__reactorLandmarkRest.meshes[0].mesh.geometry;
            const color=e._detail.querySelector('.r3d-face-interior-color');color.value='#120808';color.dispatchEvent(new Event('input',{bubbles:true}));
            let slider=e._detail.querySelector('.r3d-face-mouth-preview');slider.value=.8;slider.dispatchEvent(new Event('input',{bubbles:true}));
            const kind=e._faceSpeechDriver?.kind;
            let cavities=0;e._object.traverse(m=>{if(m.name==='Reactor mouth interior'&&m.visible)cavities++;});
            const number=e._detail.querySelector('.r3d-face-number[data-i="0"]');number.value=Number(number.value)+.001;number.dispatchEvent(new Event('input',{bubbles:true}));
            const stopped=!e._faceSpeechDriver&&Number(slider.value)===0&&e._object.__reactorLandmarkRest.meshes[0].mesh.geometry===originalGeometry;
            e.saveFacePoints();e.setTool('orbit');e.setTool('face');
            return {kind,cavities,stopped,color:e._faceInteriorColor,interior:e._faceInterior};
        `);
        assert.equal(previewed.kind,'lipMorph');assert.ok(previewed.cavities>0);assert.equal(previewed.stopped,true);
        assert.equal(previewed.color,'#120808');assert.equal(previewed.interior,'dark');
        await driver.execute(`
            const e=__faceEditor, point=Reactor3D.modelLandmarkWorld(e._object,'mouth');
            e._disposeRigVisuals();e._detail.querySelector('.r3d-card').style.display='none';
            e._detail.querySelector('.r3d-canvas-wrap').classList.remove('r3d-face-editing');
            e._detail.querySelector('.r3d-stats-card').style.setProperty('display','none','important');
            e._viewCenter={x:point.x-.5,y:point.y,z:point.z-.5};
            Object.assign(e._view,{yaw:0,pitch:5,distance:.45});Object.assign(e._viewGoal,e._view);
        `);
        for(const amount of [0,1]) {
            await driver.executeAsync(`
                const amount=arguments[0],done=arguments[arguments.length-1];
                Reactor3D.Speech.prepare(__faceEditor._object).apply(amount);
                __faceEditor._lastInputAt=performance.now();setTimeout(done,200);
            `,[amount]);
            fs.writeFileSync(`/tmp/rr-mascot-mouth-${amount}.png`,Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
        }
        await driver.execute(`
            window.__speechResult = null;
            window.__speechCommandEditor = new SpeakModel3DEditor(reactor.projectController);
            __speechCommandEditor.show(SpeakModel3DEditor.build({audio:'powerup-02',volume:90,pitch:100,pan:0}), result=>__speechResult=result);
        `);
        const themes = ['dark', ...new Set([...fs.readFileSync(path.join(root,'editor/css/theme.css'),'utf8').matchAll(/data-theme="([^"\n]+)"/g)].map(m=>m[1]))];
        for (const theme of themes) {
            const layout = await driver.execute(`
                reactor.optionsManager.applyTheme(arguments[0]);
                const modal=document.querySelector('.rr-speech-modal'), rect=modal.getBoundingClientRect();
                const bg=getComputedStyle(modal).backgroundColor;
                return { opaque:bg!=='rgba(0, 0, 0, 0)', fits:rect.top>=0&&rect.bottom<=innerHeight,
                    overflow:modal.scrollWidth>modal.clientWidth+1,
                    fields:[...modal.querySelectorAll('input:not([type=checkbox]),select,textarea')].every(e=>{
                        const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.color!==s.backgroundColor&&r.width>100&&r.right<=rect.right;
                    }), duplicate:!!modal.querySelector('.speech-pitch,.speech-volume,.speech-pan'),
                    textFields:!!modal.querySelector('.speech-speaker,.speech-text') };
            `,[theme]);
            assert.deepEqual(layout,{opaque:true,fits:true,overflow:false,fields:true,duplicate:false,textFields:false},theme);
        }
        await driver.execute("reactor.optionsManager.applyTheme('dark'); document.querySelector('.speech-browse').click();");
        await driver.waitForScript("return !!document.querySelector('.rr-audio-picker-modal');");
        const picked = await driver.execute(`
            const picker=document.querySelector('.rr-audio-picker-modal');
            const sliders=[...picker.querySelectorAll('.audio-inline-control .audio-control-slider')];
            const initial=sliders.map(s=>Number(s.value));
            sliders.forEach((s,i)=>{s.value=[73,123,-17][i];s.dispatchEvent(new Event('input',{bubbles:true}));});
            picker.querySelector('.rr-button-primary').click();
            document.querySelector('.speech-ok').click();
            const saved=__speechResult;
            __speechCommandEditor.show(saved,result=>__speechResult=result);
            document.querySelector('.speech-browse').click();
            const reopened=[...document.querySelectorAll('.rr-audio-picker-modal .audio-inline-control .audio-control-slider')].map(s=>Number(s.value));
            document.querySelector('.rr-audio-picker-modal .rr-btn-secondary').click();
            return {initial,reopened,args:saved.parameters[3]};
        `);
        assert.deepEqual(picked.initial,[90,100,0]);assert.deepEqual(picked.reopened,[73,123,-17]);
        assert.equal(picked.args.pitch,'123');assert.equal(picked.args.volume,'73');assert.equal(picked.args.pan,'-17');
        // Escape closes the picker; command Cancel leaves the original event alone.
        await driver.execute("const p=document.querySelector('.rr-audio-picker-modal');if(p)p.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));");
        fs.writeFileSync('/tmp/rr-speech-form.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
        await driver.execute("document.querySelector('.speech-cancel').click();");
        assert.equal(await driver.execute('return __speechResult;'),null);
        console.log(`Speech editor passed: ${themes.length} themes, audio picker roundtrip, smaller lip markers, mascot morph generation and Cancel.`);
    } finally {
        await driver.close();
        assert.deepEqual(fs.readFileSync(path.join(source, model, 'model.json')), original, 'authored Demo remains untouched');
        fs.rmSync(temp, { recursive: true, force: true });
    }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
