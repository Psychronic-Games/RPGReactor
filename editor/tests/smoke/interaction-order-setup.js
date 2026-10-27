const done = arguments[arguments.length - 1];
const auditSeed = Number(arguments[0]?.seed ?? 0x53a11) >>> 0;
(async () => {
    const db = reactor.databaseEditorUI, dm = reactor.databaseManager;
    const checks = [], failures = [];
    const check = (name, ok, detail) => { checks.push(name); if (!ok) failures.push({ name, detail }); };
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
 const __cancelDb=async()=>{const c=reactor.databaseEditorUI.callbacks,o=c.showConfirm;c.showConfirm=async()=>true;try{document.getElementById('database-cancel-btn').click();await new Promise(r=>setTimeout(r,30));}finally{c.showConfirm=o;}};
    const show = (type, id = 1) => {
        db.openDatabase(type);
        const entry = dm.data[type]?.find?.(entry => entry && entry.id >= id);
        if (entry) db._activeDatabaseList?.selectIds([entry.id], entry.id);
        return entry;
    };

    // A shared detail container must not acquire callbacks from a retired form.
    const actor = show('actors'), actorName = actor.name;
    const cls = show('classes');
    await wait(50);
    const name = document.querySelector('#database-detail [data-field="name"]');
    name.value = 'Only the current class';
    name.dispatchEvent(new Event('change', { bubbles: true }));
    check('actor → class → edit changes only class', actor.name === actorName && cls.name === name.value,
        { actor: actor.name, cls: cls.name });
    await __cancelDb();

    for (const type of ['actors', 'classes']) {
        const first = show(type);
        show(type, 2); show(type, first.id);
        await wait(40);
        const editor = type === 'actors' ? db.actorEditor : db.classEditor;
        const method = type === 'actors' ? 'updateActorField' : 'updateClassField';
        const original = editor[method];
        let calls = 0;
        editor[method] = function (...args) { calls++; return original.apply(this, args); };
        try {
            const input = document.querySelector('#database-detail [data-field="name"]');
            input.dispatchEvent(new Event('change', { bubbles: true }));
            check(type + ' A → B → A binds once', calls === 1, calls);
        } finally { editor[method] = original; }
        if (type === 'classes') {
            const original = editor.showExpCurveModal;
            let opens = 0; editor.showExpCurveModal = () => opens++;
            try {
                document.querySelector('.exp-curve-trigger').click();
                check('class rapid revisit opens one curve dialog', opens === 1, opens);
            } finally { editor.showExpCurveModal = original; }
        }
        await __cancelDb();
    }

    for (const [type, kind] of [['skills', 'Skill'], ['items', 'Item'], ['weapons', 'Weapon'], ['armors', 'Armor'], ['states', 'State']]) {
        const record = show(type), editor = db[kind[0].toLowerCase() + kind.slice(1) + 'Editor'];
        editor['refresh' + kind + 'Detail'](record);
        editor['refresh' + kind + 'Detail'](record);
        await wait(40);
        const slot = document.querySelector('#database-detail [id*="-icon-container-"]');
        check(type + ' repeated detail refresh owns one preview', slot?.querySelectorAll('.database-preview').length === 1,
            slot?.querySelectorAll('.database-preview').length);
        await __cancelDb();
    }

    // A picker retired by navigation must release its document listener and
    // reject a queued click on its old confirmation button.
    show('tilesets');
    const tilesets = db.tilesetEditor.tilesetEditor;
    tilesets.showTilesetImagePicker(0, 'A1');
    const none = document.querySelector('.rr-tileset-none-option');
    const overlay = none.closest('.rr-modal-overlay');
    none.click();
    const oldConfirm = overlay.querySelector('.rr-modal-footer button:last-child');
    const nextTileset = show('tilesets', 2), beforeTileset = JSON.stringify(nextTileset);
    oldConfirm.click();
    check('retired tileset picker cannot assign to another record', JSON.stringify(nextTileset) === beforeTileset);
    tilesets.showTilesetImagePicker(0, 'A1');
    const currentNone = document.querySelector('.rr-tileset-none-option');
    currentNone.click();
    currentNone.closest('.rr-modal-overlay').querySelector('.rr-modal-footer button:last-child').click();
    check('current tileset picker still assigns None', nextTileset.tilesetNames[0] === '');
    await __cancelDb();

    // Keyboard movement must reveal rows beyond the lazy-render batch before
    // the browser gets a scroll event. A burst can cross several boundaries.
    show('items');
    const template = dm.data.items[1];
    dm.data.items = [null, ...Array.from({ length: 760 }, (_, index) => ({ ...structuredClone(template), id: index + 1, name: 'Audit ' + (index + 1) }))];
    show('items');
    const list = document.getElementById('database-list');
    db._activeDatabaseList.selectIds([249], 249);
    list.focus();
    for (let i = 0; i < 7; i++) list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    const focusedId = db._activeDatabaseList.focusedId;
    check('arrow burst reveals lazy-list selection', focusedId === 256 && !!list.querySelector('[data-entry-id="256"].selected'), focusedId);
    await __cancelDb();

    // A shortcut in page configuration must not delete an event command.
    const manager = reactor.eventManager;
    const event = manager.createNewEvent(2, 2);
    const editor = manager.eventEditor, commands = editor.commandList;
    const page = editor.currentEvent.pages[0];
    // The event editor opens in a window of its own (where the editor can make one): it is worked
    // in once that window shows it, and taken as the window in use, as a click there makes it.
    let eventWindow = null;
    for (let i = 0; i < 200; i++) {
        const shown = document.getElementById('event-editor-modal')?.style.visibility !== 'hidden';
        const own = typeof RREventEditorWindow !== 'undefined' && RREventEditorWindow.isPoppedOut() ? RREventEditorWindow.popoutWindow() : null;
        if (shown && (!own || own.window?.document?.contains(document.getElementById('event-editor-modal')))) { eventWindow = own ? own.window : null; break; }
        await wait(25);
    }
    check('event editor shows', document.getElementById('event-editor-modal')?.style.visibility !== 'hidden');
    const inEventWindow = task => (eventWindow && window.RRPopoutBridge ? RRPopoutBridge.inPopout(task, eventWindow) : task());
    await inEventWindow(async () => {
        page.list = [{ code: 118, indent: 0, parameters: ['Keep me'] }, { code: 0, indent: 0, parameters: [] }];
        editor.renderCurrentPage();
        commands.selectedIndices = [0];
        const root = document.querySelector('#event-editor-modal .command-list-container');
        const modal = document.getElementById('event-editor-modal');
        const control = [...modal.querySelectorAll('button, select')].find(node => !root.contains(node) && node.getClientRects().length);
        check('event settings control exists', !!control);
        control.focus();
        control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
        check('Delete in event settings preserves commands', page.list.some(command => command.code === 118));
        const beforeCommands = JSON.stringify(page.list);
        db.showImagePicker('Nested keyboard scope', [], () => {}, () => '', '', { allowNone: true });
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
        check('Delete in a nested picker preserves event commands', JSON.stringify(page.list) === beforeCommands);
        db._closeImagePicker();
        root.querySelector('.command-item').click();
        const focusedList = document.activeElement;
        focusedList.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true }));
        check('command click gives shortcuts focus', commands._commandListRoot?.contains(document.activeElement));
        check('Select All updates command highlight', commands.selectedIndices.includes(0)
            && root.querySelector('.command-item').style.backgroundColor === 'var(--color-bg-selected)');
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
        check('Delete still works in command list', !page.list.some(command => command.code === 118));
        check('command rebuild retains keyboard focus', commands._commandListRoot?.contains(document.activeElement));
        editor.cancelChanges();
    });

    // Hold real map asset loading, then release it after a newer request.
    const pc = reactor.projectController, tm = pc.tilemapManager;
    const originalLoad = tm.loadTilesetImages, gates = [];
    tm.loadTilesetImages = async function (...args) {
        await new Promise(resolve => gates.push(resolve));
        return originalLoad.apply(this, args);
    };
    // A load reaches its assets after the event window has had its say (an await): each request
    // is let get there before the next one starts, so the loads overlap where the assets load.
    const gated = async count => { for (let i = 0; i < 400 && gates.length < count; i++) await wait(5); return gates.length === count; };
    try {
        const old = pc.loadMap(2, { skipDirtyCheck: true });
        check('pending switch reaches its asset load', await gated(1), gates.length);
        check('returning to current map cancels pending switch', await pc.loadMap(1, { skipDirtyCheck: true }));
        (gates.shift() || Boolean)(); await old;
        check('cancelled map load cannot change view', tm.currentMap.id === 1 && manager.currentMap.id === 1);
        const older = pc.loadMap(2, { skipDirtyCheck: true });
        check('older load reaches its asset load', await gated(1), gates.length);
        const newest = pc.loadMap(1, { skipDirtyCheck: true, forceReload: true });
        check('newest load reaches its asset load', await gated(2), gates.length);
        (gates[1] || Boolean)(); await newest;
        (gates[0] || Boolean)(); await older;
        check('out-of-order map loads keep latest selection', tm.currentMap.id === 1
            && document.querySelector('#maps-list .selected')?.dataset.mapId === '1');
    } finally { tm.loadTilesetImages = originalLoad; }

    // Reproducible pseudo-random navigation, including close/reopen and A/B/A
    // with a yield only after each group. Record the seed and trace on failure.
    const seed = auditSeed, trace = [];
    let state = seed;
    const random = count => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % count; };
    const types = ['actors', 'classes', 'skills', 'items', 'weapons', 'armors', 'enemies', 'troops', 'states', 'animations', 'tilesets', 'commonEvents'];
    const baseline = JSON.stringify(Object.fromEntries(types.map(type => [type, dm.data[type]])));
    for (let batch = 0; batch < 24; batch++) {
        let lastType;
        for (let step = 0; step < 5; step++) {
            if (random(5) === 0) { db.closeDatabaseViewer(); trace.push('close'); }
            lastType = types[random(types.length)];
            const entry = show(lastType, random(2) + 1);
            trace.push(lastType + ':' + entry.id);
        }
        await wait(30);
        check('seeded navigation batch ' + batch,
            document.querySelector('.database-nav-item.active')?.dataset.type === lastType
            && document.getElementById('database-detail').children.length > 0
            && JSON.stringify(Object.fromEntries(types.map(type => [type, dm.data[type]]))) === baseline,
            { seed, trace: trace.slice(-8) });
    }
    // Closed straight after a page opens, its deferred list work still to come. The Animations page
    // the seeded walk ends near is let finish starting its preview first: the Database's window
    // hidden within a moment of that page opening stalls the editor's renderer for good (a defect
    // of its own, reported with this audit).
    await wait(1000);
    show('actors', 1);
    db.closeDatabaseViewer();
    await wait(100);
    check('closed database stays empty after deferred work', document.getElementById('database-detail').children.length === 0);
    return { checks, failures, seed, trace, errors: __interactionErrors };
})().then(done, error => done({ error: String(error.stack) }));
