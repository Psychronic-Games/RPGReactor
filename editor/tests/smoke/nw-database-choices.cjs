#!/usr/bin/env node
'use strict';
/**
 * What a person chooses in the Traits and Effects dialogs is what the record stores and the list shows.
 *
 * The real editor on a throwaway copy of the Demo, driven by real pointer and key events: every trait row on
 * Actors, Classes and Vehicles (a sample on Weapons, Armors, Enemies and States) and every effect row on Skills
 * and Items is tried first by its greyed dropdown or number (nothing may answer), then selected by its name
 * or its radio and set, then OK. The stored record
 * and the list's wording are compared with what was picked. The copy's type lists carry a blank name in the
 * middle, so a dropdown that numbers its options by their place fails here.
 *
 *   node tests/smoke/nw-database-choices.cjs [traits|effects]
 *
 * Needs a display (editor/tests/perf/headless-display.sh). Screenshots of failures go to the system temp folder.
 */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const root = path.resolve(__dirname, '..', '..', '..');
const { WebDriverClient } = require('./webdriver-client.cjs');
const OUT = path.join(os.tmpdir(), 'rr-database-choices');
const only = process.argv[2] || '';

const FULL = ['actors', 'classes', 'vehicles'], SAMPLE = ['weapons', 'armors', 'enemies', 'states'];
const SAMPLE_CODES = new Set([11, 22, 34, 41, 52, 54, 62]);
const TRAIT_TABS = ['rates', 'param', 'attack', 'skill', 'equip', 'other'];
const EFFECT_TABS = ['recovery', 'state', 'buff', 'special'];
const NUMBER = code => (code === 33 ? '12' : code === 34 ? '3' : '37');
const plain = text => String(text).replace(/\\[iI]\[\d+\]\s*/g, '').trim();

/** The editor with the copy open; `prepare(project)` may change the copy first. */
async function open(out, prepare) {
    const source = path.join(root, 'template/Demo'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-choices-')), project = path.join(temp, 'Demo');
    fs.mkdirSync(out, { recursive: true });
    fs.mkdirSync(project);
    for (const n of ['data', 'js', 'icon']) fs.cpSync(path.join(source, n), path.join(project, n), { recursive: true });
    for (const n of ['img', '3d', 'effects', 'audio', 'fonts', 'movies', 'css']) if (fs.existsSync(path.join(source, n))) fs.symlinkSync(path.join(source, n), path.join(project, n));
    for (const n of ['index.html', 'package.json', 'project.rpgreactor']) fs.copyFileSync(path.join(source, n), path.join(project, n));
    if (prepare) prepare(project);
    const driver = new WebDriverClient(path.join(root, 'nwjs-linux/chromedriver')); await driver.start();
    await driver.createSession({ browserName: 'chrome', 'goog:chromeOptions': { args: [`nwapp=${path.join(root, 'editor')}`, `user-data-dir=${temp}/profile`, 'no-first-run'] } });
    await driver.setScriptTimeout(120000);
    await driver.waitForScript('return !!window.reactor?.projectController && getComputedStyle(document.getElementById("splash-screen")).display==="none";', [], { timeout: 90000 });
    await driver.sessionRequest('POST', '/window/rect', { width: 1366, height: 768 });
    const opened = await driver.executeAsync(`const done=arguments[arguments.length-1];(async()=>{window.__errs=[];addEventListener('error',e=>__errs.push(String(e.error?.stack||e.message)));addEventListener('unhandledrejection',e=>__errs.push(String(e.reason?.stack||e.reason)));try{const pc=reactor.projectController;pc.currentProject=await reactor.projectManager.loadProject(arguments[0]);pc.projectLoaded=true;await reactor.uiManager.showEditorUI();await pc.populateProjectUI();done(true);}catch(e){done(String(e&&e.stack||e));}})();`, [project]);
    if (opened !== true) throw new Error('open: ' + opened);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await sleep(4000);
    const h = { driver, project, temp, out, sleep,
        exec: (script, args = []) => driver.execute(script, args),
        async shot(name) { const r = await driver.sessionRequest('GET', '/screenshot'); fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(r.value || r, 'base64')); },
        async clickAt(x, y) { await driver.sessionRequest('POST', '/actions', { actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [{ type: 'pointerMove', x: Math.round(x), y: Math.round(y) }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }] }] }); await sleep(120); },
        /** A real click on the element a script finds; the element must be the one on top there. */
        async click(find, args = []) {
            const box = await driver.execute(`const el=(function(){${find}}).apply(null,arguments);if(!el)return null;el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;const top=document.elementFromPoint(x,y);return {x,y,w:r.width,h:r.height,onTop:!!top&&(top===el||el.contains(top)||top.contains(el)),top:top?top.tagName+'.'+String(top.className).slice(0,60):null};`, args);
            if (!box) throw new Error('not found: ' + find.slice(0, 120));
            if (!box.w || !box.h) throw new Error('no size: ' + find.slice(0, 120));
            if (!box.onTop) throw new Error('covered by ' + box.top + ': ' + find.slice(0, 120));
            await h.clickAt(box.x, box.y);
            return box;
        },
        async type(text) { const actions = []; for (const ch of String(text)) actions.push({ type: 'keyDown', value: ch }, { type: 'keyUp', value: ch }); await driver.sessionRequest('POST', '/actions', { actions: [{ type: 'key', id: 'keys', actions }] }); await sleep(80); },
        async close() { try { await driver.close(); } finally { fs.rmSync(temp, { recursive: true, force: true }); } } };
    return h;
}

