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
    }

    showAnimationDetail(container, animation) {
        // Stop any currently playing animation before switching
        if (this._currentEffekseerStop) {
            this._currentEffekseerStop();
            this._currentEffekseerStop = null;
        }

        container.innerHTML = '';
        container.style.overflow = '';
        container.style.display = '';
        container.style.flexDirection = '';
        container.style.padding = '10px';

        // Determine animation type
        const isEffekseer = animation.effectName !== undefined;
        const isSpriteAnimation = animation.animation1Name !== undefined && animation.animation1Name !== '';

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
                    background: rgba(255, 215, 0, 0.12);
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
            </style>
            <div class="anim-editor-root" style="display: flex; flex-direction: column; gap: 10px; width: 100%; height: 100%;">
                <!-- Header with black background -->
                <div style="background: var(--color-bg-deep); padding: 8px 12px; border: 1px solid var(--color-border); border-radius: 3px; flex-shrink: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
                        <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
                            <span style="font-size: 10px; color: var(--color-text-muted); white-space: nowrap; padding: 4px 6px; background: var(--color-bg-base); border: 1px solid var(--color-border-subtle); border-radius: 3px;">ID: ${animation.id}</span>
                            <label for="animation-name-input" style="font-size: 10px; color: var(--color-text-muted); flex-shrink: 0;">Name:</label>
                            <input id="animation-name-input" type="text" value="${(animation.name || '').replace(/"/g, '&quot;')}" placeholder="Unnamed Animation" style="font-size: 13px; font-weight: 600; color: var(--color-text-strong); background: var(--color-bg-input); border: 1px solid var(--color-border-input); border-radius: 3px; padding: 4px 8px; outline: none; flex: 1; max-width: 320px; font-family: inherit;">
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                            <label style="font-size: 10px; color: var(--color-text-muted);">Type:</label>
                            <div id="animation-type-selector" data-value="${isEffekseer ? 'effekseer' : 'sprite'}" tabindex="0" style="position: relative; padding: 4px 24px 4px 10px; background: var(--color-accent-tint-15); border: 1px solid var(--color-accent-border-mid); color: var(--color-accent-bright); border-radius: 3px; cursor: pointer; font-size: 11px; font-weight: 600; outline: none; min-width: 110px; user-select: none;">
                            <span class="animation-type-label">${isEffekseer ? 'Effekseer' : 'Sprite-based'}</span>
                            <span style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); font-size: 9px;">▼</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Properties and Timings Row (Top) -->
                <div style="display: flex; gap: 10px; flex-wrap: nowrap; flex-shrink: 0;">
                    <!-- Properties -->
                    <div style="flex: 0 0 33%; min-width: 200px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 3px; padding: 8px; display: flex; flex-direction: column;">
                        <div style="font-size: 11px; font-weight: 600; margin-bottom: 8px; color: var(--color-text); flex-shrink: 0;">Properties</div>
                        <div style="display: flex; flex-direction: column; gap: 8px; font-size: 10px; flex: 1; min-height: 0; padding-right: 4px;">
                            ${isSpriteAnimation ? `
                                ${[1, 2].map(slot => {
                                    const hue = (slot === 1 ? animation.animation1Hue : animation.animation2Hue) || 0;
                                    const name = (slot === 1 ? animation.animation1Name : animation.animation2Name) || 'None';
                                    return `
                                <div>
                                    <div style="color: var(--color-text-muted); margin-bottom: 4px; font-weight: 600;">Animation ${slot}</div>
                                    <div style="display: flex; gap: 4px; margin-bottom: 5px;">
                                        <div id="anim${slot}-name-display" style="flex: 1; min-width: 0; background: var(--color-bg-input-alt); padding: 6px; border: 1px solid var(--color-border-input); border-radius: 2px; word-break: break-word;">${name}</div>
                                        <button id="anim${slot}-pick-btn" style="padding: 4px 10px; background: var(--color-accent-tint-15); border: 1px solid var(--color-accent-border-mid); color: var(--color-accent-bright); border-radius: 3px; cursor: pointer; font-size: 11px; font-weight: 600; white-space: nowrap;">...</button>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 6px;">
                                        <label for="anim${slot}-hue-slider" style="color: var(--color-text-muted); font-size: 10px; flex-shrink: 0;">Hue</label>
                                        <input id="anim${slot}-hue-slider" class="hue-slider" type="range" min="0" max="360" value="${hue}" style="flex: 1; min-width: 0;">
                                        <span id="anim${slot}-hue-value" style="color: var(--color-text); font-size: 10px; min-width: 32px; text-align: right; font-variant-numeric: tabular-nums;">${hue}°</span>
                                    </div>
                                </div>`;
                                }).join('')}
                                <div style="display: flex; gap: 8px;">
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="color: var(--color-text-muted); margin-bottom: 4px;">Position</div>
                                        <div id="anim-position-select" class="anim-gold-dropdown" data-value="${animation.position || 0}" tabindex="0" style="width: 100%; box-sizing: border-box;">
                                            ${['Head', 'Center', 'Feet', 'Screen'][animation.position || 0]}
                                        </div>
                                    </div>
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="color: var(--color-text-muted); margin-bottom: 4px;">Frames</div>
                                        <div style="background: var(--color-bg-input-alt); padding: 6px; border: 1px solid var(--color-border-input); border-radius: 2px; text-align: center; color: var(--color-text);">${animation.frames ? animation.frames.length : 0}</div>
                                    </div>
                                </div>
                            ` : ''}

                            ${isEffekseer ? `
                                <div style="color: var(--color-text-muted); font-size: 10px; font-style: italic; padding: 4px;">
                                    Effect file, display type, scale and other settings are editable in the Particle Effect panel below.
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Sound & Flash Timings -->
                    <div style="flex: 1; min-width: 400px; max-height: 220px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 3px; padding: 8px; display: flex; flex-direction: column;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-shrink: 0;">
                            <div style="font-size: 11px; font-weight: 600; color: var(--color-text);">SE & Flash Timings</div>
                            <button id="add-timing-btn" style="padding: 4px 8px; background: var(--color-success); border: 1px solid var(--color-success-border); color: var(--color-text-strong); border-radius: 2px; cursor: pointer; font-size: 10px;">+ Add</button>
                        </div>

                        <div id="timings-list" style="flex: 1; min-height: 0; overflow-y: auto; background: var(--color-bg-input-alt); border: 1px solid var(--color-border-input); border-radius: 2px; padding: 8px;">
                            <div style="font-size: 10px; color: var(--color-text-muted); padding: 6px;">No timings added</div>
                        </div>
                    </div>
                </div>

                <!-- Sprite Sheet Preview Row -->
                ${isSpriteAnimation ? `
                    <div style="background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 3px; padding: 8px; flex-shrink: 0;">
                        <div style="font-size: 11px; font-weight: 600; margin-bottom: 6px; color: var(--color-text);">Sprite Sheet</div>
                        <div style="overflow-x: auto; overflow-y: hidden; background: var(--color-bg-deep); border: 1px solid var(--color-border-input); border-radius: 2px; padding: 2px;">
                            <canvas id="sprite-sheet-preview" style="display: block; image-rendering: pixelated; height: 96px;"></canvas>
                        </div>
                    </div>
                ` : ''}

                <!-- Frames and Preview Row (Bottom) -->
                <div style="display: flex; gap: 10px; flex-wrap: nowrap; flex: 1; min-height: 0;">
                    <!-- Left: Frame Timeline or Particle Effect Controls -->
                    ${isSpriteAnimation ? `
                    <div style="width: 160px; min-width: 160px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 3px; padding: 8px; display: flex; flex-direction: column;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <div style="font-size: 11px; font-weight: 600; color: var(--color-text);">Frames</div>
                            <div style="display: flex; gap: 3px;">
                                <button id="add-frame-btn" style="padding: 3px 6px; background: var(--color-success); border: 1px solid var(--color-success-border); color: var(--color-text-strong); border-radius: 2px; cursor: pointer; font-size: 9px;" title="Add Frame">+</button>
                                <button id="remove-frame-btn" style="padding: 3px 6px; background: var(--color-danger); border: 1px solid var(--color-danger-border); color: var(--color-text); border-radius: 2px; cursor: pointer; font-size: 9px;" title="Remove Frame">-</button>
                            </div>
                        </div>
                        <div id="animation-frame-list" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 3px;">
                            <!-- Frame list will be populated here -->
                        </div>
                    </div>
                    ` : ''}

                    ${isEffekseer ? `
                    <div style="width: 280px; min-width: 280px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 3px; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
                        <div style="font-size: 11px; font-weight: 600; color: var(--color-text); margin-bottom: 2px;">Particle Effect</div>

                        <!-- Effect File -->
                        <div>
                            <div style="font-size: 10px; color: var(--color-text-muted); margin-bottom: 4px;">Effect File:</div>
                            <div style="display: flex; gap: 6px; align-items: stretch;">
                                <div id="effekseer-effect-name" style="flex: 1; background: var(--color-bg-input-alt); padding: 6px; border: 1px solid var(--color-border-input); border-radius: 2px; word-break: break-word; font-size: 11px; display: flex; align-items: center;">${animation.effectName || 'None'}</div>
                                <button id="effekseer-pick-effect" style="padding: 6px 12px; background: var(--color-info); border: 1px solid #3a7a9a; color: var(--color-text-strong); border-radius: 2px; cursor: pointer; font-size: 10px; white-space: nowrap;">Change...</button>
                            </div>
                        </div>

                        <!-- Display Type -->
                        <div>
                            <div style="font-size: 10px; color: var(--color-text-muted); margin-bottom: 4px;">Display Type:</div>
                            <select id="effekseer-display-type" style="width: 100%; padding: 6px; background: var(--color-bg-input-alt); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 2px; font-size: 11px;">
                                <option value="0" ${animation.displayType === 0 ? 'selected' : ''}>For each target</option>
                                <option value="1" ${animation.displayType === 1 ? 'selected' : ''}>Center of all targets</option>
                                <option value="2" ${animation.displayType === 2 ? 'selected' : ''}>Center of the screen</option>
                            </select>
                        </div>

                        <!-- Scale -->
                        <div>
                            <div style="font-size: 10px; color: var(--color-text-muted); margin-bottom: 4px;">Scale (%):</div>
                            <input type="number" id="effekseer-scale" value="${animation.scale || 100}" min="1" max="1000" style="width: 100%; padding: 6px; background: var(--color-bg-input-alt); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 2px; font-size: 11px;">
                        </div>

                        <!-- Speed -->
                        <div>
                            <div style="font-size: 10px; color: var(--color-text-muted); margin-bottom: 4px;">Speed (%):</div>
                            <input type="number" id="effekseer-speed" value="${animation.speed || 100}" min="1" max="1000" style="width: 100%; padding: 6px; background: var(--color-bg-input-alt); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 2px; font-size: 11px;">
                        </div>

                        <!-- Rotation -->
                        <div>
                            <div style="font-size: 10px; color: var(--color-text-muted); margin-bottom: 6px;">Rotation:</div>
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
                            <div style="font-size: 10px; color: var(--color-text-muted); margin-bottom: 6px;">Offset:</div>
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
                            <div style="font-size: 10px; color: var(--color-text-muted); margin-bottom: 4px;">3D Rotation Control:</div>
                            <div style="display: flex; justify-content: center; align-items: center; background: var(--color-bg-base); border: 1px solid var(--color-border-input); border-radius: 4px; padding: 6px; overflow: hidden;">
                                <canvas id="effekseer-rotation-sphere" width="150" height="150" style="cursor: grab; display: block;"></canvas>
                            </div>
                            <div style="font-size: 9px; color: var(--color-text-dim); margin-top: 3px; text-align: center;">Drag to rotate</div>
                        </div>
                    </div>
                    ` : ''}

                    <!-- Right: Preview + Controls -->
                    <div style="flex: 1; min-width: 600px; display: flex; flex-direction: column;">
                        <div style="background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 3px; padding: 10px; display: flex; flex-direction: column;">
                            <div style="font-size: 11px; font-weight: 600; margin-bottom: 6px; color: var(--color-text);">Preview</div>
                            <div class="rr-dark-surface" style="display: flex; align-items: center; justify-content: center; background: var(--color-bg-deep); border: 1px solid var(--color-border-input); position: relative; height: 470px;">
                                <canvas id="animation-preview-canvas" width="960" height="540" style="image-rendering: pixelated; max-width: 100%; max-height: 100%;"></canvas>
                                ${!isSpriteAnimation && !isEffekseer ? '<div style="color: var(--color-text-muted); position: absolute;">No preview available</div>' : ''}
                            </div>

                            <!-- Playback Controls -->
                            <div style="margin-top: 8px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                                <button id="animation-play-btn" style="padding: 5px 12px; background: var(--color-success); border: 1px solid var(--color-success-border); color: var(--color-text-strong); border-radius: 3px; cursor: pointer; font-size: 10px;">▶ Play</button>
                                <button id="animation-stop-btn" style="padding: 5px 12px; background: var(--color-danger); border: 1px solid var(--color-danger-border); color: var(--color-text); border-radius: 3px; cursor: pointer; font-size: 10px;">■ Stop</button>
                                ${isEffekseer ? `
                                <label style="display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--color-text); cursor: pointer; margin-left: 4px;">
                                    <input type="checkbox" id="animation-repeat-checkbox" style="cursor: pointer;">
                                    <span>Repeat</span>
                                </label>
                                ` : ''}
                                <div style="flex: 1; text-align: right; font-size: 9px; color: var(--color-text-muted); min-width: 100px;">
                                    <span id="animation-frame-counter">Frame: 0 / ${animation.frames ? animation.frames.length : 0}</span>
                                </div>
                            </div>

                            <!-- Preview Background & Target Controls -->
                            <div id="preview-controls-row" style="margin-top: 6px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 10px;">
                                <label style="display: flex; align-items: center; gap: 3px; color: var(--color-text); cursor: pointer;">
                                    <input type="checkbox" id="preview-bg-checkbox" style="cursor: pointer;">
                                    <span>Background</span>
                                </label>
                                <div id="preview-bb1-select" class="anim-gold-dropdown" tabindex="0" data-value="" style="font-size: 10px; min-width: 110px; max-width: 130px; padding: 3px 22px 3px 8px;">(none)</div>
                                <div id="preview-bb2-select" class="anim-gold-dropdown" tabindex="0" data-value="" style="font-size: 10px; min-width: 110px; max-width: 130px; padding: 3px 22px 3px 8px;">(none)</div>
                                <div style="width: 1px; height: 16px; background: var(--color-border-input); margin: 0 2px;"></div>
                                <label style="display: flex; align-items: center; gap: 3px; color: var(--color-text); cursor: pointer;">
                                    <input type="checkbox" id="preview-target-checkbox" style="cursor: pointer;">
                                    <span>Target</span>
                                </label>
                                <div id="preview-target-select" class="anim-gold-dropdown" tabindex="0" data-value="" style="font-size: 10px; min-width: 140px; max-width: 200px; padding: 3px 22px 3px 8px;">(none)</div>
                            </div>
                        </div>
                    </div>
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
                    selectedItem.textContent = animation.name || 'Unnamed';
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
                if (!currentProject) { alert('No project loaded'); return; }
                const path = require('path');
                const fs = require('fs');
                const animDir = path.join(currentProject.path, 'img', 'animations');
                let files;
                try {
                    files = fs.readdirSync(animDir).filter(f => f.endsWith('.png')).map(f => f.replace('.png', ''));
                } catch (e) {
                    alert('No img/animations folder found');
                    return;
                }
                if (files.length === 0) {
                    alert('No animation images found in img/animations folder');
                    return;
                }
                const title = `Select Animation ${slot} Image`;
                const cb = (selectedFile) => {
                    if (slot === 1) animation.animation1Name = selectedFile;
                    else animation.animation2Name = selectedFile;
                    persistSprite();
                    // Re-render the detail view so the display updates
                    self.showAnimationDetail(container, animation);
                };
                const previewCb = (fileName) => 'file://' + path.join(currentProject.path, 'img', 'animations', fileName + '.png');
                if (this.parentEditor && this.parentEditor.showImagePicker) {
                    this.parentEditor.showImagePicker(title, files, cb, previewCb);
                } else {
                    alert('Image picker unavailable');
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
                    { value: '0', label: 'Head' },
                    { value: '1', label: 'Center' },
                    { value: '2', label: 'Feet' },
                    { value: '3', label: 'Screen' }
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
        if (isSpriteAnimation && animation.frames && animation.frames.length > 0) {
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

                if (newType === 'effekseer') {
                    // Convert to Effekseer animation
                    delete animation.animation1Name;
                    delete animation.animation1Hue;
                    delete animation.animation2Name;
                    delete animation.animation2Hue;
                    delete animation.frames;
                    delete animation.position;

                    // Initialize Effekseer properties
                    animation.effectName = '';
                    animation.displayType = 0;
                    animation.scale = 100;
                    animation.speed = 100;
                    animation.rotation = { x: 0, y: 0, z: 0 };
                    animation.offsetX = 0;
                    animation.offsetY = 0;

                    // Convert timings to Effekseer format
                    if (animation.timings && animation.timings.length > 0) {
                        animation.soundTimings = animation.timings
                            .filter(t => t.se && t.se.name)
                            .map(t => ({ frame: t.frame, se: t.se }));
                        animation.flashTimings = animation.timings
                            .filter(t => t.flashScope !== 0)
                            .map(t => ({
                                frame: t.frame,
                                flashScope: t.flashScope,
                                flashColor: t.flashColor,
                                flashDuration: t.flashDuration
                            }));
                        delete animation.timings;
                    } else {
                        animation.soundTimings = [];
                        animation.flashTimings = [];
                    }
                } else if (newType === 'sprite') {
                    // Convert to Sprite-based animation
                    delete animation.effectName;
                    delete animation.displayType;
                    delete animation.scale;
                    delete animation.speed;
                    delete animation.rotation;
                    delete animation.offsetX;
                    delete animation.offsetY;

                    // Initialize sprite properties
                    animation.animation1Name = '';
                    animation.animation1Hue = 0;
                    animation.animation2Name = '';
                    animation.animation2Hue = 0;
                    animation.position = 1; // Center
                    animation.frames = [];

                    // Convert timings to sprite format
                    if (animation.soundTimings || animation.flashTimings) {
                        const timingsMap = new Map();

                        // Merge sound and flash timings
                        (animation.soundTimings || []).forEach(st => {
                            if (!timingsMap.has(st.frame)) {
                                timingsMap.set(st.frame, {
                                    frame: st.frame,
                                    se: st.se,
                                    flashScope: 0,
                                    flashColor: [0, 0, 0, 0],
                                    flashDuration: 0
                                });
                            } else {
                                timingsMap.get(st.frame).se = st.se;
                            }
                        });

                        (animation.flashTimings || []).forEach(ft => {
                            if (!timingsMap.has(ft.frame)) {
                                timingsMap.set(ft.frame, {
                                    frame: ft.frame,
                                    se: { name: '', pan: 0, pitch: 100, volume: 90 },
                                    flashScope: ft.flashScope,
                                    flashColor: ft.flashColor,
                                    flashDuration: ft.flashDuration
                                });
                            } else {
                                const timing = timingsMap.get(ft.frame);
                                timing.flashScope = ft.flashScope;
                                timing.flashColor = ft.flashColor;
                                timing.flashDuration = ft.flashDuration;
                            }
                        });

                        animation.timings = Array.from(timingsMap.values());
                        delete animation.soundTimings;
                        delete animation.flashTimings;
                    } else {
                        animation.timings = [];
                    }
                }

                // Reload the animation detail view
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
                    { value: 'sprite', label: 'Sprite-based' },
                    { value: 'effekseer', label: 'Effekseer' }
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
                return fs.readdirSync(dir).filter(f => f.endsWith('.png')).map(f => f.replace('.png', '')).sort();
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

        // Background battleback 1 dropdown
        const bb1Select = document.getElementById('preview-bb1-select');
        if (bb1Select) {
            const bb1Opts = [{ value: '', label: '(none)' }, ...bb1Files.map(n => ({ value: n, label: n }))];
            this._attachGoldDropdown(bb1Select, bb1Opts, this._previewBB1Name || '', (value, label) => {
                this._previewBB1Name = value || null;
                bb1Select.dataset.value = value;
                bb1Select.firstChild ? bb1Select.firstChild.nodeValue = label : (bb1Select.textContent = label);
                bb1Select.textContent = label;
                persist();
                this._loadPreviewImages();
            });
        }

        // Background battleback 2 dropdown
        const bb2Select = document.getElementById('preview-bb2-select');
        if (bb2Select) {
            const bb2Opts = [{ value: '', label: '(none)' }, ...bb2Files.map(n => ({ value: n, label: n }))];
            this._attachGoldDropdown(bb2Select, bb2Opts, this._previewBB2Name || '', (value, label) => {
                this._previewBB2Name = value || null;
                bb2Select.dataset.value = value;
                bb2Select.textContent = label;
                persist();
                this._loadPreviewImages();
            });
        }

        // Enemy target dropdown
        const targetSelect = document.getElementById('preview-target-select');
        if (targetSelect) {
            const enemies = this.databaseManager.getEnemies ? this.databaseManager.getEnemies() : [];
            const targetOpts = [
                { value: '', label: '(none)' },
                ...enemies.filter(e => e && e.id > 0).map(e => ({
                    value: String(e.id),
                    label: `${String(e.id).padStart(4, '0')}: ${e.name || 'Unnamed'}`
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
        if (bb1Select) bb1Select.textContent = this._previewBB1Name || '(none)';
        if (bb2Select) bb2Select.textContent = this._previewBB2Name || '(none)';
        if (targetSelect) {
            const enemies = this.databaseManager.getEnemies ? this.databaseManager.getEnemies() : [];
            const e = enemies.find(en => en && en.id === this._previewTargetEnemyId);
            targetSelect.textContent = e ? `${String(e.id).padStart(4, '0')}: ${e.name || 'Unnamed'}` : '(none)';
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
        const fs = require('fs');
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
            this._previewBB1Img.src = 'file://' + pathMod.join(project.path, 'img', 'battlebacks1', this._previewBB1Name + '.png').replace(/\\/g, '/');
        } else {
            this._previewBB1Img = null;
        }

        // Load battleback2
        if (this._previewBBEnabled && this._previewBB2Name) {
            pending++;
            this._previewBB2Img = new Image();
            this._previewBB2Img.onload = done;
            this._previewBB2Img.onerror = () => { this._previewBB2Img = null; done(); };
            this._previewBB2Img.src = 'file://' + pathMod.join(project.path, 'img', 'battlebacks2', this._previewBB2Name + '.png').replace(/\\/g, '/');
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
                    const tryPath = pathMod.join(project.path, 'img', dir, enemy.battlerName + '.png');
                    if (fs.existsSync(tryPath)) {
                        imagePath = 'file://' + tryPath.replace(/\\/g, '/');
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

    _drawPreviewBackground(ctx, canvas) {
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

        // Draw dummy enemy target
        if (this._previewTargetEnabled && this._previewTargetImg && this._previewTargetImg.complete && this._previewTargetImg.naturalWidth) {
            const img = this._previewTargetImg;
            const battlerName = this._previewTargetBattlerName || '';
            const firstChar = battlerName.charAt(0);
            const isBigChar = battlerName.match(/^[!$]*\$/);
            const isCharBattler = (firstChar === '!' || firstChar === '$');

            const targetX = canvas.width / 2;
            const targetY = canvas.height * 0.65;

            if (isCharBattler && !isBigChar) {
                // Standard character sheet: 12 cols x 8 rows — middle frame of first row
                const fw = img.naturalWidth / 12;
                const fh = img.naturalHeight / 8;
                ctx.drawImage(img, fw, 0, fw, fh, targetX - fw / 2, targetY - fh / 2, fw, fh);
            } else if (isCharBattler && isBigChar) {
                // Big character ($ prefix): 3 cols x 4 rows
                const fw = img.naturalWidth / 3;
                const fh = img.naturalHeight / 4;
                ctx.drawImage(img, fw, 0, fw, fh, targetX - fw / 2, targetY - fh / 2, fw, fh);
            } else {
                // Standard enemy sprite: full image centered
                ctx.drawImage(img, targetX - img.naturalWidth / 2, targetY - img.naturalHeight / 2);
            }
        }
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

        // Initialize per-session selection / clipboard state (reset by showAnimationDetail).
        if (!this._selectedTimingIndices) this._selectedTimingIndices = new Set();
        if (this._timingClipboard === undefined) this._timingClipboard = null;

        // Make the container focusable so its keydown handler can intercept
        // Delete / Ctrl+C/X/V without the database sidebar grabbing them.
        timingsList.tabIndex = -1;
        timingsList.style.outline = 'none';

        // Determine animation type
        const isEffekseer = animation.effectName !== undefined;
        const isSpriteAnimation = animation.animation1Name !== undefined && animation.animation1Name !== '';

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
                });
            }

            // Convert map to array and sort by frame
            timingsData = Array.from(timingsMap.values()).sort((a, b) => a.frame - b.frame);
        }

        // Clear list
        timingsList.innerHTML = '';

        if (timingsData.length === 0) {
            timingsList.innerHTML = '<div style="font-size: 10px; color: var(--color-text-muted); padding: 8px;">No timings added</div>';
            return;
        }

        // Populate list with timing entries
        timingsData.forEach((timing, index) => {
            const flashTypeNames = ['None', 'Target', 'Screen', 'Hide Target'];
            const flashScope = timing.flashScope !== undefined ? timing.flashScope : (timing.flashColor ? 1 : 0);
            const flashTypeName = flashTypeNames[flashScope] || 'None';
            const seName = timing.se?.name || 'None';
            const flashColor = timing.flashColor || [0, 0, 0, 0];
            const [r, g, b, a] = flashColor;

            const isSelected = this._selectedTimingIndices.has(index);
            const timingEntry = document.createElement('div');
            timingEntry.dataset.timingIndex = index;
            timingEntry.style.cssText = `
                background: ${isSelected ? 'var(--color-accent-tint-25)' : 'var(--color-bg-input)'};
                border: 1px solid ${isSelected ? 'var(--color-accent-border-strong)' : 'var(--color-border-input)'};
                border-radius: 2px;
                padding: 6px 8px;
                margin-bottom: 4px;
                font-size: 10px;
                display: flex;
                align-items: center;
                gap: 12px;
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
            const seInfo = seName !== 'None' && timing.se?.volume !== undefined
                ? `${seName} (Vol:${timing.se.volume} Pitch:${timing.se.pitch})`
                : seName;

            // When selected, the entry has a gold-tinted background. All text
            // bumps to bright white for max contrast (gold-on-gold is invisible).
            const frameLabelColor = isSelected ? 'var(--color-text-strong)' : 'var(--color-accent-bright)';
            const textColor = isSelected ? 'var(--color-text-strong)' : 'var(--color-text)';
            const mutedColor = isSelected ? 'var(--color-text-strong)' : 'var(--color-text-muted)';
            timingEntry.innerHTML = `
                <div style="font-weight: 600; color: ${frameLabelColor}; font-size: 12px; min-width: 70px;">Frame ${timing.frame}</div>
                <div style="color: ${textColor}; font-size: 11px; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><strong>SE:</strong> ${seInfo}</div>
                <div style="display: flex; align-items: center; gap: 6px; font-size: 11px;">
                    <span style="color: ${textColor};"><strong>Flash:</strong> ${flashTypeName}</span>
                    ${flashScope !== 0 ? `
                        <div style="width: 24px; height: 14px; border: 1px solid var(--color-border-input); background: rgb(${r}, ${g}, ${b}); border-radius: 2px;" title="RGB(${r}, ${g}, ${b}) A:${a}"></div>
                        <span style="color: ${mutedColor};">Dur:${timing.flashDuration || 0}</span>
                    ` : ''}
                </div>
                <div style="display: flex; gap: 6px;">
                    <button class="edit-timing-btn rr-btn-chip" data-index="${index}">Edit</button>
                    <button class="remove-timing-btn rr-btn-chip-danger" data-index="${index}">Remove</button>
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
                } else if (isCtrl && e.key.toLowerCase() === 'v' && this._timingClipboard && this._timingClipboard.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    this._timingClipboard.forEach(t => this._appendTiming(animation, JSON.parse(JSON.stringify(t))));
                    persist();
                    this.populateTimingsList(animation);
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
        const isEffekseer = animation.effectName !== undefined;
        const isSpriteAnimation = animation.animation1Name !== undefined && animation.animation1Name !== '';
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
            });
            return Array.from(map.values()).sort((a, b) => a.frame - b.frame);
        }
        return [];
    }

    // Helper: appends a single timing in the format the current animation expects.
    // For sprite-based: pushes to animation.timings. For Effekseer: splits into
    // soundTimings + flashTimings. Used by Ctrl+V paste.
    _appendTiming(animation, timing) {
        const isEffekseer = animation.effectName !== undefined;
        if (isEffekseer) {
            if (!animation.soundTimings) animation.soundTimings = [];
            if (!animation.flashTimings) animation.flashTimings = [];
            if (timing.se) {
                animation.soundTimings.push({ frame: timing.frame, se: timing.se });
            }
            if (timing.flashColor) {
                animation.flashTimings.push({ frame: timing.frame, color: timing.flashColor, duration: timing.flashDuration || 0 });
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
        // Get the timing data
        const isEffekseer = animation.effectName !== undefined;
        const isSpriteAnimation = animation.animation1Name !== undefined && animation.animation1Name !== '';

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
        seNameInput.value = timingData.se?.name || 'None';

        // Populate SE volume and pitch
        const seVolumeSlider = document.getElementById('timing-se-volume');
        const seVolumeValue = document.getElementById('timing-se-volume-value');
        const sePitchSlider = document.getElementById('timing-se-pitch');
        const sePitchValue = document.getElementById('timing-se-pitch-value');
        const seVol = timingData.se?.volume !== undefined ? timingData.se.volume : 90;
        const sePit = timingData.se?.pitch !== undefined ? timingData.se.pitch : 100;
        if (seVolumeSlider) { seVolumeSlider.value = seVol; seVolumeValue.textContent = seVol; }
        if (sePitchSlider) { sePitchSlider.value = sePit; sePitchValue.textContent = sePit; }

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
        saveBtn.textContent = 'Update Timing';

        // Store edit mode flag
        saveBtn.dataset.editMode = 'true';
        saveBtn.dataset.editIndex = index;

        // Show modal
        modal.style.display = 'flex';
    }

    removeTiming(animation, index) {
        const isEffekseer = animation.effectName !== undefined;

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

            console.log('Removed timing at frame', frameToRemove);
        } else {
            // For sprite-based, remove from timings array
            if (animation.timings && index < animation.timings.length) {
                animation.timings.splice(index, 1);
            }

            console.log('Removed timing at index', index);
        }
    }

    setupTimingModal(animation, container) {
        // Create modal HTML
        const modalHTML = `
            <div id="timing-modal" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 10000; align-items: center; justify-content: center;">
                <div style="background: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 8px; width: 600px; max-height: 80vh; overflow-y: auto; padding: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <div style="font-size: 16px; font-weight: 600; color: var(--color-text-strong);">SE and Flash Timing</div>
                        <button id="timing-modal-close" style="background: none; border: none; color: var(--color-text-muted); font-size: 24px; cursor: pointer;">×</button>
                    </div>

                    <!-- Frame and SE Section -->
                    <div style="display: flex; gap: 16px; margin-bottom: 20px;">
                        <div style="flex: 0 0 100px;">
                            <div style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 6px;">Frame:</div>
                            <input type="number" id="timing-frame" min="0" value="0" style="width: 100%; padding: 8px; background: var(--color-bg-input-alt); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; font-size: 12px;">
                        </div>
                        <div style="flex: 1;">
                            <div style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 6px;">SE:</div>
                            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                                <input type="text" id="timing-se-name" readonly value="None" style="flex: 1; padding: 8px; background: var(--color-bg-input-alt); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; font-size: 12px;">
                                <button id="timing-se-pick" style="padding: 8px 12px; background: var(--color-success); border: 1px solid var(--color-success-border); color: var(--color-text-strong); border-radius: 3px; cursor: pointer; font-size: 11px;">Pick SE</button>
                                <button id="timing-se-clear" style="padding: 8px 12px; background: var(--color-bg-button); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; cursor: pointer; font-size: 11px;">Clear</button>
                            </div>
                            <div style="display: flex; gap: 12px; align-items: center;">
                                <div style="display: flex; align-items: center; gap: 6px; flex: 1;">
                                    <span style="font-size: 11px; color: var(--color-text-muted); white-space: nowrap;">Vol:</span>
                                    <input type="range" id="timing-se-volume" min="0" max="100" value="90" style="flex: 1;">
                                    <span id="timing-se-volume-value" style="font-size: 11px; color: var(--color-text); min-width: 28px; text-align: right;">90</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 6px; flex: 1;">
                                    <span style="font-size: 11px; color: var(--color-text-muted); white-space: nowrap;">Pitch:</span>
                                    <input type="range" id="timing-se-pitch" min="50" max="150" value="100" style="flex: 1;">
                                    <span id="timing-se-pitch-value" style="font-size: 11px; color: var(--color-text); min-width: 28px; text-align: right;">100</span>
                                </div>
                                <button id="timing-se-preview" style="padding: 4px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; cursor: pointer; font-size: 11px;">&#9654; Preview</button>
                            </div>
                        </div>
                    </div>

                    <!-- Flash Section -->
                    <div style="background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 3px; padding: 16px; margin-bottom: 20px;">
                        <div style="font-size: 13px; font-weight: 600; color: var(--color-text); margin-bottom: 12px;">Flash</div>

                        <!-- Flash Type Radio Buttons -->
                        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px;">
                            <label style="display: flex; align-items: center; gap: 6px; color: var(--color-text); font-size: 11px; cursor: pointer;">
                                <input type="radio" name="flash-type" value="0" checked style="cursor: pointer;"> None
                            </label>
                            <label style="display: flex; align-items: center; gap: 6px; color: var(--color-text); font-size: 11px; cursor: pointer;">
                                <input type="radio" name="flash-type" value="1" style="cursor: pointer;"> Target
                            </label>
                            <label style="display: flex; align-items: center; gap: 6px; color: var(--color-text); font-size: 11px; cursor: pointer;">
                                <input type="radio" name="flash-type" value="2" style="cursor: pointer;"> Screen
                            </label>
                            <label style="display: flex; align-items: center; gap: 6px; color: var(--color-text); font-size: 11px; cursor: pointer;">
                                <input type="radio" name="flash-type" value="3" style="cursor: pointer;"> Hide Target
                            </label>
                        </div>

                        <!-- Color Sliders -->
                        <div style="display: flex; flex-direction: column; gap: 12px;">
                            ${['Red', 'Green', 'Blue', 'Intensity'].map(color => `
                                <div>
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                        <span style="font-size: 11px; color: var(--color-text-muted);">${color}:</span>
                                        <span id="timing-${color.toLowerCase()}-value" style="font-size: 11px; color: var(--color-text);">0</span>
                                    </div>
                                    <input type="range" id="timing-${color.toLowerCase()}" min="0" max="255" value="0" style="width: 100%;">
                                </div>
                            `).join('')}
                        </div>

                        <!-- Color Preview -->
                        <div style="margin-top: 12px;">
                            <div style="font-size: 11px; color: var(--color-text-muted); margin-bottom: 6px;">Preview:</div>
                            <div id="timing-color-preview" style="width: 100%; height: 40px; border: 1px solid var(--color-border-input); border-radius: 3px; background: rgb(0,0,0);"></div>
                        </div>

                        <!-- Duration -->
                        <div style="margin-top: 12px;">
                            <div style="font-size: 11px; color: var(--color-text-muted); margin-bottom: 6px;">Duration:</div>
                            <input type="number" id="timing-duration" min="1" value="8" style="width: 100%; padding: 8px; background: var(--color-bg-input-alt); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; font-size: 12px;">
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div style="display: flex; gap: 12px; justify-content: flex-end;">
                        <button id="timing-modal-cancel" class="rr-btn-secondary">Cancel</button>
                        <button id="timing-modal-save" style="padding: 8px 16px; background: var(--color-accent); border: 1px solid var(--color-accent); color: var(--color-bg-deep); border-radius: 3px; cursor: pointer; font-size: 12px; font-weight: bold;">Add Timing</button>
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

        // Open modal
        addBtn?.addEventListener('click', () => {
            // Reset to add mode
            saveBtn.textContent = 'Add Timing';
            saveBtn.dataset.editMode = 'false';
            delete saveBtn.dataset.editIndex;

            // Reset form fields
            document.getElementById('timing-frame').value = 0;
            document.getElementById('timing-se-name').value = 'None';
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
            const seVolume = parseInt(document.getElementById('timing-se-volume').value) || 90;
            const sePitch = parseInt(document.getElementById('timing-se-pitch').value) || 100;
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
            const isEffekseer = animation.effectName !== undefined;

            if (isEditMode) {
                // Remove the old timing first
                this.removeTiming(animation, editIndex);
            }

            if (isEffekseer) {
                // Effekseer format: separate soundTimings and flashTimings

                // Add sound timing if SE is selected
                if (seName && seName !== 'None') {
                    if (!animation.soundTimings) animation.soundTimings = [];

                    // Check if there's already a sound timing at this frame
                    const existingIndex = animation.soundTimings.findIndex(st => st.frame === frame);
                    const seData = {
                        frame: frame,
                        se: {
                            name: seName,
                            pan: 0,
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
                    se: seName && seName !== 'None' ? {
                        name: seName,
                        pan: 0,
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
            this.populateTimingsList(animation);

            console.log(isEditMode ? 'Updated timing:' : 'Added timing:', { frame, seName, flashType, color: [red, green, blue, intensity], duration });
            closeModal();
        });

        // SE volume/pitch slider labels
        const seVolumeSlider = document.getElementById('timing-se-volume');
        const seVolumeValue = document.getElementById('timing-se-volume-value');
        const sePitchSlider = document.getElementById('timing-se-pitch');
        const sePitchValue = document.getElementById('timing-se-pitch-value');

        seVolumeSlider?.addEventListener('input', () => { seVolumeValue.textContent = seVolumeSlider.value; });
        sePitchSlider?.addEventListener('input', () => { sePitchValue.textContent = sePitchSlider.value; });

        // SE preview button
        const sePreviewBtn = document.getElementById('timing-se-preview');
        let previewAudio = null;
        sePreviewBtn?.addEventListener('click', () => {
            const seName = document.getElementById('timing-se-name').value;
            if (!seName || seName === 'None') return;

            const currentProject = this.projectManager.getCurrentProject();
            if (!currentProject) return;

            // Stop any existing preview
            if (previewAudio) { previewAudio.pause(); previewAudio = null; }

            const path = require('path');
            const audioPath = path.join(currentProject.path, 'audio', 'se', seName + '.ogg');
            previewAudio = new Audio('file://' + audioPath);
            previewAudio.volume = (parseInt(seVolumeSlider.value) || 90) / 100;
            previewAudio.playbackRate = (parseInt(sePitchSlider.value) || 100) / 100;
            previewAudio.play().catch(err => console.warn('Failed to play SE preview:', err));
        });

        // SE clear button
        const seClearBtn = document.getElementById('timing-se-clear');
        seClearBtn?.addEventListener('click', () => {
            document.getElementById('timing-se-name').value = 'None';
            seVolumeSlider.value = 90;
            seVolumeValue.textContent = '90';
            sePitchSlider.value = 100;
            sePitchValue.textContent = '100';
        });

        // SE pick button - show file picker
        const sePickBtn = document.getElementById('timing-se-pick');
        sePickBtn?.addEventListener('click', () => {
            const currentProject = this.projectManager.getCurrentProject();
            if (!currentProject) { alert('No project loaded'); return; }

            const fs = require('fs');
            const path = require('path');
            const seFolder = path.join(currentProject.path, 'audio', 'se');

            if (!fs.existsSync(seFolder)) { alert('SE folder not found: audio/se'); return; }

            const files = fs.readdirSync(seFolder)
                .filter(f => f.endsWith('.ogg') || f.endsWith('.m4a'))
                .map(f => f.replace(/\.(ogg|m4a|mp3)$/, ''))
                .sort((a, b) => a.localeCompare(b));

            if (files.length === 0) { alert('No audio files found in audio/se'); return; }

            this._showSEPicker(files, seFolder, document.getElementById('timing-se-name'));
        });
    }

    /**
     * Show SE file picker modal
     */
    _showSEPicker(files, seFolder, seNameInput) {
        let selectedFile = seNameInput.value !== 'None' ? seNameInput.value : null;
        let pickerAudio = null;

        const picker = document.createElement('div');
        picker.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.8); z-index: 10001;
            display: flex; justify-content: center; align-items: center;
        `;

        const container = document.createElement('div');
        container.style.cssText = `
            background-color: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 6px;
            width: 500px; height: 70vh; display: flex; flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 12px 16px; background-color: var(--color-bg-panel);
            border-bottom: 1px solid var(--color-border); display: flex; flex-direction: column; gap: 8px;
            border-radius: 6px 6px 0 0; flex-shrink: 0;
        `;

        const titleRow = document.createElement('div');
        titleRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';
        titleRow.innerHTML = `
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">Select Sound Effect</h3>
            <button style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">×</button>
        `;
        header.appendChild(titleRow);

        // Preview controls in header
        const previewRow = document.createElement('div');
        previewRow.style.cssText = 'display: flex; gap: 8px; align-items: center;';

        const playBtn = document.createElement('button');
        playBtn.innerHTML = '&#9654; Preview';
        playBtn.style.cssText = 'padding: 5px 12px; background: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; cursor: pointer; font-size: 11px;';
        playBtn.addEventListener('mouseenter', () => { playBtn.style.backgroundColor = 'var(--color-accent-tint-25)'; playBtn.style.borderColor = 'var(--color-accent)'; });
        playBtn.addEventListener('mouseleave', () => { playBtn.style.backgroundColor = 'var(--color-bg-panel)'; playBtn.style.borderColor = 'var(--color-border-input)'; });

        const stopBtn = document.createElement('button');
        stopBtn.innerHTML = '&#9632; Stop';
        stopBtn.style.cssText = 'padding: 5px 12px; background: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; cursor: pointer; font-size: 11px;';
        stopBtn.addEventListener('mouseenter', () => { stopBtn.style.backgroundColor = 'var(--color-accent-tint-25)'; stopBtn.style.borderColor = 'var(--color-accent)'; });
        stopBtn.addEventListener('mouseleave', () => { stopBtn.style.backgroundColor = 'var(--color-bg-panel)'; stopBtn.style.borderColor = 'var(--color-border-input)'; });

        previewRow.appendChild(playBtn);
        previewRow.appendChild(stopBtn);
        header.appendChild(previewRow);
        container.appendChild(header);

        // Search
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search SE files...';
        searchInput.style.cssText = `
            margin: 8px; padding: 6px 10px; background-color: var(--color-bg-input); color: var(--color-text);
            border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; outline: none; flex-shrink: 0;
        `;
        container.appendChild(searchInput);

        // File list
        const listEl = document.createElement('div');
        listEl.style.cssText = 'flex: 1; overflow-y: auto; padding: 0 8px 8px 8px;';

        const items = [];
        files.forEach(name => {
            const item = document.createElement('div');
            item.textContent = name;
            item.dataset.seName = name;
            item.style.cssText = `
                padding: 6px 10px; cursor: pointer; border-bottom: 1px solid var(--color-border);
                font-size: 12px; color: var(--color-text);
            `;

            if (name === selectedFile) {
                item.style.backgroundColor = 'var(--color-selection-mid)';
                item.style.color = 'var(--color-link)';
            }

            item.addEventListener('mouseenter', () => { if (item.dataset.seName !== selectedFile) item.style.backgroundColor = 'var(--color-bg-list-item)'; });
            item.addEventListener('mouseleave', () => { if (item.dataset.seName !== selectedFile) item.style.backgroundColor = ''; });

            item.addEventListener('click', () => {
                listEl.querySelectorAll('div').forEach(d => { d.style.backgroundColor = ''; d.style.color = 'var(--color-text)'; });
                selectedFile = name;
                item.style.backgroundColor = 'var(--color-selection-mid)';
                item.style.color = 'var(--color-link)';
            });

            item.addEventListener('dblclick', () => {
                selectedFile = name;
                confirmAndClose();
            });

            listEl.appendChild(item);
            items.push({ el: item, name: name.toLowerCase() });
        });
        container.appendChild(listEl);

        // Search filter
        let searchTimeout = null;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                const q = searchInput.value.toLowerCase().trim();
                items.forEach(({ el, name }) => { el.style.display = (!q || name.includes(q)) ? '' : 'none'; });
            }, 150);
        });

        // Footer
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 12px 16px; background-color: var(--color-bg-panel); border-top: 1px solid var(--color-border);
            display: flex; justify-content: flex-end; gap: 8px;
            border-radius: 0 0 6px 6px; flex-shrink: 0;
        `;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'rr-btn-secondary';

        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.style.cssText = 'padding: 6px 20px; background: var(--color-accent); color: var(--color-bg-deep); border: none; border-radius: 3px; cursor: pointer; font-size: 12px; font-weight: bold;';
        okBtn.addEventListener('mouseenter', () => { okBtn.style.backgroundColor = 'var(--color-accent-muted)'; });
        okBtn.addEventListener('mouseleave', () => { okBtn.style.backgroundColor = 'var(--color-accent)'; });

        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        container.appendChild(footer);
        picker.appendChild(container);

        // Event handlers
        const stopAudio = () => { if (pickerAudio) { pickerAudio.pause(); pickerAudio = null; } };

        playBtn.addEventListener('click', () => {
            if (!selectedFile) return;
            stopAudio();
            const path = require('path');
            const audioPath = path.join(seFolder, selectedFile + '.ogg');
            pickerAudio = new Audio('file://' + audioPath);
            pickerAudio.volume = 0.9;
            pickerAudio.play().catch(err => console.warn('Failed to play SE:', err));
        });

        stopBtn.addEventListener('click', stopAudio);

        const closePicker = () => { stopAudio(); picker.remove(); };

        const confirmAndClose = () => {
            if (selectedFile) {
                seNameInput.value = selectedFile;
            }
            closePicker();
        };

        titleRow.querySelector('button').addEventListener('click', closePicker);
        cancelBtn.addEventListener('click', closePicker);
        okBtn.addEventListener('click', confirmAndClose);

        picker.addEventListener('click', (e) => { if (e.target === picker) closePicker(); });

        document.body.appendChild(picker);
        searchInput.focus();
    }

    showCellPropertiesModal(animation, frameIndex, cellIndex, renderFrame) {
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
                        <div style="font-size:14px; font-weight:600; color:var(--color-text-strong); letter-spacing:0.5px;">Cell Properties</div>
                        <button id="cell-modal-close" style="background:none; border:none; color:var(--color-text-muted); font-size:22px; cursor:pointer; padding:0; line-height:1; transition:color 0.15s;" onmouseover="this.style.color='var(--color-accent-bright)'" onmouseout="this.style.color='var(--color-text-muted)'">×</button>
                    </div>

                    <!-- Body -->
                    <div style="padding:18px 20px; overflow-y:auto; display:flex; flex-direction:column; gap:14px;">
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            ${fieldRow('Tileset Frame', `<input type="number" id="cell-pattern" value="${pattern}" min="0" max="199" style="${inputBase}" ${inputFocus}>`)}
                            ${fieldRow('Scale (%)', `<input type="number" id="cell-scale" value="${scale}" min="1" max="1000" style="${inputBase}" ${inputFocus}>`)}
                            ${fieldRow('X', `<input type="number" id="cell-x" value="${x}" style="${inputBase}" ${inputFocus}>`)}
                            ${fieldRow('Y', `<input type="number" id="cell-y" value="${y}" style="${inputBase}" ${inputFocus}>`)}
                            ${fieldRow('Rotation (°)', `<input type="number" id="cell-rotation" value="${rotation}" min="-360" max="360" style="${inputBase}" ${inputFocus}>`)}
                            ${fieldRow('Opacity (0-255)', `<input type="number" id="cell-opacity" value="${opacity}" min="0" max="255" style="${inputBase}" ${inputFocus}>`)}
                        </div>
                        ${fieldRow('Mirror', `
                            <div style="display:flex; gap:18px;">
                                <label style="display:flex; align-items:center; gap:6px; color:var(--color-text); cursor:pointer; font-size:12px;">
                                    <input type="radio" name="cell-mirror" value="0" ${mirror === 0 ? 'checked' : ''} style="accent-color:var(--color-accent-bright); cursor:pointer;"> No
                                </label>
                                <label style="display:flex; align-items:center; gap:6px; color:var(--color-text); cursor:pointer; font-size:12px;">
                                    <input type="radio" name="cell-mirror" value="1" ${mirror === 1 ? 'checked' : ''} style="accent-color:var(--color-accent-bright); cursor:pointer;"> Yes
                                </label>
                            </div>
                        `)}
                        ${fieldRow('Blend Mode', `
                            <select id="cell-blend" style="${inputBase}; cursor:pointer;">
                                ${blendModes.map((mode, index) => `<option value="${index}" ${blendMode === index ? 'selected' : ''} style="background:var(--color-bg-base);color:var(--color-text);">${mode}</option>`).join('')}
                            </select>
                        `)}
                    </div>

                    <!-- Black footer -->
                    <div style="background:var(--color-bg-deep); padding:12px 16px; border-top:1px solid var(--color-border); border-radius:0 0 6px 6px; display:flex; gap:10px; justify-content:flex-end;">
                        <button id="cell-modal-cancel" class="rr-btn-secondary">Cancel</button>
                        <button id="cell-modal-save" style="padding:7px 18px; background:var(--color-accent); border:1px solid var(--color-accent); color:var(--color-bg-deep); border-radius:3px; cursor:pointer; font-size:12px; font-weight:bold;">Save</button>
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
            const newPattern = parseInt(document.getElementById('cell-pattern').value) || 0;
            const newX = parseInt(document.getElementById('cell-x').value) || 0;
            const newY = parseInt(document.getElementById('cell-y').value) || 0;
            const newScale = parseInt(document.getElementById('cell-scale').value) || 100;
            const newRotation = parseInt(document.getElementById('cell-rotation').value) || 0;
            const newMirror = parseInt(document.querySelector('input[name="cell-mirror"]:checked').value);
            const newOpacity = parseInt(document.getElementById('cell-opacity').value) || 255;
            const newBlend = parseInt(document.getElementById('cell-blend').value) || 0;

            // Update cell data
            frameData[cellIndex] = [newPattern, newX, newY, newScale, newRotation, newMirror, newOpacity, newBlend];

            // Re-render frame
            renderFrame(frameIndex);

            closeModal();
        });
    }

    setupSpriteSheetPreview(animation) {
        const canvas = document.getElementById('sprite-sheet-preview');
        if (!canvas) return;

        const currentProject = this.projectManager.getCurrentProject();
        if (!currentProject) return;

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        const sourceCellSize = 192; // Size in sprite sheet
        const displayCellSize = 96; // Size in preview (half size for compact view)
        const cols = 5;

        let spriteSheet1 = null;
        let spriteSheet2 = null;

        // Load sprite sheets
        const loadSpriteSheets = () => {
            const promises = [];

            if (animation.animation1Name) {
                const path = require('path');
                const imgPath = path.join(currentProject.path, 'img', 'animations', animation.animation1Name + '.png');
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
                    img1.src = 'file://' + imgPath;
                });
                promises.push(promise1);
            }

            if (animation.animation2Name) {
                const path = require('path');
                const imgPath = path.join(currentProject.path, 'img', 'animations', animation.animation2Name + '.png');
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
                    img2.src = 'file://' + imgPath;
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
                ctx.fillStyle = ThemeColors.resolve('--color-border-subtle', '#333333');
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = ThemeColors.resolve('--color-text-muted', '#999999');
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('No sprite sheets found', canvas.width / 2, canvas.height / 2);
                return;
            }

            // Set canvas size (using display size for compact view)
            canvas.width = totalCells * displayCellSize;
            canvas.height = displayCellSize;

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

                // Add new cell at center with this pattern
                const newCell = [pattern, 0, 0, 100, 0, 0, 255, 0];
                animation.frames[frameIndex].push(newCell);

                // Trigger re-render of main preview
                if (window.currentAnimationRenderFrame) {
                    window.currentAnimationRenderFrame(frameIndex);
                }

                console.log('Added tileset frame', pattern, 'to animation frame', frameIndex);
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

            document.addEventListener('mouseup', (e) => {
                if (isDraggingFromSheet) {
                    // Check if mouse is over the preview canvas
                    const previewCanvas = document.getElementById('animation-preview-canvas');
                    if (previewCanvas) {
                        const rect = previewCanvas.getBoundingClientRect();
                        const mouseX = e.clientX;
                        const mouseY = e.clientY;

                        if (mouseX >= rect.left && mouseX <= rect.right &&
                            mouseY >= rect.top && mouseY <= rect.bottom) {

                            // Calculate position relative to preview canvas center
                            const canvasX = mouseX - rect.left;
                            const canvasY = mouseY - rect.top;
                            const centerX = previewCanvas.width / 2;
                            const centerY = previewCanvas.height / 2;
                            const relativeX = canvasX - centerX;
                            const relativeY = canvasY - centerY;

                            // Get current frame from animation playback
                            const frameIndex = window.currentAnimationFrameIndex || 0;

                            // Add new cell at drop position
                            const newCell = [draggedPattern, relativeX, relativeY, 100, 0, 0, 255, 0];
                            animation.frames[frameIndex].push(newCell);

                            // Trigger re-render of main preview
                            if (window.currentAnimationRenderFrame) {
                                window.currentAnimationRenderFrame(frameIndex);
                            }

                            console.log('Dropped tileset frame', draggedPattern, 'at position', relativeX, relativeY);
                        }
                    }

                    isDraggingFromSheet = false;
                    draggedPattern = -1;
                    canvas.style.cursor = 'default';

                    // Remove drag preview
                    removeDragPreview();
                }
            });

            document.addEventListener('mousemove', (e) => {
                if (isDraggingFromSheet) {
                    // Update drag preview position
                    updateDragPreviewPosition(e.clientX, e.clientY);
                    e.preventDefault();
                }
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
                const imgPath = path.join(currentProject.path, 'img', 'animations', animation.animation1Name + '.png');
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
                    img1.src = 'file://' + imgPath;
                });
                promises.push(promise1);
            }

            if (animation.animation2Name) {
                const path = require('path');
                const imgPath = path.join(currentProject.path, 'img', 'animations', animation.animation2Name + '.png');
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
                    img2.src = 'file://' + imgPath;
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

            if (frameIndex >= animation.frames.length) return;

            const frameData = animation.frames[frameIndex];
            if (!frameData || frameData.length === 0) return;

            // Center point of canvas
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;

            // Each cell is [pattern, x, y, scale, rotation, mirror, opacity, blendMode]
            frameData.forEach((cell, index) => {
                const [pattern, x, y, scale, rotation, mirror, opacity, blendMode] = cell;

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

                // Apply transformations
                ctx.translate(centerX + x, centerY + y);
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
                    ctx.translate(centerX + x, centerY + y);
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

            frameCounter.textContent = `Frame: ${frameIndex + 1} / ${animation.frames.length}`;
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
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const spriteX = centerX + cellX;
            const spriteY = centerY + cellY;

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

            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const cellSize = 192;

            let visibleCells = [];
            let boundingBoxCells = [];

            // Check all cells
            for (let i = frameData.length - 1; i >= 0; i--) {
                if (i === skipIndex) continue;

                const [pattern, x, y, scale, rotation, mirror, opacity, blendMode] = frameData[i];

                const spriteX = centerX + x;
                const spriteY = centerY + y;
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
                { label: 'New', action: 'new', enabled: cellIndex !== -1 },
                { label: 'Edit', action: 'edit', enabled: cellIndex !== -1 },
                { separator: true },
                { label: 'Cut', action: 'cut', enabled: cellIndex !== -1 },
                { label: 'Copy', action: 'copy', enabled: cellIndex !== -1 },
                { label: 'Paste', action: 'paste', enabled: copiedCell !== null || cutCell !== null },
                { label: 'Delete', action: 'delete', enabled: cellIndex !== -1 },
                { separator: true },
                { label: 'Undo', action: 'undo', enabled: undoStack.length > 0 },
                { label: 'Redo', action: 'redo', enabled: redoStack.length > 0 },
                { separator: true },
                { label: 'To Upper', action: 'upper', enabled: cellIndex !== -1 && cellIndex < animation.frames[currentFrame].length - 1 },
                { label: 'To Lower', action: 'lower', enabled: cellIndex !== -1 && cellIndex > 0 }
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
                            menuItem.style.background = '#3a3a3a';
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
                    if (cellIndex !== -1) {
                        saveState();
                        const cell = frameData[cellIndex];
                        const newCell = JSON.parse(JSON.stringify(cell));
                        // Offset the new cell slightly so it's visible and not perfectly overlapping
                        newCell[1] += 16; // x offset
                        newCell[2] += 16; // y offset
                        frameData.push(newCell);
                        selectedCellIndex = frameData.length - 1; // Select the newly created cell
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
                    saveState();
                    if (cutCell) {
                        frameData.push(cutCell);
                        cutCell = null;
                    } else if (copiedCell) {
                        frameData.push(JSON.parse(JSON.stringify(copiedCell)));
                    }
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
                const audioPath = path.join(currentProject.path, 'audio', 'se', se.name + '.ogg');

                const audio = new Audio('file://' + audioPath);
                audio.volume = (se.volume || 90) / 100;

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
            if (animationInterval) return; // Already playing

            currentFrame = 0;
            animationInterval = setInterval(() => {
                renderFrame(currentFrame);
                playSE(currentFrame);
                currentFrame++;

                if (currentFrame >= animation.frames.length) {
                    currentFrame = 0; // Loop
                }
            }, 1000 / 15); // 15 FPS (RPG Maker default)

            playBtn.disabled = true;
            playBtn.style.opacity = '0.5';
            stopBtn.disabled = false;
            stopBtn.style.opacity = '1';
        };

        // Stop animation
        const stop = () => {
            if (animationInterval) {
                clearInterval(animationInterval);
                animationInterval = null;
            }

            currentFrame = 0;
            editorSelf._drawPreviewBackground(ctx, canvas);
            frameCounter.textContent = `Frame: 0 / ${animation.frames.length}`;

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

            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const cellIndex = getCellAtPosition(mouseX, mouseY);
            selectedCellIndex = cellIndex;

            createContextMenu(e.clientX, e.clientY, cellIndex);
        });

        // Canvas dragging for sprite positioning
        canvas.addEventListener('mousedown', (e) => {
            if (animationInterval) return; // Don't allow dragging during playback
            if (e.button !== 0) return; // Only left click

            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const frameData = animation.frames[currentFrame];
            if (!frameData) return;

            const cellIndex = getCellAtPosition(mouseX, mouseY);

            if (cellIndex !== -1) {
                // Update selection and render immediately to show highlight
                selectedCellIndex = cellIndex;
                renderFrame(currentFrame);

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
                renderFrame(currentFrame);
            }
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!isDragging || draggedCellIndex === -1) return;

            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

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

        // Add/Remove frame buttons
        const addFrameBtn = document.getElementById('add-frame-btn');
        const removeFrameBtn = document.getElementById('remove-frame-btn');

        if (addFrameBtn) {
            addFrameBtn.addEventListener('click', () => {
                // Copy current frame or create empty frame
                const newFrame = currentFrame < animation.frames.length
                    ? JSON.parse(JSON.stringify(animation.frames[currentFrame]))
                    : []; // Empty frame

                animation.frames.push(newFrame);
                currentFrame = animation.frames.length - 1;
                selectedFrameIndices.clear();
                selectedFrameIndices.add(currentFrame);
                persistAnimation();
                populateFrameList();
                renderFrame(currentFrame);
                updateFrameCounter();
            });
        }

        if (removeFrameBtn) {
            removeFrameBtn.addEventListener('click', () => {
                if (animation.frames.length <= selectedFrameIndices.size) {
                    alert('Cannot remove all frames; at least one frame must remain.');
                    return;
                }
                const count = selectedFrameIndices.size;
                const confirmDelete = confirm(count === 1
                    ? `Remove frame ${currentFrame + 1}?`
                    : `Remove ${count} selected frames?`);
                if (!confirmDelete) return;

                const indicesDesc = Array.from(selectedFrameIndices).sort((a, b) => b - a);
                indicesDesc.forEach(i => animation.frames.splice(i, 1));
                selectedFrameIndices.clear();
                currentFrame = Math.max(0, Math.min(currentFrame, animation.frames.length - 1));
                selectedFrameIndices.add(currentFrame);
                persistAnimation();
                populateFrameList();
                renderFrame(currentFrame);
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
                frameItem.textContent = `Frame ${index + 1}`;

                frameItem.addEventListener('click', (e) => {
                    // Stop animation playback if running so the user can browse.
                    if (animationInterval) {
                        clearInterval(animationInterval);
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
                    renderFrame(index);
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
                frameCounter.textContent = `Frame: ${currentFrame + 1} / ${animation.frames.length}`;
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
                    alert('Cannot remove all frames; at least one frame must remain.');
                    return;
                }
                const indicesDesc = Array.from(selectedFrameIndices).sort((a, b) => b - a);
                indicesDesc.forEach(i => animation.frames.splice(i, 1));
                selectedFrameIndices.clear();
                currentFrame = Math.max(0, Math.min(currentFrame, animation.frames.length - 1));
                selectedFrameIndices.add(currentFrame);
                persistAnimation();
                populateFrameList();
                renderFrame(currentFrame);
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
                    alert('Cannot cut all frames; at least one frame must remain.');
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
                renderFrame(currentFrame);
                updateFrameCounter();
            } else if (isCtrl && e.key.toLowerCase() === 'v' && frameClipboard && frameClipboard.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                const insertAt = currentFrame + 1;
                frameClipboard.forEach((f, i) => {
                    animation.frames.splice(insertAt + i, 0, JSON.parse(JSON.stringify(f)));
                });
                selectedFrameIndices.clear();
                for (let i = 0; i < frameClipboard.length; i++) selectedFrameIndices.add(insertAt + i);
                currentFrame = insertAt;
                persistAnimation();
                populateFrameList();
                renderFrame(currentFrame);
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
        editorSelf._previewBgCanvas = null; // Not in Effekseer mode

        // Load sprite sheets and render first frame
        loadSpriteSheets().then(() => {
            if (spriteSheet1 || spriteSheet2) {
                populateFrameList();
                renderFrame(0);
            } else {
                ctx.fillStyle = ThemeColors.resolve('--color-text-muted', '#999999');
                ctx.font = '14px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Failed to load animation sprites', canvas.width / 2, canvas.height / 2);
            }
        });

        // Initial state
        stopBtn.disabled = true;
        stopBtn.style.opacity = '0.5';
    }

    setupEffekseerAnimationPlayback(animation) {
        const canvasContainer = document.getElementById('animation-preview-canvas');
        const playBtn = document.getElementById('animation-play-btn');
        const stopBtn = document.getElementById('animation-stop-btn');
        const frameCounter = document.getElementById('animation-frame-counter');
        const repeatCheckbox = document.getElementById('animation-repeat-checkbox');

        const currentProject = this.projectManager.getCurrentProject();
        if (!canvasContainer || !playBtn || !stopBtn || !currentProject) return;

        // Check if Effekseer is available and initialized
        console.log('[Effekseer Preview] Checking status...');
        console.log('[Effekseer Preview] typeof effekseer:', typeof effekseer);
        console.log('[Effekseer Preview] window._effekseerReady:', window._effekseerReady);

        if (typeof effekseer === 'undefined' || !window._effekseerReady) {
            const ctx = canvasContainer.getContext('2d');
            if (ctx) {
                ctx.fillStyle = ThemeColors.resolve('--color-text-muted', '#999999');
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                const msg = typeof effekseer === 'undefined' ?
                    'Effekseer library not loaded' :
                    'Effekseer initializing... Please wait';
                ctx.fillText(msg, canvasContainer.width / 2, canvasContainer.height / 2);
                console.log('[Effekseer Preview] Showing message:', msg);
            }

            // If Effekseer is loading, retry with polling
            if (typeof effekseer !== 'undefined' && !window._effekseerReady) {
                console.log('[Effekseer Preview] Effekseer found but not ready, setting up retry...');

                // Store retry info to avoid multiple retries
                if (!this._effekseerRetryCount) {
                    this._effekseerRetryCount = 0;
                }

                if (this._effekseerRetryCount < 20) { // Try for up to 10 seconds
                    this._effekseerRetryCount++;
                    console.log(`[Effekseer Preview] Retry attempt ${this._effekseerRetryCount}/20`);

                    setTimeout(() => {
                        if (window._effekseerReady) {
                            console.log('[Effekseer Preview] Effekseer now ready! Retrying setup...');
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
                            this.setupEffekseerAnimationPlayback(animation);
                        } else {
                            // Still not ready, this will trigger another retry
                            this.setupEffekseerAnimationPlayback(animation);
                        }
                    }, 500);
                } else {
                    console.error('[Effekseer Preview] Failed to initialize after 20 retries');
                    if (ctx) {
                        ctx.fillStyle = '#ff6666';
                        ctx.fillText('Effekseer initialization timeout', canvasContainer.width / 2, canvasContainer.height / 2);
                    }
                }
            } else {
                console.error('[Effekseer Preview] Effekseer library not found at all');
            }
            return;
        }

        console.log('[Effekseer Preview] Effekseer ready, proceeding with setup...');

        // Reference to this for closures
        const editorSelf = this;

        // Layered canvas approach: background Canvas2D underneath, WebGL on top
        const parent = canvasContainer.parentNode;

        // Create wrapper div
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position: relative; width: 960px; height: 540px; max-width: 100%; max-height: 100%;';

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
                effekseerContext.setRestorationOfStatesFlag(false);

                console.log('Effekseer context initialized for preview');
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
            const effectPath = path.join(currentProject.path, 'effects', animation.effectName + '.efkefc');

            console.log('Loading Effekseer effect:', effectPath);

            // Load effect with Effekseer
            const onLoad = () => {
                console.log('Effekseer effect loaded successfully');
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

        const render = () => {
            if (!isPlaying || !effekseerContext || !gl) {
                console.log('[Effekseer Render] Stopped - isPlaying:', isPlaying, 'effekseerContext:', !!effekseerContext, 'gl:', !!gl);
                return;
            }

            const now = Date.now();
            const deltaTime = now - lastTime;
            lastTime = now;
            accumulator += deltaTime;

            // Update Effekseer at fixed 60 FPS
            let updatesThisFrame = 0;
            while (accumulator >= fixedTimeStep && updatesThisFrame < 5) {
                // Play sound effects for this frame BEFORE incrementing
                playSE(currentFrame);

                effekseerContext.update();
                accumulator -= fixedTimeStep;
                currentFrame++;
                updatesThisFrame++;
            }

            // If we're way behind, just reset
            if (accumulator > fixedTimeStep * 5) {
                accumulator = 0;
            }

            renderFrameCount++;
            if (renderFrameCount === 1) {
                console.log('[Effekseer Render] First frame rendering...');
                console.log('[Effekseer Render] Canvas size:', canvas.width, 'x', canvas.height);
                console.log('[Effekseer Render] Handle exists:', handle && handle.exists);
                console.log('[Effekseer Render] Fixed timestep: 60 FPS');
            }

            // Update frame counter
            frameCounter.textContent = `Frame: ${currentFrame}`;

            // Clear canvas (transparent so background canvas shows through)
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

            // RPG Maker MZ style setup - balanced FOV
            const viewportSize = canvas.height * 1.2; // Balanced FOV to fill canvas without clipping
            // x is scaled by height/width so one world unit spans the same
            // number of pixels on both axes (round spheres on a wide canvas)
            const x = canvas.height / canvas.width; // * (mirror ? -1 : 1)
            const y = -1;
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
                console.log('[Effekseer Render] Projection p value:', p);
                console.log('[Effekseer Render] Viewport size:', viewportSize);
                console.log('[Effekseer Render] Matrices set as arrays');
            }

            // Draw effects
            effekseerContext.beginDraw();
            if (handle && handle.exists) {
                if (renderFrameCount === 1) {
                    console.log('[Effekseer Render] Drawing handle...');
                    console.log('[Effekseer Render] Handle location:',
                        handle.location ? handle.location : 'not available');
                }
                effekseerContext.drawHandle(handle);

                // Check for GL errors
                const err = gl.getError();
                if (err !== gl.NO_ERROR && renderFrameCount === 1) {
                    console.error('[Effekseer Render] GL Error:', err);
                }
            } else {
                // Handle no longer exists - effect has finished
                if (renderFrameCount > 1) {
                    console.log('[Effekseer Render] Effect finished');
                    // Check if repeat is enabled
                    if (repeatCheckbox && repeatCheckbox.checked) {
                        console.log('[Effekseer Render] Repeat enabled, restarting...');
                        // Restart the effect
                        stop();
                        setTimeout(() => play(), 100); // Small delay to ensure clean restart
                    } else {
                        console.log('[Effekseer Render] Auto-stopping');
                        stop();
                    }
                    return;
                }
            }
            effekseerContext.endDraw();

            if (renderFrameCount === 1) {
                console.log('[Effekseer Render] First frame rendered successfully');
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
                const audioPath = path.join(currentProject.path, 'audio', 'se', se.name + '.ogg');

                const audio = new Audio('file://' + audioPath);
                audio.volume = (se.volume || 90) / 100;
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

            // Play effect
            handle = effekseerContext.play(effect);

            if (handle) {
                // Set effect parameters from animation data
                const scale = (animation.scale || 100) / 100;
                const speed = (animation.speed || 100) / 100;
                const rotation = animation.rotation || { x: 0, y: 0, z: 0 };
                const offsetX = animation.offsetX || 0;
                const offsetY = animation.offsetY || 0;

                // Convert rotation from degrees to radians (offset X by 180 to match RPG Maker)
                const rx = ((180 - rotation.x) * Math.PI) / 180;
                const ry = (rotation.y * Math.PI) / 180;
                const rz = (rotation.z * Math.PI) / 180;

                // Scale offsets to work as pixels (divide by scale factor)
                const offsetScale = 0.1; // Scale factor to make offsets work as pixels
                handle.setLocation(offsetX * offsetScale, offsetY * offsetScale, 0);
                handle.setRotation(rx, ry, rz);
                handle.setScale(scale, scale, scale);
                handle.setSpeed(speed);

                console.log('Playing Effekseer effect with params:', { scale, speed, rotation, offsetX, offsetY });
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
            frameCounter.textContent = `Frame: 0`;

            playBtn.disabled = false;
            playBtn.style.opacity = '1';
            stopBtn.disabled = true;
            stopBtn.style.opacity = '0.5';
        };

        // Store stop function for cleanup when switching animations
        this._currentEffekseerStop = stop;

        // Initialize and load effect
        if (initWebGL()) {
            loadEffect();
        } else {
            // Display error on canvas
            gl = canvas.getContext('2d');
            if (gl) {
                gl.fillStyle = '#ff6666';
                gl.font = '14px Arial';
                gl.textAlign = 'center';
                gl.fillText('WebGL initialization failed', canvas.width / 2, canvas.height / 2);
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
                // Update animation data
                animation.scale = parseInt(scaleInput?.value) || 100;
                animation.speed = parseInt(speedInput?.value) || 100;
                animation.displayType = displayTypeSelect ? parseInt(displayTypeSelect.value) : (animation.displayType || 0);
                animation.rotation = {
                    x: parseInt(rotXInput?.value) || 0,
                    y: parseInt(rotYInput?.value) || 0,
                    z: parseInt(rotZInput?.value) || 0
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
                    const rx = ((180 - animation.rotation.x) * Math.PI) / 180; // Offset X by 180 to match RPG Maker
                    const ry = (animation.rotation.y * Math.PI) / 180;
                    const rz = (animation.rotation.z * Math.PI) / 180;

                    // Scale offsets to work as pixels
                    const offsetScale = 0.1;
                    handle.setLocation(animation.offsetX * offsetScale, animation.offsetY * offsetScale, 0);
                    handle.setRotation(rx, ry, rz);
                    handle.setScale(scale, scale, scale);
                    handle.setSpeed(speed);
                }

                console.log('Updated Effekseer animation parameters:', animation);
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
                    const rx = ((180 - rotationX) * Math.PI) / 180; // Offset X by 180 to match RPG Maker
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

        const fs = require('fs');
        const path = require('path');

        // Get list of .efkefc files from effects folder
        const effectsPath = path.join(currentProject.path, 'effects');
        let effectFiles = [];

        try {
            if (fs.existsSync(effectsPath)) {
                const files = fs.readdirSync(effectsPath);
                effectFiles = files
                    .filter(f => f.endsWith('.efkefc'))
                    .map(f => f.replace('.efkefc', ''))
                    .sort();
            }
        } catch (err) {
            console.error('Error reading effects folder:', err);
        }

        // Remove existing modal if any
        const existingModal = document.getElementById('effect-picker-modal');
        if (existingModal) existingModal.remove();

        const modalHTML = `
            <div id="effect-picker-modal" style="display: flex; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 10000; align-items: center; justify-content: center;">
                <div style="background: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 8px; width: 800px; max-height: 80vh; display: flex; flex-direction: column; padding: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <div style="font-size: 16px; font-weight: 600; color: var(--color-text-strong);">Select Effect File</div>
                        <button id="effect-picker-close" style="background: none; border: none; color: var(--color-text-muted); font-size: 24px; cursor: pointer; padding: 0; line-height: 1;">×</button>
                    </div>

                    <div style="display: flex; gap: 16px; flex: 1; min-height: 0;">
                        <!-- Left: Effect list -->
                        <div style="flex: 1; display: flex; flex-direction: column; min-width: 250px;">
                            <div style="margin-bottom: 12px;">
                                <input type="text" id="effect-search" placeholder="Search effects..." style="width: 100%; padding: 8px; background: var(--color-bg-input-alt); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; font-size: 12px;">
                            </div>

                            <div id="effect-list" style="display: flex; flex-direction: column; gap: 4px; max-height: 450px; overflow-y: auto; flex: 1;">
                                ${effectFiles.length > 0 ? effectFiles.map(effectName => `
                                    <div class="effect-item" data-effect="${effectName}" style="padding: 10px; background: ${animation.effectName === effectName ? 'var(--color-info)' : 'var(--color-bg-input-alt)'}; border: 1px solid var(--color-border-input); border-radius: 3px; cursor: pointer; font-size: 12px; color: var(--color-text); transition: background 0.2s;">
                                        ${effectName}
                                    </div>
                                `).join('') : '<div style="padding: 20px; text-align: center; color: var(--color-text-muted);">No effect files found in effects/ folder</div>'}
                            </div>
                        </div>

                        <!-- Right: Preview -->
                        <div style="flex: 1; display: flex; flex-direction: column; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; padding: 10px;">
                            <div style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 8px;">Preview</div>
                            <div style="flex: 1; display: flex; align-items: center; justify-content: center; background: var(--color-bg-deep); border: 1px solid var(--color-border-input); border-radius: 3px; position: relative;">
                                <canvas id="effect-preview-canvas" width="400" height="300" style="max-width: 100%; max-height: 100%;"></canvas>
                                <div id="effect-preview-message" style="position: absolute; color: var(--color-text-muted); font-size: 12px; text-align: center;">Select an effect to preview</div>
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; gap: 10px; margin-top: 20px; justify-content: flex-end;">
                        <button id="effect-picker-cancel" class="rr-btn-secondary">Cancel</button>
                        <button id="effect-picker-ok" style="padding: 8px 16px; background: var(--color-accent); border: 1px solid var(--color-accent); color: var(--color-bg-deep); border-radius: 3px; cursor: pointer; font-size: 12px; font-weight: bold;">OK</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const modal = document.getElementById('effect-picker-modal');
        const closeBtn = document.getElementById('effect-picker-close');
        const cancelBtn = document.getElementById('effect-picker-cancel');
        const okBtn = document.getElementById('effect-picker-ok');
        const searchInput = document.getElementById('effect-search');
        const effectList = document.getElementById('effect-list');
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

        const initPreview = () => {
            if (!window._effekseerReady) {
                previewMessage.textContent = 'Effekseer not initialized';
                return false;
            }

            try {
                previewGL = previewCanvas.getContext('webgl', { premultipliedAlpha: false }) ||
                           previewCanvas.getContext('experimental-webgl', { premultipliedAlpha: false });

                if (!previewGL) {
                    previewMessage.textContent = 'WebGL not supported';
                    return false;
                }

                previewEffekseerContext = effekseer.createContext();
                if (!previewEffekseerContext) {
                    previewMessage.textContent = 'Failed to create Effekseer context';
                    return false;
                }

                previewEffekseerContext.init(previewGL);
                previewEffekseerContext.setRestorationOfStatesFlag(false);
                return true;
            } catch (e) {
                console.error('Preview initialization error:', e);
                previewMessage.textContent = 'Preview initialization failed';
                return false;
            }
        };

        const playPreview = (effectName) => {
            if (!previewEffekseerContext || !previewGL) return;

            // Stop current preview
            if (previewAnimationFrameId) {
                cancelAnimationFrame(previewAnimationFrameId);
                previewAnimationFrameId = null;
            }
            if (previewHandle) {
                previewHandle.stop();
                previewHandle = null;
            }

            currentPreviewEffect = effectName;
            previewMessage.style.display = 'none';

            const effectPath = path.join(currentProject.path, 'effects', effectName + '.efkefc');

            const startPlayback = () => {
                if (currentPreviewEffect !== effectName) return; // Effect changed

                previewHandle = previewEffekseerContext.play(previewEffect);
                if (previewHandle) {
                    previewHandle.setLocation(0, 0, 0);
                    previewHandle.setRotation(0, 0, 0);
                    previewHandle.setScale(1.0, 1.0, 1.0); // Normal scale (wider FOV now)
                    previewHandle.setSpeed(1);
                }

                // Render loop
                let lastTime = Date.now();
                let accumulator = 0;
                const fixedTimeStep = 1000 / 60;

                const render = () => {
                    if (currentPreviewEffect !== effectName) return;

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
                    const x = 1;
                    const y = -1;
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
                previewMessage.style.display = 'block';
                previewMessage.textContent = 'Failed to load effect';
            };

            // onLoad can fire synchronously inside loadEffect when the core
            // already caches every resource — `pending` is not assigned yet
            // in that case, so defer installation to after the call. The
            // selection guard keeps a slow stale load from clobbering
            // previewEffect after the user has picked a different effect.
            let pending = null;
            let syncLoaded = false;
            const install = () => {
                if (currentPreviewEffect !== effectName) return;
                previewEffect = pending;
                startPlayback();
            };
            const onLoad = () => {
                if (pending) install();
                else syncLoaded = true;
            };

            try {
                pending = RR_loadEffekseerEffectFromFile(previewEffekseerContext, effectPath, 1.0, onLoad, onError);
            } catch (e) {
                onError(e.message);
                return;
            }
            if (syncLoaded) install();
        };

        // Initialize preview
        if (initPreview()) {
            previewMessage.textContent = 'Select an effect to preview';
        }

        // Close modal
        const closeModal = () => {
            // Clean up preview
            if (previewAnimationFrameId) {
                cancelAnimationFrame(previewAnimationFrameId);
            }
            if (previewHandle) {
                previewHandle.stop();
            }
            currentPreviewEffect = null;

            modal.remove();
        };

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        okBtn.addEventListener('mouseenter', () => { okBtn.style.backgroundColor = 'var(--color-accent-muted)'; });
        okBtn.addEventListener('mouseleave', () => { okBtn.style.backgroundColor = 'var(--color-accent)'; });

        // Effect item click
        effectList.addEventListener('click', (e) => {
            const item = e.target.closest('.effect-item');
            if (!item) return;

            selectedEffect = item.dataset.effect;

            // Update selection visual
            effectList.querySelectorAll('.effect-item').forEach(el => {
                el.style.background = el.dataset.effect === selectedEffect ? 'var(--color-info)' : 'var(--color-bg-input-alt)';
            });

            // Play preview
            playPreview(selectedEffect);
        });

        // Search functionality
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            effectList.querySelectorAll('.effect-item').forEach(item => {
                const effectName = item.dataset.effect.toLowerCase();
                item.style.display = effectName.includes(searchTerm) ? 'block' : 'none';
            });
        });

        // OK button
        okBtn.addEventListener('click', () => {
            if (selectedEffect) {
                animation.effectName = selectedEffect;

                // Update the effect name display
                const effectNameDisplay = document.getElementById('effekseer-effect-name');
                if (effectNameDisplay) {
                    effectNameDisplay.textContent = selectedEffect;
                }

                // Reload the animation detail view to update playback
                this.showAnimationDetail(container, animation);
            }
            closeModal();
        });

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }
}
