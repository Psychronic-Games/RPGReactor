// RPG Reactor - Audio Player
// Handles audio playback and preview for BGM, BGS, ME, and SE

class AudioPlayer {
    constructor() {
        this.audioPlayer = null;
        this.currentProject = null;
    }

    setCurrentProject(project) {
        this.currentProject = project;
    }

    showAudioPlayer() {
        console.log('showAudioPlayer() called');

        // Show modal
        const modal = document.getElementById('audio-player-modal');
        console.log('Modal element:', modal);

        if (!modal) {
            console.error('audio-player-modal element not found!');
            return;
        }

        modal.style.display = 'flex';
        console.log('Modal display set to flex');

        // Initialize audio player if not already done
        if (!this.audioPlayer) {
            this.audioPlayer = {
                audio: new Audio(),
                audioContext: null,
                gainNode: null,
                panNode: null,
                sourceNode: null,
                currentTrack: null,
                currentType: 'bgm',
                tracks: {},
                playing: false,
                loop: false
            };

            // Initialize Web Audio API for pitch and pan control
            this.initWebAudio();

            // Set up audio event listeners
            this.audioPlayer.audio.addEventListener('timeupdate', () => {
                this.updateAudioTime();
            });

            this.audioPlayer.audio.addEventListener('ended', () => {
                if (this.audioPlayer.loop) {
                    this.audioPlayer.audio.currentTime = 0;
                    this.audioPlayer.audio.play();
                } else {
                    this.stopAudio();
                }
            });

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
                this.audioPlayer.audio.volume = volume;
                if (this.audioPlayer.gainNode) {
                    this.audioPlayer.gainNode.gain.value = volume;
                }
                document.getElementById('volume-value').textContent = e.target.value + '%';
            });

            // Pitch control
            const pitchSlider = document.getElementById('pitch-slider');
            pitchSlider.addEventListener('input', (e) => {
                const pitch = e.target.value / 100;
                this.audioPlayer.audio.playbackRate = pitch;
                document.getElementById('pitch-value').textContent = e.target.value + '%';
            });

            // Pan control
            const panSlider = document.getElementById('pan-slider');
            panSlider.addEventListener('input', (e) => {
                const pan = e.target.value / 100;
                if (this.audioPlayer.panNode) {
                    this.audioPlayer.panNode.pan.value = pan;
                }
                const panText = pan === 0 ? 'Center' : (pan > 0 ? `R${Math.abs(e.target.value)}` : `L${Math.abs(e.target.value)}`);
                document.getElementById('pan-value').textContent = panText;
            });

            // Tab switching
            const tabs = document.querySelectorAll('.audio-tab');
            tabs.forEach(tab => {
                tab.addEventListener('click', (e) => {
                    const type = e.target.dataset.type;
                    this.switchAudioType(type);
                });
            });

            // Set initial values
            this.audioPlayer.audio.volume = 1.0;
            this.audioPlayer.audio.playbackRate = 1.0;

