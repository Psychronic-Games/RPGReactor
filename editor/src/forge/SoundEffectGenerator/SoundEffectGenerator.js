/**
 * SoundEffectGenerator - Forge tool for procedural SFX (sfxr-style + Web Audio).
 *
 * Synthesis graph (built fresh per play/render call):
 *
 *   main source (osc | noise | karplus-strong)
 *        ▲ vibratoLFO                  ┃
 *                              subOsc (sine, optional)
 *                                      ┃
 *                                   mixer
 *                                      ┃
 *                                 highpass
 *                                      ┃
 *                              lowpass (Q, sweep)
 *                                      ┃
 *                               distortion shaper
 *                                      ┃
 *                              env gain (ADSR)
 *                                      ┃
 *                         tremoloGain ← tremoloLFO
 *                              ┌───────┴───────┐
 *                           dryGain        convolver → wetGain
 *                              └───────┬───────┘
 *                                 destination
 */

// ─── Karplus-Strong string synthesis ────────────────────────────────────────
// Pre-generates the KS output into an AudioBuffer. Pitch envelope and slide
// are applied via BufferSource.playbackRate so the frequency stays correct.
function generateKarplusStrong(ctx, p, noiseDuration) {
    const sampleRate = ctx.sampleRate;
    const freq = Math.max(20, Math.min(4000, p.baseFreq));
    const bufSize = Math.ceil(sampleRate * Math.min(noiseDuration + 0.5, 10));
    const delayLen = Math.max(2, Math.round(sampleRate / freq));
    const dampening = Math.max(0.9, Math.min(0.9999, p.ksDampening !== undefined ? p.ksDampening : 0.995));
    const hardness = Math.max(0, Math.min(1, p.distortion || 0));

    // Excitation: noise buffer, smoothed for mellow pluck or raw for bright/clicky.
    const ring = new Float32Array(delayLen);
    for (let i = 0; i < delayLen; i++) ring[i] = Math.random() * 2 - 1;
    const smoothPasses = Math.round((1 - hardness) * 4);
    for (let pass = 0; pass < smoothPasses; pass++) {
        for (let i = 1; i < delayLen; i++) ring[i] = (ring[i] + ring[i - 1]) * 0.5;
    }

    const audioBuf = ctx.createBuffer(1, bufSize, sampleRate);
    const data = audioBuf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
        const idx = i % delayLen;
        const nextIdx = (i + 1) % delayLen;
        data[i] = ring[idx];
        ring[idx] = (ring[idx] + ring[nextIdx]) * 0.5 * dampening;
    }
    return audioBuf;
}

