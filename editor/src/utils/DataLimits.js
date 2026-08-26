// Limits are based on Reactor's current memory, DOM, and runtime workloads.
globalThis.RR_LIMITS = Object.freeze({
    ACTOR_LEVEL: 999,
    ACTION_REPEATS: 100,
    MAP_COUNT: 2000,
    MAP_ID: 9999,
    MAP_WIDTH: 512,
    MAP_HEIGHT: 512,
    MAP_FILE_BYTES: 64 * 1024 * 1024,
    MAP_CANVAS_SIDE: 8192,
    MAP_CANVAS_PIXELS: 32 * 1024 * 1024,
    DATABASE_ENTRIES: Object.freeze({
        actors: 9999,
        classes: 9999,
        skills: 9999,
        items: 9999,
        weapons: 9999,
        armors: 9999,
        enemies: 9999,
        troops: 9999,
        states: 9999,
        animations: 1000,
        tilesets: 1000,
        commonEvents: 9999,
        userInterfaces: 9999,
        elements: 512,
        skillTypes: 128,
        weaponTypes: 256,
        armorTypes: 256,
        equipTypes: 128
    })
});

globalThis.rrIsMapSizeSupported = function(width, height) {
    return Number.isInteger(width) && Number.isInteger(height) &&
        width >= 1 && width <= RR_LIMITS.MAP_WIDTH &&
        height >= 1 && height <= RR_LIMITS.MAP_HEIGHT;
};

globalThis.RRMapJson = Object.freeze({
    stringify(map) {
        if (!map || !Array.isArray(map.data)) return JSON.stringify(map, null, 2);

        const compactData = JSON.stringify(map.data);
        const pretty = JSON.stringify({ ...map, data: null }, null, 2);
        return pretty.replace(/^  "data": null(,?)$/m, `  "data": ${compactData}$1`);
    }
});

globalThis.rrClassParamAtLevel = function(values, level) {
    if (!Array.isArray(values) || values.length === 0) return 0;
    const requestedLevel = Math.max(1, Math.min(RR_LIMITS.ACTOR_LEVEL, Math.floor(Number(level) || 1)));
    const exact = Number(values[requestedLevel]);
    if (Number.isFinite(exact)) return exact;

    let lastIndex = Math.min(requestedLevel, values.length - 1);
    while (lastIndex >= 1 && !Number.isFinite(Number(values[lastIndex]))) lastIndex--;
    if (lastIndex < 1) return 0;

    const lastValue = Number(values[lastIndex]);
    let previousIndex = lastIndex - 1;
    while (previousIndex >= 1 && !Number.isFinite(Number(values[previousIndex]))) previousIndex--;
    if (previousIndex < 1) return lastValue;

    const previousValue = Number(values[previousIndex]);
    const slope = (lastValue - previousValue) / (lastIndex - previousIndex);
    return Math.round(lastValue + slope * (requestedLevel - lastIndex));
};

globalThis.rrExpForLevel = function(expParams, level) {
    const [basis = 30, extra = 20, accelerationA = 30, accelerationB = 30] = expParams || [];
    const requestedLevel = Math.max(1, Math.floor(Number(level) || 1));
    const divisor = 6 + Math.pow(requestedLevel, 2) / 50 / accelerationB;
    return Math.round(
        (basis * Math.pow(requestedLevel - 1, 0.9 + accelerationA / 250) * requestedLevel * (requestedLevel + 1)) / divisor +
        (requestedLevel - 1) * extra
    );
};
