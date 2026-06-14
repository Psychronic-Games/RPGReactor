//=============================================================================
// reactor_windows.js
// RPG Reactor Game Engine - Windows/UI Module
// Based on RMMZ but adapted for PIXI 8
//=============================================================================

//-----------------------------------------------------------------------------
// Window_Base
// The superclass of all windows - using RMMZ approach with PIXI 8

class Window_Base extends PIXI.Container {
    constructor(rect) {
        super();
        this._width = rect.width;
        this._height = rect.height;
        this._x = rect.x;
        this._y = rect.y;

        this._windowskin = null;
        this._padding = 12;
        this._margin = 4;
        this._cursorRect = { x: 0, y: 0, width: 0, height: 0 };
        this._openness = 255;
        this._opening = false;
        this._closing = false;
        this._windowskinLoaded = false;
        this._needsRefreshAfterLoad = false;

        this._createAllParts();
        this.loadWindowskin();
    }

    _createAllParts() {
        this._createContainer();
        this._createBackSprite();
        this._createFrameSprite();
        this._createClientArea();
        this._createCursorSprite();
        this._createContentsSprite();

        // Text rendering properties
        this._textColor = 0xffffff; // White
        this._paintOpacity = 1.0;
    }

    _createContainer() {
        this._windowContainer = new PIXI.Container();
        this._windowContainer.x = this._x;
        this._windowContainer.y = this._y;
        this.addChild(this._windowContainer);
    }

    get x() {
        return this._x;
    }

    set x(value) {
        this._x = value;
        if (this._windowContainer) {
            this._windowContainer.x = value;
        }
    }

    get y() {
        return this._y;
    }

    set y(value) {
        this._y = value;
        if (this._windowContainer) {
            this._windowContainer.y = value;
        }
    }

    get width() {
        return this._width;
    }

    set width(value) {
        this._width = value;
        this._refreshAllParts();
    }

    get height() {
        return this._height;
    }

    set height(value) {
        this._height = value;
        this._refreshAllParts();
    }

    _createBackSprite() {
        // Background uses 3 layers: base + tiling pattern + tone overlay
        this._backSprite = new PIXI.Container();
        this._backBaseSprite = new PIXI.Sprite();
        this._backTilingSprite = new PIXI.TilingSprite({
            texture: PIXI.Texture.EMPTY,
            width: 1,
            height: 1
        });
        // Add a dark semi-transparent overlay for tone/shading
        this._backToneSprite = new PIXI.Graphics();

        this._backSprite.addChild(this._backBaseSprite);
        this._backSprite.addChild(this._backTilingSprite);
        this._backSprite.addChild(this._backToneSprite);
        this._windowContainer.addChild(this._backSprite);
    }

    _createFrameSprite() {
        // Frame uses 8 sprites for 9-slice (4 corners + 4 edges)
        this._frameSprite = new PIXI.Container();
        for (let i = 0; i < 8; i++) {
            this._frameSprite.addChild(new PIXI.Sprite());
        }
        this._windowContainer.addChild(this._frameSprite);
    }

    _createClientArea() {
        this._clientArea = new PIXI.Container();
        this._clientArea.x = this._padding;
        this._clientArea.y = this._padding;
        this._windowContainer.addChild(this._clientArea);
    }

    _createCursorSprite() {
        // Cursor uses 9 sprites for 9-slice (4 corners + 4 edges + 1 center)
        this._cursorSprite = new PIXI.Container();
        for (let i = 0; i < 9; i++) {
            this._cursorSprite.addChild(new PIXI.Sprite());
        }
        this._clientArea.addChild(this._cursorSprite);
    }

    _createContentsSprite() {
        this._contentsContainer = new PIXI.Container();
        this._contentsContainer.x = 0;
        this._contentsContainer.y = 0;
        this._clientArea.addChild(this._contentsContainer);
    }

    get contents() {
        // Provide a compatibility layer for RMMZ-style code
        return {
            clear: () => this.clearContents(),
            width: this.innerWidth,
            height: this.innerHeight
        };
    }

    async loadWindowskin() {
        try {
            const windowskin = await ImageManager.loadSystem("Window");
            this._windowskin = windowskin.texture;
            this._windowskinLoaded = true;
            this._refreshAllParts();

            // If refresh was attempted before windowskin loaded, do it again now
            if (this._needsRefreshAfterLoad) {
                this._needsRefreshAfterLoad = false;
                if (this.refresh) {
                    this.refresh();
                }
            }

            // Refresh cursor if it was already set
            if (this._cursorRect && (this._cursorRect.width > 0 || this._cursorRect.height > 0)) {
                this._refreshCursor();
            }
        } catch (error) {
            console.error("Failed to load windowskin:", error);
        }
    }

    _refreshAllParts() {
        if (!this._windowskin) {
            console.warn('Window: Cannot refresh parts, windowskin not loaded yet');
            return;
        }
        this._refreshBack();
        this._refreshFrame();
        this._refreshCursor();
    }

