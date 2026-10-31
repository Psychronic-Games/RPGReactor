/** Node-side image decoding before legacy art is re-cut: PNG, indexed XYZ and Windows BMP.
 * Palette index zero is transparent only when the caller asks for legacy keying. */
'use strict';
const { PNG } = require('pngjs');
const { inflateSync } = require('node:zlib');
const MAX_PIXELS = 32 * 1024 * 1024;

function dimensions(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width * height > MAX_PIXELS) {
        throw new Error(`Invalid or oversized legacy image: ${width}×${height}`);
    }
}

function indexed(width, height, palette, indices, transparent) {
    const data = new Uint8Array(width * height * 4);
    for (let i = 0; i < indices.length; i++) {
        const n = indices[i], p = n * 3, at = i * 4;
        if (p + 2 >= palette.length) throw new Error('Image references a missing palette entry');
        data[at] = palette[p]; data[at + 1] = palette[p + 1]; data[at + 2] = palette[p + 2];
        data[at + 3] = transparent && n === 0 ? 0 : 255;
    }
    return { width, height, data };
}

function xyz(bytes, transparent) {
    if (bytes.length < 8) throw new Error('Truncated XYZ header');
    const width = bytes.readUInt16LE(4), height = bytes.readUInt16LE(6);
    dimensions(width, height);
    const size = 768 + width * height;
    const raw = inflateSync(bytes.subarray(8), { maxOutputLength: size });
    if (raw.length !== size) throw new Error('Truncated XYZ palette or pixels');
    return indexed(width, height, raw.subarray(0, 768), raw.subarray(768), transparent);
}

function bmp(bytes, transparent) {
    if (bytes.length < 54) throw new Error('Truncated BMP header');
    const offset = bytes.readUInt32LE(10), header = bytes.readUInt32LE(14);
    if (header < 40 || 14 + header > bytes.length) throw new Error('Unsupported BMP header');
    const width = bytes.readInt32LE(18), signedHeight = bytes.readInt32LE(22), height = Math.abs(signedHeight);
    dimensions(width, height);
    const depth = bytes.readUInt16LE(28), compression = bytes.readUInt32LE(30);
    if (bytes.readUInt16LE(26) !== 1 || compression !== 0 || ![1, 4, 8, 24, 32].includes(depth)) {
        throw new Error(`Unsupported BMP encoding (depth ${depth}, compression ${compression})`);
    }
    const stride = Math.ceil(width * depth / 32) * 4;
    if (offset < 14 + header || offset + stride * height > bytes.length) throw new Error('Truncated BMP pixels');
    const data = new Uint8Array(width * height * 4);
    const palette = [];
    if (depth <= 8) {
        const count = bytes.readUInt32LE(46) || (1 << depth);
        if (count > 1 << depth || 14 + header + count * 4 > offset) throw new Error('Truncated BMP palette');
        for (let n = 0; n < count; n++) {
            const p = 14 + header + n * 4;
            palette.push([bytes[p + 2], bytes[p + 1], bytes[p]]);
        }
    }
    for (let y = 0; y < height; y++) {
        const row = offset + (signedHeight < 0 ? y : height - y - 1) * stride;
        for (let x = 0; x < width; x++) {
            const at = (y * width + x) * 4;
            if (depth <= 8) {
                const bit = x * depth, n = (bytes[row + (bit >> 3)] >> (8 - depth - (bit % 8))) & ((1 << depth) - 1);
                const c = palette[n];
                if (!c) throw new Error('BMP references a missing palette entry');
                data[at] = c[0]; data[at + 1] = c[1]; data[at + 2] = c[2]; data[at + 3] = transparent && n === 0 ? 0 : 255;
            } else {
                const p = row + x * (depth / 8);
                data[at] = bytes[p + 2]; data[at + 1] = bytes[p + 1]; data[at + 2] = bytes[p]; data[at + 3] = 255;
            }
        }
    }
    return { width, height, data };
}

function decode(input, transparent = false) {
    const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
    if (bytes.toString('ascii', 0, 4) === 'XYZ1') return xyz(bytes, transparent);
    if (bytes.toString('ascii', 0, 2) === 'BM') return bmp(bytes, transparent);
    if (bytes.length < 24 || bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw new Error('Unsupported legacy image (expected PNG, BMP or XYZ)');
    dimensions(bytes.readUInt32BE(16), bytes.readUInt32BE(20));
    const image = PNG.sync.read(bytes);
    if (transparent) {
        for (let p = 8; p + 12 <= bytes.length;) {
            const size = bytes.readUInt32BE(p), type = bytes.toString('ascii', p + 4, p + 8);
            if (p + 12 + size > bytes.length) throw new Error('Truncated PNG chunk');
            if (type === 'PLTE' && size >= 3) {
                const r = bytes[p + 8], g = bytes[p + 9], b = bytes[p + 10];
                for (let i = 0; i < image.data.length; i += 4) if (image.data[i] === r && image.data[i + 1] === g && image.data[i + 2] === b) image.data[i + 3] = 0;
                break;
            }
            if (type === 'IDAT' || type === 'IEND') break;
            p += 12 + size;
        }
    }
    return { width: image.width, height: image.height, data: new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.length) };
}

module.exports = { decode, MAX_PIXELS };
