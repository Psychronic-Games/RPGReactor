// RPG Reactor - Audio Player
// Handles audio playback and preview for BGM, BGS, ME, and SE

class AudioPlayer {
    constructor() {
        this.audioPlayer = null;
        this.currentProject = null;

        // Initialize audio player immediately so it's available for event commands
        this.initializeAudioPlayer();
        window.addEventListener('rr-language-changed', () => {
            this.updateLoopButton();
            this.updatePanValueLabel();
        });
    }

    _t(key) {
        return window.I18n ? window.I18n.t(key) : key;
    }

    setCurrentProject(project) {
        this.currentProject = project;
    }

    initializeAudioPlayer() {
        if (this.audioPlayer) return; // Already initialized

        this.audioPlayer = {
            // Separate audio channels for each type
            channels: {
                bgm: { audio: new Audio(), gainNode: null, panNode: null, sourceNode: null, currentTrack: null, playing: false },
                bgs: { audio: new Audio(), gainNode: null, panNode: null, sourceNode: null, currentTrack: null, playing: false },
                me: { audio: new Audio(), gainNode: null, panNode: null, sourceNode: null, currentTrack: null, playing: false },
                se: { audio: new Audio(), gainNode: null, panNode: null, sourceNode: null, currentTrack: null, playing: false }
            },
            audioContext: null,
            currentType: 'bgm',
            tracks: {},
            loop: true,
            htmlAudioOnly: this.shouldUseHtmlAudioOnly()
        };

        // Initialize Web Audio API for pitch and pan control
        this.initWebAudio();

        // Set up audio event listeners for each channel
        ['bgm', 'bgs', 'me', 'se'].forEach(channelType => {
            const channel = this.audioPlayer.channels[channelType];

            channel.audio.addEventListener('timeupdate', () => {
                // Only update UI if this is the currently active channel in the UI
                if (this.audioPlayer.currentType === channelType) {
                    this.updateAudioTime();
                    this.updateSeekSlider();
                }
            });

            channel.audio.addEventListener('loadedmetadata', () => {
                // Only update UI if this is the currently active channel in the UI
                if (this.audioPlayer.currentType === channelType) {
                    this.updateSeekDuration();

                    // Apply current slider settings when metadata loads
                    const volumeSlider = document.getElementById('volume-slider');
                    const pitchSlider = document.getElementById('pitch-slider');
                    const panSlider = document.getElementById('pan-slider');

                    if (volumeSlider) {
                        const volume = volumeSlider.value / 100;
                        channel.audio.volume = volume;
                        if (channel.gainNode) {
                            channel.gainNode.gain.value = volume;
                        }
                    }

                    if (pitchSlider) {
                        const pitch = pitchSlider.value / 100;
                        channel.audio.playbackRate = pitch;
                        channel.audio.preservesPitch = false;
                    }

                    if (panSlider) {
                        const pan = panSlider.value / 100;
                        if (channel.panNode) {
                            channel.panNode.pan.value = pan;
                        }
                    }
                }
            });

            channel.audio.addEventListener('ended', () => {
                // Don't manually loop - let the browser handle it via audio.loop property
                // Just update playing status when audio ends (if not looping)
                if (!channel.audio.loop) {
                    channel.playing = false;
                }
            });

            channel.audio.addEventListener('error', () => {
                channel.playing = false;
                console.warn(`Failed to load ${channelType.toUpperCase()} audio:`, channel.audio.error);
            });
        });

        // Set initial values for all channels
        ['bgm', 'bgs', 'me', 'se'].forEach(channelType => {
            const channel = this.audioPlayer.channels[channelType];
            channel.audio.volume = 1.0;
            channel.audio.playbackRate = 1.0;
        });
    }

    /**
     * Get the channel for a specific audio type
     */
    getChannel(type) {
        return this.audioPlayer.channels[type] || this.audioPlayer.channels['bgm'];
    }

    /**
     * Get the currently active channel (for UI display)
     */
    getCurrentChannel() {
        return this.getChannel(this.audioPlayer.currentType);
    }

