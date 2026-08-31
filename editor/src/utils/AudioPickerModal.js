/**
 * The shared audio file picker modal, styled after the Audio Player: a
 * cover-art header naming the selected track, a fine-step seek row,
 * play/pause/stop/loop buttons beside optional volume/pitch/pan cards, and
 * an alphabet rail down a sectioned track list with per-row cover
 * thumbnails. Every audio-picking surface (System 1 slots, audio event
 * commands, movement-route SE, map properties) opens this one modal.
 *
 * Track ordering, section keys, and the cover-art cache are borrowed from
 * the Audio Player instance when one exists, so all surfaces stay in step
 * and art extracted once serves everywhere.
 */
(function(root) {
    'use strict';
    let modalSequence = 0;

    /**
     * @param {object} options
     * @param {string} options.title - Header text (translated internally).
     * @param {string} options.folderLabel - 'BGM' | 'BGS' | 'ME' | 'SE'.
     * @param {Array} options.files - RRAssetFiles records ({name, absolutePath}).
     * @param {string} [options.selected] - Currently selected extensionless name.
     * @param {?object} [options.levels] - {volume, pitch, pan} to show the
     *   inline cards, or null to hide them (the caller keeps its own fields).
     * @param {object} [options.previewLevels] - Levels for preview playback
     *   when the cards are hidden.
     * @param {boolean} [options.loopDefault] - Loop toggle's initial state.
     * @param {number} [options.zIndex] - Overlay z-index (default 2000).
     * @param {function} options.onOk - Receives {name, volume, pitch, pan}.
     * @param {function} [options.onCancel]
     */
    function open(options) {
        const tt = text => root.I18n ? root.I18n.tText(text) : text;
        const previousFocus = document.activeElement;

        const audioPlayer = root.reactor?.audioPlayer || null;
        const sectionKey = name => audioPlayer
            ? audioPlayer.getAudioSectionKey(name)
            : ((String(name || '').charAt(0).toUpperCase().match(/\p{L}/u) || ['#'])[0]);
        const compareNames = (a, b) => audioPlayer
            ? audioPlayer.compareAudioTrackNames(a, b)
            : a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
        const coverFor = absolutePath => {
            if (root.RRAudioCoverArt?.forFile) return root.RRAudioCoverArt.forFile(absolutePath);
            if (audioPlayer?.getCoverArt) return audioPlayer.getCoverArt(absolutePath);
            return new Promise(resolve => setTimeout(() => {
                try {
                    resolve(root.RRAudioCoverArt
                        ? root.RRAudioCoverArt.extractFromFile(absolutePath) : null);
                } catch (error) {
                    resolve(null);
                }
            }, 0));
        };
        const placeholderFor = name => root.RRAudioCoverArt
            ? root.RRAudioCoverArt.placeholderFor(name) : '';

        const files = (options.files || []).slice()
            .sort((a, b) => compareNames(a.name, b.name));
        const fileByName = new Map(files.map(file => [file.name, file]));
        const folderLabel = options.folderLabel || '';
        const showLevels = options.levels != null;
        const initial = options.levels || options.previewLevels || {};

        let selectedFile = options.selected || '';
        let currentVolume = initial.volume !== undefined ? initial.volume : 90;
        let currentPitch = initial.pitch !== undefined ? initial.pitch : 100;
        let currentPan = initial.pan !== undefined ? initial.pan : 0;

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: ${options.zIndex || 2000};
        `;

        const modal = document.createElement('div');
        modal.className = 'rr-audio-picker-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 8px;
            width: 760px;
            max-width: 96vw;
            height: 85vh;
            max-height: 860px;
            display: flex;
            flex-direction: column;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            background-color: var(--color-bg-panel);
            padding: 12px 16px;
            border-bottom: 1px solid var(--color-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-radius: 8px 8px 0 0;
        `;
        const headerTitle = document.createElement('div');
        headerTitle.style.cssText = 'font-size: 16px; font-weight: 600; color: var(--color-text);';
        headerTitle.id = `rr-audio-picker-title-${++modalSequence}`;
        headerTitle.textContent = tt(options.title || 'Select Audio File');
        modal.setAttribute('aria-labelledby', headerTitle.id);
        const closeX = document.createElement('button');
        closeX.type = 'button';
        closeX.style.cssText = 'background: none; border: none; color: var(--color-text-muted); font-size: 24px; cursor: pointer; padding: 0; width: 30px; height: 30px;';
        closeX.textContent = '×';
        closeX.setAttribute('aria-label', tt('Close'));
        header.appendChild(headerTitle);
        header.appendChild(closeX);
        modal.appendChild(header);

        const body = document.createElement('div');
        body.style.cssText = `
            padding: 16px;
            display: flex;
            flex-direction: column;
            flex: 1;
            min-height: 0;
        `;
        modal.appendChild(body);

        // ── Player info: cover art + selected track name + time ──────────
        const info = document.createElement('div');
        info.className = 'audio-player-info';
        info.style.marginBottom = '12px';
        const infoArt = document.createElement('img');
        infoArt.className = 'track-art track-art-large';
        infoArt.alt = '';
        infoArt.draggable = false;
        const infoText = document.createElement('div');
        infoText.className = 'audio-player-info-text';
        const infoName = document.createElement('div');
        infoName.className = 'current-track';
        infoName.setAttribute('aria-live', 'polite');
        const infoTime = document.createElement('div');
        infoTime.className = 'track-time';
        infoTime.textContent = '0:00 / 0:00';
        infoText.appendChild(infoName);
        infoText.appendChild(infoTime);
        info.appendChild(infoArt);
        info.appendChild(infoText);
        body.appendChild(info);

        const updateInfo = () => {
            infoName.textContent = selectedFile
                ? (folderLabel ? `[${folderLabel}] ${selectedFile}` : selectedFile)
                : tt('No Track Selected');
            infoArt.src = placeholderFor(selectedFile || null);
            const record = selectedFile
                ? files.find(file => file.name === selectedFile) : null;
            if (record && record.absolutePath) {
                const expected = record.absolutePath;
                infoArt.dataset.artPath = expected;
                coverFor(expected).then(url => {
                    // Another track may have been selected while the art loaded.
                    if (url && infoArt.dataset.artPath === expected) infoArt.src = url;
                });
            } else {
                delete infoArt.dataset.artPath;
            }
        };

        // ── Audio plumbing ───────────────────────────────────────────────
        const audioElement = document.createElement('audio');
        let audioContext = null;
        let sourceNode = null;
        let gainNode = null;
        let pannerNode = null;
        let isPlaying = false;
        let loopActive = Boolean(options.loopDefault);
        let loopPoints = null;
        let loopArmed = true;
        let loopGeneration = 0;
        let loopWatch = 0;

        const formatTime = seconds => {
            if (isNaN(seconds)) return '0:00';
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        };

        const stopAudio = () => {
            audioElement.pause();
            audioElement.currentTime = 0;
            isPlaying = false;
            updateButtons();
        };

        // Close paths release the Web Audio context — Chromium caps live
        // AudioContexts per page (~6); leaking one per picker open
        // eventually silences every audio preview in the session.
        const releaseAudio = () => {
            loopGeneration++;
            stopAudio();
            if (audioContext) {
                try { audioContext.close(); } catch (e) {}
                audioContext = null;
                sourceNode = null;
                gainNode = null;
                pannerNode = null;
            }
        };

        const applyLoopMode = () => {
            audioElement.loop = loopActive && !loopPoints;
        };

        const wrapLoopPoint = () => {
            if (!loopActive || !loopPoints) return;
            const time = audioElement.currentTime;
            if (time < loopPoints.end) {
                loopArmed = true;
            } else if (loopArmed) {
                const length = loopPoints.end - loopPoints.start;
                audioElement.currentTime = loopPoints.start + ((time - loopPoints.end) % length);
            }
        };

        const watchLoopPoints = () => {
            if (loopWatch) return;
            const raf = typeof root.requestAnimationFrame === 'function'
                ? root.requestAnimationFrame.bind(root)
                : callback => setTimeout(callback, 16);
            const tick = () => {
                loopWatch = 0;
                if (!isPlaying || audioElement.paused || audioElement.ended || !loopPoints) return;
                wrapLoopPoint();
                loopWatch = raf(tick);
            };
            loopWatch = raf(tick);
        };

        const loadLoopPoints = record => {
            const generation = ++loopGeneration;
            loopPoints = null;
            loopArmed = true;
            applyLoopMode();
            const tags = root.RRAudioLoopTags;
            if (!tags || !tags.loopPointsFromFile || !record?.absolutePath) return;
            Promise.resolve(tags.loopPointsFromFile(record.absolutePath)).then(points => {
                if (generation !== loopGeneration) return;
                loopPoints = points && points.end > points.start ? points : null;
                loopArmed = !loopPoints || audioElement.currentTime < loopPoints.end;
                applyLoopMode();
                watchLoopPoints();
            }).catch(() => {});
        };

        const playSelected = () => {
            const record = selectedFile
                ? files.find(file => file.name === selectedFile) : null;
            if (!record) {
                stopAudio();
                return;
            }

            const source = root.RRAssetFiles.toUrl(record.absolutePath);
            if (audioElement.dataset.source !== source) {
                audioElement.src = source;
                audioElement.dataset.source = source;
                loadLoopPoints(record);
            }

            if (!audioContext) {
                const AudioContextClass = root.AudioContext || root.webkitAudioContext;
                const htmlAudioOnly = !!root.reactor?.audioPlayer?.audioPlayer?.htmlAudioOnly;
                if (AudioContextClass && !htmlAudioOnly) {
                    try {
                        audioContext = new AudioContextClass();
                        sourceNode = audioContext.createMediaElementSource(audioElement);
                        gainNode = audioContext.createGain ? audioContext.createGain() : null;
                        pannerNode = audioContext.createStereoPanner ? audioContext.createStereoPanner() : null;
                        if (gainNode) {
                            sourceNode.connect(gainNode);
                            if (pannerNode) {
                                gainNode.connect(pannerNode);
                                pannerNode.connect(audioContext.destination);
                            } else {
                                gainNode.connect(audioContext.destination);
                            }
                        } else {
                            sourceNode.connect(audioContext.destination);
                        }
                    } catch (error) {
                        try { if (audioContext) audioContext.close(); } catch (closeError) {}
                        audioContext = null;
                        sourceNode = null;
                        gainNode = null;
                        pannerNode = null;
                    }
                }
            }

            if (gainNode) gainNode.gain.value = currentVolume / 100;
            else audioElement.volume = currentVolume / 100;
            if (pannerNode) pannerNode.pan.value = currentPan / 100;
            audioElement.playbackRate = currentPitch / 100;
            audioElement.preservesPitch = false;
            applyLoopMode();

            audioElement.play().then(() => {
                isPlaying = true;
                updateButtons();
                watchLoopPoints();
            }).catch(err => {
                console.error('Error playing audio:', err);
            });
        };

        audioElement.onended = () => {
            if (loopActive && loopPoints) {
                audioElement.currentTime = loopPoints.start;
                loopArmed = true;
                audioElement.play().catch(err => console.error('Error playing audio:', err));
                return;
            }
            isPlaying = false;
            updateButtons();
        };

        // ── Seek row ─────────────────────────────────────────────────────
        const seekRow = document.createElement('div');
        seekRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin: 0 0 12px;';
        const seekCurrentTime = document.createElement('span');
        seekCurrentTime.style.cssText = 'color: var(--color-text); font-size: 11px; min-width: 35px;';
        seekCurrentTime.textContent = '0:00';
        const seekSlider = document.createElement('input');
        seekSlider.type = 'range';
        seekSlider.className = 'audio-control-slider';
        seekSlider.min = '0';
        seekSlider.max = '100';
        seekSlider.step = '0.1';
        seekSlider.value = '0';
        seekSlider.setAttribute('aria-label', tt('Position'));
        seekSlider.style.cssText = 'flex: 1; cursor: pointer;';
        const seekDuration = document.createElement('span');
        seekDuration.style.cssText = 'color: var(--color-text); font-size: 11px; min-width: 35px; text-align: right;';
        seekDuration.textContent = '0:00';
        seekRow.appendChild(seekCurrentTime);
        seekRow.appendChild(seekSlider);
        seekRow.appendChild(seekDuration);
        body.appendChild(seekRow);

        let isSeeking = false;
        seekSlider.addEventListener('mousedown', () => { isSeeking = true; });
        seekSlider.addEventListener('mouseup', () => { isSeeking = false; });
        seekSlider.addEventListener('input', event => {
            if (audioElement.duration) {
                const time = (event.target.value / 100) * audioElement.duration;
                audioElement.currentTime = time;
                seekCurrentTime.textContent = formatTime(time);
            }
        });
        audioElement.addEventListener('timeupdate', () => {
            if (!audioElement.duration) return;
            wrapLoopPoint();
            if (!isSeeking) {
                seekSlider.value = (audioElement.currentTime / audioElement.duration) * 100;
                seekCurrentTime.textContent = formatTime(audioElement.currentTime);
            }
            infoTime.textContent = `${formatTime(audioElement.currentTime)} / ${formatTime(audioElement.duration)}`;
        });
        audioElement.addEventListener('loadedmetadata', () => {
            seekDuration.textContent = formatTime(audioElement.duration);
            infoTime.textContent = `${formatTime(audioElement.currentTime)} / ${formatTime(audioElement.duration)}`;
        });
        audioElement.addEventListener('seeked', () => {
            loopArmed = !loopPoints || audioElement.currentTime < loopPoints.end;
        });

        // ── Playback buttons + inline level controls ─────────────────────
        const controls = document.createElement('div');
        controls.className = 'audio-player-controls';
        controls.style.marginBottom = '0';

        const makeButton = (title, svgPath) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'audio-player-button';
            button.title = tt(title);
            button.setAttribute('aria-label', tt(title));
            button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${svgPath}"/></svg>`;
            return button;
        };

        const playBtn = makeButton('Play', 'M8 5v14l11-7z');
        const pauseBtn = makeButton('Pause', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');
        const stopBtn = makeButton('Stop', 'M6 6h12v12H6z');
        const loopBtn = makeButton('Loop', 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z');
        loopBtn.classList.toggle('active-toggle', loopActive);
        loopBtn.setAttribute('aria-pressed', String(loopActive));

        const updateButtons = () => {
            playBtn.disabled = !selectedFile || isPlaying;
            pauseBtn.disabled = !isPlaying;
            stopBtn.disabled = !isPlaying && !audioElement.currentTime;
        };

        playBtn.addEventListener('click', () => playSelected());
        pauseBtn.addEventListener('click', () => {
            audioElement.pause();
            isPlaying = false;
            updateButtons();
        });
        stopBtn.addEventListener('click', () => stopAudio());
        loopBtn.addEventListener('click', () => {
            loopActive = !loopActive;
            loopBtn.classList.toggle('active-toggle', loopActive);
            loopBtn.setAttribute('aria-pressed', String(loopActive));
            applyLoopMode();
        });

        controls.appendChild(playBtn);
        controls.appendChild(pauseBtn);
        controls.appendChild(stopBtn);
        controls.appendChild(loopBtn);

        if (showLevels) {
            const makeInlineControl = (labelText, min, max, value, format, onInput) => {
                const group = document.createElement('div');
                group.className = 'audio-inline-control';
                const label = document.createElement('label');
                label.textContent = tt(labelText);
                const slider = document.createElement('input');
                slider.type = 'range';
                slider.className = 'audio-control-slider';
                slider.min = String(min);
                slider.max = String(max);
                slider.value = String(value);
                slider.setAttribute('aria-label', tt(labelText));
                const readout = document.createElement('span');
                readout.textContent = format(value);
                slider.addEventListener('input', event => {
                    const parsed = parseInt(event.target.value, 10);
                    readout.textContent = format(parsed);
                    onInput(parsed);
                });
                group.appendChild(label);
                group.appendChild(slider);
                group.appendChild(readout);
                return group;
            };

            const formatPan = value => value === 0
                ? tt('Center') : (value > 0 ? `R${value}` : `L${-value}`);

            controls.appendChild(makeInlineControl('Volume', 0, 100, currentVolume, v => `${v}%`, value => {
                currentVolume = value;
                if (gainNode) gainNode.gain.value = value / 100;
                else audioElement.volume = value / 100;
            }));
            controls.appendChild(makeInlineControl('Pitch', 50, 150, currentPitch, v => `${v}%`, value => {
                currentPitch = value;
                audioElement.playbackRate = value / 100;
                audioElement.preservesPitch = false;
            }));
            controls.appendChild(makeInlineControl('Pan', -100, 100, currentPan, formatPan, value => {
                currentPan = value;
                if (pannerNode) pannerNode.pan.value = value / 100;
            }));
        }
        body.appendChild(controls);

        // ── Track list with alphabet rail ────────────────────────────────
        const listContainer = document.createElement('div');
        listContainer.style.cssText = `
            display: flex;
            flex: 1;
            min-height: 160px;
            border: 1px solid var(--color-border-input);
            border-radius: 4px;
            margin-top: 12px;
            overflow: hidden;
        `;
        const rail = document.createElement('div');
        rail.className = 'audio-scroll';
        rail.style.cssText = `
            width: 52px;
            background-color: var(--color-bg-list-item);
            border-right: 1px solid var(--color-border);
            display: flex;
            flex-direction: column;
            overflow-y: auto;
            padding: 2px 2px;
        `;
        const list = document.createElement('div');
        list.className = 'audio-scroll';
        list.setAttribute('role', 'listbox');
        list.style.cssText = 'background: var(--color-bg-surface); flex: 1; overflow-y: auto;';
        listContainer.appendChild(rail);
        listContainer.appendChild(list);
        body.appendChild(listContainer);

        // Album art loads lazily, only for rows that scroll into view.
        const artObserver = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                const img = entry.target;
                artObserver.unobserve(img);
                coverFor(img.dataset.artPath).then(url => {
                    if (url) img.src = url;
                });
            }
        }, { root: list, rootMargin: '200px' });

        const refreshSelection = () => {
            list.querySelectorAll('.audio-track-item').forEach(row => {
                const selected = (row.dataset.fileName || '') === selectedFile;
                row.classList.toggle('playing', selected);
                row.setAttribute('aria-selected', String(selected));
            });
            updateInfo();
            updateButtons();
        };

        const selectTrack = name => {
            const changed = name !== selectedFile;
            selectedFile = name;
            refreshSelection();
            if (!name) {
                stopAudio();
            } else if (changed || !isPlaying) {
                playSelected();
            }
        };

        const finish = () => {
            releaseAudio();
            artObserver.disconnect();
            overlay.remove();
            if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus();
        };

        const confirm = () => {
            finish();
            options.onOk({
                name: selectedFile,
                volume: currentVolume,
                pitch: currentPitch,
                pan: currentPan
            });
        };

        const cancel = () => {
            finish();
            if (options.onCancel) options.onCancel();
        };

        const makeRow = (name, absolutePath, displayName = name, depth = 0) => {
            const row = document.createElement('div');
            row.className = 'audio-track-item';
            row.dataset.fileName = name;
            row.tabIndex = 0;
            row.setAttribute('role', 'option');
            if (depth > 0) row.style.paddingLeft = `${12 + depth * 14}px`;
            const art = document.createElement('img');
            art.className = 'track-art track-art-small';
            art.alt = '';
            art.draggable = false;
            art.src = placeholderFor(name || null);
            if (absolutePath) {
                art.dataset.artPath = absolutePath;
                if (name === selectedFile) {
                    coverFor(absolutePath).then(url => {
                        if (url && art.dataset.artPath === absolutePath) art.src = url;
                    });
                } else {
                    artObserver.observe(art);
                }
            }
            const label = document.createElement('span');
            label.className = 'track-label';
            label.textContent = displayName || tt('(None)');
            row.appendChild(art);
            row.appendChild(label);
            row.addEventListener('click', () => selectTrack(name));
            row.addEventListener('dblclick', () => {
                selectedFile = name;
                confirm();
            });
            row.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                selectTrack(name);
            });
            return row;
        };

        const folderTree = root.RRPickerIndex.buildFolderTree(files.map(file => file.name));
        const openFolders = new Set(root.RRPickerIndex.foldersLeadingTo(selectedFile));
        let activeTabLetter = null;

        const renderTrackList = () => {
            list.querySelectorAll('img[data-art-path]').forEach(image => artObserver.unobserve(image));
            list.innerHTML = '';
            rail.innerHTML = '';
            activeTabLetter = null;
            list.appendChild(makeRow('', null));

            const railTargets = [];
            const renderFolder = (folder, depth) => {
                const open = openFolders.has(folder.path);
                const header = document.createElement('div');
                header.className = 'audio-folder-section';
                header.dataset.folder = folder.path;
                header.tabIndex = 0;
                header.setAttribute('role', 'button');
                header.setAttribute('aria-expanded', String(open));
                header.setAttribute('data-rr-i18n-skip', '1');
                header.textContent = `${open ? '▾' : '▸'} ${folder.name} (${folder.total})`;
                header.style.cssText = `padding:6px 12px 6px ${12 + depth * 14}px;`
                    + 'background:var(--color-bg-panel);color:var(--color-accent-hover);'
                    + 'border-bottom:1px solid var(--color-border);font-size:12px;font-weight:bold;cursor:pointer;';
                const setOpen = nextOpen => {
                    if (nextOpen) openFolders.add(folder.path);
                    else openFolders.delete(folder.path);
                    renderTrackList();
                    Array.from(list.querySelectorAll('.audio-folder-section'))
                        .find(candidate => candidate.dataset.folder === folder.path)
                        ?.focus({ preventScroll: true });
                };
                header.addEventListener('click', () => setOpen(!openFolders.has(folder.path)));
                header.addEventListener('keydown', event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setOpen(!openFolders.has(folder.path));
                    } else if (event.key === 'ArrowRight' && !open) {
                        event.preventDefault();
                        setOpen(true);
                    } else if (event.key === 'ArrowLeft' && open) {
                        event.preventDefault();
                        setOpen(false);
                    }
                });
                list.appendChild(header);
                if (!open) return;
                for (const child of folder.folders) renderFolder(child, depth + 1);
                for (const name of folder.files.slice().sort(compareNames)) {
                    const record = fileByName.get(name);
                    if (record) list.appendChild(makeRow(
                        name, record.absolutePath, name.split('/').pop(), depth + 1));
                }
            };

            for (const folder of folderTree.folders) {
                railTargets.push({ folder });
                renderFolder(folder, 0);
            }

            let currentLetter = null;
            for (const name of folderTree.files.slice().sort(compareNames)) {
                const file = fileByName.get(name);
                if (!file) continue;
                const letter = sectionKey(file.name);
                if (letter !== currentLetter) {
                    currentLetter = letter;
                    railTargets.push({ letter });
                    const letterHeader = document.createElement('div');
                    letterHeader.className = 'letter-section';
                    letterHeader.dataset.letter = letter;
                    letterHeader.textContent = letter;
                    letterHeader.style.cssText = `
                        font-weight: bold;
                        font-size: 14px;
                        color: var(--color-accent-hover);
                        margin-top: 12px;
                        margin-bottom: 6px;
                        padding: 0 12px 4px 12px;
                        border-bottom: 1px solid var(--color-border);
                    `;
                    list.appendChild(letterHeader);
                }
                list.appendChild(makeRow(file.name, file.absolutePath));
            }

            railTargets.forEach((target, index) => {
                const tab = document.createElement('button');
                if (target.folder) {
                    tab.textContent = sectionKey(target.folder.name);
                    tab.title = target.folder.name;
                    tab.dataset.folder = target.folder.path;
                    tab.setAttribute('data-rr-i18n-skip', '1');
                } else {
                    tab.textContent = target.letter;
                    tab.dataset.letter = target.letter;
                }
                tab.style.cssText = `
                    padding: 1px 4px;
                    background-color: var(--color-bg-input-alt);
                    color: var(--color-text-strong);
                    border: none;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 10px;
                    transition: background-color 0.15s;
                    text-align: center;
                    min-height: 17px;
                    height: 17px;
                    font-weight: bold;
                    line-height: 15px;
                    margin-bottom: ${index < railTargets.length - 1 ? '1px' : '0px'};
                `;
                tab.addEventListener('click', () => {
                    if (target.folder && !openFolders.has(target.folder.path)) {
                        openFolders.add(target.folder.path);
                        renderTrackList();
                    }
                    const selector = target.folder
                        ? `.audio-folder-section[data-folder="${CSS.escape(target.folder.path)}"]`
                        : `.letter-section[data-letter="${CSS.escape(target.letter)}"]`;
                    list.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
                tab.addEventListener('mouseenter', () => {
                    if (!tab.classList.contains('active')) {
                        tab.style.backgroundColor = 'var(--color-accent-shadow)';
                        tab.style.color = 'var(--color-accent-hover)';
                    }
                });
                tab.addEventListener('mouseleave', () => {
                    if (!tab.classList.contains('active')) {
                        tab.style.backgroundColor = 'var(--color-bg-input-alt)';
                        tab.style.color = 'var(--color-text-strong)';
                    }
                });
                rail.appendChild(tab);
            });
            refreshSelection();
        };
        renderTrackList();

        list.addEventListener('scroll', () => {
            const containerTop = list.getBoundingClientRect().top;
            let visibleLetter = null;
            list.querySelectorAll('.letter-section').forEach(section => {
                if (section.getBoundingClientRect().top - containerTop <= 100) {
                    visibleLetter = section.dataset.letter;
                }
            });
            if (visibleLetter && visibleLetter !== activeTabLetter) {
                activeTabLetter = visibleLetter;
                rail.querySelectorAll('button').forEach(tab => {
                    const active = tab.dataset.letter === visibleLetter;
                    tab.classList.toggle('active', active);
                    tab.style.backgroundColor = active
                        ? 'var(--color-accent-hover)' : 'var(--color-bg-input-alt)';
                    tab.style.color = active
                        ? 'var(--color-bg-deep)' : 'var(--color-text-strong)';
                });
            }
        });

        // ── Footer ───────────────────────────────────────────────────────
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 12px 16px;
            border-top: 1px solid var(--color-border);
            background-color: var(--color-bg-panel);
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            border-radius: 0 0 8px 8px;
        `;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = tt('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.onclick = cancel;

        const okBtn = document.createElement('button');
        okBtn.textContent = tt('OK');
        okBtn.className = 'rr-button-primary';
        okBtn.onclick = confirm;

        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        modal.appendChild(footer);

        closeX.onclick = cancel;
        overlay.addEventListener('mousedown', event => {
            // A click on the backdrop no longer closes the dialog: an accidental
            // click beside it must never cost in-progress work. Close deliberately.
        });
        overlay.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                cancel();
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

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        refreshSelection();
        const selectedRow = list.querySelector('.audio-track-item.playing');
        if (selectedRow) selectedRow.scrollIntoView({ block: 'center' });
        setTimeout(() => (selectedRow || list.querySelector('.audio-track-item') || closeX).focus(), 0);
    }

    const api = { open };
    root.RRAudioPickerModal = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