// ─── Archetype seeds ─────────────────────────────────────────────────────────
// lockedParams: params the Randomize button will NOT jitter for this archetype.
const ARCHETYPES = [
    {
        id: 'custom', name: 'Custom', category: 'Starter',
        description: 'Blank slate — every slider at neutral position.',
        lockedParams: [],
        params: {
            waveform: 'square',
            attack: 0.01, decay: 0.05, sustain: 0.10, release: 0.10, sustainLevel: 0.7,
            baseFreq: 440, freqSlide: 0,
            pitchPeak: 0, pitchDecayTime: 0.1,
            vibratoDepth: 0, vibratoRate: 5,
            tremoloDepth: 0, tremoloRate: 5,
            squareDuty: 0.5,
            subOscLevel: 0, subOscDetune: -12, ksDampening: 0.995,
            lowpassFreq: 8000, lowpassEnd: 8000, lowpassQ: 1, highpassFreq: 0,
            distortion: 0, volume: 0.5,
            noiseMix: 0, reverb: 0.15, reverbDecay: 1.5
        }
    },
    {
        id: 'pickup', name: 'Pickup', category: 'SFX',
        description: 'Bright coin-grab. Quick, high, with a pitch lift.',
        lockedParams: ['waveform', 'attack', 'decay'],
        params: {
            waveform: 'square',
            attack: 0.002, decay: 0.04, sustain: 0.05, release: 0.10, sustainLevel: 0.6,
            baseFreq: 880, freqSlide: 0.6,
            pitchPeak: 0, pitchDecayTime: 0.05,
            vibratoDepth: 0, vibratoRate: 6,
            tremoloDepth: 0, tremoloRate: 5,
            squareDuty: 0.5,
            subOscLevel: 0, subOscDetune: -12, ksDampening: 0.995,
            lowpassFreq: 10000, lowpassEnd: 10000, lowpassQ: 1, highpassFreq: 200,
            distortion: 0, volume: 0.45,
            noiseMix: 0, reverb: 0.1, reverbDecay: 1.0
        }
    },
    {
        id: 'laser', name: 'Laser/Shoot', category: 'SFX',
        description: 'Sawtooth zap with downward pitch slide.',
        lockedParams: ['waveform'],
        params: {
            waveform: 'sawtooth',
            attack: 0.002, decay: 0.03, sustain: 0.05, release: 0.08, sustainLevel: 0.5,
            baseFreq: 1200, freqSlide: -0.7,
            pitchPeak: 6, pitchDecayTime: 0.03,
            vibratoDepth: 0, vibratoRate: 6,
            tremoloDepth: 0, tremoloRate: 5,
            squareDuty: 0.5,
            subOscLevel: 0, subOscDetune: -12, ksDampening: 0.995,
            lowpassFreq: 8000, lowpassEnd: 3000, lowpassQ: 3, highpassFreq: 200,
            distortion: 0.1, volume: 0.4,
            noiseMix: 0.05, reverb: 0.1, reverbDecay: 0.8
        }
    },
    {
        id: 'explosion', name: 'Explosion', category: 'SFX',
        description: 'Noise burst with a slow filter sweep down.',
        lockedParams: ['waveform', 'highpassFreq'],
        params: {
            waveform: 'noise',
            attack: 0.005, decay: 0.1, sustain: 0.2, release: 0.5, sustainLevel: 0.5,
            baseFreq: 100, freqSlide: 0,
            pitchPeak: 0, pitchDecayTime: 0.1,
            vibratoDepth: 0, vibratoRate: 0,
            tremoloDepth: 0, tremoloRate: 5,
            squareDuty: 0.5,
            subOscLevel: 0, subOscDetune: -12, ksDampening: 0.995,
            lowpassFreq: 4000, lowpassEnd: 400, lowpassQ: 1, highpassFreq: 30,
            distortion: 0.3, volume: 0.55,
            noiseMix: 0, reverb: 0.3, reverbDecay: 2.0
        }
    },
    {
        id: 'powerup', name: 'Powerup', category: 'SFX',
        description: 'Bright rising chirp.',
        lockedParams: ['waveform'],
        params: {
            waveform: 'square',
            attack: 0.005, decay: 0.05, sustain: 0.15, release: 0.15, sustainLevel: 0.7,
            baseFreq: 440, freqSlide: 0.8,
            pitchPeak: 0, pitchDecayTime: 0.1,
            vibratoDepth: 4, vibratoRate: 12,
            tremoloDepth: 0, tremoloRate: 5,
            squareDuty: 0.5,
            subOscLevel: 0.2, subOscDetune: -12, ksDampening: 0.995,
            lowpassFreq: 10000, lowpassEnd: 10000, lowpassQ: 1, highpassFreq: 200,
            distortion: 0, volume: 0.45,
            noiseMix: 0, reverb: 0.2, reverbDecay: 1.2
        }
    },
    {
        id: 'hit', name: 'Hit/Hurt', category: 'SFX',
        description: 'Short noisy thump with a sharp pitch drop.',
        lockedParams: ['waveform', 'attack'],
        params: {
            waveform: 'noise',
            attack: 0.001, decay: 0.02, sustain: 0.02, release: 0.08, sustainLevel: 0.6,
            baseFreq: 300, freqSlide: -0.3,
            pitchPeak: 8, pitchDecayTime: 0.04,
            vibratoDepth: 0, vibratoRate: 0,
            tremoloDepth: 0, tremoloRate: 5,
            squareDuty: 0.5,
            subOscLevel: 0.3, subOscDetune: -12, ksDampening: 0.995,
            lowpassFreq: 3000, lowpassEnd: 800, lowpassQ: 1, highpassFreq: 80,
            distortion: 0.2, volume: 0.5,
            noiseMix: 0, reverb: 0.1, reverbDecay: 0.8
        }
    },
    {
        id: 'jump', name: 'Jump', category: 'SFX',
        description: 'Quick square chirp with upward pitch.',
        lockedParams: ['waveform'],
        params: {
            waveform: 'square',
            attack: 0.005, decay: 0.04, sustain: 0.08, release: 0.10, sustainLevel: 0.6,
            baseFreq: 220, freqSlide: 0.5,
            pitchPeak: 0, pitchDecayTime: 0.05,
            vibratoDepth: 0, vibratoRate: 6,
            tremoloDepth: 0, tremoloRate: 5,
            squareDuty: 0.35,
            subOscLevel: 0, subOscDetune: -12, ksDampening: 0.995,
            lowpassFreq: 6000, lowpassEnd: 6000, lowpassQ: 1, highpassFreq: 100,
            distortion: 0, volume: 0.4,
            noiseMix: 0, reverb: 0.08, reverbDecay: 0.8
        }
    },
    {
        id: 'blip', name: 'Blip/Select', category: 'SFX',
        description: 'Short menu beep.',
        lockedParams: ['waveform', 'attack', 'decay'],
        params: {
            waveform: 'sine',
            attack: 0.002, decay: 0.02, sustain: 0.03, release: 0.05, sustainLevel: 0.7,
            baseFreq: 660, freqSlide: 0,
            pitchPeak: 0, pitchDecayTime: 0.05,
            vibratoDepth: 0, vibratoRate: 0,
            tremoloDepth: 0, tremoloRate: 5,
            squareDuty: 0.5,
            subOscLevel: 0, subOscDetune: -12, ksDampening: 0.995,
            lowpassFreq: 10000, lowpassEnd: 10000, lowpassQ: 1, highpassFreq: 100,
            distortion: 0, volume: 0.4,
            noiseMix: 0, reverb: 0.08, reverbDecay: 0.6
        }
    },
    // ── RPG SFX ───────────────────────────────────────────────────────────────
    {
        id: 'sword-swing', name: 'Sword Swing', category: 'SFX',
        description: 'Whoosh slash through air.',
        lockedParams: ['waveform', 'highpassFreq'],
        params: {
            waveform: 'noise',
            attack: 0.005, decay: 0.06, sustain: 0.08, release: 0.18, sustainLevel: 0.35,
            baseFreq: 800, freqSlide: 0,
            pitchPeak: 0, pitchDecayTime: 0.1,
            vibratoDepth: 0, vibratoRate: 5,
            tremoloDepth: 0.15, tremoloRate: 20,
            squareDuty: 0.5,
            subOscLevel: 0, subOscDetune: -12, ksDampening: 0.995,
            lowpassFreq: 5000, lowpassEnd: 600, lowpassQ: 1, highpassFreq: 200,
            distortion: 0.05, volume: 0.5,
            noiseMix: 0, reverb: 0.05, reverbDecay: 0.6
        }
    },
    {
        id: 'sword-hit', name: 'Sword Hit', category: 'SFX',
        description: 'Metallic impact clang.',
        lockedParams: ['waveform', 'attack'],
        params: {
            waveform: 'square',
            attack: 0.001, decay: 0.04, sustain: 0.0, release: 0.35, sustainLevel: 0.15,
            baseFreq: 280, freqSlide: -0.2,
            pitchPeak: 5, pitchDecayTime: 0.04,
            vibratoDepth: 0, vibratoRate: 5,
            tremoloDepth: 0, tremoloRate: 5,
            squareDuty: 0.5,
            subOscLevel: 0.2, subOscDetune: -12, ksDampening: 0.995,
            lowpassFreq: 3500, lowpassEnd: 700, lowpassQ: 3.5, highpassFreq: 80,
            distortion: 0.45, volume: 0.55,
            noiseMix: 0.35, reverb: 0.15, reverbDecay: 1.0
        }
    },
    {
        id: 'footstep', name: 'Footstep', category: 'SFX',
        description: 'Soft low thud on the ground.',
        lockedParams: ['waveform', 'attack', 'highpassFreq'],
        params: {
            waveform: 'noise',
            attack: 0.001, decay: 0.04, sustain: 0.01, release: 0.10, sustainLevel: 0.3,
            baseFreq: 120, freqSlide: -0.2,
            pitchPeak: 0, pitchDecayTime: 0.05,
            vibratoDepth: 0, vibratoRate: 5,
            tremoloDepth: 0, tremoloRate: 5,
            squareDuty: 0.5,
            subOscLevel: 0.5, subOscDetune: -12, ksDampening: 0.995,
            lowpassFreq: 800, lowpassEnd: 250, lowpassQ: 1, highpassFreq: 20,
            distortion: 0.05, volume: 0.4,
            noiseMix: 0, reverb: 0.05, reverbDecay: 0.5
        }
    },
    {
        id: 'door', name: 'Door Open', category: 'SFX',
        description: 'Creaky door with a low rumble.',
        lockedParams: ['waveform'],
        params: {
            waveform: 'noise',
            attack: 0.04, decay: 0.12, sustain: 0.3, release: 0.25, sustainLevel: 0.3,
            baseFreq: 180, freqSlide: 0.25,
            pitchPeak: -4, pitchDecayTime: 0.2,
            vibratoDepth: 0, vibratoRate: 5,
            tremoloDepth: 0.25, tremoloRate: 9,
            squareDuty: 0.5,
            subOscLevel: 0, subOscDetune: -12, ksDampening: 0.995,
            lowpassFreq: 1500, lowpassEnd: 400, lowpassQ: 2, highpassFreq: 60,
            distortion: 0.15, volume: 0.4,
            noiseMix: 0, reverb: 0.2, reverbDecay: 1.2
        }
    },
    {
        id: 'level-up', name: 'Level Up', category: 'SFX',
        description: 'Triumphant ascending chirp.',
        lockedParams: ['waveform', 'attack'],
        params: {
            waveform: 'square',
            attack: 0.005, decay: 0.07, sustain: 0.2, release: 0.4, sustainLevel: 0.65,
            baseFreq: 330, freqSlide: 0.9,
            pitchPeak: 0, pitchDecayTime: 0.1,
            vibratoDepth: 4, vibratoRate: 11,
            tremoloDepth: 0, tremoloRate: 5,
            squareDuty: 0.5,
            subOscLevel: 0.3, subOscDetune: -12, ksDampening: 0.995,
            lowpassFreq: 10000, lowpassEnd: 10000, lowpassQ: 1, highpassFreq: 100,
            distortion: 0.05, volume: 0.5,
            noiseMix: 0, reverb: 0.35, reverbDecay: 2.0
        }
    },
    {
        id: 'chest-open', name: 'Chest Open', category: 'SFX',
        description: 'Magical sparkle and shimmer.',
        lockedParams: ['waveform', 'attack'],
        params: {
            waveform: 'sine',
            attack: 0.005, decay: 0.14, sustain: 0.12, release: 0.55, sustainLevel: 0.4,
            baseFreq: 660, freqSlide: 0.5,
            pitchPeak: 5, pitchDecayTime: 0.1,
            vibratoDepth: 5, vibratoRate: 12,
            tremoloDepth: 0.2, tremoloRate: 16,
            squareDuty: 0.5,
            subOscLevel: 0, subOscDetune: 12, ksDampening: 0.995,
            lowpassFreq: 10000, lowpassEnd: 8000, lowpassQ: 1, highpassFreq: 200,
            distortion: 0, volume: 0.42,
            noiseMix: 0.1, reverb: 0.4, reverbDecay: 1.8
        }
    },
    {
        id: 'menu-open', name: 'Menu Open', category: 'SFX',
        description: 'Soft UI panel whoosh.',
        lockedParams: ['waveform', 'attack', 'decay'],
        params: {
            waveform: 'sine',
            attack: 0.008, decay: 0.05, sustain: 0.05, release: 0.18, sustainLevel: 0.5,
            baseFreq: 880, freqSlide: -0.25,
            pitchPeak: 9, pitchDecayTime: 0.07,
            vibratoDepth: 0, vibratoRate: 5,
            tremoloDepth: 0, tremoloRate: 5,
            squareDuty: 0.5,
            subOscLevel: 0, subOscDetune: -12, ksDampening: 0.995,
            lowpassFreq: 8000, lowpassEnd: 3500, lowpassQ: 1, highpassFreq: 250,
            distortion: 0, volume: 0.35,
            noiseMix: 0.05, reverb: 0.15, reverbDecay: 0.8
        }
    },
    {
        id: 'cursor', name: 'Cursor Move', category: 'SFX',
        description: 'Tiny tick for menu navigation.',
        lockedParams: ['waveform', 'attack', 'decay', 'sustain', 'release'],
        params: {
            waveform: 'square',
            attack: 0.001, decay: 0.01, sustain: 0.01, release: 0.03, sustainLevel: 0.5,
            baseFreq: 800, freqSlide: 0.1,
            pitchPeak: 2, pitchDecayTime: 0.02,
            vibratoDepth: 0, vibratoRate: 5,
            tremoloDepth: 0, tremoloRate: 5,
            squareDuty: 0.5,
            subOscLevel: 0, subOscDetune: -12, ksDampening: 0.995,
            lowpassFreq: 6000, lowpassEnd: 6000, lowpassQ: 1, highpassFreq: 300,
            distortion: 0.05, volume: 0.3,
            noiseMix: 0, reverb: 0.05, reverbDecay: 0.5
        }
    },
    {
        id: 'magic-fire', name: 'Magic Fire', category: 'SFX',
        description: 'Fiery crackle burst.',
        lockedParams: ['waveform'],
        params: {
            waveform: 'noise',
            attack: 0.008, decay: 0.1, sustain: 0.2, release: 0.45, sustainLevel: 0.5,
            baseFreq: 300, freqSlide: -0.25,
            pitchPeak: 0, pitchDecayTime: 0.1,
            vibratoDepth: 0, vibratoRate: 5,
            tremoloDepth: 0.3, tremoloRate: 16,
            squareDuty: 0.5,
            subOscLevel: 0.2, subOscDetune: -12, ksDampening: 0.995,
            lowpassFreq: 3000, lowpassEnd: 700, lowpassQ: 1.5, highpassFreq: 80,
            distortion: 0.35, volume: 0.5,
            noiseMix: 0, reverb: 0.2, reverbDecay: 1.0
        }
    },
    {
        id: 'magic-ice', name: 'Magic Ice', category: 'SFX',
        description: 'Crystalline frozen shimmer.',
        lockedParams: ['waveform', 'distortion'],
        params: {
            waveform: 'sine',
            attack: 0.005, decay: 0.15, sustain: 0.12, release: 0.65, sustainLevel: 0.3,
            baseFreq: 1200, freqSlide: 0.1,
            pitchPeak: 4, pitchDecayTime: 0.12,
            vibratoDepth: 2, vibratoRate: 15,
            tremoloDepth: 0.1, tremoloRate: 8,
            squareDuty: 0.5,
            subOscLevel: 0.2, subOscDetune: 12, ksDampening: 0.995,
            lowpassFreq: 8000, lowpassEnd: 2500, lowpassQ: 5, highpassFreq: 350,
            distortion: 0, volume: 0.4,
            noiseMix: 0.15, reverb: 0.5, reverbDecay: 2.5
        }
    },
    {
        id: 'magic-thunder', name: 'Magic Thunder', category: 'SFX',
        description: 'Sharp electric crack and rumble.',
        lockedParams: ['waveform', 'attack'],
        params: {
            waveform: 'noise',
            attack: 0.001, decay: 0.05, sustain: 0.1, release: 0.55, sustainLevel: 0.4,
            baseFreq: 400, freqSlide: -0.55,
            pitchPeak: 0, pitchDecayTime: 0.05,
            vibratoDepth: 0, vibratoRate: 5,
            tremoloDepth: 0, tremoloRate: 5,
            squareDuty: 0.5,
            subOscLevel: 0.4, subOscDetune: -12, ksDampening: 0.995,
            lowpassFreq: 8000, lowpassEnd: 900, lowpassQ: 1, highpassFreq: 150,
            distortion: 0.5, volume: 0.6,
            noiseMix: 0, reverb: 0.3, reverbDecay: 1.5
        }
    },
    {
        id: 'magic-heal', name: 'Magic Heal', category: 'SFX',
        description: 'Warm, gentle sparkle.',
        lockedParams: ['waveform', 'distortion'],
        params: {
            waveform: 'sine',
            attack: 0.05, decay: 0.2, sustain: 0.3, release: 0.85, sustainLevel: 0.5,
            baseFreq: 528, freqSlide: 0.2,
            pitchPeak: 0, pitchDecayTime: 0.1,
            vibratoDepth: 3, vibratoRate: 5,
            tremoloDepth: 0.12, tremoloRate: 3,
            squareDuty: 0.5,
            subOscLevel: 0.3, subOscDetune: 12, ksDampening: 0.995,
            lowpassFreq: 6000, lowpassEnd: 2800, lowpassQ: 2, highpassFreq: 80,
            distortion: 0, volume: 0.4,
            noiseMix: 0.05, reverb: 0.6, reverbDecay: 3.0
        }
    },
    {
        id: 'error', name: 'Error / Buzzer', category: 'SFX',
        description: 'Harsh buzz for invalid action.',
        lockedParams: ['waveform', 'sustain', 'sustainLevel'],
        params: {
            waveform: 'square',
            attack: 0.001, decay: 0.02, sustain: 0.18, release: 0.08, sustainLevel: 0.85,
            baseFreq: 180, freqSlide: -0.08,
            pitchPeak: 0, pitchDecayTime: 0.05,
            vibratoDepth: 0, vibratoRate: 5,
            tremoloDepth: 0.55, tremoloRate: 22,
            squareDuty: 0.2,
            subOscLevel: 0.3, subOscDetune: -12, ksDampening: 0.995,
            lowpassFreq: 1500, lowpassEnd: 900, lowpassQ: 1, highpassFreq: 60,
            distortion: 0.5, volume: 0.5,
            noiseMix: 0, reverb: 0.05, reverbDecay: 0.5
        }
    },
    // ── Instruments ───────────────────────────────────────────────────────────
    {
        id: 'inst-piano', name: 'Piano', category: 'Instrument',
        description: 'Soft sine with gentle decay + filter close.',
        lockedParams: ['waveform', 'baseFreq', 'freqSlide', 'pitchPeak'],
        params: {
            waveform: 'sine',
            attack: 0.005, decay: 0.25, sustain: 0.05, release: 0.4, sustainLevel: 0.4,
            baseFreq: 261.63, freqSlide: 0,
            pitchPeak: 0, pitchDecayTime: 0.05,
            vibratoDepth: 0, vibratoRate: 5,
            tremoloDepth: 0, tremoloRate: 5,
            squareDuty: 0.5,
            subOscLevel: 0.1, subOscDetune: -12, ksDampening: 0.995,
            lowpassFreq: 4000, lowpassEnd: 1200, lowpassQ: 1, highpassFreq: 40,
            distortion: 0.05, volume: 0.4,
            noiseMix: 0.1, reverb: 0.25, reverbDecay: 1.8
        }
    },
    {
        id: 'inst-bass', name: 'Bass', category: 'Instrument',
        description: 'Sawtooth with tight lowpass + slight grit.',
        lockedParams: ['waveform', 'baseFreq', 'freqSlide', 'pitchPeak'],
        params: {
            waveform: 'sawtooth',
            attack: 0.005, decay: 0.05, sustain: 0.25, release: 0.15, sustainLevel: 0.7,
            baseFreq: 87.31, freqSlide: 0,
            pitchPeak: 0, pitchDecayTime: 0.05,
            vibratoDepth: 0, vibratoRate: 5,
            tremoloDepth: 0, tremoloRate: 5,
            squareDuty: 0.5,
            subOscLevel: 0, subOscDetune: -12, ksDampening: 0.995,
            lowpassFreq: 600, lowpassEnd: 350, lowpassQ: 1, highpassFreq: 30,
            distortion: 0.15, volume: 0.5,
            noiseMix: 0.05, reverb: 0.1, reverbDecay: 0.8
        }
    },
    {
        id: 'inst-pluck', name: 'Pluck', category: 'Instrument',
        description: 'Sharp transient + fast decay (harp / guitar).',
        lockedParams: ['waveform', 'baseFreq', 'freqSlide', 'pitchPeak'],
        params: {
            waveform: 'triangle',
            attack: 0.002, decay: 0.12, sustain: 0.04, release: 0.15, sustainLevel: 0.25,
            baseFreq: 220, freqSlide: 0,
            pitchPeak: 0, pitchDecayTime: 0.05,
            vibratoDepth: 0, vibratoRate: 4,
            tremoloDepth: 0, tremoloRate: 5,
            squareDuty: 0.5,
            subOscLevel: 0, subOscDetune: -12, ksDampening: 0.995,
            lowpassFreq: 6000, lowpassEnd: 2000, lowpassQ: 1, highpassFreq: 80,
            distortion: 0.1, volume: 0.45,
            noiseMix: 0.15, reverb: 0.2, reverbDecay: 1.2
        }
    },
    {
        id: 'inst-ks-pluck', name: 'KS Pluck', category: 'Instrument',
        description: 'Physically modelled plucked string (Karplus-Strong).',
        lockedParams: ['waveform', 'baseFreq', 'freqSlide', 'pitchPeak', 'subOscLevel'],
        params: {
            waveform: 'karplus',
            attack: 0.001, decay: 0.1, sustain: 0.02, release: 0.3, sustainLevel: 0.2,
            baseFreq: 220, freqSlide: 0,
            pitchPeak: 0, pitchDecayTime: 0.05,
            vibratoDepth: 0, vibratoRate: 5,
            tremoloDepth: 0, tremoloRate: 5,
            squareDuty: 0.5,
            subOscLevel: 0, subOscDetune: -12, ksDampening: 0.997,
            lowpassFreq: 8000, lowpassEnd: 4000, lowpassQ: 1, highpassFreq: 60,
            distortion: 0.1, volume: 0.5,
            noiseMix: 0, reverb: 0.2, reverbDecay: 1.5
        }
    },
    {
        id: 'inst-pad', name: 'Pad', category: 'Instrument',
        description: 'Slow attack, lush reverb — atmospheric backdrop.',
        lockedParams: ['waveform', 'baseFreq'],
        params: {
            waveform: 'triangle',
            attack: 0.3, decay: 0.3, sustain: 0.4, release: 1.0, sustainLevel: 0.5,
            baseFreq: 220, freqSlide: 0.03,
            pitchPeak: 0, pitchDecayTime: 0.1,
            vibratoDepth: 1.5, vibratoRate: 3,
            tremoloDepth: 0, tremoloRate: 5,
            squareDuty: 0.5,
            subOscLevel: 0.2, subOscDetune: 7, ksDampening: 0.995,
            lowpassFreq: 3000, lowpassEnd: 4500, lowpassQ: 1, highpassFreq: 100,
            distortion: 0, volume: 0.35,
            noiseMix: 0.05, reverb: 0.6, reverbDecay: 3.5
        }
    },
    {
        id: 'inst-bell', name: 'Bell', category: 'Instrument',
        description: 'Pure sine, immediate attack, long ringing decay.',
        lockedParams: ['waveform', 'baseFreq', 'freqSlide', 'pitchPeak'],
        params: {
            waveform: 'sine',
            attack: 0.001, decay: 0.5, sustain: 0.1, release: 0.8, sustainLevel: 0.2,
            baseFreq: 523.25, freqSlide: 0,
            pitchPeak: 0, pitchDecayTime: 0.05,
            vibratoDepth: 0, vibratoRate: 5,
            tremoloDepth: 0, tremoloRate: 5,
            squareDuty: 0.5,
            subOscLevel: 0, subOscDetune: -12, ksDampening: 0.995,
            lowpassFreq: 6000, lowpassEnd: 1500, lowpassQ: 1, highpassFreq: 100,
            distortion: 0, volume: 0.4,
            noiseMix: 0, reverb: 0.5, reverbDecay: 2.5
        }
    },
    {
        id: 'inst-strings', name: 'Strings', category: 'Instrument',
        description: 'Sawtooth with slow attack, vibrato, reverb — string section.',
        lockedParams: ['waveform', 'baseFreq'],
        params: {
            waveform: 'sawtooth',
            attack: 0.15, decay: 0.1, sustain: 0.4, release: 0.5, sustainLevel: 0.7,
            baseFreq: 220, freqSlide: 0,
            pitchPeak: 0, pitchDecayTime: 0.1,
            vibratoDepth: 4, vibratoRate: 6,
            tremoloDepth: 0, tremoloRate: 5,
            squareDuty: 0.5,
            subOscLevel: 0, subOscDetune: -12, ksDampening: 0.995,
            lowpassFreq: 2500, lowpassEnd: 3500, lowpassQ: 1, highpassFreq: 80,
            distortion: 0, volume: 0.4,
            noiseMix: 0.05, reverb: 0.45, reverbDecay: 2.2
        }
    },
    {
        id: 'inst-brass', name: 'Brass', category: 'Instrument',
        description: 'Square with medium attack + filter sweep open.',
        lockedParams: ['waveform', 'baseFreq'],
        params: {
            waveform: 'square',
            attack: 0.04, decay: 0.1, sustain: 0.3, release: 0.2, sustainLevel: 0.7,
            baseFreq: 220, freqSlide: 0,
            pitchPeak: 0, pitchDecayTime: 0.05,
            vibratoDepth: 2, vibratoRate: 5,
            tremoloDepth: 0, tremoloRate: 5,
            squareDuty: 0.4,
            subOscLevel: 0.1, subOscDetune: -12, ksDampening: 0.995,
            lowpassFreq: 1500, lowpassEnd: 3500, lowpassQ: 1, highpassFreq: 100,
            distortion: 0.1, volume: 0.4,
            noiseMix: 0.05, reverb: 0.3, reverbDecay: 1.5
        }
    }
];

