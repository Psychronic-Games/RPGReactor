/**
 * Pure RPG Maker plugin parameter encoding shared by editor surfaces.
 */
(function(root) {
    const getStructName = type => {
        const match = String(type || '').match(/struct<([^>]+)>/);
        return match ? match[1].trim() : '';
    };

    const parseJsonLayer = (value, fallback) => {
        if (typeof value !== 'string') return value;
        try {
            return JSON.parse(value);
        } catch (error) {
            return fallback !== undefined ? fallback : value;
        }
    };

    const clone = value => {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    };

    const deserializeStructFieldValue = (rawValue, fieldSchema, structDefinitions = {}) => {
        const type = String(fieldSchema?.type || 'string');
        const nestedStructName = getStructName(type);
        if (nestedStructName) {
            const nestedSchema = structDefinitions[nestedStructName] || {};
            if (type.includes('[]')) {
                if (rawValue === null || rawValue === undefined) return [];
                const entries = parseJsonLayer(rawValue, rawValue);
                return Array.isArray(entries)
                    ? entries.map(entry => deserializeStructValue(entry, nestedSchema, structDefinitions))
                    : rawValue ?? '';
            }
            return deserializeStructValue(rawValue, nestedSchema, structDefinitions);
        }
        if (type === 'note') {
            const note = parseJsonLayer(rawValue, rawValue ?? '');
            return typeof note === 'string' ? note : String(rawValue ?? '');
        }
        if (type.includes('[]')) {
            if (rawValue === null || rawValue === undefined) return [];
            const entries = parseJsonLayer(rawValue, rawValue);
            return Array.isArray(entries) ? entries : rawValue ?? '';
        }
        if (rawValue === null || rawValue === undefined || rawValue === '') {
            if (type === 'boolean') return 'false';
            if (type === 'number') return '0';
            return '';
        }
        return rawValue;
    };

    const deserializeStructValue = (value, structSchema = {}, structDefinitions = {}) => {
        const parsed = value === null || value === undefined ? {} : parseJsonLayer(value, value);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return value ?? '';
        const result = {};
        const fieldNames = new Set([...Object.keys(structSchema), ...Object.keys(parsed)]);
        for (const fieldName of fieldNames) {
            const fieldSchema = structSchema[fieldName] || { type: 'string', default: '' };
            const rawValue = parsed[fieldName] !== undefined ? parsed[fieldName] : fieldSchema.default;
            result[fieldName] = deserializeStructFieldValue(rawValue, fieldSchema, structDefinitions);
        }
        return result;
    };

    const deserializeComplex = (value, schema, structDefinitions = {}) => {
        const type = String(schema?.type || '');
        const structName = getStructName(type);
        if (structName) {
            const structSchema = structDefinitions[structName] || {};
            if (type.includes('[]')) {
                if (value === null || value === undefined) return [];
                const entries = parseJsonLayer(value, value);
                return Array.isArray(entries)
                    ? entries.map(entry => deserializeStructValue(entry, structSchema, structDefinitions))
                    : value;
            }
            return deserializeStructValue(value, structSchema, structDefinitions);
        }
        if (type.includes('[]')) {
            if (value === null || value === undefined) return [];
            const entries = parseJsonLayer(value, value);
            return Array.isArray(entries) ? entries : value;
        }
        return parseJsonLayer(value, value);
    };

    const createDefaultStructValue = (structSchema, structDefinitions = {}) =>
        deserializeStructValue({}, structSchema, structDefinitions);

    const serializeStructValue = (structData, structSchema = {}, structDefinitions = {}) => {
        if (!structData || typeof structData !== 'object' || Array.isArray(structData)) {
            return structData ?? '';
        }
        const result = {};
        const fieldNames = new Set([...Object.keys(structSchema), ...Object.keys(structData)]);
        for (const fieldName of fieldNames) {
            const fieldSchema = structSchema[fieldName] || { type: 'string', default: '' };
            const rawValue = structData[fieldName] !== undefined
                ? structData[fieldName]
                : deserializeStructFieldValue(fieldSchema.default, fieldSchema, structDefinitions);
            const type = String(fieldSchema.type || 'string');
            const nestedStructName = getStructName(type);
            if (nestedStructName) {
                const nestedSchema = structDefinitions[nestedStructName] || {};
                if (type.includes('[]')) {
                    result[fieldName] = Array.isArray(rawValue)
                        ? JSON.stringify(rawValue.map(entry =>
                            JSON.stringify(serializeStructValue(entry, nestedSchema, structDefinitions))))
                        : String(rawValue ?? '');
                } else {
                    result[fieldName] = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
                        ? JSON.stringify(serializeStructValue(rawValue, nestedSchema, structDefinitions))
                        : String(rawValue ?? '');
                }
            } else if (type === 'note') {
                result[fieldName] = JSON.stringify(String(rawValue ?? ''));
            } else if (type.includes('[]')) {
                result[fieldName] = Array.isArray(rawValue)
                    ? JSON.stringify(rawValue)
                    : String(rawValue ?? '');
            } else if (rawValue && typeof rawValue === 'object') {
                result[fieldName] = JSON.stringify(rawValue);
            } else {
                result[fieldName] = String(rawValue ?? '');
            }
        }
        return result;
    };

    const serializeComplex = (value, schema, structDefinitions = {}) => {
        const type = String(schema?.type || '');
        const structName = getStructName(type);
        if (structName) {
            const structSchema = structDefinitions[structName] || {};
            if (type.includes('[]')) {
                if (!Array.isArray(value)) return String(value ?? '');
                return JSON.stringify(value.map(entry =>
                    JSON.stringify(serializeStructValue(entry, structSchema, structDefinitions))));
            }
            if (!value || typeof value !== 'object' || Array.isArray(value)) return String(value ?? '');
            return JSON.stringify(serializeStructValue(value, structSchema, structDefinitions));
        }
        if (type.includes('[]') && !Array.isArray(value)) return String(value ?? '');
        return JSON.stringify(value);
    };

    const setSimpleArrayElement = (arrayData, index, value) => {
        if (!Array.isArray(arrayData) || index < 0 || index >= arrayData.length) return false;
        arrayData[index] = String(value);
        return true;
    };

    const api = {
        clone,
        createDefaultStructValue,
        deserializeComplex,
        deserializeStructFieldValue,
        deserializeStructValue,
        getStructName,
        parseJsonLayer,
        serializeComplex,
        serializeStructValue,
        setSimpleArrayElement
    };
    root.RRPluginParamCodec = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
