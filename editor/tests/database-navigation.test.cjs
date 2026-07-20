const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');

function loadBrowserClass(filePath, className, globals = {}) {
    const source = fs.readFileSync(filePath, 'utf8');
    return vm.runInNewContext(`${source}\n${className};`, {
        console: { log: () => {}, warn: () => {}, error: () => {} },
        alert: () => {},
        ...globals
    });
}

test('Database top menu routes to System 1 and System 2 sections', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'src', 'UIManager.js'), 'utf8');

    assert.match(source, /openDatabase\('system1'\)/);
    assert.match(source, /openDatabase\('system2'\)/);
    assert.doesNotMatch(source, /openDatabase\('system'\)/);
});

test('legacy system database type opens System 1 instead of unknown type', () => {
    const DatabaseEditorUI = loadBrowserClass(path.join(repoRoot, 'src', 'DatabaseEditorUI.js'), 'DatabaseEditorUI');
    const ui = Object.create(DatabaseEditorUI.prototype);
    let preparedType = null;
    let showedSystem1 = false;

    ui.currentProject = {};
    ui.animationEditor = null;
    ui.cleanupDatabaseListChrome = () => {};
    ui._dbTitle = (_type, fallback) => fallback;
    ui.prepareDatabaseSection = (type) => {
        preparedType = type;
        return { detailEl: {} };
    };
    ui.system1Editor = {
        showSystem1Detail: () => {
            showedSystem1 = true;
        }
    };

    ui.openDatabase('system');

    assert.equal(preparedType, 'system1');
    assert.equal(showedSystem1, true);
});

test('type maximum resizing preserves IDs and the reserved zero slot', () => {
    const DatabaseEditorUI = loadBrowserClass(path.join(repoRoot, 'src', 'DatabaseEditorUI.js'), 'DatabaseEditorUI');
    const ui = Object.create(DatabaseEditorUI.prototype);
    const system = { elements: ['', 'Fire', 'Ice'] };

    assert.equal(ui.resizeTypeArray(system, 'elements', 5), true);
    assert.deepEqual(Array.from(system.elements), ['', 'Fire', 'Ice', '', '', '']);

    assert.equal(ui.resizeTypeArray(system, 'elements', 1), true);
    assert.deepEqual(Array.from(system.elements), ['', 'Fire']);
    assert.equal(ui.resizeTypeArray(system, 'elements', 0), false);
    assert.equal(ui.resizeTypeArray(system, 'missing', 3), false);
    assert.equal(ui.resizeTypeArray(system, 'elements', 512), true);
    assert.equal(system.elements.length, 513);
    assert.equal(ui.resizeTypeArray(system, 'elements', 513), false);
    assert.equal(system.elements.length, 513);
});

test('forced database snapshots refresh the Cancel baseline after a save', () => {
    const DatabaseEditorUI = loadBrowserClass(path.join(repoRoot, 'src', 'DatabaseEditorUI.js'), 'DatabaseEditorUI');
    const ui = Object.create(DatabaseEditorUI.prototype);
    ui.databaseManager = { data: { system: { elements: ['', 'Fire'] } } };

    ui.takeDatabaseSnapshot();
    ui.databaseManager.data.system.elements[1] = 'Heat';
    ui.takeDatabaseSnapshot();
    assert.equal(JSON.parse(ui._dataSnapshot).system.elements[1], 'Fire');
    ui.takeDatabaseSnapshot(true);
    assert.equal(JSON.parse(ui._dataSnapshot).system.elements[1], 'Heat');
    ui.databaseManager.data.system.elements[1] = 'Cold';
    ui.revertDatabaseSnapshot();
    assert.equal(ui.databaseManager.data.system.elements[1], 'Heat');

    const controller = fs.readFileSync(path.join(repoRoot, 'src', 'ProjectController.js'), 'utf8');
    assert.match(controller, /databaseEditor\.takeDatabaseSnapshot\(true\)/);
    assert.match(controller, /if \(!loadedProject\)[\s\S]*?return;[\s\S]*?if \(!this\.acquireProjectLock\(loadedProject\.path\)\)/,
        'a project lock rejection cannot fall through to the invalid-project alert');
});

