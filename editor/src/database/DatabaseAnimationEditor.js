/**
 * DatabaseAnimationEditor - Animation editor for RPG Reactor
 * Handles sprite-based and Effekseer animations
 */

/**
 * Load an .efkefc effect through Node fs instead of a URL fetch.
 *
 * The editor page lives on the chrome-extension:// scheme, whose URLs
 * cannot reach files outside the app package — and since the source
 * layout reorganization, project folders live outside editor/. So the
 * effect binary is passed to loadEffect as an ArrayBuffer, and its
 * resources (Texture/, Model/, relative to the effect file) are served
 * as data URLs through the redirect hook. The '#.png' fragment keeps
 * the runtime's extension sniffing on the Image() loading branch for
 * textures (see EffekseerGenerator.js for the full explanation).
 *
 * NOTE: onLoad can fire synchronously inside loadEffect() when the WASM
 * core already caches every referenced resource path — callers that use
 * the returned effect inside onLoad must handle that timing.
 *
 * @returns the effekseer effect handle from context.loadEffect
 * @throws if the effect file itself cannot be read
 */
function RR_loadEffekseerEffectFromFile(context, effectPath, scale, onLoad, onError) {
    const fs = require('fs');
    const path = require('path');
    const baseDir = path.dirname(effectPath);
    const bytes = fs.readFileSync(effectPath);
    // Copy into a page-realm ArrayBuffer: NW.js runs Node and the DOM in
    // separate JS contexts, so the Buffer's underlying ArrayBuffer fails
    // loadEffect's `data instanceof ArrayBuffer` check — the runtime then
    // returns a dead effect with no onload/onerror ever firing.
    const arrayBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(arrayBuffer).set(bytes);
    const redirect = (resPath) => {
        try {
            const rel = String(resPath).replace(/\\/g, '/');
            const data = fs.readFileSync(path.join(baseDir, rel));
            if (/\.(png|jpe?g|webp)$/i.test(rel)) {
                const mime = /\.png$/i.test(rel) ? 'image/png'
                    : /\.webp$/i.test(rel) ? 'image/webp' : 'image/jpeg';
                return `data:${mime};base64,${data.toString('base64')}#.png`;
            }
            return `data:application/octet-stream;base64,${data.toString('base64')}`;
        } catch (e) {
            console.error('Effekseer resource not found:', resPath, e.message);
            return resPath;
        }
    };
    // Stall watchdog: a resource that never decodes leaves both callbacks
    // unfired (same hazard the Forge guards against) — surface it instead
    // of silently never enabling playback.
    const watchdog = setTimeout(() => {
        console.warn('Effekseer effect load stalled (no onload/onerror after 10s):', effectPath);
    }, 10000);
    const wrappedLoad = (...args) => { clearTimeout(watchdog); if (onLoad) onLoad(...args); };
    const wrappedError = (...args) => { clearTimeout(watchdog); if (onError) onError(...args); };
    return context.loadEffect(arrayBuffer, scale, wrappedLoad, wrappedError, redirect);
}

class DatabaseAnimationEditor {
    /**
     * Read a numeric input, keeping a deliberate zero.
     *
     * `parseInt(...) || fallback` silently rewrites 0, which matters for any
     * control whose minimum is 0 — the SE volume slider goes to 0 for a silent
     * timing, and that was being saved back as the default instead.
     */
    static readNumericInput(id, fallback, doc = document) {
        const value = parseInt(doc.getElementById(id)?.value, 10);
        return Number.isFinite(value) ? value : fallback;
    }

    static isSpriteAnimation(animation) {
        return !!animation && Array.isArray(animation.frames);
    }

    static normalizeFlashColor(color) {
        return [0, 1, 2, 3].map(index => Number.isFinite(color?.[index]) ? color[index] : 0);
    }

    static convertAnimationFormat(animation, newType) {
        if (newType === 'effekseer') {
            const timings = Array.isArray(animation.timings) ? animation.timings : [];
            animation.soundTimings = timings
                .filter(timing => timing.se?.name)
                .map(timing => ({
                    frame: Number.isFinite(timing.frame) ? timing.frame : 0,
                    se: timing.se
                }));
            animation.flashTimings = timings
                .filter(timing => Number.isFinite(timing.flashScope) && timing.flashScope !== 0)
                .map(timing => {
                    const entry = {
                        frame: Number.isFinite(timing.frame) ? timing.frame : 0,
                        color: DatabaseAnimationEditor.normalizeFlashColor(timing.flashColor),
                        duration: Number.isFinite(timing.flashDuration) ? timing.flashDuration : 0
                    };
                    if (timing.flashScope === 2 || timing.flashScope === 3) entry.scope = timing.flashScope;
                    return entry;
                });

            delete animation.animation1Name;
            delete animation.animation1Hue;
            delete animation.animation2Name;
            delete animation.animation2Hue;
            delete animation.frames;
            delete animation.position;
            delete animation.timings;

            animation.effectName = '';
            animation.displayType = 0;
            animation.scale = 100;
            animation.speed = 100;
            animation.rotation = { x: 0, y: 0, z: 0 };
            animation.offsetX = 0;
            animation.offsetY = 0;
            return;
        }

        const timingsMap = new Map();
        const ensureTiming = frame => {
            const safeFrame = Number.isFinite(frame) ? frame : 0;
            if (!timingsMap.has(safeFrame)) {
                timingsMap.set(safeFrame, {
                    frame: safeFrame,
                    se: { name: '', pan: 0, pitch: 100, volume: 90 },
                    flashScope: 0,
                    flashColor: [0, 0, 0, 0],
                    flashDuration: 0
                });
            }
            return timingsMap.get(safeFrame);
        };

        (animation.soundTimings || []).forEach(timing => {
            ensureTiming(timing.frame).se = timing.se || { name: '', pan: 0, pitch: 100, volume: 90 };
        });
        (animation.flashTimings || []).forEach(timing => {
            const combined = ensureTiming(timing.frame);
            // MZ flash timings always target battlers, so MV's closest scope is 1.
            combined.flashScope = 1;
            combined.flashColor = DatabaseAnimationEditor.normalizeFlashColor(timing.color);
            combined.flashDuration = Number.isFinite(timing.duration) ? timing.duration : 0;
        });

        delete animation.effectName;
        delete animation.displayType;
        delete animation.scale;
        delete animation.speed;
        delete animation.rotation;
        delete animation.offsetX;
        delete animation.offsetY;
        delete animation.soundTimings;
        delete animation.flashTimings;

        animation.animation1Name = '';
        animation.animation1Hue = 0;
        animation.animation2Name = '';
        animation.animation2Hue = 0;
        animation.position = 1;
        animation.frames = [[]];
        animation.timings = Array.from(timingsMap.values()).sort((a, b) => a.frame - b.frame);
    }

    static canAddMVCell(frame) {
        return Array.isArray(frame) && frame.length < 16;
    }

    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;

