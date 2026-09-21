const done = arguments[arguments.length - 1];
(async () => {
    const db = reactor.databaseEditorUI, dm = reactor.databaseManager, pc = reactor.projectController;
    const checks = [], failures = [];
    const check = (name, ok, detail) => { checks.push(name); if (!ok) failures.push({ name, detail }); };
    const wait = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms));
    const key = (target, name) => {
        const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
        target.dispatchEvent(event); return event.defaultPrevented;
    };
    const show = (type, id = 1) => { db.openDatabase(type); db._activeDatabaseList?.selectIds([id], id); };
    const cancel = () => document.getElementById('database-cancel-btn').click();
    const section = async (name, fn) => { try { await fn(); } catch (error) { failures.push({ name, error: String(error.stack) }); } };
    I18n.setLanguage(arguments[0]?.language || 'en', { persist: false });
    reactor.optionsManager.applyTheme(arguments[0]?.theme || 'dark');

    await section('map tree', async () => {
        await pc.loadMap(1, { skipDirtyCheck: true });
        if (!reactor.eventManager.eventMode) reactor.toggleEventMode();
        const list = document.getElementById('maps-list'); list.focus();
        // The next map is whatever the tree shows under map 1: the Demo's tree is ordered by hand, not by id.
        const rows = [...list.querySelectorAll('[data-map-id]')];
        const next = Number(rows[rows.findIndex(row => row.dataset.mapId === '1') + 1]?.dataset.mapId);
        check('map tree consumes ArrowDown', key(list, 'ArrowDown'));
        for (let i = 0; i < 100 && pc.tilemapManager.currentMap.id !== next; i++) await wait();
        check('map tree arrows load and highlight the next map', pc.tilemapManager.currentMap.id === next && !!list.querySelector('[data-map-id="' + next + '"].selected'),
            { currentMap: pc.tilemapManager.currentMap?.id, selected: list.querySelector('.selected')?.dataset.mapId ?? null, focused: document.activeElement?.id || document.activeElement?.className });
        check('map loading retains list focus', document.activeElement === list);
        key(list, 'Home');
        for (let i = 0; i < 100 && pc.tilemapManager.currentMap.id !== 1; i++) await wait();
        check('map tree Home selects first map', pc.tilemapManager.currentMap.id === 1);
        if (reactor.eventManager.eventMode) reactor.toggleEventMode();
    });

    await section('database focus', async () => {
        for (const type of ['actors', 'classes', 'skills', 'items', 'weapons', 'armors', 'enemies', 'states', 'tilesets', 'troops', 'commonEvents', 'animations']) {
            const entries = dm.data[type].filter(Boolean);
            if (entries.length < 2) continue;
            show(type, entries[0].id);
            const list = document.getElementById('database-list'); list.focus();
            check(type + ': arrows select without scrolling alone', key(list, 'ArrowDown'));
            await wait(100);
            check(type + ': focus remains in entries after deferred rendering', document.activeElement === list, document.activeElement?.outerHTML?.slice(0, 160));
            check(type + ': second entry selected', db._activeDatabaseList.focusedId === entries[1].id);
            const input = document.querySelector('#database-detail input:not([disabled]):not([type="checkbox"]):not([type="radio"])');
            if (input) { input.focus(); const id = db._activeDatabaseList.focusedId; key(input, 'ArrowDown'); check(type + ': detail input keeps its own arrows', db._activeDatabaseList.focusedId === id); }
            cancel();
        }
    });

    await section('fixed trait and effect dialogs', async () => {
        for (const [type, editor, record, method, selector] of [
            ['actors', db.actorEditor.traitEditor, dm.data.actors[1], 'showTraitEditorModal', '.trait-editor-modal'],
            ['items', db.itemEditor.effectEditor, dm.data.items[1], 'showEffectEditorModal', '.effect-editor-modal']
        ]) {
            show(type); await wait(); editor[method](record);
            await wait(); const modal = document.querySelector(selector);
            const sizes = [];
            for (const tab of modal.querySelectorAll('[data-tab]')) {
                tab.click(); await wait(); const rect = modal.getBoundingClientRect();
                sizes.push([rect.width, rect.height]);
                check(type + ': dialog stays in viewport on ' + tab.dataset.tab, rect.top >= 0 && rect.bottom <= innerHeight);
                check(type + ': arrows do not close dialog on ' + tab.dataset.tab, (key(tab, 'ArrowDown'), modal.isConnected));
            }
            check(type + ': all tabs retain the same dimensions', sizes.length > 1 && sizes.every(size => Math.abs(size[0] - sizes[0][0]) < 1 && Math.abs(size[1] - sizes[0][1]) < 1), sizes);
            modal.querySelector('.cancel-btn').click(); cancel();
        }
    });

    await section('tileset readability', async () => {
        show('tilesets'); await wait();
        const names = [...document.querySelectorAll('.compact-layer-filename')];
        check('assigned tileset names use readable 13px text', names.length >= 9 && names.every(node => parseFloat(getComputedStyle(node).fontSize) >= 13));
        check('long tileset names retain their full tooltip', names.every(node => node.parentElement.title));
        cancel();
    });

    await section('inactive event conditions', async () => {
        reactor.eventManager.createNewEvent(2, 2);
        const editor = reactor.eventManager.eventEditor;
        const conditions = editor.currentEvent.pages[0].conditions;
        Object.assign(conditions, { switch1Id: 2, switch2Id: 3, variableId: 4, variableValue: 17, selfSwitchCh: 'C' });
        editor.renderCurrentPage(); await wait();
        const original = JSON.stringify(conditions);
        const host = document.getElementById('event-editor-modal');
        for (const prefix of ['switch1', 'switch2', 'variable', 'selfSwitch', 'item', 'actor']) {
            const checkbox = host.querySelector('.condition-checkbox[data-field="' + prefix + 'Valid"]');
            const controls = () => [...host.querySelectorAll('[data-field^="' + prefix + '"]')].filter(node => !node.classList.contains('condition-checkbox'));
            const value = node => node.tagName === 'BUTTON' ? node.textContent.trim() : node.value;
            check(prefix + ': disabled fields are blank', controls().every(node => node.disabled && value(node) === ''));
            checkbox.click();
            check(prefix + ': checking restores stored values', controls().every(node => !node.disabled && value(node) !== ''));
            checkbox.click();
            check(prefix + ': unchecking blanks fields again', controls().every(node => node.disabled && value(node) === ''));
        }
        check('condition toggles preserve all stored IDs, letter and threshold', JSON.stringify(conditions) === original);
        editor.cancelChanges();
    });

    await section('Audio Player', async () => {
        const audio = reactor.audioPlayer; audio.showAudioPlayer(); audio.switchAudioType('se'); await wait();
        const list = document.getElementById('audio-track-list'); list.focus();
        const rows = [...list.querySelectorAll('.audio-track-item')];
        check('audio fixture has multiple tracks', rows.length > 1);
        key(list, 'Home'); key(list, 'ArrowDown');
        check('audio arrows select the next track', audio.getCurrentChannel().currentTrack?.name === rows[1]?.dataset.track);
        check('audio selection retains list focus', document.activeElement === list);
        key(list, 'End'); check('audio End selects last track', audio.getCurrentChannel().currentTrack?.name === rows.at(-1)?.dataset.track);
        audio.stopAudio(); document.getElementById('audio-player-modal').style.display = 'none';
    });

    await section('Plugins', async () => {
        const plugins = reactor.pluginManager; plugins.show(); await wait();
        const before = JSON.stringify(plugins.plugins), list = plugins.pluginListContainer; list.focus();
        key(list, 'Home'); key(list, 'ArrowDown'); await wait();
        check('plugin arrows select the second plugin', plugins.selectedPluginIndex === 1);
        check('plugin detail rebuild retains list focus', document.activeElement === list);
        check('plugin selection does not change plugin data or order', JSON.stringify(plugins.plugins) === before);
        plugins.hide();
    });

    await section('Resource Manager', async () => {
        const resources = reactor.resourceManager; resources.show(); resources.selectFolder('se'); await wait();
        resources.browser.focusSelected();
        key(document.activeElement, 'Home'); key(document.activeElement, 'ArrowDown'); await wait();
        const rows = [...resources.browser.list.querySelectorAll('.rr-resource-file')];
        check('resource arrows select next file', resources.selected?.displayName === rows[1]?.dataset.fileName,
            { selected: resources.selected?.displayName, expected: rows[1]?.dataset.fileName, count: rows.length, focus: document.activeElement?.outerHTML?.slice(0, 160) });
        check('resource preview leaves focus in file browser', resources.browser.element.contains(document.activeElement));
        const folder = resources.folder.id; resources.folderNav.focus(); key(resources.folderNav, 'ArrowDown');
        check('resource folder arrows select a folder', resources.folder.id !== folder);
        resources.close();
    });

    await section('shared dropdowns', async () => {
        const host = document.createElement('div'); host.style.cssText = 'position:fixed;top:30px;left:30px;z-index:99999;width:280px;';
        host.innerHTML = '<select id="issue54-select"><option>A</option><option disabled>B</option><option>C</option><option>D</option></select>';
        document.body.appendChild(host); await wait();
        host.querySelector('.rr-shim-trigger').click(); await wait();
        const popup = document.querySelector('.rr-shim-popup');
        check('short dropdown owns keyboard focus', popup.contains(document.activeElement));
        check('dropdown arrow is consumed', key(document.activeElement, 'ArrowDown'));
        check('dropdown remains open while arrows navigate', popup.isConnected);
        check('dropdown skips disabled options', popup.querySelector('[aria-selected="true"]')?.dataset.optionIndex === '2');
        key(document.activeElement, 'Enter');
        check('Enter commits dropdown choice', host.querySelector('select').value === 'C' && !popup.isConnected);
        host.querySelector('select').focus(); key(document.activeElement, 'ArrowDown'); await wait();
        check('keyboard can reopen themed dropdown', !!document.querySelector('.rr-shim-popup'));
        key(document.activeElement, 'Escape'); check('Escape restores select focus', document.activeElement === host.querySelector('select'));
        const search = RRSearchSelect.create({ groups: [{ label: 'Choices', items: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }] }], value: 'a', onChange: id => host.dataset.picked = id });
        host.appendChild(search.element); search.element.querySelector('button').click(); await wait();
        key(document.activeElement, 'ArrowDown'); key(document.activeElement, 'ArrowDown'); key(document.activeElement, 'Enter');
        check('searchable dropdown arrows choose highlighted match', host.dataset.picked === 'b');
        host.remove();
    });
    return { checks, failures, errors: window.__interactionErrors || [] };
})().then(done, error => done({ error: String(error.stack) }));