    _refreshBack() {
        if (!this._windowskin) return;

        const m = this._margin;
        const w = Math.max(0, this._width - m * 2);
        const h = Math.max(0, this._height - m * 2);

        // Position the back container
        this._backSprite.x = m;
        this._backSprite.y = m;

        // Background base sprite - uses frame 0,0,95,95 from windowskin
        // Note: We use 95 instead of 96 to avoid blurring edges (as per RMMZ)
        this._backBaseSprite.texture = new PIXI.Texture({
            source: this._windowskin.source,
            frame: new PIXI.Rectangle(0, 0, 95, 95)
        });
        this._backBaseSprite.x = 0;
        this._backBaseSprite.y = 0;
        // Scale the background to fit the window area
        this._backBaseSprite.scale.x = w / 95;
        this._backBaseSprite.scale.y = h / 95;

        // Tiling pattern - uses frame 0,96,96,96 from windowskin
        // Since parent is a Container (no scale), tiling sprite uses actual dimensions
        this._backTilingSprite.texture = new PIXI.Texture({
            source: this._windowskin.source,
            frame: new PIXI.Rectangle(0, 96, 96, 96)
        });
        this._backTilingSprite.x = 0;
        this._backTilingSprite.y = 0;
        this._backTilingSprite.width = w;
        this._backTilingSprite.height = h;
        this._backTilingSprite.tileScale.x = 1;
        this._backTilingSprite.tileScale.y = 1;

        // Draw dark overlay for tone/shading (semi-transparent black)
        this._backToneSprite.clear();
        this._backToneSprite.rect(0, 0, w, h);
        this._backToneSprite.fill({ color: 0x000000, alpha: 0.6 });

        // Set back opacity from system settings (default 192/255)
        const opacity = $dataSystem && $dataSystem.advanced && $dataSystem.advanced.windowOpacity
            ? $dataSystem.advanced.windowOpacity / 255
            : 192 / 255;
        this._backSprite.alpha = opacity;
    }

    _refreshFrame() {
        if (!this._windowskin) return;

        const drect = { x: 0, y: 0, width: this._width, height: this._height };
        const srect = { x: 96, y: 0, width: 96, height: 96 };
        const m = 24; // margin for 9-slice

        this._setRectPartsGeometry(this._frameSprite, srect, drect, m, false);
    }

    _refreshCursor() {
        if (!this._windowskin) return;

        const drect = this._cursorRect;
        const srect = { x: 96, y: 96, width: 48, height: 48 };
        const m = 4; // margin for 9-slice

        this._setRectPartsGeometry(this._cursorSprite, srect, drect, m, true);
    }

    _setRectPartsGeometry(sprite, srect, drect, m, hasCenter) {
        const sx = srect.x;
        const sy = srect.y;
        const sw = srect.width;
        const sh = srect.height;
        const dx = drect.x;
        const dy = drect.y;
        const dw = drect.width;
        const dh = drect.height;
        const smw = sw - m * 2;
        const smh = sh - m * 2;
        const dmw = dw - m * 2;
        const dmh = dh - m * 2;
        const children = sprite.children;

        sprite.x = dx;
        sprite.y = dy;

        // Corners (don't scale)
        this._setChildFrame(children[0], sx, sy, m, m);
        this._setChildFrame(children[1], sx + sw - m, sy, m, m);
        this._setChildFrame(children[2], sx, sy + sh - m, m, m);
        this._setChildFrame(children[3], sx + sw - m, sy + sh - m, m, m);

        children[0].x = 0; children[0].y = 0;
        children[1].x = dw - m; children[1].y = 0;
        children[2].x = 0; children[2].y = dh - m;
        children[3].x = dw - m; children[3].y = dh - m;

        // Edges (scale in one direction)
        children[4].x = m; children[4].y = 0;
        children[5].x = m; children[5].y = dh - m;
        children[6].x = 0; children[6].y = m;
        children[7].x = dw - m; children[7].y = m;

        this._setChildFrame(children[4], sx + m, sy, smw, m);
        this._setChildFrame(children[5], sx + m, sy + sh - m, smw, m);
        this._setChildFrame(children[6], sx, sy + m, m, smh);
        this._setChildFrame(children[7], sx + sw - m, sy + m, m, smh);

        children[4].scale.x = dmw / smw;
        children[5].scale.x = dmw / smw;
        children[6].scale.y = dmh / smh;
        children[7].scale.y = dmh / smh;

        // Center (scales in both directions, only for cursor)
        if (hasCenter && children[8]) {
            this._setChildFrame(children[8], sx + m, sy + m, smw, smh);
            children[8].x = m;
            children[8].y = m;
            children[8].scale.x = dmw / smw;
            children[8].scale.y = dmh / smh;
        }

        // Hide if zero size
        for (const child of children) {
            child.visible = dw > 0 && dh > 0;
        }
    }

    _setChildFrame(sprite, x, y, width, height) {
        if (!this._windowskin) return;
        sprite.texture = new PIXI.Texture({
            source: this._windowskin.source,
            frame: new PIXI.Rectangle(x, y, width, height)
        });
    }

    resetTextColor() {
        this._textColor = 0xffffff; // White (normal color)
    }

    changeTextColor(color) {
        this._textColor = color;
    }

    changePaintOpacity(enabled) {
        this._paintOpacity = enabled ? 1.0 : 0.5;
    }

