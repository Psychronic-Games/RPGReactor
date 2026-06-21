// Nova Sentinel outfit recipe across supported character styles.
// The outfit identity is shared; each style can use its own renderer adapter.

'use strict';

const baseZones = {
    head:  { enabled: true, layer: 60, style: 'helmet',    family: 'steel',    accent: 'cyan', params: { visor: true, openFace: false, crest: true, earModule: 'compact' } },
    torso: { enabled: true, layer: 40, style: 'plated',    family: 'steel',    accent: 'cyan', params: { reactor: true } },
    arms:  { enabled: true, layer: 50, style: 'gauntlet',  family: 'gunmetal', accent: 'cyan', params: { powerStrip: true, wristBand: true, glove: true } },
    belt:  { enabled: true, layer: 45, style: 'utility',   family: 'gold',     accent: 'gold', params: { buckle: true, studs: true, height: 0.7 } },
    legs:  { enabled: true, layer: 20, style: 'segmented', family: 'navy',     accent: 'cyan', params: { kneeAccent: true } },
    boots: { enabled: true, layer: 30, style: 'heavy',     family: 'iron',     accent: '',     params: {} }
};

const baseExtensions = [
    { type: 'pauldron',    layer: 55, family: 'steel',    accent: 'cyan', params: { size: 1.0, layered: true, accentRim: false } },
    { type: 'armGauntlet', layer: 55, family: 'gunmetal', accent: 'cyan', params: { powerStrip: true, wristBand: true, bulge: 2, banded: true } }
];

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function partSetForStyle(style) {
    const prefix = style === 'psychronic' ? 'psychronic-nova' : 'nova';
    const key = style === 'psychronic' ? 'nova-sentinel-psychronic' : 'nova-sentinel';
    return {
        key,
        label: 'Nova Sentinel',
        style,
        parts: [
            { id: `${prefix}-head`, label: 'Helmet', kind: 'zone', key: 'head', spec: clone(baseZones.head) },
            { id: `${prefix}-torso`, label: 'Torso Armor', kind: 'zone', key: 'torso', spec: clone(baseZones.torso) },
            { id: `${prefix}-arms`, label: 'Arm Suit', kind: 'zone', key: 'arms', spec: clone(baseZones.arms) },
            { id: `${prefix}-belt`, label: 'Utility Belt', kind: 'zone', key: 'belt', spec: clone(baseZones.belt) },
            { id: `${prefix}-legs`, label: 'Leg Armor', kind: 'zone', key: 'legs', spec: clone(baseZones.legs) },
            { id: `${prefix}-boots`, label: 'Heavy Boots', kind: 'zone', key: 'boots', spec: clone(baseZones.boots) },
            { id: `${prefix}-pauldrons`, label: 'Pauldrons', kind: 'ext', key: 'pauldron', spec: clone(baseExtensions[0]) },
            { id: `${prefix}-gauntlets`, label: 'Gauntlets', kind: 'ext', key: 'armGauntlet', spec: clone(baseExtensions[1]) }
        ]
    };
}

function defaultConfig(style = 'looseleaf') {
    return {
        style,
        name: 'Nova Sentinel',
        category: 'full outfits',
        tags: [style, 'male', 'procgen'],
        paletteTheme: 'nova-sentinel',
        zones: clone(baseZones),
        extensions: clone(baseExtensions)
    };
}

module.exports = {
    key: 'nova-sentinel',
    label: 'Nova Sentinel',
    partSets: [partSetForStyle('looseleaf'), partSetForStyle('psychronic')],
    defaultConfig
};
