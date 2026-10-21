/**
 * CharacterGraphicPicker - the dialog that picks a character sheet and one frame of it.
 *
 * A file list on the left. On the right the sheet, drawn in its own arrangement (eight characters four across and
 * two down, or one for a "$" sheet; each character its frames across and the four directions down), every frame its
 * own click target. The line under the sheet names the frame under the pointer, or else the picked one. The caller
 * gets { characterName, characterIndex, pattern, direction }.
 *
 * Styles: the "Character sheet picker" block of css/styles.css (.rr-char-picker*).
 */
class CharacterGraphicPicker {
    constructor(projectController) {
        this.projectController = projectController;
        this.currentProject = projectController.getCurrentProject ? projectController.getCurrentProject() : projectController.currentProject;
        this.onSelect = null;
        // The zoom the user chose in this dialog. Empty: the sheet is fitted to the room it has.
        this.previewZoom = null;
    }

    /** The fixed zoom choices. 150% is there for sheets with small frames, which 200% would push out of the box. */
    static get ZOOM_STEPS() { return [0.25, 1 / 3, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8]; }
    /** Pixels between two characters of a sheet, of the line around each, and of the hairline between two frames. */
    static get CHARACTER_GAP() { return 6; }
    static get CHARACTER_BORDER() { return 1; }
    static get FRAME_GAP() { return 1; }

    /**
     * How a sheet is cut: `single` is a "$" sheet (one character), `frames` the walking frames per direction.
     * Sizes are in the picture's own pixels and may be fractions when the picture does not divide evenly.
     */
    static sheetLayout(width, height, single, frames = 3) {
        const count = Math.max(1, Math.floor(Number(frames) || 3));
        const charactersAcross = single ? 1 : 4, charactersDown = single ? 1 : 2;
        const columns = charactersAcross * count, rows = charactersDown * 4;
        return { width, height, single: !!single, frames: count, charactersAcross, charactersDown, columns, rows,
            frameWidth: width / columns, frameHeight: height / rows };
    }

    /** The frame at a column and row of the whole sheet: what a click on it picks, and where it is in the picture. */
    static frameAt(layout, column, row) {
        return {
            column, row,
            characterIndex: layout.single ? 0 : Math.floor(row / 4) * 4 + Math.floor(column / layout.frames),
            pattern: column % layout.frames,
            direction: (row % 4) * 2 + 2,
            x: column * layout.frameWidth,
            y: row * layout.frameHeight
        };
    }

    /** The column and row of a character's frame, or null when the sheet has no such frame. */
    static cellOf(layout, characterIndex, pattern, direction) {
        const index = Number(characterIndex) || 0, step = Number(pattern) || 0, facing = Number(direction) || 2;
        const characters = layout.charactersAcross * layout.charactersDown;
        if (index < 0 || index >= characters || step < 0 || step >= layout.frames || ![2, 4, 6, 8].includes(facing)) return null;
        return { column: (index % 4) * layout.frames + step, row: Math.floor(index / 4) * 4 + (facing / 2 - 1) };
    }

    /** The pixels the sheet takes beyond its frames: the gaps between characters, the line around each, the hairlines. */
    static sheetChrome(layout) {
        const gap = CharacterGraphicPicker.CHARACTER_GAP, line = CharacterGraphicPicker.CHARACTER_BORDER * 2, hair = CharacterGraphicPicker.FRAME_GAP;
        return { width: (layout.charactersAcross - 1) * gap + layout.charactersAcross * (line + (layout.frames - 1) * hair),
            height: (layout.charactersDown - 1) * gap + layout.charactersDown * (line + 3 * hair) };
    }