    drawText(text, x, y, maxWidth, align = "left") {
        // Get font settings from system data
        const fontSize = $dataSystem ? $dataSystem.advanced.fontSize : 26;
        const fontFamily = "GameFont, " + ($dataSystem ? $dataSystem.advanced.fallbackFonts : "Arial, sans-serif");

        // Use canvas-based rendering like RMMZ to avoid PIXI v8 text stroke bugs
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        // Set up font
        context.font = `${fontSize}px ${fontFamily}`;

        // Measure text to determine canvas size
        const metrics = context.measureText(text);
        const textWidth = maxWidth ? Math.min(metrics.width, maxWidth) : metrics.width;
        // Add extra space for outline (3px on each side = 6px total)
        const outlineWidth = 3;
        canvas.width = textWidth + (outlineWidth * 2);
        canvas.height = fontSize + (outlineWidth * 2);

        // Need to reset font after canvas resize
        context.font = `${fontSize}px ${fontFamily}`;
        context.textBaseline = 'top';
        context.textAlign = align;

        // Calculate text position based on alignment
        let tx = outlineWidth;
        if (align === 'center') {
            tx = canvas.width / 2;
        } else if (align === 'right') {
            tx = canvas.width - outlineWidth;
        }

        // Draw outline (RMMZ defaults: width=3, color=rgba(0,0,0,0.5))
        context.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        context.lineWidth = outlineWidth;
        context.lineJoin = 'round';
        context.strokeText(text, tx, outlineWidth, maxWidth);

        // Draw text fill (convert hex color to CSS string)
        const textColor = typeof this._textColor === 'number'
            ? '#' + this._textColor.toString(16).padStart(6, '0')
            : this._textColor;
        context.fillStyle = textColor;
        context.fillText(text, tx, outlineWidth, maxWidth);

        // Convert canvas to PIXI texture and create sprite
        const texture = PIXI.Texture.from(canvas);
        const sprite = new PIXI.Sprite(texture);
        sprite.x = x;
        sprite.y = y;
        sprite.alpha = this._paintOpacity;

        this._contentsContainer.addChild(sprite);
        return sprite;
    }

    clearContents() {
        if (this._contentsContainer) {
            this._contentsContainer.removeChildren();
        }
    }

    update() {
        // Update openness animation
        if (this._opening) {
            this._openness += 32;
            if (this._openness >= 255) {
                this._openness = 255;
                this._opening = false;
            }
        }
        if (this._closing) {
            this._openness -= 32;
            if (this._openness <= 0) {
                this._openness = 0;
                this._closing = false;
            }
        }
        // Update window visibility based on openness
        if (this._windowContainer) {
            this._windowContainer.alpha = this._openness / 255;
            this._windowContainer.visible = this._openness > 0;
        }
        // Update background dimmer
        this.updateBackgroundDimmer();
    }

    open() {
        if (!this.isOpen()) {
            this._opening = true;
        }
        this._closing = false;
    }

    close() {
        if (!this.isClosed()) {
            this._closing = true;
        }
        this._opening = false;
    }

    isOpen() {
        return this._openness >= 255;
    }

    isClosed() {
        return this._openness <= 0;
    }

    isOpening() {
        return this._opening;
    }

    isClosing() {
        return this._closing;
    }

    show() {
        this.visible = true;
    }

    hide() {
        this.visible = false;
    }

    get innerWidth() {
        return Math.max(0, this._width - this._padding * 2);
    }

    get innerHeight() {
        return Math.max(0, this._height - this._padding * 2);
    }

    // Text rendering methods
    createTextState(text, x, y, width) {
        const textState = {};
        textState.text = this.convertEscapeCharacters(text);
        textState.index = 0;
        textState.x = x;
        textState.y = y;
        textState.width = width;
        textState.height = this.calcTextHeight(textState);
        textState.startX = textState.x;
        textState.startY = textState.y;
        textState.rtl = false;
        textState.buffer = "";
        textState.drawing = true;
        textState.outputWidth = 0;
        textState.outputHeight = 0;
        return textState;
    }

    convertEscapeCharacters(text) {
        // Convert backslash to escape character
        text = text.replace(/\\/g, "\x1b");
        text = text.replace(/\x1b\x1b/g, "\\");
        // Convert variables \V[n]
        while (text.match(/\x1bV\[(\d+)\]/gi)) {
            text = text.replace(/\x1bV\[(\d+)\]/gi, (_, p1) =>
                $gameVariables.value(parseInt(p1))
            );
        }
        return text;
    }

    processCharacter(textState) {
        const c = textState.text[textState.index++];
        if (c.charCodeAt(0) < 0x20) {
            this.flushTextState(textState);
            this.processControlCharacter(textState, c);
        } else {
            textState.buffer += c;
        }
    }

    processControlCharacter(textState, c) {
        if (c === "\n") {
            this.processNewLine(textState);
        }
        if (c === "\x1b") {
            const code = this.obtainEscapeCode(textState);
            this.processEscapeCharacter(code, textState);
        }
    }

    processNewLine(textState) {
        textState.x = textState.startX;
        textState.y += textState.height;
        textState.height = this.calcTextHeight(textState);
    }

    obtainEscapeCode(textState) {
        const regExp = /^[$.|^!><{}\\]|^[A-Z]+/i;
        const arr = regExp.exec(textState.text.slice(textState.index));
        if (arr) {
            textState.index += arr[0].length;
            return arr[0].toUpperCase();
        } else {
            return "";
        }
    }

    obtainEscapeParam(textState) {
        const regExp = /^\[(\d+)\]/;
        const arr = regExp.exec(textState.text.slice(textState.index));
        if (arr) {
            textState.index += arr[0].length;
            return parseInt(arr[1]);
        } else {
            return "";
        }
    }

    processEscapeCharacter(code, textState) {
        // Override in subclasses for specific escape codes
        switch (code) {
            case "C":
                // Color change - not implemented yet
                this.obtainEscapeParam(textState);
                break;
        }
    }

