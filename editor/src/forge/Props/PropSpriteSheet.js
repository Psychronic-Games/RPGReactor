/**
 * PropSpriteSheet - Forge › 3D Prop Builder › Export Sprite Sheet: the prop
 * drawn as a character sheet for img/characters, turned to face each
 * direction, its loop (a cloth in the wind, a tree's sway, a container's own
 * clip) spread over the frames.
 *
 *   DIRECTIONS                1, 4 or 8
 *   FRAME_CHOICES             frames per row
 *   plan(directions, frames)  every cell: { col, row, yaw, dir, u } (u: how far through the loop)
 *   fileName(name, d, n)      `!$Name[1D][8F].png`, `!$Name[4F].png`, `!$Name[8D][6F].png`
 *   cellHeight(w, bounds)     the cell's height for a cell w wide: as tall as the prop needs
 *   openPanel(builder)        the export panel over the Prop Builder's view
 *
 * The sheets, one character each (the `$`), drawn where they stand (the `!`:
 * the game does not lift them):
 *   1 direction [1D]          one row, shown whichever way the event faces
 *   4 directions              rows down, left, right, up
 *   8 directions [8D]         the [8D] sheet's eight blocks of n × 4: the
 *                             cardinal rows in blocks 0, 2, 4 and 6, the
 *                             diagonals (down-left, down-right, up-left,
 *                             up-right) in 1, 3, 5 and 7. The game shows block
 *                             2 while a character dashes and lets an event pick
 *                             any block; every pair holds the same frames, so
 *                             the prop looks right whatever it does.
 * The frame-count tag is always written ([1F], [3F], ...): a prop's frames are
 * its loop in order, never MZ's step, stand, step. Frame i shows the loop at
 * i / n of the way through, so the last frame leads back to the first.
 *
 * The picture-making (fit, pixels, PNG) is RRCharacterSpriteSheet's.
 */
