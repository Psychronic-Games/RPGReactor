/**
 * Database > User Interfaces: a record is a tree of Box / Image / Text /
 * Button / List nodes laid out in physical screen pixels, each control
 * wired to an action. The runtime half is runtime/reactor_ui.js; this file
 * keeps the same node shape and the same anchored layout so what the canvas
 * shows is where the game draws.
 */
class DatabaseUserInterfaceEditor {
    static get NODE_TYPES() { return ['box', 'image', 'text', 'button', 'list', 'gauge', 'input', 'battleWindow', 'battleCursor']; }
    /** The stock battle windows a Battle Window node places. */
    static get BATTLE_WINDOWS() {
        return [['partyCommand', 'Party Command'], ['actorCommand', 'Actor Command'], ['help', 'Help'], ['skill', 'Skills'], ['item', 'Items'],
            ['actor', 'Ally Target'], ['enemy', 'Enemy Target'], ['status', 'Battle Status'], ['log', 'Battle Log']];
    }
    /** Node types that take focus and run an action. */
    static isControl(type) { return type === 'button' || type === 'list' || type === 'input'; }
    static get GAUGE_KINDS() { return ['hp', 'mp', 'tp', 'exp', 'mhp', 'mmp', 'atk', 'def', 'mat', 'mdf', 'agi', 'luk', 'variable']; }
    static get LIST_SOURCES() { return ['party', 'inventory', 'skills', 'actorParameters', 'actorEquipment', 'actorStates', 'options', 'saveSlots', 'variableRange', 'literal',
        'itemCategories', 'skillTypes', 'equipCandidates', 'shopGoods', 'shopSell']; }
    /** Sources whose rows follow another list's selection (filterContext). */
    static get FOLLOWING_SOURCES() { return ['inventory', 'skills', 'equipCandidates', 'shopSell']; }
    /** Sources that read an actor binding. */
    static get ACTOR_LIST_SOURCES() { return ['skills', 'actorParameters', 'actorEquipment', 'actorStates', 'skillTypes', 'equipCandidates']; }
    static get ACTOR_SOURCES() { return ['partySlot', 'actorId', 'menuActor', 'variable', 'context', 'sceneActor']; }
    static get IMAGE_SOURCES() { return ['picture', 'system', 'face', 'character', 'icon', 'partyFace', 'title1', 'title2']; }
    /** img/ folder of each image source. */
    static get IMAGE_FOLDERS() { return { picture: 'pictures', system: 'system', face: 'faces', character: 'characters', icon: 'system', partyFace: 'faces', title1: 'titles1', title2: 'titles2' }; }
    /** Fit text to size never shrinks below this; the runtime pins the same floor. */
    static get MIN_FONT_SIZE() { return 8; }
    static get ANCHORS() {
        return {
            topLeft: [0, 0], top: [0.5, 0], topRight: [1, 0],
            left: [0, 0.5], center: [0.5, 0.5], right: [1, 0.5],
            bottomLeft: [0, 1], bottom: [0.5, 1], bottomRight: [1, 1]
        };
    }
    static get ACTION_TYPES() {
        return ['none', 'close', 'closeAll', 'callInterface', 'commonEvent', 'scene', 'pluginCommand', 'switch', 'variable', 'script',
            'setMenuActor', 'personalSkill', 'personalEquip', 'personalStatus', 'titleNewGame', 'titleContinue', 'titleOptions',
            'gameEndToTitle', 'previousMenuActor', 'nextMenuActor', 'optionChange', 'saveSlot', 'loadSlot', 'formation', 'pluginScene',
            'use', 'equip', 'equipOptimize', 'equipClear', 'focusNode', 'shopBuy', 'shopSell'];
    }
    /** Actions that read or set an actor context. */
    static get CONTEXT_ACTIONS() {
        return ['setMenuActor', 'personalSkill', 'personalEquip', 'personalStatus', 'pluginScene', 'pluginCommand', 'script', 'formation',
            'use', 'equipOptimize', 'equipClear'];
    }
    static get SCENES() { return ['menu', 'item', 'skill', 'equip', 'status', 'save', 'load', 'options', 'gameEnd', 'title']; }
    static get CONDITION_TYPES() { return ['always', 'never', 'saveExists', 'switch', 'variable', 'script']; }
    static get REPLACEMENT_ROLES() {
        return [
            ['title', 'Title Screen', 'reactorTitleInterfaceId'],
            ['menu', 'Main Menu', 'reactorMenuInterfaceId'],
            ['status', 'Status', 'reactorStatusInterfaceId'],
            ['gameEnd', 'Game End', 'reactorGameEndInterfaceId'],
            ['options', 'Options', 'reactorOptionsInterfaceId'],
            ['save', 'Save', 'reactorSaveInterfaceId'],
            ['load', 'Load', 'reactorLoadInterfaceId'],
            ['item', 'Items', 'reactorItemInterfaceId'],
            ['skill', 'Skills', 'reactorSkillInterfaceId'],
            ['equip', 'Equipment', 'reactorEquipInterfaceId'],
            ['shop', 'Shop', 'reactorShopInterfaceId'],
            ['name', 'Name Input', 'reactorNameInterfaceId'],
            ['battle', 'Battle', 'reactorBattleInterfaceId']
        ];
    }
    static get GRID() { return 8; }

    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;
        this.current = null;
        this.selectedId = 0;
        this.selectedIds = new Set();
        this.selectionAnchor = 0;
        this.undoStack = [];
        this.redoStack = [];
        this.snap = true;
        this.showGrid = true;
        this.scale = 1;
        this.images = new Map();
        this.skin = null;
        this.drag = null;
        this._raf = 0;
        this._roleActiveIndex = 0;
    }

    _t(text) {
        return window.I18n ? window.I18n.tText(text) : text;
    }

    escapeHTML(value) {
        return typeof rrEscapeHtml === 'function' ? rrEscapeHtml(value) : String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    project() {
        return this.projectManager && this.projectManager.getCurrentProject ? this.projectManager.getCurrentProject() : null;
    }

    // ==========================================
    // DEFAULTS AND NORMALIZATION (mirrors runtime/reactor_ui.js)
    // ==========================================

    static defaultNode(type, id) {
        if (type === 'battleWindow') return {
            id, type, name: '', parent: 0, anchor: 'topLeft', x: 0, y: 0, width: 240, height: 200, index: 0, opacity: 255,
            visible: { type: 'always', id: 1, on: true, op: '==', value: 0, script: '' },
            battleWindow: 'actorCommand', fill: 'window', windowColumns: 0, hideWindow: false, followActor: false,
            slideX: 0, slideY: 0, slideDuration: 12, file: '', imageX: 0, imageY: 0
        };
        if (type === 'battleCursor') return {
            id, type, name: '', parent: 0, anchor: 'topLeft', x: 0, y: 0, width: 32, height: 28, index: 0, opacity: 255,
            visible: { type: 'always', id: 1, on: true, op: '==', value: 0, script: '' },
            source: 'picture', file: '', actorFile: '', cursorSlide: true, frames: 1, frameSpeed: 8, floatRange: 6, showName: true, fontSize: 0, fontFace: '',
            enemyOffsetX: 0, enemyOffsetY: 0, actorOffsetX: 0, actorOffsetY: 0
        };
        if (type === 'input') return Object.assign(this.defaultNode('button', id), {
            type: 'input', width: 320, height: 48, text: '', align: 'left', action: this.defaultAction('none'),
            inputTarget: 'variable', variableId: 1, maxLength: 16, mask: false, onScreenKeys: false, autoEdit: false
        });
        if (type === 'actorPanel') return Object.assign(this.defaultNode('list', id), {
            name: 'Actor Panel', dataSource: 'party', rowLayout: 'actorPanel', rowHeight: 256,
            width: 600, height: 384, contextName: 'selectedActor'
        });
        const base = {
            id, type, name: '', parent: 0, anchor: 'topLeft', x: 0, y: 0, width: 200, height: 100, index: 0,
            opacity: 255, visible: { type: 'always', id: 1, on: true, op: '==', value: 0, script: '' },
            actorSource: 'partySlot', actorId: 1, actorVariableId: 1, actorContextName: 'selection', contextName: 'selection'
        };
        switch (type) {
            case 'box':
                return Object.assign(base, { fill: 'window', color: '#000000', color2: '#000000', fillOpacity: 160, vertical: true, borderWidth: 0, borderColor: '#ffffff', radius: 0 });
            case 'image':
                return Object.assign(base, { width: 96, height: 96, fill: 'none', source: 'picture', file: '', index: 0, fit: 'none',
                    nineSlice: false, sliceLeft: 0, sliceTop: 0, sliceRight: 0, sliceBottom: 0 });
            case 'text':
                return Object.assign(base, { width: 0, height: 0, fill: 'none', text: 'Text', align: 'left', fontSize: 0, textColor: 0,
                    fontFace: '', fontBold: false, fontItalic: false, outline: true, outlineColor: '', outlineWidth: 3, letterSpacing: 0,
                    wrap: false, fitText: false });
            case 'gauge':
                return Object.assign(base, { width: 128, height: 24, fill: 'none', gauge: 'hp', index: 0, actorId: 1,
                    variableId: 1, max: 100, maxVariableId: 0, label: '', showLabel: true, showValue: true, valueFormat: 'current',
                    gaugeColor1: '', gaugeColor2: '', gaugeBackColor: '', gaugeHeight: 0 });
            case 'list':
                return Object.assign(base, {
                    width: 320, height: 240, fill: 'window', color: '#000000', color2: '#000000', fillOpacity: 160,
                    vertical: true, borderWidth: 0, borderColor: '#ffffff', radius: 0,
                    text: '', align: 'left', fontSize: 0, textColor: 0, fontFace: '', fontBold: false, fontItalic: false,
                    outline: true, outlineColor: '', outlineWidth: 3, letterSpacing: 0,
                    rowLayout: 'text', portraitSize: 144, actorLayoutVersion: 3, actorPadding: 12, actorGap: 4, actorElements: {}, actorFields: ['portrait', 'name', 'class', 'level', 'hp', 'mp', 'exp', 'states'],
                    dataSource: 'literal', category: 'all', actorMode: 'party', actorId: 1, index: 0, skillTypeId: 0,
                    includeAutosave: false, rangeStart: 1, rangeEnd: 10,
                    items: [{ id: 1, value: 1, text: 'First item', enabled: true }], rowText: '', rowHeight: 36, contextName: 'selection',
                    filterContext: '', compareContext: '', backFocus: 0, columns: 1, focusable: true,
                    selectionVariableId: 0, selectionValue: 'id', action: DatabaseUserInterfaceEditor.defaultAction('none'),
                    enabled: { type: 'always', id: 1, on: true, op: '==', value: 0, script: '' },
                    highlightColor: '#ffffff', focusedFillColor: '', focusedTextColor: '', focusedBorderColor: '', focusedOpacity: '',
                    pressedOffsetX: 0, pressedOffsetY: 0, pressedOpacity: '', disabledFillColor: '', disabledTextColor: '', disabledOpacity: '',
                    focusUp: 0, focusDown: 0, focusLeft: 0, focusRight: 0, se: null
                });
            case 'button':
                return Object.assign(base, {
                    width: 200, height: 48, fill: 'window', color: '#000000', color2: '#000000', fillOpacity: 160, vertical: true,
                    borderWidth: 0, borderColor: '#ffffff', radius: 0,
                    text: 'Button', align: 'center', fontSize: 0, textColor: 0, fontFace: '', fontBold: false, fontItalic: false,
                    outline: true, fitText: false, outlineColor: '', outlineWidth: 3, letterSpacing: 0,
                    action: DatabaseUserInterfaceEditor.defaultAction('close'), backFocus: 0,
                    enabled: { type: 'always', id: 1, on: true, op: '==', value: 0, script: '' },
                    highlightColor: '#ffffff', focusedFillColor: '', focusedTextColor: '', focusedBorderColor: '', focusedOpacity: '',
                    pressedOffsetX: 0, pressedOffsetY: 0, pressedOpacity: '', disabledFillColor: '', disabledTextColor: '', disabledOpacity: '',
                    focusUp: 0, focusDown: 0, focusLeft: 0, focusRight: 0, se: null
                });
            default:
                return base;
        }
    }

    static normalizeActorElements(raw) {
        const result = {};
        const keys = ['portrait','name','class','level','states','atb', ...['hp','mp','tp','exp'].flatMap(k => [k,k+'Label',k+'Value'])];
        keys.push(...Object.keys(raw || {}).filter(key => /^custom_[1-9]\d*$/.test(key)).slice(0,100));
        for (const key of keys) {
            const source = raw && raw[key];
            if (!source || typeof source !== 'object') continue;
            const value = {};
            if (key.startsWith('custom_')) {
                value.kind = ['box','label','value','gauge','image'].includes(source.kind) ? source.kind : 'label';
                value.name = typeof source.name === 'string' ? source.name : '';
                value.gauge = ['hp','mp','tp','exp','atb','mhp','mmp','atk','def','mat','mdf','agi','luk','variable'].includes(source.gauge) ? source.gauge : 'variable';
                for (const prop of ['variableId','maxVariableId','max']) value[prop] = Math.min(999999999,Math.max(0,Number(source[prop]) || (prop==='max'?100:0)));
            }
            for (const prop of ['x','y','width','height','fontSize','corner','thickness','iconSize','iconGap']) {
                if (source[prop] === '' || source[prop] == null || !Number.isFinite(Number(source[prop]))) continue;
                value[prop] = Math.min(9999, Math.max(['x','y'].includes(prop) ? -9999 : ['corner','iconGap'].includes(prop) ? 0 : 1, Number(source[prop])));
            }
            for (const prop of ['color','color2','backColor']) {
                if (/^#[0-9a-f]{6}$/i.test(source[prop])) value[prop] = source[prop];
            }
            if (['left','center','right'].includes(source.align)) value.align = source.align;
            if (['rectangle','rounded','chamfer','circular'].includes(source.shape)) value.shape = source.shape;
            if (['current','currentMax','percent'].includes(source.valueFormat)) value.valueFormat = source.valueFormat;
            if (typeof source.text === 'string') value.text = source.text;
            if (typeof source.visible === 'boolean') value.visible = source.visible;
            for (const prop of ['meterImage','numberImage','file']) if (typeof source[prop] === 'string' && source[prop]) value[prop] = source[prop];
            if (['row','cycle'].includes(source.statesMode)) value.statesMode = source.statesMode;
            if (Number(source.meterRows) === 2) value.meterRows = 2;
            if (typeof source.onlyActive === 'boolean') value.onlyActive = source.onlyActive;
            if (typeof source.behind === 'boolean') value.behind = source.behind;
            if (Number.isFinite(Number(source.rotation)) && source.rotation !== '' && source.rotation != null) value.rotation = Math.max(-60, Math.min(60, Number(source.rotation)));
            result[key] = value;
        }
        return result;
    }

    static actorPanelLayout(node, width, height, fontSize) {
        const fields = new Set(node.actorFields || ['portrait','name','class','level','hp','mp','exp','states']);
        const pad = node.actorPadding ?? 12, gap = node.actorGap ?? 4;
        const size = Math.max(0, Math.min(node.portraitSize || 144, height - pad * 2, (width - pad * 2) / 3));
        const x = pad + (fields.has('portrait') ? size + gap + 8 : 0);
        const w = Math.max(1, width - pad - x);
        const gauges = ['hp','mp','tp','exp'].filter(k => fields.has(k));
        const barHeight = key => node.actorElements?.[key]?.height || 6;
        const barSpace = gauges.reduce((sum,key)=>sum+barHeight(key)+2,0);
        const lines = Number(fields.has('name')) + Number(fields.has('class') || fields.has('level')) + gauges.length;
        const textHeight = Math.max(10, Math.floor(Math.min(fontSize + 8, (height - pad * 2 - gap * Math.max(0,lines-1) - barSpace) / Math.max(1,lines))));
        const textSize = Math.max(8, Math.min(fontSize, textHeight - 8));
        const result = {};
        const add = (key, kind, rect, props = {}) => {
            result[key] = Object.assign({ kind, visible: true, fontSize: textSize, align: 'left', ...rect }, props, node.actorElements?.[key] || {});
        };
        if(fields.has('portrait')) add('portrait','portrait',{x:pad,y:pad,width:size,height:size});
        let y = pad;
        if(fields.has('name')) { add('name','text',{x,y,width:fields.has('states')&&!fields.has('portrait')?Math.max(1,w-160):w,height:textHeight},{text:'{actor.name}'}); y+=textHeight+gap; }
        if(fields.has('class') || fields.has('level')) {
            const levelWidth = Math.min(w / 3, Math.max(64,textSize * 5));
            if(fields.has('class')) add('class','text',{x,y,width:w-(fields.has('level')?levelWidth+gap:0),height:textHeight},{text:'{actor.class}'});
            if(fields.has('level')) add('level','text',{x:x+w-levelWidth,y,width:levelWidth,height:textHeight},{align:'right',text:'{levelLabel} {actor.level}'});
            y+=textHeight+gap;
        }
        for(const key of gauges) {
            const valueWidth = Math.min(w / 2, Math.max(88,textSize * 9));
            add(key+'Label','label',{x,y,width:Math.max(1,w-valueWidth-gap),height:textHeight},{gauge:key,text:''});
            add(key+'Value','value',{x:x+w-valueWidth,y,width:valueWidth,height:textHeight},{gauge:key,align:'right',valueFormat:key==='exp'?'percent':'currentMax'});
            add(key,'gauge',{x,y:y+textHeight+2,width:w,height:barHeight(key)},{gauge:key,shape:'rectangle',corner:4,thickness:8});
            y+=textHeight+barHeight(key)+2+gap;
        }
        if(fields.has('atb')) { add('atb','gauge',{x,y,width:w,height:barHeight('atb')},{gauge:'atb',shape:'rectangle',corner:4,thickness:8}); y+=barHeight('atb')+gap; }
        if(fields.has('states')) add('states','states',{
            x:fields.has('portrait')?pad:Math.max(pad,width-pad-160), y:fields.has('portrait')?pad+size+gap:pad,
            width:fields.has('portrait')?size:160,height:32},{iconSize:28,iconGap:4});
        for(const [key,element] of Object.entries(node.actorElements || {})) {
            if(!/^custom_[1-9]\d*$/.test(key)) continue;
            result[key]=Object.assign({kind:'label',visible:true,x:pad,y:pad,width:160,height:32,fontSize:fontSize,
                align:'left',text:'',shape:'rectangle',corner:4,thickness:8,valueFormat:'current',gauge:'variable',max:100},element);
        }
        return result;
    }

    static actorGaugePath(ctx, rect, shape, corner) {
        const {x,y,width:w,height:h}=rect;
        const c=Math.max(0,Math.min(corner || 0,w/2,h/2));
        ctx.beginPath();
        if(shape==='rounded') {
            ctx.moveTo(x+c,y); ctx.lineTo(x+w-c,y); ctx.quadraticCurveTo(x+w,y,x+w,y+c);
            ctx.lineTo(x+w,y+h-c); ctx.quadraticCurveTo(x+w,y+h,x+w-c,y+h);
            ctx.lineTo(x+c,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-c);
            ctx.lineTo(x,y+c); ctx.quadraticCurveTo(x,y,x+c,y);
        } else if(shape==='chamfer') {
            ctx.moveTo(x+c,y); ctx.lineTo(x+w,y); ctx.lineTo(x+w,y+h-c);
            ctx.lineTo(x+w-c,y+h); ctx.lineTo(x,y+h); ctx.lineTo(x,y+c);
        } else ctx.rect(x,y,w,h);
        ctx.closePath();
    }

    static drawActorGauge(ctx, rect, element, rate, colors) {
        const {x,y,width:w,height:h}=rect;
        rate=Math.max(0,Math.min(1,Number(rate)||0));
        ctx.save();
        const gradient=ctx.createLinearGradient(x,y,x+w,y);
        gradient.addColorStop(0,element.color||colors[0]);gradient.addColorStop(1,element.color2||colors[1]);
        if(element.shape==='circular') {
            const thickness=Math.min(Math.max(1,element.thickness||8),Math.min(w,h)/2);
            const radius=Math.max(0,(Math.min(w,h)-thickness)/2);
            ctx.lineWidth=thickness;ctx.lineCap='butt';
            ctx.beginPath();ctx.arc(x+w/2,y+h/2,radius,0,Math.PI*2);ctx.strokeStyle=element.backColor||colors[2];ctx.stroke();
            if(rate>0) {ctx.beginPath();ctx.arc(x+w/2,y+h/2,radius,-Math.PI/2,-Math.PI/2+Math.PI*2*rate);ctx.strokeStyle=gradient;ctx.stroke();}
        } else {
            this.actorGaugePath(ctx,rect,element.shape,element.corner);ctx.clip();
            ctx.fillStyle=element.backColor||colors[2];ctx.fillRect(x,y,w,h);
            ctx.fillStyle=gradient;ctx.fillRect(x,y,w*rate,h);
        }
        ctx.restore();
    }

    static defaultAction(type = 'none') {
        return { type, id: 1, scene: 'menu', plugin: '', command: '', args: {}, on: true, op: 'set', value: 0, script: '', sceneClass: '', argsExpression: '', actorFirst: false, contextName: 'selection', chooseActor: true, andClose: false };
    }

    static normalizeLiteralItems(raw) {
        if (!Array.isArray(raw)) return [];
        return raw.slice(0, 1000).map((entry, index) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                const value = typeof entry === 'number' || typeof entry === 'string' ? entry : '';
                return { id: index + 1, value, text: String(value), enabled: true };
            }
            const primitive = (value, fallback) => typeof value === 'number' || typeof value === 'string' ? value : fallback;
            return {
                id: primitive(entry.id, index + 1), value: primitive(entry.value, primitive(entry.id, index + 1)),
                text: typeof entry.text === 'string' ? entry.text : String(primitive(entry.value, primitive(entry.id, index + 1))),
                enabled: entry.enabled !== false
            };
        });
    }

    static literalItemsText(items) {
        return DatabaseUserInterfaceEditor.normalizeLiteralItems(items)
            .map(item => `${item.id}|${item.value}|${item.text}${item.enabled ? '' : '|disabled'}`).join('\n');
    }

    static parseLiteralItems(text) {
        const primitive = value => /^-?(?:\d+\.?\d*|\.\d+)$/.test(value.trim()) ? Number(value) : value.trim();
        return String(text || '').split('\n').map(line => line.trim()).filter(Boolean).slice(0, 1000).map((line, index) => {
            const parts = line.split('|');
            if (parts.length < 3) {
                const value = primitive(parts[0]);
                return { id: index + 1, value, text: parts[0].trim(), enabled: true };
            }
            return { id: primitive(parts[0]), value: primitive(parts[1]), text: parts[2].trim(), enabled: parts[3]?.trim().toLowerCase() !== 'disabled' };
        });
    }

    static parseTextColor(value) {
        const text = String(value == null ? '' : value).trim();
        if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase();
        const number = Number(text);
        return Number.isFinite(number) ? Math.min(31, Math.max(0, Math.round(number))) : 0;
    }

    static optionalByte(value) {
        if (value === '' || value == null) return '';
        const number = Number(value);
        return Number.isFinite(number) ? Math.min(255, Math.max(0, Math.round(number))) : '';
    }

    static nineSliceSegments(sw, sh, dw, dh, insets) {
        const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
        const pair = (a, b, total) => {
            a = clamp(a, 0, Math.max(0, total)); b = clamp(b, 0, Math.max(0, total));
            if (a + b > total && a + b > 0) { const scale = total / (a + b); a *= scale; b *= scale; }
            return [a, b];
        };
        sw = Math.max(0, Number(sw) || 0); sh = Math.max(0, Number(sh) || 0);
        dw = Math.max(0, Number(dw) || 0); dh = Math.max(0, Number(dh) || 0);
        const [sl, sr] = pair(insets && insets.left, insets && insets.right, sw);
        const [st, sb] = pair(insets && insets.top, insets && insets.bottom, sh);
        const [dl, dr] = pair(sl, sr, dw), [dt, db] = pair(st, sb, dh);
        const sx = [0, sl, sw - sr], sy = [0, st, sh - sb], dx = [0, dl, dw - dr], dy = [0, dt, dh - db];
        const widths = [[sl, Math.max(0, sw - sl - sr), sr], [dl, Math.max(0, dw - dl - dr), dr]];
        const heights = [[st, Math.max(0, sh - st - sb), sb], [dt, Math.max(0, dh - dt - db), db]];
        const segments = [];
        for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
            const part = { sx: sx[column], sy: sy[row], sw: widths[0][column], sh: heights[0][row],
                dx: dx[column], dy: dy[row], dw: widths[1][column], dh: heights[1][row] };
            if (part.sw > 0 && part.sh > 0 && part.dw > 0 && part.dh > 0) segments.push(part);
        }
        return segments;
    }

    static upgradeMenuActorPanel(entry) {
        const nodes = Array.isArray(entry.nodes) ? entry.nodes : [];
        if (entry.stock !== 'menu' || nodes.some(node => node.rowLayout === 'actorPanel')) return nodes;
        const party = nodes.find(node => node.type === 'box' && node.name === 'Party');
        if (!party) return nodes;
        const legacyNames = ['Party members', 'Selected face', 'Selected name', 'Selected level and class', 'Selected HP', 'Selected MP', 'Selected EXP'];
        const panel = Object.assign({}, party, { type: 'list', name: 'Actor Panel', dataSource: 'party',
            rowLayout: 'actorPanel', rowHeight: 256, portraitSize: 144,
            actorFields: ['portrait', 'name', 'class', 'level', 'hp', 'mp', 'exp', 'states'], contextName: 'selectedActor' });
        return nodes.filter(node => node.parent !== party.id || !legacyNames.includes(node.name))
            .map(node => node === party ? panel : node);
    }

    static upgradeMenuFormation(entry, enabled, label) {
        const nodes=Array.isArray(entry.nodes)?entry.nodes:[];
        if(entry.stock!=='menu' || entry.menuCommandVersion>=2 || !enabled || nodes.some(n=>n.action?.type==='formation')) return nodes;
        const status=nodes.find(n=>n.type==='button' && n.action?.type==='personalStatus');
        const parent=nodes.find(n=>n.id===status?.parent && n.name==='Commands');
        if(!status || !parent) return nodes;
        const id=Math.max(0,...nodes.map(n=>n.id))+1;
        const button={...status,id,name:'Formation',text:label||'Formation',labelScript:'',y:status.y+status.height,
            action:{type:'formation',contextName:'selectedActor'},
            enabled:{type:'script',script:'$gameParty.size() > 1 && $gameSystem.isFormationEnabled()'},
            focusUp:0,focusDown:0,focusLeft:0,focusRight:0};
        return nodes.flatMap(n=>n===status?[n,button]:[{...n,...(n.parent===parent.id && n.y>=button.y?{y:n.y+button.height}:{})}]);
    }

    /** Fills in whatever an older or hand-edited record is missing, in place. */
    normalizeInterface(entry) {
        if (!entry || typeof entry !== 'object') return entry;
        entry.nodes = DatabaseUserInterfaceEditor.upgradeMenuActorPanel(entry);
        const system=this.databaseManager?.data?.system || {};
        entry.nodes=DatabaseUserInterfaceEditor.upgradeMenuFormation(entry,system.menuCommands?.[4]!==false,system.terms?.commands?.[8]);
        entry.menuCommandVersion=2;
        const legacyCoordinates = entry.coordinateSpace !== 'screen';
        if (typeof entry.name !== 'string') entry.name = '';
        if (!['scene', 'overlay', 'battle'].includes(entry.mode)) entry.mode = 'scene';
        entry.hideStatusWindow = entry.hideStatusWindow !== false;
        if (!['blur', 'dim', 'none'].includes(entry.background)) entry.background = 'blur';
        entry.visible = Object.assign({ type: 'always', id: 1, on: true, op: '==', value: 0, script: '' }, entry.visible || {});
        entry.cancel = Object.assign(DatabaseUserInterfaceEditor.defaultAction('close'), entry.cancel && typeof entry.cancel === 'object' ? entry.cancel : {});
        if (!Number.isInteger(entry.firstFocus)) entry.firstFocus = 0;
        if (!['none', 'fade', 'slideLeft', 'slideUp'].includes(entry.openTransition)) entry.openTransition = 'none';
        if (!['none', 'fade', 'slideLeft', 'slideUp'].includes(entry.closeTransition)) entry.closeTransition = 'none';
        entry.transitionDuration = Math.min(120, Math.max(1, Math.round(Number(entry.transitionDuration) || 18)));
        if (!Array.isArray(entry.nodes)) entry.nodes = [];
        if (typeof entry.note !== 'string') entry.note = '';
        if (!Array.isArray(entry.roles)) entry.roles = entry.stock ? [entry.stock] : [];
        entry.roles = [...new Set(entry.roles.filter(role => DatabaseUserInterfaceEditor.REPLACEMENT_ROLES.some(definition => definition[0] === role)))];
        const seen = new Set();
        entry.nodes = entry.nodes.filter(node => node && typeof node === 'object').map(node => {
            const type = DatabaseUserInterfaceEditor.NODE_TYPES.includes(node.type) ? node.type : 'box';
            let id = Number.isInteger(node.id) && node.id > 0 ? node.id : 0;
            if (!id || seen.has(id)) id = this.nextNodeId(entry, seen);
            seen.add(id);
            const merged = Object.assign(DatabaseUserInterfaceEditor.defaultNode(type, id), node, { id, type });
            merged.fontFace = typeof merged.fontFace === 'string' ? merged.fontFace : '';
            merged.fontBold = !!merged.fontBold;
            merged.fontItalic = !!merged.fontItalic;
            merged.outlineColor = /^#[0-9a-f]{6}$/i.test(merged.outlineColor || '') ? merged.outlineColor : '';
            merged.outlineWidth = merged.outline === false ? 0 : Math.min(32, Math.max(0, Math.round(Number(merged.outlineWidth)) || 0));
            merged.letterSpacing = Math.min(100, Math.max(-20, Math.round(Number(merged.letterSpacing) || 0)));
            if (!DatabaseUserInterfaceEditor.ACTOR_SOURCES.includes(node.actorSource)) merged.actorSource = node.actorMode === 'actor' ? 'actorId' : 'partySlot';
            if (!merged.actorContextName) merged.actorContextName = 'selection';
            merged.visible = Object.assign({ type: 'always', id: 1, on: true, op: '==', value: 0, script: '' }, merged.visible || {});
            if (type === 'input') {
                if (!['variable', 'actorName', 'actorNickname'].includes(merged.inputTarget)) merged.inputTarget = 'variable';
                merged.maxLength = Math.min(99, Math.max(1, Math.round(Number(merged.maxLength)) || 16));
                merged.variableId = Math.max(1, Math.floor(Number(merged.variableId)) || 1);
                merged.mask = !!merged.mask;
                merged.onScreenKeys = !!merged.onScreenKeys;
                merged.autoEdit = !!merged.autoEdit;
            }
            if (DatabaseUserInterfaceEditor.isControl(type)) {
                merged.action = Object.assign(DatabaseUserInterfaceEditor.defaultAction(type === 'button' ? 'close' : 'none'), merged.action || {});
                if (!merged.action.contextName) merged.action.contextName = 'selection';
                merged.enabled = Object.assign({ type: 'always', id: 1, on: true, op: '==', value: 0, script: '' }, merged.enabled || {});
                for (const key of ['focusedFillColor', 'focusedTextColor', 'focusedBorderColor', 'disabledFillColor', 'disabledTextColor']) {
                    if (!/^#[0-9a-f]{6}$/i.test(merged[key] || '')) merged[key] = '';
                }
                for (const key of ['focusedOpacity', 'pressedOpacity', 'disabledOpacity']) merged[key] = DatabaseUserInterfaceEditor.optionalByte(merged[key]);
                merged.pressedOffsetX = Math.min(32, Math.max(-32, Math.round(Number(merged.pressedOffsetX) || 0)));
                merged.pressedOffsetY = Math.min(32, Math.max(-32, Math.round(Number(merged.pressedOffsetY) || 0)));
            }
            if (type === 'image') {
                merged.nineSlice = !!merged.nineSlice && (merged.source === 'picture' || merged.source === 'system');
                for (const key of ['sliceLeft', 'sliceTop', 'sliceRight', 'sliceBottom']) merged[key] = Math.min(9999, Math.max(0, Math.round(Number(merged[key]) || 0)));
            }
            if (type === 'list') {
                merged.items = DatabaseUserInterfaceEditor.normalizeLiteralItems(merged.items);
                if (!DatabaseUserInterfaceEditor.LIST_SOURCES.includes(merged.dataSource)) merged.dataSource = 'literal';
                merged.filterContext = typeof merged.filterContext === 'string' ? merged.filterContext.trim() : '';
                merged.compareContext = typeof merged.compareContext === 'string' ? merged.compareContext.trim() : '';
                merged.columns = Math.min(12, Math.max(1, Math.round(Number(merged.columns)) || 1));
                merged.focusable = merged.focusable !== false;
                if (!merged.contextName) merged.contextName = 'selection';
                merged.rowLayout = node.rowLayout === 'actorPanel' ? 'actorPanel' : 'text';
                merged.portraitSize = Math.min(144, Math.max(32, Number(merged.portraitSize) || 144));
                merged.actorPadding = Math.min(200, Math.max(0, Number(merged.actorPadding) || 0));
                merged.actorGap = Math.min(200, Math.max(0, Number(merged.actorGap) || 0));
                merged.actorElements = DatabaseUserInterfaceEditor.normalizeActorElements(merged.actorElements);
                if (merged.rowLayout==='actorPanel' && !node.actorLayoutVersion && node.rowHeight===192) merged.rowHeight=256;
                merged.actorLayoutVersion=3;
                merged.actorFields = Array.isArray(merged.actorFields) ? merged.actorFields.filter(key => ['portrait','name','class','level','hp','mp','tp','exp','states','atb'].includes(key)) : ['portrait','name','class','level','hp','mp','exp','states'];
                if (merged.rowLayout === 'actorPanel') {
                    merged.dataSource = 'party';
                    if ((node.actorLayoutVersion || 0)<3 && !merged.actorFields.includes('states')) merged.actorFields.push('states');
                }
            }
            if (type === 'gauge') {
                if (!['current', 'currentMax', 'percent', 'hidden'].includes(node.valueFormat)) merged.valueFormat = merged.showValue === false ? 'hidden' : 'current';
                merged.showValue = merged.valueFormat !== 'hidden';
            }
            return merged;
        });
        const controls = new Set(entry.nodes.filter(node => DatabaseUserInterfaceEditor.isControl(node.type)).map(node => node.id));
        for (const node of entry.nodes) {
            if (!DatabaseUserInterfaceEditor.isControl(node.type)) continue;
            for (const key of ['focusUp', 'focusDown', 'focusLeft', 'focusRight', 'backFocus']) {
                const target = Math.max(0, Math.floor(Number(node[key]) || 0));
                node[key] = target !== node.id && controls.has(target) ? target : 0;
            }
        }
        if (legacyCoordinates) {
            const metrics = this.screenMetrics();
            const ids = new Set(entry.nodes.map(node => node.id));
            for (const node of entry.nodes) {
                if (node.parent > 0 && ids.has(node.parent)) continue;
                const [ax, ay] = DatabaseUserInterfaceEditor.ANCHORS[node.anchor] || [0, 0];
                node.x += Math.round(metrics.boxX + metrics.boxWidth * ax - metrics.width * ax);
                node.y += Math.round(metrics.boxY + metrics.boxHeight * ay - metrics.height * ay);
            }
        }
        entry.coordinateSpace = 'screen';
        entry.nodes = DatabaseUserInterfaceEditor.orderNodes(entry.nodes);
        return entry;
    }

    nextNodeId(entry, extra) {
        let id = 1;
        const used = new Set((entry.nodes || []).map(node => node && node.id));
        if (extra) for (const value of extra) used.add(value);
        while (used.has(id)) id++;
        return id;
    }

    /** Capture imports allocate a contiguous range above every existing ID. */
    nextCaptureNodeId() {
        return Math.max(0, ...(this.current && this.current.nodes || []).map(node => Number(node && node.id) || 0)) + 1;
    }

    // ==========================================
    // MAIN ENTRY
    // ==========================================

    showUserInterfaceDetail(container, entry) {
        const tt = text => this._t(text);
        this.detach();
        this.current = this.normalizeInterface(entry);
        this.selectedId = 0;
        this.selectedIds = new Set();
        this.selectionAnchor = 0;
        this.undoStack = [];
        this.redoStack = [];
        this.drag = null;
        this._controlPreviewState = 'automatic';
        this.container = container;
        this.skin = null;
        this.images.clear();

        const wrapper = document.createElement('div');
        wrapper.className = 'rr-ui-editor';
        wrapper.innerHTML = `
            <div class="rr-ui-toolbar" role="toolbar" aria-label="${tt('Interface')}">
                <label class="rr-ui-toolbar-field rr-ui-toolbar-name"><span>${tt('Name')}</span>
                    <input type="text" class="database-field-value" data-field="name" value="${this.escapeHTML(entry.name)}">
                </label>
                <label class="rr-ui-toolbar-field rr-ui-toolbar-presentation"><span>${tt('Presentation')}</span>
                    <select class="database-field-value rr-ui-mode">
                        <option value="scene">${tt('Focused scene')}</option>
                        <option value="overlay">${tt('Map overlay / HUD')}</option>
                        <option value="battle">${tt('Battle HUD')}</option>
                    </select>
                </label>
                <div class="rr-ui-toolbar-field rr-ui-replacements"><span>${tt('Use As')}</span>
                    <div class="rr-ui-replacement-controls">${this.replacementRoleMarkup()}</div>
                </div>
                <button type="button" class="rr-btn-chip rr-ui-interface-settings">${tt('Interface Settings')}</button>
                <button type="button" class="rr-button-primary rr-ui-playtest">${tt('Playtest')}</button>
            </div>
            <div class="rr-ui-workspace">
                <div class="database-section rr-ui-tree-panel">
                    <div class="database-section-header">${tt('Layers')}</div>
                    <div class="database-section-content">
                        <details class="rr-ui-add-menu">
                            <summary class="rr-btn-chip">${tt('+ Add Node')}</summary>
                            <div class="rr-ui-add-menu-items" role="menu" aria-label="${tt('Add Node')}">
                                ${[...DatabaseUserInterfaceEditor.NODE_TYPES, 'actorPanel'].map(type => `<button type="button" role="menuitem" data-add="${type}">${this.typeLabel(type)}</button>`).join('')}
                            </div>
                        </details>
                        <details class="rr-ui-add-menu rr-ui-stock-menu">
                            <summary class="rr-btn-chip" title="${this.escapeHTML(tt('Replace the layers with the layout and workflow of a stock screen.'))}">${tt('Stock Layout')}</summary>
                            <div class="rr-ui-add-menu-items" role="menu" aria-label="${this.escapeHTML(tt('Stock Layout'))}">
                                ${this.stockLayoutKinds().map(([kind, label]) => `<button type="button" role="menuitem" data-stock-layout="${kind}">${this.escapeHTML(label)}</button>`).join('')}
                            </div>
                        </details>
                        <div class="rr-ui-layer-endpoint">${tt('Back')}</div>
                        <div class="rr-ui-tree" tabindex="-1"></div>
                        <div class="rr-ui-layer-endpoint rr-ui-layer-front">${tt('Front')}</div>
                        <div class="rr-ui-tree-buttons">
                            <button type="button" class="rr-btn-chip rr-ui-send-back" aria-label="${tt('Send to Back')}" title="${tt('Send to Back')}">${tt('To Back')}</button>
                            <button type="button" class="rr-btn-chip rr-ui-node-up" aria-label="${tt('Move Backward')}" title="${tt('Move Backward')}">${tt('Back 1')}</button>
                            <button type="button" class="rr-btn-chip rr-ui-node-down" aria-label="${tt('Move Forward')}" title="${tt('Move Forward')}">${tt('Forward 1')}</button>
                            <button type="button" class="rr-btn-chip rr-ui-bring-front" aria-label="${tt('Bring to Front')}" title="${tt('Bring to Front')}">${tt('To Front')}</button>
                            <button type="button" class="rr-btn-chip rr-ui-node-duplicate">${tt('Duplicate')}</button>
                            <button type="button" class="rr-btn-chip rr-ui-node-delete">${tt('Delete')}</button>
                        </div>
                        <div class="rr-ui-tree-hint">${tt('Parents draw before their children. Later rows draw on top.')}</div>
                        <details class="rr-ui-game-reference">
                            <summary>${tt('Game Reference')}</summary>
                            <div class="rr-ui-capture-row">
                                <select class="database-field-value rr-ui-capture-scene" aria-label="${tt('Game scene')}">${this.captureSceneOptions()}</select>
                                <button type="button" class="rr-btn-chip rr-ui-capture">${tt('Capture')}</button>
                                <button type="button" class="rr-btn-chip rr-ui-capture-clear" hidden title="${tt('Remove the reference layer')}">${tt('Clear')}</button>
                            </div>
                            <div class="rr-ui-capture-status" aria-live="polite"></div>
                            <div class="rr-ui-capture-list"></div>
                        </details>
                    </div>
                </div>
                <div class="database-section rr-ui-canvas-panel">
                    <div class="database-section-header rr-ui-canvas-header">
                        <span>${tt('Layout')}</span>
                        <span class="rr-ui-canvas-tools">
                            <label><input type="checkbox" class="rr-ui-snap" checked> ${tt('Snap')}</label>
                            <label><input type="checkbox" class="rr-ui-grid" checked> ${tt('Grid')}</label>
                            <label class="rr-ui-reference-tools" hidden><input type="checkbox" class="rr-ui-reference" checked> ${tt('Reference')}
                                <span class="rr-ui-reference-opacity-wrap"><input type="range" class="rr-ui-reference-opacity" min="10" max="100" value="60" title="${tt('Reference opacity')}"></span></label>
                            <button type="button" class="rr-btn-chip rr-ui-undo" title="Ctrl+Z">${tt('Undo')}</button>
                            <button type="button" class="rr-btn-chip rr-ui-redo" title="Ctrl+Y">${tt('Redo')}</button>
                            <label>${tt('Zoom')} <select class="rr-ui-zoom" aria-label="${tt('Interface zoom')}">
                                <option value="0">${tt('Fit')}</option>
                                ${[0.5, 1, 2, 3, 4, 6, 8].map(zoom => `<option value="${zoom}" ${this.previewZoom === zoom ? 'selected' : ''}>${zoom * 100}%</option>`).join('')}
                            </select></label>
                            <label title="${this.escapeHTML(tt('How many actors the canvas shows in party lists. Editor only: the game shows the real party.'))}">${tt('Preview party')}
                                <select class="rr-ui-preview-party" aria-label="${tt('Preview party')}">
                                    <option value="0">${tt('Auto')}</option>
                                    ${[1, 2, 3, 4, 5, 6, 7, 8].map(count => `<option value="${count}" ${Number(entry.previewPartySize) === count ? 'selected' : ''}>${count}</option>`).join('')}
                                </select></label><span class="rr-ui-size"></span>
                        </span>
                    </div>
                    <div class="database-section-content rr-ui-canvas-host">
                        <canvas class="rr-ui-canvas" tabindex="0"></canvas>
                    </div>
                </div>
                <div class="database-section rr-ui-props-panel">
                    <div class="database-section-header rr-ui-inspector-header"><span class="rr-ui-inspector-title">${tt('Interface Settings')}</span>
                        <button type="button" class="rr-ui-inspector-close" aria-label="${tt('Close Inspector')}" title="${tt('Close Inspector')}">×</button>
                    </div>
                    <div class="database-section-content rr-ui-props"></div>
                </div>
            </div>`;
        container.appendChild(wrapper);
        this.wrapper = wrapper;
        this.canvas = wrapper.querySelector('.rr-ui-canvas');
        wrapper.querySelector('.rr-ui-zoom').addEventListener('change', event => {
            this.previewZoom = Number(event.target.value) || 0;
            this.fitCanvas();
            this.scheduleRender();
        });
        wrapper.querySelector('.rr-ui-preview-party').addEventListener('change', event => {
            const count = Math.max(0, Math.min(8, Number(event.target.value) || 0));
            if (count) this.current.previewPartySize = count; else delete this.current.previewPartySize;
            this.touch();
            this.scheduleRender();
        });
        this.ctx = this.canvas.getContext('2d');

        wrapper.querySelector('.rr-ui-mode').value = entry.mode;
        this.reference = null;
        this.showReference = true;
        this.referenceOpacity = 0.6;
        this.capturedSelection = -1;
        this.captureStatus('');
        this.renderTree();
        this.renderProperties();
        this.refreshFirstFocus();
        this.updatePresentationFields();
        this.attachListeners();
        this.loadSkin();
        this.loadGameFont();
        this.fitCanvas();
        this.scheduleRender();
    }

    screenMetrics() {
        const system = this.databaseManager && this.databaseManager.data ? this.databaseManager.data.system : null;
        const advanced = system && system.advanced ? system.advanced : {};
        const width = Number(advanced.screenWidth) || 816;
        const height = Number(advanced.screenHeight) || 624;
        const boxWidth = Number(advanced.uiAreaWidth) || width;
        const boxHeight = Number(advanced.uiAreaHeight) || height;
        return {
            width, height, boxWidth, boxHeight,
            boxX: Math.floor((width - boxWidth) / 2),
            boxY: Math.floor((height - boxHeight) / 2)
        };
    }

    screenSize() {
        const { width, height } = this.screenMetrics();
        return { width, height };
    }

    touch() {
        if (this.databaseManager) this.databaseManager.mutationGeneration = (this.databaseManager.mutationGeneration || 0) + 1;
    }

    updatePresentationFields() {
        if (!this.wrapper) return;
        // A battle HUD, like a map overlay, never takes focus: the stock battle windows do.
        const overlay = this.current.mode === 'overlay' || this.current.mode === 'battle';
        this.wrapper.querySelectorAll('.rr-ui-scene-setting').forEach(element => { element.hidden = overlay; });
        this.wrapper.querySelectorAll('.rr-ui-overlay-setting').forEach(element => { element.hidden = !overlay; });
        this.wrapper.querySelectorAll('.rr-ui-battle-setting').forEach(element => { element.hidden = this.current.mode !== 'battle'; });
        this.refreshReplacementControls();
    }

    replacementSystem() {
        return this.databaseManager && this.databaseManager.getSystem ? this.databaseManager.getSystem()
            : this.databaseManager && this.databaseManager.data ? this.databaseManager.data.system : null;
    }

    /** A role fits a record's presentation: Battle takes a Battle HUD, every other role a focused scene. */
    roleFitsMode(role) {
        const mode = this.current ? this.current.mode : 'scene';
        return role === 'battle' ? mode === 'battle' : mode === 'scene';
    }

    replacementRoleMarkup() {
        const system = this.replacementSystem() || {};
        const id = Number(this.current && this.current.id) || 0;
        const assignedRoles = this.assignedReplacementRoles();
        const assigned = new Set(assignedRoles);
        const overlay = this.current && this.current.mode === 'overlay';
        const customLabel = overlay ? `${this._t('Custom')} / ${this._t('Overlay')}` : this._t('Custom');
        const value = overlay ? customLabel + (assignedRoles.length ? ` · ${assignedRoles.length} ${this._t('roles')}` : '')
            : assignedRoles.length === 0 ? customLabel : assignedRoles.length === 1
                ? this._t(DatabaseUserInterfaceEditor.REPLACEMENT_ROLES.find(entry => entry[0] === assignedRoles[0])[1])
                : `${assignedRoles.length} ${this._t('roles')}`;
        const listId = `rr-ui-role-list-${id || 'new'}`;
        const controls = DatabaseUserInterfaceEditor.REPLACEMENT_ROLES.map(([role, label, field], index) => {
            const assigned = id > 0 && Number(system[field]) === id;
            const disabled = !this.roleFitsMode(role) && !assigned;
            return `<div id="${listId}-${index + 1}" class="rr-ui-role-option" role="option" aria-selected="${assigned}"${disabled ? ' aria-disabled="true"' : ''}
                data-replacement-role="${role}" data-role-label="${this.escapeHTML(this._t(label))}" tabindex="-1">
                <span class="rr-ui-role-check" aria-hidden="true">${assigned ? '✓' : ''}</span><span>${this._t(label)}</span>
            </div>`;
        }).join('');
        return `<div class="rr-ui-role-combobox">
            <button type="button" class="rr-ui-role-trigger" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="${listId}">
                <span class="rr-ui-role-value" title="${this.escapeHTML(value)}">${this.escapeHTML(value)}</span><span aria-hidden="true">▾</span>
            </button>
            <div class="rr-ui-role-popup" hidden>
                <input type="search" class="rr-ui-role-search" aria-label="${this._t('Search roles')}" placeholder="${this._t('Search roles')}">
                <div id="${listId}" class="rr-ui-role-list" role="listbox" aria-multiselectable="true">
                    <div id="${listId}-0" class="rr-ui-role-option rr-ui-role-custom" role="option" aria-selected="${assigned.size === 0}"
                        data-replacement-custom="true" data-role-label="${this.escapeHTML(customLabel)}" tabindex="-1">
                        <span class="rr-ui-role-check" aria-hidden="true">${assigned.size === 0 ? '✓' : ''}</span><span>${this.escapeHTML(customLabel)}</span>
                    </div>${controls}
                </div>
                <div class="rr-ui-role-note">${overlay ? this._t('Overlays cannot replace System scenes. Existing assignments can be cleared.') : this._t('Custom clears this interface from System replacements.')}</div>
            </div>
        </div>`;
    }

    assignedReplacementRoles() {
        const system = this.replacementSystem() || {};
        const id = Number(this.current && this.current.id) || 0;
        if (!(id > 0)) return [];
        return DatabaseUserInterfaceEditor.REPLACEMENT_ROLES
            .filter(([, , field]) => Number(system[field]) === id).map(([role]) => role);
    }

    refreshReplacementControls() {
        if (!this.wrapper) return;
        const host = this.wrapper.querySelector('.rr-ui-replacement-controls');
        if (host) host.innerHTML = this.replacementRoleMarkup();
    }

    clearReplacementRoles() {
        const system = this.replacementSystem();
        const id = Number(this.current && this.current.id) || 0;
        if (!system || !(id > 0)) return false;
        let changed = false;
        for (const [, , field] of DatabaseUserInterfaceEditor.REPLACEMENT_ROLES) {
            if (Number(system[field]) === id) {
                system[field] = 0;
                changed = true;
            }
        }
        if (changed) this.touch();
        return changed;
    }

    openReplacementRoles(open = true) {
        const trigger = this.wrapper && this.wrapper.querySelector('.rr-ui-role-trigger');
        const popup = this.wrapper && this.wrapper.querySelector('.rr-ui-role-popup');
        if (!trigger || !popup) return;
        popup.hidden = !open;
        trigger.setAttribute('aria-expanded', String(open));
        if (open) {
            this._roleActiveIndex = 0;
            const search = popup.querySelector('.rr-ui-role-search');
            search.value = '';
            this.filterReplacementRoles('');
            search.focus({ preventScroll: true });
        }
    }

    filterReplacementRoles(query) {
        const popup = this.wrapper && this.wrapper.querySelector('.rr-ui-role-popup');
        if (!popup) return [];
        const needle = String(query || '').toLocaleLowerCase();
        const options = [...popup.querySelectorAll('.rr-ui-role-option')];
        for (const option of options) {
            const label = String(option.dataset.roleLabel || '').toLocaleLowerCase();
            option.hidden = !!needle && !label.includes(needle);
            option.classList.remove('is-active');
        }
        const visible = options.filter(option => !option.hidden);
        this._roleActiveIndex = Math.min(this._roleActiveIndex, Math.max(0, visible.length - 1));
        if (visible[this._roleActiveIndex]) visible[this._roleActiveIndex].classList.add('is-active');
        const search = popup.querySelector('.rr-ui-role-search');
        if (search) {
            const active = visible[this._roleActiveIndex];
            if (active) search.setAttribute('aria-activedescendant', active.id);
            else search.removeAttribute('aria-activedescendant');
        }
        return visible;
    }

    toggleReplacementOption(option) {
        if (!option || option.getAttribute('aria-disabled') === 'true') return false;
        if (option.dataset.replacementCustom) this.clearReplacementRoles();
        else {
            const assigned = option.getAttribute('aria-selected') === 'true';
            if (!this.setReplacementRole(option.dataset.replacementRole, !assigned)) return false;
        }
        this.refreshReplacementControls();
        this.openReplacementRoles(true);
        return true;
    }

    setReplacementRole(role, assigned) {
        const definition = DatabaseUserInterfaceEditor.REPLACEMENT_ROLES.find(entry => entry[0] === role);
        const system = this.replacementSystem();
        const id = Number(this.current && this.current.id) || 0;
        if (!definition || !system || !(id > 0)) return false;
        const field = definition[2];
        if (assigned) {
            if (!this.roleFitsMode(role)) return false;
            if (!Array.isArray(this.current.roles)) this.current.roles = [];
            if (!this.current.roles.includes(role)) this.current.roles.push(role);
            system[field] = id;
        } else if (Number(system[field]) === id) {
            system[field] = 0;
        } else {
            return false;
        }
        this.touch();
        return true;
    }

    /** Every stock screen a record can start from, as [kind, label]. */
    stockLayoutKinds() {
        const stock = typeof RRStockInterfaces !== 'undefined' ? RRStockInterfaces : null;
        if (!stock) return [];
        const labels = Object.fromEntries(DatabaseUserInterfaceEditor.REPLACEMENT_ROLES.map(([role, label]) => [role, label]));
        return stock.KINDS.map(kind => [kind, this._t(labels[kind] || kind)]);
    }

    /**
     * Replace this record's layers with a stock screen's generated layout and
     * mark it compatible with that role. Undo restores the layers; the role
     * stays offered in Use As, and nothing is bound in System until chosen there.
     */
    applyStockLayout(kind) {
        const stock = typeof RRStockInterfaces !== 'undefined' ? RRStockInterfaces : null;
        const built = stock && stock.buildOne(kind, (this.databaseManager && this.databaseManager.data) || {});
        if (!built || !this.current) return false;
        const label = (this.stockLayoutKinds().find(entry => entry[0] === kind) || [kind, kind])[1];
        if (this.current.nodes.length && typeof window !== 'undefined' && window.confirm
            && !window.confirm(this._t('Replace every layer with the {name} layout?').replace('{name}', label))) return false;
        this.pushUndo();
        const normalized = this.normalizeInterface(Object.assign({}, built, { id: this.current.id }));
        this.current.nodes = normalized.nodes;
        this.current.firstFocus = normalized.firstFocus;
        this.current.cancel = normalized.cancel;
        this.current.background = normalized.background;
        this.current.mode = normalized.mode;
        this.current.hideStatusWindow = normalized.hideStatusWindow;
        this.current.openTransition = normalized.openTransition;
        this.current.transitionDuration = normalized.transitionDuration;
        this.current.stock = kind;
        this.current.roles = Array.from(new Set([...(this.current.roles || []), kind]));
        if (!this.current.name) {
            this.current.name = label;
            const field = this.wrapper && this.wrapper.querySelector('[data-field="name"]');
            if (field) field.value = label;
        }
        if (!this.current.note) this.current.note = normalized.note;
        const mode = this.wrapper && this.wrapper.querySelector('.rr-ui-mode');
        if (mode) mode.value = this.current.mode;
        this.updatePresentationFields();
        this.selectedId = 0;
        this.selectedIds = new Set();
        this.touch();
        this.refreshFirstFocus();
        this.renderTree();
        this.renderProperties();
        if (this.refreshReplacementControls) this.refreshReplacementControls();
        this.scheduleRender();
        return true;
    }

    // ==========================================
    // UNDO
    // ==========================================

    snapshot() {
        return JSON.stringify({ nodes: this.current.nodes, firstFocus: this.current.firstFocus });
    }

    pushUndo() {
        this.undoStack.push(this.snapshot());
        if (this.undoStack.length > 100) this.undoStack.shift();
        this.redoStack = [];
    }

    restore(serialized) {
        const parsed = JSON.parse(serialized);
        this.current.nodes = parsed.nodes;
        this.current.firstFocus = parsed.firstFocus;
        this.selectedIds = new Set(this.selectedNodes().map(node => node.id));
        if (!this.node(this.selectedId)) this.selectedId = [...this.selectedIds][0] || 0;
        this.touch();
        this.refreshFirstFocus();
        this.renderTree();
        this.renderProperties();
        this.scheduleRender();
    }

    undo() {
        if (!this.undoStack.length) return;
        this.redoStack.push(this.snapshot());
        this.restore(this.undoStack.pop());
    }

    redo() {
        if (!this.redoStack.length) return;
        this.undoStack.push(this.snapshot());
        this.restore(this.redoStack.pop());
    }

    // ==========================================
    // NODES
    // ==========================================

    node(id) {
        return this.current.nodes.find(node => node.id === id) || null;
    }

    selected() {
        return this.node(this.selectedId);
    }

    selectedNodes() {
        const ids = this.selectedIds?.size ? this.selectedIds : new Set([this.selectedId]);
        return DatabaseUserInterfaceEditor.orderNodes(this.current.nodes).filter(node => ids.has(node.id));
    }

    selectionRoots() {
        const nodes = this.selectedNodes(), ids = new Set(nodes.map(node => node.id));
        return nodes.filter(node => {
            const visited = new Set([node.id]);
            let parent = this.node(node.parent);
            while (parent && !visited.has(parent.id)) {
                if (ids.has(parent.id)) return false;
                visited.add(parent.id);
                parent = this.node(parent.parent);
            }
            return true;
        });
    }

    selectionBounds() {
        const rects = this.rects();
        const selected = this.selectedNodes().map(node => rects.get(node.id)).filter(Boolean);
        return { x: Math.min(...selected.map(rect => rect.x)), y: Math.min(...selected.map(rect => rect.y)) };
    }

    translateSelection(dx, dy, origins = this.selectionRoots().map(node => ({ node, x: node.x, y: node.y }))) {
        for (const origin of origins) {
            origin.node.x = origin.x + dx;
            origin.node.y = origin.y + dy;
        }
    }

    select(id, { toggle = false, range = false } = {}) {
        if (!this.selectedIds) this.selectedIds = new Set();
        if (range && this.selectionAnchor && id) {
            const ids = DatabaseUserInterfaceEditor.orderNodes(this.current.nodes).map(node => node.id);
            const a = ids.indexOf(this.selectionAnchor), b = ids.indexOf(id);
            if (!toggle) this.selectedIds.clear();
            for (const selectedId of ids.slice(Math.min(a, b), Math.max(a, b) + 1)) this.selectedIds.add(selectedId);
        } else if (toggle && id) {
            if (this.selectedIds.has(id)) this.selectedIds.delete(id);
            else this.selectedIds.add(id);
            this.selectionAnchor = id;
        } else {
            this.selectedIds = new Set(id ? [id] : []);
            this.selectionAnchor = id;
        }
        this.selectedId = this.selectedIds.has(id) ? id : [...this.selectedIds].at(-1) || 0;
        const inspector = this.wrapper && this.wrapper.querySelector('.rr-ui-props-panel');
        if (inspector) inspector.classList.add('is-open');
        this.renderTree();
        this.renderProperties();
        this.scheduleRender();
    }

    addNode(type) {
        this.pushUndo();
        const node = DatabaseUserInterfaceEditor.defaultNode(type, this.nextNodeId(this.current));
        const screen = this.screenSize();
        const selected = this.selected();
        if (selected && (selected.type === 'box' || selected.type === 'image')) {
            node.parent = selected.id;
            node.x = 16;
            node.y = 16;
        } else {
            node.x = Math.round((screen.width - node.width) / 2 / 8) * 8;
            node.y = Math.round((screen.height - node.height) / 2 / 8) * 8;
        }
        this.current.nodes.push(node);
        this.touch();
        this.refreshFirstFocus();
        this.select(node.id);
        return node;
    }

    deleteNode(id) {
        const node = this.node(id);
        if (!node) return;
        this.pushUndo();
        const doomed = new Set(this.selectedIds?.has(id) ? this.selectedNodes().map(node => node.id) : [id]);
        let grew = true;
        while (grew) {
            grew = false;
            for (const candidate of this.current.nodes) {
                if (!doomed.has(candidate.id) && doomed.has(candidate.parent)) {
                    doomed.add(candidate.id);
                    grew = true;
                }
            }
        }
        this.current.nodes = this.current.nodes.filter(candidate => !doomed.has(candidate.id));
        for (const candidate of this.current.nodes) {
            for (const key of ['focusUp', 'focusDown', 'focusLeft', 'focusRight', 'backFocus']) {
                if (doomed.has(candidate[key])) candidate[key] = 0;
            }
            if (candidate.action && ['focusNode', 'equip'].includes(candidate.action.type) && doomed.has(candidate.action.id)) candidate.action.id = 0;
        }
        if (doomed.has(this.current.firstFocus)) this.current.firstFocus = 0;
        this.selectedId = 0;
        this.selectedIds = new Set();
        this.selectionAnchor = 0;
        this.touch();
        this.refreshFirstFocus();
        this.renderTree();
        this.renderProperties();
        this.scheduleRender();
    }

    duplicateNode(id) {
        const node = this.node(id);
        if (!node) return;
        const roots = this.selectedIds?.has(id) ? this.selectionRoots() : [node];
        const source = this.current.nodes.filter(candidate => roots.some(root => candidate === root || this.wouldCycle(root.id, candidate.id)));
        const ids = new Map(source.map((candidate, index) => [candidate.id, this.nextNodeId(this.current) + index]));
        this.pushUndo();
        const copies = source.map(candidate => {
            const copy = JSON.parse(JSON.stringify(candidate));
            copy.id = ids.get(candidate.id);
            if (ids.has(copy.parent)) copy.parent = ids.get(copy.parent);
            else { copy.x += 16; copy.y += 16; }
            for (const key of ['focusUp', 'focusDown', 'focusLeft', 'focusRight', 'backFocus']) {
                if (ids.has(copy[key])) copy[key] = ids.get(copy[key]);
            }
            if (copy.action && ['focusNode', 'equip'].includes(copy.action.type) && ids.has(copy.action.id)) copy.action.id = ids.get(copy.action.id);
            return copy;
        });
        this.current.nodes.push(...copies);
        this.touch();
        this.refreshFirstFocus();
        this.select(copies[0].id);
        this.selectedIds = new Set(copies.map(copy => copy.id));
        this.renderTree();
        this.renderProperties();
        this.scheduleRender();
    }

    /** Nodes in draw order: parents before children, siblings as authored. */
    static orderNodes(nodes) {
        nodes = Array.isArray(nodes) ? nodes.filter(Boolean) : [];
        const byId = new Map(nodes.map(node => [node.id, node]));
        const effectiveParent = node => {
            let parentId = node.parent;
            const trail = new Set([node.id]);
            while (parentId && byId.has(parentId)) {
                if (trail.has(parentId)) return 0;
                trail.add(parentId);
                parentId = byId.get(parentId).parent;
            }
            return byId.has(node.parent) && node.parent !== node.id ? node.parent : 0;
        };
        const byParent = new Map();
        for (const node of nodes) {
            const parent = effectiveParent(node);
            if (!byParent.has(parent)) byParent.set(parent, []);
            byParent.get(parent).push(node);
        }
        const ordered = [];
        const visit = (parent, trail) => {
            for (const node of byParent.get(parent) || []) {
                if (trail.has(node.id)) continue;
                ordered.push(node);
                trail.add(node.id);
                visit(node.id, trail);
            }
        };
        visit(0, new Set());
        for (const node of nodes) if (!ordered.includes(node)) ordered.push(node);
        return ordered;
    }

    canonicalizeNodes() {
        this.current.nodes = DatabaseUserInterfaceEditor.orderNodes(this.current.nodes);
        return this.current.nodes;
    }

    effectiveParent(node) {
        return node && this.node(node.parent) && node.parent !== node.id && !this.wouldCycle(node.id, node.parent) ? node.parent : 0;
    }

    siblingsOf(node) {
        if (!node) return [];
        const parent = this.effectiveParent(node);
        return DatabaseUserInterfaceEditor.orderNodes(this.current.nodes).filter(candidate => this.effectiveParent(candidate) === parent);
    }

    reorderSiblingGroup(parent, siblings) {
        const ordered = DatabaseUserInterfaceEditor.orderNodes(this.current.nodes);
        let index = 0;
        const seed = ordered.map(node => this.effectiveParent(node) === parent ? siblings[index++] : node);
        this.current.nodes = DatabaseUserInterfaceEditor.orderNodes(seed);
    }

    /** Moves a node past its neighbouring sibling, carrying its subtree. */
    moveNode(id, delta) {
        const node = this.node(id);
        if (!node) return false;
        const roots = this.selectedIds?.has(id) ? this.selectionRoots() : [node];
        const selected = new Set(roots);
        const groups = [...new Set(roots.map(root => this.effectiveParent(root)))].map(parent => {
            const before = this.siblingsOf(roots.find(root => this.effectiveParent(root) === parent));
            const after = before.slice();
            if (!Number.isFinite(delta)) {
                const picked = after.filter(item => selected.has(item)), rest = after.filter(item => !selected.has(item));
                return { parent, before, after: delta < 0 ? [...picked, ...rest] : [...rest, ...picked] };
            }
            const indices = delta < 0 ? after.map((_, i) => i) : after.map((_, i) => i).reverse();
            for (const i of indices) {
                const j = i + delta;
                if (selected.has(after[i]) && j >= 0 && j < after.length && !selected.has(after[j])) [after[i], after[j]] = [after[j], after[i]];
            }
            return { parent, before, after };
        });
        if (groups.every(group => group.after.every((item, i) => item === group.before[i]))) return false;
        this.pushUndo();
        for (const group of groups) this.reorderSiblingGroup(group.parent, group.after);
        this.touch();
        this.renderTree();
        this.renderProperties();
        this.scheduleRender();
        return true;
    }

    /** Move selected subtrees together, retaining order and screen positions. */
    moveNodeTo(id, targetId, placement) {
        const node = this.node(id), target = this.node(targetId);
        if (!node || !target || !['before', 'after', 'inside'].includes(placement)) return false;
        const roots = this.selectedIds?.has(id) ? this.selectionRoots() : [node];
        if (roots.some(root => root === target || this.wouldCycle(root.id, target.id))) return false;
        if (placement === 'inside' && target.type !== 'box' && target.type !== 'image') return false;
        const parent = placement === 'inside' ? target.id : this.effectiveParent(target);
        const siblings = DatabaseUserInterfaceEditor.orderNodes(this.current.nodes).filter(candidate => !roots.includes(candidate) && this.effectiveParent(candidate) === parent);
        const insert = placement === 'inside' ? siblings.length : siblings.indexOf(target) + (placement === 'after' ? 1 : 0);
        siblings.splice(insert, 0, ...roots);
        if (roots.every(root => this.effectiveParent(root) === parent) && this.siblingsOf(roots[0]).every((item, i) => item === siblings[i])) return false;
        const rects = this.rects();
        const screen = this.screenSize();
        const parentRect = rects.get(parent) || { x: 0, y: 0, width: screen.width, height: screen.height };
        this.pushUndo();
        for (const root of roots) {
            const before = rects.get(root.id), oldParent = this.effectiveParent(root);
            root.parent = parent;
            if (before && oldParent !== parent) {
                const [ax, ay] = DatabaseUserInterfaceEditor.ANCHORS[root.anchor] || [0, 0];
                root.x = Math.round(before.x - (parentRect.x + parentRect.width * ax - before.width * ax));
                root.y = Math.round(before.y - (parentRect.y + parentRect.height * ay - before.height * ay));
            }
        }
        this.reorderSiblingGroup(parent, siblings);
        if (!this.selectedIds?.has(id)) { this.selectedIds = new Set([id]); this.selectedId = id; }
        this.touch();
        this.refreshFirstFocus();
        this.renderTree();
        this.renderProperties();
        this.scheduleRender();
        return true;
    }

    /** Whether making `parentId` the parent of `id` would form a cycle. */
    wouldCycle(id, parentId) {
        let current = parentId;
        let guard = 0;
        while (current && guard++ < 1000) {
            if (current === id) return true;
            const parent = this.node(current);
            current = parent ? parent.parent : 0;
        }
        return false;
    }

    depth(node) {
        let depth = 0;
        let current = this.node(node.parent);
        while (current && depth < 64) {
            depth++;
            current = this.node(current.parent);
        }
        return depth;
    }

    // ==========================================
    // LAYOUT (same math as the runtime)
    // ==========================================

    rects() {
        const screen = this.screenSize();
        const root = { x: 0, y: 0, width: screen.width, height: screen.height };
        const rects = new Map();
        const resolve = (node, trail) => {
            if (rects.has(node.id)) return rects.get(node.id);
            let parentRect = root;
            const parent = this.node(node.parent);
            if (parent && parent !== node && !trail.has(node.id)) {
                trail.add(node.id);
                parentRect = resolve(parent, trail);
            }
            const measured = node.type === 'text' ? this.measureText(node) : null;
            const width = node.width > 0 ? node.width : (measured ? measured.width : 0);
            const height = node.height > 0 ? node.height : (measured ? measured.height : 0);
            const [ax, ay] = DatabaseUserInterfaceEditor.ANCHORS[node.anchor] || [0, 0];
            const rect = {
                x: Math.round(parentRect.x + parentRect.width * ax - width * ax + node.x),
                y: Math.round(parentRect.y + parentRect.height * ay - height * ay + node.y),
                width, height
            };
            rects.set(node.id, rect);
            return rect;
        };
        for (const node of this.current.nodes) resolve(node, new Set());
        return rects;
    }

    // ==========================================
    // TREE
    // ==========================================

    typeLabel(type) {
        return this._t({ box: 'Box', image: 'Image', text: 'Text', button: 'Button', list: 'List', gauge: 'Gauge', input: 'Text Input',
            battleWindow: 'Battle Window', battleCursor: 'Target Cursor', actorPanel: 'Actor Panel' }[type] || type);
    }

    nodeLabel(node) {
        if (node.name) return node.name;
        if ((node.type === 'text' || node.type === 'button') && node.text) return node.text.split('\n')[0].slice(0, 24);
        if (node.type === 'list') {
            if (node.dataSource === 'actorParameters') return `${this._t('Actor')} ${this._t('Parameters')}`;
            if (node.dataSource === 'actorEquipment') return `${this._t('Actor')} ${this._t('Equipment')}`;
            if (node.dataSource === 'actorStates') return `${this._t('Actor')} ${this._t('States')}`;
            return this._t({ party: 'Party', inventory: 'Inventory', skills: 'Actor skills', saveSlots: 'Save slots', variableRange: 'Variable range', literal: 'Literal list' }[node.dataSource] || 'List');
        }
        if (node.type === 'image' && node.file) return node.file;
        if (node.type === 'gauge') return node.gauge === 'variable' ? (node.label || this._t('Variable')) : node.gauge.toUpperCase();
        return this.typeLabel(node.rowLayout === 'actorPanel' ? 'actorPanel' : node.type) + ' ' + node.id;
    }

    renderTree() {
        const tree = this.wrapper.querySelector('.rr-ui-tree');
        if (!tree) return;
        // Rebuilding the rows would drop focus to the body, where the next
        // Delete reaches the record list; keep it on the selected row.
        const focused = tree.contains(document.activeElement);
        tree.innerHTML = '';
        tree.setAttribute('role', 'listbox');
        tree.setAttribute('aria-multiselectable', 'true');
        tree.setAttribute('aria-label', this._t('Layers, Back to Front'));
        const ordered = this.canonicalizeNodes();
        if (this.reference) {
            const reference = document.createElement('div');
            reference.className = 'rr-ui-tree-row rr-ui-reference-layer';
            reference.setAttribute('role', 'option');
            reference.setAttribute('aria-disabled', 'true');
            reference.innerHTML = `<span class="rr-ui-tree-ordinal">0</span><span class="rr-ui-tree-lock" aria-hidden="true">▣</span><span class="rr-ui-tree-label">${this._t('Game Reference')}</span><span class="rr-ui-tree-flag">${this._t('Pinned / locked')}</span>`;
            tree.appendChild(reference);
        }
        if (!this.current.nodes.length) {
            const empty = document.createElement('div');
            empty.className = 'rr-ui-tree-empty';
            empty.textContent = this._t('Add a node or use a captured layout to start.');
            tree.appendChild(empty);
        }
        ordered.forEach((node, index) => {
            const row = document.createElement('div');
            row.className = 'rr-ui-tree-row' + (this.selectedIds?.has(node.id) || node.id === this.selectedId ? ' selected' : '');
            row.style.paddingLeft = (6 + this.depth(node) * 12) + 'px';
            row.dataset.id = String(node.id);
            row.draggable = true;
            row.title = this.nodeLabel(node);
            row.tabIndex = -1;
            row.setAttribute('role', 'option');
            row.setAttribute('aria-selected', String(this.selectedIds?.has(node.id) || node.id === this.selectedId));
            row.setAttribute('aria-label', `${index + 1}. ${this.nodeLabel(node)}, ${this.typeLabel(node.rowLayout === 'actorPanel' ? 'actorPanel' : node.type)}`);
            const ordinal = document.createElement('span');
            ordinal.className = 'rr-ui-tree-ordinal';
            ordinal.textContent = String(index + 1);
            const handle = document.createElement('span');
            handle.className = 'rr-ui-tree-handle';
            handle.setAttribute('aria-hidden', 'true');
            handle.textContent = '⠿';
            const type = document.createElement('span');
            type.className = 'rr-ui-tree-type rr-ui-type-' + node.type;
            type.textContent = this.typeLabel(node.rowLayout === 'actorPanel' ? 'actorPanel' : node.type);
            const label = document.createElement('span');
            label.className = 'rr-ui-tree-label';
            label.textContent = this.nodeLabel(node);
            row.appendChild(ordinal);
            row.appendChild(handle);
            row.appendChild(type);
            row.appendChild(label);
            if (node.visible && node.visible.type !== 'always') {
                const flag = document.createElement('span');
                flag.className = 'rr-ui-tree-flag';
                flag.textContent = '◐';
                flag.title = this._t('Conditional visibility');
                row.appendChild(flag);
            }
            tree.appendChild(row);
        });
        if (focused) (tree.querySelector(`[data-id="${this.selectedId}"]`) || tree).focus({ preventScroll: true });
        const selected = this.selected();
        const disable = (selector, value) => {
            const button = this.wrapper.querySelector(selector);
            if (button) button.disabled = value;
        };
        const roots = this.selectionRoots();
        const canBack = roots.some(root => this.siblingsOf(root).slice(0, this.siblingsOf(root).indexOf(root)).some(item => !roots.includes(item)));
        const canFront = roots.some(root => this.siblingsOf(root).slice(this.siblingsOf(root).indexOf(root) + 1).some(item => !roots.includes(item)));
        disable('.rr-ui-send-back', !canBack);
        disable('.rr-ui-node-up', !canBack);
        disable('.rr-ui-node-down', !canFront);
        disable('.rr-ui-bring-front', !canFront);
        disable('.rr-ui-node-duplicate', !selected);
        disable('.rr-ui-node-delete', !selected);
    }

    refreshFirstFocus() {
        const select = this.wrapper.querySelector('.rr-ui-first-focus');
        if (!select) return;
        select.innerHTML = '';
        const auto = document.createElement('option');
        auto.value = '0';
        auto.textContent = this._t('First control');
        select.appendChild(auto);
        for (const node of this.current.nodes) {
            if (node.type !== 'button' && node.type !== 'list') continue;
            const option = document.createElement('option');
            option.value = String(node.id);
            option.textContent = this.nodeLabel(node);
            select.appendChild(option);
        }
        select.value = String(this.current.firstFocus || 0);
        if (select.value !== String(this.current.firstFocus || 0)) {
            this.current.firstFocus = 0;
            select.value = '0';
        }
    }

    // ==========================================
    // PROPERTIES
    // ==========================================

    /** One label + one field on the panel grid; the hint sits under the field. */
    row(label, control, hint = '') {
        return `<label class="rr-ui-l">${label}</label><div class="rr-ui-f">${control}${hint ? `<div class="rr-ui-hint">${hint}</div>` : ''}</div>`;
    }

    /** Two label + field pairs sharing one row; both fields align with single rows. */
    pair(label1, control1, label2, control2, wrapClass = '') {
        const second = `<label class="rr-ui-l2">${label2}</label><div class="rr-ui-f2">${control2}</div>`;
        return `<label class="rr-ui-l">${label1}</label><div class="rr-ui-f1">${control1}</div>`
            + (wrapClass ? `<div class="rr-ui-sub ${wrapClass}">${second}</div>` : second);
    }

    group(title) {
        return `<div class="rr-ui-group">${title}</div>`;
    }

    hintRow(text) {
        return `<div class="rr-ui-hint-row">${text}</div>`;
    }

    selectControl(cls, value, options) {
        return `<select class="database-field-value ${cls}">${options.map(([v, text]) =>
            `<option value="${this.escapeHTML(v)}"${String(v) === String(value) ? ' selected' : ''}>${this.escapeHTML(text)}</option>`).join('')}</select>`;
    }

    numberControl(cls, value, min, max, step = 1) {
        return `<input type="number" class="database-field-value ${cls}" value="${Number(value) || 0}" min="${min}" max="${max}" step="${step}">`;
    }

    optionalNumberControl(cls, value, min, max, placeholder) {
        const shown = value === '' || value == null ? '' : Number(value);
        return `<input type="number" class="database-field-value ${cls}" value="${shown}" min="${min}" max="${max}" placeholder="${this.escapeHTML(placeholder)}">`;
    }

    optionalColorControl(cls, value, placeholder) {
        const custom = /^#[0-9a-f]{6}$/i.test(value || '');
        return `<div class="rr-ui-color-option">
            <input type="hidden" class="${cls}" value="${this.escapeHTML(value || '')}">
            ${this.selectControl('rr-ui-color-mode', custom ? 'custom' : 'default', [['default', this._t('Default')], ['custom', this._t('Custom')]])}
            <input type="color" class="rr-ui-color rr-ui-optional-swatch" aria-label="${this._t('Color')}" value="${custom ? value : '#ffffff'}"${custom ? '' : ' hidden'}>
        </div>`;
    }

    textControl(cls, value, placeholder = '') {
        return `<input type="text" class="database-field-value ${cls}" value="${this.escapeHTML(value)}" placeholder="${this.escapeHTML(placeholder)}">`;
    }

    colorControl(cls, value) {
        return `<input type="color" class="rr-ui-color ${cls}" value="${/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}">`;
    }

    textColorControl(cls, value) {
        return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
            ? this.colorControl(cls, value)
            : this.numberControl(cls, value, 0, 31);
    }

    checkControl(cls, value, label) {
        return `<label class="rr-ui-check"><input type="checkbox" class="${cls}"${value ? ' checked' : ''}> ${label}</label>`;
    }

    actorBindingMarkup(node) {
        const tt = text => this._t(text);
        const actors = ((this.databaseManager && this.databaseManager.data && this.databaseManager.data.actors) || [])
            .filter(Boolean).map(actor => [String(actor.id), String(actor.id).padStart(4, '0') + ': ' + actor.name]);
        const source = node.actorSource || 'partySlot';
        let html = this.row(tt('Actor source'), this.selectControl('p-actorSource', source, [
            ['partySlot', `${tt('Fixed')} ${tt('Party slot')}`], ['actorId', `${tt('Fixed')} ${tt('Actor')}`], ['menuActor', `${tt('Main Menu')}: ${tt('Actor')}`],
            ['variable', `${tt('Variable')}: ${tt('Actor')} ID`], ['context', `${tt('List context')}: ${tt('Actor')}`],
            ['sceneActor', tt('Actor being named')]
        ]));
        html += `<div class="rr-ui-sub rr-ui-actor-partySlot"${source === 'partySlot' ? '' : ' hidden'}>${this.row(tt('Party slot'), this.numberControl('p-actorPartySlot', node.index + 1, 1, 99))}</div>`;
        html += `<div class="rr-ui-sub rr-ui-actor-actorId"${source === 'actorId' ? '' : ' hidden'}>${this.row(tt('Actor'), actors.length ? this.selectControl('p-actorId', node.actorId, actors) : this.numberControl('p-actorId', node.actorId, 1, 9999))}</div>`;
        html += `<div class="rr-ui-sub rr-ui-actor-variable"${source === 'variable' ? '' : ' hidden'}>${this.row(tt('Variable ID'), this.numberControl('p-actorVariableId', node.actorVariableId, 1, 9999))}</div>`;
        html += `<div class="rr-ui-sub rr-ui-actor-context"${source === 'context' ? '' : ' hidden'}>${this.row(tt('List context'), this.textControl('p-actorContextName', node.actorContextName, 'selection'))}</div>`;
        return html;
    }

    readActorBinding(panel, node, num) {
        const q = cls => panel.querySelector('.' + cls);
        if (!q('p-actorSource')) return;
        node.actorSource = q('p-actorSource').value;
        node.actorMode = node.actorSource === 'actorId' ? 'actor' : 'party';
        node.index = num('p-actorPartySlot', 1, 99, node.index + 1) - 1;
        node.actorId = num('p-actorId', 1, 9999, node.actorId);
        node.actorVariableId = num('p-actorVariableId', 1, 9999, node.actorVariableId);
        node.actorContextName = (q('p-actorContextName') && q('p-actorContextName').value.trim()) || 'selection';
        for (const source of DatabaseUserInterfaceEditor.ACTOR_SOURCES) {
            const section = panel.querySelector('.rr-ui-actor-' + source);
            if (section) section.hidden = node.actorSource !== source;
        }
    }

    anchorOptions() {
        const tt = text => this._t(text);
        return [
            ['topLeft', tt('Top Left')], ['top', tt('Top')], ['topRight', tt('Top Right')],
            ['left', tt('Left')], ['center', tt('Center')], ['right', tt('Right')],
            ['bottomLeft', tt('Bottom Left')], ['bottom', tt('Bottom')], ['bottomRight', tt('Bottom Right')]
        ];
    }

    parentOptions(node) {
        const options = [['0', this._t('Screen')]];
        for (const candidate of this.current.nodes) {
            if (candidate === node || (candidate.type !== 'box' && candidate.type !== 'image') || this.wouldCycle(node.id, candidate.id)) continue;
            options.push([String(candidate.id), this.nodeLabel(candidate)]);
        }
        return options;
    }

    focusOptions(node) {
        const options = [['0', this._t('Automatic')]];
        for (const candidate of this.current.nodes) {
            if (candidate === node || !DatabaseUserInterfaceEditor.isControl(candidate.type)) continue;
            options.push([String(candidate.id), this.nodeLabel(candidate)]);
        }
        return options;
    }

    conditionMarkup(prefix, condition) {
        const tt = text => this._t(text);
        const types = [['always', tt('Always')], ['never', tt('Never')], ['saveExists', tt('Continue')], ['switch', tt('Switch')], ['variable', tt('Variable')], ['script', tt('Script')]];
        const ops = ['==', '!=', '>', '>=', '<', '<='].map(op => [op, op]);
        return `<div class="rr-ui-condition" data-prefix="${prefix}">
            ${this.selectControl(prefix + '-type', condition.type, types)}
            <div class="rr-ui-condition-switch"${condition.type === 'switch' ? '' : ' hidden'}>
                ${this.numberControl(prefix + '-id', condition.id, 1, 9999)}
                ${this.selectControl(prefix + '-on', condition.on ? '1' : '0', [['1', tt('ON')], ['0', tt('OFF')]])}
            </div>
            <div class="rr-ui-condition-variable"${condition.type === 'variable' ? '' : ' hidden'}>
                ${this.numberControl(prefix + '-vid', condition.id, 1, 9999)}
                ${this.selectControl(prefix + '-op', condition.op, ops)}
                ${this.numberControl(prefix + '-value', condition.value, -999999999, 999999999)}
            </div>
            <div class="rr-ui-condition-script"${condition.type === 'script' ? '' : ' hidden'}>
                <textarea class="database-field-value ${prefix}-script" rows="2" placeholder="return $gameParty.gold() > 0;">${this.escapeHTML(condition.script)}</textarea>
                <button type="button" class="rr-btn-chip rr-ui-expand-script">${tt('Expand Script')}</button>
            </div>
        </div>`;
    }

    readCondition(root, prefix, target) {
        const q = cls => root.querySelector('.' + prefix + '-' + cls);
        target.type = q('type').value;
        if (target.type === 'switch') {
            target.id = Math.max(1, Math.floor(Number(q('id').value) || 1));
            target.on = q('on').value === '1';
        } else if (target.type === 'variable') {
            target.id = Math.max(1, Math.floor(Number(q('vid').value) || 1));
            target.op = q('op').value;
            target.value = Number(q('value').value) || 0;
        } else if (target.type === 'script') {
            target.script = q('script').value;
        }
        const block = root.querySelector(`.rr-ui-condition[data-prefix="${prefix}"]`);
        if (block) {
            block.querySelector('.rr-ui-condition-switch').hidden = target.type !== 'switch';
            block.querySelector('.rr-ui-condition-variable').hidden = target.type !== 'variable';
            block.querySelector('.rr-ui-condition-script').hidden = target.type !== 'script';
        }
    }

    actionMarkup(prefix, action) {
        const tt = text => this._t(text);
        const types = [
            ['none', tt('Nothing')], ['close', tt('Close this interface')], ['closeAll', tt('Close all interfaces')],
            ['callInterface', tt('Call another interface')], ['commonEvent', tt('Run common event')],
            ['scene', tt('Open scene')], ['pluginScene', tt('Open plugin scene')], ['pluginCommand', tt('Plugin command')], ['formation', tt('Formation')],
            ['switch', tt('Set switch')], ['variable', tt('Change variable')], ['script', tt('Run script')],
            ['setMenuActor', `${tt('Set')} ${tt('Actor')}`], ['personalSkill', `${tt('Skills')} (${tt('Actor')})`],
            ['personalEquip', `${tt('Equipment')} (${tt('Actor')})`], ['personalStatus', `${tt('Status')} (${tt('Actor')})`],
            ['previousMenuActor', `◀ ${tt('Actor')}`], ['nextMenuActor', `${tt('Actor')} ▶`],
            ['titleNewGame', `${tt('Title Screen')}: ${tt('New Game')}`], ['titleContinue', `${tt('Title Screen')}: ${tt('Continue')}`],
            ['titleOptions', `${tt('Title Screen')}: ${tt('Options')}`], ['gameEndToTitle', `${tt('Game End')}: ${tt('To Title')}`],
            ['optionChange', `${tt('Options')}: ${tt('Value')}`], ['saveSlot', `${tt('Save')}: ${tt('Slot')}`],
            ['loadSlot', `${tt('Load')}: ${tt('Slot')}`],
            ['focusNode', tt('Focus another control')], ['use', tt('Use item or skill')], ['equip', tt('Equip')],
            ['equipOptimize', tt('Optimize equipment')], ['equipClear', tt('Remove all equipment')],
            ['shopBuy', tt('Buy')], ['shopSell', tt('Sell')]
        ];
        const controls = [['0', tt('(none)')], ...((this.current && this.current.nodes) || [])
            .filter(candidate => DatabaseUserInterfaceEditor.isControl(candidate.type))
            .map(candidate => [String(candidate.id), this.nodeLabel(candidate)])];
        const interfaces = [];
        for (const entry of this.databaseManager.getUserInterfaces() || []) {
            if (entry && entry.id) interfaces.push([String(entry.id), String(entry.id).padStart(4, '0') + (entry.name ? ': ' + entry.name : '')]);
        }
        const commonEvents = [];
        for (const entry of (this.databaseManager.getCommonEvents ? this.databaseManager.getCommonEvents() : []) || []) {
            if (entry && entry.id) commonEvents.push([String(entry.id), String(entry.id).padStart(4, '0') + (entry.name ? ': ' + entry.name : '')]);
        }
        const scenes = [
            ['menu', tt('Main Menu')], ['item', tt('Items')], ['skill', tt('Skills')], ['equip', tt('Equipment')],
            ['status', tt('Status')], ['save', tt('Save')], ['load', tt('Load')], ['options', tt('Options')],
            ['gameEnd', tt('Game End')], ['title', tt('Title Screen')]
        ];
        const args = Object.keys(action.args || {}).map(key => key + '=' + action.args[key]).join('\n');
        const show = type => action.type === type ? '' : ' hidden';
        return `<div class="rr-ui-action" data-prefix="${prefix}">
            ${this.selectControl(prefix + '-type', action.type, types)}
            <div class="rr-ui-action-callInterface"${show('callInterface')}>
                ${interfaces.length ? this.selectControl(prefix + '-interface', action.id, interfaces) : `<div class="rr-ui-hint">${tt('No other interfaces yet')}</div>`}
            </div>
            <div class="rr-ui-action-commonEvent"${show('commonEvent')}>
                ${commonEvents.length ? this.selectControl(prefix + '-commonEvent', action.id, commonEvents) : `<div class="rr-ui-hint">${tt('No common events yet')}</div>`}
            </div>
            <div class="rr-ui-action-scene"${show('scene')}>
                ${this.selectControl(prefix + '-scene', action.scene, scenes)}
            </div>
            <div class="rr-ui-action-focusTarget"${['focusNode', 'equip'].includes(action.type) ? '' : ' hidden'}>
                ${this.selectControl(prefix + '-focusTarget', String(action.id || 0), controls)}
                <div class="rr-ui-hint">${tt(action.type === 'equip' ? 'Focus after equipping; none uses Back goes to.' : 'The control that takes focus.')}</div>
            </div>
            <div class="rr-ui-action-pluginScene"${show('pluginScene')}>
                ${this.textControl(prefix + '-sceneClass', action.sceneClass || '', 'Scene_SkillTree')}
                ${this.textControl(prefix + '-argsExpression', action.argsExpression || '', '[actor.actorId()]')}
                <div class="rr-ui-hint">${tt('Scene arguments are an array expression. Use actor for the selected actor.')}</div>
            </div>
            <div class="rr-ui-action-actorFirst"${['pluginScene','pluginCommand','script'].includes(action.type) ? '' : ' hidden'}>
                ${this.checkControl(prefix + '-actorFirst', !!action.actorFirst, tt('Select actor first'))}
            </div>
            <div class="rr-ui-action-pluginCommand"${show('pluginCommand')}>
                ${this.textControl(prefix + '-plugin', action.plugin, tt('Plugin name'))}
                ${this.textControl(prefix + '-command', action.command, tt('Command name'))}
                <textarea class="database-field-value ${prefix}-args" rows="2" placeholder="${tt('One argument per line: name=value')}">${this.escapeHTML(args)}</textarea>
            </div>
            <div class="rr-ui-action-switch"${show('switch')}>
                ${this.numberControl(prefix + '-switchId', action.id, 1, 9999)}
                ${this.selectControl(prefix + '-on', action.on ? '1' : '0', [['1', tt('ON')], ['0', tt('OFF')]])}
            </div>
            <div class="rr-ui-action-variable"${show('variable')}>
                ${this.numberControl(prefix + '-variableId', action.id, 1, 9999)}
                ${this.selectControl(prefix + '-op', action.op, [['set', tt('Set')], ['add', tt('Add')], ['sub', tt('Subtract')]])}
                ${this.numberControl(prefix + '-value', action.value, -999999999, 999999999)}
            </div>
            <div class="rr-ui-action-script"${show('script')}>
                <textarea class="database-field-value ${prefix}-script" rows="2">${this.escapeHTML(action.script)}</textarea>
                <button type="button" class="rr-btn-chip rr-ui-expand-script">${tt('Expand Script')}</button>
            </div>
            <div class="rr-ui-action-context"${DatabaseUserInterfaceEditor.CONTEXT_ACTIONS.includes(action.type) ? '' : ' hidden'}>
                ${this.textControl(prefix + '-contextName', action.contextName || 'selection', 'selection')}
                <div class="rr-ui-hint">${tt('List context')}</div>
            </div>
            <div class="rr-ui-action-chooseActor"${(['personalSkill', 'personalEquip', 'personalStatus'].includes(action.type) || (action.type === 'scene' && action.scene === 'item')) ? '' : ' hidden'}>
                ${this.checkControl(prefix + '-chooseActor', action.chooseActor !== false, `${tt('Select')} ${tt('Actor')}`)}
            </div>
            <div class="rr-ui-action-andClose"${['pluginCommand', 'switch', 'variable', 'script'].includes(action.type) ? '' : ' hidden'}>
                ${this.checkControl(prefix + '-andClose', action.andClose, tt('Then close this interface'))}
            </div>
        </div>`;
    }

    readAction(root, prefix, target) {
        const q = cls => root.querySelector('.' + prefix + '-' + cls);
        target.type = q('type').value;
        switch (target.type) {
            case 'callInterface': if (q('interface')) target.id = Number(q('interface').value) || 0; break;
            case 'commonEvent': if (q('commonEvent')) target.id = Number(q('commonEvent').value) || 0; break;
            case 'scene': target.scene = q('scene').value; break;
            case 'pluginScene': target.sceneClass=q('sceneClass').value.trim(); target.argsExpression=q('argsExpression').value.trim(); break;
            case 'pluginCommand': {
                target.plugin = q('plugin').value.trim();
                target.command = q('command').value.trim();
                const args = {};
                for (const line of q('args').value.split('\n')) {
                    const eq = line.indexOf('=');
                    if (eq > 0) args[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
                }
                target.args = args;
                break;
            }
            case 'switch':
                target.id = Math.max(1, Math.floor(Number(q('switchId').value) || 1));
                target.on = q('on').value === '1';
                break;
            case 'variable':
                target.id = Math.max(1, Math.floor(Number(q('variableId').value) || 1));
                target.op = q('op').value;
                target.value = Number(q('value').value) || 0;
                break;
            case 'script': target.script = q('script').value; break;
            case 'focusNode':
            case 'equip': if (q('focusTarget')) target.id = Math.max(0, Number(q('focusTarget').value) || 0); break;
            default: break;
        }
        if (q('actorFirst')) target.actorFirst=q('actorFirst').checked;
        if (q('andClose')) target.andClose = q('andClose').checked;
        if (q('chooseActor')) target.chooseActor = q('chooseActor').checked;
        if (q('contextName')) target.contextName = q('contextName').value.trim() || 'selection';
        const block = root.querySelector(`.rr-ui-action[data-prefix="${prefix}"]`);
        if (block) {
            for (const type of DatabaseUserInterfaceEditor.ACTION_TYPES) {
                const section = block.querySelector('.rr-ui-action-' + type);
                if (section) section.hidden = target.type !== type;
            }
            block.querySelector('.rr-ui-action-actorFirst').hidden=!['pluginScene','pluginCommand','script'].includes(target.type);
            block.querySelector('.rr-ui-action-andClose').hidden = !['pluginCommand', 'switch', 'variable', 'script'].includes(target.type);
            block.querySelector('.rr-ui-action-chooseActor').hidden = !(['personalSkill', 'personalEquip', 'personalStatus'].includes(target.type) || (target.type === 'scene' && target.scene === 'item'));
            block.querySelector('.rr-ui-action-context').hidden = !DatabaseUserInterfaceEditor.CONTEXT_ACTIONS.includes(target.type);
            block.querySelector('.rr-ui-action-focusTarget').hidden = !['focusNode', 'equip'].includes(target.type);
        }
    }

    interfacePropertiesMarkup() {
        const tt = text => this._t(text);
        return `<div class="rr-ui-prop-title">${tt('Interface Settings')}</div>
            ${this.group(tt('Behavior'))}
            <div class="rr-ui-sub rr-ui-scene-setting">
                ${this.row(tt('Background'), this.selectControl('rr-ui-background', this.current.background, [
                    ['blur', tt('Blurred map')], ['dim', tt('Dimmed map')], ['none', tt('Map as is')]
                ]))}
                ${this.row(tt('Initial Focus'), '<select class="database-field-value rr-ui-first-focus"></select>')}
                ${this.row(tt('On Cancel'), this.actionMarkup('cancel', this.current.cancel))}
            </div>
            <div class="rr-ui-sub rr-ui-overlay-setting">
                ${this.row(tt('Overlay visibility'), this.conditionMarkup('overlay-visible', this.current.visible), tt('The overlay stays attached to Scene Map and never takes input focus.'))}
            </div>
            <div class="rr-ui-sub rr-ui-battle-setting">
                ${this.row('', this.checkControl('rr-ui-hide-status', this.current.hideStatusWindow !== false, tt('Hide the stock battle status')), tt('The HUD replaces it. A Battle Window node for the status places it instead.'))}
                ${this.hintRow(tt('Bind this interface as Battle in System 2 or Use As. Battle Window nodes place the stock battle windows; the battle itself stays stock, so battle plugins keep working.'))}
            </div>
            ${this.group(tt('Transitions'))}
            ${this.pair(tt('Transition in'), this.selectControl('rr-ui-open-transition', this.current.openTransition, [
                ['none', tt('None')], ['fade', tt('Fade')], ['slideLeft', tt('Slide left')], ['slideUp', tt('Slide up')]
            ]), tt('Transition out'), this.selectControl('rr-ui-close-transition', this.current.closeTransition, [
                ['none', tt('None')], ['fade', tt('Fade')], ['slideLeft', tt('Slide left')], ['slideUp', tt('Slide up')]
            ]))}
            ${this.row(`${tt('Duration')} (${tt('Frames')})`, this.numberControl('rr-ui-transition-duration', this.current.transitionDuration, 1, 120), tt('Input stays locked while an interface opens; closing completes before leaving.'))}
            ${this.group(tt('Notes'))}
            ${this.row(tt('Note'), `<textarea class="database-field-value rr-ui-interface-note" rows="3">${this.escapeHTML(this.current.note)}</textarea>`)}`;
    }

    renderProperties() {
        const tt = text => this._t(text);
        const panel = this.wrapper.querySelector('.rr-ui-props');
        if (!panel) return;
        const node = this.selected();
        const title = this.wrapper.querySelector('.rr-ui-inspector-title');
        if (this.selectedNodes().length > 1) {
            const label = `${tt('Selection')} (${this.selectedNodes().length})`;
            if (title) title.textContent = label;
            const bounds = this.selectionBounds();
            panel.innerHTML = `<div class="rr-ui-prop-title">${label}</div>`
                + this.group(tt('Position'))
                + this.row('X', this.numberControl('p-group-x', bounds.x, -9999, 9999))
                + this.row('Y', this.numberControl('p-group-y', bounds.y, -9999, 9999));
            this.organizeProperties(panel);
            panel.querySelector('.rr-ui-property-section').open = true;
            return;
        }
        if (!node) {
            if (title) title.textContent = tt('Interface Settings');
            panel.innerHTML = this.interfacePropertiesMarkup();
            this.refreshFirstFocus();
            this.updatePresentationFields();
            this.organizeProperties(panel);
            return;
        }
        if (title) title.textContent = node.name && node.name.trim() ? node.name.trim()
            : node.type === 'button' && node.text ? node.text : this.typeLabel(node.rowLayout === 'actorPanel' ? 'actorPanel' : node.type);
        const fills = [['window', tt('Window skin')], ['color', tt('Solid color')], ['gradient', tt('Gradient')], ['none', tt('None')]];
        const isSurface = node.type === 'box' || DatabaseUserInterfaceEditor.isControl(node.type);
        const isLabel = node.type === 'text' || node.type === 'button' || node.type === 'input';
        const colorFill = node.fill === 'color' || node.fill === 'gradient';
        let html = '';
        html += `<div class="rr-ui-prop-title rr-ui-type-${node.type}">${this.typeLabel(node.rowLayout === 'actorPanel' ? 'actorPanel' : node.type)} #${node.id}</div>`;
        html += this.row(tt('Name'), this.textControl('p-name', node.name));
        html += this.group(`${tt('Position')} / ${tt('Size')}`);
        html += this.row(tt('Parent'), this.selectControl('p-parent', node.parent, this.parentOptions(node)));
        html += this.row(tt('Anchor'), this.selectControl('p-anchor', node.anchor, this.anchorOptions()));
        html += this.pair('X', this.numberControl('p-x', node.x, -9999, 9999), 'Y', this.numberControl('p-y', node.y, -9999, 9999));
        html += this.pair(tt('Width'), this.numberControl('p-width', node.width, 0, 9999), tt('Height'), this.numberControl('p-height', node.height, 0, 9999));
        if (node.type === 'text') html += this.hintRow(tt('Width or height 0 fits the text.'));
        html += this.row(tt('Opacity'), this.numberControl('p-opacity', node.opacity, 0, 255));
        html += this.row(tt('Visible'), this.conditionMarkup('p-visible', node.visible));

        if (isSurface) {
            html += this.group(tt('Background'));
            html += this.row(tt('Fill'), this.selectControl('p-fill', node.fill, fills));
            html += `<div class="rr-ui-sub rr-ui-fill-color"${colorFill ? '' : ' hidden'}>`;
            html += this.pair(tt('Color'), this.colorControl('p-color', node.color), tt('Color 2'), this.colorControl('p-color2', node.color2), 'rr-ui-gradient-end' + (node.fill === 'gradient' ? '' : ' rr-ui-hidden'));
            html += this.row(tt('Fill Opacity'), this.numberControl('p-fillOpacity', node.fillOpacity, 0, 255));
            html += `<div class="rr-ui-sub rr-ui-gradient-end"${node.fill === 'gradient' ? '' : ' hidden'}>`;
            html += this.row(tt('Direction'), this.selectControl('p-vertical', node.vertical ? '1' : '0', [['1', tt('Vertical')], ['0', tt('Horizontal')]]));
            html += `</div></div>`;
            html += this.pair(tt('Border'), this.numberControl('p-borderWidth', node.borderWidth, 0, 32), tt('Color'), this.colorControl('p-borderColor', node.borderColor));
            html += this.row(tt('Radius'), this.numberControl('p-radius', node.radius, 0, 200));
        }
        if (isLabel) {
            html += this.group(node.type === 'button' ? tt('Label') : node.type === 'input' ? tt('Placeholder') : tt('Text'));
            if(node.type==='button') {
                html += this.row(tt('Label expression'), this.textControl('p-labelScript', node.labelScript || '', 'SkillTreesSystem.buttonValue'));
                html += this.hintRow(tt('Optional expression for a dynamic label. Text below is used in the editor and if the expression fails.'));
            }
            html += this.row(tt('Text'), `<textarea class="database-field-value p-text" rows="3">${this.escapeHTML(node.text)}</textarea>`);
            const references = [
                [tt('Text'), tt('Escape codes work: \\V[n], \\N[n], \\C[n], \\I[n], \\G')],
                [tt('Party'), tt('Party codes: \\GOLD, \\PLV[n], \\PCLASS[n], \\PHP[n], \\PMHP[n], \\PMP[n], \\PMMP[n], \\PTP[n] (n = party slot)')]
            ];
            if (node.type === 'text') {
                html += this.row(`${tt('List context')} ${tt('Name')}`, this.textControl('p-contextName', node.contextName || 'selection', 'selection'));
                references.push(
                    [tt('Actor'), '{actor.name}, {actor.nickname}, {actor.class}, {actor.level}, {actor.profile}, {actor.hp}, {actor.mp}, {actor.tp}, {actor.maxHp}, {actor.currentExp}, {actor.totalExp}, {actor.nextExp}, {actor.nextRequiredExp}, {actor.atk}'],
                    [tt('List context'), '{context.name}, {context.value}, {context.valueText}, {context.title}, {context.playtime}, {context.date}, {context.existing}']
                );
            }
            html += this.codeReferenceMarkup(tt('Text Codes'), references);
            if (node.type === 'input') {
                const target = node.inputTarget || 'variable';
                html += this.hintRow(tt('Shown while the field is empty. What the player types is plain text.'));
                html += this.group(tt('Text Input'));
                html += this.row(tt('Stores in'), this.selectControl('p-inputTarget', target, [['variable', tt('Variable')], ['actorName', tt('Actor name')], ['actorNickname', tt('Actor nickname')]]));
                html += `<div class="rr-ui-sub rr-ui-input-variable"${target === 'variable' ? '' : ' hidden'}>${this.row(tt('Variable ID'), this.numberControl('p-inputVariableId', node.variableId || 1, 1, 9999))}</div>`;
                html += `<div class="rr-ui-sub rr-ui-input-actor"${target === 'variable' ? ' hidden' : ''}>${this.actorBindingMarkup(node)}</div>`;
                html += this.row(tt('Max length'), this.numberControl('p-maxLength', node.maxLength || 16, 1, 99));
                html += this.row('', this.checkControl('p-mask', !!node.mask, tt('Hide characters')), tt('For passwords: the field shows dots.'));
                html += this.row('', this.checkControl('p-onScreenKeys', !!node.onScreenKeys, tt('Character grid')),
                    tt('Also shows the stock name-entry grid, for gamepad and touch. Typing always works.'));
                html += this.row('', this.checkControl('p-autoEdit', !!node.autoEdit, tt('Start typing when opened')), tt('When this field has the first focus.'));
                html += this.hintRow(tt('OK or a click starts typing; Enter stores the text and runs the action, Escape cancels.'));
            }
            if (node.type === 'text') {
                html += this.group(tt('Actor source'));
                html += this.actorBindingMarkup(node);
                html += this.hintRow(tt('The editor uses starting-party and class data; runtime preview is authoritative.'));
            }
            html += this.group(`${tt('Text')} ${tt('Style')}`);
            html += this.row(tt('Align'), this.selectControl('p-align', node.align, [['left', tt('Left')], ['center', tt('Center')], ['right', tt('Right')]]));
            html += this.pair(tt('Size'), this.numberControl('p-fontSize', node.fontSize, 0, 200), tt('Color'), this.textColorControl('p-textColor', node.textColor));
            html += this.hintRow(tt('Font size 0 uses the game default; color is a window skin index or a captured hex color.'));
            html += this.row(tt('Font face'), this.textControl('p-fontFace', node.fontFace, tt('Game font')), tt('Blank uses the game font.'));
            html += this.pair('', this.checkControl('p-fontBold', node.fontBold, tt('Bold')), '', this.checkControl('p-fontItalic', node.fontItalic, tt('Italic')));
            html += this.row('', this.checkControl('p-outline', node.outline, tt('Outline')));
            html += this.pair(tt('Outline color'), this.optionalColorControl('p-outlineColor', node.outlineColor, tt('Game default')), tt('Outline width'), this.numberControl('p-outlineWidth', node.outlineWidth, 0, 32));
            html += this.row(tt('Letter spacing'), this.numberControl('p-letterSpacing', node.letterSpacing, -20, 100));
            if (node.type === 'text') html += this.row('', this.checkControl('p-wrap', node.wrap, tt('Wrap')), tt('Wraps at the node width; set a width first.'));
            html += this.row('', this.checkControl('p-fitText', node.fitText, tt('Fit text to size')), tt('Shrinks the font until the text fits inside the node.'));
        }
        if (node.type === 'image') {
            html += this.group(tt('Image'));
            html += this.row(tt('Source'), this.selectControl('p-source', node.source, [['picture', tt('Picture')], ['system', tt('System')], ['face', tt('Face')], ['character', tt('Character')], ['icon', tt('Icon')], ['partyFace', tt('Party face')], ['title1', tt('Title background 1')], ['title2', tt('Title background 2')]]));
            html += `<div class="rr-ui-sub rr-ui-image-file"${node.source === 'icon' || node.source === 'partyFace' ? ' hidden' : ''}>`;
            html += this.row(tt('File'), `<div class="rr-ui-file-row">${this.textControl('p-file', node.file)}<button type="button" class="rr-btn-chip p-browse">…</button></div>`);
            html += `</div>`;
            html += `<div class="rr-ui-sub rr-ui-image-index"${node.source === 'face' || node.source === 'character' || node.source === 'icon' ? '' : ' hidden'}>`;
            html += this.row(tt('Index'), this.numberControl('p-index', node.index, 0, 9999));
            html += `</div>`;
            html += this.row(tt('Fit'), this.selectControl('p-fit', node.fit, [['none', tt('Actual size')], ['stretch', tt('Stretch')], ['contain', tt('Fit inside')]]));
            const sliceSafe = node.source === 'picture' || node.source === 'system';
            html += `<div class="rr-ui-sub rr-ui-nine-slice"${sliceSafe ? '' : ' hidden'}>`;
            html += this.group(`${tt('Image')} ${tt('Style')}`);
            html += this.row('', this.checkControl('p-nineSlice', node.nineSlice, tt('Nine-slice')),
                tt('Keeps image borders unscaled; available for Picture and System images.'));
            html += this.pair(tt('Left'), this.numberControl('p-sliceLeft', node.sliceLeft, 0, 9999), tt('Top'), this.numberControl('p-sliceTop', node.sliceTop, 0, 9999));
            html += this.pair(tt('Right'), this.numberControl('p-sliceRight', node.sliceRight, 0, 9999), tt('Bottom'), this.numberControl('p-sliceBottom', node.sliceBottom, 0, 9999));
            html += `</div>`;
            html += `<div class="rr-ui-sub rr-ui-image-actor"${node.source === 'partyFace' ? '' : ' hidden'}>`;
            html += this.group(tt('Actor source')) + this.actorBindingMarkup(node);
            html += `</div>`;
        }
        if (node.type === 'list') {
            const system = (this.databaseManager && this.databaseManager.data && this.databaseManager.data.system) || {};
            const skillTypes = (system.skillTypes || []).map((name, id) => id > 0 && name ? [String(id), name] : null).filter(Boolean);
            const source = node.dataSource;
            html += this.group(node.rowLayout === 'actorPanel' ? tt('Actor Panel') : tt('Rows'));
            html += this.row(tt('Layout'), this.selectControl('p-rowLayout', node.rowLayout, [['text', tt('Text')], ['actorPanel', tt('Actor Panel')]]));
            if (node.rowLayout === 'actorPanel') {
                html += this.row(tt('Portrait size'), this.numberControl('p-portraitSize', node.portraitSize, 32, 144));
                html += this.pair(tt('Padding'), this.numberControl('p-actorPadding', node.actorPadding, 0, 200), tt('Spacing'), this.numberControl('p-actorGap', node.actorGap, 0, 200));
                for (const [key, label] of [['portrait','Portrait'],['name','Name'],['class','Class'],['level','Level'],['hp','HP'],['mp','MP'],['tp','TP'],['exp','EXP'],['atb','ATB'],['states','States']]) {
                    html += this.row('', this.checkControl('p-actorField-' + key, node.actorFields.includes(key), tt(label)));
                }
                html += this.group(tt('Portrait'));
                html += this.row(tt('Source'), this.selectControl('p-portraitSource', node.portraitSource || 'face', [['face', tt('Face')], ['picture', tt('Picture per actor')]]));
                html += `<div class="rr-ui-sub rr-ui-portrait-picture"${node.portraitSource === 'picture' ? '' : ' hidden'}>`;
                html += this.row(tt('Picture name'), this.textControl('p-portraitPattern', node.portraitPattern || 'Face_{id}', 'Face_{id}'), tt('In img/pictures; {id} is the actor ID.'));
                html += this.row(tt('Frames'), this.selectControl('p-portraitFrames', String(node.portraitFrames === 5 ? 5 : 1), [['1', tt('One image')], ['5', tt('Five: normal, healed, acting, hurt, fallen')]]));
                html += '</div>';
                html += this.row('', this.checkControl('p-portraitMotion', !!node.portraitMotion, tt('Face reactions')), tt('Shakes when hit, grows when healed or acting.'));
                html += this.row('', this.checkControl('p-portraitBreath', !!node.portraitBreath, tt('Breathing')));
                html += this.actorElementMarkup(node);
            }
            html += `<div class="rr-ui-sub"${node.rowLayout === 'actorPanel' ? ' hidden' : ''}>`;
            html += this.row(tt('Data source'), this.selectControl('p-dataSource', source, [
                ['party', tt('Party')], ['inventory', tt('Inventory')], ['skills', tt('Actor skills')],
                ['actorParameters', `${tt('Actor')} ${tt('Parameters')}`], ['actorEquipment', `${tt('Actor')} ${tt('Equipment')}`], ['actorStates', `${tt('Actor')} ${tt('States')}`],
                ['options', tt('Options')], ['saveSlots', tt('Save slots')], ['variableRange', tt('Variable range')], ['literal', tt('Literal list')],
                ['itemCategories', tt('Item categories')], ['skillTypes', tt('Skill types')], ['equipCandidates', tt('Equipment candidates')],
                ['shopGoods', tt('Shop goods')], ['shopSell', tt('Items to sell')]
            ]));
            html += `<div class="rr-ui-sub rr-ui-list-follow"${DatabaseUserInterfaceEditor.FOLLOWING_SOURCES.includes(source) ? '' : ' hidden'}>`;
            html += this.row(tt('Follows list'), this.textControl('p-filterContext', node.filterContext || '', tt('(none)')),
                tt('Another list\'s context name: the category, skill type or equipment slot chosen there filters these rows.'));
            html += '</div>';
            html += `<div class="rr-ui-sub rr-ui-list-compare"${source === 'actorParameters' ? '' : ' hidden'}>`;
            html += this.row(tt('Compare with'), this.textControl('p-compareContext', node.compareContext || '', tt('(none)')),
                tt('An equipment candidates list\'s context name: while it has focus, rows show {newValue}.'));
            html += '</div>';
            html += this.row(tt('Columns'), this.numberControl('p-columns', node.columns || 1, 1, 12));
            html += '</div>';
            html += `<div class="rr-ui-sub rr-ui-list-options"${source === 'options' ? '' : ' hidden'}>`;
            html += this.hintRow(tt('Options rows and values come from the running game; runtime is authoritative.'));
            html += `</div>`;
            html += `<div class="rr-ui-sub rr-ui-list-inventory"${source === 'inventory' ? '' : ' hidden'}>`;
            html += this.row(tt('Category'), this.selectControl('p-category', node.category, [['all', tt('All items')], ['item', tt('Regular items')], ['weapon', tt('Weapons')], ['armor', tt('Armors')], ['keyItem', tt('Key items')]]));
            const actorList = DatabaseUserInterfaceEditor.ACTOR_LIST_SOURCES.includes(source);
            html += `</div><div class="rr-ui-sub rr-ui-list-actor"${actorList ? '' : ' hidden'}>`;
            html += this.group(tt('Actor source')) + this.actorBindingMarkup(node);
            html += `<div class="rr-ui-sub rr-ui-list-skills"${source === 'skills' ? '' : ' hidden'}>`;
            html += this.row(tt('Skill type'), this.selectControl('p-skillTypeId', node.skillTypeId, [['0', tt('All skill types')], ...skillTypes]));
            html += `</div></div><div class="rr-ui-sub rr-ui-list-saveSlots"${source === 'saveSlots' ? '' : ' hidden'}>`;
            html += this.row('', this.checkControl('p-includeAutosave', node.includeAutosave, tt('Include autosave slot')));
            html += this.hintRow(`${tt('Action')}: ${tt('Save')} / ${tt('Load')} - ${tt('Slot')}`);
            html += `</div><div class="rr-ui-sub rr-ui-list-variableRange"${source === 'variableRange' ? '' : ' hidden'}>`;
            html += this.pair(tt('First variable'), this.numberControl('p-rangeStart', node.rangeStart, 1, 9999), tt('Last variable'), this.numberControl('p-rangeEnd', node.rangeEnd, 1, 9999));
            html += `</div><div class="rr-ui-sub rr-ui-list-literal"${source === 'literal' ? '' : ' hidden'}>`;
            html += this.row(tt('Literal rows'), `<textarea class="database-field-value p-items" rows="6">${this.escapeHTML(DatabaseUserInterfaceEditor.literalItemsText(node.items))}</textarea>`, tt('One row per line: id|value|text. Add |disabled to disable a row.'));
            html += `</div>`;
            html += `<div class="rr-ui-sub"${node.rowLayout === 'actorPanel' ? ' hidden' : ''}>`;
            html += this.row(tt('Row template'), this.textControl('p-rowText', node.rowText, '{name}'));
            html += this.codeReferenceMarkup(tt('Text Codes'), [[tt('Row template'), '{key}, {kind}, {id}, {value}, {name}, {description}, {icon}, {count}, {paramName}, {paramValue}, {price}, {level}, {playtime}, {symbol}, {valueText}, {title}, {timestamp}, {date}, {partyCharacters}, {partyFaces}, {existing}, {enabled}, {index}, {cost}, {slot}, {newValue}, {change}']]);
            html += '</div>';
            html += this.group(`${tt('Text')} ${tt('Style')}`);
            html += this.pair(tt('Row height'), this.numberControl('p-rowHeight', node.rowHeight, 24, 9999), tt('Align'), this.selectControl('p-align', node.align, [['left', tt('Left')], ['center', tt('Center')], ['right', tt('Right')]]));
            html += this.pair(tt('Font size'), this.numberControl('p-fontSize', node.fontSize, 0, 200), tt('Text color'), this.textColorControl('p-textColor', node.textColor));
            html += this.row(tt('Font face'), this.textControl('p-fontFace', node.fontFace, tt('Game font')), tt('Blank uses the game font.'));
            html += this.pair('', this.checkControl('p-fontBold', node.fontBold, tt('Bold')), '', this.checkControl('p-fontItalic', node.fontItalic, tt('Italic')));
            html += this.row('', this.checkControl('p-outline', node.outline, tt('Outline')));
            html += this.pair(tt('Outline color'), this.optionalColorControl('p-outlineColor', node.outlineColor, tt('Game default')), tt('Outline width'), this.numberControl('p-outlineWidth', node.outlineWidth, 0, 32));
            html += this.row(tt('Letter spacing'), this.numberControl('p-letterSpacing', node.letterSpacing, -20, 100));
            html += this.group(tt('Selection'));
            html += this.row(`${tt('List context')} ${tt('Name')}`, this.textControl('p-contextName', node.contextName, 'selection'));
            html += this.pair(tt('Store in variable'), this.numberControl('p-selectionVariableId', node.selectionVariableId, 0, 9999), tt('Store'), this.selectControl('p-selectionValue', node.selectionValue, [['id', tt('Row ID')], ['value', tt('Row value')]]));
            html += this.hintRow(tt('Variable 0 does not store the selection. The value is stored before the action runs.'));
        }
        if (node.type === 'battleWindow') {
            const file = `<div class="rr-ui-file-row">${this.textControl('p-file', node.file || '', tt('(none)'))}<button type="button" class="rr-btn-chip p-browse">…</button></div>`;
            html += this.group(tt('Battle Window'));
            html += this.row(tt('Window'), this.selectControl('p-battleWindow', node.battleWindow, DatabaseUserInterfaceEditor.BATTLE_WINDOWS.map(([key, label]) => [key, tt(label)])));
            html += this.hintRow(tt('Places the stock battle window here; the battle still runs it, so its commands and plugins stay.'));
            html += this.pair(tt('Fill'), this.selectControl('p-fill', node.fill === 'none' ? 'none' : 'window', [['window', tt('Window skin')], ['none', tt('None')]]),
                tt('Columns'), this.numberControl('p-windowColumns', node.windowColumns || 0, 0, 12));
            html += this.hintRow(tt('Columns 0 keeps the window\'s own.'));
            html += this.row('', this.checkControl('p-hideWindow', !!node.hideWindow, tt('Hide the window')), tt('It still takes input: pair an ally or enemy target window with a Target Cursor.'));
            html += this.row('', this.checkControl('p-followActor', !!node.followActor, tt('Follow the active actor')), tt('X and Y become offsets from the active actor\'s row in the party panel.'));
            html += this.group(tt('Slide in'));
            html += this.pair(`${tt('Slide')} X`, this.numberControl('p-slideX', node.slideX || 0, -2000, 2000), `${tt('Slide')} Y`, this.numberControl('p-slideY', node.slideY || 0, -2000, 2000));
            html += this.row(`${tt('Duration')} (${tt('Frames')})`, this.numberControl('p-slideDuration', node.slideDuration || 12, 1, 120), tt('Each time the window appears it moves in from this offset.'));
            html += this.group(tt('Background picture'));
            html += this.row(tt('Picture'), file, tt('Drawn behind the window, shown with it.'));
            html += this.pair('X', this.numberControl('p-imageX', node.imageX || 0, -2000, 2000), 'Y', this.numberControl('p-imageY', node.imageY || 0, -2000, 2000));
        }
        if (node.type === 'battleCursor') {
            html += this.group(tt('Target Cursor'));
            html += this.row(tt('Source'), this.selectControl('p-source', node.source === 'system' ? 'system' : 'picture', [['picture', tt('Picture')], ['system', tt('System')]]));
            html += this.row(tt('Image'), `<div class="rr-ui-file-row">${this.textControl('p-file', node.file || '', tt('(none)'))}<button type="button" class="rr-btn-chip p-browse">…</button></div>`,
                tt('Blank draws a plain arrow. Animation frames sit side by side.'));
            html += this.row(tt('Ally image'), this.textControl('p-actorFile', node.actorFile || '', tt('Same as enemies')));
            html += this.row('', this.checkControl('p-cursorSlide', node.cursorSlide !== false, tt('Slide between targets')));
            html += this.pair(tt('Frames'), this.numberControl('p-frames', node.frames || 1, 1, 60), tt('Frame speed'), this.numberControl('p-frameSpeed', node.frameSpeed || 8, 1, 120));
            html += this.row(tt('Float'), this.numberControl('p-floatRange', node.floatRange ?? 6, 0, 100));
            html += this.row('', this.checkControl('p-showName', node.showName !== false, tt('Show the target\'s name')));
            html += this.row(tt('Font size'), this.numberControl('p-fontSize', node.fontSize || 0, 0, 200), tt('0 uses the game default.'));
            html += this.pair(`${tt('Enemy')} X`, this.numberControl('p-enemyOffsetX', node.enemyOffsetX || 0, -2000, 2000), `${tt('Enemy')} Y`, this.numberControl('p-enemyOffsetY', node.enemyOffsetY || 0, -2000, 2000));
            html += this.pair(`${tt('Ally')} X`, this.numberControl('p-actorOffsetX', node.actorOffsetX || 0, -2000, 2000), `${tt('Ally')} Y`, this.numberControl('p-actorOffsetY', node.actorOffsetY || 0, -2000, 2000));
            html += this.hintRow(tt('Shows while an enemy or ally is being chosen: over the enemy, or over the ally\'s row in the party panel.'));
        }
        if (node.type === 'gauge') {
            const variable = node.gauge === 'variable';
            const scaled = variable || ['mhp', 'mmp', 'atk', 'def', 'mat', 'mdf', 'agi', 'luk'].includes(node.gauge);
            html += this.group(tt('Gauge'));
            html += this.row(tt('Gauge'), this.selectControl('p-gauge', node.gauge, [
                ['hp', tt('HP')], ['mp', tt('MP')], ['tp', tt('TP')], ['exp', `${tt('EXP')} / ${tt('Level')}`],
                ['mhp', tt('Max HP')], ['mmp', tt('Max MP')], ['atk', tt('ATK')], ['def', tt('DEF')], ['mat', tt('MAT')],
                ['mdf', tt('MDF')], ['agi', tt('AGI')], ['luk', tt('LUK')], ['variable', tt('Variable')]
            ]));
            html += `<div class="rr-ui-sub rr-ui-gauge-party"${variable ? ' hidden' : ''}>`;
            html += this.group(tt('Actor source')) + this.actorBindingMarkup(node);
            html += `</div><div class="rr-ui-sub rr-ui-gauge-variable"${variable ? '' : ' hidden'}>`;
            html += this.row(tt('Variable ID'), this.numberControl('p-variableId', node.variableId, 1, 9999));
            html += this.row(`${tt('Maximum')} ${tt('Variable')}`, this.numberControl('p-maxVariableId', node.maxVariableId, 0, 9999), `0 = ${tt('Maximum')}`);
            html += `</div>`;
            html += `<div class="rr-ui-sub rr-ui-gauge-scaled"${scaled ? '' : ' hidden'}>${this.row(tt('Max value'), this.numberControl('p-max', node.max, 1, 999999999))}</div>`;
            html += this.row(tt('Label'), this.textControl('p-label', node.label));
            html += this.row('', this.checkControl('p-showLabel', node.showLabel, tt('Show label')));
            html += this.row(tt('Show value'), this.selectControl('p-valueFormat', node.valueFormat, [['current', tt('Value')], ['currentMax', `${tt('Value')} / ${tt('Maximum')}`], ['percent', '%'], ['hidden', tt('None')]]));
            html += this.group(`${tt('Gauge')} ${tt('Style')}`);
            html += this.pair(tt('Color 1'), this.colorControl('p-gaugeColor1', node.gaugeColor1 || '#ffffff'), tt('Color 2'), this.colorControl('p-gaugeColor2', node.gaugeColor2 || '#ffffff'));
            html += this.pair(`${tt('Background')} ${tt('Color')}`, this.colorControl('p-gaugeBackColor', node.gaugeBackColor || '#202020'), tt('Height'), this.numberControl('p-gaugeHeight', node.gaugeHeight, 0, 240));
            html += this.row('', this.checkControl('p-customGaugeColors', !!(node.gaugeColor1 || node.gaugeColor2 || node.gaugeBackColor), `${tt('Color')} (${tt('Custom')})`));
        }
        if (DatabaseUserInterfaceEditor.isControl(node.type)) {
            html += this.group(tt('Behavior'));
            html += this.row(tt('Action'), this.actionMarkup('p-action', node.action));
            html += this.row(tt('Enabled'), this.conditionMarkup('p-enabled', node.enabled));
            html += this.row(tt('Sound'), `<div class="rr-ui-file-row">${this.textControl('p-se', node.se ? node.se.name : '', tt('Default'))}<button type="button" class="rr-btn-chip p-se-browse">${tt('Browse')}</button></div>`);
            html += this.group(`${tt('Button')} ${tt('Style')}`);
            html += this.row(`${tt('Preview')} ${tt('State')}`, this.selectControl('p-previewState', this._controlPreviewState || 'automatic', [
                ['automatic', tt('Automatic')], ['focused', tt('Selected')], ['pressed', tt('Pressed')], ['disabled', tt('Disabled')]
            ]));
            html += node.type === 'list' ? this.row(tt('Highlight'), this.colorControl('p-highlightColor', node.highlightColor))
                : `<input type="hidden" class="p-highlightColor" value="${this.escapeHTML(node.highlightColor)}">`;
            html += `<details class="rr-ui-property-section" open><summary>${tt('Selected')}</summary><div class="rr-ui-property-body">`;
            html += this.pair(tt('Fill'), this.optionalColorControl('p-focusedFillColor', node.focusedFillColor, tt('Default')), tt('Text Color'), this.optionalColorControl('p-focusedTextColor', node.focusedTextColor, tt('Default')));
            html += this.pair(tt('Border'), this.optionalColorControl('p-focusedBorderColor', node.focusedBorderColor, tt('Default')), tt('Opacity'), this.optionalNumberControl('p-focusedOpacity', node.focusedOpacity, 0, 255, tt('Default')));
            html += `</div></details><details class="rr-ui-property-section"><summary>${tt('Pressed')}</summary><div class="rr-ui-property-body">`;
            html += this.pair(`${tt('Pressed')} X`, this.numberControl('p-pressedOffsetX', node.pressedOffsetX, -32, 32), `${tt('Pressed')} Y`, this.numberControl('p-pressedOffsetY', node.pressedOffsetY, -32, 32));
            html += this.row(tt('Opacity'), this.optionalNumberControl('p-pressedOpacity', node.pressedOpacity, 0, 255, tt('Default')));
            html += `</div></details><details class="rr-ui-property-section"><summary>${tt('Disabled')}</summary><div class="rr-ui-property-body">`;
            html += this.pair(tt('Fill'), this.optionalColorControl('p-disabledFillColor', node.disabledFillColor, tt('Default')), tt('Text Color'), this.optionalColorControl('p-disabledTextColor', node.disabledTextColor, tt('Default')));
            html += this.row(tt('Opacity'), this.optionalNumberControl('p-disabledOpacity', node.disabledOpacity, 0, 255, tt('Default')));
            html += `</div></details>`;
            html += this.group(tt('Navigation'));
            html += this.pair(`${tt('Focus')} ${tt('Up')}`, this.selectControl('p-focusUp', node.focusUp, this.focusOptions(node)), `${tt('Focus')} ${tt('Down')}`, this.selectControl('p-focusDown', node.focusDown, this.focusOptions(node)));
            html += this.pair(`${tt('Focus')} ${tt('Left')}`, this.selectControl('p-focusLeft', node.focusLeft, this.focusOptions(node)), `${tt('Focus')} ${tt('Right')}`, this.selectControl('p-focusRight', node.focusRight, this.focusOptions(node)));
            html += this.row(tt('Back goes to'), this.selectControl('p-backFocus', node.backFocus || 0,
                [['0', tt('Cancel action')], ...this.focusOptions(node).slice(1)]), tt('Cancel on this control moves focus here instead of running the interface\'s Cancel action.'));
            if (node.type === 'list') html += this.row('', this.checkControl('p-focusable', node.focusable !== false, tt('Can be focused')));
        }
        panel.innerHTML = html;
        this.drawGaugeStylePreview();
        this.organizeProperties(panel);
    }

    /** Keep the common content/action controls visible; disclose details on demand. */
    organizeProperties(panel) {
        if (!panel.ownerDocument) return;
        const doc = panel.ownerDocument;
        const openTitles = ['Label', 'Text', 'Image', 'Rows', 'Actor Panel', 'Gauge', 'Behavior'].map(title => this._t(title));
        const headings = [...panel.children].filter(el => el.classList.contains('rr-ui-group'));
        for (const heading of headings) {
            const name = heading.textContent;
            const section = doc.createElement('details');
            section.className = 'rr-ui-property-section';
            section.dataset.section = name;
            section.open = this._propertySections?.[name] ?? openTitles.includes(name);
            const summary = doc.createElement('summary');
            summary.textContent = name;
            const body = doc.createElement('div');
            body.className = 'rr-ui-property-body';
            heading.before(section);
            section.append(summary, body);
            while (heading.nextSibling && !heading.nextSibling.classList?.contains('rr-ui-group')) body.append(heading.nextSibling);
            heading.remove();
        }
    }

    /** One reference per content card, with related codes grouped inside. */
    codeReferenceMarkup(title, groups) {
        return `<details class="rr-ui-property-help"><summary>${this.escapeHTML(title)}</summary><dl>${groups.map(([label, text]) =>
            `<dt>${this.escapeHTML(label)}</dt><dd>${this.escapeHTML(text)}</dd>`).join('')}</dl></details>`;
    }

    applyInterfaceProperties() {
        const panel = this.wrapper.querySelector('.rr-ui-props');
        if (!panel || this.selected()) return;
        const q = selector => panel.querySelector(selector);
        const background = q('.rr-ui-background');
        const firstFocus = q('.rr-ui-first-focus');
        const openTransition = q('.rr-ui-open-transition');
        const closeTransition = q('.rr-ui-close-transition');
        const duration = q('.rr-ui-transition-duration');
        const note = q('.rr-ui-interface-note');
        if (background) this.current.background = background.value;
        if (firstFocus) this.current.firstFocus = Number(firstFocus.value) || 0;
        if (panel.querySelector('.rr-ui-action[data-prefix="cancel"]')) this.readAction(panel, 'cancel', this.current.cancel);
        if (panel.querySelector('.rr-ui-condition[data-prefix="overlay-visible"]')) this.readCondition(panel, 'overlay-visible', this.current.visible);
        if (openTransition) this.current.openTransition = openTransition.value;
        if (closeTransition) this.current.closeTransition = closeTransition.value;
        if (duration) this.current.transitionDuration = Math.min(120, Math.max(1, Math.round(Number(duration.value) || 18)));
        if (note) this.current.note = note.value;
        const hideStatus = q('.rr-ui-hide-status');
        if (hideStatus) this.current.hideStatusWindow = hideStatus.checked;
        this.touch();
        this.scheduleRender();
    }

    /** Reads every control of the property panel back into the selected node. */
    applyProperties(changedElement) {
        const node = this.selected();
        const panel = this.wrapper.querySelector('.rr-ui-props');
        if (!node || !panel) return;
        const q = cls => panel.querySelector('.' + cls);
        const num = (cls, min, max, fallback) => {
            const el = q(cls);
            if (!el) return fallback;
            const value = Number(el.value);
            return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
        };
        const optionalColor = cls => {
            const el = q(cls);
            const value = el ? el.value.trim() : '';
            return /^#[0-9a-f]{6}$/i.test(value) ? value : '';
        };
        node.name = q('p-name').value;
        const parent = Number(q('p-parent').value) || 0;
        const anchor = q('p-anchor').value;
        const reparent = parent !== node.parent && !this.wouldCycle(node.id, parent);
        const reanchor = DatabaseUserInterfaceEditor.ANCHORS[anchor] && anchor !== node.anchor;
        if (reparent || reanchor) {
            // A new parent or anchor changes what x/y are measured from;
            // keep the node where it is on screen and re-express the offset.
            const before = this.rects().get(node.id);
            if (reparent) node.parent = parent;
            if (reanchor) node.anchor = anchor;
            if (before) {
                const screen = this.screenSize();
                const parentRect = this.rects().get(node.parent) || { x: 0, y: 0, width: screen.width, height: screen.height };
                const [ax, ay] = DatabaseUserInterfaceEditor.ANCHORS[node.anchor];
                node.x = Math.round(before.x - (parentRect.x + parentRect.width * ax - before.width * ax));
                node.y = Math.round(before.y - (parentRect.y + parentRect.height * ay - before.height * ay));
            }
            if (reparent) this.canonicalizeNodes();
        } else {
            node.x = num('p-x', -9999, 9999, node.x);
            node.y = num('p-y', -9999, 9999, node.y);
        }
        node.width = num('p-width', 0, 9999, node.width);
        node.height = num('p-height', 0, 9999, node.height);
        node.opacity = num('p-opacity', 0, 255, node.opacity);
        this.readCondition(panel, 'p-visible', node.visible);
        if (node.type === 'box' || DatabaseUserInterfaceEditor.isControl(node.type)) {
            node.fill = q('p-fill').value;
            node.color = q('p-color').value;
            node.color2 = q('p-color2').value;
            node.fillOpacity = num('p-fillOpacity', 0, 255, node.fillOpacity);
            node.vertical = q('p-vertical').value === '1';
            node.borderWidth = num('p-borderWidth', 0, 32, node.borderWidth);
            node.borderColor = q('p-borderColor').value;
            node.radius = num('p-radius', 0, 200, node.radius);
            const fillColor = panel.querySelector('.rr-ui-fill-color');
            if (fillColor) fillColor.hidden = !(node.fill === 'color' || node.fill === 'gradient');
            panel.querySelectorAll('.rr-ui-gradient-end').forEach(el => {
                el.hidden = node.fill !== 'gradient';
                el.classList.toggle('rr-ui-hidden', node.fill !== 'gradient');
            });
        }
        if (node.type === 'input') {
            node.inputTarget = q('p-inputTarget').value;
            node.variableId = num('p-inputVariableId', 1, 9999, node.variableId || 1);
            node.maxLength = num('p-maxLength', 1, 99, node.maxLength || 16);
            node.mask = q('p-mask').checked;
            node.onScreenKeys = q('p-onScreenKeys').checked;
            node.autoEdit = q('p-autoEdit').checked;
            if (node.inputTarget !== 'variable') this.readActorBinding(panel, node, num);
            panel.querySelector('.rr-ui-input-variable').hidden = node.inputTarget !== 'variable';
            panel.querySelector('.rr-ui-input-actor').hidden = node.inputTarget === 'variable';
        }
        if (node.type === 'text' || node.type === 'button' || node.type === 'input') {
            node.text = q('p-text').value;
            if(q('p-labelScript')) node.labelScript=q('p-labelScript').value;
            node.align = q('p-align').value;
            node.fontSize = num('p-fontSize', 0, 200, node.fontSize);
            node.textColor = DatabaseUserInterfaceEditor.parseTextColor(q('p-textColor').value);
            node.fontFace = q('p-fontFace').value.trim();
            node.fontBold = q('p-fontBold').checked;
            node.fontItalic = q('p-fontItalic').checked;
            node.outline = q('p-outline').checked;
            node.outlineColor = optionalColor('p-outlineColor');
            node.outlineWidth = num('p-outlineWidth', 0, 32, node.outlineWidth);
            node.letterSpacing = num('p-letterSpacing', -20, 100, node.letterSpacing);
            if (node.type === 'text') node.wrap = !!(q('p-wrap') && q('p-wrap').checked);
            node.fitText = !!(q('p-fitText') && q('p-fitText').checked);
            if (node.type === 'text') {
                node.contextName = q('p-contextName').value.trim() || 'selection';
                this.readActorBinding(panel, node, num);
            }
        }
        if (node.type === 'image') {
            node.source = q('p-source').value;
            node.file = q('p-file').value.trim();
            node.index = num('p-index', 0, 9999, node.index);
            node.fit = q('p-fit').value;
            const sliceSafe = node.source === 'picture' || node.source === 'system';
            node.nineSlice = sliceSafe && q('p-nineSlice').checked;
            node.sliceLeft = num('p-sliceLeft', 0, 9999, node.sliceLeft);
            node.sliceTop = num('p-sliceTop', 0, 9999, node.sliceTop);
            node.sliceRight = num('p-sliceRight', 0, 9999, node.sliceRight);
            node.sliceBottom = num('p-sliceBottom', 0, 9999, node.sliceBottom);
            panel.querySelector('.rr-ui-image-file').hidden = node.source === 'icon' || node.source === 'partyFace';
            panel.querySelector('.rr-ui-image-index').hidden = !(node.source === 'face' || node.source === 'character' || node.source === 'icon');
            panel.querySelector('.rr-ui-image-actor').hidden = node.source !== 'partyFace';
            panel.querySelector('.rr-ui-nine-slice').hidden = !sliceSafe;
            if (node.source === 'partyFace') this.readActorBinding(panel, node, num);
        }
        if (node.type === 'list') {
            const oldLayout = node.rowLayout;
            node.rowLayout = q('p-rowLayout').value;
            if (q('p-portraitSize')) node.portraitSize = num('p-portraitSize', 32, 144, 144);
            if (q('p-actorPadding')) node.actorPadding = num('p-actorPadding', 0, 200, 12);
            if (q('p-actorGap')) node.actorGap = num('p-actorGap', 0, 200, 4);
            if (oldLayout === 'actorPanel') node.actorFields = ['portrait','name','class','level','hp','mp','tp','exp','states','atb'].filter(key => q('p-actorField-' + key)?.checked);
            if (q('p-portraitSource')) {
                node.portraitSource = q('p-portraitSource').value;
                node.portraitPattern = q('p-portraitPattern').value.trim() || 'Face_{id}';
                node.portraitFrames = Number(q('p-portraitFrames').value) === 5 ? 5 : 1;
                node.portraitMotion = q('p-portraitMotion').checked;
                node.portraitBreath = q('p-portraitBreath').checked;
                panel.querySelector('.rr-ui-portrait-picture').hidden = node.portraitSource !== 'picture';
            }
            node.dataSource = node.rowLayout === 'actorPanel' ? 'party' : q('p-dataSource').value;
            if (oldLayout !== node.rowLayout) { if (node.rowLayout === 'actorPanel') q('p-rowHeight').value = 256; queueMicrotask(() => this.renderProperties()); }
            node.category = q('p-category').value;
            this.readActorBinding(panel, node, num);
            node.skillTypeId = num('p-skillTypeId', 0, 9999, node.skillTypeId);
            node.includeAutosave = q('p-includeAutosave').checked;
            node.rangeStart = num('p-rangeStart', 1, 9999, node.rangeStart);
            node.rangeEnd = num('p-rangeEnd', 1, 9999, node.rangeEnd);
            node.items = DatabaseUserInterfaceEditor.parseLiteralItems(q('p-items').value);
            node.rowText = q('p-rowText').value;
            node.rowHeight = num('p-rowHeight', 24, 9999, node.rowHeight);
            node.align = q('p-align').value;
            node.fontSize = num('p-fontSize', 0, 200, node.fontSize);
            node.textColor = DatabaseUserInterfaceEditor.parseTextColor(q('p-textColor').value);
            node.fontFace = q('p-fontFace').value.trim();
            node.fontBold = q('p-fontBold').checked;
            node.fontItalic = q('p-fontItalic').checked;
            node.outline = q('p-outline').checked;
            node.outlineColor = optionalColor('p-outlineColor');
            node.outlineWidth = num('p-outlineWidth', 0, 32, node.outlineWidth);
            node.letterSpacing = num('p-letterSpacing', -20, 100, node.letterSpacing);
            node.contextName = q('p-contextName').value.trim() || 'selection';
            node.filterContext = q('p-filterContext').value.trim();
            node.compareContext = q('p-compareContext').value.trim();
            node.columns = num('p-columns', 1, 12, node.columns || 1);
            node.selectionVariableId = num('p-selectionVariableId', 0, 9999, node.selectionVariableId);
            node.selectionValue = q('p-selectionValue').value;
            for (const source of DatabaseUserInterfaceEditor.LIST_SOURCES) {
                const section = panel.querySelector('.rr-ui-list-' + source);
                if (section) section.hidden = node.dataSource !== source;
            }
            panel.querySelector('.rr-ui-list-actor').hidden = !DatabaseUserInterfaceEditor.ACTOR_LIST_SOURCES.includes(node.dataSource);
            panel.querySelector('.rr-ui-list-follow').hidden = !DatabaseUserInterfaceEditor.FOLLOWING_SOURCES.includes(node.dataSource);
            panel.querySelector('.rr-ui-list-compare').hidden = node.dataSource !== 'actorParameters';
        }
        if (node.type === 'battleWindow') {
            node.battleWindow = q('p-battleWindow').value;
            node.fill = q('p-fill').value === 'none' ? 'none' : 'window';
            node.windowColumns = num('p-windowColumns', 0, 12, 0);
            node.hideWindow = q('p-hideWindow').checked;
            node.followActor = q('p-followActor').checked;
            node.slideX = num('p-slideX', -2000, 2000, 0);
            node.slideY = num('p-slideY', -2000, 2000, 0);
            node.slideDuration = num('p-slideDuration', 1, 120, 12);
            node.file = q('p-file').value.trim();
            node.imageX = num('p-imageX', -2000, 2000, 0);
            node.imageY = num('p-imageY', -2000, 2000, 0);
        }
        if (node.type === 'battleCursor') {
            node.source = q('p-source').value === 'system' ? 'system' : 'picture';
            node.file = q('p-file').value.trim();
            node.frames = num('p-frames', 1, 60, 1);
            node.frameSpeed = num('p-frameSpeed', 1, 120, 8);
            node.floatRange = num('p-floatRange', 0, 100, 6);
            node.showName = q('p-showName').checked;
            node.actorFile = q('p-actorFile').value.trim();
            node.cursorSlide = q('p-cursorSlide').checked;
            node.fontSize = num('p-fontSize', 0, 200, 0);
            for (const key of ['enemyOffsetX', 'enemyOffsetY', 'actorOffsetX', 'actorOffsetY']) node[key] = num('p-' + key, -2000, 2000, 0);
        }
        if (node.type === 'gauge') {
            node.gauge = q('p-gauge').value;
            this.readActorBinding(panel, node, num);
            node.variableId = num('p-variableId', 1, 9999, node.variableId);
            node.max = num('p-max', 1, 999999999, node.max);
            node.maxVariableId = num('p-maxVariableId', 0, 9999, node.maxVariableId);
            node.label = q('p-label').value;
            node.showLabel = q('p-showLabel').checked;
            node.valueFormat = q('p-valueFormat').value;
            node.showValue = node.valueFormat !== 'hidden';
            const customColors = q('p-customGaugeColors').checked;
            node.gaugeColor1 = customColors ? q('p-gaugeColor1').value : '';
            node.gaugeColor2 = customColors ? q('p-gaugeColor2').value : '';
            node.gaugeBackColor = customColors ? q('p-gaugeBackColor').value : '';
            node.gaugeHeight = num('p-gaugeHeight', 0, 240, node.gaugeHeight);
            panel.querySelector('.rr-ui-gauge-party').hidden = node.gauge === 'variable';
            panel.querySelector('.rr-ui-gauge-variable').hidden = node.gauge !== 'variable';
            panel.querySelector('.rr-ui-gauge-scaled').hidden = !(['variable', 'mhp', 'mmp', 'atk', 'def', 'mat', 'mdf', 'agi', 'luk'].includes(node.gauge));
        }
        if (DatabaseUserInterfaceEditor.isControl(node.type)) {
            this.readAction(panel, 'p-action', node.action);
            this.readCondition(panel, 'p-enabled', node.enabled);
            node.highlightColor = q('p-highlightColor').value;
            this._controlPreviewState = q('p-previewState').value;
            node.focusedFillColor = optionalColor('p-focusedFillColor');
            node.focusedTextColor = optionalColor('p-focusedTextColor');
            node.focusedBorderColor = optionalColor('p-focusedBorderColor');
            node.focusedOpacity = DatabaseUserInterfaceEditor.optionalByte(q('p-focusedOpacity').value);
            node.pressedOffsetX = num('p-pressedOffsetX', -32, 32, node.pressedOffsetX);
            node.pressedOffsetY = num('p-pressedOffsetY', -32, 32, node.pressedOffsetY);
            node.pressedOpacity = DatabaseUserInterfaceEditor.optionalByte(q('p-pressedOpacity').value);
            node.disabledFillColor = optionalColor('p-disabledFillColor');
            node.disabledTextColor = optionalColor('p-disabledTextColor');
            node.disabledOpacity = DatabaseUserInterfaceEditor.optionalByte(q('p-disabledOpacity').value);
            for (const key of ['Up', 'Down', 'Left', 'Right']) node['focus' + key] = Number(q('p-focus' + key).value) || 0;
            node.backFocus = Number(q('p-backFocus').value) || 0;
            if (node.type === 'list') node.focusable = q('p-focusable').checked;
            const se = q('p-se').value.trim();
            node.se = se ? Object.assign({ name: se, volume: 90, pitch: 100, pan: 0 }, node.se || {}, { name: se }) : null;
        }
        this.touch();
        if (changedElement && (changedElement.classList.contains('p-name') || changedElement.classList.contains('p-text') || changedElement.classList.contains('p-file') || changedElement.classList.contains('p-gauge') || changedElement.classList.contains('p-label') || changedElement.classList.contains('p-dataSource'))) {
            this.renderTree();
            this.refreshFirstFocus();
            if (changedElement.classList.contains('p-name')) {
                const title = this.wrapper.querySelector('.rr-ui-inspector-title');
                if (title) title.textContent = node.name.trim() || `${this.typeLabel(node.rowLayout === 'actorPanel' ? 'actorPanel' : node.type)} #${node.id}`;
            }
        }
        if (changedElement && changedElement.classList.contains('p-parent')) {
            this.canonicalizeNodes();
            this.renderTree();
            this.refreshFirstFocus();
        }
        if (reparent || reanchor) this.syncPositionFields(node);
        this.scheduleRender();
    }

    // ==========================================
    // LISTENERS
    // ==========================================

    attachListeners() {
        const wrapper = this.wrapper;
        const q = selector => wrapper.querySelector(selector);

        q('[data-field="name"]').addEventListener('input', event => {
            this.current.name = event.target.value;
            this.touch();
        });
        q('.rr-ui-mode').addEventListener('change', event => {
            this.current.mode = ['overlay', 'battle'].includes(event.target.value) ? event.target.value : 'scene';
            this.touch();
            this.updatePresentationFields();
            this.scheduleRender();
        });
        const roles = q('.rr-ui-replacement-controls');
        roles.addEventListener('click', event => {
            const trigger = event.target.closest('.rr-ui-role-trigger');
            if (trigger) {
                this.openReplacementRoles(trigger.getAttribute('aria-expanded') !== 'true');
                return;
            }
            const option = event.target.closest('.rr-ui-role-option');
            if (option) this.toggleReplacementOption(option);
        });
        roles.addEventListener('input', event => {
            if (event.target.classList.contains('rr-ui-role-search')) {
                this._roleActiveIndex = 0;
                this.filterReplacementRoles(event.target.value);
            }
        });
        roles.addEventListener('keydown', event => {
            const trigger = event.target.closest('.rr-ui-role-trigger');
            const search = event.target.closest('.rr-ui-role-search');
            if (event.key === 'Escape') {
                event.preventDefault();
                this.openReplacementRoles(false);
                q('.rr-ui-role-trigger').focus({ preventScroll: true });
                return;
            }
            if (trigger && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                this.openReplacementRoles(true);
                return;
            }
            if (!search || !['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) return;
            const options = this.filterReplacementRoles(search.value);
            if (!options.length) return;
            event.preventDefault();
            if (event.key === 'ArrowDown') this._roleActiveIndex = (this._roleActiveIndex + 1) % options.length;
            else if (event.key === 'ArrowUp') this._roleActiveIndex = (this._roleActiveIndex + options.length - 1) % options.length;
            else { this.toggleReplacementOption(options[this._roleActiveIndex]); return; }
            this.filterReplacementRoles(search.value);
            options[this._roleActiveIndex].scrollIntoView({ block: 'nearest' });
        });
        document.addEventListener('pointerdown', this._onRoleOutside = event => {
            if (this.wrapper && !roles.contains(event.target)) this.openReplacementRoles(false);
        });
        q('.rr-ui-interface-settings').addEventListener('click', () => this.select(0));
        q('.rr-ui-inspector-close').addEventListener('click', () => q('.rr-ui-props-panel').classList.remove('is-open'));
        q('.rr-ui-playtest').addEventListener('click', () => this.playtest());
        q('.rr-ui-capture').addEventListener('click', () => this.capture());
        q('.rr-ui-capture-scene').addEventListener('change', event => {
            if (!this.loadCapture(event.target.value)) {
                this.clearReference();
                this.captureStatus(this._t('No capture yet'));
            }
        });
        q('.rr-ui-capture-clear').addEventListener('click', () => this.clearReference());
        q('.rr-ui-reference').addEventListener('change', event => {
            this.showReference = event.target.checked;
            this.syncCaptureTools();
            this.scheduleRender();
        });
        q('.rr-ui-reference-opacity').addEventListener('input', event => {
            this.referenceOpacity = Number(event.target.value) / 100;
            this.scheduleRender();
        });
        q('.rr-ui-capture-list').addEventListener('mousedown', event => {
            const row = event.target.closest('.rr-ui-capture-row-item');
            if (row && !event.target.closest('button')) row.focus({ preventScroll: true });
        });
        q('.rr-ui-capture-list').addEventListener('click', event => {
            if (event.target.closest('.rr-ui-capture-add-all')) {
                this.addAllFromCapture();
                return;
            }
            const row = event.target.closest('.rr-ui-capture-row-item');
            if (!row) return;
            const index = Number(row.dataset.index);
            const key = row.dataset.key;
            if (event.target.closest('.rr-ui-capture-add')) {
                const count = key.startsWith('s') ? this.addSceneElementFromCapture(index) : this.addWindowFromCapture(index);
                this.reportCaptureImport(count);
                return;
            }
            if (event.target.closest('.rr-ui-capture-picture')) {
                this.reportCaptureImport(this.addPictureFromCapture(index));
                return;
            }
            this.capturedSelection = this.capturedSelection === key ? -1 : key;
            this.renderCaptureList();
            this.scheduleRender();
        });

        wrapper.querySelectorAll('[data-stock-layout]').forEach(button => {
            button.addEventListener('click', () => {
                const menu = button.closest('.rr-ui-add-menu');
                if (menu) menu.open = false;
                this.applyStockLayout(button.dataset.stockLayout);
            });
        });
        wrapper.querySelectorAll('[data-add]').forEach(button => {
            button.addEventListener('click', () => {
                this.addNode(button.dataset.add);
                const menu = button.closest('.rr-ui-add-menu');
                if (menu) menu.open = false;
            });
        });
        q('.rr-ui-tree').addEventListener('mousedown', event => {
            const row = event.target.closest('.rr-ui-tree-row');
            if (row) row.focus({ preventScroll: true });
        });
        q('.rr-ui-tree').addEventListener('click', event => {
            const row = event.target.closest('.rr-ui-tree-row');
            if (row && row.dataset.id) this.select(Number(row.dataset.id), { toggle: event.ctrlKey || event.metaKey, range: event.shiftKey });
        });
        q('.rr-ui-tree').addEventListener('dragstart', event => {
            const row = event.target.closest('.rr-ui-tree-row[data-id]');
            if (!row) { event.preventDefault(); return; }
            this._layerDragId = Number(row.dataset.id);
            row.classList.add('is-dragging');
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', row.dataset.id);
            }
        });
        q('.rr-ui-tree').addEventListener('dragover', event => {
            const row = event.target.closest('.rr-ui-tree-row[data-id]');
            if (!row || !this._layerDragId || Number(row.dataset.id) === this._layerDragId) return;
            const target = this.node(Number(row.dataset.id));
            const bounds = row.getBoundingClientRect();
            const ratio = bounds.height > 0 ? (event.clientY - bounds.top) / bounds.height : 0.5;
            const placement = ratio < 0.28 ? 'before' : ratio > 0.72 ? 'after' : 'inside';
            if (placement === 'inside' && (!target || (target.type !== 'box' && target.type !== 'image'))) return;
            const roots = this.selectedIds.has(this._layerDragId) ? this.selectionRoots() : [this.node(this._layerDragId)];
            if (roots.some(root => root.id === target.id || this.wouldCycle(root.id, target.id))) return;
            event.preventDefault();
            q('.rr-ui-tree').querySelectorAll('.is-drop-before,.is-drop-after,.is-drop-inside').forEach(item => item.classList.remove('is-drop-before', 'is-drop-after', 'is-drop-inside'));
            row.classList.add('is-drop-' + placement);
            row.dataset.dropPlacement = placement;
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        });
        q('.rr-ui-tree').addEventListener('drop', event => {
            const row = event.target.closest('.rr-ui-tree-row[data-id]');
            if (!row || !this._layerDragId) return;
            event.preventDefault();
            this.moveNodeTo(this._layerDragId, Number(row.dataset.id), row.dataset.dropPlacement || 'after');
            this._layerDragId = 0;
        });
        q('.rr-ui-tree').addEventListener('dragend', () => {
            this._layerDragId = 0;
            q('.rr-ui-tree').querySelectorAll('.is-dragging,.is-drop-before,.is-drop-after,.is-drop-inside').forEach(item => {
                item.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after', 'is-drop-inside');
                delete item.dataset.dropPlacement;
            });
        });
        // Keys are handled for the whole editor, and stop here: the record
        // list's own Delete / Ctrl+Z shortcuts listen on the document and
        // would otherwise clear the record or undo the wrong thing.
        wrapper.addEventListener('keydown', event => this.onKey(event));
        q('.rr-ui-canvas-host').addEventListener('mousedown', event => {
            if (event.target !== this.canvas) this.canvas.focus({ preventScroll: true });
        });
        q('.rr-ui-send-back').addEventListener('click', () => this.moveNode(this.selectedId, -Infinity));
        q('.rr-ui-node-up').addEventListener('click', () => this.moveNode(this.selectedId, -1));
        q('.rr-ui-node-down').addEventListener('click', () => this.moveNode(this.selectedId, 1));
        q('.rr-ui-bring-front').addEventListener('click', () => this.moveNode(this.selectedId, Infinity));
        q('.rr-ui-node-duplicate').addEventListener('click', () => this.duplicateNode(this.selectedId));
        q('.rr-ui-node-delete').addEventListener('click', () => this.deleteNode(this.selectedId));
        q('.rr-ui-undo').addEventListener('click', () => this.undo());
        q('.rr-ui-redo').addEventListener('click', () => this.redo());
        q('.rr-ui-snap').addEventListener('change', event => { this.snap = event.target.checked; });
        q('.rr-ui-grid').addEventListener('change', event => { this.showGrid = event.target.checked; this.scheduleRender(); });

        const props = q('.rr-ui-props');
        let propsUndoArmed = true;
        props.addEventListener('focusin', () => { propsUndoArmed = true; });
        const onPropChange = event => {
            if(event.target.classList.contains('p-customElementKind')) return;
            if (event.target.classList.contains('p-actorElement')) {
                this._actorElementKey=event.target.value; this.renderProperties(); this.scheduleRender(); return;
            }
            const colorOption = event.target.closest('.rr-ui-color-option');
            if (colorOption) {
                const value = colorOption.querySelector('input[type="hidden"]');
                const swatch = colorOption.querySelector('.rr-ui-optional-swatch');
                const custom = colorOption.querySelector('.rr-ui-color-mode').value === 'custom';
                swatch.hidden = !custom;
                value.value = custom ? swatch.value : '';
            }
            if (this.selected() && propsUndoArmed) {
                // One undo step per field visit, not per keystroke.
                this.pushUndo();
                propsUndoArmed = false;
            }
            const elementField = event.target.closest('[data-actor-element-property]');
            if (elementField && this.selected()?.rowLayout === 'actorPanel') {
                const node=this.selected(), key=this._actorElementKey, prop=elementField.dataset.actorElementProperty;
                const input=elementField.querySelector('.p-element-'+prop);
                const value=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;
                node.actorElements ||= {}; node.actorElements[key] ||= {};
                const oldShape=node.actorElements[key].shape || 'rectangle';
                node.actorElements[key][prop]=value;
                if(prop==='shape' && value==='circular' && oldShape!=='circular') {
                    const previousHeight=node.actorElements[key].height || 6;
                    node.actorElements[key].width=node.actorElements[key].height=80;
                    if(!key.startsWith('custom_')) node.rowHeight+=Math.max(0,80-previousHeight);
                }
                node.actorElements=DatabaseUserInterfaceEditor.normalizeActorElements(node.actorElements);
                this.touch(); this.scheduleRender();
                if(event.type==='change' && ['shape','gauge','name'].includes(prop)) this.renderProperties();
                this.drawGaugeStylePreview();return;
            }
            if (this.selectedNodes().length > 1) {
                const bounds = this.selectionBounds();
                const x = props.querySelector('.p-group-x'), y = props.querySelector('.p-group-y');
                if (!x || !y || x.value === '' || y.value === '') return;
                this.translateSelection(Number(x.value) - bounds.x, Number(y.value) - bounds.y);
                this.touch();
                this.scheduleRender();
            } else if (this.selected()) this.applyProperties(event.target);
            else this.applyInterfaceProperties();
            if(event.type==='change' && /p-(actorField-|actorPadding|actorGap|portraitSize|rowHeight)/.test(event.target.className)) this.renderProperties();
        };
        props.addEventListener('input', onPropChange);
        props.addEventListener('change', onPropChange);
        props.addEventListener('toggle', event => {
            if (!event.target.matches('.rr-ui-property-section[data-section]')) return;
            this._propertySections ||= {};
            this._propertySections[event.target.dataset.section] = event.target.open;
        }, true);
        props.addEventListener('click', event => {
            if (event.target.classList.contains('p-element-reset') && this.selected()) {
                this.pushUndo();
                const node=this.selected(), key=this._actorElementKey, element=node.actorElements[key];
                if(key.startsWith('custom_')) node.actorElements[key]={kind:element.kind,name:element.name,text:element.kind==='label'?this._t('Custom Label'):'',gauge:element.gauge,variableId:element.variableId,maxVariableId:element.maxVariableId,max:element.max};
                else delete node.actorElements[key];
                this.touch(); this.renderProperties(); this.scheduleRender();
            }
            if(event.target.classList.contains('p-element-add')) this.addCustomActorElement(props.querySelector('.p-customElementKind').value);
            if(event.target.classList.contains('p-element-remove')) {this.pushUndo();delete this.selected().actorElements[this._actorElementKey];this.touch();this.renderProperties();this.scheduleRender();}
            if(event.target.classList.contains('rr-ui-expand-script')) this.expandScript(event.target.parentElement.querySelector('textarea'));
            if (event.target.classList.contains('p-browse')) this.browseImage();
            if (event.target.classList.contains('p-se-browse')) this.browseSe();
        });

        this.attachCanvasListeners();

        this._resizeObserver = typeof ResizeObserver === 'function'
            ? new ResizeObserver(() => { this.fitCanvas(); this.scheduleRender(); }) : null;
        if (this._resizeObserver) this._resizeObserver.observe(q('.rr-ui-canvas-host'));
    }

    attachCanvasListeners() {
        const canvas = this.canvas;
        const toCanvas = event => {
            const bounds = canvas.getBoundingClientRect();
            return {
                x: (event.clientX - bounds.left) / this.scale,
                y: (event.clientY - bounds.top) / this.scale
            };
        };
        canvas.addEventListener('mousedown', event => {
            if (event.button !== 0) return;
            // Measure before focusing: a focus that scrolls the canvas would
            // move the bounds the event's coordinates were taken against.
            const point = toCanvas(event);
            canvas.focus({ preventScroll: true });
            const rects = this.rects();
            const selected = this.selected();
            if (selected && this.selectedNodes().length === 1 && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
                const handle = this.handleAt(rects.get(selected.id), point);
                if (handle) {
                    this.pushUndo();
                    this.drag = { kind: 'resize', handle, node: selected, start: point, origin: { x: selected.x, y: selected.y, width: selected.width, height: selected.height }, rect: rects.get(selected.id) };
                    event.preventDefault();
                    return;
                }
            }
            const hit = this.nodeAt(rects, point);
            if (hit) {
                if (event.shiftKey || event.ctrlKey || event.metaKey) {
                    this.select(hit.id, { toggle: true });
                    event.preventDefault();
                    return;
                }
                if (!this.selectedNodes().includes(hit)) this.select(hit.id);
                this.pushUndo();
                const roots = this.selectionRoots();
                const primary = roots.includes(hit) ? hit : roots[0];
                this.drag = { kind: 'move', node: primary, start: point, origin: { x: primary.x, y: primary.y },
                    origins: roots.map(node => ({ node, x: node.x, y: node.y })), moved: false };
            } else if (this.selectedId) {
                this.select(0);
            }
            event.preventDefault();
        });
        window.addEventListener('mousemove', this._onMouseMove = event => {
            if (!this.drag) {
                if (this.wrapper && this.wrapper.isConnected) this.updateCursor(toCanvas(event));
                return;
            }
            const point = toCanvas(event);
            const dx = point.x - this.drag.start.x;
            const dy = point.y - this.drag.start.y;
            const snap = value => this.snap && !event.altKey ? Math.round(value / DatabaseUserInterfaceEditor.GRID) * DatabaseUserInterfaceEditor.GRID : Math.round(value);
            const node = this.drag.node;
            if (this.drag.kind === 'move') {
                this.translateSelection(snap(this.drag.origin.x + dx) - this.drag.origin.x,
                    snap(this.drag.origin.y + dy) - this.drag.origin.y, this.drag.origins);
                this.drag.moved = true;
            } else {
                this.applyResize(node, this.drag, dx, dy, snap);
            }
            this.touch();
            this.syncPositionFields(node);
            this.scheduleRender();
        });
        window.addEventListener('mouseup', this._onMouseUp = () => {
            if (!this.drag) return;
            if (this.drag.kind === 'move' && !this.drag.moved) this.undoStack.pop();
            this.drag = null;
        });
    }

    /** Keyboard for everything in the editor that is not a text field. */
    onKey(event) {
        const target = event.target;
        const tag = target && target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target && target.isContentEditable)) return;
        const handled = () => { event.preventDefault(); event.stopPropagation(); };
        const key = event.key.toLowerCase();
        const mod = event.ctrlKey || event.metaKey;
        if (mod && key === 'z') { handled(); if (event.shiftKey) this.redo(); else this.undo(); return; }
        if (mod && key === 'a') {
            handled();
            const nodes = DatabaseUserInterfaceEditor.orderNodes(this.current.nodes);
            if (nodes.length) { this.select(nodes[0].id); this.select(nodes.at(-1).id, { range: true }); }
            return;
        }
        if (mod && key === 'y') { handled(); this.redo(); return; }
        const erase = event.key === 'Delete' || event.key === 'Backspace';
        if (target && target.closest && target.closest('.rr-ui-capture-list')) {
            // A captured window is a reference, not a node: Delete drops the highlight.
            if (erase) {
                handled();
                this.capturedSelection = -1;
                this.renderCaptureList();
                this.scheduleRender();
            }
            return;
        }
        const node = this.selected();
        if (!node) {
            if (erase) handled();
            return;
        }
        if (mod && key === 'd') { handled(); this.duplicateNode(node.id); return; }
        if (erase) { handled(); this.deleteNode(node.id); return; }
        if (target && target.closest && target.closest('.rr-ui-tree')) {
            if (event.altKey && event.key === 'ArrowUp') { handled(); this.moveNode(node.id, -1); return; }
            if (event.altKey && event.key === 'ArrowDown') { handled(); this.moveNode(node.id, 1); return; }
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                handled();
                const rows = [...this.wrapper.querySelectorAll('.rr-ui-tree-row[data-id]')];
                const index = rows.findIndex(row => Number(row.dataset.id) === node.id);
                const next = rows[Math.min(rows.length - 1, Math.max(0, index + (event.key === 'ArrowUp' ? -1 : 1)))];
                if (next) { this.select(Number(next.dataset.id), { range: event.shiftKey }); next.focus({ preventScroll: true }); }
                return;
            }
        }
        if (target !== this.canvas) return;
        const step = event.shiftKey ? DatabaseUserInterfaceEditor.GRID : 1;
        const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (moves[event.key]) {
            handled();
            this.pushUndo();
            this.translateSelection(...moves[event.key]);
            this.touch();
            this.syncPositionFields(node);
            this.scheduleRender();
        }
    }

    detach() {
        if (this._onMouseMove) window.removeEventListener('mousemove', this._onMouseMove);
        if (this._onMouseUp) window.removeEventListener('mouseup', this._onMouseUp);
        if (this._onRoleOutside && typeof document !== 'undefined') document.removeEventListener('pointerdown', this._onRoleOutside);
        if (this._captureTimer) clearTimeout(this._captureTimer);
        if (this._resizeObserver) this._resizeObserver.disconnect();
        this.captureInFlight = false;
        this._layerDragId = 0;
        this._onMouseMove = this._onMouseUp = this._onRoleOutside = this._resizeObserver = this._captureTimer = null;
    }

    syncPositionFields(node) {
        const panel = this.wrapper.querySelector('.rr-ui-props');
        if (!panel) return;
        if (this.selectedNodes().length > 1) {
            const bounds = this.selectionBounds();
            for (const axis of ['x', 'y']) {
                const field = panel.querySelector('.p-group-' + axis);
                if (field && document.activeElement !== field) field.value = bounds[axis];
            }
            return;
        }
        if (node !== this.selected()) return;
        const set = (cls, value) => { const el = panel.querySelector('.' + cls); if (el && document.activeElement !== el) el.value = value; };
        set('p-x', node.x);
        set('p-y', node.y);
        set('p-width', node.width);
        set('p-height', node.height);
    }

    applyResize(node, drag, dx, dy, snap) {
        const { handle, origin } = drag;
        const [ax, ay] = DatabaseUserInterfaceEditor.ANCHORS[node.anchor] || [0, 0];
        const min = 8;
        let width = origin.width || drag.rect.width;
        let height = origin.height || drag.rect.height;
        let x = origin.x;
        let y = origin.y;
        if (handle.includes('e')) width = Math.max(min, snap(width + dx));
        if (handle.includes('s')) height = Math.max(min, snap(height + dy));
        if (handle.includes('w')) {
            const newWidth = Math.max(min, snap(width - dx));
            x = origin.x + (width - newWidth) * (1 - ax);
            width = newWidth;
        } else if (handle.includes('e')) {
            x = origin.x + (width - (origin.width || drag.rect.width)) * ax;
        }
        if (handle.includes('n')) {
            const newHeight = Math.max(min, snap(height - dy));
            y = origin.y + (height - newHeight) * (1 - ay);
            height = newHeight;
        } else if (handle.includes('s')) {
            y = origin.y + (height - (origin.height || drag.rect.height)) * ay;
        }
        node.width = Math.round(width);
        node.height = Math.round(height);
        node.x = Math.round(x);
        node.y = Math.round(y);
    }

    handleAt(rect, point) {
        if (!rect) return null;
        const size = 8 / this.scale;
        const handles = this.handles(rect);
        for (const [name, hx, hy] of handles) {
            if (Math.abs(point.x - hx) <= size && Math.abs(point.y - hy) <= size) return name;
        }
        return null;
    }

    handles(rect) {
        const { x, y, width: w, height: h } = rect;
        return [
            ['nw', x, y], ['n', x + w / 2, y], ['ne', x + w, y],
            ['w', x, y + h / 2], ['e', x + w, y + h / 2],
            ['sw', x, y + h], ['s', x + w / 2, y + h], ['se', x + w, y + h]
        ];
    }

    nodeAt(rects, point) {
        const ordered = DatabaseUserInterfaceEditor.orderNodes(this.current.nodes);
        for (let i = ordered.length - 1; i >= 0; i--) {
            const node = ordered[i];
            const rect = rects.get(node.id);
            if (!rect) continue;
            if (point.x >= rect.x && point.y >= rect.y && point.x < rect.x + rect.width && point.y < rect.y + rect.height) return node;
        }
        return null;
    }

    updateCursor(point) {
        const selected = this.selected();
        let cursor = 'default';
        if (selected && this.selectedNodes().length === 1) {
            const handle = this.handleAt(this.rects().get(selected.id), point);
            if (handle) cursor = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' }[handle];
        }
        if (cursor === 'default' && this.nodeAt(this.rects(), point)) cursor = 'move';
        this.canvas.style.cursor = cursor;
    }

    // ==========================================
    // PICKERS
    // ==========================================

    browseImage() {
        const node = this.selected();
        const project = this.project();
        if (!node || !['image', 'battleWindow', 'battleCursor'].includes(node.type) || !project || !project.path) return;
        const folder = node.type === 'battleWindow' ? 'pictures' : node.type === 'battleCursor' ? (node.source === 'system' ? 'system' : 'pictures')
            : node.source === 'icon' || node.source === 'partyFace' ? null : DatabaseUserInterfaceEditor.IMAGE_FOLDERS[node.source];
        if (!folder || !this.parentEditor || typeof this.parentEditor.showImagePicker !== 'function') return;
        const path = require('path');
        const dir = path.join(project.path, 'img', folder);
        let files = [];
        try {
            files = folder === 'pictures'
                ? RRAssetFiles.listImageReferences(dir)
                : RRAssetFiles.listNames(dir, ['.png']);
        } catch (error) {
            console.error('Error reading image folder:', error);
            return;
        }
        const sheetType = node.type !== 'image' ? undefined : node.source === 'face' ? 'face' : node.source === 'character' ? 'character' : undefined;
        this.parentEditor.showImagePicker(this._t('Select Image'), files, (selectedFile, selectedIndex) => {
            this.pushUndo();
            node.file = selectedFile || '';
            if (sheetType && Number.isInteger(selectedIndex)) node.index = selectedIndex;
            this.touch();
            this.renderTree();
            this.renderProperties();
            this.scheduleRender();
        }, fileName => node.source === 'picture'
            ? RRAssetFiles.imageUrlFor(dir, fileName)
            : RRAssetFiles.urlFor(dir, fileName, ['.png']), node.file, Object.assign({
            allowNone: true,
            selectButtonLabel: this._t('Select Image')
        }, sheetType ? { sheetType, currentIndex: node.index || 0 } : {}));
    }

    browseSe() {
        const node = this.selected();
        const project = this.project();
        if (!node || (node.type !== 'button' && node.type !== 'list') || !project || !project.path) return;
        if (typeof RRAudioPickerModal === 'undefined' || typeof RRAssetFiles === 'undefined') return;
        const path = require('path');
        const sePath = path.join(project.path, 'audio', 'se');
        let files = [];
        try {
            files = RRAssetFiles.listUnique(sePath, RRAssetFiles.AUDIO_EXTENSIONS);
        } catch (error) {
            console.error('Error reading se folder:', error);
            return;
        }
        const current = node.se || { name: '', volume: 90, pitch: 100, pan: 0 };
        RRAudioPickerModal.open({
            title: this._t('Select Sound Effect'),
            folderLabel: 'SE',
            files,
            selected: current.name || '',
            levels: { volume: current.volume, pitch: current.pitch, pan: current.pan },
            loopDefault: false,
            zIndex: 21000,
            onOk: result => {
                this.pushUndo();
                node.se = result && result.name
                    ? { name: result.name, volume: result.volume, pitch: result.pitch, pan: result.pan } : null;
                this.touch();
                this.renderProperties();
            }
        });
    }

    // ------------------------------------------------------------------
    // Capture from game: the live scene as a reference layer.

    static get CAPTURE_SCENES() {
        return [
            ['menu', 'Main Menu'], ['title', 'Title Screen'], ['item', 'Items'], ['skill', 'Skills'],
            ['equip', 'Equipment'], ['status', 'Status'], ['options', 'Options'], ['save', 'Save'],
            ['load', 'Load'], ['shop', 'Shop'], ['gameEnd', 'Game End'], ['battle', 'Battle']
        ];
    }

    captureSceneOptions() {
        return DatabaseUserInterfaceEditor.CAPTURE_SCENES
            .map(([key, label]) => `<option value="${key}">${this.escapeHTML(this._t(label))}</option>`).join('');
    }

    /** Where a project's capture of `sceneKey` lives: the editor's cache, never the project. */
    captureDir(sceneKey) {
        const project = this.project();
        if (!project || !project.path || typeof RREditorCache === 'undefined') return null;
        return RREditorCache.dir('InterfaceCaptures', project.path, String(sceneKey).replace(/[^a-zA-Z0-9]/g, ''));
    }

    captureStatus(text) {
        const status = this.wrapper && this.wrapper.querySelector('.rr-ui-capture-status');
        if (status) status.textContent = text || '';
    }

    async capture() {
        const scene = this.wrapper.querySelector('.rr-ui-capture-scene').value;
        const dir = this.captureDir(scene);
        const project = this.project();
        const manager = this.parentEditor && this.parentEditor.playtestManager;
        if (!dir || !project || !manager || typeof manager.captureScene !== 'function') {
            this.captureStatus(this._t('Capture needs the desktop editor.'));
            return;
        }
        if (this.captureInFlight) return;
        const controller = window.reactor && window.reactor.projectController;
        this.captureUnsaved = !!(controller && typeof controller.hasUnsavedChanges === 'function' && controller.hasUnsavedChanges());
        const fs = require('fs');
        const path = require('path');
        try {
            fs.mkdirSync(dir, { recursive: true });
            for (const file of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, file));
        } catch (error) { /* a fresh folder next */ }
        if (!manager.captureScene(project.path, scene, dir)) {
            this.captureStatus(this._t('Capture failed'));
            return;
        }
        this.captureInFlight = true;
        const tray = this.wrapper.querySelector('.rr-ui-game-reference');
        if (tray) tray.open = true;
        this.captureStatus(this._t('Capturing…'));
        const started = Date.now();
        const poll = () => {
            if (!this.wrapper || !this.wrapper.isConnected) { this.captureInFlight = false; return; }
            const file = path.join(dir, 'capture.json');
            if (fs.existsSync(file)) {
                this.captureInFlight = false;
                this.loadCapture(scene, { unsaved: this.captureUnsaved });
                return;
            }
            if (Date.now() - started > 120000) {
                this.captureInFlight = false;
                this.captureStatus(this._t('Capture failed'));
                return;
            }
            this._captureTimer = setTimeout(poll, 500);
        };
        this._captureTimer = setTimeout(poll, 1500);
    }

    /** Read a capture off disk into the reference layer. */
    loadCapture(sceneKey, { unsaved = false } = {}) {
        const dir = this.captureDir(sceneKey);
        if (!dir) return false;
        const fs = require('fs');
        const path = require('path');
        const file = path.join(dir, 'capture.json');
        if (!fs.existsSync(file)) return false;
        let data = null;
        try {
            data = JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (error) {
            this.captureStatus(this._t('Capture failed'));
            return false;
        }
        if (!data || data.error) {
            this.captureStatus(this._t('Capture failed') + (data && data.error ? ': ' + data.error : ''));
            return false;
        }
        const reference = { scene: sceneKey, dir, data, image: null };
        if (data.screenFile) {
            const image = new Image();
            image.onload = () => this.scheduleRender();
            image.src = 'data:image/png;base64,' + fs.readFileSync(path.join(dir, data.screenFile)).toString('base64');
            reference.image = image;
        }
        this.reference = reference;
        this.capturedSelection = -1;
        const label = (DatabaseUserInterfaceEditor.CAPTURE_SCENES.find(([key]) => key === sceneKey) || [sceneKey, sceneKey])[1];
        const when = data.capturedAt ? new Date(data.capturedAt) : null;
        this.captureStatus(`${this._t(label)} · ${data.windows ? data.windows.length : 0} ${this._t('windows')}`
            + (when ? ` · ${when.toLocaleTimeString()}` : '')
            + (unsaved ? ` · ${this._t('Unsaved changes are not in the capture.')}` : ''));
        const select = this.wrapper && this.wrapper.querySelector('.rr-ui-capture-scene');
        if (select) select.value = sceneKey;
        this.syncCaptureTools();
        const tray = this.wrapper && this.wrapper.querySelector('.rr-ui-game-reference');
        if (tray) tray.open = true;
        this.renderTree();
        this.renderCaptureList();
        this.scheduleRender();
        return true;
    }

    /** Drops the reference layer and its window list; the capture stays cached for a later pick. */
    clearReference() {
        this.reference = null;
        this.capturedSelection = -1;
        this.captureStatus('');
        this.syncCaptureTools();
        this.renderTree();
        this.renderCaptureList();
        this.scheduleRender();
    }

    syncCaptureTools() {
        const clear = this.wrapper && this.wrapper.querySelector('.rr-ui-capture-clear');
        const tools = this.wrapper && this.wrapper.querySelector('.rr-ui-reference-tools');
        const opacity = this.wrapper && this.wrapper.querySelector('.rr-ui-reference-opacity-wrap');
        if (clear) clear.hidden = !this.reference;
        if (tools) tools.hidden = !this.reference;
        if (opacity) opacity.hidden = !this.reference || !this.showReference;
    }

    renderCaptureList() {
        const host = this.wrapper && this.wrapper.querySelector('.rr-ui-capture-list');
        if (!host) return;
        const focused = host.contains(document.activeElement);
        host.innerHTML = '';
        const data = this.reference && this.reference.data;
        const restoreFocus = () => {
            if (focused) (host.querySelector('.rr-ui-capture-row-item.selected') || this.wrapper.querySelector('.rr-ui-tree')).focus({ preventScroll: true });
        };
        const items = DatabaseUserInterfaceEditor.captureItems(data);
        if (!items.length) { restoreFocus(); return; }
        const head = document.createElement('div');
        head.className = 'rr-ui-capture-head';
        const title = document.createElement('span');
        title.textContent = `${this._t('Captured layers')} · ${this._t('Back')} → ${this._t('Front')}`;
        const addAll = document.createElement('button');
        addAll.type = 'button';
        addAll.className = 'rr-btn-chip rr-ui-capture-add-all';
        addAll.textContent = this.current.nodes.length ? this._t('Add All to Front') : this._t('Use as Starting Layout');
        addAll.title = this._t('Add every captured window and its contents as nodes');
        head.appendChild(title);
        head.appendChild(addAll);
        host.appendChild(head);
        const addRow = (key, index, kind, text, tooltip) => {
            const row = document.createElement('div');
            row.className = 'rr-ui-tree-row rr-ui-capture-row-item' + (key === this.capturedSelection ? ' selected' : '');
            row.dataset.index = String(index);
            row.dataset.key = key;
            row.tabIndex = -1;
            row.setAttribute('aria-label', `${kind}: ${text}`);
            const ordinal = document.createElement('span');
            ordinal.className = 'rr-ui-tree-ordinal';
            ordinal.textContent = String(host.querySelectorAll('.rr-ui-capture-row-item').length + 1);
            const type = document.createElement('span');
            type.className = 'rr-ui-tree-type';
            type.textContent = kind;
            const label = document.createElement('span');
            label.className = 'rr-ui-tree-label';
            label.textContent = text;
            label.title = tooltip || '';
            const add = document.createElement('button');
            add.type = 'button';
            add.className = 'rr-btn-chip rr-ui-capture-add';
            add.textContent = this._t('Add to Front');
            add.title = this._t('Add this as nodes');
            row.appendChild(ordinal);
            row.appendChild(type);
            row.appendChild(label);
            if (key.startsWith('w') && data.windows[index] && data.windows[index].contentsFile) {
                const picture = document.createElement('button');
                picture.type = 'button';
                picture.className = 'rr-btn-chip rr-ui-capture-picture';
                picture.textContent = this._t('Picture');
                picture.title = this._t("Save this window's contents as a picture and add it as an Image node");
                row.appendChild(picture);
            }
            row.appendChild(add);
            host.appendChild(row);
        };
        items.forEach(item => {
            if (item.kind === 'element') {
                const element = data.elements[item.index];
                const what = element.kind === 'image' ? `${element.source}/${element.file}` : String(element.text || element.kind).slice(0, 24);
                addRow('s' + item.index, item.index, this.typeLabel(element.kind === 'box' ? 'box' : element.kind), `${what}  ${Math.round(element.x)},${Math.round(element.y)}`, '');
            } else {
                const entry = data.windows[item.index];
                const count = entry.elements ? entry.elements.length : 0;
                addRow('w' + item.index, item.index, this._t('Window'), `${entry.className}  ${Math.round(entry.x)},${Math.round(entry.y)}  ${Math.round(entry.width)}×${Math.round(entry.height)}${count ? '  +' + count : ''}`, entry.windowskinName || '');
            }
        });
        if (data.plugins && data.plugins.length) {
            const note = document.createElement('div');
            note.className = 'rr-ui-capture-plugins';
            note.textContent = `${this._t('Plugins active in the capture:')} ${data.plugins.length}`;
            note.title = data.plugins.join('\n');
            host.appendChild(note);
        }
        restoreFocus();
    }

    /** Unified capture order when available; legacy captures draw scene elements behind windows. */
    static captureItems(data) {
        if (!data) return [];
        if (Array.isArray(data.layers)) {
            return data.layers.filter(layer => layer && Number.isInteger(layer.index)
                && (layer.kind === 'element' && data.elements && data.elements[layer.index]
                    || layer.kind === 'window' && data.windows && data.windows[layer.index]));
        }
        return [
            ...(data.elements || []).map((entry, index) => ({ kind: 'element', index })),
            ...(data.windows || []).map((entry, index) => ({ kind: 'window', index }))
        ];
    }

    /** What a stock command symbol does, as a button action. */
    static actionForSymbol(symbol) {
        const scenes = { item: 'item', skill: 'skill', equip: 'equip', status: 'status', save: 'save', load: 'load', options: 'options', gameEnd: 'gameEnd', continue: 'load', toTitle: 'title' };
        if (scenes[symbol]) return Object.assign(DatabaseUserInterfaceEditor.defaultAction('scene'), { scene: scenes[symbol] });
        if (symbol === 'cancel') return DatabaseUserInterfaceEditor.defaultAction('close');
        return DatabaseUserInterfaceEditor.defaultAction('none');
    }

    /** A node for one captured element, positioned under `parent` at the element's offset. */
    static nodeFromElement(element, id, parent, offset) {
        const clamp = value => Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 255)));
        const at = node => Object.assign(node, { parent, anchor: 'topLeft', x: Math.round(element.x + offset.x), y: Math.round(element.y + offset.y), opacity: clamp(element.opacity) });
        switch (element.kind) {
            case 'text': {
                const node = at(DatabaseUserInterfaceEditor.defaultNode('text', id));
                node.text = String(element.text || '');
                node.name = node.text.replace(/\\[A-Za-z]+(\[[^\]]*\])?/g, '').trim().slice(0, 24);
                node.width = Math.max(0, Math.round(element.width || 0));
                node.height = 0;
                node.align = ['left', 'center', 'right'].includes(element.align) ? element.align : 'left';
                node.fontSize = Math.max(0, Math.round(element.fontSize || 0));
                node.textColor = typeof element.textColor === 'number' ? element.textColor : (typeof element.textColor === 'string' && /^#[0-9a-f]{6}$/i.test(element.textColor) ? element.textColor : 0);
                node.outline = element.outline !== false;
                node.fitText = element.fitText === true;
                return node;
            }
            case 'image': {
                const node = at(DatabaseUserInterfaceEditor.defaultNode('image', id));
                node.source = DatabaseUserInterfaceEditor.IMAGE_SOURCES.includes(element.source) ? element.source : 'picture';
                node.file = String(element.file || '');
                node.index = Math.max(0, Math.round(element.index || 0));
                node.width = Math.max(1, Math.round(element.width || 0));
                node.height = Math.max(1, Math.round(element.height || 0));
                node.fit = element.fit === 'stretch' ? 'stretch' : 'none';
                node.name = node.source === 'partyFace' ? '' : node.file;
                return node;
            }
            case 'gauge': {
                const node = at(DatabaseUserInterfaceEditor.defaultNode('gauge', id));
                node.gauge = DatabaseUserInterfaceEditor.GAUGE_KINDS.includes(element.gauge) ? element.gauge : 'hp';
                node.index = Math.max(0, Math.round(element.index || 0));
                node.width = Math.max(1, Math.round(element.width || 128));
                node.height = Math.max(1, Math.round(element.height || 24));
                return node;
            }
            case 'button': {
                const node = at(DatabaseUserInterfaceEditor.defaultNode('button', id));
                node.fill = 'none';
                node.text = String(element.text || '');
                node.name = node.text.slice(0, 24);
                node.width = Math.max(1, Math.round(element.width || 0));
                node.height = Math.max(1, Math.round(element.height || 0));
                node.align = ['left', 'center', 'right'].includes(element.align) ? element.align : 'center';
                node.action = DatabaseUserInterfaceEditor.actionForSymbol(String(element.symbol || ''));
                if (element.enabled === false) node.enabled = { type: 'never', id: 1, on: true, op: '==', value: 0, script: '' };
                return node;
            }
            case 'box': {
                const node = at(DatabaseUserInterfaceEditor.defaultNode('box', id));
                node.fill = element.gradient ? 'gradient' : 'color';
                node.color = /^#[0-9a-f]{6}$/i.test(element.color || '') ? element.color : '#000000';
                node.color2 = /^#[0-9a-f]{6}$/i.test(element.color2 || '') ? element.color2 : node.color;
                node.vertical = !!element.vertical;
                node.fillOpacity = clamp(element.fillOpacity);
                node.width = Math.max(1, Math.round(element.width || 0));
                node.height = Math.max(1, Math.round(element.height || 0));
                node.name = 'Fill ' + node.color;
                return node;
            }
            default:
                return null;
        }
    }

    /**
     * Nodes for a capture: a Box per window, skinned like it, with the
     * window's elements as children; scene sprites as root nodes. Ids are
     * assigned from `nextId` up. `which` limits the windows by index
     * (null = all) and `includeScene` adds the sprites outside windows.
     */
    static nodesFromCapture(data, { which = null, includeScene = true, nextId = 1 } = {}) {
        const nodes = [];
        let id = nextId;
        const clamp = value => Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 255)));
        const addWindow = entry => {
            if (!entry || entry.visible === false || !(entry.width > 0) || !(entry.height > 0)) return;
            const box = DatabaseUserInterfaceEditor.defaultNode('box', id++);
            box.name = String(entry.className || 'Window');
            box.x = Math.round(entry.x);
            box.y = Math.round(entry.y);
            box.width = Math.round(entry.width);
            box.height = Math.round(entry.height);
            // A window with opacity 0 hides its frame and back but not its
            // contents; a Box's opacity fades its children, so it goes
            // unfilled instead.
            if (Number.isFinite(entry.opacity) && entry.opacity <= 0) box.fill = 'none';
            else if (Number.isFinite(entry.opacity)) box.opacity = clamp(entry.opacity);
            if (Number.isFinite(entry.backOpacity)) box.fillOpacity = clamp(entry.backOpacity);
            nodes.push(box);
            for (const element of entry.elements || []) {
                const node = DatabaseUserInterfaceEditor.nodeFromElement(element, id, 0, { x: 0, y: 0 });
                if (node) { node.parent = box.id; nodes.push(node); id++; }
            }
        };
        for (const layer of DatabaseUserInterfaceEditor.captureItems(data)) {
            if (layer.kind === 'element') {
                if (includeScene) {
                    const node = DatabaseUserInterfaceEditor.nodeFromElement(data.elements[layer.index], id, 0, { x: 0, y: 0 });
                    if (node) { nodes.push(node); id++; }
                }
            } else if (!which || which.includes(layer.index)) {
                addWindow(data.windows[layer.index]);
            }
        }
        return nodes;
    }

    /** Adds converted nodes to the record as one undo step and selects the first. */
    addCaptureNodes(nodes) {
        if (!nodes.length) return 0;
        this.pushUndo();
        for (const node of nodes) this.current.nodes.push(node);
        this.current.nodes = DatabaseUserInterfaceEditor.orderNodes(this.current.nodes);
        this.touch();
        this.refreshFirstFocus();
        this.select(nodes[0].id);
        this.renderCaptureList();
        return nodes.length;
    }

    /** Every window and sprite of the capture, as nodes. */
    addAllFromCapture() {
        const data = this.reference && this.reference.data;
        if (!data) return 0;
        const count = this.addCaptureNodes(DatabaseUserInterfaceEditor.nodesFromCapture(data, { nextId: this.nextCaptureNodeId() }));
        this.reportCaptureImport(count);
        return count;
    }

    /** One captured window (Box + its elements) or one scene sprite, as nodes. */
    addWindowFromCapture(index) {
        const data = this.reference && this.reference.data;
        if (!data) return 0;
        return this.addCaptureNodes(DatabaseUserInterfaceEditor.nodesFromCapture(data, { which: [index], includeScene: false, nextId: this.nextCaptureNodeId() }));
    }

    /**
     * The captured contents of one window, copied into the project's
     * img/pictures as Capture_<class>[_n].png and placed as an Image node at
     * the window's client area. The fallback for anything a plugin paints
     * on the canvas directly, which no primitive log can see.
     */
    addPictureFromCapture(index) {
        const data = this.reference && this.reference.data;
        const entry = data && data.windows && data.windows[index];
        const project = this.project();
        if (!entry || !entry.contentsFile || !project || !project.path) return 0;
        let file = '';
        try {
            const fs = require('fs');
            const path = require('path');
            const folder = path.join(project.path, 'img', 'pictures');
            fs.mkdirSync(folder, { recursive: true });
            const base = 'Capture_' + String(entry.className || 'Window').replace(/[^A-Za-z0-9_]/g, '');
            file = base;
            for (let n = 2; fs.existsSync(path.join(folder, file + '.png')); n++) file = base + '_' + n;
            fs.copyFileSync(path.join(this.reference.dir, entry.contentsFile), path.join(folder, file + '.png'));
        } catch (error) {
            console.error('Could not save the captured window as a picture:', error);
            this.captureStatus(this._t('Capture failed'));
            return 0;
        }
        const pad = Number.isFinite(entry.padding) ? entry.padding : 12;
        const node = DatabaseUserInterfaceEditor.nodeFromElement({
            kind: 'image', source: 'picture', file, index: 0, x: entry.x + pad, y: entry.y + pad,
            width: entry.contentsWidth || Math.max(1, entry.width - pad * 2), height: entry.contentsHeight || Math.max(1, entry.height - pad * 2), opacity: 255
        }, this.nextCaptureNodeId(), 0, { x: 0, y: 0 });
        this.images.delete('pictures/' + file);
        return this.addCaptureNodes([node]);
    }

    addSceneElementFromCapture(index) {
        const data = this.reference && this.reference.data;
        const element = data && data.elements && data.elements[index];
        if (!element) return 0;
        const node = DatabaseUserInterfaceEditor.nodeFromElement(element, this.nextCaptureNodeId(), 0, { x: 0, y: 0 });
        return node ? this.addCaptureNodes([node]) : 0;
    }

    reportCaptureImport(count) {
        if (count > 0) this.captureStatus(`${this.captureLabel()} · ${count} ${this._t('nodes added to front')}`);
        return count;
    }

    captureLabel() {
        const data = this.reference && this.reference.data;
        const sceneKey = this.reference ? this.reference.scene : '';
        const label = (DatabaseUserInterfaceEditor.CAPTURE_SCENES.find(([key]) => key === sceneKey) || [sceneKey, sceneKey])[1];
        return `${this._t(label)} · ${data && data.windows ? data.windows.length : 0} ${this._t('windows')}`;
    }

    async playtest() {
        const project = this.project();
        const manager = this.parentEditor && this.parentEditor.playtestManager;
        if (!project || !project.path || !manager) return;
        try {
            if (window.reactor && window.reactor.projectController && window.reactor.projectController.saveAll) {
                const saved = await window.reactor.projectController.saveAll();
                if (!saved) return;
            } else {
                await this.databaseManager.saveAllData(project.path);
            }
        } catch (error) {
            console.error('Could not save before the interface playtest:', error);
            return;
        }
        if (typeof manager.playtestInterface === 'function') manager.playtestInterface(project.path, this.current.id);
    }

    // ==========================================
    // CANVAS RENDERING
    // ==========================================

    fitCanvas() {
        const host = this.wrapper.querySelector('.rr-ui-canvas-host');
        const screen = this.screenSize();
        if (!host) return;
        const workspace = this.wrapper.querySelector('.rr-ui-workspace');
        const fitHeight = workspace && getComputedStyle(workspace).getPropertyValue('--rr-ui-fit').trim() === 'both';
        const availableWidth = Math.max(200, host.clientWidth - 20);
        let scale = Math.min(1, availableWidth / screen.width);
        if (fitHeight && host.clientHeight > 0) {
            scale = Math.min(scale, Math.max(120, host.clientHeight - 20) / screen.height);
        }
        this.scale = this.previewZoom || scale;
        this.canvas.width = screen.width;
        this.canvas.height = screen.height;
        this.canvas.style.imageRendering = 'pixelated';
        this.canvas.style.flexShrink = '0';
        this.canvas.style.maxWidth = 'none';
        this.canvas.style.width = Math.round(screen.width * this.scale) + 'px';
        this.canvas.style.height = Math.round(screen.height * this.scale) + 'px';
        const size = this.wrapper.querySelector('.rr-ui-size');
        if (size) size.textContent = `${screen.width}×${screen.height} · ${Math.round(this.scale * 100)}%`;
    }

    scheduleRender() {
        if (this._raf) return;
        this._raf = requestAnimationFrame(() => {
            this._raf = 0;
            if (this.wrapper && this.wrapper.isConnected) this.render();
            else this.detach();
        });
    }

    assetUrl(folder, name) {
        const project = this.project();
        if (!project || !project.path || !name) return null;
        try {
            const path = require('path');
            if (folder === 'pictures' && typeof RRAssetFiles !== 'undefined') {
                return RRAssetFiles.imageUrlFor(path.join(project.path, 'img', folder), name) || null;
            }
            const filePath = path.join(project.path, 'img', folder, name + '.png');
            return window.RPGReactorAssetUrl ? window.RPGReactorAssetUrl(filePath) : 'file://' + filePath.replace(/\\/g, '/');
        } catch (error) {
            return null;
        }
    }

    image(folder, name) {
        const key = folder + '/' + name;
        if (this.images.has(key)) return this.images.get(key);
        const url = this.assetUrl(folder, name);
        const entry = { image: null, failed: !url };
        this.images.set(key, entry);
        if (url) {
            const image = new Image();
            image.onload = () => { entry.image = image; this.scheduleRender(); };
            image.onerror = () => { entry.failed = true; };
            image.src = url;
        }
        return entry;
    }

    loadSkin() {
        this.skin = this.image('system', 'Window');
    }

    skinColor(index) {
        const skin = this.skin && this.skin.image;
        if (!skin) return index === 0 ? '#ffffff' : '#ffff80';
        if (!this._skinCanvas) {
            this._skinCanvas = document.createElement('canvas');
            this._skinCanvas.width = skin.width;
            this._skinCanvas.height = skin.height;
            this._skinCanvas.getContext('2d').drawImage(skin, 0, 0);
            this._skinColors = new Map();
        }
        if (this._skinColors.has(index)) return this._skinColors.get(index);
        let color = '#ffffff';
        try {
            const px = 96 + (index % 8) * 12 + 6;
            const py = 144 + Math.floor(index / 8) * 12 + 6;
            const data = this._skinCanvas.getContext('2d').getImageData(px, py, 1, 1).data;
            color = `rgb(${data[0]},${data[1]},${data[2]})`;
        } catch (error) {
            // Cross-origin skin: the default white is close enough.
        }
        this._skinColors.set(index, color);
        return color;
    }

    /**
     * The project's main game font, loaded once per project into the
     * document so the canvas measures and draws text the way the game does.
     */
    loadGameFont() {
        const project = this.project();
        const system = this.databaseManager && this.databaseManager.data ? this.databaseManager.data.system : null;
        const file = system && system.advanced && system.advanced.mainFontFilename;
        if (!project || !project.path || !file || typeof FontFace !== 'function') return;
        const key = project.path + '|' + file;
        if (DatabaseUserInterfaceEditor._fontLoads === undefined) DatabaseUserInterfaceEditor._fontLoads = new Map();
        const loads = DatabaseUserInterfaceEditor._fontLoads;
        if (loads.has(key)) {
            this._gameFontFamily = loads.get(key);
            // Still loading for another view: pick it up when it lands.
            if (!this._gameFontFamily && document.fonts && document.fonts.ready) {
                document.fonts.ready.then(() => { const family = loads.get(key); if (family && !this._gameFontFamily) { this._gameFontFamily = family; this.scheduleRender(); } });
            }
            return;
        }
        const family = 'rr-ui-gamefont-' + loads.size;
        loads.set(key, null);
        let url = null;
        try {
            const path = require('path');
            const filePath = path.join(project.path, 'fonts', file);
            url = window.RPGReactorAssetUrl ? window.RPGReactorAssetUrl(filePath) : 'file://' + filePath.replace(/\\/g, '/');
        } catch (error) {
            return;
        }
        const face = new FontFace(family, `url("${url}")`);
        face.load().then(loaded => {
            document.fonts.add(loaded);
            loads.set(key, family);
            this._gameFontFamily = family;
            this.scheduleRender();
        }).catch(() => {
            // The browser default stays; measurements will be approximate.
        });
    }

    fontFamily(node) {
        const system = this.databaseManager && this.databaseManager.data ? this.databaseManager.data.system : null;
        const fallback = (system && system.advanced && system.advanced.fallbackFonts) || 'sans-serif';
        const game = this._gameFontFamily ? `"${this._gameFontFamily}", ${fallback}` : fallback;
        return node && node.fontFace ? `"${String(node.fontFace).replace(/"/g, '')}", ${game}` : game;
    }

    setTextFont(ctx, node, size) {
        const italic = node && node.fontItalic ? 'italic ' : '';
        const bold = node && node.fontBold ? 'bold ' : '';
        ctx.font = `${italic}${bold}${size}px ${this.fontFamily(node)}`;
        if ('letterSpacing' in ctx) ctx.letterSpacing = `${Number(node && node.letterSpacing) || 0}px`;
        if ('textLetterSpacing' in ctx) ctx.textLetterSpacing = `${Number(node && node.letterSpacing) || 0}px`;
    }

    fontSize(node) {
        if (node.fontSize > 0) return node.fontSize;
        const system = this.databaseManager && this.databaseManager.data ? this.databaseManager.data.system : null;
        return (system && system.advanced && Number(system.advanced.fontSize)) || 26;
    }

    /**
     * The editor's stand-in for the play-time party: a caller's party (the
     * troop preview's), a Battle HUD's battle-test party (System > Test
     * Battlers, as a battle test fields it), else the starting party.
     */
    previewPartyActors() {
        if (Array.isArray(this._previewParty)) return this._previewParty;
        const data = this.databaseManager && this.databaseManager.data;
        if (!data) return [];
        const system = data.system || {};
        const actor = id => (id && data.actors && data.actors[id]) || null;
        let party = null;
        if (this.current && this.current.mode === 'battle') {
            const tested = (system.testBattlers || []).map(slot => actor(Number(slot && slot.actorId) || 0)).filter(Boolean);
            if (tested.length) party = tested;
        }
        if (!party) party = (Array.isArray(system.partyMembers) ? system.partyMembers : []).map(id => actor(id)).filter(Boolean);
        // Preview party (editor only): that many actors, the party first, then
        // the database's other actors in ID order.
        const size = Math.max(0, Math.min(8, Number(this.current && this.current.previewPartySize) || 0));
        if (!size) return party;
        const extra = (data.actors || []).filter(entry => entry && entry.name && !party.includes(entry));
        return party.concat(extra).slice(0, size);
    }

    /** The actor in a party slot of the preview party. */
    startingMember(slot) {
        return this.previewPartyActors()[Math.max(0, Math.floor(slot))] || null;
    }

    /** Project-data stand-in for a runtime actor binding. Dynamic bindings use the first starting member. */
    startingActor(node) {
        const data = this.databaseManager && this.databaseManager.data;
        if (!data || !node) return null;
        if (node.actorSource === 'actorId') return (data.actors && data.actors[node.actorId]) || null;
        if (node.actorSource === 'partySlot') return this.startingMember(node.index);
        return this.startingMember(0);
    }

    startingClass(actor) {
        const data = this.databaseManager && this.databaseManager.data;
        return actor && data && data.classes ? data.classes[actor.classId] || null : null;
    }

    startingParam(actor, id) {
        if (!actor) return 0;
        const level = Number(actor.initialLevel) || 1;
        const klass = this.startingClass(actor);
        return Number(klass && klass.params && klass.params[id] && klass.params[id][level]) || 0;
    }

    startingExpForLevel(actor, level) {
        const klass = this.startingClass(actor);
        const p = klass && klass.expParams;
        if (!p || level <= 1) return 0;
        const basis = Number(p[0]) || 0, extra = Number(p[1]) || 0, accA = Number(p[2]) || 0, accB = Number(p[3]) || 1;
        return Math.round(basis * Math.pow(level - 1, 0.9 + accA / 250) * level * (level + 1)
            / (6 + Math.pow(level, 2) / 50 / accB) + (level - 1) * extra);
    }

    startingActorValue(actor, token) {
        if (!actor) return '';
        const level = Number(actor.initialLevel) || 1;
        const klass = this.startingClass(actor);
        const maxLevel = Number(actor.maxLevel) || 99;
        const key = String(token).toLowerCase();
        const params = { mhp: 0, maxhp: 0, mmp: 1, maxmp: 1, atk: 2, def: 3, mat: 4, mdf: 5, agi: 6, luk: 7 };
        if (Object.hasOwn(params, key)) return String(this.startingParam(actor, params[key]));
        const currentTotal = this.startingExpForLevel(actor, level);
        const nextTotal = level >= maxLevel ? currentTotal : this.startingExpForLevel(actor, level + 1);
        const values = {
            name: actor.name || '', nickname: actor.nickname || '', class: klass ? klass.name : '', level,
            profile: actor.profile || '', hp: this.startingParam(actor, 0), mp: this.startingParam(actor, 1), tp: 0, maxtp: 100,
            currentexp: 0, totalexp: currentTotal, nextexp: nextTotal, nextrequiredexp: Math.max(0, nextTotal - currentTotal)
        };
        return String(values[key] ?? '');
    }

    /** Preview value of a party code for a starting-party slot: level and class from the actor, HP/MP from the class at that level. */
    startingStat(code, slot) {
        const member = this.startingMember(slot);
        if (!member) return '';
        const data = this.databaseManager.data;
        const level = Number(member.initialLevel) || 1;
        const klass = data.classes && data.classes[member.classId];
        const param = index => (klass && klass.params && klass.params[index] && klass.params[index][level]) || 0;
        switch (code) {
            case 'PLV': return String(level);
            case 'PCLASS': return klass ? klass.name : '';
            case 'PHP': case 'PMHP': return String(param(0));
            case 'PMP': case 'PMMP': return String(param(1));
            case 'PTP': return '0';
            default: return '';
        }
    }

    /** Splits text into drawable runs: {text, color, size, icon}. `scale` shrinks the base font (Fit text to size). */
    parseText(node, scale = 1) {
        const ctx = this.ctx;
        const baseSize = scale < 1 ? Math.max(DatabaseUserInterfaceEditor.MIN_FONT_SIZE, Math.round(this.fontSize(node) * scale)) : this.fontSize(node);
        const baseColor = typeof node.textColor === 'string' ? node.textColor : this.skinColor(node.textColor || 0);
        const actors = (this.databaseManager.data && this.databaseManager.data.actors) || [];
        const system = (this.databaseManager.data && this.databaseManager.data.system) || {};
        let text = String(node.text || '');
        text = text.replace(/\\\\/g, '\u0000');
        const context = this.previewContext(node);
        text = text.replace(/\{context\.(key|kind|id|value|name|description|icon|iconIndex|count|playtime|index|paramName|paramValue|price|level|symbol|valueText|title|timestamp|date|partyCharacters|partyFaces|existing|enabled)\}/gi,
            (match, token) => {
                if (!context) return '';
                const field = { iconindex: 'iconIndex', paramname: 'paramName', paramvalue: 'paramValue', valuetext: 'valueText',
                    partycharacters: 'partyCharacters', partyfaces: 'partyFaces' }[token.toLowerCase()] || token.toLowerCase();
                return String(context[field] ?? '');
            });
        text = text.replace(/\{actor\.(name|nickname|class|level|profile|hp|mp|tp|mhp|maxHp|mmp|maxMp|maxTp|currentExp|totalExp|nextExp|nextRequiredExp|atk|def|mat|mdf|agi|luk)\}/gi,
            (m, token) => this.startingActorValue(this.startingActor(node), token));
        text = text.replace(/\\V\[(\d+)\]/gi, (m, n) => (system.variables && system.variables[Number(n)]) ? '{' + system.variables[Number(n)] + '}' : '0');
        text = text.replace(/\\N\[(\d+)\]/gi, (m, n) => (actors[Number(n)] && actors[Number(n)].name) || '');
        text = text.replace(/\\P\[(\d+)\]/gi, (m, n) => { const member = this.startingMember(Number(n) - 1); return member ? member.name : ''; });
        text = text.replace(/\\GOLD/gi, '0');
        text = text.replace(/\\G(?![A-Z])/gi, system.currencyUnit || 'G');
        text = text.replace(/\\(PLV|PCLASS|PHP|PMHP|PMP|PMMP|PTP)\[(\d+)\]/gi, (m, code, n) => this.startingStat(code.toUpperCase(), Number(n) - 1));
        const lines = [];
        let color = baseColor;
        let size = baseSize;
        for (const rawLine of text.split('\n')) {
            const runs = [];
            let rest = rawLine;
            let buffer = '';
            const flush = () => { if (buffer) { runs.push({ text: buffer, color, size }); buffer = ''; } };
            while (rest.length) {
                const match = /^\\(C\[(\d+)\]|I\[(\d+)\]|\{|\}|FS\[(\d+)\]|PX\[\d+\]|PY\[\d+\]|[A-Za-z]+(\[[^\]]*\])?)/i.exec(rest);
                if (match) {
                    flush();
                    if (match[2] !== undefined) color = this.skinColor(Number(match[2]));
                    else if (match[3] !== undefined) runs.push({ icon: Number(match[3]), size });
                    else if (match[1] === '{') size = Math.min(108, size + 12);
                    else if (match[1] === '}') size = Math.max(12, size - 12);
                    else if (match[4] !== undefined) size = Number(match[4]);
                    rest = rest.slice(match[0].length);
                } else {
                    buffer += rest[0];
                    rest = rest.slice(1);
                }
            }
            flush();
            for (const run of runs) if (run.text) run.text = run.text.replace(/\u0000/g, '\\');
            lines.push({ runs });
        }
        const spacing = 36 - this.fontSize({ fontSize: 0 });
        const wrapped = node.wrap && node.width > 0 ? this.wrapRuns(lines, node.width, node) : lines;
        for (const line of wrapped) {
            let tallest = baseSize;
            for (const run of line.runs) tallest = Math.max(tallest, run.size || 0);
            line.height = tallest + spacing;
        }
        void ctx;
        return wrapped;
    }

    /** Greedy word wrap over styled runs; measured with the same font. */
    wrapRuns(lines, maxWidth) {
        const node = arguments[2];
        const ctx = this.ctx;
        const width = token => {
            if (token.icon !== undefined) return 36;
            this.setTextFont(ctx, node, token.size);
            return ctx.measureText(token.text).width;
        };
        const out = [];
        for (const line of lines) {
            const tokens = [];
            for (const run of line.runs) {
                if (run.icon !== undefined) { tokens.push(run); continue; }
                for (const part of run.text.split(/(\s+)/)) {
                    if (part) tokens.push({ text: part, color: run.color, size: run.size, space: /^\s+$/.test(part) });
                }
            }
            let current = [];
            let used = 0;
            for (const token of tokens) {
                const w = width(token);
                if (current.length && !token.space && used + w > maxWidth) {
                    while (current.length && current[current.length - 1].space) current.pop();
                    out.push({ runs: current });
                    current = [];
                    used = 0;
                }
                if (!current.length && token.space) continue;
                current.push(token);
                used += w;
            }
            out.push({ runs: current });
        }
        return out;
    }

    measureRuns(lines, node = this._measureNode) {
        const ctx = this.ctx;
        let width = 0;
        let height = 0;
        for (const line of lines) {
            let lineWidth = 0;
            for (const run of line.runs) {
                if (run.icon !== undefined) {
                    lineWidth += 36;
                } else {
                    this.setTextFont(ctx, node, run.size);
                    lineWidth += ctx.measureText(run.text).width;
                }
            }
            width = Math.max(width, lineWidth);
            height += line.height;
        }
        return { width: Math.ceil(width) + 4, height };
    }

    /**
     * The node's lines at the size they draw: parsed, wrapped, and — with
     * Fit text to size — shrunk by the same search the runtime runs, so
     * the canvas and the game agree on the font that fits.
     */
    layoutText(node) {
        let lines = this.parseText(node);
        if (!node.fitText || (!(node.width > 0) && !(node.height > 0))) return lines;
        const inset = node.type === 'button' && node.fill === 'window' ? 24 : 0;
        const fits = candidate => {
            const size = this.measureRuns(candidate, node);
            return (!(node.width > 0) || size.width <= node.width - inset)
                && (!(node.height > 0) || size.height <= node.height - inset);
        };
        if (fits(lines)) return lines;
        let low = Math.min(1, DatabaseUserInterfaceEditor.MIN_FONT_SIZE / this.fontSize(node));
        let high = 1;
        lines = this.parseText(node, low);
        for (let step = 0; step < 8; step++) {
            const middle = (low + high) / 2;
            const candidate = this.parseText(node, middle);
            if (fits(candidate)) { low = middle; lines = candidate; } else high = middle;
        }
        return lines;
    }

    measureText(node) {
        if (!this.ctx) return { width: 0, height: 0 };
        this._measureNode = node;
        return this.measureRuns(this.layoutText(node));
    }

    iconTile(image, index) {
        const size = window.RRIconPicker?.sizeOf(this.databaseManager?.getSystem?.()) || 32;
        const key = `${size}:${index}`;
        this._iconTiles ||= new WeakMap();
        let tiles = this._iconTiles.get(image);
        if (!tiles) { tiles = new Map(); this._iconTiles.set(image, tiles); }
        if (!tiles.has(key)) {
            const tile = document.createElement('canvas');
            tile.width = tile.height = size;
            const context = tile.getContext('2d');
            context.imageSmoothingEnabled = false;
            context.drawImage(image, index % 16 * size, Math.floor(index / 16) * size, size, size, 0, 0, size, size);
            tiles.set(key, tile);
        }
        return tiles.get(key);
    }

    drawText(node, rect) {
        const ctx = this.ctx;
        const lines = this.layoutText(node);
        const iconSet = this.image('system', 'IconSet');
        let y = rect.y;
        if (node.type === 'button') {
            const size = this.measureRuns(lines, node);
            y = rect.y + Math.max(0, Math.floor((rect.height - size.height) / 2));
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(rect.x, rect.y, rect.width, rect.height);
        ctx.clip();
        for (const line of lines) {
            let lineWidth = 0;
            for (const run of line.runs) {
                if (run.icon !== undefined) lineWidth += 36;
                else { this.setTextFont(ctx, node, run.size); lineWidth += ctx.measureText(run.text).width; }
            }
            let x = rect.x;
            if (node.align === 'center') x = rect.x + Math.max(0, Math.floor((rect.width - lineWidth) / 2));
            else if (node.align === 'right') x = rect.x + Math.max(0, rect.width - lineWidth);
            for (const run of line.runs) {
                if (run.icon !== undefined) {
                    if (iconSet.image) {
                        ctx.drawImage(this.iconTile(iconSet.image, run.icon), x + 2, y + (line.height - 32) / 2, 32, 32);
                    }
                    x += 36;
                    continue;
                }
                this.setTextFont(ctx, node, run.size);
                ctx.textBaseline = 'alphabetic';
                const baseline = Math.round(y + line.height / 2 + run.size * 0.35);
                if (node.outline) {
                    ctx.lineJoin = 'round';
                    ctx.lineWidth = node.outlineWidth;
                    ctx.strokeStyle = node.outlineColor || 'rgba(0,0,0,0.6)';
                    ctx.strokeText(run.text, x, baseline);
                }
                ctx.fillStyle = run.color;
                ctx.fillText(run.text, x, baseline);
                x += ctx.measureText(run.text).width;
            }
            y += line.height;
        }
        ctx.restore();
    }

    roundedPath(ctx, x, y, w, h, r) {
        const radius = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + w, y, x + w, y + h, radius);
        ctx.arcTo(x + w, y + h, x, y + h, radius);
        ctx.arcTo(x, y + h, x, y, radius);
        ctx.arcTo(x, y, x + w, y, radius);
        ctx.closePath();
    }

    cssColor(hex, alpha) {
        const color = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#000000';
        return `rgba(${parseInt(color.slice(1, 3), 16)},${parseInt(color.slice(3, 5), 16)},${parseInt(color.slice(5, 7), 16)},${Math.min(255, Math.max(0, alpha)) / 255})`;
    }

    drawSkinWindow(rect) {
        const ctx = this.ctx;
        const skin = this.skin && this.skin.image;
        const { x, y, width: w, height: h } = rect;
        const system = (this.databaseManager.data && this.databaseManager.data.system) || {};
        const backOpacity = (system.advanced && Number(system.advanced.windowOpacity)) || 192;
        if (!skin) {
            ctx.fillStyle = `rgba(0,0,32,${backOpacity / 255})`;
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
            return;
        }
        const m = 4;
        ctx.save();
        ctx.globalAlpha *= backOpacity / 255;
        ctx.drawImage(skin, 0, 0, 96, 96, x + m, y + m, Math.max(0, w - m * 2), Math.max(0, h - m * 2));
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + m, y + m, w - m * 2, h - m * 2);
        ctx.clip();
        for (let ty = y + m; ty < y + h - m; ty += 96) {
            for (let tx = x + m; tx < x + w - m; tx += 96) {
                ctx.drawImage(skin, 0, 96, 96, 96, tx, ty, 96, 96);
            }
        }
        ctx.restore();
        ctx.restore();
        // Frame: 9-slice of (96,0)-(192,96), 24px corners.
        const c = 24;
        const sx = 96, sy = 0, S = 96;
        const draw = (dsx, dsy, dsw, dsh, dx, dy, dw, dh) => { if (dw > 0 && dh > 0) ctx.drawImage(skin, dsx, dsy, dsw, dsh, dx, dy, dw, dh); };
        draw(sx, sy, c, c, x, y, c, c);
        draw(sx + S - c, sy, c, c, x + w - c, y, c, c);
        draw(sx, sy + S - c, c, c, x, y + h - c, c, c);
        draw(sx + S - c, sy + S - c, c, c, x + w - c, y + h - c, c, c);
        draw(sx + c, sy, S - c * 2, c, x + c, y, w - c * 2, c);
        draw(sx + c, sy + S - c, S - c * 2, c, x + c, y + h - c, w - c * 2, c);
        draw(sx, sy + c, c, S - c * 2, x, y + c, c, h - c * 2);
        draw(sx + S - c, sy + c, c, S - c * 2, x + w - c, y + c, c, h - c * 2);
    }

    drawSelection(node, rect) {
        if (!node._previewFocused || node.focusedFillColor) return;
        const skin = this.skin && this.skin.image;
        const pad = node.fill === 'window' ? 12 : 0;
        const x = rect.x + pad, y = rect.y + pad;
        const w = Math.max(0, rect.width - pad * 2), h = Math.max(0, rect.height - pad * 2);
        if (!skin) {
            this.ctx.fillStyle = 'rgba(255,255,255,0.3)';
            this.ctx.fillRect(x, y, w, h);
            return;
        }
        // Same 48px cursor cell and 4px corners as Window._refreshCursor.
        const mx = Math.min(4, w / 2), my = Math.min(4, h / 2);
        const sx = [96, 100, 140], sy = [96, 100, 140];
        const sw = [4, 40, 4], sh = [4, 40, 4];
        const dx = [x, x + mx, x + w - mx], dy = [y, y + my, y + h - my];
        const dw = [mx, w - 2 * mx, mx], dh = [my, h - 2 * my, my];
        for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
            if (dw[col] > 0 && dh[row] > 0) this.ctx.drawImage(skin, sx[col], sy[row], sw[col], sh[row], dx[col], dy[row], dw[col], dh[row]);
        }
    }

    drawSurface(node, rect) {
        const ctx = this.ctx;
        const { x, y, width: w, height: h } = rect;
        ctx.save();
        if (node.fill === 'window') {
            this.drawSkinWindow(rect);
        } else if (node.fill === 'color' || node.fill === 'gradient') {
            ctx.save();
            if (node.radius > 0) { this.roundedPath(ctx, x, y, w, h, node.radius); ctx.clip(); }
            if (node.fill === 'gradient') {
                const gradient = node.vertical ? ctx.createLinearGradient(0, y, 0, y + h) : ctx.createLinearGradient(x, 0, x + w, 0);
                gradient.addColorStop(0, this.cssColor(node.color, node.fillOpacity));
                gradient.addColorStop(1, this.cssColor(node.color2, node.fillOpacity));
                ctx.fillStyle = gradient;
            } else {
                ctx.fillStyle = this.cssColor(node.color, node.fillOpacity);
            }
            ctx.fillRect(x, y, w, h);
            ctx.restore();
        }
        if (node.borderWidth > 0) {
            const inset = node.borderWidth / 2;
            ctx.strokeStyle = this.cssColor(node.borderColor, 255);
            ctx.lineWidth = node.borderWidth;
            if (node.radius > 0) { this.roundedPath(ctx, x + inset, y + inset, w - node.borderWidth, h - node.borderWidth, Math.max(0, node.radius - inset)); ctx.stroke(); }
            else ctx.strokeRect(x + inset, y + inset, w - node.borderWidth, h - node.borderWidth);
        }
        ctx.restore();
    }

    /**
     * A Battle Window is the stock window's stand-in: its skin (or a dashed
     * outline without one) and the window's name. One that follows the
     * active actor is drawn over the first party row it would follow.
     */
    /**
     * A Battle Window as a battle shows it while the party chooses: the
     * actor command window, skinned and listing the commands, over the first
     * actor's row. Every other window only appears once opened, so it is a
     * dashed outline with its name (faint when hidden); a game view (the
     * troop preview) leaves those out.
     */
    drawBattleWindowNode(node, rect) {
        const ctx = this.ctx;
        let r = rect;
        if (node.followActor) {
            const slot = this.previewSlotRect();
            if (slot) r = Object.assign({}, rect, { x: slot.x + node.x, y: slot.y + node.y });
        }
        const shown = node.battleWindow === 'actorCommand' && !node.hideWindow;
        if (shown) {
            if (node.file) {
                const picture = this.imageRef(node.file);
                if (picture.image) ctx.drawImage(picture.image, r.x + (node.imageX || 0), r.y + (node.imageY || 0));
            }
            if (node.fill !== 'none') this.drawSurface(Object.assign({}, node, { type: 'box', fill: 'window' }), r);
            const commands = this.previewActorCommands();
            const lineHeight = 36, top = r.y + 12;
            const rows = Math.max(1, Math.floor((r.height - 24) / (lineHeight + 8)));
            commands.slice(0, rows).forEach((text, index) => {
                const row = { x: r.x + 12, y: top + index * (lineHeight + 8), width: r.width - 24, height: lineHeight + 8 };
                if (index === 0) this.drawSelection(Object.assign({}, node, { type: 'button', fill: 'none', _previewFocused: true, focusedFillColor: '' }), row);
                this.drawText({ type: 'button', text, align: 'center', fontSize: 0, textColor: 0, fill: 'none', wrap: false, fitText: true,
                    outline: true, outlineWidth: 3, letterSpacing: 0, width: row.width, height: row.height }, row);
            });
            return;
        }
        if (this._gameView) return;
        ctx.save();
        ctx.globalAlpha *= node.hideWindow ? 0.35 : 0.8;
        ctx.setLineDash([6 / this.scale, 4 / this.scale]);
        ctx.strokeStyle = '#7fd3ff';
        ctx.lineWidth = 1 / this.scale;
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.width - 1, r.height - 1);
        ctx.setLineDash([]);
        const label = (DatabaseUserInterfaceEditor.BATTLE_WINDOWS.find(([key]) => key === node.battleWindow) || ['', node.battleWindow])[1];
        // Windows that share a spot (skills and items, say) list their names one under another.
        const shared = this.current.nodes.filter(other => other.type === 'battleWindow' && !other.followActor && other.x === node.x && other.y === node.y);
        const line = Math.max(0, shared.indexOf(node));
        this.drawText({ type: 'text', text: this._t(label) + (node.hideWindow ? ' (' + this._t('hidden') + ')' : ''), align: 'left', fontSize: 20,
            textColor: 0, fill: 'none', wrap: false, fitText: false, outline: true, outlineWidth: 3, letterSpacing: 0 },
            { x: r.x + 8, y: node.hideWindow ? r.y + r.height - 32 : r.y + 4 + line * 26, width: Math.max(0, r.width - 16), height: 28 });
        ctx.restore();
    }

    /** The first actor's battle commands, as Window_ActorCommand lists them, for the preview. */
    previewActorCommands() {
        const data = (this.databaseManager && this.databaseManager.data) || {};
        const system = data.system || {};
        const commands = (system.terms && system.terms.commands) || [];
        // The skill types the actor and their class add (trait 41), as Window_ActorCommand lists them.
        const actor = this.startingMember(0);
        const klass = actor && data.classes ? data.classes[actor.classId] : null;
        const ids = [...new Set([...(actor && actor.traits || []), ...(klass && klass.traits || [])]
            .filter(trait => trait && trait.code === 41).map(trait => trait.dataId))].sort((a, b) => a - b);
        const types = ids.map(id => (system.skillTypes || [])[id]).filter(Boolean);
        return [commands[2] || 'Attack', ...types, commands[3] || 'Guard', commands[4] || 'Item'];
    }

    /**
     * Draw a record's nodes into another canvas (the troop preview) as the
     * game would show them: `options.party` stands in for the battle party.
     * The User Interfaces canvas itself is untouched.
     */
    drawRecordInto(ctx, record, options = {}) {
        const saved = { ctx: this.ctx, current: this.current, scale: this.scale, party: this._previewParty, gameView: this._gameView };
        this.ctx = ctx;
        this.current = record;
        this.scale = options.scale || 1;
        this._previewParty = options.party || null;
        this._gameView = true;
        try {
            const rects = this.rects();
            for (const node of DatabaseUserInterfaceEditor.orderNodes(record.nodes)) {
                const rect = rects.get(node.id);
                if (!rect || rect.width <= 0 || rect.height <= 0 || node.type === 'battleCursor') continue;
                if (node.visible && node.visible.type === 'never') continue;
                ctx.save();
                ctx.globalAlpha *= (node.opacity ?? 255) / 255;
                const drawn = DatabaseUserInterfaceEditor.isControl(node.type) ? this.previewControl(node).node : node;
                switch (drawn.type) {
                    case 'box': this.drawSurface(drawn, rect); break;
                    case 'image': this.drawImageNode(drawn, rect); break;
                    case 'text': this.drawText(drawn, rect); break;
                    case 'gauge': this.drawGaugeNode(drawn, rect); break;
                    case 'list': this.drawListNode(drawn, rect); break;
                    case 'battleWindow': this.drawBattleWindowNode(drawn, rect); break;
                    default: break;
                }
                ctx.restore();
            }
        } finally {
            Object.assign(this, { ctx: saved.ctx, current: saved.current, scale: saved.scale, _previewParty: saved.party, _gameView: saved.gameView });
        }
    }

    /** The cursor's stand-in: its image (or the plain arrow) with a sample name. */
    drawBattleCursorNode(node, rect) {
        const ctx = this.ctx;
        const ref = node.file && !node.file.includes('/') ? (node.source === 'system' ? 'system/' : 'pictures/') + node.file : node.file;
        const image = ref ? this.imageRef(ref).image : null;
        ctx.save();
        if (image) {
            const fw = image.width / Math.max(1, node.frames || 1);
            ctx.drawImage(image, 0, 0, fw, image.height, rect.x, rect.y, fw, image.height);
        } else {
            ctx.beginPath(); ctx.moveTo(rect.x + 3, rect.y + 3); ctx.lineTo(rect.x + 29, rect.y + 3); ctx.lineTo(rect.x + 16, rect.y + 25); ctx.closePath();
            ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3; ctx.stroke(); ctx.fill();
        }
        ctx.restore();
        if (node.showName !== false) {
            this.drawText(Object.assign({}, node, { type: 'text', text: this._t('Target'), align: 'center', textColor: 0, outline: true, outlineWidth: 3,
                letterSpacing: 0, wrap: false, fitText: false, fontSize: node.fontSize || 0 }), { x: rect.x - 60, y: rect.y - 36, width: 152, height: 34 });
        }
    }

    /** The first party-panel row on the canvas, where a following Battle Window is previewed. */
    previewSlotRect() {
        const panel = (this.current.nodes || []).find(node => node.type === 'list' && node.rowLayout === 'actorPanel' && node.dataSource === 'party');
        const rect = panel ? this.rects().get(panel.id) : null;
        if (!rect) return null;
        const inset = panel.fill === 'window' ? 12 : 0;
        const columns = Math.max(1, panel.columns || 1);
        return { x: rect.x + inset, y: rect.y + inset, width: (rect.width - inset * 2) / columns, height: panel.rowHeight };
    }

    /** A HUD image reference as the runtime reads it: "system/Name" (an img/ folder), else a picture. */
    imageRef(ref) {
        const text = String(ref || '').trim();
        if (!text) return { image: null };
        const slash = text.indexOf('/');
        return slash > 0 ? this.image(text.slice(0, slash), text.slice(slash + 1)) : this.image('pictures', text);
    }

    /** A text input drawn as a button-like field: its placeholder, or a starting actor's name. */
    inputPreviewNode(node) {
        let text = node.text || '';
        if (node.inputTarget !== 'variable') {
            const actor = this.startingActor(node);
            const value = actor ? (node.inputTarget === 'actorNickname' ? actor.nickname : actor.name) : '';
            if (value) text = value;
        }
        return Object.assign({}, node, { type: 'button', text, wrap: false });
    }

    previewControl(node) {
        const controls = this.current.nodes.filter(candidate => DatabaseUserInterfaceEditor.isControl(candidate.type));
        const focusedId = controls.some(candidate => candidate.id === this.current.firstFocus) ? this.current.firstFocus : (controls[0] && controls[0].id);
        const forced = node === this.selected() && this._controlPreviewState && this._controlPreviewState !== 'automatic' ? this._controlPreviewState : '';
        // A Battle HUD never takes focus, nor does a list that only displays.
        const focusable = this.current.mode !== 'battle' && node.focusable !== false;
        const state = forced || (node.enabled && node.enabled.type === 'never' ? 'disabled' : focusable && node.id === focusedId ? 'focused' : 'base');
        const copy = Object.assign({}, node);
        let opacity = 255;
        let offsetX = 0, offsetY = 0;
        if (state === 'focused') {
            if (node.focusedFillColor) Object.assign(copy, { fill: 'color', color: node.focusedFillColor, color2: node.focusedFillColor });
            if (node.focusedTextColor) copy.textColor = node.focusedTextColor;
            if (node.focusedBorderColor) Object.assign(copy, { borderColor: node.focusedBorderColor, borderWidth: Math.max(2, node.borderWidth) });
            opacity = node.focusedOpacity === '' ? 255 : node.focusedOpacity;
        } else if (state === 'pressed') {
            opacity = node.pressedOpacity === '' ? 255 : node.pressedOpacity;
            offsetX = node.pressedOffsetX;
            offsetY = node.pressedOffsetY;
        } else if (state === 'disabled') {
            if (node.disabledFillColor) Object.assign(copy, { fill: 'color', color: node.disabledFillColor, color2: node.disabledFillColor });
            if (node.disabledTextColor) copy.textColor = node.disabledTextColor;
            opacity = node.disabledOpacity === '' ? 255 : node.disabledOpacity;
        }
        copy._previewFocused = state === 'focused';
        return { node: copy, state, opacity, offsetX, offsetY };
    }

    listPreviewRows(node) {
        const data = (this.databaseManager && this.databaseManager.data) || {};
        const row = (kind, id, value, name, extra = {}) => Object.assign({ key: `${kind}:${id}`, kind, id, value, name,
            description: '', icon: 0, iconIndex: 0, count: '', playtime: '', index: 0, paramName: '', paramValue: '', price: '', level: '',
            symbol: '', valueText: '', title: '', timestamp: '', date: '', partyCharacters: '', partyFaces: '', existing: false, enabled: true,
            cost: '', slot: '', newValue: '', change: '' }, extra);
        const itemRow = (item, kind, extra = {}) => row(kind, item.id, item.id, item.name, Object.assign({ count: 1, description: item.description || '',
            icon: item.iconIndex || 0, iconIndex: item.iconIndex || 0, price: item.price || 0 }, extra));
        const commands = (data.system && data.system.terms && data.system.terms.commands) || [];
        let rows = [];
        if (node.dataSource === 'party') {
            rows = this.previewPartyActors().map(actor => row('actor', actor.id, actor.id, actor.name,
                { description: actor.profile || '', level: Number(actor.initialLevel) || 1 }));
        } else if (node.dataSource === 'itemCategories') {
            const flags = (data.system && data.system.itemCategories) || [true, true, true, true];
            rows = [['item', commands[4] || 'Items'], ['weapon', commands[12] || 'Weapons'], ['armor', commands[13] || 'Armors'], ['keyItem', commands[14] || 'Key Items']]
                .filter((entry, index) => flags[index] !== false).map(([id, name]) => row('category', id, id, name));
        } else if (node.dataSource === 'skillTypes') {
            rows = ((data.system && data.system.skillTypes) || []).map((name, id) => id > 0 && name ? row('skillType', id, id, name) : null).filter(Boolean).slice(0, 4);
        } else if (node.dataSource === 'equipCandidates') {
            rows = (data.weapons || []).filter(Boolean).slice(0, 6).map(item => itemRow(item, 'weapon', { slot: 0 }));
            rows.push(row('none', 0, 0, '', { key: 'equip:none', slot: 0 }));
        } else if (node.dataSource === 'shopGoods' || node.dataSource === 'shopSell') {
            const selling = node.dataSource === 'shopSell';
            rows = (data.items || []).filter(item => item && item.itypeId !== 2 && item.price > 0).slice(0, 8)
                .map(item => itemRow(item, 'item', { price: selling ? Math.floor(item.price / 2) : item.price }));
        } else if (node.dataSource === 'inventory') {
            const category = node.filterContext ? 'item' : node.category;
            const groups = category === 'weapon' ? [data.weapons] : category === 'armor' ? [data.armors]
                : category === 'all' ? [data.items, data.weapons, data.armors] : [data.items];
            rows = groups.flatMap(group => (group || []).filter(item => item && (category !== 'keyItem' || item.itypeId === 2) && (category !== 'item' || item.itypeId !== 2))
                .slice(0, 12).map(item => {
                    const kind = group === data.weapons ? 'weapon' : group === data.armors ? 'armor' : 'item';
                    return row(kind, item.id, item.id, item.name, { count: 1, description: item.description || '', icon: item.iconIndex || 0,
                        iconIndex: item.iconIndex || 0, price: item.price || 0 });
                }));
        } else if (node.dataSource === 'skills') {
            const actor = this.startingActor(node), klass = this.startingClass(actor), level = Number(actor && actor.initialLevel) || 1;
            const ids = new Set((klass && klass.learnings || []).filter(entry => entry.level <= level).map(entry => entry.skillId));
            rows = (data.skills || []).filter(skill => skill && ids.has(skill.id) && (node.filterContext || !node.skillTypeId || skill.stypeId === node.skillTypeId)).slice(0, 12)
                .map(skill => row('skill', skill.id, skill.id, skill.name, { description: skill.description || '', icon: skill.iconIndex || 0,
                    iconIndex: skill.iconIndex || 0, price: skill.mpCost || 0, level,
                    cost: skill.tpCost > 0 ? `\\C[29]${skill.tpCost}\\C[0]` : skill.mpCost > 0 ? `\\C[23]${skill.mpCost}\\C[0]` : '' }));
        } else if (node.dataSource === 'actorParameters') {
            const actor = this.startingActor(node);
            const names = (data.system && data.system.terms && data.system.terms.params) || ['Max HP', 'Max MP', 'ATK', 'DEF', 'MAT', 'MDF', 'AGI', 'LUK'];
            rows = names.slice(0, 8).map((name, id) => row('parameter', id, this.startingParam(actor, id), name,
                { paramName: name, paramValue: this.startingParam(actor, id) }));
        } else if (node.dataSource === 'actorEquipment') {
            const actor = this.startingActor(node);
            const equips = actor && Array.isArray(actor.equips) ? actor.equips : [];
            const equipTypes = (data.system && data.system.equipTypes) || [];
            rows = equips.map((id, slot) => {
                const item = slot === 0 ? data.weapons && data.weapons[id] : data.armors && data.armors[id];
                const slotName = equipTypes[slot + 1] || '';
                return row('equipment', item ? item.id : 0, item ? item.id : 0, item ? item.name : slotName,
                    { key: `equipment:${slot}`, description: item && item.description || '', icon: item && item.iconIndex || 0,
                        iconIndex: item && item.iconIndex || 0, price: item && item.price || 0, count: item ? 1 : 0,
                        paramName: slotName, slot, enabled: true, valueText: item ? `\\I[${item.iconIndex || 0}]${item.name}` : '' });
            });
        } else if (node.dataSource === 'actorStates') {
            rows = [];
        } else if (node.dataSource === 'options') {
            const labels = ['Always Dash', 'Command Remember', 'Touch UI', 'BGM Volume', 'BGS Volume', 'ME Volume', 'SE Volume'];
            const symbols = ['alwaysDash', 'commandRemember', 'touchUI', 'bgmVolume', 'bgsVolume', 'meVolume', 'seVolume'];
            rows = labels.map((name, index) => {
                const volume = symbols[index].includes('Volume');
                const value = volume ? 80 : index !== 1;
                return row('option', symbols[index], value, this._t(name), {
                    symbol: symbols[index],
                    valueText: volume ? '80%' : this._t(value ? 'ON' : 'OFF')
                });
            });
        } else if (node.dataSource === 'saveSlots') {
            const first = node.includeAutosave ? 0 : 1;
            rows = Array.from({ length: 8 }, (_, index) => {
                const id = first + index;
                const existing = index < 2;
                return row('save', id, id, id === 0 ? this._t('Autosave') : `${this._t('File')} ${id}`, {
                    title: existing ? ((data.system && data.system.gameTitle) || 'Game') : '', playtime: existing ? '01:23:45' : '',
                    timestamp: existing ? 1787846400000 : '', date: existing ? '8/27/2026, 12:00:00 PM' : '',
                    partyCharacters: existing ? 'Actor1[0], Actor2[1]' : '', partyFaces: existing ? 'Actor1[0], Actor2[1]' : '',
                    existing, enabled: node.action && node.action.type === 'loadSlot' ? existing : node.action && node.action.type === 'saveSlot' ? id > 0 : true
                });
            });
        } else if (node.dataSource === 'variableRange') {
            const start = Math.min(node.rangeStart, node.rangeEnd), end = Math.min(Math.max(node.rangeStart, node.rangeEnd), start + 11);
            rows = Array.from({ length: end - start + 1 }, (_, index) => { const id = start + index; return row('variable', id, 0, (data.system && data.system.variables && data.system.variables[id]) || `${this._t('Variable')} ${id}`); });
        } else {
            rows = DatabaseUserInterfaceEditor.normalizeLiteralItems(node.items).map(item => row('literal', item.id, item.value, item.text, { enabled: item.enabled }));
        }
        return rows.map((entry, index) => {
            entry.index = index + 1;
            let template = node.rowText || (['inventory', 'equipCandidates', 'shopSell'].includes(node.dataSource) ? (entry.kind === 'none' ? '' : `\\I[${entry.icon || 0}]{name}  x{count}`)
                : node.dataSource === 'shopGoods' ? `\\I[${entry.icon || 0}]{name}  {price}`
                : node.dataSource === 'skills' ? `\\I[${entry.icon || 0}]{name}`
                : node.dataSource === 'options' ? '{name}  {valueText}'
                : node.dataSource === 'saveSlots' && entry.playtime ? '{name}  {playtime}'
                : node.dataSource === 'variableRange' ? '{name}: {value}' : '{name}');
            entry.text = template.replace(/\{(key|kind|id|value|name|description|icon|iconIndex|count|playtime|index|paramName|paramValue|price|level|symbol|valueText|title|timestamp|date|partyCharacters|partyFaces|existing|enabled|cost|slot|newValue|change)\}/gi, (match, key) => {
                const field = { iconindex: 'iconIndex', paramname: 'paramName', paramvalue: 'paramValue', valuetext: 'valueText',
                    partycharacters: 'partyCharacters', partyfaces: 'partyFaces', newvalue: 'newValue' }[key.toLowerCase()] || key.toLowerCase();
                return String(entry[field] ?? '');
            });
            return entry;
        });
    }

    previewContext(node) {
        const source = this.current && this.current.nodes.find(candidate => candidate.type === 'list' && candidate.contextName === node.contextName);
        return source ? this.listPreviewRows(source)[0] || null : null;
    }

    drawListNode(node, rect) {
        this.drawSurface(node, rect);
        const inset = node.fill === 'window' ? 12 : 0;
        const area = { x: rect.x + inset, y: rect.y + inset, width: Math.max(0, rect.width - inset * 2), height: Math.max(0, rect.height - inset * 2) };
        const rows = this.listPreviewRows(node);
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(area.x, area.y, area.width, area.height);
        this.ctx.clip();
        const columns = Math.max(1, node.columns || 1);
        const columnWidth = area.width / columns;
        rows.slice(0, Math.ceil(area.height / node.rowHeight) * columns).forEach((entry, index) => {
            const rowRect = { x: area.x + (index % columns) * columnWidth, y: area.y + Math.floor(index / columns) * node.rowHeight, width: columnWidth, height: node.rowHeight };
            if (node.fill === 'window') {
                const gradient = this.ctx.createLinearGradient(0, rowRect.y, 0, rowRect.y + rowRect.height);
                gradient.addColorStop(0, 'rgba(32,32,32,0.5)');
                gradient.addColorStop(1, 'rgba(0,0,0,0.5)');
                this.ctx.fillStyle = gradient;
                this.ctx.fillRect(rowRect.x, rowRect.y, rowRect.width, rowRect.height);
                this.ctx.strokeStyle = 'rgba(32,32,32,0.5)';
                this.ctx.strokeRect(rowRect.x, rowRect.y, rowRect.width, rowRect.height);
            }
            if (index === 0 && node._previewFocused !== false) {
                const color = node.focusedFillColor || node.highlightColor;
                this.ctx.fillStyle = this.cssColor(color, node.focusedFillColor ? 255 : 96);
                this.ctx.fillRect(rowRect.x, rowRect.y, rowRect.width, rowRect.height);
            }
            if (node.rowLayout === 'actorPanel') { this.drawActorPanelRow(node, {x:rowRect.x+4,y:rowRect.y+2,width:Math.max(1,rowRect.width-8),height:Math.max(1,rowRect.height-4)}, index); return; }
            const textRect = { x: rowRect.x + 8, y: rowRect.y, width: Math.max(0, rowRect.width - 16), height: rowRect.height };
            const alpha = this.ctx.globalAlpha;
            if (entry.enabled === false) this.ctx.globalAlpha *= (node.disabledOpacity === '' ? 255 : node.disabledOpacity) / 255;
            const rowNode = Object.assign({}, node, { type: 'button', text: entry.text, width: textRect.width, height: textRect.height, wrap: false, fitText: false });
            if (entry.enabled === false && node.disabledTextColor) rowNode.textColor = node.disabledTextColor;
            else if (index === 0 && node.focusedTextColor) rowNode.textColor = node.focusedTextColor;
            this.drawText(rowNode, textRect);
            this.ctx.globalAlpha = alpha;
        });
        this.ctx.restore();
    }

    actorPortraitPreview(actor) {
        if (!actor || typeof RRDatabase3DBindings === 'undefined' || !this.project()?.path) return null;
        const key = 'actor-portrait:' + actor.id;
        if (this.images.has(key)) return this.images.get(key);
        const entry = { image: null, bound: false };
        this.images.set(key, entry);
        try {
            const spec = RRDatabase3DBindings.get(this.project().path, 'actors', actor.id, 'face');
            if (!spec) return entry;
            entry.bound = true;
            Promise.resolve(RRDatabase3DBindings.modelThumbnail(this.parentEditor?.reactor3dEditor, spec)).then(url => {
                if (!url || this.images.get(key) !== entry) return;
                const image = new Image();
                image.onload = () => { if (this.images.get(key) === entry) { entry.image = image; this.scheduleRender(); } };
                image.src = url;
            }).catch(error => console.warn('Could not preview actor portrait:', error));
        } catch (error) { console.warn('Could not read actor portrait:', error); }
        return entry;
    }

    drawGaugeStylePreview() {
        const canvas=this.wrapper?.querySelector('.rr-ui-gauge-preview'),node=this.selected();
        if(!canvas || !node) return;
        const element=DatabaseUserInterfaceEditor.actorPanelLayout(node,node.width,node.rowHeight,this.fontSize(node))[this._actorElementKey];
        if(!element) return;
        const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
        const rect=element.shape==='circular'?{x:96,y:8,width:68,height:68}:{x:16,y:22,width:228,height:36};
        const scaled={...element,corner:Math.min(element.corner || 0,element.height/2)*36/Math.max(1,element.height)};
        DatabaseUserInterfaceEditor.drawActorGauge(ctx,rect,scaled,0.65,['#42b9e8','#85dcff','#41434c']);
    }

    customElementAddMarkup() {
        return '<div class="rr-ui-element-actions">'+this.selectControl('p-customElementKind','label',[['box',this._t('Custom Element')],['label',this._t('Custom Label')],['value',this._t('Custom Value')],['gauge',this._t('Custom Gauge')],['image',this._t('Custom Picture')]])
            +'<button type="button" class="rr-btn-chip p-element-add">'+this._t('Add')+'</button></div>';
    }

    panelVariableOptions() {
        return [[0,this._t('None')],...(this.databaseManager.data.system?.variables || []).map((name,id)=>id>0?[id,String(id).padStart(4,'0')+(name?': '+name:'')]:null).filter(Boolean)];
    }

    addCustomActorElement(kind) {
        const node=this.selected();if(node?.rowLayout!=='actorPanel') return;
        node.actorElements ||= {};
        if (Object.keys(node.actorElements).filter(key => key.startsWith('custom_')).length >= 100) return;
        let id=1;while(node.actorElements['custom_'+id]) id++;
        this.pushUndo();
        const key='custom_'+id;
        node.actorElements[key]={kind,name:this._t({box:'Custom Element',label:'Custom Label',value:'Custom Value',gauge:'Custom Gauge',image:'Custom Picture'}[kind]),
            x:node.actorPadding || 12,y:Math.max(12,node.rowHeight-48),width:160,height:kind==='gauge'?16:32,
            fontSize:24,text:kind==='label'?this._t('Custom Label'):'',gauge:'variable',variableId:1,max:100};
        this._actorElementKey=key;this.touch();this.renderProperties();this.scheduleRender();
    }

    expandScript(textarea) {
        if(!textarea) return;
        const dialog=document.createElement('dialog');dialog.className='rr-ui-script-dialog';
        const title=document.createElement('strong');title.textContent=this._t('Edit Script');
        const input=document.createElement('textarea');input.className='database-field-value';input.value=textarea.value;input.spellcheck=false;input.setAttribute('aria-label',this._t('Script'));
        const footer=document.createElement('footer');
        for(const [label,apply] of [['Cancel',false],['Apply',true]]) {
            const button=document.createElement('button');button.type='button';button.className='rr-btn-chip';button.textContent=this._t(label);
            button.onclick=()=>{if(apply && textarea.isConnected){textarea.value=input.value;textarea.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));textarea.dispatchEvent(new Event('input',{bubbles:true}));textarea.dispatchEvent(new Event('change',{bubbles:true}));}dialog.close();};
            footer.appendChild(button);
        }
        dialog.append(title,input,footer);dialog.addEventListener('close',()=>{dialog.remove();textarea.focus();},{once:true});
        document.body.appendChild(dialog);dialog.showModal();input.focus();
    }

    actorElementMarkup(node) {
        const tt = text => this._t(text);
        const inset = node.fill === 'window' ? 12 : 0;
        const elements = DatabaseUserInterfaceEditor.actorPanelLayout(node, Math.max(1,node.width-inset*2-8), node.rowHeight-4, this.fontSize(node));
        const keys=Object.keys(elements);
        if (!keys.length) return this.group(tt('Panel elements')) + this.customElementAddMarkup();
        const key=keys.includes(this._actorElementKey) ? this._actorElementKey : keys[0];
        this._actorElementKey=key;
        const element=elements[key];
        const label = key => {
            const match=/^(hp|mp|tp|exp)(Label|Value)?$/.exec(key);
            return key.startsWith('custom_') ? (elements[key].name || tt('Custom Element')) : match ? tt(match[1].toUpperCase())+' '+tt(match[2] || 'Gauge') : tt({portrait:'Portrait',name:'Name',class:'Class',level:'Level',states:'States',atb:'ATB'}[key]);
        };
        const field=(prop,markup)=>'<div data-actor-element-property="'+prop+'">'+markup+'</div>';
        const number=(prop,min=0,max=9999)=>field(prop,this.numberControl('p-element-'+prop,Math.round(element[prop]*100)/100,min,max));
        let html=this.group(tt('Panel elements'));
        html+=this.customElementAddMarkup();
        html+=this.row(tt('Edit element'),this.selectControl('p-actorElement',key,keys.map(k=>[k,label(k)])));
        html+=this.hintRow(tt('Positions are relative to each actor row. Changes apply to every actor.'));
        html+=this.row('',field('visible',this.checkControl('p-element-visible',element.visible,tt('Visible'))));
        html+=this.pair('X',number('x',-9999),'Y',number('y',-9999));
        html+=this.pair(tt('Width'),number('width',1),tt('Height'),number('height',1));
        if(key.startsWith('custom_')) html+=this.row(tt('Name'),field('name',this.textControl('p-element-name',element.name || '')));
        if(element.kind==='gauge' || element.kind==='box') {
            html+=this.row(tt('Shape'),field('shape',this.selectControl('p-element-shape',element.shape,[['rectangle',tt('Rectangle')],['rounded',tt('Rounded')],['chamfer',tt('Cut Corners')],...(element.kind==='gauge'?[['circular',tt('Circular')]]:[]) ])));
            if(element.shape==='circular') html+=this.row(tt('Thickness'),number('thickness',1,Math.floor(Math.min(element.width,element.height)/2)));
            else if(element.shape!=='rectangle') {
                html+=this.row(tt('Corners'),number('corner',0,Math.floor(Math.min(element.width,element.height)/2)));
                html+=this.hintRow(tt('Increase Height to make larger corners visible.'));
            }
            if(element.kind==='gauge') html+='<canvas class="rr-ui-gauge-preview" width="260" height="88" aria-label="'+tt('Style Preview')+'"></canvas>';
            if(element.kind==='gauge') {
                html+=this.row(tt('Meter image'),field('meterImage',this.textControl('p-element-meterImage',element.meterImage||'',tt('(none)'))),tt('A picture cut to the value instead of the drawn bar. system/Name reads img/system.'));
                html+=this.row(tt('Meter rows'),field('meterRows',this.selectControl('p-element-meterRows',String(element.meterRows===2?2:1),[['1',tt('One: the meter')],['2',tt('Two: meter over a falling damage trail')]])));
            }
            for(const [prop,name] of [['color','Color 1'],['color2','Color 2'],['backColor','Background']]) html+=this.row(tt(name),field(prop,this.optionalColorControl('p-element-'+prop,element[prop]||'',tt('Default'))));
        } else if(element.kind==='image') {
            html+=this.row(tt('Picture'),field('file',this.textControl('p-element-file',element.file||'',tt('(none)'))),tt('In img/pictures.'));
            html+=this.row(tt('Turn speed'),number('rotation',-60,60),tt('Degrees per frame; 0 stays still.'));
        } else if(element.kind==='states') {
            html+=this.row(tt('Show'),field('statesMode',this.selectControl('p-element-statesMode',element.statesMode||'row',[['row',tt('All in a row')],['cycle',tt('One at a time')]])));
            html+=this.pair(tt('Icon size'),number('iconSize',8,144),tt('Spacing'),number('iconGap',0,100));
            html+=this.hintRow(tt('Preview icons are examples. In game, this shows active states and buffs.'));
        } else if(element.kind!=='portrait') {
            html+=this.pair(tt('Font size'),number('fontSize',8,200),tt('Align'),field('align',this.selectControl('p-element-align',element.align,[['left',tt('Left')],['center',tt('Center')],['right',tt('Right')]])));
            html+=this.row(tt('Color'),field('color',this.optionalColorControl('p-element-color',element.color||'',tt('Default'))));
            if(element.kind==='value') {
                html+=this.row(tt('Show value'),field('valueFormat',this.selectControl('p-element-valueFormat',element.valueFormat,[['current',tt('Value')],['currentMax',tt('Value')+' / '+tt('Maximum')],['percent','%']])));
                html+=this.row(tt('Number image'),field('numberImage',this.textControl('p-element-numberImage',element.numberImage||'',tt('(none)'))),tt('A picture of the digits 0 to 9 side by side, scaled to the height.'));
            }
            else html+=this.row(tt('Text'),field('text',this.textControl('p-element-text',element.text,tt('Game default'))));
        }
        html+=this.row('',field('onlyActive',this.checkControl('p-element-onlyActive',!!element.onlyActive,tt('Only for the active actor'))),tt('In battle: the actor choosing a command or acting, like a turn marker.'));
        html+=this.row('',field('behind',this.checkControl('p-element-behind',!!element.behind,tt('Behind other parts'))));
        if(key.startsWith('custom_') && ['value','gauge'].includes(element.kind)) {
            html+=this.row(tt('Source'),field('gauge',this.selectControl('p-element-gauge',element.gauge,[...DatabaseUserInterfaceEditor.GAUGE_KINDS.slice(0,4),'atb',...DatabaseUserInterfaceEditor.GAUGE_KINDS.slice(4)].map(k=>[k,tt(k==='variable'?'Variable':k.toUpperCase())]))));
            if(element.gauge==='variable') {
                html+=this.row(tt('Variable'),field('variableId',this.selectControl('p-element-variableId',element.variableId,this.panelVariableOptions())));
                html+=this.row(tt('Maximum'),number('max',1,999999999));
                html+=this.row(tt('Maximum variable'),field('maxVariableId',this.selectControl('p-element-maxVariableId',element.maxVariableId,this.panelVariableOptions())));
                html+=this.hintRow(tt('Game variables are shared by all actors.'));
                html+=this.hintRow(tt('Variable previews use sample values; playtest shows the current game value.'));
            } else if(!['hp','mp','tp','exp'].includes(element.gauge)) html+=this.row(tt('Maximum'),number('max',1,999999999));
        }
        html+='<div class="rr-ui-element-actions"><button type="button" class="rr-btn-chip p-element-reset">'+tt('Reset Element')+'</button>';
        if(key.startsWith('custom_')) html+='<button type="button" class="rr-btn-chip p-element-remove">'+tt('Remove')+'</button>';
        html+='</div>';
        return html;
    }

    drawActorPanelRow(node, rect, index) {
        const actorNode={...node,actorSource:'partySlot',index,fill:'none',_previewFocused:false};
        const actor=this.startingActor(actorNode), ctx=this.ctx;
        const elements=DatabaseUserInterfaceEditor.actorPanelLayout(node,rect.width,rect.height,this.fontSize(node));
        const basic=this.databaseManager.data.system?.terms?.basic || [];
        ctx.save(); ctx.beginPath(); ctx.rect(rect.x,rect.y,rect.width,rect.height); ctx.clip();
        // Behind parts first; parts for the active actor preview on the first row.
        const ordered=Object.entries(elements).sort((a,b)=>Number(!!b[1].behind)-Number(!!a[1].behind));
        for(const [key,element] of ordered) {
            if(!element.visible || (element.onlyActive && index!==0)) continue;
            const r={x:rect.x+element.x,y:rect.y+element.y,width:element.width,height:element.height};
            ctx.save(); ctx.beginPath(); ctx.rect(r.x,r.y,r.width,r.height); ctx.clip();
            if(element.kind==='portrait') {
                const portrait=this.actorPortraitPreview(actor);
                if(portrait?.image) ctx.drawImage(portrait.image,r.x,r.y,r.width,r.height);
                else if(!portrait?.bound) this.drawImageNode({...actorNode,type:'image',source:'partyFace',fit:'stretch'},r);
            } else if(element.kind==='states') {
                const sheet=this.image('system','IconSet'),size=Math.min(element.iconSize,r.height),gap=element.iconGap;
                const icons=(this.databaseManager.data.states || []).filter(state=>state?.iconIndex>0).map(state=>state.iconIndex);
                const count=Math.max(0,Math.floor((r.width+gap)/(size+gap)));
                if(sheet.image) icons.slice(0,count).forEach((id,index)=>ctx.drawImage(this.iconTile(sheet.image,id),r.x+index*(size+gap),r.y,size,size));
            } else if(element.kind==='box') {
                DatabaseUserInterfaceEditor.drawActorGauge(ctx,r,element,1,[element.color||'#30343c',element.color2||element.color||'#30343c','#30343c']);
            } else if(element.kind==='image') {
                const picture=element.file?this.imageRef(element.file):null;
                if(picture?.image) ctx.drawImage(picture.image,r.x+(r.width-picture.image.width)/2,r.y+(r.height-picture.image.height)/2);
            } else if(element.gauge==='atb') {
                if(element.kind==='gauge') DatabaseUserInterfaceEditor.drawActorGauge(ctx,r,element,0.6,[this.skinColor(26),this.skinColor(27),this.skinColor(19)]);
            } else {
                const gauge=element.gauge;
                const param=['mhp','mmp','atk','def','mat','mdf','agi','luk'].indexOf(gauge);
                const maximum=gauge==='variable'?(element.maxVariableId?100:element.max||100):gauge==='tp'?100:gauge==='exp'?1:param>=0?(element.max||100):Math.max(1,this.startingParam(actor,gauge==='hp'?0:1));
                const current=gauge==='variable'?maximum*0.65:gauge==='hp'?this.startingParam(actor,0):gauge==='mp'?this.startingParam(actor,1):param>=0?this.startingParam(actor,param):0;
                const rate=maximum>0?Math.max(0,Math.min(1,current/maximum)):0;
                const meter=element.kind==='gauge'&&element.meterImage?this.imageRef(element.meterImage).image:null;
                const digits=element.kind==='value'&&element.numberImage?this.imageRef(element.numberImage).image:null;
                if(meter) {
                    const rows=element.meterRows===2?2:1, ch=meter.height/rows, sw=meter.width*rate;
                    if(sw>0) ctx.drawImage(meter,0,0,sw,ch,r.x,r.y,r.width*rate,r.height);
                } else if(digits) {
                    const value=String(element.valueFormat==='percent'?Math.round(rate*100):Math.round(current)), cw=digits.width/10, dw=cw*r.height/digits.height;
                    let x=r.x+(element.align==='right'?r.width-value.length*dw:element.align==='center'?(r.width-value.length*dw)/2:0);
                    for(const c of value){const d=c.charCodeAt(0)-48; if(d>=0&&d<=9) ctx.drawImage(digits,d*cw,0,cw,digits.height,x,r.y,dw,r.height); x+=dw;}
                } else if(element.kind==='gauge') {
                    const colors={hp:[20,21],mp:[22,23],tp:[28,29],exp:[14,6]}[gauge] || [14,6];
                    DatabaseUserInterfaceEditor.drawActorGauge(ctx,r,element,rate,[this.skinColor(colors[0]),this.skinColor(colors[1]),this.skinColor(19)]);
                } else {
                    const term={hp:basic[3]||'HP',mp:basic[5]||'MP',tp:basic[7]||'TP',exp:basic[9]||'EXP'}[gauge] || '';
                    const text=element.kind==='value'?(element.valueFormat==='percent'?Math.round(rate*100)+'%':element.valueFormat==='current'?String(current):current+' / '+maximum)
                        :element.kind==='label'?(element.text||term):element.text.replace(/\{levelLabel\}/g,basic[1]||'Lv');
                    this.drawActorElementText({...actorNode,type:'text',text,fontSize:element.fontSize,textColor:element.color||node.textColor,align:element.align},r);
                }
            }
            ctx.restore();
            if(index===0 && this.selectedId===node.id && this._actorElementKey===key) {
                ctx.save(); ctx.strokeStyle='#e5be37'; ctx.lineWidth=1/this.scale; ctx.setLineDash([4/this.scale,3/this.scale]);
                ctx.strokeRect(r.x,r.y,r.width,r.height); ctx.restore();
            }
        }
        ctx.restore();
    }

    drawActorElementText(node,rect) {
        const ctx=this.ctx, runs=this.parseText(node)[0]?.runs || [];
        const iconSize=Math.min(32,Math.max(1,rect.height-2));
        const width=runs.reduce((sum,run)=>{this.setTextFont(ctx,node,run.size);return sum+(run.icon!==undefined?iconSize+4:ctx.measureText(run.text).width);},0);
        let x=rect.x+(node.align==='right'?Math.max(0,rect.width-width):node.align==='center'?Math.max(0,(rect.width-width)/2):0);
        const icons=this.image('system','IconSet');
        for(const run of runs) {
            if(run.icon!==undefined) {
                if(icons.image) ctx.drawImage(this.iconTile(icons.image,run.icon),x+2,rect.y+(rect.height-iconSize)/2,iconSize,iconSize);
                x+=iconSize+4;
            } else {
                this.setTextFont(ctx,node,run.size); ctx.textAlign='left'; ctx.textBaseline='alphabetic';
                const y=rect.y+rect.height/2+run.size*0.35;
                if(node.outline) {ctx.lineJoin='round';ctx.lineWidth=node.outlineWidth;ctx.strokeStyle=node.outlineColor||'rgba(0,0,0,0.6)';ctx.strokeText(run.text,x,y);}
                ctx.fillStyle=run.color;ctx.fillText(run.text,x,y);x+=ctx.measureText(run.text).width;
            }
        }
    }

    /** A gauge as Sprite_Gauge draws it: label in the system colour, value right-aligned, the bar across the lower half. */
    drawGaugeNode(node, rect) {
        const ctx = this.ctx;
        const data = (this.databaseManager && this.databaseManager.data) || {};
        const basic = (data.system && data.system.terms && data.system.terms.basic) || [];
        const main = this.fontSize({ fontSize: 0 });
        const h = rect.height;
        const gaugeH = node.gaugeHeight > 0 ? node.gaugeHeight : Math.max(4, Math.floor(h / 2));
        const labelSize = node.rowLayout === 'actorPanel' ? Math.min(node.fontSize || main, h - 4) : Math.max(DatabaseUserInterfaceEditor.MIN_FONT_SIZE, Math.round((main - 2) * h / 24));
        const valueSize = node.rowLayout === 'actorPanel' ? labelSize : Math.max(DatabaseUserInterfaceEditor.MIN_FONT_SIZE, Math.round((main - 6) * h / 24));
        const variable = node.gauge === 'variable';
        const actor = this.startingActor(node);
        const paramNames = (data.system && data.system.terms && data.system.terms.params) || ['Max HP', 'Max MP', 'ATK', 'DEF', 'MAT', 'MDF', 'AGI', 'LUK'];
        const labels = { hp: basic[3] || 'HP', mp: basic[5] || 'MP', tp: basic[7] || 'TP', exp: basic[9] || 'EXP' };
        DatabaseUserInterfaceEditor.GAUGE_KINDS.slice(4, 12).forEach((kind, id) => { labels[kind] = paramNames[id] || kind.toUpperCase(); });
        const label = node.label || (variable ? '' : labels[node.gauge]);
        ctx.save();
        ctx.font = `${labelSize}px ${this.fontFamily()}`;
        const labelWidth = Math.ceil(ctx.measureText(label || '').width);
        const gaugeX = node.showLabel ? labelWidth + 6 : 0;
        const colors = { hp: [20, 21], mp: [22, 23], tp: [28, 29] }[node.gauge] || [0, 0];
        let current = 0, maximum = 1;
        if (variable) {
            maximum = node.max;
            current = Math.round(maximum / 2);
        } else if (node.gauge === 'hp' || node.gauge === 'mhp') {
            current = this.startingParam(actor, 0); maximum = node.gauge === 'hp' ? current : node.max;
        } else if (node.gauge === 'mp' || node.gauge === 'mmp') {
            current = this.startingParam(actor, 1); maximum = node.gauge === 'mp' ? current : node.max;
        } else if (node.gauge === 'tp') {
            current = 0; maximum = 100;
        } else if (node.gauge === 'exp') {
            const level = Number(actor && actor.initialLevel) || 1;
            if (actor && level >= (Number(actor.maxLevel) || 99)) {
                current = 1; maximum = 1;
            } else {
                current = 0; maximum = Math.max(1, this.startingExpForLevel(actor, level + 1) - this.startingExpForLevel(actor, level));
            }
        } else {
            const id = ['mhp', 'mmp', 'atk', 'def', 'mat', 'mdf', 'agi', 'luk'].indexOf(node.gauge);
            current = this.startingParam(actor, id); maximum = node.max;
        }
        const rate = maximum > 0 ? Math.min(1, Math.max(0, current / maximum)) : 0;
        const value = node.valueFormat === 'currentMax' ? `${current}/${maximum}` : node.valueFormat === 'percent' ? `${Math.round(rate * 100)}%` : String(current);
        // Bar
        const bx = rect.x + gaugeX, by = rect.y + h - gaugeH, bw = Math.max(0, rect.width - gaugeX);
        ctx.fillStyle = node.gaugeBackColor || this.skinColor(19);
        ctx.fillRect(bx, by, bw, gaugeH);
        if (bw > 2 && rate > 0) {
            const gradient = ctx.createLinearGradient(bx + 1, 0, bx + 1 + (bw - 2) * rate, 0);
            gradient.addColorStop(0, node.gaugeColor1 || this.skinColor(colors[0]));
            gradient.addColorStop(1, node.gaugeColor2 || this.skinColor(colors[1]));
            ctx.fillStyle = gradient;
            ctx.fillRect(bx + 1, by + 1, Math.floor((bw - 2) * rate), gaugeH - 2);
        }
        ctx.beginPath();
        ctx.rect(rect.x, rect.y, rect.width, rect.height);
        ctx.clip();
        ctx.textBaseline = 'alphabetic';
        ctx.lineJoin = 'round';
        if (node.showLabel && label) {
            const labelNode = Object.assign({}, node, { type: 'text', text: label, fontSize: labelSize, textColor: 16, wrap: false });
            const runs = this.parseText(labelNode)[0]?.runs || [];
            let x = rect.x + 1.5;
            const icons = this.image('system', 'IconSet');
            for (const run of runs) {
                if (run.icon !== undefined) {
                    const size = Math.min(32, Math.max(1, h - 2));
                    if (icons.image) ctx.drawImage(this.iconTile(icons.image, run.icon),
                        x, rect.y + (h - size) / 2, size, size);
                    x += size + 4;
                } else {
                    this.setTextFont(ctx, labelNode, run.size);
                    ctx.textAlign = 'left';
                    const y = Math.round(rect.y + h / 2 + run.size * 0.35);
                    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
                    ctx.strokeText(run.text, x, y); ctx.fillStyle = run.color; ctx.fillText(run.text, x, y);
                    x += ctx.measureText(run.text).width;
                }
            }
        }
        if (node.valueFormat !== 'hidden' && value !== '') {
            ctx.font = `${valueSize}px ${this.fontFamily()}`;
            ctx.textAlign = 'right';
            const y = Math.round(rect.y + h / 2 + valueSize * 0.35);
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(0,0,0,1)';
            ctx.strokeText(value, rect.x + rect.width, y);
            ctx.fillStyle = this.skinColor(0);
            ctx.fillText(value, rect.x + rect.width, y);
        }
        ctx.restore();
    }

    drawImageNode(node, rect) {
        const ctx = this.ctx;
        const folder = DatabaseUserInterfaceEditor.IMAGE_FOLDERS[node.source];
        const member = node.source === 'partyFace' ? this.startingActor(node) : null;
        const name = node.source === 'icon' ? 'IconSet' : node.source === 'partyFace' ? (member ? member.faceName : '') : node.file;
        const faceIndex = member ? member.faceIndex : node.index;
        const entry = name ? this.image(folder, name) : null;
        ctx.save();
        ctx.beginPath();
        ctx.rect(rect.x, rect.y, rect.width, rect.height);
        ctx.clip();
        if (!entry || !entry.image) {
            ctx.fillStyle = 'rgba(128,128,128,0.25)';
            ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
            ctx.restore();
            return;
        }
        const image = node.source === 'icon' ? this.iconTile(entry.image, node.index) : entry.image;
        let sx = 0, sy = 0, sw = image.width, sh = image.height;
        if (node.source === 'face' || node.source === 'partyFace') { sw = RRFaceSheet.sizeOf(this.databaseManager?.getSystem?.()); sh = sw; sx = (faceIndex % 4) * sw; sy = Math.floor(faceIndex / 4) * sh; }
        else if (node.source === 'character') {
            const big = /^\$/.test(node.file) || /\$/.test(node.file);
            sw = image.width / (big ? 3 : 12); sh = image.height / (big ? 4 : 8);
            const n = big ? 0 : node.index;
            sx = ((n % 4) * 3 + 1) * sw; sy = Math.floor(n / 4) * 4 * sh;
        }
        if (node.nineSlice && (node.source === 'picture' || node.source === 'system')) {
            const insets = { left: node.sliceLeft, top: node.sliceTop, right: node.sliceRight, bottom: node.sliceBottom };
            for (const part of DatabaseUserInterfaceEditor.nineSliceSegments(sw, sh, rect.width, rect.height, insets)) {
                ctx.drawImage(image, sx + part.sx, sy + part.sy, part.sw, part.sh,
                    rect.x + part.dx, rect.y + part.dy, part.dw, part.dh);
            }
            ctx.restore();
            return;
        }
        let dx = rect.x, dy = rect.y, dw = sw, dh = sh;
        if (node.fit === 'stretch') { dw = rect.width; dh = rect.height; }
        else if (node.fit === 'contain' && sw > 0 && sh > 0) {
            const scale = Math.min(rect.width / sw, rect.height / sh);
            dw = Math.round(sw * scale); dh = Math.round(sh * scale);
            dx = rect.x + Math.floor((rect.width - dw) / 2); dy = rect.y + Math.floor((rect.height - dh) / 2);
        }
        ctx.imageSmoothingEnabled = node.fit !== 'none';
        ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
        ctx.restore();
    }

    render() {
        const ctx = this.ctx;
        const screen = this.screenSize();
        const rects = this.rects();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, screen.width, screen.height);
        // Backdrop: what the interface's background setting does to the map.
        ctx.fillStyle = this.current.background === 'dim' ? '#141820' : this.current.background === 'none' ? '#2a3140' : '#1e2430';
        ctx.fillRect(0, 0, screen.width, screen.height);
        if (this.showGrid) {
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 1;
            const step = DatabaseUserInterfaceEditor.GRID * 4;
            ctx.beginPath();
            for (let x = step; x < screen.width; x += step) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, screen.height); }
            for (let y = step; y < screen.height; y += step) { ctx.moveTo(0, y + 0.5); ctx.lineTo(screen.width, y + 0.5); }
            ctx.stroke();
        }
        // The captured game underneath, locked: what the project shows today.
        const reference = this.showReference ? this.reference : null;
        if (reference && reference.image && reference.image.complete && reference.image.naturalWidth > 0) {
            ctx.globalAlpha = this.referenceOpacity;
            ctx.drawImage(reference.image, 0, 0, screen.width, screen.height);
            ctx.globalAlpha = 1;
        }
        // Reference-layer ordering contract: case 'box': this.drawSurface(node, rect); break;
        const key = String(this.capturedSelection || '');
        const captured = reference && reference.data && /^[ws]\d+$/.test(key)
            ? (key.startsWith('w') ? (reference.data.windows || [])[Number(key.slice(1))] : (reference.data.elements || [])[Number(key.slice(1))]) : null;
        if (captured) {
            ctx.save();
            ctx.strokeStyle = '#ffb648';
            ctx.lineWidth = 2 / this.scale;
            ctx.setLineDash([4 / this.scale, 3 / this.scale]);
            ctx.strokeRect(captured.x, captured.y, captured.width, captured.height);
            ctx.restore();
        }
        const opacities = new Map();
        const opacityOf = (node, trail) => {
            if (opacities.has(node.id)) return opacities.get(node.id);
            const parent = this.node(node.parent);
            let factor = node.opacity / 255;
            if (parent && parent !== node && !trail.has(node.id)) {
                trail.add(node.id);
                factor *= opacityOf(parent, trail);
            }
            opacities.set(node.id, factor);
            return factor;
        };
        for (const node of DatabaseUserInterfaceEditor.orderNodes(this.current.nodes)) {
            const rect = rects.get(node.id);
            if (!rect || rect.width <= 0 || rect.height <= 0) continue;
            let drawn = node;
            let stateOpacity = 255;
            let drawnRect = rect;
            if (DatabaseUserInterfaceEditor.isControl(node.type)) {
                const preview = this.previewControl(node);
                drawn = preview.node;
                stateOpacity = preview.opacity;
                drawnRect = Object.assign({}, rect, { x: rect.x + preview.offsetX, y: rect.y + preview.offsetY });
            }
            ctx.globalAlpha = opacityOf(node, new Set());
            ctx.globalAlpha *= stateOpacity / 255;
            switch (drawn.type) {
                case 'box': this.drawSurface(drawn, drawnRect); break;
                case 'image': this.drawImageNode(drawn, drawnRect); break;
                case 'text': this.drawText(drawn, drawnRect); break;
                case 'button': this.drawSurface(drawn, drawnRect); this.drawSelection(drawn, drawnRect); this.drawText(drawn, drawnRect); break;
                case 'input': this.drawSurface(drawn, drawnRect); this.drawSelection(drawn, drawnRect); this.drawText(this.inputPreviewNode(drawn), drawnRect); break;
                case 'battleWindow': this.drawBattleWindowNode(drawn, drawnRect); break;
                case 'battleCursor': this.drawBattleCursorNode(drawn, drawnRect); break;
                case 'list': this.drawListNode(drawn, drawnRect); break;
                case 'gauge': this.drawGaugeNode(drawn, drawnRect); break;
                default: break;
            }
            ctx.globalAlpha = 1;
        }
        for (const selected of this.selectedNodes()) {
            const rect = rects.get(selected.id);
            if (!rect) continue;
            const accent = (typeof ThemeColors !== 'undefined' && ThemeColors.resolve) ? ThemeColors.resolve('--color-accent-bright') : '#4da3ff';
            ctx.save();
            ctx.strokeStyle = accent;
            ctx.lineWidth = 2 / this.scale;
            ctx.setLineDash([6 / this.scale, 4 / this.scale]);
            ctx.strokeRect(rect.x, rect.y, Math.max(rect.width, 1), Math.max(rect.height, 1));
            ctx.setLineDash([]);
            const size = 8 / this.scale;
            ctx.fillStyle = accent;
            for (const [, hx, hy] of (this.selectedNodes().length === 1 ? this.handles(rect) : [])) ctx.fillRect(hx - size / 2, hy - size / 2, size, size);
            ctx.restore();
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DatabaseUserInterfaceEditor;
}
