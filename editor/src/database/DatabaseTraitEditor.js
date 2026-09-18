/**
 * DatabaseTraitEditor - Standalone trait editor for database entries
 * Used by Classes, Weapons, Armors, States, and Actors
 */

class DatabaseTraitEditor {
    constructor(databaseManager, commonUI) {
        this.databaseManager = databaseManager;
        this.commonUI = commonUI;
        this.currentEntry = null;
        this.currentTraitIndex = -1;
        this.onSaveCallback = null;
    }

    _t(text) {
        return window.I18n ? window.I18n.tText(text) : text;
    }

    /**
     * One row of a trait tab. Every row shares the same grid columns
     * (radio | label | control | prefix | value | unit) so the tabs stay
     * symmetrical whatever mix of selects and numbers a row carries.
     * A row with no dropdown puts its number (and unit) where the dropdown
     * would sit, so the control column never yawns empty.
     *
     * Every row also carries TraitHelp's sentence for its code, which
     * HoverHelp shows on rest. It rides on the row rather than the label so
     * that resting anywhere along it - radio, name, or the empty space between
     * them - explains the same thing.
     */
    _rowHTML(trait, { code, label, control = '', prefix = '', value = '', unit = '' }) {
        if (!control && value) {
            control = `<span class="rr-trait-lone-value">${value}<span class="rr-trait-unit">${unit}</span></span>`;
            value = '';
            unit = '';
        }
        const help = globalThis.TraitHelp ? globalThis.TraitHelp.rowTip(code) : '';
        const helpAttr = help ? ` data-rr-help="${rrEscapeHtml(help)}"` : '';
        return `
            <div class="trait-option rr-trait-row"${helpAttr}>
                <input type="radio" name="trait-type" value="${code}" ${trait.code === code ? 'checked' : ''}>
                <span class="rr-trait-label">${label}</span>
                <span class="rr-trait-control">${control}</span>
                <span class="rr-trait-prefix">${prefix}</span>
                <span class="rr-trait-value">${value}</span>
                <span class="rr-trait-unit">${unit}</span>
            </div>`;
    }

    _selectHTML(cssClass, code, optionsHTML) {
        return `<select class="${cssClass} database-field-value" data-code="${code}">${optionsHTML}</select>`;
    }

    _numberHTML(cssClass, code, value, extra = '') {
        return `<input type="number" class="${cssClass} database-field-value" data-code="${code}" value="${value}" ${extra}>`;
    }

    /**
     * Options for a fixed list whose entries have an explanation each. The
     * explanation rides on the option's `title`, which SelectThemingShim draws
     * as a second line under the label in the open popup and keeps as the
     * closed trigger's tooltip.
     *
     * `labels` and `hints` are both in stored-dataId order, so index is the
     * value written to the trait - the same contract ActionScopes keeps.
     */
    _hintedOptions(code, trait, labels, hints) {
        return labels.map((label, dataId) => {
            const selected = trait.code === code && trait.dataId === dataId ? ' selected' : '';
            const hint = globalThis.TraitHelp
                ? globalThis.TraitHelp.optionTip(code, dataId, hints[dataId] || '')
                : (hints[dataId] || '');
            const title = hint ? ` title="${rrEscapeHtml(hint)}"` : '';
            return `<option value="${dataId}"${title}${selected}>${rrEscapeHtml(label)}</option>`;
        }).join('');
    }