    flushTextState(textState) {
        const text = textState.buffer;
        const width = this.textWidth(text);
        const height = textState.height;
        const x = textState.x;
        const y = textState.y;
        if (textState.drawing && text) {
            this.drawText(text, x, y, width, "left");
        }
        textState.x += width;
        textState.buffer = "";
        const outputWidth = textState.x - textState.startX;
        if (textState.outputWidth < outputWidth) {
            textState.outputWidth = outputWidth;
        }
        textState.outputHeight = y - textState.startY + height;
    }

    textWidth(text) {
        // Estimate text width (simplified)
        return text.length * 14; // Rough estimate based on font size
    }

    calcTextHeight(textState) {
        return 36; // Default line height
    }

    resetFontSettings() {
        this.resetTextColor();
    }

    setBackgroundType(type) {
        // type: 0 = normal window, 1 = dim background, 2 = transparent
        if (type === 0) {
            this.opacity = 1.0;
            this.hideBackgroundDimmer();
        } else if (type === 1) {
            this.opacity = 0;
            this.showBackgroundDimmer();
        } else {
            this.opacity = 0;
            this.hideBackgroundDimmer();
        }
    }

    showBackgroundDimmer() {
        if (!this._dimmerSprite) {
            this.createDimmerSprite();
        }
        this._dimmerSprite.visible = true;
    }

    createDimmerSprite() {
        // Create a semi-transparent black background
        this._dimmerSprite = new PIXI.Graphics();
        this._dimmerSprite.rect(0, 0, this._width, this._height);
        this._dimmerSprite.fill({ color: 0x000000, alpha: 0.6 });
        // Add to back of window container
        if (this._windowContainer) {
            this._windowContainer.addChildAt(this._dimmerSprite, 0);
        }
    }

    hideBackgroundDimmer() {
        if (this._dimmerSprite) {
            this._dimmerSprite.visible = false;
        }
    }

    updateBackgroundDimmer() {
        if (this._dimmerSprite) {
            this._dimmerSprite.alpha = this._openness / 255;
        }
    }

    get opacity() {
        return this._windowContainer ? this._windowContainer.alpha : 1.0;
    }

    set opacity(value) {
        if (this._windowContainer) {
            this._windowContainer.alpha = value;
        }
    }

    lineHeight() {
        return 36;
    }

    itemPadding() {
        return 8;
    }

    async drawFace(faceName, faceIndex, x, y, width, height) {
        if (!faceName) return;

        width = width || ImageManager.faceWidth;
        height = height || ImageManager.faceHeight;

        const bitmap = await ImageManager.loadFace(faceName);
        const pw = ImageManager.faceWidth;
        const ph = ImageManager.faceHeight;
        const sw = Math.min(width, pw);
        const sh = Math.min(height, ph);
        const sx = (faceIndex % 4) * pw;
        const sy = Math.floor(faceIndex / 4) * ph;

        // Get the texture source from the loaded bitmap (sprite)
        if (bitmap && bitmap.texture && bitmap.texture.source) {
            const faceTexture = new PIXI.Texture({
                source: bitmap.texture.source,
                frame: new PIXI.Rectangle(sx, sy, sw, sh)
            });

            const faceSprite = new PIXI.Sprite(faceTexture);
            faceSprite.x = x;
            faceSprite.y = y;

            // Scale if needed
            if (width !== sw || height !== sh) {
                faceSprite.width = width;
                faceSprite.height = height;
            }

            this._contentsContainer.addChild(faceSprite);
        }
    }
}

//-----------------------------------------------------------------------------
// Window_Selectable
// The window class with cursor movement functions

class Window_Selectable extends Window_Base {
    constructor(rect) {
        super(rect);
        this._index = 0;
        this._handlers = {};
        this._animationCount = 0;
        this.active = true;
        this.select(0);
    }

    index() {
        return this._index;
    }

    maxItems() {
        return 0;
    }

    select(index) {
        this._index = index;
        this._updateCursor();
        this.callUpdateHelp();
    }

    activate() {
        this.active = true;
    }

    deactivate() {
        this.active = false;
    }

    _updateCursor() {
        if (this._index >= 0) {
            const rect = this.itemRect(this._index);
            this._cursorRect.x = rect.x;
            this._cursorRect.y = rect.y;
            this._cursorRect.width = rect.width;
            this._cursorRect.height = rect.height;
            this._refreshCursor();
            this._cursorSprite.visible = true;
        } else {
            this._cursorSprite.visible = false;
        }
    }

    itemRect(index) {
        return {
            x: 0,
            y: index * 48 + 8,
            width: this.innerWidth,
            height: 48
        };
    }

    itemLineRect(index) {
        const rect = this.itemRect(index);
        const padding = (rect.height - 36) / 2; // 36 is line height
        return {
            x: rect.x,
            y: rect.y + padding,
            width: rect.width,
            height: rect.height - padding * 2
        };
    }

    redrawItem(index) {
        // Just refresh the whole window - simpler and more reliable
        if (index >= 0) {
            this.refresh();
        }
    }

    isCurrentItemEnabled() {
        return this.isEnabled(this._index);
    }

    isEnabled(index) {
        return true;
    }

    callUpdateHelp() {
        if (this._helpWindow) {
            this.updateHelp();
        }
    }

    updateHelp() {
        // Override in subclass
    }

    setHandler(symbol, method) {
        this._handlers[symbol] = method;
    }

    isHandled(symbol) {
        return !!this._handlers[symbol];
    }

    callHandler(symbol) {
        if (this.isHandled(symbol)) {
            this._handlers[symbol]();
        }
    }