// ─── Param schema ─────────────────────────────────────────────────────────────
const PARAM_SCHEMA = [
    { key: 'waveform', label: 'Waveform', type: 'select', group: 'Source',
        options: [
            { value: 'sine',     label: 'Sine' },
            { value: 'square',   label: 'Square' },
            { value: 'sawtooth', label: 'Sawtooth' },
            { value: 'triangle', label: 'Triangle' },
            { value: 'noise',    label: 'Noise' },
            { value: 'karplus',  label: 'Karplus (Pluck)' }
        ],
        description: 'Source type. Karplus synthesises a plucked string via physical modelling.'
    },
    { key: 'volume',       label: 'Volume',         type: 'slider', group: 'Source', min: 0,    max: 1,      step: 0.01,   description: 'Peak gain at the attack stage.' },
    { key: 'squareDuty',   label: 'Square Duty',    type: 'slider', group: 'Source', min: 0.05, max: 0.95,   step: 0.01,   description: 'Duty cycle of the square wave (0.5 = symmetric). Ignored for other waveforms.' },
    { key: 'distortion',   label: 'Distortion',     type: 'slider', group: 'Source', min: 0,    max: 1,      step: 0.01,   description: 'Waveshaper distortion amount. For Karplus: pluck hardness (0 = mellow, 1 = bright/clicky).' },
    { key: 'subOscLevel',  label: 'Sub-Osc Level',  type: 'slider', group: 'Source', min: 0,    max: 1,      step: 0.01,   description: 'Level of a second oscillator layered with the main source. Not available for Noise or Karplus.' },
    { key: 'subOscDetune', label: 'Sub-Osc Detune', type: 'slider', group: 'Source', min: -24,  max: 24,     step: 0.5,    description: 'Sub-oscillator detune in semitones. -12 = one octave down (adds bass weight). Positive = chorus.' },
    { key: 'ksDampening',  label: 'KS Dampening',   type: 'slider', group: 'Source', min: 0.9,  max: 0.9999, step: 0.0001, description: 'Karplus-Strong string dampening. Higher = longer ringing decay. Only affects Karplus waveform.' },

    { key: 'attack',       label: 'Attack',        type: 'slider', group: 'Envelope', min: 0, max: 1, step: 0.005, description: 'Time (s) from silence to peak volume.' },
    { key: 'decay',        label: 'Decay',         type: 'slider', group: 'Envelope', min: 0, max: 1, step: 0.005, description: 'Time (s) from peak to sustain level.' },
    { key: 'sustainLevel', label: 'Sustain Level', type: 'slider', group: 'Envelope', min: 0, max: 1, step: 0.01,  description: 'Relative gain during sustain (fraction of peak).' },
    { key: 'sustain',      label: 'Sustain Time',  type: 'slider', group: 'Envelope', min: 0, max: 2, step: 0.01,  description: 'Time (s) at sustain level.' },
    { key: 'release',      label: 'Release',       type: 'slider', group: 'Envelope', min: 0, max: 2, step: 0.01,  description: 'Time (s) from sustain back to silence.' },

    { key: 'baseFreq',       label: 'Base Frequency', type: 'slider', group: 'Pitch', min: 20,  max: 4000, step: 1,    description: 'Pitch at the stable point of the sound (Hz). For Karplus this sets the string length.' },
    { key: 'freqSlide',      label: 'Pitch Slide',    type: 'slider', group: 'Pitch', min: -1,  max: 1,    step: 0.01, description: 'Octave change over the full duration. +1 = one octave up, -1 = down.' },
    { key: 'pitchPeak',      label: 'Pitch Peak',     type: 'slider', group: 'Pitch', min: -24, max: 24,   step: 0.5,  description: 'Semitone offset at the very start. Bends to base frequency over Pitch Decay time. Positive = starts sharp (coin blip), negative = starts flat (drop).' },
    { key: 'pitchDecayTime', label: 'Pitch Decay',    type: 'slider', group: 'Pitch', min: 0,   max: 1,    step: 0.01, description: 'Time (s) for pitch to return from peak to base frequency. 0 = instant snap, 1 = very slow bend.' },
    { key: 'vibratoDepth',   label: 'Vibrato Depth',  type: 'slider', group: 'Pitch', min: 0,   max: 50,   step: 0.5,  description: 'Pitch wobble amount (Hz).' },
    { key: 'vibratoRate',    label: 'Vibrato Rate',   type: 'slider', group: 'Pitch', min: 0.5, max: 30,   step: 0.5,  description: 'Pitch wobble speed (Hz).' },

    { key: 'tremoloDepth', label: 'Tremolo Depth', type: 'slider', group: 'Modulation', min: 0,   max: 1,  step: 0.01, description: 'Volume wobble depth. 0 = none, 1 = amplitude oscillates fully (0 to peak). Creates "wa-wa" or alarm effects.' },
    { key: 'tremoloRate',  label: 'Tremolo Rate',  type: 'slider', group: 'Modulation', min: 0.5, max: 30, step: 0.5,  description: 'Volume wobble speed (Hz). Low = slow swell, high = motorboat / buzzer.' },

    { key: 'lowpassFreq',  label: 'Lowpass Start',    type: 'slider', group: 'Filter', min: 100, max: 22050, step: 50,  description: 'Lowpass cutoff at the START. Sweeps to Lowpass End over the duration.' },
    { key: 'lowpassEnd',   label: 'Lowpass End',      type: 'slider', group: 'Filter', min: 100, max: 22050, step: 50,  description: 'Lowpass cutoff at the END. Different from Start = filter sweep.' },
    { key: 'lowpassQ',     label: 'Lowpass Resonance',type: 'slider', group: 'Filter', min: 0.1, max: 20,    step: 0.1, description: 'Q at the lowpass cutoff. Higher = sharper resonant peak (synth laser). 1 = flat rolloff.' },
    { key: 'highpassFreq', label: 'Highpass Cutoff',  type: 'slider', group: 'Filter', min: 0,   max: 5000,  step: 10,  description: 'Filter out frequencies below this (Hz). Higher = thinner/brighter tone.' },

    { key: 'noiseMix',    label: 'Noise Mix',    type: 'slider', group: 'Texture', min: 0,   max: 1, step: 0.01,  description: 'Mix white noise into the signal for grit. 0 = pure oscillator, 1 = full noise overlay.' },
    { key: 'reverb',      label: 'Reverb Amount',type: 'slider', group: 'Texture', min: 0,   max: 1, step: 0.01,  description: 'Spatial decay tail (wet mix). 0 = dry, 1 = mostly wet.' },
    { key: 'reverbDecay', label: 'Reverb Decay', type: 'slider', group: 'Texture', min: 0.1, max: 4, step: 0.05, description: 'How long the reverb tail lasts (seconds).' }
];