    /** What the sheet measures on screen at a zoom. A frame is a whole number of pixels, never wider than its share. */
    static displaySize(layout, zoom) {
        const chrome = CharacterGraphicPicker.sheetChrome(layout);
        const frameWidth = Math.max(1, Math.floor(layout.frameWidth * zoom + 1e-6));
        const frameHeight = Math.max(1, Math.floor(layout.frameHeight * zoom + 1e-6));
        return { frameWidth, frameHeight, width: frameWidth * layout.columns + chrome.width, height: frameHeight * layout.rows + chrome.height };
    }

    /**
     * The zoom a sheet is shown at until the user chooses one: the largest step at which the whole sheet fits the
     * room, both ways. A room too small for the smallest step gets the exact ratio, so the sheet still fits. A room
     * that has not been laid out yet (no size) gets 100%.
     */
    static fitZoom(room, layout, steps = CharacterGraphicPicker.ZOOM_STEPS) {
        const chrome = CharacterGraphicPicker.sheetChrome(layout);
        const width = (Number(room && room.width) || 0) - chrome.width, height = (Number(room && room.height) || 0) - chrome.height;
        if (!(width > 0) || !(height > 0) || !(layout.width > 0) || !(layout.height > 0)) return 1;
        const exact = Math.min(width / layout.width, height / layout.height);
        let best = 0;
        for (const step of steps) if (step <= exact + 1e-9 && step > best) best = step;
        return best || exact;
    }

    /** What the Zoom control offers: Fit first, then the fixed steps. */
    static zoomChoices(steps = CharacterGraphicPicker.ZOOM_STEPS) {
        return [{ value: 'fit', fit: true }].concat(steps.map(step => ({ value: String(step), zoom: step, label: Math.round(step * 100) + '%' })));
    }

    _t(text, params) {
        const translated = window.I18n ? window.I18n.tText(text) : text;
        if (!params) return translated;
        return translated.replace(/\{(\w+)\}/g, (token, key) => Object.hasOwn(params, key) ? String(params[key]) : token);
    }