test('types editor exposes dense panels, clipboard actions, and destructive shrink confirmation', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'src', 'DatabaseEditorUI.js'), 'utf8');

    assert.match(source, /class="rr-types-grid"/);
    assert.match(source, /class="rr-btn-chip rr-types-cut"/);
    assert.match(source, /class="rr-btn-chip rr-types-copy"/);
    assert.match(source, /class="rr-btn-chip rr-types-paste"/);
    assert.match(source, /class="rr-btn-chip-danger rr-types-clear"/);
    assert.match(source, /aria-multiselectable="true"/);
    assert.match(source, /event\.key\.toLowerCase\(\) === 'x'/);
    assert.match(source, /showDatabaseActionMenu\(event\.clientX, event\.clientY/);
    assert.match(source, /requestGeneration !== pasteGeneration \|\| mutationGeneration !== expectedMutation/);
    assert.match(source, /viewer\?\.classList\.contains\('active'\)[\s\S]*detail\?\.contains\(workspace\)/);
    assert.match(source, /newMax < currentMax && !confirm/);
    assert.match(source, /resizeTypeArray\(system, category, newMax\)/);
});

test('type list clipboard operations preserve IDs and grow only when needed', () => {
    const DatabaseEditorUI = loadBrowserClass(path.join(repoRoot, 'src', 'DatabaseEditorUI.js'), 'DatabaseEditorUI');
    const ui = Object.create(DatabaseEditorUI.prototype);
    const system = { elements: ['', 'Fire', 'Ice', 'Wind'] };

    assert.deepEqual(Array.from(ui.normalizeTypeClipboardText('Heat\r\nCold\r\n')), ['Heat', 'Cold']);
    assert.deepEqual(Array.from(ui.normalizeTypeClipboardText('')), []);
    assert.equal(ui.pasteTypeNames(system, 'elements', 2, ['Heat', 'Cold', 'Void']), true);
    assert.deepEqual(Array.from(system.elements), ['', 'Fire', 'Heat', 'Cold', 'Void']);
    assert.equal(ui.clearTypeNames(system, 'elements', [2, 4]), true);
    assert.deepEqual(Array.from(system.elements), ['', 'Fire', '', 'Cold', '']);
    assert.equal(ui.pasteTypeNames(system, 'elements', 0, ['Invalid']), false);
    assert.equal(ui.pasteTypeNames(system, 'elements', 512, ['Last', 'Overflow']), false);
    assert.equal(system.elements.length, 5);
});

test('database maximum UI displays caps and lazy-loads continuous large lists', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'src', 'DatabaseEditorUI.js'), 'utf8');
    const tilesetPath = path.join(repoRoot, 'src', 'database', 'DatabaseTilesetEditor.js');
    const tilesets = fs.readFileSync(tilesetPath, 'utf8');
    const animations = fs.readFileSync(path.join(repoRoot, 'src', 'database', 'DatabaseAnimationEditor.js'), 'utf8');

    assert.match(source, /const batchSize = 250;/);
    assert.match(source, /input\.max = String\(maximum\)/);
    assert.match(source, /tt\('Max:'\).*maximum/);
    assert.match(source, /filteredData\.slice\(renderedCount, end\)/);
    assert.match(source, /listEl\.onscroll[\s\S]*populateList\(searchInput\.value, true\)/);
    assert.match(source, /aria-multiselectable/);
    assert.match(source, /event\.shiftKey && selectionAnchorId !== null/);
    assert.match(source, /previousRenderedCount/);
    assert.match(source, /options\.preserveScroll[\s\S]*listEl\.scrollTop = previousScrollTop/);
    assert.match(source, /copyListEntries\(entries, type\)/);
    assert.match(source, /pastedEntries\.map\(entry => entry\.id\)/);
    assert.match(source, /case 'tilesets':[\s\S]*data = this\.databaseManager\.getTilesets\(\)/);
    assert.match(tilesets, /filteredTilesets\.slice\(renderedCount, end\)/);
    assert.match(tilesets, /populateTilesetList\(searchInput\.value, true\)/);
    assert.doesNotMatch(tilesets, /(?:img|imgEl)\.src = 'file:\/\/' \+/);
    assert.match(tilesets, /new DatabaseTilesetEditor\(\s*this\.databaseManager,\s*this\.projectManager/);
    assert.match(animations, /animation\.speed = clampInput\(speedInput, 100, 1, 1000\)/);
    assert.match(animations, /newScale = clamp\(intOr\('cell-scale', 100\), 1, 1000\)/);

    const DatabaseTilesetEditor = loadBrowserClass(tilesetPath, 'DatabaseTilesetEditor', { window: {}, require });
    const unicodeProjectPath = path.join('/tmp', '吞食天地 #2');
    const editor = new DatabaseTilesetEditor(null, unicodeProjectPath, {});
    const imagePath = path.join(unicodeProjectPath, 'img', 'tilesets', '世界地图（异）.png');
    assert.equal(editor.getProjectPath(), unicodeProjectPath);
    assert.equal(editor.assetUrl(imagePath), pathToFileURL(imagePath).href);
});

