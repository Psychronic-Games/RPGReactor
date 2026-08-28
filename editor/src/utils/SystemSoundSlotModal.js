/**
 * Edits one System.json sound slot without changing the shared audio picker.
 * The primary sound remains the stock four-field object; optional variants and
 * pitchRandom keys are Reactor extensions ignored by stock RPG Maker runtimes.
 */
(function(root) {
    'use strict';

    const SOUND_LABELS = [
        'Cursor', 'Ok', 'Cancel', 'Buzzer', 'Equip', 'Save', 'Load', 'Battle Start',
        'Escape', 'Enemy Attack', 'Enemy Damage', 'Enemy Collapse', 'Boss Collapse 1',
        'Boss Collapse 2', 'Actor Damage', 'Actor Collapse', 'Recovery', 'Miss',
        'Evasion', 'Magic Evasion', 'Reflection', 'Shop', 'Use Item', 'Use Skill'
    ];
    let modalSequence = 0;

    function audioValue(value) {
        const source = value && typeof value === 'object' ? value : {};
        return {
            ...source,
            name: typeof source.name === 'string' ? source.name : '',
            volume: Number.isFinite(Number(source.volume)) ? Number(source.volume) : 90,
            pitch: Number.isFinite(Number(source.pitch)) ? Number(source.pitch) : 100,
            pan: Number.isFinite(Number(source.pan)) ? Number(source.pan) : 0
        };
    }

    function pitchRange(value) {
        if (!value || typeof value !== 'object') return null;
        const rawMin = value.min;
        const rawMax = value.max;
        if (rawMin == null || rawMax == null || String(rawMin).trim() === '' || String(rawMax).trim() === '') {
            return null;
        }
        const min = Math.round(Number(rawMin));
        const max = Math.round(Number(rawMax));
        if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return null;
        return {
            min: Math.max(50, Math.min(150, min)),
            max: Math.max(50, Math.min(150, max))
        };
    }

    function draftFor(slot) {
        const source = slot && typeof slot === 'object' ? slot : {};
        return {
            sounds: [audioValue(source)].concat(
                Array.isArray(source.variants) ? source.variants.map(audioValue) : []
            ),
            pitchRandom: pitchRange(source.pitchRandom)
        };
    }

    function applyDraft(slot, draft) {
        const next = { ...(slot && typeof slot === 'object' ? slot : {}), ...audioValue(draft.sounds[0]) };
        const variants = draft.sounds.slice(1).map(audioValue).filter(sound => sound.name);
        if (variants.length > 0) next.variants = variants;
        else delete next.variants;
        const range = pitchRange(draft.pitchRandom);
        if (range) next.pitchRandom = range;
        else delete next.pitchRandom;
        return next;
    }

    function open(options) {
        const tt = text => root.I18n ? root.I18n.tText(text) : text;
        const draft = draftFor(options.slot);
        const files = options.files || [];
        const previousFocus = document.activeElement;

        const overlay = document.createElement('div');
        overlay.className = 'rr-modal-overlay';
        overlay.style.zIndex = String(options.zIndex || 10500);

        const modal = document.createElement('div');
        modal.className = 'rr-modal rr-system-sound-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');

        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        const title = document.createElement('h2');
        title.className = 'rr-modal-title';
        title.id = `rr-system-sound-title-${++modalSequence}`;
        title.textContent = tt(options.label || 'Sound');
        modal.setAttribute('aria-labelledby', title.id);
        const closeButton = document.createElement('button');
        closeButton.className = 'rr-modal-close';
        closeButton.type = 'button';
        closeButton.textContent = '\u00d7';
        closeButton.setAttribute('aria-label', tt('Close'));
        header.appendChild(title);
        header.appendChild(closeButton);

        const body = document.createElement('div');
        body.className = 'rr-modal-body';

        const soundList = document.createElement('div');
        soundList.className = 'rr-system-sound-list';

        const chooseSound = (index, onCancel) => {
            const current = draft.sounds[index];
            root.RRAudioPickerModal.open({
                title: `${tt('Select')} SE ${tt('File')}`,
                folderLabel: 'SE',
                files,
                selected: current.name,
                levels: current,
                zIndex: (options.zIndex || 10500) + 1,
                onOk(result) {
                    if (index > 0 && !result.name) {
                        draft.sounds.splice(index, 1);
                        renderSounds();
                        setTimeout(() => addButton.focus(), 0);
                        return;
                    }
                    draft.sounds[index] = audioValue({ ...current, ...result });
                    renderSounds();
                    setTimeout(() => soundList.querySelectorAll('.rr-system-sound-summary')[index]?.focus(), 0);
                },
                onCancel
            });
        };

        const actionButton = (label, action, disabled = false) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'rr-btn-secondary';
            button.textContent = tt(label);
            button.disabled = disabled;
            button.addEventListener('click', action);
            return button;
        };

        const iconButton = (label, pathData, action, danger = false) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `rr-system-sound-icon${danger ? ' is-danger' : ''}`;
            button.title = tt(label);
            button.setAttribute('aria-label', tt(label));
            button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${pathData}"/></svg>`;
            button.addEventListener('click', action);
            return button;
        };

        const coverFor = sound => {
            const record = files.find(file => file.name === sound.name);
            if (!record?.absolutePath) return Promise.resolve(null);
            if (root.RRAudioCoverArt?.forFile) return root.RRAudioCoverArt.forFile(record.absolutePath);
            const player = root.reactor?.audioPlayer;
            if (player?.getCoverArt) return player.getCoverArt(record.absolutePath);
            try {
                return Promise.resolve(root.RRAudioCoverArt?.extractFromFile(record.absolutePath) || null);
            } catch (error) {
                return Promise.resolve(null);
            }
        };

        const renderSounds = () => {
            soundList.innerHTML = '';
            draft.sounds.forEach((sound, index) => {
                const row = document.createElement('div');
                row.className = `rr-system-sound-card${index === 0 ? ' is-primary' : ''}`;

                const art = document.createElement('img');
                art.className = 'rr-system-sound-art';
                art.alt = '';
                art.draggable = false;
                art.src = root.RRAudioCoverArt?.placeholderFor(sound.name || null) || '';
                const expectedName = sound.name;
                coverFor(sound).then(url => {
                    if (url && draft.sounds[index]?.name === expectedName) art.src = url;
                });

                const summary = document.createElement('button');
                summary.type = 'button';
                summary.className = 'rr-system-sound-summary';
                summary.setAttribute('aria-label', `${tt('Sound')} ${index + 1}: ${sound.name || tt('(None)')}`);
                const ordinal = document.createElement('span');
                ordinal.className = 'rr-system-sound-ordinal';
                ordinal.textContent = `${tt('Sound')} ${index + 1}`;
                const filename = document.createElement('span');
                filename.className = 'rr-system-sound-filename';
                filename.textContent = sound.name || tt('(None)');
                const metadata = document.createElement('span');
                metadata.className = 'rr-system-sound-metadata';
                const pan = sound.pan === 0 ? tt('Center') : `${sound.pan > 0 ? 'R' : 'L'}${Math.abs(sound.pan)}`;
                for (const text of [
                    `${tt('Volume')} ${sound.volume}`,
                    `${tt('Pitch')} ${sound.pitch}`,
                    `${tt('Pan')} ${pan}`
                ]) {
                    const chip = document.createElement('span');
                    chip.textContent = text;
                    metadata.appendChild(chip);
                }
                summary.appendChild(ordinal);
                summary.appendChild(filename);
                summary.appendChild(metadata);
                summary.addEventListener('click', () => chooseSound(index));

                const actions = document.createElement('div');
                actions.className = 'rr-system-sound-actions';
                if (index > 1) {
                    actions.appendChild(iconButton('Move Up', 'M7 14l5-5 5 5H7z', () => {
                        [draft.sounds[index - 1], draft.sounds[index]] = [draft.sounds[index], draft.sounds[index - 1]];
                        renderSounds();
                    }));
                }
                if (index > 0 && index < draft.sounds.length - 1) {
                    actions.appendChild(iconButton('Move Down', 'M7 10l5 5 5-5H7z', () => {
                        [draft.sounds[index], draft.sounds[index + 1]] = [draft.sounds[index + 1], draft.sounds[index]];
                        renderSounds();
                    }));
                }
                if (index > 0) {
                    actions.appendChild(iconButton('Remove', 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zm3-9h2v8H9v-8zm4 0h2v8h-2v-8zm2.5-6-1-1h-5l-1 1H5v2h14V4h-3.5z', () => {
                        draft.sounds.splice(index, 1);
                        renderSounds();
                    }, true));
                }

                row.appendChild(art);
                row.appendChild(summary);
                row.appendChild(actions);
                soundList.appendChild(row);
            });
        };
        renderSounds();
        body.appendChild(soundList);

        const addButton = actionButton('Add', () => {
            draft.sounds.push(audioValue(null));
            const index = draft.sounds.length - 1;
            chooseSound(index, () => {
                draft.sounds.splice(index, 1);
                renderSounds();
            });
        });
        addButton.className = 'rr-system-sound-add';
        addButton.textContent = `+ ${tt('Add')} ${tt('Sound')}`;
        body.appendChild(addButton);

        const rangePanel = document.createElement('div');
        rangePanel.className = 'rr-system-pitch-card';
        const enabledLabel = document.createElement('label');
        enabledLabel.className = 'rr-system-pitch-toggle';
        const enabled = document.createElement('input');
        enabled.type = 'checkbox';
        enabled.checked = !!draft.pitchRandom;
        enabledLabel.appendChild(enabled);
        enabledLabel.appendChild(document.createTextNode(`${tt('Random')} ${tt('Pitch')}`));

        const makeRangeInput = (label, value) => {
            const wrapper = document.createElement('label');
            wrapper.className = 'rr-system-pitch-field';
            const caption = document.createElement('span');
            caption.textContent = tt(label);
            wrapper.appendChild(caption);
            const controls = document.createElement('span');
            controls.className = 'rr-system-pitch-controls';
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.className = 'rr-system-pitch-slider rr-range';
            slider.min = '50';
            slider.max = '150';
            slider.value = String(value);
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'rr-system-pitch-number';
            input.min = '50';
            input.max = '150';
            input.required = true;
            input.value = String(value);
            slider.addEventListener('input', () => { input.value = slider.value; });
            input.addEventListener('input', () => { slider.value = input.value; });
            controls.appendChild(slider);
            controls.appendChild(input);
            wrapper.appendChild(controls);
            return { wrapper, input, slider };
        };
        const minInput = makeRangeInput('Min:', draft.pitchRandom?.min ?? 95);
        const maxInput = makeRangeInput('Max:', draft.pitchRandom?.max ?? 105);
        const updateRangeState = () => {
            minInput.input.disabled = !enabled.checked;
            maxInput.input.disabled = !enabled.checked;
            minInput.slider.disabled = !enabled.checked;
            maxInput.slider.disabled = !enabled.checked;
            rangePanel.classList.toggle('is-disabled', !enabled.checked);
        };
        enabled.addEventListener('change', updateRangeState);
        updateRangeState();
        rangePanel.appendChild(enabledLabel);
        rangePanel.appendChild(minInput.wrapper);
        rangePanel.appendChild(maxInput.wrapper);
        body.appendChild(rangePanel);

        const footer = document.createElement('div');
        footer.className = 'rr-modal-footer';
        const cancelButton = actionButton('Cancel', () => close(false));
        const okButton = actionButton('OK', () => close(true));
        okButton.className = 'rr-button-primary';
        footer.appendChild(cancelButton);
        footer.appendChild(okButton);

        const close = confirmed => {
            if (confirmed) {
                for (const input of [minInput.input, maxInput.input]) input.setCustomValidity('');
                if (enabled.checked && Number(minInput.input.value) > Number(maxInput.input.value)) {
                    maxInput.input.setCustomValidity(`${tt('Min:')} <= ${tt('Max:')}`);
                }
                if (enabled.checked && (!minInput.input.checkValidity() || !maxInput.input.checkValidity())) {
                    (minInput.input.checkValidity() ? maxInput.input : minInput.input).reportValidity();
                    return;
                }
                draft.pitchRandom = enabled.checked
                    ? pitchRange({ min: minInput.input.value, max: maxInput.input.value })
                    : null;
                if (enabled.checked && !draft.pitchRandom) return;
            }
            overlay.remove();
            if (confirmed) options.onOk(applyDraft(options.slot, draft));
            else if (options.onCancel) options.onCancel();
            if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus();
        };

        closeButton.addEventListener('click', () => close(false));
        overlay.addEventListener('click', event => {
            if (event.target === overlay) close(false);
        });
        overlay.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close(false);
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = Array.from(modal.querySelectorAll(
                'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )).filter(element => element.offsetParent !== null);
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });

        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(footer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        setTimeout(() => closeButton.focus(), 0);
    }

    const api = { SOUND_LABELS, applyDraft, audioValue, draftFor, open, pitchRange };
    root.RRSystemSoundSlotModal = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