    refresh() {
        if (!this._windowskinLoaded) {
            this._needsRefreshAfterLoad = true;
            return;
        }
        this.clearContents();
        this.drawAllItems();
    }

    drawAllItems() {
        // Override in subclass
    }

    update() {
        super.update();
        this._animationCount++;
        this._updateCursorAnimation();
        this.processHandling();
    }

    _updateCursorAnimation() {
        if (this._cursorSprite && this._cursorSprite.visible) {
            // Blinking effect based on RPG Maker MZ
            const blinkCount = this._animationCount % 40;
            if (this.active) {
                if (blinkCount < 20) {
                    this._cursorSprite.alpha = 1.0 - blinkCount / 32;
                } else {
                    this._cursorSprite.alpha = 1.0 - (40 - blinkCount) / 32;
                }
            } else {
                this._cursorSprite.alpha = 0.5;
            }
        }
    }

    processHandling() {
        if (this.isOpenAndActive()) {
            this.processCursorMove();
            this.processOk();
            this.processCancel();
            this.processTouch();
        }
    }

    isOpenAndActive() {
        return this.visible && this.active;
    }

    processCursorMove() {
        if (this.isCursorMovable()) {
            const lastIndex = this.index();
            if (Input.isRepeated("down")) {
                this.cursorDown();
            }
            if (Input.isRepeated("up")) {
                this.cursorUp();
            }
            if (Input.isRepeated("right")) {
                this.cursorRight();
            }
            if (Input.isRepeated("left")) {
                this.cursorLeft();
            }
            if (this.index() !== lastIndex) {
                this.playCursorSound();
            }
        }
    }

    isCursorMovable() {
        return this.active && this.maxItems() > 0;
    }

    cursorDown() {
        const index = this.index();
        const maxItems = this.maxItems();
        if (index < maxItems - 1) {
            this.select(index + 1);
        }
    }

    cursorUp() {
        const index = this.index();
        if (index > 0) {
            this.select(index - 1);
        }
    }

    cursorRight() {
        // Override in subclass for multi-column selection
    }

    cursorLeft() {
        // Override in subclass for multi-column selection
    }

    playCursorSound() {
        if ($dataSystem && $dataSystem.sounds && $dataSystem.sounds[0]) {
            AudioManager.playSe($dataSystem.sounds[0]);
        }
    }

    processOk() {
        // Override in subclass
    }

    processCancel() {
        // Override in subclass
    }

    processTouch() {
        // Touch/mouse handling implemented below
    }
}

//-----------------------------------------------------------------------------
// Window_Command
// The window for selecting a command

class Window_Command extends Window_Selectable {
    constructor(rect) {
        super(rect);
        this._list = [];
        this.makeCommandList();
        this.refresh();
        this.select(0);
    }

    maxItems() {
        return this._list.length;
    }

    makeCommandList() {
        // Override in subclass
    }

    addCommand(name, symbol, enabled = true, ext = null) {
        this._list.push({ name, symbol, enabled, ext });
    }

    commandName(index) {
        return this._list[index].name;
    }

    commandSymbol(index) {
        return this._list[index].symbol;
    }

    isCommandEnabled(index) {
        return this._list[index].enabled;
    }

    isEnabled(index) {
        return this._list[index] && this._list[index].enabled;
    }

    currentData() {
        return this._list[this.index()];
    }

    currentSymbol() {
        return this.currentData() ? this.currentData().symbol : null;
    }

    currentEnabled() {
        return this.currentData() ? this.currentData().enabled : false;
    }

    findSymbol(symbol) {
        return this._list.findIndex(item => item.symbol === symbol);
    }

    drawAllItems() {
        for (let i = 0; i < this.maxItems(); i++) {
            this.drawItem(i);
        }
    }

    drawItem(index) {
        const rect = this.itemRect(index);
        const name = this.commandName(index);
        const enabled = this.isCommandEnabled(index);

        // Scale padding with content
        const scale = this.getFontScale ? this.getFontScale() : 1.0;
        const padding = Math.floor(8 * scale);

        const text = this.drawText(name, rect.x + padding, rect.y + padding, rect.width, "left");
        if (!enabled) {
            text.alpha = 0.5;
        }
    }

    processOk() {
        if (this.isOpenAndActive() && Input.isTriggered("ok")) {
            if (this.isCurrentItemEnabled()) {
                this.playOkSound();
                this.callHandler(this.currentSymbol());
            } else {
                this.playBuzzerSound();
            }
        }
    }

    processCancel() {
        if (this.isOpenAndActive() && Input.isTriggered("escape")) {
            if (this.isHandled("cancel")) {
                this.playCancelSound();
                this.callHandler("cancel");
            }
        }
    }

    playOkSound() {
        if ($dataSystem && $dataSystem.sounds && $dataSystem.sounds[1]) {
            AudioManager.playSe($dataSystem.sounds[1]);
        }
    }

    playCancelSound() {
        if ($dataSystem && $dataSystem.sounds && $dataSystem.sounds[2]) {
            AudioManager.playSe($dataSystem.sounds[2]);
        }
    }

    playBuzzerSound() {
        if ($dataSystem && $dataSystem.sounds && $dataSystem.sounds[3]) {
            AudioManager.playSe($dataSystem.sounds[3]);
        }
    }