test('loop-driving database values clamp to their documented ranges', () => {
    const actorPath = path.join(repoRoot, 'src', 'database', 'DatabaseActorEditor.js');
    const skillPath = path.join(repoRoot, 'src', 'database', 'DatabaseSkillEditor.js');
    const itemPath = path.join(repoRoot, 'src', 'database', 'DatabaseItemEditor.js');
    const window = { I18n: null };

    const actor = { id: 1, initialLevel: 1, maxLevel: 99 };
    const ActorEditor = loadBrowserClass(actorPath, 'DatabaseActorEditor', { window });
    const actorEditor = Object.create(ActorEditor.prototype);
    actorEditor.databaseManager = {
        getActor: () => actor,
        updateActor: () => {}
    };
    actorEditor.commonUI = { updateStatus: () => {} };
    assert.equal(actorEditor.updateActorField(1, 'maxLevel', '99999'), 999);
    assert.equal(actorEditor.updateActorField(1, 'initialLevel', '-10'), 1);
    assert.equal(actorEditor.updateActorField(1, 'initialLevel', '99999'), 999);
    assert.equal(actorEditor.updateActorField(1, 'maxLevel', '50'), 50);
    assert.equal(actor.initialLevel, 50);

    const skill = { id: 1, repeats: 1, speed: 0, damage: { variance: 20 } };
    const SkillEditor = loadBrowserClass(skillPath, 'DatabaseSkillEditor', { window });
    const skillEditor = Object.create(SkillEditor.prototype);
    skillEditor.databaseManager = {
        getSkill: () => skill,
        updateSkill: () => {}
    };
    assert.equal(skillEditor.updateSkillField(1, 'repeats', '99999'), 100);
    assert.equal(skillEditor.updateSkillField(1, 'speed', '-99999'), -99999);
    assert.equal(skillEditor.updateSkillField(1, 'damage.variance', '9999'), 9999);

    const item = { id: 1, repeats: 1, price: 0, damage: { variance: 20 } };
    const ItemEditor = loadBrowserClass(itemPath, 'DatabaseItemEditor', { window });
    const itemEditor = Object.create(ItemEditor.prototype);
    itemEditor.databaseManager = {
        getItem: () => item,
        updateItem: () => {}
    };
    assert.equal(itemEditor.updateItemField(1, 'repeats', '99999'), 100);
    assert.equal(itemEditor.updateItemField(1, 'price', '9999999'), 9999999);
});

