const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const source = relativePath => fs.readFileSync(path.join(editorRoot, relativePath), 'utf8');
const DatabaseEditorUI = require(path.join(editorRoot, 'src', 'DatabaseEditorUI.js'));

function fakeElement(id = '') {
    return {
        id,
        style: {},
        children: [],
        listeners: {},
        value: '',
        textContent: '',
        innerHTML: '',
        appendChild(child) { this.children.push(child); return child; },
        addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); },
        dispatchEvent(event) {
            for (const handler of this.listeners[event.type] || []) handler({ target: this });
            return true;
        },
        click() { this.dispatchEvent({ type: 'click' }); }
    };
}

function stubPickerDom(baseZIndex = '10001') {
    const nodes = {
        'image-picker-modal': Object.assign(fakeElement(), {
            style: { zIndex: baseZIndex, display: 'none' }
        }),
        'image-picker-title': fakeElement(),
        'image-picker-list': fakeElement(),
        'image-picker-preview': fakeElement(),
        'image-picker-close-btn': fakeElement()
    };
    global.document = {
        getElementById: id => nodes[id] || null,
        createElement: () => fakeElement()
    };
    global.window = { I18n: null };
    const calls = [];
    global.RRPickerIndex = {
        createBrowser(options) {
            calls.push(options);
            return { element: fakeElement(), scrollTo() {} };
        }
    };
    return { nodes, calls, ui: Object.create(DatabaseEditorUI.prototype) };
}

test('the shared picker lends its stacking level and keeps (None) pinned', () => {
    const { nodes, calls, ui } = stubPickerDom();
    const selected = [];

    ui.showImagePicker('Select Picture', ['Ship'], () => {}, () => '', '', { zIndex: 10007 });
    assert.equal(nodes['image-picker-modal'].style.zIndex, '10007');

    ui.showImagePicker('Select Battleback 1', ['Grassland'],
        (name, index) => selected.push([name, index]), () => '', '', { allowNone: true });
    assert.equal(nodes['image-picker-modal'].style.zIndex, '10001');
    assert.deepEqual(calls.at(-1).files, ['Grassland']);
    assert.equal(calls.at(-1).leadingItem.label, '(None)');

    calls.at(-1).leadingItem.onClick();
    assert.deepEqual(selected, [['', 0]]);
    assert.equal(nodes['image-picker-modal'].style.display, 'none');
});

test('browseImageFolder lists extension-aware image names and reports empty folders', () => {
    global.window = { I18n: null };
    let listCall;
    global.RRAssetFiles = {
        listImageReferences(folder) {
            listCall = { folder };
            return ['custom/Crew/Guard', 'posters/Launch.webp'];
        },
        imageUrlFor: (folder, name) => `asset://${folder}/${name}`
    };
    let pickerCall;
    const ui = Object.create(DatabaseEditorUI.prototype);
    ui.showImagePicker = (...args) => { pickerCall = args; };

    assert.equal(ui.browseImageFolder({
        projectPath: '/game', folder: 'pictures', title: 'Select Picture',
        current: 'custom/Crew/Guard', zIndex: 10007, onPick() {}
    }), true);
    const folder = path.join('/game', 'img', 'pictures');
    assert.deepEqual(listCall, { folder });
    assert.deepEqual(pickerCall[1], ['custom/Crew/Guard', 'posters/Launch.webp']);
    assert.equal(pickerCall[4], 'custom/Crew/Guard');
    assert.equal(pickerCall[5].zIndex, 10007);
    assert.equal(pickerCall[3]('custom/Crew/Guard'), `asset://${folder}/custom/Crew/Guard`);

    global.RRAssetFiles.listImageReferences = () => [];
    global.alert = message => { global.alert.message = message; };
    pickerCall = null;
    assert.equal(ui.browseImageFolder({
        projectPath: '/game', folder: 'faces', title: 'Select Face', onPick() {}
    }), false);
    assert.equal(pickerCall, null);
    assert.equal(global.alert.message, 'No files found in: img/faces');
});

test('browse buttons use the live field value and update sheet indices through input events', () => {
    global.window = { I18n: null };
    global.document = { createElement: () => fakeElement() };
    const ui = Object.create(DatabaseEditorUI.prototype);
    let request;
    ui.browseImageFolder = value => { request = value; return true; };

    const input = fakeElement();
    let inputEvents = 0;
    input.addEventListener('input', () => inputEvents++);
    const button = ui.createImageBrowseButton(input, {
        projectPath: '/game', folder: 'pictures', title: 'Select Picture'
    });
    assert.equal(button.type, 'button');
    assert.equal(button.className, 'rr-image-browse-btn');
    assert.equal(button.textContent, 'Browse…');
    input.value = 'draft/Poster.PNG';
    button.click();
    assert.equal(request.current, 'draft/Poster');
    request.onPick('released/Poster', 0);
    assert.equal(input.value, 'released/Poster');
    assert.equal(inputEvents, 1);

    input.value = 'draft/Poster.webp';
    button.click();
    assert.equal(request.current, 'draft/Poster.webp', 'non-PNG extensions remain serialized');

    const sheet = fakeElement();
    const index = fakeElement();
    sheet.value = '';
    index.value = '3';
    let sheetEvents = 0;
    let indexEvents = 0;
    sheet.addEventListener('input', () => sheetEvents++);
    index.addEventListener('input', () => indexEvents++);
    ui.createImageBrowseButton(sheet, {
        projectPath: '/game', folder: 'characters', title: 'Select Character Sprite',
        sheetType: 'character', indexInput: index
    }).click();
    assert.equal(request.current, undefined);
    assert.equal(request.currentIndex, 3);
    request.onPick('Crew/Guard', 5);
    assert.equal(sheet.value, 'Crew/Guard');
    assert.equal(Number(index.value), 5);
    assert.equal(sheetEvents, 1);
    assert.equal(indexEvents, 1);
});