(function(root) {
    'use strict';

    const DIRECTIONS = [1, 4, 8];
    const FRAME_CHOICES = [1, 2, 3, 4, 6, 8, 10, 12];
    const CARDINAL = [2, 4, 6, 8], DIAGONAL = [1, 3, 7, 9];
    /** The prop's turn (degrees about up) to face each direction; at 0 it shows the side it was built facing the camera. */
    const YAW = { 2: 0, 4: -90, 6: 90, 8: 180, 1: -45, 3: 45, 7: -135, 9: 135 };
    const sheets = () => root.RRCharacterSpriteSheet;

    const directionsOf = d => (DIRECTIONS.includes(Number(d)) ? Number(d) : 1);
    const framesOf = n => (FRAME_CHOICES.includes(Number(n)) ? Number(n) : 1);

    /** The sheet's size in frames: n × 1, n × 4, or the [8D] sheet's 4n × 8. */
    function grid(directions, frames) {
        const d = directionsOf(directions), n = framesOf(frames);
        return d === 8 ? { columns: 4 * n, rows: 8 } : { columns: n, rows: d === 4 ? 4 : 1 };
    }

    /**
     * Every cell to draw. An [8D] sheet draws blocks 0 and 1 only; `copies`
     * lists where each of their cells is written again (blocks 2-7).
     */
    function plan(directions, frames) {
        const d = directionsOf(directions), n = framesOf(frames), cells = [];
        const row = (dir, r, col0) => { for (let i = 0; i < n; i++) cells.push({ col: col0 + i, row: r, yaw: YAW[dir], dir, u: i / n }); };
        if (d === 1) row(2, 0, 0);
        else if (d === 4) CARDINAL.forEach((dir, r) => row(dir, r, 0));
        else {
            CARDINAL.forEach((dir, r) => row(dir, r, 0));
            DIAGONAL.forEach((dir, r) => row(dir, r, n));
            for (const c of cells) {
                const diagonal = c.col >= n ? 1 : 0;
                c.copies = [1, 2, 3].map(b => ({ col: (b * 2 + diagonal) % 4 * n + c.col % n, row: c.row + (b >= 2 ? 4 : 0) }));
            }
        }
        return cells;
    }

    /** The file name: `!$Name[1D][8F].png`, `!$Name[4F].png`, `!$Name[8D][6F].png`. */
    function fileName(name, directions, frames) {
        const d = directionsOf(directions), n = framesOf(frames), S = sheets();
        const tag = S && S.frameTag ? (n === 3 ? '[3F]' : S.frameTag(n)) : `[${n}F]`;
        return '!$' + (S ? S.safeName(name) : String(name || '')) + (d === 1 ? '[1D]' : d === 8 ? '[8D]' : '') + tag + '.png';
    }

    /**
     * The cell's height for a cell `w` wide: the room the prop needs at the
     * width that fits it (its widest reach either side of its middle and its
     * height over every frame), rounded up to a multiple of 4, never less
     * than w (a lamp is no shorter than a crate's cell) nor more than 4w.
     */
    function cellHeight(w, bounds) {
        let half = 0, low = 0, high = 0;
        for (const b of bounds) { half = Math.max(half, -b.minX, b.maxX); low = Math.min(low, b.minY); high = Math.max(high, b.maxY); }
        if (!(half > 0) || !(high > low)) return w;
        const room = w * 0.92, tall = (high - low) * (room / (2 * half)) / 0.95;
        return Math.max(w, Math.min(4 * w, Math.ceil(tall / 4) * 4));
    }

    /** The largest frame either way; a prop bigger at character scale is drawn smaller, and the export says so. */
    const MAX_FRAME = 1024;

    /**
     * The cell at a set scale (pixels a metre: the character sheets', so a
     * prop stands beside an exported character at its true size): wide and
     * tall enough for every frame, in steps of 4, the base on the bottom line
     * (`anchor`, as RRCharacterSpriteSheet.fit puts it). With `width` (pixels)
     * the cell is that wide and the scale whatever fills it, the height
     * following the prop. Over MAX_FRAME, the scale comes down to fit and
     * `shrunk` tells by how much (1: not at all).
     */
    function matchSize(bounds, scale, outline, width) {
        const S = sheets();
        let half = 0, low = 0, high = 0;
        for (const b of bounds) { half = Math.max(half, -b.minX, b.maxX); low = Math.min(low, b.minY); high = Math.max(high, b.maxY); }
        const room = w => { const m = S.cellMetrics(w, w, outline); return m.w - 2 * m.side; };
        const fitAt = (s, fixed) => {
            let w = fixed || 16, h = 16;
            if (!fixed) while (w < 65536 && room(w) < 2 * half * s) w += 4;
            while (h < 65536) { const m = S.cellMetrics(w, h, outline); if (m.baseline - m.top >= (high - low) * s) break; h += 4; }
            return { w, h };
        };
        const fixed = width > 0 ? Math.max(16, Math.round(width)) : 0;
        const wanted = fixed && half > 0 ? room(fixed) / (2 * half) : scale;
        let s = wanted, size = fitAt(s, fixed);
        if (size.w > MAX_FRAME || size.h > MAX_FRAME) {
            const f = Math.min(MAX_FRAME / size.w, MAX_FRAME / size.h) * 0.98;
            s *= f; size = fitAt(s, fixed ? Math.max(16, Math.floor(fixed * f)) : 0);
        }
        const m = S.cellMetrics(size.w, size.h, outline);
        return { w: size.w, h: size.h, scale: s, shrunk: s / wanted, anchor: { x: size.w / 2, y: m.baseline + low * s } };
    }

    /**
     * The width choice in tiles: `atScale`, the prop's width at the character
     * sheets' scale (to a quarter tile, at least a quarter), and `most`, the
     * widest whose frames stay within MAX_FRAME either way.
     */
    function widthTiles(bounds, outline, tile) {
        const S = sheets(), sized = matchSize(bounds, S.pixelsPerMeter(tile), outline);
        const unshrunk = { w: sized.w / sized.shrunk, h: sized.h / sized.shrunk };
        const widest = Math.min(MAX_FRAME, MAX_FRAME * unshrunk.w / Math.max(1, unshrunk.h));
        return { atScale: Math.max(0.25, Math.round(unshrunk.w / tile * 4) / 4), most: Math.max(0.25, Math.floor(widest / tile * 4) / 4) };
    }

    /**
     * The frames' extent on the camera's plane from the prop at rest (its
     * loop not played), turned about its footprint to each direction of the
     * sheet: what the panel shows the frame size from before an export.
     */
    function restBounds(parts, directions, elevation) {
        let low = Infinity, high = -Infinity;
        for (const p of parts) for (let i = 1; i < p.positions.length; i += 3) { low = Math.min(low, p.positions[i]); high = Math.max(high, p.positions[i]); }
        const mid = footprint(parts, low, high), e = elevation * Math.PI / 180, ce = Math.cos(e), se = Math.sin(e);
        const yaws = [...new Set(plan(directions, 1).map(c => c.yaw))];
        return yaws.map(yawDeg => {
            const yaw = yawDeg * Math.PI / 180, cos = Math.cos(yaw), sin = Math.sin(yaw), b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
            for (const p of parts) {
                const P = p.positions, stride = 3 * Math.max(1, Math.floor(P.length / 3 / 4000));
                for (let i = 0; i < P.length; i += stride) {
                    const x = P[i] - mid.x, z = P[i + 2] - mid.z, rx = x * cos + z * sin, rz = -x * sin + z * cos, ry = P[i + 1] * ce - rz * se;
                    if (rx < b.minX) b.minX = rx; if (rx > b.maxX) b.maxX = rx; if (ry < b.minY) b.minY = ry; if (ry > b.maxY) b.maxY = ry;
                }
            }
            return b;
        });
    }

    /** Whether the prop has a loop to spread over the frames: a cloth or rope, or a clip of its own (a tree's sway). */
    function hasLoop(builder) {
        const result = builder._result, M = root.RRPropModel;
        if (!result) return false;
        return !!((M && M.moves(result)) || (builder._view && builder._view.clipAction));
    }

    // ── rendering (in the builder, on its own view) ───────────────────────

    /**
     * The middle of what a prop stands on: the points within the lowest
     * tenth of its height (a trunk, a chest's base, a pole's foot), x and z.
     * The prop turns about it, so an open lid or a crown leaning out does not
     * walk the prop about its tile from one direction to the next.
     */
    function footprint(parts, low, high) {
        const top = low + Math.max(1e-4, (high - low) * 0.1);
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const p of parts) for (let i = 0; i < p.positions.length; i += 3) {
            if (p.positions[i + 1] > top) continue;
            const x = p.positions[i], z = p.positions[i + 2];
            if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
        return Number.isFinite(minX) ? { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 } : { x: 0, z: 0 };
    }

    /** The prop's loop as one action to sample: the baked wind loop, else its own clip; null when it has none. */
    async function loopAction(builder) {
        const view = builder._view, result = builder._result, M = root.RRPropModel;
        if (M && M.moves(result)) {
            if (!(builder.motion === 'loop' && view.action)) builder._playLoop(await builder._bake(result));
            return view.action;
        }
        return view.clipAction || null;
    }

    async function render(builder, settings, progress) {
        const THREE = root.THREE, S = sheets(), view = builder._view, result = builder._result;
        if (!THREE || !S || !view || !result || !view.meshes.length) throw new Error('The prop is not built yet.');
        const d = directionsOf(settings.directions), n = framesOf(settings.frames);
        const tile = defaultWidth();
        let w = tile;
        const elevation = Math.max(0, Math.min(75, Number.isFinite(settings.elevation) ? settings.elevation : 30));
        const cells = plan(d, n), size = grid(d, n);
        const renderer = view.renderer, canvas = renderer.domElement;
        const saved = { ratio: renderer.getPixelRatio(), size: renderer.getSize(new THREE.Vector2()), floor: view.floor.visible, blob: view.blob.visible, wall: view.wall.visible, wall2: view.wall2 ? view.wall2.visible : false, visibility: canvas.style.visibility, clear: renderer.getClearAlpha(), exposure: renderer.toneMappingExposure, motion: builder.motion };
        cancelAnimationFrame(view.loop); view.loop = 0;
        const action = await loopAction(builder);
        const duration = action ? action.getClip().duration : 0;
        canvas.style.visibility = 'hidden';
        renderer.toneMappingExposure = saved.exposure * 1.2;
        // Seen small on a bright map: a fill from the camera's side and an even ambient over the studio's key, so
        // a crown's underside and a cloth's far side keep their colour, and a rim from behind; no cast shadows,
        // which leave them black at this size. The key still shades one side.
        const e0 = elevation * Math.PI / 180;
        const fill = new THREE.DirectionalLight(0xfff8f0, 1.5), rim = new THREE.DirectionalLight(0xe8f0ff, 0.8), ambient = new THREE.AmbientLight(0xffffff, 0.7);
        fill.position.set(0.8, Math.sin(e0) * 3 + 0.6, Math.cos(e0) * 3); rim.position.set(0.6, 2.6, -3);
        view.scene.add(fill, rim, ambient);
        saved.shadows = view.key.castShadow;
        view.key.castShadow = false;
        view.floor.visible = false; view.blob.visible = false; view.wall.visible = false;
        if (view.wall2) view.wall2.visible = false;
        // The prop in the frame it is built and saved in, turned about the middle of its footprint.
        view.group.rotation.set(0, 0, 0); view.group.position.set(0, 0, 0); view.group.updateMatrixWorld(true);
        const box = builder._shownBox(result), mid = footprint(result.parts, box.min.y, box.max.y);
        const posed = c => {
            const yaw = c.yaw * Math.PI / 180, cos = Math.cos(yaw), sin = Math.sin(yaw);
            view.group.rotation.set(0, yaw, 0);
            view.group.position.set(-(mid.x * cos + mid.z * sin), 0, -(-mid.x * sin + mid.z * cos));
            if (action && duration > 0) { action.paused = false; action.time = c.u * duration; view.mixer.update(0); }
            view.group.updateMatrixWorld(true);
        };
        const total = cells.length * 2;
        let done = 0, budget = performance.now();
        const breathe = async () => {
            done++;
            if (performance.now() - budget > 14) { if (progress) progress(done, total); await new Promise(r => setTimeout(r, 0)); budget = performance.now(); }
        };
        let sheet, h, shrunk = 1;
        try {
            const bounds = [];
            for (const c of cells) { posed(c); const b = S.measure(view, elevation); b.kind = 'move'; bounds.push(b); await breathe(); }
            // The width chosen (pixels), else the character sheets' scale: the prop as big beside a character as in the world.
            const sized = matchSize(bounds, S.pixelsPerMeter(tile), settings.outline, settings.width);
            w = sized.w; h = sized.h; shrunk = sized.shrunk;
            const fitted = { scale: sized.scale, anchors: bounds.map(() => sized.anchor) };
            const k = Math.max(2, Math.min(6, Math.floor(512 / Math.max(w, h))));
            const width = size.columns * w, height = size.rows * h;
            sheet = new Uint8ClampedArray(width * height * 4);
            const e = elevation * Math.PI / 180;
            const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 400);
            const far = Math.max(20, box.getSize(new THREE.Vector3()).length() * 4);
            camera.up.set(0, Math.cos(e), -Math.sin(e));
            camera.position.set(0, Math.sin(e) * far, Math.cos(e) * far);
            camera.lookAt(0, 0, 0);
            camera.far = far * 2;
            renderer.setPixelRatio(1);
            renderer.setSize(w * k, h * k, false);
            renderer.setClearColor(0x000000, 0);
            const gl = renderer.getContext(), pixels = new Uint8Array(w * k * h * k * 4);
            const pixelArt = settings.look === 'pixel';
            for (let i = 0; i < cells.length; i++) {
                const c = cells[i];
                posed(c);
                const f = S.frustum(fitted.anchors[i], fitted.scale, w, h);
                camera.left = f.left; camera.right = f.right; camera.top = f.top; camera.bottom = f.bottom;
                camera.updateProjectionMatrix();
                renderer.setRenderTarget(null);
                renderer.render(view.scene, camera);
                gl.readPixels(0, 0, w * k, h * k, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                let px = S.grade(S.downsample(pixels, w * k, h * k, k, true), true);
                if (pixelArt) S.threshold(px);
                // A lighter ring than a character's: foliage has edges all over, and a dark one makes it a blob.
                if (settings.outline) px = S.outline(px, w, h, 0.5);
                S.blit(sheet, width, px, w, h, c.col, c.row);
                for (const o of c.copies || []) S.blit(sheet, width, px, w, h, o.col, o.row);
                await breathe();
            }
            if (pixelArt) S.quantize(sheet, 32);
            sheet = { data: sheet, width, height };
        } finally {
            view.scene.remove(fill, rim, ambient);
            fill.dispose(); rim.dispose(); ambient.dispose();
            view.key.castShadow = saved.shadows;
            renderer.toneMappingExposure = saved.exposure;
            renderer.setPixelRatio(saved.ratio);
            renderer.setSize(saved.size.x, saved.size.y, false);
            renderer.setClearColor(0x000000, saved.clear);
            view.floor.visible = saved.floor; view.blob.visible = saved.blob; view.wall.visible = saved.wall;
            if (view.wall2) view.wall2.visible = saved.wall2;
            // The wind loop was only borrowed: a live cloth goes back to running.
            if (saved.motion !== 'loop' && view.action && root.RRPropModel && root.RRPropModel.moves(result)) { view.action.stop(); view.action = null; }
            builder._pose(result);
            canvas.style.visibility = saved.visibility;
            builder._tick();
            builder._draw();
        }
        return { data: sheet.data, width: sheet.width, height: sheet.height, frameWidth: w, frameHeight: h, shrunk };
    }

    // ── the panel ─────────────────────────────────────────────────────────

    /**
     * The cell's width until one is chosen: the project's tile (MZ's 48), the
     * width the game gives a character. The height follows the prop (cellHeight).
     */
    function defaultWidth() {
        const manager = root.reactor && root.reactor.databaseManager, system = manager && manager.data && manager.data.system;
        const tile = Number(system && system.tileSize);
        return tile >= 16 && tile <= 512 ? Math.round(tile) : 48;
    }

    const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

    function openPanel(builder) {
        const host = builder.root && builder.root.querySelector('.rr-c3d-view');
        if (!host) return null;
        const old = host.querySelector('.rr-c3d-export');
        if (old) { old.remove(); return null; }
        const t = (text, params) => builder._t(text, params), S = sheets();
        const looping = hasLoop(builder);
        const state = builder._sheetSettings || (builder._sheetSettings = { directions: 1, elevation: 30, outline: true, look: 'smooth', chose: {}, widths: {} });
        // Until chosen here: 8 frames for a prop with a loop, else 1.
        if (!state.chose.frames) state.frames = looping ? 8 : 1;
        if (!state.widths) state.widths = {};
        // The width in tiles, kept per prop type while the Forge is open (never saved): until chosen, the prop's width beside characters.
        const Catalog = root.RRPropCatalog, typeId = (Catalog && Catalog.typeOf && (Catalog.typeOf(builder.recipe) || {}).id) || (builder.recipe && builder.recipe.kind) || 'prop';
        const tile = defaultWidth();
        const choice = () => {
            const at = builder._result ? widthTiles(restBounds(builder._result.parts, state.directions, state.elevation), state.outline, tile) : { atScale: 1, most: 1024 / tile };
            const chosen = state.widths[typeId];
            return Object.assign(at, { tiles: chosen ? Math.min(chosen, at.most) : Math.min(at.atScale, at.most) });
        };
        const panel = document.createElement('div');
        panel.className = 'rr-c3d-export';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', t('Export Sprite Sheet'));
        host.appendChild(panel);
        // The frame the width makes, its height following the prop: shown from the prop at rest (its loop adds a little).
        const sizeText = () => {
            if (!builder._result || !S) return '';
            const sized = matchSize(restBounds(builder._result.parts, state.directions, state.elevation), S.pixelsPerMeter(tile), state.outline, Math.round(choice().tiles * tile));
            const g = grid(state.directions, state.frames);
            return `≈ ${sized.w} × ${sized.h} px · ${g.columns} × ${g.rows}`;
        };
        const refresh = () => { const size = panel.querySelector('.rr-c3d-export-size'); if (size) size.textContent = sizeText(); };
        const dirLabel = d => (d === 1 ? t('1 direction') : d === 4 ? t('4 directions') : t('8 directions [8D]'));
        const draw = () => {
            const name = (S && S.safeName(builder.name)) || t('Prop'), file = fileName(name, state.directions, state.frames), c = choice();
            panel.innerHTML = `
                <div class="rr-c3d-export-head"><span>${esc(t('Export Sprite Sheet'))}</span><button class="rr-c3d-clear" data-x="close" title="${esc(t('Close'))}">✕</button></div>
                <label class="rr-c3d-row rr-c3d-choice"><span class="rr-c3d-label">${esc(t('Directions'))}</span><select class="rr-select" data-x="directions">${DIRECTIONS.map(d => `<option value="${d}"${d === directionsOf(state.directions) ? ' selected' : ''}>${esc(dirLabel(d))}</option>`).join('')}</select></label>
                <label class="rr-c3d-row rr-c3d-choice"><span class="rr-c3d-label">${esc(t('Frames'))}</span><select class="rr-select" data-x="frames">${FRAME_CHOICES.map(n => `<option value="${n}"${n === framesOf(state.frames) ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
                ${looping ? '' : `<div class="rr-c3d-row"><span class="rr-c3d-label"></span><span class="rr-c3d-export-hint" style="grid-column: 2 / 4; font-size: 11px; color: var(--color-text-muted);">${esc(t('This prop has no loop: every frame is the same. One frame is enough.'))}</span></div>`}
                <div class="rr-c3d-row"><span class="rr-c3d-label">${esc(t('Width (tiles)'))}</span><input type="number" class="rr-input" data-x="tiles" min="0.25" max="${c.most}" step="0.25" value="${c.tiles}"></div>
                <div class="rr-c3d-row"><span class="rr-c3d-label"></span><button class="rr-btn-chip" data-x="charscale" style="grid-column: 2 / 4; justify-self: start;" title="${esc(t('The width the prop has beside exported characters'))}"${state.widths[typeId] ? '' : ' disabled'}>${esc(t('Character scale'))}</button></div>
                <div class="rr-c3d-row"><span class="rr-c3d-label">${esc(t('Frame size'))}</span><span class="rr-c3d-export-size" style="grid-column: 2 / 4;">${esc(sizeText())}</span></div>
                <label class="rr-c3d-row"><span class="rr-c3d-label">${esc(t('Camera angle'))}</span><input type="range" data-x="elevation" min="0" max="60" step="1" value="${state.elevation}"><span class="rr-c3d-value">${state.elevation}°</span></label>
                <label class="rr-c3d-row rr-c3d-choice"><span class="rr-c3d-label">${esc(t('Look'))}</span><select class="rr-select" data-x="look">${(S ? S.LOOKS : []).map(o => `<option value="${o.id}"${o.id === state.look ? ' selected' : ''}>${esc(t(o.label))}</option>`).join('')}</select></label>
                <label class="rr-c3d-row rr-c3d-check"><span class="rr-c3d-label">${esc(t('Outline'))}</span><input type="checkbox" data-x="outline"${state.outline ? ' checked' : ''}></label>
                <div class="rr-c3d-row"><span class="rr-c3d-label">${esc(t('File'))}</span><span class="rr-c3d-export-file" title="img/characters/${esc(file)}">img/characters/${esc(file)}</span></div>
                <div class="rr-c3d-export-progress" hidden><div></div></div>
                <img class="rr-c3d-export-preview" alt="" hidden style="width: auto; max-width: 100%; max-height: 260px; margin-left: auto; margin-right: auto;">
                <div class="rr-c3d-export-status" aria-live="polite"></div>
                <div class="rr-c3d-export-foot"><button class="rr-btn-chip" data-x="close">${esc(t('Close'))}</button><button class="rr-btn-chip rr-c3d-export-go" data-x="export">${esc(t('Export'))}</button></div>`;
            const fill = panel.querySelector('input[type="range"]');
            if (fill) fill.style.setProperty('--rr-fill', (state.elevation / 60 * 100) + '%');
        };
        panel.addEventListener('input', e => {
            const x = e.target.dataset.x;
            if (x === 'elevation') { state.elevation = Number(e.target.value); refresh(); e.target.style.setProperty('--rr-fill', (state.elevation / 60 * 100) + '%'); e.target.parentElement.querySelector('.rr-c3d-value').textContent = state.elevation + '°'; }
            if (x === 'tiles') {
                const v = Number(e.target.value), most = choice().most;
                if (v >= 0.25) { state.widths[typeId] = Math.min(v, most); refresh(); const reset = panel.querySelector('[data-x="charscale"]'); if (reset) reset.disabled = false; }
            }
        });
        panel.addEventListener('change', e => {
            const x = e.target.dataset.x;
            if (x === 'directions') { state.directions = Number(e.target.value); draw(); }
            else if (x === 'frames') { state.frames = Number(e.target.value); state.chose.frames = true; draw(); }
            else if (x === 'tiles') draw();
            else if (x === 'outline') { state.outline = e.target.checked; refresh(); }
            else if (x === 'look') state.look = e.target.value;
        });
        panel.addEventListener('click', e => {
            const b = e.target.closest('[data-x]');
            if (!b) return;
            if (b.dataset.x === 'close' && !panel.dataset.busy) panel.remove();
            else if (b.dataset.x === 'charscale') { delete state.widths[typeId]; draw(); }
            else if (b.dataset.x === 'export' && !panel.dataset.busy) exportNow(builder, panel, Object.assign({}, state, { width: Math.round(choice().tiles * tile) }));
        });
        draw();
        return panel;
    }

    async function exportNow(builder, panel, state) {
        const t = (text, params) => builder._t(text, params), S = sheets();
        const project = builder._project && builder._project();
        const status = panel.querySelector('.rr-c3d-export-status');
        if (!project || !S) return;
        let name = S.safeName(builder.name);
        if (!name) {
            name = S.safeName(await root.RRDialog.prompt(t('Name this prop:'), { title: t('Export Sprite Sheet'), value: t('Prop') }));
            if (!name) return;
            builder.name = name;
            const input = builder.root.querySelector('.rr-c3d-name-input');
            if (input) input.value = name;
        }
        const fs = require('fs'), path = require('path');
        const file = path.join(project.path, 'img', 'characters', fileName(name, state.directions, state.frames));
        if (fs.existsSync(file) && !await root.RRDialog.confirm(t('Replace {file}?', { file: 'img/characters/' + path.basename(file) }), { title: t('Export Sprite Sheet'), ok: t('Replace'), danger: true })) return;
        const bar = panel.querySelector('.rr-c3d-export-progress'), go = panel.querySelector('.rr-c3d-export-go');
        panel.dataset.busy = '1';
        bar.hidden = false; go.disabled = true;
        status.textContent = t('Rendering…');
        status.dataset.kind = '';
        const started = performance.now();
        try {
            const sheet = await render(builder, state, (done, total) => { bar.firstElementChild.style.width = Math.round(done / total * 100) + '%'; });
            const png = await S.toPng(sheet);
            const atomic = root.RRWriteFileAtomicSync || ((io, target, data) => io.writeFileSync(target, data));
            fs.mkdirSync(path.dirname(file), { recursive: true });
            atomic(fs, file, png);
            const seconds = ((performance.now() - started) / 1000).toFixed(1);
            status.textContent = t('Saved img/{folder}/{file} ({s} s).', { folder: 'characters', file: path.basename(file), s: seconds })
                + ' ' + t('Frames are {w} × {h}.', { w: sheet.frameWidth, h: sheet.frameHeight })
                + (sheet.shrunk < 0.999 ? ' ' + t('Too big at character scale: drawn at {n}% to keep frames within {max} px.', { n: Math.round(sheet.shrunk * 100), max: MAX_FRAME }) : '')
                + (S.turnOnMultiFrames() ? ' ' + t('Multi-frame sheets turned on in Reactor Features.') : '');
            status.dataset.kind = 'ok';
            const img = panel.querySelector('.rr-c3d-export-preview');
            img.src = URL.createObjectURL(new Blob([png], { type: 'image/png' }));
            img.hidden = false;
            console.log(`[RRPropSpriteSheet] ${path.basename(file)} ${sheet.width}x${sheet.height} in ${seconds} s`);
        } catch (error) {
            console.error('[RRPropSpriteSheet] export', error);
            status.textContent = t('The sprite sheet could not be made.');
            status.dataset.kind = 'error';
        } finally {
            delete panel.dataset.busy;
            bar.hidden = true; go.disabled = false;
        }
    }

    const api = { DIRECTIONS, FRAME_CHOICES, YAW, MAX_FRAME, grid, plan, fileName, cellHeight, matchSize, widthTiles, restBounds, footprint, defaultWidth, hasLoop, render, openPanel };
    root.RRPropSpriteSheet = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
