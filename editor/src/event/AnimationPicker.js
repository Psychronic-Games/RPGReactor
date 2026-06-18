/**
 * AnimationPicker - Visual picker for animations with live preview
 * Supports both sprite-based and Effekseer animations
 */
class AnimationPicker {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.selectedId = 0;
        this.callback = null;

        // Preview state
        this._loadGeneration = 0;
        this._spriteInterval = null;
        this._animFrameId = null;
        this._effekseerContext = null;
        this._effekseerHandle = null;
        this._gl = null;
        this._spriteSheet1 = null;
        this._spriteSheet2 = null;
        this._previewCanvas = null;
        this._isPlaying = false;
    }

    _t(text) {
        return window.I18n ? window.I18n.tText(text) : text;
    }

    /**
     * Show the animation picker modal
     * @param {number} currentAnimId - Currently selected animation ID
     * @param {function} callback - Called with selected animation ID
     */
    show(currentAnimId, callback) {
        this.selectedId = currentAnimId || 0;
        this.callback = callback;
        this._loadGeneration++;

        // Remove any existing modal
        if (this.modal) {
            this._cleanup();
            this.modal.remove();
            this.modal = null;
        }

        this._createModal();
        document.body.appendChild(this.modal);
    }

    _createModal() {
        // Backdrop
        this.modal = document.createElement('div');
        this.modal.style.cssText = `
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 20000;
        `;

        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this._close();
        });

        // Container
        const container = document.createElement('div');
        container.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            width: 900px;
            height: 80vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 12px 16px;
            background-color: var(--color-bg-panel);
            border-bottom: 1px solid var(--color-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-radius: 6px 6px 0 0;
            flex-shrink: 0;
        `;
        header.innerHTML = `
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">${this._t('Select Animation')}</h3>
            <button style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">×</button>
        `;
        header.querySelector('button').addEventListener('click', () => this._close());
        container.appendChild(header);

        // Body (2-column)
        const body = document.createElement('div');
        body.style.cssText = `
            flex: 1;
            display: flex;
            overflow: hidden;
        `;

        // Left panel - list
        const leftPanel = document.createElement('div');
        leftPanel.style.cssText = `
            width: 280px;
            background-color: var(--color-bg-list-item);
            border-right: 1px solid var(--color-border);
            display: flex;
            flex-direction: column;
            flex-shrink: 0;
        `;

        // Search input
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = this._t('Search animations...');
        searchInput.style.cssText = `
            margin: 8px;
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            outline: none;
            flex-shrink: 0;
        `;
        leftPanel.appendChild(searchInput);

        // Scrollable list
        const listContainer = document.createElement('div');
        listContainer.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 0 8px 8px 8px;
        `;
        leftPanel.appendChild(listContainer);

        // Right panel - preview
        const rightPanel = document.createElement('div');
        rightPanel.style.cssText = `
            flex: 1;
            background-color: var(--color-bg-surface);
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 16px;
            overflow-y: auto;
        `;
        this._rightPanel = rightPanel;

        body.appendChild(leftPanel);
        body.appendChild(rightPanel);
        container.appendChild(body);

        // Footer
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 12px 16px;
            background-color: var(--color-bg-panel);
            border-top: 1px solid var(--color-border);
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            border-radius: 0 0 6px 6px;
            flex-shrink: 0;
        `;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = this._t('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => this._close());

        const okBtn = document.createElement('button');
        okBtn.textContent = this._t('OK');
        okBtn.style.cssText = `
            padding: 6px 20px;
            background-color: var(--color-accent);
            color: var(--color-bg-deep);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
        `;
        okBtn.addEventListener('mouseenter', () => { okBtn.style.backgroundColor = 'var(--color-accent-muted)'; });
        okBtn.addEventListener('mouseleave', () => { okBtn.style.backgroundColor = 'var(--color-accent)'; });
        okBtn.addEventListener('click', () => this._confirm());

        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        container.appendChild(footer);

        this.modal.appendChild(container);

        // Populate list
        this._populateList(listContainer, searchInput);
    }

    _populateList(listContainer, searchInput) {
        const animations = this.databaseManager.data.animations;
        const items = [];

        // (None) entry
        const noneItem = this._createListItem(0, this._t('(None)'), null);
        listContainer.appendChild(noneItem);
        items.push({ el: noneItem, name: this._t('(None)').toLowerCase(), id: 0 });

        if (this.selectedId === 0) {
            noneItem.style.backgroundColor = 'var(--color-selection-mid)';
            noneItem.style.color = 'var(--color-link)';
        }

        // Animation entries
        for (let i = 1; i < animations.length; i++) {
            const anim = animations[i];
            if (!anim) continue;

            const isEffekseer = anim.effectName !== undefined;
            const typeBadge = isEffekseer ? 'Effekseer' : this._t('Sprite');
            const badgeColor = isEffekseer ? 'var(--color-link-bright)' : 'var(--color-syntax-type)';

            const item = this._createListItem(i, anim.name, { typeBadge, badgeColor });
            listContainer.appendChild(item);
            items.push({ el: item, name: (anim.name || '').toLowerCase(), id: i });

            if (this.selectedId === i) {
                item.style.backgroundColor = 'var(--color-selection-mid)';
                item.style.color = 'var(--color-link)';
                // Auto-scroll to selected item
                setTimeout(() => item.scrollIntoView({ block: 'nearest' }), 0);
                // Auto-load preview
                this._loadPreview(i);
            }
        }

        // Search filter (debounced)
        let searchTimeout = null;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                const query = searchInput.value.toLowerCase().trim();
                items.forEach(({ el, name, id }) => {
                    const idStr = String(id).padStart(4, '0');
                    const matches = !query || name.includes(query) || idStr.includes(query);
                    el.style.display = matches ? '' : 'none';
                });
            }, 150);
        });
    }

    _createListItem(id, name, badge) {
        const item = document.createElement('div');
        item.dataset.animId = id;
        item.style.cssText = `
            padding: 6px 10px;
            cursor: pointer;
            border-bottom: 1px solid var(--color-border);
            font-size: 12px;
            color: var(--color-text);
            display: flex;
            align-items: center;
            gap: 8px;
        `;

        if (badge) {
            const badgeEl = document.createElement('span');
            badgeEl.textContent = badge.typeBadge;
            badgeEl.style.cssText = `
                font-size: 9px;
                padding: 1px 5px;
                border-radius: 3px;
                background-color: ${badge.badgeColor}22;
                color: ${badge.badgeColor};
                border: 1px solid ${badge.badgeColor}44;
                flex-shrink: 0;
            `;
            item.appendChild(badgeEl);
        }

        const label = document.createElement('span');
        label.textContent = id === 0 ? name : `[${String(id).padStart(4, '0')}] ${name}`;
        label.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
        item.appendChild(label);

        item.addEventListener('mouseenter', () => {
            if (parseInt(item.dataset.animId) !== this.selectedId) {
                item.style.backgroundColor = 'var(--color-bg-list-item)';
            }
        });
        item.addEventListener('mouseleave', () => {
            if (parseInt(item.dataset.animId) !== this.selectedId) {
                item.style.backgroundColor = '';
            }
        });

        item.addEventListener('click', () => {
            const prevSelected = item.parentElement.querySelector(`[data-anim-id="${this.selectedId}"]`);
            if (prevSelected) {
                prevSelected.style.backgroundColor = '';
                prevSelected.style.color = 'var(--color-text)';
            }

            this.selectedId = parseInt(item.dataset.animId);
            item.style.backgroundColor = 'var(--color-selection-mid)';
            item.style.color = 'var(--color-link)';

            this._loadPreview(this.selectedId);
        });

        return item;
    }

    _loadPreview(animId) {
        this._stopPreview();
        const gen = ++this._loadGeneration;
        const panel = this._rightPanel;
        panel.innerHTML = '';

        if (animId === 0) {
            panel.innerHTML = `<div style="color: var(--color-text-muted); margin-top: 40px; font-size: 13px;">${this._t('(None) - No animation')}</div>`;
            return;
        }

        const animation = this.databaseManager.getAnimation(animId);
        if (!animation) {
            panel.innerHTML = `<div style="color: #f88; margin-top: 40px; font-size: 13px;">${this._t('Animation data not found')}</div>`;
            return;
        }

        const isEffekseer = animation.effectName !== undefined;

        // Type badge
        const typeBadge = document.createElement('div');
        typeBadge.style.cssText = `
            font-size: 11px;
            padding: 3px 10px;
            border-radius: 3px;
            margin-bottom: 12px;
            align-self: flex-start;
        `;
        if (isEffekseer) {
            typeBadge.textContent = this._t('Effekseer Animation');
            typeBadge.style.backgroundColor = 'var(--color-link-bright)22';
            typeBadge.style.color = 'var(--color-link-bright)';
            typeBadge.style.border = '1px solid var(--color-link-bright)44';
        } else {
            typeBadge.textContent = this._t('Sprite Animation');
            typeBadge.style.backgroundColor = 'var(--color-syntax-type)22';
            typeBadge.style.color = 'var(--color-syntax-type)';
            typeBadge.style.border = '1px solid var(--color-syntax-type)44';
        }
        panel.appendChild(typeBadge);

        // Animation name
        const nameLabel = document.createElement('div');
        nameLabel.textContent = animation.name || 'Unnamed';
        nameLabel.style.cssText = 'color: var(--color-text-strong); font-size: 14px; font-weight: 600; margin-bottom: 12px;';
        panel.appendChild(nameLabel);

        // Canvas
        const canvas = document.createElement('canvas');
        canvas.width = 480;
        canvas.height = 360;
        canvas.style.cssText = `
            background-color: var(--color-bg-deep);
            border: 1px solid var(--color-border);
            border-radius: 3px;
            max-width: 100%;
        `;
        panel.appendChild(canvas);
        this._previewCanvas = canvas;

        // Controls
        const controls = document.createElement('div');
        controls.style.cssText = 'display: flex; gap: 8px; margin-top: 10px; align-items: center;';

        const playBtn = document.createElement('button');
        playBtn.textContent = this._t('Play');
        playBtn.style.cssText = `
            padding: 5px 16px;
            background-color: var(--color-bg-button);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        `;
        playBtn.addEventListener('mouseenter', () => { playBtn.style.backgroundColor = 'var(--color-accent-tint-25)'; playBtn.style.borderColor = 'var(--color-accent)'; });
        playBtn.addEventListener('mouseleave', () => { playBtn.style.backgroundColor = 'var(--color-bg-button)'; playBtn.style.borderColor = 'var(--color-border-input)'; });

        const stopBtn = document.createElement('button');
        stopBtn.textContent = this._t('Stop');
        stopBtn.style.cssText = `
            padding: 5px 16px;
            background-color: var(--color-bg-button);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            opacity: 0.5;
        `;
        stopBtn.disabled = true;
        stopBtn.addEventListener('mouseenter', () => { if (!stopBtn.disabled) { stopBtn.style.backgroundColor = 'var(--color-accent-tint-25)'; stopBtn.style.borderColor = 'var(--color-accent)'; } });
        stopBtn.addEventListener('mouseleave', () => { stopBtn.style.backgroundColor = 'var(--color-bg-button)'; stopBtn.style.borderColor = 'var(--color-border-input)'; });

        const frameLabel = document.createElement('span');
        frameLabel.style.cssText = 'color: var(--color-text-muted); font-size: 11px; margin-left: 8px;';
        frameLabel.textContent = '';

        controls.appendChild(playBtn);
        controls.appendChild(stopBtn);
        controls.appendChild(frameLabel);
        panel.appendChild(controls);

        // Load and auto-play
        if (isEffekseer) {
            this._setupEffekseerPreview(canvas, animation, gen, playBtn, stopBtn, frameLabel);
        } else {
            this._setupSpritePreview(canvas, animation, gen, playBtn, stopBtn, frameLabel);
        }
    }

    _setupSpritePreview(canvas, animation, gen, playBtn, stopBtn, frameLabel) {
        const ctx = canvas.getContext('2d');
        const currentProject = this.projectController.getCurrentProject();
        if (!currentProject) return;

        let spriteSheet1 = null;
        let spriteSheet2 = null;
        let currentFrame = 0;
        let isPlaying = false;

        const loadSheets = () => {
            const promises = [];
            const path = require('path');

            if (animation.animation1Name) {
                const imgPath = path.join(currentProject.path, 'img', 'animations', animation.animation1Name + '.png');
                const img1 = new Image();
                const p1 = new Promise((resolve) => {
                    img1.onload = () => { spriteSheet1 = img1; resolve(); };
                    img1.onerror = () => { console.warn('Failed to load:', imgPath); resolve(); };
                    img1.src = 'file://' + imgPath;
                });
                promises.push(p1);
            }

            if (animation.animation2Name) {
                const imgPath = path.join(currentProject.path, 'img', 'animations', animation.animation2Name + '.png');
                const img2 = new Image();
                const p2 = new Promise((resolve) => {
                    img2.onload = () => { spriteSheet2 = img2; resolve(); };
                    img2.onerror = () => { console.warn('Failed to load:', imgPath); resolve(); };
                    img2.src = 'file://' + imgPath;
                });
                promises.push(p2);
            }

            return Promise.all(promises);
        };

        const renderFrame = (frameIndex) => {
            if (gen !== this._loadGeneration) return;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            if (!animation.frames || frameIndex >= animation.frames.length) return;

            const frameData = animation.frames[frameIndex];
            if (!frameData || frameData.length === 0) return;

            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;

            frameData.forEach((cell) => {
                const [pattern, x, y, scale, rotation, mirror, opacity, blendMode] = cell;

                const sheet = pattern < 100 ? spriteSheet1 : spriteSheet2;
                if (!sheet) return;

                const cellPattern = pattern % 100;
                const cellSize = 192;
                const cols = 5;
                const srcX = (cellPattern % cols) * cellSize;
                const srcY = Math.floor(cellPattern / cols) * cellSize;

                ctx.save();
                ctx.translate(centerX + x, centerY + y);
                ctx.rotate((rotation * Math.PI) / 180);
                ctx.scale(scale / 100, scale / 100);
                if (mirror) ctx.scale(-1, 1);
                ctx.globalAlpha = opacity / 255;

                ctx.drawImage(sheet, srcX, srcY, cellSize, cellSize, -cellSize / 2, -cellSize / 2, cellSize, cellSize);
                ctx.restore();
            });

            frameLabel.textContent = `${this._t('Frame:')} ${frameIndex + 1} / ${animation.frames.length}`;
        };

        const play = () => {
            if (isPlaying) return;
            if (!animation.frames || animation.frames.length === 0) return;
            isPlaying = true;
            this._isPlaying = true;
            currentFrame = 0;
            playBtn.disabled = true;
            playBtn.style.opacity = '0.5';
            stopBtn.disabled = false;
            stopBtn.style.opacity = '1';

            this._spriteInterval = setInterval(() => {
                if (gen !== this._loadGeneration) { stop(); return; }
                renderFrame(currentFrame);
                currentFrame++;
                if (currentFrame >= animation.frames.length) {
                    currentFrame = 0; // Loop
                }
            }, 1000 / 15); // 15 FPS
        };

        const stop = () => {
            isPlaying = false;
            this._isPlaying = false;
            if (this._spriteInterval) {
                clearInterval(this._spriteInterval);
                this._spriteInterval = null;
            }
            playBtn.disabled = false;
            playBtn.style.opacity = '1';
            stopBtn.disabled = true;
            stopBtn.style.opacity = '0.5';
        };

        playBtn.addEventListener('click', play);
        stopBtn.addEventListener('click', stop);

        // Load and auto-play
        loadSheets().then(() => {
            if (gen !== this._loadGeneration) return;
            if (!spriteSheet1 && !spriteSheet2) {
                ctx.fillStyle = ThemeColors.resolve('--color-text-muted', '#999999');
                ctx.font = '13px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(this._t('No sprite sheets found'), canvas.width / 2, canvas.height / 2);
                return;
            }
            renderFrame(0);
            play();
        });
    }

    _setupEffekseerPreview(canvas, animation, gen, playBtn, stopBtn, frameLabel) {
        const currentProject = this.projectController.getCurrentProject();
        if (!currentProject) return;

        // Check Effekseer availability
        if (typeof effekseer === 'undefined') {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = ThemeColors.resolve('--color-text-muted', '#999999');
            ctx.font = '13px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(this._t('Effekseer library not loaded'), canvas.width / 2, canvas.height / 2);
            return;
        }

        if (!window._effekseerReady) {
            // Retry with polling
            let retries = 0;
            const checkReady = () => {
                if (gen !== this._loadGeneration) return;
                if (window._effekseerReady) {
                    this._setupEffekseerPreview(canvas, animation, gen, playBtn, stopBtn, frameLabel);
                    return;
                }
                retries++;
                if (retries < 20) {
                    setTimeout(checkReady, 500);
                } else {
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#ff6666';
                    ctx.font = '13px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(this._t('Effekseer initialization timeout'), canvas.width / 2, canvas.height / 2);
                }
            };

            const ctx = canvas.getContext('2d');
            ctx.fillStyle = ThemeColors.resolve('--color-text-muted', '#999999');
            ctx.font = '13px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(this._t('Effekseer initializing... Please wait'), canvas.width / 2, canvas.height / 2);
            setTimeout(checkReady, 500);
            return;
        }

        // Effekseer ready - init WebGL
        let gl, effekseerContext, effect, handle;
        let isPlaying = false;
        let currentFrame = 0;

        try {
            gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: false }) ||
                 canvas.getContext('experimental-webgl', { premultipliedAlpha: false, alpha: false });
            if (!gl) {
                const ctx2d = canvas.getContext('2d');
                ctx2d.fillStyle = '#ff6666';
                ctx2d.font = '13px Arial';
                ctx2d.textAlign = 'center';
                ctx2d.fillText(this._t('WebGL not supported'), canvas.width / 2, canvas.height / 2);
                return;
            }

            effekseerContext = effekseer.createContext();
            if (!effekseerContext) {
                console.error('Failed to create Effekseer context');
                return;
            }
            effekseerContext.init(gl);
            effekseerContext.setRestorationOfStatesFlag(false);
            this._effekseerContext = effekseerContext;
            this._gl = gl;
        } catch (e) {
            console.error('Effekseer init error:', e);
            return;
        }

        // Load effect
        if (!animation.effectName) {
            const ctx2d = canvas.getContext('2d');
            if (ctx2d) {
                ctx2d.fillStyle = ThemeColors.resolve('--color-text-muted', '#999999');
                ctx2d.font = '13px Arial';
                ctx2d.textAlign = 'center';
                ctx2d.fillText(this._t('No effect specified'), canvas.width / 2, canvas.height / 2);
            }
            return;
        }

        const path = require('path');
        const effectPath = path.join(currentProject.path, 'effects', animation.effectName + '.efkefc');
        const relativePath = path.relative(process.cwd(), effectPath).replace(/\\/g, '/');

        const onLoad = () => {
            if (gen !== this._loadGeneration) return;
            play();
        };

        const onError = (msg, p) => {
            console.error('Failed to load Effekseer effect:', msg, p);
            playBtn.disabled = true;
            playBtn.style.opacity = '0.5';
        };

        effect = effekseerContext.loadEffect(relativePath, 1.0, onLoad, onError);

        // Render loop
        let lastTime = Date.now();
        let accumulator = 0;
        const fixedTimeStep = 1000 / 60;

        const render = () => {
            if (!isPlaying || gen !== this._loadGeneration || !effekseerContext || !gl) return;

            const now = Date.now();
            accumulator += now - lastTime;
            lastTime = now;

            let updates = 0;
            while (accumulator >= fixedTimeStep && updates < 5) {
                effekseerContext.update();
                accumulator -= fixedTimeStep;
                currentFrame++;
                updates++;
            }
            if (accumulator > fixedTimeStep * 5) accumulator = 0;

            frameLabel.textContent = `${this._t('Frame:')} ${currentFrame}`;

            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

            // Projection & camera matrices (RPG Maker MZ style)
            const viewportSize = canvas.height * 1.2;
            const p = -(viewportSize / canvas.height);
            effekseerContext.setProjectionMatrix([
                1, 0, 0, 0,
                0, -1, 0, 0,
                0, 0, 1, p,
                0, 0, 0, 1
            ]);
            effekseerContext.setCameraMatrix([
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                0, 0, -10, 1
            ]);

            effekseerContext.beginDraw();
            if (handle && handle.exists) {
                effekseerContext.drawHandle(handle);
            } else if (currentFrame > 1) {
                // Effect finished, restart (loop)
                stop();
                setTimeout(() => { if (gen === this._loadGeneration) play(); }, 100);
                return;
            }
            effekseerContext.endDraw();

            this._animFrameId = requestAnimationFrame(render);
        };

        const play = () => {
            if (isPlaying) return;
            if (!effect || !effect.isLoaded) return;
            isPlaying = true;
            this._isPlaying = true;
            currentFrame = 0;
            lastTime = Date.now();
            accumulator = 0;

            handle = effekseerContext.play(effect);
            this._effekseerHandle = handle;

            if (handle) {
                const scale = (animation.scale || 100) / 100;
                const speed = (animation.speed || 100) / 100;
                const rotation = animation.rotation || { x: 0, y: 0, z: 0 };
                const offsetX = animation.offsetX || 0;
                const offsetY = animation.offsetY || 0;

                const rx = ((180 - rotation.x) * Math.PI) / 180;
                const ry = (rotation.y * Math.PI) / 180;
                const rz = (rotation.z * Math.PI) / 180;

                const offsetScale = 0.1;
                handle.setLocation(offsetX * offsetScale, offsetY * offsetScale, 0);
                handle.setRotation(rx, ry, rz);
                handle.setScale(scale, scale, scale);
                handle.setSpeed(speed);
            }

            playBtn.disabled = true;
            playBtn.style.opacity = '0.5';
            stopBtn.disabled = false;
            stopBtn.style.opacity = '1';

            render();
        };

        const stop = () => {
            isPlaying = false;
            this._isPlaying = false;

            if (this._animFrameId) {
                cancelAnimationFrame(this._animFrameId);
                this._animFrameId = null;
            }

            if (handle) {
                handle.stop();
                handle = null;
                this._effekseerHandle = null;
            }

            if (gl) {
                gl.clearColor(0, 0, 0, 1);
                gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            }

            currentFrame = 0;
            frameLabel.textContent = '';

            playBtn.disabled = false;
            playBtn.style.opacity = '1';
            stopBtn.disabled = true;
            stopBtn.style.opacity = '0.5';
        };

        playBtn.addEventListener('click', play);
        stopBtn.addEventListener('click', stop);
    }

    _stopPreview() {
        // Stop sprite preview
        if (this._spriteInterval) {
            clearInterval(this._spriteInterval);
            this._spriteInterval = null;
        }

        // Stop Effekseer preview
        if (this._animFrameId) {
            cancelAnimationFrame(this._animFrameId);
            this._animFrameId = null;
        }

        if (this._effekseerHandle) {
            try { this._effekseerHandle.stop(); } catch (e) {}
            this._effekseerHandle = null;
        }

        this._isPlaying = false;
    }

    _cleanup() {
        this._stopPreview();

        // Destroy Effekseer context
        if (this._effekseerContext) {
            try { this._effekseerContext.release(); } catch (e) {}
            this._effekseerContext = null;
        }

        this._gl = null;
        this._spriteSheet1 = null;
        this._spriteSheet2 = null;
        this._previewCanvas = null;
        this._rightPanel = null;
    }

    _confirm() {
        if (this.callback) {
            this.callback(this.selectedId);
        }
        this._close();
    }

    _close() {
        this._cleanup();
        if (this.modal) {
            this.modal.remove();
            this.modal = null;
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AnimationPicker;
}