test('imageBrowser requires both a project path and the shared picker', () => {
    global.window = { reactor: {} };
    assert.equal(DatabaseEditorUI.imageBrowser(null), null);
    assert.equal(DatabaseEditorUI.imageBrowser({ currentProject: {} }), null);
    assert.equal(DatabaseEditorUI.imageBrowser({ currentProject: { path: '/game' } }), null);

    const picker = { createImageBrowseButton() {} };
    global.window.reactor.databaseEditorUI = picker;
    assert.deepEqual(DatabaseEditorUI.imageBrowser({ getCurrentProject: () => ({ path: '/game' }) }), {
        picker, projectPath: '/game'
    });
    assert.deepEqual(DatabaseEditorUI.imageBrowser({ currentProject: { path: '/other' } }), {
        picker, projectPath: '/other'
    });
});

test('all twelve missing image controls route through the shared browser', () => {
    const calls = [
        ['src/event/commands/ShowPictureEditor.js', 1, ['pictures', 'Select Picture', 'pictureName']],
        ['src/event/commands/ChangeBattleBackgroundEditor.js', 2,
            ['battlebacks1', 'Select Battleback 1', 'battlebacks2', 'Select Battleback 2']],
        ['src/event/commands/ChangeParallaxEditor.js', 1, ['parallaxes', 'Select Parallax Background']],
        ['src/event/commands/ChangeActorImagesEditor.js', 3,
            ['characters', "sheetType: 'character'", 'charIdxInput', 'faces',
             "sheetType: 'face'", 'faceIdxInput', 'sv_actors']],
        ['src/event/commands/ChangeVehicleImageEditor.js', 1,
            ['characters', "sheetType: 'character'", 'charIdxInput']]
    ];
    for (const [file, count, pins] of calls) {
        const body = source(file);
        assert.equal((body.match(/createImageBrowseButton\(/g) || []).length, count, file);
        assert.equal((body.match(/zIndex: 10007/g) || []).length, count, `${file} stacking`);
        for (const pin of pins) assert.ok(body.includes(pin), `${file} includes ${pin}`);
    }
    const picture = source('src/event/commands/ShowPictureEditor.js');
    assert.match(picture, /imageRow\.style\.flexWrap = 'wrap'/);
    assert.match(picture, /imageInput\.style\.minWidth = '0'/);

    const html = source('index.html');
    assert.match(html, /id="map-battleback1-browse-btn"/);
    assert.match(html, /id="map-battleback2-browse-btn"/);
    assert.doesNotMatch(html, /title="Preview and choose a battleback"/);

    const project = source('src/ProjectController.js');
    for (const layer of [1, 2]) {
        assert.ok(project.includes(`'map-battleback${layer}-browse-btn', 'click'`));
        assert.ok(project.includes(`() => this.openBattlebackPicker(${layer})`));
    }
    const parallax = project.slice(project.indexOf('openParallaxPicker() {'),
        project.indexOf('\n    openBattlebackPicker(', project.indexOf('openParallaxPicker() {')));
    assert.doesNotMatch(parallax, /const NONE|const BLANK|\[NONE, \.\.\.files\]/);
    assert.match(parallax, /allowNone: true/);

    const troop = source('src/database/DatabaseTroopEditor.js');
    assert.match(troop, /}, 1\)\);/);
    assert.match(troop, /}, 2\)\);/);
    assert.match(troop, /browse\.addEventListener\('click', \(\) => this\.openBattlebackPicker/);
    assert.equal((project.match(/allowNone: true/g) || []).length >= 2, true);
    assert.match(troop, /allowNone: true/);

    const animations = source('src/database/DatabaseAnimationEditor.js');
    assert.match(animations, /bindBattlebackPicker[\s\S]*?showImagePicker\(/);
    assert.match(animations, /'battlebacks1'[\s\S]*?'Select Battleback 1'/);
    assert.match(animations, /'battlebacks2'[\s\S]*?'Select Battleback 2'/);
    assert.match(animations, /\{ allowNone: true \}/);
    assert.match(animations, /bb1Select\.textContent = this\._previewBB1Name \|\| tt\('\(none\)'\)/);
    assert.match(animations, /bb2Select\.textContent = this\._previewBB2Name \|\| tt\('\(none\)'\)/);

    const sharedPicker = source('src/DatabaseEditorUI.js');
    assert.match(sharedPicker, /openFolderBtn\.className = 'rr-btn-secondary'/);
    assert.doesNotMatch(sharedPicker, /openFolderBtn\.style\.cssText/);
});