        // Preview background & target state
        this._previewBB1Name = undefined;  // undefined = not yet initialized
        this._previewBB2Name = null;
        this._previewBB1Img = null;
        this._previewBB2Img = null;
        this._previewBBEnabled = false;
        this._previewTargetEnemyId = null;
        this._previewTargetImg = null;
        this._previewTargetBattlerName = null;
        this._previewTargetEnabled = false;
        this._previewBgCanvas = null;
        this._currentSpriteRenderFrame = null;
        this._resetPreviewFlash();
    }

    /**
     * Detail views register their teardown here (document-level listeners,
     * WebGL/effekseer contexts); the next showAnimationDetail runs the lot.
     * Without this, every animation switch stacked another live set — the
     * leaked keydown handlers even kept applying Ctrl+V/Delete shortcuts to
     * previously viewed animations' data.
     */
    _registerDetailCleanup(fn) {
        if (!this._detailCleanups) this._detailCleanups = [];
        this._detailCleanups.push(fn);
    }

    _runDetailCleanups() {
        const fns = this._detailCleanups || [];
        this._detailCleanups = [];
        for (const fn of fns) {
            try { fn(); } catch (e) {}
        }
    }

    _resetPreviewFlash() {
        this._previewFlash = {
            target: [0, 0, 0, 0],
            targetDuration: 0,
            screen: [0, 0, 0, 0],
            screenDuration: 0,
            hideDuration: 0
        };
    }

    _firePreviewFlashTiming(timing, rate = 1) {
        if (!this._previewFlash) this._resetPreviewFlash();
        const scope = Number(timing?.flashScope ?? 1);
        const duration = Math.max(0, Number(timing?.flashDuration ?? timing?.duration) || 0)
            * Math.max(1, Number(rate) || 1);
        if (scope === 0 || duration <= 0) return false;
        const sourceColor = timing?.flashColor || timing?.color;
        const color = DatabaseAnimationEditor.normalizeFlashColor(sourceColor)
            .map(value => Math.max(0, Math.min(255, value)));
        if (scope === 1) {
            this._previewFlash.target = color;
            this._previewFlash.targetDuration = duration;
        } else if (scope === 2) {
            this._previewFlash.screen = color;
            this._previewFlash.screenDuration = duration;
        } else if (scope === 3) {
            this._previewFlash.hideDuration = duration;
        }
        return scope >= 1 && scope <= 3;
    }

    _stepPreviewFlash() {
        if (!this._previewFlash) this._resetPreviewFlash();
        const decay = (colorKey, durationKey) => {
            const duration = this._previewFlash[durationKey];
            if (duration <= 0) return;
            this._previewFlash[durationKey] = duration - 1;
            this._previewFlash[colorKey][3] *= (duration - 1) / duration;
            if (duration === 1) this._previewFlash[colorKey][3] = 0;
        };
        decay('target', 'targetDuration');
        decay('screen', 'screenDuration');
        if (this._previewFlash.hideDuration > 0) this._previewFlash.hideDuration--;
        return this._previewFlashActive();
    }

    _previewFlashActive() {
        const state = this._previewFlash;
        return !!state && (state.targetDuration > 0 || state.screenDuration > 0 || state.hideDuration > 0);
    }

    _seedSpritePreviewFlash(animation, frameIndex) {
        this._resetPreviewFlash();
        for (const timing of animation?.timings || []) {
            if (timing?.frame === frameIndex) this._firePreviewFlashTiming(timing, 4);
        }
    }

    _refreshStaticAnimationPreview(animation) {
        if (DatabaseAnimationEditor.isSpriteAnimation(animation)
                && this._currentSpriteRenderStaticFrame) {
            this._currentSpriteRenderStaticFrame(window.currentAnimationFrameIndex || 0);
        }
    }

    getAnimationCanvasPoint(canvas, event) {
        const rect = canvas.getBoundingClientRect();
        const displayWidth = rect.width || canvas.width || 1;
        const displayHeight = rect.height || canvas.height || 1;
        return {
            x: (event.clientX - rect.left) * (canvas.width / displayWidth),
            y: (event.clientY - rect.top) * (canvas.height / displayHeight)
        };
    }

    showAnimationDetail(container, animation) {
        this._previewSetupGeneration = (this._previewSetupGeneration || 0) + 1;
        this._effekseerRetryCount = 0;
        // Stop any currently playing animation before switching
        if (this._currentEffekseerStop) {
            this._currentEffekseerStop();
            this._currentEffekseerStop = null;
        }
        this._runDetailCleanups();
        this._resetPreviewFlash();

        const tt = text => window.I18n ? window.I18n.tText(text) : text;

        container.innerHTML = '';

        // Determine animation type
        const isSpriteAnimation = DatabaseAnimationEditor.isSpriteAnimation(animation);
        const isEffekseer = !isSpriteAnimation && animation.effectName !== undefined;

        const html = `
            <style>
                .hue-slider {
                    -webkit-appearance: none;
                    appearance: none;
                    height: 14px;
                    background: linear-gradient(to right, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%));
                    border-radius: 7px;
                    outline: none;
                    cursor: pointer;
                    border: 1px solid var(--color-border-input);
                }
                .hue-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 8px;
                    height: 18px;
                    background: var(--color-text-strong);
                    border: 1px solid var(--color-bg-deep);
                    border-radius: 2px;
                    cursor: pointer;
                    box-shadow: 0 0 2px rgba(0,0,0,0.6);
                }
                .hue-slider::-moz-range-thumb {
                    width: 8px;
                    height: 18px;
                    background: var(--color-text-strong);
                    border: 1px solid var(--color-bg-deep);
                    border-radius: 2px;
                    cursor: pointer;
                }
                /* Black-and-white checkboxes to match the System menu theme. */
                .anim-editor-root input[type="checkbox"] {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 14px;
                    height: 14px;
                    background: var(--color-bg-deep);
                    border: 1px solid var(--color-accent-border);
                    border-radius: 2px;
                    cursor: pointer;
                    position: relative;
                    margin: 0;
                    vertical-align: middle;
                }
                .anim-editor-root input[type="checkbox"]:hover {
                    border-color: var(--color-accent-border-strong);
                }
                .anim-editor-root input[type="checkbox"]:checked::after {
                    content: '';
                    position: absolute;
                    left: 3px;
                    top: -1px;
                    width: 4px;
                    height: 9px;
                    border: solid var(--color-text-strong);
                    border-width: 0 2px 2px 0;
                    transform: rotate(45deg);
                }
                /* Gold-themed custom dropdown trigger reused for Position, etc. */
                .anim-gold-dropdown {
                    position: relative;
                    padding: 6px 24px 6px 10px;
                    background: var(--color-accent-tint-15);
                    border: 1px solid var(--color-accent-border);
                    color: var(--color-accent-bright);
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 10px;
                    font-weight: 600;
                    outline: none;
                    user-select: none;
                    text-align: left;
                }
                .anim-gold-dropdown:hover { border-color: var(--color-accent-border-strong); }
                .anim-gold-dropdown::after {
                    content: '▼';
                    position: absolute;
                    right: 8px;
                    top: 50%;
                    transform: translateY(-50%);
                    font-size: 9px;
                }
                .anim-editor-workspace {
                    display: flex;
                    flex: 1;
                    min-height: 0;
                    gap: 8px;
                }
                .anim-editor-content-column {
                    display: flex;
                    flex: 1;
                    min-width: 0;
                    min-height: 0;
                    flex-direction: column;
                    gap: 8px;
                }
                .anim-editor-properties {
                    max-height: clamp(140px, 20vh, 190px);
                    flex: 0 0 auto;
                }
                .anim-editor-timings {
                    display: flex;
                    flex: 0 0 clamp(260px, 29%, 340px);
                    min-width: 0;
                    min-height: 0;
                    flex-direction: column;
                }
                @container database-detail (max-width: 720px) {
                    .anim-editor-workspace {
                        flex-direction: column;
                        overflow-y: auto;
                    }
                    .anim-editor-content-column {
                        flex: 0 0 auto;
                        min-height: 620px;
                    }
                    .anim-editor-timings {
                        flex: 0 0 280px;
                    }
                }
            </style>
            <div class="anim-editor-root" style="display:flex;flex-direction:column;gap:8px;width:100%;height:100%;min-height:0;padding:8px;box-sizing:border-box;overflow:hidden;">
                <!-- Header with black background -->
                <div style="background:var(--color-bg-deep);padding:6px 10px;border:1px solid var(--color-border);border-radius:3px;flex-shrink:0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
                        <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
                            <span style="font-size: 10px; color: var(--color-text-muted); white-space: nowrap; padding: 4px 6px; background: var(--color-bg-base); border: 1px solid var(--color-border-subtle); border-radius: 3px;">${tt('ID:')} ${animation.id}</span>
                            <label for="animation-name-input" style="font-size: 10px; color: var(--color-text-muted); flex-shrink: 0;">${tt('Name:')}</label>
                            <input id="animation-name-input" type="text" value="${rrEscapeHtml(animation.name)}" placeholder="${tt('Unnamed Animation')}" style="font-size: 13px; font-weight: 600; color: var(--color-text-strong); background: var(--color-bg-input); border: 1px solid var(--color-border-input); border-radius: 3px; padding: 4px 8px; outline: none; flex: 1; max-width: 320px; font-family: inherit;">
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                            <label style="font-size: 10px; color: var(--color-text-muted);">${tt('Type:')}</label>
                            <div id="animation-type-selector" data-value="${isEffekseer ? 'effekseer' : 'sprite'}" tabindex="0" style="position: relative; padding: 4px 24px 4px 10px; background: var(--color-accent-tint-15); border: 1px solid var(--color-accent-border-mid); color: var(--color-accent-bright); border-radius: 3px; cursor: pointer; font-size: 11px; font-weight: 600; outline: none; min-width: 110px; user-select: none;">
                            <span class="animation-type-label">${tt(isEffekseer ? 'Effekseer' : 'Sprite-based')}</span>
                            <span style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); font-size: 9px;">▼</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="anim-editor-workspace">
                    <div class="anim-editor-content-column">
                    <!-- Properties -->
                    <div class="anim-editor-properties" style="min-width:180px;background:var(--color-bg-panel);border:1px solid var(--color-border);border-radius:3px;padding:6px;display:flex;flex-direction:column;">
                        <div style="font-size:11px;font-weight:600;margin-bottom:6px;color:var(--color-text);flex-shrink:0;">${tt('Properties')}</div>
                        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;font-size:10px;flex:1;min-height:0;overflow-y:auto;padding-right:2px;">
                            ${isSpriteAnimation ? `
                                ${[1, 2].map(slot => {
                                    const hue = (slot === 1 ? animation.animation1Hue : animation.animation2Hue) || 0;
                                    const name = (slot === 1 ? animation.animation1Name : animation.animation2Name) || tt('None');
                                    return `
                                <div style="min-width:0;">
                                    <div style="color: var(--color-text-muted); margin-bottom: 4px; font-weight: 600;">${tt('Animation')} ${slot}</div>
                                    <div style="display: flex; gap: 4px; margin-bottom: 5px;">
                                        <div id="anim${slot}-name-display" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:var(--color-bg-input-alt);padding:6px;border:1px solid var(--color-border-input);border-radius:2px;">${rrEscapeHtml(name)}</div>
                                        <button id="anim${slot}-pick-btn" style="padding: 4px 10px; background: var(--color-accent-tint-15); border: 1px solid var(--color-accent-border-mid); color: var(--color-accent-bright); border-radius: 3px; cursor: pointer; font-size: 11px; font-weight: 600; white-space: nowrap;">...</button>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 6px;">
                                        <label for="anim${slot}-hue-slider" style="color: var(--color-text-muted); font-size: 10px; flex-shrink: 0;">${tt('Hue')}</label>
                                        <input id="anim${slot}-hue-slider" class="hue-slider" type="range" min="0" max="360" value="${hue}" style="flex: 1; min-width: 0;">
                                        <span id="anim${slot}-hue-value" style="color: var(--color-text); font-size: 10px; min-width: 32px; text-align: right; font-variant-numeric: tabular-nums;">${hue}°</span>
                                    </div>
                                </div>`;
                                }).join('')}
                                <div style="grid-column:1 / -1;display:flex;gap:8px;">
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="color: var(--color-text-muted); margin-bottom: 4px;">${tt('Position')}</div>
                                        <div id="anim-position-select" class="anim-gold-dropdown" data-value="${animation.position || 0}" tabindex="0" style="width: 100%; box-sizing: border-box;">
                                            ${tt(['Head', 'Center', 'Feet', 'Screen'][animation.position || 0])}
                                        </div>
                                    </div>
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="color: var(--color-text-muted); margin-bottom: 4px;">${tt('Frames')}</div>
                                        <div style="background: var(--color-bg-input-alt); padding: 6px; border: 1px solid var(--color-border-input); border-radius: 2px; text-align: center; color: var(--color-text);">${animation.frames ? animation.frames.length : 0}</div>
                                    </div>
                                </div>
                            ` : ''}

                            ${isEffekseer ? `
                                <div style="grid-column:1 / -1;color:var(--color-text-muted);font-size:10px;font-style:italic;padding:4px;">
                                    ${tt('Effect file, display type, scale and other settings are editable in the Particle Effect panel below.')}
                                </div>
                            ` : ''}
                        </div>
                    </div>

                <!-- Sprite Sheet Preview Row -->
                ${isSpriteAnimation ? `
                    <div class="anim-sprite-sheet-panel" style="background:var(--color-bg-panel);border:1px solid var(--color-border);border-radius:3px;padding:6px;flex-shrink:0;">
                        <div style="font-size:11px;font-weight:600;margin-bottom:4px;color:var(--color-text);">${tt('Sprite Sheet')}</div>
                        <div style="overflow-x: auto; overflow-y: hidden; background: var(--color-bg-deep); border: 1px solid var(--color-border-input); border-radius: 2px; padding: 2px;">
                            <canvas id="sprite-sheet-preview" style="display:block;image-rendering:pixelated;height:72px;"></canvas>
                        </div>
                    </div>
                ` : ''}

                <!-- Frames and Preview Row (Bottom) -->
                <div class="anim-editor-main-row" style="display:flex;gap:8px;flex-wrap:nowrap;flex:1;min-height:0;">
                    <!-- Left: Frame Timeline or Particle Effect Controls -->
                    ${isSpriteAnimation ? `
                    <div style="width:144px;min-width:144px;min-height:0;background:var(--color-bg-panel);border:1px solid var(--color-border);border-radius:3px;padding:6px;display:flex;flex-direction:column;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                            <div style="font-size: 11px; font-weight: 600; color: var(--color-text);">${tt('Frames')}</div>
                            <div style="display: flex; gap: 3px;">
                                <button id="add-frame-btn" style="padding: 3px 6px; background: var(--color-success); border: 1px solid var(--color-success-border); color: var(--color-text-strong); border-radius: 2px; cursor: pointer; font-size: 9px;" title="${tt('Add Frame')}">+</button>
                                <button id="remove-frame-btn" style="padding: 3px 6px; background: var(--color-danger); border: 1px solid var(--color-danger-border); color: var(--color-text); border-radius: 2px; cursor: pointer; font-size: 9px;" title="${tt('Remove Frame')}">-</button>
                            </div>
                        </div>
                        <div id="animation-frame-list" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 3px;">
                            <!-- Frame list will be populated here -->
                        </div>
                    </div>
                    ` : ''}

                    ${isEffekseer ? `
                    <div style="width:248px;min-width:248px;min-height:0;overflow-y:auto;background:var(--color-bg-panel);border:1px solid var(--color-border);border-radius:3px;padding:8px;display:flex;flex-direction:column;gap:6px;">
                        <div style="font-size: 11px; font-weight: 600; color: var(--color-text); margin-bottom: 2px;">${tt('Particle Effect')}</div>

                        <!-- Effect File -->
                        <div>
                            <div style="font-size: 10px; color: var(--color-text-muted); margin-bottom: 4px;">${tt('Effect File:')}</div>
                            <div style="display: flex; gap: 6px; align-items: stretch;">
                                <div id="effekseer-effect-name" style="flex: 1; background: var(--color-bg-input-alt); padding: 6px; border: 1px solid var(--color-border-input); border-radius: 2px; word-break: break-word; font-size: 11px; display: flex; align-items: center;">${rrEscapeHtml(animation.effectName || tt('None'))}</div>
                                <button id="effekseer-pick-effect" style="padding: 6px 12px; background: var(--color-info); border: 1px solid #3a7a9a; color: var(--color-text-strong); border-radius: 2px; cursor: pointer; font-size: 10px; white-space: nowrap;">${tt('Change...')}</button>
                            </div>
                        </div>

                        <!-- Display Type -->
                        <div>
                            <div style="font-size: 10px; color: var(--color-text-muted); margin-bottom: 4px;">${tt('Display Type:')}</div>
                            <select id="effekseer-display-type" style="width: 100%; padding: 6px; background: var(--color-bg-input-alt); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 2px; font-size: 11px;">
                                <option value="0" ${animation.displayType === 0 ? 'selected' : ''}>${tt('For each target')}</option>
                                <option value="1" ${animation.displayType === 1 ? 'selected' : ''}>${tt('Center of all targets')}</option>
                                <option value="2" ${animation.displayType === 2 ? 'selected' : ''}>${tt('Center of the screen')}</option>
                            </select>
                        </div>

                        <!-- Scale -->
                        <div>
                            <div style="font-size: 10px; color: var(--color-text-muted); margin-bottom: 4px;">${tt('Scale (%):')}</div>
                            <input type="number" id="effekseer-scale" value="${animation.scale || 100}" min="1" max="1000" style="width: 100%; padding: 6px; background: var(--color-bg-input-alt); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 2px; font-size: 11px;">
                        </div>

                        <!-- Speed -->
                        <div>
                            <div style="font-size: 10px; color: var(--color-text-muted); margin-bottom: 4px;">${tt('Speed (%):')}</div>
                            <input type="number" id="effekseer-speed" value="${animation.speed || 100}" min="1" max="1000" style="width: 100%; padding: 6px; background: var(--color-bg-input-alt); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 2px; font-size: 11px;">
                        </div>

                        <!-- Rotation -->
                        <div>
                            <div style="font-size: 10px; color: var(--color-text-muted); margin-bottom: 6px;">${tt('Rotation:')}</div>
                            <div style="display: flex; flex-direction: column; gap: 6px;">
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <label style="font-size: 10px; color: var(--color-text-muted); min-width: 20px;">X:</label>
                                    <input type="number" id="effekseer-rotation-x" value="${animation.rotation?.x || 0}" min="-360" max="360" style="flex: 1; padding: 4px; background: var(--color-bg-input-alt); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 2px; font-size: 10px;">
                                </div>
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <label style="font-size: 10px; color: var(--color-text-muted); min-width: 20px;">Y:</label>
                                    <input type="number" id="effekseer-rotation-y" value="${animation.rotation?.y || 0}" min="-360" max="360" style="flex: 1; padding: 4px; background: var(--color-bg-input-alt); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 2px; font-size: 10px;">
                                </div>
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <label style="font-size: 10px; color: var(--color-text-muted); min-width: 20px;">Z:</label>
                                    <input type="number" id="effekseer-rotation-z" value="${animation.rotation?.z || 0}" min="-360" max="360" style="flex: 1; padding: 4px; background: var(--color-bg-input-alt); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 2px; font-size: 10px;">
                                </div>
                            </div>
                        </div>

                        <!-- Offset -->
                        <div>
                            <div style="font-size: 10px; color: var(--color-text-muted); margin-bottom: 6px;">${tt('Offset:')}</div>
                            <div style="display: flex; flex-direction: column; gap: 6px;">
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <label style="font-size: 10px; color: var(--color-text-muted); min-width: 20px;">X:</label>
                                    <input type="number" id="effekseer-offset-x" value="${animation.offsetX || 0}" style="flex: 1; padding: 4px; background: var(--color-bg-input-alt); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 2px; font-size: 10px;">
                                </div>
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <label style="font-size: 10px; color: var(--color-text-muted); min-width: 20px;">Y:</label>
                                    <input type="number" id="effekseer-offset-y" value="${animation.offsetY || 0}" style="flex: 1; padding: 4px; background: var(--color-bg-input-alt); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 2px; font-size: 10px;">
                                </div>
                            </div>
                        </div>

                        <!-- 3D Rotation Control -->
                        <div>
                            <div style="font-size: 10px; color: var(--color-text-muted); margin-bottom: 4px;">${tt('3D Rotation Control:')}</div>
                            <div style="display: flex; justify-content: center; align-items: center; background: var(--color-bg-base); border: 1px solid var(--color-border-input); border-radius: 4px; padding: 6px; overflow: hidden;">
                                <canvas id="effekseer-rotation-sphere" width="120" height="120" style="cursor:grab;display:block;"></canvas>
                            </div>
                            <div style="font-size: 9px; color: var(--color-text-dim); margin-top: 3px; text-align: center;">${tt('Drag to rotate')}</div>
                        </div>
                    </div>
                    ` : ''}

                    <!-- Right: Preview + Controls -->
                    <div class="anim-preview-column" style="flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;">
                        <div style="height:100%;min-height:0;overflow-y:auto;background:var(--color-bg-panel);border:1px solid var(--color-border);border-radius:3px;padding:8px;display:flex;flex-direction:column;box-sizing:border-box;">
                            <div style="font-size:11px;font-weight:600;margin-bottom:4px;color:var(--color-text);">${tt('Preview')}</div>
                            <div class="rr-dark-surface anim-preview-surface" style="display:flex;align-items:center;justify-content:center;background:var(--color-bg-deep);border:1px solid var(--color-border-input);position:relative;height:clamp(180px,30vh,420px);flex-shrink:0;">
                                <canvas id="animation-preview-canvas" width="960" height="540" style="image-rendering: pixelated; max-width: 100%; max-height: 100%;"></canvas>
                                ${!isSpriteAnimation && !isEffekseer ? `<div style="color: var(--color-text-muted); position: absolute;">${tt('No preview available')}</div>` : ''}
                            </div>

                            <!-- Playback Controls -->
                            <div style="margin-top:6px;display:flex;gap:5px;align-items:center;flex-wrap:wrap;">
                                <button id="animation-play-btn" style="padding: 5px 12px; background: var(--color-success); border: 1px solid var(--color-success-border); color: var(--color-text-strong); border-radius: 3px; cursor: pointer; font-size: 10px;">▶ ${tt('Play')}</button>
                                <button id="animation-stop-btn" style="padding: 5px 12px; background: var(--color-danger); border: 1px solid var(--color-danger-border); color: var(--color-text); border-radius: 3px; cursor: pointer; font-size: 10px;">■ ${tt('Stop')}</button>
                                ${isEffekseer ? `
                                <label style="display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--color-text); cursor: pointer; margin-left: 4px;">
                                    <input type="checkbox" id="animation-repeat-checkbox" style="cursor: pointer;">
                                    <span>${tt('Repeat')}</span>
                                </label>
                                ` : ''}
                                <div style="flex: 1; text-align: right; font-size: 9px; color: var(--color-text-muted); min-width: 100px;">
                                    <span id="animation-frame-counter">${tt('Frame:')} 0 / ${animation.frames ? animation.frames.length : 0}</span>
                                </div>
                            </div>

                            <!-- Preview Background & Target Controls -->
                            <div id="preview-controls-row" style="margin-top: 6px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 10px;">
                                <label style="display: flex; align-items: center; gap: 3px; color: var(--color-text); cursor: pointer;">
                                    <input type="checkbox" id="preview-bg-checkbox" style="cursor: pointer;">
                                    <span>${tt('Background')}</span>
                                </label>
                                <div id="preview-bb1-select" class="anim-gold-dropdown" tabindex="0" data-value="" style="font-size: 10px; min-width: 110px; max-width: 130px; padding: 3px 22px 3px 8px;">${tt('(none)')}</div>
                                <div id="preview-bb2-select" class="anim-gold-dropdown" tabindex="0" data-value="" style="font-size: 10px; min-width: 110px; max-width: 130px; padding: 3px 22px 3px 8px;">${tt('(none)')}</div>
                                <div style="width: 1px; height: 16px; background: var(--color-border-input); margin: 0 2px;"></div>
                                <label style="display: flex; align-items: center; gap: 3px; color: var(--color-text); cursor: pointer;">
                                    <input type="checkbox" id="preview-target-checkbox" style="cursor: pointer;">
                                    <span>${tt('Target')}</span>
                                </label>
                                <div id="preview-target-select" class="anim-gold-dropdown" tabindex="0" data-value="" style="font-size: 10px; min-width: 140px; max-width: 200px; padding: 3px 22px 3px 8px;">${tt('(none)')}</div>
                            </div>
                        </div>
                    </div>
                </div>
                    </div>

                    <!-- Sound & Flash Timings stay independent of Properties and Preview height. -->
                    <aside class="anim-editor-timings" style="background:var(--color-bg-panel);border:1px solid var(--color-border);border-radius:3px;padding:6px;box-sizing:border-box;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-shrink:0;gap:8px;">
                            <div style="font-size:11px;font-weight:600;color:var(--color-text);">${tt('SE & Flash Timings')}</div>
                            <button id="add-timing-btn" style="padding:4px 8px;background:var(--color-success);border:1px solid var(--color-success-border);color:var(--color-text-strong);border-radius:2px;cursor:pointer;font-size:10px;">+ ${tt('Add')}</button>
                        </div>
                        <div id="timings-list" style="flex:1;min-height:0;overflow-y:auto;background:var(--color-bg-input-alt);border:1px solid var(--color-border-input);border-radius:2px;padding:6px;">
                            <div style="font-size:10px;color:var(--color-text-muted);padding:6px;">${tt('No timings added')}</div>
                        </div>
                    </aside>
                </div>
            </div>
        `;

        container.innerHTML = html;

        // Reset timings selection / clipboard for the newly opened animation
        // so selections don't carry across switches between animations.
        this._selectedTimingIndices = new Set();
        // Note: _timingClipboard is preserved across switches deliberately so
        // the user can copy timings from one animation and paste into another.

        // Set up animation name editing
        const nameInput = document.getElementById('animation-name-input');
        if (nameInput) {
            nameInput.addEventListener('input', (e) => {
                animation.name = e.target.value;
                // Persist to database so it survives reload / save
                if (this.databaseManager && this.databaseManager.updateAnimation) {
                    this.databaseManager.updateAnimation(animation.id, animation);
                }
                // Update the list item in the left panel
                const selectedItem = document.querySelector('.database-list-item.selected .database-list-name');
                if (selectedItem) {
                    selectedItem.textContent = animation.name || tt('Unnamed');
                }
            });
        }

        // Sprite animation: Animation 1 / Animation 2 / Position editing
        if (isSpriteAnimation) {
            const self = this;
            const persistSprite = () => {
                if (this.databaseManager && this.databaseManager.updateAnimation) {
                    this.databaseManager.updateAnimation(animation.id, animation);
                }
            };

            const pickAnimationImage = (slot) => {
                const currentProject = this.projectManager.getCurrentProject();
                if (!currentProject) { alert(tt('No project loaded')); return; }
                const path = require('path');
                const fs = require('fs');
                const animDir = path.join(currentProject.path, 'img', 'animations');
                let files;
                try {
                    files = RRAssetFiles.listImageReferences(animDir);
                } catch (e) {
                    alert(tt('No img/animations folder found'));
                    return;
                }
                if (files.length === 0) {
                    alert(tt('No animation images found in img/animations folder'));
                    return;
                }
                const title = `${tt('Select Animation')} ${slot} ${tt('Image')}`;
                const cb = (selectedFile) => {
                    if (slot === 1) animation.animation1Name = selectedFile;
                    else animation.animation2Name = selectedFile;
                    persistSprite();
                    // Re-render the detail view so the display updates
                    self.showAnimationDetail(container, animation);
                };
                const previewCb = fileName => RRAssetFiles.imageUrlFor(animDir, fileName);
                if (this.parentEditor && this.parentEditor.showImagePicker) {
                    this.parentEditor.showImagePicker(title, files, cb, previewCb);
                } else {
                    alert(tt('Image picker unavailable'));
                }
            };

            const anim1PickBtn = document.getElementById('anim1-pick-btn');
            anim1PickBtn?.addEventListener('click', () => pickAnimationImage(1));
            const anim2PickBtn = document.getElementById('anim2-pick-btn');
            anim2PickBtn?.addEventListener('click', () => pickAnimationImage(2));

            const bindHueSlider = (slot) => {
                const slider = document.getElementById(`anim${slot}-hue-slider`);
                const readout = document.getElementById(`anim${slot}-hue-value`);
                if (!slider) return;
                const apply = (e) => {
                    const val = parseInt(e.target.value) || 0;
                    if (slot === 1) animation.animation1Hue = val;
                    else animation.animation2Hue = val;
                    if (readout) readout.textContent = `${val}°`;
                    // Live preview: re-render the current frame whenever hue changes.
                    // Uses `self` captured at the top of the isSpriteAnimation block
                    // (= this); `editorSelf` would have been undefined here.
                    if (self._currentSpriteRenderFrame && window.currentAnimationFrameIndex !== undefined) {
                        self._currentSpriteRenderFrame(window.currentAnimationFrameIndex);
                    }
                    // Also retint the sprite sheet strip above the preview
                    if (self._currentSpriteSheetPreviewRender) {
                        self._currentSpriteSheetPreviewRender();
                    }
                };
                // Live update + render on drag, persist on release
                slider.addEventListener('input', apply);
                slider.addEventListener('change', (e) => { apply(e); persistSprite(); });
            };
            bindHueSlider(1);
            bindHueSlider(2);

            const positionTrigger = document.getElementById('anim-position-select');
            if (positionTrigger) {
                const positionOpts = [
                    { value: '0', label: tt('Head') },
                    { value: '1', label: tt('Center') },
                    { value: '2', label: tt('Feet') },
                    { value: '3', label: tt('Screen') }
                ];
                const showPositionDropdown = () => {
                    document.querySelectorAll('.animation-type-popup, .anim-position-popup').forEach(el => el.remove());
                    const rect = positionTrigger.getBoundingClientRect();
                    const popup = document.createElement('div');
                    popup.className = 'anim-position-popup';
                    popup.style.cssText = `position: fixed; left: ${rect.left}px; top: ${rect.bottom + 2}px; min-width: ${rect.width}px; background: var(--color-bg-base); border: 1px solid var(--color-accent-border-mid); border-radius: 3px; z-index: 100000; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6); overflow: hidden;`;
                    const current = positionTrigger.dataset.value;
                    positionOpts.forEach(opt => {
                        const item = document.createElement('div');
                        const isActive = opt.value === current;
                        item.style.cssText = `padding: 6px 12px; cursor: pointer; font-size: 10px; font-weight: 600; color: ${isActive ? 'var(--color-accent-bright)' : 'var(--color-text)'}; background: ${isActive ? 'var(--color-accent-tint-15)' : 'transparent'}; transition: background 0.1s;`;
                        item.textContent = opt.label;
                        item.addEventListener('mouseenter', () => {
                            if (!isActive) { item.style.background = 'var(--color-accent-tint-10)'; item.style.color = 'var(--color-accent-bright)'; }
                        });
                        item.addEventListener('mouseleave', () => {
                            if (!isActive) { item.style.background = 'transparent'; item.style.color = 'var(--color-text)'; }
                        });
                        item.addEventListener('click', () => {
                            popup.remove();
                            if (opt.value !== current) {
                                positionTrigger.dataset.value = opt.value;
                                positionTrigger.firstChild.nodeValue = opt.label;
                                positionTrigger.textContent = opt.label;
                                animation.position = parseInt(opt.value);
                                persistSprite();
                                if (self._currentSpriteRenderFrame) {
                                    self._currentSpriteRenderFrame(window.currentAnimationFrameIndex || 0);
                                }
                            }
                        });
                        popup.appendChild(item);
                    });
                    document.body.appendChild(popup);
                    const closeOnOutside = (ev) => {
                        if (!popup.contains(ev.target) && ev.target !== positionTrigger && !positionTrigger.contains(ev.target)) {
                            popup.remove();
                            document.removeEventListener('click', closeOnOutside, true);
                        }
                    };
                    setTimeout(() => document.addEventListener('click', closeOnOutside, true), 0);
                };
                positionTrigger.addEventListener('click', showPositionDropdown);
                positionTrigger.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showPositionDropdown(); }
                });
            }
        }

        // Set up preview background & target controls
        this.setupPreviewControls(animation);
        this._loadPreviewImages();

        // Set up SE & Flash Timing modal
        this.setupTimingModal(animation, container);

        // Populate timings list
        this.populateTimingsList(animation);

        // Set up animation playback for sprite-based animations
        if (isSpriteAnimation) {
            this.setupSpriteAnimationPlayback(animation);
        }

        // Set up sprite sheet preview for sprite-based animations
        if (isSpriteAnimation) {
            this.setupSpriteSheetPreview(animation);
        }

        // Set up Effekseer animation playback
        if (isEffekseer) {
            this.setupEffekseerAnimationPlayback(animation);
        }

        // Set up animation type selector (custom dropdown so the option list
        // gets the gold theme too -- native <select> popups inherit OS styling
        // and ignore <option style=""> attributes).
        const typeSelector = document.getElementById('animation-type-selector');
        const triggerTypeChange = (newType) => {
                DatabaseAnimationEditor.convertAnimationFormat(animation, newType);
                this.databaseManager?.updateAnimation?.(animation.id, animation);
                this.showAnimationDetail(container, animation);
        };

        if (typeSelector) {
            const showTypeDropdown = () => {
                // Remove any existing popup
                document.querySelectorAll('.animation-type-popup').forEach(el => el.remove());
                const rect = typeSelector.getBoundingClientRect();
                const popup = document.createElement('div');
                popup.className = 'animation-type-popup';
                popup.style.cssText = `position: fixed; left: ${rect.left}px; top: ${rect.bottom + 2}px; min-width: ${rect.width}px; background: var(--color-bg-base); border: 1px solid var(--color-accent-border-mid); border-radius: 3px; z-index: 100000; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6); overflow: hidden;`;

                const current = typeSelector.dataset.value;
                const opts = [
                    { value: 'sprite', label: tt('Sprite-based') },
                    { value: 'effekseer', label: tt('Effekseer') }
                ];
                opts.forEach(opt => {
                    const item = document.createElement('div');
                    const isActive = opt.value === current;
                    item.style.cssText = `padding: 6px 12px; cursor: pointer; font-size: 11px; font-weight: 600; color: ${isActive ? 'var(--color-accent-bright)' : 'var(--color-text)'}; background: ${isActive ? 'var(--color-accent-tint-15)' : 'transparent'}; transition: background 0.1s;`;
                    item.textContent = opt.label;
                    item.addEventListener('mouseenter', () => {
                        if (!isActive) {
                            item.style.background = 'var(--color-accent-tint-10)';
                            item.style.color = 'var(--color-accent-bright)';
                        }
                    });
                    item.addEventListener('mouseleave', () => {
                        if (!isActive) {
                            item.style.background = 'transparent';
                            item.style.color = 'var(--color-text)';
                        }
                    });
                    item.addEventListener('click', () => {
                        popup.remove();
                        if (opt.value !== current) triggerTypeChange(opt.value);
                    });
                    popup.appendChild(item);
                });
                document.body.appendChild(popup);

                const closeOnOutside = (ev) => {
                    if (!popup.contains(ev.target) && ev.target !== typeSelector && !typeSelector.contains(ev.target)) {
                        popup.remove();
                        document.removeEventListener('click', closeOnOutside, true);
                    }
                };
                setTimeout(() => document.addEventListener('click', closeOnOutside, true), 0);
            };
            typeSelector.addEventListener('click', showTypeDropdown);
            typeSelector.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    showTypeDropdown();
                }
            });
        }

        // Set up Effekseer effect file picker
        const pickEffectBtn = document.getElementById('effekseer-pick-effect');
        if (pickEffectBtn) {
            pickEffectBtn.addEventListener('click', () => {
                this.showEffectFilePicker(animation, container);
            });
        }
    }

    // ── Preview Background & Target ──────────────────────────────────

    setupPreviewControls(animation) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const fs = require('fs');
        const pathMod = require('path');
        const project = this.projectManager.getCurrentProject();

        // Restore persisted preferences on first call
        if (this._previewBB1Name === undefined) {
            this._previewBBEnabled = localStorage.getItem('rpg-reactor.animPreview.bbEnabled') === 'true';
            this._previewTargetEnabled = localStorage.getItem('rpg-reactor.animPreview.targetEnabled') === 'true';
            this._previewBB1Name = localStorage.getItem('rpg-reactor.animPreview.bb1') || null;
            this._previewBB2Name = localStorage.getItem('rpg-reactor.animPreview.bb2') || null;
            this._previewTargetEnemyId = parseInt(localStorage.getItem('rpg-reactor.animPreview.targetId')) || null;

            // Default battleback names from System.json if nothing persisted
            if (!this._previewBB1Name && project) {
                try {
                    const sysPath = pathMod.join(project.path, 'data', 'System.json');
                    if (fs.existsSync(sysPath)) {
                        const sys = JSON.parse(fs.readFileSync(sysPath, 'utf8'));
                        this._previewBB1Name = sys.battleback1Name || null;
                        this._previewBB2Name = this._previewBB2Name || sys.battleback2Name || null;
                    }
                } catch (e) { /* ignore */ }
            }
        }

        // Scan battleback directories
        const scanDir = (subdir) => {
            if (!project) return [];
            try {
                const dir = pathMod.join(project.path, 'img', subdir);
                if (!fs.existsSync(dir)) return [];
                return RRAssetFiles.listImageReferences(dir);
            } catch (e) { return []; }
        };

        const bb1Files = scanDir('battlebacks1');
        const bb2Files = scanDir('battlebacks2');

        // Persist preference helper
        const persist = () => {
            localStorage.setItem('rpg-reactor.animPreview.bbEnabled', this._previewBBEnabled);
            localStorage.setItem('rpg-reactor.animPreview.targetEnabled', this._previewTargetEnabled);
            localStorage.setItem('rpg-reactor.animPreview.bb1', this._previewBB1Name || '');
            localStorage.setItem('rpg-reactor.animPreview.bb2', this._previewBB2Name || '');
            localStorage.setItem('rpg-reactor.animPreview.targetId', this._previewTargetEnemyId || '');
        };

        const bindBattlebackPicker = (trigger, files, folder, current, title, onPick) => {
            if (!trigger) return;
            trigger.dataset.value = current || '';
            const open = () => {
                if (!this.parentEditor?.showImagePicker) return;
                const imageRoot = pathMod.join(project.path, 'img', folder);
                this.parentEditor.showImagePicker(
                    tt(title),
                    files,
                    selected => onPick(selected || ''),
                    name => RRAssetFiles.imageUrlFor(imageRoot, name),
                    trigger.dataset.value || undefined,
                    { allowNone: true }
                );
            };
            trigger.addEventListener('click', open);
            trigger.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                open();
            });
        };

        // Background battleback 1 picker
        const bb1Select = document.getElementById('preview-bb1-select');
        bindBattlebackPicker(
            bb1Select, bb1Files, 'battlebacks1', this._previewBB1Name,
            'Select Battleback 1', value => {
                this._previewBB1Name = value || null;
                bb1Select.dataset.value = value;
                bb1Select.textContent = value || tt('(none)');
                persist();
                this._loadPreviewImages();
            }
        );

        // Background battleback 2 picker
        const bb2Select = document.getElementById('preview-bb2-select');
        bindBattlebackPicker(
            bb2Select, bb2Files, 'battlebacks2', this._previewBB2Name,
            'Select Battleback 2', value => {
                this._previewBB2Name = value || null;
                bb2Select.dataset.value = value;
                bb2Select.textContent = value || tt('(none)');
                persist();
                this._loadPreviewImages();
            }
        );

        // Enemy target dropdown
        const targetSelect = document.getElementById('preview-target-select');
        if (targetSelect) {
            const enemies = this.databaseManager.getEnemies ? this.databaseManager.getEnemies() : [];
            const targetOpts = [
                { value: '', label: tt('(none)') },
                ...enemies.filter(e => e && e.id > 0).map(e => ({
                    value: String(e.id),
                    label: `${String(e.id).padStart(4, '0')}: ${e.name || tt('Unnamed')}`
                }))
            ];
            this._attachGoldDropdown(targetSelect, targetOpts, this._previewTargetEnemyId ? String(this._previewTargetEnemyId) : '', (value, label) => {
                this._previewTargetEnemyId = parseInt(value) || null;
                this._previewTargetBattlerName = null;
                this._previewTargetImg = null;
                targetSelect.dataset.value = value;
                targetSelect.textContent = label;
                persist();
                this._loadPreviewImages();
            });
        }

        // Sync initial display labels for the dropdowns
        if (bb1Select) bb1Select.textContent = this._previewBB1Name || tt('(none)');
        if (bb2Select) bb2Select.textContent = this._previewBB2Name || tt('(none)');
        if (targetSelect) {
            const enemies = this.databaseManager.getEnemies ? this.databaseManager.getEnemies() : [];
            const e = enemies.find(en => en && en.id === this._previewTargetEnemyId);
            targetSelect.textContent = e ? `${String(e.id).padStart(4, '0')}: ${e.name || tt('Unnamed')}` : tt('(none)');
        }

        // Checkbox restore + listeners
        const bgCheckbox = document.getElementById('preview-bg-checkbox');
        const targetCheckbox = document.getElementById('preview-target-checkbox');
        if (bgCheckbox) bgCheckbox.checked = this._previewBBEnabled;
        if (targetCheckbox) targetCheckbox.checked = this._previewTargetEnabled;
        if (bgCheckbox) bgCheckbox.addEventListener('change', () => {
            this._previewBBEnabled = bgCheckbox.checked;
            persist();
            this._loadPreviewImages();
        });
        if (targetCheckbox) targetCheckbox.addEventListener('change', () => {
            this._previewTargetEnabled = targetCheckbox.checked;
            persist();
            this._loadPreviewImages();
        });
    }

    /**
     * Attach a gold-themed dropdown popup to a trigger element. Reusable
     * across editors -- replaces native <select> wherever the OS-rendered
     * blue option list clashes with the editor theme.
     *
     * triggerEl  - the .anim-gold-dropdown <div> already in the DOM
     * options    - [{value: string, label: string}, ...]
     * current    - currently-selected value (string)
     * onChange   - (newValue, newLabel) => void, called when user picks a new option
     *
     * The popup is fixed-positioned below the trigger, max-height capped to
     * 280px with scrolling for long lists (enemies, battleback files), and
     * dismisses on click-outside / Escape.
     */
    _attachGoldDropdown(triggerEl, options, current, onChange) {
        triggerEl.dataset.value = current;
        const open = () => {
            document.querySelectorAll('.rr-gold-popup').forEach(el => el.remove());
            const rect = triggerEl.getBoundingClientRect();
            const popup = document.createElement('div');
            popup.className = 'rr-gold-popup';
            popup.style.cssText = `position: fixed; left: ${rect.left}px; top: ${rect.bottom + 2}px; min-width: ${rect.width}px; max-height: 280px; overflow-y: auto; background: var(--color-bg-base); border: 1px solid var(--color-accent-border-strong); border-radius: var(--radius-md); z-index: 100000; box-shadow: var(--shadow-popup);`;
            const curVal = triggerEl.dataset.value;
            options.forEach(opt => {
                const item = document.createElement('div');
                const isActive = opt.value === curVal;
                item.style.cssText = `padding: 6px 12px; cursor: pointer; font-size: var(--font-size-xs); font-weight: 600; color: ${isActive ? 'var(--color-accent-bright)' : 'var(--color-text)'}; background: ${isActive ? 'var(--color-accent-tint-15)' : 'transparent'}; transition: background var(--ease-fast), color var(--ease-fast); white-space: nowrap;`;
                item.textContent = opt.label;
                item.addEventListener('mouseenter', () => {
                    if (!isActive) { item.style.background = 'var(--color-accent-tint-10)'; item.style.color = 'var(--color-accent-bright)'; }
                });
                item.addEventListener('mouseleave', () => {
                    if (!isActive) { item.style.background = 'transparent'; item.style.color = 'var(--color-text)'; }
                });
                item.addEventListener('click', () => {
                    popup.remove();
                    if (opt.value !== curVal) onChange(opt.value, opt.label);
                });
                popup.appendChild(item);
            });
            document.body.appendChild(popup);
            const closeOnOutside = (ev) => {
                if (!popup.contains(ev.target) && ev.target !== triggerEl && !triggerEl.contains(ev.target)) {
                    popup.remove();
                    document.removeEventListener('click', closeOnOutside, true);
                    document.removeEventListener('keydown', escClose, true);
                }
            };
            const escClose = (ev) => { if (ev.key === 'Escape') { popup.remove(); document.removeEventListener('click', closeOnOutside, true); document.removeEventListener('keydown', escClose, true); } };
            setTimeout(() => {
                document.addEventListener('click', closeOnOutside, true);
                document.addEventListener('keydown', escClose, true);
            }, 0);
        };
        triggerEl.addEventListener('click', open);
        triggerEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
        });
    }

    _loadPreviewImages() {
        const pathMod = require('path');
        const project = this.projectManager.getCurrentProject();
        if (!project) return;

        let pending = 0;
        const done = () => {
            pending--;
            if (pending <= 0) this._onPreviewImagesLoaded();
        };

        // Load battleback1
        if (this._previewBBEnabled && this._previewBB1Name) {
            pending++;
            this._previewBB1Img = new Image();
            this._previewBB1Img.onload = done;
            this._previewBB1Img.onerror = () => { this._previewBB1Img = null; done(); };
            this._previewBB1Img.src = RRAssetFiles.imageUrlFor(
                pathMod.join(project.path, 'img', 'battlebacks1'), this._previewBB1Name);
        } else {
            this._previewBB1Img = null;
        }

        // Load battleback2
        if (this._previewBBEnabled && this._previewBB2Name) {
            pending++;
            this._previewBB2Img = new Image();
            this._previewBB2Img.onload = done;
            this._previewBB2Img.onerror = () => { this._previewBB2Img = null; done(); };
            this._previewBB2Img.src = RRAssetFiles.imageUrlFor(
                pathMod.join(project.path, 'img', 'battlebacks2'), this._previewBB2Name);
        } else {
            this._previewBB2Img = null;
        }

        // Load enemy target
        if (this._previewTargetEnabled && this._previewTargetEnemyId) {
            const enemies = this.databaseManager.getEnemies ? this.databaseManager.getEnemies() : [];
            const enemy = enemies.find(e => e && e.id === this._previewTargetEnemyId);
            if (enemy && enemy.battlerName) {
                this._previewTargetBattlerName = enemy.battlerName;
                const searchDirs = ['enemies', 'sv_enemies', 'characters'];
                let imagePath = null;
                for (const dir of searchDirs) {
                    const imageRoot = pathMod.join(project.path, 'img', dir);
                    const battlerFile = RRAssetFiles.findImage(imageRoot, enemy.battlerName);
                    if (battlerFile) {
                        imagePath = RRAssetFiles.toUrl(battlerFile.absolutePath);
                        break;
                    }
                }
                if (imagePath) {
                    pending++;
                    this._previewTargetImg = new Image();
                    this._previewTargetImg.onload = done;
                    this._previewTargetImg.onerror = () => { this._previewTargetImg = null; done(); };
                    this._previewTargetImg.src = imagePath;
                } else {
                    this._previewTargetImg = null;
                }
            } else {
                this._previewTargetImg = null;
            }
        } else {
            this._previewTargetImg = null;
        }

        if (pending === 0) this._onPreviewImagesLoaded();
    }

    _previewTargetRect(canvas) {
        if (!this._previewTargetEnabled || !this._previewTargetImg
                || !this._previewTargetImg.complete || !this._previewTargetImg.naturalWidth) return null;
        const img = this._previewTargetImg;
        const battlerName = this._previewTargetBattlerName || '';
        const firstChar = RRAssetFiles.basename(battlerName).charAt(0);
        const isBigChar = RRAssetFiles.isBigCharacter(battlerName);
        const isCharBattler = firstChar === '!' || firstChar === '$';
        let sourceX = 0;
        let sourceY = 0;
        let width = img.naturalWidth;
        let height = img.naturalHeight;
        if (isCharBattler) {
            const columns = isBigChar ? 3 : 12;
            const rows = isBigChar ? 4 : 8;
            width = img.naturalWidth / columns;
            height = img.naturalHeight / rows;
            sourceX = width;
        }
        const centerX = canvas.width / 2;
        const centerY = canvas.height * 0.65;
        return {
            image: img,
            sourceX,
            sourceY,
            sourceWidth: width,
            sourceHeight: height,
            x: centerX - width / 2,
            y: centerY - height / 2,
            width,
            height,
            centerX,
            centerY,
            feetY: centerY + height / 2
        };
    }

    _previewAnchor(animation, canvas) {
        const target = this._previewTargetRect(canvas);
        const position = Number(animation?.position ?? 1);
        if (!target || position === 3) {
            return { x: canvas.width / 2, y: canvas.height / 2 };
        }
        if (position === 0) return { x: target.centerX, y: target.feetY - target.height };
        if (position === 2) return { x: target.centerX, y: target.feetY };
        return { x: target.centerX, y: target.feetY - target.height / 2 };
    }

    _drawPreviewTarget(ctx, target) {
        if (!target) return;
        ctx.drawImage(target.image,
            target.sourceX, target.sourceY, target.sourceWidth, target.sourceHeight,
            target.x, target.y, target.width, target.height);
    }

    _drawPreviewScreenFlash(ctx, canvas) {
        const color = this._previewFlash?.screen;
        if (!color || color[3] <= 0) return;
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }

    _drawPreviewBackground(ctx, canvas) {
        this._previewBackgroundRevision = (this._previewBackgroundRevision || 0) + 1;
        // Fill black base
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw battleback1
        if (this._previewBBEnabled && this._previewBB1Img && this._previewBB1Img.complete && this._previewBB1Img.naturalWidth) {
            ctx.drawImage(this._previewBB1Img, 0, 0, canvas.width, canvas.height);
        }

        // Draw battleback2
        if (this._previewBBEnabled && this._previewBB2Img && this._previewBB2Img.complete && this._previewBB2Img.naturalWidth) {
            ctx.drawImage(this._previewBB2Img, 0, 0, canvas.width, canvas.height);
        }

        const target = this._previewTargetRect(canvas);
        if (!target || this._previewFlash?.hideDuration > 0) return;
        const color = this._previewFlash?.target;
        if (!color || color[3] <= 0 || typeof document === 'undefined') {
            this._drawPreviewTarget(ctx, target);
            return;
        }

        if (!this._previewTargetTintCanvas) this._previewTargetTintCanvas = document.createElement('canvas');
        const scratch = this._previewTargetTintCanvas;
        if (scratch.width !== canvas.width || scratch.height !== canvas.height) {
            scratch.width = canvas.width;
            scratch.height = canvas.height;
        }
        const scratchCtx = scratch.getContext('2d');
        scratchCtx.imageSmoothingEnabled = false;
        scratchCtx.clearRect(0, 0, scratch.width, scratch.height);
        this._drawPreviewTarget(scratchCtx, target);
        scratchCtx.save();
        scratchCtx.globalCompositeOperation = 'source-atop';
        scratchCtx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})`;
        scratchCtx.fillRect(0, 0, scratch.width, scratch.height);
        scratchCtx.restore();
        ctx.drawImage(scratch, 0, 0);
    }

    _onPreviewImagesLoaded() {
        // Sprite mode: re-render current frame
        if (this._currentSpriteRenderFrame) {
            const frameIdx = window.currentAnimationFrameIndex || 0;
            this._currentSpriteRenderFrame(frameIdx);
        }

        // Effekseer mode: redraw background canvas
        if (this._previewBgCanvas) {
            const bgCtx = this._previewBgCanvas.getContext('2d');
            if (bgCtx) {
                this._drawPreviewBackground(bgCtx, this._previewBgCanvas);
            }
        }
    }

    populateTimingsList(animation) {
        const timingsList = document.getElementById('timings-list');
        if (!timingsList) return;

        const tt = text => window.I18n ? window.I18n.tText(text) : text;

        // Initialize per-session selection / clipboard state (reset by showAnimationDetail).
        if (!this._selectedTimingIndices) this._selectedTimingIndices = new Set();
        if (this._timingClipboard === undefined) this._timingClipboard = null;

        // Make the container focusable so its keydown handler can intercept
        // Delete / Ctrl+C/X/V without the database sidebar grabbing them.
        timingsList.tabIndex = -1;
        timingsList.style.outline = 'none';

        // Determine animation type
        const isSpriteAnimation = DatabaseAnimationEditor.isSpriteAnimation(animation);
        const isEffekseer = !isSpriteAnimation && animation.effectName !== undefined;

        // Collect all timings
        let timingsData = [];

        if (isSpriteAnimation && animation.timings && animation.timings.length > 0) {
            // Sprite-based animation (MV format): timings array with combined SE and flash
            timingsData = animation.timings.map(timing => ({
                frame: timing.frame,
                se: timing.se,
                flashScope: timing.flashScope,
                flashColor: timing.flashColor,
                flashDuration: timing.flashDuration
            }));
        } else if (isEffekseer) {
            // Effekseer animation (MZ format): separate soundTimings and flashTimings
            // Merge soundTimings and flashTimings by frame
            const timingsMap = new Map();

            // Add sound timings
            if (animation.soundTimings && animation.soundTimings.length > 0) {
                animation.soundTimings.forEach(st => {
                    if (!timingsMap.has(st.frame)) {
                        timingsMap.set(st.frame, { frame: st.frame });
                    }
                    timingsMap.get(st.frame).se = st.se;
                });
            }

            // Add flash timings
            if (animation.flashTimings && animation.flashTimings.length > 0) {
                animation.flashTimings.forEach(ft => {
                    if (!timingsMap.has(ft.frame)) {
                        timingsMap.set(ft.frame, { frame: ft.frame });
                    }
                    timingsMap.get(ft.frame).flashColor = ft.color;
                    timingsMap.get(ft.frame).flashDuration = ft.duration;
                    timingsMap.get(ft.frame).flashScope = 1;
                });
            }

            // Convert map to array and sort by frame
            timingsData = Array.from(timingsMap.values()).sort((a, b) => a.frame - b.frame);
        }

        // Clear list
        timingsList.innerHTML = '';

        if (timingsData.length === 0) {
            timingsList.innerHTML = `<div style="font-size: 10px; color: var(--color-text-muted); padding: 8px;">${tt('No timings added')}</div>`;
            return;
        }

        // Populate list with timing entries
        timingsData.forEach((timing, index) => {
            const flashTypeNames = [tt('None'), tt('Target'), tt('Screen'), tt('Hide Target')];
            const flashScope = timing.flashScope !== undefined ? timing.flashScope : (timing.flashColor ? 1 : 0);
            const flashTypeName = flashTypeNames[flashScope] || tt('None');
            const seName = timing.se?.name || '';
            const flashColor = timing.flashColor || [0, 0, 0, 0];
            const [r, g, b, a] = flashColor;

            const isSelected = this._selectedTimingIndices.has(index);
            const timingEntry = document.createElement('div');
            timingEntry.className = 'anim-timing-entry';
            timingEntry.dataset.timingIndex = index;
            timingEntry.style.cssText = `
                background: ${isSelected ? 'var(--color-accent-tint-25)' : 'var(--color-bg-input)'};
                border: 1px solid ${isSelected ? 'var(--color-accent-border-strong)' : 'var(--color-border-input)'};
                border-radius: 2px;
                padding: 6px 8px;
                margin-bottom: 4px;
                font-size: 10px;
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                align-items: center;
                gap: 5px 8px;
                cursor: pointer;
                user-select: none;
            `;
            timingEntry.addEventListener('click', (e) => {
                // Don't grab clicks on Edit/Remove buttons -- they handle their own action
                if (e.target.tagName === 'BUTTON') return;
                timingsList.focus();
                if (e.shiftKey && this._selectedTimingIndices.size > 0) {
                    const anchor = Math.min(...this._selectedTimingIndices);
                    const lo = Math.min(anchor, index);
                    const hi = Math.max(anchor, index);
                    this._selectedTimingIndices.clear();
                    for (let i = lo; i <= hi; i++) this._selectedTimingIndices.add(i);
                } else if (e.ctrlKey || e.metaKey) {
                    if (this._selectedTimingIndices.has(index)) this._selectedTimingIndices.delete(index);
                    else this._selectedTimingIndices.add(index);
                } else {
                    this._selectedTimingIndices.clear();
                    this._selectedTimingIndices.add(index);
                }
                this.populateTimingsList(animation);
            });

            // Format SE info compactly
            const seInfo = seName && timing.se?.volume !== undefined
                ? `${seName} (${tt('Vol:')}${timing.se.volume} ${tt('Pitch:')}${timing.se.pitch})`
                : (seName || tt('None'));

            // When selected, the entry has a gold-tinted background. All text
            // bumps to bright white for max contrast (gold-on-gold is invisible).
            const frameLabelColor = isSelected ? 'var(--color-text-strong)' : 'var(--color-accent-bright)';
            const textColor = isSelected ? 'var(--color-text-strong)' : 'var(--color-text)';
            const mutedColor = isSelected ? 'var(--color-text-strong)' : 'var(--color-text-muted)';
            timingEntry.innerHTML = `
                <div style="font-weight:600;color:${frameLabelColor};font-size:12px;">${tt('Frame')} ${timing.frame}</div>
                <div style="grid-column:1 / -1;color:${textColor};font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><strong>${tt('SE:')}</strong> ${rrEscapeHtml(seInfo)}</div>
                <div style="grid-column:1 / -1;display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11px;">
                    <span style="color: ${textColor};"><strong>${tt('Flash:')}</strong> ${flashTypeName}</span>
                    ${flashScope !== 0 ? `
                        <div style="width: 24px; height: 14px; border: 1px solid var(--color-border-input); background: rgb(${r}, ${g}, ${b}); border-radius: 2px;" title="RGB(${r}, ${g}, ${b}) A:${a}"></div>
                        <span style="color: ${mutedColor};">${tt('Dur:')}${timing.flashDuration || 0}</span>
                    ` : ''}
                </div>
                <div style="grid-column:2;grid-row:1;display:flex;gap:4px;">
                    <button class="edit-timing-btn rr-btn-chip" data-index="${index}">${tt('Edit')}</button>
                    <button class="remove-timing-btn rr-btn-chip-danger" data-index="${index}">${tt('Remove')}</button>
                </div>
            `;

            timingsList.appendChild(timingEntry);
        });

        // Add event listeners for remove buttons
        timingsList.querySelectorAll('.remove-timing-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.dataset.index);
                this.removeTiming(animation, index);
                this.populateTimingsList(animation);
                this._refreshStaticAnimationPreview(animation);
            });
        });

        // Add event listeners for edit buttons
        timingsList.querySelectorAll('.edit-timing-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.dataset.index);
                this.editTiming(animation, index);
            });
        });

        // Bind the timings-list keyboard handler ONCE per element. Subsequent
        // populateTimingsList calls re-render entries but the container itself
        // persists and the handler stays attached. Flag prevents duplicate binds.
        if (!timingsList._keyboardBound) {
            timingsList._keyboardBound = true;
            timingsList.addEventListener('keydown', (e) => {
                const tag = e.target.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA') return;
                const isCtrl = e.ctrlKey || e.metaKey;
                const persist = () => {
                    if (this.databaseManager && this.databaseManager.updateAnimation) {
                        this.databaseManager.updateAnimation(animation.id, animation);
                    }
                };
                const currentData = () => this._collectMergedTimings(animation);

                if (e.key === 'Delete' && this._selectedTimingIndices.size > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    // Remove in descending order so indices stay valid as the
                    // underlying timings array shrinks.
                    const indicesDesc = Array.from(this._selectedTimingIndices).sort((a, b) => b - a);
                    indicesDesc.forEach(i => this.removeTiming(animation, i));
                    this._selectedTimingIndices.clear();
                    persist();
                    this.populateTimingsList(animation);
                    this._refreshStaticAnimationPreview(animation);
                } else if (isCtrl && e.key.toLowerCase() === 'c' && this._selectedTimingIndices.size > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    const data = currentData();
                    const indicesAsc = Array.from(this._selectedTimingIndices).sort((a, b) => a - b);
                    this._timingClipboard = indicesAsc.map(i => JSON.parse(JSON.stringify(data[i])));
                } else if (isCtrl && e.key.toLowerCase() === 'x' && this._selectedTimingIndices.size > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    const data = currentData();
                    const indicesAsc = Array.from(this._selectedTimingIndices).sort((a, b) => a - b);
                    this._timingClipboard = indicesAsc.map(i => JSON.parse(JSON.stringify(data[i])));
                    const indicesDesc = indicesAsc.slice().reverse();
                    indicesDesc.forEach(i => this.removeTiming(animation, i));
                    this._selectedTimingIndices.clear();
                    persist();
                    this.populateTimingsList(animation);
                    this._refreshStaticAnimationPreview(animation);
                } else if (isCtrl && e.key.toLowerCase() === 'v' && this._timingClipboard && this._timingClipboard.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    this._timingClipboard.forEach(t => this._appendTiming(animation, JSON.parse(JSON.stringify(t))));
                    persist();
                    this.populateTimingsList(animation);
                    this._refreshStaticAnimationPreview(animation);
                } else if (isCtrl && e.key.toLowerCase() === 'a') {
                    e.preventDefault();
                    e.stopPropagation();
                    const data = currentData();
                    this._selectedTimingIndices.clear();
                    for (let i = 0; i < data.length; i++) this._selectedTimingIndices.add(i);
                    this.populateTimingsList(animation);
                }
            });
        }
    }

    // Helper: returns the merged timings array (the same view populateTimingsList renders)
    _collectMergedTimings(animation) {
        const isSpriteAnimation = DatabaseAnimationEditor.isSpriteAnimation(animation);
        const isEffekseer = !isSpriteAnimation && animation.effectName !== undefined;
        if (isSpriteAnimation && animation.timings && animation.timings.length > 0) {
            return animation.timings.map(t => ({ ...t }));
        }
        if (isEffekseer) {
            const map = new Map();
            (animation.soundTimings || []).forEach(st => {
                if (!map.has(st.frame)) map.set(st.frame, { frame: st.frame });
                map.get(st.frame).se = st.se;
            });
            (animation.flashTimings || []).forEach(ft => {
                if (!map.has(ft.frame)) map.set(ft.frame, { frame: ft.frame });
                map.get(ft.frame).flashColor = ft.color;
                map.get(ft.frame).flashDuration = ft.duration;
                map.get(ft.frame).flashScope = ft.scope === 2 || ft.scope === 3 ? ft.scope : 1;
            });
            return Array.from(map.values()).sort((a, b) => a.frame - b.frame);
        }
        return [];
    }

    // Helper: appends a single timing in the format the current animation expects.
    // For sprite-based: pushes to animation.timings. For Effekseer: splits into
    // soundTimings + flashTimings. Used by Ctrl+V paste.
    _appendTiming(animation, timing) {
        const isEffekseer = !DatabaseAnimationEditor.isSpriteAnimation(animation);
        if (isEffekseer) {
            if (!animation.soundTimings) animation.soundTimings = [];
            if (!animation.flashTimings) animation.flashTimings = [];
            if (timing.se) {
                animation.soundTimings.push({ frame: timing.frame, se: timing.se });
            }
            if (timing.flashColor) {
                const entry = { frame: timing.frame, color: timing.flashColor, duration: timing.flashDuration || 0 };
                // Target is the stock meaning; Screen and Hide Target ride
                // along as a scope the runtime honours.
                if (timing.flashScope === 2 || timing.flashScope === 3) entry.scope = timing.flashScope;
                animation.flashTimings.push(entry);
            }
        } else {
            if (!animation.timings) animation.timings = [];
            animation.timings.push({
                frame: timing.frame,
                se: timing.se,
                flashScope: timing.flashScope || 0,
                flashColor: timing.flashColor || [0, 0, 0, 0],
                flashDuration: timing.flashDuration || 0
            });
        }
    }

    editTiming(animation, index) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        // Get the timing data
        const isSpriteAnimation = DatabaseAnimationEditor.isSpriteAnimation(animation);
        const isEffekseer = !isSpriteAnimation && animation.effectName !== undefined;

        let timingData;
        let timingsData = [];

        if (isSpriteAnimation && animation.timings && animation.timings.length > 0) {
            timingsData = animation.timings;
        } else if (isEffekseer) {
            // Merge soundTimings and flashTimings
            const timingsMap = new Map();

            if (animation.soundTimings && animation.soundTimings.length > 0) {
                animation.soundTimings.forEach(st => {
                    if (!timingsMap.has(st.frame)) {
                        timingsMap.set(st.frame, { frame: st.frame });
                    }
                    timingsMap.get(st.frame).se = st.se;
                });
            }

            if (animation.flashTimings && animation.flashTimings.length > 0) {
                animation.flashTimings.forEach(ft => {
                    if (!timingsMap.has(ft.frame)) {
                        timingsMap.set(ft.frame, { frame: ft.frame });
                    }
                    timingsMap.get(ft.frame).flashColor = ft.color;
                    timingsMap.get(ft.frame).flashDuration = ft.duration;
                    timingsMap.get(ft.frame).flashScope = 1;
                });
            }

            timingsData = Array.from(timingsMap.values()).sort((a, b) => a.frame - b.frame);
        }

        if (index >= timingsData.length) return;
        timingData = timingsData[index];

        // Open modal and populate with existing data
        const modal = document.getElementById('timing-modal');
        const frameInput = document.getElementById('timing-frame');
        const seNameInput = document.getElementById('timing-se-name');
        const redSlider = document.getElementById('timing-red');
        const greenSlider = document.getElementById('timing-green');
        const blueSlider = document.getElementById('timing-blue');
        const intensitySlider = document.getElementById('timing-intensity');
        const durationInput = document.getElementById('timing-duration');
        const saveBtn = document.getElementById('timing-modal-save');

        // Populate fields
        frameInput.value = timingData.frame || 0;
        seNameInput.value = timingData.se?.name || tt('None');

        // Populate SE volume, pitch, and pan
        const seVolumeSlider = document.getElementById('timing-se-volume');
        const seVolumeValue = document.getElementById('timing-se-volume-value');
        const sePitchSlider = document.getElementById('timing-se-pitch');
        const sePitchValue = document.getElementById('timing-se-pitch-value');
        const sePanSlider = document.getElementById('timing-se-pan');
        const sePanValue = document.getElementById('timing-se-pan-value');
        const seVol = timingData.se?.volume !== undefined ? timingData.se.volume : 90;
        const sePit = timingData.se?.pitch !== undefined ? timingData.se.pitch : 100;
        const sePan = timingData.se?.pan !== undefined ? timingData.se.pan : 0;
        if (seVolumeSlider) { seVolumeSlider.value = seVol; seVolumeValue.textContent = seVol; }
        if (sePitchSlider) { sePitchSlider.value = sePit; sePitchValue.textContent = sePit; }
        if (sePanSlider) { sePanSlider.value = sePan; sePanValue.textContent = sePan; }

        const flashColor = timingData.flashColor || [0, 0, 0, 0];
        redSlider.value = flashColor[0] || 0;
        greenSlider.value = flashColor[1] || 0;
        blueSlider.value = flashColor[2] || 0;
        intensitySlider.value = flashColor[3] || 0;

        durationInput.value = timingData.flashDuration || 8;

        // Set flash type
        const flashScope = timingData.flashScope !== undefined ? timingData.flashScope : 0;
        const flashTypeRadio = document.querySelector(`input[name="flash-type"][value="${flashScope}"]`);
        if (flashTypeRadio) flashTypeRadio.checked = true;

        // Update color preview
        const colorPreview = document.getElementById('timing-color-preview');
        colorPreview.style.background = `rgb(${flashColor[0]}, ${flashColor[1]}, ${flashColor[2]})`;
        document.getElementById('timing-red-value').textContent = flashColor[0];
        document.getElementById('timing-green-value').textContent = flashColor[1];
        document.getElementById('timing-blue-value').textContent = flashColor[2];
        document.getElementById('timing-intensity-value').textContent = flashColor[3];

        // Change button text to "Update Timing"
        saveBtn.textContent = tt('Update Timing');

        // Store edit mode flag
        saveBtn.dataset.editMode = 'true';
        saveBtn.dataset.editIndex = index;

        // Show modal
        modal.style.display = 'flex';
    }

    removeTiming(animation, index) {
        const isEffekseer = !DatabaseAnimationEditor.isSpriteAnimation(animation);

        if (isEffekseer) {
            // For Effekseer, rebuild the timings map to find which frame to remove
            const timingsMap = new Map();

            // Add sound timings
            if (animation.soundTimings && animation.soundTimings.length > 0) {
                animation.soundTimings.forEach(st => {
                    if (!timingsMap.has(st.frame)) {
                        timingsMap.set(st.frame, { frame: st.frame });
                    }
                    timingsMap.get(st.frame).se = st.se;
                });
            }

            // Add flash timings
            if (animation.flashTimings && animation.flashTimings.length > 0) {
                animation.flashTimings.forEach(ft => {
                    if (!timingsMap.has(ft.frame)) {
                        timingsMap.set(ft.frame, { frame: ft.frame });
                    }
                    timingsMap.get(ft.frame).flashColor = ft.color;
                });
            }

            // Convert to sorted array and get the frame at the given index
            const timingsArray = Array.from(timingsMap.values()).sort((a, b) => a.frame - b.frame);
            if (index >= timingsArray.length) return;

            const frameToRemove = timingsArray[index].frame;

            // Remove from soundTimings if exists
            if (animation.soundTimings) {
                animation.soundTimings = animation.soundTimings.filter(st => st.frame !== frameToRemove);
            }

            // Remove from flashTimings if exists
            if (animation.flashTimings) {
                animation.flashTimings = animation.flashTimings.filter(ft => ft.frame !== frameToRemove);
            }

            console.debug('Removed timing at frame', frameToRemove);
        } else {
            // For sprite-based, remove from timings array
            if (animation.timings && index < animation.timings.length) {
                animation.timings.splice(index, 1);
            }

            console.debug('Removed timing at index', index);
        }
    }

    setupTimingModal(animation, container) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const noneLabel = tt('None');
        const isSpriteAnimation = DatabaseAnimationEditor.isSpriteAnimation(animation);
        // Create modal HTML
        const modalHTML = `
            <div id="timing-modal" class="rr-modal-overlay" style="display: none;">
                <div class="rr-modal" style="width: 600px; max-width: 94vw;">
                    <div class="rr-modal-header">
                        <div class="rr-modal-title">${tt('SE and Flash Timing')}</div>
                        <button id="timing-modal-close" class="rr-modal-close">&times;</button>
                    </div>
                    <div class="rr-modal-body">

                    <!-- Frame and SE Section -->
                    <div style="display: flex; gap: 16px; margin-bottom: 20px;">
                        <div style="flex: 0 0 100px;">
                            <div style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 6px;">${tt('Frame:')}</div>
                            <input type="number" id="timing-frame" min="0" value="0" style="width: 100%; padding: 8px; background: var(--color-bg-input-alt); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; font-size: 12px;">
                        </div>
                        <div style="flex: 1;">
                            <div style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 6px;">${tt('SE:')}</div>
                            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                                <input type="text" id="timing-se-name" readonly value="${tt('None')}" style="flex: 1; padding: 8px; background: var(--color-bg-input-alt); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; font-size: 12px;">
                                <button id="timing-se-pick" class="rr-btn-secondary" style="display: inline-flex; align-items: center; gap: 6px; font-size: 11px;">
                                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                        <path d="M2 6h3l4-3.5v11L5 10H2z" fill="currentColor"/>
                                        <path d="M11 5.5a3.4 3.4 0 0 1 0 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                                        <path d="M13 3.5a6.2 6.2 0 0 1 0 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                                    </svg>${tt('Pick SE')}</button>
                                <button id="timing-se-clear" style="padding: 8px 12px; background: var(--color-bg-button); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; cursor: pointer; font-size: 11px;">${tt('Clear')}</button>
                            </div>
                            <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) auto; gap: 12px; align-items: center;">
                                <div style="display: flex; align-items: center; gap: 6px; flex: 1;">
                                    <span style="font-size: 11px; color: var(--color-text-muted); white-space: nowrap;">${tt('Vol:')}</span>
                                    <input type="range" id="timing-se-volume" min="0" max="100" value="90" style="flex: 1;">
                                    <span id="timing-se-volume-value" style="font-size: 11px; color: var(--color-text); min-width: 28px; text-align: right;">90</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 6px; flex: 1;">
                                    <span style="font-size: 11px; color: var(--color-text-muted); white-space: nowrap;">${tt('Pitch:')}</span>
                                    <input type="range" id="timing-se-pitch" min="50" max="150" value="100" style="flex: 1;">
                                    <span id="timing-se-pitch-value" style="font-size: 11px; color: var(--color-text); min-width: 28px; text-align: right;">100</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 6px; flex: 1;">
                                    <span style="font-size: 11px; color: var(--color-text-muted); white-space: nowrap;">${tt('Pan:')}</span>
                                    <input type="range" id="timing-se-pan" min="-100" max="100" value="0" style="flex: 1;">
                                    <span id="timing-se-pan-value" style="font-size: 11px; color: var(--color-text); min-width: 28px; text-align: right;">0</span>
                                </div>
                                <button id="timing-se-preview" style="padding: 4px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; cursor: pointer; font-size: 11px;">&#9654; ${tt('Preview')}</button>
                            </div>
                        </div>
                    </div>

                    <!-- Flash Section -->
                    <div style="background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 3px; padding: 16px;">
                        <div style="font-size: 13px; font-weight: 600; color: var(--color-text); margin-bottom: 12px;">${tt('Flash')}</div>

                        <!-- Flash Type Radio Buttons -->
                        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px;">
                            <label style="display: flex; align-items: center; gap: 6px; color: var(--color-text); font-size: 11px; cursor: pointer;">
                                <input type="radio" name="flash-type" value="0" checked style="cursor: pointer;"> ${tt('None')}
                            </label>
                            <label style="display: flex; align-items: center; gap: 6px; color: var(--color-text); font-size: 11px; cursor: pointer;">
                                <input type="radio" name="flash-type" value="1" style="cursor: pointer;"> ${tt('Target')}
                            </label>
                            <label style="display: flex; align-items: center; gap: 6px; color: var(--color-text); font-size: 11px; cursor: pointer;">
                                <input type="radio" name="flash-type" value="2" style="cursor: pointer;"> ${tt('Screen')}
                            </label>
                            <label style="display: flex; align-items: center; gap: 6px; color: var(--color-text); font-size: 11px; cursor: pointer;">
                                <input type="radio" name="flash-type" value="3" style="cursor: pointer;"> ${tt('Hide Target')}
                            </label>
                        </div>

                        <!-- Color Sliders -->
                        <div style="display: flex; flex-direction: column; gap: 12px;">
                            ${['Red', 'Green', 'Blue', 'Intensity'].map(color => `
                                <div>
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                        <span style="font-size: 11px; color: var(--color-text-muted);">${tt(color)}:</span>
                                        <span id="timing-${color.toLowerCase()}-value" style="font-size: 11px; color: var(--color-text);">0</span>
                                    </div>
                                    <input type="range" id="timing-${color.toLowerCase()}" min="0" max="255" value="0" style="width: 100%;">
                                </div>
                            `).join('')}
                        </div>

                        <!-- Color Preview -->
                        <div style="margin-top: 12px;">
                            <div style="font-size: 11px; color: var(--color-text-muted); margin-bottom: 6px;">${tt('Preview:')}</div>
                            <div id="timing-color-preview" style="width: 100%; height: 40px; border: 1px solid var(--color-border-input); border-radius: 3px; background: rgb(0,0,0);"></div>
                        </div>

                        <!-- Duration -->
                        <div style="margin-top: 12px;">
                            <div style="font-size: 11px; color: var(--color-text-muted); margin-bottom: 6px;">${tt('Duration:')}</div>
                            <div class="rr-number-stepper">
                                <input type="number" id="timing-duration" class="rr-number-stepper-input" min="1" value="8">
                                <div class="rr-number-stepper-buttons">
                                    <button type="button" data-timing-duration-step="1" aria-label="+1">&#9650;</button>
                                    <button type="button" data-timing-duration-step="-1" aria-label="-1">&#9660;</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    </div>
                    <div class="rr-modal-footer">
                        <button id="timing-modal-cancel" class="rr-btn-secondary">${tt('Cancel')}</button>
                        <button id="timing-modal-save" class="rr-button-primary">${tt('Add Timing')}</button>
                    </div>
                </div>
            </div>
        `;

        // Add modal to container
        container.insertAdjacentHTML('beforeend', modalHTML);

        const modal = document.getElementById('timing-modal');
        const addBtn = document.getElementById('add-timing-btn');
        const closeBtn = document.getElementById('timing-modal-close');
        const cancelBtn = document.getElementById('timing-modal-cancel');
        const saveBtn = document.getElementById('timing-modal-save');

        // Color sliders
        const redSlider = document.getElementById('timing-red');
        const greenSlider = document.getElementById('timing-green');
        const blueSlider = document.getElementById('timing-blue');
        const intensitySlider = document.getElementById('timing-intensity');
        const colorPreview = document.getElementById('timing-color-preview');

        const updateColorPreview = () => {
            const r = redSlider.value;
            const g = greenSlider.value;
            const b = blueSlider.value;
            colorPreview.style.background = `rgb(${r}, ${g}, ${b})`;

            document.getElementById('timing-red-value').textContent = r;
            document.getElementById('timing-green-value').textContent = g;
            document.getElementById('timing-blue-value').textContent = b;
            document.getElementById('timing-intensity-value').textContent = intensitySlider.value;
        };

        redSlider?.addEventListener('input', updateColorPreview);
        greenSlider?.addEventListener('input', updateColorPreview);
        blueSlider?.addEventListener('input', updateColorPreview);
        intensitySlider?.addEventListener('input', updateColorPreview);
        container.querySelectorAll('[data-timing-duration-step]').forEach(button => {
            button.addEventListener('click', () => {
                const duration = document.getElementById('timing-duration');
                const step = Number(button.dataset.timingDurationStep);
                const current = DatabaseAnimationEditor.readNumericInput('timing-duration', 1);
                duration.value = Math.max(1, current + step);
                duration.dispatchEvent(new Event('input', { bubbles: true }));
            });
        });

        // Open modal
        addBtn?.addEventListener('click', () => {
            // Reset to add mode
            saveBtn.textContent = tt('Add Timing');
            saveBtn.dataset.editMode = 'false';
            delete saveBtn.dataset.editIndex;

            // Reset form fields
            document.getElementById('timing-frame').value = 0;
            document.getElementById('timing-se-name').value = noneLabel;
            document.getElementById('timing-se-volume').value = 90;
            document.getElementById('timing-se-volume-value').textContent = '90';
            document.getElementById('timing-se-pitch').value = 100;
            document.getElementById('timing-se-pitch-value').textContent = '100';
            document.getElementById('timing-se-pan').value = 0;
            document.getElementById('timing-se-pan-value').textContent = '0';
            redSlider.value = 0;
            greenSlider.value = 0;
            blueSlider.value = 0;
            intensitySlider.value = 0;
            document.getElementById('timing-duration').value = 8;

            // Reset flash type to None
            const noneRadio = document.querySelector('input[name="flash-type"][value="0"]');
            if (noneRadio) noneRadio.checked = true;

            // Update color preview
            colorPreview.style.background = 'rgb(0, 0, 0)';
            document.getElementById('timing-red-value').textContent = '0';
            document.getElementById('timing-green-value').textContent = '0';
            document.getElementById('timing-blue-value').textContent = '0';
            document.getElementById('timing-intensity-value').textContent = '0';

            modal.style.display = 'flex';
        });

        // Close modal
        const closeModal = () => {
            modal.style.display = 'none';
        };

        closeBtn?.addEventListener('click', closeModal);
        cancelBtn?.addEventListener('click', closeModal);
        cancelBtn?.addEventListener('mouseenter', () => { cancelBtn.style.backgroundColor = 'var(--color-accent-tint-25)'; cancelBtn.style.borderColor = 'var(--color-accent)'; });
        cancelBtn?.addEventListener('mouseleave', () => { cancelBtn.style.backgroundColor = 'var(--color-bg-button)'; cancelBtn.style.borderColor = 'var(--color-border-input)'; });
        saveBtn?.addEventListener('mouseenter', () => { saveBtn.style.backgroundColor = 'var(--color-accent-muted)'; });
        saveBtn?.addEventListener('mouseleave', () => { saveBtn.style.backgroundColor = 'var(--color-accent)'; });

        // Save timing functionality
        saveBtn?.addEventListener('click', () => {
            const frame = parseInt(document.getElementById('timing-frame').value) || 0;
            const seName = document.getElementById('timing-se-name').value;
            const seVolume = DatabaseAnimationEditor.readNumericInput('timing-se-volume', 90);
            const sePitch = parseInt(document.getElementById('timing-se-pitch').value) || 100;
            const sePan = DatabaseAnimationEditor.readNumericInput('timing-se-pan', 0);
            const flashType = parseInt(document.querySelector('input[name="flash-type"]:checked').value);
            const red = parseInt(redSlider.value);
            const green = parseInt(greenSlider.value);
            const blue = parseInt(blueSlider.value);
            const intensity = parseInt(intensitySlider.value);
            const duration = parseInt(document.getElementById('timing-duration').value) || 8;

            // Check if we're in edit mode
            const isEditMode = saveBtn.dataset.editMode === 'true';
            const editIndex = parseInt(saveBtn.dataset.editIndex);

            // Determine animation type
            const isEffekseer = !DatabaseAnimationEditor.isSpriteAnimation(animation);

            if (isEditMode) {
                // Remove the old timing first
                this.removeTiming(animation, editIndex);
            }

            if (isEffekseer) {
                // Effekseer format: separate soundTimings and flashTimings

                // Add sound timing if SE is selected
                if (seName && seName !== noneLabel) {
                    if (!animation.soundTimings) animation.soundTimings = [];

                    // Check if there's already a sound timing at this frame
                    const existingIndex = animation.soundTimings.findIndex(st => st.frame === frame);
                    const seData = {
                        frame: frame,
                        se: {
                            name: seName,
                            pan: sePan,
                            pitch: sePitch,
                            volume: seVolume
                        }
                    };

                    if (existingIndex >= 0) {
                        animation.soundTimings[existingIndex] = seData;
                    } else {
                        animation.soundTimings.push(seData);
                    }
                }

                // Add flash timing if flash type is not None
                if (flashType !== 0) {
                    if (!animation.flashTimings) animation.flashTimings = [];

                    // Check if there's already a flash timing at this frame
                    const existingIndex = animation.flashTimings.findIndex(ft => ft.frame === frame);
                    const flashData = {
                        frame: frame,
                        duration: duration,
                        color: [red, green, blue, intensity]
                    };

                    if (existingIndex >= 0) {
                        animation.flashTimings[existingIndex] = flashData;
                    } else {
                        animation.flashTimings.push(flashData);
                    }
                }
            } else {
                // Sprite-based format: combined timings array
                if (!animation.timings) animation.timings = [];

                // Check if there's already a timing at this frame
                const existingIndex = animation.timings.findIndex(t => t.frame === frame);
                const timingData = {
                    frame: frame,
                    se: seName && seName !== noneLabel ? {
                        name: seName,
                        pan: sePan,
                        pitch: sePitch,
                        volume: seVolume
                    } : { name: '', pan: 0, pitch: 100, volume: 90 },
                    flashScope: flashType,
                    flashColor: [red, green, blue, intensity],
                    flashDuration: duration
                };

                if (existingIndex >= 0) {
                    animation.timings[existingIndex] = timingData;
                } else {
                    animation.timings.push(timingData);
                }
            }

            // Refresh the timings list
            this.databaseManager?.updateAnimation?.(animation.id, animation);
            this.populateTimingsList(animation);
            this._refreshStaticAnimationPreview(animation);

            console.debug(isEditMode ? 'Updated timing:' : 'Added timing:', { frame, seName, flashType, color: [red, green, blue, intensity], duration });
            closeModal();
        });

        // SE volume/pitch/pan slider labels
        const seVolumeSlider = document.getElementById('timing-se-volume');
        const seVolumeValue = document.getElementById('timing-se-volume-value');
        const sePitchSlider = document.getElementById('timing-se-pitch');
        const sePitchValue = document.getElementById('timing-se-pitch-value');
        const sePanSlider = document.getElementById('timing-se-pan');
        const sePanValue = document.getElementById('timing-se-pan-value');

        seVolumeSlider?.addEventListener('input', () => { seVolumeValue.textContent = seVolumeSlider.value; });
        sePitchSlider?.addEventListener('input', () => { sePitchValue.textContent = sePitchSlider.value; });
        sePanSlider?.addEventListener('input', () => { sePanValue.textContent = sePanSlider.value; });

        // SE preview button
        const sePreviewBtn = document.getElementById('timing-se-preview');
        let previewAudio = null;
        sePreviewBtn?.addEventListener('click', () => {
            const seName = document.getElementById('timing-se-name').value;
            if (!seName || seName === noneLabel) return;

            const currentProject = this.projectManager.getCurrentProject();
            if (!currentProject) return;

            // Stop any existing preview
            if (previewAudio) { previewAudio.pause(); previewAudio = null; }

            const path = require('path');
            const seFolder = path.join(currentProject.path, 'audio', 'se');
            const audioFile = RRAssetFiles.find(seFolder, seName, RRAssetFiles.AUDIO_EXTENSIONS);
            if (!audioFile) return;
            previewAudio = new Audio(RRAssetFiles.toUrl(audioFile.absolutePath));
            // The volume slider is min="0" and 0 is a real setting, so a truthy
            // default would preview a silent timing at almost full volume. The
            // pitch slider is min="50", so it cannot reach a falsy value.
            previewAudio.volume = DatabaseAnimationEditor.readNumericInput('timing-se-volume', 90) / 100;
            previewAudio.playbackRate = (parseInt(sePitchSlider.value, 10) || 100) / 100;
            previewAudio.play().catch(err => console.warn('Failed to play SE preview:', err));
        });

        // SE clear button
        const seClearBtn = document.getElementById('timing-se-clear');
        seClearBtn?.addEventListener('click', () => {
            document.getElementById('timing-se-name').value = noneLabel;
            seVolumeSlider.value = 90;
            seVolumeValue.textContent = '90';
            sePitchSlider.value = 100;
            sePitchValue.textContent = '100';
            sePanSlider.value = 0;
            sePanValue.textContent = '0';
        });

        // SE pick button - show file picker
        const sePickBtn = document.getElementById('timing-se-pick');
        sePickBtn?.addEventListener('click', () => {
            const currentProject = this.projectManager.getCurrentProject();
            if (!currentProject) { alert(tt('No project loaded')); return; }

            const fs = require('fs');
            const path = require('path');
            const seFolder = path.join(currentProject.path, 'audio', 'se');

            if (!fs.existsSync(seFolder)) { alert(tt('SE folder not found: audio/se')); return; }

            const files = RRAssetFiles.listUnique(seFolder, RRAssetFiles.AUDIO_EXTENSIONS);
            const seNameInput = document.getElementById('timing-se-name');
            RRAudioPickerModal.open({
                title: 'Select Sound Effect',
                folderLabel: 'SE',
                files,
                selected: seNameInput.value !== noneLabel ? seNameInput.value : '',
                levels: {
                    volume: DatabaseAnimationEditor.readNumericInput('timing-se-volume', 90),
                    pitch: DatabaseAnimationEditor.readNumericInput('timing-se-pitch', 100),
                    pan: DatabaseAnimationEditor.readNumericInput('timing-se-pan', 0)
                },
                loopDefault: false,
                zIndex: 10600,
                onOk: result => {
                    seNameInput.value = result.name || noneLabel;
                    seVolumeSlider.value = result.volume;
                    seVolumeValue.textContent = result.volume;
                    sePitchSlider.value = result.pitch;
                    sePitchValue.textContent = result.pitch;
                    sePanSlider.value = result.pan;
                    sePanValue.textContent = result.pan;
                }
            });
        });
    }

    showCellPropertiesModal(animation, frameIndex, cellIndex, renderFrame) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const frameData = animation.frames[frameIndex];
        if (!frameData || cellIndex >= frameData.length) return;

        const cell = frameData[cellIndex];
        const [pattern, x, y, scale, rotation, mirror, opacity, blendMode] = cell;

        // Remove existing modal if any
        const existingModal = document.getElementById('cell-properties-modal');
        if (existingModal) existingModal.remove();

        // Blend mode names
        const blendModes = ['Normal', 'Additive', 'Multiply', 'Screen'];

        const inputBase = 'width:100%; padding:8px; background:var(--color-bg-input); border:1px solid var(--color-border-input); color:#e8e8e8; border-radius:3px; font-size:12px; box-sizing:border-box; outline:none;';
        const inputFocus = `onfocus="this.style.borderColor='rgba(255,215,0,0.7)'" onblur="this.style.borderColor='var(--color-border-input)'"`;
        const labelStyle = 'font-size:11px; color:var(--color-text-muted); margin-bottom:5px; text-transform:uppercase; letter-spacing:0.5px;';
        const fieldRow = (label, html) => `<div><div style="${labelStyle}">${label}</div>${html}</div>`;

        const modalHTML = `
            <div id="cell-properties-modal" style="display:flex; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.75); z-index:10000; align-items:center; justify-content:center;">
                <div style="background:var(--color-bg-base); border:1px solid rgba(255,215,0,0.4); border-radius:6px; width:440px; max-height:88vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.7);">
                    <!-- Black header -->
                    <div style="background:var(--color-bg-deep); padding:12px 16px; border-bottom:1px solid var(--color-border); border-radius:6px 6px 0 0; display:flex; justify-content:space-between; align-items:center;">
                        <div style="font-size:14px; font-weight:600; color:var(--color-text-strong); letter-spacing:0.5px;">${tt('Cell Properties')}</div>
                        <button id="cell-modal-close" style="background:none; border:none; color:var(--color-text-muted); font-size:22px; cursor:pointer; padding:0; line-height:1; transition:color 0.15s;" onmouseover="this.style.color='var(--color-accent-bright)'" onmouseout="this.style.color='var(--color-text-muted)'">×</button>
                    </div>

                    <!-- Body -->
                    <div style="padding:18px 20px; overflow-y:auto; display:flex; flex-direction:column; gap:14px;">
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            ${fieldRow(tt('Tileset Frame'), `<input type="number" id="cell-pattern" value="${pattern}" min="-1" max="199" style="${inputBase}" ${inputFocus}>`)}
                            ${fieldRow(tt('Scale (%)'), `<input type="number" id="cell-scale" value="${scale}" min="1" max="1000" style="${inputBase}" ${inputFocus}>`)}
                            ${fieldRow('X', `<input type="number" id="cell-x" value="${x}" style="${inputBase}" ${inputFocus}>`)}
                            ${fieldRow('Y', `<input type="number" id="cell-y" value="${y}" style="${inputBase}" ${inputFocus}>`)}
                            ${fieldRow(tt('Rotation (°)'), `<input type="number" id="cell-rotation" value="${rotation}" min="-360" max="360" style="${inputBase}" ${inputFocus}>`)}
                            ${fieldRow(tt('Opacity (0-255)'), `<input type="number" id="cell-opacity" value="${opacity}" min="0" max="255" style="${inputBase}" ${inputFocus}>`)}
                        </div>
                        ${fieldRow(tt('Mirror'), `
                            <div style="display:flex; gap:18px;">
                                <label style="display:flex; align-items:center; gap:6px; color:var(--color-text); cursor:pointer; font-size:12px;">
                                    <input type="radio" name="cell-mirror" value="0" ${mirror === 0 ? 'checked' : ''} style="accent-color:var(--color-accent-bright); cursor:pointer;"> ${tt('No')}
                                </label>
                                <label style="display:flex; align-items:center; gap:6px; color:var(--color-text); cursor:pointer; font-size:12px;">
                                    <input type="radio" name="cell-mirror" value="1" ${mirror === 1 ? 'checked' : ''} style="accent-color:var(--color-accent-bright); cursor:pointer;"> ${tt('Yes')}
                                </label>
                            </div>
                        `)}
                        ${fieldRow(tt('Blend Mode'), `
                            <select id="cell-blend" style="${inputBase}; cursor:pointer;">
                                ${blendModes.map((mode, index) => `<option value="${index}" ${blendMode === index ? 'selected' : ''} style="background:var(--color-bg-base);color:var(--color-text);">${tt(mode)}</option>`).join('')}
                            </select>
                        `)}
                    </div>

                    <!-- Black footer -->
                    <div style="background:var(--color-bg-deep); padding:12px 16px; border-top:1px solid var(--color-border); border-radius:0 0 6px 6px; display:flex; gap:10px; justify-content:flex-end;">
                        <button id="cell-modal-cancel" class="rr-btn-secondary">${tt('Cancel')}</button>
                        <button id="cell-modal-save" style="padding:7px 18px; background:var(--color-accent); border:1px solid var(--color-accent); color:var(--color-bg-deep); border-radius:3px; cursor:pointer; font-size:12px; font-weight:bold;">${tt('Save')}</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const modal = document.getElementById('cell-properties-modal');
        const closeBtn = document.getElementById('cell-modal-close');
        const cancelBtn = document.getElementById('cell-modal-cancel');
        const saveBtn = document.getElementById('cell-modal-save');

        // Close modal
        const closeModal = () => {
            modal.remove();
        };

        closeBtn?.addEventListener('click', closeModal);
        cancelBtn?.addEventListener('click', closeModal);
        cancelBtn?.addEventListener('mouseenter', () => { cancelBtn.style.backgroundColor = 'var(--color-accent-tint-25)'; cancelBtn.style.borderColor = 'var(--color-accent)'; });
        cancelBtn?.addEventListener('mouseleave', () => { cancelBtn.style.backgroundColor = 'var(--color-bg-button)'; cancelBtn.style.borderColor = 'var(--color-border-input)'; });
        saveBtn?.addEventListener('mouseenter', () => { saveBtn.style.backgroundColor = 'var(--color-accent-muted)'; });
        saveBtn?.addEventListener('mouseleave', () => { saveBtn.style.backgroundColor = 'var(--color-accent)'; });

        // Save changes
        saveBtn?.addEventListener('click', () => {
            // `|| default` would clobber legitimate zeros (invisible or
            // zero-scale cells) — only fall back when the input isn't a number.
            const intOr = (id, fallback) => {
                const parsed = parseInt(document.getElementById(id).value, 10);
                return Number.isFinite(parsed) ? parsed : fallback;
            };
            const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
            const newPattern = clamp(intOr('cell-pattern', pattern), -1, 199);
            const newX = intOr('cell-x', 0);
            const newY = intOr('cell-y', 0);
            const newScale = clamp(intOr('cell-scale', 100), 1, 1000);
            const newRotation = clamp(intOr('cell-rotation', 0), -360, 360);
            const newMirror = parseInt(document.querySelector('input[name="cell-mirror"]:checked').value);
            const newOpacity = clamp(intOr('cell-opacity', 255), 0, 255);
            const newBlend = intOr('cell-blend', 0);

            // Update cell data
            frameData[cellIndex] = [newPattern, newX, newY, newScale, newRotation, newMirror, newOpacity, newBlend];

            // Re-render frame
            renderFrame(frameIndex);

            closeModal();
        });
    }

    setupSpriteSheetPreview(animation) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const canvas = document.getElementById('sprite-sheet-preview');
        if (!canvas) return;

        const currentProject = this.projectManager.getCurrentProject();
        if (!currentProject) return;

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        const sourceCellSize = 192; // Size in sprite sheet
        const displayCellSize = 72; // Compact preview size; source cells remain 192px.
        const cols = 5;

        let spriteSheet1 = null;
        let spriteSheet2 = null;

        // Load sprite sheets
        const loadSpriteSheets = () => {
            const promises = [];

            if (animation.animation1Name) {
                const path = require('path');
                const imageRoot = path.join(currentProject.path, 'img', 'animations');
                const imgPath = RRAssetFiles.imageUrlFor(imageRoot, animation.animation1Name);
                const img1 = new Image();
                const promise1 = new Promise((resolve) => {
                    img1.onload = () => {
                        spriteSheet1 = img1;
                        resolve();
                    };
                    img1.onerror = () => {
                        console.warn(`Failed to load: ${imgPath}`);
                        resolve();
                    };
                    img1.src = imgPath;
                });
                promises.push(promise1);
            }

            if (animation.animation2Name) {
                const path = require('path');
                const imageRoot = path.join(currentProject.path, 'img', 'animations');
                const imgPath = RRAssetFiles.imageUrlFor(imageRoot, animation.animation2Name);
                const img2 = new Image();
                const promise2 = new Promise((resolve) => {
                    img2.onload = () => {
                        spriteSheet2 = img2;
                        resolve();
                    };
                    img2.onerror = () => {
                        console.warn(`Failed to load: ${imgPath}`);
                        resolve();
                    };
                    img2.src = imgPath;
                });
                promises.push(promise2);
            }

            return Promise.all(promises);
        };

        // Render sprite sheet preview
        let selectedSheetCell = -1;

        const renderSpriteSheetPreview = (highlightCell = -1) => {
            // Calculate total number of cells
            let totalCells = 0;
            let cells1 = 0;
            let cells2 = 0;

            if (spriteSheet1) {
                const rows1 = Math.ceil(spriteSheet1.height / sourceCellSize);
                cells1 = cols * rows1;
                totalCells += cells1;
            }

            if (spriteSheet2) {
                const rows2 = Math.ceil(spriteSheet2.height / sourceCellSize);
                cells2 = cols * rows2;
                totalCells += cells2;
            }

            if (totalCells === 0) {
                canvas.width = 400;
                canvas.height = displayCellSize;
                ctx.imageSmoothingEnabled = false;
                ctx.fillStyle = ThemeColors.resolve('--color-border-subtle', '#333333');
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = ThemeColors.resolve('--color-text-muted', '#999999');
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(tt('No sprite sheets found'), canvas.width / 2, canvas.height / 2);
                return;
            }

            // Set canvas size (using display size for compact view)
            canvas.width = totalCells * displayCellSize;
            canvas.height = displayCellSize;
            ctx.imageSmoothingEnabled = false;

            let currentX = 0;
            let cellIndex = 0;

            // Per-sheet hue from current animation properties (re-read so the
            // sprite sheet preview live-updates when the hue slider moves).
            const hue1 = animation.animation1Hue || 0;
            const hue2 = animation.animation2Hue || 0;

            // Draw Animation 1 cells
            if (spriteSheet1) {
                ctx.filter = hue1 ? `hue-rotate(${hue1}deg)` : 'none';
                const rows1 = Math.ceil(spriteSheet1.height / sourceCellSize);
                for (let row = 0; row < rows1; row++) {
                    for (let col = 0; col < cols; col++) {
                        const srcX = col * sourceCellSize;
                        const srcY = row * sourceCellSize;

                        ctx.drawImage(
                            spriteSheet1,
                            srcX, srcY, sourceCellSize, sourceCellSize,
                            currentX, 0, displayCellSize, displayCellSize
                        );

                        if (cellIndex === highlightCell) {
                            ctx.filter = 'none';
                            ctx.strokeStyle = 'rgba(255, 215, 0, 0.9)';
                            ctx.lineWidth = 3;
                            ctx.strokeRect(currentX + 1, 1, displayCellSize - 2, displayCellSize - 2);
                            ctx.filter = hue1 ? `hue-rotate(${hue1}deg)` : 'none';
                        }

                        currentX += displayCellSize;
                        cellIndex++;
                    }
                }
                ctx.filter = 'none';
            }

            // Draw Animation 2 cells (continues from where Animation 1 left off)
            if (spriteSheet2) {
                ctx.filter = hue2 ? `hue-rotate(${hue2}deg)` : 'none';
                const rows2 = Math.ceil(spriteSheet2.height / sourceCellSize);
                for (let row = 0; row < rows2; row++) {
                    for (let col = 0; col < cols; col++) {
                        const srcX = col * sourceCellSize;
                        const srcY = row * sourceCellSize;

                        ctx.drawImage(
                            spriteSheet2,
                            srcX, srcY, sourceCellSize, sourceCellSize,
                            currentX, 0, displayCellSize, displayCellSize
                        );

                        if (cellIndex === highlightCell) {
                            ctx.filter = 'none';
                            ctx.strokeStyle = 'rgba(255, 215, 0, 0.9)';
                            ctx.lineWidth = 3;
                            ctx.strokeRect(currentX + 1, 1, displayCellSize - 2, displayCellSize - 2);
                            ctx.filter = hue2 ? `hue-rotate(${hue2}deg)` : 'none';
                        }

                        currentX += displayCellSize;
                        cellIndex++;
                    }
                }
                ctx.filter = 'none';
            }
        };

        // Expose the renderer so hue sliders can trigger a redraw with the new hue.
        this._currentSpriteSheetPreviewRender = renderSpriteSheetPreview;

        // Load and render
        loadSpriteSheets().then(() => {
            renderSpriteSheetPreview();
            setupSpriteSheetInteraction();
        });

        // Setup interaction for sprite sheet preview
        const setupSpriteSheetInteraction = () => {
            let isDraggingFromSheet = false;
            let draggedPattern = -1;
            let dragPreview = null;

            // Get pattern index from mouse position on sprite sheet
            const getPatternAtPosition = (mouseX) => {
                const cellX = Math.floor(mouseX / displayCellSize);

                // Calculate which pattern this is
                let pattern = cellX;

                // Determine if it's from sheet 1 or sheet 2
                if (spriteSheet1 && spriteSheet2) {
                    const rows1 = Math.ceil(spriteSheet1.height / sourceCellSize);
                    const cells1 = cols * rows1;

                    if (pattern >= cells1) {
                        // It's from sheet 2
                        pattern = 100 + (pattern - cells1);
                    }
                } else if (spriteSheet2 && !spriteSheet1) {
                    // Only sheet 2
                    pattern = 100 + pattern;
                }

                return pattern;
            };

            // Get cell index from mouse position
            const getCellIndexAtPosition = (mouseX) => {
                return Math.floor(mouseX / displayCellSize);
            };

            // Create drag preview element
            const createDragPreview = (pattern) => {
                // Create a canvas for the preview
                const previewCanvas = document.createElement('canvas');
                previewCanvas.width = displayCellSize;
                previewCanvas.height = displayCellSize;
                previewCanvas.style.position = 'fixed';
                previewCanvas.style.pointerEvents = 'none';
                previewCanvas.style.zIndex = '10000';
                previewCanvas.style.opacity = '0.8';
                previewCanvas.id = 'sprite-drag-preview';

                const previewCtx = previewCanvas.getContext('2d');
                previewCtx.imageSmoothingEnabled = false;

                // Determine which sprite sheet to use
                const cellPattern = pattern % 100;
                const sheet = pattern >= 100 ? spriteSheet2 : spriteSheet1;

                if (sheet) {
                    const srcX = (cellPattern % cols) * sourceCellSize;
                    const srcY = Math.floor(cellPattern / cols) * sourceCellSize;

                    previewCtx.drawImage(
                        sheet,
                        srcX, srcY, sourceCellSize, sourceCellSize,
                        0, 0, displayCellSize, displayCellSize
                    );
                }

                document.body.appendChild(previewCanvas);
                return previewCanvas;
            };

            // Update drag preview position
            const updateDragPreviewPosition = (x, y) => {
                if (dragPreview) {
                    // Center the preview on the cursor
                    dragPreview.style.left = (x - displayCellSize / 2) + 'px';
                    dragPreview.style.top = (y - displayCellSize / 2) + 'px';
                }
            };

            // Remove drag preview
            const removeDragPreview = () => {
                if (dragPreview && dragPreview.parentNode) {
                    dragPreview.parentNode.removeChild(dragPreview);
                    dragPreview = null;
                }
            };

            // Hover highlight
            canvas.addEventListener('mousemove', (e) => {
                if (!isDraggingFromSheet) {
                    const rect = canvas.getBoundingClientRect();
                    const mouseX = e.clientX - rect.left;
                    const cellIndex = getCellIndexAtPosition(mouseX);

                    if (cellIndex !== selectedSheetCell) {
                        selectedSheetCell = cellIndex;
                        renderSpriteSheetPreview(selectedSheetCell);
                    }
                }
            });

            // Clear highlight when mouse leaves
            canvas.addEventListener('mouseleave', () => {
                if (!isDraggingFromSheet) {
                    selectedSheetCell = -1;
                    renderSpriteSheetPreview();
                }
            });

            // Double-click to add to center of preview
            canvas.addEventListener('dblclick', (e) => {
                const rect = canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;

                const pattern = getPatternAtPosition(mouseX);
                const cellIndex = getCellIndexAtPosition(mouseX);
                selectedSheetCell = cellIndex;
                renderSpriteSheetPreview(selectedSheetCell);

                // Get current frame from animation playback
                const frameIndex = window.currentAnimationFrameIndex || 0;
                const frame = animation.frames[frameIndex];
                if (!DatabaseAnimationEditor.canAddMVCell(frame)) return;

                // Add new cell at center with this pattern
                const newCell = [pattern, 0, 0, 100, 0, 0, 255, 0];
                frame.push(newCell);
                this.databaseManager?.updateAnimation?.(animation.id, animation);

                // Trigger re-render of main preview
                if (window.currentAnimationRenderFrame) {
                    window.currentAnimationRenderFrame(frameIndex);
                }

                console.debug('Added tileset frame', pattern, 'to animation frame', frameIndex);
            });

            // Drag from sprite sheet
            canvas.addEventListener('mousedown', (e) => {
                const rect = canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;

                const cellIndex = getCellIndexAtPosition(mouseX);
                selectedSheetCell = cellIndex;
                renderSpriteSheetPreview(selectedSheetCell);

                draggedPattern = getPatternAtPosition(mouseX);
                isDraggingFromSheet = true;
                canvas.style.cursor = 'grabbing';

                // Create drag preview
                dragPreview = createDragPreview(draggedPattern);
                updateDragPreviewPosition(e.clientX, e.clientY);
            });

            const onSheetDragMouseUp = (e) => {
                if (isDraggingFromSheet) {
                    // Check if mouse is over the preview canvas
                    const previewCanvas = document.getElementById('animation-preview-canvas');
                    if (previewCanvas) {
                        const rect = previewCanvas.getBoundingClientRect();
                        const mouseX = e.clientX;
                        const mouseY = e.clientY;

                        if (mouseX >= rect.left && mouseX <= rect.right &&
                            mouseY >= rect.top && mouseY <= rect.bottom) {

                            // Convert displayed CSS coordinates into the 960x540 backing space.
                            const point = this.getAnimationCanvasPoint(previewCanvas, e);
                            const anchor = this._previewAnchor(animation, previewCanvas);
                            const relativeX = point.x - anchor.x;
                            const relativeY = point.y - anchor.y;

                            // Get current frame from animation playback
                            const frameIndex = window.currentAnimationFrameIndex || 0;
                            const frame = animation.frames[frameIndex];
                            if (!DatabaseAnimationEditor.canAddMVCell(frame)) return;

                            // Add new cell at drop position
                            const newCell = [draggedPattern, relativeX, relativeY, 100, 0, 0, 255, 0];
                            frame.push(newCell);
                            this.databaseManager?.updateAnimation?.(animation.id, animation);

                            // Trigger re-render of main preview
                            if (window.currentAnimationRenderFrame) {
                                window.currentAnimationRenderFrame(frameIndex);
                            }

                            console.debug('Dropped tileset frame', draggedPattern, 'at position', relativeX, relativeY);
                        }
                    }

                    isDraggingFromSheet = false;
                    draggedPattern = -1;
                    canvas.style.cursor = 'default';

                    // Remove drag preview
                    removeDragPreview();
                }
            };

            const onSheetDragMouseMove = (e) => {
                if (isDraggingFromSheet) {
                    // Update drag preview position
                    updateDragPreviewPosition(e.clientX, e.clientY);
                    e.preventDefault();
                }
            };

            document.addEventListener('mouseup', onSheetDragMouseUp);
            document.addEventListener('mousemove', onSheetDragMouseMove);
            this._registerDetailCleanup(() => {
                document.removeEventListener('mouseup', onSheetDragMouseUp);
                document.removeEventListener('mousemove', onSheetDragMouseMove);
                removeDragPreview();
            });
        };
    }

    setupSpriteAnimationPlayback(animation) {
        const canvas = document.getElementById('animation-preview-canvas');
        const playBtn = document.getElementById('animation-play-btn');
        const stopBtn = document.getElementById('animation-stop-btn');
        const frameCounter = document.getElementById('animation-frame-counter');
        const frameList = document.getElementById('animation-frame-list');

        const currentProject = this.projectManager.getCurrentProject();
        if (!canvas || !playBtn || !stopBtn || !frameList || !currentProject) return;

        const tt = text => window.I18n ? window.I18n.tText(text) : text;

        // Reference to this for closures
        const editorSelf = this;

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        let animationInterval = null;
        let currentFrame = 0;
        let selectedFrameIndices = new Set([0]); // multi-select state for frame list
        let frameClipboard = null; // array of cloned frame objects from copy/cut
        let spriteSheet1 = null;
        let spriteSheet2 = null;
        let isDragging = false;
        let draggedCellIndex = -1;
        let dragStartX = 0;
        let dragStartY = 0;
        let dragOffsetX = 0;
        let dragOffsetY = 0;
        let selectedCellIndex = -1;
        let copiedCell = null;
        let cutCell = null;
        let undoStack = [];
        let redoStack = [];

        // Load sprite sheets
        const loadSpriteSheets = () => {
            const promises = [];

            if (animation.animation1Name) {
                const path = require('path');
                const imageRoot = path.join(currentProject.path, 'img', 'animations');
                const imgPath = RRAssetFiles.imageUrlFor(imageRoot, animation.animation1Name);
                const img1 = new Image();
                const promise1 = new Promise((resolve) => {
                    img1.onload = () => {
                        spriteSheet1 = img1;
                        resolve();
                    };
                    img1.onerror = () => {
                        console.warn(`Failed to load: ${imgPath}`);
                        resolve();
                    };
                    img1.src = imgPath;
                });
                promises.push(promise1);
            }

            if (animation.animation2Name) {
                const path = require('path');
                const imageRoot = path.join(currentProject.path, 'img', 'animations');
                const imgPath = RRAssetFiles.imageUrlFor(imageRoot, animation.animation2Name);
                const img2 = new Image();
                const promise2 = new Promise((resolve) => {
                    img2.onload = () => {
                        spriteSheet2 = img2;
                        resolve();
                    };
                    img2.onerror = () => {
                        console.warn(`Failed to load: ${imgPath}`);
                        resolve();
                    };
                    img2.src = imgPath;
                });
                promises.push(promise2);
            }

            return Promise.all(promises);
        };

        // Render a single frame
        const renderFrame = (frameIndex) => {
            // Update global frame index
            window.currentAnimationFrameIndex = frameIndex;

            // Draw preview background (battlebacks + target) instead of plain clear
            editorSelf._drawPreviewBackground(ctx, canvas);

            const frameData = frameIndex < animation.frames.length
                ? (animation.frames[frameIndex] || [])
                : [];
            const anchor = editorSelf._previewAnchor(animation, canvas);
            const canvasBlendOperations = ['source-over', 'lighter', 'multiply', 'screen'];

            // Each cell is [pattern, x, y, scale, rotation, mirror, opacity, blendMode]
            frameData.slice(0, 16).forEach((cell, index) => {
                const [pattern, x, y, scale, rotation, mirror, opacity, blendMode] = cell;
                if (pattern < 0) return;

                // Determine which sprite sheet to use (pattern 0-99 = sheet 1, 100+ = sheet 2)
                const sheet = pattern < 100 ? spriteSheet1 : spriteSheet2;
                if (!sheet) return;

                const cellPattern = pattern % 100;

                // RPG Maker MZ animation sprite sheets are 5 columns × 5 rows (192px cells)
                const cellSize = 192;
                const cols = 5;
                const srcX = (cellPattern % cols) * cellSize;
                const srcY = Math.floor(cellPattern / cols) * cellSize;

                ctx.save();
                ctx.globalCompositeOperation = canvasBlendOperations[blendMode] || 'source-over';

                // Apply transformations
                ctx.translate(anchor.x + x, anchor.y + y);
                ctx.rotate((rotation * Math.PI) / 180);
                ctx.scale(scale / 100, scale / 100);
                if (mirror) {
                    ctx.scale(-1, 1);
                }
                ctx.globalAlpha = opacity / 255;

                // Apply per-sheet hue rotation. MZ stores hue 0-360; CSS canvas
                // filter `hue-rotate(Ndeg)` matches that range. 0 = no change.
                const sheetHue = pattern < 100
                    ? (animation.animation1Hue || 0)
                    : (animation.animation2Hue || 0);
                ctx.filter = sheetHue ? `hue-rotate(${sheetHue}deg)` : 'none';

                // Draw the sprite
                ctx.drawImage(
                    sheet,
                    srcX, srcY, cellSize, cellSize,
                    -cellSize / 2, -cellSize / 2, cellSize, cellSize
                );

                ctx.filter = 'none';
                ctx.restore();

                // Draw selection highlight
                if (index === selectedCellIndex) {
                    ctx.save();
                    ctx.translate(anchor.x + x, anchor.y + y);
                    ctx.rotate((rotation * Math.PI) / 180);
                    ctx.scale(scale / 100, scale / 100);
                    if (mirror) {
                        ctx.scale(-1, 1);
                    }

                    // Draw yellow outline
                    ctx.strokeStyle = 'rgba(255, 215, 0, 0.8)';
                    ctx.lineWidth = 3;
                    ctx.strokeRect(-cellSize / 2, -cellSize / 2, cellSize, cellSize);

                    // Draw corner handles
                    const handleSize = 8;
                    ctx.fillStyle = 'rgba(255, 215, 0, 0.9)';
                    ctx.fillRect(-cellSize / 2 - handleSize / 2, -cellSize / 2 - handleSize / 2, handleSize, handleSize);
                    ctx.fillRect(cellSize / 2 - handleSize / 2, -cellSize / 2 - handleSize / 2, handleSize, handleSize);
                    ctx.fillRect(-cellSize / 2 - handleSize / 2, cellSize / 2 - handleSize / 2, handleSize, handleSize);
                    ctx.fillRect(cellSize / 2 - handleSize / 2, cellSize / 2 - handleSize / 2, handleSize, handleSize);

                    ctx.restore();
                }
            });

            editorSelf._drawPreviewScreenFlash(ctx, canvas);
            frameCounter.textContent = `${tt('Frame:')} ${frameIndex + 1} / ${animation.frames.length}`;
        };
        const renderStaticFrame = (frameIndex) => {
            editorSelf._seedSpritePreviewFlash(animation, frameIndex);
            renderFrame(frameIndex);
        };

        // Save state for undo/redo
        const saveState = () => {
            undoStack.push(JSON.parse(JSON.stringify(animation.frames)));
            redoStack = []; // Clear redo stack on new action
            if (undoStack.length > 50) undoStack.shift(); // Limit undo stack
        };

        // Check if pixel is visible (non-transparent) at given position on sprite
        const isPixelVisible = (sheet, pattern, mouseX, mouseY, cellX, cellY, scale, rotation, mirror) => {
            if (!sheet) return false;

            const cellSize = 192;
            const cols = 5;
            const cellPattern = pattern % 100;

            // Calculate source position in sprite sheet
            const srcX = (cellPattern % cols) * cellSize;
            const srcY = Math.floor(cellPattern / cols) * cellSize;

            // Create a temporary canvas to read pixel data
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = cellSize;
            tempCanvas.height = cellSize;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.imageSmoothingEnabled = false;

            // Draw the sprite cell to temp canvas
            tempCtx.drawImage(sheet, srcX, srcY, cellSize, cellSize, 0, 0, cellSize, cellSize);

            // Calculate relative position on the sprite
            const anchor = editorSelf._previewAnchor(animation, canvas);
            const spriteX = anchor.x + cellX;
            const spriteY = anchor.y + cellY;

            // Transform mouse position to sprite local coordinates
            let localX = mouseX - spriteX;
            let localY = mouseY - spriteY;

            // Reverse rotation
            const rad = -(rotation * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const rotatedX = localX * cos - localY * sin;
            const rotatedY = localX * sin + localY * cos;

            // Reverse scale and mirror
            const scaleMultiplier = scale / 100;
            let finalX = rotatedX / scaleMultiplier;
            let finalY = rotatedY / scaleMultiplier;

            if (mirror) {
                finalX = -finalX;
            }

            // Convert to sprite pixel coordinates
            const pixelX = Math.floor(finalX + cellSize / 2);
            const pixelY = Math.floor(finalY + cellSize / 2);

            // Check if within bounds
            if (pixelX < 0 || pixelX >= cellSize || pixelY < 0 || pixelY >= cellSize) {
                return false;
            }

            // Get pixel data
            const imageData = tempCtx.getImageData(pixelX, pixelY, 1, 1);
            const alpha = imageData.data[3];

            // Consider pixel visible if alpha > threshold
            return alpha > 10;
        };

        // Get cell index at mouse position with pixel-perfect detection
        const getCellAtPosition = (mouseX, mouseY, skipIndex = -1) => {
            const frameData = animation.frames[currentFrame];
            if (!frameData) return -1;

            const anchor = editorSelf._previewAnchor(animation, canvas);
            const cellSize = 192;

            let visibleCells = [];
            let boundingBoxCells = [];

            // Check all cells
            for (let i = Math.min(frameData.length, 16) - 1; i >= 0; i--) {
                if (i === skipIndex) continue;

                const [pattern, x, y, scale, rotation, mirror, opacity, blendMode] = frameData[i];
                if (pattern < 0) continue;

                const spriteX = anchor.x + x;
                const spriteY = anchor.y + y;
                const scaledSize = (cellSize * scale) / 100;

                // Bounding box check
                if (mouseX >= spriteX - scaledSize / 2 && mouseX <= spriteX + scaledSize / 2 &&
                    mouseY >= spriteY - scaledSize / 2 && mouseY <= spriteY + scaledSize / 2) {

                    // Determine which sprite sheet to use
                    const sheet = pattern < 100 ? spriteSheet1 : spriteSheet2;

                    // Check if pixel is visible
                    if (isPixelVisible(sheet, pattern, mouseX, mouseY, x, y, scale, rotation, mirror)) {
                        visibleCells.push(i);
                    } else {
                        boundingBoxCells.push(i);
                    }
                }
            }

            // Prioritize cells where mouse is over visible pixels
            if (visibleCells.length > 0) {
                return visibleCells[0]; // Return topmost visible cell
            }

            // Fall back to bounding box selection
            if (boundingBoxCells.length > 0) {
                return boundingBoxCells[0];
            }

            return -1;
        };

        // Create context menu
        const createContextMenu = (x, y, cellIndex) => {
            // Remove existing context menu if any
            const existingMenu = document.getElementById('animation-context-menu');
            if (existingMenu) existingMenu.remove();

            const menu = document.createElement('div');
            menu.id = 'animation-context-menu';
            menu.style.cssText = `
                position: fixed;
                left: ${x}px;
                top: ${y}px;
                background: var(--color-bg-input);
                border: 1px solid var(--color-border-input);
                border-radius: 3px;
                padding: 4px 0;
                z-index: 10001;
                min-width: 120px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.5);
            `;

            const menuItems = [
                { label: tt('New'), action: 'new', enabled: cellIndex !== -1 && DatabaseAnimationEditor.canAddMVCell(animation.frames[currentFrame]) },
                { label: tt('Edit'), action: 'edit', enabled: cellIndex !== -1 },
                { separator: true },
                { label: tt('Cut'), action: 'cut', enabled: cellIndex !== -1 },
                { label: tt('Copy'), action: 'copy', enabled: cellIndex !== -1 },
                { label: tt('Paste'), action: 'paste', enabled: (copiedCell !== null || cutCell !== null) && DatabaseAnimationEditor.canAddMVCell(animation.frames[currentFrame]) },
                { label: tt('Delete'), action: 'delete', enabled: cellIndex !== -1 },
                { separator: true },
                { label: tt('Undo'), action: 'undo', enabled: undoStack.length > 0 },
                { label: tt('Redo'), action: 'redo', enabled: redoStack.length > 0 },
                { separator: true },
                { label: tt('To Upper'), action: 'upper', enabled: cellIndex !== -1 && cellIndex < animation.frames[currentFrame].length - 1 },
                { label: tt('To Lower'), action: 'lower', enabled: cellIndex !== -1 && cellIndex > 0 }
            ];

            menuItems.forEach(item => {
                if (item.separator) {
                    const separator = document.createElement('div');
                    separator.style.cssText = 'height: 1px; background: var(--color-border-input); margin: 4px 0;';
                    menu.appendChild(separator);
                } else {
                    const menuItem = document.createElement('div');
                    menuItem.textContent = item.label;
                    menuItem.style.cssText = `
                        padding: 6px 12px;
                        font-size: 11px;
                        color: ${item.enabled ? 'var(--color-text)' : 'var(--color-text-dim)'};
                        cursor: ${item.enabled ? 'pointer' : 'default'};
                        user-select: none;
                    `;

                    if (item.enabled) {
                        menuItem.addEventListener('mouseenter', () => {
                            menuItem.style.background = 'var(--color-bg-list-item)';
                        });
                        menuItem.addEventListener('mouseleave', () => {
                            menuItem.style.background = 'transparent';
                        });
                        menuItem.addEventListener('click', () => {
                            handleContextMenuAction(item.action, cellIndex);
                            menu.remove();
                        });
                    }

                    menu.appendChild(menuItem);
                }
            });

            document.body.appendChild(menu);

            // Close menu on click outside
            const closeMenu = (e) => {
                if (!menu.contains(e.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            };
            setTimeout(() => document.addEventListener('click', closeMenu), 0);
        };

        // Store reference to this for use in closures
        const self = this;

        // Handle context menu actions
        const handleContextMenuAction = (action, cellIndex) => {
            const frameData = animation.frames[currentFrame];
            if (!frameData) return;

            switch (action) {
                case 'new':
                    if (cellIndex !== -1 && DatabaseAnimationEditor.canAddMVCell(frameData)) {
                        saveState();
                        const cell = frameData[cellIndex];
                        const newCell = JSON.parse(JSON.stringify(cell));
                        // Offset the new cell slightly so it's visible and not perfectly overlapping
                        newCell[1] += 16; // x offset
                        newCell[2] += 16; // y offset
                        frameData.push(newCell);
                        selectedCellIndex = frameData.length - 1; // Select the newly created cell
                        persistAnimation();
                        renderFrame(currentFrame);
                    }
                    break;

                case 'edit':
                    if (cellIndex !== -1) {
                        self.showCellPropertiesModal(animation, currentFrame, cellIndex, renderFrame);
                    }
                    break;

                case 'cut':
                    if (cellIndex !== -1) {
                        saveState();
                        cutCell = JSON.parse(JSON.stringify(frameData[cellIndex]));
                        copiedCell = null;
                        frameData.splice(cellIndex, 1);
                        selectedCellIndex = -1;
                        renderFrame(currentFrame);
                    }
                    break;

                case 'copy':
                    if (cellIndex !== -1) {
                        copiedCell = JSON.parse(JSON.stringify(frameData[cellIndex]));
                        cutCell = null;
                    }
                    break;

                case 'paste':
                    if (!DatabaseAnimationEditor.canAddMVCell(frameData)) break;
                    saveState();
                    if (cutCell) {
                        frameData.push(cutCell);
                        cutCell = null;
                    } else if (copiedCell) {
                        frameData.push(JSON.parse(JSON.stringify(copiedCell)));
                    }
                    persistAnimation();
                    renderFrame(currentFrame);
                    break;

                case 'delete':
                    if (cellIndex !== -1) {
                        saveState();
                        frameData.splice(cellIndex, 1);
                        selectedCellIndex = -1;
                        renderFrame(currentFrame);
                    }
                    break;

                case 'undo':
                    if (undoStack.length > 0) {
                        redoStack.push(JSON.parse(JSON.stringify(animation.frames)));
                        animation.frames = undoStack.pop();
                        renderFrame(currentFrame);
                    }
                    break;

                case 'redo':
                    if (redoStack.length > 0) {
                        undoStack.push(JSON.parse(JSON.stringify(animation.frames)));
                        animation.frames = redoStack.pop();
                        renderFrame(currentFrame);
                    }
                    break;

                case 'upper':
                    if (cellIndex !== -1 && cellIndex < frameData.length - 1) {
                        saveState();
                        const temp = frameData[cellIndex];
                        frameData[cellIndex] = frameData[cellIndex + 1];
                        frameData[cellIndex + 1] = temp;
                        selectedCellIndex = cellIndex + 1;
                        renderFrame(currentFrame);
                    }
                    break;

                case 'lower':
                    if (cellIndex !== -1 && cellIndex > 0) {
                        saveState();
                        const temp = frameData[cellIndex];
                        frameData[cellIndex] = frameData[cellIndex - 1];
                        frameData[cellIndex - 1] = temp;
                        selectedCellIndex = cellIndex - 1;
                        renderFrame(currentFrame);
                    }
                    break;
            }
        };

        // Play SE for current frame
        const playSE = (frameIndex) => {
            // Check for SE timings at this frame
            const timings = animation.timings || [];
            const soundTimings = animation.soundTimings || [];

            // Sprite-based animations use timings array
            const spriteTimings = timings.filter(t => t.frame === frameIndex && t.se && t.se.name);

            // Effekseer animations use soundTimings array
            const effekseerTimings = soundTimings.filter(st => st.frame === frameIndex && st.se && st.se.name);

            // Combine both
            const allTimings = [...spriteTimings, ...effekseerTimings];

            allTimings.forEach(timing => {
                const se = timing.se;
                if (!se || !se.name) return;

                const path = require('path');
                const seFolder = path.join(currentProject.path, 'audio', 'se');
                const audioFile = RRAssetFiles.find(seFolder, se.name, RRAssetFiles.AUDIO_EXTENSIONS);
                if (!audioFile) return;

                const audio = new Audio(RRAssetFiles.toUrl(audioFile.absolutePath));
                audio.volume = (Number.isFinite(se.volume) ? se.volume : 90) / 100;

                // Handle pitch (playbackRate)
                // RPG Maker pitch: 50-150, where 100 is normal
                // Web Audio playbackRate: 0.5-1.5, where 1.0 is normal
                audio.playbackRate = (se.pitch || 100) / 100;

                // Pan is not supported in HTML5 Audio without Web Audio API
                // For simplicity, we'll skip pan for now

                audio.play().catch(err => {
                    console.warn(`Failed to play SE: ${se.name}`, err);
                });
            });
        };

        // Play animation
        const play = () => {
            if (animationInterval || animation.frames.length === 0) return;

            currentFrame = 0;
            editorSelf._resetPreviewFlash();
            // Sprite_AnimationMV updates flashes at 60 Hz and advances its
            // authored frame every fourth tick. Keep that model so fades and
            // hide timings have the same duration as the runtime.
            const STEP = 1000 / 60;
            let last = performance.now();
            let acc = 0;
            let tickInFrame = 0;
            const advanceTick = () => {
                const frameBoundary = tickInFrame === 0;
                if (frameBoundary) {
                    playSE(currentFrame);
                    for (const timing of animation.timings || []) {
                        if (timing?.frame === currentFrame) {
                            editorSelf._firePreviewFlashTiming(timing, 4);
                        }
                    }
                }
                const flashWasActive = editorSelf._previewFlashActive();
                editorSelf._stepPreviewFlash();
                if (frameBoundary || flashWasActive || editorSelf._previewFlashActive()) {
                    renderFrame(currentFrame);
                }
                tickInFrame++;
                if (tickInFrame >= 4) {
                    tickInFrame = 0;
                    currentFrame++;
                    if (currentFrame >= animation.frames.length) {
                        currentFrame = 0;
                        editorSelf._resetPreviewFlash();
                    }
                }
            };
            // The runtime processes frame zero on its first update rather than
            // waiting one full authored frame (66.7ms).
            advanceTick();
            const tick = () => {
                const now = performance.now();
                acc += now - last;
                last = now;
                let steps = 0;
                while (acc >= STEP && steps < 5) {
                    advanceTick();
                    acc -= STEP;
                    steps++;
                }
                if (acc > STEP * 5) acc = 0;
                animationInterval = requestAnimationFrame(tick);
            };
            animationInterval = requestAnimationFrame(tick);

            playBtn.disabled = true;
            playBtn.style.opacity = '0.5';
            stopBtn.disabled = false;
            stopBtn.style.opacity = '1';
        };

        // Stop animation
        const stop = () => {
            if (animationInterval) {
                cancelAnimationFrame(animationInterval);
                animationInterval = null;
            }

            currentFrame = 0;
            editorSelf._resetPreviewFlash();
            editorSelf._drawPreviewBackground(ctx, canvas);
            frameCounter.textContent = `${tt('Frame:')} 0 / ${animation.frames.length}`;

            playBtn.disabled = false;
            playBtn.style.opacity = '1';
            stopBtn.disabled = true;
            stopBtn.style.opacity = '0.5';
        };

        // Store stop function for cleanup when switching animations
        this._currentEffekseerStop = stop;

        // Right-click context menu
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();

            if (animationInterval) return; // Don't show menu during playback

            const point = editorSelf.getAnimationCanvasPoint(canvas, e);
            const mouseX = point.x;
            const mouseY = point.y;

            const cellIndex = getCellAtPosition(mouseX, mouseY);
            selectedCellIndex = cellIndex;

            createContextMenu(e.clientX, e.clientY, cellIndex);
        });

        // Canvas dragging for sprite positioning
        canvas.addEventListener('mousedown', (e) => {
            if (animationInterval) return; // Don't allow dragging during playback
            if (e.button !== 0) return; // Only left click

            const point = editorSelf.getAnimationCanvasPoint(canvas, e);
            const mouseX = point.x;
            const mouseY = point.y;

            const frameData = animation.frames[currentFrame];
            if (!frameData) return;

            const cellIndex = getCellAtPosition(mouseX, mouseY);

            if (cellIndex !== -1) {
                // Update selection and render immediately to show highlight
                selectedCellIndex = cellIndex;
                renderStaticFrame(currentFrame);

                // Save state before dragging
                saveState();
                isDragging = true;
                draggedCellIndex = cellIndex;
                dragStartX = mouseX;
                dragStartY = mouseY;
                dragOffsetX = frameData[cellIndex][1];
                dragOffsetY = frameData[cellIndex][2];
                canvas.style.cursor = 'move';
            } else {
                // Clicked on empty space - deselect
                selectedCellIndex = -1;
                renderStaticFrame(currentFrame);
            }
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!isDragging || draggedCellIndex === -1) return;

            const point = editorSelf.getAnimationCanvasPoint(canvas, e);
            const mouseX = point.x;
            const mouseY = point.y;

            const deltaX = mouseX - dragStartX;
            const deltaY = mouseY - dragStartY;

            // Update cell position
            animation.frames[currentFrame][draggedCellIndex][1] = Math.round(dragOffsetX + deltaX);
            animation.frames[currentFrame][draggedCellIndex][2] = Math.round(dragOffsetY + deltaY);

            // Re-render
            renderFrame(currentFrame);
        });

        canvas.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                draggedCellIndex = -1;
                canvas.style.cursor = 'default';
            }
        });

        canvas.addEventListener('mouseleave', () => {
            if (isDragging) {
                isDragging = false;
                draggedCellIndex = -1;
                canvas.style.cursor = 'default';
            }
        });

        // Keyboard shortcuts
        const handleKeyDown = (e) => {
            // Only handle if the canvas container is focused or visible
            if (!canvas.offsetParent) return;

            // Ctrl+Z - Undo
            if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                handleContextMenuAction('undo', -1);
            }
            // Ctrl+Y or Ctrl+Shift+Z - Redo
            else if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
                e.preventDefault();
                handleContextMenuAction('redo', -1);
            }
            // Ctrl+C - Copy
            else if (e.ctrlKey && e.key === 'c' && selectedCellIndex !== -1) {
                e.preventDefault();
                handleContextMenuAction('copy', selectedCellIndex);
            }
            // Ctrl+X - Cut
            else if (e.ctrlKey && e.key === 'x' && selectedCellIndex !== -1) {
                e.preventDefault();
                handleContextMenuAction('cut', selectedCellIndex);
            }
            // Ctrl+V - Paste
            else if (e.ctrlKey && e.key === 'v' && (copiedCell || cutCell)) {
                e.preventDefault();
                handleContextMenuAction('paste', -1);
            }
            // Delete - Delete selected cell
            else if (e.key === 'Delete' && selectedCellIndex !== -1) {
                e.preventDefault();
                handleContextMenuAction('delete', selectedCellIndex);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        this._registerDetailCleanup(() => {
            document.removeEventListener('keydown', handleKeyDown);
        });

        // Add/Remove frame buttons
        const addFrameBtn = document.getElementById('add-frame-btn');
        const removeFrameBtn = document.getElementById('remove-frame-btn');

        if (addFrameBtn) {
            addFrameBtn.addEventListener('click', () => {
                // Copy current frame or create empty frame
                const newFrame = currentFrame < animation.frames.length
                    ? JSON.parse(JSON.stringify(animation.frames[currentFrame].slice(0, 16)))
                    : []; // Empty frame

                animation.frames.push(newFrame);
                currentFrame = animation.frames.length - 1;
                selectedFrameIndices.clear();
                selectedFrameIndices.add(currentFrame);
                persistAnimation();
                populateFrameList();
                renderStaticFrame(currentFrame);
                updateFrameCounter();
            });
        }

        if (removeFrameBtn) {
            removeFrameBtn.addEventListener('click', () => {
                if (animation.frames.length <= selectedFrameIndices.size) {
                    alert(tt('Cannot remove all frames; at least one frame must remain.'));
                    return;
                }
                const count = selectedFrameIndices.size;
                const confirmDelete = confirm(count === 1
                    ? `${tt('Remove frame')} ${currentFrame + 1}?`
                    : `${tt('Remove')} ${count} ${tt('selected frames?')}`);
                if (!confirmDelete) return;

                const indicesDesc = Array.from(selectedFrameIndices).sort((a, b) => b - a);
                indicesDesc.forEach(i => animation.frames.splice(i, 1));
                selectedFrameIndices.clear();
                currentFrame = Math.max(0, Math.min(currentFrame, animation.frames.length - 1));
                selectedFrameIndices.add(currentFrame);
                persistAnimation();
                populateFrameList();
                renderStaticFrame(currentFrame);
                updateFrameCounter();
            });
        }

        // Event listeners
        playBtn.addEventListener('click', play);
        stopBtn.addEventListener('click', stop);

        // Refresh visual highlight on every frame item based on selectedFrameIndices.
        const refreshFrameHighlights = () => {
            const items = frameList.querySelectorAll('.animation-frame-item');
            items.forEach(item => {
                const idx = parseInt(item.dataset.frameIndex);
                const isSel = selectedFrameIndices.has(idx);
                item.style.background = isSel ? 'var(--color-accent-tint-30)' : 'var(--color-bg-input-alt)';
                item.style.border = isSel ? '1px solid var(--color-accent-border-strong)' : '1px solid var(--color-border-input)';
                item.style.color = isSel ? 'var(--color-accent-bright)' : 'var(--color-text)';
                item.style.fontWeight = isSel ? '600' : 'normal';
            });
        };

        // Populate frame list with multi-select support.
        // Plain click = single, Ctrl/Cmd+click = toggle, Shift+click = range.
        // Always updates currentFrame to the clicked index for preview/render.
        const populateFrameList = () => {
            frameList.innerHTML = '';
            if (selectedFrameIndices.size === 0 && animation.frames.length > 0) {
                selectedFrameIndices.add(currentFrame);
            }
            animation.frames.forEach((frame, index) => {
                const frameItem = document.createElement('div');
                frameItem.className = 'animation-frame-item';
                frameItem.dataset.frameIndex = index;
                frameItem.style.cssText = 'padding: 8px 10px; background: var(--color-bg-input-alt); border: 1px solid var(--color-border-input); border-radius: 3px; cursor: pointer; font-size: 12px; font-weight: 600; transition: all 0.15s;';
                frameItem.textContent = `${tt('Frame')} ${index + 1}`;

                frameItem.addEventListener('click', (e) => {
                    // Stop animation playback if running so the user can browse.
                    if (animationInterval) {
                        cancelAnimationFrame(animationInterval);
                        animationInterval = null;
                        playBtn.disabled = false;
                        playBtn.style.opacity = '1';
                        stopBtn.disabled = true;
                        stopBtn.style.opacity = '0.5';
                    }
                    // Focus the frame list container so keyboard shortcuts route here,
                    // not to the database sidebar (which would delete the animation).
                    frameList.focus();

                    if (e.shiftKey && selectedFrameIndices.size > 0) {
                        const anchor = currentFrame;
                        const lo = Math.min(anchor, index);
                        const hi = Math.max(anchor, index);
                        selectedFrameIndices.clear();
                        for (let i = lo; i <= hi; i++) selectedFrameIndices.add(i);
                    } else if (e.ctrlKey || e.metaKey) {
                        if (selectedFrameIndices.has(index)) selectedFrameIndices.delete(index);
                        else selectedFrameIndices.add(index);
                    } else {
                        selectedFrameIndices.clear();
                        selectedFrameIndices.add(index);
                    }
                    currentFrame = index;
                    renderStaticFrame(index);
                    refreshFrameHighlights();
                });

                frameItem.addEventListener('mouseenter', () => {
                    if (!selectedFrameIndices.has(parseInt(frameItem.dataset.frameIndex))) {
                        frameItem.style.background = '#4a4a4a';
                    }
                });
                frameItem.addEventListener('mouseleave', () => {
                    if (!selectedFrameIndices.has(parseInt(frameItem.dataset.frameIndex))) {
                        frameItem.style.background = 'var(--color-bg-input-alt)';
                    }
                });

                frameList.appendChild(frameItem);
            });

            refreshFrameHighlights();
        };

        // Make the frame list container focusable so its keydown handler can
        // catch Delete / Ctrl+C/X/V without the database sidebar's delete handler
        // firing and removing the whole animation entry.
        frameList.tabIndex = -1;
        frameList.style.outline = 'none';
        const persistAnimation = () => {
            if (editorSelf.databaseManager && editorSelf.databaseManager.updateAnimation) {
                editorSelf.databaseManager.updateAnimation(animation.id, animation);
            }
        };
        const updateFrameCounter = () => {
            if (frameCounter) {
                frameCounter.textContent = `${tt('Frame:')} ${currentFrame + 1} / ${animation.frames.length}`;
            }
        };
        frameList.addEventListener('keydown', (e) => {
            const tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
            const isCtrl = e.ctrlKey || e.metaKey;

            if (e.key === 'Delete' && selectedFrameIndices.size > 0) {
                e.preventDefault();
                e.stopPropagation();
                if (animation.frames.length <= selectedFrameIndices.size) {
                    alert(tt('Cannot remove all frames; at least one frame must remain.'));
                    return;
                }
                const indicesDesc = Array.from(selectedFrameIndices).sort((a, b) => b - a);
                indicesDesc.forEach(i => animation.frames.splice(i, 1));
                selectedFrameIndices.clear();
                currentFrame = Math.max(0, Math.min(currentFrame, animation.frames.length - 1));
                selectedFrameIndices.add(currentFrame);
                persistAnimation();
                populateFrameList();
                renderStaticFrame(currentFrame);
                updateFrameCounter();
            } else if (isCtrl && e.key.toLowerCase() === 'c' && selectedFrameIndices.size > 0) {
                e.preventDefault();
                e.stopPropagation();
                const indicesAsc = Array.from(selectedFrameIndices).sort((a, b) => a - b);
                frameClipboard = indicesAsc.map(i => JSON.parse(JSON.stringify(animation.frames[i])));
            } else if (isCtrl && e.key.toLowerCase() === 'x' && selectedFrameIndices.size > 0) {
                e.preventDefault();
                e.stopPropagation();
                if (animation.frames.length <= selectedFrameIndices.size) {
                    alert(tt('Cannot cut all frames; at least one frame must remain.'));
                    return;
                }
                const indicesAsc = Array.from(selectedFrameIndices).sort((a, b) => a - b);
                frameClipboard = indicesAsc.map(i => JSON.parse(JSON.stringify(animation.frames[i])));
                const indicesDesc = indicesAsc.slice().reverse();
                indicesDesc.forEach(i => animation.frames.splice(i, 1));
                selectedFrameIndices.clear();
                currentFrame = Math.max(0, Math.min(currentFrame, animation.frames.length - 1));
                selectedFrameIndices.add(currentFrame);
                persistAnimation();
                populateFrameList();
                renderStaticFrame(currentFrame);
                updateFrameCounter();
            } else if (isCtrl && e.key.toLowerCase() === 'v' && frameClipboard && frameClipboard.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                const insertAt = currentFrame + 1;
                frameClipboard.forEach((f, i) => {
                    animation.frames.splice(insertAt + i, 0, JSON.parse(JSON.stringify(f.slice(0, 16))));
                });
                selectedFrameIndices.clear();
                for (let i = 0; i < frameClipboard.length; i++) selectedFrameIndices.add(insertAt + i);
                currentFrame = insertAt;
                persistAnimation();
                populateFrameList();
                renderStaticFrame(currentFrame);
                updateFrameCounter();
            } else if (isCtrl && e.key.toLowerCase() === 'a' && animation.frames.length > 0) {
                // Select all
                e.preventDefault();
                e.stopPropagation();
                selectedFrameIndices.clear();
                for (let i = 0; i < animation.frames.length; i++) selectedFrameIndices.add(i);
                refreshFrameHighlights();
            }
        });

        // Expose renderFrame globally for sprite sheet drag-drop
        window.currentAnimationRenderFrame = renderFrame;

        // Store renderFrame reference for preview image re-renders
        editorSelf._currentSpriteRenderFrame = renderFrame;
        editorSelf._currentSpriteRenderStaticFrame = renderStaticFrame;
        editorSelf._previewBgCanvas = null; // Not in Effekseer mode
        editorSelf._resetPreviewFlash();

        // Load sprite sheets and render first frame
        loadSpriteSheets().then(() => {
            populateFrameList();
            renderStaticFrame(0);
        });

        // Initial state
        stopBtn.disabled = true;
        stopBtn.style.opacity = '0.5';
    }

    _blitPreviewBackground(gl, source) {
        if (!gl || !source || !source.width) return false;
        if (!this._effekseerPreviewBlits) this._effekseerPreviewBlits = new WeakMap();
        let blit = this._effekseerPreviewBlits.get(gl);
        if (!blit) {
            const compile = (type, shaderSource) => {
                const shader = gl.createShader(type);
                gl.shaderSource(shader, shaderSource);
                gl.compileShader(shader);
                return shader;
            };
            const program = gl.createProgram();
            gl.attachShader(program, compile(gl.VERTEX_SHADER,
                'attribute vec2 aPos; varying vec2 vUv;' +
                'void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }'));
            gl.attachShader(program, compile(gl.FRAGMENT_SHADER,
                'precision mediump float; varying vec2 vUv; uniform sampler2D uTex;' +
                'void main() { gl_FragColor = texture2D(uTex, vUv); }'));
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
            const buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER,
                new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
            blit = {
                program,
                buffer,
                aPos: gl.getAttribLocation(program, 'aPos'),
                uTex: gl.getUniformLocation(program, 'uTex'),
                texture: gl.createTexture(),
                revision: -1,
                width: 0,
                height: 0
            };
            this._effekseerPreviewBlits.set(gl, blit);
        }

        gl.useProgram(blit.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, blit.buffer);
        gl.enableVertexAttribArray(blit.aPos);
        gl.vertexAttribPointer(blit.aPos, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, blit.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.uniform1i(blit.uTex, 0);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        let drew = false;
        try {
            const revision = this._previewBackgroundRevision || 0;
            if (blit.revision !== revision || blit.width !== source.width || blit.height !== source.height) {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
                blit.revision = revision;
                blit.width = source.width;
                blit.height = source.height;
            }
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            drew = true;
        } catch (error) {
            // Keep the Canvas2D layer visible if Chromium rejects an upload.
        }
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.disable(gl.BLEND);
        return drew;
    }

    setupEffekseerAnimationPlayback(animation, expectedGeneration = this._previewSetupGeneration) {
        const canvasContainer = document.getElementById('animation-preview-canvas');
        const playBtn = document.getElementById('animation-play-btn');
        const stopBtn = document.getElementById('animation-stop-btn');
        const frameCounter = document.getElementById('animation-frame-counter');
        const repeatCheckbox = document.getElementById('animation-repeat-checkbox');

        const currentProject = this.projectManager.getCurrentProject();
        if (!canvasContainer || !playBtn || !stopBtn || !currentProject) return;

        const tt = text => window.I18n ? window.I18n.tText(text) : text;

        // Check if Effekseer is available and initialized
        console.debug('[Effekseer Preview] Checking status...');
        console.debug('[Effekseer Preview] typeof effekseer:', typeof effekseer);
        console.debug('[Effekseer Preview] window._effekseerReady:', window._effekseerReady);

        if (typeof effekseer === 'undefined' || !window._effekseerReady) {
            const ctx = canvasContainer.getContext('2d');
            if (ctx) {
                ctx.fillStyle = ThemeColors.resolve('--color-text-muted', '#999999');
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                const msg = typeof effekseer === 'undefined' ?
                    tt('Effekseer library not loaded') :
                    tt('Effekseer initializing... Please wait');
                ctx.fillText(msg, canvasContainer.width / 2, canvasContainer.height / 2);
                console.debug('[Effekseer Preview] Showing message:', msg);
            }

            // If Effekseer is loading, retry with polling
            if (typeof effekseer !== 'undefined' && !window._effekseerReady) {
                console.debug('[Effekseer Preview] Effekseer found but not ready, setting up retry...');

                // Store retry info to avoid multiple retries
                if (!this._effekseerRetryCount) {
                    this._effekseerRetryCount = 0;
                }

                if (this._effekseerRetryCount < 20) { // Try for up to 10 seconds
                    this._effekseerRetryCount++;
                    console.debug(`[Effekseer Preview] Retry attempt ${this._effekseerRetryCount}/20`);

                    const retryTimer = setTimeout(() => {
                        if (expectedGeneration !== this._previewSetupGeneration) return;
                        if (window._effekseerReady) {
                            console.debug('[Effekseer Preview] Effekseer now ready! Retrying setup...');
                            // Clear the "initializing" message first
                            const oldCanvas = document.getElementById('animation-preview-canvas');
                            if (oldCanvas) {
                                const ctx = oldCanvas.getContext('2d');
                                if (ctx) {
                                    ctx.clearRect(0, 0, oldCanvas.width, oldCanvas.height);
                                }
                            }
                            // Reset retry count
                            this._effekseerRetryCount = 0;
                            // Retry setup
                            this.setupEffekseerAnimationPlayback(animation, expectedGeneration);
                        } else {
                            // Still not ready, this will trigger another retry
                            this.setupEffekseerAnimationPlayback(animation, expectedGeneration);
                        }
                    }, 500);
                    this._registerDetailCleanup(() => clearTimeout(retryTimer));
                } else {
                    console.error('[Effekseer Preview] Failed to initialize after 20 retries');
                    if (ctx) {
                        ctx.fillStyle = '#ff6666';
                        ctx.fillText(tt('Effekseer initialization timeout'), canvasContainer.width / 2, canvasContainer.height / 2);
                    }
                }
            } else {
                console.error('[Effekseer Preview] Effekseer library not found at all');
            }
            return;
        }

        console.debug('[Effekseer Preview] Effekseer ready, proceeding with setup...');

        // Reference to this for closures
        const editorSelf = this;

        // Layered canvas approach: background Canvas2D underneath, WebGL on top
        const parent = canvasContainer.parentNode;

        // Create wrapper div
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:relative;height:100%;width:auto;max-width:100%;aspect-ratio:16 / 9;';

        // Background canvas (Canvas2D) for battlebacks + target
        const bgCanvas = document.createElement('canvas');
        bgCanvas.id = 'anim-preview-bg-canvas';
        bgCanvas.width = 960;
        bgCanvas.height = 540;
        bgCanvas.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; image-rendering: pixelated;';
        wrapper.appendChild(bgCanvas);

        // WebGL canvas on top (transparent so background shows through)
        const canvas = document.createElement('canvas');
        canvas.id = 'effekseer-preview-canvas';
        canvas.width = 960;
        canvas.height = 540;
        canvas.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%;';
        wrapper.appendChild(canvas);

        // Replace the old canvas with the wrapper
        parent.replaceChild(wrapper, canvasContainer);

        // Store background canvas reference and clear sprite mode ref
        this._previewBgCanvas = bgCanvas;
        this._currentSpriteRenderFrame = null;
        this._currentSpriteRenderStaticFrame = null;
        this._resetPreviewFlash();

        // Draw initial background
        const bgCtx = bgCanvas.getContext('2d');
        if (bgCtx) this._drawPreviewBackground(bgCtx, bgCanvas);

        let effekseerContext = null;
        let effect = null;
        let handle = null;
        let isPlaying = false;
        let gl = null;
        let animationFrameId = null;
        let startTime = 0;
        let currentFrame = 0;
        // Where the picture ended last play (frames): a repeat starts over
        // there instead of waiting for the last invisible particle to die,
        // so there is no dark gap between plays.
        let lastLitFrame = 0;
        let visibleFrames = 0;
        let litMini = null;
        const anythingLit = () => {
            if (!litMini) { litMini = document.createElement('canvas'); litMini.width = 32; litMini.height = 32; }
            const ctx = litMini.getContext('2d', { willReadFrequently: true });
            ctx.clearRect(0, 0, 32, 32);
            ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, 32, 32);
            let data;
            try { data = ctx.getImageData(0, 0, 32, 32).data; } catch (e) { return false; }
            for (let i = 3; i < data.length; i += 4) if (data[i] >= 4) return true;
            return false;
        };

        // Initialize WebGL context
        const initWebGL = () => {
            try {
                gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true }) ||
                     canvas.getContext('experimental-webgl', { premultipliedAlpha: false, alpha: true });
                if (!gl) {
                    console.error('WebGL not supported');
                    return false;
                }

                // Create Effekseer context
                effekseerContext = effekseer.createContext();
                if (!effekseerContext) {
                    console.error('Failed to create Effekseer context');
                    return false;
                }

                // Initialize Effekseer with WebGL context
                effekseerContext.init(gl);
                // This context also receives the Canvas2D scene blit before
                // each effect draw, so Effekseer must restore its GL state.
                effekseerContext.setRestorationOfStatesFlag(true);

                console.debug('Effekseer context initialized for preview');
                return true;
            } catch (e) {
                console.error('Effekseer initialization error:', e);
                return false;
            }
        };

        // Load Effekseer effect
        const loadEffect = () => {
            if (!animation.effectName) {
                console.error('No effect name specified');
                return;
            }

            const path = require('path');
            const effectsPath = path.join(currentProject.path, 'effects');
            const effectFile = RRAssetFiles.find(effectsPath, animation.effectName, ['.efkefc']);
            const effectPath = effectFile?.absolutePath;
            if (!effectPath) {
                console.error('Effekseer effect not found:', animation.effectName);
                return;
            }

            console.debug('Loading Effekseer effect:', effectPath);

            // Load effect with Effekseer
            const onLoad = () => {
                console.debug('Effekseer effect loaded successfully');
                playBtn.disabled = false;
                playBtn.style.opacity = '1';
            };

            const onError = (message, path) => {
                console.error('Failed to load Effekseer effect:', message, path);
                // Note: canvas is a WebGL canvas, so we can't get 2D context
                // Just log the error - the user will see it in console
                playBtn.disabled = true;
                playBtn.style.opacity = '0.5';
            };

            try {
                effect = RR_loadEffekseerEffectFromFile(effekseerContext, effectPath, 1.0, onLoad, onError);
            } catch (e) {
                onError(e.message, effectPath);
            }
        };

        // Render loop with fixed 60 FPS timestep
        let renderFrameCount = 0;
        let lastTime = Date.now();
        let accumulator = 0;
        const fixedTimeStep = 1000 / 60; // 16.666ms per frame for 60 FPS
        const maxTimingFrames = Math.max(0,
            ...(animation.soundTimings || []).map(timing => Number(timing?.frame) || 0),
            ...(animation.flashTimings || []).map(timing => Number(timing?.frame) || 0));
        const advanceEffekseerTick = () => {
            playSE(currentFrame);
            for (const timing of animation.flashTimings || []) {
                if (timing?.frame === currentFrame) {
                    editorSelf._firePreviewFlashTiming({
                        flashScope: 1,
                        flashColor: timing.color,
                        flashDuration: timing.duration
                    }, 1);
                }
            }
            const flashWasActive = editorSelf._previewFlashActive();
            editorSelf._stepPreviewFlash();
            effekseerContext.update();
            currentFrame++;
            return flashWasActive || editorSelf._previewFlashActive();
        };

        const render = () => {
            if (!isPlaying || !effekseerContext || !gl) {
                console.debug('[Effekseer Render] Stopped - isPlaying:', isPlaying, 'effekseerContext:', !!effekseerContext, 'gl:', !!gl);
                return;
            }

            const now = Date.now();
            const deltaTime = now - lastTime;
            lastTime = now;
            accumulator += deltaTime;

            // Update Effekseer at fixed 60 FPS
            let updatesThisFrame = 0;
            let redrawBackground = false;
            while (accumulator >= fixedTimeStep && updatesThisFrame < 5) {
                const tickNeedsRedraw = advanceEffekseerTick();
                redrawBackground = redrawBackground || tickNeedsRedraw;
                accumulator -= fixedTimeStep;
                updatesThisFrame++;
            }

            // If we're way behind, just reset
            if (accumulator > fixedTimeStep * 5) {
                accumulator = 0;
            }
            if (redrawBackground && editorSelf._previewBgCanvas) {
                const previewCtx = editorSelf._previewBgCanvas.getContext('2d');
                if (previewCtx) editorSelf._drawPreviewBackground(previewCtx, editorSelf._previewBgCanvas);
            }

            renderFrameCount++;
            if (renderFrameCount === 1) {
                console.debug('[Effekseer Render] First frame rendering...');
                console.debug('[Effekseer Render] Canvas size:', canvas.width, 'x', canvas.height);
                console.debug('[Effekseer Render] Handle exists:', handle && handle.exists);
                console.debug('[Effekseer Render] Fixed timestep: 60 FPS');
            }

            // Update frame counter
            frameCounter.textContent = `${tt('Frame:')} ${currentFrame}`;

            // Clear canvas (transparent so background canvas shows through)
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            const composited = editorSelf._blitPreviewBackground(
                gl, editorSelf._previewBgCanvas);
            if (composited && effekseerContext.captureBackground) {
                effekseerContext.captureBackground(0, 0, canvas.width, canvas.height);
            }

            // RPG Maker MZ style setup - balanced FOV
            const viewportSize = canvas.height * 1.2; // Balanced FOV to fill canvas without clipping
            // x is scaled by height/width so one world unit spans the same
            // number of pixels on both axes (round spheres on a wide canvas)
            const x = canvas.height / canvas.width; // * (mirror ? -1 : 1)
            const y = 1;
            const p = -(viewportSize / canvas.height);

            // Set projection matrix - RPG Maker MZ style (pass as ARRAY!)
            effekseerContext.setProjectionMatrix([
                x, 0, 0, 0,
                0, y, 0, 0,
                0, 0, 1, p,
                0, 0, 0, 1
            ]);

            // Set camera matrix - RPG Maker MZ style (pass as ARRAY!)
            effekseerContext.setCameraMatrix([
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                0, 0, -10, 1
            ]);

            if (renderFrameCount === 1) {
                console.debug('[Effekseer Render] Projection p value:', p);
                console.debug('[Effekseer Render] Viewport size:', viewportSize);
                console.debug('[Effekseer Render] Matrices set as arrays');
            }

            // Draw effects
            effekseerContext.beginDraw();
            let effectFinished = false;
            let pictureEnded = false;
            try {
                if (handle && handle.exists) {
                    if (renderFrameCount === 1) {
                        console.debug('[Effekseer Render] Drawing handle...');
                        console.debug('[Effekseer Render] Handle location:',
                            handle.location ? handle.location : 'not available');
                    }
                    effekseerContext.drawHandle(handle);

                    // Check for GL errors
                    const err = gl.getError();
                    if (err !== gl.NO_ERROR && renderFrameCount === 1) {
                        console.error('[Effekseer Render] GL Error:', err);
                    }
                } else if (renderFrameCount > 1 && currentFrame > maxTimingFrames
                        && !editorSelf._previewFlashActive()) {
                    effectFinished = true;
                }
            } finally {
                effekseerContext.endDraw();
            }
            if (handle && handle.exists) {
                if ((currentFrame === 3 || currentFrame % 10 === 0) && anythingLit()) lastLitFrame = currentFrame;
                if (repeatCheckbox && repeatCheckbox.checked && visibleFrames > 0 && currentFrame >= visibleFrames
                        && currentFrame > maxTimingFrames && !editorSelf._previewFlashActive()) {
                    pictureEnded = true;
                }
            }

            if (effectFinished || pictureEnded) {
                if (lastLitFrame > 0) visibleFrames = Math.max(visibleFrames, lastLitFrame);
                console.debug('[Effekseer Render] Effect finished');
                if (repeatCheckbox && repeatCheckbox.checked) {
                    console.debug('[Effekseer Render] Repeat enabled, restarting...');
                    stop();
                    play();
                } else {
                    console.debug('[Effekseer Render] Auto-stopping');
                    stop();
                }
                return;
            }

            if (renderFrameCount === 1) {
                console.debug('[Effekseer Render] First frame rendered successfully');
            }

            animationFrameId = requestAnimationFrame(render);
        };

        // Play SE for current frame
        const playSE = (frameIndex) => {
            if (!animation.soundTimings) return;

            const soundTimings = animation.soundTimings.filter(st => st.frame === frameIndex && st.se && st.se.name);

            soundTimings.forEach(timing => {
                const se = timing.se;
                if (!se || !se.name) return;

                const path = require('path');
                const seFolder = path.join(currentProject.path, 'audio', 'se');
                const audioFile = RRAssetFiles.find(seFolder, se.name, RRAssetFiles.AUDIO_EXTENSIONS);
                if (!audioFile) return;

                const audio = new Audio(RRAssetFiles.toUrl(audioFile.absolutePath));
                audio.volume = (Number.isFinite(se.volume) ? se.volume : 90) / 100;
                audio.playbackRate = (se.pitch || 100) / 100;

                audio.play().catch(err => {
                    console.warn(`Failed to play SE: ${se.name}`, err);
                });
            });
        };

        // Play button handler
        const play = () => {
            if (!effect || !effect.isLoaded) {
                console.warn('Effect not loaded yet');
                return;
            }

            if (isPlaying) return;

            isPlaying = true;
            startTime = Date.now();
            currentFrame = 0;
            lastLitFrame = 0;
            renderFrameCount = 0;
            lastTime = Date.now();
            accumulator = 0;
            editorSelf._resetPreviewFlash();
            if (editorSelf._previewBgCanvas) {
                const previewCtx = editorSelf._previewBgCanvas.getContext('2d');
                if (previewCtx) editorSelf._drawPreviewBackground(previewCtx, editorSelf._previewBgCanvas);
            }

            // Play effect
            handle = effekseerContext.play(effect);

            if (handle) {
                // Set effect parameters from animation data
                const scale = (animation.scale || 100) / 100;
                const speed = (animation.speed || 100) / 100;
                const rotation = animation.rotation || { x: 0, y: 0, z: 0 };
                const offsetX = animation.offsetX || 0;
                const offsetY = animation.offsetY || 0;

                const rx = (rotation.x * Math.PI) / 180;
                const ry = (rotation.y * Math.PI) / 180;
                const rz = (rotation.z * Math.PI) / 180;

                // Scale offsets to work as pixels (divide by scale factor)
                const offsetScale = 0.1; // Scale factor to make offsets work as pixels
                handle.setLocation(offsetX * offsetScale, offsetY * offsetScale, 0);
                handle.setRotation(rx, ry, rz);
                handle.setScale(scale, scale, scale);
                handle.setSpeed(speed);

                console.debug('Playing Effekseer effect with params:', { scale, speed, rotation, offsetX, offsetY });
            }

            const redrawBackground = advanceEffekseerTick();
            if (redrawBackground && editorSelf._previewBgCanvas) {
                const previewCtx = editorSelf._previewBgCanvas.getContext('2d');
                if (previewCtx) editorSelf._drawPreviewBackground(previewCtx, editorSelf._previewBgCanvas);
            }

            playBtn.disabled = true;
            playBtn.style.opacity = '0.5';
            stopBtn.disabled = false;
            stopBtn.style.opacity = '1';

            render();
        };

        // Stop button handler
        const stop = () => {
            isPlaying = false;
            editorSelf._resetPreviewFlash();

            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }

            if (handle) {
                handle.stop();
                handle = null;
            }

            // Clear WebGL canvas (transparent)
            if (gl) {
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            }

            // Redraw background canvas
            if (editorSelf._previewBgCanvas) {
                const bgCtx = editorSelf._previewBgCanvas.getContext('2d');
                if (bgCtx) editorSelf._drawPreviewBackground(bgCtx, editorSelf._previewBgCanvas);
            }

            currentFrame = 0;
            frameCounter.textContent = `${tt('Frame:')} 0`;

            playBtn.disabled = false;
            playBtn.style.opacity = '1';
            stopBtn.disabled = true;
            stopBtn.style.opacity = '0.5';
        };

        // Store stop function for cleanup when switching animations
        this._currentEffekseerStop = stop;

        // Initialize and load effect
        if (initWebGL()) {
            // Release the context pair on animation switch — WebGL contexts
            // are capped per page (~16 in Chromium) and are not reclaimed
            // just because their canvas left the DOM.
            this._registerDetailCleanup(() => {
                try { if (handle) handle.stop(); } catch (e) {}
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                    animationFrameId = null;
                }
                isPlaying = false;
                editorSelf._resetPreviewFlash();
                if (effekseerContext) {
                    try { if (effect) effekseerContext.releaseEffect(effect); } catch (e) {}
                    try { effekseer.releaseContext(effekseerContext); } catch (e) {}
                    effekseerContext = null;
                    effect = null;
                    handle = null;
                }
                if (gl && gl.getExtension) {
                    const lose = gl.getExtension('WEBGL_lose_context');
                    if (lose) { try { lose.loseContext(); } catch (e) {} }
                    gl = null;
                }
            });
            loadEffect();
        } else {
            // Display error on canvas
            gl = canvas.getContext('2d');
            if (gl) {
                gl.fillStyle = '#ff6666';
                gl.font = '14px Arial';
                gl.textAlign = 'center';
                gl.fillText(tt('WebGL initialization failed'), canvas.width / 2, canvas.height / 2);
            }
        }

        // Set up button handlers
        playBtn.addEventListener('click', play);
        stopBtn.addEventListener('click', stop);

        // Set up Effekseer parameter controls
        const editorSelf2 = this;
        const setupEffekseerControls = () => {
            const scaleInput = document.getElementById('effekseer-scale');
            const speedInput = document.getElementById('effekseer-speed');
            const rotXInput = document.getElementById('effekseer-rotation-x');
            const rotYInput = document.getElementById('effekseer-rotation-y');
            const rotZInput = document.getElementById('effekseer-rotation-z');
            const offsetXInput = document.getElementById('effekseer-offset-x');
            const offsetYInput = document.getElementById('effekseer-offset-y');
            const displayTypeSelect = document.getElementById('effekseer-display-type');

            const updateAnimation = () => {
                const clampInput = (input, fallback, min, max) => {
                    const parsed = parseInt(input?.value, 10);
                    const value = Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : fallback));
                    if (input) input.value = String(value);
                    return value;
                };
                // Update animation data
                animation.scale = clampInput(scaleInput, 100, 1, 1000);
                animation.speed = clampInput(speedInput, 100, 1, 1000);
                animation.displayType = displayTypeSelect ? parseInt(displayTypeSelect.value) : (animation.displayType || 0);
                animation.rotation = {
                    x: clampInput(rotXInput, 0, -360, 360),
                    y: clampInput(rotYInput, 0, -360, 360),
                    z: clampInput(rotZInput, 0, -360, 360)
                };
                animation.offsetX = parseInt(offsetXInput?.value) || 0;
                animation.offsetY = parseInt(offsetYInput?.value) || 0;

                // Persist to database
                if (editorSelf2.databaseManager && editorSelf2.databaseManager.updateAnimation) {
                    editorSelf2.databaseManager.updateAnimation(animation.id, animation);
                }

                // Update live effect if playing
                if (handle && isPlaying) {
                    const scale = animation.scale / 100;
                    const speed = animation.speed / 100;
                    const rx = (animation.rotation.x * Math.PI) / 180;
                    const ry = (animation.rotation.y * Math.PI) / 180;
                    const rz = (animation.rotation.z * Math.PI) / 180;

                    // Scale offsets to work as pixels
                    const offsetScale = 0.1;
                    handle.setLocation(animation.offsetX * offsetScale, animation.offsetY * offsetScale, 0);
                    handle.setRotation(rx, ry, rz);
                    handle.setScale(scale, scale, scale);
                    handle.setSpeed(speed);
                }

                console.debug('Updated Effekseer animation parameters:', animation);
            };

            scaleInput?.addEventListener('change', updateAnimation);
            speedInput?.addEventListener('change', updateAnimation);
            rotXInput?.addEventListener('change', updateAnimation);
            rotYInput?.addEventListener('change', updateAnimation);
            rotZInput?.addEventListener('change', updateAnimation);
            offsetXInput?.addEventListener('change', updateAnimation);
            offsetYInput?.addEventListener('change', updateAnimation);
            displayTypeSelect?.addEventListener('change', updateAnimation);
        };

        setupEffekseerControls();

        // Set up 3D rotation sphere control
        const setupRotationSphere = () => {
            const sphereCanvas = document.getElementById('effekseer-rotation-sphere');
            if (!sphereCanvas) return;

            const ctx = sphereCanvas.getContext('2d');
            const width = sphereCanvas.width;
            const height = sphereCanvas.height;
            const centerX = width / 2;
            const centerY = height / 2;
            const radius = 60; // Scaled for 150x150 canvas

            // Canvas 2D can't parse CSS var(--…); resolve theme tokens to concrete colors.
            const colorTextMuted = ThemeColors.resolve('--color-text-muted', '#999999');
            const colorTextDim = ThemeColors.resolve('--color-text-dim', '#666666');
            const colorBgBase = ThemeColors.resolve('--color-bg-base', '#1a1a1a');
            const colorDangerPressed = ThemeColors.resolve('--color-danger-pressed', '#ff4444');

            // Rotation state
            let rotationX = animation.rotation?.x || 0;
            let rotationY = animation.rotation?.y || 0;
            let rotationZ = animation.rotation?.z || 0;

            // Mouse tracking
            let isDragging = false;
            let lastMouseX = 0;
            let lastMouseY = 0;

            // Draw the 3D sphere
            const drawSphere = () => {
                // Clear canvas
                ctx.clearRect(0, 0, width, height);

                // Draw background gradient
                const bgGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 1.5);
                bgGradient.addColorStop(0, 'rgba(80, 80, 80, 0.2)');
                bgGradient.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
                ctx.fillStyle = bgGradient;
                ctx.fillRect(0, 0, width, height);

                // Draw sphere with lighting
                const gradient = ctx.createRadialGradient(
                    centerX - radius * 0.3,
                    centerY - radius * 0.3,
                    radius * 0.1,
                    centerX,
                    centerY,
                    radius
                );
                gradient.addColorStop(0, colorTextMuted);
                gradient.addColorStop(0.5, '#444444');
                gradient.addColorStop(1, colorBgBase);

                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                ctx.fill();

                // Draw outline
                ctx.strokeStyle = colorTextDim;
                ctx.lineWidth = 2;
                ctx.stroke();

                // Calculate rotation matrices for axes
                const toRad = Math.PI / 180;
                const rx = rotationX * toRad;
                const ry = rotationY * toRad;
                const rz = rotationZ * toRad;

                // Helper function to rotate a 3D point and project to 2D
                const project3D = (x, y, z) => {
                    // Apply rotation transforms (ZYX order, matching Effekseer)
                    // Rotate around Z axis
                    let x1 = x * Math.cos(rz) - y * Math.sin(rz);
                    let y1 = x * Math.sin(rz) + y * Math.cos(rz);
                    let z1 = z;

                    // Rotate around Y axis
                    let x2 = x1 * Math.cos(ry) + z1 * Math.sin(ry);
                    let y2 = y1;
                    let z2 = -x1 * Math.sin(ry) + z1 * Math.cos(ry);

                    // Rotate around X axis
                    let x3 = x2;
                    let y3 = y2 * Math.cos(rx) - z2 * Math.sin(rx);
                    let z3 = y2 * Math.sin(rx) + z2 * Math.cos(rx);

                    // Simple orthographic projection
                    return {
                        x: centerX + x3,
                        y: centerY - y3, // Invert Y for canvas coords
                        z: z3 // For depth sorting
                    };
                };

                // Draw latitude/longitude grid lines on sphere for better 3D perception
                ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)';
                ctx.lineWidth = 1;

                // Draw latitude lines
                for (let lat = -60; lat <= 60; lat += 30) {
                    const latRad = lat * toRad;
                    const r = Math.cos(latRad) * radius;
                    const yOffset = Math.sin(latRad) * radius;

                    ctx.beginPath();
                    let firstPoint = true;
                    for (let lon = 0; lon <= 360; lon += 10) {
                        const lonRad = lon * toRad;
                        const x = r * Math.cos(lonRad);
                        const z = r * Math.sin(lonRad);
                        const proj = project3D(x, yOffset, z);

                        // Only draw if on visible side (z > -radius * 0.3)
                        if (proj.z > -radius * 0.3) {
                            if (firstPoint) {
                                ctx.moveTo(proj.x, proj.y);
                                firstPoint = false;
                            } else {
                                ctx.lineTo(proj.x, proj.y);
                            }
                        } else {
                            firstPoint = true;
                        }
                    }
                    ctx.stroke();
                }

                // Draw longitude lines
                for (let lon = 0; lon < 360; lon += 30) {
                    const lonRad = lon * toRad;

                    ctx.beginPath();
                    let firstPoint = true;
                    for (let lat = -90; lat <= 90; lat += 10) {
                        const latRad = lat * toRad;
                        const r = Math.cos(latRad) * radius;
                        const yOffset = Math.sin(latRad) * radius;
                        const x = r * Math.cos(lonRad);
                        const z = r * Math.sin(lonRad);
                        const proj = project3D(x, yOffset, z);

                        // Only draw if on visible side
                        if (proj.z > -radius * 0.3) {
                            if (firstPoint) {
                                ctx.moveTo(proj.x, proj.y);
                                firstPoint = false;
                            } else {
                                ctx.lineTo(proj.x, proj.y);
                            }
                        } else {
                            firstPoint = true;
                        }
                    }
                    ctx.stroke();
                }

                // Draw equator ring (Z-axis rotation indicator)
                ctx.strokeStyle = 'rgba(120, 120, 180, 0.5)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                let firstEquatorPoint = true;
                for (let angle = 0; angle <= 360; angle += 5) {
                    const angleRad = angle * toRad;
                    const x = radius * Math.cos(angleRad);
                    const z = radius * Math.sin(angleRad);
                    const proj = project3D(x, 0, z);

                    if (proj.z > -radius * 0.3) {
                        if (firstEquatorPoint) {
                            ctx.moveTo(proj.x, proj.y);
                            firstEquatorPoint = false;
                        } else {
                            ctx.lineTo(proj.x, proj.y);
                        }
                    } else {
                        firstEquatorPoint = true;
                    }
                }
                ctx.stroke();

                // Draw axes
                const axisLength = radius * 0.9;
                const axes = [
                    { dir: [axisLength, 0, 0], color: colorDangerPressed, label: 'X' }, // Red for X
                    { dir: [0, axisLength, 0], color: '#44ff44', label: 'Y' }, // Green for Y
                    { dir: [0, 0, axisLength], color: '#4444ff', label: 'Z' }  // Blue for Z
                ];

                // Sort axes by depth (draw furthest first)
                const projectedAxes = axes.map(axis => {
                    const end = project3D(axis.dir[0], axis.dir[1], axis.dir[2]);
                    return { ...axis, end, depth: end.z };
                }).sort((a, b) => a.depth - b.depth);

                // Draw each axis with depth perception
                projectedAxes.forEach(axis => {
                    const isBehind = axis.depth < 0;
                    const opacity = isBehind ? 0.3 : 1.0;

                    // Draw axis line (dashed if behind)
                    ctx.strokeStyle = axis.color;
                    ctx.globalAlpha = opacity;
                    ctx.lineWidth = isBehind ? 2 : 3;

                    if (isBehind) {
                        ctx.setLineDash([5, 5]);
                    } else {
                        ctx.setLineDash([]);
                    }

                    ctx.beginPath();
                    ctx.moveTo(centerX, centerY);
                    ctx.lineTo(axis.end.x, axis.end.y);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    // Draw arrowhead (smaller if behind)
                    const angle = Math.atan2(axis.end.y - centerY, axis.end.x - centerX);
                    const arrowSize = isBehind ? 6 : 8;
                    ctx.fillStyle = axis.color;
                    ctx.beginPath();
                    ctx.moveTo(axis.end.x, axis.end.y);
                    ctx.lineTo(
                        axis.end.x - arrowSize * Math.cos(angle - Math.PI / 6),
                        axis.end.y - arrowSize * Math.sin(angle - Math.PI / 6)
                    );
                    ctx.lineTo(
                        axis.end.x - arrowSize * Math.cos(angle + Math.PI / 6),
                        axis.end.y - arrowSize * Math.sin(angle + Math.PI / 6)
                    );
                    ctx.closePath();
                    ctx.fill();

                    // Draw sphere at axis endpoint for better 3D feel
                    ctx.fillStyle = axis.color;
                    ctx.beginPath();
                    ctx.arc(axis.end.x, axis.end.y, isBehind ? 3 : 4, 0, Math.PI * 2);
                    ctx.fill();

                    // Draw label with glow effect
                    ctx.globalAlpha = 1.0;
                    ctx.font = 'bold 14px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const labelDist = 15;
                    const labelX = axis.end.x + labelDist * Math.cos(angle);
                    const labelY = axis.end.y + labelDist * Math.sin(angle);

                    // Glow effect
                    ctx.shadowColor = axis.color;
                    ctx.shadowBlur = 8;
                    ctx.fillStyle = axis.color;
                    ctx.fillText(axis.label, labelX, labelY);
                    ctx.shadowBlur = 0;
                });

                // Reset global alpha
                ctx.globalAlpha = 1.0;
            };

            // Update rotation from input fields
            const updateFromInputs = () => {
                const rotXInput = document.getElementById('effekseer-rotation-x');
                const rotYInput = document.getElementById('effekseer-rotation-y');
                const rotZInput = document.getElementById('effekseer-rotation-z');

                rotationX = parseInt(rotXInput?.value) || 0;
                rotationY = parseInt(rotYInput?.value) || 0;
                rotationZ = parseInt(rotZInput?.value) || 0;

                drawSphere();
            };

            // Update input fields from sphere rotation
            const updateInputs = () => {
                const rotXInput = document.getElementById('effekseer-rotation-x');
                const rotYInput = document.getElementById('effekseer-rotation-y');
                const rotZInput = document.getElementById('effekseer-rotation-z');

                if (rotXInput) rotXInput.value = Math.round(rotationX);
                if (rotYInput) rotYInput.value = Math.round(rotationY);
                if (rotZInput) rotZInput.value = Math.round(rotationZ);

                // Trigger animation update
                animation.rotation = {
                    x: Math.round(rotationX),
                    y: Math.round(rotationY),
                    z: Math.round(rotationZ)
                };

                // Update live effect if playing
                if (handle && isPlaying) {
                    const rx = (rotationX * Math.PI) / 180;
                    const ry = (rotationY * Math.PI) / 180;
                    const rz = (rotationZ * Math.PI) / 180;
                    handle.setRotation(rx, ry, rz);
                }
            };

            // Mouse event handlers
            sphereCanvas.addEventListener('mousedown', (e) => {
                isDragging = true;
                lastMouseX = e.offsetX;
                lastMouseY = e.offsetY;
                sphereCanvas.style.cursor = 'grabbing';
            });

            sphereCanvas.addEventListener('mousemove', (e) => {
                if (!isDragging) return;

                const deltaX = e.offsetX - lastMouseX;
                const deltaY = e.offsetY - lastMouseY;

                // Convert mouse movement to rotation
                // Horizontal drag = Y axis rotation
                // Vertical drag = X axis rotation
                const sensitivity = 0.5;
                rotationY += deltaX * sensitivity;
                rotationX += deltaY * sensitivity;

                // Normalize angles to -360 to 360 range
                rotationX = ((rotationX + 360) % 360);
                rotationY = ((rotationY + 360) % 360);
                if (rotationX > 180) rotationX -= 360;
                if (rotationY > 180) rotationY -= 360;

                lastMouseX = e.offsetX;
                lastMouseY = e.offsetY;

                drawSphere();
                updateInputs();
            });

            sphereCanvas.addEventListener('mouseup', () => {
                isDragging = false;
                sphereCanvas.style.cursor = 'grab';
            });

            sphereCanvas.addEventListener('mouseleave', () => {
                if (isDragging) {
                    isDragging = false;
                    sphereCanvas.style.cursor = 'grab';
                }
            });

            // Watch for input field changes to update sphere
            const rotXInput = document.getElementById('effekseer-rotation-x');
            const rotYInput = document.getElementById('effekseer-rotation-y');
            const rotZInput = document.getElementById('effekseer-rotation-z');

            rotXInput?.addEventListener('change', updateFromInputs);
            rotYInput?.addEventListener('change', updateFromInputs);
            rotZInput?.addEventListener('change', updateFromInputs);

            // Initial draw
            drawSphere();
        };

        setupRotationSphere();

        // Initial state
        playBtn.disabled = true;
        playBtn.style.opacity = '0.5';
        stopBtn.disabled = true;
        stopBtn.style.opacity = '0.5';
    }

    showEffectFilePicker(animation, container) {
        const currentProject = this.projectManager.getCurrentProject();
        if (!currentProject) return;

        const tt = text => window.I18n ? window.I18n.tText(text) : text;

        const fs = require('fs');
        const path = require('path');

        // Get list of .efkefc files from effects folder
        const effectsPath = path.join(currentProject.path, 'effects');
        let effectFiles = [];

        try {
            if (fs.existsSync(effectsPath)) {
                effectFiles = RRAssetFiles.listNames(effectsPath, ['.efkefc']);
            }
        } catch (err) {
            console.error('Error reading effects folder:', err);
        }

        // Remove existing modal if any
        const existingModal = document.getElementById('effect-picker-modal');
        if (existingModal) existingModal.remove();
        const previousFocus = document.activeElement;

        const modalHTML = `
            <div id="effect-picker-modal" class="rr-modal-overlay" style="z-index: 10600;">
                <div class="rr-modal rr-effect-picker-modal" role="dialog" aria-modal="true" aria-labelledby="effect-picker-title" style="width: min(960px, calc(100vw - 24px)); max-height: 80vh;">
                    <div class="rr-modal-header">
                        <div id="effect-picker-title" class="rr-modal-title">${tt('Select Effect File')}</div>
                        <button id="effect-picker-close" class="rr-modal-close" type="button" aria-label="${tt('Close')}">×</button>
                    </div>

                    <div class="rr-effect-picker-body" style="display: flex; gap: 16px; flex: 1; min-height: 0; padding: 16px;">
                        <!-- Left: Effect list -->
                        <div id="effect-browser-host" style="flex: 1; min-width: 250px; min-height: 0; overflow: hidden; border: 1px solid var(--color-border); border-radius: 4px;"></div>

                        <!-- Right: Preview -->
                        <div class="rr-effect-picker-preview" style="flex: 1; display: flex; flex-direction: column; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; padding: 10px;">
                            <div style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 8px;">${tt('Preview')}</div>
                            <div style="flex: 1; display: flex; align-items: center; justify-content: center; background: var(--color-bg-deep); border: 1px solid var(--color-border-input); border-radius: 3px; position: relative;">
                                <canvas id="effect-preview-canvas" width="400" height="300" style="max-width: 100%; max-height: 100%;"></canvas>
                                <div id="effect-preview-message" style="position: absolute; color: var(--color-text-muted); font-size: 12px; text-align: center;">${tt('Select an effect to preview')}</div>
                            </div>
                        </div>
                    </div>

                    <div class="rr-modal-footer">
                        <button id="effect-picker-cancel" class="rr-btn-secondary">${tt('Cancel')}</button>
                        <button id="effect-picker-ok" class="rr-button-primary">${tt('OK')}</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const modal = document.getElementById('effect-picker-modal');
        const closeBtn = document.getElementById('effect-picker-close');
        const cancelBtn = document.getElementById('effect-picker-cancel');
        const okBtn = document.getElementById('effect-picker-ok');
        const browserHost = document.getElementById('effect-browser-host');
        const previewCanvas = document.getElementById('effect-preview-canvas');
        const previewMessage = document.getElementById('effect-preview-message');

        let selectedEffect = animation.effectName || '';

        // Set up preview
        let previewEffekseerContext = null;
        let previewGL = null;
        let previewEffect = null;
        let previewHandle = null;
        let previewAnimationFrameId = null;
        let currentPreviewEffect = null;
        let previewRequestId = 0;
        let modalClosed = false;
        const loadedEffects = new Set();
        const pendingEffects = new Set();

        const stopPreviewPlayback = () => {
            previewRequestId++;
            if (previewAnimationFrameId) {
                cancelAnimationFrame(previewAnimationFrameId);
                previewAnimationFrameId = null;
            }
            if (previewHandle) {
                try { previewHandle.stop(); } catch (e) {}
                previewHandle = null;
            }
            currentPreviewEffect = null;
        };

        const releasePreviewEffect = () => {
            if (!previewEffect || !previewEffekseerContext) return;
            try {
                // Stopped instances retire on subsequent updates; advance them
                // before freeing their effect memory.
                previewEffekseerContext.update();
                previewEffekseerContext.update();
                previewEffekseerContext.releaseEffect(previewEffect);
            } catch (e) {}
            loadedEffects.delete(previewEffect);
            previewEffect = null;
        };

        const initPreview = () => {
            if (!window._effekseerReady) {
                previewMessage.textContent = tt('Effekseer not initialized');
                return false;
            }

            try {
                previewGL = previewCanvas.getContext('webgl', { premultipliedAlpha: false }) ||
                           previewCanvas.getContext('experimental-webgl', { premultipliedAlpha: false });

                if (!previewGL) {
                    previewMessage.textContent = tt('WebGL not supported');
                    return false;
                }

                previewEffekseerContext = effekseer.createContext();
                if (!previewEffekseerContext) {
                    previewMessage.textContent = tt('Failed to create Effekseer context');
                    return false;
                }

                previewEffekseerContext.init(previewGL);
                previewEffekseerContext.setRestorationOfStatesFlag(true);
                return true;
            } catch (e) {
                console.error('Preview initialization error:', e);
                previewMessage.textContent = tt('Preview initialization failed');
                return false;
            }
        };

        const playPreview = (effectName) => {
            if (!previewEffekseerContext || !previewGL) return;

            stopPreviewPlayback();
            releasePreviewEffect();

            const requestId = previewRequestId;
            currentPreviewEffect = effectName;
            previewMessage.style.display = 'none';

            const effectFile = RRAssetFiles.find(effectsPath, effectName, ['.efkefc']);
            if (!effectFile) {
                previewMessage.style.display = 'block';
                previewMessage.textContent = tt('Failed to load effect');
                return;
            }
            const effectPath = effectFile.absolutePath;

            const startPlayback = () => {
                if (requestId !== previewRequestId || currentPreviewEffect !== effectName) return;

                previewHandle = previewEffekseerContext.play(previewEffect);
                if (previewHandle) {
                    const scale = (animation.scale || 100) / 100;
                    const speed = (animation.speed || 100) / 100;
                    const rotation = animation.rotation || { x: 0, y: 0, z: 0 };
                    const offsetScale = 0.1;
                    previewHandle.setLocation((animation.offsetX || 0) * offsetScale,
                        (animation.offsetY || 0) * offsetScale, 0);
                    previewHandle.setRotation((rotation.x * Math.PI) / 180,
                        (rotation.y * Math.PI) / 180, (rotation.z * Math.PI) / 180);
                    previewHandle.setScale(scale, scale, scale);
                    previewHandle.setSpeed(speed);
                }

                // Render loop
                let lastTime = Date.now();
                let accumulator = 0;
                const fixedTimeStep = 1000 / 60;

                const render = () => {
                    if (requestId !== previewRequestId || currentPreviewEffect !== effectName) return;

                    const now = Date.now();
                    const deltaTime = now - lastTime;
                    lastTime = now;
                    accumulator += deltaTime;

                    while (accumulator >= fixedTimeStep) {
                        previewEffekseerContext.update();
                        accumulator -= fixedTimeStep;
                    }

                    if (accumulator > fixedTimeStep * 5) {
                        accumulator = 0;
                    }

                    // Clear
                    previewGL.viewport(0, 0, previewCanvas.width, previewCanvas.height);
                    previewGL.clearColor(0, 0, 0, 1);
                    previewGL.clear(previewGL.COLOR_BUFFER_BIT | previewGL.DEPTH_BUFFER_BIT);

                    // Setup matrices - balanced FOV
                    const viewportSize = previewCanvas.height * 1.2; // Balanced FOV to fill canvas without clipping
                    const x = previewCanvas.height / previewCanvas.width;
                    const y = 1;
                    const p = -(viewportSize / previewCanvas.height);

                    previewEffekseerContext.setProjectionMatrix([
                        x, 0, 0, 0,
                        0, y, 0, 0,
                        0, 0, 1, p,
                        0, 0, 0, 1
                    ]);

                    previewEffekseerContext.setCameraMatrix([
                        1, 0, 0, 0,
                        0, 1, 0, 0,
                        0, 0, 1, 0,
                        0, 0, -10, 1
                    ]);

                    // Draw
                    previewEffekseerContext.beginDraw();
                    if (previewHandle && previewHandle.exists) {
                        previewEffekseerContext.drawHandle(previewHandle);
                        previewAnimationFrameId = requestAnimationFrame(render);
                    } else {
                        // Effect finished — replay the already-loaded effect
                        startPlayback();
                    }
                    previewEffekseerContext.endDraw();
                };

                render();
            };

            const onError = (message) => {
                console.error('Preview load error:', message);
                if (modalClosed || requestId !== previewRequestId
                        || currentPreviewEffect !== effectName) return;
                previewMessage.style.display = 'block';
                previewMessage.textContent = tt('Failed to load effect');
            };

            // onLoad can fire synchronously inside loadEffect when the core
            // already caches every resource — `pending` is not assigned yet
            // in that case, so defer installation to after the call. The
            // selection guard keeps a slow stale load from clobbering
            // previewEffect after the user has picked a different effect.
            let pending = null;
            let syncLoaded = false;
            let syncFailed = false;
            const releasePending = () => {
                if (!pending) return;
                pendingEffects.delete(pending);
                try { previewEffekseerContext?.releaseEffect(pending); } catch (e) {}
                pending = null;
            };
            const install = () => {
                if (modalClosed) return;
                pendingEffects.delete(pending);
                loadedEffects.add(pending);
                if (requestId !== previewRequestId || currentPreviewEffect !== effectName) {
                    try { previewEffekseerContext.releaseEffect(pending); } catch (e) {}
                    loadedEffects.delete(pending);
                    return;
                }
                previewEffect = pending;
                startPlayback();
            };
            const onLoad = () => {
                if (pending) install();
                else syncLoaded = true;
            };
            const handleError = message => {
                if (pending) releasePending();
                else syncFailed = true;
                onError(message);
            };

            try {
                pending = RR_loadEffekseerEffectFromFile(
                    previewEffekseerContext, effectPath, 1.0, onLoad, handleError
                );
                if (pending) pendingEffects.add(pending);
            } catch (e) {
                handleError(e.message);
                return;
            }
            if (syncFailed) {
                releasePending();
                return;
            }
            if (syncLoaded) install();
        };

        // Initialize preview
        const previewReady = initPreview();
        if (previewReady) {
            previewMessage.textContent = tt('Select an effect to preview');
        }

        // Close modal
        const closeModal = (restoreFocus = true) => {
            if (modalClosed) return;
            modalClosed = true;
            // Clean up preview, releasing the WebGL/effekseer context pair —
            // contexts are capped per page and survive DOM removal.
            stopPreviewPlayback();
            if (previewEffekseerContext) {
                releasePreviewEffect();
                for (const effect of loadedEffects) {
                    try { previewEffekseerContext.releaseEffect(effect); } catch (e) {}
                }
                loadedEffects.clear();
                for (const effect of pendingEffects) {
                    try { previewEffekseerContext.releaseEffect(effect); } catch (e) {}
                }
                pendingEffects.clear();
                try { effekseer.releaseContext(previewEffekseerContext); } catch (e) {}
                previewEffekseerContext = null;
            }
            if (previewGL) {
                const lose = previewGL.getExtension && previewGL.getExtension('WEBGL_lose_context');
                if (lose) { try { lose.loseContext(); } catch (e) {} }
                previewGL = null;
            }

            modal.remove();
            document.removeEventListener('keydown', onKeyDown);
            if (restoreFocus) previousFocus?.focus?.();
        };

        const confirmSelection = () => {
            animation.effectName = selectedEffect;
            this.databaseManager?.updateAnimation?.(animation.id, animation);
            const effectNameDisplay = document.getElementById('effekseer-effect-name');
            if (effectNameDisplay) effectNameDisplay.textContent = selectedEffect || tt('None');
            closeModal(false);
            this.showAnimationDetail(container, animation);
            document.getElementById('effekseer-pick-effect')?.focus();
        };

        const browser = RRPickerIndex.createBrowser({
            files: effectFiles,
            selectedName: selectedEffect,
            folders: true,
            searchPlaceholder: tt('Search effects...'),
            emptyText: tt('No effect files found in effects/ folder'),
            itemClass: 'effect-item',
            onSelect: effectName => {
                selectedEffect = effectName;
                if (previewReady) playPreview(effectName);
            },
            leadingItem: {
                label: tt('(None)'),
                onClick: () => {
                    selectedEffect = '';
                    stopPreviewPlayback();
                    releasePreviewEffect();
                    previewMessage.style.display = 'block';
                    previewMessage.textContent = tt('Select an effect to preview');
                },
                onDoubleClick: confirmSelection
            }
        });
        browser.list.classList.add('rr-accent-scrollbar');
        browser.rail.classList.add('rr-accent-scrollbar');
        browserHost.appendChild(browser.element);
        browser.list.addEventListener('dblclick', event => {
            const item = event.target.closest('.rr-picker-file-item');
            if (!item?.dataset.fileName) return;
            selectedEffect = item.dataset.fileName;
            confirmSelection();
        });
        if (selectedEffect) {
            browser.scrollTo(selectedEffect);
            if (previewReady) playPreview(selectedEffect);
        }
        browser.focusSelected();

        const onKeyDown = event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeModal();
            } else if (event.key === 'Tab') {
                const focusable = Array.from(modal.querySelectorAll(
                    'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
                ));
                if (!focusable.length) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener('keydown', onKeyDown);

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        okBtn.addEventListener('mouseenter', () => { okBtn.style.backgroundColor = 'var(--color-accent-muted)'; });
        okBtn.addEventListener('mouseleave', () => { okBtn.style.backgroundColor = 'var(--color-accent)'; });

        okBtn.addEventListener('click', confirmSelection);

        // Close on background click
        modal.addEventListener('click', (e) => {
            // A click on the backdrop no longer closes the dialog: an accidental
            // click beside it must never cost in-progress work. Close deliberately.
        });
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DatabaseAnimationEditor;
}