    setupMouseEvents() {
        this.eventMode = 'static';
        this.on('pointerdown', (event) => {
            const localPos = event.global;
            const bounds = this.getBounds();
            const relativeY = localPos.y - bounds.y - this._padding;

            // Calculate with scaling
            const scale = this.getContentScale();
            const baseHeight = 48;
            const basePadding = 8;
            const index = Math.floor((relativeY - basePadding * scale) / (baseHeight * scale));

            if (index >= 0 && index < this.maxItems()) {
                this.select(index);
                this.processOk();
            }
        });

        this.on('pointermove', (event) => {
            const localPos = event.global;
            const bounds = this.getBounds();
            const relativeY = localPos.y - bounds.y - this._padding;

            // Calculate with scaling
            const scale = this.getContentScale();
            const baseHeight = 48;
            const basePadding = 8;
            const index = Math.floor((relativeY - basePadding * scale) / (baseHeight * scale));

            if (index >= 0 && index < this.maxItems() && index !== this._index) {
                this.select(index);
            }
        });
    }
}

//-----------------------------------------------------------------------------
// Window_TitleCommand
// The window for selecting commands on the title screen

class Window_TitleCommand extends Window_Command {
    constructor() {
        const rect = Window_TitleCommand.windowRect();
        super(rect);
        this.eventMode = 'static';
        this.setupMouseEvents();
    }

    static windowRect() {
        // Scale window based on screen resolution
        // Base resolution: 816x624, base window: 240x300
        const scaleX = Graphics.width / 816;
        const scaleY = Graphics.height / 624;
        const scale = Math.min(scaleX, scaleY);

        const width = Math.floor(240 * scale);
        const height = Math.floor(300 * scale);
        const x = (Graphics.width - width) / 2;
        const y = Graphics.height - height - Math.floor(96 * scale);
        return { x, y, width, height };
    }

    getContentScale() {
        const scaleX = Graphics.width / 816;
        const scaleY = Graphics.height / 624;
        return Math.min(scaleX, scaleY);
    }

    getFontScale() {
        return this.getContentScale();
    }

    updatePlacement() {
        // Update window position when screen resizes
        const rect = Window_TitleCommand.windowRect();
        this._x = rect.x;
        this._y = rect.y;
        this._windowContainer.x = rect.x;
        this._windowContainer.y = rect.y;
        this._width = rect.width;
        this._height = rect.height;

        this._refreshAllParts();
        this.refresh();

        // Force cursor to update with new scale
        if (this._index >= 0) {
            this._updateCursor();
        }
    }

    itemRect(index) {
        const scale = this.getContentScale();
        const baseHeight = 48;
        const basePadding = 8;
        return {
            x: 0,
            y: Math.floor(index * baseHeight * scale + basePadding * scale),
            width: this.innerWidth,
            height: Math.floor(baseHeight * scale)
        };
    }

    makeCommandList() {
        this.addCommand("New Game", "newGame");
        this.addCommand("Continue", "continue", this.isContinueEnabled());
        this.addCommand("Options", "options");
        this.addCommand("Shutdown", "shutdown");
    }

    isContinueEnabled() {
        // TODO: Check if save files exist
        return false;
    }
}

//-----------------------------------------------------------------------------
// Window_Options
//
// The window for changing various settings on the options screen.

class Window_Options extends Window_Command {
    constructor(rect) {
        super(rect);
        // Initialize cache after super() call
        this._itemTextCache = new Map();
    }

    makeCommandList() {
        this.addGeneralOptions();
        this.addVolumeOptions();
    }

    clearContents() {
        // When contents are cleared, also clear the text cache
        if (this._itemTextCache) {
            this._itemTextCache.clear();
        }
        super.clearContents();
    }

    addGeneralOptions() {
        this.addCommand($dataSystem.terms.messages.alwaysDash, "alwaysDash");
        this.addCommand($dataSystem.terms.messages.commandRemember, "commandRemember");
        this.addCommand($dataSystem.terms.messages.touchUI, "touchUI");
    }

    addVolumeOptions() {
        this.addCommand($dataSystem.terms.messages.bgmVolume, "bgmVolume");
        this.addCommand($dataSystem.terms.messages.bgsVolume, "bgsVolume");
        this.addCommand($dataSystem.terms.messages.meVolume, "meVolume");
        this.addCommand($dataSystem.terms.messages.seVolume, "seVolume");
    }

    drawItem(index) {
        const title = this.commandName(index);
        const status = this.statusText(index);
        const rect = this.itemLineRect(index);
        const statusWidth = this.statusWidth();
        const titleWidth = rect.width - statusWidth;
        this.resetTextColor();
        this.changePaintOpacity(this.isCommandEnabled(index));

        // Create and cache text objects
        const titleTextObj = this.drawText(title, rect.x, rect.y, titleWidth, "left");
        const statusTextObj = this.drawText(status, rect.x + titleWidth, rect.y, statusWidth, "right");

        // Store in cache for later updates
        this._itemTextCache.set(index, {
            titleText: titleTextObj,
            statusText: statusTextObj
        });
    }

    statusWidth() {
        return 120;
    }

    statusText(index) {
        const symbol = this.commandSymbol(index);
        const value = this.getConfigValue(symbol);
        if (this.isVolumeSymbol(symbol)) {
            return this.volumeStatusText(value);
        } else {
            return this.booleanStatusText(value);
        }
    }

    isVolumeSymbol(symbol) {
        return symbol.includes("Volume");
    }

    booleanStatusText(value) {
        return value ? "ON" : "OFF";
    }

    volumeStatusText(value) {
        return value + "%";
    }

    processOk() {
        // Don't process OK for options - left/right should be used to change values
        // OK key should do nothing in the options menu
        return;
    }

