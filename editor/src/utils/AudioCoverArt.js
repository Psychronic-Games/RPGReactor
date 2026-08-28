/**
 * Album art for audio tracks in the editor.
 *
 * Embedded pictures live in the Vorbis/Opus comment header of an .ogg file:
 * `METADATA_BLOCK_PICTURE` holds a base64 FLAC PICTURE block, and the legacy
 * `COVERART` field holds base64 image bytes with `COVERARTMIME` alongside.
 * For .mp3 files the picture is the ID3v2 `APIC` frame, and for .flac files
 * the container's own PICTURE metadata block. Either way the art
 * sits near the start of the file but can span a lot of it, so extraction
 * reads a growing prefix of the file rather than the whole multi-megabyte
 * track.
 *
 * Tracks without embedded art get a deterministic placeholder tile derived
 * from the track name, so every row still shows a stable, distinct image.
 */
(function(root) {
    'use strict';

    // 'OggS' page capture pattern, big-endian.
    const OGG_MAGIC = 0x4f676753;

    // Prefix sizes to try before giving up on a picture that never ends.
    const READ_STEPS = [131072, 1048576, 4194304];

    function ascii(bytes, start, length) {
        let out = '';
        for (let i = start; i < start + length && i < bytes.length; i++) {
            out += String.fromCharCode(bytes[i]);
        }
        return out;
    }

    function concat(chunks) {
        let total = 0;
        for (const chunk of chunks) total += chunk.length;
        const out = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
            out.set(chunk, offset);
            offset += chunk.length;
        }
        return out;
    }

    function base64ToBytes(b64) {
        if (typeof Buffer !== 'undefined') {
            const buf = Buffer.from(b64, 'base64');
            return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
        }
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    function bytesToBase64(bytes) {
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(bytes).toString('base64');
        }
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        return btoa(bin);
    }

    /**
     * Reassemble the first `wantPackets` packets of the file's first logical
     * bitstream. Packets span page boundaries via 255-byte lacing, so chunks
     * accumulate across pages until a lacing value below 255 closes one.
     */
    function collectPackets(bytes, wantPackets) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const packets = [];
        let chunks = [];
        let offset = 0;
        let serial = null;

        while (offset + 27 <= bytes.length) {
            // A malformed page means more bytes won't help; only running off
            // the end of the buffer justifies reading a longer prefix.
            if (view.getUint32(offset) !== OGG_MAGIC) {
                return { packets, complete: false, truncated: false };
            }
            const pageSerial = view.getUint32(offset + 14, true);
            const segCount = bytes[offset + 26];
            let pos = offset + 27 + segCount;
            if (pos > bytes.length) return { packets, complete: false, truncated: true };
            if (serial === null) serial = pageSerial;

            for (let i = 0; i < segCount; i++) {
                const lace = bytes[offset + 27 + i];
                if (pos + lace > bytes.length) return { packets, complete: false, truncated: true };
                if (pageSerial === serial) {
                    chunks.push(bytes.subarray(pos, pos + lace));
                    if (lace < 255) {
                        packets.push(concat(chunks));
                        chunks = [];
                        if (packets.length >= wantPackets) {
                            return { packets, complete: true, truncated: false };
                        }
                    }
                }
                pos += lace;
            }
            offset = pos;
        }
        return { packets, complete: false, truncated: true };
    }

    /** The user comment strings of a Vorbis/Opus comment packet, or null. */
    function readComments(packet) {
        let offset;
        if (packet.length >= 7 && packet[0] === 0x03 && ascii(packet, 1, 6) === 'vorbis') {
            offset = 7;
        } else if (packet.length >= 8 && ascii(packet, 0, 8) === 'OpusTags') {
            offset = 8;
        } else {
            return null;
        }

        const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
        const decoder = new TextDecoder('utf-8');
        if (offset + 4 > packet.length) return null;
        offset += 4 + view.getUint32(offset, true); // vendor string
        if (offset + 4 > packet.length) return null;
        const count = view.getUint32(offset, true);
        offset += 4;

        const comments = [];
        for (let i = 0; i < count; i++) {
            if (offset + 4 > packet.length) return null;
            const length = view.getUint32(offset, true);
            offset += 4;
            if (offset + length > packet.length) return null;
            comments.push(decoder.decode(packet.subarray(offset, offset + length)));
            offset += length;
        }
        return comments;
    }

    /** data: URL of the image inside a base64 FLAC PICTURE block, or null. */
    function decodeFlacPicture(b64) {
        let block;
        try {
            block = base64ToBytes(b64.trim());
        } catch (error) {
            return null;
        }
        return decodeFlacPictureBytes(block);
    }

    function decodeFlacPictureBytes(block) {
        if (block.length < 32) return null;
        const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
        let offset = 4; // picture type
        const mimeLength = view.getUint32(offset);
        offset += 4;
        if (offset + mimeLength > block.length) return null;
        const mime = ascii(block, offset, mimeLength) || 'image/jpeg';
        offset += mimeLength;
        if (offset + 4 > block.length) return null;
        offset += 4 + view.getUint32(offset); // description
        offset += 16; // width, height, depth, palette size
        if (offset + 4 > block.length) return null;
        const dataLength = view.getUint32(offset);
        offset += 4;
        if (offset + dataLength > block.length) return null;
        return 'data:' + mime + ';base64,'
            + bytesToBase64(block.subarray(offset, offset + dataLength));
    }

    function pictureFromComments(comments) {
        let coverart = null;
        let coverartMime = 'image/jpeg';
        for (const comment of comments) {
            const eq = comment.indexOf('=');
            if (eq <= 0) continue;
            const key = comment.slice(0, eq).toUpperCase();
            const value = comment.slice(eq + 1);
            if (key === 'METADATA_BLOCK_PICTURE') {
                const url = decodeFlacPicture(value);
                if (url) return url;
            } else if (key === 'COVERART') {
                coverart = value.trim();
            } else if (key === 'COVERARTMIME') {
                coverartMime = value.trim() || coverartMime;
            }
        }
        return coverart ? 'data:' + coverartMime + ';base64,' + coverart : null;
    }

    /** The front cover inside an ID3v2 tag's APIC frame, as a data: URL. */
    function extractFromId3(bytes) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const major = bytes[3];
        const tagFlags = bytes[5];
        if (tagFlags & 0x80) return { url: null, needMore: false }; // unsynchronised
        const syncsafe = at => ((bytes[at] & 0x7f) << 21) | ((bytes[at + 1] & 0x7f) << 14)
            | ((bytes[at + 2] & 0x7f) << 7) | (bytes[at + 3] & 0x7f);
        let tagEnd = 10 + syncsafe(6);
        if (tagFlags & 0x10) tagEnd += 10; // footer
        let offset = 10;
        if (tagFlags & 0x40 && offset + 4 <= bytes.length) {
            offset += major >= 4 ? syncsafe(offset) : view.getUint32(offset);
        }
        const limit = Math.min(tagEnd, bytes.length);
        let fallback = null;
        while (offset + 10 <= limit) {
            const frameId = ascii(bytes, offset, 4);
            if (!/^[A-Z0-9]{4}$/.test(frameId)) break; // padding reached
            const frameSize = major >= 4 ? syncsafe(offset + 4) : view.getUint32(offset + 4);
            const frameEnd = offset + 10 + frameSize;
            if (frameSize <= 0) break;
            if (frameEnd > limit) {
                // The frame runs past the prefix; unless the whole tag is
                // already in hand, a longer read may still find the picture.
                return { url: fallback, needMore: tagEnd > bytes.length };
            }
            if (frameId === "APIC") {
                const picture = decodeApic(bytes, offset + 10, frameSize);
                if (picture) {
                    // Prefer the front cover (type 3); remember any other
                    // picture in case the tag has no front cover at all.
                    if (picture.type === 3) return { url: picture.url, needMore: false };
                    if (!fallback) fallback = picture.url;
                }
            }
            offset = frameEnd;
        }
        return { url: fallback, needMore: !fallback && tagEnd > bytes.length };
    }

    function decodeApic(bytes, index, size) {
        const end = index + size;
        const encoding = bytes[index];
        const wide = encoding === 1 || encoding === 2;
        let offset = index + 1;
        let mime = '';
        while (offset < end && bytes[offset] !== 0) {
            mime += String.fromCharCode(bytes[offset++]);
        }
        offset++; // mime terminator
        if (offset >= end) return null;
        const type = bytes[offset++];
        // Description: null-terminated, two-byte characters and terminator
        // for the UTF-16 encodings.
        if (wide) {
            while (offset + 1 < end && (bytes[offset] !== 0 || bytes[offset + 1] !== 0)) {
                offset += 2;
            }
            offset += 2;
        } else {
            while (offset < end && bytes[offset] !== 0) offset++;
            offset++;
        }
        if (offset >= end) return null;
        return {
            type,
            url: 'data:' + (mime || 'image/jpeg') + ';base64,'
                + bytesToBase64(bytes.subarray(offset, end))
        };
    }

    /**
     * Extract embedded art from an in-memory file prefix.
     * @returns {{url: string|null, needMore: boolean}} `needMore` means the
     *   picture was still open when the prefix ran out.
     */
    /** The picture inside a native FLAC container's metadata blocks. */
    function extractFromFlac(bytes) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        let index = 4;
        while (index + 4 <= bytes.length) {
            const header = bytes[index];
            const type = header & 0x7f;
            const size = (bytes[index + 1] << 16) | (bytes[index + 2] << 8) | bytes[index + 3];
            const dataIndex = index + 4;
            if (dataIndex + size > bytes.length) {
                // A picture or comment block cut off by the prefix; a longer
                // read may complete it.
                return { url: null, needMore: type === 6 || type === 4 };
            }
            if (type === 6) {
                const url = decodeFlacPictureBytes(bytes.subarray(dataIndex, dataIndex + size));
                if (url) return { url, needMore: false };
            } else if (type === 4) {
                const comments = readVorbisCommentBody(view, bytes, dataIndex, size);
                const url = comments && pictureFromComments(comments);
                if (url) return { url, needMore: false };
            }
            if (header & 0x80) break; // last metadata block
            index = dataIndex + size;
        }
        return { url: null, needMore: false };
    }

    /** The user comment strings of a bare vorbis-comment body, or null. */
    function readVorbisCommentBody(view, bytes, index, size) {
        const end = index + size;
        const decoder = new TextDecoder('utf-8');
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
            comments.push(decoder.decode(bytes.subarray(offset, offset + length)));
            offset += length;
        }
        return comments;
    }

    function extractFromBytes(bytes) {
        if (!bytes || bytes.length < 27) return { url: null, needMore: false };
        if (ascii(bytes, 0, 3) === 'ID3') return extractFromId3(bytes);
        if (ascii(bytes, 0, 4) === 'fLaC') return extractFromFlac(bytes);
        // The comment header is the second packet of the stream.
        const { packets, complete, truncated } = collectPackets(bytes, 2);
        if (!complete) return { url: null, needMore: truncated };
        const comments = readComments(packets[1]);
        if (!comments) return { url: null, needMore: false };
        return { url: pictureFromComments(comments), needMore: false };
    }

    /**
     * The first `size` bytes of a served asset. Asks for a Range, but a
     * server free to ignore it streams instead — the reader cancels at the
     * cap so a multi-megabyte track never downloads whole for a 13KB cover.
     */
    async function fetchPrefix(url, size) {
        try {
            const response = await fetch(url, { headers: { Range: `bytes=0-${size - 1}` } });
            if (!response.ok) return null;
            if (!response.body) {
                const whole = new Uint8Array(await response.arrayBuffer());
                return whole.length > size ? whole.subarray(0, size) : whole;
            }
            const reader = response.body.getReader();
            const chunks = [];
            let total = 0;
            while (total < size) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                total += value.length;
            }
            reader.cancel().catch(() => {});
            const out = concat(chunks);
            return out.length > size ? out.subarray(0, size) : out;
        } catch (error) {
            return null;
        }
    }

    async function extractFromUrl(url) {
        for (const size of READ_STEPS) {
            const bytes = await fetchPrefix(url, size);
            if (!bytes || !bytes.length) return null;
            const { url: art, needMore } = extractFromBytes(bytes);
            if (art) return art;
            if (!needMore || bytes.length < size) return null;
        }
        return null;
    }

    /**
     * Embedded art of an on-disk (possibly encrypted) .ogg, as a data: URL,
     * or null. Synchronous on desktop, reading only as much of the file as
     * needed. In the browser there is no synchronous byte access to a
     * bundled track, so the same prefix walk runs over ranged fetches and a
     * Promise comes back instead — both callers resolve() the return value,
     * which adopts either shape.
     */
    function extractFromFile(filePath) {
        if (!filePath) return null;
        const assets = root.RREncryptedAssets;
        if (assets && assets.readAssetBytes) {
            for (const size of READ_STEPS) {
                const bytes = assets.readAssetBytes(filePath, size);
                if (!bytes) break;
                const { url, needMore } = extractFromBytes(bytes);
                if (url) return url;
                // A short read means the whole file is in hand — nothing more
                // to fetch no matter what the parser still wanted.
                if (!needMore || bytes.length < size) return null;
            }
        }
        const host = typeof window !== "undefined" ? window.RPGReactorWebHost : null;
        if (host && host.mode === "web" && typeof window.RPGReactorAssetUrl === "function") {
            try {
                return extractFromUrl(window.RPGReactorAssetUrl(filePath));
            } catch (error) {
                return null;
            }
        }
        return null;
    }

    /**
     * Stable placeholder tile for a track without embedded art: a gradient
     * whose hue derives from the name, with a note glyph. A null name gives
     * the neutral "no track" tile.
     */
    function placeholderFor(name) {
        let svg;
        if (name) {
            let hash = 0;
            const text = String(name);
            for (let i = 0; i < text.length; i++) {
                hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
            }
            const hue = hash % 360;
            svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
                + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
                + `<stop offset="0" stop-color="hsl(${hue},45%,46%)"/>`
                + `<stop offset="1" stop-color="hsl(${hue},50%,26%)"/>`
                + '</linearGradient></defs>'
                + '<rect width="64" height="64" rx="8" fill="url(#g)"/>'
                + '<text x="32" y="43" font-size="30" text-anchor="middle" '
                + 'fill="rgba(255,255,255,0.85)" font-family="sans-serif">♪</text></svg>';
        } else {
            svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
                + '<rect width="64" height="64" rx="8" fill="#3a3f46"/>'
                + '<text x="32" y="43" font-size="30" text-anchor="middle" '
                + 'fill="rgba(255,255,255,0.4)" font-family="sans-serif">♪</text></svg>';
        }
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    const fileCache = new Map();

    /** One cached async resolver shared by the Audio Player and every picker. */
    function forFile(filePath) {
        if (!filePath) return Promise.resolve(null);
        let promise = fileCache.get(filePath);
        if (!promise) {
            promise = Promise.resolve().then(() => extractFromFile(filePath)).catch(() => null);
            fileCache.set(filePath, promise);
        }
        return promise;
    }

    const api = { extractFromFile, extractFromBytes, forFile, placeholderFor };
    root.RRAudioCoverArt = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
