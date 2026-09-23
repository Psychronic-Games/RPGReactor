/**
 * DatabaseClassEditor - Class-specific database editor
 * Features: General settings, parameter curves with graphs, learnable skills, traits with context menu
 */
class DatabaseClassEditor {
    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;
        this.currentClass = null;
        this.traitsClipboard = null;
        this.traitEditor = new DatabaseTraitEditor(databaseManager, commonUI);
    }

    showClassDetail(container, classEntry) {
        this.currentClass = classEntry;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display: flex; flex-direction: column; height: 100%; padding: 16px;';

        // Two-column layout
        const columnsWrapper = document.createElement('div');
        columnsWrapper.className = 'database-class-columns';

        // FIRST COLUMN
        const leftColumn = document.createElement('div');
        leftColumn.style.cssText = 'display: flex; flex-direction: column; gap: 16px; min-width: 0;';
        leftColumn.appendChild(this.createGeneralSection(classEntry));
        leftColumn.appendChild(this.createParameterCurvesSection(classEntry));
        leftColumn.appendChild(this.createLearnableSkillsSection(classEntry));

        // SECOND COLUMN
        const rightColumn = document.createElement('div');
        rightColumn.style.cssText = 'display: flex; flex-direction: column; gap: 16px; min-width: 0;';
        rightColumn.appendChild(this.createTraitsSection(classEntry));
        const passiveSection = window.RRPassiveStates?.createSection({
            objectType: 'class', record: classEntry,
            databaseManager: this.databaseManager, projectManager: this.projectManager
        });
        if (passiveSection) rightColumn.appendChild(passiveSection);
        rightColumn.appendChild(this.createNoteSection(classEntry));

        columnsWrapper.appendChild(leftColumn);
        columnsWrapper.appendChild(rightColumn);
        wrapper.appendChild(columnsWrapper);
        container.appendChild(wrapper);

        this.attachEventListeners(wrapper, classEntry);
    }

    createGeneralSection(classEntry) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.className = 'database-section';
        section.innerHTML = `
            <div class="database-section-header">${tt('General Settings')}</div>
            <div class="database-section-content">
                <div class="db-form" style="margin-bottom: 10px;">
                    <div class="db-row-cols">
                        <span class="db-col">
                            <label>${tt('Name')}</label>
                            <input type="text" class="database-field-value" value="${rrEscapeHtml(classEntry.name)}" data-field="name" data-class-id="${classEntry.id}">
                        </span>
                    </div>
                </div>
                <div class="form-row">
                    <label class="database-field-label">${tt('EXP Curve:')}</label>
                </div>
                <div class="form-row exp-curve-trigger database-class-exp-grid" data-class-id="${classEntry.id}"
                     style="display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 8px; cursor: pointer; padding: 8px; border: 1px solid transparent; border-radius: 4px;"
                     onmouseover="this.style.borderColor='var(--color-accent-bright)'; this.style.background='var(--color-bg-base)';"
                     onmouseout="this.style.borderColor='transparent'; this.style.background='transparent';"
                     title="${tt('Click to edit EXP curve')}">
                    <div>
                        <label class="database-field-label" style="font-size: 11px;">${tt('Basis:')}</label>
                        <div class="database-field-value database-field-value-small exp-basis-display"
                             style="width: 100%; text-align: center; padding: 6px;">${classEntry.expParams ? classEntry.expParams[0] : 30}</div>
                    </div>
                    <div>
                        <label class="database-field-label" style="font-size: 11px;">${tt('Extra:')}</label>
                        <div class="database-field-value database-field-value-small exp-extra-display"
                             style="width: 100%; text-align: center; padding: 6px;">${classEntry.expParams ? classEntry.expParams[1] : 20}</div>
                    </div>
                    <div>
                        <label class="database-field-label" style="font-size: 11px;">${tt('Accel A:')}</label>
                        <div class="database-field-value database-field-value-small exp-accelA-display"
                             style="width: 100%; text-align: center; padding: 6px;">${classEntry.expParams ? classEntry.expParams[2] : 30}</div>
                    </div>
                    <div>
                        <label class="database-field-label" style="font-size: 11px;">${tt('Accel B:')}</label>
                        <div class="database-field-value database-field-value-small exp-accelB-display"
                             style="width: 100%; text-align: center; padding: 6px;">${classEntry.expParams ? classEntry.expParams[3] : 30}</div>
                    </div>
                </div>
            </div>
        `;
        return section;
    }

    createNoteSection(classEntry) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.className = 'database-section';
        section.innerHTML = `
            <div class="database-section-header">${tt('Note')}</div>
            <div class="database-section-content">
                <textarea class="database-field-value" rows="4" style="width: 100%; box-sizing: border-box;" data-field="note" data-class-id="${classEntry.id}">${rrEscapeHtml(classEntry.note)}</textarea>
            </div>
        `;
        return section;
    }

    /**
     * The level this class is actually being balanced for. A class that was
     * given one keeps it in `targetLevel`; otherwise it is the highest maxLevel
     * among the actors assigned to it. Curves are STORED across the full 1..999
     * engine domain, but authoring against 999 asks the designer for a number no
     * player in their game will ever reach — a party capped at 60 got a Lv999
     * anchor and no readout of the level that mattered. Falls back to the highest
     * maxLevel anywhere in the database, then to the MZ default of 99.
     */
    _targetLevelFor(classEntry) {
        const capLevel = globalThis.RR_LIMITS?.ACTOR_LEVEL || 999;
        const clamp = value => Math.max(2, Math.min(capLevel, Math.floor(Number(value))));
        const chosen = Number(classEntry?.targetLevel);
        if (Number.isFinite(chosen) && chosen >= 2) return clamp(chosen);
        const own = this._actorsCapFor(classEntry);
        if (own !== null) return clamp(own);
        const any = this._actorsCapFor(null);
        if (any !== null) return clamp(any);
        return 99;
    }

    /**
     * The highest Max Level among the actors of a class — the level the game
     * itself stops them at — or null when no actor uses it. Passing null asks
     * across every actor in the database.
     */
    _actorsCapFor(classEntry) {
        const actors = this.databaseManager?.getActors?.() || [];
        const levels = actors
            .filter(actor => actor && (classEntry === null || actor.classId === classEntry?.id))
            .map(actor => Number(actor.maxLevel))
            .filter(level => Number.isFinite(level) && level >= 2);
        return levels.length ? Math.max(...levels) : null;
    }

    /**
     * Records the level a class is balanced for, so the curve grid and both
     * curve dialogs open on it next time. An empty value forgets the choice and
     * the class follows its actors' Max Level again; the field is absent from a
     * class that was never given one. Returns the level now in effect.
     */
    _setTargetLevel(classEntry, value) {
        if (!classEntry) return 99;
        const capLevel = globalThis.RR_LIMITS?.ACTOR_LEVEL || 999;
        const raw = String(value ?? '').trim();
        const level = Math.floor(Number(raw));
        if (raw === '' || !Number.isFinite(level) || level < 2) delete classEntry.targetLevel;
        else classEntry.targetLevel = Math.min(capLevel, level);
        this.databaseManager?.updateClass?.(classEntry.id, classEntry);
        return this._targetLevelFor(classEntry);
    }

    createParameterCurvesSection(classEntry) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.className = 'database-section';

        const paramNames = globalThis.rrParamNames(tt);
        const paramColors = ['#FF3366', '#33CCFF', '#FF9933', '#FFD700', '#9966FF', '#33FF99', '#FF66CC', '#66FFFF'];
        const params = classEntry.params || [];
        const targetLevel = this._targetLevelFor(classEntry);
        const midLevel = Math.max(2, Math.min(targetLevel - 1, Math.round((1 + targetLevel) / 2)));

        let paramsHTML = '';
        paramNames.forEach((name, idx) => {
            const values = params[idx] || [];
            const valueAt = level => globalThis.rrClassParamAtLevel?.(values, level) ?? 0;
            const level1 = valueAt(1);
            const levelMid = valueAt(midLevel);
            const levelTarget = valueAt(targetLevel);
            const canvasId = `param-curve-${classEntry.id}-${idx}`;
            const color = paramColors[idx];
            paramsHTML += `
                <div class="param-curve-cell" data-param-idx="${idx}" style="display: flex; flex-direction: column; cursor: pointer; padding: 4px; border-radius: 4px; transition: background 0.15s;" title="${tt('Click to edit')} ${name} ${tt('curve')}">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <label class="database-field-label" style="font-size: 10px; color: ${color}; font-weight: bold;">${name}</label>
                         <span style="font-size: 9px; color: var(--color-text-muted);">${tt('Lv')}1: ${level1} → ${tt('Lv')}${midLevel}: ${levelMid} → ${tt('Lv')}${targetLevel}: ${levelTarget}</span>
                    </div>
                    <canvas id="${canvasId}" width="200" height="50"
                            style="width: 100%; height: 50px; border: 1px solid var(--color-border); background: var(--color-bg-input); border-radius: 4px;"
                            data-color="${color}"></canvas>
                </div>
            `;
        });

        const capLevel = globalThis.RR_LIMITS?.ACTOR_LEVEL || 999;
        const targetHint = Number.isFinite(Number(classEntry.targetLevel))
            ? tt('The level these curves are balanced for. Clear it to follow the actors of this class again.')
            : tt('The highest Max Level among the actors of this class. Type a level to balance the curves for that instead.');
        // The target is an authoring level, not a cap: the game stops each
        // actor at its own Max Level. Say so when the curves are balanced past
        // the point any actor of this class can reach.
        const actorsCap = this._actorsCapFor(classEntry);
        const capNote = actorsCap !== null && targetLevel > actorsCap
            ? `<span class="rr-class-target-note" style="font-size: 11px; font-weight: normal; color: var(--color-text-muted); white-space: nowrap; margin-right: 8px;">${rrEscapeHtml(tt('Actors of this class stop at Lv{level}').replace('{level}', String(actorsCap)))}</span>`
            : '';
        section.innerHTML = `
            <div class="database-section-header" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span style="flex: 1 1 auto;">${tt('Parameter Curves')}</span>
                ${capNote}
                <label class="database-field-label" style="margin: 0; font-weight: normal; white-space: nowrap;">${tt('Target level')}</label>
                <input type="number" class="rr-class-target-input database-field-value" min="2" max="${capLevel}" value="${targetLevel}" title="${rrEscapeHtml(targetHint)}" style="width: 64px; text-align: center; font-weight: normal;">
            </div>
            <div class="database-section-content database-class-parameter-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px;">
                ${paramsHTML}
            </div>
        `;

        // Draw graphs after DOM is ready
        setTimeout(() => {
            if (!section.isConnected) return;
            paramNames.forEach((name, idx) => {
                const canvas = section.querySelector(`#param-curve-${classEntry.id}-${idx}`);
                if (canvas) {
                    this.drawParameterCurve(canvas, params[idx] || [], paramColors[idx], { maxLevel: targetLevel });
                }
            });

            // The target level is a class setting: it redraws every cell's
            // graph and readout, so the whole detail is rebuilt around it.
            section.querySelector('.rr-class-target-input')?.addEventListener('change', e => {
                const level = this._setTargetLevel(classEntry, e.target.value);
                this.commonUI?.updateStatus?.(`${tt('Target level')}: ${level}`);
                this.refreshClassDetail(classEntry);
            });

            // Click-to-edit on each cell
            section.querySelectorAll('.param-curve-cell').forEach(cell => {
                cell.addEventListener('mouseenter', () => {
                    cell.style.background = 'var(--color-bg-list-item)';
                });
                cell.addEventListener('mouseleave', () => {
                    cell.style.background = '';
                });
                cell.addEventListener('click', () => {
                    this.showParameterCurvesDialog(classEntry, parseInt(cell.dataset.paramIdx));
                });
            });
        }, 0);

        return section;
    }

    /** Param-specific sane bounds. HP/MP go high; other stats stay smaller. */
    _paramValueLimit(paramIdx) {
        return paramIdx <= 1 ? 99999 : 9999;
    }

    /**
     * A curve as the dialog edits it: one value per level across the whole
     * engine domain. Stock MZ arrays hold 100 entries; levels past the array
     * take the runtime's own extrapolation, so what the dialog shows at Lv120
     * is what the game already gives there.
     */
    _materializeCurve(values, capLevel) {
        const source = Array.isArray(values) ? values : [];
        const curve = new Array(capLevel + 1);
        for (let level = 1; level <= capLevel; level++) {
            curve[level] = globalThis.rrClassParamAtLevel ? globalThis.rrClassParamAtLevel(source, level) : (Number(source[level]) || 0);
        }
        curve[0] = curve[1];
        return curve;
    }

    /**
     * Parameter Curves, as RPG Maker MZ lays it out: a tab per parameter, Quick
     * Setting A–E, a Level › Value pair for one level at a time, a bar graph
     * you drag across to paint values, and Generate Curve… as a step within
     * it. The graph runs to the class's target level rather than stopping at
     * 99, and OK commits every parameter at once; Cancel discards them all.
     */
    showParameterCurvesDialog(classEntry, initialParamIdx = 0) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const capLevel = globalThis.RR_LIMITS?.ACTOR_LEVEL || 999;
        const targetLevel = this._targetLevelFor(classEntry);
        const paramNames = globalThis.rrParamNames(tt);
        const paramColors = ['#FF3366', '#33CCFF', '#FF9933', '#FFD700', '#9966FF', '#33FF99', '#FF66CC', '#66FFFF'];
        if (!classEntry.params) classEntry.params = [];
        const working = paramNames.map((_, idx) => this._materializeCurve(classEntry.params[idx], capLevel));
        const touched = new Set();
        let paramIdx = Math.max(0, Math.min(paramNames.length - 1, initialParamIdx | 0));
        let level = 1;

        const overlay = document.createElement('div');
        overlay.className = 'rr-modal-overlay';
        const modal = document.createElement('div');
        modal.className = 'rr-modal param-curves-modal';
        modal.style.cssText = 'width: 760px; max-width: 94vw; display: flex; flex-direction: column;';
        const quick = DatabaseClassEditor.QUICK_SETTINGS;
        modal.innerHTML = `
            <div class="rr-modal-header">
                <div class="rr-modal-title">${tt('Parameter Curves')}</div>
                <button class="rr-modal-close pcd-close" type="button">&times;</button>
            </div>
            <div class="pcd-tabs" role="tablist" style="display: flex; gap: 2px; padding: 8px 12px 0; border-bottom: 1px solid var(--color-border-subtle); background: var(--color-bg-panel);">
                ${paramNames.map((name, idx) => `<button type="button" class="pcd-tab" role="tab" data-param-idx="${idx}" style="padding: 6px 12px; border: 1px solid var(--color-border-subtle); border-bottom: none; border-radius: 4px 4px 0 0; background: transparent; color: var(--color-text-muted); cursor: pointer; font-size: 12px;">${name}</button>`).join('')}
            </div>
            <div class="rr-modal-body" style="display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap;">
                    <fieldset class="pcd-quick" style="margin: 0; padding: 6px 10px 8px; border: 1px solid var(--color-border-subtle); border-radius: 4px; min-width: 0;">
                        <legend style="font-size: 11px; color: var(--color-text-muted); padding: 0 4px;">${tt('Quick Setting')}</legend>
                        <div style="display: flex; gap: 4px;">
                            ${quick.names.map(name => `<button type="button" class="pcd-quick-btn rr-btn-secondary" data-quick="${name}" style="min-width: 30px; padding: 4px 0;">${name}</button>`).join('')}
                        </div>
                    </fieldset>
                    <label style="display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--color-text-muted);">${tt('Level')}
                        <input type="number" class="pcd-level database-field-value" min="1" max="${capLevel}" value="1" style="width: 84px; text-align: center;">
                    </label>
                    <span style="padding-bottom: 6px; color: var(--color-text-muted);">&gt;</span>
                    <label style="display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--color-text-muted);">${tt('Value')}
                        <input type="number" class="pcd-value database-field-value" min="1" value="1" style="width: 96px; text-align: center;">
                    </label>
                    <div style="flex: 1 1 auto;"></div>
                    <button type="button" class="pcd-generate rr-btn-secondary" style="padding: 6px 14px;">${tt('Generate Curve...')}</button>
                </div>
                <div style="position: relative; background: var(--color-bg-input); border: 1px solid var(--color-border); border-radius: 4px;">
                    <canvas class="pcd-graph" width="720" height="300" style="width: 100%; height: 300px; display: block; cursor: crosshair; touch-action: none;"></canvas>
                    <div class="pcd-readout" style="position: absolute; top: 6px; right: 10px; font-size: 11px; color: var(--color-text-muted); pointer-events: none;"></div>
                </div>
            </div>
            <div class="rr-modal-footer">
                <button type="button" class="pcd-cancel rr-btn-secondary">${tt('Cancel')}</button>
                <button type="button" class="pcd-ok rr-button-primary">${tt('OK')}</button>
            </div>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const tabs = [...modal.querySelectorAll('.pcd-tab')];
        const levelInput = modal.querySelector('.pcd-level');
        const valueInput = modal.querySelector('.pcd-value');
        const readout = modal.querySelector('.pcd-readout');
        const canvas = modal.querySelector('.pcd-graph');
        const ctx = canvas.getContext('2d');
        const lv = tt('Lv');
        const resolve = (token, fallback) => globalThis.ThemeColors?.resolve ? ThemeColors.resolve(token, fallback) : fallback;
        const PAD = { left: 44, right: 10, top: 22, bottom: 22 };

        const curve = () => working[paramIdx];
        const limit = () => this._paramValueLimit(paramIdx);
        const clampValue = value => Math.max(1, Math.min(limit(), Math.round(Number(value) || 1)));
        const setValue = (atLevel, value) => {
            curve()[atLevel] = clampValue(value);
            if (atLevel === 1) curve()[0] = curve()[1];
            touched.add(paramIdx);
        };

        // The graph's ceiling: a round number a little above the tallest bar
        // over the levels shown, held still while a drag is in progress so the
        // bars do not slide under the pointer.
        let yMax = 10;
        const fitScale = () => {
            let peak = 1;
            for (let l = 1; l <= targetLevel; l++) peak = Math.max(peak, curve()[l]);
            const raw = peak * 1.25;
            const step = Math.pow(10, Math.floor(Math.log10(raw))) / 2;
            yMax = Math.max(10, Math.ceil(raw / step) * step);
        };

        const draw = () => {
            const width = canvas.width, height = canvas.height;
            const plotW = width - PAD.left - PAD.right, plotH = height - PAD.top - PAD.bottom;
            const color = paramColors[paramIdx];
            ctx.clearRect(0, 0, width, height);
            ctx.strokeStyle = resolve('--color-border-subtle', '#333333');
            ctx.fillStyle = resolve('--color-text-muted', '#888888');
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'right';
            ctx.lineWidth = 1;
            for (let i = 0; i <= 4; i++) {
                const y = PAD.top + plotH - (plotH * i) / 4;
                ctx.beginPath(); ctx.moveTo(PAD.left, y + 0.5); ctx.lineTo(width - PAD.right, y + 0.5); ctx.stroke();
                ctx.fillText(String(Math.round((yMax * i) / 4)), PAD.left - 6, y + 3);
            }
            const barW = plotW / targetLevel;
            for (let l = 1; l <= targetLevel; l++) {
                const h = Math.max(1, (Math.min(curve()[l], yMax) / yMax) * plotH);
                ctx.fillStyle = l === level ? '#ffffff' : color;
                ctx.globalAlpha = l === level ? 1 : 0.85;
                ctx.fillRect(PAD.left + (l - 1) * barW, PAD.top + plotH - h, Math.max(1, barW - (barW > 3 ? 1 : 0)), h);
            }
            ctx.globalAlpha = 1;
            ctx.fillStyle = resolve('--color-text-muted', '#888888');
            ctx.textAlign = 'left';
            ctx.fillText(`${lv}1`, PAD.left, height - 8);
            ctx.textAlign = 'right';
            ctx.fillText(`${lv}${targetLevel}`, width - PAD.right, height - 8);
            readout.textContent = `${lv}${level}: ${curve()[level]}`;
        };

        const selectLevel = next => {
            level = Math.max(1, Math.min(capLevel, Math.floor(Number(next)) || 1));
            levelInput.value = level;
            valueInput.value = curve()[level];
            draw();
        };
        const selectParam = idx => {
            paramIdx = idx;
            tabs.forEach(tab => {
                const active = Number(tab.dataset.paramIdx) === idx;
                tab.style.background = active ? 'var(--color-bg-surface)' : 'transparent';
                tab.style.color = active ? paramColors[idx] : 'var(--color-text-muted)';
                tab.style.fontWeight = active ? 'bold' : 'normal';
                tab.setAttribute('aria-selected', active ? 'true' : 'false');
                tab.tabIndex = active ? 0 : -1;
            });
            valueInput.max = limit();
            fitScale();
            selectLevel(level);
        };

        tabs.forEach(tab => tab.addEventListener('click', () => selectParam(Number(tab.dataset.paramIdx))));
        levelInput.addEventListener('input', () => selectLevel(levelInput.value));
        valueInput.addEventListener('input', () => {
            if (valueInput.value === '') return;
            setValue(level, valueInput.value);
            fitScale();
            draw();
        });
        valueInput.addEventListener('change', () => { valueInput.value = curve()[level]; });

        // Quick Setting: a preset pair of Lv1 and target values for this
        // parameter, drawn as a straight line between them.
        modal.querySelectorAll('.pcd-quick-btn').forEach(button => {
            const preset = () => quick.presetFor(paramIdx, button.dataset.quick);
            button.addEventListener('mouseenter', () => { button.title = `${lv}1: ${preset()[0]} → ${lv}${targetLevel}: ${preset()[1]}`; });
            button.addEventListener('click', () => {
                const [lv1, lvTarget] = preset();
                working[paramIdx] = this._generateParamCurve(lv1, lvTarget, 1, capLevel + 1, targetLevel, limit());
                touched.add(paramIdx);
                fitScale();
                selectLevel(level);
            });
        });

        modal.querySelector('.pcd-generate').addEventListener('click', () => {
            this.showParameterCurveModal(classEntry, paramIdx, paramNames[paramIdx], paramColors[paramIdx], {
                values: curve(),
                onApply: values => { working[paramIdx] = values; touched.add(paramIdx); fitScale(); selectLevel(level); }
            });
        });

        // Painting: the bar under the pointer takes the pointer's height, and a
        // fast drag fills the levels it skipped with a straight run between
        // the last bar touched and this one.
        let painting = false, lastLevel = null, lastValue = null;
        const pointAt = event => {
            const rect = canvas.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
            const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
            const plotW = canvas.width - PAD.left - PAD.right, plotH = canvas.height - PAD.top - PAD.bottom;
            const l = Math.max(1, Math.min(targetLevel, Math.floor((x - PAD.left) / (plotW / targetLevel)) + 1));
            const v = clampValue(((PAD.top + plotH - y) / plotH) * yMax);
            return [l, v];
        };
        const paint = event => {
            const [l, v] = pointAt(event);
            if (lastLevel !== null && Math.abs(l - lastLevel) > 1) {
                const steps = l - lastLevel, sign = Math.sign(steps);
                for (let i = 1; i <= Math.abs(steps); i++) setValue(lastLevel + i * sign, lastValue + ((v - lastValue) * i) / Math.abs(steps));
            } else {
                setValue(l, v);
            }
            lastLevel = l; lastValue = v;
            level = l; levelInput.value = l; valueInput.value = curve()[l];
            draw();
        };
        canvas.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            painting = true; lastLevel = null; lastValue = null;
            try { canvas.setPointerCapture(event.pointerId); } catch (e) { /* synthetic pointer */ }
            paint(event);
        });
        canvas.addEventListener('pointermove', event => {
            if (painting) { paint(event); return; }
            const [l] = pointAt(event);
            readout.textContent = `${lv}${l}: ${curve()[l]}`;
        });
        const endPaint = () => { if (!painting) return; painting = false; fitScale(); draw(); };
        canvas.addEventListener('pointerup', endPaint);
        canvas.addEventListener('pointercancel', endPaint);
        canvas.addEventListener('pointerleave', () => { if (!painting) draw(); });

        const close = () => { overlay.remove(); overlay._rrModalKeys?.leave(); };
        modal.querySelector('.pcd-close').addEventListener('click', close);
        modal.querySelector('.pcd-cancel').addEventListener('click', close);
        modal.querySelector('.pcd-ok').addEventListener('click', () => {
            touched.forEach(idx => { classEntry.params[idx] = working[idx].slice(); });
            if (touched.size) {
                this.databaseManager.updateClass(classEntry.id, classEntry);
                this.commonUI?.updateStatus?.(`${tt('Parameter Curves')} ${tt('updated')}`);
            }
            close();
            if (touched.size) this.refreshClassDetail(classEntry);
        });
        window.RRKeyboardNavigation?.modal(overlay, { onEscape: close, container: () => modal });
        window.RRKeyboardNavigation?.roving(modal.querySelector('.pcd-tabs'), {
            items: () => tabs,
            isSelected: tab => tab.getAttribute('aria-selected') === 'true',
            select: tab => tab.click()
        });

        selectParam(paramIdx);
    }

    /**
     * Generate-Curve modal for a single parameter: user picks the Lv1 value, a
     * target level, the value at that target level, and a curve shape
     * (exponent). The editor still writes the full 1..999 array the runtime
     * reads — the target level only decides where the second anchor sits and
     * how far the preview plots, so the numbers on screen are levels the game
     * will actually reach. Levels past the target continue the same curve
     * rather than flat-lining, so raising an actor's maxLevel later still has
     * sensible values waiting. Legacy 100-entry MZ arrays seed the anchor from
     * the runtime's linear extrapolation, so opening and applying without
     * touching anything keeps the curve the game was already playing.
     */
    showParameterCurveModal(classEntry, paramIdx, paramName, color, options = {}) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const capLevel = globalThis.RR_LIMITS?.ACTOR_LEVEL || 999;
        if (!classEntry.params) classEntry.params = [];
        if (!Array.isArray(classEntry.params[paramIdx]) || classEntry.params[paramIdx].length < 100) {
            const source = classEntry.params[paramIdx] || [];
            const seed = source.find(value => Number.isFinite(Number(value))) ?? 1;
            classEntry.params[paramIdx] = new Array(100).fill(Number(seed));
        }
        // Opened from the Parameter Curves dialog, the generator works on that
        // dialog's working copy and hands the result back through onApply;
        // nothing reaches the class until that dialog's OK.
        const current = Array.isArray(options.values) ? options.values : classEntry.params[paramIdx];

        const maxAllowed = this._paramValueLimit(paramIdx);
        const targetLevel = this._targetLevelFor(classEntry);
        const initialLv1 = Number.isFinite(Number(current[1])) ? Number(current[1]) : 1;
        const initialLvMax = globalThis.rrClassParamAtLevel?.(current, targetLevel) ?? initialLv1;
        // Best-fit exponent from existing curve so the slider starts where the curve already lives.
        const initialExponent = this._inferCurveExponent(current, targetLevel);

        let lv1 = initialLv1;
        let lvMax = Math.max(1, Math.min(maxAllowed, initialLvMax));
        let exponent = initialExponent;
        let workingValues = current.slice();

        const recompute = () => {
            workingValues = this._generateParamCurve(lv1, lvMax, exponent, capLevel + 1, targetLevel, maxAllowed);
            redraw();
        };

        const overlay = document.createElement('div');
        overlay.className = 'rr-modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'rr-modal param-curve-modal';
        modal.style.cssText = 'width: 560px; max-width: 92vw;';

        modal.innerHTML = `
            <div class="rr-modal-header">
                <div class="rr-modal-title">${tt('Generate Curve')} &mdash; <span style="color: ${color};">${paramName}</span></div>
                <button class="rr-modal-close rr-param-curve-close" type="button">&times;</button>
            </div>

            <div class="rr-modal-body">
                <div style="display: grid; grid-template-columns: 110px 1fr 80px; gap: 12px; align-items: center;">
                    <label style="font-size: 12px; color: var(--color-text-muted);">${tt('Level 1 value')}</label>
                    <input type="range" class="rr-pc-lv1-slider rr-range" min="1" max="${maxAllowed}" value="${lv1}">
                    <input type="number" class="rr-pc-lv1-input database-field-value" min="1" max="${maxAllowed}" value="${lv1}">
                </div>

                <div style="display: grid; grid-template-columns: 110px 1fr 80px; gap: 12px; align-items: center;">
                    <label style="font-size: 12px; color: var(--color-text-muted);">${tt('Target level')}</label>
                    <span class="rr-pc-target-hint" style="grid-column: 2 / span 2; font-size: 11px; color: var(--color-text-muted);"></span>
                </div>

                <div style="display: grid; grid-template-columns: 110px 1fr 80px; gap: 12px; align-items: center;">
                    <label style="font-size: 12px; color: var(--color-text-muted);">${tt('Value at target level')}</label>
                    <input type="range" class="rr-pc-lvmax-slider rr-range" min="1" max="${maxAllowed}" value="${lvMax}">
                    <input type="number" class="rr-pc-lvmax-input database-field-value" min="1" max="${maxAllowed}" value="${lvMax}">
                </div>

                <div style="display: grid; grid-template-columns: 110px 1fr 80px; gap: 12px; align-items: center;">
                    <label style="font-size: 12px; color: var(--color-text-muted);">${tt('Curve shape')}</label>
                    <input type="range" class="rr-pc-shape-slider rr-range" min="30" max="300" value="${Math.round(exponent * 100)}">
                    <div class="rr-pc-shape-label" style="font-size: 11px; text-align: center; color: var(--color-text); background: var(--color-bg-input-alt); padding: 4px 6px; border: 1px solid var(--color-border-input); border-radius: 3px;"></div>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--color-text-muted); margin-top: -10px; padding-left: 122px; padding-right: 92px;">
                    <span>${tt('Fast early')}</span>
                    <span>${tt('Linear')}</span>
                    <span>${tt('Slow early')}</span>
                </div>

                <div style="background: var(--color-bg-input); border: 1px solid var(--color-border); border-radius: 4px; padding: 8px;">
                    <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--color-text-muted); margin-bottom: 4px;">
                        <span>${tt('Preview')}</span>
                        <span class="rr-pc-readout"></span>
                    </div>
                    <canvas class="rr-pc-preview" width="520" height="180" style="width: 100%; height: 180px; display: block;"></canvas>
                </div>
            </div>

            <div class="rr-modal-footer">
                <button class="rr-pc-cancel rr-btn-secondary">${tt('Cancel')}</button>
                <button class="rr-pc-apply rr-button-primary">${tt('Apply')}</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        this.commonUI?.databaseEditor?.registerDetailModal(overlay);

        const previewCanvas = modal.querySelector('.rr-pc-preview');
        const readout = modal.querySelector('.rr-pc-readout');
        const shapeLabel = modal.querySelector('.rr-pc-shape-label');
        const targetHint = modal.querySelector('.rr-pc-target-hint');

        const redraw = () => {
            // Fixed Y-axis anchored at 0 so the visual scale stays absolute
            // (auto-fit would mirror rising vs falling curves of the same shape).
            const yMax = Math.max(lv1, lvMax, 1);
            this.drawParameterCurve(previewCanvas, workingValues, color, { min: 0, max: yMax, maxLevel: targetLevel });
            const level = tt('Lv');
            const at = lvl => globalThis.rrClassParamAtLevel?.(workingValues, lvl) ?? workingValues[Math.min(lvl, workingValues.length - 1)];
            const midLevel = Math.max(2, Math.min(targetLevel - 1, Math.round((1 + targetLevel) / 2)));
            readout.textContent = `${level}1: ${at(1)}  ${level}${midLevel}: ${at(midLevel)}  ${level}${targetLevel}: ${at(targetLevel)}`;
            targetHint.textContent = `${level}1 – ${level}${targetLevel}`;
            shapeLabel.textContent = exponent === 1 ? tt('Linear') : exponent.toFixed(2);
        };

        // Wire up inputs
        const lv1Slider = modal.querySelector('.rr-pc-lv1-slider');
        const lv1Input  = modal.querySelector('.rr-pc-lv1-input');
        const lvMaxSlider = modal.querySelector('.rr-pc-lvmax-slider');
        const lvMaxInput  = modal.querySelector('.rr-pc-lvmax-input');
        const shapeSlider = modal.querySelector('.rr-pc-shape-slider');

        const syncLv1 = (v) => { lv1 = Math.max(1, Math.min(maxAllowed, parseInt(v) || 1)); lv1Slider.value = lv1; lv1Input.value = lv1; recompute(); };
        const syncLvMax = (v) => { lvMax = Math.max(1, Math.min(maxAllowed, parseInt(v) || 1)); lvMaxSlider.value = lvMax; lvMaxInput.value = lvMax; recompute(); };
        const syncShape = (v) => { exponent = (parseInt(v) || 100) / 100; recompute(); };

        lv1Slider.addEventListener('input', e => syncLv1(e.target.value));
        lv1Input.addEventListener('input', e => syncLv1(e.target.value));
        lvMaxSlider.addEventListener('input', e => syncLvMax(e.target.value));
        lvMaxInput.addEventListener('input', e => syncLvMax(e.target.value));
        shapeSlider.addEventListener('input', e => syncShape(e.target.value));

        const close = () => overlay.remove();
        modal.querySelector('.rr-param-curve-close').addEventListener('click', close);
        modal.querySelector('.rr-pc-cancel').addEventListener('click', close);
        modal.querySelector('.rr-pc-apply').addEventListener('click', () => {
            if (typeof options.onApply === 'function') {
                options.onApply(workingValues.slice());
                close();
                return;
            }
            classEntry.params[paramIdx] = workingValues.slice();
            this.databaseManager.updateClass(classEntry.id, classEntry);
            this.commonUI.updateStatus(`${paramName} ${tt('curve updated')}`);
            close();
            // Redraw the mini curve in the section. The target is the class's
            // own, set in the Parameter Curves header, so the cell and its
            // seven neighbours already agree on the level.
            const cellTarget = targetLevel;
            const mini = document.getElementById(`param-curve-${classEntry.id}-${paramIdx}`);
            if (mini) this.drawParameterCurve(mini, classEntry.params[paramIdx], color, { maxLevel: cellTarget });
            // Refresh the Lv1/mid/target readout span next to the param name
            const cell = mini ? mini.closest('.param-curve-cell') : null;
            const readoutSpan = cell ? cell.querySelector('span') : null;
            if (readoutSpan) {
                const at = lvl => globalThis.rrClassParamAtLevel?.(workingValues, lvl) ?? workingValues[Math.min(lvl, workingValues.length - 1)];
                const midLevel = Math.max(2, Math.min(cellTarget - 1, Math.round((1 + cellTarget) / 2)));
                readoutSpan.textContent = `${tt('Lv')}1: ${at(1)} → ${tt('Lv')}${midLevel}: ${at(midLevel)} → ${tt('Lv')}${cellTarget}: ${at(cellTarget)}`;
            }
        });
        // A click on the backdrop no longer closes the dialog: close deliberately.

        recompute();
    }

    /**
     * Generate a length-`count` parameter curve that passes through lvEnd at
     * `targetLevel`, using value(t) = lv1 + (lvEnd - lv1) * t^exponent with
     * t = (level-1)/(targetLevel-1). Exponent < 1 = fast early growth,
     * = 1 linear, > 1 slow early / fast late.
     *
     * The array is still filled to `count`, so the stored curve covers the
     * whole engine domain whatever the target is. Past the target, t exceeds 1
     * and the same curve simply continues — a designer capping at 60 gets
     * plausible values at 61+ instead of a flat line, should an actor's
     * maxLevel ever be raised. `targetLevel` defaults to the last level in the
     * array, which is the pre-target-level behaviour. `limit` caps that tail at
     * the same ceiling the dialog allows for the anchor: with a target of 40 and
     * a steep exponent, t reaches ~25 by Lv999 and an uncapped cubic would write
     * millions into the array.
     */
    _generateParamCurve(lv1, lvEnd, exponent, count, targetLevel, limit) {
        // Params arrays are indexed BY LEVEL: [level] for level 1..lastLevel,
        // with [0] an unread placeholder. The old 0-based mapping put the
        // Lv1 value in the placeholder and read every level one step low.
        const out = new Array(count);
        const lastLevel = Math.max(2, count - 1);
        const anchorLevel = Math.max(2, Math.min(lastLevel, Math.floor(Number(targetLevel) || lastLevel)));
        const ceiling = Number.isFinite(Number(limit)) ? Number(limit) : Infinity;
        for (let level = 1; level < count; level++) {
            const t = (level - 1) / (anchorLevel - 1);
            const v = lv1 + (lvEnd - lv1) * Math.pow(t, exponent);
            out[level] = Math.min(ceiling, Math.max(1, Math.round(v)));
        }
        out[0] = out[1]; // placeholder mirrors Lv1, like MZ writes it
        return out;
    }

    /**
     * Reverse-fit an exponent from an existing curve so the modal opens with a
     * slider position that roughly matches the saved shape. Samples the
     * midpoint of the authoring domain — the target level when one is given,
     * otherwise whatever domain the array actually stores (100-entry MZ arrays
     * and full 1000-entry Reactor arrays alike).
     */
    _inferCurveExponent(values, targetLevel) {
        if (!values || values.length < 3) return 1;
        const capLevel = globalThis.RR_LIMITS?.ACTOR_LEVEL || 999;
        const requested = Math.floor(Number(targetLevel) || capLevel);
        const lastLevel = Math.max(2, Math.min(values.length - 1, capLevel, requested));
        const lv1 = Number(values[1]);
        const lvEnd = Number(values[lastLevel]);
        if (!Number.isFinite(lv1) || !Number.isFinite(lvEnd) || lvEnd === lv1) return 1;
        // The curve parameter is t = (level-1)/(lastLevel-1), so the level where
        // t is exactly 0.5 is 1 + (lastLevel-1)/2 — NOT (1+lastLevel)/2. Those
        // agree whenever lastLevel is odd, which every domain used to be (999,
        // and 99 for legacy arrays), so the old form was right by luck. At an
        // even target such as 60 it samples t = 0.508 while solving as if it
        // were 0.5, and the fit comes back ~3% low: reopening the dialog and
        // pressing Apply then quietly rebalanced the class. Solve at the t the
        // sample actually sits on instead.
        const midLevel = Math.round(1 + (lastLevel - 1) / 2);
        const mid = Number(values[midLevel]);
        if (!Number.isFinite(mid)) return 1;
        const t = (midLevel - 1) / (lastLevel - 1);
        if (!(t > 0) || t >= 1) return 1;
        // mid = lv1 + (lvEnd - lv1) * t^exponent  =>  t^exponent = (mid-lv1)/(lvEnd-lv1)
        const ratio = (mid - lv1) / (lvEnd - lv1);
        if (ratio <= 0 || ratio >= 1) return 1;
        const exp = Math.log(ratio) / Math.log(t);
        return Math.max(0.3, Math.min(3.0, exp));
    }

    /**
     * Plot the parameter across the 1..maxLevel domain — the same series the
     * game computes: stored values where the array has them, linear
     * extrapolation at the final slope beyond. The authored region draws solid;
     * an extrapolated tail (legacy 100-entry MZ arrays) draws dashed and dimmer
     * past a faint divider so it reads as "projected".
     *
     * @param {Object} [options] - { min, max } to lock the Y-axis (used by the
     *   Generate Curve preview so the visual scale stays absolute and curves
     *   don't appear "mirrored" between rising vs falling configs). When omitted,
     *   the canvas auto-fits the values (used by the mini-curve thumbnails).
     *   { maxLevel } plots only up to that level instead of the engine cap, so
     *   a class balanced for Lv60 fills the width with the levels that exist
     *   rather than squeezing them into the first 6% of the canvas.
     */
    drawParameterCurve(canvas, values, color, options) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        if (!values || values.length === 0) return;

        const capLevel = globalThis.RR_LIMITS?.ACTOR_LEVEL || 999;
        const plotLevel = Math.max(2, Math.min(capLevel, Math.floor(Number(options?.maxLevel) || capLevel)));
        let authoredLevel = Math.min(values.length - 1, plotLevel);
        while (authoredLevel > 1 && !Number.isFinite(Number(values[authoredLevel]))) authoredLevel--;
        if (!Number.isFinite(Number(values[authoredLevel]))) return;

        const series = new Array(plotLevel);
        for (let level = 1; level <= plotLevel; level++) {
            series[level - 1] = globalThis.rrClassParamAtLevel
                ? globalThis.rrClassParamAtLevel(values, level)
                : Number(values[Math.min(level, authoredLevel)]) || 0;
        }
        const splitIndex = authoredLevel - 1;

        // Find min/max for scaling
        const hasBounds = Number.isFinite(Number(options?.min)) && Number.isFinite(Number(options?.max));
        const min = hasBounds ? Number(options.min) : Math.min(...series);
        const max = hasBounds ? Number(options.max) : Math.max(...series);
        const range = max - min || 1;
        const xAt = index => (index / Math.max(1, plotLevel - 1)) * width;
        const yAt = value => height - ((value - min) / range) * (height - 6) - 3;

        // Draw gradient fill under curve
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, color + '80'); // Semi-transparent at top
        gradient.addColorStop(1, color + '00'); // Fully transparent at bottom

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(0, height);
        series.forEach((value, index) => ctx.lineTo(xAt(index), yAt(value)));
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fill();

        // Authored region: bright solid curve
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        for (let index = 0; index <= splitIndex; index++) {
            if (index === 0) ctx.moveTo(xAt(index), yAt(series[index]));
            else ctx.lineTo(xAt(index), yAt(series[index]));
        }
        ctx.stroke();

        // Extrapolated tail: dashed, dimmer, behind a faint divider tick
        if (splitIndex < plotLevel - 1) {
            const splitX = xAt(splitIndex);
            ctx.shadowBlur = 0;
            ctx.save();
            ctx.strokeStyle = color + '55';
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(splitX, 0);
            ctx.lineTo(splitX, height);
            ctx.stroke();

            ctx.globalAlpha = 0.65;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            for (let index = splitIndex; index < plotLevel; index++) {
                if (index === splitIndex) ctx.moveTo(xAt(index), yAt(series[index]));
                else ctx.lineTo(xAt(index), yAt(series[index]));
            }
            ctx.stroke();
            ctx.restore();
        }

        // Reset shadow
        ctx.shadowBlur = 0;
    }

    createLearnableSkillsSection(classEntry) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.className = 'database-section';
        section.setAttribute('tabindex', '0');
        section.style.outline = 'none';

        const skills = this.databaseManager.getSkills();
        const learningsHTML = classEntry.learnings && classEntry.learnings.length > 0 ?
            classEntry.learnings.map((learning, index) => {
                const skill = skills.find(s => s && s.id === learning.skillId);
                const skillName = skill ? skill.name : `${tt('Skill')} #${learning.skillId}`;
                return `
                    <tr class="learning-row trait-row" data-learning-index="${index}" style="cursor: pointer;">
                        <td class="learning-indicator"></td>
                        <td style="width: 60px; text-align: center;">${learning.level}</td>
                        <td>${rrEscapeHtml(skillName)}</td>
                        <td style="color: var(--color-text-muted); font-size: 11px;">${rrEscapeHtml(learning.note || '')}</td>
                    </tr>
                `;
            }).join('') :
            `<tr><td colspan="4" style="text-align: center; color: var(--color-text-muted);">${tt('No skills learned')}</td></tr>`;

        section.innerHTML = `
            <div class="database-section-header">${tt('Learnable Skills')}</div>
            <div class="database-section-content">
                <table class="traits-table learnings-table">
                    <thead>
                        <tr>
                            <th class="trait-indicator-heading"></th>
                            <th>${tt('Level')}</th>
                            <th>${tt('Skill')}</th>
                            <th>${tt('Note')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${learningsHTML}
                    </tbody>
                </table>
                <div class="learning-action-buttons">
                    <button class="learning-btn-add rr-btn-chip">${tt('Add')}</button>
                    <button class="learning-btn-edit rr-btn-chip" disabled>${tt('Edit')}</button>
                    <button class="learning-btn-delete rr-btn-chip" disabled>${tt('Delete')}</button>
                </div>
            </div>
        `;

        setTimeout(() => {
            if (!section.isConnected) return;
            const table = section.querySelector('.learnings-table');
            if (!table) return;
            this.setupLearningInteraction(section, table, classEntry);
            this.setupLearningActionButtons(section, table, classEntry);
            this.setupLearningKeyboardShortcuts(section, table, classEntry);
            this.updateLearningButtonStates(section, table);
        }, 0);
        return section;
    }

    setupLearningInteraction(section, table, classEntry) {
        const rows = table.querySelectorAll('.learning-row');
        rows.forEach(row => {
            row.addEventListener('click', () => {
                rows.forEach(other => other.classList.remove('selected'));
                row.classList.add('selected');
                section.focus();
                this.updateLearningButtonStates(section, table);
            });
            row.addEventListener('dblclick', () => {
                this.editLearning(classEntry, parseInt(row.dataset.learningIndex));
            });
        });
    }

    setupLearningActionButtons(section, table, classEntry) {
        section.querySelector('.learning-btn-add').addEventListener('click', () => this.addLearning(classEntry));
        section.querySelector('.learning-btn-edit').addEventListener('click', () => {
            const index = this.getSelectedLearningIndex(table);
            if (index !== null) this.editLearning(classEntry, index);
        });
        section.querySelector('.learning-btn-delete').addEventListener('click', () => {
            const index = this.getSelectedLearningIndex(table);
            if (index !== null) this.deleteLearning(classEntry, index);
        });
    }

    getSelectedLearningIndex(table) {
        const selected = table.querySelector('.learning-row.selected');
        return selected ? parseInt(selected.dataset.learningIndex) : null;
    }

    updateLearningButtonStates(section, table) {
        const enabled = this.getSelectedLearningIndex(table) !== null;
        for (const selector of ['.learning-btn-edit', '.learning-btn-delete']) {
            const button = section.querySelector(selector);
            button.disabled = !enabled;
        }
    }

    setupLearningKeyboardShortcuts(section, table, classEntry) {
        section.addEventListener('keydown', event => {
            if (event.target !== section) return;
            const index = this.getSelectedLearningIndex(table);
            if (index === null || (event.key !== 'Enter' && event.key !== 'Delete')) return;
            event.preventDefault();
            event.stopPropagation();
            if (event.key === 'Enter') this.editLearning(classEntry, index);
            else this.deleteLearning(classEntry, index);
        });
    }

    addLearning(classEntry) {
        this.showLearningEditorModal(classEntry, -1);
    }

    editLearning(classEntry, learningIndex) {
        if (!classEntry.learnings?.[learningIndex]) return;
        this.showLearningEditorModal(classEntry, learningIndex);
    }

    deleteLearning(classEntry, learningIndex) {
        if (!classEntry.learnings?.[learningIndex]) return;
        classEntry.learnings.splice(learningIndex, 1);
        this.databaseManager.updateClass(classEntry.id, classEntry);
        this.refreshClassDetail(classEntry);
    }

    showLearningEditorModal(classEntry, learningIndex) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const existing = learningIndex >= 0 ? classEntry.learnings?.[learningIndex] : null;
        const firstSkill = (this.databaseManager.getSkills() || []).find(skill => skill && skill.id > 0);
        const draft = existing
            ? { level: existing.level, skillId: existing.skillId, note: existing.note || '' }
            : { level: 1, skillId: firstSkill?.id || 1, note: '' };
        const skills = this.databaseManager.getSkills() || [];
        const skillOptions = skills.filter(skill => skill && skill.id > 0).map(skill =>
            `<option value="${skill.id}" ${skill.id === draft.skillId ? 'selected' : ''}>#${skill.id} ${rrEscapeHtml(skill.name || '')}</option>`
        ).join('');

        const overlay = document.createElement('div');
        overlay.className = 'rr-modal-overlay';
        const modal = document.createElement('div');
        modal.className = 'rr-modal';
        modal.style.cssText = 'width: 440px; max-width: 90vw;';
        modal.innerHTML = `
            <div class="rr-modal-header">
                <div class="rr-modal-title">${tt(existing ? 'Edit Learnable Skill' : 'Add Learnable Skill')}</div>
                <button class="rr-modal-close learning-edit-close" type="button">&times;</button>
            </div>
            <div class="rr-modal-body">
                <div class="db-form">
                    <label>${tt('Level')}</label>
                    <input class="database-field-value learning-edit-level" type="number" min="1" max="${globalThis.RR_LIMITS?.ACTOR_LEVEL || 999}" value="${draft.level}">
                    <label>${tt('Skill')}</label>
                    <select class="database-field-value learning-edit-skill">${skillOptions}</select>
                    <label>${tt('Note')}</label>
                    <textarea class="database-field-value learning-edit-note" rows="3">${rrEscapeHtml(draft.note)}</textarea>
                </div>
            </div>
            <div class="rr-modal-footer">
                <button class="learning-edit-cancel rr-btn-secondary">${tt('Cancel')}</button>
                <button class="learning-edit-ok rr-button-primary">${tt('OK')}</button>
            </div>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        this.commonUI?.databaseEditor?.registerDetailModal(overlay);

        const close = () => overlay.remove();
        modal.querySelector('.learning-edit-close').addEventListener('click', close);
        modal.querySelector('.learning-edit-cancel').addEventListener('click', close);
        // A click on the backdrop no longer closes the dialog: close deliberately.
        modal.querySelector('.learning-edit-ok').addEventListener('click', () => {
            const maxLevel = globalThis.RR_LIMITS?.ACTOR_LEVEL || 999;
            draft.level = Math.max(1, Math.min(maxLevel, parseInt(modal.querySelector('.learning-edit-level').value) || 1));
            draft.skillId = parseInt(modal.querySelector('.learning-edit-skill').value) || draft.skillId;
            draft.note = modal.querySelector('.learning-edit-note').value;
            if (!classEntry.learnings) classEntry.learnings = [];
            if (learningIndex >= 0) classEntry.learnings[learningIndex] = draft;
            else classEntry.learnings.push(draft);
            this.databaseManager.updateClass(classEntry.id, classEntry);
            close();
            this.refreshClassDetail(classEntry);
        });
    }

    createTraitsSection(classEntry) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.className = 'database-section';
        section.setAttribute('data-class-id', classEntry.id);
        section.setAttribute('tabindex', '0');
        section.style.outline = 'none';

        const traitsHTML = classEntry.traits && classEntry.traits.length > 0 ?
            classEntry.traits.map((trait, index) => `
                <tr class="trait-row" data-trait-index="${index}" data-class-id="${classEntry.id}"
                    style="cursor: pointer; transition: all 0.15s ease;">
                    <td class="trait-indicator" style="width: 3px; padding: 0; border: none; background: transparent;"></td>
                    <td>${rrEscapeHtml(this.commonUI.getTraitName(trait.code))}</td>
                    <td>${this.commonUI.getTraitValueHtml(trait)}</td>
                </tr>
            `).join('') :
            `<tr><td colspan="3" style="text-align: center; color: var(--color-text-muted);">${tt('No traits')}</td></tr>`;

        section.innerHTML = `
            <div class="database-section-header">${tt('Traits')}</div>
            <div class="database-section-content">
                <table class="traits-table" id="traits-table-${classEntry.id}">
                    <thead>
                        <tr>
                            <th class="trait-indicator-heading" aria-hidden="true"></th><th scope="col">${tt('Type')}</th>
                            <th>${tt('Content')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${traitsHTML}
                    </tbody>
                </table>
                <div class="trait-action-buttons">
                    <button class="trait-btn-add rr-btn-chip">${tt('Add')}</button>
                    <button class="trait-btn-edit rr-btn-chip" disabled>${tt('Edit')}</button>
                    <button class="trait-btn-copy rr-btn-chip" disabled>${tt('Copy')}</button>
                    <button class="trait-btn-paste rr-btn-chip">${tt('Paste')}</button>
                    <button class="trait-btn-delete rr-btn-chip" disabled>${tt('Delete')}</button>
                </div>
            </div>
        `;

        // Add context menu handling and interaction effects
        setTimeout(() => {
            if (!section.isConnected) return;
            const table = section.querySelector('.traits-table');
            if (table) {
                this.setupTraitsContextMenu(table, classEntry);
                this.setupTraitInteraction(table);
                this.setupTraitActionButtons(section, table, classEntry);
                this.setupTraitKeyboardShortcuts(section, table, classEntry);
            }
        }, 0);

        return section;
    }

    setupTraitInteraction(table) {
        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        const rows = tbody.querySelectorAll('.trait-row');

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            const indicator = row.querySelector('.trait-indicator');
            const contentCells = Array.from(cells).slice(1); // All cells except indicator

            // Hover effect
            row.addEventListener('mouseenter', () => {
                if (indicator) {
                    indicator.style.setProperty('background-color', 'var(--color-accent-bright)', 'important');
                }
                contentCells.forEach(cell => {
                    cell.style.setProperty('background-color', 'var(--color-bg-selected)', 'important');
                });
            });

            row.addEventListener('mouseleave', () => {
                if (!row.classList.contains('trait-selected')) {
                    if (indicator) {
                        indicator.style.setProperty('background-color', 'transparent', 'important');
                    }
                    contentCells.forEach(cell => {
                        cell.style.setProperty('background-color', '', 'important');
                    });
                }
            });

            // Click to select
            row.addEventListener('click', (e) => {
                // Don't trigger if right-clicking (context menu)
                if (e.button !== 0) return;

                // Deselect all other rows
                rows.forEach(r => {
                    r.classList.remove('trait-selected');
                    if (!r.matches(':hover')) {
                        const rIndicator = r.querySelector('.trait-indicator');
                        if (rIndicator) {
                            rIndicator.style.setProperty('background-color', 'transparent', 'important');
                        }
                        const rContentCells = Array.from(r.querySelectorAll('td')).slice(1);
                        rContentCells.forEach(cell => {
                            cell.style.setProperty('background-color', '', 'important');
                        });
                    }
                });

                // Select this row
                row.classList.add('trait-selected');
                if (indicator) {
                    indicator.style.setProperty('background-color', 'var(--color-accent-bright)', 'important');
                }
                contentCells.forEach(cell => {
                    cell.style.setProperty('background-color', 'var(--color-bg-selected)', 'important');
                });

                // Focus the section so keyboard shortcuts work here
                const section = table.closest('.database-section');
                if (section) section.focus();

                // Update action button states
                this.updateTraitButtonStates(section);
            });

            // Double-click to edit
            row.addEventListener('dblclick', () => {
                const traitIndex = parseInt(row.dataset.traitIndex);
                const classId = parseInt(row.dataset.classId);
                const classEntry = this.databaseManager.getClass(classId);
                if (classEntry) {
                    this.editTrait(classEntry, traitIndex);
                }
            });
        });
    }

    setupTraitActionButtons(section, table, entry) {
        const btnAdd = section.querySelector('.trait-btn-add');
        const btnEdit = section.querySelector('.trait-btn-edit');
        const btnCopy = section.querySelector('.trait-btn-copy');
        const btnPaste = section.querySelector('.trait-btn-paste');
        const btnDelete = section.querySelector('.trait-btn-delete');

        btnAdd.addEventListener('click', () => this.addTrait(entry));
        btnEdit.addEventListener('click', () => {
            const idx = this.getSelectedTraitIndex(table);
            if (idx !== null) this.editTrait(entry, idx);
        });
        btnCopy.addEventListener('click', () => {
            const idx = this.getSelectedTraitIndex(table);
            if (idx !== null) {
                this.copyTrait(entry, idx);
                this.updateTraitButtonStates(section);
            }
        });
        btnPaste.addEventListener('click', () => {
            const idx = this.getSelectedTraitIndex(table);
            this.pasteTrait(entry, idx);
        });
        btnDelete.addEventListener('click', () => {
            const idx = this.getSelectedTraitIndex(table);
            if (idx !== null) this.deleteTrait(entry, idx);
        });
    }

    getSelectedTraitIndex(table) {
        const selected = table.querySelector('.trait-row.trait-selected');
        return selected ? parseInt(selected.dataset.traitIndex) : null;
    }

    updateTraitButtonStates(section) {
        if (!section) return;
        const table = section.querySelector('.traits-table');
        const hasSelection = table && table.querySelector('.trait-row.trait-selected');

        const setBtn = (btn, enabled) => {
            if (btn) btn.disabled = !enabled;
        };

        setBtn(section.querySelector('.trait-btn-edit'), hasSelection);
        setBtn(section.querySelector('.trait-btn-copy'), hasSelection);
        setBtn(section.querySelector('.trait-btn-paste'), true);
        setBtn(section.querySelector('.trait-btn-delete'), hasSelection);
    }

    setupTraitKeyboardShortcuts(section, table, entry) {
        section.addEventListener('keydown', (e) => {
            const idx = this.getSelectedTraitIndex(table);

            if (e.key === 'Delete' && idx !== null) {
                e.preventDefault();
                e.stopPropagation();
                this.deleteTrait(entry, idx);
                return;
            }

            if (e.key === 'Enter' && idx !== null) {
                e.preventDefault();
                e.stopPropagation();
                this.editTrait(entry, idx);
                return;
            }

            if (!e.ctrlKey && !e.metaKey) return;

            if (e.key === 'c' && idx !== null) {
                e.preventDefault();
                e.stopPropagation();
                this.copyTrait(entry, idx);
                this.updateTraitButtonStates(section);
            } else if (e.key === 'x' && idx !== null) {
                e.preventDefault();
                e.stopPropagation();
                this.cutTrait(entry, idx);
            } else if (e.key === 'v') {
                e.preventDefault();
                e.stopPropagation();
                this.pasteTrait(entry, idx);
            }
        });
    }

    setupTraitsContextMenu(table, classEntry) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        tbody.addEventListener('contextmenu', (e) => {
            e.preventDefault();

            const row = e.target.closest('.trait-row');
            const traitIndex = row ? parseInt(row.dataset.traitIndex) : null;

            // Remove existing context menu
            const existingMenu = document.getElementById('traits-context-menu');
            if (existingMenu) existingMenu.remove();

            // Create context menu
            const menu = document.createElement('div');
            menu.id = 'traits-context-menu';
            menu.style.cssText = `
                position: fixed;
                left: ${e.clientX}px;
                top: ${e.clientY}px;
                background: var(--color-bg-menubar);
                border: 1px solid var(--color-accent-bright);
                border-radius: 4px;
                padding: 4px 0;
                z-index: 10000;
                min-width: 150px;
                box-shadow: 0 4px 8px rgba(0,0,0,0.3);
            `;

            const menuItems = [
                { label: 'Add', action: () => this.addTrait(classEntry), disabled: false },
                { label: 'Edit', action: () => this.editTrait(classEntry, traitIndex), disabled: traitIndex === null },
                { label: 'Cut', action: () => this.cutTrait(classEntry, traitIndex), disabled: traitIndex === null },
                { label: 'Copy', action: () => this.copyTrait(classEntry, traitIndex), disabled: traitIndex === null },
                { label: 'Paste', action: () => this.pasteTrait(classEntry, traitIndex), disabled: false },
                { label: 'Delete', action: () => this.deleteTrait(classEntry, traitIndex), disabled: traitIndex === null },
            ];

            menuItems.forEach(item => {
                if (item.divider) {
                    const divider = document.createElement('div');
                    divider.style.cssText = 'height: 1px; background: var(--color-border); margin: 4px 0;';
                    menu.appendChild(divider);
                } else {
                    const menuItem = document.createElement('div');
                    menuItem.textContent = tt(item.label);
                    menuItem.style.cssText = `
                        padding: 6px 12px;
                        cursor: ${item.disabled ? 'not-allowed' : 'pointer'};
                        color: ${item.disabled ? 'var(--color-text-dim)' : 'var(--color-text-strong)'};
                        font-size: 13px;
                    `;
                    if (!item.disabled) {
                        menuItem.onmouseenter = () => menuItem.style.background = 'rgba(255, 215, 0, 0.2)';
                        menuItem.onmouseleave = () => menuItem.style.background = '';
                        menuItem.onclick = () => {
                            item.action();
                            menu.remove();
                        };
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
        });
    }

    addTrait(classEntry) {
        // Initialize traits array if needed
        if (!classEntry.traits) classEntry.traits = [];

        // Open trait editor for a new trait (index -1)
        this.traitEditor.showTraitEditorModal(classEntry, -1, (updatedEntry) => {
            this.databaseManager.updateClass(updatedEntry.id, updatedEntry);
            this.refreshClassDetail(updatedEntry);
        });
    }

    editTrait(classEntry, traitIndex) {
        if (traitIndex === null) return;

        this.traitEditor.showTraitEditorModal(classEntry, traitIndex, (updatedEntry) => {
            this.databaseManager.updateClass(updatedEntry.id, updatedEntry);
            this.refreshClassDetail(updatedEntry);
        });
    }

    async cutTrait(classEntry, traitIndex) {
        if (traitIndex === null || !classEntry.traits?.[traitIndex]) return;
        const target = DatabaseRowClipboard.capturePasteTarget(this.parentEditor, this.projectManager, this.databaseManager, classEntry.traits, traitIndex);
        const payload = this.copyTrait(classEntry, traitIndex);
        if (!await DatabaseRowClipboard.confirmCut(payload)) return;
        if (this.currentClass !== classEntry
            || !DatabaseRowClipboard.isPasteTargetCurrent(target, this.parentEditor, this.projectManager, this.databaseManager, classEntry.traits)) return;
        this.deleteTrait(classEntry, traitIndex);
    }

    copyTrait(classEntry, traitIndex) {
        if (traitIndex === null) return;
        const trait = classEntry.traits[traitIndex];
        if (!trait) return;

        this.traitsClipboard = DatabaseRowClipboard.write('trait', trait, this.databaseManager);
        return this.traitsClipboard;
    }

    async pasteTrait(classEntry, traitIndex) {
        const target = DatabaseRowClipboard.capturePasteTarget(this.parentEditor, this.projectManager, this.databaseManager, classEntry.traits, traitIndex);
        const result = await DatabaseRowClipboard.read('trait', this.databaseManager, this.traitsClipboard);
        if (this.currentClass !== classEntry
            || !DatabaseRowClipboard.isPasteTargetCurrent(target, this.parentEditor, this.projectManager, this.databaseManager, classEntry.traits)) return;
        if (result.error) {
            DatabaseRowClipboard.showError(result);
            return;
        }

        const newTrait = result.row;

        if (traitIndex !== null) {
            // Insert after selected trait
            classEntry.traits.splice(traitIndex + 1, 0, newTrait);
        } else {
            // Add to end
            classEntry.traits.push(newTrait);
        }

        this.databaseManager.updateClass(classEntry.id, classEntry);
        this.refreshClassDetail(classEntry);
    }

    deleteTrait(classEntry, traitIndex) {
        if (traitIndex === null) return;

        classEntry.traits.splice(traitIndex, 1);
        this.databaseManager.updateClass(classEntry.id, classEntry);
        this.refreshClassDetail(classEntry);
    }


    refreshClassDetail(classEntry) {
        if (this.parentEditor?.showDatabaseDetail) {
            return this.parentEditor.showDatabaseDetail(classEntry, 'classes');
        }
        // Find the container and refresh
        const container = document.querySelector('.database-detail');
        if (container) {
            container.innerHTML = '';
            this.showClassDetail(container, classEntry);
        }
    }

    attachEventListeners(container, classEntry) {
        setTimeout(() => {
            if (!container.isConnected) return;
            const editableFields = container.querySelectorAll('[data-field]');
            editableFields.forEach(field => {
                field.addEventListener('change', (e) => {
                    const fieldName = e.target.dataset.field;
                    const classId = parseInt(e.target.dataset.classId);
                    const value = e.target.value;
                    this.updateClassField(classId, fieldName, value);
                });
            });

            // EXP Curve click handler
            const expCurveTrigger = container.querySelector('.exp-curve-trigger');
            if (expCurveTrigger) {
                expCurveTrigger.addEventListener('click', () => {
                    this.showExpCurveModal(classEntry);
                });
            }
        }, 0);
    }

    updateClassField(classId, fieldName, value) {
        const classEntry = this.databaseManager.getClass(classId);
        if (!classEntry) return;

        classEntry[fieldName] = value;
        this.databaseManager.updateClass(classId, classEntry);
        console.log(`Updated class ${classId} field ${fieldName} to:`, value);

        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        this.commonUI.updateStatus(`${fieldName} ${tt('updated')}`);
    }

    showExpCurveModal(classEntry) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        // Initialize expParams if not present
        if (!classEntry.expParams) {
            classEntry.expParams = [30, 20, 30, 30]; // [basis, extra, accelA, accelB]
        }

        let params = [...classEntry.expParams];
        let activeTab = 'nextLevel';
        const targetLevel = this._targetLevelFor(classEntry);

        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'rr-modal-overlay';

        // Create modal
        const modal = document.createElement('div');
        modal.className = 'rr-modal exp-curve-modal';
        modal.style.cssText = 'width: 600px; max-width: 92vw;';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${tt('EXP Curve')}</div>
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
            { id: 'nextLevel', label: 'To Next Level' },
            { id: 'total', label: 'Total' }
        ];

        tabs.forEach(tab => {
            const tabBtn = document.createElement('button');
            tabBtn.className = 'exp-tab';
            tabBtn.dataset.tab = tab.id;
            tabBtn.textContent = tt(tab.label);
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
            tabBtn.addEventListener('click', () => {
                activeTab = tab.id;
                scheduleTabDisplay();
            });
            tabBar.appendChild(tabBtn);
        });

        // The class's target level, read out in the tab bar: it scopes what the
        // two tabs show (the table used to enumerate all 999 levels — roughly
        // 200 rows of EXP figures a game capped at 60 will never award). It is
        // set in the Parameter Curves header, not here.
        const targetControl = document.createElement('div');
        targetControl.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 0 12px; border-left: 1px solid var(--color-border-subtle); flex: 0 0 auto;';
        targetControl.innerHTML = `
            <label class="database-field-label" style="margin: 0; white-space: nowrap;">${tt('Target level')}</label>
            <span class="exp-target-level" style="color: var(--color-text-strong); font-size: 13px;">${targetLevel}</span>
        `;
        tabBar.appendChild(targetControl);

        // Tab content container with table and graph. This is the part that
        // takes whatever height is left over, so it must be allowed to shrink:
        // a flex item defaults to min-height:auto and would otherwise refuse to
        // go below its content, pushing the dialog past its own 88vh cap.
        const tabContent = document.createElement('div');
        tabContent.style.cssText = `
            padding: 16px;
            position: relative;
            display: flex;
            flex-direction: column;
            flex: 1 1 auto;
            min-height: 0;
        `;

        // Controls section with sliders
        const controls = document.createElement('div');
        controls.style.cssText = `
            padding: 16px;
            border-top: 1px solid var(--color-border-subtle);
            background: var(--color-bg-base);
        `;

        // Create slider controls with appropriate ranges for each parameter
        // One line per control rather than a label above its row. The four of
        // them were 293px of a 634px dialog, which is what left the table with
        // no room; on a single line they are closer to 190px and the table gets
        // the difference.
        const createSliderControl = (label, value, index, min, max) => {
            const controlDiv = document.createElement('div');
            controlDiv.style.cssText = 'display: flex; align-items: center; gap: 12px; margin-bottom: 10px;';
            controlDiv.innerHTML = `
                <label class="database-field-label" style="margin: 0; flex: 0 0 116px; white-space: nowrap;">${label}</label>
                <input type="range" class="exp-slider" data-param-index="${index}"
                       min="${min}" max="${max}" value="${value}"
                       style="flex: 1; min-width: 0; height: 6px; background: var(--color-border-subtle); border-radius: 3px; outline: none; cursor: pointer;">
                <input type="number" class="exp-number" data-param-index="${index}"
                       value="${value}" min="${min}" max="${max}"
                       style="flex: 0 0 60px; width: 60px; padding: 6px; background: var(--color-bg-button); border: 1px solid var(--color-bg-button-hover); color: var(--color-text-strong); border-radius: 4px; text-align: center;">
            `;
            return controlDiv;
        };

        controls.appendChild(createSliderControl(tt('Base Value'), params[0], 0, 5, 100));
        controls.appendChild(createSliderControl(tt('Extra Value'), params[1], 1, 0, 100));
        controls.appendChild(createSliderControl(tt('Acceleration A'), params[2], 2, 0, 100));
        controls.appendChild(createSliderControl(tt('Acceleration B'), params[3], 3, 0, 100));

        // Footer with buttons
        const footer = document.createElement('div');
        footer.className = 'rr-modal-footer';
        footer.innerHTML = `
            <button class="cancel-btn rr-btn-secondary">${tt('Cancel')}</button>
            <button class="ok-btn rr-button-primary">${tt('OK')}</button>
        `;

        const calculateTotalExp = (level, basis, extra, accelA, accelB) => {
            return globalThis.rrExpForLevel([basis, extra, accelA, accelB], level);
        };

        // Update table and graph display
        const updateTabDisplay = () => {
            // Update tab button styles
            tabBar.querySelectorAll('.exp-tab').forEach(btn => {
                const isActive = btn.dataset.tab === activeTab;
                btn.style.background = isActive ? 'var(--color-bg-surface)' : 'transparent';
                btn.style.borderBottomColor = isActive ? 'var(--color-accent-bright)' : 'transparent';
                btn.style.color = isActive ? 'var(--color-accent-bright)' : 'var(--color-text-muted)';
            });

            // Generate data up to the target level the designer is balancing for
            const maxLevel = targetLevel;
            const nextLevelData = [];
            const totalData = [];

            console.log('EXP Curve Parameters:', params);

            for (let level = 1; level <= maxLevel; level++) {
                const totalExp = calculateTotalExp(level, params[0], params[1], params[2], params[3]);
                const nextTotal = calculateTotalExp(level + 1, params[0], params[1], params[2], params[3]);
                const expForNext = Math.max(0, nextTotal - totalExp);
                nextLevelData.push({ level, exp: expForNext });
                totalData.push({ level, exp: totalExp });
            }

            const data = activeTab === 'nextLevel' ? nextLevelData : totalData;
            const maxExp = Math.max(...data.map(d => d.exp));

            console.log('Tab:', activeTab, 'MaxExp:', maxExp, 'L1:', data[0]?.exp, `L${maxLevel}:`, data[maxLevel - 1]?.exp);

            // Create table with graph background
            // The box fills whatever the dialog has left instead of asserting a
            // fixed 420px: at 88vh that was 226px taller than the space it had,
            // so the table ran under the sliders with no bottom edge and the
            // graph was drawn for an area twice its visible height. The graph
            // sits outside the scroller so it stays put as a backdrop, and the
            // table scrolls over it.
            tabContent.innerHTML = `
                <div style="position: relative; flex: 1 1 420px; min-width: 0; min-height: 140px; background: var(--color-bg-input); border: 1px solid var(--color-border-subtle); border-radius: 4px; overflow: hidden;">
                    <canvas id="exp-graph-canvas" style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0;"></canvas>
                    <div style="position: absolute; inset: 0; overflow-y: auto; z-index: 1; background: color-mix(in srgb, var(--color-bg-input) 85%, transparent);">
                        <table style="width: 100%; border-collapse: collapse; font-family: monospace; font-size: 11px; background: transparent;">
                            <tbody>
                                ${data.map((d, idx) => {
                                    if (idx % 5 === 0) {
                                        // Every 5 levels, create a new row with 5 columns
                                        let rowHtml = '<tr>';
                                        for (let i = 0; i < 5 && idx + i < data.length; i++) {
                                            const item = data[idx + i];
                                             rowHtml += `<td style="padding: 2px 6px; color: var(--color-text-muted); border: 1px solid var(--color-bg-list-item-alt);">${tt('Lv')}${item.level}:</td>`;
                                            rowHtml += `<td style="padding: 2px 6px; color: ${item.exp > 40000 ? '#50fa7b' : item.exp > 20000 ? '#8be9fd' : '#f1fa8c'}; text-align: right; border: 1px solid var(--color-bg-list-item-alt);">${item.exp}</td>`;
                                        }
                                        rowHtml += '</tr>';
                                        return rowHtml;
                                    }
                                    return '';
                                }).filter(r => r).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            // Draw graph
            setTimeout(() => {
                const canvas = document.getElementById('exp-graph-canvas');
                if (!canvas) return;

                const container = canvas.parentElement;
                canvas.width = container.clientWidth;
                canvas.height = container.clientHeight;
                const ctx = canvas.getContext('2d');

                // Clear canvas
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                const padding = 10;
                const graphHeight = canvas.height - padding * 2;
                const graphWidth = canvas.width - padding * 2;

                // Draw horizontal grid lines (no labels to avoid clutter)
                ctx.strokeStyle = '#1a1a1a';
                ctx.lineWidth = 1;
                for (let i = 0; i <= 10; i++) {
                    const y = padding + (graphHeight / 10) * i;
                    ctx.beginPath();
                    ctx.moveTo(padding, y);
                    ctx.lineTo(canvas.width - padding, y);
                    ctx.stroke();
                }

                // Draw vertical grid lines (no labels)
                for (let i = 0; i <= 10; i++) {
                    const x = padding + (graphWidth / 10) * i;
                    ctx.beginPath();
                    ctx.moveTo(x, padding);
                    ctx.lineTo(x, canvas.height - padding);
                    ctx.stroke();
                }

                // Use logarithmic scale for Total tab to show curve better
                const useLogScale = activeTab === 'total' && maxExp > 10000;
                const minExp = Math.min(...data.map(d => d.exp));

                // Function to normalize values
                const normalizeValue = (exp) => {
                    if (useLogScale) {
                        // Logarithmic scale for better visualization of exponential growth
                        const logExp = exp > 0 ? Math.log10(exp + 1) : 0;
                        const logMax = Math.log10(maxExp + 1);
                        return logMax > 0 ? logExp / logMax : 0;
                    } else {
                        // Linear scale
                        return maxExp > 0 ? exp / maxExp : 0;
                    }
                };

                // Create path for filled area first
                ctx.beginPath();
                ctx.moveTo(padding, canvas.height - padding);

                data.forEach((d, i) => {
                    const x = padding + (i / (data.length - 1)) * graphWidth;
                    const normalizedExp = normalizeValue(d.exp);
                    const y = canvas.height - padding - (normalizedExp * graphHeight);
                    ctx.lineTo(x, y);
                });

                ctx.lineTo(canvas.width - padding, canvas.height - padding);
                ctx.closePath();

                // Fill area under curve
                const gradient = ctx.createLinearGradient(0, padding, 0, canvas.height - padding);
                gradient.addColorStop(0, ThemeColors.resolve('--color-accent-tint-15', 'rgba(255, 215, 0, 0.15)'));
                gradient.addColorStop(1, 'rgba(255, 215, 0, 0.02)');
                ctx.fillStyle = gradient;
                ctx.fill();

                // Draw graph line on top
                ctx.strokeStyle = ThemeColors.resolve('--color-accent-bright', '#ffd700');
                ctx.lineWidth = 2.5;
                ctx.beginPath();

                data.forEach((d, i) => {
                    const x = padding + (i / (data.length - 1)) * graphWidth;
                    const normalizedExp = normalizeValue(d.exp);
                    const y = canvas.height - padding - (normalizedExp * graphHeight);

                    if (i === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                });

                ctx.stroke();

                console.log('Graph scale:', useLogScale ? 'logarithmic' : 'linear');
            }, 50);
        };

        let updateFrame = null;
        const scheduleTabDisplay = () => {
            if (updateFrame !== null) return;
            updateFrame = requestAnimationFrame(() => {
                updateFrame = null;
                updateTabDisplay();
            });
        };

        // The graph canvas is sized from the box when the table is built, and
        // the box now follows the window instead of being a fixed 420px, so a
        // resize would otherwise leave a graph drawn for the old height. The
        // box's size comes from flex rather than from its content, so redrawing
        // cannot resize it back and this cannot feed itself.
        // Self-healing: the dialog can also be dismissed by whoever holds it
        // through registerDetailModal, which never runs the close handler below,
        // so the listener takes its own detachment as the signal to go.
        const onWindowResize = () => {
            if (!overlay.isConnected) {
                window.removeEventListener('resize', onWindowResize);
                return;
            }
            scheduleTabDisplay();
        };
        window.addEventListener('resize', onWindowResize);
        const closeExpModal = () => {
            window.removeEventListener('resize', onWindowResize);
            if (updateFrame !== null) cancelAnimationFrame(updateFrame);
            updateFrame = null;
            overlay.remove();
        };

        // Sync slider and number input
        const syncInputs = () => {
            modal.querySelectorAll('.exp-slider').forEach(slider => {
                slider.addEventListener('input', (e) => {
                    const index = parseInt(e.target.dataset.paramIndex);
                    const value = parseInt(e.target.value);
                    params[index] = value;
                    modal.querySelector(`.exp-number[data-param-index="${index}"]`).value = value;
                    scheduleTabDisplay();
                });
            });

            modal.querySelectorAll('.exp-number').forEach(input => {
                input.addEventListener('input', (e) => {
                    const index = parseInt(e.target.dataset.paramIndex);
                    const min = parseInt(e.target.min);
                    const max = parseInt(e.target.max);
                    let value = parseInt(e.target.value) || min;
                    value = Math.max(min, Math.min(max, value));
                    params[index] = value;
                    modal.querySelector(`.exp-slider[data-param-index="${index}"]`).value = value;
                    scheduleTabDisplay();
                });
            });
        };

        // Assemble modal
        modal.appendChild(header);
        modal.appendChild(tabBar);
        modal.appendChild(tabContent);
        modal.appendChild(controls);
        modal.appendChild(footer);
        overlay.appendChild(modal);

        // Event listeners
        header.querySelector('.close-btn').addEventListener('click', closeExpModal);
        footer.querySelector('.cancel-btn').addEventListener('click', closeExpModal);
        footer.querySelector('.ok-btn').addEventListener('click', () => {
            classEntry.expParams = [...params];
            this.databaseManager.updateClass(classEntry.id, classEntry);
            this.refreshClassDetail(classEntry);
            closeExpModal();
        });
        overlay.addEventListener('click', (e) => {
            // A click on the backdrop no longer closes the dialog: an accidental
            // click beside it must never cost in-progress work. Close deliberately.
        });

        document.body.appendChild(overlay);
        this.commonUI?.databaseEditor?.registerDetailModal(overlay);

        // Initialize
        updateTabDisplay();
        syncInputs();
    }
}

/**
 * Quick Setting A–E: five preset pairs of Lv1 and target-level values per
 * parameter family, A the gentlest and E the strongest, joined by a straight
 * line. They anchor at the class's target level, so a class balanced for
 * Lv150 gets the E value at Lv150, not at Lv99.
 */
DatabaseClassEditor.QUICK_SETTINGS = Object.freeze({
    names: ['A', 'B', 'C', 'D', 'E'],
    hp: { A: [300, 2500], B: [400, 4000], C: [500, 5500], D: [600, 7000], E: [700, 8500] },
    mp: { A: [40, 250], B: [60, 400], C: [80, 550], D: [100, 700], E: [120, 850] },
    other: { A: [10, 90], B: [14, 130], C: [18, 170], D: [22, 210], E: [26, 250] },
    presetFor(paramIdx, name) {
        const family = paramIdx === 0 ? this.hp : paramIdx === 1 ? this.mp : this.other;
        return family[name] || family.C;
    }
});