// ─── Synth ────────────────────────────────────────────────────────────────────
function makeDistortionCurve(amount) {
    const k = amount * 100;
    const n = 256;
    const curve = new Float32Array(n);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
        const x = (i * 2) / n - 1;
        curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
}

class SfxSynth {
    constructor() {
        this.liveCtx = null;
        this._activeNodes = [];
    }

    _ensureLive() {
        if (!this.liveCtx) this.liveCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.liveCtx.state === 'suspended') this.liveCtx.resume();
    }

    stop() {
        for (const n of this._activeNodes) {
            try { if (n.stop) n.stop(); } catch (e) {}
            try { n.disconnect(); } catch (e) {}
        }
        this._activeNodes = [];
    }

    play(params) {
        this._ensureLive();
        this.stop();
        const ctx = this.liveCtx;
        const t0 = ctx.currentTime + 0.01;
        this._activeNodes = this._buildGraph(ctx, params, t0, ctx.destination);
    }

    playPattern(pattern, params, bpm) {
        this._ensureLive();
        this.stop();
        const ctx = this.liveCtx;
        const t0 = ctx.currentTime + 0.02;
        const stepDur = 60 / bpm / 4;
        for (const cell of pattern) {
            const [row, step] = cell.split(',').map(Number);
            const semitones = (PATTERN_ROWS - 1) - row;
            const noteFreq = params.baseFreq * Math.pow(2, semitones / 12);
            const noteParams = { ...params, baseFreq: noteFreq, freqSlide: 0 };
            const nodes = this._buildGraph(ctx, noteParams, t0 + step * stepDur, ctx.destination);
            this._activeNodes.push(...nodes);
        }
    }

    async renderPatternOffline(pattern, params, bpm) {
        const stepDur = 60 / bpm / 4;
        const noteDur = params.attack + params.decay + params.sustain + params.release;
        const reverbTail = params.reverb > 0 ? params.reverbDecay : 0;
        let lastStep = 0;
        for (const cell of pattern) {
            const step = parseInt(cell.split(',')[1]);
            if (step > lastStep) lastStep = step;
        }
        const total = (lastStep + 1) * stepDur + noteDur + reverbTail + 0.05;
        const sampleRate = 44100;
        const offline = new OfflineAudioContext(2, Math.ceil(total * sampleRate), sampleRate);
        for (const cell of pattern) {
            const [row, step] = cell.split(',').map(Number);
            const semitones = (PATTERN_ROWS - 1) - row;
            const noteFreq = params.baseFreq * Math.pow(2, semitones / 12);
            const noteParams = { ...params, baseFreq: noteFreq, freqSlide: 0 };
            this._buildGraph(offline, noteParams, step * stepDur, offline.destination);
        }
        return await offline.startRendering();
    }

    async renderOffline(params) {
        const total = params.attack + params.decay + params.sustain + params.release
            + (params.reverb > 0 ? params.reverbDecay : 0) + 0.05;
        const sampleRate = 44100;
        const offline = new OfflineAudioContext(2, Math.ceil(total * sampleRate), sampleRate);
        this._buildGraph(offline, params, 0, offline.destination);
        return await offline.startRendering();
    }

    _makeImpulse(ctx, duration, decayPower) {
        const sampleRate = ctx.sampleRate;
        const length = Math.max(1, Math.ceil(sampleRate * duration));
        const buffer = ctx.createBuffer(2, length, sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decayPower);
            }
        }
        return buffer;
    }

    _buildGraph(ctx, p, t0, dest) {
        const duration = p.attack + p.decay + p.sustain + p.release;
        const nodes = [];
        const lpEnd = p.lowpassEnd !== undefined ? p.lowpassEnd : p.lowpassFreq;
        const noiseMix = p.noiseMix !== undefined ? p.noiseMix : 0;
        const reverbAmount = p.reverb !== undefined ? p.reverb : 0;
        const reverbDecay = p.reverbDecay !== undefined ? p.reverbDecay : 1.5;
        const noiseDuration = duration + 0.05;
        const pitchPeak = p.pitchPeak || 0;
        const pitchDecayTime = p.pitchDecayTime || 0;

        // ── Source ────────────────────────────────────────────────────────────
        const sources = [];
        let mainSource;

        if (p.waveform === 'karplus') {
            // Karplus-Strong: pre-generate buffer, use playbackRate for pitch.
            const ksBuf = generateKarplusStrong(ctx, p, noiseDuration);
            mainSource = ctx.createBufferSource();
            mainSource.buffer = ksBuf;

            // Pitch envelope via playbackRate.
            if (Math.abs(pitchPeak) > 0.1) {
                mainSource.playbackRate.setValueAtTime(Math.pow(2, pitchPeak / 12), t0);
                mainSource.playbackRate.exponentialRampToValueAtTime(1.0, t0 + Math.max(0.001, pitchDecayTime));
            }
            if (Math.abs(p.freqSlide || 0) > 0.001) {
                const endRate = Math.pow(2, p.freqSlide);
                mainSource.playbackRate.exponentialRampToValueAtTime(Math.max(0.01, endRate), t0 + duration);
            }
            // Vibrato via playbackRate (depth as ratio of freq).
            if ((p.vibratoDepth || 0) > 0.1) {
                const lfo = ctx.createOscillator();
                lfo.frequency.value = p.vibratoRate || 5;
                const lfoGain = ctx.createGain();
                lfoGain.gain.value = (p.vibratoDepth / Math.max(1, p.baseFreq)) * 0.5;
                lfo.connect(lfoGain);
                lfoGain.connect(mainSource.playbackRate);
                lfo.start(t0); lfo.stop(t0 + duration);
                nodes.push(lfo, lfoGain);
            }
        } else if (p.waveform === 'noise') {
            const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * noiseDuration), ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
            mainSource = ctx.createBufferSource();
            mainSource.buffer = buf;
        } else {
            // Standard oscillator.
            mainSource = ctx.createOscillator();
            mainSource.type = p.waveform;

            // Pitch envelope: start at peak offset, decay to baseFreq, then slide.
            const startFreq = Math.max(20, p.baseFreq * Math.pow(2, pitchPeak / 12));
            const endFreq = Math.max(20, p.baseFreq * Math.pow(2, p.freqSlide || 0));

            if (Math.abs(pitchPeak) > 0.1) {
                mainSource.frequency.setValueAtTime(startFreq, t0);
                mainSource.frequency.exponentialRampToValueAtTime(Math.max(20, p.baseFreq), t0 + Math.max(0.001, pitchDecayTime));
                if (Math.abs(p.freqSlide || 0) > 0.001) {
                    mainSource.frequency.exponentialRampToValueAtTime(endFreq, t0 + duration);
                }
            } else {
                mainSource.frequency.setValueAtTime(p.baseFreq, t0);
                if (Math.abs(p.freqSlide || 0) > 0.001) {
                    mainSource.frequency.exponentialRampToValueAtTime(endFreq, t0 + duration);
                }
            }

            // Vibrato LFO on frequency.
            if ((p.vibratoDepth || 0) > 0.1) {
                const lfo = ctx.createOscillator();
                lfo.frequency.value = p.vibratoRate || 5;
                const lfoGain = ctx.createGain();
                lfoGain.gain.value = p.vibratoDepth;
                lfo.connect(lfoGain);
                lfoGain.connect(mainSource.frequency);
                lfo.start(t0); lfo.stop(t0 + duration);
                nodes.push(lfo, lfoGain);
            }
        }

        // Main source gain (reduced proportionally when noise mix is present).
        const mainGain = ctx.createGain();
        mainGain.gain.value = (p.waveform === 'noise') ? 1.0 : (1 - 0.5 * noiseMix);
        mainSource.connect(mainGain);
        sources.push(mainSource);
        nodes.push(mainGain);

        // Mixer where all sources meet before the filter chain.
        const mixer = ctx.createGain();
        mixer.gain.value = 1.0;
        mainGain.connect(mixer);

        // Noise-layer mix (only when waveform is not already noise and noiseMix > 0).
        if (p.waveform !== 'noise' && noiseMix > 0.005) {
            const noiseBuf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * noiseDuration), ctx.sampleRate);
            const nd = noiseBuf.getChannelData(0);
            for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
            const noiseSrc = ctx.createBufferSource();
            noiseSrc.buffer = noiseBuf;
            const noiseGain = ctx.createGain();
            noiseGain.gain.value = noiseMix * 0.6;
            noiseSrc.connect(noiseGain).connect(mixer);
            sources.push(noiseSrc);
            nodes.push(noiseGain);
        }

        // Sub-oscillator (sine at detuned interval, not for noise/karplus sources).
        const subLevel = p.subOscLevel || 0;
        if (p.waveform !== 'noise' && p.waveform !== 'karplus' && subLevel > 0.01) {
            const subFreq = Math.max(20, p.baseFreq * Math.pow(2, (p.subOscDetune || -12) / 12));
            const subOsc = ctx.createOscillator();
            subOsc.type = 'sine';
            subOsc.frequency.value = subFreq;
            const subGain = ctx.createGain();
            subGain.gain.value = subLevel * (1 - 0.5 * noiseMix);
            subOsc.connect(subGain).connect(mixer);
            sources.push(subOsc);
            nodes.push(subGain);
        }

        // ── Filter chain ──────────────────────────────────────────────────────
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = Math.max(1, p.highpassFreq || 0);

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.Q.value = Math.max(0.1, p.lowpassQ || 1);
        const lpStartHz = Math.max(20, p.lowpassFreq);
        const lpEndHz = Math.max(20, lpEnd);
        lp.frequency.setValueAtTime(lpStartHz, t0);
        if (Math.abs(lpEndHz - lpStartHz) > 1) {
            lp.frequency.exponentialRampToValueAtTime(lpEndHz, t0 + duration);
        }

        // Distortion shaper (skip for karplus — hardness is baked into the buffer).
        const shaper = ctx.createWaveShaper();
        if (p.waveform !== 'karplus' && (p.distortion || 0) > 0.01) {
            shaper.curve = makeDistortionCurve(p.distortion);
            shaper.oversample = '2x';
        }

        // ── Amplitude envelope (ADSR) ─────────────────────────────────────────
        const env = ctx.createGain();
        const peak = Math.max(0.0001, p.volume);
        const sus = Math.max(0.0001, peak * p.sustainLevel);
        env.gain.setValueAtTime(0.0001, t0);
        env.gain.linearRampToValueAtTime(peak, t0 + Math.max(0.001, p.attack));
        env.gain.linearRampToValueAtTime(sus, t0 + p.attack + Math.max(0.001, p.decay));
        env.gain.setValueAtTime(sus, t0 + p.attack + p.decay + Math.max(0.001, p.sustain));
        env.gain.linearRampToValueAtTime(0.0001, t0 + duration);

        // Dry chain up to env: mixer → hp → lp → shaper → env
        mixer.connect(hp);
        hp.connect(lp);
        lp.connect(shaper);
        shaper.connect(env);

        // ── Tremolo (amplitude LFO after env) ─────────────────────────────────
        const tremoloDepth = p.tremoloDepth || 0;
        let signalOut = env;
        if (tremoloDepth > 0.01) {
            const tremoloGain = ctx.createGain();
            // Base gain = 1 - depth*0.5 so at full depth gain swings 0→1.
            tremoloGain.gain.setValueAtTime(1 - tremoloDepth * 0.5, t0);
            const tremoloLFO = ctx.createOscillator();
            tremoloLFO.type = 'sine';
            tremoloLFO.frequency.value = Math.max(0.1, p.tremoloRate || 5);
            const tremoloMod = ctx.createGain();
            tremoloMod.gain.value = tremoloDepth * 0.5;
            tremoloLFO.connect(tremoloMod);
            tremoloMod.connect(tremoloGain.gain);
            env.connect(tremoloGain);
            tremoloLFO.start(t0); tremoloLFO.stop(t0 + noiseDuration);
            nodes.push(tremoloGain, tremoloLFO, tremoloMod);
            signalOut = tremoloGain;
        }

        // ── Reverb / dry output ───────────────────────────────────────────────
        if (reverbAmount > 0.005) {
            const conv = ctx.createConvolver();
            conv.buffer = this._makeImpulse(ctx, reverbDecay, 2);
            const wetGain = ctx.createGain();
            wetGain.gain.value = reverbAmount;
            const dryGain = ctx.createGain();
            dryGain.gain.value = 1 - reverbAmount * 0.4;
            signalOut.connect(dryGain).connect(dest);
            signalOut.connect(conv).connect(wetGain).connect(dest);
            nodes.push(conv, wetGain, dryGain);
        } else {
            signalOut.connect(dest);
        }

        nodes.push(mixer, hp, lp, shaper, env, ...sources);

        // Start + stop all sources.
        for (const s of sources) {
            s.start(t0);
            if (s.stop) s.stop(t0 + noiseDuration);
        }

        return nodes;
    }
}