    shouldUseHtmlAudioOnly() {
        try {
            if (typeof process === 'undefined' || process.platform !== 'win32') return false;

            const env = process.env || {};
            return Boolean(env.WINEPREFIX || env.WINELOADERNOEXEC || env.WINEDEBUG);
        } catch (e) {
            return false;
        }
    }

    toAudioSource(filePath) {
        if (!filePath || /^(file|https?):\/\//i.test(filePath)) return filePath;

        try {
            const { pathToFileURL } = require('url');
            if (pathToFileURL) return pathToFileURL(filePath).href;
        } catch (e) {
            // Fall through to a minimal NW.js-safe file URL.
        }

        let normalized = String(filePath).replace(/\\/g, '/');
        if (/^[A-Za-z]:\//.test(normalized)) {
            normalized = '/' + normalized;
        }
        return 'file://' + encodeURI(normalized).replace(/#/g, '%23');
    }

    playChannel(channel, label = 'audio') {
        try {
            const playPromise = channel.audio.play();
            channel.playing = true;

            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(err => {
                    channel.playing = false;
                    console.warn(`Failed to play ${label}:`, err);
                });
            }
        } catch (err) {
            channel.playing = false;
            console.warn(`Failed to play ${label}:`, err);
        }
    }

    showAudioPlayer() {
        // Show modal
        const modal = document.getElementById('audio-player-modal');

        if (!modal) {
            return;
        }

        modal.style.display = 'flex';

        // Ensure audio player is initialized
        this.initializeAudioPlayer();

        // Set up UI event listeners if not already done
        if (!this.uiInitialized) {
            this.initializeUI();
            this.uiInitialized = true;
        }

        // Detect which channel is currently playing and switch to that tab
        // Priority: BGM > BGS > ME > SE
        let activeChannelType = null;
        const priorities = ['bgm', 'bgs', 'me', 'se'];
        for (const type of priorities) {
            const channel = this.getChannel(type);
            if (channel.currentTrack && channel.playing) {
                activeChannelType = type;
                break;
            }
        }

        // If we found an active channel, switch to it
        if (activeChannelType) {
            this.audioPlayer.currentType = activeChannelType;
            this.switchAudioType(activeChannelType);
        }

        // Update UI to show current track if one is playing in the current channel
        const currentChannel = this.getCurrentChannel();
        if (currentChannel.currentTrack) {
            const trackName = currentChannel.currentTrack.name;
            const trackType = currentChannel.currentTrack.type;

            // Show track type prefix
            document.getElementById('current-track-name').textContent = `[${trackType.toUpperCase()}] ${trackName}`;
        }

        // Load tracks for current type
        if (this.currentProject) {
            this.loadAudioTracks(this.audioPlayer.currentType);
        } else {
            // Show a message in the track list
            const trackList = document.getElementById('audio-track-list');
            if (trackList) {
                trackList.innerHTML = `<p style="color: #ff9800; padding: 20px; text-align: center;">No project loaded.<br>Please open or create a project first.</p>`;
            }
            // Clear alphabet tabs
            const alphTabs = document.getElementById('audio-alphabet-tabs');
            if (alphTabs) {
                alphTabs.innerHTML = '';
            }
        }
    }

    initializeUI() {
        // Set up button listeners
        document.getElementById('btn-play').addEventListener('click', () => {
            this.playAudio();
        });

        document.getElementById('btn-pause').addEventListener('click', () => {
            this.pauseAudio();
        });

        document.getElementById('btn-stop').addEventListener('click', () => {
            this.stopAudio();
        });

        document.getElementById('btn-loop').addEventListener('click', () => {
            this.toggleLoop();
        });

        // Volume control
        const volumeSlider = document.getElementById('volume-slider');
        volumeSlider.addEventListener('input', (e) => {
            const volume = e.target.value / 100;
            const currentChannel = this.getCurrentChannel();
            if (currentChannel) {
                currentChannel.audio.volume = volume;
                if (currentChannel.gainNode) {
                    currentChannel.gainNode.gain.value = volume;
                }
            }
            document.getElementById('volume-value').textContent = e.target.value + '%';
        });

        // Pitch control
        const pitchSlider = document.getElementById('pitch-slider');
        pitchSlider.addEventListener('input', (e) => {
            const pitch = e.target.value / 100;

            // Smooth pitch transition to reduce glitching
            if (this.pitchUpdateTimer) {
                cancelAnimationFrame(this.pitchUpdateTimer);
            }

            this.pitchUpdateTimer = requestAnimationFrame(() => {
                const currentChannel = this.getCurrentChannel();
                if (currentChannel) {
                    currentChannel.audio.playbackRate = pitch;
                    currentChannel.audio.preservesPitch = false;
                }
            });

            document.getElementById('pitch-value').textContent = e.target.value + '%';
        });

        // Pan control
        const panSlider = document.getElementById('pan-slider');
        panSlider.addEventListener('input', (e) => {
            const pan = e.target.value / 100;
            const currentChannel = this.getCurrentChannel();
            if (currentChannel && currentChannel.panNode) {
                currentChannel.panNode.pan.value = pan;
            }
            this.updatePanValueLabel();
        });

        // Tab switching
        const tabs = document.querySelectorAll('.audio-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const type = e.target.dataset.type;
                this.switchAudioType(type);
            });
        });

        // Seek slider
        const seekSlider = document.getElementById('seek-slider');
        seekSlider.addEventListener('mousedown', () => {
            seekSlider.dataset.seeking = 'true';
        });

        seekSlider.addEventListener('mouseup', () => {
            delete seekSlider.dataset.seeking;
        });

        seekSlider.addEventListener('input', (e) => {
            const percent = e.target.value;
            const currentChannel = this.getCurrentChannel();
            if (currentChannel) {
                const time = (percent / 100) * currentChannel.audio.duration;
                currentChannel.audio.currentTime = time;

                // Update the time display immediately
                const formatTime = (seconds) => {
                    if (isNaN(seconds)) return '0:00';
                    const mins = Math.floor(seconds / 60);
                    const secs = Math.floor(seconds % 60);
                    return `${mins}:${secs.toString().padStart(2, '0')}`;
                };
                document.getElementById('seek-current-time').textContent = formatTime(time);
            }
        });

        // Update UI to reflect initial values
        document.getElementById('volume-slider').value = 100;
        document.getElementById('volume-value').textContent = '100%';
        document.getElementById('pitch-slider').value = 100;
        document.getElementById('pitch-value').textContent = '100%';
        this.updatePanValueLabel();
        this.updateLoopButton();
    }

    updatePanValueLabel() {
        const panSlider = document.getElementById('pan-slider');
        const panValue = document.getElementById('pan-value');
        if (!panSlider || !panValue) return;
        const raw = parseInt(panSlider.value, 10) || 0;
        panValue.textContent = raw === 0 ? this._t('audio.center') : (raw > 0 ? `R${Math.abs(raw)}` : `L${Math.abs(raw)}`);
    }

    initWebAudio() {
        if (this.audioPlayer.htmlAudioOnly) return;

        try {
            const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextCtor) return;

            this.audioPlayer.audioContext = new AudioContextCtor({
                latencyHint: 'playback',
                sampleRate: 48000
            });

            // Create separate audio nodes for each channel
            ['bgm', 'bgs', 'me', 'se'].forEach(channelType => {
                const channel = this.audioPlayer.channels[channelType];

                channel.gainNode = this.audioPlayer.audioContext.createGain();
                channel.panNode = this.audioPlayer.audioContext.createStereoPanner
                    ? this.audioPlayer.audioContext.createStereoPanner()
                    : null;

                // Connect: source -> gain -> pan -> destination
                if (channel.panNode) {
                    channel.gainNode.connect(channel.panNode);
                    channel.panNode.connect(this.audioPlayer.audioContext.destination);
                } else {
                    channel.gainNode.connect(this.audioPlayer.audioContext.destination);
                }

                // Connect audio element to Web Audio
                if (!channel.sourceNode) {
                    channel.sourceNode = this.audioPlayer.audioContext.createMediaElementSource(channel.audio);
                    channel.sourceNode.connect(channel.gainNode);
                }
            });

        } catch (e) {
            // Web Audio API not available, pan control will not work
            this.audioPlayer.audioContext = null;
        }
    }

    toggleLoop() {
        this.audioPlayer.loop = !this.audioPlayer.loop;
        this.updateLoopButton();
    }

    updateLoopButton() {
        const btn = document.getElementById('btn-loop');
        if (!btn) return;
        btn.title = this.audioPlayer.loop ? this._t('audio.loopOn') : this._t('audio.loopOff');
        if (this.audioPlayer.loop) {
            btn.classList.add('active-toggle');
        } else {
            btn.classList.remove('active-toggle');
        }
    }

    switchAudioType(type) {
        this.audioPlayer.currentType = type;

        // Update tab UI
        const tabs = document.querySelectorAll('.audio-tab');
        tabs.forEach(tab => {
            if (tab.dataset.type === type) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // Update loop default based on type (SE should default to no loop)
        if (type === 'se') {
            this.audioPlayer.loop = false;
        } else {
            this.audioPlayer.loop = true;
        }
        // Update loop button UI
        this.updateLoopButton();

        // Update the displayed track name for this channel
        const currentChannel = this.getCurrentChannel();
        const trackNameEl = document.getElementById('current-track-name');
        if (trackNameEl) {
            if (currentChannel.currentTrack) {
                trackNameEl.textContent = `[${currentChannel.currentTrack.type.toUpperCase()}] ${currentChannel.currentTrack.name}`;
            } else {
                trackNameEl.textContent = 'No Track Selected';
            }
        }

        // Load tracks for this type
        if (this.currentProject) {
            this.loadAudioTracks(type);
        }
    }

    loadAudioTracks(type) {
        const fs = require('fs');
        const path = require('path');

        const audioPath = path.join(this.currentProject.path, 'audio', type);

        if (!fs.existsSync(audioPath)) {
            document.getElementById('audio-track-list').innerHTML = `<p style="color: var(--color-text-muted); padding: 20px; text-align: center;">No ${type.toUpperCase()} folder found</p>`;
            document.getElementById('audio-alphabet-tabs').innerHTML = '';
            return;
        }

        // Read all audio files
        const files = fs.readdirSync(audioPath);
        const audioFiles = files.filter(file =>
            file.endsWith('.ogg') || file.endsWith('.m4a') || file.endsWith('.mp3')
        );

        if (audioFiles.length === 0) {
            document.getElementById('audio-track-list').innerHTML = `<p style="color: var(--color-text-muted); padding: 20px; text-align: center;">No ${type.toUpperCase()} files found</p>`;
            document.getElementById('audio-alphabet-tabs').innerHTML = '';
            return;
        }

        // Sort files alphabetically
        audioFiles.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

        // Store tracks for this type
        // Convert filesystem path to file:// URL for HTML5 Audio
        this.audioPlayer.tracks[type] = audioFiles.map(file => {
            const filePath = path.join(audioPath, file);
            const fileUrl = this.toAudioSource(filePath);
            return {
                name: file,
                path: fileUrl,
                type: type
            };
        });

        // Get first letters that exist in the file list
        const firstLetters = new Set();
        audioFiles.forEach(name => {
            const firstChar = name.charAt(0).toUpperCase();
            if (/[A-Z]/.test(firstChar)) {
                firstLetters.add(firstChar);
            } else {
                firstLetters.add('#'); // For numbers and special chars
            }
        });

        const sortedLetters = Array.from(firstLetters).sort((a, b) => {
            if (a === '#') return -1;
            if (b === '#') return 1;
            return a.localeCompare(b);
        });

        // Render alphabet tabs
        const tabBar = document.getElementById('audio-alphabet-tabs');
        tabBar.innerHTML = '';

        sortedLetters.forEach((letter, index) => {
            const tab = document.createElement('button');
            tab.textContent = letter;
            tab.dataset.letter = letter;

            // Add margin between buttons except the last one
            const marginBottom = (index < sortedLetters.length - 1) ? '1px' : '0px';

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
                margin-bottom: ${marginBottom};
            `;

            tab.addEventListener('click', () => {
                this.scrollToLetter(letter);
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

            tabBar.appendChild(tab);
        });

        // Render track list with letter headers
        const trackListEl = document.getElementById('audio-track-list');
        trackListEl.innerHTML = '';

        let currentLetter = null;

        for (const track of this.audioPlayer.tracks[type]) {
            const firstChar = track.name.charAt(0).toUpperCase();
            const letter = /[A-Z]/.test(firstChar) ? firstChar : '#';

            // Add letter header if it's a new letter
            if (letter !== currentLetter) {
                currentLetter = letter;
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
                trackListEl.appendChild(letterHeader);
            }

            // Check if this track is playing in the current channel
            const currentChannel = this.getCurrentChannel();
            const isPlaying = currentChannel.currentTrack && currentChannel.currentTrack.path === track.path;
            const trackItem = document.createElement('div');
            trackItem.className = `audio-track-item ${isPlaying ? 'playing' : ''}`;
            trackItem.dataset.track = track.name;
            trackItem.dataset.type = type;
            trackItem.textContent = track.name;

            trackItem.addEventListener('click', (e) => {
                const trackName = e.target.dataset.track;
                const trackType = e.target.dataset.type;
                this.selectAudioTrack(trackName, trackType);
            });

            trackListEl.appendChild(trackItem);
        }

        // Scroll detection for active letter tab
        let currentActiveTab = null;
        trackListEl.addEventListener('scroll', () => {
            const sections = trackListEl.querySelectorAll('.letter-section');
            const containerTop = trackListEl.getBoundingClientRect().top;

            let activeTabLetter = null;
            sections.forEach(section => {
                const sectionTop = section.getBoundingClientRect().top;
                if (sectionTop - containerTop <= 100) {
                    activeTabLetter = section.dataset.letter;
                }
            });

            if (activeTabLetter && activeTabLetter !== currentActiveTab) {
                currentActiveTab = activeTabLetter;
                // Update tab highlighting
                tabBar.querySelectorAll('button').forEach(tab => {
                    if (tab.dataset.letter === activeTabLetter) {
                        tab.classList.add('active');
                        tab.style.backgroundColor = 'var(--color-accent-hover)';
                        tab.style.color = 'var(--color-bg-deep)';
                    } else {
                        tab.classList.remove('active');
                        tab.style.backgroundColor = 'var(--color-bg-input-alt)';
                        tab.style.color = 'var(--color-text-strong)';
                    }
                });
            }
        });
    }

    /**
     * Scroll to specific letter section in track list
     */
    scrollToLetter(letter) {
        const trackListEl = document.getElementById('audio-track-list');
        const letterSection = trackListEl.querySelector(`.letter-section[data-letter="${letter}"]`);
        if (letterSection) {
            letterSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    selectAudioTrack(trackName, trackType) {
        if (!this.audioPlayer.tracks[trackType]) return;

        const track = this.audioPlayer.tracks[trackType].find(t => t.name === trackName);
        if (!track) return;

        const currentChannel = this.getCurrentChannel();
        if (!currentChannel) return;

        // Stop current playback
        currentChannel.audio.pause();
        currentChannel.audio.currentTime = 0;

        // Load new track
        currentChannel.audio.src = this.toAudioSource(track.path);
        currentChannel.currentTrack = track;

        // Update UI
        document.getElementById('current-track-name').textContent = `[${track.type.toUpperCase()}] ${track.name}`;
        document.getElementById('track-time').textContent = '0:00 / 0:00';

        // Reset seek slider
        const seekSlider = document.getElementById('seek-slider');
        const seekCurrentTime = document.getElementById('seek-current-time');
        const seekDuration = document.getElementById('seek-duration');
        if (seekSlider) seekSlider.value = 0;
        if (seekCurrentTime) seekCurrentTime.textContent = '0:00';
        if (seekDuration) seekDuration.textContent = '0:00';

        // Enable buttons
        document.getElementById('btn-play').disabled = false;
        document.getElementById('btn-pause').disabled = false;
        document.getElementById('btn-stop').disabled = false;

        // Update track list styling
        const trackItems = document.querySelectorAll('.audio-track-item');
        trackItems.forEach(item => {
            if (item.dataset.track === trackName && item.dataset.type === trackType) {
                item.classList.add('playing');
            } else {
                item.classList.remove('playing');
            }
        });

        // Apply current slider settings to the new track
        const volumeSlider = document.getElementById('volume-slider');
        const pitchSlider = document.getElementById('pitch-slider');
        const panSlider = document.getElementById('pan-slider');

        if (volumeSlider) {
            const volume = volumeSlider.value / 100;
            currentChannel.audio.volume = volume;
            if (currentChannel.gainNode) {
                currentChannel.gainNode.gain.value = volume;
            }
        }

        if (pitchSlider) {
            const pitch = pitchSlider.value / 100;
            currentChannel.audio.playbackRate = pitch;
            currentChannel.audio.preservesPitch = false;
        }

        if (panSlider) {
            const pan = panSlider.value / 100;
            if (currentChannel.panNode) {
                currentChannel.panNode.pan.value = pan;
            }
        }

        // Apply loop setting
        currentChannel.audio.loop = this.audioPlayer.loop;

        // Auto-play
        this.playAudio();
    }

    playAudio() {
        const currentChannel = this.getCurrentChannel();
        if (!currentChannel || !currentChannel.currentTrack) return;

        // Resume audio context if it's suspended (required by browsers)
        if (this.audioPlayer.audioContext && this.audioPlayer.audioContext.state === 'suspended') {
            this.audioPlayer.audioContext.resume();
        }

        this.playChannel(currentChannel, currentChannel.currentTrack.name);
    }

    pauseAudio() {
        const currentChannel = this.getCurrentChannel();
        if (!currentChannel) return;

        currentChannel.audio.pause();
        currentChannel.playing = false;
    }

    stopAudio() {
        const currentChannel = this.getCurrentChannel();
        if (!currentChannel) return;

        currentChannel.audio.pause();
        currentChannel.audio.currentTime = 0;
        currentChannel.playing = false;
        this.updateAudioTime();
    }

    updateAudioTime() {
        const currentChannel = this.getCurrentChannel();
        if (!currentChannel || !currentChannel.currentTrack) return;

        const current = currentChannel.audio.currentTime;
        const duration = currentChannel.audio.duration || 0;

        const formatTime = (seconds) => {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        };

        document.getElementById('track-time').textContent =
            `${formatTime(current)} / ${formatTime(duration)}`;
    }

    updateSeekSlider() {
        const seekSlider = document.getElementById('seek-slider');
        const seekCurrentTime = document.getElementById('seek-current-time');

        if (!seekSlider || !seekCurrentTime) return;
        if (seekSlider.dataset.seeking) return; // Don't update while user is seeking

        const currentChannel = this.getCurrentChannel();
        if (!currentChannel) return;

        const current = currentChannel.audio.currentTime;
        const duration = currentChannel.audio.duration || 0;

        if (duration > 0) {
            const percent = (current / duration) * 100;
            seekSlider.value = percent;
        }

        const formatTime = (seconds) => {
            if (isNaN(seconds)) return '0:00';
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        };

        seekCurrentTime.textContent = formatTime(current);
    }

    updateSeekDuration() {
        const seekDuration = document.getElementById('seek-duration');
        if (!seekDuration) return;

        const currentChannel = this.getCurrentChannel();
        if (!currentChannel) return;

        const duration = currentChannel.audio.duration || 0;

        const formatTime = (seconds) => {
            if (isNaN(seconds)) return '0:00';
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        };

        seekDuration.textContent = formatTime(duration);
    }

    /**
     * External API methods for use by other components
     */

    /**
     * Play an audio file from a file path (for external components like AudioCommandEditor)
     * @param {string} filePath - Full file path to audio file
     * @param {object} params - Audio parameters (volume, pitch, pan, loop, audioType)
     */
    playExternal(filePath, params = {}) {
        if (!this.audioPlayer) {
            return;
        }

        // Get the appropriate channel based on audioType
        const audioType = params.audioType || 'bgm';
        const channel = this.getChannel(audioType);

        if (!channel) {
            return;
        }

        // Check if the same file is already loaded in this channel
        const fileUrl = this.toAudioSource(filePath);
        const isSameFile = (channel.audio.src === fileUrl) ||
                          (channel.currentTrack && channel.currentTrack.path === fileUrl);

        if (!isSameFile) {
            // Different file - load it and start from beginning
            channel.audio.pause();
            channel.audio.currentTime = 0;
            channel.audio.src = fileUrl;

            // Update current track info for this channel
            channel.currentTrack = {
                name: filePath.split('/').pop().split('\\').pop(),
                path: fileUrl,
                type: audioType
            };

            // Update UI if modal is open AND this is the currently displayed channel
            const modal = document.getElementById('audio-player-modal');
            if (modal && modal.style.display === 'flex' && this.audioPlayer.currentType === audioType) {
                document.getElementById('current-track-name').textContent = `[${audioType.toUpperCase()}] ${channel.currentTrack.name}`;

                // Update seek duration when metadata loads
                channel.audio.addEventListener('loadedmetadata', () => {
                    this.updateSeekDuration();
                }, { once: true });
            }
        }
        // If same file, don't reload or reset position - just update parameters and continue

        // Apply parameters (whether same file or new)
        if (params.volume !== undefined) {
            const normalizedVolume = params.volume / 100;
            channel.audio.volume = normalizedVolume;
            if (channel.gainNode) {
                channel.gainNode.gain.value = normalizedVolume;
            }
        }

        if (params.pitch !== undefined) {
            channel.audio.playbackRate = params.pitch / 100;
        }

        if (params.pan !== undefined && channel.panNode) {
            channel.panNode.pan.value = params.pan / 100;
        }

        if (params.loop !== undefined) {
            channel.audio.loop = params.loop;
        } else {
            // Default loop behavior: SE doesn't loop, others do
            channel.audio.loop = (audioType !== 'se');
        }

        // Resume audio context if it's suspended (required by browsers)
        if (this.audioPlayer.audioContext && this.audioPlayer.audioContext.state === 'suspended') {
            this.audioPlayer.audioContext.resume();
        }

        // Play (will resume from current position if same file)
        this.playChannel(channel, channel.currentTrack ? channel.currentTrack.name : filePath);
    }

    /**
     * Stop external playback
     * @param {string} type - Optional: specific channel type to stop ('bgm', 'bgs', 'me', 'se'). If not provided, stops all channels.
     */
    stopExternal(type = null) {
        if (!this.audioPlayer) return;

        if (type) {
            // Stop specific channel
            const channel = this.getChannel(type);
            if (channel) {
                channel.audio.pause();
                channel.audio.currentTime = 0;
                channel.playing = false;
            }
        } else {
            // Stop all channels
            ['bgm', 'bgs', 'me', 'se'].forEach(channelType => {
                const channel = this.getChannel(channelType);
                if (channel) {
                    channel.audio.pause();
                    channel.audio.currentTime = 0;
                    channel.playing = false;
                }
            });
        }
    }

    /**
     * Get the audio element for direct manipulation by external components
     * Returns the channel for the current type being viewed in UI
     */
    getAudioElement() {
        if (!this.audioPlayer) return null;
        const currentChannel = this.getCurrentChannel();
        return currentChannel ? currentChannel.audio : null;
    }

    /**
     * Get the audio element for a specific channel type
     */
    getChannelAudio(type) {
        const channel = this.getChannel(type);
        return channel ? channel.audio : null;
    }

    /**
     * Get the Web Audio API nodes for advanced audio processing
     * Returns nodes for the currently displayed channel
     */
    getAudioNodes() {
        if (!this.audioPlayer) return null;
        const currentChannel = this.getCurrentChannel();
        if (!currentChannel) return null;

        return {
            audioContext: this.audioPlayer.audioContext,
            gainNode: currentChannel.gainNode,
            panNode: currentChannel.panNode,
            sourceNode: currentChannel.sourceNode
        };
    }

    /**
     * Check if audio is currently playing in the current channel
     */
    isPlaying() {
        if (!this.audioPlayer) return false;
        const currentChannel = this.getCurrentChannel();
        return currentChannel ? currentChannel.playing : false;
    }

    /**
     * Check if a specific channel is playing
     */
    isChannelPlaying(type) {
        if (!this.audioPlayer) return false;
        const channel = this.getChannel(type);
        return channel ? channel.playing : false;
    }
}
