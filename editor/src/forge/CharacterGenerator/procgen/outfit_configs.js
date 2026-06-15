// Outfit configurations. Each entry maps an outfit-id to a config the engine
// consumes. To add an outfit, add an entry — no engine code changes.
//
// Schema (see outfit_engine.js for families/accents/styles):
//   zones:      anatomical zone → { style, family, accent?, params }
//     head:  style 'helmet'      params { visor, openFace, ... }
//     torso: style 'plated'      params { reactor, ... }
//     arms:  style 'gauntlet'    params { powerStrip, wristBand, glove }
//     belt:  style 'utility'     params { buckle, studs }
//     legs:  style 'segmented'   params { kneeAccent }
//     boots: style 'heavy'       params {}
//   extensions: [ { type:'pauldron'|'helmetCrown'|'spikes', family, accent?, params } ]
//
//   family  — a luminance ramp (steel, gunmetal, iron, leather, bronze, gold,
//             navy, indigo, crimson, bubblegum, forest, khaki, bone, silver,
//             obsidian)
//   accent  — an off-ramp colour (cyan, teal, magenta, amber, lime, ember,
//             blood, obsidian, violet, gold, gem)
//
//   THE KEY IDEA: give each zone a DIFFERENT family so the pieces contrast and
//   read as separate armor — steel chest, gunmetal arms, leather+gold belt,
//   navy legs, iron boots.

module.exports = {
    'nova-sentinel': {
        name: 'Nova Sentinel',
        category: 'full outfits',
        tags: ['looseleaf', 'male', 'procgen'],
        zones: {
            head:  { style: 'helmet',    family: 'steel',    accent: 'cyan', params: { visor: true, openFace: false, crest: true, earModule: 'compact' } },
            torso: { style: 'plated',    family: 'steel',    accent: 'cyan', params: { reactor: true } },
            arms:  { style: 'gauntlet',  family: 'gunmetal', accent: 'cyan', params: { powerStrip: true, wristBand: true, glove: true } },
            belt:  { style: 'utility',   family: 'leather',  accent: 'gold', params: { buckle: true, studs: true, height: 0.7 } },
            legs:  { style: 'segmented', family: 'navy',     accent: 'cyan', params: { kneeAccent: true } },
            boots: { style: 'heavy',     family: 'iron',                     params: {} }
        },
        extensions: [
            { type: 'pauldron',    layer: 55, family: 'steel',    accent: 'cyan', params: { size: 1.0, layered: true, accentRim: false } },
            { type: 'armGauntlet', layer: 45, family: 'gunmetal', accent: 'cyan', params: { powerStrip: true, wristBand: true, bulge: 2, banded: false } }
        ]
    }
};