test('level 999 extrapolates finite class parameters without expanding class data', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'src', 'utils', 'DataLimits.js'), 'utf8');
    const { limits, resolve, expForLevel } = vm.runInNewContext(`${source}\n({ limits: RR_LIMITS, resolve: rrClassParamAtLevel, expForLevel: rrExpForLevel });`);
    const curve = new Array(100).fill(0).map((_, level) => level * 2);

    assert.equal(limits.ACTOR_LEVEL, 999);
    assert.equal(limits.ACTION_REPEATS, 100);
    assert.equal(limits.MAP_COUNT, 2000);
    assert.equal(limits.DATABASE_ENTRIES.tilesets, 1000);
    assert.equal(limits.DATABASE_ENTRIES.skills, 9999);
    assert.equal(resolve(curve, 99), 198);
    assert.equal(resolve(curve, 100), 200);
    assert.equal(resolve(curve, 999), 1998);
    assert.equal(resolve([null, 7], 999), 7);
    assert.equal(expForLevel([30, 20, 30, 30], 1), 0);
    assert.equal(expForLevel([30, 20, 30, 30], 2), 50);
    assert.equal(Number.isFinite(expForLevel([100, 100, 100, 100], 999)), true);

    const DatabaseEditorUI = loadBrowserClass(path.join(repoRoot, 'src', 'DatabaseEditorUI.js'), 'DatabaseEditorUI');
    const templates = Object.create(DatabaseEditorUI.prototype).getDefaultTemplates();
    assert.equal(templates.classes.params.length, 8);
    assert.equal(templates.classes.params.every(values => values.length === 2 && values.every(Number.isFinite)), true);

    const equipSlotsSource = fs.readFileSync(path.join(repoRoot, 'src', 'utils', 'EquipSlots.js'), 'utf8');
    const battleSource = fs.readFileSync(path.join(repoRoot, 'src', 'database', 'BattleTestConfigModal.js'), 'utf8');
    const BattleTestConfigModal = vm.runInNewContext(`${source}\n${equipSlotsSource}\n${battleSource}\nBattleTestConfigModal;`, { window: { I18n: null } });
    const battleTest = Object.create(BattleTestConfigModal.prototype);
    battleTest.databaseManager = {
        getActor: () => ({ id: 1, classId: 1, maxLevel: 999 }),
        getClass: () => ({ params: Array.from({ length: 8 }, () => curve) })
    };
    battleTest.getEquipSlotBindings = () => [];
    assert.deepEqual(Array.from(battleTest.calculateStats({ actorId: 1, level: 999, equips: [] })), new Array(8).fill(1998));

    const actor = {
        id: 1,
        classId: 1,
        maxLevel: 99,
        traits: [
            { code: 51, dataId: 2 },
            { code: 52, dataId: 2 },
            { code: 54, dataId: 3 },
            { code: 55, dataId: 1 }
        ]
    };
    const actorClass = {
        traits: [{ code: 51, dataId: 1 }, { code: 52, dataId: 1 }],
        params: Array.from({ length: 8 }, () => curve)
    };
    const weapons = [
        { id: 1, wtypeId: 1, params: [5, 0, 0, 0, 0, 0, 0, 0] },
        { id: 2, wtypeId: 2, params: [5, 0, 0, 0, 0, 0, 0, 0] },
        { id: 3, wtypeId: 3, params: [99, 0, 0, 0, 0, 0, 0, 0] }
    ];
    const armors = [
        { id: 1, etypeId: 3, atypeId: 1, params: [99, 0, 0, 0, 0, 0, 0, 0] },
        { id: 2, etypeId: 4, atypeId: 2, params: [7, 0, 0, 0, 0, 0, 0, 0] },
        { id: 3, etypeId: 4, atypeId: 3, params: [99, 0, 0, 0, 0, 0, 0, 0] }
    ];
    const filteredBattleTest = Object.create(BattleTestConfigModal.prototype);
    filteredBattleTest.databaseManager = {
        getActor: () => actor,
        getClass: () => actorClass,
        getSystem: () => ({ equipTypes: [null, 'Weapon', 'Shield', 'Head', 'Body', 'Accessory'] }),
        getWeapons: () => weapons,
        getArmors: () => armors,
        getWeapon: id => weapons.find(item => item.id === id),
        getArmor: id => armors.find(item => item.id === id)
    };
    assert.deepEqual(Array.from(filteredBattleTest.getEquipSlots(actor)), [1, 1, 3, 4, 5]);
    assert.deepEqual(Array.from(filteredBattleTest.getCompatibleEquipment(actor, 1), item => item.id), [1, 2]);
    assert.deepEqual(Array.from(filteredBattleTest.getCompatibleEquipment(actor, 3), item => item.id), []);
    assert.deepEqual(Array.from(filteredBattleTest.getCompatibleEquipment(actor, 4), item => item.id), [2]);
    assert.equal(filteredBattleTest.calculateStats({ actorId: 1, level: 1, equips: [1, 2, 1, 2, 0] })[0], 19);
    assert.match(battleSource, /scrollbar-gutter:stable/);
    assert.match(battleSource, /grid-template-columns:96px minmax\(0,1fr\)/);
    assert.match(battleSource, /className = 'battle-test-config-header'/);
    assert.match(battleSource, /className = 'battle-test-config-body'/);
    assert.match(battleSource, /className = 'battle-test-config-footer'/);
    assert.match(battleSource, /background-color:var\(--color-bg-toolbar\)/);
    assert.match(battleSource, /slot\.compatibleItems\.length > 0 \|\| slot\.currentEquipId > 0/);
    assert.match(battleSource, /RREquipSlots\.resolveInitialBindings/);
    assert.doesNotMatch(battleSource, /emptyHint\.textContent = this\._t\('\(no compatible items\)'\)/);

    const runtime = fs.readFileSync(path.resolve(repoRoot, '..', 'runtime', 'reactor_objects.js'), 'utf8');
    assert.match(runtime, /Game_Actor\.prototype\.classParamAtLevel/);
    assert.match(runtime, /Math\.min\(100, Math\.floor\(Number\(repeats\)/);
    assert.match(fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8'), /src\/utils\/DataLimits\.js/);
});

test('type clipboard cache preserves selected trailing blank rows', async () => {
    const DatabaseEditorUI = loadBrowserClass(path.join(repoRoot, 'src', 'DatabaseEditorUI.js'), 'DatabaseEditorUI');
    const ui = Object.create(DatabaseEditorUI.prototype);
    ui.typeClipboard = ['Fire', ''];
    ui.typeClipboardText = 'Fire\n';
    ui.plainTextClipboard = 'Fire\n';
    ui.typeClipboardUseInternal = false;

    assert.deepEqual(Array.from(await ui.readTypeClipboard()), ['Fire', '']);
    ui.typeClipboardUseInternal = true;
    assert.deepEqual(Array.from(await ui.readTypeClipboard()), ['Fire', '']);
    assert.equal(ui.typeClipboardUseInternal, false);

    ui.plainTextClipboard = 'Terms text\nSecond line';
    assert.deepEqual(Array.from(await ui.readTypeClipboard()), ['Terms text', 'Second line']);

    ui.plainClipboardWritePending = true;
    ui.plainTextClipboard = 'Pending\nClipboard';
    assert.deepEqual(Array.from(await ui.readTypeClipboard()), ['Pending', 'Clipboard']);
});

test('Terms editor uses a full-width compact workspace with native text actions', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'src', 'DatabaseEditorUI.js'), 'utf8');
    const styles = fs.readFileSync(path.join(repoRoot, 'css', 'styles.css'), 'utf8');

    assert.match(source, /prepareDatabaseSection\('terms',[\s\S]*showListPanel: false/);
    assert.match(source, /class="rr-terms-workspace"/);
    assert.match(source, /class="rr-terms-fields rr-terms-fields-four"/);
    assert.match(source, /class="rr-terms-message-columns"/);
    assert.match(source, /attachTextFieldContextMenu\(input\)/);
    assert.match(styles, /\.rr-terms-workspace\s*\{[^}]*grid-template-columns:/s);
    assert.match(styles, /\.rr-terms-message-list\s*\{[^}]*overflow-y: auto;/s);
});