    /**
     * Show trait editor modal
     * @param {Object} entry - The database entry (class, weapon, armor, state, or actor)
     * @param {Number} traitIndex - Index of trait to edit (-1 for new trait)
     * @param {Function} onSave - Callback when trait is saved
     */
    showTraitEditorModal(entry, traitIndex = -1, onSave = null, recordType = null) {
        this.recordType = recordType;
        this._collapseSe = this._storedCollapseSe(entry, recordType);
        this._modal?.remove();
        const modalGeneration = this._modalGeneration = (this._modalGeneration || 0) + 1;
        const isCurrent = this.commonUI?.databaseEditor?.captureDetailContext?.() || (() => true);
        this.currentEntry = entry;
        this.currentTraitIndex = traitIndex;
        this.onSaveCallback = onSave;

        // Get existing trait data or create new
        const trait = traitIndex >= 0 ? { ...entry.traits[traitIndex] } : { code: 11, dataId: 1, value: 1.0 };

        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'rr-modal-overlay';
        this._modal = overlay;

        // Create modal
        const modal = document.createElement('div');
        modal.className = 'rr-modal trait-editor-modal';
        modal.style.cssText = 'width: 620px; max-width: 92vw;';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${this._t(traitIndex >= 0 ? 'Edit Trait' : 'Add Trait')}</div>
            <button class="rr-modal-close close-btn" type="button">&times;</button>
        `;

        // Tab bar
        const tabBar = document.createElement('div');
        tabBar.style.cssText = `
            display: flex;
            border-bottom: 1px solid var(--color-border-subtle);
            background: var(--color-bg-panel);
        `;

        const tabs = [
            { id: 'rates', label: 'Rates', codes: [11, 12, 13, 14] },
            { id: 'param', label: 'Param', codes: [21, 22, 23] },
            { id: 'attack', label: 'Attack', codes: [31, 32, 33, 34] },
            { id: 'skill', label: 'Skill', codes: [41, 42, 43, 44] },
            { id: 'equip', label: 'Equip', codes: [51, 52, 53, 54, 55] },
            { id: 'other', label: 'Other', codes: [61, 62, 63, 64] }
        ];

        // Determine initial active tab based on trait code
        let activeTab = 'rates';
        for (const tab of tabs) {
            if (tab.codes.includes(trait.code)) {
                activeTab = tab.id;
                break;
            }
        }

        tabs.forEach(tab => {
            const tabBtn = document.createElement('button');
            tabBtn.className = 'trait-tab';
            tabBtn.dataset.tab = tab.id;
            tabBtn.textContent = this._t(tab.label);
            tabBtn.style.cssText = `
                flex: 1;
                padding: 12px;
                background: ${tab.id === activeTab ? 'var(--color-bg-surface)' : 'transparent'};
                border: none;
                border-bottom: 2px solid ${tab.id === activeTab ? 'var(--color-accent-bright)' : 'transparent'};
                color: ${tab.id === activeTab ? 'var(--color-accent-bright)' : 'var(--color-text-muted)'};
                cursor: pointer;
                font-size: 14px;
                transition: all 0.2s;
            `;
            tabBtn.addEventListener('click', () => this.switchTab(tabBtn, tabContent, trait));
            tabBar.appendChild(tabBtn);
        });

        // Tab content container
        const tabContent = document.createElement('div');
        tabContent.className = 'rr-modal-body';
        tabContent.style.cssText = 'flex: 1; min-height: 0;';

        // Footer with buttons
        const footer = document.createElement('div');
        footer.className = 'rr-modal-footer';
        footer.innerHTML = `
            <button class="cancel-btn rr-btn-secondary">${this._t('Cancel')}</button>
            <button class="ok-btn rr-button-primary">${this._t('OK')}</button>
        `;

        // Assemble modal
        modal.appendChild(header);
        modal.appendChild(tabBar);
        modal.appendChild(tabContent);
        modal.appendChild(footer);
        overlay.appendChild(modal);

        // Event listeners
        const closeModal = () => { overlay.remove(); overlay._rrModalKeys?.leave(); };
        header.querySelector('.close-btn').addEventListener('click', closeModal);
        footer.querySelector('.cancel-btn').addEventListener('click', closeModal);
        window.RRKeyboardNavigation?.modal(overlay, { onEscape: closeModal, container: () => modal });
        window.RRKeyboardNavigation?.roving(tabBar, {
            items: () => tabBar.querySelectorAll('.trait-tab'),
            isSelected: btn => btn.style.background !== 'transparent' && btn.style.background !== '',
            select: btn => btn.click()
        });
        footer.querySelector('.ok-btn').addEventListener('click', () => {
            if (!isCurrent() || modalGeneration !== this._modalGeneration || !overlay.isConnected) return;
            const saved = this.saveTrait(trait);
            if (saved) {
                closeModal();
            }
        });
        overlay.addEventListener('click', (e) => {
            // A click on the backdrop no longer closes the dialog: an accidental
            // click beside it must never cost in-progress work. Close deliberately.
        });

        // Load initial tab content
        this.loadTabContent(activeTab, tabContent, trait);

        document.body.appendChild(overlay);
        this.commonUI?.databaseEditor?.registerDetailModal(overlay);
        if (window.I18n) window.I18n.applyText(overlay);
        overlay._rrModalKeys?.enter();
    }

    switchTab(clickedBtn, tabContent, trait) {
        // Update tab button styles
        const tabBar = clickedBtn.parentElement;
        tabBar.querySelectorAll('.trait-tab').forEach(btn => {
            const isActive = btn === clickedBtn;
            btn.style.background = isActive ? 'var(--color-bg-surface)' : 'transparent';
            btn.style.borderBottomColor = isActive ? 'var(--color-accent-bright)' : 'transparent';
            btn.style.color = isActive ? 'var(--color-accent-bright)' : 'var(--color-text-muted)';
        });

        // Load new tab content
        this.loadTabContent(clickedBtn.dataset.tab, tabContent, trait);
    }

    loadTabContent(tabId, container, trait) {
        container.innerHTML = '';

        switch (tabId) {
            case 'rates':
                this.createRatesTab(container, trait);
                break;
            case 'param':
                this.createParamTab(container, trait);
                break;
            case 'attack':
                this.createAttackTab(container, trait);
                break;
            case 'skill':
                this.createSkillTab(container, trait);
                break;
            case 'equip':
                this.createEquipTab(container, trait);
                break;
            case 'other':
                this.createOtherTab(container, trait);
                break;
        }
        if (window.I18n) window.I18n.applyText(container);
    }

    _paramOptions(code, trait) {
        return globalThis.rrParamNames(param => this._t(param))
            .map((param, idx) => `<option value="${idx}" ${trait.code === code && trait.dataId === idx ? 'selected' : ''}>${param}</option>`)
            .join('');
    }

    _stateOptions(code, trait) {
        const states = this.databaseManager.getStates() || [];
        return states.filter(s => s && s.id > 0).map(state =>
            `<option value="${state.id}" ${trait.code === code && trait.dataId === state.id ? 'selected' : ''}>${rrEscapeHtml(state.name)}</option>`
        ).join('');
    }

    _skillOptions(code, trait) {
        const skills = this.databaseManager.getSkills() || [];
        return skills.filter(s => s && s.id > 0).map(skill =>
            `<option value="${skill.id}" ${trait.code === code && trait.dataId === skill.id ? 'selected' : ''}>${rrEscapeHtml(skill.name)}</option>`
        ).join('');
    }

    createRatesTab(container, trait) {
        const elements = this.databaseManager.getSystem()?.elements || [];
        const elementOptions = code => (elements || []).filter((e, i) => i > 0 && e).map((elem, idx) =>
            `<option value="${idx + 1}" ${trait.code === code && trait.dataId === idx + 1 ? 'selected' : ''}>${rrEscapeHtml(elem)}</option>`
        ).join('');

        container.innerHTML = [
            this._rowHTML(trait, {
                code: 11, label: this._t('Element Rate'),
                control: this._selectHTML('element-select', 11, elementOptions(11)),
                value: this._numberHTML('rate-value', 11, trait.code === 11 ? Math.round(trait.value * 100) : 100),
                unit: '%'
            }),
            this._rowHTML(trait, {
                code: 12, label: this._t('Debuff Rate'),
                control: this._selectHTML('debuff-select', 12, this._paramOptions(12, trait)),
                value: this._numberHTML('rate-value', 12, trait.code === 12 ? Math.round(trait.value * 100) : 100),
                unit: '%'
            }),
            this._rowHTML(trait, {
                code: 13, label: this._t('State Rate'),
                control: this._selectHTML('state-select', 13, this._stateOptions(13, trait)),
                value: this._numberHTML('rate-value', 13, trait.code === 13 ? Math.round(trait.value * 100) : 100),
                unit: '%'
            }),
            this._rowHTML(trait, {
                code: 14, label: this._t('State Resist'),
                control: this._selectHTML('state-select', 14, this._stateOptions(14, trait))
            })
        ].join('');

        this.setupRadioInputs(container, trait);
    }

    createParamTab(container, trait) {
        const help = globalThis.TraitHelp;
        // Hit and Evasion are named on the Terms page, in terms.params 8-9; the
        // eight after them have no term slot and keep the editor's own labels.
        const exParamNames = ['Hit Rate', 'Evasion Rate', 'Critical Rate', 'Critical Evasion', 'Magic Evasion',
            'Magic Reflection', 'Counter Attack', 'HP Regeneration', 'MP Regeneration', 'TP Regeneration']
            .map(param => this._t(param));
        [exParamNames[0], exParamNames[1]] = globalThis.rrHitEvasionNames(
            ['Hit Rate', 'Evasion Rate'], param => this._t(param));
        const exParams = this._hintedOptions(22, trait, exParamNames, help ? help.exParams() : []);
        const spParams = this._hintedOptions(23, trait,
            ['Target Rate', 'Guard Effect', 'Recovery Effect', 'Pharmacology', 'MP Cost Rate', 'TP Charge Rate', 'Physical Damage', 'Magical Damage', 'Floor Damage', 'Experience']
                .map(param => this._t(param)),
            help ? help.spParams() : []);

        container.innerHTML = [
            this._rowHTML(trait, {
                code: 21, label: this._t('Parameter'),
                control: this._selectHTML('param-select', 21, this._paramOptions(21, trait)),
                value: this._numberHTML('rate-value', 21, trait.code === 21 ? Math.round(trait.value * 100) : 100),
                unit: '%'
            }),
            this._rowHTML(trait, {
                code: 22, label: this._t('Ex-Parameter'),
                control: this._selectHTML('exparam-select', 22, exParams),
                prefix: '+',
                value: this._numberHTML('rate-value', 22, trait.code === 22 ? Math.round(trait.value * 100) : 0, 'step="0.01"'),
                unit: '%'
            }),
            this._rowHTML(trait, {
                code: 23, label: this._t('Sp-Parameter'),
                control: this._selectHTML('spparam-select', 23, spParams),
                value: this._numberHTML('rate-value', 23, trait.code === 23 ? Math.round(trait.value * 100) : 100),
                unit: '%'
            })
        ].join('');

        this.setupRadioInputs(container, trait);
    }

    createAttackTab(container, trait) {
        const elements = this.databaseManager.getSystem()?.elements || [];
        const attackElementOptions = (elements || []).map((elem, idx) =>
            elem ? `<option value="${idx}" ${trait.code === 31 && trait.dataId === idx ? 'selected' : ''}>${rrEscapeHtml(elem)}</option>` : ''
        ).join('');

        container.innerHTML = [
            this._rowHTML(trait, {
                code: 31, label: this._t('Attack Element'),
                control: this._selectHTML('element-select', 31, attackElementOptions)
            }),
            this._rowHTML(trait, {
                code: 32, label: this._t('Attack State'),
                control: this._selectHTML('state-select', 32, this._stateOptions(32, trait)),
                prefix: '+',
                value: this._numberHTML('rate-value', 32, trait.code === 32 ? Math.round(trait.value * 100) : 100),
                unit: '%'
            }),
            this._rowHTML(trait, {
                code: 33, label: this._t('Attack Speed'),
                value: this._numberHTML('speed-value', 33, trait.code === 33 ? trait.value : 0, 'min="0" max="1000"')
            }),
            this._rowHTML(trait, {
                code: 34, label: this._t('Attack Times+'),
                value: this._numberHTML('times-value', 34, trait.code === 34 ? trait.value : 0, `min="0" max="${globalThis.RR_LIMITS?.ACTION_REPEATS || 100}"`)
            }),
            this._rowHTML(trait, {
                code: 35, label: this._t('Attack Skill'),
                control: this._selectHTML('skill-select', 35, this._skillOptions(35, trait))
            })
        ].join('');

        this.setupRadioInputs(container, trait);
    }

    createSkillTab(container, trait) {
        const skillTypes = this.databaseManager.getSystem()?.skillTypes || [];
        const skillTypeOptions = code => (skillTypes || []).filter((st, i) => i > 0 && st).map((type, idx) =>
            `<option value="${idx + 1}" ${trait.code === code && trait.dataId === idx + 1 ? 'selected' : ''}>${rrEscapeHtml(type)}</option>`
        ).join('');

        container.innerHTML = [
            this._rowHTML(trait, {
                code: 41, label: this._t('Add Skill Type'),
                control: this._selectHTML('skilltype-select', 41, skillTypeOptions(41))
            }),
            this._rowHTML(trait, {
                code: 42, label: this._t('Seal Skill Type'),
                control: this._selectHTML('skilltype-select', 42, skillTypeOptions(42))
            }),
            this._rowHTML(trait, {
                code: 43, label: this._t('Add Skill'),
                control: this._selectHTML('skill-select', 43, this._skillOptions(43, trait))
            }),
            this._rowHTML(trait, {
                code: 44, label: this._t('Seal Skill'),
                control: this._selectHTML('skill-select', 44, this._skillOptions(44, trait))
            })
        ].join('');

        this.setupRadioInputs(container, trait);
    }

    createEquipTab(container, trait) {
        const system = this.databaseManager.getSystem();
        const typeOptions = (types, code) => types.map((type, id) => ({ type, id })).filter(entry => entry.id > 0 && entry.type).map(entry =>
            `<option value="${entry.id}" ${trait.code === code && trait.dataId === entry.id ? 'selected' : ''}>${rrEscapeHtml(entry.type)}</option>`
        ).join('');

        container.innerHTML = [
            this._rowHTML(trait, {
                code: 51, label: this._t('Equip Weapon'),
                control: this._selectHTML('weapontype-select', 51, typeOptions(system.weaponTypes, 51))
            }),
            this._rowHTML(trait, {
                code: 52, label: this._t('Equip Armor'),
                control: this._selectHTML('armortype-select', 52, typeOptions(system.armorTypes, 52))
            }),
            this._rowHTML(trait, {
                code: 53, label: this._t('Lock Equip'),
                control: this._selectHTML('equiptype-select', 53, typeOptions(system.equipTypes, 53))
            }),
            this._rowHTML(trait, {
                code: 54, label: this._t('Seal Equip'),
                control: this._selectHTML('equiptype-select', 54, typeOptions(system.equipTypes, 54))
            }),
            this._rowHTML(trait, {
                code: 55, label: this._t('Slot Type'),
                control: this._selectHTML('slottype-select', 55, this._hintedOptions(55, trait,
                    ['Normal', 'Dual Wield'].map(label => this._t(label)),
                    globalThis.TraitHelp ? globalThis.TraitHelp.slotTypes() : []))
            })
        ].join('');

        this.setupRadioInputs(container, trait);
    }

    createOtherTab(container, trait) {
        const help = globalThis.TraitHelp;

        container.innerHTML = [
            this._rowHTML(trait, {
                code: 61, label: this._t('Action Times+'),
                value: this._numberHTML('times-value', 61, trait.code === 61 ? Math.round(trait.value * 100) : 0, 'step="0.01"'),
                unit: '%'
            }),
            this._rowHTML(trait, {
                code: 62, label: this._t('Special Flag'),
                control: this._selectHTML('specialflag-select', 62, this._hintedOptions(62, trait,
                    ['Auto Battle', 'Guard', 'Substitute', 'Preserve TP'].map(label => this._t(label)),
                    help ? help.specialFlags() : []))
            }),
            this._rowHTML(trait, {
                code: 63, label: this._t('Collapse Effect'),
                control: this._selectHTML('collapse-select', 63, this._hintedOptions(63, trait,
                    ['Normal', 'Boss', 'Instant', 'No Disappear', 'Ash', 'Ember', 'Wisp', 'Shatter'].map(label => this._t(label)),
                    help ? help.collapseEffects() : []))
            }) + this._collapseSoundHTML(),
            this._rowHTML(trait, {
                code: 64, label: this._t('Party Ability'),
                control: this._selectHTML('party-select', 64, this._hintedOptions(64, trait,
                    ['Encounter Half', 'Encounter None', 'Cancel Surprise', 'Raise Preemptive', 'Gold Double', 'Drop Item Double'].map(label => this._t(label)),
                    help ? help.partyAbilities() : []))
            })
        ].join('');

        this.setupRadioInputs(container, trait);
        this._setupCollapseSound(container);
    }

    /**
     * The sound an enemy's collapse makes, beside the effect that makes it.
     *
     * A trait is three numbers, so the choice cannot live in the trait itself:
     * it is kept with the enemy's other presentation settings and read at the
     * moment the enemy collapses. Only the Enemies page offers it, because that
     * is the record the runtime resolves the sound from; the same trait on a
     * state or a class still collapses with the engine's own sound.
     */
    _collapseSoundHTML() {
        if (this.recordType !== 'enemies') return '';
        const chosen = this._collapseSe && this._collapseSe.name;
        const label = chosen ? this._collapseSe.name : this._t('System default');
        const tip = this._t('The sound this enemy makes as it collapses.');
        // A speaker, drawn plainly enough to read at the size of the text
        // beside it, so the row is a sound before anyone reads its label.
        const speaker = '<svg class="collapse-se-icon" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">'
            + '<path d="M2 6h3l4-3.5v11L5 10H2z" fill="currentColor"></path>'
            + '<path d="M11.2 5.4a3.4 3.4 0 0 1 0 5.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path>'
            + '</svg>';
        return `
            <div class="rr-trait-row rr-trait-subrow" data-rr-help="${rrEscapeHtml(tip)}">
                <span></span>
                <span class="rr-trait-label">${rrEscapeHtml(this._t('Collapse Sound'))}</span>
                <span class="rr-trait-control">
                    <button type="button" class="collapse-se-button rr-btn-chip" title="${rrEscapeHtml(tip)}">
                        ${speaker}<span class="collapse-se-name">${rrEscapeHtml(label)}</span>
                    </button>
                </span>
                <span class="rr-trait-prefix"></span>
                <span class="rr-trait-value"></span>
                <span class="rr-trait-unit"></span>
            </div>`;
    }

    /**
     * The open project, asked for rather than remembered: DatabaseCommonUI
     * takes its copy when the editor is constructed, which is before any
     * project is open, so that copy is null for the whole session.
     */
    _projectPath() {
        const manager = this.commonUI && this.commonUI.projectManager;
        const live = manager && typeof manager.getCurrentProject === 'function' ? manager.getCurrentProject() : null;
        if (live && live.path) return live.path;
        const controller = globalThis.reactor && globalThis.reactor.projectController;
        const open = controller && (typeof controller.getCurrentProject === 'function'
            ? controller.getCurrentProject() : controller.currentProject);
        if (open && open.path) return open.path;
        return (this.commonUI && this.commonUI.currentProject && this.commonUI.currentProject.path) || '';
    }

    _storedCollapseSe(entry, recordType) {
        if (recordType !== 'enemies' || !entry) return null;
        const section = this.databaseManager?.data?.battlePresentation?.[recordType];
        const stored = section && section[entry.id] && section[entry.id].collapseSe;
        return stored ? { ...stored } : null;
    }

    _setupCollapseSound(container) {
        // Rendered into a bare container by the trait-help tests, which have no
        // query methods and no picker to open.
        if (!container || typeof container.querySelector !== 'function') return;
        const button = container.querySelector('.collapse-se-button');
        if (!button || typeof button.addEventListener !== 'function') return;
        button.addEventListener('click', event => {
            event.preventDefault();
            const projectPath = this._projectPath();
            if (!projectPath || typeof RRAudioPickerModal === 'undefined' || typeof RRAssetFiles === 'undefined') return;
            const path = require('path'), fs = require('fs');
            const folder = path.join(projectPath, 'audio', 'se');
            const current = this._collapseSe || {};
            RRAudioPickerModal.open({
                title: this._t('Collapse Sound'),
                folderLabel: 'SE',
                files: fs.existsSync(folder) ? RRAssetFiles.listUnique(folder, RRAssetFiles.AUDIO_EXTENSIONS) : [],
                selected: current.name || '',
                levels: {
                    volume: current.volume === undefined ? 90 : current.volume,
                    pitch: current.pitch === undefined ? 100 : current.pitch,
                    pan: current.pan === undefined ? 0 : current.pan
                },
                loopDefault: false,
                // Above the trait dialog's own overlay (10500), or the picker
                // opens behind the dialog that asked for it.
                zIndex: 22000,
                // Choosing nothing is how the system default is restored.
                onOk: result => {
                    this._collapseSe = result && result.name
                        ? {
                            name: result.name,
                            volume: result.volume === undefined ? 90 : result.volume,
                            pitch: result.pitch === undefined ? 100 : result.pitch,
                            pan: result.pan === undefined ? 0 : result.pan
                        }
                        : null;
                    const name = button.querySelector('.collapse-se-name') || button;
                    name.textContent = this._collapseSe ? this._collapseSe.name : this._t('System default');
                }
            });
        });
    }

    /** Keep the chosen sound with the enemy's other presentation settings. */
    _saveCollapseSe(entry) {
        if (this.recordType !== 'enemies' || !entry) return;
        const data = this.databaseManager?.data;
        if (!data || !data.battlePresentation) return;
        const presentation = data.battlePresentation;
        const section = presentation[this.recordType] || (presentation[this.recordType] = {});
        if (this._collapseSe) {
            const record = section[entry.id] || (section[entry.id] = {});
            record.collapseSe = { ...this._collapseSe };
        } else if (section[entry.id]) {
            delete section[entry.id].collapseSe;
            // An entry that held nothing but the sound goes with it.
            if (!Object.keys(section[entry.id]).length) delete section[entry.id];
        }
    }

    setupRadioInputs(container, trait) {
        const radios = container.querySelectorAll('input[type="radio"]');
        let lastChecked = null;

        // Find initially checked radio
        radios.forEach(radio => {
            if (radio.checked) {
                lastChecked = radio;
            }
        });

        // Allow deselecting radio buttons by clicking them again
        radios.forEach(radio => {
            radio.addEventListener('click', (e) => {
                // If this radio was already checked before the click
                if (radio === lastChecked) {
                    // Uncheck it
                    radio.checked = false;
                    lastChecked = null;
                    // Clear the trait code to indicate no selection
                    trait.code = null;
                    trait.dataId = 0;
                    trait.value = 0;
                } else {
                    // New selection - update lastChecked
                    lastChecked = radio;

                    // Update trait based on selection
                    const code = parseInt(radio.value);
                    trait.code = code;

                    // Find the associated inputs for this trait code
                    const selectWithCode = container.querySelector(`select[data-code="${code}"]`);
                    const inputWithCode = container.querySelector(`input[type="number"][data-code="${code}"]`);

                    // Set dataId from the select if it exists
                    if (selectWithCode) {
                        trait.dataId = parseInt(selectWithCode.value);
                    }

                    // Set default value based on trait type
                    if (code === 14 || code === 31 || code === 35 || code === 41 || code === 42 || code === 43 || code === 44 ||
                        code === 51 || code === 52 || code === 53 || code === 54 || code === 55 ||
                        code === 62 || code === 63 || code === 64) {
                        // These traits don't use value or use it as 0
                        trait.value = 0;
                    } else if (code === 33 || code === 34) {
                        // Attack Speed and Attack Times+ use direct value (not percentage)
                        trait.value = inputWithCode ? parseFloat(inputWithCode.value) : 0;
                    } else if (code === 22) {
                        // Ex-Parameter uses decimal
                        trait.value = inputWithCode ? parseFloat(inputWithCode.value) / 100 : 0;
                    } else {
                        // Most traits use percentage as decimal
                        trait.value = inputWithCode ? parseFloat(inputWithCode.value) / 100 : 1.0;
                    }
                }
            });
        });

        // Setup change listeners for selects
        container.querySelectorAll('select').forEach(select => {
            select.addEventListener('change', (e) => {
                // Only update if this select's radio is checked
                const radio = e.target.closest('.trait-option').querySelector('input[type="radio"]');
                if (radio && radio.checked) {
                    trait.dataId = parseInt(e.target.value);
                }
            });
        });

        // Setup change listeners for number inputs
        container.querySelectorAll('input[type="number"]').forEach(input => {
            input.addEventListener('input', (e) => {
                const radio = e.target.closest('.trait-option').querySelector('input[type="radio"]');
                // Only update if this input's radio is checked
                if (radio && radio.checked) {
                    const code = parseInt(radio.value);
                    if (code === 33 || code === 34) {
                        // Attack Speed and Attack Times+ use direct value.
                        trait.value = parseFloat(e.target.value) || 0;
                        if (code === 34) {
                            trait.value = Math.max(0, Math.min(globalThis.RR_LIMITS?.ACTION_REPEATS || 100, trait.value));
                            e.target.value = String(trait.value);
                        }
                    } else {
                        // Convert percentage to decimal
                        trait.value = (parseFloat(e.target.value) || 0) / 100;
                    }
                }
            });
        });
    }

    saveTrait(trait) {
        // Validate that a trait type is selected
        if (!trait.code) {
            alert(this._t('Please select a trait type before saving.'));
            return false;
        }

        if (this.currentTraitIndex >= 0) {
            // Update existing trait
            this.currentEntry.traits[this.currentTraitIndex] = trait;
        } else {
            // Add new trait
            if (!this.currentEntry.traits) {
                this.currentEntry.traits = [];
            }
            this.currentEntry.traits.push(trait);
        }

        this._saveCollapseSe(this.currentEntry);

        // Call save callback if provided
        if (this.onSaveCallback) {
            this.onSaveCallback(this.currentEntry);
        }

        return true;
    }
}
