// Nova Sentinel outfit recipe for the bundled Psychronic style.

'use strict';

const baseZones = {
    head:  { enabled: true, layer: 60, style: 'helmet',    family: 'steel',    accent: 'cyan', params: { visor: true, openFace: false, crest: true, earModule: 'compact' } },
    torso: { enabled: true, layer: 40, style: 'plated',    family: 'steel',    accent: 'cyan', params: { reactor: true } },
    arms:  { enabled: true, layer: 50, style: 'gauntlet',  family: 'gunmetal', accent: 'cyan', params: { powerStrip: true, wristBand: true, glove: true } },
    belt:  { enabled: true, layer: 45, style: 'utility',   family: 'gold',     accent: 'gold', params: { buckle: true, studs: true, height: 0.7 } },
    legs:  { enabled: true, layer: 20, style: 'segmented', family: 'navy',     accent: 'cyan', params: { kneeAccent: true } },
    boots: { enabled: true, layer: 30, style: 'heavy',     family: 'iron',     accent: '',     params: {} }
};

// Alternate legs preset — a one-cloth pleated mini-skirt using the navy/cyan
// Nova Sentinel palette family so it sits beside the segmented leg armour as a
// second Legs-slot pick. The hem defaults to a very short upper-thigh length and
// leaves the bare legs visible below; optional knee plates render as separate
// pads at the anatomical knees, outside the skirt cloth.
const miniSkirtLegs = {
    enabled: true, layer: 20, style: 'miniSkirt',
    family: 'navy', accent: 'cyan',
    params: { kneeAccent: true, hem: 0.35, waistband: true, pleats: true }
};

const baseExtensions = [
    { type: 'pauldron',    layer: 55, family: 'steel',    accent: 'cyan', params: { size: 1.0, layered: true, accentRim: false } },
    { type: 'armGauntlet', layer: 55, family: 'gunmetal', accent: 'cyan', params: { powerStrip: true, wristBand: true, bulge: 2, banded: true } }
];

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function partSetForStyle(style) {
    const prefix = 'psychronic-nova';
    const key = 'nova-sentinel-psychronic';
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
            { id: `${prefix}-miniskirt`, label: 'Mini Skirt', kind: 'zone', key: 'legs', spec: clone(miniSkirtLegs) },
            { id: `${prefix}-boots`, label: 'Heavy Boots', kind: 'zone', key: 'boots', spec: clone(baseZones.boots) },
            { id: `${prefix}-pauldrons`, label: 'Pauldrons', kind: 'ext', key: 'pauldron', spec: clone(baseExtensions[0]) },
            { id: `${prefix}-gauntlets`, label: 'Gauntlets', kind: 'ext', key: 'armGauntlet', spec: clone(baseExtensions[1]) }
        ]
    };
}

function defaultConfig(style = 'psychronic') {
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
    partSets: [partSetForStyle('psychronic')],
    defaultConfig
};