test('database viewer owns the viewport while child panes own scrolling', () => {
    const styles = fs.readFileSync(path.join(repoRoot, 'css', 'styles.css'), 'utf8');
    const troopPath = path.join(repoRoot, 'src', 'database', 'DatabaseTroopEditor.js');
    const troopSource = fs.readFileSync(troopPath, 'utf8');
    const DatabaseTroopEditor = loadBrowserClass(troopPath, 'DatabaseTroopEditor');
    const troopEditor = Object.create(DatabaseTroopEditor.prototype);
    troopEditor.configureBattleGeometry({
        advanced: { screenWidth: 1280, screenHeight: 720, uiAreaWidth: 816, uiAreaHeight: 624 },
        optSideView: true
    }, false);
    const troopCanvasPoint = troopEditor.battleToCanvas(400, 300);
    const troopDrawRect = troopEditor.getEnemyDrawRect({ x: 400, y: 300 }, 100, 80);
    const troopBattlePoint = troopEditor.canvasToBattle(troopCanvasPoint.x, troopCanvasPoint.y);
    const battlebackRect = troopEditor.getBattlebackDrawRect({ naturalWidth: 1000, naturalHeight: 740 });
    troopEditor.currentTroop = { members: [{ enemyId: 1 }, { enemyId: 2 }] };
    troopEditor.selectedMemberIndex = 1;
    troopEditor.persistTroop = () => {};
    troopEditor.populateMembersList = () => {};
    troopEditor.renderCanvas = () => {};
    troopEditor.canvas = { focus: () => {} };
    let prevented = false;
    let stopped = false;
    troopEditor.onCanvasKeyDown({
        key: 'Delete',
        preventDefault: () => { prevented = true; },
        stopPropagation: () => { stopped = true; }
    });
    const animationPath = path.join(repoRoot, 'src', 'database', 'DatabaseAnimationEditor.js');
    const animationSource = fs.readFileSync(animationPath, 'utf8');
    const DatabaseAnimationEditor = loadBrowserClass(animationPath, 'DatabaseAnimationEditor');
    const animationEditor = Object.create(DatabaseAnimationEditor.prototype);
    const canvasPoint = animationEditor.getAnimationCanvasPoint({
        width: 960,
        height: 540,
        getBoundingClientRect: () => ({ left: 100, top: 50, width: 480, height: 270 })
    }, { clientX: 340, clientY: 185 });

    assert.match(styles, /\.database-window\s*\{[^}]*width: calc\(100% - 24px\);[^}]*height: calc\(100% - 24px\);[^}]*overflow: hidden;/s);
    assert.match(styles, /html\.rr-web #database-viewer\s*\{[^}]*overflow: hidden;/s);
    assert.match(styles, /html\.rr-web \.database-window\s*\{[^}]*width: 100% !important;[^}]*max-width: none !important;[^}]*height: 100% !important;/s);
    assert.match(styles, /\.database-detail\s*\{[^}]*min-height: 0;[^}]*overflow-y: auto;/s);
    assert.match(styles, /\.rr-types-grid\s*\{[^}]*display: grid;[^}]*grid-template-columns: repeat\(5,/s);
    assert.match(styles, /\.rr-types-list\s*\{[^}]*overflow-y: auto;/s);
    assert.match(styles, /\.rr-troop-editor \.database-section\s*\{[^}]*margin-bottom: 0;/s);
    assert.match(styles, /\.rr-troop-upper-workspace\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(240px, 300px\);/s);
    assert.match(styles, /@media \(max-width: 900px\)[\s\S]*\.rr-troop-upper-workspace\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/s);
    assert.match(troopSource, /className = 'rr-troop-editor'/);
    assert.match(troopSource, /className = 'rr-troop-upper-workspace'/);
    assert.match(troopSource, /className = 'rr-troop-sidebar'/);
    assert.match(troopSource, /bar\.appendChild\(battleTestBtn\);[\s\S]*bar\.appendChild\(this\.createMembersSection\(\)\);[\s\S]*bar\.appendChild\(this\.createBattlebackSection\(\)\);[\s\S]*bar\.appendChild\(noteSection\);/);
    assert.match(troopSource, /max-height:clamp\(220px,34vh,460px\)/);
    assert.match(troopSource, /min-height:clamp\(180px,24vh,240px\)/);
    assert.match(troopSource, /database-section rr-troop-preview-section/);
    assert.match(troopSource, /className = 'troop-conditions-modal'/);
    assert.match(troopSource, /grid-template-columns:\$\{columns\[index\]\}/);
    assert.match(troopSource, /background-color:var\(--color-bg-toolbar\)/);
    assert.match(troopSource, /className = 'troop-conditions-footer'/);
    assert.doesNotMatch(troopSource, /height: 100%; overflow-y: auto; padding: 16px/);
    assert.deepEqual({ ...troopCanvasPoint }, { x: 636, y: 328 });
    assert.deepEqual({ ...troopBattlePoint }, { x: 400, y: 300 });
    assert.deepEqual({ ...troopDrawRect }, { x: 586, y: 248, width: 100, height: 80 });
    assert.equal(battlebackRect.x, -144);
    assert.equal(battlebackRect.width, 1568);
    assert.equal(prevented, true);
    assert.equal(stopped, true);
    assert.deepEqual(Array.from(troopEditor.currentTroop.members, member => member.enemyId), [1]);
    assert.equal(troopEditor.selectedMemberIndex, -1);
    assert.match(troopSource, /this\.canvas\.tabIndex = -1/);
    assert.match(troopSource, /this\.canvas\.addEventListener\('keydown'/);
    assert.match(animationSource, /class="anim-editor-main-row"/);
    assert.match(animationSource, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
    assert.match(animationSource, /class="rr-dark-surface anim-preview-surface"[^>]*height:clamp\(180px,30vh,420px\)/);
    assert.match(animationSource, /class="anim-preview-column"[^>]*min-width:0/);
    assert.match(animationSource, /const displayCellSize = 72/);
    assert.doesNotMatch(animationSource, /height: 470px|min-width: 600px/);
    assert.deepEqual({ ...canvasPoint }, { x: 480, y: 270 });
});

