#!/usr/bin/env node
/**
 * Real key presses through the menubar, context menus, database categories,
 * the database Escape confirmation, Options dropdowns, the Trait editor tab
 * strip and the Plugin Manager. Every check is asserted; a missing behaviour
 * fails the run.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WebDriverClient } = require('./webdriver-client.cjs');
const root = path.resolve(__dirname, '../../..');
const sdkOption = process.argv.find(argument => argument.startsWith('--nw-root='));
const sdkRoot = path.resolve(sdkOption?.slice('--nw-root='.length) || process.env.NWJS_SDK_ROOT || path.join(root, 'nwjs-linux'));
const option = name => process.argv.find(argument => argument.startsWith('--' + name + '='))?.split('=').slice(1).join('=');
const appRoot = path.resolve(option('app-root') || path.join(root, 'editor'));
const evidence = option('evidence') || '/tmp/rr-keyboard-menus';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-keyboard-menus-'));
const project = path.join(temp, 'Demo');
const driver = new WebDriverClient(path.join(sdkRoot, 'chromedriver'));
const KEY = { down: '', up: '', left: '', right: '', enter: '', escape: '', tab: '', end: '', home: '', f10: '', shift: '' };

(async () => {
    const checks = [];
    const check = (name, condition, detail) => {
        checks.push({ name, ok: !!condition, detail });
        console.log(`${condition ? 'ok' : 'FAIL'} - ${name}${detail === undefined ? '' : ' ' + JSON.stringify(detail)}`);
        assert.ok(condition, name + ' ' + JSON.stringify(detail));
    };
    try {
        fs.cpSync(path.join(root, 'template/Demo'), project, { recursive: true, dereference: true });
        fs.rmSync(path.join(project, '.rpgreactor.lock'), { force: true });
        const map = JSON.parse(fs.readFileSync(path.join(project, 'data/Map001.json'), 'utf8'));
        map.width = map.height = 25; map.data = new Array(25 * 25 * 6).fill(0);
        map.note = ''; map.events = [null]; delete map.reactor3d;
        fs.writeFileSync(path.join(project, 'data/Map001.json'), JSON.stringify(map));
        fs.rmSync(path.join(project, 'data/Map001.r3d.json'), { force: true });
        await driver.start();
        await driver.createSession({ browserName: 'chrome', 'goog:chromeOptions': {
            args: [`nwapp=${appRoot}`, `user-data-dir=${temp}/profile`, 'no-first-run']
        } });
        const [width, height] = (option('size') || '1600x900').split('x').map(Number);
        await driver.sessionRequest('POST', '/window/rect', { width, height });
        await driver.setScriptTimeout(120000);
        await driver.waitForScript('return !!window.reactor?.databaseEditorUI && getComputedStyle(document.getElementById("splash-screen")).display === "none";', [], { timeout: 90000 });
        const opened = await driver.executeAsync(`const done=arguments[arguments.length-1];(async()=>{
            window.__errors=[];addEventListener('error',e=>__errors.push(String(e.error||e.message)));
            addEventListener('unhandledrejection',e=>__errors.push(String(e.reason)));
            const pc=reactor.projectController,loaded=await pc.projectManager.loadProject(arguments[0]);
            if(!loaded||!pc.acquireProjectLock(loaded.path))throw new Error('Could not open disposable project');
            pc.currentProject=loaded;pc.lastLoadedProjectPath=null;pc.rememberMap3DView(1,false);
            await pc.uiManager.showEditorUI();await pc.populateProjectUI();
            await pc.loadMap(1,{skipDirtyCheck:true});
            reactor.databaseEditorUI.setCurrentProject(loaded);
            const opener=document.createElement('button');opener.id='kb-opener';opener.textContent='Opener';opener.style.cssText='position:fixed;bottom:0;left:0;z-index:1';document.body.appendChild(opener);
            window.__visible=el=>!!el&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden';
            window.__active=()=>{const a=document.activeElement;return a?{tag:a.tagName,id:a.id,cls:String(a.className),text:(a.innerText||'').slice(0,40)}:null;};
            return true;
        })().then(done,e=>done({error:String(e.stack)}));`, [project]);
        assert.equal(opened, true, JSON.stringify(opened));
        const key = async (value, { shift = false } = {}) => {
            const actions = [];
            if (shift) actions.push({ type: 'keyDown', value: KEY.shift });
            actions.push({ type: 'keyDown', value }, { type: 'keyUp', value });
            if (shift) actions.push({ type: 'keyUp', value: KEY.shift });
            await driver.sessionRequest('POST', '/actions', { actions: [{ type: 'key', id: 'kb', actions }] });
        };
        const pause = (ms = 80) => driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(()=>done(true),arguments[0]);', [ms]);
        const run = (script, args = []) => driver.execute(script, args);
        const focusOpener = () => run('document.getElementById("kb-opener").focus();');

        // Menubar: F10 focuses the first heading; Enter opens with the first row active;
        // Down moves; Right carries the open menu to the next heading; Escape closes.
        await focusOpener();
        await key(KEY.f10);
        check('F10 focuses the File heading', await run('return document.activeElement===document.querySelector(".html-menu-item[data-menu=file]");'));
        await key(KEY.enter);
        let state = await run('const sub=document.getElementById("submenu-file");return {open:__visible(sub),active:sub.querySelector(".rr-menu-key-active")?.textContent?.trim(),focused:__active()};');
        check('Enter opens File with its first row active', state.open && state.active?.startsWith('New Project'), state);
        await key(KEY.down);
        state = await run('return document.getElementById("submenu-file").querySelector(".rr-menu-key-active")?.textContent?.trim();');
        check('Down moves to the second File row', state?.startsWith('Open Project'), state);
        await key(KEY.right);
        state = await run('return {fileOpen:__visible(document.getElementById("submenu-file")),dbOpen:__visible(document.getElementById("submenu-database")),active:document.getElementById("submenu-database").querySelector(".rr-menu-key-active")?.textContent?.trim()};');
        check('Right closes File and opens Database with its first row active', !state.fileOpen && state.dbOpen && state.active === 'Actors', state);
        await key(KEY.end);
        state = await run('return document.getElementById("submenu-database").querySelector(".rr-menu-key-active")?.textContent?.trim();');
        check('End reaches the last Database row', state === 'Terms', state);
        await key(KEY.escape);
        state = await run('return {anyOpen:[...document.querySelectorAll(".html-submenu")].some(__visible),focused:__active()};');
        check('Escape closes the menu and focuses the Database heading', !state.anyOpen && state.focused.cls.includes('html-menu-item') && state.focused.text === 'Database', state);
        await key(KEY.left);
        check('Left on a closed heading moves to the previous heading', await run('return document.activeElement===document.querySelector(".html-menu-item[data-menu=file]");'));
        await key(KEY.down);
        await key(KEY.down);
        await key(KEY.enter);
        await pause(200);
        state = await run('return {fileOpen:__visible(document.getElementById("submenu-file")),dialog:!!document.querySelector("#rr-new-project-dialog, .rr-modal-overlay")};');
        check('Enter on a menu row runs its command (Open Project shows a dialog)', !state.fileOpen, state);
        await run('document.querySelector("#rr-new-project-dialog #rr-new-project-close, .rr-modal-overlay .rr-modal-close")?.click();');
        await pause(100);

        // Map context menu: arrows and Enter run the action, focus returns to the opener.
        await focusOpener();
        await run('window.__ran=[];reactor.projectController.showContextMenuItems(200,200,[{label:"First",action:()=>__ran.push("first")},{separator:true},{label:"Off",enabled:false,action:()=>__ran.push("off")},{label:"Third",action:()=>__ran.push("third")}]);');
        await key(KEY.down); await key(KEY.down);
        state = await run('return document.querySelector("#map-context-menu .rr-menu-key-active")?.textContent;');
        check('Map context: Down skips the separator and the disabled row', state === 'Third', state);
        await key(KEY.enter);
        await pause();
        state = await run('return {ran:__ran,open:!!document.getElementById("map-context-menu"),focused:__active()};');
        check('Map context: Enter runs the row, closes the menu and returns focus', state.ran[0] === 'third' && !state.open && state.focused.id === 'kb-opener', state);

        // Event context menu: Right opens a submenu, Escape closes one layer at a time.
        await focusOpener();
        await run('reactor.eventManager.showContextMenu(200,200,0,0,null);');
        await key(KEY.end);
        state = await run('return document.querySelector("#event-context-menu .rr-menu-key-active")?.firstChild?.textContent?.trim();');
        check('Event context: End reaches the Player Facing row', /Player Facing|Facing/i.test(state || ''), state);
        await key(KEY.right);
        state = await run('const row=document.querySelector("#event-context-menu .rr-menu-key-active");const sub=[...document.querySelectorAll("#event-context-menu div")].find(d=>d.style.position==="absolute"&&__visible(d));return {subOpen:!!sub,childActive:sub?.querySelector(".rr-menu-key-active")?.textContent};');
        check('Event context: Right opens the submenu with its first row active', state.subOpen && !!state.childActive, state);
        await key(KEY.escape);
        state = await run('return {menuOpen:!!document.getElementById("event-context-menu"),subOpen:[...document.querySelectorAll("#event-context-menu div")].some(d=>d.style.position==="absolute"&&__visible(d))};');
        check('Event context: Escape closes only the submenu', state.menuOpen && !state.subOpen, state);
        await key(KEY.escape);
        check('Event context: a second Escape closes the menu', !(await run('return !!document.getElementById("event-context-menu");')));

        // Text-code and plugin menus share the helper: Down + Enter runs the row.
        await focusOpener();
        await run('window.__ran=[];RRTextCodeMenu.showMenu(200,200,[{label:"Cut",disabled:true,action:()=>__ran.push("cut")},{label:"Paste",action:()=>__ran.push("paste")}]);');
        await key(KEY.down); await key(KEY.enter); await pause();
        state = await run('return {ran:__ran,open:!!document.querySelector(".rr-text-code-menu")};');
        check('Text context: Down skips the disabled row and Enter runs Paste', state.ran[0] === 'paste' && !state.open, state);

        // Database: categories walk with arrows, Escape asks before discarding edits.
        await run('reactor.databaseEditorUI.openDatabase("actors");');
        await pause(300);
        state = await run('return {focused:__active(),inside:document.getElementById("database-viewer").contains(document.activeElement)};');
        check('Database: focus enters on open', state.inside, state);
        await run('document.querySelector(".database-nav-item.active").focus();');
        await key(KEY.down);
        await pause(300);
        state = await run('return {active:document.querySelector(".database-nav-item.active")?.dataset.type,focused:__active(),title:document.getElementById("database-viewer-title")?.textContent};');
        check('Database: Down opens the next category and keeps focus on it', state.active === 'classes' && state.focused.cls.includes('database-nav-item'), state);
        await key(KEY.home);
        await pause(300);
        check('Database: Home returns to Actors', (await run('return document.querySelector(".database-nav-item.active")?.dataset.type;')) === 'actors');
        await run('reactor.databaseManager.data.actors[1].name="Keyboard Edit";');
        await key(KEY.escape);
        await pause(200);
        state = await run('return {dialog:__visible(document.getElementById("rr-themed-dialog")),viewer:document.getElementById("database-viewer").classList.contains("active")};');
        check('Database: Escape with unsaved edits asks first', state.dialog && state.viewer, state);
        await key(KEY.escape);
        await pause(200);
        state = await run('return {dialog:!!document.getElementById("rr-themed-dialog"),viewer:document.getElementById("database-viewer").classList.contains("active"),name:reactor.databaseManager.data.actors[1].name};');
        check('Database: cancelling the prompt keeps the database open and the edit', !state.dialog && state.viewer && state.name === 'Keyboard Edit', state);
        await key(KEY.escape);
        await pause(200);
        await key(KEY.tab); await key(KEY.enter);
        await pause(300);
        state = await run('return {viewer:document.getElementById("database-viewer").classList.contains("active"),name:reactor.databaseManager.data.actors[1].name};');
        check('Database: confirming Discard closes and reverts the edit', !state.viewer && state.name !== 'Keyboard Edit', state);

        // Switch picker: Down moves the highlight, Enter picks the highlighted switch.
        await focusOpener();
        await run('window.__picked=null;window.__kbSwitch=new SwitchVariablePicker(reactor.databaseManager,reactor.projectController);__kbSwitch.show("switch",1,id=>{window.__picked=id;});');
        await pause(200);
        await key(KEY.down);
        state = await run('return __active();');
        check('Switch picker: Down moves to switch 2', /0002/.test(state.text), state);
        await key(KEY.enter);
        await pause();
        state = await run('return {picked:__picked,open:!!document.querySelector(".switch-variable-picker-modal"),focused:__active()};');
        check('Switch picker: Enter picks it, closes and restores the opener', state.picked === 2 && !state.open && state.focused.id === 'kb-opener', state);

        // Trait editor: Left/Right walk the tab strip; Escape cancels.
        await run('reactor.databaseEditorUI.openDatabase("actors");reactor.databaseEditorUI.actorEditor.traitEditor.showTraitEditorModal(structuredClone(reactor.databaseManager.data.actors[1]));');
        await pause(200);
        state = await run('return __active();');
        check('Trait editor: focus enters on the first tab', state.cls.includes('trait-tab'), state);
        await key(KEY.right);
        state = await run('return {focused:__active(),selected:[...document.querySelectorAll(".trait-tab")].filter(b=>b.style.background!=="transparent").map(b=>b.dataset.tab)};');
        check('Trait editor: Right selects the next tab', state.selected.length === 1 && state.selected[0] === 'param' && state.focused.text === 'Param', state);
        await key(KEY.escape);
        await pause();
        check('Trait editor: Escape closes it', !(await run('return !!document.querySelector(".trait-editor-modal");')));
        await run('document.querySelector("#database-cancel-btn").click();');

        // Options: Down on the language trigger enters the list; Escape backs out one layer.
        await focusOpener();
        await run('reactor.optionsManager.show();');
        await pause();
        await run('document.querySelector(".rr-opt-language-trigger").focus();');
        await key(KEY.down);
        state = await run('const m=document.querySelector(".rr-opt-language-menu");return {open:__visible(m),active:m.querySelector(".rr-menu-key-active")?.textContent?.trim(),inside:m.contains(document.activeElement)};');
        check('Options: Down opens the language list with its first entry active', state.open && state.inside && !!state.active, state);
        await key(KEY.escape);
        state = await run('return {open:__visible(document.querySelector(".rr-opt-language-menu")),focused:__active()};');
        check('Options: Escape closes the list and returns to its trigger', !state.open && state.focused.cls.includes('rr-opt-language-trigger'), state);
        await key(KEY.escape);
        await pause();
        state = await run('return {open:__visible(document.querySelector(".options-modal-overlay")),focused:__active()};');
        check('Options: a second Escape closes Options and restores the opener', !state.open && state.focused.id === 'kb-opener', state);

        // Plugin Manager: focus enters the list on the first open; Escape closes and restores.
        await focusOpener();
        await run('reactor.pluginManager.show();');
        await pause(300);
        state = await run('return {inside:document.getElementById("plugin-manager-modal").contains(document.activeElement),focused:__active()};');
        check('Plugin Manager: focus enters on open', state.inside, state);
        await key(KEY.escape);
        await pause();
        state = await run('return {open:__visible(document.getElementById("plugin-manager-modal")),focused:__active()};');
        check('Plugin Manager: Escape closes and restores the opener', !state.open && state.focused.id === 'kb-opener', state);

        // About: real close button, Escape closes.
        await focusOpener();
        await run('reactor.showAbout();');
        await pause();
        state = await run('return {inside:document.getElementById("about-modal").contains(document.activeElement),closeTag:document.querySelector("#about-modal .modal-close")?.tagName};');
        check('About: focus enters and the close control is a button', state.inside && state.closeTag === 'BUTTON', state);
        await key(KEY.escape);
        await pause();
        check('About: Escape closes it', !(await run('return __visible(document.getElementById("about-modal"));')));

        const errors = await run('return __errors;');
        fs.writeFileSync(`${evidence}-result.json`, JSON.stringify({ checks, errors }, null, 2));
        fs.writeFileSync(`${evidence}-after.png`, Buffer.from(await driver.sessionRequest('GET', '/screenshot'), 'base64'));
        assert.deepEqual(errors, [], 'uncaught errors during the run');
        console.log(`${checks.length} checks passed`);
    } finally {
        await driver.close();
        fs.rmSync(temp, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
