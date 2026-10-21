/**
 * The Database pages System 1, System 2 and Vehicles, run as the editor
 * runs them against a small document (card-dom): the real page code draws
 * into it and its controls are fired by hand. The dialogs a page opens (the
 * character sheet picker, the audio picker, the map picker) are kept instead
 * of shown, so a test answers them the way their OK button does.
 *
 *   const { createPages } = require('./helpers/database-pages.cjs');
 *   const pages = createPages(manager, { projectPath });
 *   const page = pages.vehicle('boat');           // a stock row of Vehicles
 *   page.querySelector('.vehicle-image-browse').onclick();
 *   pages.opened.images[0].callback({ characterName: 'Vehicle', characterIndex: 3 });
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createDocument } = require('./card-dom.cjs');
const { runtimeRoot } = require('./runtime-source.cjs');

const source = path.resolve(__dirname, '..', '..', 'src');

/**
 * manager: a DatabaseManager (or what the pages use of one).
 * options: projectPath, image ({ width, height } of every sheet the pages load).
 */
function createPages(manager, options = {}) {
    const { document, window, Element } = createDocument();
    Element.prototype.append = function(...children) { for (const child of children) this.appendChild(child); };
    Element.prototype.replaceChildren = function(...children) { this.innerHTML = ''; for (const child of children) this.appendChild(child); };
    const opened = { images: [], sounds: [], maps: [] };
    const timers = [];
    const sheet = options.image || { width: 576, height: 384 };
    window.reactor = { projectManager: { getRuntimePath: () => runtimeRoot } };
    const context = vm.createContext({
        document, window, require, process, structuredClone,
        console: { log() {}, debug() {}, warn() {}, error: console.error },
        rrEscapeHtml: require(path.join(source, 'utils', 'HtmlEscape.js')),
        RREquipSlots: require(path.join(source, 'utils', 'EquipSlots.js')),
        RRSystemSoundSlotModal: require(path.join(source, 'utils', 'SystemSoundSlotModal.js')),
        RRDatabase3DBindings: { decorateSlot: () => null },
        RRAssetFiles: {
            AUDIO_EXTENSIONS: ['.ogg'],
            isBigCharacter: name => (/^[!$]+/.exec(path.basename(String(name))) || [''])[0].includes('$'),
            characterFrameCount: () => 3,
            imageUrlFor: (dir, name) => `file:///${name}.png`,
            urlFor: (dir, name) => `file:///${name}.png`,
            listUnique: () => []
        },
        // A sheet arrives the moment it is asked for.
        Image: class { set src(value) { this._src = value; this.width = sheet.width; this.height = sheet.height; if (this.onload) this.onload(); } get src() { return this._src; } },
        TransferPlayerEditor: class { showMapPicker(request) { opened.maps.push(request); return null; } },
        CharacterGraphicPicker: class { show(name, index, pattern, direction, callback) { opened.images.push({ name, index, pattern, direction, callback }); } },
        RRAudioPickerModal: { open(request) { opened.sounds.push(request); return null; } },
        DatabaseTraitEditor: class {},
        // A page wires its controls on the next turn: flush() is that turn.
        setTimeout: handler => { timers.push(handler); return timers.length; },
        clearTimeout() {}
    });
    const load = name => vm.runInContext(fs.readFileSync(path.join(source, 'database', name + '.js'), 'utf8') + '\n' + name + ';', context);
    const Actor = load('DatabaseActorEditor'), Class = load('DatabaseClassEditor');
    const Vehicle = load('DatabaseVehicleEditor'), System1 = load('DatabaseSystem1Editor'), System2 = load('DatabaseSystem2Editor');
    // The trait and skill tables are their own pages' business.
    Actor.prototype.createTraitsSection = () => document.createElement('div');
    Class.prototype.createLearnableSkillsSection = () => {
        const section = document.createElement('div');
        section.innerHTML = '<div class="database-section-content"></div>';
        return section;
    };

    const project = { getCurrentProject: () => ({ path: options.projectPath || path.join(runtimeRoot, '..', 'template', 'Demo') }) };
    const flush = () => { while (timers.length) timers.shift()(); };
    const host = id => {
        let element = document.getElementById(id);
        if (!element) { element = document.createElement('div'); element.id = id; document.body.appendChild(element); }
        element.innerHTML = '';
        return element;
    };
    const parent = {
        commonUI: { nameHtml: text => String(text) },
        captureDetailContext: () => () => true,
        registerDetailModal() {},
        refreshDatabaseListEntry() {},
        showDatabaseDetail: entry => vehicles.showStock(host('database-detail'), entry.stockVehicle)
    };
    const vehicles = new Vehicle(manager, project, parent);
    const system1 = new System1(manager, project, parent.commonUI, parent);
    const system2 = new System2(manager, project, parent.commonUI, parent);
    return {
        document, window, opened, flush, Vehicle, System1, System2,
        /** A stock row of Database > Vehicles ('boat', 'ship' or 'airship'). */
        vehicle(key) { const container = host('database-detail'); vehicles.showStock(container, key); flush(); return container; },
        system1() { const container = host('database-detail'); system1.showSystem1Detail(container); flush(); return container; },
        system2() { const container = host('database-detail'); system2.showSystem2Detail(container); flush(); return container; },
        /** Tick or clear a checkbox the way a click does. */
        check(box, on) { box.checked = !!on; if (on) box.setAttribute('checked', ''); else box.removeAttribute('checked'); return box.dispatchEvent({ type: 'change' }); }
    };
}

module.exports = { createPages };