    cursorRight() {
        const index = this.index();
        const symbol = this.commandSymbol(index);
        if (this.isVolumeSymbol(symbol)) {
            this.changeVolume(symbol, true, false);
        } else {
            this.changeValue(symbol, true);
        }
    }

    cursorLeft() {
        const index = this.index();
        const symbol = this.commandSymbol(index);
        if (this.isVolumeSymbol(symbol)) {
            this.changeVolume(symbol, false, false);
        } else {
            this.changeValue(symbol, false);
        }
    }

    changeVolume(symbol, forward, wrap) {
        const lastValue = this.getConfigValue(symbol);
        const offset = this.volumeOffset();
        const value = lastValue + (forward ? offset : -offset);
        if (value > 100 && wrap) {
            this.changeValue(symbol, 0);
        } else {
            this.changeValue(symbol, value.clamp(0, 100));
        }
    }

    volumeOffset() {
        return 20;
    }

    changeValue(symbol, value) {
        const lastValue = this.getConfigValue(symbol);
        if (lastValue !== value) {
            this.setConfigValue(symbol, value);
            // Don't call refresh() here - it causes flickering
            // Instead, just update the display by redrawing this one item
            const index = this.findSymbol(symbol);
            if (index >= 0) {
                this.clearAndRedrawItem(index);
            }
            this.playCursorSound();
        }
    }

    clearAndRedrawItem(index) {
        // Use cached text objects for efficient updates
        const cached = this._itemTextCache.get(index);

        if (!cached) {
            // No cache yet, do a full redraw
            this.drawItem(index);
            return;
        }

        // Get new values
        const title = this.commandName(index);
        const status = this.statusText(index);

        // Update existing text objects directly
        if (cached.titleText && !cached.titleText.destroyed) {
            cached.titleText.text = title;
        }

        if (cached.statusText && !cached.statusText.destroyed) {
            cached.statusText.text = status;
        }
    }

    getConfigValue(symbol) {
        return ConfigManager[symbol];
    }

    setConfigValue(symbol, volume) {
        console.log(`Window_Options.setConfigValue: ${symbol} = ${volume}`);
        ConfigManager[symbol] = volume;
    }
}

//-----------------------------------------------------------------------------
// Window_Message
//
// The window for displaying text messages.

class Window_Message extends Window_Base {
    constructor(rect) {
        super(rect);
        this._openness = 0;
        this.initMembers();
    }

    initMembers() {
        this._background = 0;
        this._positionType = 2;
        this._waitCount = 0;
        this._textState = null;
        this._pauseSkip = false;
        this._showFast = false;
        this._lineShowFast = false;
        this.pause = false;
    }

    update() {
        this.checkToNotClose();
        super.update();

        // Only process messages if window is open or opening/closing
        if (this.isOpen() || this.isOpening() || this.isClosing()) {
            while (!this.isOpening() && !this.isClosing()) {
                if (this.updateWait()) {
                    return;
                } else if (this.updateInput()) {
                    return;
                } else if (this.updateMessage()) {
                    return;
                } else if (this.canStart()) {
                    this.startMessage();
                } else {
                    this.terminateMessage();
                    return;
                }
            }
        } else if (this.canStart()) {
            // Window is closed, but there's a message to show
            this.startMessage();
        }
    }

    checkToNotClose() {
        if (this.isOpen() && this.isClosing() && this.doesContinue()) {
            this.open();
        }
    }

    canStart() {
        return $gameMessage.hasText() && !$gameMessage.scrollMode();
    }

    startMessage() {
        const text = $gameMessage.allText();
        const textState = this.createTextState(text, 0, 0, 0);
        textState.x = this.newLineX(textState);
        textState.startX = textState.x;
        this._textState = textState;
        this.newPage(this._textState);
        this.updatePlacement();
        this.updateBackground();
        this.open();
    }

    newLineX(textState) {
        const faceExists = $gameMessage.faceName() !== "";
        const faceWidth = ImageManager.faceWidth;
        const spacing = 20;
        const margin = faceExists ? faceWidth + spacing : 4;
        return margin;
    }

    updatePlacement() {
        this._positionType = $gameMessage.positionType();
        this.y = (this._positionType * (Graphics.height - this.height)) / 2;
    }

    updateBackground() {
        this._background = $gameMessage.background();
        this.setBackgroundType(this._background);
    }

    terminateMessage() {
        this.close();
        $gameMessage.clear();
    }

    updateWait() {
        if (this._waitCount > 0) {
            this._waitCount--;
            return true;
        }
        return false;
    }

    updateInput() {
        if (this.pause) {
            if (this.isTriggered()) {
                Input.consumeInput();  // Consume input to prevent retriggering event
                this.pause = false;
                if (!this._textState) {
                    this.terminateMessage();
                }
            }
            return true;
        }
        return false;
    }

    updateMessage() {
        const textState = this._textState;
        if (textState) {
            while (!this.isEndOfText(textState)) {
                if (this.needsNewPage(textState)) {
                    this.newPage(textState);
                }
                this.updateShowFast();
                this.processCharacter(textState);
                if (this.shouldBreakHere(textState)) {
                    break;
                }
            }
            this.flushTextState(textState);
            if (this.isEndOfText(textState) && !this.isWaiting()) {
                this.onEndOfText();
            }
            return true;
        }
        return false;
    }

    shouldBreakHere(textState) {
        if (this.canBreakHere(textState)) {
            if (!this._showFast && !this._lineShowFast) {
                return true;
            }
            if (this.isWaiting()) {
                return true;
            }
        }
        return false;
    }