// ─── WAV encoder (16-bit PCM, mono) ──────────────────────────────────────────
function audioBufferToWav(buffer) {
    const numChannels = 1;
    const sampleRate = buffer.sampleRate;
    const numSamples = buffer.length;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = numSamples * blockAlign;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const ab = new ArrayBuffer(totalSize);
    const view = new DataView(ab);
    let offset = 0;
    const writeStr = (s) => { for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i)); };

    writeStr('RIFF');
    view.setUint32(offset, totalSize - 8, true); offset += 4;
    writeStr('WAVE');
    writeStr('fmt ');
    view.setUint32(offset, 16, true); offset += 4;
    view.setUint16(offset, 1, true); offset += 2;
    view.setUint16(offset, numChannels, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, sampleRate * blockAlign, true); offset += 4;
    view.setUint16(offset, blockAlign, true); offset += 2;
    view.setUint16(offset, 16, true); offset += 2;
    writeStr('data');
    view.setUint32(offset, dataSize, true); offset += 4;

    const ch = buffer.getChannelData(0);
    for (let i = 0; i < numSamples; i++) {
        const v = Math.max(-1, Math.min(1, ch[i]));
        view.setInt16(offset, v < 0 ? v * 0x8000 : v * 0x7FFF, true);
        offset += 2;
    }
    return ab;
}

// ─── Tool ─────────────────────────────────────────────────────────────────────
const NOTE_LABELS = ['B', 'A#', 'A', 'G#', 'G', 'F#', 'F', 'E', 'D#', 'D', 'C#', 'C'];
const PATTERN_ROWS = NOTE_LABELS.length;
const PATTERN_STEPS = 16;

const JITTER_STRENGTHS = { mild: 0.15, medium: 0.30, wild: 0.55 };

class SoundEffectGenerator {
    constructor() {
        this.root = null;
        this.synth = new SfxSynth();
        this.projectController = null;
        this.projectPath = null;
        this.activeArchetypeId = 'custom';
        this.params = { ...ARCHETYPES[0].params };
        this.mode = 'sound';
        this.pattern = new Set();
        this.bpm = 120;
        this.jitterStrength = 'medium';
        this._docMouseUpHandler = null;
    }

    _t(text) {
        return window.I18n ? window.I18n.tText(text) : text;
    }