async function sweepTraits(fails, seen) {
    let h;
    try {
    h = await open(path.join(OUT, 'traits'), project => {
        // A blank name in the middle of each type list: the ones after it must keep their own numbers.
        const file = path.join(project, 'data/System.json'), system = JSON.parse(fs.readFileSync(file, 'utf8'));
        for (const key of ['elements', 'skillTypes', 'weaponTypes', 'armorTypes']) if (system[key].length > 4) system[key][2] = '';
        fs.writeFileSync(file, JSON.stringify(system));
    });
    const modalRows = () => h.exec(`const m=document.querySelector('.trait-editor-modal');return Array.from(m.querySelectorAll('.trait-option')).map(r=>{const s=r.querySelector('select[data-code]'),n=r.querySelector('input[type=number][data-code]'),radio=r.querySelector('input[type=radio]');return {code:Number(radio.value),checked:radio.checked,label:r.querySelector('.rr-trait-label').textContent.trim(),options:s?Array.from(s.options).map(o=>o.textContent.trim()):null,chosen:s&&s.selectedOptions[0]?s.selectedOptions[0].textContent.trim():null,number:n?n.value:null};});`);
    const rowFind = code => `const row=Array.from(document.querySelectorAll('.trait-editor-modal .trait-option')).find(r=>r.querySelector('input[type=radio]').value===String(arguments[0]));`;
    const lastTrait = () => h.exec(`const add=Array.from(document.querySelectorAll('.trait-btn-add')).find(b=>b.offsetParent);const sec=add.closest('.database-section');const rows=sec.querySelectorAll('.trait-row');const last=rows[rows.length-1];return {count:rows.length,text:last?Array.from(last.querySelectorAll('td')).slice(1).map(td=>td.textContent.replace(/\\s+/g,' ').trim()):null};`);
    const system = await h.exec(`const s=reactor.databaseManager.getSystem();return {elements:s.elements,skillTypes:s.skillTypes,weaponTypes:s.weaponTypes,armorTypes:s.armorTypes,equipTypes:s.equipTypes};`);
    const LISTS = { 11: 'elements', 31: 'elements', 41: 'skillTypes', 42: 'skillTypes', 51: 'weaponTypes', 52: 'armorTypes', 53: 'equipTypes', 54: 'equipTypes' };
    const addOne = async (page, tab, code, mode) => {
        const before = await lastTrait();
        await h.click(`return Array.from(document.querySelectorAll('.trait-btn-add')).find(b=>b.offsetParent);`);
        await h.sleep(350);
        await h.click(`return document.querySelector('.trait-editor-modal .trait-tab[data-tab="'+arguments[0]+'"]');`, [tab]);
        await h.sleep(200);
        const row = (await modalRows()).find(r => r.code === code);
        const want = { code, label: row.label, option: null, number: null };
        // A row that is not selected: its dropdown and number are greyed and answer nothing.
        let locked = null;
        if (!row.checked && (row.options || row.number !== null)) {
            await h.click(rowFind(code) + `return row.querySelector('.rr-trait-control .rr-shim-wrapper')||row.querySelector('input[type=number][data-code]');`, [code]);
            await h.sleep(200);
            locked = await h.exec(rowFind(code) + `return {checked:row.querySelector('input[type=radio]').checked,popup:Array.from(document.querySelectorAll('.rr-shim-popup')).some(e=>e.getClientRects().length),focus:row.contains(document.activeElement)&&document.activeElement.tagName!=='BODY',off:row.classList.contains('is-off')};`, [code]);
        }
        // Selected by its radio, or by its name.
        await h.click(rowFind(code) + (mode === 'radio' ? `return row.querySelector('input[type=radio]');` : `return row.querySelector('.rr-trait-label');`), [code]);
        await h.sleep(150);
        if (row.options && row.options.length) {
            want.option = row.options[row.options.length - 1];
            await h.click(rowFind(code) + `return row.querySelector('.rr-trait-control .rr-shim-wrapper')||row.querySelector('select');`, [code]);
            await h.sleep(250);
            await h.click(`const all=Array.from(document.querySelectorAll('[role=option]')).filter(e=>e.offsetParent&&e.dataset.optionIndex===String(arguments[0]));return all[all.length-1];`, [row.options.length - 1]);
            await h.sleep(200);
        }
        if (row.number !== null) {
            want.number = NUMBER(code);
            await h.click(rowFind(code) + `return row.querySelector('input[type=number][data-code]');`, [code]);
            await h.driver.sessionRequest('POST', '/actions', { actions: [{ type: 'key', id: 'keys', actions: [{ type: 'keyDown', value: '' }, { type: 'keyDown', value: 'a' }, { type: 'keyUp', value: 'a' }, { type: 'keyUp', value: '' }] }] });
            await h.type(want.number);
        }
        const shown = (await modalRows()).find(r => r.code === code);
        await h.click(`return document.querySelector('.trait-editor-modal .ok-btn');`);
        await h.sleep(450);
        const stuck = await h.exec(`const m=document.querySelector('.trait-editor-modal');const d=Array.from(document.querySelectorAll('.rr-modal-overlay')).filter(o=>!o.querySelector('.trait-editor-modal')&&o.isConnected&&o.classList.contains('rr-dialog-overlay')).map(o=>o.textContent.replace(/\\s+/g,' ').trim().slice(0,120));return {modal:!!m,dialogs:d};`);
        const after = await lastTrait();
        const stored = await h.exec(`const page=arguments[0];const sel=document.querySelector('.database-list-item.selected');const d=reactor.databaseManager.data;let rec=null;if(page==='vehicles'){const add=Array.from(document.querySelectorAll('.trait-btn-add')).find(b=>b.offsetParent);rec=null;}else{const id=Number(sel&&(sel.dataset.id||sel.dataset.entryId||sel.dataset.index));rec=d[page]&&d[page][id];}const t=rec&&rec.traits&&rec.traits[rec.traits.length-1];return t?{code:t.code,dataId:t.dataId,value:t.value}:null;`, [page]);
        const name = `${page} ${tab} ${code} ${row.label} (${mode})`;
        const problems = [];
        if (stuck.modal || stuck.dialogs.length) problems.push('the dialog did not close: ' + JSON.stringify(stuck.dialogs));
        if (after.count !== before.count + 1) problems.push(`rows ${before.count} -> ${after.count}`);
        if (locked && (locked.checked || locked.popup || locked.focus || !locked.off)) problems.push('its controls answered before the row was selected: ' + JSON.stringify(locked));
        const text = after.text || [];
        if (text[0] !== row.label) problems.push(`the list says "${text[0]}"`);
        if (want.option && !(text[1] || '').includes(want.option.replace(/\\[iI]\[\d+\]\s*/g, '').trim())) problems.push(`picked "${want.option}", the list says "${text[1]}"`);
        if (want.number && !(text[1] || '').replace(/[^0-9.]/g, ' ').split(/\s+/).includes(want.number)) problems.push(`typed ${want.number}, the list says "${text[1]}"`);
        if (!shown.checked) problems.push('its row was not shown selected before OK');
        if (stored) {
            if (stored.code !== code) problems.push('stored code ' + stored.code);
            const list = LISTS[code];
            if (list && want.option) { const id = system[list].lastIndexOf(want.option); if (stored.dataId !== id) problems.push(`stored id ${stored.dataId}, "${want.option}" is ${id}`); }
            if (want.number) { const value = code === 33 || code === 34 ? Number(want.number) : Number(want.number) / 100; if (Math.abs(stored.value - value) > 1e-9) problems.push(`stored value ${stored.value}, typed ${want.number}`); }
        }
        seen.push(name + (stored ? '' : ' [list text only]'));
        if (problems.length) { fails.push(name + ': ' + problems.join('; ')); await h.shot('fail-' + page + '-' + code + '-' + mode); }
        if (stuck.modal || stuck.dialogs.length) {
            await h.exec(`document.querySelectorAll('.rr-modal-overlay').forEach(o=>{const b=o.querySelector('.rr-dialog-ok,.ok-btn,.cancel-btn');});`);
            for (let i = 0; i < 3; i++) { await h.driver.sessionRequest('POST', '/actions', { actions: [{ type: 'key', id: 'keys', actions: [{ type: 'keyDown', value: '' }, { type: 'keyUp', value: '' }] }] }); await h.sleep(200); }
        }
    };
    for (const page of [...FULL, ...SAMPLE]) {
        await h.exec(`reactor.openDatabase(arguments[0]);`, [page]);
        await h.sleep(1500);
        if (page === 'vehicles') { await h.click(`return Array.from(document.querySelectorAll('.database-list-item')).find(e=>/Motorcycle/.test(e.textContent));`); await h.sleep(900); }
        const has = await h.exec(`return !!Array.from(document.querySelectorAll('.trait-btn-add')).find(b=>b.offsetParent);`);
        if (!has) { fails.push(page + ': no Traits section found'); continue; }
        // What the dialog offers, tab by tab.
        await h.click(`return Array.from(document.querySelectorAll('.trait-btn-add')).find(b=>b.offsetParent);`); await h.sleep(350);
        const plan = [];
        for (const tab of TRAIT_TABS) { await h.click(`return document.querySelector('.trait-editor-modal .trait-tab[data-tab="'+arguments[0]+'"]');`, [tab]); await h.sleep(150); for (const r of await modalRows()) plan.push([tab, r.code]); }
        // OK on a tab with nothing selected adds nothing and says so.
        const before = await lastTrait();
        await h.click(`return document.querySelector('.trait-editor-modal .ok-btn');`); await h.sleep(450);
        const warned = await h.exec(`return Array.from(document.querySelectorAll('.rr-modal-overlay')).filter(o=>!o.querySelector('.trait-editor-modal')&&o.isConnected&&o.classList.contains('rr-dialog-overlay')).map(o=>o.textContent.replace(/\\s+/g,' ').trim().slice(0,90));`);
        for (let i = 0; i < 2; i++) { await h.driver.sessionRequest('POST', '/actions', { actions: [{ type: 'key', id: 'keys', actions: [{ type: 'keyDown', value: '' }, { type: 'keyUp', value: '' }] }] }); await h.sleep(250); }
        const still = await h.exec(`return !!document.querySelector('.trait-editor-modal');`);
        if (still) { await h.click(`return document.querySelector('.trait-editor-modal .cancel-btn');`); await h.sleep(250); }
        const afterNone = await lastTrait();
        if (afterNone.count !== before.count) fails.push(`${page}: OK with no row selected on the tab in view added "${(afterNone.text || []).join(' ')}"`);
        if (!warned.length) fails.push(`${page}: OK with no row selected said nothing`);
        seen.push(`${page}: nothing selected -> ${JSON.stringify(warned)}`);
        for (const [tab, code] of plan) {
            if (!FULL.includes(page) && !SAMPLE_CODES.has(code)) continue;
            await addOne(page, tab, code, 'name');
        }
        if (page === 'actors') for (const [tab, code] of plan) if (SAMPLE_CODES.has(code)) await addOne(page, tab, code, 'radio');
        console.log(page, 'done,', fails.length, 'failure(s) so far');
    }
    console.log('errors', JSON.stringify(await h.exec('return window.__errs;')));
    } finally { await h?.close(); }
}