    canBreakHere(textState) {
        return !this.isEndOfText(textState);
    }

    onEndOfText() {
        if (!this.startInput()) {
            if (!this._pauseSkip) {
                this.startPause();
            } else {
                this.terminateMessage();
            }
        }
        this._textState = null;
    }

    startInput() {
        if ($gameMessage.isChoice()) {
            if (this._choiceListWindow) {
                this._choiceListWindow.start();
            }
            return true;
        }
        return false;
    }

    setChoiceListWindow(choiceListWindow) {
        this._choiceListWindow = choiceListWindow;
    }

    isTriggered() {
        return Input.isRepeated("ok") || Input.isRepeated("cancel");
    }

    doesContinue() {
        return $gameMessage.hasText() && !$gameMessage.scrollMode() && !this.areSettingsChanged();
    }

    areSettingsChanged() {
        return this._background !== $gameMessage.background() ||
               this._positionType !== $gameMessage.positionType();
    }

    updateShowFast() {
        if (this.isTriggered()) {
            this._showFast = true;
        }
    }

    newPage(textState) {
        this.contents.clear();
        this.resetFontSettings();
        this._showFast = false;
        this._lineShowFast = false;
        this._pauseSkip = false;
        this.loadMessageFace();
        textState.x = textState.startX;
        textState.y = 0;
        textState.height = this.calcTextHeight(textState);
    }

    async loadMessageFace() {
        const faceName = $gameMessage.faceName();
        if (faceName) {
            const faceIndex = $gameMessage.faceIndex();
            // Draw face at natural size (144x144), no stretching
            await this.drawFace(faceName, faceIndex, 0, 0, ImageManager.faceWidth, ImageManager.faceHeight);
        }
    }

    isEndOfText(textState) {
        return textState.index >= textState.text.length;
    }

    needsNewPage(textState) {
        return !this.isEndOfText(textState) &&
               textState.y + textState.height > this.contents.height;
    }

    processEscapeCharacter(code, textState) {
        switch (code) {
            case ".":
                this.startWait(15);
                break;
            case "|":
                this.startWait(60);
                break;
            case "!":
                this.startPause();
                break;
            case ">":
                this._lineShowFast = true;
                break;
            case "<":
                this._lineShowFast = false;
                break;
            case "^":
                this._pauseSkip = true;
                break;
            default:
                super.processEscapeCharacter(code, textState);
                break;
        }
    }

    startWait(count) {
        this._waitCount = count;
    }

    startPause() {
        this.startWait(10);
        this.pause = true;
    }

    isWaiting() {
        return this.pause || this._waitCount > 0;
    }
}

//-----------------------------------------------------------------------------
// Window_ChoiceList
//
// The window for selecting a choice for the event command [Show Choices].

class Window_ChoiceList extends Window_Command {
    constructor(rect) {
        super(rect);
        this._messageWindow = null;
        this._background = 0;
        this.openness = 0;
        this.deactivate();
    }

    setMessageWindow(messageWindow) {
        this._messageWindow = messageWindow;
    }

    start() {
        this.updatePlacement();
        this.updateBackground();
        this.refresh();
        this.selectDefault();
        this.open();
        this.activate();
    }

    selectDefault() {
        this.select($gameMessage.choiceDefaultType());
    }

    updatePlacement() {
        this.x = this.windowX();
        this.y = this.windowY();
        this.width = this.windowWidth();
        this.height = this.windowHeight();
    }

    updateBackground() {
        this._background = $gameMessage.choiceBackground();
        this.setBackgroundType(this._background);
    }

    windowX() {
        const positionType = $gameMessage.choicePositionType();
        if (positionType === 1) {
            return (Graphics.width - this.windowWidth()) / 2;
        } else if (positionType === 2) {
            return Graphics.width - this.windowWidth();
        } else {
            return 0;
        }
    }

    windowY() {
        const messageY = this._messageWindow ? this._messageWindow.y : 0;
        const messageHeight = this._messageWindow ? this._messageWindow.height : 0;
        if (messageY >= Graphics.height / 2) {
            return messageY - this.windowHeight();
        } else {
            return messageY + messageHeight;
        }
    }

    windowWidth() {
        const width = this.maxChoiceWidth() + this._padding * 2 + 24;
        return Math.min(width, Graphics.width);
    }

    windowHeight() {
        return this.fittingHeight(this.numVisibleRows());
    }

    numVisibleRows() {
        const choices = $gameMessage.choices();
        return Math.min(choices.length, this.maxLines());
    }

    maxLines() {
        return 8;
    }

    maxChoiceWidth() {
        let maxWidth = 96;
        const choices = $gameMessage.choices();
        for (const choice of choices) {
            // Simple text width estimation (will improve later with proper measurement)
            const textWidth = choice.length * 14; // Rough estimate
            if (maxWidth < textWidth) {
                maxWidth = textWidth;
            }
        }
        return maxWidth;
    }

    makeCommandList() {
        const choices = $gameMessage.choices();
        for (const choice of choices) {
            this.addCommand(choice, "choice");
        }
    }

    isCancelEnabled() {
        return $gameMessage.choiceCancelType() !== -1;
    }

    callOkHandler() {
        $gameMessage.onChoice(this.index());
        this._messageWindow.terminateMessage();
        this.close();
    }

    callCancelHandler() {
        $gameMessage.onChoice($gameMessage.choiceCancelType());
        this._messageWindow.terminateMessage();
        this.close();
    }
}

console.log('reactor_windows.js loaded');
