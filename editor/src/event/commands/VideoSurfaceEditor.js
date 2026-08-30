/**
 * Native editor for RPG Reactor's video-surface plugin commands.
 * Commands remain ordinary MZ code-357 records so projects stay portable.
 */
class VideoSurfaceEditor {
    constructor(databaseManager, projectController) {
        const controllerOnly = projectController === undefined
            && (databaseManager?.getCurrentProject || databaseManager?.currentProject);
        this.databaseManager = controllerOnly ? null : databaseManager;
        this.projectController = controllerOnly ? databaseManager : projectController;
        this.modal = null;
        this.video = null;
        this.video3d = null;
        this.cleanupHandlers = [];
        this.fields = {};
        this.data = null;
        this.operation = 'ShowVideoSurface';
        this.callback = null;
        this.context = { type: 'map' };
        this.changedFields = new Set();
        this.rawArgs = {};
        this.snapshotMetrics = null;
        this.liveMapAuthoring = false;
        this.hiddenEventModal = null;
    }

    static get OPERATIONS() {
        return {
            ShowVideoSurface: 'Show Video Surface',
            TransformVideoSurface: 'Transform Video Surface',
            StopVideoSurface: 'Stop Video Surface'
        };
    }

    static get META() {
        if (!this._meta) this._meta = Symbol('videoSurfaceMeta');
        return this._meta;
    }

    static get ALIASES() {
        return {
            id: ['id', 'surfaceId', 'videoId'],
            movie: ['movie', 'file', 'filename'],
            target: ['target', 'bindTo'],
            eventId: ['eventId', 'event'],
            x: ['x', 'xOffset'], y: ['y', 'yOffset'], z: ['z', 'elevation'],
            width: ['width', 'sizeX'], height: ['height', 'sizeY'],
            opacity: ['opacity', 'alpha'], loop: ['loop', 'repeat'],
            muted: ['muted'], volume: ['volume', 'audioVolume'],
            playbackRate: ['playbackRate', 'rate'], layer: ['layer', 'zIndex'],
            depth: ['depth'], cullingDistance: ['cullingDistance', 'cullDistance', 'bufferDistance'],
            scanlines: ['scanlines'], wait: ['wait'],
            rotationX: ['rotationX', 'rotateX'], rotationY: ['rotationY', 'rotateY'],
            rotationZ: ['rotationZ', 'rotateZ', 'rotation'],
            scaleX: ['scaleX'], scaleY: ['scaleY'],
            corners: ['corners', 'fourCorners']
        };
    }

    static get SHOW_FIELDS() {
        return ['target', 'movie', 'eventId', 'x', 'y', 'z', 'width', 'height', 'opacity',
            'loop', 'muted', 'volume', 'playbackRate', 'corners', 'rotationX', 'rotationY',
            'rotationZ', 'scaleX', 'scaleY', 'layer', 'depth', 'cullingDistance', 'scanlines', 'wait'];
    }

    static supports(name) {
        return Object.prototype.hasOwnProperty.call(this.OPERATIONS, name);
    }

    static number(value, fallback, integer = false) {
        const result = Number(value);
        if (!Number.isFinite(result)) return fallback;
        return integer ? Math.trunc(result) : result;
    }

    static boolean(value, fallback) {
        if (value === true || value === 'true' || value === 1 || value === '1'
            || value === 'yes' || value === 'on') return true;
        if (value === false || value === 'false' || value === 0 || value === '0'
            || value === 'no' || value === 'off') return false;
        return fallback;
    }

    static jsonValue(value) {
        if (typeof value !== 'string') return value;
        try { return JSON.parse(value); } catch (_) { return value; }
    }

    static defaults() {
        return {
            id: 1,
            target: 'thisEvent',
            movie: '',
            eventId: 0,
            x: 0,
            y: 0,
            z: 0,
            width: 320,
            height: 180,
            opacity: 255,
            loop: true,
            muted: true,
            volume: 100,
            playbackRate: 1,
            corners: [
                { x: -160, y: -90 }, { x: 160, y: -90 },
                { x: 160, y: 90 }, { x: -160, y: 90 }
            ],
            rotationX: 0,
            rotationY: 0,
            rotationZ: 0,
            scaleX: 1,
            scaleY: 1,
            layer: 3,
            depth: 0,
            cullingDistance: 0,
            scanlines: 0,
            wait: false
        };
    }

