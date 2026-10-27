/**
 * RRCharacterSpecies - who a humanoid is: species presets and the features
 * any body can grow (horns, a tail, wings, animal ears, a beak, tusks,
 * spines, whiskers).
 *
 * A species is a starting recipe on the human base: slider values, head
 * morphs (RRHumanBody.MORPHS: a snout, a flat face, ears tucked away), a
 * skin, eyes and a set of features. Everything stays editable afterwards;
 * a human given horns and a tail is a tiefling. Features are generated on
 * the shaped body from its landmarks, like accessories; a tail brings its
 * own chain of bones so it can sway.
 */
(function(root) {
    'use strict';

    const Props = root.RRCharacterProps || (typeof require === 'function' ? require('./CharacterProps.js') : null);
    const Outfit = root.RRCharacterOutfit || (typeof require === 'function' ? require('./CharacterOutfit.js') : null);
    const { add, sub, mul, dot, norm, lerp, cross } = Props.vec;
    const linear = hex => Outfit.linear(hex);
    const mixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

    // ── features ──────────────────────────────────────────────────────────
    const FEATURES = {
        horns: { label: 'Horns', types: [['none', 'None'], ['demon', 'Demon'], ['ram', 'Ram'], ['bull', 'Bull'], ['goat', 'Goat'], ['dragon', 'Dragon'], ['unicorn', 'Unicorn'], ['antlers', 'Antlers'], ['nubs', 'Nubs'], ['cyberHorns', 'Cyber horns'], ['cyberAntenna', 'Sensor antennae'], ['cyberBlades', 'Blade fins']], defaults: { size: 1, color: '#3a2a22', color2: '#d8c8a8' } },
        ears: { label: 'Animal ears', types: [['none', 'None'], ['cat', 'Cat'], ['fox', 'Fox'], ['wolf', 'Wolf'], ['rabbit', 'Rabbit'], ['bear', 'Bear'], ['mouse', 'Mouse'], ['floppy', 'Floppy'], ['cyberAudio', 'Audio receivers'], ['cyberCat', 'Plated ears'], ['cyberFins', 'Antenna fins']], defaults: { size: 1, color: '#8a6a4a', color2: '#e8b8a8' } },
        tail: { label: 'Tail', types: [['none', 'None'], ['lizard', 'Lizard'], ['dragon', 'Dragon'], ['cat', 'Cat'], ['fox', 'Bushy'], ['demon', 'Demon'], ['monkey', 'Monkey'], ['horse', 'Horse'], ['bull', 'Tufted'], ['rabbit', 'Puff'], ['bird', 'Feathers'], ['cyber', 'Cyber tail']], defaults: { size: 1, length: 1, color: '#6a7a4a', color2: '#d8d0b0' } },
        wings: { label: 'Wings', types: [['none', 'None'], ['feathered', 'Feathered'], ['bat', 'Bat'], ['fairy', 'Fairy'], ['insect', 'Insect'], ['cyberVanes', 'Blade vanes'], ['cyberThruster', 'Thruster wings'], ['cyberEnergy', 'Energy wings']], defaults: { size: 1, color: '#f2efe8', color2: '#c8c0b0' } },
        antennae: { label: 'Antennae', types: [['none', 'None'], ['insect', 'Curved'], ['moth', 'Feathery'], ['andorian', 'Andorian']], defaults: { size: 1, color: '#503c30', color2: '#bdae88' } },
        fangs: { label: 'Fangs', types: [['none', 'None'], ['small', 'Small'], ['long', 'Long']], defaults: { size: 1, color: '#ece2cc' } },
        beak: { label: 'Beak', types: [['none', 'None'], ['raptor', 'Hooked'], ['crow', 'Pointed'], ['duck', 'Flat']], defaults: { size: 1, color: '#e0a830', color2: '#3a2a1a' } },
        tusks: { label: 'Tusks', types: [['none', 'None'], ['small', 'Small'], ['large', 'Large']], defaults: { size: 1, color: '#ece2c8' } },
        spines: { label: 'Spines', types: [['none', 'None'], ['ridge', 'Back ridge'], ['crest', 'Head crest'], ['both', 'Ridge and crest']], defaults: { size: 1, color: '#4a3a2a' } },
        whiskers: { label: 'Whiskers', types: [['none', 'None'], ['short', 'Short'], ['long', 'Long']], defaults: { size: 1, color: '#f0ece4' } },
        insectHead: { label: 'Insect head', types: [['none', 'None'], ['mantis', 'Mantis']], defaults: { size: 1, color: '#718755', color2: '#a3b85a' } },
        alienEyes: { label: 'Alien eyes', types: [['none', 'None'], ['almond', 'Almond'], ['round', 'Round']], defaults: { size: 1, color: '#050507' } },
        arms: { label: 'Extra arms', types: [['none', 'None'], ['insect', 'Insect arms'], ['mantis', 'Raptorial arms']], defaults: { size: 1, color: '#718755', color2: '#3e4e35' } },
        machinery: { label: 'Mechanical parts', types: [['none', 'None'], ['android', 'Android circuitry']], defaults: { size: 1, color: '#343e4d', color2: '#39d9e8' } }
    };

    function normalizeFeatures(input) {
        const out = {};
        for (const [key, def] of Object.entries(FEATURES)) {
            const f = Object.assign({ type: 'none' }, def.defaults, input && input[key]);
            if (!def.types.some(t => t[0] === f.type)) f.type = 'none';
            for (const k of ['color', 'color2']) if (!/^#[0-9a-f]{6}$/i.test(f[k] || '')) f[k] = def.defaults[k] || '#808080';
            f.size = Math.max(0.2, Math.min(3, +f.size || 1));
            if (f.length != null) f.length = Math.max(0.2, Math.min(3, +f.length || 1));
            // Body mods hook: a cyber feature's style, light and wear (RRCharacterBodyArt.CYBER_STYLES); others carry none.
            if (/^cyber/.test(f.type)) {
                if (!['sleek', 'military', 'salvaged', 'neon'].includes(f.style)) f.style = 'sleek';
                if (!/^#[0-9a-f]{6}$/i.test(f.glow || '')) f.glow = '';
                f.glowAmount = Math.max(0, Math.min(1, +(f.glowAmount ?? 0.6)));
                f.wear = Math.max(0, Math.min(1, +(f.wear ?? 0.25)));
                if (key === 'tail' && !['none', 'blade', 'stinger'].includes(f.tip)) f.tip = 'none';
                // The organic defaults' colors are a creature's; a cyber part starts in its style's own.
                if (!(input && input[key] && input[key].color)) f.color = '';
                if (!(input && input[key] && input[key].color2)) f.color2 = '';
            } else { delete f.style; delete f.glow; delete f.glowAmount; delete f.wear; delete f.tip; }
            out[key] = f;
        }
        return out;
    }

    // ── species ───────────────────────────────────────────────────────────
    // body: recipe fields; shapes; morph; skin; eyes; features; hair hints (none: bald by nature).
    const SPECIES = [
        { id: 'human', label: 'Human', group: 'Common', recipe: {} },
        { id: 'vampire', label: 'Vampire', group: 'Fantasy', recipe: { skin: '#cebdc2', eyes: { color: '#9c2936' }, features: { fangs: { type: 'small' } }, shapes: { cheekBones: 0.7, chinPointed: 0.3 } } },
        { id: 'insectfolk', label: 'Insectfolk', group: 'Beastfolk', recipe: { skin: '#718755', skinPattern: { type: 'chitin', color: '#34432c', belly: '#869c5e', lips: '#718755', shadowAmount: 0.3 }, morph: { earsAway: 1, earHoles: 0 }, shapes: { neck: -0.6, neckLength: 0.3, earSize: -1, earOut: -1, noseDepth: -0.9, jaw: -0.5, chinWidth: -0.5 }, eyes: { color: '#452c21' }, features: { insectHead: { type: 'mantis' }, arms: { type: 'insect' }, antennae: { type: 'insect', size: 1.15 }, wings: { type: 'insect', color: '#c7cfa9', color2: '#596843' } }, bald: true } },
        { id: 'elf', label: 'Elf', group: 'Fantasy', recipe: { height: 0.68, weight: 0.32, muscle: 0.4, shapes: { earsPointed: 2.6, earSize: 0.5, cheekBones: 0.7, chinPointed: 0.5, eyeSlant: 0.6, jaw: -0.4, neckLength: 0.5 } } },
        { id: 'darkelf', label: 'Dark elf', group: 'Fantasy', recipe: { height: 0.62, weight: 0.3, shapes: { earsPointed: 3, earSize: 0.6, cheekBones: 0.9, chinPointed: 0.6, eyeSlant: 0.8, jaw: -0.4 }, skin: '#5e5470', eyes: { color: '#d8302a' } } },
        { id: 'dwarf', label: 'Dwarf', group: 'Fantasy', recipe: { height: 0.12, weight: 0.78, muscle: 0.85, headSize: 1.08, hair: { facial: { style: 'longBeard' }, brows: { style: 'bushy' } }, shapes: { legLength: -1, armLength: -0.5, shoulders: 1.2, chest: 1, noseDepth: 1.2, noseWidth: 1, browRidge: 0.8, handSize: 0.6, neck: 0.8 } } },
        { id: 'halfling', label: 'Halfling', group: 'Fantasy', recipe: { height: -0.35, weight: 0.6, headSize: 1.14, shapes: { legLength: -0.6, footSize: 1.6, earsPointed: 0.9, cheeks: 0.25, headFat: 0.15 } } },
        { id: 'gnome', label: 'Gnome', group: 'Fantasy', recipe: { height: -0.6, weight: 0.5, headSize: 1.3, shapes: { noseDepth: 1.4, noseVolume: 0.9, noseTip: 0.4, earsPointed: 1.4, earSize: 1, legLength: -0.8, cheeks: 0.6 } } },
        { id: 'orc', label: 'Orc', group: 'Fantasy', recipe: { height: 0.75, weight: 0.7, muscle: 1.35, hair: { style: 'mohawk', color: '#1a1410' }, shapes: { jaw: 1.6, underbite: 1.2, browRidge: 2.2, noseWidth: 1.6, noseHump: -1.2, noseTip: 1, earsPointed: 1.3, neck: 1.5, mouthWidth: 0.8 }, skin: '#6a8a4a', eyes: { color: '#c8a020' }, features: { tusks: { type: 'small' } } } },
        { id: 'goblin', label: 'Goblin', group: 'Fantasy', recipe: { height: -0.7, weight: 0.18, muscle: 0.3, headSize: 1.28, shapes: { earsPointed: 3.4, earSize: 2.6, earOut: 1.5, noseDepth: 2.2, noseLength: 1.4, chinPointed: 1, mouthWidth: 1.2, eyeSize: 0.8 }, skin: '#7a9a3a', eyes: { color: '#e8c020', pupil: 'slit' } } },
        { id: 'troll', label: 'Troll', group: 'Fantasy', recipe: { height: 1.55, weight: 0.55, muscle: 1.1, shapes: { armLength: 2.2, handSize: 2, noseDepth: 2.8, noseLength: 2.2, browRidge: 2.5, earsPointed: 2, jaw: 1, shoulders: 1.4, torsoLength: -0.6 }, skin: '#6e8a86', eyes: { color: '#e8a020' }, features: { tusks: { type: 'small', size: 0.8 } } } },
        { id: 'ogre', label: 'Ogre', group: 'Fantasy', recipe: { height: 1.45, weight: 2.1, muscle: 1.4, headSize: 0.9, shapes: { underbite: 1.6, jaw: 2, browRidge: 2, noseWidth: 2, earSize: 1 }, skin: '#a8946a', features: { tusks: { type: 'large', size: 0.9 } } } },
        // Merfolk hook (RRMerfolkBody): from the hips down a fish's tail; its settings under `merfolk`.
        { id: 'merfolk', label: 'Merfolk', group: 'Fantasy', recipe: { merfolk: {} } },
        // Centaur hook (RRCharacterCentaur): from the waist down a horse's body and four legs; its settings under `centaur`.
        { id: 'centaur', label: 'Centaur', group: 'Fantasy', recipe: { centaur: {} } },
        { id: 'lizardfolk', label: 'Lizardfolk', group: 'Beastfolk', recipe: { head: { id: 'reptile', kind: 'drake', horns: 'none', ears: 'none', snoutLength: 0.85, pattern: 'scales' }, height: 0.75, weight: 0.7, muscle: 1.2, shapes: { neck: 2.2, neckLength: -0.3, shoulders: 1.2 }, skin: '#5a8a4a', skinPattern: { type: 'scales', color: '#3e6a34', belly: '#c8c890' }, eyes: { color: '#e0c030', pupil: 'slit' }, features: { tail: { type: 'lizard', color: '#5a8a4a', color2: '#c8c890' }, spines: { type: 'ridge', size: 0.6, color: '#3e5a2a' } }, bald: true } },
        { id: 'dragonborn', label: 'Dragonborn', group: 'Beastfolk', recipe: { head: { id: 'dragon', kind: 'drake', snoutLength: 1.0, pattern: 'scales', colors: { horn: '#2a1e18' } }, height: 0.8, muscle: 0.9, shapes: { neck: 1.2, shoulders: 1 }, skin: '#a8402c', skinPattern: { type: 'scales', color: '#7a2a1c', belly: '#e0b070' }, eyes: { color: '#ffb020', pupil: 'slit' }, features: { tail: { type: 'dragon', color: '#a8402c', color2: '#e0b070' } }, bald: true } },
        { id: 'hydrata', label: 'Hydrata', group: 'Beastfolk', recipe: { head: { id: 'hydrata', kind: 'drake', heads: 2, snoutLength: .85, snoutWidth: .95, horns:'dragon',hornSize:.85, ears:'small',pattern: 'scales', colors: { horn: '#d8bc79' } }, height: .95, muscle: 1.15, weight:.55, shapes: { neck: 1.35, shoulders: 1.7, chest:.6,handSize:.5 }, skin: '#447d68', skinPattern: { type: 'scales', color: '#27513f', belly: '#d9bd76' }, eyes: { color: '#edbc45', pupil: 'slit' }, features: { tail: { type: 'dragon', color: '#447d68', color2: '#d9bd76',length:1.2 },spines:{type:'ridge',size:.65,color:'#c4aa67'} }, bald: true } },
        { id: 'birdfolk', label: 'Birdfolk', group: 'Beastfolk', recipe: { head: { id: 'bird', kind: 'bird', beak: 'hooked', mane: 'ruff', maneSize: 0.5 }, weight: 0.3, skin: '#8a6a4a', skinPattern: { type: 'feathers', color: '#7a5a3e', belly: '#e8dcc8', shadowAmount: 0 }, eyes: { color: '#e8a020' }, shapes: { neckLength: 0.8 }, features: { wings: { type: 'feathered', size: 0.75, color: '#7a5a3a', color2: '#e8dcc8' }, tail: { type: 'bird', color: '#6a4a2a', color2: '#f0e8d8' } }, bald: true } },
        { id: 'catfolk', label: 'Catfolk', group: 'Beastfolk', recipe: { head: { id: 'cat', kind: 'cat', pattern: 'tabby' }, weight: 0.38, bald: true, bodyHair: { amount: 1, pattern: 'werewolf', fur: 0.85, length: 0.8, color: '#c8924a' }, shapes: { neck: 1.2, neckLength: -0.35 }, skin: '#c8924a', skinPattern: { type: 'stripes', color: '#7a4a1a', belly: '#f0e0c8', nose: '#d07a78' }, eyes: { color: '#a7ba71', pupil: 'slit' }, features: { tail: { type: 'cat', color: '#c8924a', color2: '#7a4a1a' } } } },
        { id: 'werewolf', label: 'Werewolf', group: 'Beastfolk', recipe: { head: { id: 'wolf', kind: 'wolf', snoutLength: 0.85, pattern: 'saddle' }, height: 0.7, muscle: 1.1, weight: 0.55, shapes: { shoulders: 1, handSize: 0.6, neck: 1.3 }, skin: '#6a5240', skinPattern: { color: '#2a1e16', belly: '#8a7260', nose: '#141210' }, eyes: { color: '#f0c020' }, features: { tail: { type: 'fox', color: '#4a3424', color2: '#7a6250' } }, bodyHair: { amount: 1, pattern: 'werewolf', fur: 0.75, length: 1.2, color: '#4a3424' }, bald: true } },
        { id: 'wolffolk', label: 'Wolffolk', group: 'Beastfolk', recipe: { head: { id: 'wolf', kind: 'wolf', pattern: 'saddle' }, height: 0.65, muscle: 0.8, bald: true, bodyHair: { amount: 1, pattern: 'werewolf', fur: 0.9, length: 1.1, color: '#6a6460' }, shapes: { neck: 1.2 }, skin: '#7a7470', skinPattern: { type: 'fur', color: '#4a4440', belly: '#d8d4cc', nose: '#141210' }, eyes: { color: '#e8c030' }, features: { tail: { type: 'fox', color: '#6a6460', color2: '#d8d4cc' } } } },
        { id: 'rabbitfolk', label: 'Rabbitfolk', group: 'Beastfolk', recipe: { head: { id: 'rabbit', kind: 'rabbit' }, height: 0.35, weight: 0.4, bald: true, bodyHair: { amount: 0.9, pattern: 'werewolf', fur: 0.75, length: 0.8, color: '#d8c8b0' }, shapes: { footSize: 2, neck: 0.7 }, skin: '#c8b8a0', skinPattern: { type: 'fur', color: '#a89878', belly: '#f2ece2', nose: '#d89a98' }, eyes: { color: '#6a3a1a' }, features: { tail: { type: 'rabbit', color: '#f2ece2' } } } },
        { id: 'minotaur', label: 'Minotaur', group: 'Beastfolk', recipe: { head: { id: 'bull', kind: 'bull', pattern: 'solid', earDroop: 0.25, colors: { horn: '#e8dcc0', nose: '#3a2a24' } }, height: 1.5, weight: 0.8, muscle: 1.7, bald: true, bodyHair: { amount: 1, pattern: 'werewolf', fur: 0.7, length: 1, color: '#6a4428' }, shapes: { neck: 2.4, shoulders: 1.6 }, skin: '#8a6040', skinPattern: { type: 'fur', color: '#5a3a24', belly: '#a8845e', nose: '#3a2a24' }, eyes: { color: '#4a2a14' }, features: { tail: { type: 'bull', color: '#5a3a24', color2: '#4a3020' } } } },
        { id: 'tiefling', label: 'Tiefling', group: 'Otherworldly', recipe: { shapes: { cheekBones: 0.8, chinPointed: 0.6, earsPointed: 1.6 }, skin: '#b0463e', eyes: { color: '#f0d020', pupil: 'none' }, features: { horns: { type: 'demon', color: '#2a1e1e', color2: '#5a4a4a' }, tail: { type: 'demon', color: '#b0463e' } } } },
        { id: 'demon', label: 'Demon', group: 'Otherworldly', recipe: { height: 1.4, muscle: 1.6, weight: 0.7, shapes: { browRidge: 2.5, cheekBones: 1.5, jaw: 1.2, earsPointed: 2.5, chinPointed: 1 }, skin: '#7a1e1e', skinPattern: { type: 'scales', color: '#5a1212', belly: '#3a0a0a' }, eyes: { color: '#ffd020', pupil: 'slit', sclera: '#1a0808' }, features: { horns: { type: 'ram', size: 1.3, color: '#1a1414', color2: '#6a5a50' }, tail: { type: 'demon', color: '#7a1e1e' }, wings: { type: 'bat', color: '#3a1010', color2: '#5a1818' } }, bald: true } },
        { id: 'angel', label: 'Angel', group: 'Otherworldly', recipe: { height: 0.75, shapes: { cheekBones: 0.5 }, skin: '#f0d8c4', eyes: { color: '#5aa8e8' }, features: { wings: { type: 'feathered', size: 0.95, color: '#ffffff', color2: '#e8e4dc' } }, props: [{ id: 'halo' }] } },
        { id: 'fairy', label: 'Fairy', group: 'Otherworldly', recipe: { height: -0.5, weight: 0.2, headSize: 1.12, shapes: { earsPointed: 2.2, eyeSize: 1.5, chinPointed: 0.8 }, skin: '#f2dcd0', eyes: { color: '#40c8a0' }, features: { wings: { type: 'fairy', color: '#bfeaff', color2: '#ffffff' } } } },
        { id: 'undead', label: 'Undead', group: 'Otherworldly', recipe: { weight: -0.2, muscle: 0.1, shapes: { headFat: -1.5, cheeks: -2, eyeBags: 2, headAge: 1.5 }, age: 60, skin: '#8a9a80', skinPattern: { type: 'decay', color: '#5a6a50' }, eyes: { color: '#e8f0e0', pupil: 'none', sclera: '#2a3028' } } },
        { id: 'alien', label: 'Grey alien', group: 'Otherworldly', recipe: { height: 0.2, weight: 0.15, headSize: 1.38, morph: { earsAway: 1, earHoles: 0, flat: 0.35, eyeSocket: 1, muzzle: 0 }, shapes: { earSize: -1, earOut: -1, headTriangle: 0.65, headRound: 0.6, foreheadHeight: 0.65, temples: 0.45, browRidge: -0.65, headAge: -0.5, headFat: 0.35, cheeks: 0.15, cheekBones: 0.1, eyeSize: 1.15, noseDepth: -0.9, noseVolume: -0.8, noseWidth: -0.65, noseLength: -0.4, nostrils: -0.5, noseHump: -0.7, mouthWidth: -0.6, upperLip: -0.65, lowerLip: -0.65, jaw: -0.7, chinWidth: -0.55, chinPointed: 0.15, neck: -0.9, neckLength: 0.4 }, skin: '#929ba3', skinPattern: { lips: '#929ba3', shadowAmount: 0.35 }, eyes: { color: '#0a0a0e', pupil: 'none', sclera: '#0a0a0e', catchlight: false }, features: { alienEyes: { type: 'almond' } }, bald: true } },
        { id: 'klingon', label: 'Klingon', group: 'Otherworldly', recipe: { skin: '#a77a52', muscle: 0.8, morph: { cranialRidges: 1.25 }, shapes: { browRidge: 1.2, noseWidth: 0.5, noseDepth: 0.4, cheekBones: 0.65, jaw: 0.65, neck: 0.5 }, hair: { style: 'shoulder', length: 0.9, volume: 0.3, fringe: 0, part: 'none', hairline: 0.8, color: '#19120f', brows: { style: 'bushy', thickness: 1, height: -0.45 } } } },
        { id: 'vulcan', label: 'Vulcan', group: 'Otherworldly', recipe: { skin: '#d5b99f', skinPattern: { lips: '#b1947f' }, shapes: { earsPointed: 2.3, earSize: 0.65, earOut: 0.45, eyeSlant: 0.55, browAngle: 0.65, cheekBones: 0.6, jaw: -0.2 }, hair: { style: 'pixie', fringe: 0.8, color: '#151210', brows: { style: 'angry' } } } },
        { id: 'ferengi', label: 'Ferengi', group: 'Otherworldly', recipe: { height: 0.25, headSize: 1.08, morph: { earBowls: 1.45, cranialLobes: 1.35, noseFolds: 1.25 }, shapes: { earSize: 2.6, earOut: 0.8, earsRound: 1.8, earLobe: 1, browRidge: 0.35, noseWidth: 0.8, noseDepth: 0.55, noseHump: 0.6, foreheadHeight: -0.25, headHeight: -0.15, headRound: 0.35 }, skin: '#bf895e', bald: true } },
        { id: 'andorian', label: 'Andorian', group: 'Otherworldly', recipe: { skin: '#68aed0', skinPattern: { lips: '#578fae' }, eyes: { color: '#6287a8' }, shapes: { browRidge: 0.35, cheekBones: 0.3 }, hair: { style: 'slickBack', length: 0.55, volume: 0.15, fringe: 0, color: '#f3f2ec', tipColor: '', highlights: 0, brows: { style: 'natural', color: '#e5e7e5' } }, features: { antennae: { type: 'andorian', color: '#68aed0', color2: '#528fae' } } } },
        { id: 'cardassian', label: 'Cardassian', group: 'Otherworldly', recipe: { skin: '#a6ada7', skinPattern: { lips: '#858c86', shadowAmount: 0.35 }, morph: { foreheadSpoon: 1, facialRidges: 1.2, neckWebbing: 1.3 }, shapes: { earSize: -0.3, earLobe: -0.5, browRidge: 0.6, cheekBones: 1, jaw: 0.5, neck: 0.7, neckLength: 0.2, foreheadHeight: -0.15 }, hair: { style: 'slickBack', fringe: 0, part: 'none', hairline: 0.45, color: '#181b1a', brows: { style: 'none' } } } },
        { id: 'android', label: 'Android', group: 'Otherworldly', recipe: { skin: '#d8dce2', skinPattern: { type: 'none', color: '#8a9098' }, eyes: { color: '#30b8ff', pupil: 'none' }, features: { machinery: { type: 'android' } }, bald: true } },
        // Slimefolk: a body plan of its own (RRSlimeBody), from a goo mound to a goo person.
        { id: 'slimefolk', label: 'Slimefolk', group: 'Otherworldly', plan: 'slime', recipe: {} }
    ];
    const BY_ID = new Map(SPECIES.map(s => [s.id, s]));

    // Suggested ranges, not restrictions: the Skin color picker still accepts any color.
    const SKIN_TONES = Object.freeze({
        klingon: Object.freeze(['#c29a73', '#b58a61', '#a77a52', '#8d6142', '#70472f', '#503326']),
        vulcan: Object.freeze(['#efd6bd', '#e4c7ac', '#d5b99f', '#bc9e80', '#987959', '#6e543b']),
        ferengi: Object.freeze(['#d6ac7c', '#cb9b6b', '#bf895e', '#a97649', '#8e5e3c', '#70482f']),
        andorian: Object.freeze(['#9ccfdf', '#80bdd7', '#68aed0', '#5399bf', '#4183ab', '#346d97']),
        cardassian: Object.freeze(['#d0d3cb', '#bcc3bb', '#a6ada7', '#8d9893', '#737f7b', '#56635f'])
    });
    const skinTones = id => SKIN_TONES[id] || [];


    /**
     * Heads any body may wear: its own, or an animal's from the four-legged
     * creatures (a kind and its head settings). A bird's is listed once the
     * creatures have one.
     */
    const HEAD_PRESETS = [
        ['human', 'Human', null],
        ['wolf', 'Wolf', { kind: 'wolf', pattern: 'saddle' }],
        ['cat', 'Cat', { kind: 'cat', pattern: 'tabby' }],
        ['rabbit', 'Rabbit', { kind: 'rabbit' }],
        ['bull', 'Bull', { kind: 'bull', pattern: 'solid', earDroop: 0.25 }],
        ['reptile', 'Reptile', { kind: 'drake', horns: 'none', ears: 'none', snoutLength: 0.85, pattern: 'scales' }],
        ['dragon', 'Dragon', { kind: 'drake', snoutLength: 1, pattern: 'scales' }],
        ['hydrata', 'Hydrata', { kind: 'drake', heads:2, snoutLength:.85, horns:'dragon',hornSize:.85,ears:'small',pattern:'scales' }],
        ['bird', 'Bird', { kind: 'bird', beak: 'hooked', mane: 'ruff', maneSize: 0.5 }],
        ['crow', 'Crow', { kind: 'crow', beak: 'straight' }]
    ];
    // Looked up when asked (the creatures load after this file on the page).
    const creatureKinds = () => { const C = root.RRCreatureBody; return new Set(C ? C.KINDS.concat(C.HEAD_KINDS || []).map(k => k.kind) : []); };
    /** The heads offered: [id, label], those whose creature exists. */
    function heads() { const k = creatureKinds(); return HEAD_PRESETS.filter(h => !h[2] || k.has(h[2].kind)).map(h => [h[0], h[1]]); }
    /** A head choice as a recipe's head (null: the body's own). */
    function headPreset(id) { const h = HEAD_PRESETS.find(x => x[0] === id); return h && h[2] && creatureKinds().has(h[2].kind) ? Object.assign({ id }, JSON.parse(JSON.stringify(h[2]))) : null; }
    /** Which head choice a recipe's head is. */
    function headId(head) { if (!head) return 'human'; if (head.id && HEAD_PRESETS.some(h => h[0] === head.id)) return head.id; const h = HEAD_PRESETS.find(x => x[2] && x[2].kind === head.kind); return h ? h[0] : 'human'; }

    /** A recipe for a species: its preset over the average body, keeping the name, gender and age asked for. */
    function speciesRecipe(id, keep) {
        const s = BY_ID.get(id) || BY_ID.get('human');
        const r = JSON.parse(JSON.stringify(s.recipe));
        r.species = s.id;
        if (keep) for (const k of ['gender', 'age', 'ancestry']) if (keep[k] != null && r[k] == null) r[k] = keep[k];
        return r;
    }

    // ── making features ───────────────────────────────────────────────────
    function headPoint(L, y, angle, out = 0) {
        const R = L.ring(y, 0.014) || L.ring(L.brow, 0.02);
        return { p: [R.center[0] + Math.sin(angle) * (R.rx + out), y, R.center[2] + Math.cos(angle) * (R.rz + out)], n: norm([Math.sin(angle) / R.rx, 0, Math.cos(angle) / R.rz]), R };
    }

    function horns(m, L, f) {
        const head = L.boneIndex('Head'), skin = Props.rigid(head), s = f.size;
        const base = linear(f.color), tip = linear(f.color2 || f.color);
        const color = t => mixRgb(base, tip, t * t);
        const H = L.crown - L.brow;
        if (f.type === 'unicorn') {
            const at = headPoint(L, L.brow + H * 0.35, 0, -0.004);
            const pts = [];
            for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push(add(at.p, [0, t * 0.2 * s, t * 0.08 * s])); }
            m.tube(pts, t => 0.016 * s * (1 - t) + 0.0015, 10, (t, a) => mixRgb(base, tip, 0.5 + 0.5 * Math.sin(a * 2 + t * 40)), skin);
            return;
        }
        if (f.type === 'antlers') {
            for (const side of [1, -1]) {
                const at = headPoint(L, L.crown - H * 0.2, side * 0.75, -0.006);
                const main = [];
                for (let k = 0; k <= 10; k++) { const t = k / 10; main.push(add(at.p, [side * t * 0.12 * s, t * 0.26 * s, -t * 0.06 * s + Math.sin(t * 3) * 0.03 * s])); }
                m.tube(main, t => 0.012 * s * (1 - t * 0.7), 6, color, skin);
                for (const [k, len] of [[3, 0.1], [6, 0.09], [8, 0.07]]) {
                    const from = main[k];
                    m.tube([from, add(from, [side * len * 0.2 * s, len * 0.6 * s, len * 0.8 * s]), add(from, [side * len * 0.3 * s, len * s, len * 0.9 * s])], t => 0.007 * s * (1 - t * 0.8), 5, color, skin);
                }
            }
            return;
        }
        for (const side of [1, -1]) {
            let at, path;
            if (f.type === 'ram') {
                // Up and back off the crown, down behind the ear and forward under it, curling in to the cheek.
                at = headPoint(L, L.crown - H * 0.18, side * 1.05, -0.01);
                const R0 = 0.062 * s;
                // The coil opens outward as it turns, so the tip stands clear of the cheek.
                path = t => { const a = t * Math.PI * 1.55, r = R0 * (1 - t * 0.3); return add(at.p, [side * (0.006 + 0.13 * t * t) * s, -R0 + Math.cos(a) * r, -0.02 * s - Math.sin(a) * r]); };
            } else if (f.type === 'bull') {
                at = headPoint(L, L.crown - H * 0.25, side * 1.2, -0.008);
                path = t => add(at.p, [side * t * 0.2 * s, Math.pow(t, 2.2) * 0.12 * s, t * 0.06 * s]);
            } else if (f.type === 'goat') {
                at = headPoint(L, L.crown - H * 0.12, side * 0.5, -0.006);
                path = t => add(at.p, [side * t * 0.03 * s, Math.sin(t * 1.4) * 0.12 * s, -Math.pow(t, 1.6) * 0.16 * s]);
            } else if (f.type === 'dragon') {
                at = headPoint(L, L.crown - H * 0.25, side * 0.7, -0.006);
                path = t => add(at.p, [side * t * 0.05 * s, t * 0.06 * s + Math.pow(t, 2) * 0.02, -t * 0.24 * s]);
            } else if (f.type === 'nubs') {
                at = headPoint(L, L.brow + H * 0.25, side * 0.45, -0.004);
                path = t => add(at.p, mul(norm(add(at.n, [0, 1.2, 0])), t * 0.025 * s));
            } else {
                // Demon: up from the brow, sweeping back.
                at = headPoint(L, L.brow + H * 0.3, side * 0.42, -0.006);
                path = t => add(at.p, [side * t * 0.035 * s, Math.sin(t * 1.6) * 0.13 * s, -Math.pow(t, 1.8) * 0.1 * s]);
            }
            const r0 = (f.type === 'nubs' ? 0.012 : f.type === 'bull' ? 0.024 : f.type === 'ram' ? 0.042 : 0.018) * Math.sqrt(s);
            // Growth rings round a ram's and a goat's horn.
            const rings = f.type === 'ram' ? 70 : f.type === 'goat' ? 40 : 0;
            const steps = f.type === 'ram' ? 56 : 14;
            const fine = [];
            for (let k = 0; k <= steps; k++) fine.push(path(k / steps));
            m.tube(fine, t => r0 * (1 - t * (f.type === 'ram' ? 0.85 : 0.92)) * (1 + (rings ? 0.07 * Math.max(0, Math.sin(t * rings)) * (1 - t) : 0)), f.type === 'ram' ? 10 : 9, color, skin);
        }
    }

    function rng(seed) { let q = (seed >>> 0) || 1; return () => { q ^= q << 13; q >>>= 0; q ^= q >> 17; q ^= q << 5; q >>>= 0; return q / 4294967296; }; }

    /**
     * Animal ears: each a cup, its hollow front lined in the second color
     * and facing forward and a little out, its root sunk into the skull so
     * no seam shows. Furred: the back coated in short fur combed up to the
     * tip, tufts growing in from the rim over the hollow, and longer fur
     * round the root where the ear meets the head. Returns the fur roots.
     */
    function animalEars(m, L, f, coat) {
        const head = L.boneIndex('Head'), skin = Props.rigid(head), s = f.size;
        const outer = linear(f.color), inner = linear(f.color2 || '#e8b8a8');
        const H = L.crown - L.brow;
        const shape = { cat: [0.075, 0.04, 0], fox: [0.1, 0.045, 0], wolf: [0.095, 0.042, 0], rabbit: [0.24, 0.05, 0.05], bear: [0.045, 0.038, 0], mouse: [0.055, 0.058, 0], floppy: [0.13, 0.05, -1] }[f.type] || [0.07, 0.045, 0];
        const [tall, wide, lean] = shape;
        const round = f.type === 'bear' || f.type === 'mouse';
        const roots = [], rand = rng(911 + f.type.length * 7);
        // Short velvet on a mouse's ears; a full coat on the others.
        const furry = f.type !== 'mouse';
        const sink = 0.022 * s;
        const coatRgb = coat && coat.color ? linear(coat.color) : outer;
        for (const side of [1, -1]) {
            const at = headPoint(L, L.crown - H * (f.type === 'floppy' ? 0.45 : f.type === 'rabbit' ? 0.22 : 0.3), side * (f.type === 'rabbit' ? 0.5 : f.type === 'bear' || f.type === 'mouse' ? 0.95 : 0.82), -0.006);
            const up = norm(add(mul(at.n, f.type === 'floppy' ? 1.2 : f.type === 'rabbit' ? 0.25 : 0.42), [0, 1, 0]));
            // Facing forward and a little out on both sides.
            const face = [side * (f.type === 'rabbit' ? 0.15 : 0.32), 0, 1];
            const fwd = norm(sub(face, mul(up, dot(face, up))));
            const ring = t => {
                let dir = up;
                if (lean < 0) dir = norm(lerp(up, [side * 0.4, -1, 0.15], t));
                // The root runs down into the skull.
                const center = add(add(at.p, mul(up, -sink)), mul(dir, t * (tall * s + sink)));
                const q = Math.min(1, Math.max(0, t));
                // A rabbit's is a leaf: narrow at the root, widest near the middle, round at the tip.
                const w = round ? Math.sqrt(Math.max(0, 1 - Math.pow(q * 2 - 1, 2))) * wide * (q < 0.2 ? 0.6 + 2 * q : 1)
                    : f.type === 'rabbit' ? wide * (q < 0.45 ? 0.55 + 0.45 * Math.sin(q / 0.45 * Math.PI / 2) : Math.sqrt(Math.max(0, 1 - Math.pow((q - 0.45) / 0.55, 2.4))))
                    : wide * Math.pow(1 - q, 0.9) * (1 + 0.4 * q) * Math.sqrt(1 - Math.pow(q, 6) * 0.5) * (lean < 0 ? 0.9 + 0.3 * Math.sin(q * Math.PI) : 1);
                const x = norm(cross(fwd, dir));
                return { center, dir, x, y: norm(cross(dir, x)), rx: Math.max(0.0015, w * s), ry: Math.max(0.001, w * s * 0.28), cup: 0.45 * (1 - q * 0.7) };
            };
            const ROWS = 15, SIDES = 18;
            m.loft(ROWS, (i, t) => ring(t), SIDES, (t, a) => (Math.sin(a) > 0.15 && t < 0.88 ? inner : outer), skin, true);
            if (!coat) continue;
            const pointAt = (t, a) => {
                const R = ring(t), bend = R.cup * R.rx * (1 - Math.cos(a) ** 2);
                const off = add(mul(R.x, Math.cos(a) * R.rx), mul(R.y, Math.sin(a) * R.ry - bend));
                return { p: add(R.center, off), n: norm(off), R };
            };
            const furLen = (furry ? 0.011 : 0.004) * Math.sqrt(s) * coat.length;
            const tufts = Math.round((furry ? 300 : 120) * coat.budget * Math.sqrt(s));
            for (let k = 0; k < tufts; k++) {
                // Over the back of the ear and its rim, thinning toward the tip.
                const t0 = (sink / (tall * s + sink)) * 0.6, t = t0 + Math.pow(rand(), 1.3) * (0.95 - t0);
                const a = Math.PI + (rand() - 0.5) * Math.PI * 1.25;
                const q = pointAt(t, a);
                const color = mixRgb(outer, coatRgb, 0.5);
                roots.push({ p: q.p, n: q.n, flow: add(q.R.dir, mul(q.R.x, Math.cos(a) * 0.3)), len: furLen * (0.7 + 0.6 * rand()) * (1 - t * 0.4), width: 0.0028 * (0.8 + 0.4 * rand()),
                    color: mul(color, 0.92), tip: mixRgb(color, [1, 1, 1], 0.08), lift: 0.3, joints: skin.joints, weights: skin.weights });
            }
            if (!furry) continue;
            // Tufts from the rim over the hollow, lighter, longest low in the ear.
            const lining = Math.round(110 * coat.budget * Math.sqrt(s));
            const light = mixRgb(inner, [0.9, 0.86, 0.8], 0.6);
            for (let k = 0; k < lining; k++) {
                const t = 0.12 + rand() * 0.7, e = rand() < 0.5 ? 1 : -1;
                const a = e > 0 ? 0.25 + rand() * 0.35 : Math.PI - 0.25 - rand() * 0.35;
                const q = pointAt(t, a);
                roots.push({ p: q.p, n: norm(add(q.R.y, mul(q.R.x, e * 0.4))), flow: add(mul(q.R.x, -e), mul(q.R.dir, 0.9)), len: 0.014 * Math.sqrt(s) * coat.length * (1 - t * 0.6) * (0.7 + 0.6 * rand()),
                    width: 0.0024, color: mul(light, 0.95), tip: light, lift: 0.6, joints: skin.joints, weights: skin.weights });
            }
            // A collar of longer fur round the root, combed up the ear, hiding where it meets the head.
            const collar = Math.round(90 * coat.budget * Math.sqrt(s));
            for (let k = 0; k < collar; k++) {
                const a = rand() * Math.PI * 2, t = (sink / (tall * s + sink)) * (0.75 + rand() * 0.5);
                const q = pointAt(t, a);
                const n = norm(add(q.n, mul(q.R.dir, -0.3)));
                const color = mixRgb(outer, coatRgb, 0.6);
                roots.push({ p: add(q.p, mul(n, -0.002)), n, flow: q.R.dir, len: 0.018 * Math.sqrt(s) * coat.length * (0.7 + 0.6 * rand()), width: 0.0034, color: mul(color, 0.95), tip: color, lift: 0.45,
                    joints: skin.joints, weights: skin.weights });
            }
        }
        return roots;
    }

    /**
     * The tail's path from the base of the spine, and its thickness along it.
     * A furred tail's thickness is its core; the fur on it makes its bulk.
     */
    function tailShape(type, len, s) {
        const T = {
            // Heavy at the root, flaring into the hips, sweeping down and back, the tip lifting off the ground.
            lizard: { r: t => 0.058 * s * Math.pow(1 - t, 1.2) + 0.022 * s * Math.exp(-t * 10) + 0.003, path: t => [Math.sin(t * 2.4) * 0.05 * len * t, -len * (0.5 * t + 0.35 * t * t - 0.4 * t * t * t), -len * (0.55 * t + 0.35 * t * t)] },
            dragon: { r: t => 0.074 * s * Math.pow(1 - t, 1.1) + 0.026 * s * Math.exp(-t * 10) + 0.004, path: t => [Math.sin(t * 3) * 0.08 * len, -len * (0.42 * t + 0.3 * t * t - 0.32 * t * t * t), -len * (0.65 * t + 0.45 * t * t)] },
            // A cat's: thick at the root and flaring into the rump, tapering a little to a rounded tip; out and
            // down from the seat, then sweeping back and up in a loose question mark, the tip turned over.
            cat: { r: t => (0.021 - 0.007 * t + 0.012 * Math.exp(-t * 14)) * s * (t > 0.9 ? Math.sqrt(Math.max(0.04, 1 - ((t - 0.9) / 0.1) ** 2)) : 1), path: t => [Math.sin(t * 2.6) * 0.05 * len * t, len * (-0.62 * t + 0.62 * t * t + 0.05 * t * t * t), -len * (0.42 * t + 0.2 * t * t - 0.12 * t * t * t)] },
            // Hanging as a wolf's or a fox's does at rest: out from the rump, then down in a soft curve.
            fox: { r: t => (0.022 + 0.024 * Math.sin(Math.min(1, t * 1.1) * Math.PI * 0.9)) * s * (1 - 0.55 * t * t), path: t => [Math.sin(t * 2.4) * 0.03 * len * t, -len * (0.12 * t + 0.5 * t * t), -len * (0.42 * t - 0.12 * t * t)] },
            demon: { r: t => 0.012 * s * (1 - t * 0.5), path: t => [Math.sin(t * 4) * 0.05 * len, -0.35 * Math.sin(t * Math.PI * 0.7) * len + t * 0.15 * len, -t * len * 0.85] },
            monkey: { r: t => 0.012 * s, path: t => { const curl = Math.max(0, t - 0.7) / 0.3; return [0, Math.sin(t * Math.PI * 0.8) * 0.3 * len + Math.sin(curl * 5) * 0.06, -t * len * 0.8 + (1 - Math.cos(curl * 5)) * 0.04]; } },
            // A bull's: thin, hanging straight from the rump to the hocks.
            bull: { r: t => 0.015 * s * (1 - 0.35 * t) + 0.002, path: t => [Math.sin(t * 2.2) * 0.012 * len * t, -len * (0.22 * t + 0.62 * t * t), -len * (0.16 * t - 0.06 * t * t)] },
            horse: { r: t => (0.03 + t * 0.03) * s, path: t => [0, -t * len * 0.7, -0.08 * len - t * 0.12 * len] },
            rabbit: { r: t => Math.sqrt(Math.max(0, 1 - Math.pow(t * 2 - 1, 2))) * 0.028 * s + 0.001, path: t => [0, 0.004 * t, -t * 0.05 * s] },
            bird: { r: t => 0.02 * s, path: t => [0, -t * 0.15 * len, -t * 0.12 * len] }
        };
        return T[type] || T.lizard;
    }

    /** Fur on a tail: [count at full budget, length, width, lift, droop, how far it stands out from the tail (0 along it, 1 straight out)]. */
    const TAIL_FUR = { bull: [520, 0.008, 0.0026, 0.15, 0, 0.1], fox: [3200, 0.095, 0.0075, 0.35, 0.1, 0.36], cat: [4200, 0.026, 0.0042, 0.3, 0, 0.28], rabbit: [520, 0.026, 0.0045, 0.9, 0, 0.85], monkey: [520, 0.007, 0.0024, 0.15, 0, 0.1] };

    /** The tail's base: the back of the pelvis, just above the seat. */
    function tailBase(pack, L) {
        const an = Outfit.anatomy(pack), P = L.P;
        let best = null;
        for (const v of pack._bodyIds) {
            if (an.member[v * 5] < 0.6 || Math.abs(P[v * 3]) > 0.02) continue;
            const s = an.s[v * 5];
            if (s < 0.25 || s > 0.75) continue;
            if (!best || P[v * 3 + 2] < best[2]) best = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
        }
        return best || add(L.bone('Hips').head, [0, 0, -0.1]);
    }

    /** A frame along a path at each point: forward, side and up, carried along so it never flips. */
    function pathFrames(pts) {
        const n = pts.length, out = [];
        let side = null;
        for (let k = 0; k < n; k++) {
            const d = norm(sub(pts[Math.min(n - 1, k + 1)], pts[Math.max(0, k - 1)]));
            if (!side) side = norm(cross(d, Math.abs(d[1]) < 0.95 ? [0, 1, 0] : [0, 0, 1]));
            side = norm(sub(side, mul(d, dot(side, d))));
            const up = norm(cross(side, d));
            out.push({ d, side, up });
        }
        return out;
    }

    function tail(m, hard, pack, L, f, bones, boneBase, coat, spinesF) {
        const s = f.size, len = 0.9 * (f.length || 1);
        const shape = tailShape(f.type, len, s);
        const reptile = f.type === 'lizard' || f.type === 'dragon';
        // A reptile's tail grows out of the hips from inside them, so its root has no rim.
        const base = add(tailBase(pack, L), [0, 0, reptile ? 0.045 * s : 0.015]);
        const count = reptile ? 48 : 24;
        const pts = Array.from({ length: count + 1 }, (_, k) => add(base, shape.path(k / count)));
        // The tail's bones: a chain from the hips, five along the tail (a cyber tail's segments ride them too).
        const chain = 5, hips = L.boneIndex('Hips');
        const at = t => pts[Math.min(count, Math.round(t * count))];
        for (let b = 0; b < chain; b++) bones.push({ name: b ? 'Tail' + (b + 1) : 'Tail', parent: b ? bones.length - 1 + boneBase : hips, head: at(b / chain), tail: at((b + 1) / chain), local: true });
        const first = boneBase + bones.length - chain;
        const skinAt = t => {
            const x = Math.min(chain - 1e-6, Math.max(0, t) * chain), i = Math.floor(x), w = x - i;
            const next = Math.min(chain - 1, i + 1);
            return { joints: [first + i, first + next, 0, 0], weights: [1 - w * 0.5, w * 0.5, 0, 0] };
        };
        // Body mods hook: a cyber tail on these same bones (RRCharacterBodyMods), so it sways as a living one does.
        const Mods = root.RRCharacterBodyMods || (typeof require === 'function' ? require('./CharacterBodyMods.js') : null);
        if (f.type === 'cyber' && Mods) return { parts: Mods.cyberTail(pts, t => shape.r(t) * 0.55, skinAt, f) };
        const main = linear(f.color), tip = linear(f.color2 || f.color);
        if (f.type === 'bird') {
            // A fan of tail feathers.
            for (let k = -4; k <= 4; k++) {
                const dir = norm([k * 0.12, -0.6, -1]);
                const a = base, b = add(base, mul(dir, 0.32 * s * (1 - Math.abs(k) * 0.06)));
                const right = norm(cross(dir, [0, 1, 0]));
                m.loft(6, (i, t) => ({ center: lerp(a, b, t), x: right, y: [0, 1, 0], rx: 0.022 * s * Math.sin(Math.max(0.15, t) * Math.PI) + 0.002, ry: 0.002 }), 6, t => mixRgb(main, tip, t > 0.8 ? 1 : 0), skinAt(0.3), true);
            }
            return {};
        }
        if (f.type === 'horse') {
            // The dock, short and tapering, and the long hair falling from it to below the hocks.
            const dock = Array.from({ length: 9 }, (_, q) => add(base, [0, -0.11 * len * (q / 8) ** 1.2, -0.06 * len * Math.sin(q / 8 * Math.PI / 2)]));
            m.tube(dock, t => (0.026 - 0.012 * t) * s, 10, main, p => skinAt(Math.min(1, (base[1] - p[1]) / (len * 0.7))), true);
            if (!coat) return {};
            const frames = pathFrames(dock), rand = rng(3301), roots = [];
            const locks = Math.round(700 * coat.budget * Math.sqrt(s));
            for (let k = 0; k < locks; k++) {
                const t = 0.15 + rand() * 0.85, q = Math.min(7, Math.floor(t * 8)), F = frames[q];
                const a = rand() * Math.PI * 2, radial = norm(add(mul(F.side, Math.cos(a)), mul(F.up, Math.sin(a))));
                const color = mul(main, 0.85 + 0.3 * rand());
                roots.push({ p: add(lerp(dock[q], dock[q + 1], t * 8 - q), mul(radial, 0.015 * s)), n: radial, flow: norm(add([0, -1, -0.2], mul(radial, 0.07))),
                    len: len * (0.38 + 0.28 * rand()), width: 0.009 * s * (0.8 + 0.4 * rand()), color: mul(color, 0.9), tip: mixRgb(color, [1, 1, 1], 0.05),
                    lift: 0.12, droop: 0.35, twist: 0.3, lane: 3, ...skinAt(Math.min(1, t * 0.5 + 0.2)) });
            }
            return { roots };
        }
        if (reptile) return { part: reptileTail(hard, pts, shape, f, skinAt, spinesF) };
        // Lighter underneath; a cat's tip and a bushy tail's tip in their own color.
        const colorAt = (t, under) => {
            // A bushy tail darkens to its tip, as a wolf's does.
            if (f.type === 'fox' && t > 0.7) return mixRgb(mixRgb(main, tip, under * 0.5), [0.03, 0.025, 0.02], Math.min(0.8, (t - 0.7) / 0.2 * 0.8));
            // A cat's: the coat's own tabby rings, closer toward the tip, and the tip dark.
            if (f.type === 'cat') return mixRgb(main, tip, t > 0.9 ? 1 : t > 0.12 && Math.sin(Math.pow(t, 0.85) * Math.PI * 11) > 0.45 ? 0.85 : 0);
            return mixRgb(main, tip, under * 0.6);
        };
        m.tube(pts, t => shape.r(t), 12, (t, a) => colorAt(t, Math.max(0, Math.sin(a)) ** 2), p => {
            let best = 0, bd = Infinity;
            for (let k = 0; k <= count; k++) { const d = (p[0] - pts[k][0]) ** 2 + (p[1] - pts[k][1]) ** 2 + (p[2] - pts[k][2]) ** 2; if (d < bd) { bd = d; best = k; } }
            return skinAt(best / count);
        }, true);
        if (f.type === 'demon') {
            // The spade at the tip.
            const end = pts[count], dir = norm(sub(pts[count], pts[count - 2]));
            const side = norm(cross(dir, [0, 1, 0]));
            m.loft(6, (i, t) => ({ center: add(end, mul(dir, t * 0.06 * s)), x: side, y: norm(cross(side, dir)), rx: 0.03 * s * Math.sin(Math.max(0.1, Math.min(1, t * 1.6)) * Math.PI * 0.75) + 0.001, ry: 0.004 }), 8, main, skinAt(1), true);
        }
        const furSpec = TAIL_FUR[f.type];
        if (!furSpec || !coat) return {};
        const roots = [];
        if (f.type === 'bull') {
            // The switch: a tassel of long hair from the last of the tail, falling past its tip.
            const frames = pathFrames(pts), rand = rng(7703), dark = mixRgb(main, [0.02, 0.015, 0.01], 0.45);
            const locks = Math.round(260 * coat.budget * Math.sqrt(s));
            for (let k = 0; k < locks; k++) {
                const t = 0.8 + rand() * 0.19, x = t * count, i = Math.min(count - 1, Math.floor(x)), F = frames[i];
                const a = rand() * Math.PI * 2, radial = norm(add(mul(F.side, Math.cos(a)), mul(F.up, Math.sin(a))));
                const color = mul(dark, 0.85 + 0.3 * rand());
                roots.push({ p: add(lerp(pts[i], pts[i + 1], x - i), mul(radial, shape.r(t) * 0.8)), n: radial, flow: norm(add(F.d, mul(radial, 0.18))),
                    len: (0.07 + 0.08 * rand()) * s * (t - 0.75) / 0.25, width: 0.006 * s, color, tip: color, lift: 0.15, droop: 0.25, twist: 0.4, lane: 3, ...skinAt(t) });
            }
        }
        // Fur over the whole tail, combed toward its tip, longest round the middle of a bushy one.
        const [full, flen, width, lift, droop, out] = furSpec;
        const frames = pathFrames(pts), rand = rng(5101 + f.type.length);
        const tufts = Math.round(full * coat.budget * Math.sqrt(s * (f.type === 'rabbit' ? 1 : f.length || 1)));
        for (let k = 0; k < tufts; k++) {
            const t = f.type === 'rabbit' ? 0.1 + rand() * 0.8 : Math.min(0.995, Math.pow(rand(), 0.9));
            const x = t * count, i = Math.min(count - 1, Math.floor(x)), u = x - i;
            const p0 = lerp(pts[i], pts[i + 1], u), F = frames[i];
            const a = rand() * Math.PI * 2, radial = norm(add(mul(F.side, Math.cos(a)), mul(F.up, Math.sin(a))));
            const r = shape.r(t);
            const bulk = f.type === 'fox' ? 0.45 + 0.75 * Math.sin(Math.min(1, t * 1.05 + 0.08) * Math.PI) : f.type === 'rabbit' ? 1 : 1 - t * 0.25;
            const color = colorAt(t, Math.max(0, -Math.sin(a)) ** 2);
            roots.push({ p: add(p0, mul(radial, r * 0.85)), n: radial, flow: add(mul(F.d, 1 - out), mul(radial, out)),
                len: flen * s * (f.type === 'cat' ? Math.max(0.9, coat.length) : coat.length) * bulk * (0.7 + 0.6 * rand()), width: width * Math.sqrt(s) * (0.8 + 0.4 * rand()),
                color: mul(color, 0.94), tip: mixRgb(color, [1, 1, 1], 0.06), lift, droop, ...skinAt(t) });
        }
        return { roots };
    }

    /**
     * A lizard's or a dragon's tail: wide where it leaves the hips and a
     * little taller than wide toward the tip, laid with scales from the
     * scale picture (`scales.png`: rows of overlapping scales round the
     * tail, broad plates down the belly), its own color above and the
     * underside's below, with faint darker bands. A row of spines runs down
     * its top when the back has a ridge, and a dragon's always carries plates.
     */
    function reptileTail(hard, pts, shape, f, skinAt, spinesF) {
        const s = f.size, n = pts.length - 1, SIDES = 28;
        const frames = pathFrames(pts), main = linear(f.color), belly = linear(f.color2 || f.color);
        const dragon = f.type === 'dragon';
        const pos = [], nrm = [], uv = [], col = [], jn = [], wt = [], idx = [];
        const smooth = (a, b, x) => { const q = Math.max(0, Math.min(1, (x - a) / (b - a))); return q * q * (3 - 2 * q); };
        for (let k = 0; k <= n; k++) {
            const t = k / n, F = frames[k], r = shape.r(t);
            const root = Math.exp(-t * 10);
            const rx = r * (1 + 0.18 * (1 - t) * (1 - t)) * (1 - 0.12 * t), ry = r * (1 + 0.12 * t) * (1 - 0.22 * root);
            const band = dragon ? 1 : 0.88 + 0.12 * Math.cos(t * Math.PI * 14 + 0.6);
            const sk = skinAt(t);
            for (let j = 0; j <= SIDES; j++) {
                const u = j / SIDES, a = -Math.PI / 2 + (u - 0.5) * Math.PI * 2;
                const c = Math.cos(a), si = Math.sin(a);
                const p = add(pts[k], add(mul(F.side, c * rx), mul(F.up, si * ry)));
                pos.push(...p); nrm.push(...norm(add(mul(F.side, c / rx), mul(F.up, si / ry))));
                uv.push(u, Math.min(1, t));
                const under = smooth(0.3, 0.75, -si);
                const rgb = mixRgb(main.map(x => x * band), belly, under);
                col.push(...rgb);
                jn.push(...sk.joints); wt.push(...sk.weights);
            }
        }
        for (let k = 0; k < n; k++) for (let j = 0; j < SIDES; j++) {
            const a = k * (SIDES + 1) + j, b = a + SIDES + 1;
            idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
        // The tip closed to a point.
        const end = pos.length / 3, last = pts[n], F = frames[n];
        pos.push(...add(last, mul(F.d, 0.006 * s))); nrm.push(...F.d); uv.push(0.5, 1); col.push(...main); jn.push(...skinAt(1).joints); wt.push(...skinAt(1).weights);
        for (let j = 0; j < SIDES; j++) idx.push(n * (SIDES + 1) + j, end, n * (SIDES + 1) + j + 1);
        // Down the top: a dragon's plates, or a ridge's spines carried on from the back.
        const ridge = spinesF && (spinesF.type === 'ridge' || spinesF.type === 'both');
        if (dragon || ridge) {
            const spineColor = linear(ridge ? spinesF.color : f.color2 || f.color), ss = ridge ? spinesF.size : 1;
            const rows = dragon ? 16 : 20;
            for (let q = 0; q < rows; q++) {
                const t = 0.04 + 0.9 * q / (rows - 1), k = Math.round(t * n), Fk = frames[k], r = shape.r(t);
                const root = add(pts[k], mul(Fk.up, r * (1 + 0.12 * t) * 0.9));
                const h = (dragon ? 0.045 : 0.022) * s * ss * (1 - t * 0.7) + 0.003;
                if (dragon) {
                    // A flat, back-swept plate.
                    const back = mul(Fk.d, h * 0.7), sk = skinAt(t);
                    hard.loft(5, (i, v) => ({ center: add(add(root, mul(Fk.up, v * h)), mul(back, v)), x: Fk.d, y: Fk.side, rx: Math.max(0.0012, h * 0.55 * (1 - v)), ry: Math.max(0.0008, 0.004 * s * (1 - v)) }), 6, spineColor, sk, true);
                } else hard.tube([root, add(root, add(mul(Fk.up, h * 0.6), mul(Fk.d, h * 0.4))), add(root, add(mul(Fk.up, h), mul(Fk.d, h * 0.8)))], [0.006 * s * ss * (1 - t * 0.6) + 0.001, 0.003 * s, 0.0006], 6, spineColor, skinAt(t));
            }
        }
        return { name: 'Tail', positions: Float32Array.from(pos), normals: Float32Array.from(nrm), uvs: Float32Array.from(uv), colors: Float32Array.from(col),
            joints: Uint8Array.from(jn), weights: Float32Array.from(wt), index: Uint32Array.from(idx), texture: 'scales.png', keepColors: true, roughness: 0.7, metalness: 0, kind: 'skin' };
    }

    /**
     * The scale picture for a reptile's tail, gray, tinted by the tail's
     * colors: across, once round the tail (the top at the edges, the belly
     * in the middle); down, root to tip. Rows of overlapping scales, each
     * a low dome lit on its free edge with a groove round it and its own
     * shade; down the belly, broad plates spanning it.
     */
    let neckPictures;
    function neckSurface(){
        if(neckPictures)return neckPictures;
        const size=512,heights=new Float32Array(size*size),data=new Uint8Array(size*size*4),normal=new Uint8Array(data.length);
        for(let y=0;y<size;y++)for(let x=0;x<size;x++){
            const v=y/size*24,row=Math.floor(v),u=x/size*48+(row&1)*.5,fx=(u-Math.floor(u))-.5,fy=v-row-.45;
            const d=Math.hypot(fx*1.75,fy*1.65),edge=1-Math.max(0,Math.min(1,(d-.70)/.20)),dome=Math.max(0,1-d*d);
            const micro=Math.sin(u*25+fy*3)*Math.sin(v*34)*.007;
            const i=y*size+x;heights[i]=edge*(.30+.7*dome)*.12+micro;
            const value=Math.round(255*(.83+.14*edge+.015*dome+micro));data.set([value,value,value,255],i*4);
        }
        for(let y=0;y<size;y++)for(let x=0;x<size;x++){
            const h=(a,b)=>heights[((b+size)%size)*size+(a+size)%size],dx=(h(x+1,y)-h(x-1,y))*7,dy=(h(x,y+1)-h(x,y-1))*7,n=Math.hypot(dx,dy,1);
            normal.set([Math.round(127.5-dx/n*127.5),Math.round(127.5+dy/n*127.5),Math.round(127.5+127.5/n),255],(y*size+x)*4);
        }
        return neckPictures={'neck-scales.png':{width:size,height:size,data},'neck-scales-normal.png':{width:size,height:size,data:normal}};
    }
    function scaleTexture(W = 512, H = 1024) {
        const data = new Uint8Array(W * H * 4);
        const ROWS = 54, COLS = 24;
        const h2 = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const u = (x + 0.5) / W, v = (y + 0.5) / H;
            const fv = v * ROWS, row = Math.floor(fv);
            const bellyW = Math.abs(u - 0.5);
            let l;
            if (bellyW < 0.11) {
                // A belly plate: the full band wide, one row long, its back edge tucked under the one before.
                const fy = fv - row, fx = bellyW / 0.11;
                const groove = Math.min(1, fy / 0.12) * Math.min(1, (1 - fx) / 0.12);
                l = (0.66 + 0.3 * groove + 0.08 * fy) * (0.95 + 0.08 * h2(row, 7));
            } else {
                // Staggered rows; the nearest scale and the next nearest, for the groove between them.
                const fu = u * COLS;
                let d1 = 9, d2 = 9, cell = [0, 0], fyAt = 0;
                for (let dr = -1; dr <= 1; dr++) {
                    const rr = row + dr, off = (rr & 1) * 0.5;
                    const cc = Math.floor(fu - off);
                    for (let dc = -1; dc <= 1; dc++) {
                        const cx = cc + dc + off + 0.5, cy = rr + 0.5;
                        const du = fu - cx, dv = (fv - cy) * 1.15;
                        const d = Math.hypot(du, dv);
                        if (d < d1) { d2 = d1; d1 = d; cell = [cc + dc, rr]; fyAt = fv - cy; } else if (d < d2) d2 = d;
                    }
                }
                const edge = Math.min(1, (d2 - d1) / 0.16);
                const dome = Math.max(0, 1 - d1 * d1 * 1.6);
                // Lit toward its free edge (toward the tip), shaded toward its root under the scale before.
                l = (0.84 + 0.10 * dome + 0.035 * Math.max(-1, Math.min(1, fyAt * 1.6))) * (0.87 + 0.13 * edge) * (0.97 + 0.05 * h2(((cell[0] % COLS) + COLS) % COLS, cell[1]));
            }
            const o = (y * W + x) * 4, g = Math.max(0, Math.min(255, Math.round(255 * Math.min(1, l))));
            data[o] = data[o + 1] = data[o + 2] = g; data[o + 3] = 255;
        }
        return { width: W, height: H, data, name: 'scales.png' };
    }
    const fract = x => x - Math.floor(x);

    function wings(m, L, f) {
        if (f.type === 'insect') return;
        const spine = L.boneIndex('Spine2'), skin = Props.rigid(spine), s = f.size;
        const y = L.bone('Spine2').head[1] + 0.1;
        const z0 = L.backAt(y, 0.06);
        const main = linear(f.color), second = linear(f.color2 || f.color);
        for (const side of [1, -1]) {
            const root = [side * 0.07, y, (isFinite(z0) ? z0 : -0.12) - 0.02];
            // The leading edge: up and out to the wrist, then out and down to the tip.
            const shoulder = add(root, [side * 0.18 * s, 0.16 * s, -0.12 * s]);
            const wrist = add(root, [side * 0.55 * s, 0.32 * s, -0.22 * s]);
            const tip = add(root, [side * 0.95 * s, 0.05 * s, -0.25 * s]);
            // Fairy wings are their own veined, see-through part (fairyWing).
            if (f.type === 'fairy') continue;
            const arm = [root, shoulder, wrist, tip];
            if (f.type === 'bat') {
                m.tube([root, shoulder, wrist], t => 0.014 * s * (1 - t * 0.5), 6, second, skin);
                const fingers = [tip, add(root, [side * 0.8 * s, -0.25 * s, -0.22 * s]), add(root, [side * 0.55 * s, -0.42 * s, -0.18 * s]), add(root, [side * 0.25 * s, -0.4 * s, -0.12 * s])];
                for (const fg of fingers) m.tube([wrist, lerp(wrist, fg, 0.5), fg], t => 0.008 * s * (1 - t * 0.7), 5, second, skin);
                // The membrane between the fingers, scalloped at the trailing edge, both sides drawn.
                const edge = [shoulder, ...fingers.map((fg, k) => fg)];
                const hubs = [shoulder].concat(fingers);
                const membrane = [];
                for (let k = 0; k + 1 < hubs.length; k++) {
                    const a = hubs[k], b = hubs[k + 1];
                    const sag = add(lerp(a, b, 0.5), mul(norm(sub(lerp(a, b, 0.5), wrist)), -0.06 * s));
                    membrane.push([wrist, a, sag], [wrist, sag, b]);
                }
                membrane.push([wrist, hubs[hubs.length - 1], root], [root, wrist, shoulder]);
                for (const [a, b, c] of membrane) {
                    const n = norm(cross(sub(b, a), sub(c, a)));
                    const i0 = m.vertex(a, n, main, skin), i1 = m.vertex(b, n, main, skin), i2 = m.vertex(c, n, main, skin);
                    m.tri(i0, i1, i2);
                    const j0 = m.vertex(a, mul(n, -1), main, skin), j1 = m.vertex(b, mul(n, -1), main, skin), j2 = m.vertex(c, mul(n, -1), main, skin);
                    m.tri(j0, j2, j1);
                }
                void edge;
                continue;
            }
            // Feathered wings are built as feathers on their own part (featheredWing).
            if (f.type === 'feathered') continue;
            m.tube(arm, t => 0.03 * s * (1 - t * 0.6), 8, main, skin);
            const rows = [[1, 0.42, 14, main], [0.62, 0.26, 16, mixRgb(main, second, 0.4)], [0.35, 0.14, 18, second]];
            for (const [reach, length, count, color] of rows) {
                for (let k = 0; k < count; k++) {
                    const t = k / (count - 1);
                    const seg = t < 0.5 ? lerp(shoulder, wrist, t * 2) : lerp(wrist, tip, (t - 0.5) * 2);
                    const from = lerp(lerp(root, shoulder, 0.5), seg, Math.min(1, 0.25 + t));
                    const handward = t > 0.5 ? (t - 0.5) * 2 : 0;
                    const dir = norm([side * (0.15 + handward * 0.9), -1 + handward * 0.35, -0.1]);
                    const flen = length * s * reach * (0.55 + 0.45 * t + handward * 0.5);
                    const to = add(from, mul(dir, flen));
                    const right = norm(cross(dir, [0, 0, 1]));
                    m.loft(5, (i, q) => ({ center: lerp(from, to, q), x: right, y: [0, 0, 1], rx: (0.022 + 0.012 * t) * s * Math.sin(Math.max(0.2, q) * Math.PI * 0.9) + 0.003, ry: 0.0025 }), 6, color, skin, true);
                }
            }
        }
    }

    /**
     * A feathered wing as a bird's (and a painted angel's) is made: an arm
     * from the shoulder blade up over the shoulder to the wrist and out to the
     * hand, half spread behind the back; on it the flight feathers (primaries
     * fanning from the hand, secondaries along the forearm, tertials by the
     * body), overlapped by three rows of coverts growing shorter toward the
     * leading edge and the scapulars over the root. Each feather is a curved
     * card on the feather picture (`feather.png`), tinted from the wing's
     * color at its tip to its second color at its base. Returns a part.
     */
    function featheredWing(L, f) {
        const spine = L.boneIndex('Spine2'), s = f.size;
        const y = L.bone('Spine2').head[1] + 0.1, z0 = L.backAt(y, 0.06);
        const main = linear(f.color), second = linear(f.color2 || f.color);
        const pos = [], nrm = [], uv = [], col = [], idx = [];
        const card = (from, dir, across, len, wid, bend, tint, lane) => {
            // Along the feather in four segments, curving back off the wing a little; two vertices across.
            const out = norm(cross(dir, across)), base = pos.length / 3;
            for (let k = 0; k <= 4; k++) {
                const t = k / 4, c = add(add(from, mul(dir, len * t)), mul(out, bend * len * t * t));
                const w = wid * (k === 0 ? 0.55 : 1);
                for (const e of [-1, 1]) {
                    const p = add(c, mul(across, e * w * 0.5));
                    pos.push(...p); nrm.push(...out); uv.push(lane * 0.5 + (e < 0 ? 0 : 0.5), 1 - t);
                    const rgb = mixRgb(second, main, Math.min(1, t * 1.3)).map(x => x * tint);
                    col.push(...rgb);
                }
            }
            for (let k = 0; k < 4; k++) { const a = base + k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        };
        for (const side of [1, -1]) {
            const root = [side * 0.07, y, (isFinite(z0) ? z0 : -0.12) - 0.015];
            // The arm: up and out behind the shoulder, the wrist high, the hand reaching out and a little down.
            const knots = [root, add(root, [side * 0.12 * s, 0.12 * s, -0.08 * s]), add(root, [side * 0.3 * s, 0.32 * s, -0.16 * s]),
                add(root, [side * 0.5 * s, 0.42 * s, -0.22 * s]), add(root, [side * 0.7 * s, 0.34 * s, -0.27 * s])];
            const armAt = t => {
                const x = t * (knots.length - 1), i = Math.min(knots.length - 2, Math.floor(x)), u = x - i;
                const p0 = knots[Math.max(0, i - 1)], p1 = knots[i], p2 = knots[i + 1], p3 = knots[Math.min(knots.length - 1, i + 2)];
                return [0, 1, 2].map(k => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u * u + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u * u * u));
            };
            const alongAt = t => norm(sub(armAt(Math.min(1, t + 0.01)), armAt(Math.max(0, t - 0.01))));
            // The way a feather hangs at t: down by the body, fanning out to point along the hand at the tip.
            const hangAt = t => {
                const spread = Math.pow(Math.max(0, (t - 0.55) / 0.45), 1.4);
                return norm(add(mul([side * 0.12, -1, -0.12], 1 - spread), mul(alongAt(t), spread * 1.15)));
            };
            const across = (t, dir) => { let a = norm(sub(alongAt(t), mul(dir, dot(alongAt(t), dir)))); if (!isFinite(a[0])) a = [side, 0, 0]; return a; };
            const lay = (t, len, wid, depth, tint, lane) => {
                const dir = hangAt(t), a = across(t, dir), from = add(armAt(t), [0, 0, -depth]);
                card(from, dir, a, len, wid, 0.06, tint, lane);
            };
            // Flight feathers: tertials, secondaries and primaries, longest at the hand, the last few shorter.
            const flight = [];
            for (let k = 0; k < 5; k++) flight.push([0.12 + k * 0.05, 0.36 + k * 0.03, 0.13]);
            for (let k = 0; k < 13; k++) flight.push([0.37 + k * 0.035, 0.5 + k * 0.012, 0.15]);
            for (let k = 0; k < 10; k++) flight.push([0.83 + k * 0.019, 0.72 + Math.sin(Math.min(1, k / 7) * Math.PI * 0.5) * 0.22 - (k > 7 ? (k - 7) * 0.12 : 0), 0.12]);
            flight.forEach(([t, len, w], k) => lay(t, len * s, w * s, 0.002 + k * 0.0006, 0.93 + 0.07 * ((k * 7) % 3) / 2, 0));
            // Coverts in three rows over the flight feathers' bases, then the small ones along the leading edge.
            const rows = [[0.32, 0.12, 24, 0.012], [0.18, 0.09, 28, 0.02], [0.09, 0.06, 32, 0.027]];
            for (const [len, w, count, depth] of rows) for (let k = 0; k < count; k++) {
                const t = 0.08 + 0.9 * k / (count - 1);
                lay(t, len * s * (1 - 0.25 * t), w * s, depth + k * 0.0003, 0.97, 1);
            }
            // Scapulars over the root, laid down the back.
            for (let k = 0; k < 6; k++) lay(0.02 + k * 0.02, (0.2 - k * 0.012) * s, 0.09 * s, 0.03 + k * 0.001, 1, 1);
        }
        const n = pos.length / 3;
        return { name: 'Wings', positions: Float32Array.from(pos), normals: Float32Array.from(nrm), uvs: Float32Array.from(uv), colors: Float32Array.from(col),
            joints: new Uint8Array(n * 4).map((_, i) => (i % 4 === 0 ? spine : 0)), weights: new Float32Array(n * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)),
            index: Uint32Array.from(idx), texture: 'feather.png', cutout: true, alphaCutoff: 0.4, keepColors: true, doubleSided: true, roughness: 0.8, metalness: 0 };
    }

    /**
     * A fairy's wings as an insect's: a fore and a hind pair from the shoulder
     * blades, each a thin membrane cupped a little, broad toward its tip, on
     * the wing picture (`fairywing.png`: veins branching from the base, cross
     * veins between them, a darker edge, see-through between), tinted from
     * the wing's second color at the base to its color at the tip.
     */
    function fairyWing(L, f) {
        const spine = L.boneIndex('Spine2'), s = f.size;
        const y = L.bone('Spine2').head[1] + 0.08, z0 = L.backAt(y, 0.05);
        const main = linear(f.color), second = linear(f.color2 || f.color);
        const pos = [], nrm = [], uv = [], col = [], idx = [];
        const U = 32, V = 12;
        for (const side of [1, -1]) {
            const root = [side * 0.05, y, (isFinite(z0) ? z0 : -0.12) + 0.004];
            // Fore wing up and out, hind wing out and down; [direction, length, width, sweep back].
            for (const [dir, len, wid, lane] of [[[side * 0.75, 0.6, -0.28], 0.46, 0.17, 0], [[side * 0.85, -0.42, -0.3], 0.32, 0.12, 1]]) {
                const d = norm(dir), across = norm(cross([0, 0, -1], d)), out = norm(cross(d, across));
                const base = pos.length / 3;
                for (let i = 0; i < U; i++) for (let j = 0; j <= V; j++) {
                    const u = i / U, v = j / V * 2 - 1;
                    // Broad toward the tip, narrow at the base; the leading edge straighter than the trailing.
                    const w = wid * s * Math.pow(Math.sin(Math.PI * (0.03 + u * 0.97)), 0.55) * (v < 0 ? 0.55 : 1) * (0.35 + 0.65 * u);
                    const cup = 0.02 * s * (1 - v * v) * Math.sin(Math.PI * u);
                    const p = add(add(add(root, mul(d, len * s * u)), mul(across, w * v * (lane ? -1 : 1) * side)), mul(out, cup));
                    pos.push(...p); nrm.push(...out); uv.push(lane * 0.5 + (v + 1) * 0.25, u);
                    col.push(...mixRgb(second, main, u));
                }
                for (let i = 0; i < U - 1; i++) for (let j = 0; j < V; j++) {
                    const a = base + i * (V + 1) + j, b = a + V + 1;
                    idx.push(a, b, a + 1, a + 1, b, b + 1);
                }
                const tip = pos.length / 3;
                pos.push(...add(root, mul(d, len * s))); nrm.push(...out);
                uv.push(lane * 0.5 + 0.25, 1); col.push(...main);
                for (let j = 0; j < V; j++) {
                    const a = base + (U - 1) * (V + 1) + j;
                    idx.push(a, tip, a + 1);
                }
            }
        }
        const n = pos.length / 3;
        return { name: 'Wings', positions: Float32Array.from(pos), normals: Float32Array.from(nrm), uvs: Float32Array.from(uv), colors: Float32Array.from(col),
            joints: new Uint8Array(n * 4).map((_, i) => (i % 4 === 0 ? spine : 0)), weights: new Float32Array(n * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)),
            index: Uint32Array.from(idx), texture: 'fairywing.png', opacity: 0.92, keepColors: true, doubleSided: true, roughness: 0.25, metalness: 0, envMapIntensity: 1.4 };
    }

    /** The fairy wing picture: two lanes (fore and hind), veins and cross veins over a faint, see-through membrane. */
    function fairyWingTexture(W = 256, H = 256) {
        const data = new Uint8Array(W * H * 4);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const lane = x < W / 2 ? 0 : 1, v = ((x % (W / 2)) + 0.5) / (W / 2) * 2 - 1, u = (y + 0.5) / H;
            // Veins fanning from the base: lines of constant angle across the wing, branching toward the tip.
            const fan = v * (1 + u * 1.6) * (lane ? 4 : 5);
            const vein = Math.max(0, 1 - Math.abs(fan - Math.round(fan)) * 14 * (0.6 + u));
            const cross = Math.max(0, 1 - Math.abs(Math.sin(u * 22 + Math.round(fan) * 1.7)) * 9) * (u > 0.2 ? 1 : 0) * 0.6;
            const edge = 1 - Math.min(1, (1 - Math.abs(v)) * 9);
            const line = Math.min(1, Math.max(vein, cross, edge));
            const a = 0.22 + 0.7 * line, l = 0.78 + 0.22 * (1 - line);
            const o = (y * W + x) * 4, g = Math.round(255 * l);
            // A faint shift of hue along the wing, as thin films catch light.
            data[o] = Math.min(255, g + Math.round(20 * Math.sin(u * 9))); data[o + 1] = g; data[o + 2] = Math.min(255, g + Math.round(20 * Math.cos(u * 7)));
            data[o + 3] = Math.round(255 * a);
        }
        return { width: W, height: H, data, name: 'fairywing.png' };
    }

    /**
     * The feather picture: two lanes, a flight feather (a stiff shaft, the
     * outer vane narrower, barbs angled toward the tip, a split or two in the
     * vane) and a covert (softer, rounder, downy at its base). Gray scale,
     * tinted by the wing's colors.
     */
    function featherTexture(W = 128, H = 256) {
        const data = new Uint8Array(W * H * 4);
        const rand = (() => { let q = 99; return () => { q ^= q << 13; q >>>= 0; q ^= q >> 17; q ^= q << 5; q >>>= 0; return q / 4294967296; }; })();
        const splits = [0, 1].map(() => Array.from({ length: 3 }, () => [0.25 + rand() * 0.6, rand() < 0.5 ? -1 : 1]));
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const lane = x < W / 2 ? 0 : 1, u = ((x % (W / 2)) + 0.5) / (W / 2) * 2 - 1, v = 1 - (y + 0.5) / H;
            // The vane's half width along the feather: rounded at the tip, narrowing to the quill.
            const tip = lane ? 0.92 : 0.96, prof = v > tip ? 0 : Math.sqrt(Math.max(0, 1 - Math.pow(v / tip, lane ? 2.2 : 3.5))) * Math.min(1, v * (lane ? 3 : 6));
            const half = prof * (u < 0 ? (lane ? 0.95 : 0.6) : 0.95);
            const shaft = Math.abs(u) < 0.06 * (1 - v * 0.7) && v < tip + 0.02;
            let a = Math.abs(u) <= half ? 1 : 0;
            // Barbs: fine lines angled toward the tip; a split or two parts them.
            const barb = 0.5 + 0.5 * Math.sin((v * 90 + Math.abs(u) * 26) * Math.PI);
            for (const [sv, sd] of splits[lane]) if (Math.sign(u) === sd && Math.abs(v - sv - Math.abs(u) * 0.3) < 0.006 && Math.abs(u) > 0.15) a = 0;
            // Downy at a covert's base: ragged and soft.
            if (lane && v < 0.25) a *= 0.5 + 0.5 * barb;
            const edge = Math.abs(u) > half * 0.92 ? 0.85 : 1;
            let l = (0.92 + 0.08 * barb) * edge * (0.92 + 0.08 * v);
            if (shaft) { a = 1; l = 0.98; }
            const o = (y * W + x) * 4, g = Math.round(255 * Math.min(1, l));
            data[o] = data[o + 1] = data[o + 2] = g; data[o + 3] = Math.round(255 * a);
        }
        return { width: W, height: H, data, name: 'feather.png' };
    }

    function beak(m, L, f) {
        const head = L.boneIndex('Head'), skin = Props.rigid(head), s = f.size;
        const base = lerp(L.mouth, L.noseTip, 0.55);
        base[2] = Math.max(L.mouth[2], L.noseTip[2] - 0.012);
        const width = 0.032 * s, len = (f.type === 'duck' ? 0.07 : f.type === 'crow' ? 0.085 : 0.065) * s;
        const main = linear(f.color), dark = linear(f.color2 || f.color);
        const hook = f.type === 'raptor' ? 1 : 0, flat = f.type === 'duck' ? 1 : 0;
        // Upper bill.
        m.loft(10, (i, t) => {
            const c = add(base, [0, 0.008 - Math.pow(t, 2.2) * hook * 0.035 * s, t * len]);
            return { center: c, x: [1, 0, 0], y: [0, 1, 0], rx: Math.max(0.002, width * (flat ? 1 - t * 0.3 : 1 - t * 0.95)), ry: Math.max(0.002, (0.02 - t * 0.016) * s * (flat ? 0.45 : 1)) };
        }, 12, t => mixRgb(main, dark, t > 0.85 ? 0.7 : 0), skin, true);
        // Lower bill.
        m.loft(8, (i, t) => ({ center: add(base, [0, -0.012 * s, t * len * 0.8]), x: [1, 0, 0], y: [0, 1, 0], rx: Math.max(0.002, width * (flat ? 0.95 - t * 0.3 : 0.9 - t * 0.85)), ry: Math.max(0.0015, 0.008 * s * (1 - t)) }), 10, main, skin, true);
    }

    function tusks(m, pack, L, f) {
        const head = L.boneIndex('Head'), skin = Props.rigid(head);
        const s = f.size * (f.type === 'large' ? 1.8 : 1);
        const P = L.P, teeth = pack.helpers.lowerTeeth.source;
        for (const side of [1, -1]) {
            // The lower teeth's front corner on this side.
            let best = null;
            for (const v of teeth) {
                const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
                if (Math.sign(p[0]) !== side) continue;
                const score = p[2] - Math.abs(p[0] - side * 0.015) * 2;
                if (!best || score > best.score) best = { p, score };
            }
            if (!best) continue;
            const a = best.p.slice();
            // Start inside the lower gum. The old root was pushed outside the lip before the tube
            // even began, leaving a flat ivory base suspended over the chin on broad-jawed species.
            a[1] -= 0.008;
            a[2] -= 0.004;
            // From the lower jaw out over the lip, curving up and a little out: thick at the root, a blunt
            // rounded point, ivory yellowing toward the gum.
            const big = f.type === 'large', len = (big ? 0.03 : 0.022) * s, r0 = (big ? 0.0062 : 0.0048) * Math.sqrt(s) * (big ? 1.25 : 1);
            const pts = [];
            for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push(add(a, [side * t * 0.006 * s, t * (len + 0.008), Math.sin(t * 1.6) * 0.014 * Math.sqrt(s)])); }
            const ivory = linear(f.color), root = mixRgb(ivory, [0.45, 0.33, 0.18], 0.35);
            m.tube(pts, t => r0 * Math.sqrt(Math.max(0.02, 1 - Math.pow(t, 2.4))) * (1 - 0.25 * t), 10, t => mixRgb(root, ivory, Math.min(1, t * 1.6)), skin);
        }
    }

    function spines(m, pack, L, f) {
        const s = f.size, color = linear(f.color);
        const an = Outfit.anatomy(pack), P = L.P;
        if (f.type === 'ridge' || f.type === 'both') {
            // Down the middle of the back, from the neck to the seat.
            const skin = Props.spineSkin(L);
            for (let k = 0; k < 14; k++) {
                const target = 3.9 - k * 0.27;
                let best = null;
                for (const v of pack._bodyIds) {
                    if (an.member[v * 5] < 0.7 || Math.abs(P[v * 3]) > 0.015 || Math.abs(an.s[v * 5] - target) > 0.12) continue;
                    if (!best || P[v * 3 + 2] < best[2]) best = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
                }
                if (!best) continue;
                const h = (0.025 + 0.02 * Math.sin(k / 13 * Math.PI)) * s;
                m.tube([add(best, [0, 0, 0.006]), add(best, [0, h * 0.4, -h * 0.6]), add(best, [0, h * 0.7, -h])], [0.012 * s, 0.006 * s, 0.001], 6, color, skin);
            }
        }
        if (f.type === 'crest' || f.type === 'both') {
            const head = L.boneIndex('Head'), skin = Props.rigid(head);
            const H = L.crown - L.brow;
            for (let k = 0; k < 6; k++) {
                const a = Math.PI * (0.05 + k * 0.17);
                const y = L.crown - H * 0.1 - Math.pow(k / 5, 1.6) * H * 0.8;
                const at = headPoint(L, Math.min(y, L.crown - 0.008), Math.PI - a + Math.PI, -0.004);
                const p = [0, at.p[1], at.p[2]];
                const out = norm([0, 0.8, -0.6]);
                const h = 0.04 * s * (1 - k * 0.08);
                m.tube([p, add(p, mul(out, h * 0.5)), add(p, mul(out, h))], [0.01 * s, 0.005 * s, 0.001], 6, color, skin);
            }
        }
    }

    function whiskers(m, L, f) {
        const head = L.boneIndex('Head'), skin = Props.rigid(head);
        const len = (f.type === 'long' ? 0.11 : 0.06) * f.size;
        // Three staggered rows of two on each upper lip, each fanned by its own row (upper up, lower down) and
        // column (back ones swept back), with a slight droop, so neighbours spread apart and never cross.
        for (const side of [1, -1]) for (let k = 0; k < 3; k++) for (let c = 0; c < 2; c++) {
            const a = add(L.noseTip, [side * (0.018 + 0.003 * c), -0.011 - k * 0.0055 - c * 0.0027, -0.012 - 0.007 * c]);
            const l = len * (1 - 0.12 * c), b = add(a, [side * l, (1 - k) * 0.016, -l * (0.12 + 0.22 * c)]);
            const mid = add(lerp(a, b, 0.5), [0, -l * 0.05, 0]);
            m.tube([a, mid, b], t => 0.0009 * (1 - t * 0.7), 3, linear(f.color), skin, false);
        }
    }

    /**
     * A grey's eyes: a large glossy lens in each eye's socket, on the almond
     * frame the body's socket was pressed to (RRHumanBody.almondEye), so its
     * edge tucks under the rim. A smooth dome in rings from its middle out to
     * the outline, the two mirrored, so both catch the light alike. Round
     * lenses keep the frame with a round outline.
     */
    function alienEyes(m, built, pack, f) {
        const Body = root.RRHumanBody || require('./HumanBody.js'), A = Body.almondEye;
        const head = built.bones.findIndex(b => b.name === 'Head'), skin = Props.rigid(head), rgb = linear(f.color);
        const half = f.type === 'round' ? out => Math.sqrt(Math.max(0, 1 - out * out)) : A.half;
        const RINGS = 10, AROUND = 40;
        for (const side of [1, -1]) {
            const fr = A.frame(pack, built.shaped, side, f.size);
            const at = (rr, t) => {
                const x = rr * Math.cos(t), y = rr * Math.sin(t) * half(Math.cos(t) * side);
                const h = fr.surf(x, rr * 0.985);
                return [0, 1, 2].map(k => fr.c[k] + fr.U[k] * fr.a * x + fr.V[k] * fr.b * y + fr.F[k] * h);
            };
            const normalAt = (rr, t) => {
                const e = 1e-3, p0 = at(Math.max(0, rr - e), t), p1 = at(Math.min(1, rr + e), t), q0 = at(Math.max(rr, 0.02), t - e), q1 = at(Math.max(rr, 0.02), t + e);
                let n = norm(cross(sub(p1, p0), sub(q1, q0)));
                if (n[0] * fr.F[0] + n[1] * fr.F[1] + n[2] * fr.F[2] < 0) n = mul(n, -1);
                return n;
            };
            const mid = m.vertex(at(0, 0), fr.F, rgb, skin), rings = [];
            for (let k = 1; k <= RINGS; k++) {
                const rr = k / RINGS, row = [];
                for (let j = 0; j < AROUND; j++) { const t = (j / AROUND) * Math.PI * 2; row.push(m.vertex(at(rr, t), normalAt(rr, t), rgb, skin)); }
                rings.push(row);
            }
            // Wound to face forward on both sides.
            const tri = (p, q, r) => (side > 0 ? m.tri(p, q, r) : m.tri(p, r, q));
            for (let j = 0; j < AROUND; j++) tri(mid, rings[0][j], rings[0][(j + 1) % AROUND]);
            for (let k = 0; k + 1 < RINGS; k++) for (let j = 0; j < AROUND; j++) {
                const a0 = rings[k][j], a1 = rings[k][(j + 1) % AROUND], b0 = rings[k + 1][j], b1 = rings[k + 1][(j + 1) % AROUND];
                tri(a0, b0, b1); tri(a0, b1, a1);
            }
        }
    }

    /**
     * Feature parts on a built body, and the bones they bring (a tail's
     * chain). `options.coat` ({ length, color, budget }) is the fur furred
     * features grow (animal ears, a cat's, a bushy, a puff or a monkey's
     * tail); without it they stay bare. Fur comes back as roots (`fur`: one
     * group per feature, with the body vertex it rides on) for the caller
     * to lay as tufts on the body fur's picture.
     */
    function antennae(m, L, f, onInsectHead) {
        const skin = Props.rigid(L.boneIndex('Head')), ring = L.ring(L.brow, 0.025);
        for (const side of [-1, 1]) {
            if (f.type === 'andorian') {
                // Fleshy stalks grow from the actual upper forehead, with flared sensory cups.
                const target = [L.noseTip[0] + side * (ring?.rx || 0.07) * 0.64, L.crown - 0.018, (ring?.center[2] || 0) + (ring?.rz || 0.08) * 0.55];
                // On the forehead's front at that height and spacing (the skin's foremost point there): the nearest
                // skin to a point placed off the brow's ring fell well down a forehead that slopes back (a broad male
                // face, a large head), leaving the stalks short of the scalp's top.
                let base = target, best = Infinity, front = -Infinity;
                for (const v of L.headIds) {
                    const p = Array.from(L.P.subarray(v * 3, v * 3 + 3)), d = Math.hypot(...sub(p, target));
                    if (d < best) { best = d; if (front === -Infinity) base = p; }
                    if (Math.abs(p[0] - target[0]) < 0.008 && Math.abs(p[1] - target[1]) < 0.005 && p[2] > front) { front = p[2]; base = p; }
                }
                base = add(base, [0, -0.005 * f.size, -0.002 * f.size]);
                const pts = Array.from({ length: 18 }, (_, i) => { const t = i / 17; return add(base, [side * 0.012 * t * t * f.size, 0.068 * t * f.size, (0.018 * t + 0.008 * t * t) * f.size]); });
                const color = linear(f.color), tip = pts[pts.length - 1];
                m.tube(pts, t => (0.0065 - 0.002 * Math.sin(Math.PI * t) + 0.001 * t) * f.size, 14, color, skin);
                m.loft(7, (i, t) => {
                    const radius = (0.0075 + 0.003 * Math.sin(t * Math.PI * 0.8)) * f.size;
                    return { center: add(tip, [0, t * 0.008 * f.size, 0]), x: [1, 0, 0], y: [0, 0, 1], rx: radius, ry: radius };
                }, 16, color, skin, false);
                m.sphere(add(tip, [0, 0.005 * f.size, 0]), 0.007 * f.size, linear(f.color2), skin, 6, 16, [1, 0.25, 1]);
                continue;
            }
            // On an insect head they rise from its brow, between the compound eyes.
            const base = onInsectHead ? onInsectHead(side) : [L.noseTip[0] + side * (ring?.rx || 0.07) * 0.6, L.crown - 0.025, ring?.center[2] || 0];
            // A stout base segment in a socket, a small knuckle, then the long whip: smooth, tapering, faintly
            // ringed, rising in one gentle curve up, out and back.
            const z = f.size, col = linear(f.color), joint = mixRgb(col, [0.02, 0.02, 0.02], 0.35);
            m.sphere(base, 0.0062 * z, joint, skin, 6, 12);
            const knee = add(base, [side * 0.006 * z, 0.02 * z, 0.006 * z]);
            m.tube([base, lerp(base, knee, 0.5), knee], [0.0052 * z, 0.0047 * z, 0.004 * z], 10, col, skin);
            m.sphere(knee, 0.0043 * z, joint, skin, 6, 10);
            const c1 = add(knee, [side * 0.03 * z, 0.09 * z, 0.012 * z]), c2 = add(knee, [side * 0.075 * z, 0.16 * z, -0.03 * z]), end = add(knee, [side * 0.1 * z, 0.19 * z, -0.075 * z]);
            const pts = Array.from({ length: 28 }, (_, i) => { const t = i / 27, u = 1 - t; return [0, 1, 2].map(q => u * u * u * knee[q] + 3 * u * u * t * c1[q] + 3 * u * t * t * c2[q] + t * t * t * end[q]); });
            m.tube(pts, t => (0.0034 * (1 - t) ** 0.8 + 0.0007) * z * (1 - 0.1 * Math.max(0, Math.cos(t * 27 * Math.PI)) ** 6), 9, col, skin);
            if (f.type === 'moth') for (let i = 2; i < 26; i += 2) for (const dir of [-1, 1]) m.tube([pts[i], add(pts[i], [dir * 0.026 * Math.sin(i / 27 * Math.PI) * z, 0.01 * z, 0])], [0.0018 * z, 0.0004], 5, linear(f.color2), skin);
        }
    }

    function fangs(m, L, f, pack) {
        const skin = Props.rigid(L.boneIndex('Head')), span = Math.abs(L.eyeL.center[0] - L.eyeR.center[0]);
        for (const side of [-1, 1]) {
            const fields=(root.RRCharacterSkin||require('./CharacterSkin.js')).fieldsOf(pack),x=L.mouth[0]+side*span*.22;
            // At the top of the upper lip's outer face over that point, wherever the lip lies: the lips closed at
            // rest (RRHumanBody.closeLips) bring the upper lip down below the teeth's middle on some faces, so a
            // fixed height from the teeth found no lip and left the fang inside the mouth.
            const d=v=>(L.P[v*3]-x)**2+(L.P[v*3+1]-L.mouth[1]-.003)**2;
            const near=L.headIds.filter(v=>fields.lips[v]>.15&&Math.abs(L.P[v*3]-x)<.008);
            const lipFront=near.length?Math.max(...near.map(v=>L.P[v*3+2])):-Infinity,outer=near.filter(v=>L.P[v*3+2]>lipFront-.006);
            const lipTop=outer.length?Math.max(...outer.map(v=>L.P[v*3+1])):-Infinity;
            const lip=outer.filter(v=>L.P[v*3+1]>Math.min(L.mouth[1],lipTop)-.002).sort((a,b)=>d(a)-d(b)).slice(0,3);
            const base=lip.length?[0,1,2].map(k=>lip.reduce((n,v)=>n+L.P[v*3+k],0)/lip.length):[x,L.mouth[1]+.003,L.mouth[2]];
            // Its root buried in the lip's body, a little under the lip's top edge and behind its front, so the
            // root's cap does not show through the skin above the lip as a separate white point.
            base[1]-=.003;base[2]-=.003;
            // As far down as before (the root lowered, the fang shortened by as much): the tip where it was.
            const length = (f.type === 'long' ? 0.027 : 0.014) * f.size - 0.0045 * f.size;
            m.tube([base, add(base, [side * 0.0007, -length * 0.55, 0.0005]), add(base, [0, -length, -0.001])], [0.0028 * f.size, 0.0017 * f.size, 0.00012], 12, linear(f.color), skin);
        }
    }

    /** A second articulated arm pair, rooted below the first at the thorax. */
    /**
     * A mantis's grasping arms, held folded before the chest as one does at
     * rest, riding the chest (no bones of their own, so the person's arms
     * swing free past them): from the side of the ribs a short base forward,
     * a stout spined upper limb rising to the elbow, the lower one folded back
     * down along it, spined on its inner edge, ending in a hooked claw.
     */
    function raptorialArms(L, f) {
        const shell = new Props.Mesh(), joints = new Props.Mesh(), green = linear(f.color), dark = linear(f.color2);
        const k = f.size * L.height / 1.75, skin = Props.rigid(L.boneIndex('Spine2')), P = L.P;
        const shoulderY = L.bone('LeftArm').head[1], y0 = shoulderY - 0.13 * k;
        // The front of the chest at a height, near the middle.
        const front = y => { let z = -Infinity; for (const v of L.torsoIds) if (Math.abs(P[v * 3 + 1] - y) < 0.02 && Math.abs(P[v * 3]) < 0.1) z = Math.max(z, P[v * 3 + 2]); return isFinite(z) ? z : L.bone('Spine2').head[2] + 0.1; };
        const side = y => { let x = 0; for (const v of L.torsoIds) if (Math.abs(P[v * 3 + 1] - y) < 0.02) x = Math.max(x, Math.abs(P[v * 3])); return x || 0.14; };
        const fz = front(y0), r = 0.024 * k;
        for (const sign of [1, -1]) {
            const root = [sign * side(y0) * 0.82, y0, fz - 0.045 * k];
            const coxa = [sign * 0.11 * k, y0 - 0.06 * k, fz + 0.05 * k];
            const knee = [sign * 0.085 * k, y0 + 0.14 * k, fz + 0.19 * k];
            const fold = [sign * 0.075 * k, y0 - 0.03 * k, fz + 0.12 * k];
            const claw = [sign * 0.06 * k, y0 + 0.025 * k, fz + 0.18 * k];
            shell.tube([root, lerp(root, coxa, 0.5), coxa], [r * 1.25, r * 1.2, r * 1.0], 12, green, skin);
            joints.sphere(coxa, r * 0.95, dark, skin);
            shell.tube([coxa, lerp(coxa, knee, 0.3), lerp(coxa, knee, 0.75), knee], [r * 0.95, r * 1.4, r * 1.15, r * 0.7], 14, green, skin);
            joints.sphere(knee, r * 0.7, dark, skin);
            // Spines down the upper limb's inner edge, facing the lower one folded against it.
            const along = norm(sub(knee, coxa)), inward = norm(sub(fold, lerp(coxa, knee, 0.6)));
            for (let q = 0; q < 7; q++) {
                const at = add(lerp(coxa, knee, 0.2 + q * 0.11), mul(inward, r * 1.0));
                shell.tube([at, add(at, add(mul(inward, r * (0.7 + 0.45 * (q % 2))), mul(along, -r * 0.3)))], [r * 0.24, r * 0.02], 6, dark, skin);
            }
            shell.tube([knee, lerp(knee, fold, 0.5), fold], [r * 0.68, r * 0.62, r * 0.48], 12, green, skin);
            const back = norm(sub(lerp(coxa, knee, 0.5), lerp(knee, fold, 0.5)));
            for (let q = 0; q < 4; q++) {
                const at = add(lerp(knee, fold, 0.25 + q * 0.18), mul(back, r * 0.5));
                shell.tube([at, add(at, mul(back, r * 0.6))], [r * 0.17, r * 0.02], 6, dark, skin);
            }
            shell.tube([fold, add(lerp(fold, claw, 0.5), mul(back, -r * 0.3)), claw], [r * 0.45, r * 0.3, r * 0.03], 8, dark, skin);
        }
        return [shell.part('Secondary arms', { roughness: 0.42, kind: 'skin' }), joints.part('Secondary arm joints', { roughness: 0.55, kind: 'skin' })];
    }

    function insectArms(L, f, bones, boneBase) {
        if (f.type === 'mantis') return raptorialArms(L, f);
        const shell = new Props.Mesh(), joints = new Props.Mesh(), green = linear(f.color), dark = linear(f.color2);
        const scale = f.size, height = L.height, torso = L.boneIndex('Spine2');
        for (const side of ['Left', 'Right']) {
            const sign = side === 'Left' ? 1 : -1, origin = L.bone(side + 'Arm').head;
            const anchor = [origin[0] * 0.94, origin[1] - height * 0.105, origin[2] + height * 0.006];
            // Stagger the lower pair slightly forward. Full-length arms in the
            // same plane put the lower hands through the upper elbows in climbs.
            const c = Math.cos(0.22), s = Math.sin(0.22);
            const transform = p => {
                const d = sub(p, origin);
                return add(anchor, mul([d[0] * c - sign * d[2] * s, d[1], sign * d[0] * s + d[2] * c], scale));
            };
            const ids = {};
            for (const name of ['Shoulder', 'Arm', 'ForeArm', 'Hand']) {
                const source = L.bone(side + name), i = boneBase + bones.length;
                ids[name] = i;
                bones.push({ name: side + 'Secondary' + name, motionSource: side + name,
                    parent: name === 'Shoulder' ? torso : ids[name === 'Arm' ? 'Shoulder' : name === 'ForeArm' ? 'Arm' : 'ForeArm'],
                    head: transform(source.head), tail: transform(source.tail) });
            }
            const shoulder = anchor, elbow = transform(L.bone(side + 'ForeArm').head), wrist = transform(L.bone(side + 'Hand').head);
            const hand = transform(L.bone(side + 'Hand').tail), r = height * 0.020 * Math.sqrt(f.size);
            const root = add(shoulder, [-sign * r * 2.2, 0, -r * 0.3]);
            const skinRoot = p => { const w = Math.max(0, Math.min(1, Math.abs(p[0] - root[0]) / (r * 2.4))); return { joints: [torso, ids.Arm, 0, 0], weights: [1 - w, w, 0, 0] }; };
            shell.tube([root, shoulder, lerp(shoulder, elbow, 0.45), elbow], [r * 1.25, r * 1.3, r, r * 0.65], 14, green, skinRoot);
            joints.sphere(elbow, r * 0.82, dark, Props.rigid(ids.ForeArm));
            shell.tube([elbow, lerp(elbow, wrist, 0.45), wrist], [r * 0.7, r * 1.05, r * 0.5], 14, green, Props.rigid(ids.ForeArm));
            joints.sphere(wrist, r * 0.6, dark, Props.rigid(ids.Hand));
            shell.tube([wrist, hand], [r * 0.55, r * 0.7], 12, green, Props.rigid(ids.Hand));
            for (let digit = -1; digit <= 1; digit++) {
                const start = add(hand, [0, digit * r * 0.8, 0]);
                const tip = add(start, [sign * r * 1.4, -r * 0.8, r * (1.2 - Math.abs(digit) * 0.3)]);
                shell.tube([start, lerp(start, tip, 0.6), tip], [r * 0.22, r * 0.18, r * 0.06], 8, green, Props.rigid(ids.Hand));
            }
        }
        return [shell.part('Secondary arms', { roughness: 0.48, kind: 'skin' }), joints.part('Secondary arm joints', { roughness: 0.65, kind: 'skin' })];
    }

    /** Secondary chains keep the source chain's local turns in preview and saved clips. */
    function followMotion(bones, clip) {
        if (!clip) return clip;
        const tracks = clip.tracks.slice(), names = new Map(bones.map((b, i) => [b.name, i]));
        bones.forEach((b, i) => {
            if (!b.motionSource || tracks.some(t => t.bone === i)) return;
            const source = names.get(b.motionSource);
            for (const track of clip.tracks) if (track.bone === source && (!track.path || track.path === 'rotation')) tracks.push({ ...track, bone: i });
        });
        // A tail the clip leaves still sways with it, a wave running down it once over the clip, and lifts a little
        // on each step; the idle brings its own sway.
        const times = clip.times;
        if (times && times.length > 1 && !tracks.some(t => /^Tail\d*$/.test(bones[t.bone]?.name || ''))) {
            const span = times[times.length - 1] - times[0] || 1;
            bones.forEach((b, i) => {
                if (!/^Tail\d*$/.test(b.name)) return;
                const k = b.name === 'Tail' ? 1 : +b.name.slice(4), values = new Float32Array(times.length * 4);
                for (let q = 0; q < times.length; q++) {
                    const ph = 2 * Math.PI * (times[q] - times[0]) / span, yaw = 0.13 * Math.sin(ph - k * 0.7), lift = 0.035 * Math.sin(2 * ph - k * 0.5);
                    const sy = Math.sin(yaw / 2), sx = Math.sin(lift / 2), cy = Math.cos(yaw / 2), cx = Math.cos(lift / 2);
                    values.set([sx * cy, cx * sy, -sx * sy, cx * cy], q * 4);
                }
                tracks.push({ bone: i, values });
            });
        }
        return { ...clip, tracks };
    }

    /** A clear, fitted cranial shell with electronics underneath and recessed service panels. */
    function androidParts(pack, built, L, f, body) {
        const Body = root.RRHumanBody || require('./HumanBody.js');
        const metal = new Props.Mesh(), circuit = new Props.Mesh(), brain = new Props.Mesh();
        const headSkin = Props.rigid(L.boneIndex('Head')), dark = linear(f.color), cyan = linear(f.color2), silver = linear('#aeb9c7');
        const cut = L.eyeY + (L.crown - L.eyeY) * 0.48, surface = built.parts[0], keep = [], clear = [];
        const ears = Body.earMask(pack), source = pack.body.source;
        for (let t = 0; t < body.index.length; t += 3) {
            const ids = [body.index[t], body.index[t + 1], body.index[t + 2]];
            (ids.every(i => surface.positions[i * 3 + 1] > cut && ears[source[i]] < 0.15) ? clear : keep).push(...ids);
        }
        body.index = Uint32Array.from(keep);
        const parts = [{ ...surface, name: 'Transparent cranial shell', index: Uint32Array.from(clear), texture: null,
            color: '#a0dce8', colors: null, opacity: 0.2, roughness: 0.12, metalness: 0.05, kind: 'glass', doubleSided: true, noShade: true }];
        const ring = L.ring(cut + 0.006), rx = ring.rx * 0.83, rz = ring.rz * 0.82;
        const center = [0, cut + (L.crown - cut) * 0.22, ring.center[2]];
        const ry = (L.crown - cut) * 0.57;
        brain.sphere(center, 1, linear('#182a32'), headSkin, 16, 32, [rx, ry, rz]);
        // PCB traces sit on an ellipsoidal processor housing, with small gold terminal pads.
        const at = (theta, phi, lift = 0) => [center[0] + (rx + lift) * Math.sin(theta) * Math.cos(phi), center[1] + (ry + lift) * Math.cos(theta), center[2] + (rz + lift) * Math.sin(theta) * Math.sin(phi)];
        for (let row = 0; row < 7; row++) {
            const theta = 0.35 + row * 0.28;
            const path = Array.from({ length: 49 }, (_, k) => at(theta + ((Math.floor(k / 4) % 2) ? 0.045 : 0), k / 48 * Math.PI * 2, 0.001));
            circuit.tube(path, path.map(() => 0.00065), 5, cyan, headSkin, false);
            for (let k = 0; k < 8; k++) metal.sphere(at(theta, k / 8 * Math.PI * 2, 0.0015), 0.0015, linear('#d7b85e'), headSkin, 4, 6);
        }
        for (let k = 0; k < 8; k++) {
            const phi = k / 8 * Math.PI * 2;
            const path = Array.from({ length: 17 }, (_, j) => at(0.25 + j / 16 * 2, phi, 0.002));
            metal.tube(path, path.map(() => 0.001), 6, silver, headSkin, false);
        }
        // The rim follows the exact opaque/clear boundary, rather than a generic head radius.
        const edgeCounts = new Map();
        for (let t = 0; t < clear.length; t += 3) for (let k = 0; k < 3; k++) {
            const a = clear[t + k], b = clear[t + (k + 1) % 3], key = [source[a], source[b]].sort((a, b) => a - b).join(':');
            const e = edgeCounts.get(key) || { a, b, count: 0 }; e.count++; edgeCounts.set(key, e);
        }
        for (const e of edgeCounts.values()) if (e.count === 1) {
            // Fair the shared material boundary to a level cranial rim. Both skins
            // keep the same source vertices and weights, including UV duplicates.
            const sources = new Set([source[e.a], source[e.b]]);
            if (body.positions === surface.positions) body.positions = Float32Array.from(body.positions);
            if (parts[0].positions === surface.positions) parts[0].positions = Float32Array.from(surface.positions);
            for (let i = 0; i < source.length; i++) if (sources.has(source[i])) {
                body.positions[i * 3 + 1] = cut;
                parts[0].positions[i * 3 + 1] = cut;
            }
            const a = Array.from(surface.positions.subarray(e.a * 3, e.a * 3 + 3)), b = Array.from(surface.positions.subarray(e.b * 3, e.b * 3 + 3));
            a[1] = b[1] = cut;
            metal.tube([a, b], [0.0016, 0.0016], 6, silver, headSkin);
        }
        // Cut actual apertures out of the skin. Their backplates, chips and
        // mechanisms sit below its original surface; only a hairline rim is proud.
        const recessed = new Props.Mesh(), walls = new Props.Mesh(), bindings = [];
        const point = i => Array.from(body.positions.subarray(i * 3, i * 3 + 3));
        const skinAt = i => ({ joints: Array.from(body.joints.subarray(i * 4, i * 4 + 4)), weights: Array.from(body.weights.subarray(i * 4, i * 4 + 4)) });
        const panel = (center, up, halfWidth, halfLength, depth, accepts) => {
            const xAxis = norm(cross(up, [0, 0, 1])), yAxis = norm(up), normal = [0, 0, 1];
            const coords = p => [dot(sub(p, center), xAxis), dot(sub(p, center), yAxis)];
            const selected = [], retained = [];
            for (let t = 0; t < body.index.length; t += 3) {
                const ids = Array.from(body.index.subarray(t, t + 3)), ps = ids.map(point);
                const c = mul(ps.reduce(add, [0, 0, 0]), 1 / 3), [x, y] = coords(c);
                const n = norm(cross(sub(ps[1], ps[0]), sub(ps[2], ps[0])));
                const inside = (x / halfWidth) ** 4 + (y / halfLength) ** 4 < 1 && n[2] > 0.45 && accepts(ids, c);
                (inside ? selected : retained).push(...ids);
            }
            if (selected.length < 6) return;
            body.index = Uint32Array.from(retained);
            const edges = new Map(), inset = new Map(), faces = [];
            for (let t = 0; t < selected.length; t += 3) {
                const ids = selected.slice(t, t + 3); faces.push(ids);
                for (let k = 0; k < 3; k++) {
                    const a = ids[k], b = ids[(k + 1) % 3], key = [source[a], source[b]].sort((a, b) => a - b).join(':');
                    const e = edges.get(key) || { a, b, n: 0 }; e.n++; edges.set(key, e);
                }
            }
            // Fair the shared aperture boundary into a rounded rectangle. The
            // surrounding skin uses exactly the same adjusted vertices/weights.
            const boundary = new Set([...edges.values()].filter(e => e.n === 1).flatMap(e => [e.a, e.b]));
            const moved = new Map();
            for (const i of boundary) {
                const p = point(i), [x, y] = coords(p), radius = ((x / halfWidth) ** 8 + (y / halfLength) ** 8) ** (1 / 8);
                if (radius < 1e-5) continue;
                const target = add(p, add(mul(xAxis, x / radius - x), mul(yAxis, y / radius - y)));
                moved.set(source[i], target);
            }
            if (body.positions === surface.positions) body.positions = Float32Array.from(body.positions);
            for (let i = 0; i < source.length; i++) if (moved.has(source[i])) body.positions.set(moved.get(source[i]), i * 3);
            for (const i of new Set(selected)) {
                const p = sub(point(i), mul(normal, depth));
                const v = recessed.vertex(p, Array.from(body.normals.subarray(i * 3, i * 3 + 3)), linear('#304853'), skinAt(i));
                bindings[v] = source[i]; inset.set(i, { p, v });
            }
            for (const ids of faces) recessed.tri(...ids.map(i => inset.get(i).v));
            for (const { a, b, n } of edges.values()) if (n === 1) {
                const pa = point(a), pb = point(b), ia = inset.get(a).p, ib = inset.get(b).p;
                const inward = norm(cross(sub(pb, pa), mul(normal, -1)));
                const ids = [[pa, a], [pb, b], [ib, b], [ia, a]].map(([p, i]) => walls.vertex(p, inward, silver, skinAt(i)));
                walls.tri(ids[0], ids[1], ids[2]); walls.tri(ids[0], ids[2], ids[3]);
                const skin = p => {
                    const d = sub(pb, pa), t = Math.max(0, Math.min(1, dot(sub(p, pa), d) / Math.max(1e-12, dot(d, d))));
                    return skinAt(t < 0.5 ? a : b);
                };
                metal.tube([pa, pb], [0.00055, 0.00055], 5, silver, skin);
            }
            // Project onto the cut patch rather than placing a flat board on top
            // of the curved body. Omit any route whose footprint leaves the opening.
            const locate = (u, v, lift = 0.001) => {
                const x = u * halfWidth, y = v * halfLength;
                for (const ids of faces) {
                    const q = ids.map(i => coords(point(i))), [a, b, c] = q;
                    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
                    if (Math.abs(d) < 1e-12) continue;
                    const w = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d;
                    const z = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d;
                    if (w < 0 || z < 0 || w + z > 1) continue;
                    const p = add(add(mul(inset.get(ids[0]).p, w), mul(inset.get(ids[1]).p, z)), mul(inset.get(ids[2]).p, 1 - w - z));
                    return { p: add(p, mul(normal, lift)), skin: skinAt(ids[[w, z, 1 - w - z].indexOf(Math.max(w, z, 1 - w - z))]) };
                }
                return null;
            };
            for (const u of [-0.42, 0.42]) for (const v of [-0.5, 0, 0.5]) {
                const q = locate(u, v, 0.0012), hw = Math.min(0.005, halfWidth * 0.15), hh = Math.min(0.007, halfLength * 0.12);
                if (!q || ![[-hw, -hh], [hw, hh], [-hw, hh], [hw, -hh]].every(([x, y]) => locate(u + x / halfWidth, v + y / halfLength))) continue;
                metal.box(q.p, [xAxis, yAxis, normal], [hw, hh, 0.0007], dark, q.skin);
                for (const sign of [-1, 1]) for (let pin = -2; pin <= 2; pin++) {
                    const p = add(q.p, add(mul(xAxis, sign * (hw + 0.0007)), mul(yAxis, pin * hh * 0.32)));
                    metal.box(p, [xAxis, yAxis, normal], [0.0007, 0.0003, 0.0003], linear('#c9ad62'), q.skin);
                }
            }
            for (const sign of [-1, 1]) for (let rail = 0; rail < 3; rail++) {
                const u = sign * (0.18 + rail * 0.23);
                const route = [[u, -0.75], [u, -0.28], [u + sign * 0.08, -0.18], [u + sign * 0.08, 0.73]].map(([x, y]) => locate(x, y, 0.001));
                if (route.some(q => !q)) continue;
                circuit.tube(route.map(q => q.p), route.map(() => 0.00045), 5, cyan, route[1].skin);
            }
            for (const sign of [-1, 1]) {
                const path = [-0.66, -0.3, 0.15, 0.62].map(v => locate(sign * 0.76, v, 0.0025));
                if (path.some(q => !q)) continue;
                metal.tube(path.map(q => q.p), [0.0018, 0.0018, 0.0011, 0.0011], 8, silver, path[1].skin);
                for (const end of [path[0], path.at(-1)]) metal.sphere(end.p, 0.0024, dark, end.skin, 5, 8);
            }
            const q = locate(0, 0.25, 0.002);
            if (q) {
                const radius = Math.min(halfWidth * 0.22, 0.009), ring = Array.from({ length: 25 }, (_, k) => add(q.p, add(mul(xAxis, radius * Math.cos(k / 24 * Math.PI * 2)), mul(yAxis, radius * Math.sin(k / 24 * Math.PI * 2)))));
                metal.tube(ring, ring.map(() => 0.0008), 6, silver, q.skin, false);
                metal.disk(q.p, normal, radius * 0.7, dark, q.skin, 20);
                circuit.disk(add(q.p, [0, 0, 0.0003]), normal, radius * 0.24, cyan, q.skin, 12);
            }
        };
        const torsoIds = new Set(L.torsoIds), cy = lerp(L.bone('Spine2').head, L.bone('Neck').head, 0.42);
        panel(cy, [0, 1, 0], L.height * 0.046, L.height * 0.043, L.height * 0.009, ids => ids.every(i => torsoIds.has(source[i])));
        for (const side of ['Left', 'Right']) for (const name of ['ForeArm', 'Leg']) {
            const bone = L.bone(side + name), index = L.boneIndex(side + name);
            panel(lerp(bone.head, bone.tail, 0.48), sub(bone.head, bone.tail), L.height * (name === 'Leg' ? 0.014 : 0.011), Math.hypot(...sub(bone.tail, bone.head)) * 0.27, L.height * 0.005,
                ids => ids.every(i => skinAt(i).joints.some((j, k) => j === index && skinAt(i).weights[k] > 0.45)));
        }
        if (!recessed.empty) parts.push(recessed.part('Recessed android panels', { source: Int32Array.from(bindings), metalness: 0.35, roughness: 0.48, kind: 'metal' }));
        if (!walls.empty) parts.push(walls.part('Android panel reveals', { metalness: 0.75, roughness: 0.32, doubleSided: true, kind: 'metal' }));
        parts.push(brain.part('Circuit brain', { metalness: 0.35, roughness: 0.4, kind: 'metal' }), metal.part('Android mechanisms', { metalness: 0.8, roughness: 0.28, kind: 'metal' }),
            circuit.part('Android circuitry', { metalness: 0.2, roughness: 0.35, kind: 'feature', emissive: f.color2, emissiveIntensity: 0.35 }));
        const cap = parts[0], used = [...new Set(cap.index)], lookup = new Map(used.map((v, i) => [v, i]));
        for (const field of ['positions', 'normals']) cap[field] = Body.gather(cap[field], used, 3);
        for (const field of ['joints', 'weights']) cap[field] = Body.gather(cap[field], used, 4);
        cap.source = Int32Array.from(used, i => source[i]);
        cap.uvs = null;
        cap.index = Uint32Array.from(cap.index, i => lookup.get(i));
        // A closed helmet can hide the whole clear cap before machinery is built.
        return parts.filter(part => part.index.length > 0);
    }

    /**
     * A mantis-like head in place of the person's (RRCharacterModel leaves
     * theirs out above the chin): a flat shell broad across the brow and
     * narrowing to the mouth in a rounded triangle at every body size; the
     * compound eyes bulging caps of it at its upper corners, their edge sunk
     * into the shell under a rim so nothing of them shows behind, finely
     * faceted (RRCharacterSpecies.compoundEyeTexture), a soft dark false
     * pupil toward the front; three small simple eyes between them, the
     * mandibles and jointed palps under the mouth. Below it a thin neck link
     * from a collar plate over the top of the person's neck. Returns where
     * the antennae rise.
     */
    function insectHead(m, lenses, L, f, pack, o) {
        const headBone = L.boneIndex('Head'), neckBone = L.boneIndex('Neck'), skin = Props.rigid(headBone), s = f.size;
        const shell = linear(f.color), eye = linear(f.color2), dark = mixRgb(shell, [0.03, 0.03, 0.02], 0.6), pale = mixRgb(shell, [0.85, 0.85, 0.6], 0.25);
        const er = L.ring(L.eyeY, 0.015) || { center: [0, L.eyeY, 0], rx: 0.075, rz: 0.09 };
        const RX = er.rx, cz = er.center[2], frontZ = Math.max(L.noseTip[2] + 0.008, cz + er.rz * 0.9);
        // The head's own scale: a person's head width, within reason; a hood's shrouded head a little smaller.
        const hs = s * Math.min(1.2, Math.max(0.85, RX / 0.053)) * (o && o.hooded ? 0.86 : 1);
        const yTop = L.crown - 0.022 * s, yBot = L.chin - 0.004, H = yTop - yBot;
        const sm = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
        const roundW = t => (t > 0.9 ? Math.sqrt(Math.max(0.05, 1 - ((t - 0.9) / 0.1) ** 2)) : 1) * (t < 0.08 ? Math.sqrt(Math.max(0.12, 1 - ((0.08 - t) / 0.08) ** 2)) : 1);
        const roundD = t => (t > 0.82 ? Math.sqrt(Math.max(0.02, 1 - ((t - 0.82) / 0.18) ** 2)) : 1) * (t < 0.08 ? Math.sqrt(Math.max(0.12, 1 - ((0.08 - t) / 0.08) ** 2)) : 1);
        // Narrow at the mouth, a broad brow across the eyes; flat front to back.
        const W = 0.069 * hs, D = Math.min(0.06, Math.max(0.042, (frontZ - cz) * 0.6)) * hs / s * s;
        const halfW = t => W * (0.36 + 0.64 * sm(0.02, 0.84, t)) * roundW(t);
        const halfD = t => D * (0.72 + 0.28 * sm(0, 0.5, t)) * roundD(t);
        const midZ = t => cz + 0.012 * s + 0.006 * (1 - t);
        const at = t => yBot + H * t;
        m.loft(26, (i, t) => ({ center: [0, at(t), midZ(t)], x: [1, 0, 0], y: [0, 0, 1], rx: halfW(t), ry: halfD(t) }), 44, (t, a) => mixRgb(shell, pale, Math.max(0, Math.sin(a)) ** 3 * (1 - t) * 0.6), skin, true);
        // How far inside the shell a point lies (under 1 inside).
        const inside = p => { const t = (p[1] - yBot) / H; if (t <= 0 || t >= 1) return 9; return (p[0] / halfW(t)) ** 2 + ((p[2] - midZ(t)) / halfD(t)) ** 2; };
        // The compound eyes: the shell itself bulging out at its upper corners in a dome, so each eye's edge runs
        // into the shell under a low rim and nothing of it lies inside or shows behind. Built for the left and
        // mirrored, so the facet picture and the false pupil sit alike on both.
        const shellAt = (t, a) => [halfW(t) * Math.cos(a), at(t), midZ(t) + halfD(t) * Math.sin(a)];
        const shellNormal = (t, a) => { const e = 1e-3, pt = sub(shellAt(t + e, a), shellAt(t - e, a)), pa = sub(shellAt(t, a + e), shellAt(t, a - e)); let n = norm(cross(pa, pt)); if (dot(n, [Math.cos(a), 0, Math.sin(a)]) < 0) n = mul(n, -1); return n; };
        const hooded = !!(o && o.hooded), te = 0.75, ae = hooded ? 0.45 : 0.22, dt = 0.165, da = 0.78, bulge = 0.04 * hs;
        const RINGS = 16, AROUND = 40;
        const eyeAt = (d, ph) => {
            const t = te + dt * d * Math.sin(ph), a = ae + da * d * Math.cos(ph), h = bulge * Math.pow(Math.max(0, 1 - d * d), 0.55) + 0.0012;
            return add(shellAt(t, a), mul(shellNormal(t, a), h));
        };
        // The false pupil: the dark spot where the facets look straight back at you, soft-edged, toward the front.
        const front = norm([0, -0.05, 1]);
        const eyeParts = { p: [], n: [], c: [], uv: [], i: [], j: [], w: [] };
        for (const side of [1, -1]) {
            const base = eyeParts.p.length / 3, grid = [];
            for (let r = 0; r <= RINGS; r++) for (let q = 0; q <= AROUND; q++) grid.push(eyeAt(r / RINGS, q / AROUND * Math.PI * 2));
            const fn = grid.map(() => [0, 0, 0]), tris = [];
            for (let r = 0; r < RINGS; r++) for (let q = 0; q < AROUND; q++) { const a = r * (AROUND + 1) + q, b = a + 1, c = a + AROUND + 1, d = c + 1; tris.push([a, c, b], [b, c, d]); }
            for (const [a, b, c] of tris) { const n = cross(sub(grid[b], grid[a]), sub(grid[c], grid[a])); for (const v of [a, b, c]) fn[v] = add(fn[v], n); }
            // The pole and the seam of the grid share their neighbours' normals.
            for (let r = 0; r <= RINGS; r++) { const a = r * (AROUND + 1), b = a + AROUND, n = add(fn[a], fn[b]); fn[a] = n; fn[b] = n; }
            let pole = [0, 0, 0]; for (let q = 0; q <= AROUND; q++) pole = add(pole, fn[q]); for (let q = 0; q <= AROUND; q++) fn[q] = pole;
            const outward = shellNormal(te, ae);
            for (let v = 0; v < grid.length; v++) {
                const r = Math.floor(v / (AROUND + 1)), q = v % (AROUND + 1), d = r / RINGS, ph = q / AROUND * Math.PI * 2;
                // The dome's own normal there, from its shape (not the faces' winding), facing out as the shell does
                // where it lies: summed face normals turned inward on the eye's inner flank and showed there as a
                // black, mirror-bright crescent.
                const local = shellNormal(te + dt * d * Math.sin(ph), ae + da * d * Math.cos(ph));
                let n;
                if (d < 0.02) n = norm(fn[v]);
                else {
                    const e = 1e-3, pd = sub(eyeAt(Math.min(1, d + e), ph), eyeAt(Math.max(0, d - e), ph)), pp = sub(eyeAt(d, ph + e), eyeAt(d, ph - e));
                    n = norm(cross(pd, pp));
                }
                if (dot(n, local) < 0) n = mul(n, -1);
                const spot = sm(0.95, 0.997, Math.max(0, dot(n, front)));
                const col = mixRgb(eye, mixRgb(eye, [0.02, 0.03, 0.02], 0.85), spot * 0.4).map(c2 => c2 * (0.8 + 0.2 * (1 - d * d)));
                eyeParts.p.push(grid[v][0] * side, grid[v][1], grid[v][2]); eyeParts.n.push(n[0] * side, n[1], n[2]); eyeParts.c.push(...col);
                eyeParts.uv.push(0.5 + 0.47 * d * Math.cos(ph), 0.5 + 0.47 * d * Math.sin(ph) * (dt * H) / (da * halfW(te)));
                eyeParts.j.push(headBone, 0, 0, 0); eyeParts.w.push(1, 0, 0, 0);
            }
            for (const [a, b, c] of tris) if (side > 0) eyeParts.i.push(base + a, base + c, base + b); else eyeParts.i.push(base + a, base + b, base + c);
            // The rim where the eye meets the shell: a low ridge round it.
            const rim = Array.from({ length: AROUND + 1 }, (_, q) => { const p = eyeAt(1, q / AROUND * Math.PI * 2); return [p[0] * side, p[1], p[2]]; });
            m.tube(rim, 0.0024 * hs, 6, mixRgb(shell, dark, 0.35), skin, false);
        }
        lenses.eyes = { name: 'Insect eyes', positions: Float32Array.from(eyeParts.p), normals: Float32Array.from(eyeParts.n), colors: Float32Array.from(eyeParts.c), uvs: Float32Array.from(eyeParts.uv),
            index: Uint32Array.from(eyeParts.i), joints: Uint8Array.from(eyeParts.j), weights: Float32Array.from(eyeParts.w), texture: 'insect-eye.png', normalTexture: 'insect-eye-normal.png', normalScale: 0.45,
            keepColors: true, roughness: 0.55, metalness: 0, kind: 'eye', facetSurface: true, envMapIntensity: 0.5 };
        // Three small simple eyes in a little triangle between them.
        const oy = at(0.86), oz = midZ(0.86) + halfD(0.86) * 0.97;
        for (const [x, y] of [[0, 0.011], [0.012, -0.004], [-0.012, -0.004]]) lenses.sphere([x * hs, oy + y * hs, oz], 0.004 * hs, [0.55, 0.45, 0.2], skin, 5, 8, [1, 1, 0.6]);
        // Mandibles meeting under the face, and the palps hanging below them.
        const mz = midZ(0.1) + halfD(0.1) * 0.78, my = at(0.07);
        for (const side of [1, -1]) {
            const a = [side * 0.017 * hs, my + 0.006 * hs, mz - 0.003 * hs], b = [side * 0.019 * hs, my - 0.01 * hs, mz + 0.012 * hs], c = [side * 0.004 * hs, my - 0.017 * hs, mz + 0.017 * hs];
            m.tube([a, b, c], t => (0.009 - 0.0065 * t) * hs, 8, dark, skin);
            const p0 = [side * 0.011 * hs, my, mz + 0.002 * hs], p1 = add(p0, [side * 0.005 * hs, -0.016 * hs, 0.009 * hs]), p2 = add(p1, [-side * 0.002 * hs, -0.014 * hs, 0.002 * hs]);
            m.tube([p0, p1], 0.0028 * hs, 6, pale, skin); m.sphere(p1, 0.0036 * hs, pale, skin, 5, 8); m.tube([p1, p2], 0.0024 * hs, 6, pale, skin);
        }
        // The neck segment: from the person's neck (its head left out there) at its own girth, a little proud of it
        // in a raised rim, up and forward into the underside of the head, narrowing as it goes, a soft groove round
        // it where one ring of the neck meets the next; so neck and head run on in one piece with no shelf between.
        // Fitted to where the person's skin is cut (RRCharacterModel: what follows the head more than half, from the
        // chin up), from the kept skin along that edge, so it closes over the cut on any build.
        const SJ = pack.skinJoints, SW = pack.skinWeights, edge = [];
        for (const v of pack._bodyIds || []) {
            const y = L.P[v * 3 + 1];
            if (y < L.chin - 0.01 || y > L.chin + 0.1) continue;
            let w = 0; for (let k = 0; k < 4; k++) if (SJ[v * 4 + k] === headBone) w += SW[v * 4 + k];
            if (w > 0.2 && w <= 0.5) edge.push(v);
        }
        const neck = L.neck && L.neck.rx ? L.neck : er;
        let nx = neck.rx * 0.9, y0 = L.chin - 0.004, y1 = L.chin, z0 = neck.center[2] - neck.rz, z1 = neck.center[2] + neck.rz;
        for (const v of edge) { nx = Math.max(nx, Math.abs(L.P[v * 3])); y1 = Math.max(y1, L.P[v * 3 + 1]); z0 = Math.min(z0, L.P[v * 3 + 2]); z1 = Math.max(z1, L.P[v * 3 + 2]); }
        nx *= 1.08;
        // As high as the cut runs up a thick neck's back, no higher on a slender one.
        const yTopCut = Math.min(y1, L.chin + 0.022 + Math.max(0, neck.rx - 0.06) * 1.4);
        const pc = [0, (y0 + yTopCut) / 2, (z0 + z1) / 2], pz = (z1 - z0) / 2 * 1.08, py = Math.max(0.018, (yTopCut - y0) / 2 + 0.01);
        // Its foot at the person's own neck just under the cut (not the skin up behind the ears), so it sits on the
        // neck at its girth and never flares into a lip.
        let bx = 0, bz0 = Infinity, bz1 = -Infinity, bcx = 0, bn = 0;
        const band0 = y0 - 0.016, band1 = y0 - 0.004;
        for (const v of pack._bodyIds || []) {
            const y = L.P[v * 3 + 1];
            if (y < band0 || y > band1 || Math.abs(L.P[v * 3 + 2] - neck.center[2]) > 0.12 || Math.abs(L.P[v * 3]) > 0.1) continue;
            // The neck's own skin, not the shoulders rising beside it on a heavy build.
            let nw = 0; for (let k = 0; k < 4; k++) if (SJ[v * 4 + k] === neckBone || SJ[v * 4 + k] === headBone) nw += SW[v * 4 + k];
            if (nw < 0.5) continue;
            bx = Math.max(bx, Math.abs(L.P[v * 3])); bz0 = Math.min(bz0, L.P[v * 3 + 2]); bz1 = Math.max(bz1, L.P[v * 3 + 2]); bcx += L.P[v * 3]; bn++;
        }
        const footX = bn > 8 ? bx * 1.015 : nx / 1.08, footZ = bn > 8 ? (bz1 - bz0) / 2 * 1.015 : pz / 1.08, footC = bn > 8 ? (bz0 + bz1) / 2 : pc[2];
        // Level, under the cut's lowest edge: behind, it rides up over the neck's own skin.
        const lowY = y0 - 0.008, tilt = 0;
        const top = [0, at(0.24), midZ(0.24) - halfD(0.24) * 0.25], from = [0, lowY, footC], bend = [0, lowY + (top[1] - lowY) * 0.55, footC];
        const along = t => [0, from[1] * (1 - t) ** 2 + 2 * bend[1] * t * (1 - t) + top[1] * t * t, from[2] * (1 - t) ** 2 + 2 * bend[2] * t * (1 - t) + top[2] * t * t];
        const segSkin = p => { const w = sm(from[1] + 0.01, top[1] - 0.004, p[1]); return { joints: [neckBone, headBone, 0, 0], weights: [1 - w, w, 0, 0] }; };
        // Two rings of the neck, jointed: the lower at the neck's girth, a soft dark membrane between, the upper
        // narrower, each swelling a little in its middle and its upper edge a low raised lip.
        // The lower ring at the neck's girth all the way up past the cut's highest edge (behind), so no cut skin
        // shows beside it; the joint there; the upper ring narrowing into the head.
        let tg = 0.46; for (let q = 1; q < 100; q++) if (along(q / 100)[1] >= yTopCut + 0.004) { tg = Math.min(0.6, Math.max(0.3, q / 100)); break; }
        const groove = t => Math.exp(-(((t - tg) / 0.045) ** 2)), lip = t => Math.exp(-(((t - (tg - 0.08)) / 0.03) ** 2)) + Math.exp(-(((t - (tg + 0.34 * (1 - tg))) / 0.03) ** 2)) * 0.7;
        const swell = t => t < tg ? Math.sin(Math.PI * t / tg) : Math.sin(Math.PI * (t - tg) / (1 - tg));
        const headX = Math.min(footX * 0.78, halfW(0.24) * 0.7), headZ = Math.min(footZ * 0.8, halfD(0.24) * 0.62);
        // A broad neck (a heavy build) narrows from its foot, not in a step at the joint like a plate.
        const narrowFrom = footX > headX * 1.6 ? 0.08 : tg - 0.02;
        m.loft(30, (i, t) => {
            const e = sm(narrowFrom, 1, t), k = 1 + 0.025 * swell(t) * (1 - groove(t)) + 0.018 * lip(t) - 0.1 * groove(t), tl = tilt * (1 - sm(0, 0.35, t)), ty = norm([0, -tl, 1]);
            return { center: along(t), x: [1, 0, 0], y: ty, rx: (footX * (1 - e) + headX * e) * (t < 0.02 ? 1 : k), ry: (footZ / ty[2] * (1 - e) + headZ * e) * (t < 0.02 ? 1 : k) };
        }, 40, (t, a, pos) => chitinGrain(mixRgb(mixRgb(shell, dark, 0.6 * groove(t) + 0.2 * lip(t)), pale, Math.max(0, Math.sin(a)) ** 3 * 0.3 * (1 - groove(t))), pos), segSkin, false);
        const brow = 0.9;
        // Where the person's neck is cut under the segment (RRCharacterModel).
        // Above the segment's joint, all of the skin that follows the head goes (nothing of it stands beside the neck).
        m.insectCut = { center: [0, pc[1], (footC + pc[2]) / 2], rx: footX * 1.1, rz: footZ * 1.1, top: along(tg)[1] };
        return side => [side * 0.014 * hs, at(brow), midZ(brow) + halfD(brow) * 0.9];
    }

    /** A little uneven tone on chitin by where it lies: broad mottling, finer flecks. */
    function chitinGrain(rgb, p) {
        const h = (x, y, z) => { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return v - Math.floor(v); };
        const n = 0.5 * Math.sin(p[0] * 90 + Math.sin(p[1] * 70) * 2) * Math.sin(p[1] * 85 + p[2] * 60) + (h(Math.round(p[0] * 400), Math.round(p[1] * 400), Math.round(p[2] * 400)) - 0.5) * 0.6;
        return rgb.map(c => c * (1 + 0.07 * n));
    }

    /**
     * A chitin part's picture laid on it (RRCharacterSpecies.chitinShellTexture):
     * each triangle takes the flat projection it faces most, so the tile of
     * fine pits and growth ridges keeps its size everywhere; its own corners,
     * so the picture never smears across a change of projection. `tile` is
     * the picture's span in meters.
     */
    function shellSurface(part, tile) {
        const P = part.positions, N = part.normals, I = part.index, n = I.length;
        const out = { positions: new Float32Array(n * 3), normals: new Float32Array(n * 3), colors: part.colors ? new Float32Array(n * 3) : undefined,
            joints: new Uint8Array(n * 4), weights: new Float32Array(n * 4), uvs: new Float32Array(n * 2), index: new Uint32Array(n) };
        for (let t = 0; t < n; t += 3) {
            const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
            const fn = cross([P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]).map(Math.abs);
            const axis = fn[0] >= fn[1] && fn[0] >= fn[2] ? 0 : fn[1] >= fn[2] ? 1 : 2, [ua, va] = axis === 0 ? [2, 1] : axis === 1 ? [0, 2] : [0, 1];
            for (let k = 0; k < 3; k++) {
                const v = I[t + k], o = t + k;
                for (let q = 0; q < 3; q++) { out.positions[o * 3 + q] = P[v * 3 + q]; out.normals[o * 3 + q] = N[v * 3 + q]; if (out.colors) out.colors[o * 3 + q] = part.colors[v * 3 + q]; }
                for (let q = 0; q < 4; q++) { out.joints[o * 4 + q] = part.joints[v * 4 + q]; out.weights[o * 4 + q] = part.weights[v * 4 + q]; }
                out.uvs[o * 2] = P[v * 3 + ua] / tile; out.uvs[o * 2 + 1] = P[v * 3 + va] / tile; out.index[o] = o;
            }
        }
        return Object.assign(part, out, { texture: 'chitin-shell.png', normalTexture: 'chitin-shell-normal.png', normalScale: 0.6, keepColors: true });
    }

    /** Chitin's surface, tileable: soft mottling and fine pits; and its relief. */
    function chitinShellTexture(size) {
        size = size || 256;
        const hgt = new Float32Array(size * size), tone = new Float32Array(size * size);
        const hash = (i, j, k) => { const x = Math.sin(i * 127.1 + j * 311.7 + k * 17.3) * 43758.5453; return x - Math.floor(x); };
        // Tileable value noise on a grid of `g` cells.
        const vnoise = (x, y, g, k) => {
            const fx = x * g, fy = y * g, i0 = Math.floor(fx), j0 = Math.floor(fy), u = fx - i0, v = fy - j0, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
            const at = (i, j) => hash(((i % g) + g) % g, ((j % g) + g) % g, k);
            return (at(i0, j0) * (1 - su) + at(i0 + 1, j0) * su) * (1 - sv) + (at(i0, j0 + 1) * (1 - su) + at(i0 + 1, j0 + 1) * su) * sv;
        };
        const pits = [];
        const cells = 18;
        for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) for (let q = 0; q < 2; q++) pits.push([(i + hash(i, j, q + 3)) / cells, (j + hash(i, j, q + 7)) / cells, (0.006 + 0.008 * hash(i, j, q + 11))]);
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const u = x / size, v = y / size, o = y * size + x;
            const mott = vnoise(u, v, 4, 1) * 0.6 + vnoise(u, v, 11, 2) * 0.4;
            const ridge = Math.sin((v + 0.05 * vnoise(u, v, 3, 5)) * Math.PI * 2 * 9) * 0.5 + 0.5;
            let pit = 0;
            for (const [px, py, r] of pits) {
                let dx = Math.abs(u - px), dy = Math.abs(v - py); dx = Math.min(dx, 1 - dx); dy = Math.min(dy, 1 - dy);
                const d = Math.hypot(dx, dy) / r; if (d < 1.4) pit = Math.max(pit, Math.exp(-d * d * 2));
            }
            hgt[o] = ridge * 0.02 + mott * 0.45 - pit * 0.9;
            tone[o] = 0.84 + 0.16 * mott - 0.2 * pit;
        }
        const data = new Uint8ClampedArray(size * size * 4), nrm = new Uint8ClampedArray(size * size * 4);
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const o = y * size + x, g = Math.round(255 * Math.min(1, tone[o]));
            data[o * 4] = g; data[o * 4 + 1] = g; data[o * 4 + 2] = g; data[o * 4 + 3] = 255;
            const hx = hgt[y * size + (x + 1) % size] - hgt[y * size + (x + size - 1) % size], hy = hgt[((y + 1) % size) * size + x] - hgt[((y + size - 1) % size) * size + x];
            const dx = -hx * 2.2, dy = -hy * 2.2, l = Math.hypot(dx, dy, 1);
            nrm[o * 4] = Math.round((0.5 + 0.5 * dx / l) * 255); nrm[o * 4 + 1] = Math.round((0.5 + 0.5 * dy / l) * 255); nrm[o * 4 + 2] = Math.round((0.5 + 0.5 / l) * 255); nrm[o * 4 + 3] = 255;
        }
        // Tiled over the parts (the preview repeats it rather than clamping its edges into streaks).
        return { width: size, height: size, data, name: 'chitin-shell.png', repeat: true, normal: { width: size, height: size, data: nrm, name: 'chitin-shell-normal.png', repeat: true } };
    }

    /** The compound eye's picture: fine hexagonal facets, each a little dome, the grooves between them darker; and its relief. */
    function compoundEyeTexture(size) {
        const data = new Uint8ClampedArray(size * size * 4), nrm = new Uint8ClampedArray(size * size * 4);
        const cell = 1 / 64, hx = cell * Math.sqrt(3), hy = cell * 3;
        const hash = (i, j) => { const x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return x - Math.floor(x); };
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const px = (x + 0.5) / size, py = (y + 0.5) / size;
            let d1 = Infinity, d2 = Infinity, c1 = null;
            for (const [ox2, oy2] of [[0, 0], [hx / 2, hy / 2]]) {
                const i0 = Math.round((px - ox2) / hx), j0 = Math.round((py - oy2) / hy);
                for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
                    const cx = ox2 + (i0 + di) * hx, cy = oy2 + (j0 + dj) * hy, d = Math.hypot(px - cx, py - cy);
                    if (d < d1) { d2 = d1; d1 = d; c1 = [cx, cy]; } else if (d < d2) d2 = d;
                }
            }
            const edge = 1 - Math.min(1, (d2 - d1) / (cell * 0.22)), tone = 0.86 + 0.1 * hash(Math.round(c1[0] / cell), Math.round(c1[1] / cell));
            const g = Math.round(255 * tone * (1 - 0.38 * edge * edge)), o = (y * size + x) * 4;
            data[o] = g; data[o + 1] = g; data[o + 2] = g; data[o + 3] = 255;
            // Each facet a shallow dome.
            const k = 0.55 * (1 - edge * 0.5), dx = (px - c1[0]) / cell * k, dy = (py - c1[1]) / cell * k, l = Math.hypot(dx, dy, 1);
            nrm[o] = Math.round((0.5 + 0.5 * dx / l) * 255); nrm[o + 1] = Math.round((0.5 + 0.5 * dy / l) * 255); nrm[o + 2] = Math.round((0.5 + 0.5 / l) * 255); nrm[o + 3] = 255;
        }
        return { width: size, height: size, data, name: 'insect-eye.png', normal: { width: size, height: size, data: nrm, name: 'insect-eye-normal.png' } };
    }

    function build(pack, built, features, landmarks, options) {
        const F = normalizeFeatures(features);
        const L = landmarks || Props.landmarks(pack, built);
        const o = options || {};
        const coat = o.coat ? Object.assign({ length: 1, budget: 1 }, o.coat) : null;
        const hard = new Props.Mesh(), soft = new Props.Mesh();
        const bones = [], fur = [], extra = [];
        const insect = new Props.Mesh(), insectEyes = new Props.Mesh();
        const insectBrow = F.insectHead.type !== 'none' ? insectHead(insect, insectEyes, L, F.insectHead, pack, o) : null;
        if (F.arms.type === 'insect' || F.arms.type === 'mantis') extra.push(...insectArms(L, F.arms, bones, built.bones.length));
        if (F.machinery.type === 'android' && o.body) extra.push(...androidParts(pack, built, L, F.machinery, o.body));
        const nearest = (p, ids) => {
            let best = ids[0], bd = Infinity;
            for (const v of ids) { const d = (L.P[v * 3] - p[0]) ** 2 + (L.P[v * 3 + 1] - p[1]) ** 2 + (L.P[v * 3 + 2] - p[2]) ** 2; if (d < bd) { bd = d; best = v; } }
            return best;
        };
        // Body mods hook: cyber horns, ears and wings (RRCharacterBodyMods) in the shared cyber styles.
        const Mods = root.RRCharacterBodyMods || (typeof require === 'function' ? require('./CharacterBodyMods.js') : null);
        const cyber = t => /^cyber/.test(t) && !!Mods;
        if (cyber(F.horns.type)) extra.push(...Mods.cyberHorns(L, F.horns));
        else if (F.horns.type !== 'none') horns(hard, L, F.horns);
        // An insect head is made first: its antennae rise from its brow.
        if (F.fangs.type !== 'none') fangs(hard, L, F.fangs,pack);
        if (cyber(F.ears.type)) extra.push(...Mods.cyberEars(L, F.ears));
        else if (F.ears.type !== 'none') {
            const roots = animalEars(soft, L, F.ears, coat);
            if (roots.length) fur.push({ roots, anchor: nearest([0, L.crown - 0.01, L.ring(L.brow)?.center[2] || 0], L.headIds) });
        }
        if (F.tail.type !== 'none') {
            const made = tail(soft, hard, pack, L, F.tail, bones, built.bones.length, coat, F.spines) || {};
            if (made.part) extra.push(made.part);
            if (made.parts) extra.push(...made.parts);
            if (made.roots && made.roots.length) fur.push({ roots: made.roots, anchor: nearest(tailBase(pack, L), pack._bodyIds) });
        }
        if (cyber(F.wings.type)) extra.push(...Mods.cyberWings(L, F.wings));
        else if (F.wings.type !== 'none') wings(soft, L, F.wings);
        const featherPart = F.wings.type === 'feathered' ? featheredWing(L, F.wings) : ['fairy', 'insect'].includes(F.wings.type) ? fairyWing(L, F.wings) : null;
        const bill = new Props.Mesh();
        if (F.beak.type !== 'none') beak(bill, L, F.beak);
        if (F.tusks.type !== 'none') tusks(hard, pack, L, F.tusks);
        if (F.spines.type !== 'none') spines(hard, pack, L, F.spines);
        if (F.whiskers.type !== 'none') whiskers(soft, L, F.whiskers);
        const lenses = new Props.Mesh();
        if (F.alienEyes.type !== 'none') alienEyes(lenses, built, pack, F.alienEyes);
        if (F.antennae.type !== 'none') antennae(hard, L, F.antennae, insectBrow);
        const parts = [];
        if (featherPart) parts.push(featherPart);
        parts.push(...extra);
        if (!lenses.empty) parts.push(lenses.part('Alien eyes', { roughness: 0.06, metalness: 0, kind: 'eye', doubleSided: true, envMapIntensity: 0.15, noShade: true }));
        if (!hard.empty) parts.push(hard.part('Horns and claws', { roughness: 0.4, metalness: 0 }));
        if (!insect.empty) parts.push(insect.part('Insect head', { roughness: 0.38, metalness: 0 }));
        // The insect's own chitin (its head, its neck, its second arms) wears the shell picture.
        for (const p of parts) if (/^(Insect head|Secondary arms|Secondary arm joints)$/.test(p.name)) shellSurface(p, 0.05);
        if (insectEyes.eyes) parts.push(insectEyes.eyes);
        if (!insectEyes.empty) parts.push(insectEyes.part('Insect simple eyes', { roughness: 0.12, metalness: 0, kind: 'eye' }));
        // Sat on the face like the skin's own detail: it shades nothing and casts no shadow over the eyes and cheeks.
        if (!bill.empty) parts.push(bill.part('Beak', { roughness: 0.4, metalness: 0, noShade: true, onSkin: true }));
        if (!soft.empty) parts.push(soft.part('Features', { roughness: 0.8, metalness: 0, doubleSided: true }));
        return { parts, bones, features: F, fur, insectCut: insect.insectCut || null };
    }

    const api = { FEATURES, SPECIES, BY_ID, SKIN_TONES, skinTones, HEAD_PRESETS, heads, headPreset, headId, normalizeFeatures, speciesRecipe, build, followMotion, tailShape, compoundEyeTexture, chitinShellTexture, featherTexture, fairyWingTexture, scaleTexture, neckSurface };
    root.RRCharacterSpecies = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
