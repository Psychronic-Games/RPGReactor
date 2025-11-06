/**
 * DatabaseAnimationEditor - Animation editor for RPG Reactor
 * Handles sprite-based and Effekseer animations
 */

class DatabaseAnimationEditor {
    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;
    }

    showAnimationDetail(container, animation) {
        container.innerHTML = '';
        container.style.overflow = '';
        container.style.display = '';
        container.style.flexDirection = '';
        container.style.padding = '16px';

        // Determine animation type
        const isEffekseer = animation.effectName !== undefined;
        const isSpriteAnimation = animation.animation1Name !== undefined && animation.animation1Name !== '';

        const html = `
            <div style="display: flex; flex-direction: column; gap: 16px; width: 100%;">
                <!-- Header with black background -->
                <div style="background: #000; padding: 12px 16px; border: 1px solid #3e3e42; border-radius: 3px;">
                    <div style="font-size: 14px; font-weight: 600; margin-bottom: 4px; color: #fff;">${animation.name || 'Unnamed Animation'}</div>
                    <div style="font-size: 11px; color: #999;">ID: ${animation.id} | Type: ${isEffekseer ? 'Effekseer' : isSpriteAnimation ? 'Sprite-based' : 'Unknown'}</div>
                </div>

                <!-- Main content area -->
                <div style="display: flex; gap: 16px; flex-wrap: wrap;">
                    <!-- Left: Frame Timeline -->
                    <div style="width: 180px; min-width: 180px; background: #2d2d30; border: 1px solid #3e3e42; border-radius: 3px; padding: 12px; display: flex; flex-direction: column; max-height: 500px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <div style="font-size: 12px; font-weight: 600; color: #ccc;">Frames</div>
                            <div style="display: flex; gap: 4px;">
                                <button id="add-frame-btn" style="padding: 4px 8px; background: #0e639c; border: 1px solid #1177bb; color: #fff; border-radius: 2px; cursor: pointer; font-size: 10px;" title="Add Frame">+</button>
                                <button id="remove-frame-btn" style="padding: 4px 8px; background: #5a2d2d; border: 1px solid #6d3535; color: #ccc; border-radius: 2px; cursor: pointer; font-size: 10px;" title="Remove Frame">-</button>
                            </div>
                        </div>
                        <div id="animation-frame-list" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 4px;">
                            <!-- Frame list will be populated here -->
                        </div>
                    </div>

                    <!-- Center: Preview + Controls -->
                    <div style="flex: 1; min-width: 300px; display: flex; flex-direction: column; gap: 12px;">
                        <!-- Preview Canvas -->
                        <div style="background: #1e1e1e; border: 1px solid #3e3e42; border-radius: 3px; padding: 16px; display: flex; flex-direction: column;">
                            <div style="font-size: 12px; font-weight: 600; margin-bottom: 12px; color: #ccc;">Preview</div>
                            <div style="display: flex; align-items: center; justify-content: center; background: #000; border: 1px solid #555; position: relative; min-height: 300px; max-height: 480px;">
                                <canvas id="animation-preview-canvas" width="640" height="480" style="image-rendering: pixelated; max-width: 100%; max-height: 100%;"></canvas>
                                ${!isSpriteAnimation && !isEffekseer ? '<div style="color: #888; position: absolute;">No preview available</div>' : ''}
                                ${isEffekseer ? '<div style="color: #888; position: absolute;">Effekseer preview not yet implemented</div>' : ''}
                            </div>

                            <!-- Playback Controls -->
                            <div style="margin-top: 12px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                                <button id="animation-play-btn" style="padding: 6px 16px; background: #0e639c; border: 1px solid #1177bb; color: #fff; border-radius: 3px; cursor: pointer; font-size: 11px;">▶ Play</button>
                                <button id="animation-stop-btn" style="padding: 6px 16px; background: #5a2d2d; border: 1px solid #6d3535; color: #ccc; border-radius: 3px; cursor: pointer; font-size: 11px;">■ Stop</button>
                                <div style="flex: 1; text-align: right; font-size: 10px; color: #999; min-width: 120px;">
                                    <span id="animation-frame-counter">Frame: 0 / ${animation.frames ? animation.frames.length : 0}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Properties and Timings below preview -->
                        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                            <!-- Properties -->
                            <div style="flex: 1; min-width: 250px; background: #2d2d30; border: 1px solid #3e3e42; border-radius: 3px; padding: 16px;">
                                <div style="font-size: 12px; font-weight: 600; margin-bottom: 12px; color: #ccc;">Properties</div>
                                <div style="display: flex; flex-direction: column; gap: 10px; font-size: 11px;">
                            ${isSpriteAnimation ? `
                                <div>
                                    <div style="color: #999; margin-bottom: 4px;">Animation 1:</div>
                                    <div style="background: #3c3c3c; padding: 6px; border: 1px solid #555; border-radius: 2px; word-break: break-word;">${animation.animation1Name || 'None'}</div>
                                    ${animation.animation1Hue !== 0 ? `<div style="color: #888; font-size: 10px; margin-top: 2px;">Hue: ${animation.animation1Hue}</div>` : ''}
                                </div>
                                <div>
                                    <div style="color: #999; margin-bottom: 4px;">Animation 2:</div>
                                    <div style="background: #3c3c3c; padding: 6px; border: 1px solid #555; border-radius: 2px; word-break: break-word;">${animation.animation2Name || 'None'}</div>
                                    ${animation.animation2Hue !== 0 ? `<div style="color: #888; font-size: 10px; margin-top: 2px;">Hue: ${animation.animation2Hue}</div>` : ''}
                                </div>
                                <div>
                                    <div style="color: #999; margin-bottom: 4px;">Position:</div>
                                    <div style="background: #3c3c3c; padding: 6px; border: 1px solid #555; border-radius: 2px;">
                                        ${animation.position === 0 ? 'Head' : animation.position === 1 ? 'Center' : animation.position === 2 ? 'Feet' : 'Screen'}
                                    </div>
                                </div>
                                <div>
                                    <div style="color: #999; margin-bottom: 4px;">Frames:</div>
                                    <div style="background: #3c3c3c; padding: 6px; border: 1px solid #555; border-radius: 2px;">${animation.frames ? animation.frames.length : 0}</div>
                                </div>
                            ` : ''}

                            ${isEffekseer ? `
                                <div>
                                    <div style="color: #999; margin-bottom: 4px;">Effect Name:</div>
                                    <div style="background: #3c3c3c; padding: 6px; border: 1px solid #555; border-radius: 2px; word-break: break-word;">${animation.effectName || 'None'}</div>
                                </div>
                                <div>
                                    <div style="color: #999; margin-bottom: 4px;">Display Type:</div>
                                    <div style="background: #3c3c3c; padding: 6px; border: 1px solid #555; border-radius: 2px;">
                                        ${animation.displayType === 0 ? 'Normal' : animation.displayType === 1 ? 'MV Compatible' : 'Unknown'}
                                    </div>
                                </div>
                                <div>
                                    <div style="color: #999; margin-bottom: 4px;">Scale:</div>
                                    <div style="background: #3c3c3c; padding: 6px; border: 1px solid #555; border-radius: 2px;">${animation.scale || 100}%</div>
                                </div>
                                <div>
                                    <div style="color: #999; margin-bottom: 4px;">Speed:</div>
                                    <div style="background: #3c3c3c; padding: 6px; border: 1px solid #555; border-radius: 2px;">${animation.speed || 100}%</div>
                                </div>
                            ` : ''}

                                </div>
                            </div>

                            <!-- Sound & Flash Timings -->
                            <div style="flex: 1; min-width: 250px; background: #2d2d30; border: 1px solid #3e3e42; border-radius: 3px; padding: 16px; display: flex; flex-direction: column;">
                                <div style="font-size: 12px; font-weight: 600; margin-bottom: 12px; color: #ccc;">Sound & Flash Timings</div>

                                <!-- Sound Timings -->
                                <div style="margin-bottom: 16px;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                        <div style="font-size: 11px; color: #999;">Sounds</div>
                                        <button id="add-sound-btn" style="padding: 4px 8px; background: #0e639c; border: 1px solid #1177bb; color: #fff; border-radius: 2px; cursor: pointer; font-size: 10px;">+ Add</button>
                                    </div>
                                    <div id="sound-timings-list" style="max-height: 150px; overflow-y: auto; background: #3c3c3c; border: 1px solid #555; border-radius: 2px; padding: 8px;">
                                        ${animation.soundTimings && animation.soundTimings.length > 0 ?
                                            animation.soundTimings.map((timing, idx) => `
                                                <div style="font-size: 10px; padding: 4px; background: #2d2d30; border: 1px solid #555; border-radius: 2px; margin-bottom: 4px;">
                                                    <div style="color: #4fc3f7;">Frame ${timing.frame}: ${timing.se ? timing.se.name : 'Unknown'}</div>
                                                    <div style="color: #888;">Vol: ${timing.se ? timing.se.volume : 90} | Pitch: ${timing.se ? timing.se.pitch : 100} | Pan: ${timing.se ? timing.se.pan : 0}</div>
                                                </div>
                                            `).join('')
                                            : '<div style="font-size: 10px; color: #888; padding: 8px;">No sound timings</div>'
                                        }
                                    </div>
                                </div>

                                <!-- Flash Timings -->
                                <div>
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                        <div style="font-size: 11px; color: #999;">Flashes</div>
                                        <button id="add-flash-btn" style="padding: 4px 8px; background: #0e639c; border: 1px solid #1177bb; color: #fff; border-radius: 2px; cursor: pointer; font-size: 10px;">+ Add</button>
                                    </div>
                                    <div id="flash-timings-list" style="max-height: 150px; overflow-y: auto; background: #3c3c3c; border: 1px solid #555; border-radius: 2px; padding: 8px;">
                                        ${animation.flashTimings && animation.flashTimings.length > 0 ?
                                            animation.flashTimings.map((timing, idx) => `
                                                <div style="font-size: 10px; padding: 4px; background: #2d2d30; border: 1px solid #555; border-radius: 2px; margin-bottom: 4px;">
                                                    <div style="color: #ffa726;">Frame ${timing.frame}: Duration ${timing.duration}</div>
                                                    <div style="color: #888;">Color: rgba(${timing.color ? timing.color.join(', ') : '255,255,255,255'})</div>
                                                </div>
                                            `).join('')
                                            : '<div style="font-size: 10px; color: #888; padding: 8px;">No flash timings</div>'
                                        }
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;

        // Set up animation playback for sprite-based animations
        if (isSpriteAnimation && animation.frames && animation.frames.length > 0) {
            this.setupSpriteAnimationPlayback(animation);
        }
    }

    setupSpriteAnimationPlayback(animation) {
        const canvas = document.getElementById('animation-preview-canvas');
        const playBtn = document.getElementById('animation-play-btn');
        const stopBtn = document.getElementById('animation-stop-btn');
        const frameCounter = document.getElementById('animation-frame-counter');
        const frameList = document.getElementById('animation-frame-list');

        const currentProject = this.projectManager.getCurrentProject();
        if (!canvas || !playBtn || !stopBtn || !frameList || !currentProject) return;

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        let animationInterval = null;
        let currentFrame = 0;
        let spriteSheet1 = null;
        let spriteSheet2 = null;
        let isDragging = false;
        let draggedCellIndex = -1;
        let dragStartX = 0;
        let dragStartY = 0;
        let dragOffsetX = 0;
        let dragOffsetY = 0;

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
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (frameIndex >= animation.frames.length) return;

            const frameData = animation.frames[frameIndex];
            if (!frameData || frameData.length === 0) return;

            // Center point of canvas
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;

            // Each cell is [pattern, x, y, scale, rotation, mirror, opacity, blendMode]
            frameData.forEach(cell => {
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

                // Draw the sprite
                ctx.drawImage(
                    sheet,
                    srcX, srcY, cellSize, cellSize,
                    -cellSize / 2, -cellSize / 2, cellSize, cellSize
                );

                ctx.restore();
            });

            frameCounter.textContent = `Frame: ${frameIndex + 1} / ${animation.frames.length}`;
        };

        // Play animation
        const play = () => {
            if (animationInterval) return; // Already playing

            currentFrame = 0;
            animationInterval = setInterval(() => {
                renderFrame(currentFrame);
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
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            frameCounter.textContent = `Frame: 0 / ${animation.frames.length}`;

            playBtn.disabled = false;
            playBtn.style.opacity = '1';
            stopBtn.disabled = true;
            stopBtn.style.opacity = '0.5';
        };

        // Canvas dragging for sprite positioning
        canvas.addEventListener('mousedown', (e) => {
            if (animationInterval) return; // Don't allow dragging during playback

            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const frameData = animation.frames[currentFrame];
            if (!frameData) return;

            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const cellSize = 192;

            // Check if clicking on any sprite cell
            for (let i = frameData.length - 1; i >= 0; i--) {
                const [pattern, x, y, scale, rotation, mirror, opacity, blendMode] = frameData[i];

                const spriteX = centerX + x;
                const spriteY = centerY + y;
                const scaledSize = (cellSize * scale) / 100;

                // Simple bounding box check
                if (mouseX >= spriteX - scaledSize / 2 && mouseX <= spriteX + scaledSize / 2 &&
                    mouseY >= spriteY - scaledSize / 2 && mouseY <= spriteY + scaledSize / 2) {
                    isDragging = true;
                    draggedCellIndex = i;
                    dragStartX = mouseX;
                    dragStartY = mouseY;
                    dragOffsetX = x;
                    dragOffsetY = y;
                    canvas.style.cursor = 'move';
                    break;
                }
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
            animation.frames[currentFrame][draggedCellIndex][1] = dragOffsetX + deltaX;
            animation.frames[currentFrame][draggedCellIndex][2] = dragOffsetY + deltaY;

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
                populateFrameList();
                currentFrame = animation.frames.length - 1;
                renderFrame(currentFrame);

                // Update frame counter
                frameCounter.textContent = `Frame: ${currentFrame + 1} / ${animation.frames.length}`;

                console.log('Added frame', currentFrame + 1);
            });
        }

        if (removeFrameBtn) {
            removeFrameBtn.addEventListener('click', () => {
                if (animation.frames.length <= 1) {
                    alert('Cannot remove the last frame');
                    return;
                }

                const confirmDelete = confirm(`Remove frame ${currentFrame + 1}?`);
                if (!confirmDelete) return;

                animation.frames.splice(currentFrame, 1);

                // Adjust current frame if needed
                if (currentFrame >= animation.frames.length) {
                    currentFrame = animation.frames.length - 1;
                }

                populateFrameList();
                renderFrame(currentFrame);

                // Update frame counter
                frameCounter.textContent = `Frame: ${currentFrame + 1} / ${animation.frames.length}`;

                console.log('Removed frame, now at', currentFrame + 1);
            });
        }

        // Event listeners
        playBtn.addEventListener('click', play);
        stopBtn.addEventListener('click', stop);

        // Populate frame list
        const populateFrameList = () => {
            frameList.innerHTML = '';
            animation.frames.forEach((frame, index) => {
                const frameItem = document.createElement('div');
                frameItem.className = 'animation-frame-item';
                frameItem.dataset.frameIndex = index;
                frameItem.style.cssText = 'padding: 8px; background: #3c3c3c; border: 1px solid #555; border-radius: 2px; cursor: pointer; font-size: 11px; transition: all 0.15s;';
                frameItem.textContent = `Frame ${index + 1}`;

                // Click to jump to frame
                frameItem.addEventListener('click', () => {
                    if (animationInterval) {
                        // If playing, stop first
                        clearInterval(animationInterval);
                        animationInterval = null;
                        playBtn.disabled = false;
                        playBtn.style.opacity = '1';
                        stopBtn.disabled = true;
                        stopBtn.style.opacity = '0.5';
                    }

                    currentFrame = index;
                    renderFrame(index);

                    // Highlight selected frame
                    document.querySelectorAll('.animation-frame-item').forEach(item => {
                        if (parseInt(item.dataset.frameIndex) === index) {
                            item.style.background = '#4fc3f7';
                            item.style.color = '#000';
                            item.style.fontWeight = '600';
                        } else {
                            item.style.background = '#3c3c3c';
                            item.style.color = '#ccc';
                            item.style.fontWeight = 'normal';
                        }
                    });
                });

                // Hover effect
                frameItem.addEventListener('mouseenter', () => {
                    if (parseInt(frameItem.dataset.frameIndex) !== currentFrame) {
                        frameItem.style.background = '#4a4a4a';
                    }
                });
                frameItem.addEventListener('mouseleave', () => {
                    if (parseInt(frameItem.dataset.frameIndex) !== currentFrame) {
                        frameItem.style.background = '#3c3c3c';
                    }
                });

                frameList.appendChild(frameItem);
            });

            // Highlight first frame
            if (frameList.children.length > 0) {
                frameList.children[0].style.background = '#4fc3f7';
                frameList.children[0].style.color = '#000';
                frameList.children[0].style.fontWeight = '600';
            }
        };

        // Load sprite sheets and render first frame
        loadSpriteSheets().then(() => {
            if (spriteSheet1 || spriteSheet2) {
                populateFrameList();
                renderFrame(0);
            } else {
                ctx.fillStyle = '#888';
                ctx.font = '14px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Failed to load animation sprites', canvas.width / 2, canvas.height / 2);
            }
        });

        // Initial state
        stopBtn.disabled = true;
        stopBtn.style.opacity = '0.5';
    }
}
