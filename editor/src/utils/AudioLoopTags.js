// RPG Reactor - Audio loop tags
//
// Reads the loop points a track carries in its own container, the same way
// the game runtime does, so the editor's Audio Player loops where the game
// will: OGG (Vorbis or Opus) and FLAC comments (LOOPSTART / LOOPLENGTH in
// samples, or LOOP_START / LOOP_END), ID3v2 TXXX frames
// of the same names on MP3, and the sampler chunk of a WAV. The result is
// in seconds, converted with the sample rate read from the same header --
// for Opus the source rate OpusHead records, 48 kHz when it records none.
(function (root) {
    'use strict';

    const READ_STEPS = [131072, 1048576, 4194304];

    function fourChars(bytes, at) {
        if (at + 4 > bytes.length) return '';
        return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
    }

    function asciiText(bytes, start, length) {
        let text = '';
        const end = Math.min(bytes.length, start + length);
        for (let i = start; i < end; i++) {
            const byte = bytes[i];
            if (byte >= 0x20 && byte < 0x7f) text += String.fromCharCode(byte);
        }
        return text;
    }

    function applyComment(tags, comment) {
        const eq = comment.indexOf('=');
        if (eq < 0) return;
        const key = comment.slice(0, eq).trim().toUpperCase();
        const value = parseInt(comment.slice(eq + 1), 10);
        if (!(value >= 0)) return;
        if (key === 'LOOPSTART') tags.loopStart = value;
        else if (key === 'LOOPLENGTH') tags.loopLength = value;
    }

    /**
     * A Vorbis, Opus or FLAC comment list, as the runtime's shared comment reader
     * takes it: LOOPSTART / LOOPLENGTH, or else a LOOP_START / LOOP_END pair
     * (an end sample in place of a length) when no LOOPLENGTH is present.
     */
    function applyCommentsWithPairs(tags, comments) {
        let pairStart = -1;
        let pairEnd = -1;
        let hasLength = false;
        for (const comment of comments) {
            applyComment(tags, comment);
            const eq = comment.indexOf('=');
            if (eq < 0) continue;
            const key = comment.slice(0, eq).trim().toUpperCase();
            const value = parseInt(comment.slice(eq + 1), 10);
            if (!(value >= 0)) continue;
            if (key === 'LOOPLENGTH') hasLength = true;
            else if (key === 'LOOP_START') pairStart = value;
            else if (key === 'LOOP_END') pairEnd = value;
        }
        if (!hasLength && pairStart >= 0 && pairEnd > pairStart) {
            tags.loopStart = pairStart;
            tags.loopLength = pairEnd - pairStart;
        }
    }

    /** Comment strings of a bare vorbis-comment body, or null when cut off. */
    function readVorbisComments(view, bytes, index, end) {
        if (index + 4 > end) return null;
        let offset = index + 4 + view.getUint32(index, true); // vendor string
        if (offset + 4 > end) return null;
        const count = view.getUint32(offset, true);
        offset += 4;
        const comments = [];
        for (let i = 0; i < count; i++) {
            if (offset + 4 > end) return null;
            const length = view.getUint32(offset, true);
            offset += 4;
            if (offset + length > end) return null;
            // Only the tag name and number matter; embedded pictures in the
            // same list are megabytes of base64 nobody needs decoded here.
            comments.push(asciiText(bytes, offset, Math.min(length, 32)));
            offset += length;
        }
        return comments;
    }

    /** The first `want` logical packets of an Ogg stream. */
    function collectOggPackets(bytes, want) {
        const packets = [];
        let pending = [];
        let offset = 0;
        while (offset + 27 <= bytes.length && packets.length < want) {
            if (fourChars(bytes, offset) !== 'OggS') break;
            const segCount = bytes[offset + 26];
            const headerEnd = offset + 27 + segCount;
            if (headerEnd > bytes.length) return { packets, truncated: true };
            let dataOffset = headerEnd;
            for (let i = 0; i < segCount; i++) {
                const lace = bytes[offset + 27 + i];
                if (dataOffset + lace > bytes.length) return { packets, truncated: true };
                pending.push(bytes.subarray(dataOffset, dataOffset + lace));
                dataOffset += lace;
                if (lace < 255) {
                    let total = 0;
                    for (const chunk of pending) total += chunk.length;
                    const packet = new Uint8Array(total);
                    let at = 0;
                    for (const chunk of pending) {
                        packet.set(chunk, at);
                        at += chunk.length;
                    }
                    packets.push(packet);
                    pending = [];
                    if (packets.length >= want) break;
                }
            }
            offset = dataOffset;
        }
        return { packets, truncated: packets.length < want };
    }

    function parseOgg(bytes, tags) {
        const { packets, truncated } = collectOggPackets(bytes, 2);
        const head = packets[0];
        if (head && head.length >= 8 && fourChars(head, 0) === 'Opus' && fourChars(head, 4) === 'Head') {
            if (head.length >= 16) {
                const rate = new DataView(head.buffer, head.byteOffset, head.byteLength).getUint32(12, true);
                tags.sampleRate = rate > 0 ? rate : 48000;
                // Counts may still be at Opus's own 48 kHz; fitLoopPoints decides.
                if (rate > 0 && rate !== 48000) tags.opusInputRate = true;
            }
            const opusTags = packets[1];
            if (opusTags && fourChars(opusTags, 0) === 'Opus' && fourChars(opusTags, 4) === 'Tags') {
                const view = new DataView(opusTags.buffer, opusTags.byteOffset, opusTags.byteLength);
                const comments = readVorbisComments(view, opusTags, 8, opusTags.length);
                if (comments) applyCommentsWithPairs(tags, comments);
            }
            return truncated;
        }
        for (const packet of packets) {
            if (packet.length < 7 || fourChars(packet, 1) !== 'vorb') continue;
            const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
            if (packet[0] === 1 && packet.length >= 16) {
                tags.sampleRate = view.getUint32(12, true);
            } else if (packet[0] === 3) {
                const comments = readVorbisComments(view, packet, 7, packet.length);
                if (comments) applyCommentsWithPairs(tags, comments);
            }
        }
        return truncated;
    }

    function parseFlac(bytes, tags) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        let index = 4;
        while (index + 4 <= bytes.length) {
            const header = bytes[index];
            const type = header & 0x7f;
            const size = (bytes[index + 1] << 16) | (bytes[index + 2] << 8) | bytes[index + 3];
            const dataIndex = index + 4;
            if (dataIndex + size > bytes.length) return type === 0 || type === 4;
            if (type === 0 && size >= 18) {
                // STREAMINFO: the sample rate is 20 bits starting at byte 10.
                tags.sampleRate = (bytes[dataIndex + 10] << 12)
                    | (bytes[dataIndex + 11] << 4)
                    | (bytes[dataIndex + 12] >> 4);
            } else if (type === 4) {
                const comments = readVorbisComments(view, bytes, dataIndex, dataIndex + size);
                if (comments) applyCommentsWithPairs(tags, comments);
            }
            if (header & 0x80) return false; // last metadata block
            index = dataIndex + size;
        }
        return true;
    }

    function mp3SampleRate(bytes, start) {
        const rates = {
            3: [44100, 48000, 32000], // MPEG 1
            2: [22050, 24000, 16000], // MPEG 2
            0: [11025, 12000, 8000] // MPEG 2.5
        };
        const end = Math.min(bytes.length - 4, start + 4096);
        for (let i = Math.max(start, 0); i < end; i++) {
            if (bytes[i] !== 0xff || (bytes[i + 1] & 0xe0) !== 0xe0) continue;
            const version = (bytes[i + 1] >> 3) & 0x03;
            const layer = (bytes[i + 1] >> 1) & 0x03;
            const rateIndex = (bytes[i + 2] >> 2) & 0x03;
            if (version === 1 || layer === 0 || rateIndex === 3) continue;
            const table = rates[version];
            if (table) return table[rateIndex];
        }
        return 0;
    }

    function parseMp3(bytes, tags) {
        if (bytes.length < 10) return true;
        const major = bytes[3];
        const tagFlags = bytes[5];
        if (tagFlags & 0x80) return false; // unsynchronised tags are not worth parsing
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const syncsafe = at => ((bytes[at] & 0x7f) << 21) | ((bytes[at + 1] & 0x7f) << 14)
            | ((bytes[at + 2] & 0x7f) << 7) | (bytes[at + 3] & 0x7f);
        let tagEnd = 10 + syncsafe(6);
        if (tagFlags & 0x10) tagEnd += 10; // footer
        let index = 10;
        if ((tagFlags & 0x40) && index + 4 <= bytes.length) {
            index += major >= 4 ? syncsafe(index) : view.getUint32(index); // extended header
        }
        const limit = Math.min(tagEnd, bytes.length);
        while (index + 10 <= limit) {
            const frameId = fourChars(bytes, index);
            if (!/^[A-Z0-9]{4}$/.test(frameId)) break; // padding reached
            const frameSize = major >= 4 ? syncsafe(index + 4) : view.getUint32(index + 4);
            const frameEnd = index + 10 + frameSize;
            if (frameSize <= 0 || frameEnd > limit) break;
            if (frameId === 'TXXX') {
                const encoding = bytes[index + 10];
                const step = encoding === 1 || encoding === 2 ? 2 : 1;
                let split = -1;
                for (let i = index + 11; i + step <= frameEnd; i += step) {
                    if (bytes[i] === 0 && (step === 1 || bytes[i + 1] === 0)) {
                        split = i;
                        break;
                    }
                }
                if (split >= 0) {
                    const name = asciiText(bytes, index + 11, split - (index + 11)).toUpperCase();
                    const value = asciiText(bytes, split + step, frameEnd - (split + step));
                    applyComment(tags, name + '=' + value);
                }
            }
            index = frameEnd;
        }
        if (tagEnd + 4 > bytes.length) return true;
        tags.sampleRate = mp3SampleRate(bytes, tagEnd);
        return false;
    }

    function parseWav(bytes, tags) {
        if (bytes.length < 12 || fourChars(bytes, 8) !== 'WAVE') return false;
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        let index = 12;
        let sawSampler = false;
        while (index + 8 <= bytes.length) {
            const chunkId = fourChars(bytes, index);
            const chunkSize = view.getUint32(index + 4, true);
            const dataIndex = index + 8;
            if (chunkId === 'fmt ' && dataIndex + 8 <= bytes.length) {
                tags.sampleRate = view.getUint32(dataIndex + 4, true);
            } else if (chunkId === 'smpl') {
                if (dataIndex + 52 > bytes.length) return true;
                sawSampler = true;
                const numLoops = view.getUint32(dataIndex + 28, true);
                if (numLoops > 0) {
                    const start = view.getUint32(dataIndex + 44, true);
                    const end = view.getUint32(dataIndex + 48, true);
                    if (end > start) {
                        tags.loopStart = start;
                        tags.loopLength = end - start;
                    }
                }
            }
            // Chunks are word-aligned; odd sizes carry a pad byte.
            index = dataIndex + chunkSize + (chunkSize % 2);
        }
        // The sampler chunk usually follows the audio data, so a prefix that
        // ran out mid-walk has not seen it yet.
        return !sawSampler && index > bytes.length;
    }

    /**
     * Loop tags of an in-memory file prefix.
     * @returns {{loopStart: number, loopLength: number, sampleRate: number,
     *   needMore: boolean}} samples, plus whether a longer prefix could still
     *   reveal tags this one cut off.
     */
    function parseLoopTags(bytes) {
        const tags = { loopStart: 0, loopLength: 0, sampleRate: 0, needMore: false };
        if (!bytes || bytes.length < 12) return tags;
        const magic = fourChars(bytes, 0);
        let needMore = false;
        if (magic === 'RIFF') needMore = parseWav(bytes, tags);
        else if (magic.slice(0, 3) === 'ID3') needMore = parseMp3(bytes, tags);
        else if (magic === 'fLaC') needMore = parseFlac(bytes, tags);
        else if (magic === 'OggS') needMore = parseOgg(bytes, tags);
        tags.needMore = !!needMore;
        return tags;
    }

    /**
     * Loop points in seconds — `{ start, end }` — or null when the file has
     * none. `end` is where playback wraps back to `start`.
     */
    function loopPointsFromTags(tags) {
        if (!tags || !(tags.loopLength > 0) || !(tags.sampleRate > 0)) return null;
        const start = tags.loopStart / tags.sampleRate;
        const points = { start, end: start + tags.loopLength / tags.sampleRate };
        if (tags.opusInputRate) {
            // The same counts at 48 kHz, for fitLoopPoints.
            points.at48k = { start: tags.loopStart / 48000, end: (tags.loopStart + tags.loopLength) / 48000 };
        }
        return points;
    }

    // How far past the track a loop end may sit and still count as ending
    // with it; the runtime's WebAudio.LOOP_END_SLACK.
    const LOOP_END_SLACK = 0.05;

    /**
     * The loop points to use once the track's length is known, as the
     * runtime's _loopSampleRate decides: an Opus loop that would end past
     * the track at the rate OpusHead records, but fits at 48 kHz, was
     * counted at 48 kHz. When both fit, or the length is not known yet,
     * the recorded rate holds.
     */
    function fitLoopPoints(points, durationSeconds) {
        if (!points || !points.at48k || !(durationSeconds > 0)) return points;
        const limit = durationSeconds + LOOP_END_SLACK;
        return points.end > limit && points.at48k.end <= limit ? points.at48k : points;
    }

    function loopPointsFromBytes(bytes) {
        return loopPointsFromTags(parseLoopTags(bytes));
    }

    async function fetchPrefix(url, size) {
        try {
            const response = await fetch(url, { headers: { Range: `bytes=0-${size - 1}` } });
            if (!response.ok) return null;
            const whole = new Uint8Array(await response.arrayBuffer());
            return whole.length > size ? whole.subarray(0, size) : whole;
        } catch (error) {
            return null;
        }
    }

    /**
     * Loop points of an on-disk (possibly encrypted) track, as a Promise of
     * `{ start, end }` or null. Reads a growing prefix and stops as soon as
     * the header is complete; a WAV whose sampler chunk trails the audio
     * data is read whole, since that chunk is the only place it can be.
     */
    async function loopPointsFromFile(filePath) {
        if (!filePath) return null;
        const assets = root.RREncryptedAssets;
        let lastTags = null;
        if (assets && assets.readAssetBytes) {
            for (const size of READ_STEPS) {
                const bytes = assets.readAssetBytes(filePath, size);
                if (!bytes) break;
                lastTags = parseLoopTags(bytes);
                if (!lastTags.needMore || bytes.length < size) return loopPointsFromTags(lastTags);
            }
            if (lastTags && lastTags.needMore && assets.readAssetBytesAsync) {
                const whole = await assets.readAssetBytesAsync(filePath);
                return whole ? loopPointsFromBytes(whole) : loopPointsFromTags(lastTags);
            }
            if (lastTags) return loopPointsFromTags(lastTags);
        }
        const host = typeof window !== 'undefined' ? window.RPGReactorWebHost : null;
        if (host && host.mode === 'web' && typeof window.RPGReactorAssetUrl === 'function') {
            const url = window.RPGReactorAssetUrl(filePath);
            for (const size of READ_STEPS) {
                const bytes = await fetchPrefix(url, size);
                if (!bytes || !bytes.length) return null;
                const tags = parseLoopTags(bytes);
                if (!tags.needMore || bytes.length < size) return loopPointsFromTags(tags);
            }
        }
        return null;
    }

    /**
     * Make a media element loop the way the game loops a BGM or BGS: from
     * the loop end back to the loop start when the track has loop points,
     * over the whole file when it has none, and not at all while looping is
     * off. Wrapping keeps the overshoot past the loop end, so the phase stays
     * exact. A seek past the loop end plays the tail out instead of snapping
     * straight back; the loop re-arms once playback is before the end again.
     *
     * Used by the Audio Player's channels, the Resource Manager's preview and
     * the audio picker.
     *
     * @returns {{ setLoop(on: boolean): void, setPoints(points: ?{start: number,
     *   end: number}): void, readonly points: ?{start: number, end: number},
     *   readonly loop: boolean, dispose(): void }}
     */
    function attachLoopPlayback(audio, options = {}) {
        const raf = typeof root.requestAnimationFrame === 'function'
            ? callback => root.requestAnimationFrame(callback) : callback => setTimeout(callback, 16);
        const cancel = typeof root.cancelAnimationFrame === 'function'
            ? id => root.cancelAnimationFrame(id) : id => clearTimeout(id);
        let loop = !!options.loop;
        let raw = null;
        let points = null;
        let armed = true;
        let watch = 0;
        let disposed = false;
        // Between 'seeking' and 'seeked' the position is the seek target and
        // the loop has not been re-armed for it yet; the seek's own
        // 'timeupdate' lands in that gap, so nothing wraps until it closes.
        let seekPending = false;

        const syncNativeLoop = () => { audio.loop = loop && !points; };
        const rearm = () => { armed = !points || audio.currentTime < points.end; };
        const check = () => {
            if (disposed || !loop || !points || seekPending) return;
            const time = audio.currentTime;
            if (time < points.end) {
                armed = true;
            } else if (armed) {
                audio.currentTime = points.start + ((time - points.end) % (points.end - points.start));
            }
        };
        const tick = () => {
            watch = 0;
            if (disposed || !points || audio.paused || audio.ended) return;
            check();
            watch = raf(tick);
        };
        const onSeeking = () => { seekPending = true; };
        const onSeeked = () => {
            seekPending = false;
            rearm();
        };
        // A new source abandons any seek in flight, and its 'seeked' with it.
        const onLoadStart = () => { seekPending = false; };
        const startWatch = () => {
            if (!watch && !disposed && points) watch = raf(tick);
        };
        // An Opus loop may only be settled against the track's length, as the
        // game settles it; the length arrives with the metadata.
        const fit = () => {
            const fitted = fitLoopPoints(raw, audio.duration);
            points = fitted && fitted.end > fitted.start ? fitted : null;
            rearm();
            syncNativeLoop();
            startWatch();
        };
        const onEnded = () => {
            // A loop that runs to the end of the file, or a tail auditioned
            // past the loop end, finishes the file; wrap like the game does.
            if (!loop || !points) return;
            audio.currentTime = points.start;
            armed = true;
            const played = audio.play();
            if (played && typeof played.catch === 'function') played.catch(() => {});
        };
        // Frames give a tight wrap; 'timeupdate' keeps the loop going where
        // frames stop, in a hidden window.
        const listeners = {
            play: startWatch, timeupdate: check, seeking: onSeeking, seeked: onSeeked,
            loadstart: onLoadStart, ended: onEnded, loadedmetadata: fit
        };
        for (const [type, listener] of Object.entries(listeners)) audio.addEventListener(type, listener);
        syncNativeLoop();

        return {
            setLoop(on) {
                loop = !!on;
                rearm();
                syncNativeLoop();
                startWatch();
            },
            setPoints(value) {
                raw = value || null;
                fit();
            },
            get points() { return points; },
            get loop() { return loop; },
            dispose() {
                disposed = true;
                if (watch) cancel(watch);
                watch = 0;
                for (const [type, listener] of Object.entries(listeners)) audio.removeEventListener(type, listener);
            }
        };
    }

    const api = { parseLoopTags, loopPointsFromTags, loopPointsFromBytes, loopPointsFromFile, fitLoopPoints, attachLoopPlayback };
    root.RRAudioLoopTags = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