    _element(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    /**
     * Show the character graphic picker
     */
    show(currentCharacterName, currentCharacterIndex, currentPattern, currentDirection, callback) {
        this.onSelect = callback;
        this._file = '';
        this._layout = null;
        this._frames = [];
        this._picked = null;
        this._pickedFrame = null;
        this._hoverFrame = null;
        this._zoom = null;
        // A run of clicks (a click, a double-click): whether it began in this dialog, and on which frame.
        this._runInside = false;
        this._pressFrame = null;
        // A key picked the frame last: the line under the sheet names it, whatever rests under the pointer.
        this._keysLead = false;

        const modal = this._element('div', 'rr-modal-overlay rr-char-picker-overlay');
        modal.id = 'character-picker-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'char-picker-title');

        const dialog = this._element('div', 'rr-modal rr-char-picker');
        dialog.tabIndex = -1;

        const header = this._element('div', 'rr-modal-header');
        const title = this._element('div', 'rr-modal-title', this._t('Select Character Graphic'));
        title.id = 'char-picker-title';
        const closeButton = this._element('button', 'rr-modal-close', '×');
        closeButton.type = 'button';
        closeButton.id = 'char-picker-close';
        closeButton.setAttribute('aria-label', this._t('Close'));
        header.append(title, closeButton);

        const body = this._element('div', 'rr-char-picker-body');
        const fileList = this._element('div', 'rr-char-picker-files');
        fileList.id = 'char-file-list';
        const previewArea = this._element('div', 'rr-char-picker-preview');
        previewArea.id = 'char-preview-area';

        // The preview: the file's name and kind with the zoom, the box the sheet sits in, the line that names a frame.
        const bar = this._element('div', 'rr-char-picker-bar');
        const name = this._element('div', 'rr-char-picker-name');
        name.setAttribute('data-rr-i18n-skip', '1');
        const kind = this._element('div', 'rr-char-picker-kind');
        kind.setAttribute('data-rr-i18n-skip', '1');
        const zoomGroup = this._element('div', 'rr-char-picker-zoom');
        const zoomControl = this._element('select', 'character-preview-zoom');
        zoomControl.setAttribute('aria-label', this._t('Zoom'));
        for (const choice of CharacterGraphicPicker.zoomChoices()) {
            const option = this._element('option', '', choice.fit ? this._t('Fit to view') : choice.label);
            option.value = choice.value;
            zoomControl.appendChild(option);
        }
        zoomControl.value = 'fit';
        zoomGroup.append(this._element('span', '', this._t('Zoom')), zoomControl);
        zoomGroup.hidden = true;
        bar.append(name, kind, zoomGroup);
        const sheetBox = this._element('div', 'rr-char-picker-sheet-box rr-accent-scrollbar');
        const status = this._element('div', 'rr-char-picker-status');
        status.setAttribute('data-rr-i18n-skip', '1');
        status.setAttribute('aria-live', 'polite');
        previewArea.append(bar, sheetBox, status);

        const footer = this._element('div', 'rr-modal-footer');
        const clearButton = this._element('button', 'rr-btn-secondary rr-char-picker-clear', this._t('Clear'));
        clearButton.type = 'button';
        clearButton.id = 'char-picker-clear';
        const okButton = this._element('button', 'rr-button-primary', this._t('OK'));
        okButton.type = 'button';
        okButton.id = 'char-picker-ok';
        okButton.disabled = true;
        const cancelButton = this._element('button', 'rr-btn-secondary', this._t('Cancel'));
        cancelButton.type = 'button';
        cancelButton.id = 'char-picker-cancel';
        footer.append(clearButton, okButton, cancelButton);

        body.append(fileList, previewArea);
        dialog.append(header, body, footer);
        modal.appendChild(dialog);
        this._modal = modal;
        this._parts = { dialog, previewArea, name, kind, zoomGroup, zoomControl, sheetBox, status,
            closeButton, clearButton, okButton, cancelButton, sheet: null };
        document.body.appendChild(modal);

        // Tab stays inside, Escape cancels, and the focus goes back to what opened the picker when it closes.
        const keys = window.RRKeyboardNavigation?.modal(modal, { onEscape: () => this._close(), container: () => dialog });
        keys?.enter(dialog);

        zoomControl.addEventListener('change', () => {
            this.previewZoom = zoomControl.value === 'fit' ? null : Number(zoomControl.value);
            this._applyZoom();
        });
        // The fitted zoom follows the room: the dialog is sized by the window. The refit waits for the next frame:
        // resizing the sheet inside the observer's own callback would make the browser report a resize loop.
        if (typeof ResizeObserver === 'function') {
            const nextFrame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : run => { run(); return 0; };
            this._roomObserver = new ResizeObserver(() => {
                if (this._roomFrame) return;
                this._roomFrame = nextFrame(() => { this._roomFrame = 0; this._applyZoom(); }) || 0;
            });
            this._roomObserver.observe(sheetBox);
        }

        this.setupPickerEvents(modal);

        this.loadCharacterFiles(fileList, previewArea, currentCharacterName, {
            characterIndex: currentCharacterIndex,
            pattern: currentPattern,
            direction: currentDirection
        });

        if (window.I18n) window.I18n.applyText(modal);
    }

    /** Words in the box where the sheet would be: nothing to show, or what went wrong. */
    _showMessage(text, isError = false, detail = '') {
        const parts = this._parts;
        if (!parts) return;
        this._layout = null;
        this._frames = [];
        this._picked = null;
        this._pickedFrame = null;
        this._hoverFrame = null;
        parts.sheet = null;
        parts.name.textContent = '';
        parts.kind.textContent = '';
        parts.zoomGroup.hidden = true;
        parts.status.textContent = '';
        parts.okButton.disabled = true;
        const message = this._element('div', 'rr-char-picker-message' + (isError ? ' is-error' : ''), text);
        if (detail) message.append(this._element('div', 'rr-char-picker-message-detail', detail));
        parts.sheetBox.replaceChildren(message);
    }

    /**
     * Load character files from project
     */
    async loadCharacterFiles(fileList, previewArea, currentCharacterName, currentSelection = null) {
        const projectPath = this.currentProject?.path;
        const listMessage = (text, isError = false) => {
            fileList.replaceChildren(this._element('div', 'rr-char-picker-message' + (isError ? ' is-error' : ''), text));
        };

        if (!projectPath) {
            listMessage(this._t('No project loaded'));
            return;
        }

        const charactersPath = `${projectPath}/img/characters`;

        try {
            const fs = require('fs');

            if (!fs.existsSync(charactersPath)) {
                listMessage(this._t('Characters folder not found'));
                return;
            }

            const files = RRAssetFiles.listImageReferences(charactersPath)
                .map(reference => ({ fullName: reference, baseName: reference }));

            fileList.replaceChildren();

            if (files.length === 0) {
                listMessage(this._t('No character images found in img/characters folder'));
                this._showMessage(this._t('No character files available'));
                return;
            }

            const fileByName = new Map(files.map(file => [file.baseName, file]));
            const browser = RRPickerIndex.createBrowser({
                files: files.map(file => file.baseName),
                selectedName: currentCharacterName,
                folders: true,
                itemClass: 'char-file-item',
                searchPlaceholder: this._t('Search files...'),
                onRender: list => this._syncFileTabStops(list),
                onSelect: name => {
                    this._syncFileTabStops(browser.list);
                    const file = fileByName.get(name);
                    // The sheet already on show keeps the frame picked on it.
                    if (!file || name === this._file) return;
                    const selection = name === currentCharacterName ? currentSelection : null;
                    this.showSpritePreview(previewArea, file.fullName, file.baseName, selection);
                }
            });
            // The editor's pickers scroll behind the accent scrollbar.
            browser.list.classList.add('rr-accent-scrollbar');
            browser.rail.classList.add('rr-accent-scrollbar');
            fileList.appendChild(browser.element);

            // Auto-select current character if it exists
            const currentFile = files.find(f => f.baseName === currentCharacterName);
            if (currentFile) {
                this.showSpritePreview(previewArea, currentFile.fullName, currentFile.baseName, currentSelection);
                browser.scrollTo(currentCharacterName);
            } else {
                this._showMessage(this._t('Select a character file from the list'));
            }
            // Arrow keys step through the files from the moment the picker
            // opens, without a click on the list first.
            browser.focusSelected();

        } catch (error) {
            console.error('Error loading character files:', error);
            listMessage(this._t('Error loading files'), true);
        }
    }

    /**
     * One Tab stop for the file list (the selected file, or the first), so Tab goes on to the zoom and the sheet
     * instead of through every file; the arrow keys walk the files. The letter buttons are a pointer shortcut.
     */
    _syncFileTabStops(list) {
        if (!list) return;
        const items = Array.from(list.querySelectorAll('.rr-picker-file-item'));
        const stop = items.find(item => item.classList.contains('selected')) || items[0];
        for (const item of items) item.tabIndex = item === stop ? 0 : -1;
        const rail = list.parentNode?.querySelector('.rr-picker-index-rail');
        for (const button of Array.from(rail ? rail.querySelectorAll('button') : [])) button.tabIndex = -1;
    }

    /**
     * Show the sheet of one file, ready to pick a frame from.
     * @param {HTMLElement} previewArea - The preview area element
     * @param {string} fullFilename - Extension-aware image reference
     * @param {string} baseName - Reference used for display and storage
     * @param {object} currentSelection - The frame to show as picked: { characterIndex, pattern, direction }
     */
    showSpritePreview(previewArea, fullFilename, baseName = null, currentSelection = null) {
        if (!baseName) baseName = fullFilename;

        const projectPath = this.currentProject?.path;

        const path = require('path');
        const imageFile = RRAssetFiles.findImage(
            path.join(projectPath, 'img', 'characters'), fullFilename);
        const imagePath = imageFile ? RRAssetFiles.toUrl(imageFile.absolutePath) : '';

        const parts = this._parts;
        previewArea.dataset.selectedFile = baseName;
        this._file = baseName;
        this._layout = null;
        this._frames = [];
        this._picked = null;
        this._pickedFrame = null;
        this._hoverFrame = null;
        this._pressFrame = null;
        this._keysLead = false;
        this._zoom = null;
        parts.sheet = null;
        parts.sheetBox.replaceChildren();
        parts.name.textContent = baseName;
        parts.kind.textContent = '';
        parts.status.textContent = '';
        parts.zoomGroup.hidden = true;
        parts.okButton.disabled = true;
        const previewGeneration = (this._previewGeneration || 0) + 1;
        this._previewGeneration = previewGeneration;

        const isSingleCharacter = RRAssetFiles.isBigCharacter(baseName);

        const img = new Image();
        img.onload = () => {
            if (this._previewGeneration !== previewGeneration || previewArea.dataset.selectedFile !== baseName) return;
            const frames = RRAssetFiles.characterFrameCount ? RRAssetFiles.characterFrameCount(baseName) : 3;
            const layout = CharacterGraphicPicker.sheetLayout(img.width, img.height, isSingleCharacter, frames);
            this._layout = layout;

            const kindText = isSingleCharacter
                ? this._t('Single Character Sprite Sheet')
                : this._t('Multi-Character Sprite Sheet (8 characters)');
            parts.kind.textContent = `${kindText} · ${Math.round(layout.frameWidth)} × ${Math.round(layout.frameHeight)}`;

            const sheet = this.createSheet(img, layout);
            parts.sheet = sheet;
            parts.sheetBox.replaceChildren(sheet);
            parts.zoomGroup.hidden = false;
            parts.zoomControl.value = this.previewZoom ? String(this.previewZoom) : 'fit';
            this._applyZoom();

            if (currentSelection) {
                const cell = CharacterGraphicPicker.cellOf(layout, isSingleCharacter ? 0 : (currentSelection.characterIndex || 0),
                    currentSelection.pattern || 0, currentSelection.direction || 2);
                // A "$" sheet has character 0 alone: a higher index kept from another sheet picks nothing.
                const kept = !isSingleCharacter || !(Number(currentSelection.characterIndex) > 0);
                if (cell && kept) this._pick(this._frames[cell.row * layout.columns + cell.column]);
            }
            this._sheetKeys?.sync();
            this._showStatus();
        };

        img.onerror = () => {
            if (this._previewGeneration !== previewGeneration || previewArea.dataset.selectedFile !== baseName) return;
            console.error('Failed to load character sprite:', imagePath);
            this._showMessage(`${this._t('Failed to load image:')} ${fullFilename}`, true, this._t('Check console for details'));
        };

        img.src = imagePath;
    }

    /**
     * The sheet as a grid of its characters, each a grid of its frames in the sheet's own order.
     * `this._frames` holds the frames row by row across the whole sheet, which is the order the arrow keys walk.
     */
    createSheet(img, layout) {
        const sheet = this._element('div', 'rr-char-picker-sheet');
        sheet.setAttribute('role', 'listbox');
        sheet.setAttribute('aria-label', this._t('Select Character Graphic'));
        sheet.style.gridTemplateColumns = `repeat(${layout.charactersAcross}, auto)`;
        sheet.style.gap = CharacterGraphicPicker.CHARACTER_GAP + 'px';

        this._directionNames = { 2: this._t('Down'), 4: this._t('Left'), 6: this._t('Right'), 8: this._t('Up') };
        const frames = new Array(layout.columns * layout.rows);
        const characters = layout.charactersAcross * layout.charactersDown;
        for (let character = 0; character < characters; character++) {
            const block = this._element('div', 'rr-char-picker-character');
            block.style.gridTemplateColumns = `repeat(${layout.frames}, auto)`;
            block.style.borderWidth = CharacterGraphicPicker.CHARACTER_BORDER + 'px';
            block.style.gap = CharacterGraphicPicker.FRAME_GAP + 'px';
            const firstColumn = (character % layout.charactersAcross) * layout.frames;
            const firstRow = Math.floor(character / layout.charactersAcross) * 4;
            for (let row = 0; row < 4; row++) {
                for (let pattern = 0; pattern < layout.frames; pattern++) {
                    const cell = CharacterGraphicPicker.frameAt(layout, firstColumn + pattern, firstRow + row);
                    const frame = this.createFrame(img, cell, layout);
                    frames[cell.row * layout.columns + cell.column] = frame;
                    block.appendChild(frame);
                }
            }
            sheet.appendChild(block);
        }
        this._frames = frames;

        const frameOf = event => event.target?.closest?.('.rr-char-picker-frame') || null;
        sheet.addEventListener('click', event => {
            const frame = frameOf(event);
            // A later click of a run that began off the sheet (on the zoom's list lying over it) is not a choice.
            if (!frame || (event.detail > 1 && !this._pressFrame)) return;
            this._pick(frame);
        });
        // A double-click confirms the frame both of its clicks were on.
        sheet.addEventListener('dblclick', event => {
            const frame = frameOf(event);
            if (!frame || frame !== this._pressFrame) return;
            this._pick(frame);
            this._confirm();
        });
        // The line under the sheet follows the pointer. After a key picked a frame it stays with that frame until
        // the pointer really moves: scrolling a frame into view slides the sheet under a resting pointer, and the
        // browser reports that as the pointer entering other frames, or leaving the sheet and coming back.
        const rests = event => {
            const moved = event.screenX !== this._pointerX || event.screenY !== this._pointerY;
            this._pointerX = event.screenX;
            this._pointerY = event.screenY;
            if (this._keysLead && !moved) return true;
            this._keysLead = false;
            return false;
        };
        const pointer = event => {
            if (rests(event)) return;
            const frame = frameOf(event);
            if (frame === this._hoverFrame) return;
            this._hoverFrame = frame;
            this._showStatus();
        };
        sheet.addEventListener('mouseover', pointer);
        sheet.addEventListener('mousemove', pointer);
        sheet.addEventListener('mouseleave', event => {
            if (rests(event)) return;
            this._hoverFrame = null;
            this._showStatus();
        });

        // Left and Right walk the frames in reading order and pick as they go; Up and Down move a row.
        this._sheetKeys = window.RRKeyboardNavigation?.roving(sheet, {
            orientation: 'horizontal',
            items: () => this._frames,
            isSelected: frame => frame === this._pickedFrame,
            select: frame => this._pick(frame, true)
        }) || null;
        sheet.addEventListener('keydown', event => {
            const step = { ArrowUp: -1, ArrowDown: 1 }[event.key];
            if (!step || event.altKey || event.metaKey || event.ctrlKey) return;
            event.preventDefault();
            event.stopPropagation();
            // From the picked frame, else from the one that holds the focus; with neither, the first frame.
            const from = this._pickedFrame || frameOf(event);
            const next = from ? this._frames[this._frames.indexOf(from) + step * layout.columns] : this._frames[0];
            if (!next) return;
            this._pick(next, true);
            next.focus?.({ preventScroll: true });
        });
        return sheet;
    }

    /** One frame of the sheet: a focusable cell that holds what it picks, with the frame drawn at the picture's own size. */
    createFrame(img, cell, layout) {
        const frame = this._element('div', 'rr-char-picker-frame');
        frame.setAttribute('role', 'option');
        frame.setAttribute('aria-selected', 'false');
        frame.tabIndex = -1;
        frame.dataset.characterIndex = String(cell.characterIndex);
        frame.dataset.pattern = String(cell.pattern);
        frame.dataset.direction = String(cell.direction);
        frame.setAttribute('aria-label', this._frameName(frame, layout));

        // The canvas keeps the picture's pixels; the zoom only changes the size it is shown at.
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(layout.frameWidth));
        canvas.height = Math.max(1, Math.round(layout.frameHeight));
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, cell.x, cell.y, layout.frameWidth, layout.frameHeight, 0, 0, canvas.width, canvas.height);
        frame.appendChild(canvas);
        return frame;
    }

    /** A frame in words: "Character 3 · Left · Frame 2", counted from 1 as a person counts them. */
    _frameName(frame, layout = this._layout) {
        const params = {
            index: Number(frame.dataset.characterIndex) + 1,
            direction: (this._directionNames || {})[frame.dataset.direction] || '',
            frame: Number(frame.dataset.pattern) + 1
        };
        return layout && layout.single
            ? this._t('{direction} · Frame {frame}', params)
            : this._t('Character {index} · {direction} · Frame {frame}', params);
    }

    /** The line under the sheet: the frame under the pointer, else the picked frame, else what to do. */
    _showStatus() {
        const status = this._parts?.status;
        if (!status || !this._layout) return;
        const frame = this._hoverFrame || this._pickedFrame;
        status.textContent = frame ? this._frameName(frame) : this._t('Click on the specific frame you want to use');
        status.classList.toggle('is-hint', !frame);
        status.classList.toggle('is-hover', !!frame && frame !== this._pickedFrame);
    }

    /**
     * Make a frame the picked one. `byKey`: a key moved to it, so it is scrolled into view and the line under the
     * sheet names it (a click is already on the frame it picks).
     */
    _pick(frame, byKey = false) {
        if (!frame) return;
        if (this._pickedFrame && this._pickedFrame !== frame) {
            this._pickedFrame.classList.remove('selected');
            this._pickedFrame.setAttribute('aria-selected', 'false');
        }
        this._pickedFrame = frame;
        frame.classList.add('selected');
        frame.setAttribute('aria-selected', 'true');
        this._picked = {
            characterIndex: parseInt(frame.dataset.characterIndex, 10),
            pattern: parseInt(frame.dataset.pattern, 10),
            direction: parseInt(frame.dataset.direction, 10)
        };
        if (this._parts) this._parts.okButton.disabled = false;
        this._sheetKeys?.sync();
        if (byKey) {
            this._keysLead = true;
            this._hoverFrame = null;
            frame.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        }
        this._showStatus();
    }

    /** The inner size of the box the sheet sits in: the room a fitted sheet may take. */
    _measureRoom() {
        const box = this._parts?.sheetBox;
        if (!box) return { width: 0, height: 0 };
        let width = box.offsetWidth || box.clientWidth || 0, height = box.offsetHeight || box.clientHeight || 0;
        if (width && height && typeof getComputedStyle === 'function') {
            const style = getComputedStyle(box), px = name => parseFloat(style[name]) || 0;
            width -= px('paddingLeft') + px('paddingRight') + px('borderLeftWidth') + px('borderRightWidth');
            height -= px('paddingTop') + px('paddingBottom') + px('borderTopWidth') + px('borderBottomWidth');
        }
        return { width: Math.max(0, width), height: Math.max(0, height) };
    }

    /** Size every frame for the zoom in force: the user's choice, else the largest step that fits the room. */
    _applyZoom() {
        const layout = this._layout, sheet = this._parts?.sheet;
        if (!layout || !sheet) return;
        const zoom = this.previewZoom || CharacterGraphicPicker.fitZoom(this._measureRoom(), layout);
        if (zoom === this._zoom) return;
        this._zoom = zoom;
        const size = CharacterGraphicPicker.displaySize(layout, zoom);
        for (const frame of this._frames) {
            const canvas = frame.firstChild;
            canvas.style.width = size.frameWidth + 'px';
            canvas.style.height = size.frameHeight + 'px';
        }
        // Enlarged art keeps sharp pixels; a sheet shown smaller than it is drawn is smoothed.
        sheet.classList.toggle('is-smooth', zoom < 1);
    }

    /** OK: hand the picked frame to the caller. Without a picked frame there is nothing to hand over. */
    _confirm() {
        if (!this._picked || !this._file) return false;
        const result = {
            characterName: this._file,
            characterIndex: this._picked.characterIndex,
            pattern: this._picked.pattern,
            direction: this._picked.direction
        };
        if (this.onSelect) this.onSelect(result);
        this._close();
        return true;
    }

    _close() {
        const modal = this._modal;
        if (!modal) return;
        this._modal = null;
        // A sheet still loading must not draw into a dialog that has gone.
        this._previewGeneration = (this._previewGeneration || 0) + 1;
        this._roomObserver?.disconnect();
        this._roomObserver = null;
        if (this._roomFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._roomFrame);
        this._roomFrame = 0;
        this._sheetKeys?.dispose?.();
        this._sheetKeys = null;
        const keys = modal._rrModalKeys;
        keys?.leave();
        keys?.dispose();
        modal.remove();
        this._parts = null;
    }

    /**
     * Setup event listeners for the picker
     */
    setupPickerEvents(modal) {
        const { closeButton: closeBtn, okButton: okBtn, cancelButton: cancelBtn, clearButton: clearBtn } = this._parts;

        // A run of clicks belongs to where it began. The second press of a double-click on the button that opened
        // the picker lands in the picker, on whatever is under the pointer by then: it must not pick a frame,
        // press Clear or confirm. Capturing, so nothing in the dialog sees those presses.
        const strayPress = event => {
            if (!(event.detail > 1) || this._runInside) return false;
            event.preventDefault();
            event.stopPropagation();
            return true;
        };
        modal.addEventListener('mousedown', event => {
            if (strayPress(event) || event.detail > 1) return;
            this._runInside = true;
            this._pressFrame = event.target?.closest?.('.rr-char-picker-frame') || null;
        }, true);
        for (const type of ['mouseup', 'click', 'dblclick']) modal.addEventListener(type, strayPress, true);

        closeBtn.addEventListener('click', () => this._close());
        cancelBtn.addEventListener('click', () => this._close());

        clearBtn.addEventListener('click', () => {
            if (this.onSelect) {
                this.onSelect({
                    characterName: '',
                    characterIndex: 0,
                    pattern: 0,
                    direction: 2
                });
            }
            this._close();
        });

        okBtn.addEventListener('click', () => this._confirm());

        // Enter confirms from the file list and from the sheet. Buttons, the zoom and the search keep their own Enter.
        // Capturing: the file list and the sheet would otherwise take the key for themselves first.
        modal.addEventListener('keydown', event => {
            if (event.key !== 'Enter' || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
            // A held Enter is one Enter: the press that opened the picker must not go on to confirm in it.
            if (event.repeat) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            const target = event.target;
            const frame = target?.closest?.('.rr-char-picker-frame');
            const file = !frame && target?.closest?.('.rr-picker-file-item');
            if (frame) {
                this._pick(frame);
                this._confirm();
            } else if (file) {
                // A file that is not the one on show opens on Enter, as it does on a click.
                if (file.dataset.fileName !== this._file) return;
                // With no frame picked yet, Enter moves on to the sheet, where the arrows pick one.
                if (!this._confirm()) (this._pickedFrame || this._frames[0])?.focus?.({ preventScroll: true });
            } else if (target?.closest?.('button, select, input, textarea, [role="button"]')) {
                return;
            } else {
                this._confirm();
            }
            event.preventDefault();
            event.stopPropagation();
        }, true);

        // A click on the backdrop does not close the dialog: an accidental click beside it must never cost the
        // choice in progress.
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CharacterGraphicPicker;
}