    static _object(value) {
        if (value && typeof value === 'object' && !Array.isArray(value)) return value;
        if (typeof value !== 'string' || !value.trim()) return null;
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
        } catch (_) {
            return null;
        }
    }

    static flattenArgs(value) {
        const args = this._object(value) || {};
        const nested = this._object(args.descriptor) || this._object(args.data);
        const flat = nested ? Object.assign({}, args, nested) : Object.assign({}, args);
        delete flat.descriptor;
        delete flat.data;
        return flat;
    }

    static _field(args, key) {
        for (const name of this.ALIASES[key] || [key]) {
            if (Object.prototype.hasOwnProperty.call(args, name)) {
                return { present: true, value: args[name], name };
            }
        }
        return { present: false, value: undefined, name: null };
    }

    static normalizeTarget(value, fallback) {
        if (value === undefined || value === null) return fallback;
        const text = String(value).trim().replace(/([a-z])([A-Z])/g, '$1-$2')
            .toLowerCase().replace(/[ _]+/g, '-');
        if (['fixed', 'fixed-map', 'map', 'map-fixed'].includes(text)) return 'map';
        if (text === 'this-event') return 'thisEvent';
        return ['event', 'player', 'screen'].includes(text) ? text : fallback;
    }

    static _parseCorners(args, fallback) {
        const packed = this._field(args, 'corners');
        if (packed.present) {
            const value = this.jsonValue(packed.value);
            if (Array.isArray(value) && value.length === 4) {
                const result = value.map((corner, index) => {
                    const source = Array.isArray(corner) ? { x: corner[0], y: corner[1] } : corner;
                    return {
                        x: this.number(source?.x, fallback[index].x),
                        y: this.number(source?.y, fallback[index].y)
                    };
                });
                if (result.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) return result;
            }
        }
        const aliases = [
            [['x0', 'topLeftX', 'corner0X'], ['y0', 'topLeftY', 'corner0Y']],
            [['x1', 'topRightX', 'corner1X'], ['y1', 'topRightY', 'corner1Y']],
            [['x2', 'bottomRightX', 'corner2X'], ['y2', 'bottomRightY', 'corner2Y']],
            [['x3', 'bottomLeftX', 'corner3X'], ['y3', 'bottomLeftY', 'corner3Y']]
        ];
        if (aliases.some(pair => pair.flat().some(key => Object.prototype.hasOwnProperty.call(args, key)))) {
            const result = aliases.map((pair, index) => {
                const xKey = pair[0].find(key => Object.prototype.hasOwnProperty.call(args, key));
                const yKey = pair[1].find(key => Object.prototype.hasOwnProperty.call(args, key));
                return {
                    x: this.number(xKey && args[xKey], fallback[index].x),
                    y: this.number(yKey && args[yKey], fallback[index].y)
                };
            });
            if (result.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) return result;
        }
        return fallback.map(point => ({ ...point }));
    }

    static parse(command, operation) {
        const name = operation || command?.parameters?.[1] || 'ShowVideoSurface';
        if (!this.supports(name)) return null;
        if (command && (command.code !== 357 || command.parameters?.[0] !== 'RPGReactor'
            || command.parameters?.[1] !== name)) return null;

        const rawArgs = this.flattenArgs(command?.parameters?.[3]);
        const data = this.defaults();
        const presentFields = new Set();
        for (const key of Object.keys(this.ALIASES)) {
            if (this._field(rawArgs, key).present) presentFields.add(key);
        }
        data.id = Math.max(1, this.number(this._field(rawArgs, 'id').value, data.id, true));
        if (name !== 'StopVideoSurface') {
            const target = this._field(rawArgs, 'target');
            data.target = this.normalizeTarget(target.value, target.present ? data.target : (command ? 'map' : data.target));
            const movie = this._field(rawArgs, 'movie');
            if (typeof movie.value === 'string') data.movie = movie.value;
            for (const key of ['eventId']) {
                const found = this._field(rawArgs, key);
                data[key] = this.number(found.value, data[key], true);
            }
            const layer = this._field(rawArgs, 'layer');
            const namedLayers = { below: 0, ground: 1, characters: 3, above: 5, screen: 10 };
            data.layer = typeof layer.value === 'string' && Object.prototype.hasOwnProperty.call(
                namedLayers, layer.value.trim().toLowerCase())
                ? namedLayers[layer.value.trim().toLowerCase()]
                : this.number(layer.value, data.layer, true);
            for (const key of ['x', 'y', 'z', 'width', 'height', 'volume',
                'playbackRate', 'rotationX', 'rotationY', 'rotationZ', 'scaleX', 'scaleY', 'depth',
                'cullingDistance', 'scanlines']) {
                const found = this._field(rawArgs, key);
                data[key] = this.number(found.value, data[key]);
            }
            const opacity = this._field(rawArgs, 'opacity');
            data.opacity = this.number(opacity.value, data.opacity);
            if (opacity.name === 'alpha') data.opacity *= 255;
            for (const key of ['loop', 'muted', 'wait']) {
                data[key] = this.boolean(this._field(rawArgs, key).value, data[key]);
            }
            if (!this._field(rawArgs, 'muted').present) {
                const audibleKey = Object.prototype.hasOwnProperty.call(rawArgs, 'audio')
                    ? 'audio' : Object.prototype.hasOwnProperty.call(rawArgs, 'audible') ? 'audible' : null;
                if (audibleKey) {
                    data.muted = !this.boolean(rawArgs[audibleKey], !data.muted);
                    presentFields.add('muted');
                }
            }
            data.corners = this._parseCorners(rawArgs, data.corners);
            const rotation = this.jsonValue(rawArgs.rotation);
            if (rotation && typeof rotation === 'object' && !Array.isArray(rotation)) {
                data.rotationX = this.number(rotation.x, data.rotationX);
                data.rotationY = this.number(rotation.y, data.rotationY);
                data.rotationZ = this.number(rotation.z, data.rotationZ);
            }
        }
        Object.defineProperty(data, this.META, {
            value: { rawArgs, presentFields, existing: !!command }, enumerable: false
        });
        return data;
    }

    static _stripAliases(args, key) {
        for (const alias of this.ALIASES[key] || [key]) delete args[alias];
        if (key === 'corners') {
            for (const name of ['x0', 'y0', 'x1', 'y1', 'x2', 'y2', 'x3', 'y3',
                'topLeftX', 'topLeftY', 'topRightX', 'topRightY', 'bottomRightX',
                'bottomRightY', 'bottomLeftX', 'bottomLeftY', 'corner0X', 'corner0Y',
                'corner1X', 'corner1Y', 'corner2X', 'corner2Y', 'corner3X', 'corner3Y']) delete args[name];
        }
    }

    static _copyValue(value) {
        if (Array.isArray(value)) return value.map(item => this._copyValue(item));
        if (value && typeof value === 'object') return Object.assign({}, value);
        return value;
    }

    static build(operation, data, indent = 0, options = {}) {
        if (!this.supports(operation)) throw new TypeError(`Unknown video-surface operation: ${operation}`);
        const meta = data?.[this.META] || {};
        const rawArgs = this.flattenArgs(options.rawArgs || meta.rawArgs || {});
        const args = Object.assign({}, rawArgs);
        for (const obsolete of ['placementMode', 'mapId']) delete args[obsolete];
        this._stripAliases(args, 'id');
        args.id = Math.max(1, this.number(data?.id, 1, true));

        if (operation === 'StopVideoSurface') {
            for (const key of Object.keys(this.ALIASES)) {
                if (key !== 'id') this._stripAliases(args, key);
            }
        } else if (operation === 'ShowVideoSurface') {
            for (const key of this.SHOW_FIELDS) this._stripAliases(args, key);
            for (const key of this.SHOW_FIELDS) {
                if (key === 'eventId' && data.target !== 'event') continue;
                args[key] = this._copyValue(data[key]);
            }
        } else {
            for (const key of ['movie', 'wait']) this._stripAliases(args, key);
            const changed = options.changedFields
                ? new Set(options.changedFields)
                : meta.existing ? new Set() : new Set(Object.keys(data || {}));
            for (const key of changed) {
                if (!this.SHOW_FIELDS.includes(key) || key === 'movie' || key === 'wait') continue;
                this._stripAliases(args, key);
                args[key] = this._copyValue(data[key]);
            }
        }
        return {
            code: 357,
            indent: Number.isInteger(indent) ? indent : 0,
            parameters: ['RPGReactor', operation, this.OPERATIONS[operation], args]
        };
    }

    static parseCommand(command, operation) {
        return this.parse(command, operation);
    }

    static buildCommand(operation, data, indent = 0, options) {
        return this.build(operation, data, indent, options);
    }

    static safeMoviePath(value) {
        if (typeof value !== 'string') return false;
        const path = value.trim();
        if (!path || path.length > 1000 || /[\0-\x1f\x7f]/.test(path)) return false;
        if (/^[a-z][a-z0-9+.-]*:/i.test(path) || /^[\\/]/.test(path)
            || /^[a-z]:[\\/]/i.test(path) || path.includes('\\')) return false;
        const parts = path.split('/');
        return parts.length > 0 && parts.every(part => part && part !== '.' && part !== '..')
            && /\.(?:webm|mp4)$/i.test(parts.at(-1));
    }

    static validate(operation, data, context = {}, changedFields = null) {
        const errors = [];
        const changed = changedFields ? new Set(changedFields) : null;
        const check = (key, predicate, message) => {
            if ((!changed || changed.has(key)) && !predicate(data[key])) errors.push(message);
        };
        if (!Number.isInteger(data.id) || data.id < 1 || data.id > 999999) {
            errors.push('Surface ID must be an integer from 1 to 999999.');
        }
        if (operation === 'StopVideoSurface') return errors;
        if (!['thisEvent', 'event', 'player', 'map', 'screen'].includes(data.target)) {
            errors.push('Select a valid target.');
        }
        if (context.type === 'common' && data.target === 'thisEvent') {
            errors.push('Common events require an explicit target; This Event is invocation-dependent.');
        }
        if (context.type === 'troop' && operation !== 'StopVideoSurface') {
            errors.push('Show and Transform Video Surface are map-only commands.');
        }
        if (data.target === 'event' && (!Number.isInteger(data.eventId) || data.eventId < 1)) {
            errors.push('Event target requires a positive event ID.');
        }
        if (operation === 'ShowVideoSurface' && !this.safeMoviePath(data.movie)) {
            errors.push('Select a safe WebM or MP4 movie.');
        }
        for (const [key, min, max, label] of [
            ['x', -1000000, 1000000, 'X'], ['y', -1000000, 1000000, 'Y'],
            ['z', -1000000, 1000000, 'Z'], ['width', 1, 8192, 'Width'],
            ['height', 1, 8192, 'Height'], ['opacity', 0, 255, 'Opacity'],
            ['volume', 0, 100, 'Volume'], ['playbackRate', 0.05, 16, 'Playback rate'],
            ['rotationX', -360000, 360000, 'Rotation X'],
            ['rotationY', -360000, 360000, 'Rotation Y'],
            ['rotationZ', -360000, 360000, 'Rotation Z'],
            ['scaleX', -1000, 1000, 'Scale X'], ['scaleY', -1000, 1000, 'Scale Y'],
            ['layer', -10000, 10000, 'Layer'], ['depth', -10000, 10000, 'Depth'],
            ['cullingDistance', 0, 1000000, 'Culling distance'],
            ['scanlines', 0, 1, 'Scanlines']
        ]) check(key, value => Number.isFinite(value) && value >= min && value <= max,
            `${label} must be between ${min} and ${max}.`);
        if ((!changed || changed.has('corners')) && (!Array.isArray(data.corners)
            || data.corners.length !== 4 || data.corners.some(point => !Number.isFinite(point?.x)
                || !Number.isFinite(point?.y) || Math.abs(point.x) > 1000000 || Math.abs(point.y) > 1000000))) {
            errors.push('All four local corners must contain finite coordinates.');
        }
        if (data.loop && data.wait) errors.push('Loop and Wait for completion cannot both be enabled.');
        return errors;
    }

    acceptsCommand(command) {
        return !!(command && command.code === 357 && command.parameters?.[0] === 'RPGReactor'
            && VideoSurfaceEditor.supports(command.parameters?.[1]));
    }

    _project() {
        const controller = this.projectController;
        return controller?.getCurrentProject?.() || controller?.currentProject
            || (typeof window !== 'undefined' && window.reactor?.projectController?.getCurrentProject?.())
            || (typeof window !== 'undefined' && window.reactor?.projectController?.currentProject) || null;
    }

    movieFiles(project = this._project()) {
        if (!project?.path || typeof require !== 'function') return [];
        const path = require('path');
        const root = path.join(project.path, 'movies');
        let assets = typeof RRAssetFiles !== 'undefined' ? RRAssetFiles : null;
        if (!assets) {
            try { assets = require('../../utils/AssetFiles.js'); } catch (_) {}
        }
        if (assets?.list) {
            return assets.list(root, ['.webm', '.mp4'], { anyCase: true })
                .filter(file => VideoSurfaceEditor.safeMoviePath(file.relativePath))
                .map(file => ({ relativePath: file.relativePath, absolutePath: file.absolutePath }));
        }
        const fs = require('fs');
        const result = [];
        const visit = (directory, parts) => {
            let entries;
            try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch (_) { return; }
            entries.sort((a, b) => a.name.localeCompare(b.name));
            for (const entry of entries) {
                const absolutePath = path.join(directory, entry.name);
                if (entry.isDirectory()) visit(absolutePath, parts.concat(entry.name));
                else if (entry.isFile()) {
                    const relativePath = parts.concat(entry.name).join('/');
                    if (VideoSurfaceEditor.safeMoviePath(relativePath)) result.push({ relativePath, absolutePath });
                }
            }
        };
        visit(root, []);
        return result;
    }

    discoverMovies(project) {
        return this.movieFiles(project);
    }

    _t(text) {
        return typeof window !== 'undefined' && window.I18n ? window.I18n.tText(text) : text;
    }

    _el(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    _listen(target, type, handler, options) {
        target.addEventListener(type, handler, options);
        this.cleanupHandlers.push(() => target.removeEventListener(type, handler, options));
    }

    _markChanged(key) {
        if (this.operation === 'TransformVideoSurface') this.changedFields.add(key);
    }

    _field(parent, label, key, options = {}) {
        const group = this._el('label', 'vs-field');
        group.style.cssText = 'display:flex;flex-direction:column;gap:4px;min-width:0;color:var(--color-text-muted);font-size:11px;';
        group.appendChild(this._el('span', '', this._t(label)));
        const input = this._el(options.select ? 'select' : 'input', 'vs-input');
        input.style.cssText = 'width:100%;min-width:0;box-sizing:border-box;padding:6px 7px;border:1px solid var(--color-border-input);border-radius:3px;background:var(--color-bg-input);color:var(--color-text);';
        if (options.select) {
            for (const [value, text] of options.select) {
                const option = this._el('option', '', this._t(text));
                option.value = value;
                input.appendChild(option);
            }
        } else {
            input.type = options.type || 'number';
            if (options.min !== undefined) input.min = options.min;
            if (options.max !== undefined) input.max = options.max;
            if (options.step !== undefined) input.step = options.step;
        }
        input.value = options.value !== undefined ? options.value : this.data[key];
        this.fields[key] = input;
        let control = input;
        if (!options.select && input.type === 'number') {
            // Themed step buttons replace the browser's spinner.
            control = this._el('div', 'rr-number-stepper vs-stepper');
            input.classList.add('rr-number-stepper-input');
            input.style.cssText = 'flex:1;min-width:0;width:100%;box-sizing:border-box;padding:6px 7px;border:0;background:transparent;color:var(--color-text);';
            const buttons = this._el('div', 'rr-number-stepper-buttons');
            for (const [direction, glyph] of [[1, '\u25b2'], [-1, '\u25bc']]) {
                const button = this._el('button', '', glyph);
                button.type = 'button';
                button.tabIndex = -1;
                button.setAttribute('aria-label', direction > 0 ? '+' : '-');
                this._listen(button, 'click', () => {
                    if (input.disabled) return;
                    try { direction > 0 ? input.stepUp() : input.stepDown(); } catch (_) {
                        const step = Number(input.step) || 1;
                        input.value = (Number(input.value) || 0) + direction * step;
                    }
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                });
                buttons.appendChild(button);
            }
            control.append(input, buttons);
        }
        if (!options.manual) {
            // Out-of-range numbers snap to the limit instead of waiting for a
            // validation message: the ceiling applies while typing, the floor
            // once the field is left (so "0" can still be typed on the way to
            // "0.5").
            const clamp = final => {
                if (input.type !== 'number') return;
                const value = Number(input.value);
                if (!Number.isFinite(value)) return;
                let next = value;
                if (options.max !== undefined && next > options.max) next = options.max;
                if (final && options.min !== undefined && next < options.min) next = options.min;
                if (next !== value) input.value = String(next);
            };
            const update = final => {
                clamp(final);
                const previous = this.data[key];
                this.data[key] = options.numeric || input.type === 'number'
                    ? VideoSurfaceEditor.number(input.value, previous, !!options.integer)
                    : input.value;
                this._markChanged(key);
                options.onChange?.(this.data[key], previous);
                this._updatePreviews();
            };
            this._listen(input, 'input', () => update(false));
            this._listen(input, 'change', () => update(true));
        }
        group.appendChild(control);
        parent.appendChild(group);
        return input;
    }

    _checkbox(parent, label, key) {
        const group = this._el('label', 'vs-check');
        group.style.cssText = 'display:flex;align-items:center;gap:7px;color:var(--color-text);font-size:12px;';
        const input = this._el('input');
        input.type = 'checkbox';
        input.checked = !!this.data[key];
        this.fields[key] = input;
        this._listen(input, 'change', () => {
            this.data[key] = input.checked;
            this._markChanged(key);
            if (key === 'wait' && input.checked) this._setBooleanField('loop', false);
            if (key === 'loop' && input.checked) this._setBooleanField('wait', false);
            this._updatePreviews();
        });
        group.append(input, this._el('span', '', this._t(label)));
        parent.appendChild(group);
    }

    _setBooleanField(key, value) {
        if (this.data[key] === value) return;
        this.data[key] = value;
        if (this.fields[key]) this.fields[key].checked = value;
        this._markChanged(key);
    }

    _section(parent, title) {
        const section = this._el('section', 'vs-control-section');
        section.style.cssText = 'padding:10px;border:1px solid var(--color-border);border-radius:5px;background:var(--color-bg-panel);';
        const heading = this._el('div', '', this._t(title));
        heading.style.cssText = 'margin-bottom:8px;color:var(--color-text-strong);font-size:12px;font-weight:700;letter-spacing:.03em;';
        section.appendChild(heading);
        parent.appendChild(section);
        return section;
    }

    _grid(parent, min = 105) {
        const grid = this._el('div');
        grid.style.cssText = `display:grid;grid-template-columns:repeat(auto-fit,minmax(${min}px,1fr));gap:8px;`;
        parent.appendChild(grid);
        return grid;
    }

    _movieAsset() {
        return this.movies.find(file => file.relativePath === this.data.movie) || null;
    }

    _setMovie() {
        for (const media of [this.video, this.video3d]) {
            if (!media) continue;
            media.pause();
            media.removeAttribute('src');
            media.load?.();
        }
        const asset = this._movieAsset();
        if (!asset || !this.video) return;
        let assets = typeof RRAssetFiles !== 'undefined' ? RRAssetFiles : null;
        if (!assets && typeof require === 'function') {
            try { assets = require('../../utils/AssetFiles.js'); } catch (_) {}
        }
        this.video.src = assets?.toUrl ? assets.toUrl(asset.absolutePath) : asset.absolutePath;
        this.video.muted = true;
        this.video.loop = true;
        this.video.playbackRate = Math.max(0.05, this.data.playbackRate || 1);
        this.video.play?.().catch?.(() => {});
        if (this.video3d) {
            this.video3d.src = this.video.src;
            this.video3d.muted = true;
            this.video3d.loop = true;
            this.video3d.playbackRate = this.video.playbackRate;
            this.video3d.play?.().catch?.(() => {});
        }
    }

    _syncCornersFromRect() {
        const halfW = Math.max(1, this.data.width) / 2;
        const halfH = Math.max(1, this.data.height) / 2;
        this.data.corners = [
            { x: -halfW, y: -halfH }, { x: halfW, y: -halfH },
            { x: halfW, y: halfH }, { x: -halfW, y: halfH }
        ];
        this._markChanged('corners');
        this._syncCornerFields();
    }

    _resizeCorners(oldWidth, oldHeight) {
        const meta = this.data?.[VideoSurfaceEditor.META];
        const ownsCorners = this.operation !== 'TransformVideoSurface'
            || meta?.presentFields?.has('corners') || this.changedFields.has('corners');
        if (!ownsCorners) return;
        const sx = oldWidth > 0 ? this.data.width / oldWidth : 1;
        const sy = oldHeight > 0 ? this.data.height / oldHeight : 1;
        this.data.corners.forEach(point => {
            point.x *= sx;
            point.y *= sy;
        });
        this._markChanged('corners');
        this._syncCornerFields();
    }

    _syncSizeFromCorners() {
        const xs = this.data.corners.map(point => point.x);
        const ys = this.data.corners.map(point => point.y);
        this.data.width = Math.max(...xs) - Math.min(...xs);
        this.data.height = Math.max(...ys) - Math.min(...ys);
        for (const key of ['width', 'height']) {
            if (this.fields[key]) this.fields[key].value = Math.round(this.data[key] * 100) / 100;
            this._markChanged(key);
        }
    }

    _syncCornerFields() {
        this.data.corners.forEach((corner, index) => {
            for (const axis of ['x', 'y']) {
                const input = this.fields[`corner${index}${axis}`];
                if (input) input.value = Math.round(corner[axis] * 100) / 100;
            }
        });
    }

    _currentMap() {
        return this.context?.currentMap || this.projectController?.eventManager?.currentMap
            || (typeof window !== 'undefined' && window.reactor?.eventManager?.currentMap) || null;
    }

    _mapEditor() {
        return this.projectController?.getMapEditor?.()
            || (typeof window !== 'undefined' && window.reactor?.projectController?.getMapEditor?.()) || null;
    }

    _mapCanvas() {
        const map3d = this.projectController?.mapEditor3D
            || (typeof window !== 'undefined' && window.reactor?.mapEditor3D);
        if (map3d?.canvas?.isConnected && map3d.renderer) return map3d.canvas;
        const app = this._mapEditor()?.tilemapManager?.app || this.projectController?.app;
        return app?.canvas || app?.view || app?.renderer?.canvas || app?.renderer?.view
            || document.querySelector?.('#canvas-container canvas') || null;
    }

    _drawMapSnapshot(canvas) {
        const source = this._mapCanvas();
        if (!source || source === canvas) return false;
        const context = canvas.getContext?.('2d');
        if (!context) return false;
        try {
            canvas.width = 816;
            canvas.height = 624;
            context.drawImage(source, 0, 0, 816, 624);
            const tilemap = this._mapEditor()?.tilemapManager
                || this.projectController?.getTilemapManager?.();
            this.snapshotMetrics = {
                sourceWidth: Math.max(1, source.clientWidth || source.width || 816),
                sourceHeight: Math.max(1, source.clientHeight || source.height || 624),
                tileSize: tilemap?.TILE_SIZE || 48,
                mapX: tilemap?.container?.x || 0,
                mapY: tilemap?.container?.y || 0,
                mapScaleX: tilemap?.container?.scale?.x || 1,
                mapScaleY: tilemap?.container?.scale?.y || tilemap?.container?.scale?.x || 1
            };
            return true;
        } catch (_) {
            this.snapshotMetrics = null;
            return false;
        }
    }

    _buildControls(parent) {
        const identity = this._section(parent, 'Surface');
        const identityGrid = this._grid(identity);
        this._field(identityGrid, 'Surface ID', 'id', { min: 1, max: 999999, step: 1, integer: true });
        if (this.operation === 'StopVideoSurface') return;

        const targets = [];
        if (this.context.type === 'map') targets.push(['thisEvent', 'This Event']);
        targets.push(['event', 'Selected Event'], ['player', 'Player'],
            ['map', 'Fixed Map Position'], ['screen', 'Fixed Screen Position']);
        this._field(identityGrid, 'Target', 'target', {
            select: targets,
            onChange: (value, previous) => {
                this._convertPositionForTarget(previous);
                this._syncWorkspaceMode();
            }
        });
        this._buildEventField(identityGrid);

        if (this.operation === 'ShowVideoSurface') {
            const movieGroup = this._el('label', 'vs-field');
            movieGroup.style.cssText = 'display:flex;flex-direction:column;gap:4px;grid-column:1/-1;color:var(--color-text-muted);font-size:11px;';
            movieGroup.appendChild(this._el('span', '', this._t('Movie')));
            const movie = this._el('select', 'vs-input');
            movie.style.cssText = 'width:100%;padding:6px 7px;border:1px solid var(--color-border-input);border-radius:3px;background:var(--color-bg-input);color:var(--color-text);';
            const none = this._el('option', '', this._t('(Select a movie)'));
            none.value = '';
            movie.appendChild(none);
            for (const file of this.movies) {
                const option = this._el('option', '', file.relativePath);
                option.value = file.relativePath;
                movie.appendChild(option);
            }
            if (this.data.movie && !this.movies.some(file => file.relativePath === this.data.movie)) {
                const unavailable = this._el('option', '', `${this.data.movie} (${this._t('Unavailable')})`);
                unavailable.value = this.data.movie;
                movie.appendChild(unavailable);
            }
            movie.value = this.data.movie;
            this.fields.movie = movie;
            this._listen(movie, 'change', () => {
                this.data.movie = movie.value;
                this._setMovie();
                this._updatePreviews();
            });
            movieGroup.appendChild(movie);
            identityGrid.appendChild(movieGroup);
        }

        const binding = this._section(parent, 'Binding & Position');
        this.positionHint = this._el('div', 'vs-position-hint');
        this.positionHint.style.cssText = 'margin:-2px 0 8px;color:var(--color-text-muted);font-size:10px;';
        binding.appendChild(this.positionHint);
        const bindingGrid = this._grid(binding);
        this._field(bindingGrid, 'X', 'x', { step: 0.1 });
        this._field(bindingGrid, 'Y', 'y', { step: 0.1 });
        this._field(bindingGrid, 'Z / Elevation', 'z', { step: 0.1 });
        this._syncTargetFields();
        this._field(bindingGrid, 'Width', 'width', {
            min: 1, max: 8192, step: 0.1,
            onChange: (value, previous) => this._resizeCorners(previous, this.data.height)
        });
        this._field(bindingGrid, 'Height', 'height', {
            min: 1, max: 8192, step: 0.1,
            onChange: (value, previous) => this._resizeCorners(this.data.width, previous)
        });

        const visual = this._section(parent, 'Visual & Playback');
        const visualGrid = this._grid(visual);
        this._field(visualGrid, 'Opacity', 'opacity', { min: 0, max: 255, step: 1 });
        this._field(visualGrid, 'Volume %', 'volume', { min: 0, max: 100, step: 1 });
        this._field(visualGrid, 'Playback Rate', 'playbackRate', { min: 0.05, max: 16, step: 0.05 });
        this._field(visualGrid, 'Layer', 'layer', { min: -10000, max: 10000, step: 1, integer: true });
        this._field(visualGrid, 'Depth', 'depth', { min: -10000, max: 10000, step: 0.1 });
        this._field(visualGrid, 'Culling Distance', 'cullingDistance', { min: 0, max: 1000000, step: 0.1 });
        this._field(visualGrid, 'Scanlines', 'scanlines', { min: 0, max: 1, step: 0.01 });
        const checks = this._el('div');
        checks.style.cssText = 'grid-column:1/-1;display:flex;flex-wrap:wrap;gap:10px 18px;padding-top:3px;';
        this._checkbox(checks, 'Loop', 'loop');
        this._checkbox(checks, 'Muted', 'muted');
        if (this.operation === 'ShowVideoSurface' && this.context.type !== 'troop') {
            this._checkbox(checks, 'Wait for completion', 'wait');
        }
        visualGrid.appendChild(checks);

        const corners = this._section(parent, '2D Local Corners');
        corners.appendChild(this._el('div', '', this._t('Offsets are measured from the selected target anchor.')));
        corners.lastChild.style.cssText = 'margin:-2px 0 8px;color:var(--color-text-muted);font-size:10px;';
        const cornerGrid = this._grid(corners, 88);
        const names = ['Top Left', 'Top Right', 'Bottom Right', 'Bottom Left'];
        this.data.corners.forEach((corner, index) => {
            for (const axis of ['x', 'y']) {
                const key = `corner${index}${axis}`;
                const input = this._field(cornerGrid, `${names[index]} ${axis.toUpperCase()}`, key,
                    { step: 0.1, value: corner[axis], manual: true });
                const update = () => {
                    corner[axis] = VideoSurfaceEditor.number(input.value, corner[axis]);
                    this._markChanged('corners');
                    this._syncSizeFromCorners();
                    this._updatePreviews();
                };
                this._listen(input, 'input', update);
                this._listen(input, 'change', update);
            }
        });

        const placement3d = this._section(parent, '3D World Transform');
        placement3d.appendChild(this._el('div', '', this._t(
            'On 3D maps, map X/Y are tile coordinates, event/player X/Y are pixel offsets, and Z is world elevation.')));
        placement3d.lastChild.style.cssText = 'margin:-2px 0 8px;color:var(--color-text-muted);font-size:10px;';
        const transformGrid = this._grid(placement3d);
        for (const [label, key] of [
            ['Rotation X', 'rotationX'], ['Rotation Y', 'rotationY'], ['Rotation Z', 'rotationZ']
        ]) this._field(transformGrid, label, key, { min: -360000, max: 360000, step: 1 });
        this._field(transformGrid, 'Scale X', 'scaleX', { min: -1000, max: 1000, step: 0.01 });
        this._field(transformGrid, 'Scale Y', 'scaleY', { min: -1000, max: 1000, step: 0.01 });
    }

    _button(text, className = 'rr-btn-secondary') {
        const button = this._el('button', className, this._t(text));
        button.type = 'button';
        return button;
    }

    _buildWorkspace(parent) {
        const toolbar = this._el('div', 'vs-placement-toolbar');
        toolbar.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin-bottom:8px;';
        const mode = this._el('strong', 'vs-preview-mode');
        const reset = this._button('Reset Local Corners');
        const coordinates = this._el('span', 'vs-live-coordinates');
        coordinates.style.cssText = 'margin-left:auto;color:var(--color-text-muted);font:11px monospace;';
        toolbar.append(mode, reset, coordinates);
        parent.appendChild(toolbar);
        this.previewMode = mode;
        this.coordinateLabel = coordinates;

        const frame = this._el('div', 'video-surface-placement-workspace');
        frame.style.cssText = 'position:relative;flex:1;min-height:clamp(320px,58vh,680px);overflow:hidden;touch-action:none;border:1px solid var(--color-border-input);border-radius:5px;background:#10151d;box-shadow:inset 0 0 50px rgba(0,0,0,.55);';
        parent.appendChild(frame);
        this.workspace = frame;

        const mapSnapshot = this._el('canvas', 'vs-map-snapshot');
        mapSnapshot.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;opacity:.55;pointer-events:none;';
        frame.appendChild(mapSnapshot);
        if (!this._drawMapSnapshot(mapSnapshot)) {
            mapSnapshot.style.backgroundImage = 'linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px)';
            mapSnapshot.style.backgroundSize = '32px 32px';
        }
        this.mapSnapshot = mapSnapshot;

        const eventAnchor = this._el('div', 'vs-event-anchor', '+');
        eventAnchor.style.cssText = 'display:none;position:absolute;z-index:4;width:18px;height:18px;margin:-9px;border:2px solid #ffd166;border-radius:50%;box-sizing:border-box;color:#ffd166;text-align:center;line-height:12px;font-weight:bold;pointer-events:none;filter:drop-shadow(0 1px 2px #000);';
        frame.appendChild(eventAnchor);
        this.eventAnchor = eventAnchor;

        const surface = this._el('div', 'vs-quad-surface');
        surface.style.cssText = 'position:absolute;inset:0;z-index:2;cursor:move;overflow:hidden;filter:drop-shadow(0 0 8px rgba(77,205,255,.5));';
        const video = this._el('video', 'vs-video-preview');
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.style.cssText = 'width:100%;height:100%;object-fit:cover;pointer-events:none;background:linear-gradient(135deg,#173246,#251b3c);';
        surface.appendChild(video);
        frame.appendChild(surface);
        this.video = video;
        this.quadSurface = surface;

        this.handles = this.data.corners.map((_, index) => {
            const handle = this._el('button', 'vs-corner-handle', String(index + 1));
            handle.type = 'button';
            handle.style.cssText = 'position:absolute;z-index:5;width:22px;height:22px;margin:-11px;padding:0;border:2px solid #fff;border-radius:50%;background:var(--color-accent);color:var(--color-accent-on);font:700 10px sans-serif;cursor:crosshair;touch-action:none;box-shadow:0 1px 5px #000;';
            frame.appendChild(handle);
            return handle;
        });

        const perspective = this._el('div', 'vs-3d-placement');
        perspective.style.cssText = 'display:none;position:absolute;inset:0;z-index:7;perspective:900px;overflow:hidden;background:radial-gradient(circle at 50% 45%,rgba(68,101,126,.25),rgba(8,11,16,.8) 75%);touch-action:none;';
        const note = this._el('div', '', this._t('Projected anchor with schematic orientation; runtime camera determines final perspective.'));
        note.style.cssText = 'position:absolute;left:10px;top:10px;z-index:2;color:#b7c9d6;font-size:10px;';
        perspective.appendChild(note);
        const plane = this._el('div', 'vs-3d-plane');
        plane.style.cssText = 'position:absolute;left:50%;top:50%;width:112px;height:63px;margin:-31.5px -56px;transform-style:preserve-3d;border:2px solid var(--color-accent);background:linear-gradient(135deg,#173246,#251b3c);box-shadow:0 15px 35px rgba(0,0,0,.6);cursor:move;';
        const video3d = this._el('video', 'vs-video-preview-3d');
        video3d.muted = true;
        video3d.loop = true;
        video3d.playsInline = true;
        video3d.style.cssText = 'width:100%;height:100%;object-fit:cover;pointer-events:none;';
        plane.appendChild(video3d);
        perspective.appendChild(plane);
        frame.appendChild(perspective);
        this.perspective = perspective;
        this.plane3d = plane;
        this.video3d = video3d;

        const sliders = this._el('div', 'vs-3d-sliders');
        sliders.style.cssText = 'display:none;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:7px;margin-top:8px;padding:9px;border:1px solid var(--color-border);border-radius:5px;background:var(--color-bg-panel);';
        parent.appendChild(sliders);
        this.sliders = sliders;
        for (const [label, key, min, max, step] of [
            ['X (tiles for map, pixels for bound targets)', 'x', -1000, 1000, 0.1],
            ['Y (tiles for map, pixels for bound targets)', 'y', -1000, 1000, 0.1],
            ['Z / Elevation', 'z', -1000, 1000, 0.1],
            ['Rotate X', 'rotationX', -180, 180, 1],
            ['Rotate Y', 'rotationY', -180, 180, 1],
            ['Rotate Z', 'rotationZ', -180, 180, 1],
            ['Scale X', 'scaleX', -5, 5, 0.01],
            ['Scale Y', 'scaleY', -5, 5, 0.01]
        ]) {
            const group = this._el('label');
            group.style.cssText = 'display:flex;flex-direction:column;gap:3px;color:var(--color-text-muted);font-size:10px;';
            const caption = this._el('span', '', `${this._t(label)}: ${this.data[key]}`);
            const input = this._el('input');
            input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = this.data[key];
            input.dataset.key = key;
            this._listen(input, 'input', () => {
                this.data[key] = Number(input.value);
                caption.textContent = `${this._t(label)}: ${input.value}`;
                if (this.fields[key]) this.fields[key].value = input.value;
                this._markChanged(key);
                this._updatePreviews();
            });
            group.append(caption, input);
            sliders.appendChild(group);
        }

        this._listen(reset, 'click', () => {
            this._syncCornersFromRect();
            this._updatePreviews();
        });
        this._bindPlacementPointers(surface, plane);
        this._syncWorkspaceMode();
    }

    static _eventLabel(event) {
        return String(event.id).padStart(3, '0') + (event.name ? `: ${event.name}` : '');
    }

    /**
     * The Event control sits beside Target. It is editable only for
     * "Selected Event"; for every other target it is greyed out and states
     * what the surface is bound to instead.
     */
    _buildEventField(parent) {
        const mapEvents = (this._currentMap()?.events || []).filter(Boolean);
        if (!mapEvents.length) {
            const input = this._field(parent, 'Event', 'eventId', { min: 1, max: 999999, step: 1, integer: true });
            this.eventIndicator = null;
            return input;
        }
        const options = mapEvents.map(event => [String(event.id), VideoSurfaceEditor._eventLabel(event)]);
        const select = this._field(parent, 'Event', 'eventId', { select: options, numeric: true, integer: true });
        this.eventIndicator = {};
        for (const [key, label] of [['none', 'None'], ['player', 'Player'], ['this', '']]) {
            const option = this._el('option', '', label ? this._t(label) : '');
            option.value = `__${key}`;
            option.hidden = true;
            select.appendChild(option);
            this.eventIndicator[key] = option;
        }
        return select;
    }

    /** Only the controls that apply to the chosen target are shown. */
    _syncTargetFields() {
        const target = this.data?.target;
        const show = (key, visible) => {
            const input = this.fields[key];
            const group = input?.closest?.('.vs-field') || input?.parentElement;
            if (group) group.style.display = visible ? '' : 'none';
        };
        const eventInput = this.fields.eventId;
        if (eventInput) {
            const editable = target === 'event';
            eventInput.disabled = !editable;
            (eventInput.closest('.rr-number-stepper') || eventInput).style.opacity = editable ? '' : '0.55';
            if (editable) {
                eventInput.value = String(this.data.eventId ?? '');
            } else if (this.eventIndicator) {
                const thisEvent = this.context?.event;
                this.eventIndicator.this.textContent = thisEvent ? VideoSurfaceEditor._eventLabel(thisEvent) : this._t('None');
                eventInput.value = target === 'player' ? '__player' : target === 'thisEvent' ? '__this' : '__none';
            } else {
                eventInput.value = '';
                eventInput.placeholder = this._t(target === 'player' ? 'Player' : 'None');
            }
        }
        show('z', this._mapIs3D() && target !== 'screen');
        show('cullingDistance', target !== 'screen');
        if (this.positionHint) {
            this.positionHint.textContent = this._t(target === 'screen' ? 'X and Y are screen pixels.'
                : target === 'map' ? 'X and Y are map tiles.'
                    : 'X and Y are pixel offsets from the anchor.');
        }
    }

    /** Keep the surface where it is on the map when the target changes. */
    _convertPositionForTarget(previousTarget) {
        if (!previousTarget || previousTarget === this.data.target) return;
        let position = null;
        if (this.liveMapAuthoring) {
            position = this._previewManager()?.convertTargetPosition?.(this.data, previousTarget, this.context?.event?.id) || null;
        } else if (this.workspace) {
            position = this._convertWorkspacePosition(previousTarget);
        }
        if (!position) return;
        this.data.x = position.x;
        this.data.y = position.y;
        this._markChanged('x');
        this._markChanged('y');
        if (this.fields.x) this.fields.x.value = position.x;
        if (this.fields.y) this.fields.y.value = position.y;
    }

    _convertWorkspacePosition(previousTarget) {
        const current = this.data.target;
        this.data.target = previousTarget;
        const anchor = this._targetAnchor();
        this.data.target = current;
        const round = value => Math.round(value * 100) / 100;
        if (current === 'screen') return { x: round(anchor.x), y: round(anchor.y) };
        if (current === 'map') {
            const lift = Math.max(1, this.data.height) * Math.abs(this.data.scaleY) / 2;
            const metrics = this.snapshotMetrics;
            if (metrics) {
                return {
                    x: round((anchor.x * metrics.sourceWidth / 816 - metrics.mapX) / (metrics.tileSize * metrics.mapScaleX) - 0.5),
                    y: round(((anchor.y + lift) * metrics.sourceHeight / 624 - metrics.mapY) / (metrics.tileSize * metrics.mapScaleY) - 0.5)
                };
            }
            return { x: round(anchor.x / 48 - 0.5), y: round((anchor.y + lift) / 48 - 0.5) };
        }
        const savedX = this.data.x, savedY = this.data.y;
        this.data.x = 0; this.data.y = 0;
        const base = this._targetAnchor();
        this.data.x = savedX; this.data.y = savedY;
        return { x: round(anchor.x - base.x), y: round(anchor.y - base.y) };
    }

    _mapIs3D() {
        const map = this._currentMap();
        const noted = /<3d>/i.test(map?.note || '') || !!map?.meta?.['3d'];
        return noted && map?.reactor3d?.mode !== '2d';
    }

    _usesThree() {
        return this._mapIs3D() && this.data?.target !== 'screen';
    }

    _syncWorkspaceMode() {
        if (!this.workspace) {
            this._syncTargetFields();
            this._updatePreviews();
            return;
        }
        const three = this._usesThree();
        if (this.previewMode) this.previewMode.textContent = this._t(three ? '3D World Authoring' : '2D Runtime Coordinates');
        if (this.quadSurface) this.quadSurface.style.display = three ? 'none' : '';
        this.handles?.forEach(handle => { handle.style.display = three ? 'none' : ''; });
        if (this.perspective) this.perspective.style.display = three ? 'block' : 'none';
        if (this.sliders) this.sliders.style.display = three ? 'grid' : 'none';
        this._syncTargetFields();
        this._updatePreviews();
    }

    _logicalPoint(event) {
        const rect = this.workspace.getBoundingClientRect();
        return {
            x: (event.clientX - rect.left) * 816 / Math.max(1, rect.width),
            y: (event.clientY - rect.top) * 624 / Math.max(1, rect.height)
        };
    }

    _addDragCleanup(cleanup) {
        const wrapped = () => {
            cleanup();
            const index = this.cleanupHandlers.indexOf(wrapped);
            if (index >= 0) this.cleanupHandlers.splice(index, 1);
        };
        this.cleanupHandlers.push(wrapped);
        return wrapped;
    }

    _bindPlacementPointers(surface, plane) {
        const startDrag = (event, corner) => {
            event.preventDefault();
            const start = this._logicalPoint(event);
            const originalX = this.data.x;
            const originalY = this.data.y;
            event.currentTarget?.setPointerCapture?.(event.pointerId);
            const move = moveEvent => {
                const point = this._logicalPoint(moveEvent);
                if (corner === null) {
                    const delta = this._workspaceDeltaToTarget(point.x - start.x, point.y - start.y);
                    this.data.x = originalX + delta.x;
                    this.data.y = originalY + delta.y;
                    this._markChanged('x');
                    this._markChanged('y');
                    if (this.fields.x) this.fields.x.value = Math.round(this.data.x * 100) / 100;
                    if (this.fields.y) this.fields.y.value = Math.round(this.data.y * 100) / 100;
                } else {
                    this.data.corners[corner] = this._localFromWorkspace(point);
                    this._markChanged('corners');
                    this._syncSizeFromCorners();
                    this._syncCornerFields();
                }
                this._updatePreviews();
            };
            let end;
            end = this._addDragCleanup(() => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', end);
                window.removeEventListener('pointercancel', end);
            });
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', end);
            window.addEventListener('pointercancel', end);
        };
        this._listen(surface, 'pointerdown', event => startDrag(event, null));
        this.handles.forEach((handle, index) => this._listen(handle, 'pointerdown', event => {
            event.stopPropagation();
            startDrag(event, index);
        }));

        this._listen(plane, 'pointerdown', event => {
            event.preventDefault();
            const startX = event.clientX;
            const startY = event.clientY;
            const x = this.data.x;
            const y = this.data.y;
            const mapUnits = this.data.target === 'map';
            const factor = mapUnits ? 32 : 0.35;
            const move = moveEvent => {
                this.data.x = x + (moveEvent.clientX - startX) / factor;
                this.data.y = y + (moveEvent.clientY - startY) / factor;
                this._markChanged('x');
                this._markChanged('y');
                if (this.fields.x) this.fields.x.value = Math.round(this.data.x * 100) / 100;
                if (this.fields.y) this.fields.y.value = Math.round(this.data.y * 100) / 100;
                this._updatePreviews();
            };
            let end;
            end = this._addDragCleanup(() => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', end);
                window.removeEventListener('pointercancel', end);
            });
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', end);
            window.addEventListener('pointercancel', end);
        });
    }

    _workspaceDeltaToTarget(dx, dy) {
        if (this.data.target !== 'map') return { x: dx, y: dy };
        const metrics = this.snapshotMetrics;
        const tileX = metrics
            ? metrics.tileSize * metrics.mapScaleX * 816 / metrics.sourceWidth : 48;
        const tileY = metrics
            ? metrics.tileSize * metrics.mapScaleY * 624 / metrics.sourceHeight : 48;
        return { x: dx / Math.max(0.001, tileX), y: dy / Math.max(0.001, tileY) };
    }

    _mapPointToWorkspace(x, y, feet = false) {
        const metrics = this.snapshotMetrics;
        if (metrics) {
            return {
                x: (metrics.mapX + (Number(x) + 0.5) * metrics.tileSize * metrics.mapScaleX)
                    * 816 / metrics.sourceWidth,
                y: (metrics.mapY + (Number(y) + (feet ? 1 : 0.5)) * metrics.tileSize * metrics.mapScaleY)
                    * 624 / metrics.sourceHeight
            };
        }
        return { x: (Number(x) + 0.5) * 48, y: (Number(y) + (feet ? 1 : 0.5)) * 48 };
    }

    _boundEvent() {
        const map = this._currentMap();
        if (this.data.target === 'thisEvent') return this.context?.event || null;
        if (this.data.target === 'event') {
            return map?.events?.find(event => event && Number(event.id) === Number(this.data.eventId)) || null;
        }
        return null;
    }

    _playerPoint() {
        const system = this.databaseManager?.getSystem?.();
        const map = this._currentMap();
        if (system && map && Number(system.startMapId) === Number(map.id)) {
            return this._mapPointToWorkspace(system.startX, system.startY, true);
        }
        return null;
    }

    _targetAnchor() {
        if (this.data.target === 'screen') return { x: this.data.x, y: this.data.y };
        // Non-screen surfaces stand on their anchor, as the runtime places them (Z is 3D only).
        const lift = Math.max(1, this.data.height) * Math.abs(this.data.scaleY) / 2;
        if (this.data.target === 'map') {
            const point = this._mapPointToWorkspace(this.data.x, this.data.y, false);
            return { x: point.x, y: point.y - lift };
        }
        const event = this._boundEvent();
        const base = event ? this._mapPointToWorkspace(event.x, event.y, true)
            : this.data.target === 'player' ? this._playerPoint() : null;
        return base ? { x: base.x + this.data.x, y: base.y + this.data.y - lift }
            : { x: 408 + this.data.x, y: 312 + this.data.y - lift };
    }

    _transformedCorners() {
        const rx = this.data.rotationX * Math.PI / 180;
        const ry = this.data.rotationY * Math.PI / 180;
        const rz = this.data.rotationZ * Math.PI / 180;
        const sx = Math.sin(rx), cx = Math.cos(rx);
        const sy = Math.sin(ry), cy = Math.cos(ry);
        const sz = Math.sin(rz), cz = Math.cos(rz);
        const distance = Math.max(this.data.width, this.data.height, 1) * 4;
        return this.data.corners.map(corner => {
            let x = corner.x * this.data.scaleX;
            let y = corner.y * this.data.scaleY * cx;
            let z = corner.y * this.data.scaleY * sx;
            const nx = x * cy + z * sy;
            z = -x * sy + z * cy;
            x = nx;
            const px = x * cz - y * sz;
            const py = x * sz + y * cz;
            const scale = distance / Math.max(distance * 0.1, distance + z);
            return { x: px * scale, y: py * scale };
        });
    }

    _transformLocal(point) {
        const saved = this.data.corners;
        this.data.corners = [point, point, point, point];
        const transformed = this._transformedCorners()[0];
        this.data.corners = saved;
        return transformed;
    }

    _localFromWorkspace(point) {
        const anchor = this._targetAnchor();
        const target = { x: point.x - anchor.x, y: point.y - anchor.y };
        let local = { ...target };
        for (let iteration = 0; iteration < 8; iteration++) {
            const at = this._transformLocal(local);
            const errorX = target.x - at.x;
            const errorY = target.y - at.y;
            if (Math.hypot(errorX, errorY) < 0.01) break;
            const fx = this._transformLocal({ x: local.x + 0.01, y: local.y });
            const fy = this._transformLocal({ x: local.x, y: local.y + 0.01 });
            const a = (fx.x - at.x) / 0.01;
            const b = (fy.x - at.x) / 0.01;
            const c = (fx.y - at.y) / 0.01;
            const d = (fy.y - at.y) / 0.01;
            const determinant = a * d - b * c;
            if (Math.abs(determinant) < 1e-8) break;
            local.x += (errorX * d - b * errorY) / determinant;
            local.y += (a * errorY - errorX * c) / determinant;
        }
        return local;
    }

    _project3DAnchor() {
        const map3d = this.projectController?.mapEditor3D
            || (typeof window !== 'undefined' && window.reactor?.mapEditor3D);
        if (!map3d?.camera || typeof THREE === 'undefined') return null;
        let mapX;
        let mapY;
        if (this.data.target === 'map') {
            mapX = this.data.x;
            mapY = this.data.y;
        } else {
            const event = this._boundEvent();
            if (!event) return null;
            mapX = Number(event.x) + this.data.x / 48;
            mapY = Number(event.y) + this.data.y / 48;
        }
        const map = this._currentMap();
        const ix = Math.round(mapX);
        const iy = Math.round(mapY);
        const elevation = map?.reactor3d?.elevation?.[iy * map.width + ix] || 0;
        const tileSize = this._mapEditor()?.tilemapManager?.TILE_SIZE || 48;
        const centerLift = this.data.height / tileSize * Math.abs(this.data.scaleY) / 2;
        const vector = new THREE.Vector3(mapX + 0.5, elevation + this.data.z + centerLift, mapY + 0.5);
        vector.project(map3d.camera);
        return { x: (vector.x + 1) * 408, y: (1 - vector.y) * 312 };
    }

    _updatePreviews() {
        if (!this.data) return;
        this._previewManager()?.updateAuthoring?.(this);
        if (!this.workspace) return;
        const anchor = this._targetAnchor();
        const transformed = this._transformedCorners().map(point => ({
            x: anchor.x + point.x, y: anchor.y + point.y
        }));
        const percent = point => `${point.x * 100 / 816}% ${point.y * 100 / 624}%`;
        if (this.quadSurface) this.quadSurface.style.clipPath = `polygon(${transformed.map(percent).join(',')})`;
        this.handles?.forEach((handle, index) => {
            handle.style.left = `${transformed[index].x * 100 / 816}%`;
            handle.style.top = `${transformed[index].y * 100 / 624}%`;
        });
        if (this.coordinateLabel) {
            this.coordinateLabel.textContent = this._usesThree()
                ? `XYZ ${this.data.x.toFixed(1)}, ${this.data.y.toFixed(1)}, ${this.data.z.toFixed(1)}  R ${this.data.rotationX.toFixed(1)}, ${this.data.rotationY.toFixed(1)}, ${this.data.rotationZ.toFixed(1)}`
                : `Anchor ${anchor.x.toFixed(1)},${anchor.y.toFixed(1)}  `
                    + this.data.corners.map((corner, i) => `${i + 1}:${Math.round(corner.x)},${Math.round(corner.y)}`).join('  ');
        }
        if (this.plane3d) {
            const projected = this._project3DAnchor();
            const factor = this.data.target === 'map' ? 32 : 0.35;
            const tx = projected ? projected.x - 408 : this.data.x * factor;
            const ty = projected ? projected.y - 312 : this.data.y * factor;
            this.plane3d.style.width = `${Math.max(1, this.data.width * 0.35)}px`;
            this.plane3d.style.height = `${Math.max(1, this.data.height * 0.35)}px`;
            this.plane3d.style.margin = `${-Math.max(1, this.data.height * 0.35) / 2}px 0 0 ${-Math.max(1, this.data.width * 0.35) / 2}px`;
            this.plane3d.style.transform = `translate3d(${tx}px,${ty}px,${-this.data.z * 16}px) `
                + `rotateX(${this.data.rotationX}deg) rotateY(${this.data.rotationY}deg) rotateZ(${this.data.rotationZ}deg) `
                + `scale(${this.data.scaleX},${this.data.scaleY})`;
            this.plane3d.style.opacity = Math.max(0, Math.min(255, this.data.opacity)) / 255;
        }
        for (const media of [this.video, this.video3d]) {
            if (media) media.playbackRate = Math.max(0.05, this.data.playbackRate || 1);
        }
        if (this.quadSurface) this.quadSurface.style.opacity = Math.max(0, Math.min(255, this.data.opacity)) / 255;
        this._updateEventAnchor();
    }

    _previewManager() {
        return this.projectController?.videoSurfacePreviewManager
            || (typeof window !== 'undefined' && window.reactor?.videoSurfacePreviewManager) || null;
    }

    /** Where the live panel sits on screen, so map previews can stay clear of it. */
    livePanelRect() {
        if (this.popout || !this.liveDialog?.isConnected) return null;
        return this.liveDialog.getBoundingClientRect();
    }

    /**
     * Move the live panel into its own NW.js window so it can sit on another
     * monitor. The dialog element itself is adopted by the new document, so
     * every field keeps its listeners and its link to this editor.
     */
    _popOut() {
        if (this.popout || !this.liveDialog || typeof nw === 'undefined' || !nw.Window?.open) return false;
        const dialog = this.liveDialog;
        const rect = dialog.getBoundingClientRect();
        const body = dialog.querySelector('.video-surface-editor-body');
        const popout = {
            win: null, closing: false, styles: dialog.style.cssText,
            bodyColumns: body?.style.gridTemplateColumns || '',
            button: dialog.querySelector('.vs-pop-out')
        };
        this.popout = popout;
        const width = Math.max(360, Math.round(rect.width) + 16);
        const height = Math.max(420, Math.round(rect.height));
        nw.Window.open('video-surface-panel.html', {
            width, height, min_width: 320, min_height: 360,
            frame: true, show: true, resizable: true, icon: 'images/icon.png'
        }, win => {
            if (!win) { this.popout = null; return; }
            popout.win = win;
            const mount = () => {
                if (this.popout !== popout) return;
                const doc = win.window.document;
                doc.title = this._t(VideoSurfaceEditor.OPERATIONS[this.operation]);
                for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
                    const copy = doc.createElement('link');
                    copy.rel = 'stylesheet';
                    copy.href = link.href;
                    doc.head.appendChild(copy);
                }
                const theme = document.documentElement.getAttribute('data-theme');
                if (theme) doc.documentElement.setAttribute('data-theme', theme);
                doc.body.style.cssText = 'margin:0;height:100vh;display:flex;background:var(--color-bg-deep,#111);';
                dialog.style.cssText = 'display:flex;flex-direction:column;width:100%;height:100%;min-height:0;';
                if (body) body.style.gridTemplateColumns = 'minmax(260px,1fr)';
                if (popout.button) popout.button.style.display = 'none';
                doc.body.appendChild(dialog);
                // The manifest's main-window minimum wins over the requested
                // size until the child window has settled, so size it afterwards.
                const size = () => {
                    if (this.popout !== popout) return;
                    try { win.setMinimumSize(320, 360); win.resizeTo(width, height); } catch (_) {}
                };
                setTimeout(size, 50);
                setTimeout(size, 400);
                this._previewManager()?.revealAuthoringSurface?.();
            };
            const ready = () => win.window?.document?.readyState === 'complete';
            if (ready()) mount(); else win.on('loaded', mount);
            win.on('closed', () => {
                if (this.popout === popout && !popout.closing) this._dockPanel();
            });
        });
        return true;
    }

    /** Return a popped-out panel to the map window (or drop it while closing). */
    _dockPanel() {
        const popout = this.popout;
        if (!popout) return;
        this.popout = null;
        const dialog = this.liveDialog;
        if (dialog && this.modal?.isConnected) {
            dialog.style.cssText = popout.styles;
            const body = dialog.querySelector('.video-surface-editor-body');
            if (body) body.style.gridTemplateColumns = popout.bodyColumns;
            if (popout.button) popout.button.style.display = '';
            this.modal.appendChild(dialog);
        }
        popout.closing = true;
        try { popout.win?.close(true); } catch (_) {}
    }

    static get PANEL_OFFSET_KEY() { return 'rpgreactor.videoSurfacePanelOffset'; }

    /**
     * The live panel floats over the map, so let the user move it by its
     * title bar and keep that position for the next command.
     */
    _makePanelDraggable(header, dialog, closeButton) {
        header.style.cursor = 'move';
        header.style.userSelect = 'none';
        let offset = { x: 0, y: 0 };
        try {
            const saved = JSON.parse(localStorage.getItem(VideoSurfaceEditor.PANEL_OFFSET_KEY) || 'null');
            if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) offset = { x: saved.x, y: saved.y };
        } catch (_) {}
        const apply = () => {
            const rect = dialog.getBoundingClientRect();
            const baseLeft = rect.left - this._panelOffset.x;
            const baseTop = rect.top - this._panelOffset.y;
            const maxX = Math.max(0, window.innerWidth - rect.width) - baseLeft;
            const maxY = Math.max(0, window.innerHeight - rect.height) - baseTop;
            offset = { x: Math.min(maxX, Math.max(-baseLeft, offset.x)), y: Math.min(maxY, Math.max(-baseTop, offset.y)) };
            this._panelOffset = offset;
            dialog.style.transform = offset.x || offset.y ? `translate(${offset.x}px, ${offset.y}px)` : '';
        };
        this._panelOffset = { x: 0, y: 0 };
        apply();
        this._listen(header, 'pointerdown', event => {
            if (event.button !== 0 || this.popout || event.target.closest?.('button')) return;
            event.preventDefault();
            // A native <select> popup does not follow its element, so close it.
            if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
            const startX = event.clientX - offset.x;
            const startY = event.clientY - offset.y;
            const move = moveEvent => {
                offset = { x: moveEvent.clientX - startX, y: moveEvent.clientY - startY };
                apply();
            };
            let end;
            end = this._addDragCleanup(() => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', end);
                window.removeEventListener('pointercancel', end);
                try { localStorage.setItem(VideoSurfaceEditor.PANEL_OFFSET_KEY, JSON.stringify(offset)); } catch (_) {}
            });
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', end);
            window.addEventListener('pointercancel', end);
        });
    }

    _beginLiveMapAuthoring() {
        if (this.operation === 'StopVideoSurface' || this.context.type !== 'map') return false;
        const manager = this._previewManager();
        if (!manager?.beginAuthoring?.(this, this.data, this.context)) return false;
        const eventModal = document.getElementById('event-editor-modal');
        if (eventModal && eventModal.style.display !== 'none') {
            this.hiddenEventModal = { element: eventModal, display: eventModal.style.display };
            eventModal.style.display = 'none';
        }
        this.liveMapAuthoring = true;
        return true;
    }

    applyLiveMapPlacement(fields) {
        for (const key of fields || []) {
            this._markChanged(key);
            const input = this.fields[key];
            if (input && key !== 'corners') input.value = Math.round(Number(this.data[key]) * 100) / 100;
        }
        this._syncCornerFields();
    }

    _updateEventAnchor() {
        if (!this.eventAnchor) return;
        const event = this._boundEvent();
        const point = event ? this._mapPointToWorkspace(event.x, event.y, true)
            : this.data.target === 'player' ? this._playerPoint() : null;
        if (!point) {
            this.eventAnchor.style.display = 'none';
            return;
        }
        this.eventAnchor.style.display = 'block';
        this.eventAnchor.style.left = `${point.x * 100 / 816}%`;
        this.eventAnchor.style.top = `${point.y * 100 / 624}%`;
        this.eventAnchor.title = event?.name || this._t('Player start');
    }

    _applyContextDefaults(command) {
        if (command) return;
        if (this.context.type === 'common') {
            this.data.target = 'map';
            this.data.x = 0;
            this.data.y = 0;
        } else if (this.context.type === 'map' && this.context.event?.id) {
            this.data.eventId = Number(this.context.event.id);
        }
    }

    _resolveBinding() {
        this.data.id = VideoSurfaceEditor.number(this.fields.id?.value, this.data.id, true);
        if (this.data.target === 'event' && !(this.data.eventId > 0) && this.context.event?.id > 0) {
            this.data.eventId = Number(this.context.event.id);
            if (this.fields.eventId) this.fields.eventId.value = String(this.data.eventId);
            this._markChanged('eventId');
        }
        if (this.operation === 'TransformVideoSurface' && this.data.target === 'event'
            && this.changedFields.has('target')) this._markChanged('eventId');
        if (this.data.wait && this.data.loop) {
            this.data.loop = false;
            if (this.fields.loop) this.fields.loop.checked = false;
            this._markChanged('loop');
        }
    }

    _showValidation(errors) {
        if (!this.validationMessage) return;
        this.validationMessage.replaceChildren();
        if (!errors.length) {
            this.validationMessage.style.display = 'none';
            return;
        }
        this.validationMessage.style.display = 'block';
        for (const error of errors) this.validationMessage.appendChild(this._el('div', '', this._t(error)));
    }

    show(command, callback, operation, context = null) {
        this.close(false);
        this.operation = operation || command?.parameters?.[1] || 'ShowVideoSurface';
        if (!VideoSurfaceEditor.supports(this.operation)) return false;
        if (command && !this.acceptsCommand(command)) return false;
        this.context = Object.assign({ type: 'map' }, context || {});
        this.callback = callback;
        this.data = VideoSurfaceEditor.parse(command, this.operation);
        this.rawArgs = this.data?.[VideoSurfaceEditor.META]?.rawArgs || {};
        this.changedFields = new Set();
        this._applyContextDefaults(command);
        this.movies = this.movieFiles();
        this.fields = {};
        this.liveMapAuthoring = this._beginLiveMapAuthoring();

        const overlay = this._el('div', 'rr-modal-overlay video-surface-editor-modal');
        overlay.style.cssText = this.liveMapAuthoring
            ? 'position:fixed;inset:0;z-index:21000;display:flex;align-items:stretch;justify-content:flex-end;padding:12px;box-sizing:border-box;pointer-events:none;background:transparent;'
            : 'position:fixed;inset:0;z-index:21000;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;background:rgba(0,0,0,.78);';
        const dialog = this._el('div', 'rr-modal video-surface-editor');
        dialog.style.cssText = this.liveMapAuthoring
            ? 'display:flex;flex-direction:column;width:min(440px,calc(100vw - 24px));height:calc(100vh - 24px);min-height:420px;pointer-events:auto;box-shadow:0 12px 42px rgba(0,0,0,.72);'
            : 'display:flex;flex-direction:column;width:min(1220px,calc(100vw - 24px));height:min(900px,calc(100vh - 24px));min-height:420px;';
        overlay.appendChild(dialog);

        const header = this._el('div', 'rr-modal-header');
        header.appendChild(this._el('div', 'rr-modal-title', this._t(VideoSurfaceEditor.OPERATIONS[this.operation])));
        const closeButton = this._button('\u00d7', 'rr-modal-close');
        if (this.liveMapAuthoring && typeof nw !== 'undefined' && nw.Window?.open) {
            const popOut = this._button('\u29c9', 'rr-modal-close vs-pop-out');
            popOut.title = this._t('Open in a separate window');
            popOut.style.marginRight = '4px';
            this._listen(popOut, 'click', () => this._popOut());
            header.appendChild(popOut);
        }
        header.appendChild(closeButton);
        dialog.appendChild(header);
        this.liveDialog = this.liveMapAuthoring ? dialog : null;
        if (this.liveMapAuthoring) this._makePanelDraggable(header, dialog, closeButton);

        const body = this._el('div', 'rr-modal-body video-surface-editor-body');
        body.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr));gap:12px;min-height:0;flex:1;padding:12px;overflow:auto;';
        const controls = this._el('div', 'vs-controls');
        controls.style.cssText = 'display:flex;flex-direction:column;gap:9px;min-width:0;overflow:auto;';
        body.appendChild(controls);
        if (this.liveMapAuthoring) {
            const help = this._el('div', 'vs-live-map-help', this._t(
                'Drag the video on the map to move it. Drag a corner handle to warp it or an edge handle to resize it. Drag this panel by its title to uncover the map. Right-click saved surfaces to open their source command.')
                + (this._mapIs3D() ? ' ' + this._t('In the 3D view, drag the rings around the video to rotate it.') : ''));
            help.style.cssText = 'padding:9px;border:1px solid var(--color-accent);border-radius:4px;background:var(--color-bg-deep);color:var(--color-text);font-size:11px;line-height:1.45;';
            controls.appendChild(help);
        }
        this._buildControls(controls);
        if (this.operation !== 'StopVideoSurface' && !this.liveMapAuthoring) {
            const placement = this._el('div', 'vs-placement-column');
            placement.style.cssText = 'display:flex;flex-direction:column;min-width:0;min-height:420px;';
            body.appendChild(placement);
            this._buildWorkspace(placement);
        } else {
            body.style.gridTemplateColumns = 'minmax(260px,420px)';
            body.style.justifyContent = 'center';
        }
        dialog.appendChild(body);

        const footer = this._el('div', 'rr-modal-footer');
        footer.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:10px 14px;';
        const validation = this._el('div', 'vs-validation');
        validation.style.cssText = 'display:none;margin-right:auto;color:var(--color-danger,#ff6b6b);font-size:11px;line-height:1.35;';
        this.validationMessage = validation;
        const cancel = this._button('Cancel');
        const ok = this._button('OK', 'rr-button-primary');
        if (this.context.fromMap && this.context.source) {
            const goTo = this._button('Go to Event');
            goTo.style.marginRight = 'auto';
            this._listen(goTo, 'click', () => {
                const source = this.context.source;
                const manager = this._previewManager();
                const done = this.callback;
                this.close(false);
                if (done) done(null);
                manager?.navigateTo?.(source);
            });
            footer.appendChild(goTo);
        }
        footer.append(validation, cancel, ok);
        dialog.appendChild(footer);
        document.body.appendChild(overlay);
        this.modal = overlay;
        if (this.liveMapAuthoring) this._previewManager()?.revealAuthoringSurface?.();

        const cancelEdit = () => {
            const done = this.callback;
            this.close(false);
            if (done) done(null);
        };
        this._listen(closeButton, 'click', cancelEdit);
        this._listen(cancel, 'click', cancelEdit);
        this._listen(overlay, 'pointerdown', event => { if (event.target === overlay) cancelEdit(); });
        this._listen(ok, 'click', () => {
            this._resolveBinding();
            const errors = VideoSurfaceEditor.validate(this.operation, this.data, this.context,
                this.operation === 'TransformVideoSurface' ? this.changedFields : null);
            if (errors.length) {
                this._showValidation(errors);
                return;
            }
            const built = VideoSurfaceEditor.build(this.operation, this.data, command?.indent || 0, {
                rawArgs: this.rawArgs,
                changedFields: this.changedFields
            });
            const done = this.callback;
            this.close(false);
            if (done) done(built);
        });
        if (this.video) this._setMovie();
        this._updatePreviews();
        return true;
    }

    close(notify = false) {
        const callback = this.callback;
        this.callback = null;
        this._previewManager()?.endAuthoring?.(this);
        this._dockPanel();
        for (const cleanup of this.cleanupHandlers.splice(0)) {
            try { cleanup(); } catch (_) {}
        }
        for (const media of [this.video, this.video3d]) {
            if (!media) continue;
            try {
                media.pause();
                media.removeAttribute('src');
                media.load?.();
            } catch (_) {}
        }
        this.modal?.remove();
        if (this.hiddenEventModal?.element) {
            this.hiddenEventModal.element.style.display = this.hiddenEventModal.display;
        }
        this.hiddenEventModal = null;
        this.liveMapAuthoring = false;
        for (const key of ['modal', 'video', 'video3d', 'workspace', 'quadSurface', 'handles',
            'perspective', 'plane3d', 'sliders', 'eventAnchor', 'coordinateLabel', 'previewMode',
            'mapSnapshot', 'validationMessage', 'liveDialog', 'positionHint', 'eventIndicator']) this[key] = null;
        this.snapshotMetrics = null;
        this.fields = {};
        if (notify && callback) callback(null);
    }
}

if (typeof globalThis !== 'undefined') globalThis.VideoSurfaceEditor = VideoSurfaceEditor;
if (typeof module !== 'undefined' && module.exports) module.exports = VideoSurfaceEditor;
