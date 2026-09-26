/**
 * DatabaseSystem2Editor - Editor for managing System 2 settings
 * Handles menu commands, item categories, attack motions, magic skills,
 * tile/icon/face sizes, editor settings, and advanced settings
 */

class DatabaseSystem2Editor {
    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;
    }

    showSystem2Detail(container) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const system = this.databaseManager.getSystem();
        if (!system) {
            container.innerHTML = `<p style="color: var(--color-text-muted); text-align: center; margin-top: 100px;">${tt('System data not loaded')}</p>`;
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow-y: auto;
        `;

        // Full-width title banner
        const titleBanner = document.createElement('div');
        titleBanner.style.cssText = `
            background-color: var(--color-bg-deep);
            padding: 14px 20px;
            border-bottom: 2px solid var(--color-accent-border-mid);
            font-size: 20px;
            font-weight: 600;
            color: var(--color-text-strong);
        `;
        titleBanner.textContent = tt('System 2');
        wrapper.appendChild(titleBanner);

        // 3 independent flex columns — each stacks tightly without shared row heights
        const columnsGrid = document.createElement('div');
        columnsGrid.className = 'system2-columns-grid';
        columnsGrid.style.cssText = `
            display: grid;
            gap: 16px;
            padding: 16px;
            align-items: start;
        `;

        // Col 1: Menu Commands, Item Categories, Magic Skills
        const col1 = document.createElement('div');
        col1.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';
        col1.appendChild(this.createCustomInterfacesSection(system));
        col1.appendChild(this.createMenuCommandsSection(system));
        col1.appendChild(this.createItemCategoriesSection(system));
        col1.appendChild(this.createMagicSkillsSection(system));
        columnsGrid.appendChild(col1);

        // Col 2: Attack Motions, Editor Settings
        const col2 = document.createElement('div');
        col2.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';
        col2.appendChild(this.createAttackMotionsSection(system));
        col2.appendChild(this.createEditorSettingsSection(system));
        col2.appendChild(this.createCompatibilitySection(system));
        columnsGrid.appendChild(col2);

        // Col 3: Asset Sizes (horizontal), Advanced Settings
        const col3 = document.createElement('div');
        col3.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';
        col3.appendChild(this.createAssetSizesSection(system));
        col3.appendChild(this.createAdvancedSettingsSection(system));
        col3.appendChild(this.createWindowTextSection(system));
        columnsGrid.appendChild(col3);

        wrapper.appendChild(columnsGrid);
        container.appendChild(wrapper);

        // Wire event listeners after DOM insertion
        setTimeout(() => {
            this.wireEventListeners(container, system);
        }, 0);
    }

    createMenuCommandsSection(system) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        if (!system.menuCommands) system.menuCommands = [true, true, true, true, true, true];
        const menuLabels = ['Item', 'Skill', 'Equip', 'Status', 'Formation', 'Save'];
        let html = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">';
        menuLabels.forEach((label, idx) => {
            html += `
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 12px; cursor: pointer;">
                    <input type="checkbox" class="system-checkbox sys2-menu-cmd" data-idx="${idx}" ${system.menuCommands[idx] ? 'checked' : ''}>
                    ${tt(label)}
                </label>`;
        });
        html += '</div>';
        return this.createSection(tt('Menu Commands'), html);
    }

    createCustomInterfacesSection(system) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const rows = [
            ['reactorMenuInterfaceId', 'Main Menu', 'menu'],
            ['reactorStatusInterfaceId', 'Status', 'status'],
            ['reactorGameEndInterfaceId', 'Game End', 'gameEnd'],
            ['reactorOptionsInterfaceId', 'Options', 'options'],
            ['reactorSaveInterfaceId', 'Save', 'save'],
            ['reactorLoadInterfaceId', 'Load', 'load'],
            ['reactorItemInterfaceId', 'Items', 'item'],
            ['reactorSkillInterfaceId', 'Skills', 'skill'],
            ['reactorEquipInterfaceId', 'Equipment', 'equip'],
            ['reactorShopInterfaceId', 'Shop', 'shop'],
            ['reactorNameInterfaceId', 'Name Input', 'name'],
            ['reactorBattleInterfaceId', 'Battle', 'battle']
        ];
        const html = rows.map(([field, label, role]) => `<div style="margin-bottom: 8px;">
            <label class="database-field-label">${tt(label)}</label>
            <select class="database-field-value sys2-interface" data-system-field="${field}" data-role="${role}" style="width: 100%;">${this.userInterfaceOptions(system[field], role)}</select>
        </div>`).join('') + `<div class="sys2-magic-skills-hint">${tt('The same setting as Use As in Database › User Interfaces.')}</div>`;
        return this.createSection(tt('Custom Interfaces'), html);
    }

    /**
     * Every interface whose presentation can fill the role: a Battle HUD for
     * Battle, a focused scene for the rest. Choosing one here or in Use As is
     * the same binding.
     */
    userInterfaceOptions(selectedId, role) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const selected = Math.max(0, Math.floor(Number(selectedId) || 0));
        const fits = entry => entry && (entry.mode || 'scene') === (role === 'battle' ? 'battle' : 'scene');
        let html = `<option value="0"${selected === 0 ? ' selected' : ''}>${tt('Stock (default)')}</option>`;
        const records = this.databaseManager.getUserInterfaces ? this.databaseManager.getUserInterfaces() : [];
        for (const entry of records || []) {
            const id = Math.floor(Number(entry && entry.id) || 0);
            if (!(id > 0) || !fits(entry)) continue;
            html += `<option value="${id}"${id === selected ? ' selected' : ''}>${String(id).padStart(4, '0')}: ${rrEscapeHtml(entry.name || tt('(Unnamed)'))}</option>`;
        }
        if (selected > 0 && !(records || []).some(entry => entry && Number(entry.id) === selected && fits(entry))) {
            html += `<option value="${selected}" selected>${tt('(Missing)')} / ${tt('(incompatible)')} #${selected}</option>`;
        }
        return html;
    }

    /** Bind an interface to a role; the game routes a record only when its roles name that role. */
    bindUserInterface(system, field, role, id) {
        system[field] = id;
        const record = id > 0 && this.databaseManager.getUserInterface ? this.databaseManager.getUserInterface(id) : null;
        if (record && role) {
            if (!Array.isArray(record.roles)) record.roles = record.stock ? [record.stock] : [];
            if (!record.roles.includes(role)) record.roles.push(role);
        }
        this.databaseManager.mutationGeneration = (this.databaseManager.mutationGeneration || 0) + 1;
    }

    createItemCategoriesSection(system) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        if (!system.itemCategories) system.itemCategories = [true, true, true, true];
        const catLabels = ['Item', 'Weapon', 'Armor', 'Key Item'];
        let html = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">';
        catLabels.forEach((label, idx) => {
            html += `
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 12px; cursor: pointer;">
                    <input type="checkbox" class="system-checkbox sys2-item-cat" data-idx="${idx}" ${system.itemCategories[idx] ? 'checked' : ''}>
                    ${tt(label)}
                </label>`;
        });
        html += '</div>';
        return this.createSection(tt('Item Categories'), html);
    }

    createMagicSkillsSection(system) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const skillTypes = system.skillTypes || [''];
        const magicSkills = Array.isArray(system.magicSkills) ? system.magicSkills : [];
        const optionHtml = selectedId => {
            let options = `<option value="0">${tt('(None)')}</option>`;
            for (let id = 1; id < skillTypes.length; id++) {
                const name = skillTypes[id] || `${tt('(Unnamed)')} #${id}`;
                options += `<option value="${id}" ${id === selectedId ? 'selected' : ''}>${rrEscapeHtml(name)}</option>`;
            }
            if (selectedId > 0 && selectedId >= skillTypes.length) {
                options += `<option value="${selectedId}" selected>${tt('Missing Skill Type')} #${selectedId}</option>`;
            }
            return options;
        };
        const rowHtml = (id, row) => `
            <div class="sys2-magic-skill-row" data-row="${row}">
                <span>${String(row + 1).padStart(2, '0')}</span>
                <select class="database-field-value sys2-magic-skill" data-row="${row}">${optionHtml(id)}</select>
            </div>`;

        let html = '<div class="sys2-magic-skills-list">';
        magicSkills.forEach((id, row) => { html += rowHtml(Number(id), row); });
        html += rowHtml(0, magicSkills.length);
        html += `</div><div class="sys2-magic-skills-hint">${tt('Choose the skill types that use the side-view casting motion. Select None to remove a row.')}</div>`;
        return this.createSection(tt('[SV] Magic Skills'), html);
    }

    setMagicSkillIds(system, values) {
        if (!system || !Array.isArray(values)) return false;
        const ids = [];
        values.forEach(value => {
            const id = Number(value);
            if (Number.isInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
        });
        system.magicSkills = ids;
        return true;
    }

    createAttackMotionsSection(system) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const motionNames = ['Thrust', 'Swing', 'Missile'];
        const weaponImageNames = ['None', 'Dagger', 'Sword', 'Flail', 'Axe', 'Whip', 'Staff', 'Bow', 'Crossbow', 'Gun', 'Claw', 'Glove', 'Spear'];
        const weaponTypes = system.weaponTypes || [''];
        const attackMotions = system.attackMotions || [];

        let html = `
            <div style="overflow-y: auto; border: 1px solid var(--color-border); border-radius: 3px;">
                <table class="traits-table" style="width: 100%; margin-top: 0;">
                    <thead>
                        <tr>
                            <th>${tt('Type')}</th>
                            <th>${tt('Motion')}</th>
                            <th>${tt('Image')}</th>
                        </tr>
                    </thead>
                    <tbody>`;

        for (let i = 0; i < attackMotions.length; i++) {
            const typeName = weaponTypes[i] !== undefined ? weaponTypes[i] : `${tt('Type')} ${i}`;
            const motion = attackMotions[i] || { type: 0, weaponImageId: 0 };
            html += `
                <tr class="attack-motion-row" data-idx="${i}" style="cursor: pointer;">
                    <td style="color: var(--color-text); font-size: 12px;">${this.commonUI.nameHtml(typeName || tt('(Bare Hands)'))}</td>
                    <td style="color: var(--color-text-muted); font-size: 12px;">${tt(motionNames[motion.type] || 'Thrust')}</td>
                    <td style="color: var(--color-text-muted); font-size: 12px;">${tt(weaponImageNames[motion.weaponImageId] || 'None')}</td>
                </tr>`;
        }

        html += `
                    </tbody>
                </table>
            </div>`;
        return this.createSection(tt('[SV] Attack Motions'), html);
    }

    createAssetSizesSection(system) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const groups = [
            { title: 'Tile', field: 'tileSize', current: system.tileSize || 48, sizes: [64, 48, 32, 24, 16, 8], css: 'sys2-tile-size' },
            { title: 'Icon', field: 'iconSize', current: system.iconSize || 32, sizes: [48, 32, 24, 16, 12, 8], css: 'sys2-icon-size' },
            { title: 'Face', field: 'faceSize', current: system.faceSize || 144, sizes: [288, 144, 96, 48, 40, 32], css: 'sys2-face-size' },
        ];
        let html = '<div style="display: flex; gap: 16px;">';
        for (const g of groups) {
            html += `<div style="flex: 1; min-width: 0;">
                <div style="color: var(--color-text-muted); font-size: 11px; font-weight: 600; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">${tt(g.title)}</div>`;
            for (const size of g.sizes) {
                html += `<label style="display: flex; align-items: center; gap: 6px; color: var(--color-text); font-size: 11px; cursor: pointer; margin-bottom: 2px;">
                    <input type="radio" class="system-radio ${g.css}" name="${g.field}" value="${size}" ${g.current === size ? 'checked' : ''}>
                    ${size}x${size}
                </label>`;
            }
            html += '</div>';
        }
        html += '</div>';
        return this.createSection(tt('Asset Sizes'), html);
    }

    createEditorSettingsSection(system) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        if (!system.editor) system.editor = { messageWidth1: 60, messageWidth2: 47, jsonFormatLevel: 1 };
        const editor = system.editor;
        const editorHTML = `
            <table class="traits-table" style="width: 100%;">
                <thead>
                    <tr><th>${tt('Setting')}</th><th>${tt('Value')}</th></tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="color: var(--color-text); font-size: 12px;">${tt('Message Width (Normal)')}</td>
                        <td><input type="number" class="database-field-value sys2-editor-field" data-editor-field="messageWidth1" value="${editor.messageWidth1 || 60}" style="width: 70px; font-size: 12px;"></td>
                    </tr>
                    <tr>
                        <td style="color: var(--color-text); font-size: 12px;">${tt('Message Width (with Face)')}</td>
                        <td><input type="number" class="database-field-value sys2-editor-field" data-editor-field="messageWidth2" value="${editor.messageWidth2 || 47}" style="width: 70px; font-size: 12px;"></td>
                    </tr>
                    <tr>
                        <td style="color: var(--color-text); font-size: 12px;">${tt('JSON Format Level')}</td>
                        <td><input type="number" class="database-field-value sys2-editor-field" data-editor-field="jsonFormatLevel" value="${editor.jsonFormatLevel || 1}" min="0" style="width: 70px; font-size: 12px;"></td>
                    </tr>
                </tbody>
            </table>`;
        return this.createSection(tt('Editor Settings'), editorHTML);
    }

    createAdvancedSettingsSection(system) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const adv = system.advanced || {};
        const fields = [
            { label: 'Game ID', field: 'gameId', value: adv.gameId || 0, type: 'number' },
            { label: 'Screen Width', field: 'screenWidth', value: adv.screenWidth || 816, type: 'number' },
            { label: 'Screen Height', field: 'screenHeight', value: adv.screenHeight || 624, type: 'number' },
            { label: 'UI Area Width', field: 'uiAreaWidth', value: adv.uiAreaWidth || 816, type: 'number' },
            { label: 'UI Area Height', field: 'uiAreaHeight', value: adv.uiAreaHeight || 624, type: 'number' },
            { label: 'Pixelated Rendering', field: 'pixelatedRendering', value: adv.pixelatedRendering === true, type: 'checkbox' },
            { label: 'Screen Scale', field: 'screenScale', value: adv.screenScale || 1, type: 'number', step: '0.1' },
            { label: '2D Camera Zoom', field: 'camera2DZoom', value: adv.camera2DZoom ?? 1, type: 'number', step: '0.25', min: 1, max: 8 },
            { label: '2D Camera Offset X (px)', field: 'camera2DOffsetX', value: adv.camera2DOffsetX ?? 0, type: 'number' },
            { label: '2D Camera Offset Y (px)', field: 'camera2DOffsetY', value: adv.camera2DOffsetY ?? 0, type: 'number' },
            { label: 'Font Size', field: 'fontSize', value: adv.fontSize || 26, type: 'number' },
            { label: 'Window Opacity', field: 'windowOpacity', value: adv.windowOpacity || 192, type: 'number' },
            { label: 'Pictures Limit', field: 'picturesUpperLimit', value: adv.picturesUpperLimit || 100, type: 'number' },
            { label: 'Main Font', field: 'mainFontFilename', value: adv.mainFontFilename || '', type: 'text' },
            { label: 'Number Font', field: 'numberFontFilename', value: adv.numberFontFilename || '', type: 'text' },
            { label: 'Fallback Fonts', field: 'fallbackFonts', value: adv.fallbackFonts || '', type: 'text' },
        ];
        let rows = '';
        for (const f of fields) {
            const ro = f.readonly ? ` readonly title="${tt('Read-only')}"` : '';
            const step = f.step ? ` step="${f.step}"` : '';
            const bounds = f.min !== undefined ? ` min="${f.min}" max="${f.max}"` : '';
            const inputClass = f.type === 'checkbox' ? 'system-checkbox' : 'database-field-value';
            const inputStyle = f.type === 'checkbox' ? '' : 'width: 100%; font-size: 12px; box-sizing: border-box;';
            rows += `<tr>
                <td style="color: var(--color-text); font-size: 12px; white-space: nowrap;">${tt(f.label)}</td>
                <td><input type="${f.type}" class="${inputClass} sys2-advanced-field" aria-label="${rrEscapeHtml(tt(f.label))}" data-advanced-field="${f.field}" value="${rrEscapeHtml(f.value)}" style="${inputStyle}"${step}${bounds}${ro}${f.type === 'checkbox' && f.value ? ' checked' : ''}></td>
            </tr>`;
        }
        const advHTML = `
            <table class="traits-table" style="width: 100%;">
                <thead><tr><th>${tt('Setting')}</th><th>${tt('Value')}</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
        return this.createSection(tt('Advanced Settings'), advHTML);
    }

    /**
     * Window & Text: the frame an imported game was drawn in (line height,
     * padding, margin, outline, \\{ \\} step, balloon size, a message script's
     * name box, multi-frame sheets, a title the game skips). A blank field is
     * the stock behaviour and stores nothing, so a stock project stays stock;
     * an import fills them in, and here they are seen and changed.
     */
    createWindowTextSection(system) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const adv = system.advanced || {};
        const box = adv.rrNameBox || {};
        const fields = [
            { label: 'Line Height', path: 'advanced.lineHeight', value: adv.lineHeight, placeholder: 36 },
            { label: 'Window Padding', path: 'advanced.windowPadding', value: adv.windowPadding, placeholder: 12 },
            { label: 'Window Margin', path: 'advanced.windowMargin', value: adv.windowMargin, placeholder: 4 },
            { label: 'Text Outline Width', path: 'advanced.textOutlineWidth', value: adv.textOutlineWidth, placeholder: 3 },
            { label: 'Font Size Step', path: 'advanced.fontSizeStep', value: adv.fontSizeStep, placeholder: 12, step: '0.1' },
            { label: 'Balloon Size', path: 'rrBalloonSize', value: system.rrBalloonSize, placeholder: 48 },
            { label: 'Name Box Opacity', path: 'advanced.rrNameBox.opacity', value: box.opacity, placeholder: '' },
            { label: 'Name Box Offset X', path: 'advanced.rrNameBox.offsetX', value: box.offsetX, placeholder: '' },
            { label: 'Name Box Offset Y', path: 'advanced.rrNameBox.offsetY', value: box.offsetY, placeholder: '' }
        ];
        return this.createSection(tt('Window & Text'), this.windowTextTable(fields,
            tt('Blank uses the standard value. Imported games fill these in to keep their original look.')));
    }

    /**
     * Compatibility: the rules an older engine's game needs (2000/2003
     * passability, event order, movement and arithmetic, panoramas, the
     * 2003 save screen, skipped missing files, ...). The importer turns on
     * the ones a game needs; a new project leaves every one off, so they sit
     * apart from the settings a project made here would use.
     */
    createCompatibilitySection(system) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const fields = [
            { label: 'Multi-frame Sheets ([fN])', path: 'rrMultiFrames', value: system.rrMultiFrames === true, type: 'checkbox' },
            { label: 'Skip Title Screen', path: 'rrSkipTitle', value: system.rrSkipTitle === true, type: 'checkbox' },
            { label: 'Erase Pictures on Map Change', path: 'rrPicturesEraseOnMapChange', value: system.rrPicturesEraseOnMapChange === true, type: 'checkbox' },
            { label: 'RPG Maker 2000/2003 Passability', path: 'rrLegacyPassage', value: system.rrLegacyPassage === true, type: 'checkbox' },
            { label: 'Common Events Before Map Events', path: 'rrLegacyEventOrder', value: system.rrLegacyEventOrder === true, type: 'checkbox' },
            { label: 'Page Change Resets Transparency', path: 'rrLegacyPageOpacity', value: system.rrLegacyPageOpacity === true, type: 'checkbox' },
            { label: 'RPG Maker 2000/2003 Panoramas', path: 'rrLegacyParallax', value: system.rrLegacyParallax === true, type: 'checkbox' },
            { label: 'Choices Inside the Message', path: 'rrChoicesInMessage', value: system.rrChoicesInMessage === true, type: 'checkbox' },
            { label: 'RPG Maker 2000/2003 Movement Speed', path: 'rrLegacyMotion', value: system.rrLegacyMotion === true, type: 'checkbox' },
            { label: 'Skip Missing Sounds', path: 'rrSkipMissingAudio', value: system.rrSkipMissingAudio === true, type: 'checkbox' },
            { label: 'Skip Missing Images', path: 'rrSkipMissingImages', value: system.rrSkipMissingImages === true, type: 'checkbox' },
            { label: 'RPG Maker 2003 Save Screen', path: 'rrLegacySaveScreen', value: !!system.rrLegacySaveScreen, type: 'checkbox' },
            { label: 'Variable Limit (2000/2003 Arithmetic)', path: 'rrLegacyVariableLimit', value: system.rrLegacyVariableLimit, placeholder: '' },
            { label: 'Character Lift', path: 'rrCharacterShiftY', value: system.rrCharacterShiftY, placeholder: 6 }
        ];
        return this.createSection(tt('Compatibility'), this.windowTextTable(fields,
            tt('Rules for games imported from older RPG Maker versions. The importer turns on what a game needs; a new project leaves them off.')));
    }

    /** A Setting | Value table of Window & Text style fields (blank or unticked stores nothing). */
    windowTextTable(fields, note) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const rows = fields.map(f => {
            const input = f.type === 'checkbox'
                ? `<input type="checkbox" class="system-checkbox sys2-window-text-field" data-path="${f.path}" aria-label="${rrEscapeHtml(tt(f.label))}"${f.value ? ' checked' : ''}>`
                : `<input type="number" class="database-field-value sys2-window-text-field" data-path="${f.path}" aria-label="${rrEscapeHtml(tt(f.label))}" value="${f.value === undefined || f.value === null ? '' : rrEscapeHtml(f.value)}" placeholder="${rrEscapeHtml(f.placeholder)}"${f.step ? ` step="${f.step}"` : ''} style="width: 100%; font-size: 12px; box-sizing: border-box;">`;
            return `<tr><td style="color: var(--color-text); font-size: 12px; white-space: nowrap;">${tt(f.label)}</td><td>${input}</td></tr>`;
        }).join('');
        return `
            <div style="font-size: 11px; color: var(--color-text-muted); margin-bottom: 6px;">${note}</div>
            <table class="traits-table" style="width: 100%;">
                <thead><tr><th>${tt('Setting')}</th><th>${tt('Value')}</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    }

    /** Set or clear a Window & Text value by its path; an empty object left behind goes too. */
    static setWindowTextValue(system, path, value) {
        const keys = path.split('.');
        let owner = system;
        for (const key of keys.slice(0, -1)) owner = owner[key] = owner[key] && typeof owner[key] === 'object' ? owner[key] : {};
        const last = keys[keys.length - 1];
        if (value === null || value === false) delete owner[last]; else owner[last] = value;
        if (keys.length === 3 && Object.keys(owner).length === 0) delete system[keys[0]][keys[1]];
    }

    createSection(title, content) {
        const section = document.createElement('div');
        section.className = 'database-section';
        section.innerHTML = `
            <div class="database-section-header">${title}</div>
            <div class="database-section-content">
                ${content}
            </div>
        `;
        return section;
    }

    wireEventListeners(container, system) {
        container.querySelectorAll('.sys2-interface').forEach(select => {
            select.addEventListener('change', event => {
                const field = event.target.dataset.systemField;
                if (!['reactorMenuInterfaceId', 'reactorStatusInterfaceId', 'reactorGameEndInterfaceId',
                    'reactorOptionsInterfaceId', 'reactorSaveInterfaceId', 'reactorLoadInterfaceId',
                    'reactorItemInterfaceId', 'reactorSkillInterfaceId', 'reactorEquipInterfaceId', 'reactorShopInterfaceId',
                    'reactorNameInterfaceId', 'reactorBattleInterfaceId'].includes(field)) return;
                this.bindUserInterface(system, field, event.target.dataset.role, Math.max(0, Math.floor(Number(event.target.value) || 0)));
            });
        });

        // Menu Commands checkboxes
        container.querySelectorAll('.sys2-menu-cmd').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                if (!system.menuCommands) system.menuCommands = [true, true, true, true, true, true];
                system.menuCommands[idx] = e.target.checked;
                console.debug(`Updated menuCommands[${idx}] to:`, e.target.checked);
            });
        });

        // Item Categories checkboxes
        container.querySelectorAll('.sys2-item-cat').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                if (!system.itemCategories) system.itemCategories = [true, true, true, true];
                system.itemCategories[idx] = e.target.checked;
                console.debug(`Updated itemCategories[${idx}] to:`, e.target.checked);
            });
        });

        // Attack Motion rows
        container.querySelectorAll('.attack-motion-row').forEach(row => {
            row.addEventListener('click', () => {
                const idx = parseInt(row.dataset.idx);
                this.showAttackMotionEditor(system, idx, container);
            });
            row.addEventListener('mouseenter', () => { row.style.backgroundColor = 'var(--color-bg-button)'; });
            row.addEventListener('mouseleave', () => { row.style.backgroundColor = ''; });
        });

        // Magic Skills are an ordered list of Skill Type IDs, not booleans.
        const magicList = container.querySelector('.sys2-magic-skills-list');
        if (magicList) {
            const updateRows = changedSelect => {
                let rows = [...magicList.querySelectorAll('.sys2-magic-skill-row')];
                if (changedSelect.value === '0' && rows.length > 1) {
                    changedSelect.closest('.sys2-magic-skill-row')?.remove();
                    rows = [...magicList.querySelectorAll('.sys2-magic-skill-row')];
                }

                const seen = new Set();
                [...magicList.querySelectorAll('.sys2-magic-skill')].forEach(select => {
                    const id = Number(select.value);
                    if (id > 0 && seen.has(id)) select.closest('.sys2-magic-skill-row')?.remove();
                    else if (id > 0) seen.add(id);
                });

                let selects = [...magicList.querySelectorAll('.sys2-magic-skill')];
                const lastSelect = selects[selects.length - 1];
                if (!lastSelect || lastSelect.value !== '0') {
                    const sourceRow = changedSelect.closest('.sys2-magic-skill-row');
                    const blankRow = sourceRow.cloneNode(true);
                    const blankSelect = blankRow.querySelector('.sys2-magic-skill');
                    blankSelect.value = '0';
                    magicList.appendChild(blankRow);
                    wireMagicSelect(blankSelect);
                    selects = [...magicList.querySelectorAll('.sys2-magic-skill')];
                }

                [...magicList.querySelectorAll('.sys2-magic-skill-row')].forEach((row, index) => {
                    row.dataset.row = index;
                    row.querySelector('span').textContent = String(index + 1).padStart(2, '0');
                    row.querySelector('.sys2-magic-skill').dataset.row = index;
                });
                this.setMagicSkillIds(system, selects.map(select => select.value));
            };
            const wireMagicSelect = select => {
                select.addEventListener('change', () => updateRows(select));
            };
            magicList.querySelectorAll('.sys2-magic-skill').forEach(wireMagicSelect);
        }

        // Tile Size radios
        container.querySelectorAll('.sys2-tile-size').forEach(radio => {
            radio.addEventListener('change', (e) => {
                system.tileSize = parseInt(e.target.value);
                console.debug('Updated tileSize to:', system.tileSize);
                // Every surface that draws tiles measures in this, and each
                // reads it once when a project loads. Without telling them, the
                // open map keeps drawing at the old size until a reload, which
                // looks exactly like the setting having done nothing.
                if (typeof window !== 'undefined' && typeof window.rpgReactorTileSizeChanged === 'function') {
                    window.rpgReactorTileSizeChanged();
                }
            });
        });

        // Icon Size radios
        container.querySelectorAll('.sys2-icon-size').forEach(radio => {
            radio.addEventListener('change', (e) => {
                system.iconSize = parseInt(e.target.value);
                console.debug('Updated iconSize to:', system.iconSize);
            });
        });

        // Face Size radios
        container.querySelectorAll('.sys2-face-size').forEach(radio => {
            radio.addEventListener('change', (e) => {
                system.faceSize = parseInt(e.target.value);
                console.debug('Updated faceSize to:', system.faceSize);
            });
        });

        // Editor Settings fields
        container.querySelectorAll('.sys2-editor-field').forEach(field => {
            field.addEventListener('change', (e) => {
                const editorField = e.target.dataset.editorField;
                if (editorField) {
                    if (!system.editor) system.editor = {};
                    system.editor[editorField] = parseFloat(e.target.value);
                    console.debug(`Updated editor.${editorField} to:`, system.editor[editorField]);
                }
            });
        });

        container.querySelectorAll('.sys2-window-text-field').forEach(field => {
            field.addEventListener('change', (e) => {
                const value = e.target.type === 'checkbox' ? e.target.checked : (e.target.value === '' ? null : parseFloat(e.target.value));
                if (value !== null && value !== true && value !== false && !Number.isFinite(value)) return;
                if (e.target.dataset.path === 'rrLegacySaveScreen' && value === true) {
                    system.rrLegacySaveScreen = system.rrLegacySaveScreen || this._rrSaveScreenKept || { background: '#000000' };
                } else {
                    if (e.target.dataset.path === 'rrLegacySaveScreen' && system.rrLegacySaveScreen) this._rrSaveScreenKept = system.rrLegacySaveScreen;
                    DatabaseSystem2Editor.setWindowTextValue(system, e.target.dataset.path, value);
                }
                this.databaseManager.mutationGeneration = (this.databaseManager.mutationGeneration || 0) + 1;
            });
        });

        // Advanced Settings fields. MV-era System.json has no `advanced`
        // object — create it on first edit instead of silently dropping the
        // change.
        container.querySelectorAll('.sys2-advanced-field').forEach(field => {
            field.addEventListener('change', (e) => {
                const advField = e.target.dataset.advancedField;
                if (advField) {
                    if (!system.advanced) system.advanced = {};
                    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value;
                    if (advField.startsWith('camera2D')) {
                        if (!Number.isFinite(val)) {
                            e.target.value = system.advanced[advField] ?? (advField === 'camera2DZoom' ? 1 : 0);
                            return;
                        }
                        system.advanced[advField] = advField === 'camera2DZoom' ? Math.max(1, Math.min(8, val)) : val;
                        e.target.value = system.advanced[advField];
                    } else system.advanced[advField] = val;
                }
            });
        });
    }

    showAttackMotionEditor(system, index, parentContainer) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const motionNames = ['Thrust', 'Swing', 'Missile'];
        const weaponImageNames = ['None', 'Dagger', 'Sword', 'Flail', 'Axe', 'Whip', 'Staff', 'Bow', 'Crossbow', 'Gun', 'Claw', 'Glove', 'Spear'];
        const weaponTypes = system.weaponTypes || [''];
        const motion = system.attackMotions[index] || { type: 0, weaponImageId: 0 };
        const typeName = weaponTypes[index] !== undefined ? weaponTypes[index] : `${tt('Type')} ${index}`;

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background-color: rgba(0, 0, 0, 0.8);
            display: flex; justify-content: center; align-items: center;
            z-index: 2000;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background-color: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 8px;
            width: 380px; padding: 0;
        `;

        modal.innerHTML = `
            <div style="background-color: var(--color-bg-panel); padding: 12px 16px; border-bottom: 1px solid var(--color-border); border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center;">
                <div style="font-size: 16px; font-weight: 600; color: var(--color-text);">${tt('Edit Attack Motion')} — ${this.commonUI.nameHtml(typeName || tt('(Bare Hands)'))}</div>
                <button class="atk-modal-close" style="background: none; border: none; color: var(--color-text-muted); font-size: 24px; cursor: pointer;">×</button>
            </div>
            <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                <div class="form-row">
                    <label class="database-field-label">${tt('Motion:')}</label>
                    <select id="atk-motion-type" class="database-field-value" style="width: 100%;">
                        ${motionNames.map((name, i) => `<option value="${i}" ${motion.type === i ? 'selected' : ''}>${tt(name)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-row">
                    <label class="database-field-label">${tt('Weapon Image:')}</label>
                    <select id="atk-weapon-image" class="database-field-value" style="width: 100%;">
                        ${weaponImageNames.map((name, i) => `<option value="${i}" ${motion.weaponImageId === i ? 'selected' : ''}>${tt(name)}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div style="padding: 12px 16px; border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: 8px; background-color: var(--color-bg-panel);">
                <button class="atk-modal-cancel rr-btn-secondary">${tt('Cancel')}</button>
                <button class="atk-modal-ok rr-button-primary">${tt('OK')}</button>
            </div>
        `;

        const close = () => document.body.removeChild(overlay);

        modal.querySelector('.atk-modal-close').addEventListener('click', close);
        modal.querySelector('.atk-modal-cancel').addEventListener('click', close);
        const atkCancelBtn = modal.querySelector('.atk-modal-cancel');
        atkCancelBtn.addEventListener('mouseenter', () => { atkCancelBtn.style.backgroundColor = 'var(--color-accent-tint-25)'; atkCancelBtn.style.borderColor = 'var(--color-accent)'; });
        atkCancelBtn.addEventListener('mouseleave', () => { atkCancelBtn.style.backgroundColor = 'var(--color-bg-button)'; atkCancelBtn.style.borderColor = 'var(--color-border-input)'; });
        const atkOkBtn = modal.querySelector('.atk-modal-ok');
        atkOkBtn.addEventListener('mouseenter', () => { atkOkBtn.style.backgroundColor = 'var(--color-accent-muted)'; });
        atkOkBtn.addEventListener('mouseleave', () => { atkOkBtn.style.backgroundColor = 'var(--color-accent)'; });
        modal.querySelector('.atk-modal-ok').addEventListener('click', () => {
            const newType = parseInt(modal.querySelector('#atk-motion-type').value);
            const newImage = parseInt(modal.querySelector('#atk-weapon-image').value);
            system.attackMotions[index] = { type: newType, weaponImageId: newImage };
            console.debug(`Updated attackMotions[${index}]:`, system.attackMotions[index]);
            close();

            // Refresh the System 2 display
            const detailEl = document.getElementById('database-detail');
            if (detailEl) {
                detailEl.innerHTML = '';
                this.showSystem2Detail(detailEl);
            }
        });

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        this.commonUI?.databaseEditor?.registerDetailModal(overlay);
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = DatabaseSystem2Editor;