            // Update UI to reflect initial values
            document.getElementById('volume-slider').value = 100;
            document.getElementById('volume-value').textContent = '100%';
            document.getElementById('pitch-slider').value = 100;
            document.getElementById('pitch-value').textContent = '100%';
        }

        // Load tracks for current type
        if (this.currentProject) {
            this.loadAudioTracks(this.audioPlayer.currentType);
        }
    }

    initWebAudio() {
        try {
            this.audioPlayer.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.audioPlayer.gainNode = this.audioPlayer.audioContext.createGain();
            this.audioPlayer.panNode = this.audioPlayer.audioContext.createStereoPanner();

            // Connect: source -> gain -> pan -> destination
            this.audioPlayer.gainNode.connect(this.audioPlayer.panNode);
            this.audioPlayer.panNode.connect(this.audioPlayer.audioContext.destination);

            // Connect audio element to Web Audio
            if (!this.audioPlayer.sourceNode) {
                this.audioPlayer.sourceNode = this.audioPlayer.audioContext.createMediaElementSource(this.audioPlayer.audio);
                this.audioPlayer.sourceNode.connect(this.audioPlayer.gainNode);
            }
        } catch (e) {
            console.warn('Web Audio API not available, pan control will not work:', e);
        }
    }

    toggleLoop() {
        this.audioPlayer.loop = !this.audioPlayer.loop;
        const btn = document.getElementById('btn-loop');
        btn.textContent = this.audioPlayer.loop ? '🔁 Loop: On' : '🔁 Loop: Off';
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
            document.getElementById('audio-track-list').innerHTML = `<p style="color: #999; padding: 20px; text-align: center;">No ${type.toUpperCase()} folder found</p>`;
            return;
        }

        // Read all audio files
        const files = fs.readdirSync(audioPath);
        const audioFiles = files.filter(file =>
            file.endsWith('.ogg') || file.endsWith('.m4a') || file.endsWith('.mp3')
        );

        if (audioFiles.length === 0) {
            document.getElementById('audio-track-list').innerHTML = `<p style="color: #999; padding: 20px; text-align: center;">No ${type.toUpperCase()} files found</p>`;
            return;
        }

        // Store tracks for this type
        // Convert filesystem path to file:// URL for HTML5 Audio
        this.audioPlayer.tracks[type] = audioFiles.map(file => {
            const filePath = path.join(audioPath, file);
            // Convert to file:// URL - use proper URL encoding
            const fileUrl = 'file://' + filePath.replace(/\\/g, '/');
            return {
                name: file,
                path: fileUrl,
                type: type
            };
        });

        // Render track list
        let html = '';
        for (const track of this.audioPlayer.tracks[type]) {
            const isPlaying = this.audioPlayer.currentTrack && this.audioPlayer.currentTrack.path === track.path;
            html += `<div class="audio-track-item ${isPlaying ? 'playing' : ''}" data-track="${track.name}" data-type="${type}">${track.name}</div>`;
        }

        const trackListEl = document.getElementById('audio-track-list');
        trackListEl.innerHTML = html;

        // Add click listeners to tracks
        const trackItems = trackListEl.querySelectorAll('.audio-track-item');
        trackItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const trackName = e.target.dataset.track;
                const trackType = e.target.dataset.type;
                this.selectAudioTrack(trackName, trackType);
            });
        });
    }

    selectAudioTrack(trackName, trackType) {
        if (!this.audioPlayer.tracks[trackType]) return;

        const track = this.audioPlayer.tracks[trackType].find(t => t.name === trackName);
        if (!track) return;

        // Stop current playback
        this.audioPlayer.audio.pause();
        this.audioPlayer.audio.currentTime = 0;

        // Load new track
        this.audioPlayer.audio.src = track.path;
        this.audioPlayer.currentTrack = track;

        // Update UI
        document.getElementById('current-track-name').textContent = `[${track.type.toUpperCase()}] ${track.name}`;
        document.getElementById('track-time').textContent = '0:00 / 0:00';

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

        // Auto-play
        this.playAudio();
    }

    playAudio() {
        if (!this.audioPlayer.currentTrack) return;
        this.audioPlayer.audio.play();
        this.audioPlayer.playing = true;
    }

    pauseAudio() {
        this.audioPlayer.audio.pause();
        this.audioPlayer.playing = false;
    }

    stopAudio() {
        this.audioPlayer.audio.pause();
        this.audioPlayer.audio.currentTime = 0;
        this.audioPlayer.playing = false;
        this.updateAudioTime();
    }

    updateAudioTime() {
        if (!this.audioPlayer.currentTrack) return;

        const current = this.audioPlayer.audio.currentTime;
        const duration = this.audioPlayer.audio.duration || 0;

        const formatTime = (seconds) => {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        };

        document.getElementById('track-time').textContent =
            `${formatTime(current)} / ${formatTime(duration)}`;
    }
}
