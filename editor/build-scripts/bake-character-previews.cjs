#!/usr/bin/env node
// Bakes the 3D Character Builder's tile pictures (species, outfits, garments, accessories, hair, creature kinds) into
// src/forge/Character3D/previews/<kind>-<f|m|x>.json, so the builder opens with them and builds none. Run it again
// after Character3DBuilder.PREVIEW_VERSION changes (tests/character-preview-shipped.test.cjs says when).
//
//   nice -n 19 node build-scripts/bake-character-previews.cjs [--only=dress,hair]
//
// It drives the real editor in one muted window on a hidden display (tests/perf/headless-display.sh) with a
// throwaway project and profile in ~/.cache/rr-tests/bake-previews, removed when it ends. Lists already whole at this
// version are kept (--all bakes them again).
'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), { spawn } = require('node:child_process');
const editor = path.resolve(__dirname, '..'), root = path.resolve(editor, '..');
const { WebDriverClient } = require(path.join(editor, 'tests/smoke/webdriver-client.cjs'));
const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const temp = path.join(os.homedir(), '.cache/rr-tests/bake-previews'), project = path.join(temp, 'Project');
const out = path.join(editor, 'src/forge/Character3D/previews');
fs.rmSync(temp, { recursive: true, force: true });
fs.mkdirSync(path.join(project, 'data'), { recursive: true });
fs.writeFileSync(path.join(project, 'data/System.json'), '{}');
fs.mkdirSync(out, { recursive: true });
let display, log = '';
const driver = new WebDriverClient(path.join(root, process.platform === 'win32' ? 'nwjs-win/chromedriver.exe' : 'nwjs-linux/chromedriver'));
async function run(code, args = []) {
    const r = await driver.executeAsync(`const done=arguments[arguments.length-1];(async()=>{${code}})().then(done,e=>done({error:String(e.stack)}));`, args);
    if (r?.error) throw Error(r.error);
    return r;
}
(async () => {
    try {
        if (process.platform !== 'win32') {
            display = spawn(path.join(editor, 'tests/perf/headless-display.sh'), [], { env: process.env });
            process.env.DISPLAY = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(Error('Display startup timed out')), 20000);
                display.stdout.on('data', b => { log += b; const m = log.match(/(?:^|\n)(:\d+)\s/); if (m) { clearTimeout(timer); resolve(m[1]); } });
            });
            process.env.XAUTHORITY = ''; process.env.XDG_SESSION_TYPE = 'x11'; delete process.env.WAYLAND_DISPLAY; process.env.__GLX_VENDOR_LIBRARY_NAME = 'mesa';
            driver.env = { ...driver.env, ...process.env }; delete driver.env.WAYLAND_DISPLAY;
        }
        await driver.start();
        await driver.createSession({ browserName: 'chrome', 'goog:chromeOptions': { args: [`nwapp=${editor}`, `user-data-dir=${temp}/profile`, 'no-first-run', 'mute-audio', 'disable-background-timer-throttling', 'disable-renderer-backgrounding', 'disable-backgrounding-occluded-windows', 'js-flags=--max-old-space-size=1024'] } });
        await driver.setScriptTimeout(1500000);
        await driver.waitForScript('return !!window.reactor?.forgeManager;', [], { timeout: 90000 });
        const version = await run(`const pc=reactor.projectController;pc.currentProject={path:arguments[0]};await pc.mapEditor3D.ensureLibraries();Character3DBuilder.weakGpu=()=>false;
            const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;z-index:99999;background:#252831';document.body.append(host);
            window.__b=new Character3DBuilder();__b.tab='body';__b.renderInto(host,pc);return Character3DBuilder.PREVIEW_VERSION;`, [project]);
        await driver.waitForScript('return !!__b._result&&__b._view?.meshes.length>0;', [], { timeout: 180000 });
        // The builder's own view is not drawn while baking: on the hidden display its frames are slow, and every
        // picture waits its turn behind one.
        await run(`__b._render=()=>{};return true;`);
        // Each list as the builder's own tabs name it; nothing a project brought (a fresh project has none).
        const lists = await run(`const W=RRCharacterWardrobe,H=RRCharacterHair,T=window.RRCharacterOutfitTransfer;
            const ours=id=>{const d=W.BY_ID.get(id);return !!d&&(!d.transfer||(T&&T.BUILT_IN.includes(d.transfer)));};
            return {species:RRCharacterSpecies.SPECIES.map(s=>s.id),kind:RRCreatureBody.KINDS.map(k=>k.kind),
                dress:W.PRESETS.filter(p=>p.items.every(i=>ours(i.id))).map(p=>p.id),garment:W.GARMENTS.map(g=>g.id).filter(ours),prop:[...RRCharacterProps.BY_ID.keys()],
                hair:H.STYLES.map(s=>s.id),facial:H.FACIAL.map(s=>s.id),brows:H.BROWS.map(s=>s.id),cyberlook:window.RRCharacterCyberGear?RRCharacterCyberGear.LOOKS.map(l=>l.id):[]};`);
        const jobs = [];
        for (const kind of Object.keys(lists)) for (const tag of kind === 'kind' ? ['x'] : kind === 'species' ? ['f', 'm', 'x'] : ['f', 'm']) if (!only.length || only.includes(kind)) jobs.push([kind, tag]);
        let total = 0, bytes = 0; const failed = [], started = Date.now();
        for (const [kind, tag] of jobs) {
            // A list already baked at this version, whole, is kept: a stopped bake goes on where it was.
            const file = path.join(out, `${kind}-${tag}.json`);
            try { const have = JSON.parse(fs.readFileSync(file, 'utf8')); if (!process.argv.includes('--all') && have.version === version && lists[kind].every(id => have.pictures[id])) { console.log(`${kind}-${tag}: kept`); continue; } } catch (e) { /* not there */ }
            const made = await run(`const b=__b,[kind,tag,ids]=arguments;b._thumbQueue=[];
                b.recipe=tag==='x'?Object.assign({plan:'quadruped'},RRCreatureBody.kindRecipe('dog')):RRCharacterModel.normalize({gender:tag==='f'?0.25:0.75});
                // Built here, never read back from a pack or the disk.
                const pictures={},failed=[],times=[];
                for(const id of ids){const item={key:kind+':'+id,kind,id,sig:b._thumbSig(kind)};
                    if(b._thumbShared(item.key,item.sig)===item.sig){failed.push(id+': not shared');continue;}
                    let url='';const t0=performance.now();for(let attempt=0;attempt<2&&!url;attempt++)try{url=await b._makeThumb(item);}catch(e){if(attempt)failed.push(id+': '+e.message);}
                    if(url&&url.startsWith('data:image/webp;base64,'))pictures[id]=url.slice(23);else if(url)failed.push(id+': not webp');times.push(Math.round(performance.now()-t0));}
                return {pictures,failed,times};`, [kind, tag, lists[kind]]);
            const text = JSON.stringify({ version, kind, tag, pictures: made.pictures }, null, 0).replace(/","/g, '",\n"') + '\n';
            fs.writeFileSync(path.join(out, `${kind}-${tag}.json`), text);
            const n = Object.keys(made.pictures).length; total += n; bytes += text.length;
            for (const f of made.failed) failed.push(`${kind}-${tag} ${f}`);
            console.log(`${kind}-${tag}: ${n} of ${lists[kind].length}, ${Math.round(text.length / 1024)} KB, ${Math.round((Date.now() - started) / 1000)} s so far; ms each: ${made.times.slice(0, 6).join(' ')} … ${made.times.slice(-6).join(' ')}`);
        }
        console.log(`${total} pictures, ${Math.round(bytes / 1024)} KB, version ${version}` + (failed.length ? `\nNot made:\n  ${failed.join('\n  ')}` : ''));
        if (failed.length) process.exitCode = 1;
    } finally { await driver.close().catch(() => {}); display?.kill(); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(e => { console.error(String(e.stack).slice(0, 1200)); process.exitCode = 1; });
