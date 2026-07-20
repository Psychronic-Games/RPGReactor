/**
 * AnimationPickerModal - Two-column animation picker: searchable list on the
 * left, live playback preview on the right. Used by the Skills/Items/Weapons
 * database pages to select an animationId.
 *
 * Markup contract for triggers (see bindTriggers):
 *   <button class="db-anim-picker" data-target-field="animationId"
 *           data-target-id="3" data-allow-normal-attack="1">label</button>
 *   <input type="hidden" data-field="animationId" data-skill-id="3" value="-1">
 * The hidden input (same data-target-field, adjacent in the same container)
 * receives the picked value and a synthesized 'change' event so the page's
 * existing field listeners persist it.
 */

class AnimationPickerModal {
    static label(animations, id) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        if (id === -1) return tt('Normal Attack');
        if (!id) return tt('None');
        const anim = animations.find(a => a && a.id === id);
        return anim ? `${String(anim.id).padStart(4, '0')}: ${anim.name || ''}` : `#${id}`;
    }

    /**
     * Wire every .db-anim-picker button inside container to open the modal.
     */
    static bindTriggers(container, databaseManager, projectManager) {
        container.querySelectorAll('.db-anim-picker').forEach(btn => {
            if (btn.__animPickerBound) return;
            btn.__animPickerBound = true;
            btn.addEventListener('click', () => {
                const field = btn.dataset.targetField;
                const hidden = btn.parentElement.querySelector(`input[type="hidden"][data-field="${field}"]`);
                AnimationPickerModal.open({
                    databaseManager,
                    projectManager,
                    currentId: parseInt(hidden ? hidden.value : btn.dataset.current) || 0,
                    allowNormalAttack: btn.dataset.allowNormalAttack === '1',
                    onPick: (id) => {
                        const animations = databaseManager.getAnimations ? databaseManager.getAnimations() : [];
                        btn.textContent = AnimationPickerModal.label(animations, id);
                        if (hidden) {
                            hidden.value = id;
                            hidden.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                });
            });
        });
    }

    static open({ databaseManager, projectManager, currentId, allowNormalAttack, onPick }) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const animations = (databaseManager.getAnimations ? databaseManager.getAnimations() : []).filter(a => a);
        const project = projectManager && projectManager.getCurrentProject ? projectManager.getCurrentProject() : null;

        let selectedId = currentId || 0;
        let playTimer = null;
        let sheets = { 1: null, 2: null };
        let playAnim = null;
        let playFrame = 0;

        // --- Overlay + modal shell ---
        const overlay = document.createElement('div');
        overlay.setAttribute('data-rr-i18n-skip', '');
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 100001;
            background: rgba(0, 0, 0, 0.6);
            display: flex; align-items: center; justify-content: center;
        `;
        const modal = document.createElement('div');
        modal.style.cssText = `
            width: 720px; max-width: 92vw; height: 520px; max-height: 88vh;
            background: var(--color-bg-surface);
            border: 1px solid var(--color-accent-border-strong);
            border-radius: 6px; box-shadow: var(--shadow-popup, 0 8px 32px rgba(0,0,0,0.6));
            display: flex; flex-direction: column; overflow: hidden;
        `;
        modal.innerHTML = `
            <div style="padding: 10px 14px; background: var(--color-bg-panel); border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 600; color: var(--color-text-strong);">${tt('Select Animation')}</span>
                <button type="button" class="anim-picker-close" style="background: none; border: none; color: var(--color-text-muted); font-size: 16px; cursor: pointer;">&#10005;</button>
            </div>
            <div style="flex: 1; display: grid; grid-template-columns: 300px 1fr; min-height: 0;">
                <div style="display: flex; flex-direction: column; border-right: 1px solid var(--color-border); min-height: 0;">
                    <input type="text" class="anim-picker-search database-field-value" placeholder="${tt('Search...')}"
                           style="margin: 8px; flex: 0 0 auto;">
                    <div class="anim-picker-list" style="flex: 1; overflow-y: auto; min-height: 0;"></div>
                </div>
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 12px; min-height: 0;">
                    <canvas class="anim-picker-canvas" width="384" height="384"
                            style="width: 100%; max-width: 384px; aspect-ratio: 1; background: #000; border: 1px solid var(--color-border); border-radius: 4px; image-rendering: auto;"></canvas>
                    <canvas class="anim-picker-fx" width="384" height="384"
                            style="display: none; width: 100%; max-width: 384px; aspect-ratio: 1; background: #000; border: 1px solid var(--color-border); border-radius: 4px;"></canvas>
                    <div class="anim-picker-caption" style="font-size: 12px; color: var(--color-text-muted); min-height: 16px;"></div>
                </div>
            </div>
            <div style="padding: 10px 14px; border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: 8px;">
                <button type="button" class="anim-picker-cancel tool-button" style="padding: 6px 18px;">${tt('Cancel')}</button>
                <button type="button" class="anim-picker-ok tool-button" style="padding: 6px 18px; border-color: var(--color-accent-bright);">${tt('OK')}</button>
            </div>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const listEl = modal.querySelector('.anim-picker-list');
        const searchEl = modal.querySelector('.anim-picker-search');
        const canvas = modal.querySelector('.anim-picker-canvas');
        const fxCanvas = modal.querySelector('.anim-picker-fx');
        const caption = modal.querySelector('.anim-picker-caption');
        const ctx = canvas.getContext('2d');

        // Effekseer playback state: one WebGL context reused across selections,
        // loaded effects cached per effectName.
        const fx = { gl: null, ctx: null, ready: false, handle: null, raf: null, effects: new Map() };
        const ensureEffekseer = () => {
            if (fx.ready) return true;
            if (typeof effekseer === 'undefined' || typeof RR_loadEffekseerEffectFromFile === 'undefined') return false;
            fx.gl = fxCanvas.getContext('webgl', { premultipliedAlpha: false, alpha: true });
            if (!fx.gl) return false;
            fx.ctx = effekseer.createContext();
            if (!fx.ctx) return false;
            fx.ctx.init(fx.gl);
            fx.ctx.setRestorationOfStatesFlag(false);
            fx.ready = true;
            return true;
        };

        // --- Playback ---
        const stopPlayback = () => {
            if (playTimer) { cancelAnimationFrame(playTimer); playTimer = null; }
            if (fx.raf) { cancelAnimationFrame(fx.raf); fx.raf = null; }
            if (fx.handle) { try { fx.handle.stop(); } catch (e) {} fx.handle = null; }
            if (fx.gl) {
                fx.gl.clearColor(0, 0, 0, 0);
                fx.gl.clear(fx.gl.COLOR_BUFFER_BIT | fx.gl.DEPTH_BUFFER_BIT);
            }
            playAnim = null;
            fxCanvas.style.display = 'none';
            canvas.style.display = '';
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        };

        const renderPlayFrame = () => {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            if (!playAnim || !playAnim.frames || playAnim.frames.length === 0) return;
            const frameData = playAnim.frames[playFrame % playAnim.frames.length];
            if (!frameData) return;
            const cellSize = 192;
            const cols = 5;
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const view = 0.85; // fit typical animations into the preview box
            for (const cell of frameData) {
                const [pattern, x, y, scale, rotation, mirror, opacity, blendMode] = cell;
                const sheet = pattern < 100 ? sheets[1] : sheets[2];
                if (!sheet) continue;
                const cellPattern = pattern % 100;
                const srcX = (cellPattern % cols) * cellSize;
                const srcY = Math.floor(cellPattern / cols) * cellSize;
                ctx.save();
                ctx.translate(centerX + x * view, centerY + y * view);
                ctx.rotate((rotation * Math.PI) / 180);
                ctx.scale((scale / 100) * view, (scale / 100) * view);
                if (mirror) ctx.scale(-1, 1);
                ctx.globalAlpha = opacity / 255;
                ctx.globalCompositeOperation = blendMode === 1 ? 'lighter' : 'source-over';
                const hue = pattern < 100 ? (playAnim.animation1Hue || 0) : (playAnim.animation2Hue || 0);
                ctx.filter = hue ? `hue-rotate(${hue}deg)` : 'none';
                ctx.drawImage(sheet, srcX, srcY, cellSize, cellSize,
                    -cellSize / 2, -cellSize / 2, cellSize, cellSize);
                ctx.filter = 'none';
                ctx.restore();
            }
        };

        const startSprite = (anim) => {
            playAnim = anim;
            playFrame = 0;
            caption.textContent = `${anim.frames.length} ${tt('frames')}`;
            sheets = { 1: null, 2: null };
            const path = require('path');
            const load = (name, slot) => {
                if (!name) return Promise.resolve();
                return new Promise(resolve => {
                    const img = new Image();
                    img.onload = () => { sheets[slot] = img; resolve(); };
                    img.onerror = () => resolve();
                    img.src = RRAssetFiles.urlFor(path.join(project.path, 'img', 'animations'), name, ['.png']);
                });
            };
            const token = anim;
            Promise.all([load(anim.animation1Name, 1), load(anim.animation2Name, 2)]).then(() => {
                if (playAnim !== token) return; // selection changed while loading
                // 15fps MV cadence paced by rAF: a setInterval at 66.7ms
                // drifts and fires late whenever the main thread is busy,
                // which read as juddery playback. Elapsed time advances the
                // frame counter, so a hiccup skips frames instead of slowing
                // the whole animation down.
                const STEP = 1000 / 15;
                let last = performance.now();
                let acc = 0;
                const loop = () => {
                    if (playAnim !== token) return;
                    const now = performance.now();
                    acc += now - last;
                    last = now;
                    if (acc >= STEP) {
                        const steps = Math.floor(acc / STEP);
                        acc -= steps * STEP;
                        renderPlayFrame();
                        playFrame += steps;
                    }
                    playTimer = requestAnimationFrame(loop);
                };
                renderPlayFrame();
                playFrame = 1;
                playTimer = requestAnimationFrame(loop);
            });
        };

        const startEffekseer = (anim) => {
            if (!ensureEffekseer()) {
                caption.textContent = tt('No preview available');
                return;
            }
            canvas.style.display = 'none';
            fxCanvas.style.display = '';
            playAnim = anim;
            caption.textContent = tt('Loading...');
            const token = anim;

            const begin = (effect) => {
                if (playAnim !== token) return;
                caption.textContent = `Effekseer: ${anim.effectName}`;
                let aliveTicks = 0;
                let deadTicks = 0;
                let failedStarts = 0;
                const startHandle = () => {
                    fx.handle = fx.ctx.play(effect);
                    aliveTicks = 0;
                    deadTicks = 0;
                    if (!fx.handle) return;
                    const scale = (anim.scale || 100) / 100;
                    const speed = (anim.speed || 100) / 100;
                    const rot = anim.rotation || { x: 0, y: 0, z: 0 };
                    const rx = ((180 - rot.x) * Math.PI) / 180;
                    const ry = (rot.y * Math.PI) / 180;
                    const rz = (rot.z * Math.PI) / 180;
                    fx.handle.setLocation((anim.offsetX || 0) * 0.1, (anim.offsetY || 0) * 0.1, 0);
                    fx.handle.setRotation(rx, ry, rz);
                    fx.handle.setScale(scale, scale, scale);
                    fx.handle.setSpeed(speed);
                };
                startHandle();

                let last = Date.now();
                let acc = 0;
                const step = 1000 / 60;
                const loop = () => {
                    if (playAnim !== token) return;
                    const now = Date.now();
                    acc += now - last;
                    last = now;
                    let n = 0;
                    while (acc >= step && n < 5) {
                        fx.ctx.update();
                        acc -= step;
                        if (fx.handle && fx.handle.exists) aliveTicks++;
                        n++;
                    }
                    if (acc > step * 5) acc = 0;
                    const gl = fx.gl;
                    gl.viewport(0, 0, fxCanvas.width, fxCanvas.height);
                    gl.clearColor(0, 0, 0, 0);
                    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
                    const p = -1.2;
                    const ax = fxCanvas.height / fxCanvas.width; // aspect-neutral x (1 on the square canvas)
                    fx.ctx.setProjectionMatrix([ax, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, p, 0, 0, 0, 1]);
                    fx.ctx.setCameraMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -10, 1]);
                    fx.ctx.beginDraw();
                    if (fx.handle && fx.handle.exists) {
                        fx.ctx.drawHandle(fx.handle);
                    } else if (failedStarts < 5) {
                        // Effect finished — loop it after a short pause. An effect
                        // that never stays alive a few ticks is broken; give up
                        // after a handful of attempts instead of spinning.
                        deadTicks++;
                        if (deadTicks >= 20) {
                            if (aliveTicks < 3) failedStarts++; else failedStarts = 0;
                            startHandle();
                        }
                    }
                    fx.ctx.endDraw();
                    fx.raf = requestAnimationFrame(loop);
                };
                fx.raf = requestAnimationFrame(loop);
            };

            const cached = fx.effects.get(anim.effectName);
            if (cached && cached.isLoaded) { begin(cached); return; }
            const path = require('path');
            const effectFile = RRAssetFiles.find(path.join(project.path, 'effects'), anim.effectName, ['.efkefc']);
            if (!effectFile) {
                caption.textContent = tt('No preview available');
                return;
            }
            const effectPath = effectFile.absolutePath;
            try {
                const effect = RR_loadEffekseerEffectFromFile(fx.ctx, effectPath, 1.0,
                    () => { fx.effects.set(anim.effectName, effect); begin(effect); },
                    () => { if (playAnim === token) caption.textContent = tt('No preview available'); });
            } catch (e) {
                caption.textContent = tt('No preview available');
            }
        };

        const startPlayback = (anim) => {
            stopPlayback();
            if (!anim || !project) {
                caption.textContent = '';
                return;
            }
            if (anim.effectName) {
                startEffekseer(anim);
            } else if (anim.frames && anim.frames.length > 0) {
                startSprite(anim);
            } else {
                caption.textContent = tt('No preview available');
            }
        };

        // --- List ---
        const entries = [];
        if (allowNormalAttack) entries.push({ id: -1, label: tt('Normal Attack'), anim: null });
        entries.push({ id: 0, label: tt('None'), anim: null });
        for (const anim of animations) {
            entries.push({
                id: anim.id,
                label: `${String(anim.id).padStart(4, '0')}: ${anim.name || ''}`,
                anim
            });
        }

        const rows = [];
        const selectRow = (entry, row) => {
            selectedId = entry.id;
            rows.forEach(r => { r.style.background = 'transparent'; });
            row.style.background = 'var(--color-accent-tint-25)';
            startPlayback(entry.anim);
        };
        const confirm = () => { cleanup(); onPick(selectedId); };

        for (const entry of entries) {
            const row = document.createElement('div');
            row.style.cssText = `
                padding: 5px 12px; cursor: pointer; font-size: 13px;
                color: var(--color-text-strong); white-space: nowrap;
                overflow: hidden; text-overflow: ellipsis;
                background: ${entry.id === selectedId ? 'var(--color-accent-tint-25)' : 'transparent'};
            `;
            row.textContent = entry.label;
            row.dataset.search = entry.label.toLowerCase();
            row.addEventListener('click', () => selectRow(entry, row));
            row.addEventListener('dblclick', () => { selectRow(entry, row); confirm(); });
            listEl.appendChild(row);
            rows.push(row);
            if (entry.id === selectedId) startPlayback(entry.anim);
        }

        searchEl.addEventListener('input', () => {
            const term = searchEl.value.toLowerCase();
            rows.forEach(row => {
                row.style.display = !term || row.dataset.search.includes(term) ? '' : 'none';
            });
        });

        // --- Close paths ---
        const cleanup = () => {
            stopPlayback();
            // WebGL contexts survive DOM removal until GC and Chromium caps
            // live contexts (~16), evicting the oldest — release the
            // effekseer context and force-lose the GL context now so
            // reopening the picker can never starve the rest of the editor.
            if (fx.ready) {
                for (const effect of fx.effects.values()) {
                    try { fx.ctx.releaseEffect(effect); } catch (e) {}
                }
                fx.effects.clear();
                try { effekseer.releaseContext(fx.ctx); } catch (e) {}
                fx.ctx = null;
                fx.ready = false;
            }
            if (fx.gl) {
                const lose = fx.gl.getExtension('WEBGL_lose_context');
                if (lose) { try { lose.loseContext(); } catch (e) {} }
                fx.gl = null;
            }
            document.removeEventListener('keydown', onKey, true);
            overlay.remove();
        };
        const onKey = (ev) => {
            if (ev.key === 'Escape') { ev.stopPropagation(); cleanup(); }
            if (ev.key === 'Enter' && ev.target !== searchEl) { ev.stopPropagation(); confirm(); }
        };
        document.addEventListener('keydown', onKey, true);
        modal.querySelector('.anim-picker-close').addEventListener('click', cleanup);
        modal.querySelector('.anim-picker-cancel').addEventListener('click', cleanup);
        modal.querySelector('.anim-picker-ok').addEventListener('click', confirm);
        overlay.addEventListener('mousedown', (ev) => { if (ev.target === overlay) cleanup(); });

        // Scroll the current selection into view
        const active = rows.find(r => r.style.background !== 'transparent');
        if (active && active.scrollIntoView) active.scrollIntoView({ block: 'center' });
        setTimeout(() => searchEl.focus(), 0);
    }
}

if (typeof window !== 'undefined') {
    window.AnimationPickerModal = AnimationPickerModal;
}
