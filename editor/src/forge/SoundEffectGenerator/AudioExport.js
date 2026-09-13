/**
 * AudioExport - a rendered AudioBuffer as a file in one of the formats the
 * game plays: WAV (16-bit PCM, lossless), MP3 (through lamejs, a bitrate
 * from the quality setting), or OGG (Opus through the browser's own
 * AudioEncoder, packed into an Ogg container here, a bitrate from the
 * quality setting). The Ogg writer is pure so it can be tested without a
 * browser; the Opus encoding needs WebCodecs, which NW.js has.
 */
(function(root) {
    'use strict';

    const FORMATS = [
        { id: 'wav', label: 'WAV (lossless)', extension: '.wav', mimeType: 'audio/wav', lossy: false },
        { id: 'ogg', label: 'OGG', extension: '.ogg', mimeType: 'audio/ogg', lossy: true },
        { id: 'mp3', label: 'MP3', extension: '.mp3', mimeType: 'audio/mpeg', lossy: true }
    ];

    /** The bitrate a 1..10 quality step means, per format (kbps). */
    function bitrateFor(format, quality) {
        const q = Math.max(1, Math.min(10, Math.round(Number(quality) || 7)));
        if (format === 'mp3') return [48, 64, 80, 96, 112, 128, 160, 192, 256, 320][q - 1];
        if (format === 'ogg') return [24, 32, 40, 48, 64, 80, 96, 128, 160, 192][q - 1];
        return 0;
    }

    function channelData(buffer) {
        const channels = Math.max(1, Math.min(2, buffer.numberOfChannels || 1));
        const out = [];
        for (let c = 0; c < channels; c++) out.push(buffer.getChannelData(c));
        return out;
    }

    function toInt16(samples) {
        const out = new Int16Array(samples.length);
        for (let i = 0; i < samples.length; i++) {
            const v = Math.max(-1, Math.min(1, samples[i]));
            out[i] = v < 0 ? v * 0x8000 : v * 0x7FFF;
        }
        return out;
    }

    /** 16-bit PCM WAV of every channel the buffer has (one or two). */
    function encodeWav(buffer) {
        const channels = channelData(buffer), numChannels = channels.length, sampleRate = buffer.sampleRate, numSamples = buffer.length;
        const blockAlign = numChannels * 2, dataSize = numSamples * blockAlign, totalSize = 44 + dataSize;
        const ab = new ArrayBuffer(totalSize), view = new DataView(ab);
        let offset = 0;
        const writeStr = s => { for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i)); };
        writeStr('RIFF'); view.setUint32(offset, totalSize - 8, true); offset += 4;
        writeStr('WAVE'); writeStr('fmt ');
        view.setUint32(offset, 16, true); offset += 4;
        view.setUint16(offset, 1, true); offset += 2;
        view.setUint16(offset, numChannels, true); offset += 2;
        view.setUint32(offset, sampleRate, true); offset += 4;
        view.setUint32(offset, sampleRate * blockAlign, true); offset += 4;
        view.setUint16(offset, blockAlign, true); offset += 2;
        view.setUint16(offset, 16, true); offset += 2;
        writeStr('data'); view.setUint32(offset, dataSize, true); offset += 4;
        const ints = channels.map(toInt16);
        for (let i = 0; i < numSamples; i++) for (let c = 0; c < numChannels; c++) { view.setInt16(offset, ints[c][i], true); offset += 2; }
        return ab;
    }

    /**
     * The lamejs module. Its 1.2.1 package reads three of its own classes as
     * globals that nothing defines, so they are put in place first; the
     * package still encodes correctly once they are.
     */
    function loadLame(requireFn) {
        const req = requireFn || (typeof require === 'function' ? require : null);
        if (!req) return null;
        const scope = typeof window !== 'undefined' ? window : globalThis;
        for (const name of ['MPEGMode', 'Lame', 'BitStream']) {
            if (scope[name]) continue;
            try { scope[name] = req('lamejs/src/js/' + name + '.js'); } catch (error) { /* an older package has them inside */ }
        }
        return req('lamejs');
    }

    /** MP3 through lamejs (`lame` is the module from loadLame). */
    function encodeMp3(buffer, kbps, lame) {
        if (!lame || !lame.Mp3Encoder) throw new Error('The MP3 encoder (lamejs) is not available.');
        const channels = channelData(buffer), ints = channels.map(toInt16);
        const encoder = new lame.Mp3Encoder(channels.length, buffer.sampleRate, kbps || 128);
        const parts = [];
        const block = 1152;
        for (let i = 0; i < buffer.length; i += block) {
            const left = ints[0].subarray(i, i + block), right = ints[1] ? ints[1].subarray(i, i + block) : undefined;
            const part = right ? encoder.encodeBuffer(left, right) : encoder.encodeBuffer(left);
            if (part.length) parts.push(part);
        }
        const tail = encoder.flush();
        if (tail.length) parts.push(tail);
        const total = parts.reduce((n, p) => n + p.length, 0), out = new Uint8Array(total);
        let at = 0;
        for (const p of parts) { out.set(p, at); at += p.length; }
        return out.buffer;
    }

    // ---- Ogg container ------------------------------------------------------

    const CRC_TABLE = (() => {
        const table = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let r = i << 24;
            for (let j = 0; j < 8; j++) r = (r & 0x80000000) ? ((r << 1) ^ 0x04c11db7) : (r << 1);
            table[i] = r >>> 0;
        }
        return table;
    })();

    /** The Ogg page checksum: CRC-32, polynomial 0x04c11db7, no reflection, no final xor. */
    function oggCrc(bytes) {
        let crc = 0;
        for (let i = 0; i < bytes.length; i++) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ bytes[i]) & 0xff]) >>> 0;
        return crc >>> 0;
    }

    /**
     * One Ogg page holding whole packets. `granule` is the page's granule
     * position (a BigInt or a number), `flags` the header type (2 first
     * page, 4 last page).
     */
    function oggPage(packets, { serial, sequence, granule, flags = 0 }) {
        const lacing = [];
        for (const packet of packets) {
            let left = packet.length;
            while (left >= 255) { lacing.push(255); left -= 255; }
            lacing.push(left);
        }
        if (lacing.length > 255) throw new Error('too many packet segments for one Ogg page');
        const payload = packets.reduce((n, p) => n + p.length, 0);
        const page = new Uint8Array(27 + lacing.length + payload), view = new DataView(page.buffer);
        page.set([0x4f, 0x67, 0x67, 0x53], 0);
        page[4] = 0;
        page[5] = flags;
        view.setBigInt64(6, BigInt(granule), true);
        view.setUint32(14, serial >>> 0, true);
        view.setUint32(18, sequence >>> 0, true);
        view.setUint32(22, 0, true);
        page[26] = lacing.length;
        page.set(lacing, 27);
        let at = 27 + lacing.length;
        for (const packet of packets) { page.set(packet, at); at += packet.length; }
        view.setUint32(22, oggCrc(page), true);
        return page;
    }

    function opusHead(channels, preSkip, inputSampleRate) {
        const head = new Uint8Array(19), view = new DataView(head.buffer);
        head.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64], 0);
        head[8] = 1;
        head[9] = channels;
        view.setUint16(10, preSkip, true);
        view.setUint32(12, inputSampleRate, true);
        view.setInt16(16, 0, true);
        head[18] = 0;
        return head;
    }

    function opusTags(vendor) {
        const text = new TextEncoder().encode(vendor || 'RPG Reactor');
        const tags = new Uint8Array(8 + 4 + text.length + 4), view = new DataView(tags.buffer);
        tags.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73], 0);
        view.setUint32(8, text.length, true);
        tags.set(text, 12);
        view.setUint32(12 + text.length, 0, true);
        return tags;
    }

    /**
     * An Ogg Opus file from encoded packets: [{data: Uint8Array, samples}]
     * (samples at 48 kHz per packet), the OpusHead bytes (from the encoder's
     * decoder description, or built here), and the pre-skip in samples.
     */
    function oggOpusFile(packets, { head, preSkip = 312, channels = 1, inputSampleRate = 48000, serial = 0x52524f50, perPage = 50 } = {}) {
        const pages = [];
        let sequence = 0;
        pages.push(oggPage([head || opusHead(channels, preSkip, inputSampleRate)], { serial, sequence: sequence++, granule: 0, flags: 2 }));
        pages.push(oggPage([opusTags()], { serial, sequence: sequence++, granule: 0 }));
        let granule = BigInt(preSkip);
        for (let i = 0; i < packets.length; i += perPage) {
            const group = packets.slice(i, i + perPage);
            for (const p of group) granule += BigInt(p.samples || 0);
            const last = i + perPage >= packets.length;
            pages.push(oggPage(group.map(p => p.data), { serial, sequence: sequence++, granule, flags: last ? 4 : 0 }));
        }
        if (!packets.length) pages.push(oggPage([], { serial, sequence: sequence++, granule: 0, flags: 4 }));
        const total = pages.reduce((n, p) => n + p.length, 0), out = new Uint8Array(total);
        let at = 0;
        for (const p of pages) { out.set(p, at); at += p.length; }
        return out.buffer;
    }

    /** The buffer at 48 kHz, which is what Opus works in. */
    async function resampleTo48k(buffer) {
        if (buffer.sampleRate === 48000 || typeof OfflineAudioContext === 'undefined') return buffer;
        const channels = Math.max(1, Math.min(2, buffer.numberOfChannels || 1));
        const length = Math.ceil(buffer.length * 48000 / buffer.sampleRate);
        const offline = new OfflineAudioContext(channels, length, 48000);
        const source = offline.createBufferSource();
        source.buffer = buffer;
        source.connect(offline.destination);
        source.start(0);
        return offline.startRendering();
    }

    /** Ogg Opus through WebCodecs. Rejects when the browser has no Opus encoder. */
    async function encodeOggOpus(buffer, kbps) {
        if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') throw new Error('This build cannot encode Opus; save as WAV or MP3.');
        const source = await resampleTo48k(buffer);
        const channels = Math.max(1, Math.min(2, source.numberOfChannels || 1)), sampleRate = source.sampleRate;
        const config = { codec: 'opus', sampleRate, numberOfChannels: channels, bitrate: (kbps || 96) * 1000 };
        const support = await AudioEncoder.isConfigSupported(config).catch(() => ({ supported: false }));
        if (!support || !support.supported) throw new Error('This build cannot encode Opus; save as WAV or MP3.');
        const packets = [];
        let head = null, failure = null;
        const encoder = new AudioEncoder({
            output: (chunk, metadata) => {
                const description = metadata && metadata.decoderConfig && metadata.decoderConfig.description;
                if (description && !head) head = new Uint8Array(description instanceof ArrayBuffer ? description : description.buffer.slice(description.byteOffset, description.byteOffset + description.byteLength));
                const data = new Uint8Array(chunk.byteLength);
                chunk.copyTo(data);
                packets.push({ data, samples: Math.round((chunk.duration || 20000) * sampleRate / 1e6) });
            },
            error: error => { failure = error; }
        });
        encoder.configure(config);
        const frame = Math.round(sampleRate * 0.02);
        for (let at = 0; at < source.length; at += frame) {
            const count = Math.min(frame, source.length - at);
            const planar = new Float32Array(count * channels);
            for (let c = 0; c < channels; c++) planar.set(source.getChannelData(c).subarray(at, at + count), c * count);
            const audio = new AudioData({ format: 'f32-planar', sampleRate, numberOfFrames: count, numberOfChannels: channels, timestamp: Math.round(at * 1e6 / sampleRate), data: planar });
            encoder.encode(audio);
            audio.close();
        }
        await encoder.flush();
        encoder.close();
        if (failure) throw failure;
        let preSkip = 312;
        if (head && head.length >= 12 && String.fromCharCode(...head.subarray(0, 8)) === 'OpusHead') preSkip = new DataView(head.buffer, head.byteOffset, head.byteLength).getUint16(10, true);
        else head = null;
        return oggOpusFile(packets, { head, preSkip, channels, inputSampleRate: buffer.sampleRate });
    }

    /** The file bytes for a format, as an ArrayBuffer. `lame` is the lamejs module when MP3 is wanted. */
    async function encode(buffer, format, quality, lame) {
        if (format === 'mp3') return encodeMp3(buffer, bitrateFor('mp3', quality), lame);
        if (format === 'ogg') return encodeOggOpus(buffer, bitrateFor('ogg', quality));
        return encodeWav(buffer);
    }

    const api = { FORMATS, bitrateFor, loadLame, encodeWav, encodeMp3, encodeOggOpus, encode, oggCrc, oggPage, oggOpusFile, opusHead, opusTags };
    root.RRAudioExport = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