async function sweepEffects(fails, seen) {
    let h;
    try {
    h = await open(path.join(OUT, 'effects'));
    const rows = () => h.exec(`const m=document.querySelector('.effect-editor-modal');return Array.from(m.querySelectorAll('.effect-option')).map(r=>{const radio=r.querySelector('input[type=radio][name=effect-type]');if(!radio)return null;const s=r.querySelector('select.effect-sel'),n=r.querySelector('input.effect-val[data-field=value1]');return {code:Number(radio.value),checked:radio.checked,label:r.querySelector('.rr-trait-label').textContent.trim(),options:s?Array.from(s.options).map(o=>o.textContent.trim()):null,selectValue:s?s.value:null,chosen:s&&s.selectedOptions[0]?s.selectedOptions[0].textContent.trim():null,number:n&&!n.disabled?n.value:null};}).filter(Boolean);`);
    const find = `const row=Array.from(document.querySelectorAll('.effect-editor-modal .effect-option')).find(r=>{const x=r.querySelector('input[type=radio][name=effect-type]');return x&&x.value===String(arguments[0]);});`;
    const list = () => h.exec(`const add=Array.from(document.querySelectorAll('.effect-btn-add')).find(b=>b.offsetParent);const sec=add.closest('.database-section');const r=sec.querySelectorAll('.effect-row');const last=r[r.length-1];return {count:r.length,text:last?last.textContent.replace(/\\s+/g,' ').trim():null};`);
    const stored = page => h.exec(`const sel=document.querySelector('.database-list-item.selected');const id=Number(sel&&(sel.dataset.id||sel.dataset.entryId||sel.dataset.index));const rec=reactor.databaseManager.data[arguments[0]]&&reactor.databaseManager.data[arguments[0]][id];const e=rec&&rec.effects&&rec.effects[rec.effects.length-1];return e?{code:e.code,dataId:e.dataId,value1:e.value1,value2:e.value2,n:rec.effects.length}:null;`, [page]);
    const esc = async () => { for (let i = 0; i < 2; i++) { await h.driver.sessionRequest('POST', '/actions', { actions: [{ type: 'key', id: 'keys', actions: [{ type: 'keyDown', value: '' }, { type: 'keyUp', value: '' }] }] }); await h.sleep(250); } };
    for (const page of ['skills', 'items']) {
        await h.exec(`reactor.openDatabase(arguments[0]);`, [page]); await h.sleep(1500);
        await h.click(`return Array.from(document.querySelectorAll('.effect-btn-add')).find(b=>b.offsetParent);`); await h.sleep(350);
        const plan = [];
        for (const tab of EFFECT_TABS) { await h.click(`return document.querySelector('.effect-editor-modal .effect-tab[data-tab="'+arguments[0]+'"]');`, [tab]); await h.sleep(150); for (const r of await rows()) plan.push([tab, r.code]); }
        const before0 = await list();
        await h.click(`return document.querySelector('.effect-editor-modal .ok-btn');`); await h.sleep(450);
        const warned = await h.exec(`return Array.from(document.querySelectorAll('.rr-dialog-overlay')).map(o=>o.textContent.replace(/\\s+/g,' ').trim().slice(0,90));`);
        await esc();
        if (await h.exec(`return !!document.querySelector('.effect-editor-modal');`)) { await h.click(`return document.querySelector('.effect-editor-modal .cancel-btn');`); await h.sleep(250); }
        const after0 = await list();
        if (after0.count !== before0.count) fails.push(`${page}: OK with no row selected on the tab in view added "${after0.text}"`);
        if (!warned.length) fails.push(`${page}: OK with no row selected said nothing`);
        for (const [tab, code] of plan) {
            const before = await list();
            await h.click(`return Array.from(document.querySelectorAll('.effect-btn-add')).find(b=>b.offsetParent);`); await h.sleep(350);
            await h.click(`return document.querySelector('.effect-editor-modal .effect-tab[data-tab="'+arguments[0]+'"]');`, [tab]); await h.sleep(200);
            const row = (await rows()).find(r => r.code === code), want = { option: null, number: null };
            let touched = false, locked = null;
            if (!row.checked && (row.options || row.number !== null)) {
                await h.click(find + `return row.querySelector('.rr-shim-wrapper')||row.querySelector('input.effect-val[data-field=value1]');`, [code]); await h.sleep(200);
                locked = await h.exec(find + `return {checked:row.querySelector('input[type=radio][name=effect-type]').checked,popup:Array.from(document.querySelectorAll('.rr-shim-popup')).some(e=>e.getClientRects().length),focus:row.contains(document.activeElement)&&document.activeElement.tagName!=='BODY',off:row.classList.contains('is-off')};`, [code]);
            }
            await h.click(find + `return row.querySelector('.rr-trait-label');`, [code]); await h.sleep(150);
            if (row.options && row.options.length > 1) {
                want.option = row.options[row.options.length - 1];
                await h.click(find + `return row.querySelector('.rr-shim-wrapper')||row.querySelector('select');`, [code]); await h.sleep(250);
                await h.click(`const all=Array.from(document.querySelectorAll('[role=option]')).filter(e=>e.offsetParent&&e.dataset.optionIndex===String(arguments[0]));return all[all.length-1];`, [row.options.length - 1]); await h.sleep(200);
                touched = true;
            }
            if (row.number !== null) {
                want.number = '37';
                await h.click(find + `return row.querySelector('input.effect-val[data-field=value1]');`, [code]);
                await h.driver.sessionRequest('POST', '/actions', { actions: [{ type: 'key', id: 'keys', actions: [{ type: 'keyDown', value: '' }, { type: 'keyDown', value: 'a' }, { type: 'keyUp', value: 'a' }, { type: 'keyUp', value: '' }] }] });
                await h.type('37'); touched = true;
            }
            const shown = (await rows()).find(r => r.code === code);
            await h.click(`return document.querySelector('.effect-editor-modal .ok-btn');`); await h.sleep(450);
            const stuck = await h.exec(`return {modal:!!document.querySelector('.effect-editor-modal'),dialogs:Array.from(document.querySelectorAll('.rr-dialog-overlay')).map(o=>o.textContent.replace(/\\s+/g,' ').trim().slice(0,100))};`);
            const after = await list(), kept = await stored(page);
            const name = `${page} ${tab} ${code} ${row.label}`, problems = [];
            if (stuck.modal || stuck.dialogs.length) problems.push('the dialog did not close: ' + JSON.stringify(stuck.dialogs));
            if (after.count !== before.count + 1) problems.push(`rows ${before.count} -> ${after.count}`);
            if (locked && (locked.checked || locked.popup || locked.focus || !locked.off)) problems.push('its controls answered before the row was selected: ' + JSON.stringify(locked));
            if (!shown.checked) problems.push('its row was not shown selected before OK');
            if (!kept) problems.push('no stored effect found');
            else {
                if (kept.code !== code) problems.push(`stored code ${kept.code}`);
                if (want.option && kept.dataId !== Number(shown.selectValue)) problems.push(`stored id ${kept.dataId}, the dropdown held ${shown.selectValue}`);
                if (want.number) { const value = [11, 12, 21, 22].includes(code) ? 0.37 : 37; if (Math.abs(kept.value1 - value) > 1e-9) problems.push(`stored value ${kept.value1}, typed 37`); }
            }
            if (want.option && !plain(after.text || '').includes(plain(want.option))) problems.push(`picked "${want.option}", the list says "${after.text}"`);
            seen.push(name);
            if (problems.length) { fails.push(name + ': ' + problems.join('; ')); await h.shot('fail-' + page + '-' + code); }
            if (stuck.modal || stuck.dialogs.length) { await esc(); if (await h.exec(`return !!document.querySelector('.effect-editor-modal');`)) { await h.click(`return document.querySelector('.effect-editor-modal .cancel-btn');`); await h.sleep(250); } }
        }
        console.log(page, 'done,', fails.length, 'failure(s) so far');
    }
    console.log('errors', JSON.stringify(await h.exec('return window.__errs;')));
    } finally { await h?.close(); }
}

(async () => {
    const fails = [], seen = [];
    try {
        if (only !== 'effects') await sweepTraits(fails, seen);
        if (only !== 'traits') await sweepEffects(fails, seen);
    } catch (error) { console.error('FAILED', error && error.stack || error); fails.push('the sweep stopped: ' + String(error && error.message || error).slice(0, 200)); }
    console.log('checked', seen.length);
    console.log(fails.length ? 'FAILURES ' + fails.length + '\n' + fails.join('\n') : 'ALL MATCH');
    process.exitCode = fails.length ? 1 : 0;
})();