test('troop members use the indexed enemy picker and own clipboard shortcuts', () => {
    const troopPath = path.join(repoRoot, 'src', 'database', 'DatabaseTroopEditor.js');
    const source = fs.readFileSync(troopPath, 'utf8');
    const DatabaseTroopEditor = loadBrowserClass(troopPath, 'DatabaseTroopEditor');
    const editor = Object.create(DatabaseTroopEditor.prototype);
    editor.currentTroop = {
        members: [
            { enemyId: 1, x: 10, y: 20, hidden: false },
            { enemyId: 2, x: 30, y: 40, hidden: true }
        ]
    };
    editor.selectedMemberIndex = 0;
    editor.memberClipboard = null;
    editor.boxWidth = 816;
    editor.boxHeight = 624;
    editor.persistTroop = () => {};
    editor.populateMembersList = () => {};
    editor.loadAndRenderCanvas = () => {};
    editor.renderCanvas = () => {};

    let prevented = 0;
    let stopped = 0;
    const keyEvent = (key, ctrlKey = false) => ({
        key,
        ctrlKey,
        metaKey: false,
        target: {},
        preventDefault: () => { prevented++; },
        stopPropagation: () => { stopped++; }
    });
    editor.handleMemberKeyDown(keyEvent('c', true));
    editor.handleMemberKeyDown(keyEvent('v', true));

    assert.deepEqual(Array.from(editor.currentTroop.members, member => member.enemyId), [1, 1, 2]);
    assert.deepEqual({ ...editor.currentTroop.members[1] }, { enemyId: 1, x: 26, y: 36, hidden: false });
    assert.equal(editor.selectedMemberIndex, 1);

    editor.handleMemberKeyDown(keyEvent('Delete'));
    editor.handleMemberKeyDown(keyEvent('Delete'));
    assert.deepEqual(Array.from(editor.currentTroop.members, member => member.enemyId), [1, 2]);
    assert.equal(prevented, 4);
    assert.equal(stopped, 4);
    assert.match(source, /RRPickerIndex\.createBrowser\(\{/);
    assert.match(source, /searchPlaceholder: tt\('Search enemies\.\.\.'\)/);
    assert.match(source, /className = 'troop-member-context-menu'/);
    assert.match(source, /membersList\.addEventListener\('keydown'/);
    assert.match(source, /row\.ondblclick/);
    assert.doesNotMatch(source, /troop-add-enemy-select/);
    assert.match(source, /e\.shiftKey && this\.commandSelectionAnchor !== null/);
    assert.match(source, /handleCommandListKeyDown/);
    assert.match(source, /expandCommandSelection\(page\)/);
    assert.match(source, /EventCommandList\.rebaseInsertIndent/);
});

test('actor equipment hides unsupported slots and trait pickers preserve sparse type IDs', () => {
    const actorPath = path.join(repoRoot, 'src', 'database', 'DatabaseActorEditor.js');
    const actorSource = fs.readFileSync(actorPath, 'utf8');
    const RREquipSlots = require(path.join(repoRoot, 'src', 'utils', 'EquipSlots.js'));
    const rrEscapeHtml = require(path.join(repoRoot, 'src', 'utils', 'HtmlEscape.js'));
    const window = { I18n: null };
    const document = { createElement: () => ({ className: '', innerHTML: '' }) };
    const DatabaseActorEditor = loadBrowserClass(actorPath, 'DatabaseActorEditor', {
        window, document, RREquipSlots, rrEscapeHtml
    });
    const actorEditor = Object.create(DatabaseActorEditor.prototype);
    const actorClass = {
        id: 1,
        name: 'Pilot',
        traits: [{ code: 51, dataId: 1 }, { code: 52, dataId: 1 }]
    };
    actorEditor.databaseManager = {
        getSystem: () => ({
            equipTypes: [null, 'Weapon', 'Shield', 'Avionics'],
            weaponTypes: [null, 'Blade'],
            armorTypes: [null, 'General', 'Machine']
        }),
        getClass: () => actorClass,
        getWeapons: () => [{ id: 1, name: 'Sword', wtypeId: 1 }],
        getArmors: () => [
            { id: 1, name: 'Shield', etypeId: 2, atypeId: 1 },
            { id: 2, name: 'Processor', etypeId: 3, atypeId: 2 }
        ]
    };
    const section = actorEditor.createEquipmentSection({ id: 1, classId: 1, traits: [], equips: [0, 0, 0] });
    assert.match(section.innerHTML, /Sword/);
    assert.match(section.innerHTML, /Shield/);
    assert.doesNotMatch(section.innerHTML, /Avionics|Processor|no compatible items/);
    assert.match(actorSource, /if \(compatibleCount === 0 && equipId === 0\) return;/);

    const traitPath = path.join(repoRoot, 'src', 'database', 'DatabaseTraitEditor.js');
    const DatabaseTraitEditor = loadBrowserClass(traitPath, 'DatabaseTraitEditor', { window, rrEscapeHtml });
    const traitEditor = Object.create(DatabaseTraitEditor.prototype);
    traitEditor.databaseManager = {
        getSystem: () => ({
            weaponTypes: [null, 'Blade', '', 'Cannon'],
            armorTypes: [null, 'General', '', 'Machine'],
            equipTypes: [null, 'Weapon', '', 'Avionics']
        })
    };
    traitEditor.setupRadioInputs = () => {};
    const traitContainer = { innerHTML: '' };
    traitEditor.createEquipTab(traitContainer, { code: 51, dataId: 3 });
    assert.match(traitContainer.innerHTML, /value="3" selected>Cannon/);
    assert.doesNotMatch(traitContainer.innerHTML, /value="2"[^>]*>Cannon/);
    assert.match(traitContainer.innerHTML, /value="3"[^>]*>Machine/);
    assert.match(traitContainer.innerHTML, /value="3"[^>]*>Avionics/);

    const fixtureSystem = {
        equipTypes: [null, 'Weapon', 'Shield', 'Avionics', 'Engines']
    };
    const fixtureClass = {
        id: 1,
        name: 'Pilot',
        note: '<Equip Slots>\nWeapon\nShield\nShield\nAvionics\nEngines\n</Equip Slots>'
    };
    const fixtureManager = {
        getSystem: () => fixtureSystem,
        getClass: () => fixtureClass
    };
    const fixtureActor = { id: 1, classId: 1 };
    const fixtureSlots = RREquipSlots.resolve(fixtureManager, { path: '/tracked-fixture' }, fixtureActor, false);
    const fixtureBindings = RREquipSlots.resolveInitialBindings(fixtureManager, { path: '/tracked-fixture' }, fixtureActor, false);
    assert.deepEqual(fixtureSlots, [1, 2, 2, 3, 4]);
    assert.deepEqual(fixtureBindings, fixtureSlots.map((etypeId, slotIndex) => ({ etypeId, slotIndex })));
    assert.match(fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8'), /src\/utils\/EquipSlots\.js/);
});
