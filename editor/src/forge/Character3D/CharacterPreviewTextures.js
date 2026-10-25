(function(root) {
    'use strict';
    const cache = new WeakMap();

    function thumbnail(texture, limit = 256) {
        if (!texture || Math.max(texture.width, texture.height) <= limit) return texture;
        const previous = cache.get(texture);
        if (previous?.limit === limit) return previous.texture;
        const scale = limit / Math.max(texture.width, texture.height);
        const width = Math.max(1, Math.floor(texture.width * scale));
        const height = Math.max(1, Math.floor(texture.height * scale));
        const data = new Uint8Array(width * height * 4);
        for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
            const left = Math.floor(column * texture.width / width), right = Math.floor((column + 1) * texture.width / width);
            const top = Math.floor(row * texture.height / height), bottom = Math.floor((row + 1) * texture.height / height);
            let red = 0, green = 0, blue = 0, alpha = 0;
            for (let sourceRow = top; sourceRow < bottom; sourceRow++) for (let sourceColumn = left; sourceColumn < right; sourceColumn++) {
                const source = (sourceRow * texture.width + sourceColumn) * 4;
                const coverage = texture.data[source + 3];
                red += texture.data[source] * coverage; green += texture.data[source + 1] * coverage; blue += texture.data[source + 2] * coverage;
                alpha += coverage;
            }
            const target = (row * width + column) * 4;
            if (alpha) { data[target] = Math.round(red / alpha); data[target + 1] = Math.round(green / alpha); data[target + 2] = Math.round(blue / alpha); }
            data[target + 3] = Math.round(alpha / ((right - left) * (bottom - top)));
        }
        const output = { ...texture, width, height, data };
        cache.set(texture, { limit, texture: output });
        return output;
    }

    const api = { thumbnail };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.RRCharacterPreviewTextures = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