    renderInto(containerEl, projectController) {
        this.projectController = projectController;
        this.root = containerEl;
        if (!this._syncProjectPath()) {
            this.root.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--color-text-muted); font-size: 12px;">${this._t('Open a project to use Forge tools.')}</div>`;
            return;
        }
        this._ensureFolders();
        this._loadConfig();
        this._render();
    }

    _syncProjectPath() {
        const project = this.projectController?.getCurrentProject?.() || this.projectController?.currentProject;
        const next = project?.path || null;
        if (!next) {
            this.projectPath = null;
            return null;
        }
        this.projectPath = next;
        return this.projectPath;
    }

    _requireProjectPath() {
        const p = this._syncProjectPath();
        if (!p) {
            alert(this._t('Open a project to use Forge tools.'));
            return null;
        }
        return p;
    }

    detach() {
        this.synth.stop();
        if (this._docMouseUpHandler) {
            document.removeEventListener('mouseup', this._docMouseUpHandler);
            this._docMouseUpHandler = null;
        }
    }

    // ── Filesystem ────────────────────────────────────────────────────────────
    _ensureFolders() {
        const projectPath = this._syncProjectPath();
        if (!projectPath) return;
        const fs = require('fs');
        const path = require('path');
        const root = path.join(projectPath, 'forge', 'sound_effect_generator');
        try {
            fs.mkdirSync(root, { recursive: true });
            const readme = path.join(root, 'README.txt');
            if (!fs.existsSync(readme)) {
                fs.writeFileSync(readme,
                    'Sound Effect Generator\n======================\n\n' +
                    'Procedural SFX synth. Pick an archetype, tune sliders,\n' +
                    'Play to preview, Save to bake to audio/se/<name>.wav.\n'
                );
            }
            fs.mkdirSync(path.join(projectPath, 'audio', 'se'), { recursive: true });
        } catch (e) { console.error('SoundEffectGenerator: ensure folders:', e); }
    }

    _configPath() {
        const projectPath = this._syncProjectPath();
        if (!projectPath) return null;
        const path = require('path');
        return path.join(projectPath, 'forge', 'sound_effect_generator', 'config.json');
    }

    _loadConfig() {
        const fs = require('fs');
        try {
            const cfg = JSON.parse(fs.readFileSync(this._configPath(), 'utf8'));
            if (cfg.activeArchetypeId) this.activeArchetypeId = cfg.activeArchetypeId;
            if (cfg.params) this.params = { ...this.params, ...cfg.params };
            if (cfg.mode === 'pattern' || cfg.mode === 'sound') this.mode = cfg.mode;
            if (Array.isArray(cfg.pattern)) this.pattern = new Set(cfg.pattern);
            if (typeof cfg.bpm === 'number') this.bpm = cfg.bpm;
            if (cfg.jitterStrength && JITTER_STRENGTHS[cfg.jitterStrength]) this.jitterStrength = cfg.jitterStrength;
        } catch (e) { /* first run */ }
        // Backfill any params missing from older saves or archetype seeds.
        for (const p of PARAM_SCHEMA) {
            if (this.params[p.key] === undefined) {
                this.params[p.key] = p.default !== undefined ? p.default
                    : (p.type === 'slider' ? (p.min + p.max) / 2 : (p.options && p.options[0].value));
            }
        }
        if (this.params.lowpassEnd === undefined) this.params.lowpassEnd = this.params.lowpassFreq;
        if (this.params.noiseMix === undefined) this.params.noiseMix = 0;
        if (this.params.reverb === undefined) this.params.reverb = 0.15;
        if (this.params.reverbDecay === undefined) this.params.reverbDecay = 1.5;
        if (this.params.pitchPeak === undefined) this.params.pitchPeak = 0;
        if (this.params.pitchDecayTime === undefined) this.params.pitchDecayTime = 0.1;
        if (this.params.lowpassQ === undefined) this.params.lowpassQ = 1;
        if (this.params.tremoloDepth === undefined) this.params.tremoloDepth = 0;
        if (this.params.tremoloRate === undefined) this.params.tremoloRate = 5;
        if (this.params.subOscLevel === undefined) this.params.subOscLevel = 0;
        if (this.params.subOscDetune === undefined) this.params.subOscDetune = -12;
        if (this.params.ksDampening === undefined) this.params.ksDampening = 0.995;
    }

    _saveConfig() {
        const fs = require('fs');
        try {
            fs.writeFileSync(this._configPath(), JSON.stringify({
                activeArchetypeId: this.activeArchetypeId,
                params: this.params,
                mode: this.mode,
                pattern: Array.from(this.pattern),
                bpm: this.bpm,
                jitterStrength: this.jitterStrength
            }, null, 2));
        } catch (e) { console.error('SoundEffectGenerator: save config:', e); }
    }

    // ── Archetype + Randomize ─────────────────────────────────────────────────
    _seedFromArchetype(id) {
        const a = ARCHETYPES.find(x => x.id === id);
        if (!a) return;
        this.activeArchetypeId = id;
        this.params = { ...a.params };
        // Backfill any params that postdate the archetype definition.
        for (const p of PARAM_SCHEMA) {
            if (this.params[p.key] === undefined) {
                this.params[p.key] = p.type === 'slider' ? (p.min + p.max) / 2 : (p.options && p.options[0].value);
            }
        }
        this._saveConfig();
        this._render();
    }

    _randomizeFromArchetype() {
        const a = ARCHETYPES.find(x => x.id === this.activeArchetypeId) || ARCHETYPES[0];
        const base = { ...a.params };
        // Backfill any missing params.
        for (const p of PARAM_SCHEMA) {
            if (base[p.key] === undefined) {
                base[p.key] = this.params[p.key] !== undefined
                    ? this.params[p.key]
                    : (p.type === 'slider' ? (p.min + p.max) / 2 : (p.options && p.options[0].value));
            }
        }

        const locked = new Set(a.lockedParams || ['waveform']);
        const jitter = JITTER_STRENGTHS[this.jitterStrength] || 0.30;

        for (const p of PARAM_SCHEMA) {
            if (p.type !== 'slider') continue;
            if (locked.has(p.key)) continue;
            const range = p.max - p.min;
            const delta = (Math.random() - 0.5) * range * jitter * 2;
            base[p.key] = Math.max(p.min, Math.min(p.max, base[p.key] + delta));
        }
        this.params = base;
        this._saveConfig();
        this._render();
    }

    // ── Layout ────────────────────────────────────────────────────────────────
    _render() {
        // Preserve scroll positions across full re-renders.
        const archetypeScroll = this.root.querySelector('.rr-sfx-archetypes')?.scrollTop || 0;
        const paramScroll = this.root.querySelector('.rr-sfx-params')?.scrollTop || 0;

        // Clean up any previous document-level mouseup listener before re-rendering.
        if (this._docMouseUpHandler) {
            document.removeEventListener('mouseup', this._docMouseUpHandler);
            this._docMouseUpHandler = null;
        }

        const groups = new Map();
        for (const a of ARCHETYPES) {
            const cat = a.category || 'Other';
            if (!groups.has(cat)) groups.set(cat, []);
            groups.get(cat).push(a);
        }
        let archetypeHtml = '';
        for (const [cat, list] of groups) {
            archetypeHtml += `<div style="padding: 8px 14px 6px; font-size: 9px; font-weight: 700; color: var(--color-accent-bright); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--color-border-subtle); margin-top: 6px;">${this._t(cat)}</div>`;
            for (const a of list) {
                archetypeHtml += `
                    <div class="rr-sfx-arch" data-id="${a.id}" style="padding: 9px 14px; cursor: pointer; font-size: 12px; color: var(--color-text); background: ${a.id === this.activeArchetypeId ? 'var(--color-bg-hover)' : 'transparent'}; border-left: 3px solid ${a.id === this.activeArchetypeId ? 'var(--color-accent-bright)' : 'transparent'};">
                        <div style="font-weight: 600;">${a.name}</div>
                        <div style="font-size: 10px; color: var(--color-text-muted); margin-top: 2px;">${a.description}</div>
                    </div>
                `;
            }
        }

        const jitterBtns = Object.keys(JITTER_STRENGTHS).map(k =>
            `<button class="rr-sfx-jitter-btn" data-strength="${k}" style="padding: 4px 10px; background: ${this.jitterStrength === k ? 'var(--color-bg-button-active)' : 'var(--color-bg-button)'}; color: var(--color-text-strong); border: none; ${k === 'mild' ? 'border-radius: 3px 0 0 3px;' : k === 'wild' ? 'border-radius: 0 3px 3px 0;' : ''} border-left: ${k !== 'mild' ? '1px solid var(--color-border-input)' : 'none'}; cursor: pointer; font-size: 10px; font-weight: 600; text-transform: capitalize;">${this._t(k)}</button>`
        ).join('');

        this.root.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%; min-height: 0;">
                <!-- Toolbar -->
                <div style="padding: 10px 16px; background: var(--color-bg-panel); border-bottom: 1px solid var(--color-border-subtle); display: flex; gap: 10px; align-items: center; flex-shrink: 0; flex-wrap: wrap;">
                    <div style="display: inline-flex; border: 1px solid var(--color-border-input); border-radius: 4px; overflow: hidden;">
                        <button class="rr-sfx-mode-btn" data-mode="sound"   style="padding: 5px 14px; background: ${this.mode === 'sound'   ? 'var(--color-bg-button-active)' : 'var(--color-bg-button)'}; color: var(--color-text-strong); border: none; cursor: pointer; font-size: 11px; font-weight: 600;">${this._t('Sound')}</button>
                        <button class="rr-sfx-mode-btn" data-mode="pattern" style="padding: 5px 14px; background: ${this.mode === 'pattern' ? 'var(--color-bg-button-active)' : 'var(--color-bg-button)'}; color: var(--color-text-strong); border: none; border-left: 1px solid var(--color-border-input); cursor: pointer; font-size: 11px; font-weight: 600;">${this._t('Pattern')}</button>
                    </div>
                    <button class="rr-sfx-play rr-btn-chip" style="padding: 6px 18px; color: var(--color-accent-bright);">▶ ${this._t('Play')}</button>
                    <button class="rr-sfx-stop rr-btn-chip" style="padding: 6px 14px;">■ ${this._t('Stop')}</button>
                    <div style="display: flex; align-items: center; gap: 0; border: 1px solid var(--color-border-input); border-radius: 3px; overflow: hidden;">
                        <button class="rr-sfx-rand rr-btn-chip" style="padding: 5px 12px; border-radius: 0; border: none;">🎲 ${this._t('Randomize')}</button>
                        <div style="display: inline-flex; border-left: 1px solid var(--color-border-input);">${jitterBtns}</div>
                    </div>
                    <button class="rr-sfx-reset rr-btn-chip" style="padding: 6px 14px;">↻ ${this._t('Reset')}</button>
                    ${this.mode === 'pattern' ? `
                        <div style="display: flex; align-items: center; gap: 6px; margin-left: 8px;">
                            <label style="font-size: 11px; color: var(--color-text-muted);">BPM:</label>
                            <input type="number" class="rr-sfx-bpm rr-input" value="${this.bpm}" min="40" max="300" style="width: 60px; padding: 3px 6px; font-size: 11px;">
                        </div>
                        <button class="rr-sfx-pattern-clear rr-btn-chip" style="padding: 6px 12px;">${this._t('Clear Pattern')}</button>
                    ` : ''}
                    <div class="rr-sfx-duration" style="margin-left: auto; font-size: 11px; color: var(--color-text-muted);">${this._t('Duration:')} 0.00s</div>
                </div>

                <div style="display: grid; grid-template-columns: 240px 1fr 320px; flex: 1; min-height: 0;">
                    <!-- Archetypes -->
                    <div class="rr-sfx-archetypes" style="background: var(--color-bg-panel); border-right: 1px solid var(--color-border); overflow-y: auto;">
                        <div style="padding: 6px 14px 8px; font-size: 9px; font-weight: 700; color: var(--color-accent-bright); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--color-border-subtle);">${this._t('Archetypes')}</div>
                        ${archetypeHtml}
                    </div>

                    <!-- Center: Visualizers (Sound) or Pattern Grid -->
                    ${this.mode === 'sound' ? `
                        <div class="rr-dark-surface" style="display: flex; flex-direction: column; padding: 16px; gap: 14px; overflow-y: auto;">
                            <div>
                                <div style="font-size: 10px; color: var(--color-text-muted); margin-bottom: 4px; display: flex; justify-content: space-between;"><span>${this._t('Waveform')}</span><span style="font-size: 9px; color: var(--color-text-dim);">${this._t('amplitude x time')}</span></div>
                                <div style="background: var(--color-bg-deep); border: 1px solid var(--color-border-input); border-radius: 4px; padding: 4px;">
                                    <canvas class="rr-sfx-waveform" width="640" height="160" style="width: 100%; height: 160px; display: block;"></canvas>
                                </div>
                            </div>
                            <div>
                                <div style="font-size: 10px; color: var(--color-text-muted); margin-bottom: 4px; display: flex; justify-content: space-between;"><span>${this._t('Envelope (ADSR)')}</span><span style="font-size: 9px; color: var(--color-text-dim);">${this._t('gain x time')}</span></div>
                                <div style="background: var(--color-bg-deep); border: 1px solid var(--color-border-input); border-radius: 4px; padding: 4px;">
                                    <canvas class="rr-sfx-envelope" width="640" height="80" style="width: 100%; height: 80px; display: block;"></canvas>
                                </div>
                            </div>
                            <div>
                                <div style="font-size: 10px; color: var(--color-text-muted); margin-bottom: 4px; display: flex; justify-content: space-between;"><span>${this._t('Pitch Curve')}</span><span style="font-size: 9px; color: var(--color-text-dim);">${this._t('frequency x time')}</span></div>
                                <div style="background: var(--color-bg-deep); border: 1px solid var(--color-border-input); border-radius: 4px; padding: 4px;">
                                    <canvas class="rr-sfx-pitch" width="640" height="80" style="width: 100%; height: 80px; display: block;"></canvas>
                                </div>
                            </div>
                            <div style="font-size: 10px; color: var(--color-text-dim); padding-top: 6px; border-top: 1px solid var(--color-border-subtle);">
                                ${this._t('Visualizers update live as you tune sliders. Click Play to hear the result.')}
                            </div>
                        </div>
                    ` : `
                        <div class="rr-dark-surface" style="display: flex; flex-direction: column; padding: 14px; gap: 8px; overflow: auto;">
                            <div style="font-size: 10px; color: var(--color-text-muted); margin-bottom: 4px;">
                                ${this._t('Pattern Editor - click or drag cells to place/erase notes. Rows = pitch (top = high), columns = time (16th notes at BPM).')}
                            </div>
                            ${this._renderPatternGrid()}
                            <div style="font-size: 9px; color: var(--color-text-dim); padding-top: 8px; border-top: 1px solid var(--color-border-subtle); margin-top: 4px;">
                                ${this._t('Notes placed:')} ${this.pattern.size}. ${this._t('Pattern length:')} ${(PATTERN_STEPS * 60 / this.bpm / 4).toFixed(2)}s ${this._t('at')} ${this.bpm} BPM.
                            </div>
                        </div>
                    `}

                    <!-- Right: Param sliders -->
                    <div class="rr-sfx-params" style="background: var(--color-bg-panel); border-left: 1px solid var(--color-border); overflow-y: auto; padding: 14px 16px;">
                        ${this._renderParamControls()}
                    </div>
                </div>

                <!-- Footer -->
                <div style="padding: 12px 18px; border-top: 1px solid var(--color-border-subtle); background: var(--color-bg-panel); display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
                    <label style="font-size: 12px; color: var(--color-text-muted);">${this._t('Default name:')}</label>
                    <input type="text" class="rr-sfx-name rr-input" placeholder="MySFX" style="width: 200px; padding: 4px 8px; font-size: 12px;">
                    <div style="font-size: 10px; color: var(--color-text-dim);">${this._t('defaults to audio/se/ - pick any location in the dialog')}</div>
                    <div class="rr-sfx-save-status" style="font-size: 10px; color: var(--color-accent-bright); opacity: 0; transition: opacity 0.3s; margin-left: 8px; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></div>
                    <button class="rr-sfx-save rr-btn-chip" style="margin-left: auto; padding: 6px 18px; color: var(--color-accent-bright);">${this._t('Bake & Save...')}</button>
                </div>
            </div>
        `;
        this._wireEvents();
        this._refreshVisualizers();

        // Restore scroll positions.
        const archetypePanel = this.root.querySelector('.rr-sfx-archetypes');
        if (archetypePanel) archetypePanel.scrollTop = archetypeScroll;
        const paramPanel = this.root.querySelector('.rr-sfx-params');
        if (paramPanel) paramPanel.scrollTop = paramScroll;
    }

    _renderPatternGrid() {
        const cellSize = 28;
        const labelCol = 32;
        let html = `<div class="rr-sfx-grid" style="display: inline-grid; grid-template-columns: ${labelCol}px repeat(${PATTERN_STEPS}, ${cellSize}px); gap: 1px; background: var(--color-border-subtle); padding: 1px; border-radius: 3px; user-select: none;">`;
        for (let row = 0; row < PATTERN_ROWS; row++) {
            const isSharp = NOTE_LABELS[row].includes('#');
            html += `<div style="background: ${isSharp ? 'var(--color-bg-input-alt)' : 'var(--color-bg-input)'}; color: var(--color-text); font-size: 10px; text-align: center; line-height: ${cellSize}px; font-family: var(--font-mono); font-weight: 600;">${NOTE_LABELS[row]}</div>`;
            for (let col = 0; col < PATTERN_STEPS; col++) {
                const key = `${row},${col}`;
                const active = this.pattern.has(key);
                const beatLine = (col % 4 === 0) && !active;
                html += `<div class="rr-sfx-cell" data-key="${key}" style="background: ${active ? 'var(--color-accent-bright)' : (beatLine ? 'var(--color-bg-input-alt)' : 'var(--color-bg-deep)')}; cursor: pointer; height: ${cellSize}px;"></div>`;
            }
        }
        html += '</div>';
        return html;
    }

    _renderParamControls() {
        const groups = new Map();
        for (const p of PARAM_SCHEMA) {
            const g = p.group || 'Other';
            if (!groups.has(g)) groups.set(g, []);
            groups.get(g).push(p);
        }
        let html = '';
        for (const [groupName, params] of groups) {
            html += `<div style="font-size: 11px; font-weight: 700; color: var(--color-accent-bright); text-transform: uppercase; letter-spacing: 0.5px; margin: 14px 0 8px; padding-bottom: 4px; border-bottom: 1px solid var(--color-accent-border-mid);">${this._t(groupName)}</div>`;
            for (const p of params) {
                const val = this.params[p.key];
                if (p.type === 'select') {
                    html += `
                        <div style="margin-bottom: 10px; display: grid; grid-template-columns: 90px 1fr; gap: 8px; align-items: center;" title="${this._t(p.description)}">
                            <label style="font-size: 11px; color: var(--color-text);">${this._t(p.label)}</label>
                            <select class="rr-sfx-param rr-select" data-key="${p.key}" style="padding: 3px 6px; font-size: 11px;">
                                ${p.options.map(o => `<option value="${o.value}" ${o.value === val ? 'selected' : ''}>${this._t(o.label)}</option>`).join('')}
                            </select>
                        </div>
                    `;
                } else if (p.type === 'slider') {
                    html += `
                        <div style="margin-bottom: 8px;" title="${this._t(p.description)}">
                            <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 2px;">
                                <span style="color: var(--color-text); font-weight: 600;">${this._t(p.label)}</span>
                                <span class="rr-sfx-val" data-key="${p.key}" style="color: var(--color-text-muted); font-family: var(--font-mono);">${(+val).toFixed(p.step < 0.01 ? 4 : 2)}</span>
                            </div>
                            <input type="range" class="rr-sfx-param rr-range" data-key="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${val}" style="width: 100%;">
                        </div>
                    `;
                }
            }
        }
        return html;
    }

    // ── Visualizers ───────────────────────────────────────────────────────────
    _refreshVisualizers() {
        if (this._vizTimer) clearTimeout(this._vizTimer);
        if (this.mode !== 'sound') return;
        this._vizTimer = setTimeout(async () => {
            try {
                if (this.mode !== 'sound') return;
                const buffer = await this.synth.renderOffline(this.params);
                this._drawWaveform(buffer);
                this._drawEnvelope();
                this._drawPitch();
                const dur = this.root.querySelector('.rr-sfx-duration');
                if (dur) dur.textContent = `${this._t('Duration:')} ${(buffer.length / buffer.sampleRate).toFixed(2)}s`;
            } catch (e) {
                console.warn('Visualizer render failed:', e);
            }
        }, 80);
    }

    _drawWaveform(buffer) {
        const canvas = this.root.querySelector('.rr-sfx-waveform');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.fillStyle = ThemeColors.resolve('--color-bg-deep', '#000');
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = ThemeColors.resolve('--color-text-dim', '#666');
        ctx.globalAlpha = 0.3;
        ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
        ctx.globalAlpha = 1.0;

        const data = buffer.getChannelData(0);
        const samplesPerPx = Math.max(1, data.length / w);
        const color = ThemeColors.resolve('--color-accent-bright', '#ffd700');

        ctx.fillStyle = color;
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        for (let x = 0; x < w; x++) {
            const s = Math.floor(x * samplesPerPx), e = Math.floor((x + 1) * samplesPerPx);
            let max = 0;
            for (let i = s; i < e; i++) if (Math.abs(data[i]) > max) max = Math.abs(data[i]);
            ctx.lineTo(x, h / 2 - max * h / 2);
        }
        for (let x = w - 1; x >= 0; x--) {
            const s = Math.floor(x * samplesPerPx), e = Math.floor((x + 1) * samplesPerPx);
            let max = 0;
            for (let i = s; i < e; i++) if (Math.abs(data[i]) > max) max = Math.abs(data[i]);
            ctx.lineTo(x, h / 2 + max * h / 2);
        }
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1.0;

        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
            const s = Math.floor(x * samplesPerPx), e = Math.floor((x + 1) * samplesPerPx);
            let max = -Infinity, min = Infinity;
            for (let i = s; i < e; i++) {
                if (data[i] > max) max = data[i];
                if (data[i] < min) min = data[i];
            }
            ctx.moveTo(x, h / 2 - max * h / 2);
            ctx.lineTo(x, h / 2 - min * h / 2);
        }
        ctx.stroke();
    }

    _drawEnvelope() {
        const canvas = this.root.querySelector('.rr-sfx-envelope');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.fillStyle = ThemeColors.resolve('--color-bg-deep', '#000');
        ctx.fillRect(0, 0, w, h);

        const p = this.params;
        const total = p.attack + p.decay + p.sustain + p.release || 0.001;
        const pad = 4;
        const innerW = w - pad * 2;
        const baseY = h - pad, peakY = pad;
        const susY = baseY - (baseY - peakY) * p.sustainLevel;
        const xA = pad + innerW * (p.attack / total);
        const xD = pad + innerW * ((p.attack + p.decay) / total);
        const xS = pad + innerW * ((p.attack + p.decay + p.sustain) / total);
        const xR = pad + innerW;
        const color = ThemeColors.resolve('--color-accent-bright', '#ffd700');

        ctx.fillStyle = color;
        ctx.globalAlpha = 0.18;
        ctx.beginPath();
        ctx.moveTo(pad, baseY); ctx.lineTo(xA, peakY); ctx.lineTo(xD, susY);
        ctx.lineTo(xS, susY); ctx.lineTo(xR, baseY);
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1.0;

        ctx.strokeStyle = color; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pad, baseY); ctx.lineTo(xA, peakY); ctx.lineTo(xD, susY);
        ctx.lineTo(xS, susY); ctx.lineTo(xR, baseY);
        ctx.stroke();

        ctx.fillStyle = ThemeColors.resolve('--color-text-muted', '#999');
        ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('A', (pad + xA) / 2, baseY - 2);
        ctx.fillText('D', (xA + xD) / 2, baseY - 2);
        ctx.fillText('S', (xD + xS) / 2, baseY - 2);
        ctx.fillText('R', (xS + xR) / 2, baseY - 2);
    }

    _drawPitch() {
        const canvas = this.root.querySelector('.rr-sfx-pitch');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.fillStyle = ThemeColors.resolve('--color-bg-deep', '#000');
        ctx.fillRect(0, 0, w, h);

        const p = this.params;
        if (p.waveform === 'noise') {
            ctx.fillStyle = ThemeColors.resolve('--color-text-muted', '#999');
            ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText(this._t('Noise - no pitch curve'), w / 2, h / 2 + 4);
            return;
        }

        const pitchPeak = p.pitchPeak || 0;
        const pitchDecayTime = p.pitchDecayTime || 0;
        const total = p.attack + p.decay + p.sustain + p.release || 0.001;
        const startFreq = p.baseFreq * Math.pow(2, pitchPeak / 12);
        const endFreq = Math.max(20, p.baseFreq * Math.pow(2, p.freqSlide || 0));

        // Compute frequency at each time fraction for the display curve.
        const freqAt = (t) => {
            const tSec = t * total;
            let f;
            if (Math.abs(pitchPeak) > 0.1 && tSec < pitchDecayTime) {
                const frac = pitchDecayTime > 0 ? tSec / pitchDecayTime : 1;
                f = startFreq * Math.pow(p.baseFreq / startFreq, frac);
            } else {
                f = p.baseFreq;
                if (Math.abs(p.freqSlide || 0) > 0.001) {
                    const slideFrac = pitchDecayTime > 0 ? Math.max(0, (tSec - pitchDecayTime) / (total - pitchDecayTime)) : t;
                    f = p.baseFreq * Math.pow(endFreq / p.baseFreq, Math.min(1, slideFrac));
                }
            }
            // Vibrato approximation.
            if ((p.vibratoDepth || 0) > 0.1) {
                f += Math.sin(t * Math.PI * 2 * (p.vibratoRate || 5) * 0.5) * p.vibratoDepth;
            }
            return Math.max(20, f);
        };

        const allFreqs = Array.from({ length: 101 }, (_, i) => freqAt(i / 100));
        const fmin = Math.min(...allFreqs) * 0.85;
        const fmax = Math.max(...allFreqs) * 1.15;
        const yFor = (f) => {
            const t = (Math.log(f) - Math.log(fmin)) / (Math.log(fmax) - Math.log(fmin));
            return h - 6 - t * (h - 12);
        };

        const color = ThemeColors.resolve('--color-accent-bright', '#ffd700');
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= 100; i++) {
            const x = (i / 100) * w;
            const y = yFor(allFreqs[i]);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.fillStyle = ThemeColors.resolve('--color-text-muted', '#999');
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${Math.round(startFreq)} Hz`, 6, yFor(allFreqs[0]) - 4);
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(allFreqs[100])} Hz`, w - 6, yFor(allFreqs[100]) - 4);
    }

    // ── Pattern cell paint helpers ────────────────────────────────────────────
    _paintCell(cell, key, active) {
        const col = parseInt(key.split(',')[1]);
        if (active) {
            this.pattern.add(key);
            cell.style.background = 'var(--color-accent-bright)';
        } else {
            this.pattern.delete(key);
            cell.style.background = (col % 4 === 0) ? 'var(--color-bg-input-alt)' : 'var(--color-bg-deep)';
        }
    }

    // ── Event wiring ──────────────────────────────────────────────────────────
    _wireEvents() {
        const root = this.root;

        root.querySelector('.rr-sfx-play').addEventListener('click', () => {
            if (this.mode === 'pattern' && this.pattern.size > 0) {
                this.synth.playPattern(this.pattern, this.params, this.bpm);
            } else {
                this.synth.play(this.params);
            }
        });
        root.querySelector('.rr-sfx-stop').addEventListener('click', () => this.synth.stop());
        root.querySelector('.rr-sfx-rand').addEventListener('click', () => this._randomizeFromArchetype());
        root.querySelector('.rr-sfx-reset').addEventListener('click', () => this._seedFromArchetype(this.activeArchetypeId));
        root.querySelector('.rr-sfx-save').addEventListener('click', () => this._saveSfx());

        root.querySelectorAll('.rr-sfx-jitter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.jitterStrength = btn.dataset.strength;
                this._saveConfig();
                // Update button highlight without full re-render.
                root.querySelectorAll('.rr-sfx-jitter-btn').forEach(b => {
                    b.style.background = b.dataset.strength === this.jitterStrength
                        ? 'var(--color-bg-button-active)' : 'var(--color-bg-button)';
                });
            });
        });

        root.querySelectorAll('.rr-sfx-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.mode = btn.dataset.mode;
                this._saveConfig();
                this._render();
            });
        });

        // Pattern grid: drag-to-paint (mousedown starts, mousemove continues, mouseup ends).
        if (this.mode === 'pattern') {
            let painting = false;
            let paintValue = null;

            root.addEventListener('mousedown', (e) => {
                const cell = e.target.closest('.rr-sfx-cell');
                if (!cell) return;
                e.preventDefault();
                painting = true;
                const key = cell.dataset.key;
                paintValue = !this.pattern.has(key);
                this._paintCell(cell, key, paintValue);
            });

            root.addEventListener('mousemove', (e) => {
                if (!painting) return;
                const cell = e.target.closest('.rr-sfx-cell');
                if (!cell) return;
                const key = cell.dataset.key;
                const isFilled = this.pattern.has(key);
                if (paintValue && !isFilled) this._paintCell(cell, key, true);
                else if (!paintValue && isFilled) this._paintCell(cell, key, false);
            });

            const stopPaint = () => {
                if (painting) { painting = false; this._saveConfig(); }
            };
            root.addEventListener('mouseup', stopPaint);
            // Also catch mouseup outside the component (e.g. released over sidebar).
            this._docMouseUpHandler = stopPaint;
            document.addEventListener('mouseup', stopPaint);

            const bpmInput = root.querySelector('.rr-sfx-bpm');
            if (bpmInput) {
                bpmInput.addEventListener('change', () => {
                    const v = parseInt(bpmInput.value) || 120;
                    this.bpm = Math.max(40, Math.min(300, v));
                    this._saveConfig();
                    this._render();
                });
            }

            const clearBtn = root.querySelector('.rr-sfx-pattern-clear');
            if (clearBtn) {
                clearBtn.addEventListener('click', () => {
                    this.pattern.clear();
                    this._saveConfig();
                    this._render();
                });
            }
        }

        root.querySelectorAll('.rr-sfx-arch').forEach(el => {
            el.addEventListener('click', () => this._seedFromArchetype(el.dataset.id));
        });

        root.querySelectorAll('.rr-sfx-param').forEach(el => {
            el.addEventListener('input', () => {
                const key = el.dataset.key;
                let v = el.value;
                if (el.type === 'range') v = parseFloat(v);
                this.params[key] = v;
                const valEl = root.querySelector(`.rr-sfx-val[data-key="${key}"]`);
                if (valEl && typeof v === 'number') {
                    const schema = PARAM_SCHEMA.find(p => p.key === key);
                    valEl.textContent = v.toFixed(schema && schema.step < 0.01 ? 4 : 2);
                }
                this._refreshVisualizers();
            });
            el.addEventListener('change', () => this._saveConfig());
        });
    }

    async _saveSfx() {
        const webHost = window.RPGReactorHost?.mode === 'web' ? window.RPGReactorHost : null;
        const projectPath = this._syncProjectPath();
        if (!projectPath && !webHost && !this._requireProjectPath()) return;
        const nameInput = this.root.querySelector('.rr-sfx-name');
        const rawName = (nameInput.value || '').trim().replace(/\.(wav|ogg)$/i, '');
        if (!rawName) { alert(this._t('Enter a name for the sound effect.')); return; }

        let buffer;
        try {
            buffer = (this.mode === 'pattern' && this.pattern.size > 0)
                ? await this.synth.renderPatternOffline(this.pattern, this.params, this.bpm)
                : await this.synth.renderOffline(this.params);
        } catch (e) {
            console.error('SoundEffectGenerator render:', e);
            alert(`${this._t('Failed to render:')} ${e.message}`);
            return;
        }
        const wav = audioBufferToWav(buffer);

        const path = require('path');
        const defaultDir = projectPath ? path.join(projectPath, 'audio', 'se') : null;
        if (webHost) {
            try {
                const result = await webHost.saveFile({
                    data: wav,
                    projectPath: projectPath ? path.join(defaultDir, `${rawName}.wav`) : null,
                    suggestedName: `${rawName}.wav`,
                    mimeType: 'audio/wav',
                });
                if (result) this._showSaveStatus(result.project
                    ? `${this._t('Saved:')} audio/se/${rawName}.wav`
                    : `${this._t('Saved:')} ${result.path}`);
            } catch (err) {
                console.error('SoundEffectGenerator save:', err);
                alert(`${this._t('Failed to save:')} ${err.message}`);
            }
            return;
        }

        const fs = require('fs');
        try { fs.mkdirSync(defaultDir, { recursive: true }); } catch (e) {}

        const picker = document.createElement('input');
        picker.type = 'file';
        picker.style.display = 'none';
        picker.setAttribute('nwsaveas', `${rawName}.wav`);
        picker.setAttribute('nwworkingdir', defaultDir);
        picker.accept = '.wav';
        picker.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file || !file.path) return;
            try {
                fs.writeFileSync(file.path, Buffer.from(wav));
                this._showSaveStatus(`${this._t('Saved:')} ${file.path}`);
            } catch (err) {
                console.error('SoundEffectGenerator save:', err);
                alert(`${this._t('Failed to save:')} ${err.message}`);
            } finally {
                picker.remove();
            }
        });
        document.body.appendChild(picker);
        picker.click();
    }

    _showSaveStatus(msg) {
        const footer = this.root.querySelector('.rr-sfx-save-status');
        if (!footer) return;
        footer.textContent = msg;
        footer.style.opacity = '1';
        clearTimeout(this._saveStatusTimer);
        this._saveStatusTimer = setTimeout(() => { footer.style.opacity = '0'; }, 4000);
    }
}
